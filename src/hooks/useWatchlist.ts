"use client";

import { useState, useEffect } from 'react';
import { WatchlistItem, PerformanceCategory, AISignal } from '../types/watchlist';
import { EnhancedWatchlistService } from '../lib/enhancedWatchlistService';

export function useWatchlist() {
 const [watchlistData, setWatchlistData] = useState<WatchlistItem[]>([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 
 const enhancedService = EnhancedWatchlistService.getInstance();

 const fetchWatchlistData = async () => {
 try {
 setLoading(true);
 setError(null);
 console.log(' Starting enhanced bulk watchlist data fetch...');
 
 // Fetch bulk data from the enhanced service
 const bulkData = await enhancedService.fetchBulkWatchlistData();
 
 if (bulkData.length === 0) {
 console.log(' No bulk data available');
 setError('No market data available. Please check your internet connection.');
 return;
 }

 console.log(` Processing bulk data for ${bulkData.length} symbols...`);
 
 const dataPromises = bulkData.map(async (data) => {
 try {
 console.log(`� Processing ${data.symbol}...`);
 
 const performance = await enhancedService.calculatePerformanceCategory(data.symbol);
 const signal = await enhancedService.generateAISignal(data.symbol, performance, data.dailyChangePercent);
 
 const result: WatchlistItem = {
 symbol: data.symbol,
 name: data.name,
 price: data.currentPrice,
 change: data.dailyChange,
 changePercent: data.dailyChangePercent,
 volume: data.volume,
 performance,
 signal,
 timestamp: data.timestamp,
 rrgMomentum: 0,
 rrgStrength: 0, 
 seasonality: 'NEUTRAL'
 };
 
 console.log(` ${data.symbol}: $${result.price.toFixed(2)} (${result.changePercent.toFixed(2)}%) - ${result.performance} - ${result.signal}`);
 return result;
 } catch (error) {
 console.error(` Error processing data for ${data.symbol}:`, error);
 return null;
 }
 });

 const results = await Promise.all(dataPromises);
 const validResults = results.filter((item): item is WatchlistItem => item !== null);
 
 console.log(` Total valid results: ${validResults.length}`);
 
 if (validResults.length === 0) {
 console.log(' No valid results - setting error state');
 setError('Failed to process market data. Please try again.');
 } else {
 console.log(` Setting watchlist data with ${validResults.length} items:`, 
 validResults.map(r => `${r.symbol}: $${r.price.toFixed(2)} (${r.performance}/${r.signal})`));
 setWatchlistData(validResults);
 console.log(` Successfully loaded ${validResults.length} symbols with enhanced analysis`);
 }
 } catch (error) {
 console.error('Error fetching watchlist data:', error);
 setError('Failed to load data');
 } finally {
 setLoading(false);
 }
 };

 useEffect(() => {
 fetchWatchlistData();
 const interval = setInterval(() => {
 fetchWatchlistData();
 }, 60000);
 return () => clearInterval(interval);
 }, []);

 return {
 watchlistData,
 loading,
 error,
 refreshData: fetchWatchlistData,
 getPerformanceColor: (category: PerformanceCategory) => enhancedService.getPerformanceColor(category),
 getSignalColor: (signal: AISignal) => enhancedService.getSignalColor(signal)
 };
}
