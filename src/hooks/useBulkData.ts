import { useState, useEffect, useCallback, useRef } from 'react';

interface BulkDataOptions {
 symbols: string[];
 dataTypes: ('historical' | 'options' | 'seasonal' | 'flow' | 'gex' | 'details' | 'quotes')[];
 timeframe?: string;
 period?: string;
 autoRefresh?: boolean;
 refreshInterval?: number; // minutes
 staleTime?: number; // milliseconds
}

interface BulkDataState {
 data: Record<string, any>;
 loading: boolean;
 error: string | null;
 lastUpdated: string | null;
 cacheHits: number;
 apiCalls: number;
}

interface BulkDataResponse {
 success: boolean;
 data: any[];
 meta: {
 totalSymbols: number;
 successfulSymbols: number;
 totalTime: number;
 averageTimePerSymbol: number;
 };
}

export function useUltraFastBulkData(options: BulkDataOptions): BulkDataState & {
 refetch: () => Promise<void>;
 addSymbol: (symbol: string) => void;
 removeSymbol: (symbol: string) => void;
 clearCache: () => void;
} {
 const [state, setState] = useState<BulkDataState>({
 data: {},
 loading: false,
 error: null,
 lastUpdated: null,
 cacheHits: 0,
 apiCalls: 0
 });

 const optionsRef = useRef(options);
 const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
 const abortControllerRef = useRef<AbortController | null>(null);

 // Update options ref when options change
 useEffect(() => {
 optionsRef.current = options;
 }, [options]);

 // Fetch data function
 const fetchData = useCallback(async (force = false) => {
 // Cancel previous request
 if (abortControllerRef.current) {
 abortControllerRef.current.abort();
 }

 abortControllerRef.current = new AbortController();
 const currentOptions = optionsRef.current;

 if (!currentOptions.symbols.length || !currentOptions.dataTypes.length) {
 return;
 }

 setState(prev => ({ 
 ...prev, 
 loading: true, 
 error: null 
 }));

 try {
 console.log(` Bulk fetch: ${currentOptions.symbols.length} symbols × ${currentOptions.dataTypes.length} data types`);
 
 const response = await fetch('/api/bulk-ticker-data', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({
 symbols: currentOptions.symbols,
 dataTypes: currentOptions.dataTypes,
 timeframe: currentOptions.timeframe || '1d',
 period: currentOptions.period || '1y',
 maxParallel: 6
 }),
 signal: abortControllerRef.current.signal
 });

 if (!response.ok) {
 throw new Error(`HTTP ${response.status}: ${response.statusText}`);
 }

 const result: BulkDataResponse = await response.json();

 if (!result.success) {
 throw new Error('Bulk data fetch failed');
 }

 // Transform array response into symbol-keyed object
 const dataBySymbol: Record<string, any> = {};
 result.data.forEach(item => {
 dataBySymbol[item.symbol] = item;
 });

 setState(prev => ({
 ...prev,
 data: dataBySymbol,
 loading: false,
 lastUpdated: new Date().toISOString(),
 apiCalls: prev.apiCalls + 1
 }));

 console.log(` Bulk fetch complete: ${result.meta.successfulSymbols}/${result.meta.totalSymbols} symbols in ${result.meta.totalTime}ms`);

 } catch (error) {
 if (error instanceof Error && error.name === 'AbortError') {
 console.log(' Bulk fetch aborted');
 return;
 }

 console.error(' Bulk fetch error:', error);
 setState(prev => ({
 ...prev,
 loading: false,
 error: error instanceof Error ? error.message : 'Unknown error'
 }));
 }
 }, []);

 // Initial data fetch
 useEffect(() => {
 fetchData();
 }, [fetchData]);

 // Auto-refresh setup
 useEffect(() => {
 if (!options.autoRefresh || !options.refreshInterval) {
 return;
 }

 const interval = options.refreshInterval * 60 * 1000; // Convert to milliseconds
 
 refreshTimeoutRef.current = setTimeout(() => {
 fetchData();
 }, interval);

 return () => {
 if (refreshTimeoutRef.current) {
 clearTimeout(refreshTimeoutRef.current);
 }
 };
 }, [options.autoRefresh, options.refreshInterval, fetchData, state.lastUpdated]);

 // Add symbol to the current list
 const addSymbol = useCallback((symbol: string) => {
 if (!optionsRef.current.symbols.includes(symbol)) {
 const newSymbols = [...optionsRef.current.symbols, symbol];
 optionsRef.current = { ...optionsRef.current, symbols: newSymbols };
 
 // Fetch data for the new symbol only
 fetchSingleSymbol(symbol);
 }
 }, []);

 // Remove symbol from the current list
 const removeSymbol = useCallback((symbol: string) => {
 const newSymbols = optionsRef.current.symbols.filter(s => s !== symbol);
 optionsRef.current = { ...optionsRef.current, symbols: newSymbols };
 
 setState(prev => {
 const newData = { ...prev.data };
 delete newData[symbol];
 return { ...prev, data: newData };
 });
 }, []);

 // Fetch data for a single symbol (optimized for adding symbols)
 const fetchSingleSymbol = useCallback(async (symbol: string) => {
 try {
 const response = await fetch('/api/bulk-ticker-data', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({
 symbols: [symbol],
 dataTypes: optionsRef.current.dataTypes,
 timeframe: optionsRef.current.timeframe || '1d',
 period: optionsRef.current.period || '1y',
 maxParallel: 6
 })
 });

 if (response.ok) {
 const result: BulkDataResponse = await response.json();
 if (result.success && result.data.length > 0) {
 setState(prev => ({
 ...prev,
 data: {
 ...prev.data,
 [symbol]: result.data[0]
 },
 apiCalls: prev.apiCalls + 1
 }));
 }
 }
 } catch (error) {
 console.error(` Failed to fetch single symbol ${symbol}:`, error);
 }
 }, []);

 // Clear all cached data
 const clearCache = useCallback(() => {
 setState(prev => ({
 ...prev,
 data: {},
 lastUpdated: null,
 cacheHits: 0,
 apiCalls: 0
 }));
 }, []);

 // Cleanup on unmount
 useEffect(() => {
 return () => {
 if (abortControllerRef.current) {
 abortControllerRef.current.abort();
 }
 if (refreshTimeoutRef.current) {
 clearTimeout(refreshTimeoutRef.current);
 }
 };
 }, []);

 return {
 ...state,
 refetch: () => fetchData(true),
 addSymbol,
 removeSymbol,
 clearCache
 };
}

