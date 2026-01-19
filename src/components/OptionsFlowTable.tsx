'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TbStar, TbStarFilled } from 'react-icons/tb';
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
      console.log(`📦 Batch ${batchIndex + 1}/${batches.length} (${Math.round((batchIndex / batches.length) * 100)}%)`);
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
      console.log(`📦 Processing batch ${batchIndex + 1}/${batches.length} (${Math.round((batchIndex / batches.length) * 100)}% complete)`);
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
      console.log(`⚡ Vol/OI batch ${batchIndex + 1}/${batches.length} (${Math.round((batchIndex / batches.length) * 100)}% complete)`);
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
  trade_type: 'SWEEP' | 'BLOCK' | 'MINI' | 'MULTI-LEG';
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
  onDataUpdate?: (data: OptionsFlowData[]) => void;
  selectedTicker: string;
  onTickerChange: (ticker: string) => void;
  streamingStatus?: string;
  streamingProgress?: { current: number, total: number } | null;
  streamError?: string;
  useDropdowns?: boolean;
}

export const OptionsFlowTable: React.FC<OptionsFlowTableProps> = ({
  data,
  summary,
  marketInfo,
  loading = false,
  onRefresh,
  onClearData,
  onDataUpdate,
  selectedTicker,
  onTickerChange,
  streamingStatus,
  streamingProgress,
  streamError,
  useDropdowns = false
}) => {
  const [sortField, setSortField] = useState<keyof OptionsFlowData | 'positioning_grade'>('trade_timestamp');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedOptionTypes, setSelectedOptionTypes] = useState<string[]>(['call', 'put']);
  const [selectedPremiumFilters, setSelectedPremiumFilters] = useState<string[]>(typeof window !== 'undefined' && window.innerWidth < 768 ? ['50000'] : []);
  const [customMinPremium, setCustomMinPremium] = useState<string>('');
  const [customMaxPremium, setCustomMaxPremium] = useState<string>('');
  const [selectedTickerFilters, setSelectedTickerFilters] = useState<string[]>([]);
  const [selectedUniqueFilters, setSelectedUniqueFilters] = useState<string[]>(typeof window !== 'undefined' && window.innerWidth < 768 ? ['OTM'] : []);
  const [expirationStartDate, setExpirationStartDate] = useState<string>('');
  const [expirationEndDate, setExpirationEndDate] = useState<string>('');
  const [blacklistedTickers, setBlacklistedTickers] = useState<string[]>(['', '', '', '', '']);
  const [selectedTickerFilter, setSelectedTickerFilter] = useState<string>('');
  const [inputTicker, setInputTicker] = useState<string>('');
  const [isInputFocused, setIsInputFocused] = useState<boolean>(false);
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState<boolean>(false);
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState<boolean>(false);
  const [savedFlowDates, setSavedFlowDates] = useState<Array<{ date: string; size: number; createdAt: string }>>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [savingFlow, setSavingFlow] = useState<boolean>(false);
  const [loadingFlowDate, setLoadingFlowDate] = useState<string | null>(null);
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
  const [isFlowTrackingOpen, setIsFlowTrackingOpen] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [priceLoadingState, setPriceLoadingState] = useState<Record<string, boolean>>({});
  const [currentOptionPrices, setCurrentOptionPrices] = useState<Record<string, number>>({});
  const [optionPricesFetching, setOptionPricesFetching] = useState<boolean>(false);
  const [tradesWithFillStyles, setTradesWithFillStyles] = useState<OptionsFlowData[]>([]);
  const [stockChartData, setStockChartData] = useState<Record<string, { price: number; timestamp: number }[]>>({});
  const [optionsPremiumData, setOptionsPremiumData] = useState<Record<string, { price: number; timestamp: number }[]>>({});
  const [chartTimeframe, setChartTimeframe] = useState<'1D' | '1W' | '1M'>('1D');
  const [flowChartTimeframes, setFlowChartTimeframes] = useState<Record<string, { stock: '1D' | '1W' | '1M', option: '1D' | '1W' | '1M' }>>({});
  const [isMounted, setIsMounted] = useState(false);

  // State for historical price data and standard deviations
  const [historicalStdDevs, setHistoricalStdDevs] = useState<Map<string, number>>(new Map());
  const [historicalDataLoading, setHistoricalDataLoading] = useState<Set<string>>(new Set());
  const [hoveredGradeIndex, setHoveredGradeIndex] = useState<number | null>(null);
  const [aGradeFilterActive, setAGradeFilterActive] = useState<boolean>(false);

  // Flow Tracking (Watchlist) state - panel always visible
  const [trackedFlows, setTrackedFlows] = useState<OptionsFlowData[]>([]);

  // Flow Tracking filters
  const [flowTrackingFilters, setFlowTrackingFilters] = useState({
    gradeFilter: 'ALL' as 'ALL' | 'A' | 'B' | 'C' | 'D' | 'F',
    showDownSixtyPlus: false,
    showCharts: typeof window !== 'undefined' && window.innerWidth < 768 ? false : true,
    showWeeklies: false
  });

  // Swipe-to-delete state for mobile
  const [swipedFlowId, setSwipedFlowId] = useState<string | null>(null);
  const [touchStart, setTouchStart] = useState<number>(0);
  const [touchCurrent, setTouchCurrent] = useState<number>(0);

  // Ensure component is mounted on client side to avoid hydration issues
  useEffect(() => {
    setIsMounted(true);

    // Load tracked flows from localStorage
    const savedFlows = localStorage.getItem('flowTrackingWatchlist');
    if (savedFlows) {
      try {
        const flows = JSON.parse(savedFlows);
        setTrackedFlows(flows);

        // Fetch stdDev data for all loaded flows
        const uniqueTickers: string[] = [...new Set(flows.map((f: OptionsFlowData) => f.underlying_ticker))] as string[];
        Promise.all(uniqueTickers.map(async (ticker: string) => {
          if (!historicalStdDevs.has(ticker) && !historicalDataLoading.has(ticker)) {
            setHistoricalDataLoading(prev => new Set(prev).add(ticker));
            try {
              const stdDev = await fetchHistoricalStdDev(ticker);
              setHistoricalStdDevs(prev => new Map(prev).set(ticker, stdDev));
              console.log(`✅ Loaded stdDev for ${ticker} from localStorage: ${stdDev}`);
            } catch (error) {
              console.error(`Failed to fetch stdDev for ${ticker}:`, error);
            } finally {
              setHistoricalDataLoading(prev => {
                const newSet = new Set(prev);
                newSet.delete(ticker);
                return newSet;
              });
            }
          }
        }));
      } catch (error) {
        console.error('Error loading tracked flows:', error);
      }
    }
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
    const failed: string[] = [];

    setOptionPricesFetching(true);
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
            } else {
              failed.push(`${trade.underlying_ticker} ${trade.type} $${trade.strike} (zero bid/ask)`);
            }
          } else {
            failed.push(`${trade.underlying_ticker} ${trade.type} $${trade.strike} (no quote data)`);
          }
        } else {
          failed.push(`${trade.underlying_ticker} ${trade.type} $${trade.strike} (HTTP ${response.status})`);
        }
      } catch (error) {
        failed.push(`${trade.underlying_ticker} ${trade.type} $${trade.strike} (${error instanceof Error ? error.message : 'unknown error'})`);
      }

      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    setCurrentOptionPrices(prev => ({ ...prev, ...pricesUpdate }));
    setOptionPricesFetching(false);
    console.log(`✅ Fetched ${Object.keys(pricesUpdate).length}/${trades.length} option prices`);
    if (failed.length > 0) {
      console.warn(`⚠️ Failed to fetch ${failed.length} prices:`, failed);
    }
  };

  // Fetch stock chart data for a single flow with specific timeframe
  const fetchStockChartDataForFlow = async (flowId: string, ticker: string, timeframe: '1D' | '1W' | '1M') => {
    const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
    try {
      let multiplier = 5;
      let timespan = 'minute';
      const now = new Date();
      let from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().split('T')[0];
      let to = now.toISOString().split('T')[0];

      if (timeframe === '1W') {
        multiplier = 1;
        timespan = 'hour';
        from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      } else if (timeframe === '1M') {
        multiplier = 1;
        timespan = 'day';
        from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      }

      const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`;
      const response = await fetch(url);

      if (response.ok) {
        const data = await response.json();
        if (data.results && data.results.length > 0) {
          const chartData = data.results.map((bar: any) => ({
            price: bar.c,
            timestamp: bar.t
          }));
          setStockChartData(prev => ({ ...prev, [flowId]: chartData }));
        }
      }
    } catch (error) {
      console.error(`Failed to fetch chart data for ${ticker}:`, error);
    }
  };

  // Fetch options premium data for a single flow with specific timeframe
  const fetchOptionPremiumDataForFlow = async (flowId: string, trade: OptionsFlowData, timeframe: '1D' | '1W' | '1M') => {
    const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
    try {
      const expiry = trade.expiry.replace(/-/g, '').slice(2);
      const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0');
      const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P';
      const optionTicker = `O:${trade.underlying_ticker}${expiry}${optionType}${strikeFormatted}`;

      let multiplier = 5;
      let timespan = 'minute';
      const now = new Date();
      let from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().split('T')[0];
      let to = now.toISOString().split('T')[0];

      if (timeframe === '1W') {
        multiplier = 30;
        timespan = 'minute';
        from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      } else if (timeframe === '1M') {
        multiplier = 1;
        timespan = 'hour';
        from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      }

      const url = `https://api.polygon.io/v2/aggs/ticker/${optionTicker}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`;
      const response = await fetch(url);

      if (response.ok) {
        const data = await response.json();
        if (data.results && data.results.length > 0) {
          const premiumData = data.results.map((bar: any) => ({
            price: bar.c,
            timestamp: bar.t
          }));
          setOptionsPremiumData(prev => ({ ...prev, [flowId]: premiumData }));
        }
      }
    } catch (error) {
      console.error(`Failed to fetch premium data for ${trade.underlying_ticker}:`, error);
    }
  };

  // Fetch stock chart data for mini charts
  const fetchStockChartData = async (tickers: string[]) => {
    const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
    const chartData: Record<string, { price: number; timestamp: number }[]> = {};

    console.log(`📈 Fetching stock chart data for ${tickers.length} tickers...`);

    for (const ticker of tickers) {
      try {
        let multiplier = 5;
        let timespan = 'minute';
        const now = new Date();
        let from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().split('T')[0]; // Today at midnight
        let to = now.toISOString().split('T')[0]; // Today

        if (chartTimeframe === '1W') {
          multiplier = 1;
          timespan = 'hour';
          from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 7 days ago
        } else if (chartTimeframe === '1M') {
          multiplier = 1;
          timespan = 'day';
          from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 30 days ago
        }

        const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`;
        const response = await fetch(url);

        if (response.ok) {
          const data = await response.json();
          if (data.results && data.results.length > 0) {
            chartData[ticker] = data.results.map((bar: any) => ({
              price: bar.c,
              timestamp: bar.t
            }));
          }
        }

        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Failed to fetch chart data for ${ticker}:`, error);
      }
    }

    setStockChartData(prev => ({ ...prev, ...chartData }));
    console.log(`✅ Fetched chart data for ${Object.keys(chartData).length} tickers`);
  };

  // Fetch options premium data for mini charts
  const fetchOptionsPremiumData = async (trades: OptionsFlowData[]) => {
    const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
    const premiumData: Record<string, { price: number; timestamp: number }[]> = {};

    console.log(`📊 Fetching options premium data for ${trades.length} options...`);

    for (const trade of trades) {
      try {
        const expiry = trade.expiry.replace(/-/g, '').slice(2);
        const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0');
        const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P';
        const optionTicker = `O:${trade.underlying_ticker}${expiry}${optionType}${strikeFormatted}`;

        let multiplier = 5;
        let timespan = 'minute';
        const now = new Date();
        let from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().split('T')[0]; // Today at midnight
        let to = now.toISOString().split('T')[0]; // Today

        if (chartTimeframe === '1W') {
          multiplier = 30;
          timespan = 'minute';
          from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 7 days ago
        } else if (chartTimeframe === '1M') {
          multiplier = 1;
          timespan = 'hour';
          from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 30 days ago
        }

        const url = `https://api.polygon.io/v2/aggs/ticker/${optionTicker}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`;
        const response = await fetch(url);

        if (response.ok) {
          const data = await response.json();
          if (data.results && data.results.length > 0) {
            premiumData[optionTicker] = data.results.map((bar: any) => ({
              price: bar.c,
              timestamp: bar.t
            }));
          }
        }

        await new Promise(resolve => setTimeout(resolve, 120));
      } catch (error) {
        console.error(`Failed to fetch premium data for ${trade.underlying_ticker}:`, error);
      }
    }

    setOptionsPremiumData(prev => ({ ...prev, ...premiumData }));
    console.log(`✅ Fetched premium data for ${Object.keys(premiumData).length} options`);
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
          const dailyReturn = ((closes[i] - closes[i - 1]) / closes[i - 1]) * 100;
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
    if (!currentPrice || currentPrice <= 0) {
      // Return early with a neutral grade if price is unavailable
      console.warn(`⚠️ Missing price for ${trade.underlying_ticker} ${trade.type} $${trade.strike}`);
      return {
        grade: 'N/A',
        score: confidenceScore,
        color: '#9ca3af',
        breakdown: `Score: ${confidenceScore}/100\nExpiration: ${scores.expiration}/25\nContract P&L: 0/25\nCombo Trade: 0/10\nPrice Action: 0/25\nStock Reaction: 0/15`,
        scores
      };
    }

    const percentChange = ((currentPrice - entryPrice) / entryPrice) * 100;

    if (percentChange <= -40) scores.contractPrice = 25;
    else if (percentChange <= -20) scores.contractPrice = 20;
    else if (percentChange >= -10 && percentChange <= 10) scores.contractPrice = 15;
    else if (percentChange >= 20) scores.contractPrice = 5;
    else scores.contractPrice = 10;

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

    if (!currentStockPrice || !entryStockPrice) {
      throw new Error(`Missing price action data for ${trade.underlying_ticker}`);
    }

    const hoursElapsed = (currentTime.getTime() - tradeTime.getTime()) / (1000 * 60 * 60);
    const tradingDaysElapsed = Math.floor(hoursElapsed / 6.5); // 6.5-hour trading day

    // Calculate current stock move in percentage
    const stockPercentChange = ((currentStockPrice - entryStockPrice) / entryStockPrice) * 100;
    const absMove = Math.abs(stockPercentChange);

    // Check if stock is within 1 standard deviation
    if (!stdDev) {
      throw new Error(`Missing standard deviation data for ${trade.underlying_ticker}`);
    }

    const withinStdDev = absMove <= stdDev;

    // Award points based on how many days stock stayed within std dev
    if (withinStdDev && tradingDaysElapsed >= 3) scores.priceAction = 25;
    else if (withinStdDev && tradingDaysElapsed >= 2) scores.priceAction = 20;
    else if (withinStdDev && tradingDaysElapsed >= 1) scores.priceAction = 15;
    else scores.priceAction = 10;

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

    // 2. Check premium ($85k - $690k)
    if (trade.total_premium < 85000 || trade.total_premium > 690000) {
      return false;
    }

    // 3. Check contracts (350 minimum, no max)
    if (trade.trade_size < 350) {
      return false;
    }

    // 4. Check OTM status
    if (!trade.moneyness || trade.moneyness !== 'OTM') {
      return false;
    }

    return true;
  };

  // Flow Tracking (Watchlist) Functions
  const generateFlowId = (trade: OptionsFlowData): string => {
    return `${trade.underlying_ticker}-${trade.strike}-${trade.expiry}-${trade.type}-${trade.trade_timestamp}-${trade.trade_size}`;
  };

  const isInFlowTracking = (trade: OptionsFlowData): boolean => {
    const flowId = generateFlowId(trade);
    return trackedFlows.some(t => generateFlowId(t) === flowId);
  };

  const addToFlowTracking = async (trade: OptionsFlowData) => {
    // Store original data with timestamp - only current price and grade will update
    const flowToTrack = {
      ...trade,
      addedAt: new Date().toISOString(),
      originalPrice: trade.premium_per_contract,
      originalStockPrice: trade.spot_price
    };
    const newTrackedFlows = [...trackedFlows, flowToTrack];
    setTrackedFlows(newTrackedFlows);
    localStorage.setItem('flowTrackingWatchlist', JSON.stringify(newTrackedFlows));

    // Generate flow ID for chart data
    const flowId = generateFlowId(trade);

    // Fetch chart data for this flow with default 1D timeframe
    fetchStockChartDataForFlow(flowId, trade.underlying_ticker, '1D');
    fetchOptionPremiumDataForFlow(flowId, trade, '1D');

    // Fetch historical standard deviation data for grading
    if (!historicalStdDevs.has(trade.underlying_ticker) && !historicalDataLoading.has(trade.underlying_ticker)) {
      setHistoricalDataLoading(prev => new Set(prev).add(trade.underlying_ticker));
      try {
        const stdDev = await fetchHistoricalStdDev(trade.underlying_ticker);
        setHistoricalStdDevs(prev => new Map(prev).set(trade.underlying_ticker, stdDev));
        console.log(`✅ Loaded stdDev for ${trade.underlying_ticker}: ${stdDev}`);
      } catch (error) {
        console.error(`Failed to fetch stdDev for ${trade.underlying_ticker}:`, error);
      } finally {
        setHistoricalDataLoading(prev => {
          const newSet = new Set(prev);
          newSet.delete(trade.underlying_ticker);
          return newSet;
        });
      }
    }
  };

  const removeFromFlowTracking = (trade: OptionsFlowData) => {
    const flowId = generateFlowId(trade);
    const newTrackedFlows = trackedFlows.filter(t => generateFlowId(t) !== flowId);
    setTrackedFlows(newTrackedFlows);
    localStorage.setItem('flowTrackingWatchlist', JSON.stringify(newTrackedFlows));
  };

  // Save current flow data to database
  const handleSaveFlow = async () => {
    try {
      setSavingFlow(true);
      const today = new Date().toISOString().split('T')[0];

      const response = await fetch('/api/flows/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: today, data }),
      });

      if (!response.ok) {
        throw new Error('Failed to save flow');
      }

      console.log(`✅ Flow saved successfully for ${today}`);
    } catch (error) {
      console.error('Error saving flow:', error);
    } finally {
      setSavingFlow(false);
    }
  };

  // Load saved flow dates
  const loadFlowHistory = async () => {
    try {
      setLoadingHistory(true);
      const response = await fetch('/api/flows/dates');

      if (!response.ok) {
        throw new Error('Failed to load history');
      }

      const dates = await response.json();
      setSavedFlowDates(dates);
      setIsHistoryDialogOpen(true);
    } catch (error) {
      console.error('Error loading history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Load specific flow by date
  const handleLoadFlow = async (date: string) => {
    try {
      setLoadingFlowDate(date);
      const response = await fetch(`/api/flows/${date}`);

      if (!response.ok) {
        throw new Error('Failed to load flow');
      }

      const flowData = await response.json();
      onDataUpdate && onDataUpdate(flowData.data);
      setIsHistoryDialogOpen(false);
      console.log(`✅ Loaded flow from ${date}`);
    } catch (error) {
      console.error('Error loading flow:', error);
    } finally {
      setLoadingFlowDate(null);
    }
  };

  // Delete flow by date
  const handleDeleteFlow = async (date: string) => {
    if (!confirm(`Delete flow from ${date}?`)) return;

    try {
      const response = await fetch(`/api/flows/${date}`, { method: 'DELETE' });

      if (!response.ok) {
        throw new Error('Failed to delete flow');
      }

      // Reload history
      setSavedFlowDates(prev => prev.filter(f => f.date !== date));
      console.log(`✅ Deleted flow from ${date}`);
    } catch (error) {
      console.error('Error deleting flow:', error);
    }
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
              case '1000000':
                return trade.total_premium >= 1000000;
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
            case 'MULTI_LEG_ONLY':
              return trade.trade_type === 'MULTI-LEG';
            case 'WEEKLY_ONLY':
              // Check if expiration is within 7 days
              const expiryDate = new Date(trade.expiry);
              const today = new Date();
              const daysToExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              return daysToExpiry <= 7;
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

    // A+ grade filter (only active when EFI Highlights is on AND prices are loaded)
    if (efiHighlightsActive && aGradeFilterActive && !optionPricesFetching) {
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
  }, [efiHighlightsActive, filteredAndSortedData.length, chartTimeframe]);

  // Fetch chart data for tracked flows when EFI is active or flows are added
  // Use useRef to track previous flows length to avoid unnecessary re-renders
  const prevTrackedFlowsLength = React.useRef(trackedFlows.length);

  useEffect(() => {
    // Only fetch if flows were added (length increased) or EFI is active
    if (trackedFlows.length > 0 && (efiHighlightsActive || trackedFlows.length > prevTrackedFlowsLength.current)) {
      // Fetch option prices for grading
      fetchCurrentOptionPrices(trackedFlows);

      // Fetch current stock prices for grading
      const uniqueTickers = [...new Set(trackedFlows.map(t => t.underlying_ticker))];
      fetchCurrentPrices(uniqueTickers);

      // Fetch chart data for each flow with their individual timeframes
      trackedFlows.forEach(flow => {
        const flowId = generateFlowId(flow);
        const stockTimeframe = flowChartTimeframes[flowId]?.stock || '1D';
        const optionTimeframe = flowChartTimeframes[flowId]?.option || '1D';

        // Fetch stock chart data for this flow
        fetchStockChartDataForFlow(flowId, flow.underlying_ticker, stockTimeframe);

        // Fetch options premium data for this flow
        fetchOptionPremiumDataForFlow(flowId, flow, optionTimeframe);
      });

      // Update ref
      prevTrackedFlowsLength.current = trackedFlows.length;
    }
  }, [trackedFlows.length, efiHighlightsActive]);

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

  const formatTimeWithSeconds = (timestamp: string) => {
    // Show execution time with seconds for desktop view
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: true,
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'America/New_York'
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
            className="fixed top-16 md:inset-0 bottom-0 left-0 right-0 z-[9998]"
            onClick={() => {
              console.log('Dialog backdrop clicked - closing dialog');
              setIsFilterDialogOpen(false);
            }}
          />
          {/* Modal Content */}
          <div className="filter-dialog fixed left-0 md:left-1/2 transform md:-translate-x-1/2 bg-black border border-gray-600 rounded-lg md:rounded-lg p-4 w-full md:w-auto md:max-w-4xl max-h-[85vh] md:h-auto md:max-h-[55vh] overflow-y-auto z-[9999]" style={{ top: typeof window !== 'undefined' && window.innerWidth < 768 ? '180px' : '224px', boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)' }}>
            <div className="filter-dialog-content">
              <div className="flex justify-center items-center mb-6 relative">
                <h2 className="text-2xl md:text-2xl font-bold italic text-orange-400 md:text-orange-400">
                  <span className="hidden md:inline" style={{ fontFamily: 'Georgia, serif', textShadow: '0 0 8px rgba(255, 165, 0, 0.3)', letterSpacing: '0.5px' }}>Options Flow Filters</span>
                  <span
                    className="inline md:hidden text-3xl"
                    style={{
                      fontFamily: 'Georgia, serif',
                      background: 'linear-gradient(145deg, #ff8c00 0%, #ffd700 50%, #ff8c00 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                      filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.9)) drop-shadow(0 0 10px rgba(255, 140, 0, 0.4))',
                      fontWeight: '900',
                      letterSpacing: '0.05em'
                    }}
                  >
                    Flow Filters
                  </span>
                </h2>
                <button
                  onClick={() => setIsFilterDialogOpen(false)}
                  className="absolute right-0 text-gray-400 hover:text-white text-2xl font-bold"
                >
                  ×
                </button>
              </div>

              {/* Mobile: Compact Single Panel Layout */}
              <div className="md:hidden space-y-4">
                {/* Options & Trade Type Row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg p-3 border border-orange-500/30 relative overflow-hidden" style={{ background: 'linear-gradient(145deg, #0a0a0a 0%, #000000 100%)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.1), 0 4px 8px rgba(0,0,0,0.8)' }}>
                    <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none"></div>
                    <h3 className="text-2xl font-bold text-orange-400 mb-2 text-center relative z-10">Options</h3>
                    <div className="space-y-2 relative z-10">
                      <label className="flex items-center">
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
                          className="w-4 h-4 text-green-600 bg-black border-orange-500 rounded"
                        />
                        <span className="ml-2 text-lg text-green-400 font-semibold">Calls</span>
                      </label>
                      <label className="flex items-center">
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
                          className="w-4 h-4 text-red-600 bg-black border-orange-500 rounded"
                        />
                        <span className="ml-2 text-lg text-red-400 font-semibold">Puts</span>
                      </label>
                    </div>
                  </div>
                  <div className="rounded-lg p-3 border border-orange-500/30 relative overflow-hidden" style={{ background: 'linear-gradient(145deg, #0a0a0a 0%, #000000 100%)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.1), 0 4px 8px rgba(0,0,0,0.8)' }}>
                    <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none"></div>
                    <h3 className="text-2xl font-bold text-yellow-400 mb-2 text-center relative z-10">Type</h3>
                    <div className="space-y-2 relative z-10">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={selectedUniqueFilters.includes('block')}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedUniqueFilters(prev => [...prev, 'block']);
                            } else {
                              setSelectedUniqueFilters(prev => prev.filter(filter => filter !== 'block'));
                            }
                          }}
                          className="w-4 h-4 text-blue-500 bg-black border-orange-500 rounded"
                        />
                        <span className="ml-2 text-lg text-blue-400 font-semibold">Block</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={selectedUniqueFilters.includes('sweep')}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedUniqueFilters(prev => [...prev, 'sweep']);
                            } else {
                              setSelectedUniqueFilters(prev => prev.filter(filter => filter !== 'sweep'));
                            }
                          }}
                          className="w-4 h-4 text-yellow-500 bg-black border-orange-500 rounded"
                        />
                        <span className="ml-2 text-lg text-yellow-400 font-semibold">Sweep</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Premium Filters */}
                <div className="rounded-lg p-3 border border-orange-500/30 relative overflow-hidden" style={{ background: 'linear-gradient(145deg, #0a0a0a 0%, #000000 100%)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.1), 0 4px 8px rgba(0,0,0,0.8)' }}>
                  <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none"></div>
                  <h3 className="text-2xl font-bold text-green-400 mb-2 text-center relative z-10">Premium</h3>
                  <div className="grid grid-cols-2 gap-2 relative z-10">
                    <label className="flex items-center">
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
                        className="w-4 h-4 text-green-600 bg-black border-orange-500 rounded"
                      />
                      <span className="ml-2 text-lg text-white font-semibold">≥ $50K</span>
                    </label>
                    <label className="flex items-center">
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
                        className="w-4 h-4 text-green-600 bg-black border-orange-500 rounded"
                      />
                      <span className="ml-2 text-lg text-white font-semibold">≥ $99K</span>
                    </label>
                    <label className="flex items-center">
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
                        className="w-4 h-4 text-green-600 bg-black border-orange-500 rounded"
                      />
                      <span className="ml-2 text-lg text-white font-semibold">≥ $200K</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedPremiumFilters.includes('1000000')}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedPremiumFilters(prev => [...prev, '1000000']);
                          } else {
                            setSelectedPremiumFilters(prev => prev.filter(filter => filter !== '1000000'));
                          }
                        }}
                        className="w-4 h-4 text-green-600 bg-black border-orange-500 rounded"
                      />
                      <span className="ml-2 text-lg text-white font-semibold">≥ $1M</span>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-gray-700">
                    <div>
                      <input
                        type="number"
                        value={customMinPremium}
                        onChange={(e) => setCustomMinPremium(e.target.value)}
                        placeholder="Min $"
                        className="w-full px-2 py-1 text-lg bg-black text-white border border-orange-500/50 rounded"
                      />
                    </div>
                    <div>
                      <input
                        type="number"
                        value={customMaxPremium}
                        onChange={(e) => setCustomMaxPremium(e.target.value)}
                        placeholder="Max $"
                        className="w-full px-2 py-1 text-lg bg-black text-white border border-orange-500/50 rounded"
                      />
                    </div>
                  </div>
                </div>

                {/* Ticker & Special Filters */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg p-3 border border-orange-500/30 relative overflow-hidden" style={{ background: 'linear-gradient(145deg, #0a0a0a 0%, #000000 100%)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.1), 0 4px 8px rgba(0,0,0,0.8)' }}>
                    <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none"></div>
                    <h3 className="text-2xl font-bold text-blue-400 mb-2 text-center relative z-10">Ticker</h3>
                    <div className="space-y-2 relative z-10">
                      <label className="flex items-center">
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
                          className="w-4 h-4 text-blue-600 bg-black border-orange-500 rounded"
                        />
                        <span className="ml-2 text-lg text-white font-semibold">ETF</span>
                      </label>
                      <label className="flex items-center">
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
                          className="w-4 h-4 text-blue-600 bg-black border-orange-500 rounded"
                        />
                        <span className="ml-2 text-lg text-white font-semibold">Stock</span>
                      </label>
                      <label className="flex items-center">
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
                          className="w-4 h-4 text-blue-600 bg-black border-orange-500 rounded"
                        />
                        <span className="ml-2 text-lg text-white font-semibold">Mag 7</span>
                      </label>
                      <label className="flex items-center">
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
                          className="w-4 h-4 text-blue-600 bg-black border-orange-500 rounded"
                        />
                        <span className="ml-2 text-lg text-white font-semibold">No Mag 7</span>
                      </label>
                    </div>
                  </div>
                  <div className="rounded-lg p-3 border border-orange-500/30 relative overflow-hidden" style={{ background: 'linear-gradient(145deg, #0a0a0a 0%, #000000 100%)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.1), 0 4px 8px rgba(0,0,0,0.8)' }}>
                    <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none"></div>
                    <h3 className="text-2xl font-bold text-cyan-400 mb-2 text-center relative z-10">Special</h3>
                    <div className="space-y-2">
                      <label className="flex items-center">
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
                          className="w-4 h-4 text-cyan-600 bg-black border-orange-500 rounded"
                        />
                        <span className="ml-2 text-lg text-white font-semibold">ITM</span>
                      </label>
                      <label className="flex items-center">
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
                          className="w-4 h-4 text-cyan-600 bg-black border-orange-500 rounded"
                        />
                        <span className="ml-2 text-lg text-white font-semibold">OTM</span>
                      </label>
                      <label className="flex items-center">
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
                          className="w-4 h-4 text-cyan-600 bg-black border-orange-500 rounded"
                        />
                        <span className="ml-2 text-lg text-white font-semibold">Weekly</span>
                      </label>
                      <label className="flex items-center">
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
                          className="w-4 h-4 text-cyan-600 bg-black border-orange-500 rounded"
                        />
                        <span className="ml-2 text-lg text-white font-semibold">Mini</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Blacklist */}
                <div className="rounded-lg p-3 border border-orange-500/30 relative overflow-hidden" style={{ background: 'linear-gradient(145deg, #0a0a0a 0%, #000000 100%)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.1), 0 4px 8px rgba(0,0,0,0.8)' }}>
                  <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none"></div>
                  <h3 className="text-2xl font-bold text-red-400 mb-2 text-center relative z-10">Blacklist</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {blacklistedTickers.slice(0, 3).map((ticker, index) => (
                      <input
                        key={index}
                        type="text"
                        value={ticker}
                        onChange={(e) => {
                          const newTickers = [...blacklistedTickers];
                          newTickers[index] = e.target.value.toUpperCase();
                          setBlacklistedTickers(newTickers);
                        }}
                        placeholder={`Ticker ${index + 1}`}
                        className="px-2 py-1 text-lg bg-gray-800 text-white border border-gray-600 rounded"
                        maxLength={6}
                      />
                    ))}
                  </div>
                </div>

                {/* Expiration Dates */}
                <div className="rounded-lg p-3 border border-orange-500/30 relative overflow-hidden" style={{ background: 'linear-gradient(145deg, #0a0a0a 0%, #000000 100%)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.1), 0 4px 8px rgba(0,0,0,0.8)' }}>
                  <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none"></div>
                  <h3 className="text-2xl font-bold text-purple-400 mb-2 text-center relative z-10">Expiration</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-base text-white mb-1 block font-semibold">Start</label>
                      <input
                        type="date"
                        value={expirationStartDate}
                        onChange={(e) => setExpirationStartDate(e.target.value)}
                        className="w-full px-2 py-1 text-lg bg-gray-800 text-white border border-gray-600 rounded"
                      />
                    </div>
                    <div>
                      <label className="text-base text-white mb-1 block font-semibold">End</label>
                      <input
                        type="date"
                        value={expirationEndDate}
                        onChange={(e) => setExpirationEndDate(e.target.value)}
                        className="w-full px-2 py-1 text-lg bg-gray-800 text-white border border-gray-600 rounded"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Desktop: Original Complex Layout */}
              <div className="hidden md:block -space-y-2 px-8">
                {/* Top Row - Option Type, Value Premium, Ticker Filter */}
                <div className="flex flex-wrap justify-start items-start gap-3 mx-2">
                  {/* Option Type */}
                  <div className="relative bg-black rounded-lg p-4 border border-orange-500/40 transition-all duration-300 m-2" style={{ background: '#000000', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.8)' }}>
                    <div className="absolute inset-0 bg-gradient-to-br from-gray-400/3 to-transparent rounded-lg animate-pulse"></div>
                    <label className="text-2xl md:text-xl font-bold mb-3 block text-center relative z-10 italic" style={{ fontFamily: 'Georgia, serif', letterSpacing: '0.3px' }}>
                      <span style={{ color: '#10b981', textShadow: '0 0 6px rgba(16, 185, 129, 0.4)' }}>Options</span>
                      <span style={{ color: '#ef4444', textShadow: '0 0 6px rgba(239, 68, 68, 0.4)' }}> Type</span>
                    </label>
                    <div className="space-y-3 md:space-y-3 relative z-10">
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
                        <span className={`ml-3 text-2xl md:text-lg font-medium transition-all duration-200 ${selectedOptionTypes.includes('put')
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
                        <span className={`ml-3 text-2xl md:text-lg font-medium transition-all duration-200 ${selectedOptionTypes.includes('call')
                          ? 'text-green-400 font-bold drop-shadow-lg'
                          : 'text-gray-300'
                          }`}>Calls</span>
                      </label>
                      <label className="flex md:hidden items-center cursor-pointer hover:bg-gray-800 p-2 rounded transition-all">
                        <input
                          type="checkbox"
                          checked={selectedUniqueFilters.includes('block')}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedUniqueFilters(prev => [...prev, 'block']);
                            } else {
                              setSelectedUniqueFilters(prev => prev.filter(filter => filter !== 'block'));
                            }
                          }}
                          className="w-5 h-5 text-blue-500 bg-black border-orange-500 rounded focus:ring-blue-500"
                        />
                        <span className={`ml-3 text-2xl font-medium transition-all duration-200 ${selectedUniqueFilters.includes('block')
                          ? 'text-blue-500 font-bold drop-shadow-lg'
                          : 'text-gray-300'
                          }`}>Block</span>
                      </label>
                      <label className="flex md:hidden items-center cursor-pointer hover:bg-gray-800 p-2 rounded transition-all">
                        <input
                          type="checkbox"
                          checked={selectedUniqueFilters.includes('sweep')}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedUniqueFilters(prev => [...prev, 'sweep']);
                            } else {
                              setSelectedUniqueFilters(prev => prev.filter(filter => filter !== 'sweep'));
                            }
                          }}
                          className="w-5 h-5 text-yellow-500 bg-black border-orange-500 rounded focus:ring-yellow-500"
                        />
                        <span className={`ml-3 text-2xl font-medium transition-all duration-200 ${selectedUniqueFilters.includes('sweep')
                          ? 'text-yellow-500 font-bold drop-shadow-lg'
                          : 'text-gray-300'
                          }`}>Sweep</span>
                      </label>
                    </div>
                  </div>

                  {/* Value (Premium) */}
                  <div className="relative bg-black rounded-lg p-4 border border-orange-500/40 transition-all duration-300 m-2" style={{ background: '#000000', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.8)' }}>
                    <div className="absolute inset-0 bg-gradient-to-br from-green-400/3 to-transparent rounded-lg animate-pulse"></div>
                    <label className="text-2xl md:text-xl font-bold mb-3 block text-center relative z-10 italic" style={{ fontFamily: 'Georgia, serif', letterSpacing: '0.3px', color: '#10b981', textShadow: '0 0 6px rgba(16, 185, 129, 0.4)' }}>Premium</label>
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
                        <span className={`ml-3 text-2xl md:text-lg font-medium transition-all duration-200 ${selectedPremiumFilters.includes('50000')
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
                        <span className={`ml-3 text-2xl md:text-lg font-medium transition-all duration-200 ${selectedPremiumFilters.includes('99000')
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
                        <span className={`ml-3 text-2xl md:text-lg font-medium transition-all duration-200 ${selectedPremiumFilters.includes('200000')
                          ? 'text-green-400 font-bold drop-shadow-lg'
                          : 'text-gray-300'
                          }`}>≥ $200,000</span>
                      </label>
                      <label className="flex items-center cursor-pointer hover:bg-gray-800 p-2 rounded transition-all">
                        <input
                          type="checkbox"
                          checked={selectedPremiumFilters.includes('1000000')}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedPremiumFilters(prev => [...prev, '1000000']);
                            } else {
                              setSelectedPremiumFilters(prev => prev.filter(filter => filter !== '1000000'));
                            }
                          }}
                          className="w-5 h-5 text-green-600 bg-black border-orange-500 rounded focus:ring-green-500"
                        />
                        <span className={`ml-3 text-2xl md:text-lg font-medium transition-all duration-200 ${selectedPremiumFilters.includes('1000000')
                          ? 'text-green-400 font-bold drop-shadow-lg'
                          : 'text-gray-300'
                          }`}>≥ $1M</span>
                      </label>

                      {/* Custom Range Inputs */}
                      <div className="border-t border-orange-500 pt-3 mt-3">
                        <div className="space-y-2">
                          <div>
                            <label className="text-2xl md:text-sm text-orange-300 mb-1 block font-medium">Min ($)</label>
                            <input
                              type="number"
                              value={customMinPremium}
                              onChange={(e) => setCustomMinPremium(e.target.value)}
                              placeholder="0"
                              className="border border-orange-500 rounded px-3 py-2 text-2xl md:text-base bg-black text-green-400 placeholder-gray-500 focus:border-orange-400 focus:ring-1 focus:ring-orange-400 focus:outline-none w-full transition-all"
                            />
                          </div>
                          <div>
                            <label className="text-2xl md:text-sm text-orange-300 mb-1 block font-medium">Max ($)</label>
                            <input
                              type="number"
                              value={customMaxPremium}
                              onChange={(e) => setCustomMaxPremium(e.target.value)}
                              placeholder="∞"
                              className="border border-orange-500 rounded px-3 py-2 text-2xl md:text-base bg-black text-green-400 placeholder-gray-500 focus:border-orange-400 focus:ring-1 focus:ring-orange-400 focus:outline-none w-full transition-all"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Ticker Filter */}
                  <div className="relative bg-black rounded-lg p-4 border border-orange-500/40 transition-all duration-300 m-2" style={{ background: '#000000', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.8)' }}>
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-400/3 to-transparent rounded-lg animate-pulse"></div>
                    <label className="text-2xl md:text-xl font-bold mb-3 block text-center relative z-10 italic" style={{ fontFamily: 'Georgia, serif', letterSpacing: '0.3px', color: '#3b82f6', textShadow: '0 0 6px rgba(59, 130, 246, 0.4)' }}>Ticker Filter</label>
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
                        <span className={`ml-3 text-2xl md:text-lg font-medium transition-all duration-200 ${selectedTickerFilters.includes('ETF_ONLY')
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
                        <span className={`ml-3 text-2xl md:text-lg font-medium transition-all duration-200 ${selectedTickerFilters.includes('STOCK_ONLY')
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
                        <span className={`ml-3 text-2xl md:text-lg font-medium transition-all duration-200 ${selectedTickerFilters.includes('MAG7_ONLY')
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
                        <span className={`ml-3 text-lg font-medium transition-all duration-200 ${selectedTickerFilters.includes('EXCLUDE_MAG7')
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
                    <label className="text-2xl md:text-xl font-bold mb-3 block text-center relative z-10 italic" style={{ fontFamily: 'Georgia, serif', letterSpacing: '0.3px', color: '#fbbf24', textShadow: '0 0 6px rgba(251, 191, 36, 0.4)' }}>Unique</label>
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
                        <span className={`ml-3 text-2xl md:text-lg font-medium transition-all duration-200 ${selectedUniqueFilters.includes('ITM')
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
                        <span className={`ml-3 text-2xl md:text-lg font-medium transition-all duration-200 ${selectedUniqueFilters.includes('OTM')
                          ? 'text-yellow-400 font-bold drop-shadow-lg'
                          : 'text-gray-300'
                          }`}>Out The Money</span>
                      </label>
                      <label className="hidden md:flex items-center cursor-pointer hover:bg-gray-800 p-2 rounded transition-all">
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
                        <span className={`ml-3 text-lg font-medium transition-all duration-200 ${selectedUniqueFilters.includes('SWEEP_ONLY')
                          ? 'text-yellow-400 font-bold drop-shadow-lg'
                          : 'text-gray-300'
                          }`}>Sweep Only</span>
                      </label>
                      <label className="hidden md:flex items-center cursor-pointer hover:bg-gray-800 p-2 rounded transition-all">
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
                        <span className={`ml-3 text-lg font-medium transition-all duration-200 ${selectedUniqueFilters.includes('BLOCK_ONLY')
                          ? 'text-yellow-400 font-bold drop-shadow-lg'
                          : 'text-gray-300'
                          }`}>Block Only</span>
                      </label>
                      <label className="hidden md:flex items-center cursor-pointer hover:bg-gray-800 p-2 rounded transition-all">
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
                          className="w-5 h-5 text-purple-600 bg-black border-purple-500 rounded focus:ring-purple-500"
                        />
                        <span className={`ml-3 text-lg font-medium transition-all duration-200 ${selectedUniqueFilters.includes('MULTI_LEG_ONLY')
                          ? 'text-purple-400 font-bold drop-shadow-lg'
                          : 'text-gray-300'
                          }`}>Multi-Leg Only</span>
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
                        <span className={`ml-3 text-2xl md:text-lg font-medium transition-all duration-200 ${selectedUniqueFilters.includes('WEEKLY_ONLY')
                          ? 'text-yellow-400 font-bold drop-shadow-lg'
                          : 'text-gray-300'
                          }`}>Weekly Only</span>
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
                        <span className={`ml-3 text-2xl md:text-lg font-medium transition-all duration-200 ${selectedUniqueFilters.includes('MINI_ONLY')
                          ? 'text-green-400 font-bold drop-shadow-lg'
                          : 'text-gray-300'
                          }`}>Mini Only</span>
                      </label>
                    </div>
                  </div>

                  {/* Black List */}
                  <div className="relative bg-black rounded-lg p-4 border border-orange-500/40 transition-all duration-300 m-2" style={{ background: '#000000', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.8)' }}>
                    <div className="absolute inset-0 bg-gradient-to-br from-orange-400/3 to-transparent rounded-lg animate-pulse"></div>
                    <label className="text-2xl md:text-xl font-bold mb-3 block text-center relative z-10 italic" style={{ fontFamily: 'Georgia, serif', letterSpacing: '0.3px', color: '#f97316', textShadow: '0 0 6px rgba(249, 115, 22, 0.4)' }}>Black List</label>
                    <div className="space-y-2 relative z-10">
                      {blacklistedTickers.map((ticker, index) => (
                        <div key={index} className={index === 4 ? 'hidden md:block' : ''}>
                          <input
                            type="text"
                            value={ticker}
                            onChange={(e) => {
                              const newTickers = [...blacklistedTickers];
                              newTickers[index] = e.target.value.toUpperCase();
                              setBlacklistedTickers(newTickers);
                            }}
                            placeholder={`Ticker ${index + 1}`}
                            className="border border-gray-600 rounded px-2 py-1 text-2xl md:text-sm bg-gray-800 text-white placeholder-gray-400 focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none w-20 transition-all"
                            maxLength={6}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Options Expiration */}
                  <div className="relative bg-black rounded-lg p-4 border border-orange-500/40 transition-all duration-300 m-2" style={{ background: '#000000', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.8)' }}>
                    <div className="absolute inset-0 bg-gradient-to-br from-red-400/3 to-transparent rounded-lg animate-pulse"></div>
                    <label className="text-2xl md:text-xl font-bold mb-3 block text-center relative z-10 italic" style={{ fontFamily: 'Georgia, serif', letterSpacing: '0.3px', color: '#ffffff', textShadow: '0 0 6px rgba(255, 255, 255, 0.3)' }}>Options Expiration</label>
                    <div className="space-y-3 relative z-10">
                      <div>
                        <label className="text-xl md:text-sm text-gray-300 mb-2 block">Start Date</label>
                        <input
                          type="date"
                          value={expirationStartDate}
                          onChange={(e) => setExpirationStartDate(e.target.value)}
                          className="border-2 border-gray-600 rounded-lg px-2 py-2 text-2xl md:text-base bg-gray-800 text-white focus:border-gray-500 focus:outline-none shadow-lg w-auto transition-all"
                        />
                      </div>
                      <div>
                        <label className="text-xl md:text-sm text-gray-300 mb-2 block">End Date</label>
                        <input
                          type="date"
                          value={expirationEndDate}
                          onChange={(e) => setExpirationEndDate(e.target.value)}
                          className="border-2 border-gray-600 rounded-lg px-2 py-2 text-2xl md:text-base bg-gray-800 text-white focus:border-gray-500 focus:outline-none shadow-lg w-auto transition-all"
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
                  className="px-6 py-3 bg-gray-700 text-white text-xl md:text-base rounded-lg border border-gray-600 hover:bg-gray-600 hover:border-gray-500 transition-all font-medium shadow-lg"
                  style={{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 2px 4px rgba(0, 0, 0, 0.3)' }}
                >
                  Clear All
                </button>
                <Button
                  onClick={() => setIsFilterDialogOpen(false)}
                  className="px-8 py-3 bg-orange-600 text-white text-xl md:text-base rounded-lg border border-orange-500 hover:bg-orange-500 hover:border-orange-400 transition-all font-bold shadow-lg"
                  style={{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 4px 8px rgba(255, 165, 0, 0.3)' }}
                >
                  Apply Filters
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* History Dialog Modal */}
      {isHistoryDialogOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[9998] bg-black/70"
            onClick={() => setIsHistoryDialogOpen(false)}
          />
          {/* Modal Content */}
          <div className="fixed left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[9999] w-[90%] max-w-2xl max-h-[80vh] overflow-y-auto rounded-lg border p-6"
            style={{
              background: '#000000',
              borderColor: '#ff9447',
              borderWidth: '2px',
            }}
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-bold"
                style={{
                  color: '#ffffff',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  letterSpacing: '0.5px'
                }}
              >
                Flow History
              </h2>
              <button
                onClick={() => setIsHistoryDialogOpen(false)}
                className="text-gray-400 hover:text-white text-3xl font-bold transition-colors"
              >
                ×
              </button>
            </div>

            {savedFlowDates.length === 0 ? (
              <div className="text-center py-12" style={{ color: '#ff9447' }}>
                <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-xl">No saved flows</p>
              </div>
            ) : (
              <div className="space-y-3">
                {savedFlowDates.map((flow) => (
                  <div
                    key={flow.date}
                    className="rounded-lg p-4 border transition-all hover:border-opacity-100"
                    style={{
                      background: '#0a0a0a',
                      borderColor: '#ff9447',
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      opacity: 0.9
                    }}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-xl font-bold mb-1"
                          style={{ color: '#ffffff' }}
                        >
                          {new Date(flow.date).toLocaleDateString('en-US', {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </p>
                        <p className="text-sm" style={{ color: '#ff9447' }}>
                          Size: {(flow.size / 1024).toFixed(2)} KB | Saved: {new Date(flow.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleLoadFlow(flow.date)}
                          disabled={loadingFlowDate === flow.date}
                          className="px-4 py-2 rounded font-semibold transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                          style={{
                            background: '#ff9447',
                            color: '#000000',
                          }}
                        >
                          {loadingFlowDate === flow.date ? (
                            <>
                              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Loading...
                            </>
                          ) : (
                            'Load'
                          )}
                        </button>
                        <button
                          onClick={() => handleDeleteFlow(flow.date)}
                          className="px-4 py-2 rounded font-semibold transition-all hover:brightness-90"
                          style={{
                            background: '#1a1a1a',
                            color: '#ffffff',
                            border: '1px solid #ff9447'
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <div
        className={`bg-black flex flex-col ${isFlowTrackingOpen ? 'md:flex hidden' : 'flex'}`}
        style={{
          minHeight: '100vh',
          width: 'calc(100% - 801px)',
          marginRight: '0'
        }}
      >
        {/* Premium Control Bar */}
        <div className="bg-black border-b border-gray-700 flex-shrink-0" style={{
          zIndex: 10,
          width: '100%',
          overflow: 'visible',
          marginTop: '15px'
        }}>
          {/* Mobile Layout - 2 Rows */}
          <div className="md:hidden px-4 py-3">
            {/* Row 1: Search, Highlights, Clear, Filter, Track */}
            <div className="flex items-center gap-3">
              {/* Search Bar */}
              <div className="relative" style={{ width: '150px', flexShrink: 0 }}>
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2 z-10 pointer-events-none">
                  <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={inputTicker}
                  onChange={(e) => setInputTicker(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && inputTicker.trim()) {
                      const ticker = inputTicker.trim();
                      onTickerChange(ticker);
                      onRefresh?.(ticker);
                    }
                  }}
                  placeholder="TICKER"
                  className="text-white font-mono placeholder-gray-500 transition-all duration-200 w-full"
                  style={{
                    height: '40px',
                    paddingLeft: '2rem',
                    paddingRight: '0.5rem',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: '700',
                    letterSpacing: '1px',
                    background: 'linear-gradient(180deg, #000000 0%, #0a0a0a 100%)',
                    border: '2px solid #1f1f1f',
                    textTransform: 'uppercase',
                    boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)',
                    outline: 'none'
                  }}
                  maxLength={20}
                />
              </div>

              {/* Right side buttons */}
              <div className="flex items-center gap-2">
                {/* Highlights Button */}
                <button
                  onClick={() => setEfiHighlightsActive(!efiHighlightsActive)}
                  className="px-2 text-white font-black uppercase transition-all duration-200 flex items-center gap-1 hover:scale-[1.02] active:scale-[0.98] focus:outline-none"
                  style={{
                    height: '40px',
                    background: efiHighlightsActive
                      ? 'linear-gradient(180deg, #ff9500 0%, #ff8500 50%, #ff7500 100%)'
                      : 'linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #000000 100%)',
                    border: efiHighlightsActive ? '1px solid #ffaa00' : '2px solid #2a2a2a',
                    borderRadius: '4px',
                    fontSize: '10px',
                    letterSpacing: '0.5px',
                    fontWeight: '900',
                    boxShadow: efiHighlightsActive
                      ? 'inset 0 1px 0 rgba(255, 255, 255, 0.4), inset 0 -2px 0 rgba(0, 0, 0, 0.3)'
                      : 'inset 0 2px 8px rgba(0, 0, 0, 0.9)'
                  }}
                >
                  <svg className={`w-3 h-3 transition-all duration-200 ${efiHighlightsActive ? 'text-black' : 'text-orange-500'}`}
                    fill={efiHighlightsActive ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                  <span style={{ color: efiHighlightsActive ? '#000000' : '#ffffff' }}>HIGHLIGHTS</span>
                </button>

                {/* Filter Button */}
                <button
                  onClick={() => {
                    console.log('Filter button clicked - opening dialog');
                    setIsFilterDialogOpen(true);
                  }}
                  className="px-2 text-white font-black uppercase transition-all duration-200 flex items-center gap-1 hover:scale-[1.02] active:scale-[0.98] focus:outline-none"
                  style={{
                    height: '40px',
                    background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #000000 100%)',
                    border: '2px solid #ff8500',
                    borderRadius: '4px',
                    fontSize: '10px',
                    letterSpacing: '0.5px',
                    fontWeight: '900',
                    boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)'
                  }}
                >
                  <svg className="w-3 h-3 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  <span>FILTER</span>
                </button>

                {/* Flow Tracking Button */}
                <button
                  onClick={() => setIsFlowTrackingOpen(!isFlowTrackingOpen)}
                  className={`px-2 text-white font-black uppercase transition-all duration-200 flex items-center gap-1 hover:scale-[1.02] active:scale-[0.98] focus:outline-none`}
                  style={{
                    height: '40px',
                    background: isFlowTrackingOpen
                      ? 'linear-gradient(180deg, #10b981 0%, #059669 100%)'
                      : 'linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #000000 100%)',
                    border: isFlowTrackingOpen ? '2px solid #10b981' : '2px solid #6b7280',
                    borderRadius: '4px',
                    fontSize: '10px',
                    letterSpacing: '0.5px',
                    fontWeight: '900',
                    boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)'
                  }}
                >
                  <svg className="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <span>TRACK</span>
                </button>

                {/* Mobile Dropdown Menu - Replace trash icon */}
                <div className="relative">
                  <button
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    disabled={loading}
                    className={`px-2 text-white font-black uppercase transition-all duration-200 flex items-center justify-center focus:outline-none ${loading
                      ? 'cursor-not-allowed opacity-40'
                      : 'hover:scale-[1.02] active:scale-[0.98]'
                      }`}
                    style={{
                      height: '40px',
                      width: '40px',
                      background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #000000 100%)',
                      border: '2px solid #6b7280',
                      borderRadius: '4px',
                      boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)'
                    }}
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                    </svg>
                  </button>

                  {/* Dropdown Menu */}
                  {mobileMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-[9998]"
                        onClick={() => setMobileMenuOpen(false)}
                      />
                      <div className="absolute right-0 mt-2 w-48 bg-black border border-orange-500 rounded shadow-lg z-[9999]">
                        <button
                          onClick={() => {
                            handleSaveFlow();
                            setMobileMenuOpen(false);
                          }}
                          disabled={savingFlow || !data || data.length === 0}
                          className="w-full text-left px-4 py-3 text-white hover:bg-gray-800 flex items-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                          </svg>
                          <span className="font-bold">Save</span>
                        </button>
                        <button
                          onClick={() => {
                            setIsHistoryDialogOpen(true);
                            setMobileMenuOpen(false);
                          }}
                          disabled={loadingHistory}
                          className="w-full text-left px-4 py-3 text-white hover:bg-gray-800 flex items-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="font-bold">History</span>
                        </button>
                        {onClearData && (
                          <button
                            onClick={() => {
                              onClearData();
                              setMobileMenuOpen(false);
                            }}
                            disabled={loading}
                            className="w-full text-left px-4 py-3 text-red-400 hover:bg-gray-800 flex items-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed border-t border-gray-700"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            <span className="font-bold">Clear</span>
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Save Button */}
                <button
                  onClick={handleSaveFlow}
                  disabled={savingFlow || !data || data.length === 0}
                  className={`px-2 text-white font-black uppercase transition-all duration-200 flex items-center gap-1 focus:outline-none ${savingFlow || !data || data.length === 0
                    ? 'cursor-not-allowed opacity-40'
                    : 'hover:scale-[1.02] active:scale-[0.98]'
                    }`}
                  style={{
                    height: '40px',
                    background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #000000 100%)',
                    border: '2px solid #3b82f6',
                    borderRadius: '4px',
                    fontSize: '10px',
                    letterSpacing: '0.5px',
                    fontWeight: '900',
                    boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)'
                  }}
                >
                  {savingFlow ? (
                    <svg className="w-3 h-3 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg className="w-3 h-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                    </svg>
                  )}
                  <span>{savingFlow ? 'SAVING...' : 'SAVE'}</span>
                </button>

                {/* History Button */}
                <button
                  onClick={loadFlowHistory}
                  disabled={loadingHistory}
                  className={`px-2 text-white font-black uppercase transition-all duration-200 flex items-center gap-1 focus:outline-none ${loadingHistory
                    ? 'cursor-not-allowed opacity-40'
                    : 'hover:scale-[1.02] active:scale-[0.98]'
                    }`}
                  style={{
                    height: '40px',
                    background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #000000 100%)',
                    border: '2px solid #8b5cf6',
                    borderRadius: '4px',
                    fontSize: '10px',
                    letterSpacing: '0.5px',
                    fontWeight: '900',
                    boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)'
                  }}
                >
                  {loadingHistory ? (
                    <svg className="w-3 h-3 text-purple-400 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg className="w-3 h-3 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  <span>{loadingHistory ? 'LOADING...' : 'HISTORY'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Desktop Layout - Single Row */}
          <div className="hidden md:block px-8 py-5 bg-black" style={{
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
                <div className="hidden md:flex items-center gap-2">
                  {useDropdowns ? (
                    <select
                      value={selectedOptionTypes.length === 1 ? selectedOptionTypes[0] : 'both'}
                      onChange={(e) => {
                        if (e.target.value === 'both') {
                          setSelectedOptionTypes(['call', 'put']);
                        } else {
                          setSelectedOptionTypes([e.target.value]);
                        }
                      }}
                      className="px-4 font-bold uppercase transition-all duration-200"
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
                        color: '#ffffff',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="both" style={{ background: '#000000', color: '#ffffff' }}>BOTH</option>
                      <option value="call" style={{ background: '#000000', color: '#84cc16' }}>CALLS</option>
                      <option value="put" style={{ background: '#000000', color: '#dc2626' }}>PUTS</option>
                    </select>
                  ) : (
                    <>
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
                    </>
                  )}
                  {useDropdowns ? (
                    <select
                      value={inputTicker === 'ETF' || inputTicker === 'MAG7' || inputTicker === 'ALL' ? inputTicker : ''}
                      onChange={(e) => {
                        if (e.target.value) {
                          setInputTicker(e.target.value);
                          onTickerChange(e.target.value);
                          onRefresh?.(e.target.value);
                        }
                      }}
                      className="px-4 font-bold uppercase transition-all duration-200"
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
                        color: '#ffffff',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="" style={{ background: '#000000', color: '#ffffff' }}>PRESETS</option>
                      <option value="ETF" style={{ background: '#000000', color: '#ff8500' }}>ETF</option>
                      <option value="MAG7" style={{ background: '#000000', color: '#a855f7' }}>MAG7</option>
                      <option value="ALL" style={{ background: '#000000', color: '#ffffff' }}>ALL</option>
                    </select>
                  ) : (
                    <>
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
                    </>
                  )}
                </div>

                {/* Divider */}
                <div className="hidden md:block" style={{ width: '1px', height: '48px', background: '#2a2a2a' }}></div>

                {/* Quick Filters */}
                <div className="hidden md:flex items-center gap-2">
                  {useDropdowns ? (
                    <select
                      value={
                        quickFilters.otm ? 'otm' :
                          quickFilters.premium100k ? 'premium100k' :
                            quickFilters.weekly ? 'weekly' :
                              quickFilters.sweep ? 'sweep' :
                                quickFilters.block ? 'block' : ''
                      }
                      onChange={(e) => {
                        const value = e.target.value;
                        setQuickFilters({
                          otm: value === 'otm',
                          premium100k: value === 'premium100k',
                          weekly: value === 'weekly',
                          sweep: value === 'sweep',
                          block: value === 'block'
                        });
                      }}
                      className="px-4 font-bold uppercase"
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
                        color: '#ffffff',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="" style={{ background: '#000000', color: '#ffffff' }}>FILTERS</option>
                      <option value="otm" style={{ background: '#000000', color: '#3b82f6' }}>OTM</option>
                      <option value="premium100k" style={{ background: '#000000', color: '#22c55e' }}>100K+</option>
                      <option value="weekly" style={{ background: '#000000', color: '#ef4444' }}>WKLYs</option>
                      <option value="sweep" style={{ background: '#000000', color: '#fbbf24' }}>SWEEP</option>
                      <option value="block" style={{ background: '#000000', color: '#a855f7' }}>BLOCK</option>
                    </select>
                  ) : (
                    <>
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
                    </>
                  )}
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
                <div className="hidden md:block" style={{ width: '1px', height: '48px', background: '#2a2a2a' }}></div>

                {/* Premium SCAN Button */}
                {!useDropdowns && (
                  <button
                    onClick={() => {
                      if (inputTicker.trim()) {
                        const ticker = inputTicker.trim();
                        onTickerChange(ticker);
                        onRefresh?.(ticker);
                      }
                    }}
                    disabled={!inputTicker.trim() || loading}
                    className={`hidden md:flex px-10 font-black uppercase transition-all duration-200 items-center gap-3 ${!inputTicker.trim() || loading ? 'opacity-40 cursor-not-allowed' : 'hover:scale-[1.02] active:scale-[0.98]'
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
                )}

                {/* Premium EFI Highlights Toggle */}
                <button
                  onClick={() => setEfiHighlightsActive(!efiHighlightsActive)}
                  className="px-4 md:px-8 text-white font-black uppercase transition-all duration-200 flex items-center gap-2 md:gap-3 hover:scale-[1.02] active:scale-[0.98] focus:outline-none"
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
                  <span style={{ color: efiHighlightsActive ? '#000000' : '#ffffff' }}>HIGHLIGHTS</span>
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
                    className={`hidden md:flex px-9 text-white font-black uppercase transition-all duration-200 items-center gap-3 focus:outline-none ${loading
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

                  {/* Clear Data Button - Desktop Only */}
                  {onClearData && (
                    <button
                      onClick={onClearData}
                      disabled={loading}
                      className={`hidden md:flex px-4 md:px-9 text-white font-black uppercase transition-all duration-200 items-center gap-2 md:gap-3 focus:outline-none ${loading
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

                  {/* Mobile Dropdown Menu Button */}
                  <div className="md:hidden relative">
                    <button
                      onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                      disabled={loading}
                      className={`px-4 text-white font-black uppercase transition-all duration-200 flex items-center gap-2 focus:outline-none ${loading
                        ? 'cursor-not-allowed opacity-40'
                        : 'hover:scale-[1.02] active:scale-[0.98]'
                        }`}
                      style={{
                        height: '48px',
                        background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #000000 100%)',
                        border: '2px solid #6b7280',
                        borderRadius: '4px',
                        fontSize: '14px',
                        letterSpacing: '1.5px',
                        fontWeight: '900',
                        boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)'
                      }}
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                      </svg>
                    </button>

                    {/* Dropdown Menu */}
                    {mobileMenuOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setMobileMenuOpen(false)}
                        />
                        <div className="absolute right-0 mt-2 w-48 bg-black border border-orange-500 rounded shadow-lg z-50">
                          <button
                            onClick={() => {
                              handleSaveFlow();
                              setMobileMenuOpen(false);
                            }}
                            disabled={savingFlow || !data || data.length === 0}
                            className="w-full text-left px-4 py-3 text-white hover:bg-gray-800 flex items-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                            </svg>
                            <span className="font-bold">Save</span>
                          </button>
                          <button
                            onClick={() => {
                              setIsHistoryDialogOpen(true);
                              setMobileMenuOpen(false);
                            }}
                            disabled={loadingHistory}
                            className="w-full text-left px-4 py-3 text-white hover:bg-gray-800 flex items-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="font-bold">History</span>
                          </button>
                          {onClearData && (
                            <button
                              onClick={() => {
                                onClearData();
                                setMobileMenuOpen(false);
                              }}
                              disabled={loading}
                              className="w-full text-left px-4 py-3 text-red-400 hover:bg-gray-800 flex items-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed border-t border-gray-700"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              <span className="font-bold">Clear</span>
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Save Button - Desktop Only */}
                  <button
                    onClick={handleSaveFlow}
                    disabled={savingFlow || !data || data.length === 0}
                    className={`hidden md:flex px-4 text-white font-black uppercase transition-all duration-200 items-center gap-2 focus:outline-none ${savingFlow || !data || data.length === 0
                      ? 'cursor-not-allowed opacity-40'
                      : 'hover:scale-[1.02] active:scale-[0.98]'
                      }`}
                    style={{
                      height: '48px',
                      background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #000000 100%)',
                      border: '2px solid #3b82f6',
                      borderRadius: '4px',
                      fontSize: '14px',
                      letterSpacing: '1.5px',
                      fontWeight: '900',
                      boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)'
                    }}
                  >
                    {savingFlow ? (
                      <svg className="w-5 h-5 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                      </svg>
                    )}
                    <span>{savingFlow ? 'SAVING...' : 'SAVE'}</span>
                  </button>

                  {/* History Button - Desktop Only */}
                  <button
                    onClick={loadFlowHistory}
                    disabled={loadingHistory}
                    className={`hidden md:flex px-4 text-white font-black uppercase transition-all duration-200 items-center gap-2 focus:outline-none ${loadingHistory
                      ? 'cursor-not-allowed opacity-40'
                      : 'hover:scale-[1.02] active:scale-[0.98]'
                      }`}
                    style={{
                      height: '48px',
                      background: 'linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #000000 100%)',
                      border: '2px solid #8b5cf6',
                      borderRadius: '4px',
                      fontSize: '14px',
                      letterSpacing: '1.5px',
                      fontWeight: '900',
                      boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)'
                    }}
                  >
                    {loadingHistory ? (
                      <svg className="w-5 h-5 text-purple-400 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                    <span>{loadingHistory ? 'LOADING...' : 'HISTORY'}</span>
                  </button>

                  {/* Flow Tracking Button - Mobile Only */}
                  <button
                    onClick={() => setIsFlowTrackingOpen(!isFlowTrackingOpen)}
                    className={`md:hidden px-4 text-white font-black uppercase transition-all duration-200 flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98] focus:outline-none`}
                    style={{
                      height: '48px',
                      background: isFlowTrackingOpen
                        ? 'linear-gradient(180deg, #10b981 0%, #059669 100%)'
                        : 'linear-gradient(180deg, #1a1a1a 0%, #000000 50%, #000000 100%)',
                      border: isFlowTrackingOpen ? '2px solid #10b981' : '2px solid #6b7280',
                      borderRadius: '4px',
                      fontSize: '14px',
                      letterSpacing: '1.5px',
                      fontWeight: '900',
                      boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.9)'
                    }}
                    onMouseEnter={(e) => {
                      if (!loading) {
                        e.currentTarget.style.boxShadow = 'inset 0 2px 8px rgba(0, 0, 0, 0.9)';
                        e.currentTarget.style.border = isFlowTrackingOpen ? '2px solid #34d399' : '2px solid #9ca3af';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!loading) {
                        e.currentTarget.style.boxShadow = 'inset 0 2px 8px rgba(0, 0, 0, 0.9)';
                        e.currentTarget.style.border = isFlowTrackingOpen ? '2px solid #10b981' : '2px solid #6b7280';
                      }
                    }}
                  >
                    <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span>TRACK</span>
                  </button>

                </div>

                {/* Right Section - Desktop Only */}
                <div className="hidden md:flex stats-section flex-col md:flex-row items-start md:items-center gap-2 md:gap-3 w-full md:w-auto" style={{ flexShrink: 0, minWidth: 'auto' }}>

                  {/* Filter Button */}
                  <button
                    onClick={() => {
                      console.log('Filter button clicked - opening dialog');
                      setIsFilterDialogOpen(true);
                    }}
                    className="px-4 md:px-9 text-white font-black uppercase transition-all duration-200 flex items-center gap-2 md:gap-3 hover:scale-[1.02] active:scale-[0.98] focus:outline-none"
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
                              className={`w-7 h-7 md:w-8 md:h-8 flex items-center justify-center text-xs border rounded transition-all duration-150 ${currentPage === pageNum
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
            <div className="table-scroll-container custom-scrollbar overflow-y-auto overflow-x-auto" style={{ height: 'calc(100vh - 140px)', paddingBottom: '100px', scrollBehavior: 'smooth' }}>
              <table className="w-full options-flow-table" style={{ marginBottom: '80px' }}>
                <thead className="sticky top-0 bg-gradient-to-b from-yellow-900/10 via-gray-900 to-black z-[5] border-b-2 border-gray-600 shadow-2xl">
                  <tr>
                    <th
                      className="text-center md:text-left p-2 md:p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 to-black hover:from-yellow-800/15 hover:to-black text-orange-400 font-bold text-xs md:text-xl transition-all duration-200 border-r border-gray-700"
                      onClick={() => handleSort('trade_timestamp')}
                    >
                      <span className="md:hidden">Symbol</span>
                      <span className="hidden md:inline">Time</span>
                      {sortField === 'trade_timestamp' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="hidden md:table-cell text-center md:text-left p-2 md:p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 to-black hover:from-yellow-800/15 hover:to-black text-orange-400 font-bold text-xs md:text-xl transition-all duration-200 border-r border-gray-700"
                      onClick={() => handleSort('underlying_ticker')}
                    >
                      Symbol {sortField === 'underlying_ticker' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="text-center md:text-left p-2 md:p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 via-gray-900/80 to-black hover:from-yellow-800/15 hover:via-gray-800/90 hover:to-black text-orange-400 font-bold text-xs md:text-xl transition-all duration-200 border-r border-gray-700 shadow-lg shadow-black/50 hover:shadow-xl hover:shadow-orange-500/20 backdrop-blur-sm"
                      onClick={() => handleSort('type')}
                    >
                      <span className="md:hidden">Strike</span>
                      <span className="hidden md:inline">Call/Put</span>
                      {sortField === 'type' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="hidden md:table-cell text-center md:text-left p-2 md:p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 via-black to-black hover:from-yellow-800/20 hover:via-gray-900 hover:to-black text-orange-400 font-bold text-xs md:text-xl transition-all duration-200 border-r border-gray-700"
                      onClick={() => handleSort('strike')}
                    >
                      Strike {sortField === 'strike' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="text-center md:text-left p-2 md:p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 via-black to-black hover:from-yellow-800/20 hover:via-gray-900 hover:to-black text-orange-400 font-bold text-xs md:text-xl transition-all duration-200 border-r border-gray-700"
                      onClick={() => handleSort('trade_size')}
                    >
                      <span className="md:hidden">Size</span>
                      <span className="hidden md:inline">Size</span>
                      {sortField === 'trade_size' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="hidden md:table-cell text-center md:text-left p-2 md:p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 via-black to-black hover:from-yellow-800/20 hover:via-gray-900 hover:to-black text-orange-400 font-bold text-xs md:text-xl transition-all duration-200 border-r border-gray-700"
                      onClick={() => handleSort('total_premium')}
                    >
                      Premium {sortField === 'total_premium' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="text-center md:text-left p-2 md:p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 via-black to-black hover:from-yellow-800/20 hover:via-gray-900 hover:to-black text-orange-400 font-bold text-xs md:text-xl transition-all duration-200 border-r border-gray-700"
                      onClick={() => handleSort('expiry')}
                    >
                      <span className="md:hidden">Expiry / Type</span>
                      <span className="hidden md:inline">Expiration</span>
                      {sortField === 'expiry' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="text-center md:text-left p-2 md:p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 via-black to-black hover:from-yellow-800/20 hover:via-gray-900 hover:to-black text-orange-400 font-bold text-xs md:text-xl transition-all duration-200 border-r border-gray-700"
                      onClick={() => handleSort('spot_price')}
                    >
                      <span className="hidden md:inline">Spot {'>>'}  Current</span>
                      <span className="md:hidden">Spot</span>
                      {sortField === 'spot_price' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="hidden md:table-cell text-center md:text-left p-2 md:p-6 bg-gradient-to-b from-yellow-900/10 via-black to-black text-orange-400 font-bold text-xs md:text-xl transition-all duration-200 border-r border-gray-700"
                    >
                      VOL/OI
                    </th>
                    <th
                      className="hidden md:table-cell text-center md:text-left p-2 md:p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 via-gray-900/80 to-black hover:from-yellow-800/15 hover:via-gray-800/90 hover:to-black text-orange-400 font-bold text-xs md:text-xl transition-all duration-200 shadow-lg shadow-black/50 hover:shadow-xl hover:shadow-orange-500/20 backdrop-blur-sm"
                      onClick={() => handleSort('trade_type')}
                    >
                      Type {sortField === 'trade_type' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    {efiHighlightsActive && (
                      <th
                        className="text-center md:text-left p-2 md:p-6 cursor-pointer bg-gradient-to-b from-yellow-900/10 via-black to-black hover:from-yellow-800/20 hover:via-gray-900 hover:to-black text-orange-400 font-bold text-xs md:text-xl transition-all duration-200 border-r border-gray-700"
                        onClick={() => {
                          console.log('🎯 Position column clicked!');
                          handleSort('positioning_grade');
                        }}
                      >
                        <span className="md:hidden">Grade</span>
                        <span className="hidden md:inline">Position</span>
                        {sortField === 'positioning_grade' && (sortDirection === 'asc' ? '↑' : '↓')}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.map((trade, index) => {
                    const isEfiHighlight = efiHighlightsActive && meetsEfiCriteria(trade);

                    // Determine if EFI highlight is bullish or bearish
                    let isBullishEfi = false;
                    let isBearishEfi = false;
                    if (isEfiHighlight) {
                      const fillStyle = (trade as any).fill_style || '';
                      const isCall = trade.type.toLowerCase() === 'call';

                      if (fillStyle === 'A' || fillStyle === 'AA') {
                        // Ask side - buying
                        isBullishEfi = isCall;  // Buying calls = bullish
                        isBearishEfi = !isCall; // Buying puts = bearish
                      } else if (fillStyle === 'B' || fillStyle === 'BB') {
                        // Bid side - selling
                        isBullishEfi = !isCall; // Selling puts = bullish
                        isBearishEfi = isCall;  // Selling calls = bearish
                      }
                    }

                    return (
                      <tr
                        key={`${trade.ticker}-${trade.strike}-${trade.trade_timestamp}-${trade.trade_size}-${index}`}
                        className="border-b border-slate-700/50 hover:bg-slate-800/40 transition-all duration-300 hover:shadow-lg"
                        style={isEfiHighlight ? (
                          isBullishEfi ? {
                            background: `
                              radial-gradient(ellipse at top left, rgba(0, 255, 0, 0.06) 0%, transparent 50%),
                              radial-gradient(ellipse at bottom right, rgba(0, 255, 0, 0.03) 0%, transparent 50%),
                              linear-gradient(to bottom, 
                                rgba(0, 255, 0, 0.04) 0%, 
                                rgba(0, 255, 0, 0.02) 5%,
                                transparent 15%, 
                                transparent 85%, 
                                rgba(0, 0, 0, 0.7) 95%,
                                rgba(0, 0, 0, 0.9) 100%
                              ),
                              linear-gradient(135deg, 
                                #000803 0%, 
                                #000f08 15%, 
                                #000602 30%,
                                #000a06 45%,
                                #000703 60%, 
                                #000804 75%,
                                #000a06 90%,
                                #000602 100%
                              )
                            `,
                            borderLeft: '5px solid #00ff00',
                            borderRight: '5px solid #00ff00',
                            borderTop: '2px solid rgba(0, 255, 0, 0.2)',
                            borderBottom: '2px solid rgba(0, 0, 0, 0.95)',
                            boxShadow: `
                              inset 0 4px 16px rgba(0, 255, 0, 0.2),
                              inset 0 -4px 16px rgba(0, 0, 0, 0.8),
                              inset 5px 0 12px rgba(0, 255, 0, 0.15),
                              inset -5px 0 12px rgba(0, 255, 0, 0.15),
                              inset 0 1px 2px rgba(0, 255, 0, 0.05),
                              0 0 20px rgba(0, 255, 0, 0.3),
                              0 0 10px rgba(0, 255, 0, 0.2),
                              0 6px 20px rgba(0, 0, 0, 0.95),
                              0 2px 8px rgba(0, 255, 0, 0.25)
                            `,
                            position: 'relative' as const,
                            transform: 'translateZ(0)',
                            backdropFilter: 'blur(0.5px)',
                            WebkitBackdropFilter: 'blur(0.5px)',
                            isolation: 'isolate' as const,
                          } : {
                            background: `
                              radial-gradient(ellipse at top left, rgba(255, 0, 0, 0.06) 0%, transparent 50%),
                              radial-gradient(ellipse at bottom right, rgba(255, 0, 0, 0.03) 0%, transparent 50%),
                              linear-gradient(to bottom, 
                                rgba(255, 0, 0, 0.04) 0%, 
                                rgba(255, 0, 0, 0.02) 5%,
                                transparent 15%, 
                                transparent 85%, 
                                rgba(0, 0, 0, 0.7) 95%,
                                rgba(0, 0, 0, 0.9) 100%
                              ),
                              linear-gradient(135deg, 
                                #080300 0%, 
                                #0f0400 15%, 
                                #060200 30%,
                                #0a0300 45%,
                                #070200 60%, 
                                #080300 75%,
                                #0a0300 90%,
                                #060200 100%
                              )
                            `,
                            borderLeft: '5px solid #ff0000',
                            borderRight: '5px solid #ff0000',
                            borderTop: '2px solid rgba(255, 0, 0, 0.2)',
                            borderBottom: '2px solid rgba(0, 0, 0, 0.95)',
                            boxShadow: `
                              inset 0 4px 16px rgba(255, 0, 0, 0.2),
                              inset 0 -4px 16px rgba(0, 0, 0, 0.8),
                              inset 5px 0 12px rgba(255, 0, 0, 0.15),
                              inset -5px 0 12px rgba(255, 0, 0, 0.15),
                              inset 0 1px 2px rgba(255, 0, 0, 0.05),
                              0 0 20px rgba(255, 0, 0, 0.3),
                              0 0 10px rgba(255, 0, 0, 0.2),
                              0 6px 20px rgba(0, 0, 0, 0.95),
                              0 2px 8px rgba(255, 0, 0, 0.25)
                            `,
                            position: 'relative' as const,
                            transform: 'translateZ(0)',
                            backdropFilter: 'blur(0.5px)',
                            WebkitBackdropFilter: 'blur(0.5px)',
                            isolation: 'isolate' as const,
                          }
                        ) : {
                          backgroundColor: index % 2 === 0 ? '#000000' : '#0a0a0a'
                        }}
                      >
                        <td className="p-2 md:p-6 text-white text-xs md:text-xl font-medium border-r border-gray-700/30 time-cell text-center">
                          {/* Mobile: Ticker + Time stacked */}
                          <div className="md:hidden flex flex-col items-center space-y-1">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleTickerClick(trade.underlying_ticker)}
                                className={`ticker-button ${getTickerStyle(trade.underlying_ticker)} hover:bg-gray-900 hover:text-orange-400 transition-all duration-200 px-2 py-1 rounded-lg cursor-pointer border-none shadow-sm text-xs ${selectedTickerFilter === trade.underlying_ticker ? 'ring-2 ring-orange-500 bg-gray-800/50' : ''
                                  }`}
                              >
                                {trade.underlying_ticker}
                              </button>
                              <button
                                onClick={() => isInFlowTracking(trade) ? removeFromFlowTracking(trade) : addToFlowTracking(trade)}
                                className="text-white hover:text-orange-400 transition-colors"
                                title={isInFlowTracking(trade) ? 'Remove from Flow Tracking' : 'Add to Flow Tracking'}
                              >
                                {isInFlowTracking(trade) ? (
                                  <TbStarFilled className="w-3 h-3 text-orange-400" />
                                ) : (
                                  <TbStar className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                            <div className="text-xs text-gray-300">{formatTime(trade.trade_timestamp)}</div>
                          </div>
                          {/* Desktop: Time only */}
                          <div className="hidden md:block">{formatTimeWithSeconds(trade.trade_timestamp)}</div>
                        </td>
                        <td className="hidden md:table-cell p-2 md:p-6 border-r border-gray-700/30">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleTickerClick(trade.underlying_ticker)}
                              className={`ticker-button ${getTickerStyle(trade.underlying_ticker)} hover:bg-gray-900 hover:text-orange-400 transition-all duration-200 px-2 md:px-3 py-1 md:py-2 rounded-lg cursor-pointer border-none shadow-sm text-xs md:text-lg ${selectedTickerFilter === trade.underlying_ticker ? 'ring-2 ring-orange-500 bg-gray-800/50' : ''
                                }`}
                            >
                              {trade.underlying_ticker}
                            </button>
                            <button
                              onClick={() => isInFlowTracking(trade) ? removeFromFlowTracking(trade) : addToFlowTracking(trade)}
                              className="text-white hover:text-orange-400 transition-colors"
                              title={isInFlowTracking(trade) ? 'Remove from Flow Tracking' : 'Add to Flow Tracking'}
                            >
                              {isInFlowTracking(trade) ? (
                                <TbStarFilled className="w-4 h-4 text-orange-400" />
                              ) : (
                                <TbStar className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className={`p-2 md:p-6 text-sm md:text-xl font-bold border-r border-gray-700/30 call-put-text text-center ${getCallPutColor(trade.type)}`}>
                          {/* Mobile: Strike + Call/Put stacked */}
                          <div className="md:hidden flex flex-col items-center space-y-1">
                            <div className="text-white text-xs font-semibold">${trade.strike}</div>
                            <div className={`text-xs font-bold ${getCallPutColor(trade.type)}`}>{trade.type.toUpperCase()}</div>
                          </div>
                          {/* Desktop: Call/Put only */}
                          <div className="hidden md:block">{trade.type.toUpperCase()}</div>
                        </td>
                        <td className="hidden md:table-cell p-2 md:p-6 text-xs md:text-xl text-white font-semibold border-r border-gray-700/30 strike-cell">${trade.strike}</td>
                        <td className="p-2 md:p-6 font-medium text-xs md:text-xl text-white border-r border-gray-700/30 size-premium-cell text-center">
                          {/* Mobile: Size@Price+Grade + Premium stacked */}
                          <div className="md:hidden flex flex-col items-center space-y-1">
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-cyan-400 font-bold text-xs">
                                {trade.trade_size.toLocaleString()}
                              </span>
                              <span className="text-yellow-400 font-bold text-xs">
                                @{trade.premium_per_contract.toFixed(2)}
                              </span>
                              {(trade as any).fill_style && (
                                <span className={`ml-1 px-2 py-1 rounded-full font-bold text-xs shadow-lg ${(trade as any).fill_style === 'A' ? 'text-green-400 bg-green-400/20 border border-green-400/40' :
                                  (trade as any).fill_style === 'AA' ? 'text-green-300 bg-green-300/20 border border-green-300/40' :
                                    (trade as any).fill_style === 'B' ? 'text-red-400 bg-red-400/20 border border-red-400/40' :
                                      (trade as any).fill_style === 'BB' ? 'text-red-300 bg-red-300/20 border border-red-300/40' :
                                        'text-gray-500 bg-gray-500/20 border border-gray-500/40'
                                  }`}>
                                  {(trade as any).fill_style}
                                </span>
                              )}
                            </div>
                            <div className="text-green-400 font-bold text-xs">{formatCurrency(trade.total_premium)}</div>
                          </div>
                          {/* Desktop: Original layout */}
                          <div className="hidden md:block">
                            <div className="flex flex-col space-y-0.5 md:space-y-1">
                              <div className="flex flex-wrap items-center gap-1">
                                <span className="text-cyan-400 font-bold size-text" style={{ fontSize: '12px' }}>
                                  <span className="hidden md:inline" style={{ fontSize: '19px' }}>{trade.trade_size.toLocaleString()}</span>
                                </span>
                                <span className="text-slate-400 premium-at" style={{ fontSize: '12px' }}>
                                  <span className="hidden md:inline" style={{ fontSize: '19px' }}> @ </span>
                                </span>
                                <span className="text-yellow-400 font-bold premium-value" style={{ fontSize: '12px' }}>
                                  <span className="hidden md:inline" style={{ fontSize: '19px' }}>{trade.premium_per_contract.toFixed(2)}</span>
                                </span>
                                {(trade as any).fill_style && (
                                  <span className={`fill-style-badge ml-1 px-1 md:px-2 py-0.5 rounded-md font-bold ${(trade as any).fill_style === 'A' ? 'text-green-400 bg-green-400/10 border border-green-400/30' :
                                    (trade as any).fill_style === 'AA' ? 'text-green-300 bg-green-300/10 border border-green-300/30' :
                                      (trade as any).fill_style === 'B' ? 'text-red-400 bg-red-400/10 border border-red-400/30' :
                                        (trade as any).fill_style === 'BB' ? 'text-red-300 bg-red-300/10 border border-red-300/30' :
                                          'text-gray-500 bg-gray-500/10 border border-gray-500/30'
                                    }`} style={{ fontSize: '12px' }}>
                                    <span className="hidden md:inline" style={{ fontSize: '15px' }}>{(trade as any).fill_style}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="hidden md:table-cell p-2 md:p-6 font-bold text-xs md:text-xl text-green-400 border-r border-gray-700/30 premium-text">{formatCurrency(trade.total_premium)}</td>
                        <td className="p-2 md:p-6 text-xs md:text-xl text-white border-r border-gray-700/30 expiry-cell text-center">
                          {/* Mobile: Expiry + Type stacked */}
                          <div className="md:hidden flex flex-col items-center space-y-1">
                            <div className="text-white text-xs font-semibold">{formatDate(trade.expiry)}</div>
                            <span className={`trade-type-badge inline-block px-3 py-1 rounded-full text-xs font-bold shadow-lg bg-gradient-to-r ${getTradeTypeColor(trade.classification || trade.trade_type)}`}>
                              {trade.classification || trade.trade_type}
                            </span>
                          </div>
                          {/* Desktop: Expiry only */}
                          <div className="hidden md:block">{formatDate(trade.expiry)}</div>
                        </td>
                        <td className="p-2 md:p-6 text-xs md:text-xl font-medium border-r border-gray-700/30 price-display text-center">
                          {/* Mobile: Spot + Current stacked vertically */}
                          <div className="md:hidden flex flex-col items-center space-y-1">
                            <div className="text-xs">
                              <span className="font-bold text-white">
                                ${typeof trade.spot_price === 'number' ? trade.spot_price.toFixed(2) : parseFloat(trade.spot_price).toFixed(2)}
                              </span>
                            </div>
                            <div className="text-xs">
                              <span className={`font-bold ${((currentPrices[trade.underlying_ticker] || trade.current_price) ?? 0) > trade.spot_price ? 'text-green-400' : 'text-red-400'}`}>
                                ${((currentPrices[trade.underlying_ticker] || trade.current_price) ?? 0).toFixed(2)}
                              </span>
                            </div>
                          </div>
                          {/* Desktop: Normal layout */}
                          <div className="hidden md:block">
                            <PriceDisplay
                              spotPrice={trade.spot_price}
                              currentPrice={currentPrices[trade.underlying_ticker] || trade.current_price}
                              isLoading={priceLoadingState[trade.underlying_ticker]}
                              ticker={trade.underlying_ticker}
                            />
                          </div>
                        </td>
                        <td className="hidden md:table-cell p-2 md:p-6 text-xs md:text-xl text-white border-r border-gray-700/30 vol-oi-display">
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
                        <td className="hidden md:table-cell p-2 md:p-6 border-r border-gray-700/30">
                          <span className={`trade-type-badge inline-block px-4 py-2 rounded-full text-xs md:text-lg font-bold shadow-lg bg-gradient-to-r ${getTradeTypeColor(trade.classification || trade.trade_type)}`}>
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

                          // Only calculate grade when prices are fetched
                          if (optionPricesFetching) {
                            return (
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-center">
                                <div className="inline-flex items-center gap-2">
                                  <svg className="animate-spin h-4 w-4 text-orange-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                  <span className="text-gray-400 text-xs">Loading...</span>
                                </div>
                              </td>
                            );
                          }

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
                                {/* Mobile: Compact grade + percentage */}
                                <div className="md:hidden flex flex-col items-center space-y-1">
                                  <span style={{
                                    color: scoreColor,
                                    fontWeight: 'bold',
                                    fontSize: '14px',
                                    textShadow: `0 1px 2px rgba(0, 0, 0, 0.8)`,
                                  }}>
                                    {grade}
                                  </span>
                                  <span style={{
                                    color,
                                    fontWeight: 'bold',
                                    fontSize: '12px'
                                  }}>
                                    {priceHigher ? '+' : ''}{percentChange.toFixed(1)}%
                                  </span>
                                </div>
                                {/* Desktop: Original large circle display */}
                                <div className="hidden md:flex items-center gap-2">
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
                                        fontSize: '20px',
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
                                  <span style={{ color, fontWeight: 'bold', fontSize: '16.8px', whiteSpace: 'nowrap' }}>
                                    ${currentPrice.toFixed(2)}
                                  </span>
                                  <span style={{ color, fontSize: '14.4px', whiteSpace: 'nowrap' }}>
                                    {formatValue(currentValue)}
                                  </span>
                                  <span style={{ color, fontWeight: 'bold', fontSize: '15.6px', whiteSpace: 'nowrap' }}>
                                    {priceHigher ? '+' : ''}{percentChange.toFixed(1)}%
                                  </span>
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

      {/* Flow Tracking Panel - Always Visible on Desktop, Toggleable on Mobile */}
      <div
        className={`fixed right-0 bg-black border-l border-gray-700 z-50 w-full md:w-[800px] ${isFlowTrackingOpen ? 'block md:block' : 'hidden md:block'
          }`}
        style={{
          top: '125px',
          height: 'calc(100vh - 125px)',
          background: '#000000',
          boxShadow: '-4px 0 16px rgba(0, 0, 0, 0.8)'
        }}
      >
        {/* Panel Header with 3D Title */}
        <div className="sticky top-0 bg-black z-10 border-b border-gray-700 p-4">
          <h2
            className="text-3xl font-black text-center"
            style={{
              fontFamily: 'Impact, Arial Black, sans-serif',
              background: 'linear-gradient(90deg, #ff0000 0%, #00ff00 33%, #ffd700 66%, #ff0000 100%)',
              backgroundSize: '200% 100%',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              textShadow: 'none',
              letterSpacing: '3px',
              fontWeight: 900,
              opacity: 1,
              animation: 'gradientShift 3s ease infinite'
            }}
          >
            LIVE FLOW TRACKING
          </h2>
          <style jsx>{`
            @keyframes gradientShift {
              0% { background-position: 0% 50%; }
              50% { background-position: 100% 50%; }
              100% { background-position: 0% 50%; }
            }
          `}</style>

          {/* Filters */}
          <div className="mt-3" style={{
            background: '#000000',
            borderRadius: '8px',
            padding: '12px'
          }}>
            {/* All Filters in One Row */}
            <div className="flex items-center gap-3 justify-center flex-wrap">
              <span style={{ color: '#ffffff', fontSize: '16px', fontWeight: 'bold' }}>Flows: {trackedFlows.length}</span>
              <div style={{ width: '2px', height: '30px', background: 'rgba(255, 133, 0, 0.3)', margin: '0 8px' }}></div>
              <span style={{ color: '#ff8500', fontSize: '16px', fontWeight: 'bold' }}>Grade:</span>
              <select
                value={flowTrackingFilters.gradeFilter}
                onChange={(e) => setFlowTrackingFilters(prev => ({ ...prev, gradeFilter: e.target.value as any }))}
                style={{
                  padding: '6px 12px',
                  fontSize: '15px',
                  fontWeight: 'bold',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  background: '#000000',
                  color: '#ffffff',
                  outline: 'none',
                  minWidth: '100px',
                  boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.8), inset -2px -2px 4px rgba(255,255,255,0.05)'
                }}
              >
                <option value="ALL" style={{ background: '#000', color: '#ff8500' }}>ALL</option>
                <option value="A" style={{ background: '#000', color: '#00ff00' }}>A</option>
                <option value="B" style={{ background: '#000', color: '#ffff00' }}>B</option>
                <option value="C" style={{ background: '#000', color: '#ff8500' }}>C</option>
                <option value="D" style={{ background: '#000', color: '#ff0000' }}>D</option>
                <option value="F" style={{ background: '#000', color: '#ff0000' }}>F</option>
              </select>

              <div style={{ width: '2px', height: '30px', background: 'rgba(255, 133, 0, 0.3)', margin: '0 8px' }}></div>

              <button
                onClick={() => setFlowTrackingFilters(prev => ({ ...prev, showDownSixtyPlus: !prev.showDownSixtyPlus }))}
                style={{
                  padding: '6px 14px',
                  fontSize: '15px',
                  fontWeight: 'bold',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  background: flowTrackingFilters.showDownSixtyPlus
                    ? '#ff0000'
                    : '#000000',
                  color: flowTrackingFilters.showDownSixtyPlus
                    ? '#ffffff'
                    : '#ff0000',
                  transition: 'all 0.2s',
                  boxShadow: flowTrackingFilters.showDownSixtyPlus
                    ? '0 2px 8px rgba(255, 0, 0, 0.4)'
                    : 'inset 2px 2px 4px rgba(0,0,0,0.8), inset -2px -2px 4px rgba(255,255,255,0.05)'
                }}
              >
                Down 60%+
              </button>
              <button
                onClick={() => setFlowTrackingFilters(prev => ({ ...prev, showCharts: !prev.showCharts }))}
                style={{
                  padding: '6px 14px',
                  fontSize: '15px',
                  fontWeight: 'bold',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  background: flowTrackingFilters.showCharts
                    ? '#00ffff'
                    : '#000000',
                  color: flowTrackingFilters.showCharts
                    ? '#000000'
                    : '#00ffff',
                  transition: 'all 0.2s',
                  boxShadow: flowTrackingFilters.showCharts
                    ? '0 2px 8px rgba(0, 255, 255, 0.4)'
                    : 'inset 2px 2px 4px rgba(0,0,0,0.8), inset -2px -2px 4px rgba(255,255,255,0.05)'
                }}
              >
                Chart
              </button>
              <button
                onClick={() => setFlowTrackingFilters(prev => ({ ...prev, showWeeklies: !prev.showWeeklies }))}
                style={{
                  padding: '6px 14px',
                  fontSize: '15px',
                  fontWeight: 'bold',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  background: flowTrackingFilters.showWeeklies
                    ? '#00ff00'
                    : '#000000',
                  color: flowTrackingFilters.showWeeklies
                    ? '#000000'
                    : '#00ff00',
                  transition: 'all 0.2s',
                  boxShadow: flowTrackingFilters.showWeeklies
                    ? '0 2px 8px rgba(0, 255, 0, 0.4)'
                    : 'inset 2px 2px 4px rgba(0,0,0,0.8), inset -2px -2px 4px rgba(255,255,255,0.05)'
                }}
              >
                Weeklies
              </button>
            </div>
          </div>
        </div>

        {/* Panel Content with Scrollbar */}
        <div className="overflow-y-auto overflow-x-hidden p-3" style={{ height: 'calc(100vh - 220px)' }}>
          {trackedFlows.length === 0 ? (
            <div className="text-center py-12 text-orange-400">
              <TbStar className="w-16 h-16 text-orange-500 mb-4 mx-auto" />
              <p className="text-lg font-semibold">No flows tracked yet</p>
              <p className="text-sm mt-2">Click the star icon next to any flow to track it</p>
            </div>
          ) : (
            trackedFlows.filter((flow) => {
              const expiry = flow.expiry.replace(/-/g, '').slice(2);
              const strikeFormatted = String(Math.round(flow.strike * 1000)).padStart(8, '0');
              const optionType = flow.type.toLowerCase() === 'call' ? 'C' : 'P';
              const optionTicker = `O:${flow.underlying_ticker}${expiry}${optionType}${strikeFormatted}`;
              const currentPrice = currentOptionPrices[optionTicker];
              const entryPrice = (flow as any).originalPrice || flow.premium_per_contract;

              // Calculate grade for filtering
              let gradeData: any = null;
              if (currentPrice && currentPrice > 0) {
                try {
                  gradeData = calculatePositioningGrade(flow, filteredAndSortedData);
                } catch (error) {
                  // Grade calculation failed - missing data
                  gradeData = null;
                }
              }

              // Grade filter
              if (flowTrackingFilters.gradeFilter !== 'ALL' && gradeData) {
                if (gradeData.grade !== flowTrackingFilters.gradeFilter) return false;
              }

              // Down 60%+ filter
              if (flowTrackingFilters.showDownSixtyPlus && currentPrice && currentPrice > 0) {
                const percentChange = ((currentPrice - entryPrice) / entryPrice) * 100;
                if (percentChange > -60) return false;
              }

              // Weeklies filter (0-7 days)
              if (flowTrackingFilters.showWeeklies) {
                const expiryDate = new Date(flow.expiry);
                const daysToExpiry = Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                if (daysToExpiry > 7) return false;
              }

              return true;
            }).map((flow) => {
              // Get current prices for grading (only these update dynamically)
              const expiry = flow.expiry.replace(/-/g, '').slice(2);
              const strikeFormatted = String(Math.round(flow.strike * 1000)).padStart(8, '0');
              const optionType = flow.type.toLowerCase() === 'call' ? 'C' : 'P';
              const optionTicker = `O:${flow.underlying_ticker}${expiry}${optionType}${strikeFormatted}`;
              const currentPrice = currentOptionPrices[optionTicker];
              // Use original stored price, not current flow data
              const entryPrice = (flow as any).originalPrice || flow.premium_per_contract;

              // Calculate grade if prices available
              let gradeData: any = null;
              if (currentPrice && currentPrice > 0) {
                try {
                  gradeData = calculatePositioningGrade(flow, filteredAndSortedData);
                } catch (error) {
                  // Grade calculation failed - missing data for this ticker
                  console.warn(`Grade calculation failed for ${flow.underlying_ticker}:`, error);
                  gradeData = null;
                }
              }

              // Calculate P&L
              let percentChange = 0;
              let priceHigher = false;
              if (currentPrice && currentPrice > 0) {
                percentChange = ((currentPrice - entryPrice) / entryPrice) * 100;
                priceHigher = currentPrice > entryPrice;
              }

              // Determine P&L color based on fill_style
              let plColor = '#9ca3af'; // default gray
              const fillStyle = flow.fill_style || '';
              if (currentPrice && currentPrice > 0) {
                if (fillStyle === 'A' || fillStyle === 'AA') {
                  plColor = priceHigher ? '#00ff00' : '#ff0000';
                } else if (fillStyle === 'B' || fillStyle === 'BB') {
                  plColor = priceHigher ? '#ff0000' : '#00ff00';
                }
              }

              // Generate flow ID for tracking timeframes
              const flowId = generateFlowId(flow);

              // Calculate swipe offset for this flow
              const isThisFlowSwiped = swipedFlowId === flowId;
              const swipeOffset = isThisFlowSwiped ? Math.min(0, touchCurrent - touchStart) : 0;
              const showDeleteButton = swipeOffset < -50;

              const handleTouchStart = (e: React.TouchEvent) => {
                setSwipedFlowId(flowId);
                setTouchStart(e.touches[0].clientX);
                setTouchCurrent(e.touches[0].clientX);
              };

              const handleTouchMove = (e: React.TouchEvent) => {
                if (swipedFlowId === flowId) {
                  setTouchCurrent(e.touches[0].clientX);
                }
              };

              const handleTouchEnd = () => {
                if (Math.abs(swipeOffset) < 50) {
                  // Snap back if not swiped enough
                  setSwipedFlowId(null);
                  setTouchStart(0);
                  setTouchCurrent(0);
                }
              };

              return (
                <div
                  key={flowId}
                  className="relative overflow-hidden mb-3"
                  style={{
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.6)'
                  }}
                >
                  {/* Delete Button - Revealed on Swipe Left (Mobile Only) */}
                  <div className="md:hidden absolute right-0 top-0 bottom-0 flex items-center justify-center bg-red-600 px-6"
                    style={{
                      width: '100px',
                      transition: 'opacity 0.2s'
                    }}
                  >
                    <button
                      onClick={() => {
                        removeFromFlowTracking(flow);
                        setSwipedFlowId(null);
                        setTouchStart(0);
                        setTouchCurrent(0);
                      }}
                      className="text-white font-bold text-lg"
                    >
                      DELETE
                    </button>
                  </div>

                  {/* Main Content - Swipeable */}
                  <div
                    className="bg-black border border-gray-700 rounded hover:border-gray-600 transition-all duration-200 relative"
                    style={{
                      transform: `translateX(${swipeOffset}px)`,
                      transition: swipedFlowId === flowId && touchCurrent !== touchStart ? 'none' : 'transform 0.3s ease-out'
                    }}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                  >
                    {/* Desktop Delete Button - Top Right */}
                    <button
                      onClick={() => removeFromFlowTracking(flow)}
                      className="hidden md:block absolute top-1 right-1 z-10 text-red-500 hover:text-red-400 transition-colors bg-black/80 rounded-full p-1"
                      title={`Remove from tracking | Added: ${(flow as any).addedAt ? formatTime((flow as any).addedAt) : formatTime(flow.trade_timestamp)}`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>

                    {/* Desktop: All Details in Single Row */}
                    <div className="hidden md:flex items-center justify-between gap-2 p-3" style={{
                      background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0.4) 50%, rgba(255,255,255,0.02) 100%)',
                      borderRadius: '6px',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.3)'
                    }}>
                      <div className="flex items-center gap-2 flex-1 flex-wrap">
                        <span className="text-white font-bold" style={{ fontSize: '17px' }}>{formatTime(flow.trade_timestamp)}</span>
                        <span className="bg-gradient-to-b from-gray-800 to-black text-orange-500 font-bold px-2 py-1 border border-gray-500/70" style={{ fontSize: '17px' }}>
                          {flow.underlying_ticker}
                        </span>
                        <span className={`font-bold ${flow.type === 'call' ? 'text-green-500' : 'text-red-500'}`} style={{ fontSize: '17px' }}>
                          {flow.type.toUpperCase()}
                        </span>
                        <span className="text-white font-semibold" style={{ fontSize: '17px' }}>${flow.strike}</span>
                        <span className="font-bold" style={{ fontSize: '17px' }}>
                          <span className="text-cyan-400">{flow.trade_size.toLocaleString()}</span>
                          <span className="text-yellow-400"> @${entryPrice.toFixed(2)}</span>
                          {fillStyle && (
                            <span className={`ml-1 ${(fillStyle === 'A' || fillStyle === 'AA') ? 'text-green-400' : (fillStyle === 'B' || fillStyle === 'BB') ? 'text-red-400' : 'text-orange-400'}`}>
                              {fillStyle}
                            </span>
                          )}
                        </span>
                        <span className="text-white" style={{ fontSize: '17px' }}>{formatDate(flow.expiry)}</span>
                        <span className="font-bold" style={{ fontSize: '17px', color: '#00ff00' }}>{formatCurrency(flow.total_premium)}</span>

                        {/* Trade Type (Sweep/Block) */}
                        {flow.trade_type && (flow.trade_type === 'SWEEP' || flow.trade_type === 'BLOCK') && (
                          <span className="font-bold" style={{
                            fontSize: '17px',
                            color: flow.trade_type === 'SWEEP' ? '#FFD700' : 'rgba(0, 150, 255, 1)'
                          }}>
                            {flow.trade_type}
                          </span>
                        )}

                        {/* Grade with percentage */}
                        {gradeData && currentPrice && currentPrice > 0 ? (
                          <div className="flex items-center gap-1">
                            <span className="font-bold" style={{
                              fontSize: '17px',
                              color: gradeData.color,
                              border: `2px solid ${gradeData.color}`,
                              borderRadius: '4px',
                              padding: '2px 6px',
                              boxShadow: `0 0 6px ${gradeData.color}40`
                            }}>
                              {gradeData.grade}
                            </span>
                            <span className="font-bold" style={{
                              fontSize: '17px',
                              color: priceHigher ? '#00ff00' : '#ff0000'
                            }}>
                              {priceHigher ? '+' : ''}{percentChange.toFixed(1)}%
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {/* Mobile: 5-Column Table Layout matching main flow table */}
                    <div className="md:hidden">
                      <table className="w-full text-center">
                        <tbody>
                          <tr className="border-b border-gray-700">
                            {/* Column 1: Symbol (Ticker + Time stacked) */}
                            <td className="p-2">
                              <div className="flex flex-col items-center space-y-1">
                                <span className="bg-gradient-to-b from-gray-800 to-black text-orange-500 font-bold px-2 py-1 border border-gray-500/70 text-base">
                                  {flow.underlying_ticker}
                                </span>
                                <span className="text-sm text-gray-300">{formatTime(flow.trade_timestamp)}</span>
                              </div>
                            </td>

                            {/* Column 2: Strike (Strike + Call/Put stacked) */}
                            <td className="p-2">
                              <div className="flex flex-col items-center space-y-1">
                                <span className="text-white font-semibold text-base">${flow.strike}</span>
                                <span className={`font-bold text-sm ${flow.type === 'call' ? 'text-green-500' : 'text-red-500'}`}>
                                  {flow.type.toUpperCase()}
                                </span>
                              </div>
                            </td>

                            {/* Column 3: Size (Size@Price+FillStyle + Total Premium stacked) */}
                            <td className="p-2">
                              <div className="flex flex-col items-center space-y-1">
                                <div className="flex items-center gap-1">
                                  <span className="text-cyan-400 font-bold text-base">{flow.trade_size.toLocaleString()}</span>
                                  <span className="text-yellow-400 text-base">@${entryPrice.toFixed(2)}</span>
                                  {fillStyle && (
                                    <span className={`text-base font-bold ${(fillStyle === 'A' || fillStyle === 'AA') ? 'text-green-400' : (fillStyle === 'B' || fillStyle === 'BB') ? 'text-red-400' : 'text-orange-400'}`}>
                                      {fillStyle}
                                    </span>
                                  )}
                                </div>
                                <span className="font-bold text-sm text-green-400">{formatCurrency(flow.total_premium)}</span>
                              </div>
                            </td>

                            {/* Column 4: Expiry/Type (Expiry + Trade Type stacked) */}
                            <td className="p-2">
                              <div className="flex flex-col items-center space-y-1">
                                <span className="text-white text-sm">{formatDate(flow.expiry)}</span>
                                {flow.trade_type && (flow.trade_type === 'SWEEP' || flow.trade_type === 'BLOCK') && (
                                  <span className="font-bold text-sm" style={{
                                    color: flow.trade_type === 'SWEEP' ? '#FFD700' : 'rgba(0, 150, 255, 1)'
                                  }}>
                                    {flow.trade_type}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Column 5: Grade/P&L (Grade + Percentage stacked) */}
                            <td className="p-2">
                              {gradeData && currentPrice && currentPrice > 0 ? (
                                <div className="flex flex-col items-center space-y-1">
                                  <span className="font-bold text-sm" style={{
                                    color: gradeData.color,
                                    border: `2px solid ${gradeData.color}`,
                                    borderRadius: '4px',
                                    padding: '2px 6px',
                                    boxShadow: `0 0 6px ${gradeData.color}40`
                                  }}>
                                    {gradeData.grade}
                                  </span>
                                  <span className="font-bold text-sm" style={{
                                    color: priceHigher ? '#00ff00' : '#ff0000'
                                  }}>
                                    {priceHigher ? '+' : ''}{percentChange.toFixed(1)}%
                                  </span>
                                </div>
                              ) : (
                                <span className="text-sm text-gray-500">-</span>
                              )}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Stock Chart */}
                    {flowTrackingFilters.showCharts && (() => {
                      const chartData = stockChartData[flowId] || [];

                      if (chartData.length > 0) {
                        const width = 648;
                        const height = 117;
                        const padding = { left: 45, right: 80, top: 10, bottom: 25 };
                        const chartWidth = width - padding.left - padding.right;
                        const chartHeight = height - padding.top - padding.bottom;
                        const prices = chartData.map(d => d.price);
                        const minPrice = Math.min(...prices);
                        const maxPrice = Math.max(...prices);
                        const priceRange = maxPrice - minPrice || 1;

                        const points = chartData.map((point, i) => {
                          const x = padding.left + (i / (chartData.length - 1)) * chartWidth;
                          const y = padding.top + chartHeight - ((point.price - minPrice) / priceRange) * chartHeight;
                          return `${x.toFixed(2)},${y.toFixed(2)}`;
                        }).join(' ');

                        const currentPrice = prices[prices.length - 1];
                        const prevClose = (flow as any).originalStockPrice || flow.spot_price;
                        const change = currentPrice - prevClose;
                        const changePercent = (change / prevClose) * 100;
                        const isUp = change >= 0;

                        const tradeTimestamp = new Date(flow.trade_timestamp).getTime();
                        const firstTimestamp = chartData[0].timestamp;
                        const lastTimestamp = chartData[chartData.length - 1].timestamp;
                        const tradePosition = padding.left + ((tradeTimestamp - firstTimestamp) / (lastTimestamp - firstTimestamp)) * chartWidth;
                        const tradeLineColor = '#9b59b6';

                        const isMarketHours = (timestamp: number) => {
                          const date = new Date(timestamp);
                          const hours = date.getUTCHours() - 5;
                          const minutes = date.getUTCMinutes();
                          const totalMinutes = hours * 60 + minutes;
                          const marketOpen = 9 * 60 + 30;
                          const marketClose = 16 * 60;
                          return totalMinutes >= marketOpen && totalMinutes < marketClose;
                        };

                        const flowId = generateFlowId(flow);
                        const stockTimeframe = flowChartTimeframes[flowId]?.stock || '1D';

                        const shadingRects = stockTimeframe === '1D' ? chartData.map((point, i) => {
                          const x = padding.left + (i / (chartData.length - 1)) * chartWidth;
                          const nextX = i < chartData.length - 1 ? (padding.left + ((i + 1) / (chartData.length - 1)) * chartWidth) : (padding.left + chartWidth);
                          const rectWidth = nextX - x;
                          const isMarket = isMarketHours(point.timestamp);

                          if (!isMarket) {
                            return (
                              <rect
                                key={`shade-${i}`}
                                x={x}
                                y={padding.top}
                                width={rectWidth}
                                height={chartHeight}
                                fill="#555555"
                                opacity="0.15"
                              />
                            );
                          }
                          return null;
                        }) : [];

                        // Y-axis labels
                        const yAxisTicks = 3;
                        const yLabels = [];
                        for (let i = 0; i <= yAxisTicks; i++) {
                          const price = minPrice + (priceRange * i / yAxisTicks);
                          const y = padding.top + chartHeight - (i * chartHeight / yAxisTicks);
                          yLabels.push(
                            <text key={`y-${i}`} x={padding.left - 5} y={y + 4} textAnchor="end" fill="#ffffff" fontSize="11" fontWeight="bold">
                              ${price.toFixed(2)}
                            </text>
                          );
                        }

                        // X-axis labels
                        const xAxisTicks = 3;
                        const xLabels = [];
                        for (let i = 0; i <= xAxisTicks; i++) {
                          const dataIndex = Math.floor((chartData.length - 1) * i / xAxisTicks);
                          const timestamp = chartData[dataIndex].timestamp;
                          const date = new Date(timestamp);
                          const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
                          const x = padding.left + (i * chartWidth / xAxisTicks);
                          xLabels.push(
                            <text key={`x-${i}`} x={x} y={height - 5} textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="bold">
                              {timeStr}
                            </text>
                          );
                        }

                        return (
                          <div className="border-t border-gray-700 pt-3 mt-3">
                            <div className="relative mb-2">
                              <div className="text-center text-sm text-orange-400 font-bold" style={{ fontSize: '15px' }}>Stock</div>
                              <div className="absolute right-0 top-0 flex gap-1">
                                <button
                                  onClick={() => {
                                    setFlowChartTimeframes(prev => ({
                                      ...prev,
                                      [flowId]: { ...prev[flowId], stock: '1D' }
                                    }));
                                    fetchStockChartDataForFlow(flowId, flow.underlying_ticker, '1D');
                                  }}
                                  className={`px-2 py-1 text-xs font-bold rounded transition-colors ${stockTimeframe === '1D' ? 'bg-orange-500 text-black' : 'bg-gray-800 text-orange-400 hover:bg-gray-700'
                                    }`}
                                >
                                  1D
                                </button>
                                <button
                                  onClick={() => {
                                    setFlowChartTimeframes(prev => ({
                                      ...prev,
                                      [flowId]: { ...prev[flowId], stock: '1W' }
                                    }));
                                    fetchStockChartDataForFlow(flowId, flow.underlying_ticker, '1W');
                                  }}
                                  className={`px-2 py-1 text-xs font-bold rounded transition-colors ${stockTimeframe === '1W' ? 'bg-orange-500 text-black' : 'bg-gray-800 text-orange-400 hover:bg-gray-700'
                                    }`}
                                >
                                  1W
                                </button>
                                <button
                                  onClick={() => {
                                    setFlowChartTimeframes(prev => ({
                                      ...prev,
                                      [flowId]: { ...prev[flowId], stock: '1M' }
                                    }));
                                    fetchStockChartDataForFlow(flowId, flow.underlying_ticker, '1M');
                                  }}
                                  className={`px-2 py-1 text-xs font-bold rounded transition-colors ${stockTimeframe === '1M' ? 'bg-orange-500 text-black' : 'bg-gray-800 text-orange-400 hover:bg-gray-700'
                                    }`}
                                >
                                  1M
                                </button>
                              </div>
                            </div>
                            <div className="flex flex-col items-center space-y-1">
                              <svg width={width} height={height} className="overflow-visible">
                                {/* Axis lines */}
                                <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + chartHeight} stroke="#444" strokeWidth="1" />
                                <line x1={padding.left} y1={padding.top + chartHeight} x2={padding.left + chartWidth} y2={padding.top + chartHeight} stroke="#444" strokeWidth="1" />
                                {/* Y-axis labels */}
                                {yLabels}
                                {/* X-axis labels */}
                                {xLabels}
                                {shadingRects}
                                {(() => {
                                  const prevY = padding.top + chartHeight - ((prevClose - minPrice) / priceRange) * chartHeight;
                                  return (
                                    <line
                                      x1={padding.left}
                                      y1={prevY}
                                      x2={padding.left + chartWidth}
                                      y2={prevY}
                                      stroke="#444444"
                                      strokeWidth="1"
                                      strokeDasharray="3,2"
                                      opacity="0.4"
                                    />
                                  );
                                })()}
                                {tradePosition >= padding.left && tradePosition <= (padding.left + chartWidth) && (
                                  <line
                                    x1={tradePosition}
                                    y1={padding.top}
                                    x2={tradePosition}
                                    y2={padding.top + chartHeight}
                                    stroke={tradeLineColor}
                                    strokeWidth="1.5"
                                    strokeDasharray="4,3"
                                    opacity="1"
                                  />
                                )}
                                <polyline
                                  fill="none"
                                  stroke={isUp ? '#00ff00' : '#ff0000'}
                                  strokeWidth="2"
                                  points={points}
                                  opacity="0.25"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                                <polyline
                                  fill="none"
                                  stroke={isUp ? '#00ff00' : '#ff0000'}
                                  strokeWidth="1.5"
                                  points={points}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                                {/* Current price label on right Y-axis */}
                                <text
                                  x={padding.left + chartWidth + 10}
                                  y={padding.top + chartHeight - ((currentPrice - minPrice) / priceRange) * chartHeight + 4}
                                  textAnchor="start"
                                  fill={isUp ? '#00ff00' : '#ff0000'}
                                  fontSize="18"
                                  fontWeight="bold"
                                >
                                  ${currentPrice.toFixed(2)}
                                </text>
                                {/* Percentage change label on right Y-axis */}
                                <text
                                  x={padding.left + chartWidth + 10}
                                  y={padding.top + chartHeight - ((currentPrice - minPrice) / priceRange) * chartHeight + 18}
                                  textAnchor="start"
                                  fill={isUp ? '#00ff00' : '#ff0000'}
                                  fontSize="16.5"
                                  fontWeight="bold"
                                >
                                  {isUp ? '+' : ''}{changePercent.toFixed(2)}%
                                </text>
                              </svg>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {/* Options Premium Chart */}
                    {flowTrackingFilters.showCharts && (() => {
                      const expiry = flow.expiry.replace(/-/g, '').slice(2);
                      const strikeFormatted = String(Math.round(flow.strike * 1000)).padStart(8, '0');
                      const optionType = flow.type.toLowerCase() === 'call' ? 'C' : 'P';
                      const optionTicker = `O:${flow.underlying_ticker}${expiry}${optionType}${strikeFormatted}`;
                      const premiumData = optionsPremiumData[flowId] || [];

                      if (premiumData.length > 0) {
                        const width = 648;
                        const height = 117;
                        const padding = { left: 45, right: 80, top: 10, bottom: 25 };
                        const chartWidth = width - padding.left - padding.right;
                        const chartHeight = height - padding.top - padding.bottom;
                        const prices = premiumData.map(d => d.price);
                        const minPrice = Math.min(...prices);
                        const maxPrice = Math.max(...prices);
                        const priceRange = maxPrice - minPrice || 1;

                        const points = premiumData.map((point, i) => {
                          const x = padding.left + (i / (premiumData.length - 1)) * chartWidth;
                          const y = padding.top + chartHeight - ((point.price - minPrice) / priceRange) * chartHeight;
                          return `${x.toFixed(2)},${y.toFixed(2)}`;
                        }).join(' ');

                        const currentPrice = prices[prices.length - 1];
                        const entryPrice = (flow as any).originalPrice || flow.premium_per_contract;
                        const change = currentPrice - entryPrice;
                        const changePercent = (change / entryPrice) * 100;
                        const isUp = change >= 0;

                        const tradeTimestamp = new Date(flow.trade_timestamp).getTime();
                        const firstTimestamp = premiumData[0].timestamp;
                        const lastTimestamp = premiumData[premiumData.length - 1].timestamp;
                        const tradePosition = padding.left + ((tradeTimestamp - firstTimestamp) / (lastTimestamp - firstTimestamp)) * chartWidth;
                        const tradeLineColor = '#9b59b6';

                        const areaPoints = `${padding.left},${padding.top + chartHeight} ${points} ${padding.left + chartWidth},${padding.top + chartHeight}`;
                        const areaPath = `M ${areaPoints} Z`;

                        // Y-axis labels
                        const yAxisTicks = 3;
                        const yLabels = [];
                        for (let i = 0; i <= yAxisTicks; i++) {
                          const price = minPrice + (priceRange * i / yAxisTicks);
                          const y = padding.top + chartHeight - (i * chartHeight / yAxisTicks);
                          yLabels.push(
                            <text key={`y-${i}`} x={padding.left - 5} y={y + 4} textAnchor="end" fill="#ffffff" fontSize="11" fontWeight="bold">
                              ${price.toFixed(2)}
                            </text>
                          );
                        }

                        // X-axis labels
                        const xAxisTicks = 3;
                        const xLabels = [];
                        for (let i = 0; i <= xAxisTicks; i++) {
                          const dataIndex = Math.floor((premiumData.length - 1) * i / xAxisTicks);
                          const timestamp = premiumData[dataIndex].timestamp;
                          const date = new Date(timestamp);
                          const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
                          const x = padding.left + (i * chartWidth / xAxisTicks);
                          xLabels.push(
                            <text key={`x-${i}`} x={x} y={height - 5} textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="bold">
                              {timeStr}
                            </text>
                          );
                        }

                        const optionTimeframe = flowChartTimeframes[flowId]?.option || '1D';

                        return (
                          <div className="border-t border-gray-700 pt-3 mt-3">
                            <div className="relative mb-2">
                              <div className="text-center text-sm text-cyan-400 font-bold" style={{ fontSize: '15px' }}>Contract</div>
                              <div className="absolute right-0 top-0 flex gap-1">
                                <button
                                  onClick={() => {
                                    setFlowChartTimeframes(prev => ({
                                      ...prev,
                                      [flowId]: { ...prev[flowId], option: '1D' }
                                    }));
                                    fetchOptionPremiumDataForFlow(flowId, flow, '1D');
                                  }}
                                  className={`px-2 py-1 text-xs font-bold rounded transition-colors ${optionTimeframe === '1D' ? 'bg-cyan-500 text-black' : 'bg-gray-800 text-cyan-400 hover:bg-gray-700'
                                    }`}
                                >
                                  1D
                                </button>
                                <button
                                  onClick={() => {
                                    setFlowChartTimeframes(prev => ({
                                      ...prev,
                                      [flowId]: { ...prev[flowId], option: '1W' }
                                    }));
                                    fetchOptionPremiumDataForFlow(flowId, flow, '1W');
                                  }}
                                  className={`px-2 py-1 text-xs font-bold rounded transition-colors ${optionTimeframe === '1W' ? 'bg-cyan-500 text-black' : 'bg-gray-800 text-cyan-400 hover:bg-gray-700'
                                    }`}
                                >
                                  1W
                                </button>
                                <button
                                  onClick={() => {
                                    setFlowChartTimeframes(prev => ({
                                      ...prev,
                                      [flowId]: { ...prev[flowId], option: '1M' }
                                    }));
                                    fetchOptionPremiumDataForFlow(flowId, flow, '1M');
                                  }}
                                  className={`px-2 py-1 text-xs font-bold rounded transition-colors ${optionTimeframe === '1M' ? 'bg-cyan-500 text-black' : 'bg-gray-800 text-cyan-400 hover:bg-gray-700'
                                    }`}
                                >
                                  1M
                                </button>
                              </div>
                            </div>
                            <div className="flex flex-col items-center space-y-1">
                              <svg width={width} height={height} className="overflow-visible">
                                {/* Axis lines */}
                                <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + chartHeight} stroke="#444" strokeWidth="1" />
                                <line x1={padding.left} y1={padding.top + chartHeight} x2={padding.left + chartWidth} y2={padding.top + chartHeight} stroke="#444" strokeWidth="1" />
                                {/* Y-axis labels */}
                                {yLabels}
                                {/* X-axis labels */}
                                {xLabels}
                                <path
                                  d={areaPath}
                                  fill={isUp ? 'rgba(0, 255, 136, 0.15)' : 'rgba(255, 68, 102, 0.15)'}
                                />
                                {(() => {
                                  const entryY = padding.top + chartHeight - ((entryPrice - minPrice) / priceRange) * chartHeight;
                                  return (
                                    <line
                                      x1={padding.left}
                                      y1={entryY}
                                      x2={padding.left + chartWidth}
                                      y2={entryY}
                                      stroke="#ffaa00"
                                      strokeWidth="1"
                                      strokeDasharray="3,2"
                                      opacity="0.5"
                                    />
                                  );
                                })()}
                                {tradePosition >= padding.left && tradePosition <= (padding.left + chartWidth) && (
                                  <line
                                    x1={tradePosition}
                                    y1={padding.top}
                                    x2={tradePosition}
                                    y2={padding.top + chartHeight}
                                    stroke={tradeLineColor}
                                    strokeWidth="1.5"
                                    strokeDasharray="4,3"
                                    opacity="1"
                                  />
                                )}
                                <polyline
                                  fill="none"
                                  stroke={isUp ? '#00ff88' : '#ff4466'}
                                  strokeWidth="2"
                                  points={points}
                                  opacity="0.25"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                                <polyline
                                  fill="none"
                                  stroke={isUp ? '#00ff88' : '#ff4466'}
                                  strokeWidth="1.5"
                                  points={points}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                                {/* Current price label on right Y-axis */}
                                <text
                                  x={padding.left + chartWidth + 10}
                                  y={padding.top + chartHeight - ((currentPrice - minPrice) / priceRange) * chartHeight + 4}
                                  textAnchor="start"
                                  fill={isUp ? '#00ff88' : '#ff4466'}
                                  fontSize="18"
                                  fontWeight="bold"
                                >
                                  ${currentPrice.toFixed(2)}
                                </text>
                                {/* Percentage change label on right Y-axis */}
                                <text
                                  x={padding.left + chartWidth + 10}
                                  y={padding.top + chartHeight - ((currentPrice - minPrice) / priceRange) * chartHeight + 18}
                                  textAnchor="start"
                                  fill={isUp ? '#00ff88' : '#ff4466'}
                                  fontSize="16.5"
                                  fontWeight="bold"
                                >
                                  {isUp ? '+' : ''}{changePercent.toFixed(2)}%
                                </text>
                              </svg>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
};
