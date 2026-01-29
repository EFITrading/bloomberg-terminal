'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, BarChart, Bar, LineChart, Line, ComposedChart, ReferenceLine, Tooltip, Legend } from 'recharts';
import TradingViewChart from './trading/TradingViewChart';

// Polygon API key for bid/ask analysis
const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

// Function to fetch volume and open interest data for trades
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
    // Declare current spot price variable for this underlying
    let currentSpotPrice: number | null = null;

    try {
      console.log(`📊 Fetching option chain for ${underlying} (${underlyingTrades.length} trades)`);

      // First, get the current spot price for this underlying - this will be overridden by contract data if available
      try {
        const spotPriceUrl = underlying === 'SPX'
          ? `https://api.polygon.io/v2/last/trade/SPX?apikey=${POLYGON_API_KEY}`
          : `https://api.polygon.io/v2/last/trade/${underlying}?apikey=${POLYGON_API_KEY}`;

        console.log(`💰 Fetching current ${underlying} price as fallback...`);
        const priceResponse = await fetch(spotPriceUrl);
        if (priceResponse.ok) {
          const priceData = await priceResponse.json();
          if (priceData.status === 'OK' && priceData.results) {
            currentSpotPrice = priceData.results.p;
            console.log(`✅ Fallback ${underlying} price: $${currentSpotPrice}`);
          }
        }
      } catch (error) {
        console.warn(`⚠️ Failed to fetch ${underlying} spot price fallback:`, error);
      }

      // Get unique expiration dates for this underlying to fetch specific expirations
      const uniqueExpirations = [...new Set(underlyingTrades.map(t => t.expiry))];
      console.log(`📅 Unique expirations for ${underlying}:`, uniqueExpirations);

      let allContracts = new Map();

      // Fetch data for each expiration date separately to get all contracts WITH FULL PAGINATION
      for (const expiry of uniqueExpirations) {
        const expiryParam = expiry.includes('T') ? expiry.split('T')[0] : expiry;
        console.log(`📊 Fetching ${underlying} contracts for expiry: ${expiryParam} WITH FULL PAGINATION`);

        // Use underlying ticker directly (SPX works as-is)
        const apiUnderlying = underlying;

        // FULL PAGINATION LOGIC - Get ALL contracts for this expiration
        let nextUrl: string | null = `https://api.polygon.io/v3/snapshot/options/${apiUnderlying}?expiration_date=${expiryParam}&limit=250&apikey=${POLYGON_API_KEY}`;
        let totalContractsForExpiry = 0;

        while (nextUrl && totalContractsForExpiry < 10000) { // Safety limit
          console.log(`🔄 Paginating: ${nextUrl}`);
          const response: Response = await fetch(nextUrl);

          if (response.ok) {
            const chainData: any = await response.json();
            if (chainData.results && chainData.results.length > 0) {
              // Get SPX price from the first contract's underlying_asset.value
              if (!currentSpotPrice && chainData.results[0]?.underlying_asset?.value) {
                currentSpotPrice = chainData.results[0].underlying_asset.value;
                console.log(`💰 ${underlying} Price from contract data: $${currentSpotPrice}`);
              }

              chainData.results.forEach((contract: any, index: number) => {
                if (contract.details && contract.details.ticker) {
                  allContracts.set(contract.details.ticker, {
                    volume: contract.day?.volume || 0,
                    open_interest: contract.open_interest || 0
                  });

                  // Debug first few contracts to see the format
                  if (index < 3) {
                    console.log(`🏷️ API Contract ${index}: ${contract.details.ticker}, Vol=${contract.day?.volume || 0}, OI=${contract.open_interest || 0}`);
                  }
                }
              });
              totalContractsForExpiry += chainData.results.length;
              console.log(`  📈 Added ${chainData.results.length} contracts, total for ${expiryParam}: ${totalContractsForExpiry}`);

              // Check for next page
              nextUrl = chainData.next_url ? `${chainData.next_url}&apikey=${POLYGON_API_KEY}` : null;
            } else {
              console.log(`  ✅ No more results for ${expiryParam}`);
              break;
            }
          } else {
            console.warn(`  ⚠️ Failed to fetch ${underlying} for ${expiryParam}: ${response.status}`);
            break;
          }

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        console.log(`✅ COMPLETED PAGINATION for ${expiryParam}: ${totalContractsForExpiry} total contracts`);
      }

      console.log(`✅ Total contracts loaded for ${underlying}: ${allContracts.size}`);

      // Debug: Show sample contracts with volume/OI
      const sampleContractsWithData = Array.from(allContracts.entries())
        .filter(([_, data]) => data.volume > 0 || data.open_interest > 0)
        .slice(0, 5);
      console.log(`📊 Sample contracts with Vol/OI data:`, sampleContractsWithData.map(([ticker, data]) =>
        `${ticker}: Vol=${data.volume}, OI=${data.open_interest}`
      ));

      // Skip if no contracts found for any expiration
      if (allContracts.size === 0) {
        console.warn(`⚠️ No option chain data found for any expiration of ${underlying}`);
        updatedTrades.push(...underlyingTrades.map(trade => ({
          ...trade,
          volume: 0,
          open_interest: 0,
          spot_price: currentSpotPrice || trade.spot_price // Use current spot price if available
        })));
        continue;
      }

      // Use the aggregated contracts for lookup
      const contractLookup = allContracts;

      // Debug: Show first few contracts from API
      const contractKeys = Array.from(contractLookup.keys()).slice(0, 5);
      console.log(`📋 Sample contracts from API: ${contractKeys.join(', ')}`);

      // Match trades to contracts and update with vol/OI data
      for (const trade of underlyingTrades) {
        console.log(`🔍 Looking for contract using trade.ticker: ${trade.ticker}`);

        // First try: Use the ticker directly from the trade (like DealerAttraction does)
        let contractData = contractLookup.get(trade.ticker);

        if (!contractData) {
          // Second try: Generate the option ticker format that matches Polygon API
          const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P';

          // Handle date parsing properly - parse as local date to avoid timezone issues
          let expiryDate;
          if (trade.expiry.includes('T')) {
            // If it has time component, parse as is
            expiryDate = new Date(trade.expiry);
          } else {
            // If it's just a date string like "2025-10-31", parse as local date
            const [year, month, day] = trade.expiry.split('-').map(Number);
            expiryDate = new Date(year, month - 1, day); // month is 0-based in JS
          }

          const formattedExpiry = `${expiryDate.getFullYear().toString().slice(-2)}${(expiryDate.getMonth() + 1).toString().padStart(2, '0')}${expiryDate.getDate().toString().padStart(2, '0')}`;
          const formattedStrike = Math.round(trade.strike * 1000).toString().padStart(8, '0');
          // Use underlying ticker directly (SPX works as-is)
          const tickerUnderlying = underlying;
          const optionTicker = `O:${tickerUnderlying}${formattedExpiry}${optionType}${formattedStrike}`;

          console.log(`🔍 Trying constructed ticker: ${optionTicker} (from expiry: ${trade.expiry}, strike: ${trade.strike})`);
          contractData = contractLookup.get(optionTicker);
        }

        if (contractData) {
          updatedTrades.push({
            ...trade,
            volume: contractData.volume,
            open_interest: contractData.open_interest,
            spot_price: currentSpotPrice || trade.spot_price // Use current spot price if available
          });
          console.log(`✅ FOUND contract: Vol=${contractData.volume}, OI=${contractData.open_interest}, Spot=$${currentSpotPrice || trade.spot_price}`);
        } else {
          // Contract not found - show more debug info
          console.log(`❌ NOT FOUND: ${trade.ticker}`);
          console.log(`🔍 Trade details:`, {
            ticker: trade.ticker,
            underlying: trade.underlying_ticker,
            strike: trade.strike,
            expiry: trade.expiry,
            type: trade.type
          });

          // Show a few actual tickers for comparison
          const allTickers = Array.from(contractLookup.keys()).slice(0, 10);
          console.log(`📋 First 10 actual tickers in lookup:`, allTickers);

          updatedTrades.push({
            ...trade,
            volume: 0,
            open_interest: 0,
            spot_price: currentSpotPrice || trade.spot_price // Use current spot price if available
          });
        }
      }

    } catch (error) {
      console.error(`❌ Error fetching vol/OI for ${underlying}:`, error);
      // Add trades without vol/OI data on error, but with current spot price if available
      updatedTrades.push(...underlyingTrades.map(trade => ({
        ...trade,
        volume: 0,
        open_interest: 0,
        spot_price: currentSpotPrice || trade.spot_price // Use current spot price if available
      })));
    }
  }

  console.log(`✅ Volume/OI fetch complete for ${updatedTrades.length} trades`);
  return updatedTrades;
};

// Calculate Live Open Interest based on fill styles
// Cache for Live OI calculations to avoid recalculating for same contract
const liveOICache = new Map<string, number>();

const calculateLiveOI = (originalOI: number, trades: any[], contractKey: string): number => {
  // SIMPLIFIED: Just return the original OI since fill styles are unreliable
  // The OI from Polygon is already the most current available

  console.log(`� LIVE OI (SIMPLIFIED): ${contractKey} - Returning original OI: ${originalOI}`);

  if (!trades || trades.length === 0) {
    return originalOI;
  }

  // Filter trades for this specific contract
  const contractTrades = trades.filter(trade => {
    const tradeKey = `${trade.underlying_ticker}_${trade.strike}_${trade.type}_${trade.expiry}`;
    return tradeKey === contractKey;
  });

  if (contractTrades.length === 0) {
    return originalOI;
  }

  let liveOI = originalOI;

  // Sort trades by timestamp to process chronologically
  const sortedTrades = [...contractTrades].sort((a, b) =>
    new Date(a.trade_timestamp).getTime() - new Date(b.trade_timestamp).getTime()
  );

  // Process each unique trade - AVOID DUPLICATES
  const processedTradeIds = new Set<string>();

  sortedTrades.forEach(trade => {
    // Create unique identifier
    const tradeId = `${trade.underlying_ticker}_${trade.strike}_${trade.type}_${trade.expiry}_${trade.trade_timestamp}_${trade.trade_size}_${trade.premium_per_contract}`;

    if (processedTradeIds.has(tradeId)) {
      console.log(`⚠️ SKIPPING DUPLICATE: ${tradeId}`);
      return;
    }

    processedTradeIds.add(tradeId);

    const contracts = trade.trade_size || 0;
    const fillStyle = trade.fill_style;

    console.log(`🔄 ${new Date(trade.trade_timestamp).toLocaleTimeString()} - ${contracts} contracts, Fill: ${fillStyle}, Before OI: ${liveOI}`);

    switch (fillStyle) {
      case 'A':   // Add to OI (opening)
      case 'AA':  // Add to OI (opening)  
      case 'BB':  // Add to OI (opening)
        liveOI += contracts;
        console.log(`✅ ADDED ${contracts} -> New OI: ${liveOI}`);
        break;
      case 'B':   // Smart B fill logic
        if (contracts > originalOI) {
          // If B fill exceeds original OI, it's actually opening positions
          liveOI += contracts;
          console.log(`🔄 B FILL EXCEEDS ORIGINAL OI: ADDED ${contracts} (${contracts} > ${originalOI}) -> New OI: ${liveOI}`);
        } else {
          // Normal B fill - closing positions
          liveOI -= contracts;
          console.log(`❌ SUBTRACTED ${contracts} -> New OI: ${liveOI}`);
        }
        break;
      default:
        console.log(`⚪ NO CHANGE for fill: ${fillStyle}`);
        break;
    }
  });

  console.log(`📊 FINAL: ${contractKey} - Original: ${originalOI}, Final: ${liveOI}, Processed: ${processedTradeIds.size} trades`);

  return Math.max(0, liveOI);
};

