// Hook for intelligent symbol prefetching based on user typing behavior
import { useState, useEffect, useCallback, useRef } from 'react';

interface PrefetchOptions {
  debounceMs?: number;
  minLength?: number;
  enabled?: boolean;
}

interface PrefetchState {
  isPrefetching: boolean;
  prefetchedSymbols: string[];
  error: string | null;
}

// Common stock symbols for smart prefetching
const POPULAR_SYMBOLS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'NFLX',
  'SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'VOO', 'VEA', 'VWO',
  'AMD', 'INTC', 'CRM', 'ORCL', 'ADBE', 'NOW', 'PLTR', 'SNOW'
];

export function useSmartPrefetch(searchQuery: string, options: PrefetchOptions = {}) {
  const {
    debounceMs = 300,
    minLength = 1,
    enabled = true
  } = options;

  const [state, setState] = useState<PrefetchState>({
    isPrefetching: false,
    prefetchedSymbols: [],
    error: null
  });

  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prefetchedRef = useRef<Set<string>>(new Set());

  // Smart symbol matching based on partial input
  const getMatchingSymbols = useCallback((query: string): string[] => {
    if (!query || query.length < minLength) return [];
    
    const upperQuery = query.toUpperCase();
    
    // Exact matches first
    const exactMatches = POPULAR_SYMBOLS.filter(symbol => 
      symbol.startsWith(upperQuery)
    );
    
    // If we have exact matches, return top 3
    if (exactMatches.length > 0) {
      return exactMatches.slice(0, 3);
    }
    
    // Fuzzy matches (contains the query)
    const fuzzyMatches = POPULAR_SYMBOLS.filter(symbol =>
      symbol.includes(upperQuery)
    );
    
    return fuzzyMatches.slice(0, 2);
  }, [minLength]);

  // Prefetch symbol data
  const prefetchSymbol = useCallback(async (symbol: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/instant-preload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ symbol })
      });

      const result = await response.json();
      return result.success;
    } catch (error) {
      console.warn(`⚠️ Prefetch failed for ${symbol}:`, error);
      return false;
    }
  }, []);

  // Main prefetch logic
  const triggerPrefetch = useCallback(async (query: string) => {
    if (!enabled || !query || query.length < minLength) return;

    const matchingSymbols = getMatchingSymbols(query);
    const newSymbols = matchingSymbols.filter(symbol => 
      !prefetchedRef.current.has(symbol)
    );

    if (newSymbols.length === 0) return;

    setState(prev => ({ ...prev, isPrefetching: true, error: null }));

    console.log(`🔍 Smart prefetching for "${query}":`, newSymbols);

    try {
      // Prefetch in parallel for speed
      const results = await Promise.allSettled(
        newSymbols.map(symbol => prefetchSymbol(symbol))
      );

      const successful = results
        .map((result, index) => ({ result, symbol: newSymbols[index] }))
        .filter(({ result }) => result.status === 'fulfilled' && result.value)
        .map(({ symbol }) => symbol);

      // Mark as prefetched
      successful.forEach(symbol => prefetchedRef.current.add(symbol));

      setState(prev => ({
        ...prev,
        isPrefetching: false,
        prefetchedSymbols: [...prev.prefetchedSymbols, ...successful]
      }));

      if (successful.length > 0) {
        console.log(`⚡ Successfully prefetched: ${successful.join(', ')}`);
      }

    } catch (error) {
      setState(prev => ({
        ...prev,
        isPrefetching: false,
        error: error instanceof Error ? error.message : 'Prefetch failed'
      }));
    }
  }, [enabled, minLength, getMatchingSymbols, prefetchSymbol]);

  // Debounced prefetch trigger
  useEffect(() => {
    if (!enabled) return;

    // Clear existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Set new timeout
    debounceTimeoutRef.current = setTimeout(() => {
      triggerPrefetch(searchQuery);
    }, debounceMs);

    // Cleanup
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [searchQuery, debounceMs, enabled, triggerPrefetch]);

  // Clear prefetch cache
  const clearPrefetchCache = useCallback(() => {
    prefetchedRef.current.clear();
    setState({
      isPrefetching: false,
      prefetchedSymbols: [],
      error: null
    });
  }, []);

  // Manual prefetch for specific symbol
  const manualPrefetch = useCallback(async (symbol: string) => {
    const success = await prefetchSymbol(symbol);
    if (success) {
      prefetchedRef.current.add(symbol);
      setState(prev => ({
        ...prev,
        prefetchedSymbols: [...prev.prefetchedSymbols, symbol]
      }));
    }
    return success;
  }, [prefetchSymbol]);

  return {
    ...state,
    clearPrefetchCache,
    manualPrefetch,
    isSymbolPrefetched: (symbol: string) => prefetchedRef.current.has(symbol.toUpperCase())
  };
}

export default useSmartPrefetch;