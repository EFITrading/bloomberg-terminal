'use client';

import React, { useState, useEffect, useRef } from 'react';
import { OptionsFlowTable } from '@/components/OptionsFlowTable';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Polygon API key
const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

// ≡ƒÜÇ COMBINED ENRICHMENT - Vol/OI + Fill Style in ONE API call
const enrichTradeDataCombined = async (
  trades: OptionsFlowData[],
  updateCallback: (results: OptionsFlowData[]) => void
): Promise<OptionsFlowData[]> => {
  if (trades.length === 0) return trades;

  const BATCH_SIZE = 500; // Massive batch size for maximum throughput
  const BATCH_DELAY = 0; // Zero delay
  const REQUEST_DELAY = 0; // Zero stagger - full parallel blast
  const batches = [];

  for (let i = 0; i < trades.length; i += BATCH_SIZE) {
    batches.push(trades.slice(i, i + BATCH_SIZE));
  }

  console.log(`≡ƒÜÇ COMBINED ENRICHMENT: ${trades.length} trades in ${batches.length} batches`);

  const allResults: OptionsFlowData[] = [];
  let successCount = 0;
  let failCount = 0;

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];

    if (batchIndex % 20 === 0) { // Log every 20th batch instead of every 10th
      console.log(`≡ƒôª Batch ${batchIndex + 1}/${batches.length} (${Math.round((batchIndex / batches.length) * 100)}%)`);
    }

    const batchResults = await Promise.all(
      batch.map(async (trade) => {
        // No delay - maximum parallel execution

        try {
          const expiry = trade.expiry.replace(/-/g, '').slice(2);
          const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0');
          const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P';
          const optionTicker = `O:${trade.underlying_ticker}${expiry}${optionType}${strikeFormatted}`;

          // Use snapshot endpoint - gets EVERYTHING in one call (quotes, greeks, Vol/OI)
          const snapshotUrl = `https://api.polygon.io/v3/snapshot/options/${trade.underlying_ticker}/${optionTicker}?apikey=${POLYGON_API_KEY}`;

          const response = await fetch(snapshotUrl, {
            signal: AbortSignal.timeout(2000), // Faster timeout
            keepalive: true,
            priority: 'high' // Browser prioritization hint
          } as RequestInit);

          if (!response.ok) {
            failCount++;
            return { ...trade, fill_style: 'N/A' as const, volume: 0, open_interest: 0 };
          }

          const data = await response.json();

          if (data.results) {
            const result = data.results;

            // Extract Vol/OI
            const volume = result.day?.volume || 0;
            const openInterest = result.open_interest || 0;

            successCount++;

            // Extract fill style from last quote
            let fillStyle: 'A' | 'B' | 'AA' | 'BB' | 'N/A' = 'N/A';
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

          failCount++;
          return { ...trade, fill_style: 'N/A' as const, volume: 0, open_interest: 0 };
        } catch (error) {
          failCount++;
          return { ...trade, fill_style: 'N/A' as const, volume: 0, open_interest: 0 };
        }
      })
    );

    allResults.push(...batchResults);
    updateCallback([...allResults]);

    // No delay - process at maximum speed
  }

  console.log(`Γ£à Combined enrichment complete: ${allResults.length} trades (${successCount} success, ${failCount} failed)`);
  return allResults;
};

