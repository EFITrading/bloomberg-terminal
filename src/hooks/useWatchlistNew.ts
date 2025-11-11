"use client";

import { useState, useEffect } from 'react';
import { WatchlistItem, PerformanceCategory, AISignal } from '../types/watchlist';
import { EnhancedWatchlistService } from '../lib/enhancedWatchlistService';

const WATCHLIST_SYMBOLS = [
 { symbol: 'SPY', name: 'SPDR S&P 500 ETF', type: 'ETF' },
 { symbol: 'QQQ', name: 'Invesco QQQ Trust', type: 'ETF' },
 { symbol: 'IWM', name: 'iShares Russell 2000 ETF', type: 'ETF' },
 { symbol: 'DIA', name: 'SPDR Dow Jones Industrial Average ETF', type: 'ETF' },
 { symbol: 'XLK', name: 'Technology Select Sector SPDR Fund', type: 'SECTOR' },
 { symbol: 'XLF', name: 'Financial Select Sector SPDR Fund', type: 'SECTOR' },
 { symbol: 'XLV', name: 'Health Care Select Sector SPDR Fund', type: 'SECTOR' },
 { symbol: 'XLY', name: 'Consumer Discretionary Select Sector SPDR', type: 'SECTOR' },
 { symbol: 'XLP', name: 'Consumer Staples Select Sector SPDR Fund', type: 'SECTOR' },
 { symbol: 'XLE', name: 'Energy Select Sector SPDR Fund', type: 'SECTOR' },
 { symbol: 'XLI', name: 'Industrial Select Sector SPDR Fund', type: 'SECTOR' },
 { symbol: 'XLB', name: 'Materials Select Sector SPDR Fund', type: 'SECTOR' },
 { symbol: 'XLRE', name: 'Real Estate Select Sector SPDR Fund', type: 'SECTOR' },
 { symbol: 'XLU', name: 'Utilities Select Sector SPDR Fund', type: 'SECTOR' },
 { symbol: 'XLC', name: 'Communication Services Select Sector SPDR', type: 'SECTOR' },
 { symbol: 'TLT', name: 'iShares 20+ Year Treasury Bond ETF', type: 'ETF' },
 { symbol: 'GLD', name: 'SPDR Gold Shares', type: 'ETF' }
];

export function useWatchlist() {
 const [watchlistData, setWatchlistData] = useState<WatchlistItem[]>([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 
 const enhancedService = EnhancedWatchlistService.getInstance();

 const fetchWatchlistData = async () => {
 try {
 setLoading(true);
 setError(null);
 console.log(' Starting watchlist data fetch...');
 
 const dataPromises = WATCHLIST_SYMBOLS.map(async ({ symbol, name, type }) => {
 try {
 console.log(` Fetching data for ${symbol}...`);
 
 // Get current price data
 const response = await fetch(`/api/stock-data?symbol=${symbol}&timeframe=1h&range=1D`);
 
 if (!response.ok) {
 console.log(` No data available for ${symbol}`);
 return null;
 }
 
 const data = await response.json();
 const dataArray = data.data || [];
 
 if (!dataArray || dataArray.length === 0) {
 console.log(` No valid data for ${symbol}`);
 return null;
 }

 // Use the API's calculated daily change
 const currentPrice = data.meta?.currentPrice || dataArray[dataArray.length - 1].close;
 const dailyChange = data.meta?.priceChange || 0;
 const dailyChangePercent = data.meta?.priceChangePercent || 0;
 
 console.log(` ${symbol}: $${currentPrice.toFixed(2)}, Daily: ${dailyChangePercent.toFixed(2)}%`);
 
 // Calculate enhanced performance category using SPY benchmarking
 const performance = await enhancedService.calculatePerformanceCategory(symbol);
 
 // Generate intelligent AI signal
 const signal = await enhancedService.generateAISignal(
 symbol, 
 performance, 
 dailyChangePercent
 );
 
 const result: WatchlistItem = {
 symbol: symbol,
 name,
 price: currentPrice,
 change: dailyChange,
 changePercent: dailyChangePercent,
 volume: dataArray[dataArray.length - 1].volume,
 performance,
 signal,
 timestamp: dataArray[dataArray.length - 1].timestamp,
 rrgMomentum: 0,
 rrgStrength: 0,
 seasonality: 'NEUTRAL'
 };
 
 console.log(` ${symbol}: $${result.price.toFixed(2)} (${result.changePercent.toFixed(2)}%) - ${result.performance} - ${result.signal}`);
 return result;
 } catch (error) {
 console.error(` Error fetching data for ${symbol}:`, error);
 return null;
 }
 });

 const results = await Promise.all(dataPromises);
 const validResults = results.filter((item): item is WatchlistItem => item !== null);
 
 console.log(` Total valid results: ${validResults.length}`);
 
 if (validResults.length === 0) {
 console.log(' No valid results - setting error state');
 setError('No data available. Please check your internet connection.');
 } else {
 console.log(` Setting watchlist data with ${validResults.length} items:`, 
 validResults.map(r => `${r.symbol}: $${r.price.toFixed(2)} (${r.performance}/${r.signal})`));
 setWatchlistData(validResults);
  
 console.log(` Successfully loaded ${validResults.length} symbols`);
 }
 } catch (error) {
 console.error('Error fetching watchlist data:', error);
 setError('Failed to load data');
 } finally {
 setLoading(false);
 }
 };

 // Set up real-time updates
 useEffect(() => {
 fetchWatchlistData();

 // Update every 60 seconds
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
