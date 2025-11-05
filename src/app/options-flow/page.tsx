'use client';

import React, { useState, useEffect } from 'react';
import { OptionsFlowTable } from '@/components/OptionsFlowTable';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
 case 'status':
 setStreamingStatus(streamData.message);
 console.log(` Stream Status: ${streamData.message}`);
 break;
 
 case 'trades':
 // Accumulate trades progressively as they come in (don't replace, append new ones)
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
 // Final update with summary - APPEND any remaining trades, don't replace
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
 
 console.log(` Stream Complete: Adding ${newTrades.length} final trades (${streamData.trades.length} sent, ${prevData.length} existing)`);
 
 return [...prevData, ...newTrades];
 });
 }
 
 setSummary(streamData.summary);
 if (streamData.market_info) {
 setMarketInfo(streamData.market_info);
 }
 setLastUpdate(new Date().toLocaleString());
 setLoading(false);
 setStreamingStatus('');
 setStreamingProgress(null);
 setStreamError('');
 setRetryCount(0); // Reset retry count on success
 setIsStreamComplete(true); // Mark stream as successfully completed
 
 console.log(` Stream Complete: Total ${streamData.summary.total_trades} trades, $${streamData.summary.total_premium.toLocaleString()} total premium`);
 
 // Close the connection after a brief delay to ensure all messages are processed
 setTimeout(() => {
 eventSource.close();
 }, 100);
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
 eventSource.close();
 
 // Auto-retry with exponential backoff (max 3 retries)
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