// YOUR REAL SWEEP DETECTION: EXACT SAME LOGIC as optionsFlowService detectSweeps
const detectSweepsAndBlocks = (trades: any[]): any[] => {
  if (trades.length === 0) return [];

  // Processing trades from YOUR API

  // Sort trades by timestamp
  trades.sort((a, b) => new Date(a.trade_timestamp).getTime() - new Date(b.trade_timestamp).getTime());

  // Group trades by exact timestamp AND contract (SAME AS YOUR MAIN FLOW SCREENER)
  const exactTimeGroups = new Map<string, any[]>();

  for (const trade of trades) {
    // YOUR SPECIFICATION: 3-second window grouping + contract as key for grouping
    const contractKey = `${trade.underlying_ticker}_${trade.strike}_${trade.type}_${trade.expiry}`;
    const timeInMs = new Date(trade.trade_timestamp).getTime();
    const threeSecondWindow = Math.floor(timeInMs / 3000) * 3000; // Group into 3-second windows
    const groupKey = `${contractKey}_${threeSecondWindow}`;

    if (!exactTimeGroups.has(groupKey)) {
      exactTimeGroups.set(groupKey, []);
    }
    exactTimeGroups.get(groupKey)!.push(trade);
  }

  const categorizedTrades: any[] = [];
  let sweepCount = 0;
  let blockCount = 0;

  // Process each 3-second window group - EXACTLY LIKE YOUR MAIN FLOW SCREENER
  exactTimeGroups.forEach((tradesInGroup, groupKey) => {
    const totalContracts = tradesInGroup.reduce((sum, t) => sum + t.trade_size, 0);
    const totalPremium = tradesInGroup.reduce((sum, t) => sum + t.total_premium, 0);
    // IMPROVED: Handle multiple exchange field formats and null/undefined values
    const exchanges = [...new Set(tradesInGroup.map(t => {
      // Try multiple possible exchange fields
      return t.exchange || t.exchange_name || t.exchange_id || 'UNKNOWN';
    }).filter(ex => ex && ex !== 'UNKNOWN'))]; // Filter out null/undefined/UNKNOWN

    const representativeTrade = tradesInGroup[0];



    // ENHANCED LOGIC: Handle case where exchange data is missing
    if (exchanges.length >= 2) {
      // SWEEP: 2+ exchanges involved (regardless of amounts) - COMBINE INTO SINGLE TRADE
      sweepCount++;
      const weightedPrice = tradesInGroup.reduce((sum, trade) => {
        return sum + (trade.premium_per_contract * trade.trade_size);
      }, 0) / totalContracts;

      const sweepTrade = {
        ...representativeTrade,
        trade_size: totalContracts,
        premium_per_contract: weightedPrice,
        total_premium: totalPremium,
        trade_type: 'SWEEP',
        exchange_name: `MULTI-EXCHANGE (${tradesInGroup.length} fills across ${exchanges.length} exchanges)`,
        window_group: `sweep_${groupKey}`,
        related_trades: exchanges.map(ex => `${ex}`)
      };


      categorizedTrades.push(sweepTrade);

    } else if (exchanges.length === 1) {
      // Single exchange: BLOCK if $50K+, MINI if <$50K - COMBINE INTO SINGLE TRADE
      // Calculate proper weighted average price per contract
      const correctWeightedPrice = tradesInGroup.reduce((sum, trade) => {
        return sum + (trade.premium_per_contract * trade.trade_size);
      }, 0) / totalContracts;

      const combinedTrade = {
        ...representativeTrade,
        trade_size: totalContracts,
        premium_per_contract: correctWeightedPrice,
        total_premium: totalPremium,
        trade_type: totalPremium >= 50000 ? 'BLOCK' : 'MINI',
        exchange_name: representativeTrade.exchange_name || `Exchange ${exchanges[0]}`,
        window_group: totalPremium >= 50000 ? `block_${groupKey}` : `mini_${groupKey}`,
        related_trades: []
      };

      if (totalPremium >= 50000) {
        blockCount++;
      }

      categorizedTrades.push(combinedTrade);
    }
  });

  const miniCount = categorizedTrades.filter(t => t.trade_type === 'MINI').length;
  return categorizedTrades;
};

// No EFI criteria needed - pure classification logic

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
  trade_type: 'SWEEP' | 'BLOCK' | 'MINI';
  trade_timestamp: string;
  moneyness: 'ATM' | 'ITM' | 'OTM';
  days_to_expiry: number;
  fill_style?: 'A' | 'B' | 'AA' | 'BB' | 'N/A';
  volume?: number;
  open_interest?: number;
}

interface AlgoFlowAnalysis {
  ticker: string;
  currentPrice: number;
  algoFlowScore: number;
  totalCallPremium: number;
  totalPutPremium: number;
  netFlow: number;
  sweepCount: number;
  blockCount: number;
  miniCount: number;
  // No EFI highlights needed
  callPutRatio: number;
  aggressiveCalls: number;
  aggressivePuts: number;
  flowTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  chartData: Array<{
    time: number;        // Timestamp for proper x-axis formatting
    timeLabel: string;   // Original time string for reference
    callsPlus: number;   // Bullish call buying
    callsMinus: number;  // Bearish call selling  
    putsPlus: number;    // Bullish put buying
    putsMinus: number;   // Bearish put selling
    netFlow: number;
    bullishTotal: number; // Combined bullish calls + bullish puts
    bearishTotal: number; // Combined bearish calls + bearish puts
  }>;
  priceData: Array<{
    time: number;        // Timestamp for proper x-axis formatting
    open: number;
    high: number;
    low: number;
    close: number;
  }>;
  // YOUR REAL TIER SYSTEM
  tier1Count: number;
  tier2Count: number;
  tier3Count: number;
  tier4Count: number;
  tier5Count: number;
  tier6Count: number;
  tier7Count: number;
  tier8Count: number;
  // Trades with fill_style
  trades: any[];
}

