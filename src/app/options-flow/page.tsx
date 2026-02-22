'use client';

import React, { useState, useEffect } from 'react';
import { OptionsFlowTable } from '@/components/OptionsFlowTable';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Polygon API key
const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

// [ENRICH] COMBINED ENRICHMENT - Vol/OI + Fill Style in ONE API call
const enrichTradeDataCombined = async (
  trades: OptionsFlowData[],
  updateCallback: (results: OptionsFlowData[]) => void
): Promise<OptionsFlowData[]> => {
  if (trades.length === 0) return trades;

  // Build option ticker for a trade
  const getOptionTicker = (trade: OptionsFlowData) => {
    const expiry = trade.expiry.replace(/-/g, '').slice(2);
    const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0');
    const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P';
    return `O:${trade.underlying_ticker}${expiry}${optionType}${strikeFormatted}`;
  };

  // Step 1: Deduplicate - collect unique option tickers
  const uniqueTickerMap = new Map<string, { underlying: string }>();
  for (const trade of trades) {
    const optionTicker = getOptionTicker(trade);
    if (!uniqueTickerMap.has(optionTicker)) {
      uniqueTickerMap.set(optionTicker, { underlying: trade.underlying_ticker });
    }
  }

  const uniqueTickers = Array.from(uniqueTickerMap.entries());
  const BATCH_SIZE = 75; // 75 concurrent requests is safe since far fewer unique contracts
  const batches = [];
  for (let i = 0; i < uniqueTickers.length; i += BATCH_SIZE) {
    batches.push(uniqueTickers.slice(i, i + BATCH_SIZE));
  }

  console.log(`[ENRICH] ${trades.length} trades → ${uniqueTickers.length} unique contracts → ${batches.length} batches of ${BATCH_SIZE}`);

  // Step 2: Fetch unique contracts and cache results
  type ContractData = { volume: number; open_interest: number; bid: number; ask: number } | null;
  const cache = new Map<string, ContractData>();
  let successCount = 0;
  let failCount = 0;

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    if (batchIndex % 5 === 0) {
      console.log(`[BATCH] Batch ${batchIndex + 1}/${batches.length} (${Math.round((batchIndex / batches.length) * 100)}%)`);
    }

    await Promise.all(
      batch.map(async ([optionTicker, { underlying }]) => {
        try {
          const snapshotUrl = `https://api.polygon.io/v3/snapshot/options/${underlying}/${optionTicker}?apikey=${POLYGON_API_KEY}`;
          const response = await fetch(snapshotUrl, {
            signal: AbortSignal.timeout(5000),
          } as RequestInit);

          if (!response.ok) { failCount++; cache.set(optionTicker, null); return; }

          const data = await response.json();
          if (data.results) {
            const r = data.results;
            successCount++;
            cache.set(optionTicker, {
              volume: r.day?.volume || 0,
              open_interest: r.open_interest || 0,
              bid: r.last_quote?.bid || 0,
              ask: r.last_quote?.ask || 0,
            });
          } else {
            failCount++;
            cache.set(optionTicker, null);
          }
        } catch {
          failCount++;
          cache.set(optionTicker, null);
        }
      })
    );

    // Progressive update: apply cache so far to all trades after each batch
    const partial = trades.map((trade) => {
      const key = getOptionTicker(trade);
      const cached = cache.get(key);
      if (!cached) return { ...trade, fill_style: 'N/A' as const, volume: 0, open_interest: 0 };
      let fillStyle: 'A' | 'B' | 'AA' | 'BB' | 'N/A' = 'N/A';
      const { bid, ask } = cached;
      const fillPrice = trade.premium_per_contract;
      if (bid && ask && fillPrice) {
        const mid = (bid + ask) / 2;
        if (fillPrice >= ask + 0.01) fillStyle = 'AA';
        else if (fillPrice <= bid - 0.01) fillStyle = 'BB';
        else if (fillPrice >= ask) fillStyle = 'A';
        else if (fillPrice <= bid) fillStyle = 'B';
        else if (fillPrice >= mid) fillStyle = 'A';
        else fillStyle = 'B';
      }
      return { ...trade, fill_style: fillStyle, volume: cached.volume, open_interest: cached.open_interest };
    });
    updateCallback(partial);
  }

  // Step 3: Final apply of full cache to all trades
  const finalResults = trades.map((trade) => {
    const key = getOptionTicker(trade);
    const cached = cache.get(key);
    if (!cached) return { ...trade, fill_style: 'N/A' as const, volume: 0, open_interest: 0 };
    let fillStyle: 'A' | 'B' | 'AA' | 'BB' | 'N/A' = 'N/A';
    const { bid, ask } = cached;
    const fillPrice = trade.premium_per_contract;
    if (bid && ask && fillPrice) {
      const mid = (bid + ask) / 2;
      if (fillPrice >= ask + 0.01) fillStyle = 'AA';
      else if (fillPrice <= bid - 0.01) fillStyle = 'BB';
      else if (fillPrice >= ask) fillStyle = 'A';
      else if (fillPrice <= bid) fillStyle = 'B';
      else if (fillPrice >= mid) fillStyle = 'A';
      else fillStyle = 'B';
    }
    return { ...trade, fill_style: fillStyle, volume: cached.volume, open_interest: cached.open_interest };
  });

  console.log(`[OK] Enrichment complete: ${trades.length} trades from ${uniqueTickers.length} unique contracts (${successCount} fetched, ${failCount} failed)`);
  return finalResults;
};