// OLD SEPARATE FUNCTIONS - DEPRECATED (keeping for backwards compatibility)
const fetchVolumeAndOpenInterest = async (trades: OptionsFlowData[]): Promise<OptionsFlowData[]> => {
  console.log(`≡ƒöì Fetching volume/OI data for ${trades.length} trades`);

  // Group trades by underlying ticker to minimize API calls
  const tradesByUnderlying = trades.reduce((acc, trade) => {
    const underlying = trade.underlying_ticker;
    if (!acc[underlying]) {
      acc[underlying] = [];
    }
    acc[underlying].push(trade);
    return acc;
  }, {} as Record<string, OptionsFlowData[]>);

  const updatedTrades: OptionsFlowData[] = [];

  // Process each underlying separately
  for (const [underlying, underlyingTrades] of Object.entries(tradesByUnderlying)) {
    try {
      console.log(`≡ƒôè Fetching option chain for ${underlying} (${underlyingTrades.length} trades)`);

      // Get unique expiration dates
      const uniqueExpirations = [...new Set(underlyingTrades.map(t => t.expiry))];

      let allContracts = new Map();

      // Fetch data for each expiration date
      for (const expiry of uniqueExpirations) {
        const expiryParam = expiry.includes('T') ? expiry.split('T')[0] : expiry;

        const response = await fetch(
          `https://api.polygon.io/v3/snapshot/options/${underlying}?expiration_date=${expiryParam}&limit=250&apikey=${POLYGON_API_KEY}`
        );

        if (response.ok) {
          const chainData = await response.json();
          if (chainData.results) {
            chainData.results.forEach((contract: any) => {
              if (contract.details && contract.details.ticker) {
                allContracts.set(contract.details.ticker, {
                  volume: contract.day?.volume || 0,
                  open_interest: contract.open_interest || 0
                });
              }
            });
          }
        }
      }

      console.log(`Γ£à Total contracts loaded for ${underlying}: ${allContracts.size}`);

      if (allContracts.size === 0) {
        updatedTrades.push(...underlyingTrades.map(trade => ({
          ...trade,
          volume: 0,
          open_interest: 0
        })));
        continue;
      }

      const contractLookup = allContracts;

      // Match trades to contracts
      for (const trade of underlyingTrades) {
        const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P';

        let expiryDate;
        if (trade.expiry.includes('T')) {
          expiryDate = new Date(trade.expiry);
        } else {
          const [year, month, day] = trade.expiry.split('-').map(Number);
          expiryDate = new Date(year, month - 1, day);
        }

        const formattedExpiry = `${expiryDate.getFullYear().toString().slice(-2)}${(expiryDate.getMonth() + 1).toString().padStart(2, '0')}${expiryDate.getDate().toString().padStart(2, '0')}`;
        const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0');
        const optionTicker = `O:${trade.underlying_ticker}${formattedExpiry}${optionType}${strikeFormatted}`;

        const contractData = contractLookup.get(optionTicker);

        if (contractData) {
          updatedTrades.push({
            ...trade,
            volume: contractData.volume,
            open_interest: contractData.open_interest
          });
        } else {
          updatedTrades.push({
            ...trade,
            volume: 0,
            open_interest: 0
          });
        }
      }

    } catch (error) {
      console.error(`Error fetching data for ${underlying}:`, error);
      updatedTrades.push(...underlyingTrades.map(trade => ({
        ...trade,
        volume: 0,
        open_interest: 0
      })));
    }
  }

  return updatedTrades;
};

// FILL STYLE ENRICHMENT - Same as AlgoFlow
const analyzeBidAskExecution = async (trades: OptionsFlowData[]): Promise<OptionsFlowData[]> => {
  console.log(`ΓÜí FILL STYLE ANALYSIS: Fetching quotes for ${trades.length} trades`);

  if (trades.length === 0) return trades;

  const tradesWithFillStyle: OptionsFlowData[] = [];
  const BATCH_SIZE = 20;

  for (let i = 0; i < trades.length; i += BATCH_SIZE) {
    const batch = trades.slice(i, i + BATCH_SIZE);

    const batchPromises = batch.map(async (trade) => {
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
            let fillStyle: 'A' | 'B' | 'AA' | 'BB' | 'N/A' = 'N/A';
            const midpoint = (bid + ask) / 2;

            if (fillPrice > ask) {
              fillStyle = 'AA';
            } else if (fillPrice < bid) {
              fillStyle = 'BB';
            } else if (fillPrice >= midpoint) {
              fillStyle = 'A';
            } else {
              fillStyle = 'B';
            }

            return { ...trade, fill_style: fillStyle };
          }
        }

        return { ...trade, fill_style: 'N/A' as const };
      } catch (error) {
        return { ...trade, fill_style: 'N/A' as const };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    tradesWithFillStyle.push(...batchResults);
  }

  return tradesWithFillStyle;
};

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
  fill_style?: 'A' | 'B' | 'AA' | 'BB' | 'N/A';
  volume?: number;
  open_interest?: number;
  vol_oi_ratio?: number;
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

