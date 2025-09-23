// Ultra-fast data fetching hook with parallel loading and smart optimizations
import { useState, useCallback, useRef, useEffect } from 'react';
import ChartDataCache from '../lib/chartDataCache';
import { ChartDataPoint } from '../types/global';

interface FetchOptions {
  timeframe: string;
  priority?: 'high' | 'normal' | 'low';
  prefetch?: boolean;
}

interface FetchResult {
  data: ChartDataPoint[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  source: 'cache' | 'api' | 'storage';
}

interface BatchFetchRequest {
  symbol: string;
  timeframe: string;
  resolve: (data: ChartDataPoint[]) => void;
  reject: (error: Error) => void;
}

export const useUltraFastChart = () => {
  const [fetchResults, setFetchResults] = useState<Map<string, FetchResult>>(new Map());
  const cache = ChartDataCache.getInstance();
  const abortControllers = useRef(new Map<string, AbortController>());
  const batchQueue = useRef<BatchFetchRequest[]>([]);
  const batchTimer = useRef<NodeJS.Timeout | null>(null);

  // Initialize prefetching on first use
  useEffect(() => {
    cache.prefetchPopularSymbols();
  }, []);

  const getResultKey = (symbol: string, timeframe: string) => `${symbol}_${timeframe}`;

  // BATCH API REQUESTS for maximum efficiency
  const processBatch = useCallback(async () => {
    if (batchQueue.current.length === 0) return;

    const batch = batchQueue.current.splice(0);
    console.log(`⚡ PROCESSING BATCH: ${batch.length} requests`);

    // Group by timeframe for parallel processing
    const groupedRequests = batch.reduce((groups, request) => {
      if (!groups[request.timeframe]) {
        groups[request.timeframe] = [];
      }
      groups[request.timeframe].push(request);
      return groups;
    }, {} as Record<string, BatchFetchRequest[]>);

    // Process each timeframe group in parallel
    const batchPromises = Object.entries(groupedRequests).map(([timeframe, requests]) => 
      processBatchForTimeframe(timeframe, requests)
    );

    await Promise.allSettled(batchPromises);
  }, []);

  const processBatchForTimeframe = async (timeframe: string, requests: BatchFetchRequest[]) => {
    try {
      // Prepare batch API call
      const symbols = requests.map(r => r.symbol);
      const uniqueSymbols = [...new Set(symbols)];
      
      console.log(`📊 BATCH FETCH: ${uniqueSymbols.join(', ')} (${timeframe})`);
      
      // Use bulk API endpoint for multiple symbols
      const response = await fetch('/api/bulk-chart-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbols: uniqueSymbols,
          timeframe,
          optimized: true
        })
      });

      if (!response.ok) {
        throw new Error(`Batch API failed: ${response.status}`);
      }

      const batchResults = await response.json();

