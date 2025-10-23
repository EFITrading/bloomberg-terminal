'use client';

import { useEffect, useState } from 'react';
import BackgroundDataService from '@/lib/backgroundDataService';

interface UseDataLoaderReturn {
 isLoading: boolean;
 progress: number;
 loadDataForPage: (page: string) => void;
}

export const useDataLoader = (pageName?: string): UseDataLoaderReturn => {
 const [isLoading, setIsLoading] = useState(false);
 const [progress, setProgress] = useState(0);

 useEffect(() => {
 if (pageName) {
 const backgroundService = BackgroundDataService.getInstance();
 
 // Load page-specific data when the page mounts (non-blocking)
 setTimeout(() => {
 backgroundService.loadDataForPage(pageName);
 }, 100);
 }
 }, [pageName]);

 const loadDataForPage = (page: string) => {
 // Make this non-blocking by using setTimeout
 setTimeout(() => {
 setIsLoading(true);
 const backgroundService = BackgroundDataService.getInstance();
 
 backgroundService.loadDataForPage(page).then(() => {
 setIsLoading(false);
 }).catch((error) => {
 console.error('Error loading page data:', error);
 setIsLoading(false);
 });
 }, 50);
 };

 return {
 isLoading,
 progress,
 loadDataForPage
 };
};

export default useDataLoader;
