import { useState, useEffect, useCallback } from 'react';

interface CachedScreenerData {
  data: any;
  lastUpdated: string;
  expiresAt: string;
  isStale: boolean;
  age: number;
}

interface ScreenerCacheResponse {
  success: boolean;
  type?: string;
  data?: any;
  metadata?: CachedScreenerData;
  error?: string;
  message?: string;
}

/**
 * Hook for accessing cached screener data
 * Automatically falls back to live API if cache is empty/stale
 */
export function useCachedScreener(
  type: string,
  fallbackApiUrl?: string,
  options: {
    refreshInterval?: number;
    maxStaleTime?: number;
    enableFallback?: boolean;
  } = {}
) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cacheStatus, setCacheStatus] = useState<'hit' | 'miss' | 'stale' | 'fallback'>('miss');
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const {
    refreshInterval = 60000, // Check for updates every minute
    maxStaleTime = 15 * 60 * 1000, // Accept stale data up to 15 minutes
    enableFallback = true
  } = options;

  const fetchCachedData = useCallback(async () => {
    try {
      setError(null);
      
      // Try to get cached data first
      const cacheResponse = await fetch(`/api/cache/screener-data?type=${type}`);
      const cacheResult: ScreenerCacheResponse = await cacheResponse.json();
      
      if (cacheResult.success && cacheResult.data) {
        const age = cacheResult.metadata?.age || 0;
        const isAcceptablyStale = age <= maxStaleTime;
        
        if (isAcceptablyStale) {
          setData(cacheResult.data);
          setCacheStatus(cacheResult.metadata?.isStale ? 'stale' : 'hit');
          setLastUpdated(cacheResult.metadata?.lastUpdated || null);
          setLoading(false);
          return;
        }
      }
      
      // Cache miss or too stale - try fallback API if enabled
      if (enableFallback && fallbackApiUrl) {
        console.log(`Cache miss for ${type}, falling back to live API: ${fallbackApiUrl}`);
        
        const fallbackResponse = await fetch(fallbackApiUrl);
        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json();
          
          // Store the fresh data in cache for next time
          try {
            await fetch('/api/cache/store-screener-data', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: type,
                data: fallbackData,
                ttl: 10 * 60 * 1000 // 10 minutes TTL
              })
            });
            console.log(`✅ Cached fresh data for ${type}`);
          } catch (cacheError) {
            console.warn(`Failed to cache data for ${type}:`, cacheError);
          }
          
          setData(fallbackData);
          setCacheStatus('fallback');
          setLastUpdated(new Date().toISOString());
          setLoading(false);
          return;
        }
      }
      
      // No cache and no fallback - show error
      setCacheStatus('miss');
      setError(cacheResult.message || `No cached data available for ${type}`);
      setLoading(false);
      
    } catch (err: any) {
      console.error(`Error fetching cached data for ${type}:`, err);
      setError(err.message || 'Failed to fetch data');
      setCacheStatus('miss');
      setLoading(false);
    }
  }, [type, fallbackApiUrl, maxStaleTime, enableFallback]);

  // Initial load
  useEffect(() => {
    fetchCachedData();
  }, [fetchCachedData]);

  // Periodic refresh
  useEffect(() => {
    if (refreshInterval > 0) {
      const interval = setInterval(fetchCachedData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchCachedData, refreshInterval]);

  // Manual refresh function
  const refresh = useCallback(() => {
    setLoading(true);
    fetchCachedData();
  }, [fetchCachedData]);

  return {
    data,
    loading,
    error,
    cacheStatus,
    lastUpdated,
    refresh,
    isCacheHit: cacheStatus === 'hit',
    isStale: cacheStatus === 'stale',
    isFallback: cacheStatus === 'fallback'
  };
}

/**
 * Hook for getting all cached screener data at once
 */
export function useAllCachedScreeners() {
  const [data, setData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cacheEntries, setCacheEntries] = useState<Record<string, any>>({});

  const fetchAllCachedData = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      
      const response = await fetch('/api/cache/screener-data?all=true');
      const result = await response.json();
      
      if (result.success) {
        setData(result.data || {});
        setCacheEntries(result.cache || {});
      } else {
        setError('Failed to fetch cached data');
      }
      
    } catch (err: any) {
      console.error('Error fetching all cached data:', err);
      setError(err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllCachedData();
  }, [fetchAllCachedData]);

  const refresh = useCallback(() => {
    fetchAllCachedData();
  }, [fetchAllCachedData]);

  return {
    data,
    loading,
    error,
    cacheEntries,
    refresh,
    hasData: Object.keys(data).length > 0
  };
}