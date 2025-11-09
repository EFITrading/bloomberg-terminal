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
 
 // AUTO-SCAN: State for scheduled scanning
 const [autoScanEnabled, setAutoScanEnabled] = useState(true);
 const [nextScanTime, setNextScanTime] = useState<Date | null>(null);
 const [scanHistory, setScanHistory] = useState<string[]>([]);
 const [currentTradingDay, setCurrentTradingDay] = useState<string>('');
 
 // HISTORICAL DATA VIEWER: State for viewing past trades
 const [showHistoryModal, setShowHistoryModal] = useState(false);
 const [historicalDays, setHistoricalDays] = useState<Array<{date: string, totalTrades: number, timestamp: string}>>([]);
 const [selectedHistoricalDay, setSelectedHistoricalDay] = useState<string | null>(null);
 const [historicalTrades, setHistoricalTrades] = useState<OptionsFlowData[]>([]);

 // HISTORICAL DATA STORAGE using IndexedDB
 const initHistoricalDB = () => {
 return new Promise<IDBDatabase>((resolve, reject) => {
 const request = indexedDB.open('OptionsFlowHistory', 1);
 
 request.onerror = () => reject(request.error);
 request.onsuccess = () => resolve(request.result);
 
 request.onupgradeneeded = (event) => {
 const db = (event.target as IDBOpenDBRequest).result;
 if (!db.objectStoreNames.contains('dailyTrades')) {
 const store = db.createObjectStore('dailyTrades', { keyPath: 'date' });
 store.createIndex('date', 'date', { unique: true });
 }
 };
 });
 };

 // Save current day's trades to historical database
 const saveToHistory = async (date: string, trades: OptionsFlowData[]) => {
 try {
 const db = await initHistoricalDB();
 const transaction = db.transaction(['dailyTrades'], 'readwrite');
 const store = transaction.objectStore('dailyTrades');
 
 await store.put({
 date,
 trades,
 timestamp: new Date().toISOString(),
 totalTrades: trades.length
 });
 
 console.log(`💾 Saved ${trades.length} trades to history for ${date}`);
 
 // Clean up old data (keep only 5 days)
 await cleanupOldHistory(db);
 } catch (error) {
 console.error('Error saving to history:', error);
 }
 };

 // Clean up data older than 5 days
 const cleanupOldHistory = async (db: IDBDatabase) => {
 try {
 const transaction = db.transaction(['dailyTrades'], 'readwrite');
 const store = transaction.objectStore('dailyTrades');
 const request = store.getAllKeys();
 
 return new Promise<void>((resolve, reject) => {
 request.onsuccess = async () => {
 const allKeys = request.result;
 const fiveDaysAgo = new Date();
 fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
 const cutoffDate = fiveDaysAgo.toISOString().split('T')[0];
 
 for (const key of allKeys) {
 if (typeof key === 'string' && key < cutoffDate) {
 await store.delete(key);
 console.log(`🗑️ Deleted historical data for ${key}`);
 }
 }
 resolve();
 };
 request.onerror = () => reject(request.error);
 });
 } catch (error) {
 console.error('Error cleaning up old history:', error);
 }
 };

 // Get market schedule (9:30 AM - 4:00 PM ET)
 const getMarketTimes = () => {
 const now = new Date();
 const today = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
 
 const marketOpen = new Date(today);
 marketOpen.setHours(9, 30, 0, 0);
 
 const marketClose = new Date(today);
 marketClose.setHours(16, 0, 0, 0);
 
 // Scheduled scan times
 const scan1 = new Date(marketOpen.getTime() + 4 * 60 * 1000); // 9:34 AM (4 min after open)
 const scan2 = new Date(marketOpen.getTime() + 2 * 60 * 60 * 1000); // 11:30 AM (2 hours after open)
 const scan3 = new Date(marketClose.getTime() - 2 * 60 * 60 * 1000); // 2:00 PM (2 hours before close)
 const scan4 = new Date(marketClose.getTime() - 15 * 60 * 1000); // 3:45 PM (15 min before close)
 
 return { marketOpen, marketClose, scan1, scan2, scan3, scan4 };
 };

 // Check if market is open
 const isMarketOpen = () => {
 const now = new Date();
 const { marketOpen, marketClose } = getMarketTimes();
 return now >= marketOpen && now <= marketClose;
 };

 // Get next scheduled scan time
 const getNextScanTime = (): Date | null => {
 const now = new Date();
 const { scan1, scan2, scan3, scan4, marketClose } = getMarketTimes();
 
 const scans = [scan1, scan2, scan3, scan4];
 
 for (const scanTime of scans) {
 if (now < scanTime) {
 return scanTime;
 }
 }
 
 // If past all scans for today, return first scan of next trading day
 const tomorrow = new Date(scan1);
 tomorrow.setDate(tomorrow.getDate() + 1);
 return tomorrow;
 };

 // Check if it's a new trading day and handle day rollover
 const checkAndHandleNewDay = async () => {
 const today = new Date().toISOString().split('T')[0];
 
 if (currentTradingDay && currentTradingDay !== today) {
 console.log(`📅 New trading day detected: ${currentTradingDay} → ${today}`);
 
 // Save yesterday's trades to history before clearing
 if (data.length > 0) {
 await saveToHistory(currentTradingDay, data);
 console.log(`💾 Archived ${data.length} trades from ${currentTradingDay}`);
 }
 
 // Clear current trades for new day
 setData([]);
 setScanHistory([]);
 console.log(`🔄 Cleared trades for new trading day: ${today}`);
 }
 
 setCurrentTradingDay(today);
 };

 // Execute scheduled scan
 const executeScheduledScan = async () => {
 if (!autoScanEnabled || !isMarketOpen()) {
 console.log('⏸️ Auto-scan skipped: disabled or market closed');
 return;
 }
 
 const now = new Date();
 const scanTime = now.toLocaleTimeString();
 
 console.log(`🤖 AUTO-SCAN TRIGGERED at ${scanTime}`);
 setScanHistory(prev => [...prev, scanTime]);
 
 // Fetch new trades (will accumulate with existing)
 await fetchOptionsFlowStreaming(0);
 
 // Update next scan time
 setNextScanTime(getNextScanTime());
 };

 // HISTORICAL DATA: Load list of available historical days
 const loadHistoricalDays = async () => {
 try {
 const db = await initHistoricalDB();
 const transaction = db.transaction(['dailyTrades'], 'readonly');
 const store = transaction.objectStore('dailyTrades');
 const request = store.getAll();
 
 return new Promise<Array<{date: string, totalTrades: number, timestamp: string}>>((resolve) => {
 request.onsuccess = () => {
 const days = request.result.map((item: any) => ({
 date: item.date,
 totalTrades: item.totalTrades || 0,
 timestamp: item.timestamp
 })).sort((a, b) => b.date.localeCompare(a.date)); // Sort descending (newest first)
 resolve(days);
 };
 request.onerror = () => resolve([]);
 });
 } catch (error) {
 console.error('Error loading historical days:', error);
 return [];
 }
 };

 // HISTORICAL DATA: Load trades for a specific day
 const loadHistoricalTrades = async (date: string) => {
 try {
 const db = await initHistoricalDB();
 const transaction = db.transaction(['dailyTrades'], 'readonly');
 const store = transaction.objectStore('dailyTrades');
 const request = store.get(date);
 
 return new Promise<OptionsFlowData[]>((resolve) => {
 request.onsuccess = () => {
 const result = request.result;
 resolve(result?.trades || []);
 };
 request.onerror = () => resolve([]);
 });
 } catch (error) {
 console.error('Error loading historical trades:', error);
 return [];
 }
 };

 // HISTORICAL DATA: Open history modal and load available days
 const openHistoryModal = async () => {
 setShowHistoryModal(true);
 const days = await loadHistoricalDays();
 setHistoricalDays(days);
 };

 // HISTORICAL DATA: Load and display trades for selected day
 const viewHistoricalDay = async (date: string) => {
 setSelectedHistoricalDay(date);
 const trades = await loadHistoricalTrades(date);
 setHistoricalTrades(trades);
 console.log(`📊 Loaded ${trades.length} historical trades for ${date}`);
 };

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
              console.log('Stream completed successfully, ignoring final disconnect');
              eventSource.close();
              return;
            }
            
            // Set user-friendly error message
            setStreamError('Connection lost. Retrying...');
            setStreamingStatus('Connection error - retrying...');
            
            setLoading(false);
            eventSource.close(); // Auto-retry with exponential backoff (max 3 retries)
 if (currentRetry < 3) {
 const nextRetry = currentRetry + 1;
 const backoffDelay = Math.min(1000 * Math.pow(2, currentRetry), 8000); // Max 8 seconds
 console.log(`🔄 Retrying in ${backoffDelay}ms (attempt ${nextRetry}/3)...`);
 
 setRetryCount(nextRetry);
 
 setTimeout(() => {
 fetchOptionsFlowStreaming(nextRetry);
 }, backoffDelay);
 } else {
 setStreamError('Connection failed after 3 attempts. Please try refreshing the page.');
 setStreamingStatus('');
 console.error('❌ Max retries reached. Falling back to regular API.');
 // Fallback to regular API
 fetchOptionsFlow();
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
 try {
 console.log(`� Fetching live options flow data...`);
 
 // Fetch fresh live data only
 const response = await fetch(`/api/live-options-flow?ticker=${selectedTicker}`);
 
 if (!response.ok) {
 throw new Error(`HTTP error! status: ${response.status}`);
 }
 
 const result = await response.json();
 
 if (result.success) {
 setData(result.trades);
 setSummary(result.summary);
 if (result.market_info) {
 setMarketInfo(result.market_info);
 }
 setLastUpdate(new Date().toLocaleString());
 
 console.log(` Options Flow Update: ${result.trades.length} trades, ${result.summary.total_premium} total premium`);
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

 // AUTO-SCAN SCHEDULER: Check every minute for scheduled scans
 useEffect(() => {
 const checkSchedule = async () => {
 // Check if it's a new trading day
 await checkAndHandleNewDay();
 
 if (!autoScanEnabled) return;
 
 const now = new Date();
 const { scan1, scan2, scan3, scan4 } = getMarketTimes();
 const scans = [
 { time: scan1, name: '4min after open' },
 { time: scan2, name: '2hrs after open' },
 { time: scan3, name: '2hrs before close' },
 { time: scan4, name: '15min before close' }
 ];
 
 for (const scan of scans) {
 const timeDiff = Math.abs(now.getTime() - scan.time.getTime());
 
 // If within 30 seconds of scan time and not already scanned today
 if (timeDiff < 30000 && !scanHistory.includes(scan.time.toLocaleTimeString())) {
 console.log(`⏰ Scheduled scan: ${scan.name}`);
 await executeScheduledScan();
 break;
 }
 }
 
 // Update next scan time display
 setNextScanTime(getNextScanTime());
 };
 
 // Check schedule every minute
 const interval = setInterval(checkSchedule, 60000);
 
 // Initial check
 checkSchedule();
 
 return () => clearInterval(interval);
 }, [autoScanEnabled, scanHistory, data, currentTradingDay]);

 // Initialize trading day on mount
 useEffect(() => {
 const today = new Date().toISOString().split('T')[0];
 setCurrentTradingDay(today);
 setNextScanTime(getNextScanTime());
 }, []);

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
 {/* Auto-Scan Status Bar */}
 <div className="p-4 bg-gray-900 border-b border-gray-800">
 <div className="max-w-7xl mx-auto flex items-center justify-between">
 <div className="flex items-center gap-4">
 <div className="flex items-center gap-2">
 <button
 onClick={() => setAutoScanEnabled(!autoScanEnabled)}
 className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
 autoScanEnabled
 ? 'bg-green-600 hover:bg-green-700 text-white'
 : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
 }`}
 >
 {autoScanEnabled ? '🤖 AUTO-SCAN ON' : '⏸️ AUTO-SCAN OFF'}
 </button>
 <div className="text-sm text-gray-400">
 {nextScanTime && autoScanEnabled && (
 <span>Next scan: {nextScanTime.toLocaleTimeString()}</span>
 )}
 </div>
 </div>
 
 <div className="flex items-center gap-2 text-xs text-gray-500">
 <span>Scans today: {scanHistory.length}/4</span>
 {scanHistory.length > 0 && (
 <span className="text-green-400">
 Last: {scanHistory[scanHistory.length - 1]}
 </span>
 )}
 </div>
 
 <div className="flex items-center gap-2 text-xs">
 <span className="text-gray-400">Total trades accumulated:</span>
 <span className="text-blue-400 font-bold">{data.length}</span>
 </div>
 
 {/* Historical Data Button */}
 <button
 onClick={openHistoryModal}
 className="px-4 py-2 rounded-lg font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white transition-all"
 >
 📅 HISTORY (5 Days)
 </button>
 </div>
 
 <div className="text-xs text-gray-500">
 Trading Day: {currentTradingDay}
 </div>
 </div>
 </div>

 {/* Historical Data Modal */}
 {showHistoryModal && (
 <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
 <div className="bg-gray-900 rounded-lg border-2 border-gray-700 w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
 {/* Modal Header */}
 <div className="p-4 border-b border-gray-700 flex items-center justify-between">
 <h2 className="text-xl font-bold text-white">📅 Historical Trades (Last 5 Days)</h2>
 <button
 onClick={() => {
 setShowHistoryModal(false);
 setSelectedHistoricalDay(null);
 setHistoricalTrades([]);
 }}
 className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white font-bold transition-all"
 >
 ✕ Close
 </button>
 </div>
 
 <div className="flex-1 overflow-y-auto p-4">
 {!selectedHistoricalDay ? (
 /* Day Selection View */
 <div className="space-y-2">
 <p className="text-gray-400 mb-4">Select a trading day to view trades:</p>
 {historicalDays.length === 0 ? (
 <div className="text-center py-8 text-gray-500">
 <p className="text-lg">No historical data available</p>
 <p className="text-sm mt-2">Historical trades will appear here after the first trading day</p>
 </div>
 ) : (
 historicalDays.map((day) => (
 <button
 key={day.date}
 onClick={() => viewHistoricalDay(day.date)}
 className="w-full p-4 bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-600 transition-all text-left"
 >
 <div className="flex items-center justify-between">
 <div>
 <div className="text-lg font-bold text-white">{day.date}</div>
 <div className="text-sm text-gray-400">
 {new Date(day.timestamp).toLocaleString()}
 </div>
 </div>
 <div className="text-right">
 <div className="text-2xl font-bold text-blue-400">{day.totalTrades}</div>
 <div className="text-xs text-gray-500">trades</div>
 </div>
 </div>
 </button>
 ))
 )}
 </div>
 ) : (
 /* Trades View for Selected Day */
 <div>
 <button
 onClick={() => {
 setSelectedHistoricalDay(null);
 setHistoricalTrades([]);
 }}
 className="mb-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white font-bold transition-all"
 >
 ← Back to Days
 </button>
 
 <div className="mb-4">
 <h3 className="text-lg font-bold text-white">Trades for {selectedHistoricalDay}</h3>
 <p className="text-sm text-gray-400">{historicalTrades.length} total trades</p>
 </div>
 
 {historicalTrades.length === 0 ? (
 <div className="text-center py-8 text-gray-500">
 No trades found for this day
 </div>
 ) : (
 <OptionsFlowTable
 data={historicalTrades}
 summary={{
 total_trades: historicalTrades.length,
 total_premium: historicalTrades.reduce((sum, t) => sum + (t.total_premium || 0), 0),
 unique_symbols: new Set(historicalTrades.map(t => t.underlying_ticker)).size,
 trade_types: { BLOCK: 0, SWEEP: 0, 'MULTI-LEG': 0, MINI: 0 },
 call_put_ratio: { calls: 0, puts: 0 },
 processing_time_ms: 0
 }}
 marketInfo={{
 status: 'LAST_TRADING_DAY',
 is_live: false,
 data_date: selectedHistoricalDay,
 market_open: false
 }}
 loading={false}
 onRefresh={() => {}}
 onClearData={() => {}}
 selectedTicker="ALL"
 onTickerChange={() => {}}
 streamingStatus=""
 streamingProgress={null}
 streamError=""
 />
 )}
 </div>
 )}
 </div>
 </div>
 </div>
 )}
 
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