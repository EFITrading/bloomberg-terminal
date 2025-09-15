'use client';

import { useEffect, useState } from 'react';
import GlobalDataCache from '@/lib/GlobalDataCache';
import BackgroundDataService from '@/lib/backgroundDataService';

interface UseNonBlockingDataReturn<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  loadData: () => void;
}

export const useNonBlockingData = <T>(
  cacheKey: string,
  loadFunction: () => Promise<T>,
  dependencies: any[] = []
): UseNonBlockingDataReturn<T> => {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cache = GlobalDataCache.getInstance();

  const loadData = async () => {
    // Check cache first
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      setData(cachedData);
      return;
    }

    // Load data asynchronously without blocking UI
    setIsLoading(true);
    setError(null);

    try {
      // Use setTimeout to ensure this doesn't block the UI thread
      setTimeout(async () => {
        try {
          const result = await loadFunction();
          cache.set(cacheKey, result);
          setData(result);
          setIsLoading(false);
        } catch (error) {
          console.error('Non-blocking data loading error:', error);
          setError(error instanceof Error ? error.message : 'Unknown error');
          setIsLoading(false);
        }
      }, 100);
    } catch (error) {
      console.error('Non-blocking data loading error:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Check cache immediately
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      setData(cachedData);
    } else {
      // Load data without blocking
      loadData();
    }
  }, dependencies);

  return {
    data,
    isLoading,
    error,
    loadData
  };
};

export default useNonBlockingData;