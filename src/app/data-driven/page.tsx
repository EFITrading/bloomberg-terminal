'use client';

import '../seasonax.css';
import '../seasonality.css';
import '../seasonal-cards.css';
import { useState } from 'react';
import SeasonaxLanding from '@/components/seasonax/SeasonaxLanding';
import SeasonalityChart from '@/components/analytics/SeasonalityChart';
import { ScreenerWrapper } from '@/components/ui/ScreenerWrapper';
import { useCachedScreener } from '@/hooks/useCachedScreener';

export default function DataDriven() {
 const [activeTab, setActiveTab] = useState<'screener' | 'chart'>('chart'); // Start with chart view

 // Use cached seasonal data for instant loading
 const { 
   data: cachedSeasonalData, 
   loading: seasonalLoading, 
   error: seasonalError, 
   cacheStatus 
 } = useCachedScreener(
   'seasonal-opportunities',
   '/api/seasonal-data?years=20&batchSize=25', // Fallback API
   {
     refreshInterval: 60000, // Check for updates every minute
     maxStaleTime: 30 * 60 * 1000, // Accept 30-minute stale data
     enableFallback: true
   }
 );

 const handleStartScreener = () => {
 setActiveTab('chart');
 };

 const handleBackToTabs = () => {
 setActiveTab('screener');
 };

 if (activeTab === 'chart') {
 return (
 <div className="data-driven-container">
   {/* Show cache status when loading from chart */}
   {cacheStatus === 'hit' && (
     <div className="mb-4 p-3 bg-green-900/20 border border-green-500/40 rounded-lg">
       <div className="flex items-center space-x-2 text-green-400">
         <span>⚡</span>
         <span className="font-medium">Instant Load from Background Cache</span>
         <span className="text-green-300">• Data pre-computed by background screener</span>
       </div>
     </div>
   )}
   <SeasonalityChart 
     onBackToTabs={handleBackToTabs} 
     autoStart={true}
     preloadedData={cachedSeasonalData} // Pass cached data to avoid re-computation
     isFromCache={cacheStatus === 'hit'}
   />
 </div>
 );
 }

 return (
 <div className="data-driven-container">
   {/* Cache Performance Indicator */}
   {cacheStatus === 'hit' && (
     <div className="mb-4 p-3 bg-green-900/20 border border-green-500/40 rounded-lg">
       <div className="flex items-center space-x-2 text-green-400">
         <span>⚡</span>
         <span className="font-medium">Instant Load</span>
         <span className="text-green-300">• Data pre-computed by background screener</span>
       </div>
     </div>
   )}

   <div className="tab-content">
     {activeTab === 'screener' && (
       <ScreenerWrapper
         type="seasonal-opportunities"
         title="Seasonal Opportunities Screener"
         fallbackApiUrl="/api/seasonal-data?years=20&batchSize=25"
       >
         {(data, loading, error) => (
           <SeasonaxLanding 
             onStartScreener={handleStartScreener}
             precomputedData={data}
             loadingFromCache={loading && cacheStatus !== 'miss'}
           />
         )}
       </ScreenerWrapper>
     )}
   </div>
 </div>
 );
}