// OLD SEPARATE FUNCTIONS - DEPRECATED (keeping for backwards compatibility)
const fetchVolumeAndOpenInterest = async (trades: OptionsFlowData[]): Promise<OptionsFlowData[]> => {
  console.log(`[INFO] Fetching volume/OI data for ${trades.length} trades`);

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
      console.log(`[INFO] Fetching option chain for ${underlying} (${underlyingTrades.length} trades)`);

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

      console.log(`[OK] Total contracts loaded for ${underlying}: ${allContracts.size}`);

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
  console.log(`[FILL] FILL STYLE ANALYSIS: Fetching quotes for ${trades.length} trades`);

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
  const [isStreamComplete, setIsStreamComplete] = useState<boolean>(false);

  // Live options flow fetch
  const fetchOptionsFlowStreaming = async (tickerOverride?: string) => {
    setLoading(true);
    setStreamError('');
    setIsStreamComplete(false); // Reset from any previous scan

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
      const isAllScan = tickerParam === 'ALL';

      if (tickerParam === 'MAG7') {
        tickerParam = 'AAPL,NVDA,MSFT,TSLA,AMZN,META,GOOGL,GOOG';
      } else if (tickerParam === 'ETF') {
        tickerParam = 'SPY,QQQ,DIA,IWM,XLK,SMH,XLE,XLF,XLV,XLI,XLP,XLU,XLY,XLB,XLRE,XLC,GLD,SLV,TLT,HYG,LQD,EEM,EFA,VXX,UVXY';
      }
      // ALL scan: handled below via chunked SSE loop (50 tickers/chunk ≈175s each < Vercel's 300s limit)

      if (isAllScan) {
        // Loop through 50-ticker chunks sequentially, accumulating trades, until isLastChunk
        const CHUNK_SIZE = 50;
        let scanOffset = 0;
        let isLastChunk = false;
        let totalSymbols = 0;

        try {
          while (!isLastChunk) {
            const currentChunk = Math.floor(scanOffset / CHUNK_SIZE) + 1;
            setStreamingStatus(`[ALL Scan] Connecting – chunk ${currentChunk} (tickers ${scanOffset + 1}–${scanOffset + CHUNK_SIZE})...`);

            await new Promise<void>((chunkResolve, chunkReject) => {
              const chunkUrl = `/api/stream-options-flow?ticker=ALL_EXCLUDE_ETF_MAG7&offset=${scanOffset}&limit=${CHUNK_SIZE}`;
              const chunkEs = new EventSource(chunkUrl);

              const chunkStallTimeout = setTimeout(() => {
                chunkEs.close();
                chunkReject(new Error(`ALL scan chunk at offset ${scanOffset} stalled after 5 minutes`));
              }, 5 * 60 * 1000);

              chunkEs.onmessage = (event) => {
                try {
                  const streamData = JSON.parse(event.data);
                  switch (streamData.type) {
                    case 'connected':
                      setStreamingStatus(`[ALL Scan] Connected – chunk ${currentChunk}...`);
                      setStreamError('');
                      break;
                    case 'status':
                      setStreamingStatus(streamData.message);
                      break;
                    case 'ticker_complete': {
                      const incoming: OptionsFlowData[] = streamData.trades || [];
                      if (incoming.length > 0) {
                        setData(prevData => {
                          const existingIds = new Set(
                            prevData.map((t: OptionsFlowData) => `${t.ticker}-${t.trade_timestamp}-${t.strike}`)
                          );
                          const newTrades = incoming.filter((t: OptionsFlowData) =>
                            !existingIds.has(`${t.ticker}-${t.trade_timestamp}-${t.strike}`)
                          );
                          console.log(`[ALL-ACCUM] ${streamData.ticker}: +${newTrades.length} trades`);
                          return [...prevData, ...newTrades];
                        });
                      }
                      break;
                    }
                    case 'complete':
                      clearTimeout(chunkStallTimeout);
                      isLastChunk = streamData.isLastChunk === true;
                      totalSymbols = streamData.totalSymbols || totalSymbols;
                      setSummary(streamData.summary);
                      if (streamData.market_info) setMarketInfo(streamData.market_info);
                      setLastUpdate(new Date().toLocaleString());
                      chunkEs.close();
                      if (!isLastChunk) {
                        const totalChunks = Math.ceil(totalSymbols / CHUNK_SIZE);
                        setStreamingStatus(`Chunk ${currentChunk}/${totalChunks} done. Starting next batch...`);
                      }
                      chunkResolve();
                      break;
                    case 'error':
                      clearTimeout(chunkStallTimeout);
                      chunkEs.close();
                      chunkReject(new Error(streamData.error || 'Stream error'));
                      break;
                    case 'close':
                      clearTimeout(chunkStallTimeout);
                      chunkEs.close();
                      chunkResolve();
                      break;
                  }
                } catch (parseErr) {
                  console.error('[BROWSER] Failed to parse ALL-scan SSE message:', parseErr);
                }
              };

              chunkEs.onerror = () => {
                clearTimeout(chunkStallTimeout);
                chunkEs.close();
                chunkReject(new Error(`EventSource error on ALL scan chunk at offset ${scanOffset}`));
              };
            });

            scanOffset += CHUNK_SIZE;
          }

          // All chunks done – enrich the accumulated trades in the browser
          setIsStreamComplete(true);
          setStreamingStatus('All tickers scanned. Enriching vol/OI & fill style...');
          setData(rawTrades => {
            enrichTradeDataCombined(rawTrades, (partial) => {
              setData(partial);
            }).then(final => {
              setData(final);
              setLoading(false);
              setStreamingStatus('');
              console.log('[BROWSER] ALL scan enrichment complete');
            });
            return rawTrades;
          });
        } catch (allScanErr) {
          const msg = allScanErr instanceof Error ? allScanErr.message : 'ALL scan failed';
          console.error('[BROWSER] ALL scan error:', msg);
          setStreamError(msg);
          setLoading(false);
          setStreamingStatus('');
        }
        return; // Don't fall through to single-EventSource path
      }

      // Single-ticker / MAG7 / ETF scan ─────────────────────────────────────
      console.log(`[STREAM] Connecting to EventSource with ticker: ${tickerParam}`);
      console.log(`[BROWSER] Creating EventSource: /api/stream-options-flow?ticker=${tickerParam}`);
      const eventSource = new EventSource(`/api/stream-options-flow?ticker=${tickerParam}`);
      console.log(`[BROWSER] EventSource created - initial readyState: ${eventSource.readyState} (0=CONNECTING, 1=OPEN, 2=CLOSED)`);

      eventSource.onopen = () => {
        console.log(`[BROWSER] ✅ EventSource OPENED - readyState: ${eventSource.readyState}`);
      };

      // Timeout: if no 'complete' or 'error' within 5 min, something stalled
      const stallTimeout = setTimeout(() => {
        console.error(`[BROWSER] ❌ STALL DETECTED: No completion after 5 minutes!`);
        console.error(`[BROWSER] Current readyState: ${eventSource.readyState}`);
        console.error(`[BROWSER] isStreamComplete: ${isStreamComplete}`);
        console.error(`[BROWSER] Current loading state is stuck - closing stream`);
        eventSource.close();
        setStreamError('Scan timed out after 5 minutes');
        setStreamingStatus('');
        setLoading(false);
      }, 5 * 60 * 1000);

      eventSource.onmessage = (event) => {
        try {
          const streamData = JSON.parse(event.data);
          console.log(`[BROWSER] 📨 Message received - type: "${streamData.type}"`);

          switch (streamData.type) {
            case 'connected':
              console.log(`[BROWSER] ✅ CONNECTED - ${streamData.message}`);
              setStreamingStatus('Connected - scanning options flow...');
              setStreamError('');
              break;

            case 'status':
              console.log(`[BROWSER] 📊 STATUS: ${streamData.message}`);
              setStreamingStatus(streamData.message);
              break;

            case 'trades':
              // Accumulate trades progressively as they come in (show immediately, enrich later)
              if (streamData.trades && streamData.trades.length > 0) {
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
              }

              setStreamingStatus(streamData.status);
              if (streamData.progress) {
                setStreamingProgress({
                  current: streamData.progress.current,
                  total: streamData.progress.total
                });
              }
              break;

            case 'ticker_complete': {
              // A single ticker finished scan+enrich - stream its trades immediately
              const incoming = streamData.trades || [];
              console.log(`[BROWSER] ✅ TICKER_COMPLETE: ${streamData.ticker} - ${incoming.length} trades`);
              if (incoming.length > 0) {
                setData(prevData => {
                  const existingIds = new Set(
                    prevData.map((t: OptionsFlowData) => `${t.ticker}-${t.trade_timestamp}-${t.strike}`)
                  );
                  const newTrades = incoming.filter((t: OptionsFlowData) =>
                    !existingIds.has(`${t.ticker}-${t.trade_timestamp}-${t.strike}`)
                  );
                  console.log(`[ACCUM] ${streamData.ticker}: +${newTrades.length} trades (${prevData.length} existing)`);
                  return [...prevData, ...newTrades];
                });
              }
              break;
            }

            case 'complete':
              console.log(`[BROWSER] ✅ COMPLETE - all tickers done. Summary:`, streamData.summary);
              clearTimeout(stallTimeout);
              setIsStreamComplete(true);
              eventSource.close();
              setSummary(streamData.summary);
              if (streamData.market_info) setMarketInfo(streamData.market_info);
              setLastUpdate(new Date().toLocaleString());
              setStreamingProgress(null);
              setStreamError('');
              // Stream done - now enrich in browser (separate from scan, avoids server fd exhaustion)
              setStreamingStatus('Enriching vol/OI & fill style...');
              setData(rawTrades => {
                console.log(`[BROWSER] Starting client-side enrichment for ${rawTrades.length} trades`);
                enrichTradeDataCombined(rawTrades, (partial) => {
                  setData(partial);
                }).then(final => {
                  setData(final);
                  setLoading(false);
                  setStreamingStatus('');
                  console.log(`[BROWSER] Client-side enrichment complete`);
                });
                return rawTrades;
              });
              break;

            case 'error':
              console.error(`[BROWSER] ❌ ERROR event from server: ${streamData.error}`);
              clearTimeout(stallTimeout);
              setStreamError(streamData.error || 'Stream error occurred');
              setLoading(false);
              eventSource.close();
              break;

            case 'close':
              console.log(`[BROWSER] 🔒 CLOSE event from server: ${streamData.message}`);
              clearTimeout(stallTimeout);
              setIsStreamComplete(true);
              eventSource.close();
              break;

            case 'heartbeat':
              console.log(`[BROWSER] 💓 heartbeat received - still alive`);
              break;

            default:
              console.warn(`[BROWSER] ⚠️ Unknown message type: "${streamData.type}"`, streamData);
          }
        } catch (parseError) {
          console.error('[BROWSER] ❌ Failed to parse message:', parseError);
          console.error('[BROWSER] Raw event data:', event.data?.substring(0, 300));
        }
      };

      eventSource.onerror = (error) => {
        console.error(`[BROWSER] ⚠️ onerror fired - readyState: ${eventSource.readyState} (0=CONNECTING, 1=OPEN, 2=CLOSED)`);
        console.error(`[BROWSER] isStreamComplete at time of error: ${isStreamComplete}`);
        console.error(`[BROWSER] Error object:`, error);

        // Clear the stall timeout
        clearTimeout(stallTimeout);

        // Don't process errors if stream already completed successfully
        if (isStreamComplete) {
          console.log('[BROWSER] Stream was already complete - this onerror is expected after close');
          eventSource.close();
          return;
        }

        // readyState 2 = CLOSED: normal close after complete
        if (eventSource.readyState === 2) {
          console.log('[BROWSER] readyState=2 (CLOSED) - stream closed normally');
          eventSource.close();
          setStreamingStatus('');
          setLoading(false);
          return;
        }

        // readyState 0 = CONNECTING: failed to connect at all
        if (eventSource.readyState === 0) {
          console.error('[BROWSER] readyState=0 (CONNECTING) - server closed connection without sending complete event (timeout/crash)');
          eventSource.close();
          setStreamError('Stream connection failed');
          setStreamingStatus('');
          setLoading(false);
          return;
        }

        // readyState 1 = OPEN: server closed stream after sending data (normal)
        console.log('[BROWSER] readyState=1 (OPEN) - server closed stream, treating as complete');
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
      console.log(`[INFO] Fetching live options flow data...`);

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
    setStreamError('');
    setIsStreamComplete(false);
    fetchOptionsFlowStreaming(tickerOverride);
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
