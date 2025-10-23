'use client';

import { useState, useCallback, useMemo } from 'react';
import GlobalDataCache from '@/lib/GlobalDataCache';

interface ChartDataPoint {
 timestamp: number;
 open: number;
 high: number;
 low: number;
 close: number;
 volume: number;
 date: string;
 time: string;
}

interface TimeframeCache {
 [key: string]: {
 data: ChartDataPoint[];
 timestamp: number;
 expiryTime: number;
 };
}

export interface UseOptimizedDataReturn {
 data: ChartDataPoint[];
 isLoading: boolean;
 error: string | null;
 fetchTimeframeData: (symbol: string, timeframe: string) => Promise<void>;
 clearCache: () => void;
 getCacheStats: () => { size: number; hits: number; misses: number };
}

const CACHE_EXPIRY_TIMES: { [key: string]: number } = {
 '1m': 1 * 60 * 1000, // 1 minute
 '5m': 5 * 60 * 1000, // 5 minutes 
 '15m': 15 * 60 * 1000, // 15 minutes
 '30m': 30 * 60 * 1000, // 30 minutes
 '1h': 60 * 60 * 1000, // 1 hour
 '4h': 4 * 60 * 60 * 1000, // 4 hours
 '1d': 24 * 60 * 60 * 1000, // 1 day
 '1w': 7 * 24 * 60 * 60 * 1000, // 1 week
 '1mo': 30 * 24 * 60 * 60 * 1000 // 1 month
};

export const useOptimizedData = (): UseOptimizedDataReturn => {
 const [data, setData] = useState<ChartDataPoint[]>([]);
 const [isLoading, setIsLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [cache, setCache] = useState<TimeframeCache>({});
 const [cacheStats, setCacheStats] = useState({ hits: 0, misses: 0 });

 // Optimized cache key generation
 const getCacheKey = useCallback((symbol: string, timeframe: string) => {
 return `${symbol}_${timeframe}`;
 }, []);

 // Check if cached data is still valid
 const isCacheValid = useCallback((cacheEntry: TimeframeCache[string]) => {
 return Date.now() < cacheEntry.expiryTime;
 }, []);

 // Get date range for timeframe
 const getDateRange = useCallback((timeframe: string) => {
 const now = new Date();
 const endDate = now.toISOString().split('T')[0];
 let startDate: string;
 
 switch (timeframe) {
 case '1m':
 case '5m':
 case '15m':
 case '30m':
 startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
 break;
 case '1h':
 startDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
 break;
 case '4h':
 startDate = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
 break;
 case '1d':
 startDate = new Date(now.getTime() - (7124 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
 break;
 case '1w':
 startDate = new Date(now.getTime() - (5 * 365 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
 break;
 case '1mo':
 startDate = new Date(now.getTime() - (10 * 365 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
 break;
 default:
 startDate = new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
 }
 
 return { startDate, endDate };
 }, []);

 // Transform raw API data to chart format
 const transformData = useCallback((rawData: any[]) => {
 return rawData.map((item: any) => ({
 timestamp: item.t,
 open: item.o,
 high: item.h,
 low: item.l,
 close: item.c,
 volume: item.v || 0,
 date: new Date(item.t).toISOString().split('T')[0],
 time: new Date(item.t).toLocaleTimeString('en-US', { 
 hour: '2-digit', 
 minute: '2-digit', 
 hour12: false 
 })
 }));
 }, []);

 // Optimized data fetching with caching
 const fetchTimeframeData = useCallback(async (symbol: string, timeframe: string) => {
 const cacheKey = getCacheKey(symbol, timeframe);
 
 // Check cache first
 const cachedEntry = cache[cacheKey];
 if (cachedEntry && isCacheValid(cachedEntry)) {
 console.log(` Cache HIT for ${symbol} ${timeframe}`);
 setData(cachedEntry.data);
 setCacheStats(prev => ({ ...prev, hits: prev.hits + 1 }));
 return;
 }

 console.log(` Cache MISS for ${symbol} ${timeframe} - fetching fresh data`);
 setCacheStats(prev => ({ ...prev, misses: prev.misses + 1 }));
 
 setIsLoading(true);
 setError(null);
 
 try {
 const { startDate, endDate } = getDateRange(timeframe);
 
 // Use fetch with cache busting for fresh data
 const response = await fetch(
 `/api/historical-data?symbol=${symbol}&startDate=${startDate}&endDate=${endDate}&timeframe=${timeframe}&_t=${Date.now()}`,
 {
 method: 'GET',
 headers: {
 'Cache-Control': 'no-cache',
 'Pragma': 'no-cache'
 }
 }
 );
 
 if (!response.ok) {
 throw new Error(`HTTP ${response.status}: ${response.statusText}`);
 }
 
 const result = await response.json();
 
 if (result && result.results && Array.isArray(result.results)) {
 const transformedData = transformData(result.results);
 
 // Cache the data with expiry
 const expiryTime = Date.now() + (CACHE_EXPIRY_TIMES[timeframe] || CACHE_EXPIRY_TIMES['1d']);
 const cacheEntry = {
 data: transformedData,
 timestamp: Date.now(),
 expiryTime
 };
 
 // Update cache efficiently
 setCache(prev => ({
 ...prev,
 [cacheKey]: cacheEntry
 }));
 
 setData(transformedData);
 
 console.log(` Loaded and cached ${transformedData.length} data points for ${symbol} ${timeframe}`);
 } else {
 throw new Error('Invalid data format - missing results array');
 }
 } catch (err) {
 const errorMessage = err instanceof Error ? err.message : 'Failed to fetch data';
 console.error(` Error fetching ${symbol} ${timeframe}:`, errorMessage);
 setError(errorMessage);
 setData([]);
 } finally {
 setIsLoading(false);
 }
 }, [cache, getCacheKey, isCacheValid, getDateRange, transformData]);

 // Clear cache function
 const clearCache = useCallback(() => {
 setCache({});
 setCacheStats({ hits: 0, misses: 0 });
 console.log(' Chart data cache cleared');
 }, []);

 // Get cache statistics
 const getCacheStats = useCallback(() => {
 return {
 size: Object.keys(cache).length,
 ...cacheStats
 };
 }, [cache, cacheStats]);

 return {
 data,
 isLoading,
 error,
 fetchTimeframeData,
 clearCache,
 getCacheStats
 };
};