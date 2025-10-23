'use client';

import { useEffect, useState } from 'react';
import BackgroundDataService from '@/lib/backgroundDataService';

const DataPreloader: React.FC = () => {
 const [loadingStatus, setLoadingStatus] = useState('Starting...');

 useEffect(() => {
 console.log(' EFI Trading: Starting NON-BLOCKING data preloading...');
 
 // Use the BackgroundDataService for truly non-blocking loading
 const backgroundService = BackgroundDataService.getInstance();
 
 // Subscribe to loading updates
 backgroundService.onStatusUpdate((status: string, progress: number) => {
 setLoadingStatus(status);
 console.log(` Background Loading: ${status} (${Math.round(progress)}%)`);
 });
 
 // Start progressive loading after a delay to ensure navigation is not blocked
 const startTimer = setTimeout(() => {
 backgroundService.startProgressiveLoading();
 }, 2000); // Delay to ensure page loads first

 return () => clearTimeout(startTimer);
 }, []);

 return null; // This component loads data in the background without blocking
};

export default DataPreloader;