// BID/ASK EXECUTION ANALYSIS - Same logic as OptionsFlowTable intentions button
// Lightning-fast analysis for massive datasets using pure statistical inference
const analyzeBidAskExecutionLightning = async (trades: any[]): Promise<any[]> => {
  console.log(`⚡ REAL BID/ASK ANALYSIS: Fetching quotes for ${trades.length} trades`);

  if (trades.length === 0) return trades;

  const tradesWithFillStyle: any[] = [];

  // Process ALL trades - no sampling
  const BATCH_SIZE = 20; // Larger batch size for efficiency
  for (let i = 0; i < trades.length; i += BATCH_SIZE) {
    const batch = trades.slice(i, i + BATCH_SIZE);

    const batchPromises = batch.map(async (trade, index) => {
      try {
        // Create option ticker format
        const expiry = trade.expiry.replace(/-/g, '').slice(2); // Convert 2025-10-10 to 251010
        const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0');
        const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P';
        const normalizeTickerForOptions = (ticker: string) => {
          const specialCases: Record<string, string> = {
            'BRK.B': 'BRK',
            'BF.B': 'BF'
          };
          return specialCases[ticker] || ticker;
        };
        const optionTicker = `O:${normalizeTickerForOptions(trade.underlying_ticker)}${expiry}${optionType}${strikeFormatted}`;

        // Use snapshot endpoint - same as Options Flow
        const snapshotUrl = `https://api.polygon.io/v3/snapshot/options/${trade.underlying_ticker}/${optionTicker}?apikey=kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf`;

        if (index === 0) {
          console.log(`🔍 SNAPSHOT API REQUEST: ${optionTicker}`);
        }

        const response = await fetch(snapshotUrl);
        const data = await response.json();

        if (index === 0) {
          console.log(`📊 SNAPSHOT API RESPONSE:`, data);
        }

        if (data.results && data.results.last_quote) {
          const bid = data.results.last_quote.bid;
          const ask = data.results.last_quote.ask;
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

            if (index === 0) {
              console.log(`✅ Fill style determined: ${fillStyle}`, { bid, ask, fillPrice, midpoint });
            }

            return { ...trade, fill_style: fillStyle };
          }
        }

        if (index === 0) {
          console.log(`⚠️ No quote data found`);
        }

        return { ...trade, fill_style: 'N/A' };
      } catch (error) {
        console.error(`Error analyzing trade ${trade.underlying_ticker}:`, error);
        return { ...trade, fill_style: 'N/A' };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    tradesWithFillStyle.push(...batchResults);

    // Small delay between batches to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`✅ Analysis complete. REAL trades with fill_style:`, tradesWithFillStyle.slice(0, 3).map(t => ({
    ticker: t.underlying_ticker,
    fill_style: t.fill_style,
    premium: t.premium_per_contract
  })));

  return tradesWithFillStyle;
};
const analyzeBidAskExecutionAdvanced = async (trades: any[]): Promise<any[]> => {
  console.log(`� Starting ULTRA-FAST parallel bid/ask analysis for ${trades.length} trades`);

  if (trades.length === 0) return trades;

  // Process ALL trades - no sampling for accurate fill_style classification
  let tradesToAnalyze = trades;
  let useStatisticalInference = false;

  console.log(`📊 Processing ALL ${tradesToAnalyze.length} trades for accurate fill_style analysis`);

  // Create optimal batches for parallel processing
  const BATCH_SIZE = 20; // Optimal batch size for API rate limits
  const MAX_CONCURRENT_BATCHES = 5; // Limit concurrent batches to avoid overwhelming API

  const batches = [];
  for (let i = 0; i < tradesToAnalyze.length; i += BATCH_SIZE) {
    batches.push(tradesToAnalyze.slice(i, i + BATCH_SIZE));
  }

  console.log(`⚡ Processing ${batches.length} batches with max ${MAX_CONCURRENT_BATCHES} concurrent batches`);

  // Process batches in controlled parallel chunks
  const allResults: any[] = [];
  const totalChunks = Math.ceil(batches.length / MAX_CONCURRENT_BATCHES);

  for (let i = 0; i < batches.length; i += MAX_CONCURRENT_BATCHES) {
    const currentChunk = Math.floor(i / MAX_CONCURRENT_BATCHES) + 1;
    const batchChunk = batches.slice(i, i + MAX_CONCURRENT_BATCHES);
    console.log(`🔄 Processing batch chunk ${currentChunk}/${totalChunks} (${batchChunk.length} batches)`);

    // Update progress if possible (would need to pass callback from component)
    if (typeof window !== 'undefined' && (window as any).updateAnalysisProgress) {
      (window as any).updateAnalysisProgress(currentChunk, totalChunks);
    }
    const chunkResults = await Promise.allSettled(
      batchChunk.map(async (batch, batchIndex) => {
        const actualBatchIndex = i + batchIndex;

        // Process trades in this batch in parallel
        const batchResults = await Promise.allSettled(
          batch.map(async (trade) => {
            try {
              // Create option ticker format
              const expiry = trade.expiry.replace(/-/g, '').slice(2);
              const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0');
              const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P';
              const optionTicker = `O:${trade.underlying_ticker}${expiry}${optionType}${strikeFormatted}`;

              // Quick timeout to avoid hanging
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout

              const tradeTime = new Date(trade.trade_timestamp);
              const checkTime = new Date(tradeTime.getTime() + 1000); // 1 second AFTER trade
              const checkTimestamp = checkTime.getTime() * 1000000;

              const quotesUrl = `https://api.polygon.io/v3/quotes/${optionTicker}?timestamp.gte=${checkTimestamp}&limit=1&apikey=kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf`;

              const response = await fetch(quotesUrl, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json' }
              });

              clearTimeout(timeoutId);

              if (!response.ok) throw new Error(`HTTP ${response.status}`);

              const data = await response.json();

              if (data.results && data.results.length > 0) {
                const quote = data.results[0];
                const bid = quote.bid_price;
                const ask = quote.ask_price;
                const fillPrice = trade.premium_per_contract;

                if (bid && ask && fillPrice && bid > 0 && ask > 0) {
                  const tolerance = 0.02;
                  const mid = (bid + ask) / 2;

                  if (Math.abs(fillPrice - ask) <= tolerance || fillPrice > ask) {
                    trade.executionType = 'BULLISH';
                  } else if (fillPrice >= mid) {
                    trade.executionType = 'BULLISH';
                  } else if (Math.abs(fillPrice - bid) <= tolerance || fillPrice < bid) {
                    trade.executionType = 'BEARISH';
                  } else {
                    trade.executionType = 'NEUTRAL';
                  }
                } else {
                  trade.executionType = 'NEUTRAL';
                }
              } else {
                trade.executionType = 'NEUTRAL';
              }

              return trade;
            } catch (error) {
              trade.executionType = 'NEUTRAL';
              return trade;
            }
          })
        );

        return batchResults.map(result =>
          result.status === 'fulfilled' ? result.value : null
        ).filter(Boolean);
      })
    );

    // Collect results from this chunk
    chunkResults.forEach(result => {
      if (result.status === 'fulfilled') {
        allResults.push(...result.value);
      }
    });

    // Small delay between chunks to respect rate limits
    if (i + MAX_CONCURRENT_BATCHES < batches.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  // Create execution type map from analyzed trades
  const executionMap = new Map();
  allResults.flat().forEach(trade => {
    const key = `${trade.underlying_ticker}_${trade.strike}_${trade.expiry}_${trade.type}_${trade.trade_timestamp}`;
    executionMap.set(key, trade.executionType);
  });

  // Apply intelligent inference to all trades
  const finalTrades = trades.map(trade => {
    const key = `${trade.underlying_ticker}_${trade.strike}_${trade.expiry}_${trade.type}_${trade.trade_timestamp}`;

    if (executionMap.has(key)) {
      // Use actual analysis result
      trade.executionType = executionMap.get(key);
    } else if (useStatisticalInference) {
      // Intelligent inference based on trade characteristics and market patterns
      const isLargeTrade = trade.total_premium > 100000;
      const isHugeTrade = trade.total_premium > 500000;
      const isNearMoney = Math.abs(trade.strike - trade.spot_price) / trade.spot_price < 0.05;
      const isFarOTM = Math.abs(trade.strike - trade.spot_price) / trade.spot_price > 0.15;

      // Analyze similar trades that were actually processed
      const similarTrades = allResults.flat().filter(analyzedTrade =>
        analyzedTrade.underlying_ticker === trade.underlying_ticker &&
        analyzedTrade.type === trade.type &&
        Math.abs(analyzedTrade.strike - trade.strike) / trade.strike < 0.1 &&
        Math.abs(analyzedTrade.total_premium - trade.total_premium) / Math.max(trade.total_premium, 1) < 0.5
      );

      if (similarTrades.length > 0) {
        // Use the most common execution type from similar trades
        const executionCounts = { BULLISH: 0, BEARISH: 0, NEUTRAL: 0 };
        similarTrades.forEach(st => executionCounts[st.executionType as keyof typeof executionCounts]++);
        trade.executionType = Object.entries(executionCounts).reduce((a, b) => executionCounts[a[0] as keyof typeof executionCounts] > executionCounts[b[0] as keyof typeof executionCounts] ? a : b)[0];
      } else if (isHugeTrade && isNearMoney) {
        // Huge near-the-money trades are usually aggressive
        trade.executionType = 'BULLISH';
      } else if (isLargeTrade && !isFarOTM) {
        // Large trades that aren't far OTM tend to be directional
        trade.executionType = trade.type === 'call' ? 'BULLISH' : 'BEARISH';
      } else {
        trade.executionType = 'NEUTRAL';
      }
    } else {
      // Default fallback
      trade.executionType = 'NEUTRAL';
    }

    return trade;
  });

  const bullishCount = finalTrades.filter(t => t.executionType === 'BULLISH').length;
  const bearishCount = finalTrades.filter(t => t.executionType === 'BEARISH').length;
  const neutralCount = finalTrades.filter(t => t.executionType === 'NEUTRAL').length;

  console.log(`🎯 ULTRA-FAST analysis complete in seconds instead of hours!`);
  console.log(`📊 Results: ${bullishCount} BULLISH (${(bullishCount / finalTrades.length * 100).toFixed(1)}%), ${bearishCount} BEARISH (${(bearishCount / finalTrades.length * 100).toFixed(1)}%), ${neutralCount} NEUTRAL (${(neutralCount / finalTrades.length * 100).toFixed(1)}%)`);
  console.log(`⚡ Processed ${finalTrades.length} trades using ${useStatisticalInference ? 'STATISTICAL INFERENCE' : 'DIRECT ANALYSIS'}`);

  return finalTrades;
};

export default function AlgoFlowScreener() {
  const [ticker, setTicker] = useState('');
  const [searchTicker, setSearchTicker] = useState('');
  const [loading, setLoading] = useState(false);
  const [flowData, setFlowData] = useState<OptionsFlowData[]>([]);
  const [error, setError] = useState('');
  const [streamStatus, setStreamStatus] = useState('');
  const [isStreamComplete, setIsStreamComplete] = useState<boolean>(false);
  const [timeInterval, setTimeInterval] = useState<'5min' | '15min' | '30min' | '1hour'>('1hour');
  const [chartViewMode, setChartViewMode] = useState<'detailed' | 'simplified' | 'net'>('detailed');
  const [chartTimeframe, setChartTimeframe] = useState<'1D' | '3D' | '1W'>('1D');
  const [scanTimeframe, setScanTimeframe] = useState<'1D' | '3D' | '1W'>('1D');

  // Pagination and sorting state
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<string>('trade_timestamp');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const TRADES_PER_PAGE = 50;

  // Mobile column management
  const [showMobileDetails, setShowMobileDetails] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // Strike price filtering
  const [selectedStrike, setSelectedStrike] = useState<number | null>(null);

  // Expiry date filtering
  const [selectedExpiry, setSelectedExpiry] = useState<string | null>(null);

  // Calculate algo flow analysis using YOUR REAL tier system and SWEEP/BLOCK detection
  const calculateAlgoFlowAnalysis = async (trades: OptionsFlowData[]): Promise<AlgoFlowAnalysis | null> => {
    if (!trades.length) return null;

    const ticker = trades[0].underlying_ticker;
    const currentPrice = trades[0].spot_price;

    // Convert to ProcessedTrade format - PRESERVE fill_style if it exists
    const processedTrades = trades.map(trade => ({
      ticker: trade.underlying_ticker + trade.strike + trade.expiry + (trade.type === 'call' ? 'C' : 'P'),
      underlying_ticker: trade.underlying_ticker,
      strike: trade.strike,
      expiry: trade.expiry,
      type: trade.type,
      trade_size: trade.trade_size,
      premium_per_contract: trade.premium_per_contract,
      total_premium: trade.total_premium,
      spot_price: trade.spot_price,
      exchange: 0, // Not used for API-classified trades
      exchange_name: trade.exchange_name || 'UNKNOWN',
      sip_timestamp: Date.now() * 1000000,
      conditions: [],
      trade_timestamp: new Date(trade.trade_timestamp),
      trade_type: trade.trade_type, // PRESERVE from API
      moneyness: trade.moneyness,
      days_to_expiry: trade.days_to_expiry,
      fill_style: (trade as any).fill_style, // PRESERVE fill_style from API
      volume: (trade as any).volume, // PRESERVE volume
      open_interest: (trade as any).open_interest // PRESERVE open_interest
    }));

    // YOUR REAL 8-TIER INSTITUTIONAL SYSTEM
    const premiumTiers = [
      { name: 'TIER_1', minPrice: 8.00, minSize: 80, minTotal: 0, description: 'Premium Institutional' },
      { name: 'TIER_2', minPrice: 7.00, minSize: 100, minTotal: 0, description: 'High-Value Large Volume' },
      { name: 'TIER_3', minPrice: 5.00, minSize: 150, minTotal: 0, description: 'Mid-Premium Bulk' },
      { name: 'TIER_4', minPrice: 3.50, minSize: 200, minTotal: 0, description: 'Moderate Premium Large' },
      { name: 'TIER_5', minPrice: 2.50, minSize: 200, minTotal: 0, description: 'Lower Premium Large' },
      { name: 'TIER_6', minPrice: 1.00, minSize: 800, minTotal: 0, description: 'Small Premium Massive' },
      { name: 'TIER_7', minPrice: 0.50, minSize: 2000, minTotal: 0, description: 'Penny Options Massive' },
      { name: 'TIER_8', minPrice: 0, minSize: 20, minTotal: 50000, description: 'Total Premium Bypass' }
    ];

    // Classify trades by YOUR REAL TIER SYSTEM
    const tieredTrades = processedTrades.map(trade => {
      let tier = 'TIER_8'; // Default to lowest tier

      // Check each tier from highest to lowest
      for (let i = 0; i < premiumTiers.length; i++) {
        const tierDef = premiumTiers[i];

        // Special logic for TIER_8 (Total Premium Bypass)
        if (tierDef.name === 'TIER_8') {
          if (trade.trade_size >= tierDef.minSize && trade.total_premium >= tierDef.minTotal) {
            tier = tierDef.name;
            break;
          }
        } else {
          // Standard tier logic: premium per contract + size
          if (trade.premium_per_contract >= tierDef.minPrice && trade.trade_size >= tierDef.minSize) {
            tier = tierDef.name;
            break;
          }
        }
      }

      return { ...trade, tier };
    });

    // SKIP CLIENT-SIDE CLASSIFICATION - API already classified as SWEEP/BLOCK/MINI
    // Use API's classification directly instead of reclassifying
    const classifiedTrades = tieredTrades;

    // BID/ASK EXECUTION ANALYSIS - Only analyze trades WITHOUT fill_style
    console.log('🚀 Checking which trades need bid/ask analysis...');
    const tradesNeedingAnalysis = classifiedTrades.filter(t => !t.fill_style || t.fill_style === 'N/A');
    const tradesWithExistingFillStyle = classifiedTrades.filter(t => t.fill_style && t.fill_style !== 'N/A');

    console.log(`📊 ${tradesWithExistingFillStyle.length} trades already have fill_style, ${tradesNeedingAnalysis.length} need analysis`);

    let analyzedTrades = [];
    if (tradesNeedingAnalysis.length > 0) {
      console.log('🚀 Running bid/ask analysis for trades without fill_style...');
      analyzedTrades = await analyzeBidAskExecutionLightning(tradesNeedingAnalysis);
    }

    // Combine trades: those with existing fill_style + newly analyzed trades
    const tradesWithExecution = [...tradesWithExistingFillStyle, ...analyzedTrades];

    console.log('🔍 TRADES WITH FILL_STYLE:', tradesWithExecution.slice(0, 5).map(t => ({
      ticker: t.underlying_ticker,
      premium: t.total_premium,
      fill_style: t.fill_style
    })));

    // Debug removed

    // Calculate premium flows
    const callTrades = tradesWithExecution.filter((t: any) => t.type === 'call');
    const putTrades = tradesWithExecution.filter((t: any) => t.type === 'put');

    const totalCallPremium = callTrades.reduce((sum: number, t: any) => sum + t.total_premium, 0);
    const totalPutPremium = putTrades.reduce((sum: number, t: any) => sum + t.total_premium, 0);
    const netFlow = totalCallPremium - totalPutPremium;

    // Count trade types using YOUR REAL classification
    const sweepCount = classifiedTrades.filter((t: any) => t.trade_type === 'SWEEP').length;
    const blockCount = classifiedTrades.filter((t: any) => t.trade_type === 'BLOCK').length;
    const miniCount = classifiedTrades.filter((t: any) => t.trade_type === 'MINI').length;

    // Count by YOUR REAL TIER SYSTEM
    const tier1Count = classifiedTrades.filter((t: any) => t.tier === 'TIER_1').length;
    const tier2Count = classifiedTrades.filter((t: any) => t.tier === 'TIER_2').length;
    const tier3Count = classifiedTrades.filter((t: any) => t.tier === 'TIER_3').length;
    const tier4Count = classifiedTrades.filter((t: any) => t.tier === 'TIER_4').length;
    const tier5Count = classifiedTrades.filter((t: any) => t.tier === 'TIER_5').length;
    const tier6Count = classifiedTrades.filter((t: any) => t.tier === 'TIER_6').length;
    const tier7Count = classifiedTrades.filter((t: any) => t.tier === 'TIER_7').length;
    const tier8Count = classifiedTrades.filter((t: any) => t.tier === 'TIER_8').length;

    // No EFI highlights needed

    // Calculate aggressive calls/puts (large premium trades)
    const aggressiveCalls = callTrades.filter((t: any) => t.total_premium >= 50000).length;
    const aggressivePuts = putTrades.filter((t: any) => t.total_premium >= 50000).length;

    const callPutRatio = putTrades.length > 0 ? callTrades.length / putTrades.length : callTrades.length;

    // Enhanced AlgoFlow Score Calculation
    // Component 1: Premium Ratio (base sentiment from dollar flow)
    const totalPremium = totalCallPremium + totalPutPremium;
    const premiumRatio = totalPremium > 0 ? netFlow / totalPremium : 0;

    // Component 2: Volume Ratio (directional trade count)
    const volumeRatio = classifiedTrades.length > 0 ? (callTrades.length - putTrades.length) / classifiedTrades.length : 0;

    // Component 3: Aggressive Trades Ratio (large trades ≥$50K - institutional conviction)
    const aggressiveCallPremium = callTrades.filter((t: any) => t.total_premium >= 50000).reduce((sum: number, t: any) => sum + t.total_premium, 0);
    const aggressivePutPremium = putTrades.filter((t: any) => t.total_premium >= 50000).reduce((sum: number, t: any) => sum + t.total_premium, 0);
    const aggressiveTotalPremium = aggressiveCallPremium + aggressivePutPremium;
    const aggressiveRatio = aggressiveTotalPremium > 0 ? (aggressiveCallPremium - aggressivePutPremium) / aggressiveTotalPremium : 0;

    // Component 4: Non-Aggressive Trades Ratio (smaller trades <$50K - retail/smaller players)
    const nonAggressiveCallPremium = callTrades.filter((t: any) => t.total_premium < 50000).reduce((sum: number, t: any) => sum + t.total_premium, 0);
    const nonAggressivePutPremium = putTrades.filter((t: any) => t.total_premium < 50000).reduce((sum: number, t: any) => sum + t.total_premium, 0);
    const nonAggressiveTotalPremium = nonAggressiveCallPremium + nonAggressivePutPremium;
    const nonAggressiveRatio = nonAggressiveTotalPremium > 0 ? (nonAggressiveCallPremium - nonAggressivePutPremium) / nonAggressiveTotalPremium : 0;

    // Component 5: Put/Call Ratio Score (normalized - higher C/P ratio = more bullish)
    // Normalize P/C ratio to -1 to +1 scale (0.5 = neutral, >1 = bearish, <0.5 = bullish)
    const pcRatioScore = callPutRatio > 0 ? Math.tanh((callPutRatio - 1) * 0.5) : -1; // tanh keeps it bounded

    // Component 6: Sweep/Block Concentration (high-conviction institutional flow)
    const sweepBlockCount = sweepCount + blockCount;
    const sweepBlockRatio = classifiedTrades.length > 0 ? sweepBlockCount / classifiedTrades.length : 0;
    const sweepBlockCalls = classifiedTrades.filter((t: any) => (t.trade_type === 'SWEEP' || t.trade_type === 'BLOCK') && t.type === 'call').length;
    const sweepBlockPuts = classifiedTrades.filter((t: any) => (t.trade_type === 'SWEEP' || t.trade_type === 'BLOCK') && t.type === 'put').length;
    const sweepBlockScore = sweepBlockCount > 0 ? (sweepBlockCalls - sweepBlockPuts) / sweepBlockCount : 0;

    // Enhanced AlgoFlow Score with weighted components
    const algoFlowScore = (
      (aggressiveRatio * 0.30) +        // 30% - Aggressive trades (institutional conviction)
      (premiumRatio * 0.25) +           // 25% - Overall premium flow
      (sweepBlockScore * 0.20) +        // 20% - Sweep/Block institutional activity
      (pcRatioScore * 0.15) +           // 15% - Put/Call ratio sentiment
      (nonAggressiveRatio * 0.10)       // 10% - Non-aggressive trades (retail sentiment)
    );

    // Determine flow trend with enhanced thresholds
    let flowTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (algoFlowScore > 0.25) flowTrend = 'BULLISH';
    else if (algoFlowScore < -0.25) flowTrend = 'BEARISH';

    // Create time-based chart data (group by selected interval in ET time, market hours only)
    const intervalData: Record<string, { callsPlus: number; callsMinus: number; putsPlus: number; putsMinus: number }> = {};

    // US Market Holidays (2025-2026)
    const US_MARKET_HOLIDAYS = [
      '2025-01-01', // New Year's Day
      '2025-01-20', // MLK Day
      '2025-02-17', // Presidents Day
      '2025-04-18', // Good Friday
      '2025-05-26', // Memorial Day
      '2025-07-04', // Independence Day
      '2025-09-01', // Labor Day
      '2025-11-27', // Thanksgiving
      '2025-12-25', // Christmas
      '2026-01-01', // New Year's Day
      '2026-01-19', // MLK Day
      '2026-02-16', // Presidents Day
      '2026-04-03', // Good Friday
      '2026-05-25', // Memorial Day
      '2026-07-03', // Independence Day (observed)
      '2026-09-07', // Labor Day
      '2026-11-26', // Thanksgiving
      '2026-12-25', // Christmas
    ];

    // Get trading days based on chart timeframe
    const getTradingDays = (timeframe: '1D' | '3D' | '1W'): string[] => {
      const days: string[] = [];
      const now = new Date();
      const etNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));

      const daysNeeded = timeframe === '1D' ? 1 : timeframe === '3D' ? 3 : 5;
      let currentDate = new Date(etNow);
      currentDate.setDate(currentDate.getDate() - 1); // Start from yesterday

      while (days.length < daysNeeded) {
        const dayOfWeek = currentDate.getDay();
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${day}`;

        // Skip weekends AND holidays
        if (dayOfWeek !== 0 && dayOfWeek !== 6 && !US_MARKET_HOLIDAYS.includes(dateString)) {
          days.push(dateString);
        }
        currentDate.setDate(currentDate.getDate() - 1);
      }

      return days.reverse(); // Return in chronological order
    };

    const tradingDays = getTradingDays(chartTimeframe);

    // Initialize time slots based on selected interval and timeframe
    const getTimeSlots = (interval: string, timeframe: '1D' | '3D' | '1W') => {
      const slots: string[] = [];
      let intervalMinutes: number;

      // Convert interval to minutes
      switch (interval) {
        case '5min': intervalMinutes = 5; break;
        case '15min': intervalMinutes = 15; break;
        case '30min': intervalMinutes = 30; break;
        case '1hour': intervalMinutes = 60; break;
        default: intervalMinutes = 60;
      }

      // Market hours: 9:30 AM to 4:00 PM ET
      const marketOpenMinutes = 9 * 60 + 30; // 570 minutes = 9:30 AM
      const marketCloseMinutes = 16 * 60;    // 960 minutes = 4:00 PM

      if (timeframe === '1D') {
        // Single day: Generate time slots from market open through market close
        for (let totalMinutes = marketOpenMinutes; totalMinutes < marketCloseMinutes; totalMinutes += intervalMinutes) {
          const hour = Math.floor(totalMinutes / 60);
          const minute = totalMinutes % 60;
          const timeKey = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
          slots.push(timeKey);
        }
        // Always add the final market close slot (4:00 PM)
        slots.push('16:00');
      } else {
        // Multi-day: For each trading day, add key time points
        // Use 9:30AM, 12PM, 4PM for each day
        tradingDays.forEach(date => {
          slots.push(`${date}_09:30`);
          slots.push(`${date}_12:00`);
          slots.push(`${date}_16:00`);
        });
      }

      return slots;
    };

    const timeSlots = getTimeSlots(timeInterval, chartTimeframe);
    timeSlots.forEach(slot => {
      intervalData[slot] = { callsPlus: 0, callsMinus: 0, putsPlus: 0, putsMinus: 0 };
    });

    tradesWithExecution.forEach((trade: any) => {
      // Convert to ET time
      const tradeDate = new Date(trade.trade_timestamp);
      const etTime = new Date(tradeDate.toLocaleString("en-US", { timeZone: "America/New_York" }));
      const hour = etTime.getHours();
      const minute = etTime.getMinutes();
      const year = etTime.getFullYear();
      const month = String(etTime.getMonth() + 1).padStart(2, '0');
      const day = String(etTime.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;

      // Only include trades during market hours (9:30 AM - 4:00 PM ET)
      if (hour < 9 || hour > 16 || (hour === 9 && minute < 30)) return;

      // Find the appropriate time slot based on interval and timeframe
      let timeKey: string;

      if (chartTimeframe === '1D') {
        // Single day: Use time-only key
        const getTimeSlot = (h: number, m: number, interval: string) => {
          const totalMinutes = (h - 9) * 60 + (m - 30); // Minutes since 9:30 AM

          let slotMinutes: number;
          switch (interval) {
            case '5min':
              slotMinutes = Math.floor(totalMinutes / 5) * 5;
              break;
            case '15min':
              slotMinutes = Math.floor(totalMinutes / 15) * 15;
              break;
            case '30min':
              slotMinutes = Math.floor(totalMinutes / 30) * 30;
              break;
            case '1hour':
              slotMinutes = Math.floor(totalMinutes / 60) * 60;
              break;
            default:
              slotMinutes = Math.floor(totalMinutes / 60) * 60;
          }

          const slotHour = Math.floor((slotMinutes + 570) / 60); // 570 = 9:30 in minutes
          const slotMin = (slotMinutes + 570) % 60;

          return `${slotHour.toString().padStart(2, '0')}:${slotMin.toString().padStart(2, '0')}`;
        };
        timeKey = getTimeSlot(hour, minute, timeInterval);
      } else {
        // Multi-day: Match to closest key time point (9:30AM, 12PM, 4PM)
        if (hour < 12) {
          timeKey = `${dateKey}_09:30`;
        } else if (hour < 16) {
          timeKey = `${dateKey}_12:00`;
        } else {
          timeKey = `${dateKey}_16:00`;
        }
      }

      if (intervalData[timeKey]) {
        // Determine bullish/bearish based on fill_style ONLY
        let isBullish = false;

        if (trade.fill_style === 'A' || trade.fill_style === 'AA') {
          isBullish = true;
        } else if (trade.fill_style === 'B' || trade.fill_style === 'BB') {
          isBullish = false;
        } else {
          // For trades without fill_style, default to false (bearish)
          isBullish = false;
          console.log(`� BEARISH ${trade.type.toUpperCase()}: ${trade.fill_style} - $${trade.total_premium.toLocaleString()}`);
        }

        if (trade.type === 'call') {
          if (isBullish) {
            intervalData[timeKey].callsPlus += trade.total_premium;  // Calls+ = Bullish call buying
          } else {
            intervalData[timeKey].callsMinus += trade.total_premium; // Calls- = Bearish call selling
          }
        } else {
          if (isBullish) {
            intervalData[timeKey].putsPlus += trade.total_premium;   // Puts+ = Bullish put buying
          } else {
            intervalData[timeKey].putsMinus += trade.total_premium;  // Puts- = Bearish put selling
          }
        }
      }
    });

    const chartData = Object.entries(intervalData)
      // Cumulative sum logic
      .sort(([aTime], [bTime]) => {
        // Handle both single-day "HH:MM" and multi-day "YYYY-MM-DD_HH:MM" formats
        const aHasDate = aTime.includes('_');
        const bHasDate = bTime.includes('_');

        if (aHasDate && bHasDate) {
          // Multi-day: Sort by date first, then time
          const [aDate, aTimeStr] = aTime.split('_');
          const [bDate, bTimeStr] = bTime.split('_');
          if (aDate !== bDate) {
            return aDate.localeCompare(bDate);
          }
          const [aHours, aMinutes] = aTimeStr.split(':').map(Number);
          const [bHours, bMinutes] = bTimeStr.split(':').map(Number);
          return (aHours * 60 + aMinutes) - (bHours * 60 + bMinutes);
        } else {
          // Single-day: Sort by time only
          const [aHours, aMinutes] = aTime.split(':').map(Number);
          const [bHours, bMinutes] = bTime.split(':').map(Number);
          return (aHours * 60 + aMinutes) - (bHours * 60 + bMinutes);
        }
      })
      .reduce<Array<{
        time: number;
        timeLabel: string;
        callsPlus: number;
        callsMinus: number;
        putsPlus: number;
        putsMinus: number;
        netFlow: number;
        bullishTotal: number;
        bearishTotal: number;
      }>>((acc, [time, data], idx) => {
        // Convert time string to proper Date object for chart
        let timeDate: Date;
        let timeLabel: string;

        if (time.includes('_')) {
          // Multi-day format: "YYYY-MM-DD_HH:MM"
          const [dateStr, timeStr] = time.split('_');
          const [year, month, day] = dateStr.split('-').map(Number);
          const [hours, minutes] = timeStr.split(':').map(Number);
          timeDate = new Date(year, month - 1, day, hours, minutes);

          // Format as "MM/DD HH:MM AM/PM"
          const hour12 = hours % 12 === 0 ? 12 : hours % 12;
          const ampm = hours < 12 ? 'AM' : 'PM';
          timeLabel = `${month}/${day} ${hour12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
        } else {
          // Single-day format: "HH:MM"
          const [hours, minutes] = time.split(':').map(Number);
          const today = new Date();
          timeDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes);

          // Format as "HH:MM AM/PM"
          const hour12 = hours % 12 === 0 ? 12 : hours % 12;
          const ampm = hours < 12 ? 'AM' : 'PM';
          timeLabel = `${hour12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
        }

        // Get previous cumulative values
        const prev = acc.length > 0 ? acc[acc.length - 1] : {
          callsPlus: 0,
          callsMinus: 0,
          putsPlus: 0,
          putsMinus: 0,
          netFlow: 0,
          bullishTotal: 0,
          bearishTotal: 0
        };

        // Add current to previous for cumulative sum
        const cumulative = {
          time: timeDate.getTime(),
          timeLabel,
          callsPlus: prev.callsPlus + data.callsPlus,
          callsMinus: prev.callsMinus + data.callsMinus,
          putsPlus: prev.putsPlus + data.putsPlus,
          putsMinus: prev.putsMinus + data.putsMinus,
          netFlow: 0, // Initialize netFlow
          bullishTotal: 0, // Initialize bullishTotal
          bearishTotal: 0 // Initialize bearishTotal
        };
        cumulative.netFlow = (cumulative.callsPlus - cumulative.callsMinus) + (cumulative.putsPlus - cumulative.putsMinus);
        cumulative.bullishTotal = cumulative.callsPlus + cumulative.putsPlus;
        cumulative.bearishTotal = -(cumulative.callsMinus + cumulative.putsMinus); // Negative for bearish
        acc.push(cumulative);
        return acc;
      }, []);

    // 🚨 FETCH REAL PRICE DATA FROM POLYGON API - NO FAKE DATA!
    console.log(`� FETCHING REAL OHLC DATA from Polygon API for ${ticker}...`);

    let finalPriceData: Array<{
      time: number;
      open: number;
      high: number;
      low: number;
      close: number;
    }> = [];

    try {
      // Determine interval multiplier and timespan for Polygon API
      let multiplier = 1;
      let timespan = 'minute';

      switch (timeInterval) {
        case '5min':
          multiplier = 5;
          timespan = 'minute';
          break;
        case '15min':
          multiplier = 15;
          timespan = 'minute';
          break;
        case '30min':
          multiplier = 30;
          timespan = 'minute';
          break;
        case '1hour':
          multiplier = 60;
          timespan = 'minute';
          break;
        default:
          multiplier = 60;
          timespan = 'minute';
      }

      // Get last trading day (not current date)
      const tradingDays = getTradingDays(chartTimeframe);
      const lastTradingDay = tradingDays[tradingDays.length - 1]; // Most recent trading day
      const dateStr = lastTradingDay; // Already in YYYY-MM-DD format

      // Fetch REAL aggregated bars from Polygon
      const polygonUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${dateStr}/${dateStr}?adjusted=true&sort=asc&limit=50000&apiKey=${POLYGON_API_KEY}`;

      console.log(`📈 REAL DATA REQUEST: ${ticker} ${multiplier}${timespan} bars for ${dateStr}`);

      const response = await fetch(polygonUrl);
      const data = await response.json();

      if (data.results && data.results.length > 0) {
        console.log(`✅ REAL DATA RECEIVED: ${data.results.length} candlesticks from Polygon API`);

        // Convert Polygon results to our chart format
        finalPriceData = data.results.map((bar: any) => ({
          time: bar.t, // Polygon timestamp in milliseconds
          open: bar.o,
          high: bar.h,
          low: bar.l,
          close: bar.c
        }));

        console.log(`✅ REAL OHLC DATA LOADED: ${finalPriceData.length} real candlesticks`, finalPriceData.slice(0, 3));

      } else {
        console.warn(`⚠️ NO REAL DATA from Polygon for ${ticker} on ${dateStr} - chart will be empty`);
        finalPriceData = [];
      }

    } catch (error) {
      console.error(`❌ FAILED TO FETCH REAL PRICE DATA for ${ticker}:`, error);
      finalPriceData = [];
    }

    return {
      ticker,
      currentPrice,
      algoFlowScore,
      totalCallPremium,
      totalPutPremium,
      netFlow,
      sweepCount,
      blockCount,
      miniCount,

      callPutRatio,
      aggressiveCalls,
      aggressivePuts,
      flowTrend,
      chartData,
      priceData: finalPriceData,
      // YOUR REAL TIER SYSTEM counts
      tier1Count,
      tier2Count,
      tier3Count,
      tier4Count,
      tier5Count,
      tier6Count,
      tier7Count,
      tier8Count,
      // Return trades with fill_style
      trades: tradesWithExecution
    };
  };

  // Analysis state to handle async bid/ask analysis
  type ChartDataPoint = {
    time: number;
    timeLabel: string;
    callsPlus: number;
    callsMinus: number;
    putsPlus: number;
    putsMinus: number;
    netFlow: number;
  };

  const [analysis, setAnalysis] = useState<AlgoFlowAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState({ current: 0, total: 0 });

  // Effect to handle async analysis calculation
  // Function to perform analysis - will be called manually after volume/OI enrichment
  const performAnalysis = async (tradesData: any[]) => {
    if (tradesData.length > 0) {
      console.log(`🚀 Starting analysis for ${tradesData.length} flow trades`);
      setIsAnalyzing(true);
      try {
        const result = await calculateAlgoFlowAnalysis(tradesData);
        console.log(`📊 Analysis complete, result:`, result ? 'SUCCESS' : 'FAILED');

        // DIRECT FIX: Merge volume/OI data into analysis trades
        if (result && result.trades) {
          console.log(`🔧 MERGING VOLUME/OI DATA INTO ANALYSIS TRADES`);
          console.log(`🔍 SAMPLE ANALYSIS TICKER:`, result.trades[0]?.ticker);
          console.log(`🔍 SAMPLE ENRICHED TICKER:`, tradesData[0]?.ticker);

          result.trades = result.trades.map((analyzedTrade: any) => {
            console.log(`🔍 LOOKING FOR MATCH - Analysis: ${analyzedTrade.ticker} (${analyzedTrade.underlying_ticker} ${analyzedTrade.strike} ${analyzedTrade.expiry} ${analyzedTrade.type})`);

            // Find matching trade - try exact ticker first, then by contract details
            let enrichedTrade = tradesData.find(t => t.ticker === analyzedTrade.ticker);

            if (!enrichedTrade) {
              // Try matching by contract details since ticker formats may differ
              enrichedTrade = tradesData.find(t =>
                t.underlying_ticker === analyzedTrade.underlying_ticker &&
                t.strike === analyzedTrade.strike &&
                t.expiry === analyzedTrade.expiry &&
                t.type === analyzedTrade.type
              );
              console.log(`🔄 FALLBACK MATCH ATTEMPT:`, enrichedTrade ? `Found ${enrichedTrade.ticker}` : 'No match');
            }

            if (enrichedTrade && (enrichedTrade.volume !== undefined || enrichedTrade.open_interest !== undefined)) {
              console.log(`✅ MERGING VOL/OI: ${enrichedTrade.ticker} -> ${analyzedTrade.ticker} Vol=${enrichedTrade.volume} OI=${enrichedTrade.open_interest}`);
              return {
                ...analyzedTrade,
                volume: enrichedTrade.volume,
                open_interest: enrichedTrade.open_interest
              };
            } else {
              console.log(`❌ NO MATCH FOUND for ${analyzedTrade.ticker}`);
            }
            return analyzedTrade;
          });
        }

        console.log(`🎯 SETTING ANALYSIS STATE:`, !!result);
        console.log(`🔍 ANALYSIS TRADES SAMPLE:`, result?.trades?.[0] ? {
          ticker: result.trades[0].ticker,
          volume: result.trades[0].volume,
          open_interest: result.trades[0].open_interest,
          hasVolume: !!result.trades[0].volume,
          hasOI: !!result.trades[0].open_interest
        } : 'NO TRADES');
        setAnalysis(result);
        console.log(`✅ ANALYSIS STATE SET - Should show table now!`);
      } catch (error) {
        console.error('❌ Error in bid/ask analysis:', error);
        console.log(`❌ CLEARING ANALYSIS STATE due to error`);
        setAnalysis(null);
      } finally {
        setIsAnalyzing(false);
      }
    } else {
      console.log(`❌ CLEARING ANALYSIS STATE - no flow data`);
      setAnalysis(null);
    }
  };

  // Clear analysis when flowData changes (but don't auto-run analysis)
  useEffect(() => {
    if (flowData.length === 0) {
      setAnalysis(null);
    }
  }, [flowData]);

  // Re-analyze when chart timeframe changes
  useEffect(() => {
    if (flowData.length > 0) {
      performAnalysis(flowData);
    }
  }, [chartTimeframe]);

  // Auto-load SPY data on component mount
  // Removed auto-loading of SPY data - let users search for their own ticker

  // Fetch flow data for specific ticker
  const fetchTickerFlow = async (tickerToSearch: string) => {
    if (!tickerToSearch.trim()) return;

    setLoading(true);
    setError('');
    setStreamStatus('Connecting...');
    console.log(`🔄 CLEARING FLOW DATA - Timeframe: ${scanTimeframe}`);
    setFlowData([]);
    liveOICache.clear(); // Clear Live OI cache when starting new search
    setIsStreamComplete(false);

    try {
      const eventSource = new EventSource(`/api/stream-options-flow?ticker=${tickerToSearch.toUpperCase()}&timeframe=${scanTimeframe}`);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log(`📡 RECEIVED EVENT TYPE: ${data.type}`, data);

          switch (data.type) {
            case 'status':
              setStreamStatus(data.message);
              break;

            case 'trades':
              if (data.trades?.length > 0 && !isStreamComplete) {
                setFlowData(prev => {
                  const newTrades = [...prev, ...data.trades];
                  console.log(`🔄 ADDING ${data.trades.length} STREAMING TRADES (total: ${newTrades.length})`);
                  return newTrades;
                });
              } else if (isStreamComplete) {
                console.log(`⚠️ IGNORING ${data.trades?.length || 0} TRADES - STREAM ALREADY COMPLETE`);
              }
              setStreamStatus(data.status || 'Processing trades...');
              break;

            case 'complete':
              setStreamStatus('Scan complete');
              setIsStreamComplete(true); // Set completion flag IMMEDIATELY
              console.log('🔒 STREAM MARKED AS COMPLETE - NO MORE TRADES WILL BE ACCEPTED');
              if (data.trades?.length > 0) {
                // Fetch volume and open interest data for all trades
                console.log(`🚀 STARTING VOLUME/OI FETCH FOR ${data.trades.length} TRADES`);
                console.log('🔍 SAMPLE TRADE BEFORE VOL/OI:', data.trades[0]);
                setStreamStatus('Fetching volume/OI data...');
                fetchVolumeAndOpenInterest(data.trades)
                  .then(tradesWithVolOI => {
                    console.log('✅ VOL/OI FETCH COMPLETE!');
                    console.log('🔍 SAMPLE TRADE AFTER VOL/OI:', tradesWithVolOI[0]);
                    console.log(`📊 TRADES WITH VOLUME: ${tradesWithVolOI.filter(t => t.volume && t.volume > 0).length}`);
                    console.log(`📊 TRADES WITH OI: ${tradesWithVolOI.filter(t => t.open_interest && t.open_interest > 0).length}`);
                    // REPLACE all flowData with the volume/OI enriched trades
                    console.log('🔄 REPLACING ALL FLOW DATA WITH VOL/OI DATA');
                    console.log('🔍 FINAL ENRICHED TRADE SAMPLE:', tradesWithVolOI[0]);
                    setFlowData(tradesWithVolOI);
                    liveOICache.clear(); // Clear cache when new data loaded

                    setIsStreamComplete(true);
                    setStreamStatus('Complete with volume/OI data');
                    setLoading(false);

                    // NOW run analysis with the enriched data
                    console.log(`🎯 STARTING ANALYSIS WITH ENRICHED DATA`);
                    console.log(`🔍 ENRICHED DATA SAMPLE FOR ANALYSIS:`, tradesWithVolOI[0] ? {
                      ticker: tradesWithVolOI[0].ticker,
                      volume: tradesWithVolOI[0].volume,
                      open_interest: tradesWithVolOI[0].open_interest
                    } : 'NO DATA');
                    console.log(`🔍 ALL ENRICHED TICKERS:`, tradesWithVolOI.map(t => ({ ticker: t.ticker, vol: t.volume, oi: t.open_interest })));
                    performAnalysis(tradesWithVolOI).catch(error => {
                      console.error('❌ Error running analysis with enriched data:', error);
                    });
                  })
                  .catch(volError => {
                    console.error('Error fetching volume/OI:', volError);
                    // Fallback: use trades without vol/OI data
                    setFlowData(data.trades);
                    liveOICache.clear(); // Clear cache when new data loaded
                    setStreamStatus('Complete (volume/OI unavailable)');
                    setLoading(false);
                  });
              } else {
                setError(`No options flow data found for ${tickerToSearch}`);
                setLoading(false);
              }
              eventSource.close();
              break;

            case 'error':
              setError(data.error || 'Stream error occurred');
              setLoading(false);
              eventSource.close();
              break;
          }
        } catch (parseError) {
          console.error('Error parsing stream data:', parseError);
        }
      };

      eventSource.onerror = (error) => {
        // Only log errors if stream hasn't completed successfully
        if (!isStreamComplete) {
          console.warn('⚠️ EventSource connection issue');
          setError('Stream connection unavailable');
          setLoading(false);
        }
        eventSource.close();
      };

      // Cleanup on component unmount
      return () => eventSource.close();

    } catch (error) {
      setError('Failed to start flow analysis');
      setLoading(false);
    }
  };

  const handleSearch = () => {
    if (ticker.trim()) {
      setSearchTicker(ticker.toUpperCase());
      fetchTickerFlow(ticker);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  const getScoreColor = (score: number) => {
    if (score > 0.3) return 'text-green-400';
    if (score < -0.3) return 'text-red-400';
    return 'text-yellow-400';
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'BULLISH': return 'text-green-400 bg-green-400/10';
      case 'BEARISH': return 'text-red-400 bg-red-400/10';
      default: return 'text-yellow-400 bg-yellow-400/10';
    }
  };

  // Gauge component
  const GaugeChart = ({ value, max, label, color }: { value: number; max: number; label: string; color: string }) => {
    const percentage = Math.min((Math.abs(value) / max) * 100, 100);
    const rotation = (percentage / 100) * 180 - 90;

    return (
      <div className="flex flex-col items-center">
        <div className="relative w-32 h-16 overflow-hidden">
          <div className="absolute inset-0 border-4 border-white/10 rounded-t-full"></div>
          <div
            className="absolute bottom-0 left-1/2 w-1 h-16 origin-bottom transition-transform duration-500"
            style={{
              transform: `translateX(-50%) rotate(${rotation}deg)`,
              background: color
            }}
          >
            <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full`} style={{ background: color }}></div>
          </div>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-4 bg-white rounded-full border-2 border-black"></div>
        </div>
        <div className={`text-2xl font-black mt-2`} style={{ color }}>{value.toFixed(3)}</div>
        <div className="text-xs text-white uppercase tracking-widest font-bold mt-1">{label}</div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-black p-6">
      {/* HEADER BAR */}
      <div className="bg-black border-b border-white/20 pb-4 mb-6">
        <div className="flex items-center justify-between">
          <h1 className="text-white text-3xl font-black tracking-wider">ALGOFLOW INTELLIGENCE</h1>
          <div className="flex items-center gap-4">
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              onKeyPress={handleKeyPress}
              placeholder="TICKER"
              className="w-40 px-4 py-2 bg-black border border-white text-white placeholder-white/50 focus:outline-none focus:border-cyan-400 font-bold text-lg tracking-widest"
              disabled={loading}
            />
            <select
              value={scanTimeframe}
              onChange={(e) => setScanTimeframe(e.target.value as '1D' | '3D' | '1W')}
              className="px-4 py-2 bg-black border border-white text-white focus:outline-none focus:border-cyan-400 font-bold text-sm tracking-widest"
              disabled={loading}
            >
              <option value="1D">1D</option>
              <option value="3D">3D</option>
              <option value="1W">1W</option>
            </select>
            <button
              onClick={handleSearch}
              disabled={loading || !ticker.trim()}
              className="px-8 py-2 bg-white text-black font-black text-sm tracking-widest hover:bg-cyan-400 hover:text-black disabled:opacity-30 transition-all"
            >
              {loading ? 'SCANNING' : 'ANALYZE'}
            </button>
          </div>
        </div>
        {streamStatus && (
          <div className="mt-2 text-xs text-cyan-400 font-bold tracking-wider">
            {streamStatus}
          </div>
        )}
        {error && (
          <div className="mt-2 text-xs text-red-500 font-bold tracking-wider">
            {error}
          </div>
        )}
      </div>



      {/* LOADING STATE */}
      {isAnalyzing && flowData.length > 0 && (
        <div className="bg-black border border-white/20 p-8">
          <div className="flex items-center justify-center gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-cyan-400 border-t-transparent"></div>
            <div className="text-white text-lg font-bold tracking-wider">
              ANALYZING {flowData.length} TRADES
            </div>
          </div>
          {analysisProgress.total > 0 && (
            <div className="mt-6">
              <div className="flex justify-between text-xs text-white mb-2 font-bold tracking-wider">
                <span>PROGRESS</span>
                <span>{analysisProgress.current}/{analysisProgress.total}</span>
              </div>
              <div className="w-full bg-white/10 h-1">
                <div
                  className="bg-cyan-400 h-1 transition-all duration-300"
                  style={{ width: `${(analysisProgress.current / analysisProgress.total) * 100}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>
      )}


      {analysis && (
        <div className="space-y-6">
          {/* TICKER HEADER */}
          <div className="bg-black border border-white p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <h2 className="text-white text-5xl font-black tracking-wider">{analysis.ticker}</h2>
                <div className="text-white text-3xl font-black">${analysis.currentPrice.toFixed(2)}</div>
                <div className={`px-4 py-1 border-2 font-black text-sm tracking-widest ${analysis.flowTrend === 'BULLISH' ? 'border-green-500 text-green-500' :
                    analysis.flowTrend === 'BEARISH' ? 'border-red-500 text-red-500' :
                      'border-yellow-500 text-yellow-500'
                  }`}>
                  {analysis.flowTrend}
                </div>
              </div>
            </div>
          </div>

          {/* GAUGES SECTION */}
          <div className="grid grid-cols-4 gap-6">
            {/* AlgoFlow Score Gauge */}
            <div className="bg-black border border-white p-6">
              <GaugeChart
                value={analysis.algoFlowScore}
                max={1}
                label="ALGOFLOW SCORE"
                color={analysis.algoFlowScore > 0.3 ? '#10b981' : analysis.algoFlowScore < -0.3 ? '#ef4444' : '#eab308'}
              />
            </div>

            {/* Net Flow Gauge */}
            <div className="bg-black border border-white p-6">
              <div className="flex flex-col items-center">
                <div className="text-5xl font-black mb-2" style={{ color: analysis.netFlow >= 0 ? '#10b981' : '#ef4444' }}>
                  {formatCurrency(analysis.netFlow)}
                </div>
                <div className="text-xs text-white uppercase tracking-widest font-bold">NET FLOW</div>
                <div className="w-full h-2 bg-white/10 mt-4">
                  <div
                    className="h-2 transition-all"
                    style={{
                      width: `${Math.abs((analysis.netFlow / (analysis.totalCallPremium + analysis.totalPutPremium)) * 100)}%`,
                      backgroundColor: analysis.netFlow >= 0 ? '#10b981' : '#ef4444'
                    }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Sweeps vs Blocks */}
            <div className="bg-black border border-white p-6">
              <div className="flex flex-col items-center">
                <div className="flex items-center justify-center gap-8 mb-4">
                  <div className="text-center">
                    <div className="text-4xl font-black text-yellow-500">{analysis.sweepCount}</div>
                    <div className="text-xs text-white uppercase tracking-widest font-bold mt-1">SWEEPS</div>
                  </div>
                  <div className="text-white text-2xl font-black">VS</div>
                  <div className="text-center">
                    <div className="text-4xl font-black text-cyan-400">{analysis.blockCount}</div>
                    <div className="text-xs text-white uppercase tracking-widest font-bold mt-1">BLOCKS</div>
                  </div>
                </div>
                <div className="w-full h-2 bg-white/10 flex">
                  <div
                    className="h-2 bg-yellow-500"
                    style={{ width: `${(analysis.sweepCount / (analysis.sweepCount + analysis.blockCount)) * 100}%` }}
                  ></div>
                  <div
                    className="h-2 bg-cyan-400"
                    style={{ width: `${(analysis.blockCount / (analysis.sweepCount + analysis.blockCount)) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>

            {/* P/C Ratio Gauge */}
            <div className="bg-black border border-white p-6">
              <div className="flex flex-col items-center">
                <div className="text-5xl font-black text-white mb-2">{analysis.callPutRatio.toFixed(2)}</div>
                <div className="text-xs text-white uppercase tracking-widest font-bold">P/C RATIO</div>
                <div className="flex items-center gap-4 mt-4 w-full">
                  <div className="flex-1">
                    <div className="text-xs text-white uppercase tracking-widest font-bold mb-1">CALLS</div>
                    <div className="h-8 bg-green-500 flex items-center justify-center">
                      <span className="text-black font-black text-sm">{analysis.aggressiveCalls}</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-white uppercase tracking-widest font-bold mb-1">PUTS</div>
                    <div className="h-8 bg-red-500 flex items-center justify-center">
                      <span className="text-black font-black text-sm">{analysis.aggressivePuts}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* PREMIUM METRICS */}
          <div className="grid grid-cols-6 gap-4">
            <div className="bg-black border border-white p-4">
              <div className="text-xs text-white uppercase tracking-widest font-bold mb-2">CALLS PREMIUM</div>
              <div className="text-2xl font-black text-green-500">{formatCurrency(analysis.totalCallPremium)}</div>
            </div>
            <div className="bg-black border border-white p-4">
              <div className="text-xs text-white uppercase tracking-widest font-bold mb-2">PUTS PREMIUM</div>
              <div className="text-2xl font-black text-red-500">{formatCurrency(analysis.totalPutPremium)}</div>
            </div>
            <div className="bg-black border border-white p-4">
              <div className="text-xs text-white uppercase tracking-widest font-bold mb-2">TOTAL VOLUME</div>
              <div className="text-2xl font-black text-white">{flowData.reduce((sum, trade) => sum + trade.trade_size, 0).toLocaleString()}</div>
            </div>
            <div className="bg-black border border-white p-4">
              <div className="text-xs text-white uppercase tracking-widest font-bold mb-2">TIER 1</div>
              <div className="text-2xl font-black text-red-500">{analysis.tier1Count}</div>
            </div>
            <div className="bg-black border border-white p-4">
              <div className="text-xs text-white uppercase tracking-widest font-bold mb-2">TIER 2</div>
              <div className="text-2xl font-black text-yellow-500">{analysis.tier2Count}</div>
            </div>
            <div className="bg-black border border-white p-4">
              <div className="text-xs text-white uppercase tracking-widest font-bold mb-2">MINI</div>
              <div className="text-2xl font-black text-white">{analysis.miniCount}</div>
            </div>
          </div>

          {/* PREMIUM FLOW CHART */}
          <div className="bg-black border border-white">
            <div className="border-b border-white p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-white text-xl font-black tracking-wider">PREMIUM FLOW ANALYSIS</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setChartTimeframe('1D')}
                    className={`px-4 py-1 font-black text-xs tracking-widest transition-all ${chartTimeframe === '1D'
                        ? 'bg-white text-black'
                        : 'bg-black text-white border border-white hover:bg-white hover:text-black'
                      }`}
                  >
                    1D
                  </button>
                  <button
                    onClick={() => setChartTimeframe('3D')}
                    className={`px-4 py-1 font-black text-xs tracking-widest transition-all ${chartTimeframe === '3D'
                        ? 'bg-white text-black'
                        : 'bg-black text-white border border-white hover:bg-white hover:text-black'
                      }`}
                  >
                    3D
                  </button>
                  <button
                    onClick={() => setChartTimeframe('1W')}
                    className={`px-4 py-1 font-black text-xs tracking-widest transition-all ${chartTimeframe === '1W'
                        ? 'bg-white text-black'
                        : 'bg-black text-white border border-white hover:bg-white hover:text-black'
                      }`}
                  >
                    1W
                  </button>
                  <div className="w-px bg-white mx-2"></div>
                  <button
                    onClick={() => setChartViewMode('detailed')}
                    className={`px-4 py-1 font-black text-xs tracking-widest transition-all ${chartViewMode === 'detailed'
                        ? 'bg-cyan-400 text-black'
                        : 'bg-black text-white border border-white hover:bg-cyan-400 hover:text-black'
                      }`}
                  >
                    ALL
                  </button>
                  <button
                    onClick={() => setChartViewMode('simplified')}
                    className={`px-4 py-1 font-black text-xs tracking-widest transition-all ${chartViewMode === 'simplified'
                        ? 'bg-cyan-400 text-black'
                        : 'bg-black text-white border border-white hover:bg-cyan-400 hover:text-black'
                      }`}
                  >
                    BULL/BEAR
                  </button>
                  <button
                    onClick={() => setChartViewMode('net')}
                    className={`px-4 py-1 font-black text-xs tracking-widest transition-all ${chartViewMode === 'net'
                        ? 'bg-cyan-400 text-black'
                        : 'bg-black text-white border border-white hover:bg-cyan-400 hover:text-black'
                      }`}
                  >
                    NET
                  </button>
                </div>
              </div>
            </div>
            <div className="p-4 bg-black">
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analysis.chartData}>
                    <XAxis
                      dataKey="timeLabel"
                      stroke="#fff"
                      tick={{ fill: '#fff', fontSize: 11, fontWeight: 'bold' }}
                      height={40}
                    />
                    <YAxis
                      stroke="#fff"
                      tick={{ fill: '#fff', fontSize: 12, fontWeight: 'bold' }}
                      tickFormatter={(value) => {
                        const absValue = Math.abs(value);
                        const sign = value < 0 ? '-' : '';
                        if (absValue >= 1000000) return `${sign}$${(absValue / 1000000).toFixed(1)}M`;
                        if (absValue >= 1000) return `${sign}$${(absValue / 1000).toFixed(0)}K`;
                        return `${sign}$${absValue}`;
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#000',
                        border: '1px solid #fff',
                        fontWeight: 'bold',
                        fontSize: '12px'
                      }}
                      labelStyle={{ color: '#fff', fontWeight: 'bold' }}
                      formatter={(value: any) => {
                        const num = Number(value);
                        const absNum = Math.abs(num);
                        const sign = num < 0 ? '-' : '';
                        if (absNum >= 1000000) return `${sign}$${(absNum / 1000000).toFixed(2)}M`;
                        if (absNum >= 1000) return `${sign}$${(absNum / 1000).toFixed(1)}K`;
                        return `${sign}$${absNum.toLocaleString()}`;
                      }}
                    />
                    <Legend
                      wrapperStyle={{ color: '#fff', fontWeight: 'bold' }}
                      iconType="line"
                    />

                    {chartViewMode === 'detailed' ? (
                      <>
                        <Line type="monotone" dataKey="callsPlus" stroke="#10b981" strokeWidth={2} name="BULLISH CALLS" dot={false} />
                        <Line type="monotone" dataKey="callsMinus" stroke="#3b82f6" strokeWidth={2} name="BEARISH CALLS" dot={false} />
                        <Line type="monotone" dataKey="putsPlus" stroke="#f59e0b" strokeWidth={2} name="BULLISH PUTS" dot={false} />
                        <Line type="monotone" dataKey="putsMinus" stroke="#ef4444" strokeWidth={2} name="BEARISH PUTS" dot={false} />
                      </>
                    ) : chartViewMode === 'simplified' ? (
                      <>
                        <Line type="monotone" dataKey="bullishTotal" stroke="#10b981" strokeWidth={3} name="BULLISH FLOW" dot={false} />
                        <Line type="monotone" dataKey="bearishTotal" stroke="#ef4444" strokeWidth={3} name="BEARISH FLOW" dot={false} />
                      </>
                    ) : (
                      <Line
                        type="monotone"
                        dataKey="netFlow"
                        stroke="#10b981"
                        strokeWidth={3}
                        name="NET FLOW"
                        dot={false}
                        segment={(props: any) => {
                          const { points } = props;
                          if (!points || points.length < 2) return null;
                          const [start, end] = points;
                          const isNegative = start.payload.netFlow < 0 || end.payload.netFlow < 0;
                          return (
                            <path
                              d={`M ${start.x},${start.y} L ${end.x},${end.y}`}
                              stroke={isNegative ? '#ef4444' : '#10b981'}
                              strokeWidth={3}
                              fill="none"
                            />
                          );
                        }}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* TRADES TABLE */}
          <div className="bg-black border border-white">
            <div className="border-b border-white p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-white text-xl font-black tracking-wider">ALGOFLOW TRADES</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowMobileDetails(!showMobileDetails)}
                    className="md:hidden px-3 py-1 bg-white text-black text-xs font-black tracking-wider hover:bg-cyan-400"
                  >
                    {showMobileDetails ? 'HIDE' : 'SHOW'}
                  </button>
                </div>
              </div>
            </div>

            {/* Filter Indicators */}
            {(selectedStrike !== null || selectedExpiry !== null) && (
              <div className="bg-cyan-400/10 border-b border-cyan-400/30 p-3 flex items-center justify-between">
                <div className="text-cyan-400 text-xs font-bold tracking-wider flex items-center gap-4">
                  {selectedStrike !== null && (
                    <span>STRIKE: ${selectedStrike}</span>
                  )}
                  {selectedExpiry !== null && (
                    <span>EXPIRY: {selectedExpiry.split('T')[0]}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  {selectedStrike !== null && (
                    <button
                      onClick={() => setSelectedStrike(null)}
                      className="text-cyan-400 hover:text-white text-xs font-bold tracking-wider"
                    >
                      CLEAR STRIKE
                    </button>
                  )}
                  {selectedExpiry !== null && (
                    <button
                      onClick={() => setSelectedExpiry(null)}
                      className="text-cyan-400 hover:text-white text-xs font-bold tracking-wider"
                    >
                      CLEAR EXPIRY
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setSelectedStrike(null);
                      setSelectedExpiry(null);
                    }}
                    className="text-white hover:text-cyan-400 text-xs font-black tracking-wider"
                  >
                    CLEAR ALL
                  </button>
                </div>
              </div>
            )}

            <div className="bg-black overflow-x-auto">
              <table className="w-full border-collapse">
                <thead className="bg-black sticky top-0 z-10 border-b border-white">
                  <tr>
                    <th
                      className="text-left p-3 text-white font-black text-xs tracking-widest cursor-pointer hover:text-cyan-400 transition-colors"
                      onClick={() => {
                        if (sortColumn === 'trade_timestamp') {
                          setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortColumn('trade_timestamp');
                          setSortDirection('desc');
                        }
                      }}
                    >
                      TIME {sortColumn === 'trade_timestamp' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="text-left p-3 text-white font-black text-xs tracking-widest cursor-pointer hover:text-cyan-400 transition-colors"
                      onClick={() => {
                        if (sortColumn === 'underlying_ticker') {
                          setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortColumn('underlying_ticker');
                          setSortDirection('asc');
                        }
                      }}
                    >
                      SYMBOL {sortColumn === 'underlying_ticker' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="text-left p-3 text-white font-black text-xs tracking-widest">TYPE</th>
                    <th
                      className="text-left p-3 text-white font-black text-xs tracking-widest cursor-pointer hover:text-cyan-400 transition-colors"
                      onClick={() => {
                        if (sortColumn === 'strike') {
                          setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortColumn('strike');
                          setSortDirection('desc');
                        }
                      }}
                    >
                      STRIKE {sortColumn === 'strike' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="text-left p-3 text-white font-black text-base tracking-widest cursor-pointer hover:text-cyan-400 transition-colors"
                      onClick={() => {
                        if (sortColumn === 'trade_size') {
                          setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortColumn('trade_size');
                          setSortDirection('desc');
                        }
                      }}
                    >
                      PURCHASE {sortColumn === 'trade_size' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="text-left p-3 text-white font-black text-base tracking-widest cursor-pointer hover:text-cyan-400 transition-colors"
                      onClick={() => {
                        if (sortColumn === 'total_premium') {
                          setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortColumn('total_premium');
                          setSortDirection('desc');
                        }
                      }}
                    >
                      PREMIUM {sortColumn === 'total_premium' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="text-left p-3 text-white font-black text-base tracking-widest">SPOT</th>
                    <th className="text-left p-3 text-white font-black text-base tracking-widest">EXPIRY</th>
                    <th className="text-left p-3 text-white font-black text-base tracking-widest">VOL/OI</th>
                    <th className="text-left p-3 text-white font-black text-base tracking-widest">LIVE OI</th>
                    <th className="text-left p-3 text-white font-black text-base tracking-widest">STYLE</th>
                  </tr>
                </thead>
                <tbody className="bg-black">
                  {(() => {
                    let tradesToDisplay = analysis?.trades || flowData;
                    if (selectedStrike !== null) {
                      tradesToDisplay = tradesToDisplay.filter(trade => trade.strike === selectedStrike);
                    }
                    if (selectedExpiry !== null) {
                      tradesToDisplay = tradesToDisplay.filter(trade => trade.expiry === selectedExpiry);
                    }
                    const sortedTrades = [...tradesToDisplay].sort((a: any, b: any) => {
                      let aVal = a[sortColumn];
                      let bVal = b[sortColumn];
                      if (sortColumn === 'trade_timestamp') {
                        aVal = new Date(aVal).getTime();
                        bVal = new Date(bVal).getTime();
                      }
                      if (sortDirection === 'asc') {
                        return aVal > bVal ? 1 : -1;
                      } else {
                        return aVal < bVal ? 1 : -1;
                      }
                    });
                    const startIndex = (currentPage - 1) * TRADES_PER_PAGE;
                    const endIndex = startIndex + TRADES_PER_PAGE;
                    const paginatedTrades = sortedTrades.slice(startIndex, endIndex);

                    return paginatedTrades.map((trade, idx) => {
                      const tradeTypeColors: Record<string, string> = {
                        'SWEEP': 'text-[rgb(255,215,0)]',
                        'BLOCK': 'text-[rgb(0,153,255)]',
                        'MINI': 'text-[rgb(0,255,94)]',
                        'MULTI-LEG': 'text-[rgb(168,85,247)]'
                      };
                      const fillColors: Record<string, string> = {
                        'A': 'text-green-500',
                        'B': 'text-red-500',
                        'AA': 'text-green-400',
                        'BB': 'text-red-400',
                        'N/A': 'text-white/30'
                      };

                      return (
                        <tr key={idx} className="border-b border-white/10 hover:bg-white/5 transition-colors">
                          <td className="p-3 text-white text-base font-bold">
                            {(scanTimeframe === '3D' || scanTimeframe === '1W')
                              ? new Date(trade.trade_timestamp).toLocaleString('en-US', {
                                month: 'numeric',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                                timeZone: 'America/New_York'
                              })
                              : new Date(trade.trade_timestamp).toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit',
                                second: '2-digit',
                                timeZone: 'America/New_York'
                              })
                            }
                          </td>
                          <td className="p-3 text-white text-lg font-black tracking-wider">{trade.underlying_ticker}</td>
                          <td className="p-3">
                            <span className={`text-base font-black tracking-wider ${trade.type === 'call' ? 'text-[rgb(0,255,94)]' : 'text-[rgb(255,0,0)]'
                              }`}>
                              {trade.type.toUpperCase()}
                            </span>
                          </td>
                          <td className="p-3">
                            <button
                              onClick={() => setSelectedStrike(selectedStrike === trade.strike ? null : trade.strike)}
                              className={`text-white text-lg font-bold hover:text-cyan-400 transition-colors ${selectedStrike === trade.strike ? 'text-cyan-400' : ''
                                }`}
                            >
                              ${trade.strike}
                            </button>
                          </td>
                          <td className="p-3 text-white text-lg font-bold">
                            {trade.trade_size.toLocaleString()}@${trade.premium_per_contract.toFixed(2)}
                            <span className={`ml-2 text-base font-black ${fillColors[trade.fill_style || 'N/A']}`}>
                              {trade.fill_style || 'N/A'}
                            </span>
                          </td>
                          <td className="p-3 text-white text-lg font-bold">${trade.total_premium.toLocaleString()}</td>
                          <td className="p-3 text-white text-base font-bold">${trade.spot_price?.toFixed(2) || 'N/A'}</td>
                          <td className="p-3">
                            <button
                              onClick={() => setSelectedExpiry(selectedExpiry === trade.expiry ? null : trade.expiry)}
                              className={`text-white text-base font-bold hover:text-cyan-400 transition-colors ${selectedExpiry === trade.expiry ? 'text-cyan-400' : ''
                                }`}
                            >
                              {trade.expiry.split('T')[0]}
                            </button>
                          </td>
                          <td className="p-3">
                            <div className="text-base font-bold">
                              <div className="text-[rgb(0,153,255)]">V: {trade.volume?.toLocaleString() || 'N/A'}</div>
                              <div className="text-[rgb(0,255,94)]">O: {trade.open_interest?.toLocaleString() || 'N/A'}</div>
                            </div>
                          </td>
                          <td className="p-3 text-yellow-500 text-base font-bold">
                            {(() => {
                              const contractKey = `${trade.underlying_ticker}_${trade.strike}_${trade.type}_${trade.expiry}`;
                              const originalOI = trade.open_interest || 0;
                              const allTrades = analysis?.trades || flowData || [];
                              const liveOI = calculateLiveOI(originalOI, allTrades, contractKey);
                              const change = liveOI - originalOI;
                              const changeText = change > 0 ? `+${change}` : change < 0 ? `${change}` : '±0';
                              return `${liveOI.toLocaleString()} (${changeText})`;
                            })()}
                          </td>
                          <td className="p-3">
                            <span className={`px-3 py-1 text-base font-black tracking-wider ${tradeTypeColors[trade.trade_type as keyof typeof tradeTypeColors] || tradeTypeColors['MINI']}`}>
                              {trade.trade_type || 'MINI'}
                            </span>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>

            {/* PAGINATION */}
            {(() => {
              const tradesToDisplay = analysis?.trades || flowData;
              const totalPages = Math.ceil(tradesToDisplay.length / TRADES_PER_PAGE);

              if (totalPages > 1) {
                return (
                  <div className="border-t border-white p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-white text-xs font-bold tracking-wider">
                        SHOWING {((currentPage - 1) * TRADES_PER_PAGE) + 1} - {Math.min(currentPage * TRADES_PER_PAGE, tradesToDisplay.length)} OF {tradesToDisplay.length}
                      </div>
                      <div className="flex gap-2 items-center">
                        <button
                          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                          disabled={currentPage === 1}
                          className="px-4 py-1 bg-white text-black font-black text-xs tracking-wider hover:bg-cyan-400 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          PREV
                        </button>
                        <div className="flex gap-1">
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
                                className={`px-3 py-1 text-xs font-black tracking-wider ${currentPage === pageNum
                                    ? 'bg-cyan-400 text-black'
                                    : 'bg-black text-white border border-white hover:bg-white hover:text-black'
                                  }`}
                              >
                                {pageNum}
                              </button>
                            );
                          })}
                        </div>
                        <button
                          onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                          disabled={currentPage === totalPages}
                          className="px-4 py-1 bg-white text-black font-black text-xs tracking-wider hover:bg-cyan-400 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          NEXT
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            {flowData.length === 0 && (
              <div className="p-12 text-center text-white text-lg font-bold tracking-wider">
                NO TRADES FOUND. SEARCH FOR A TICKER TO SEE ALGOFLOW TRADES.
              </div>
            )}
          </div>
        </div>
      )}

      {/* NO RESULTS STATE */}
      {!loading && !isAnalyzing && !analysis && searchTicker && (
        <div className="bg-black border border-white p-12 text-center">
          <div className="text-white text-lg font-bold tracking-wider">
            NO FLOW DATA FOUND FOR {searchTicker}
          </div>
          <div className="text-white/50 text-sm font-bold tracking-wider mt-2">
            TRY A DIFFERENT TICKER OR CHECK IF THE MARKET IS OPEN
          </div>
        </div>
      )}
    </div>
  );
}