export default function OptionsFlowPage() {
  const [data, setData] = useState<OptionsFlowData[]>([]);
  const [summary, setSummary] = useState<OptionsFlowSummary>({
    total_trades: 0,
    total_premium: 0,
    unique_symbols: 0,
    trade_types: { BLOCK: 0, SWEEP: 0, MINI: 0, 'MULTI-LEG': 0 },
    call_put_ratio: { calls: 0, puts: 0 },
    processing_time_ms: 0
  });
  const [marketInfo, setMarketInfo] = useState<MarketInfo>({
    status: 'LIVE',
    is_live: true,
    data_date: new Date().toISOString().split('T')[0],
    market_open: true
  });
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [selectedTicker, setSelectedTicker] = useState('');
  const [streamingStatus, setStreamingStatus] = useState<string>('');
  const [streamingProgress, setStreamingProgress] = useState<{ current: number, total: number } | null>(null);
  const [streamError, setStreamError] = useState<string>('');
  const [retryCount, setRetryCount] = useState<number>(0);
  const [isStreamComplete, setIsStreamComplete] = useState<boolean>(false);
  const [memoryUsage, setMemoryUsage] = useState<{ used: number; total: number }>({ used: 0, total: 0 });
  const [memoryStats, setMemoryStats] = useState<{ min: number; max: number; lastValue: number }>({ min: 0, max: 0, lastValue: 0 });
  const tradeBufferRef = useRef<OptionsFlowData[]>([]);

  // Memory tracking during scans
  useEffect(() => {
    let memoryInterval: NodeJS.Timeout | null = null;

    const updateMemory = () => {
      const perf = performance as any;
      if (perf.memory && perf.memory.usedJSHeapSize > 0) {
        const used = Math.round(perf.memory.usedJSHeapSize / 1024 / 1024);
        const total = Math.round(perf.memory.jsHeapSizeLimit / 1024 / 1024);
        setMemoryUsage({ used, total });
        
        if (loading) {
          // Track min/max
          setMemoryStats(prev => {
            const newMin = prev.min === 0 ? used : Math.min(prev.min, used);
            const newMax = Math.max(prev.max, used);
            const spike = prev.lastValue > 0 ? used - prev.lastValue : 0;
            
            // Detect abnormal memory spike (>100MB jump in 1 second)
            if (spike > 100) {
              console.warn(`[MEMORY SPIKE] +${spike}MB in 1s! (${prev.lastValue}MB → ${used}MB)`);
            }
            
            // Detect high memory usage (>80% of limit)
            const percentUsed = (used / total) * 100;
            if (percentUsed > 80) {
              console.error(`[MEMORY WARNING] ${percentUsed.toFixed(1)}% used (${used}MB/${total}MB) - approaching limit!`);
            }
            
            console.log(`[MEMORY] ${used}MB/${total}MB | ${data.length} trades | Range: ${newMin}-${newMax}MB`);
            
            return { min: newMin, max: newMax, lastValue: used };
          });
        }
      }
    };

    if (loading) {
      // Reset stats on scan start
      setMemoryStats({ min: 0, max: 0, lastValue: 0 });
      updateMemory();
      memoryInterval = setInterval(updateMemory, 1000);
    } else {
      updateMemory();
    }

    return () => {
      if (memoryInterval) clearInterval(memoryInterval);
    };
  }, [loading, data.length]);

  // Live options flow fetch
  const fetchOptionsFlowStreaming = async (currentRetry: number = 0, tickerOverride?: string) => {
    setLoading(true);
    setStreamError('');
    tradeBufferRef.current = []; // Clear buffer for new scan

    let connectionTimeout: NodeJS.Timeout | null = null;

    try {
      console.log(` Fetching live streaming options flow data...`);
      // Keep existing trades and add new ones as they stream in

    } catch (dbError) {
      console.warn('Error checking database, proceeding with streaming:', dbError);
      // Keep existing data on error
    }

    try {
      // Map scan categories to appropriate ticker parameter
      let tickerParam = tickerOverride || selectedTicker;

      if (tickerParam === 'MAG7') {
        tickerParam = 'AAPL,NVDA,MSFT,TSLA,AMZN,META,GOOGL,GOOG';
      } else if (tickerParam === 'ETF') {
        tickerParam = 'SPY,QQQ,DIA,IWM,XLK,SMH,XLE,XLF,XLV,XLI,XLP,XLU,XLY,XLB,XLRE,XLC,GLD,SLV,TLT,HYG,LQD,EEM,EFA,VXX,UVXY';
      } else if (tickerParam === 'ALL') {
        tickerParam = 'ALL_EXCLUDE_ETF_MAG7'; // Special flag for backend
      }
      // Otherwise use the ticker as-is for individual ticker searches

      console.log(`[DEBUG] tickerOverride=${tickerOverride}, selectedTicker=${selectedTicker}, tickerParam=${tickerParam}`);
      
      // Skip enrichment for MAG7 and ETF scans (too many trades, causes OOM)
      const skipEnrichment = (tickerOverride === 'MAG7' || tickerOverride === 'ETF');
      const url = `/api/stream-options-flow?ticker=${encodeURIComponent(tickerParam)}${skipEnrichment ? '&skipEnrichment=true' : ''}`;
      
      console.log(`[DEBUG] Creating EventSource with URL: ${url}`);

      const scanStartTime = performance.now();
      const eventSource = new EventSource(url);

      eventSource.onmessage = (event) => {
        try {
          const streamData = JSON.parse(event.data);

          switch (streamData.type) {
            case 'connected':
              console.log(`[SCAN START] ${tickerParam}`);
              setStreamingStatus('Connected - scanning options flow...');
              setStreamError('');
              break;

            case 'status':
              setStreamingStatus(streamData.message);
              break;

            case 'trades':
              // Buffer trades without rendering to prevent UI freeze
              if (streamData.trades && streamData.trades.length > 0) {
                // Add to buffer, don't update UI
                tradeBufferRef.current.push(...(streamData.trades as OptionsFlowData[]));
                const bufferSize = tradeBufferRef.current.length;
                console.log(`[BUFFERED] +${streamData.trades.length} | Buffer: ${bufferSize} trades | Mem: ${memoryUsage.used}MB/${memoryUsage.total}MB`);
              }

              setStreamingStatus(streamData.status);
              if (streamData.progress) {
                setStreamingProgress({
                  current: streamData.progress.current,
                  total: streamData.progress.total
                });
              }
              break;

            case 'complete':
              setIsStreamComplete(true);
              const scanDuration = ((performance.now() - scanStartTime) / 1000).toFixed(2);
              eventSource.close();
              
              // Merge buffered trades with final complete trades
              const bufferedTrades = tradeBufferRef.current;
              const completeTrades = streamData.trades || [];
              const allTrades = [...bufferedTrades, ...completeTrades];
              
              // Clear buffer
              tradeBufferRef.current = [];
              
              const perf = performance as any;
              const finalMemMB = perf.memory && perf.memory.usedJSHeapSize > 0 
                ? Math.round(perf.memory.usedJSHeapSize / 1024 / 1024) 
                : 0;
              
              // Log final summary with memory stats
              const memoryRange = memoryStats.min > 0 && memoryStats.max > 0 
                ? ` | Mem: ${memoryStats.min}-${memoryStats.max}MB (Δ${memoryStats.max - memoryStats.min}MB)`
                : (finalMemMB > 0 ? ` | ${finalMemMB}MB` : '');
              
              console.log(`[COMPLETE] ${streamData.summary.total_trades} trades (${bufferedTrades.length} buffered + ${completeTrades.length} final) | ${scanDuration}s | $${(streamData.summary.total_premium / 1000000).toFixed(1)}M${memoryRange}`);
              
              // Detailed memory summary
              if (memoryStats.min > 0) {
                const memoryDelta = memoryStats.max - memoryStats.min;
                const avgPerTrade = streamData.summary.total_trades > 0 
                  ? Math.round((memoryDelta * 1024) / streamData.summary.total_trades) 
                  : 0;
                console.log(`[MEMORY SUMMARY] Range: ${memoryStats.min}MB → ${memoryStats.max}MB | Growth: ${memoryDelta}MB | ~${avgPerTrade}KB/trade`);
              }

              // Update summary/market info
              setSummary(streamData.summary);
              if (streamData.market_info) {
                setMarketInfo(streamData.market_info);
              }
              setLastUpdate(new Date().toLocaleString());
              setLoading(false);
              setStreamingProgress(null);
              setStreamError('');
              setRetryCount(0);

              // ACCUMULATE trades - don't replace, add new ones to existing
              if (allTrades.length > 0) {
                setData(prevData => {
                  const existingTradeIds = new Set(
                    prevData.map((trade: OptionsFlowData) => `${trade.ticker}-${trade.trade_timestamp}-${trade.strike}`)
                  );
                  const newTrades = allTrades.filter((trade: OptionsFlowData) => {
                    const tradeId = `${trade.ticker}-${trade.trade_timestamp}-${trade.strike}`;
                    return !existingTradeIds.has(tradeId);
                  });
                  const updatedTrades = [...prevData, ...newTrades];
                  setStreamingStatus('');
                  return updatedTrades;
                });
              } else {
                setStreamingStatus('');
              }

              break;

            case 'error':
              console.error('[STREAM ERROR]', streamData.error);
              console.error(`[ERROR CONTEXT] Trades: ${data.length} | Memory: ${memoryUsage.used}MB/${memoryUsage.total}MB | Range: ${memoryStats.min}-${memoryStats.max}MB`);
              setStreamError(streamData.error || 'Stream error occurred');
              setLoading(false);
              eventSource.close();
              break;

            case 'close':
              // Server is gracefully closing the connection
              console.log(' Stream closed by server:', streamData.message);
              setIsStreamComplete(true);
              eventSource.close();
              break;

            case 'heartbeat':
              // Keep-alive ping, no action needed (suppress logs to reduce noise)
              break;
          }
        } catch (parseError) {
          console.error('Error parsing stream data:', parseError);
        }
      };

      eventSource.onerror = (error) => {
        // Clear connection timeout
        if (connectionTimeout) {
          clearTimeout(connectionTimeout);
          connectionTimeout = null;
        }

        if (isStreamComplete) {
          eventSource.close();
          return;
        }

        const elapsedTime = ((performance.now() - scanStartTime) / 1000).toFixed(2);

        if (eventSource.readyState === 2) {
          eventSource.close();
          setStreamingStatus('');
          setLoading(false);
          return;
        }

        if (eventSource.readyState === 0) {
          console.error(`[ERROR] Connection failed | ${elapsedTime}s | Mem: ${memoryUsage.used}MB/${memoryUsage.total}MB`);
          
          // Memory diagnostics
          if (memoryStats.max > 0) {
            console.error(`[ERROR DIAGNOSTICS] Memory range: ${memoryStats.min}MB → ${memoryStats.max}MB | Peak: ${memoryStats.max}MB | Trades: ${data.length}`);
            const percentUsed = (memoryStats.max / memoryUsage.total) * 100;
            if (percentUsed > 70) {
              console.error(`[POSSIBLE CAUSE] High memory usage detected (${percentUsed.toFixed(1)}%) - may have triggered serverless function limit`);
            }
          }
          
          eventSource.close();
          setStreamError('EventSource connection failed during initial connection');
          setStreamingStatus('');
          setLoading(false);
          return;
        }

        eventSource.close();
        setStreamingStatus('');
        setLoading(false);
      };

    } catch (error) {
      console.error('Error starting stream:', error);
      setLoading(false);
      // Fallback to regular API
      fetchOptionsFlow();
    }
  };

  const fetchOptionsFlow = async () => {
    setLoading(true);
    setStreamError('');
    try {
      console.log(`≡ƒôè Fetching live options flow data...`);

      // Map scan categories to appropriate ticker parameter
      let tickerParam = selectedTicker;
      if (selectedTicker === 'MAG7') {
        tickerParam = 'AAPL,NVDA,MSFT,TSLA,AMZN,META,GOOGL,GOOG';
      } else if (selectedTicker === 'ETF') {
        tickerParam = 'SPY,QQQ,DIA,IWM,XLK,SMH,XLE,XLF,XLV,XLI,XLP,XLU,XLY,XLB,XLRE,XLC,GLD,SLV,TLT,HYG,LQD,EEM,EFA,VXX,UVXY';
      } else if (selectedTicker === 'ALL') {
        tickerParam = 'ALL_EXCLUDE_ETF_MAG7';
      }
      // Otherwise use the ticker as-is for individual ticker searches

      // Fetch fresh live data only
      const response = await fetch(`/api/live-options-flow?ticker=${tickerParam}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error || `HTTP error! status: ${response.status}`;
        const suggestion = errorData.suggestion || '';
        throw new Error(`${errorMsg}${suggestion ? ' - ' + suggestion : ''}`);
      }

      const result = await response.json();

      if (result.success) {
        const trades = result.trades || result.data || [];
        setData(trades);
        setSummary(result.summary);
        if (result.market_info) {
          setMarketInfo(result.market_info);
        }
        setLastUpdate(new Date().toLocaleString());

        console.log(` Options Flow Update: ${trades.length} trades, ${result.summary.total_premium} total premium`);
        console.log(` Market Status: ${result.market_info?.status} (${result.market_info?.data_date})`);
      } else {
        console.error('Failed to fetch options flow:', result.error);
        // Set empty data on error to prevent stale data display
        setData([]);
        setSummary({
          total_trades: 0,
          total_premium: 0,
          unique_symbols: 0,
          trade_types: { BLOCK: 0, SWEEP: 0, MINI: 0 },
          call_put_ratio: { calls: 0, puts: 0 },
          processing_time_ms: 0
        });
      }
    } catch (error) {
      console.error('Error fetching options flow:', error);
      // Set empty data on network error
      setData([]);
      setSummary({
        total_trades: 0,
        total_premium: 0,
        unique_symbols: 0,
        trade_types: { BLOCK: 0, SWEEP: 0, MINI: 0 },
        call_put_ratio: { calls: 0, puts: 0 },
        processing_time_ms: 0
      });
    } finally {
      setLoading(false);
    }
  };

  // NO AUTO-SCAN - User must manually trigger scan
  // useEffect removed - scan only on explicit user action

  const handleRefresh = (tickerOverride?: string) => {
    // Reset error state and retry count
    setStreamError('');
    setRetryCount(0);
    setIsStreamComplete(false);
    // Always refresh with live streaming data
    fetchOptionsFlowStreaming(0, tickerOverride);
  };

  const handleClearData = () => {
    // Clear existing data and start fresh
    setData([]);
    setSummary({
      total_trades: 0,
      total_premium: 0,
      unique_symbols: 0,
      trade_types: { BLOCK: 0, SWEEP: 0, MINI: 0 },
      call_put_ratio: { calls: 0, puts: 0 },
      processing_time_ms: 0
    });
  };

  const handleDateChange = (newDate: string) => {
    // For live data only, we ignore date changes and always fetch current data
    console.log('Date change ignored - only showing live data');
    fetchOptionsFlowStreaming();
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Main Content */}
      <div className="p-0">
        <style jsx>{`
          @media (max-width: 768px) {
            :global(.main-content) {
              padding-top: 0 !important;
              margin-top: -30px !important;
            }
          }
        `}</style>
        <OptionsFlowTable
          data={data}
          summary={summary}
          marketInfo={marketInfo}
          loading={loading}
          onRefresh={handleRefresh}
          onClearData={handleClearData}
          onDataUpdate={setData}
          selectedTicker={selectedTicker}
          onTickerChange={setSelectedTicker}
          streamingStatus={streamingStatus}
          streamingProgress={streamingProgress}
          streamError={streamError}
          memoryUsage={memoryUsage}
        />
      </div>

    </div>
  );
}
