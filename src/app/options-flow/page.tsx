'use client';

import React, { useState, useEffect } from 'react';
import { OptionsFlowTable } from '@/components/OptionsFlowTable';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Polygon API key
const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

// VOL/OI ENRICHMENT - Same as AlgoFlow
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
 trade_type: 'SWEEP' | 'BLOCK' | 'MULTI-LEG' | 'MINI';
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
 trade_types: { BLOCK: 0, SWEEP: 0, 'MULTI-LEG': 0, MINI: 0 },
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
 const [selectedTicker, setSelectedTicker] = useState('ALL');
 const [streamingStatus, setStreamingStatus] = useState<string>('');
 const [streamingProgress, setStreamingProgress] = useState<{current: number, total: number} | null>(null);
 const [streamError, setStreamError] = useState<string>('');
 const [retryCount, setRetryCount] = useState<number>(0);
 const [isStreamComplete, setIsStreamComplete] = useState<boolean>(false);

 // Live options flow fetch
 const fetchOptionsFlowStreaming = async (currentRetry: number = 0) => {
 setLoading(true);
 setStreamError('');
 
 try {
 console.log(` Fetching live streaming options flow data...`);
 // Keep existing trades and add new ones as they stream in
 
 } catch (dbError) {
 console.warn('Error checking database, proceeding with streaming:', dbError);
 // Keep existing data on error
 }
 
 try {
 const eventSource = new EventSource(`/api/stream-options-flow?ticker=${selectedTicker}`);
 
 eventSource.onmessage = (event) => {
 try {
 const streamData = JSON.parse(event.data);
 
 switch (streamData.type) {
 case 'connected':
 console.log('✅ Stream connected:', streamData.message);
 setStreamingStatus('Connected - scanning options flow...');
 setStreamError('');
 break;
 
 case 'status':
 setStreamingStatus(streamData.message);
 console.log(` Stream Status: ${streamData.message}`);
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
 
 case 'complete':
 // CLOSE STREAM FIRST to prevent errors
 console.log(` Stream Complete: Total ${streamData.summary.total_trades} trades`);
 eventSource.close();
 
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
 setIsStreamComplete(true);
 
 // ACCUMULATE trades - don't replace, add new ones to existing
 if (completeTrades.length > 0) {
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
 
 console.log(`� ACCUMULATING: ${newTrades.length} new trades added to existing ${prevData.length} (${completeTrades.length} received)`);
 
 const updatedTrades = [...prevData, ...newTrades];
 console.log(`✅ Total trades now: ${updatedTrades.length}`);
 
 // Enrich only the NEW trades
 if (newTrades.length > 0) {
 setTimeout(() => {
 console.log(`🚀 ENRICHING ${newTrades.length} NEW TRADES`);
 setStreamingStatus('Fetching volume/OI data for new trades...');
 
 fetchVolumeAndOpenInterest(newTrades)
 .then(tradesWithVolOI => {
 console.log('✅ VOL/OI FETCH COMPLETE!');
 setStreamingStatus('Analyzing fill styles...');
 return analyzeBidAskExecution(tradesWithVolOI);
 })
 .then(enrichedNewTrades => {
 console.log('✅ NEW TRADES ENRICHMENT COMPLETE!');
 
 // Merge enriched new trades with existing trades
 setData(currentTrades => {
 const existingIds = new Set(
 currentTrades.map((t: OptionsFlowData) => `${t.ticker}-${t.trade_timestamp}-${t.strike}`)
 );
 
 // Replace unenriched versions with enriched ones
 const finalTrades = currentTrades.map((t: OptionsFlowData) => {
 const enriched = enrichedNewTrades.find((e: OptionsFlowData) => 
 `${e.ticker}-${e.trade_timestamp}-${e.strike}` === `${t.ticker}-${t.trade_timestamp}-${t.strike}`
 );
 return enriched || t;
 });
 
 console.log(`✅ FINAL TRADE COUNT: ${finalTrades.length}`);
 setStreamingStatus('');
 return finalTrades;
 });
 })
 .catch(enrichError => {
 console.error('❌ Error during enrichment:', enrichError);
 setStreamingStatus('');
 });
 }, 500);
 } else {
 setStreamingStatus('');
 }
 
 return updatedTrades;
 });
 } else {
 console.log('⚠️ Complete event had no trades');
 setStreamingStatus('');
 }
 
 break;
 
 case 'error':
 console.error('Stream error:', streamData.error);
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
 // Keep-alive ping, no action needed
 console.log('💓 Stream heartbeat received');
 break;
 }
 } catch (parseError) {
 console.error('Error parsing stream data:', parseError);
 }
 };
 
          eventSource.onerror = (error) => {
            console.error('EventSource error:', error);
            console.error('EventSource readyState:', eventSource.readyState);
            console.error('EventSource url:', eventSource.url);
            
            // Log more details about the error
            if (error && typeof error === 'object') {
              console.error('Error details:', {
                target: error.target,
                eventPhase: error.eventPhase,
                type: error.type
              });
            }
            
            // Don't retry if stream completed successfully
            if (isStreamComplete) {
              console.log('✅ Stream completed successfully, ignoring final disconnect');
              eventSource.close();
              setStreamingStatus('');
              setLoading(false);
              return;
            }
            
            // Check if this is just a normal close after completion
            if (eventSource.readyState === 2) { // CLOSED state
              console.log('ℹ️ Stream closed normally');
              eventSource.close();
              return;
            }
            
            // Only show error if connection truly failed
            if (eventSource.readyState === 0) { // CONNECTING state - connection failed
              console.error('❌ Connection failed to establish');
              setStreamError('Failed to establish connection');
            } else {
              setStreamError('Connection interrupted');
            }
            
            setStreamingStatus('Connection error - retrying...');
            eventSource.close();            // Auto-retry with exponential backoff (max 3 retries)
            if (currentRetry < 3) {
              const nextRetry = currentRetry + 1;
              const backoffDelay = Math.min(2000 * Math.pow(1.5, currentRetry), 10000); // Max 10 seconds
              console.log(`🔄 Retrying in ${backoffDelay}ms (attempt ${nextRetry}/3)...`);
              
              setRetryCount(nextRetry);
              
              setTimeout(() => {
                fetchOptionsFlowStreaming(nextRetry);
              }, backoffDelay);
            } else {
              setStreamError('Unable to establish streaming connection. Using standard fetch...');
              setStreamingStatus('');
              setLoading(false);
              console.warn('⚠️ Max retries reached. Falling back to regular API.');
              // Fallback to regular API
              setTimeout(() => fetchOptionsFlow(), 1000);
            }
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
 console.log(`📊 Fetching live options flow data...`);
 
 // Fetch fresh live data only
 const response = await fetch(`/api/live-options-flow?ticker=${selectedTicker}`);
 
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
 trade_types: { BLOCK: 0, SWEEP: 0, 'MULTI-LEG': 0, MINI: 0 },
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
 trade_types: { BLOCK: 0, SWEEP: 0, 'MULTI-LEG': 0, MINI: 0 },
 call_put_ratio: { calls: 0, puts: 0 },
 processing_time_ms: 0
 });
 } finally {
 setLoading(false);
 }
 };

 // Initial load - fetch current date live data by default
 useEffect(() => {
 // Reset completion flag on ticker change
 setIsStreamComplete(false);
 // Always fetch live streaming data (data will accumulate via prevData)
 fetchOptionsFlowStreaming(0);
 }, [selectedTicker]);

 const handleRefresh = () => {
 // Reset error state and retry count
 setStreamError('');
 setRetryCount(0);
 setIsStreamComplete(false);
 // Always refresh with live streaming data
 fetchOptionsFlowStreaming(0);
 };

 const handleClearData = () => {
 // Clear existing data and start fresh setData([]);
 setSummary({
 total_trades: 0,
 total_premium: 0,
 unique_symbols: 0,
 trade_types: { BLOCK: 0, SWEEP: 0, 'MULTI-LEG': 0, MINI: 0 },
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
 <div className="min-h-screen bg-black text-white pt-12">
 {/* Main Content */}
 <div className="p-6">
 <OptionsFlowTable
 data={data}
 summary={summary}
 marketInfo={marketInfo}
 loading={loading}
 onRefresh={handleRefresh}
 onClearData={handleClearData}
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