'use client';

import React, { useState, useEffect } from 'react';
import { OptionsFlowTable } from '@/components/OptionsFlowTable';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Polygon API key
const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

// 🚀 COMBINED ENRICHMENT - Vol/OI + Fill Style in ONE API call
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

  console.log(`🚀 COMBINED ENRICHMENT: ${trades.length} trades in ${batches.length} batches`);

  const allResults: OptionsFlowData[] = [];
  let successCount = 0;
  let failCount = 0;

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];

    if (batchIndex % 20 === 0) { // Log every 20th batch instead of every 10th
      console.log(`📦 Batch ${batchIndex + 1}/${batches.length} (${Math.round((batchIndex / batches.length) * 100)}%)`);
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

  console.log(`✅ Combined enrichment complete: ${allResults.length} trades (${successCount} success, ${failCount} failed)`);
  return allResults;
};

// OLD SEPARATE FUNCTIONS - DEPRECATED (keeping for backwards compatibility)
const fetchVolumeAndOpenInterest = async (trades: OptionsFlowData[]): Promise<OptionsFlowData[]> => {
  console.log(`🔍 Fetching volume/OI data for ${trades.length} trades`);

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
      console.log(`📊 Fetching option chain for ${underlying} (${underlyingTrades.length} trades)`);

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

      console.log(`✅ Total contracts loaded for ${underlying}: ${allContracts.size}`);

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
  console.log(`⚡ FILL STYLE ANALYSIS: Fetching quotes for ${trades.length} trades`);

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

  // Live options flow fetch
  const fetchOptionsFlowStreaming = async (currentRetry: number = 0, tickerOverride?: string) => {
    setLoading(true);
    setStreamError('');

    let connectionTimeout: NodeJS.Timeout | null = null;

    // ⏱️ FRONTEND TIMER START
    const FRONTEND_TIMER_START = Date.now();
    console.log(`⏱️ 🖥️ FRONTEND TIMER START: ${new Date(FRONTEND_TIMER_START).toISOString()}`);
    console.log(`⏱️ 📊 Vercel Function Limit: 300 seconds (5 minutes)`);

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

      // Error if ticker is empty or just whitespace
      if (!tickerParam || tickerParam.trim() === '') {
        const errorMsg = 'No ticker selected. Please select a ticker, MAG7, ETF, or ALL to scan.';
        console.error('❌', errorMsg);
        setStreamError(errorMsg);
        setLoading(false);
        setStreamingStatus('');
        return;
      }

      if (tickerParam === 'MAG7') {
        tickerParam = 'AAPL,NVDA,MSFT,TSLA,AMZN,META,GOOGL,GOOG';
      } else if (tickerParam === 'ETF') {
        tickerParam = 'SPY,QQQ,DIA,IWM,XLK,SMH,XLE,XLF,XLV,XLI,XLP,XLU,XLY,XLB,XLRE,XLC,GLD,SLV,TLT,HYG,LQD,EEM,EFA,VXX,UVXY';
      } else if (tickerParam === 'ALL') {
        tickerParam = 'ALL_EXCLUDE_ETF_MAG7'; // Special flag for backend
      }
      // Otherwise use the ticker as-is for individual ticker searches

      console.log(`🔌 Connecting to EventSource with ticker: ${tickerParam}`);
      console.log(`🔗 URL: /api/stream-options-flow?ticker=${tickerParam}`);
      console.log(`📡 Creating new EventSource connection...`);
      
      const eventSource = new EventSource(`/api/stream-options-flow?ticker=${tickerParam}`);
      
      console.log(`✅ EventSource created - readyState: ${eventSource.readyState} (0=CONNECTING, 1=OPEN, 2=CLOSED)`);
      console.log(`📊 Waiting for initial connection...`);
      
      // Track last event received time for monitoring silent periods
      let lastEventTime = Date.now();
      let eventCount = 0;
      
      // Monitor for silent periods - log every 5 seconds if no events received
      const silenceMonitor = setInterval(() => {
        const timeSinceLastEvent = ((Date.now() - lastEventTime) / 1000).toFixed(1);
        const totalElapsed = ((Date.now() - FRONTEND_TIMER_START) / 1000).toFixed(2);
        
        if (parseFloat(timeSinceLastEvent) > 5) {
          console.warn(`⏱️ [+${totalElapsed}s] ⚠️ SILENCE: No events for ${timeSinceLastEvent}s (last event was #${eventCount})`);
          console.warn(`   EventSource state: ${eventSource.readyState} (0=CONNECTING, 1=OPEN, 2=CLOSED)`);
          console.warn(`   This usually means backend is processing data...`);
        } else {
          console.log(`⏱️ [+${totalElapsed}s] 🔄 Active - Last event ${timeSinceLastEvent}s ago (${eventCount} total events)`);
        }
      }, 5000); // Check every 5 seconds

      eventSource.onmessage = (event) => {
        const receiveTime = Date.now();
        const elapsed = ((receiveTime - FRONTEND_TIMER_START) / 1000).toFixed(2);
        const timeSinceLastEvent = ((receiveTime - lastEventTime) / 1000).toFixed(2);
        
        lastEventTime = receiveTime;
        eventCount++;
        
        console.log(`⏱️ [+${elapsed}s] 📨 Event #${eventCount} received (${timeSinceLastEvent}s since last) - Size: ${event.data.length} bytes`);
        console.log(`   Raw data preview: ${event.data.substring(0, 100)}...`);
        
        try {
          console.log(`   🔍 Parsing JSON...`);
          const parseStart = performance.now();
          const streamData = JSON.parse(event.data);
          const parseTime = (performance.now() - parseStart).toFixed(2);
          console.log(`   ✅ Parsed in ${parseTime}ms - Type: ${streamData.type}`);

          switch (streamData.type) {
            case 'connected':
              const connectedTime = ((Date.now() - FRONTEND_TIMER_START) / 1000).toFixed(2);
              console.log(`⏱️ [+${connectedTime}s] ✅ Stream connected:`, streamData.message);
              console.log(`   Connection ID: ${streamData.connectionId || 'N/A'}`);
              setStreamingStatus('Connected - scanning options flow...');
              setStreamError('');
              break;

            case 'status':
              const statusTime = ((Date.now() - FRONTEND_TIMER_START) / 1000).toFixed(2);
              setStreamingStatus(streamData.message);
              console.log(`⏱️ [+${statusTime}s] 📊 STATUS: ${streamData.message}`);
              if (streamData.progress) {
                console.log(`   Progress: ${streamData.progress.current || '?'}/${streamData.progress.total || '?'}`);
              }
              break;

            case 'trades':
              const tradesTime = ((Date.now() - FRONTEND_TIMER_START) / 1000).toFixed(2);
              console.log(`⏱️ [+${tradesTime}s] 📊 TRADES event received`);
              // Accumulate trades progressively as they come in (show immediately, enrich later)
              if (streamData.trades && streamData.trades.length > 0) {
                console.log(`   Processing ${streamData.trades.length} trades...`);
                setData(prevData => {
                  // Create a Set of existing trade identifiers to avoid duplicates
                  const existingTradeIds = new Set(
                    prevData.map((trade: OptionsFlowData) => `${trade.ticker}-${trade.trade_timestamp}-${trade.strike}`)
                  );

                  // Only add truly new trades
                  const newTrades = (streamData.trades as OptionsFlowData[]).filter((trade: OptionsFlowData) => {
                    const tradeId = `${trade.ticker}-${trade.trade_timestamp}-${trade.strike}`;
                    return !existingTradeIds.has(tradeId);
                  });

                  console.log(` Stream Update: Adding ${newTrades.length} NEW trades (${streamData.trades.length} sent, ${prevData.length} existing)`);

                  return [...prevData, ...newTrades];
                });
              } else {
                console.log(`   No trades in this event`);
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
              const completeTime = ((Date.now() - FRONTEND_TIMER_START) / 1000).toFixed(2);
              console.log(`⏱️ [+${completeTime}s] 🎯 COMPLETE event received`);
              console.log(`   Total events received: ${eventCount}`);
              
              // Stop silence monitor
              clearInterval(silenceMonitor);
              
              // SET COMPLETE FLAG FIRST to prevent error handler from firing
              setIsStreamComplete(true);

              // ⏱️ FRONTEND TIMER END
              const FRONTEND_TIMER_END = Date.now();
              const FRONTEND_TOTAL_DURATION = ((FRONTEND_TIMER_END - FRONTEND_TIMER_START) / 1000).toFixed(2);
              const percentOfLimit = ((parseFloat(FRONTEND_TOTAL_DURATION) / 300) * 100).toFixed(1);
              
              console.log(`⏱️ ═══════════════════════════════════════════════════════`);
              console.log(`⏱️ 🖥️ FRONTEND TIMER END: ${new Date(FRONTEND_TIMER_END).toISOString()}`);
              console.log(`⏱️ ⚡ TOTAL FRONTEND DURATION: ${FRONTEND_TOTAL_DURATION} seconds (${(parseFloat(FRONTEND_TOTAL_DURATION) / 60).toFixed(2)} minutes)`);
              console.log(`⏱️ 📊 Vercel Limit Usage: ${percentOfLimit}% (${FRONTEND_TOTAL_DURATION}s / 300s)`);
              console.log(`⏱️ 📈 Total Trades: ${streamData.summary.total_trades}`);
              
              // Show backend performance if available
              if (streamData.performance) {
                console.log(`⏱️ 🔧 Backend Processing: ${streamData.performance.totalDuration}s`);
                console.log(`⏱️ 📊 Backend Limit Usage: ${streamData.performance.percentOfLimit}%`);
              }
              console.log(`⏱️ ═══════════════════════════════════════════════════════`);

              // CLOSE STREAM to prevent errors
              console.log(`✅ Stream Complete: ${streamData.summary.total_trades} trades in ${FRONTEND_TOTAL_DURATION}s`);
              console.log(`🔌 Closing EventSource connection...`);
              eventSource.close();
              console.log(`✅ EventSource closed - readyState: ${eventSource.readyState}`);

              // Extract trades from the complete event (backend sends them here!)
              const completeTrades = streamData.trades || [];
              console.log(`🔍 COMPLETE EVENT: Received ${completeTrades.length} trades from backend`);

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
              if (completeTrades.length > 0) {
                console.log(`📦 Processing complete trades batch...`);
                setData(prevData => {
                  // Create a Set of existing trade identifiers to avoid duplicates
                  const existingTradeIds = new Set(
                    prevData.map((trade: OptionsFlowData) => `${trade.ticker}-${trade.trade_timestamp}-${trade.strike}`)
                  );

                  // Only add truly new trades
                  const newTrades = completeTrades.filter((trade: OptionsFlowData) => {
                    const tradeId = `${trade.ticker}-${trade.trade_timestamp}-${trade.strike}`;
                    return !existingTradeIds.has(tradeId);
                  });

                  console.log(`📊 ACCUMULATING: ${newTrades.length} new trades added to existing ${prevData.length} (${completeTrades.length} received)`);

                  const updatedTrades = [...prevData, ...newTrades];
                  console.log(`✅ Total trades now: ${updatedTrades.length}`);

                  // ✅ NO ENRICHMENT NEEDED - Backend sends fully enriched data with Vol/OI + Fill Style
                  // Data comes pre-enriched from the API with snapshot data
                  setStreamingStatus('');

                  return updatedTrades;
                });
              } else {
                console.log('⚠️ Complete event had no trades');
                setStreamingStatus('');
              }

              break;

            case 'error':
              const errorTime = ((Date.now() - FRONTEND_TIMER_START) / 1000).toFixed(2);
              console.error(`⏱️ [+${errorTime}s] ❌ ERROR event received:`, streamData.error);
              console.error(`   Error type: ${streamData.errorType || 'Unknown'}`);
              console.error(`   Retryable: ${streamData.retryable}`);
              clearInterval(silenceMonitor);
              setStreamError(streamData.error || 'Stream error occurred');
              setLoading(false);
              eventSource.close();
              break;

            case 'close':
              const closeTime = ((Date.now() - FRONTEND_TIMER_START) / 1000).toFixed(2);
              console.log(`⏱️ [+${closeTime}s] 🔒 CLOSE event - Server closing connection:`, streamData.message);
              clearInterval(silenceMonitor);
              // Server is gracefully closing the connection
              setIsStreamComplete(true);
              eventSource.close();
              break;

            case 'heartbeat':
              // Keep-alive ping - show elapsed time every heartbeat
              const heartbeatTime = ((Date.now() - FRONTEND_TIMER_START) / 1000).toFixed(2);
              const heartbeatPercent = ((parseFloat(heartbeatTime) / 300) * 100).toFixed(1);
              console.log(`⏱️ [+${heartbeatTime}s] 💓 Heartbeat #${streamData.heartbeatNumber || '?'} (${heartbeatPercent}% of 300s limit)`);
              console.log(`   Stream health: ${streamData.streamHealth || 'unknown'}`);
              break;
            
            default:
              console.warn(`⚠️ Unknown event type: ${streamData.type}`);
              break;
          }
        } catch (parseError) {
          const errorTime = ((Date.now() - FRONTEND_TIMER_START) / 1000).toFixed(2);
          console.error(`⏱️ [+${errorTime}s] ❌ JSON PARSE ERROR:`, parseError);
          console.error(`   Event data that failed to parse:`, event.data);
          console.error(`   Error details:`, parseError instanceof Error ? parseError.message : String(parseError));
        }
      };

      eventSource.onopen = () => {
        const openTime = ((Date.now() - FRONTEND_TIMER_START) / 1000).toFixed(2);
        console.log(`⏱️ [+${openTime}s] 🔓 EventSource OPENED - Connection established`);
        console.log(`   ReadyState: ${eventSource.readyState} (should be 1=OPEN)`);
      };

      eventSource.onerror = (error) => {
        const errorTime = ((Date.now() - FRONTEND_TIMER_START) / 1000).toFixed(2);
        console.error(`⏱️ [+${errorTime}s] ❌ EventSource ERROR fired`);
        console.error(`   ReadyState: ${eventSource.readyState} (0=CONNECTING, 1=OPEN, 2=CLOSED)`);
        console.error(`   Error object:`, error);
        console.error(`   Total events received before error: ${eventCount}`);
        
        // Clear silence monitor
        clearInterval(silenceMonitor);
        // Clear connection timeout
        if (connectionTimeout) {
          clearTimeout(connectionTimeout);
          connectionTimeout = null;
        }

        // Don't log or process errors if stream already completed successfully
        if (isStreamComplete) {
          console.log(`ℹ️ [+${errorTime}s] Error fired but stream already completed - ignoring`);
          eventSource.close();
          return;
        }
        
        // Check if this is just a normal close after completion
        if (eventSource.readyState === 2) { // CLOSED state
          console.log(`ℹ️ [+${errorTime}s] Stream closed normally after completion`);
          eventSource.close();
          setStreamingStatus('');
          setLoading(false);
          return;
        }

        // Check if stream is connecting/reconnecting (readyState 0)
        if (eventSource.readyState === 0) {
          // If we received ANY heartbeat, this is a DISCONNECTION not initial failure
          if (parseFloat(errorTime) > 5) {
            console.error(`❌ [+${errorTime}s] Stream DISCONNECTED unexpectedly after ${errorTime}s`);
            console.error(`   This is NOT an initial connection failure - stream was working then closed`);
            console.error(`   Possible causes: Backend crash, memory issue, worker error, or Vercel timeout`);
            console.error(`   Events received before disconnect: ${eventCount}`);
          } else {
            console.error(`❌ [+${errorTime}s] EventSource failed to establish initial connection`);
          }
          eventSource.close();

          // Only retry once on connection failure
          if (currentRetry === 0) {
            console.log(`🔄 [+${errorTime}s] Retrying connection once in 2 seconds...`);
            setRetryCount(1);
            setTimeout(() => {
              console.log(`🔄 Starting retry attempt...`);
              fetchOptionsFlowStreaming(1, tickerOverride);
            }, 2000);
          } else {
            const errorMsg = parseFloat(errorTime) > 5 
              ? `Stream disconnected after ${errorTime}s - possible backend crash or timeout`
              : 'Stream connection unavailable';
            setStreamError(errorMsg);
            setStreamingStatus('');
            setLoading(false);
          }
          return;
        }

        // For any other case (readyState 1 - OPEN), this is likely normal completion
        // The browser fires onerror when the server closes the stream after sending 'complete'
        console.log(`ℹ️ [+${errorTime}s] Stream connection closed (data transfer complete)`);
        eventSource.close();
        setStreamingStatus('');
        setLoading(false);
      };

    } catch (error) {
      const catchTime = ((Date.now() - FRONTEND_TIMER_START) / 1000).toFixed(2);
      console.error(`⏱️ [+${catchTime}s] ❌ OUTER CATCH - Error starting stream:`, error);
      console.error(`   Error type:`, error instanceof Error ? error.constructor.name : typeof error);
      console.error(`   Error message:`, error instanceof Error ? error.message : String(error));
      console.error(`   Stack trace:`, error instanceof Error ? error.stack : 'N/A');
      setLoading(false);
      // Fallback to regular API
      console.log(`🔄 Attempting fallback to non-streaming API...`);
      fetchOptionsFlow();
    }
  };

  const fetchOptionsFlow = async () => {
    setLoading(true);
    setStreamError('');
    try {
      console.log(`📊 Fetching live options flow data...`);

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
        />
      </div>

    </div>
  );
}