      // Resolve individual requests
      requests.forEach(request => {
        const symbolData = batchResults.data[request.symbol];
        if (symbolData && symbolData.length > 0) {
          // Cache the data
          cache.set(request.symbol, request.timeframe, symbolData);
          request.resolve(symbolData);
        } else {
          request.reject(new Error(`No data for ${request.symbol}`));
        }
      });

    } catch (error) {
      // Fallback to individual requests
      console.warn('Batch request failed, falling back to individual:', error);
      await Promise.allSettled(
        requests.map(request => fetchIndividual(request))
      );
    }
  };

  const fetchIndividual = async (request: BatchFetchRequest) => {
    try {
      const data = await fetchSingleSymbol(request.symbol, request.timeframe);
      request.resolve(data);
    } catch (error) {
      request.reject(error as Error);
    }
  };

  // INSTANT DATA RETRIEVAL with smart caching
  const fetchData = useCallback(async (
    symbol: string, 
    options: FetchOptions
  ): Promise<ChartDataPoint[]> => {
    const { timeframe, priority = 'normal' } = options;
    const resultKey = getResultKey(symbol, timeframe);
    
    // Cancel any previous request for this symbol/timeframe
    const existingController = abortControllers.current.get(resultKey);
    if (existingController) {
      existingController.abort();
    }

    // Create new abort controller
    const controller = new AbortController();
    abortControllers.current.set(resultKey, controller);

    try {
      // Set loading state immediately
      setFetchResults(prev => new Map(prev).set(resultKey, {
        data: [],
        loading: true,
        error: null,
        lastUpdated: null,
        source: 'cache'
      }));

      // Try cache first for INSTANT response
      const cachedData = cache.get(symbol, timeframe);
      if (cachedData) {
        const result: FetchResult = {
          data: cachedData,
          loading: false,
          error: null,
          lastUpdated: new Date(),
          source: 'cache'
        };
        
        setFetchResults(prev => new Map(prev).set(resultKey, result));
        return cachedData;
      }

      // Not in cache - fetch from API
      let data: ChartDataPoint[];
      
      if (priority === 'high') {
        // High priority - fetch immediately
        data = await fetchSingleSymbol(symbol, timeframe);
      } else {
        // Normal/low priority - use batching
        data = await addToBatch(symbol, timeframe);
      }

      const result: FetchResult = {
        data,
        loading: false,
        error: null,
        lastUpdated: new Date(),
        source: 'api'
      };
      
      setFetchResults(prev => new Map(prev).set(resultKey, result));
      return data;

    } catch (error) {
      const errorResult: FetchResult = {
        data: [],
        loading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        lastUpdated: new Date(),
        source: 'api'
      };
      
      setFetchResults(prev => new Map(prev).set(resultKey, errorResult));
      throw error;
    } finally {
      abortControllers.current.delete(resultKey);
    }
  }, []);

  // Add request to batch queue
  const addToBatch = useCallback((symbol: string, timeframe: string): Promise<ChartDataPoint[]> => {
    return new Promise((resolve, reject) => {
      batchQueue.current.push({ symbol, timeframe, resolve, reject });
      
      // Debounce batch processing
      if (batchTimer.current) {
        clearTimeout(batchTimer.current);
      }
      
      batchTimer.current = setTimeout(processBatch, 50); // 50ms batch window
    });
  }, [processBatch]);

  // OPTIMIZED SINGLE SYMBOL FETCH
  const fetchSingleSymbol = useCallback(async (symbol: string, timeframe: string): Promise<ChartDataPoint[]> => {
    return await cache.getOrFetch(symbol, timeframe, async () => {
      console.log(`🚀 API FETCH: ${symbol} ${timeframe}`);
      
      // Calculate optimized date range
      const now = new Date();
      const endDate = now.toISOString().split('T')[0];
      
      const daysBack = getOptimizedDaysBack(timeframe);
      const startDate = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000))
        .toISOString().split('T')[0];
      
      const response = await fetch(
        `/api/historical-data?symbol=${symbol}&startDate=${startDate}&endDate=${endDate}&timeframe=${timeframe}&optimized=true&_t=${Date.now()}`
      );
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (!result?.results?.length) {
        throw new Error(`No data available for ${symbol}`);
      }
      
      // Transform data efficiently
      return result.results.map((item: any) => ({
        timestamp: item.t,
        open: item.o,
        high: item.h,
        low: item.l,
        close: item.c,
        date: new Date(item.t).toISOString().split('T')[0],
        time: new Date(item.t).toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit', 
          hour12: false 
        })
      }));
    });
  }, [cache]);

  // Get optimized lookback period for each timeframe
  const getOptimizedDaysBack = (timeframe: string): number => {
    const optimizedRanges = {
      '1m': 2,      // 2 days
      '5m': 5,      // 5 days  
      '15m': 14,    // 2 weeks
      '30m': 30,    // 1 month
      '1h': 60,     // 2 months
      '4h': 180,    // 6 months
      '1d': 1095,   // 3 years (reduced for speed)
      '1w': 730,    // 2 years
      '1mo': 1095   // 3 years
    };
    
    return optimizedRanges[timeframe as keyof typeof optimizedRanges] || 60;
  };

  // BULK PREFETCH for common symbol combinations
  const prefetchSymbolGroup = useCallback(async (symbols: string[], timeframes: string[]) => {
    console.log(`🔮 PREFETCHING ${symbols.length} symbols x ${timeframes.length} timeframes`);
    
    const prefetchPromises: Promise<void>[] = [];
    
    for (const symbol of symbols) {
      for (const timeframe of timeframes) {
        if (!cache.get(symbol, timeframe)) {
          prefetchPromises.push(
            fetchData(symbol, { timeframe, priority: 'low' }).catch(() => {
              // Ignore prefetch errors
            })
          );
        }
      }
    }
    
    await Promise.allSettled(prefetchPromises);
    console.log('✅ PREFETCH GROUP completed');
  }, [fetchData]);

  // SMART PRELOAD based on user patterns
  const preloadRelatedSymbols = useCallback(async (currentSymbol: string, currentTimeframe: string) => {
    // Preload other timeframes for current symbol
    const timeframesToPreload = ['1d', '1h', '5m'].filter(tf => tf !== currentTimeframe);
    await prefetchSymbolGroup([currentSymbol], timeframesToPreload);
    
    // Preload related symbols
    const relatedSymbols = getRelatedSymbols(currentSymbol);
    if (relatedSymbols.length > 0) {
      await prefetchSymbolGroup(relatedSymbols.slice(0, 3), [currentTimeframe]);
    }
  }, [prefetchSymbolGroup]);

  const getRelatedSymbols = (symbol: string): string[] => {
    const symbolGroups = {
      'SPY': ['QQQ', 'IWM'],
      'QQQ': ['SPY', 'TQQQ'],
      'AAPL': ['MSFT', 'GOOGL'],
      'MSFT': ['AAPL', 'NVDA'],
      'NVDA': ['AMD', 'MSFT'],
      'TSLA': ['AAPL', 'NVDA'],
      'GOOGL': ['AAPL', 'MSFT'],
      'AMZN': ['AAPL', 'MSFT'],
      'META': ['GOOGL', 'AAPL']
    };
    
    return symbolGroups[symbol as keyof typeof symbolGroups] || [];
  };

  // Get result for a specific symbol/timeframe
  const getResult = useCallback((symbol: string, timeframe: string): FetchResult => {
    const resultKey = getResultKey(symbol, timeframe);
    return fetchResults.get(resultKey) || {
      data: [],
      loading: false,
      error: null,
      lastUpdated: null,
      source: 'cache'
    };
  }, [fetchResults]);

  // CLEANUP
  useEffect(() => {
    return () => {
      // Abort all pending requests
      abortControllers.current.forEach(controller => controller.abort());
      abortControllers.current.clear();
      
      // Clear batch timer
      if (batchTimer.current) {
        clearTimeout(batchTimer.current);
      }
    };
  }, []);

  return {
    fetchData,
    getResult,
    prefetchSymbolGroup,
    preloadRelatedSymbols,
    cacheStats: cache.getStats(),
    clearCache: cache.clear.bind(cache)
  };
};

export default useUltraFastChart;