'use client';

import { useEffect, useState } from 'react';
import BackgroundDataService from '@/lib/backgroundDataService';

interface UseDataLoaderReturn {
  isLoading: boolean;
  progress: number;
  loadDataForPage: (page: string) => Promise<void>;
}

export const useDataLoader = (pageName?: string): UseDataLoaderReturn => {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (pageName) {
      const backgroundService = BackgroundDataService.getInstance();
      
      // Load page-specific data when the page mounts
      backgroundService.loadDataForPage(pageName);
    }
  }, [pageName]);

  const loadDataForPage = async (page: string) => {
    setIsLoading(true);
    try {
      const backgroundService = BackgroundDataService.getInstance();
      await backgroundService.loadDataForPage(page);
    } catch (error) {
      console.error('Error loading page data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    progress,
    loadDataForPage
  };
};

export default useDataLoader;