// Hook for single symbol with all data types
export function useSymbolData(symbol: string, dataTypes: string[] = ['historical', 'options', 'details']) {
 return useUltraFastBulkData({
 symbols: [symbol],
 dataTypes: dataTypes as any,
 autoRefresh: true,
 refreshInterval: 5 // 5 minutes
 });
}

// Hook for watchlist with optimized batching
export function useWatchlistData(symbols: string[], autoRefresh = true) {
 return useUltraFastBulkData({
 symbols,
 dataTypes: ['quotes', 'details'],
 autoRefresh,
 refreshInterval: 1 // 1 minute for quotes
 });
}

// Hook for chart data with smart caching
export function useChartData(symbols: string[], timeframe = '1d', period = '1y') {
 return useUltraFastBulkData({
 symbols,
 dataTypes: ['historical'],
 timeframe,
 period,
 autoRefresh: timeframe.includes('m'), // Auto-refresh for intraday
 refreshInterval: timeframe.includes('m') ? 1 : 5 // 1 min for intraday, 5 min for daily
 });
}

// Hook for options analysis
export function useOptionsData(symbols: string[]) {
 return useUltraFastBulkData({
 symbols,
 dataTypes: ['options', 'flow', 'gex'],
 autoRefresh: true,
 refreshInterval: 2 // 2 minutes for options
 });
}

// Hook for seasonal analysis
export function useSeasonalData(symbols: string[]) {
 return useUltraFastBulkData({
 symbols,
 dataTypes: ['seasonal', 'historical'],
 period: '5y', // Always 5 years for seasonal
 autoRefresh: false // Seasonal data doesn't need frequent updates
 });
}