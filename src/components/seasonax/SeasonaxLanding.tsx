'use client';

import React, { useState, useEffect } from 'react';
import PolygonService, { SeasonalPattern } from '@/lib/polygonService';
import GlobalDataCache from '@/lib/GlobalDataCache';
import HeroSection from './HeroSection';
import MarketTabs from './MarketTabs';
import OpportunityCard from './OpportunityCard';


interface SeasonaxLandingProps {
 onStartScreener?: () => void;
}

const SeasonaxLanding: React.FC<SeasonaxLandingProps> = ({ 
  onStartScreener
}) => {
 const [activeMarket, setActiveMarket] = useState('SP500');
 const [timePeriod, setTimePeriod] = useState('15Y'); // Changed default from 5Y to 15Y
 const [opportunities, setOpportunities] = useState<SeasonalPattern[]>([]);
 const [loading, setLoading] = useState(true); // Always start with loading
 const [error, setError] = useState<string | null>(null);
 const [streamStatus, setStreamStatus] = useState<string>('');
 const [showWebsite, setShowWebsite] = useState(false);
 const [progressStats, setProgressStats] = useState({ processed: 0, total: 1000, found: 0 });
 const [eventSource, setEventSource] = useState<EventSource | null>(null);
 


 const marketTabs = [
 { id: 'SP500', name: 'S&P 500' },
 { id: 'NASDAQ100', name: 'NASDAQ 100' },
 { id: 'DOWJONES', name: 'Dow Jones' }
 ];

 // Debug state changes
 useEffect(() => {
 }, [opportunities.length, loading, showWebsite, error]);

 const timePeriodOptions = [
 { id: '10Y', name: '10 Years', years: 10, description: 'Balanced - Market cycles' },
 { id: '15Y', name: '15 Years', years: 15, description: 'Comprehensive - Long patterns' },
 { id: '20Y', name: '20 Years', years: 20, description: 'Maximum depth - Full cycles' }
 ];

 useEffect(() => {
 // Load fresh data every time
 loadMarketData();
 }, [timePeriod]); // React to time period changes

 // Cleanup EventSource on component unmount
 useEffect(() => {
 return () => {
 if (eventSource) {
 console.log(' Cleaning up EventSource on component unmount...');
 eventSource.close();
 }
 };
 }, [eventSource]);

 const loadMarketData = async () => {
 try {
 // Load fresh data directly from SeasonalScreenerService
 console.log('📊 Loading fresh seasonal data...');
 
 // Import and use the real service
 const { default: SeasonalScreenerService } = await import('@/lib/seasonalScreenerService');
 const seasonalService = new SeasonalScreenerService();
 
 setLoading(true);
 setError(null);
 setShowWebsite(false);
 setOpportunities([]);
 setStreamStatus('⚡ Loading real seasonal data from 1000 stocks with worker-based processing...');
 setProgressStats({ processed: 0, total: 1000, found: 0 });
 
 const selectedPeriod = timePeriodOptions.find(p => p.id === timePeriod);
 const years = selectedPeriod?.years || 15; // FULL years as requested - no limits
 
 try {
 // Load FULL data using MASSIVE CONCURRENCY with REAL-TIME results
 setStreamStatus('');
 
 // Real-time progress callback to show results as they're found using WORKER THREADS
 let lastUpdate = 0;
 let realOpportunities;
 
 try {
 // Try massive concurrency first
 realOpportunities = await seasonalService.screenSeasonalOpportunitiesWithWorkers(
 years, 
 1000, // Process more stocks with massive concurrency
 50, // Use 50 concurrent requests for performance
 (processed, total, foundOpportunities, currentSymbol) => {
 // Throttle updates to prevent UI overwhelming (update every 100ms max)
 const now = Date.now();
 const shouldUpdate = now - lastUpdate > 100 || foundOpportunities.length > opportunities.length;
 
 if (shouldUpdate) {
 lastUpdate = now;
 
 // Update progress stats in real-time
 setProgressStats({ 
 processed, 
 total, 
 found: foundOpportunities.length 
 });
 
 // Update status with current processing info - MASSIVE CONCURRENCY
 if (currentSymbol) {
 setStreamStatus(`📊 ${currentSymbol} - Found ${foundOpportunities.length} qualified opportunities (${processed}/${total})`);
 } else {
 setStreamStatus(`📊 ${processed}/${total} processed with 50 concurrent requests - ${foundOpportunities.length} opportunities found`);
 }
 
 // Show opportunities as they're found - REAL-TIME UPDATES
 if (foundOpportunities.length > 0) {
 const sortedOpportunities = foundOpportunities
 .sort((a, b) => Math.abs(b.averageReturn) - Math.abs(a.averageReturn));
 
 console.log(` Setting ${foundOpportunities.length} opportunities in state:`, sortedOpportunities.slice(0, 3));
 console.log(` First opportunity structure:`, sortedOpportunities[0]);
 setOpportunities(sortedOpportunities as unknown as SeasonalPattern[]);
 
 // DISMISS LOADING SCREEN immediately when first opportunities are found
 if (foundOpportunities.length === 1) {
 console.log(' First opportunity found! Dismissing loading screen and showing results...');
 setLoading(false);
 setShowWebsite(true); // Enable the results view
 } else if (foundOpportunities.length > 1 && loading) {
 // Make sure loading is dismissed for subsequent opportunities too
 console.log(` ${foundOpportunities.length} opportunities found, ensuring loading screen is dismissed`);
 setLoading(false);
 setShowWebsite(true);
 }
 }
 }
 }
 );
 
 if (realOpportunities && realOpportunities.length > 0) {
 console.log(`✅ Completed! Found ${realOpportunities.length} seasonal opportunities with 50 concurrent requests`);
 
 // Final sort and display
 const finalSorted = realOpportunities.sort((a, b) => Math.abs(b.averageReturn) - Math.abs(a.averageReturn));
 setOpportunities(finalSorted as unknown as SeasonalPattern[]);
 setLoading(false);
 setStreamStatus('✅ Processing completed!');
 setProgressStats({ processed: 1000, total: 1000, found: realOpportunities.length });
 } else {
 throw new Error('No seasonal opportunities found');
 }
 
 } catch (processingError) {
 console.warn('📊 Concurrent processing failed, falling back to regular processing:', processingError);
 setStreamStatus('📊 50 concurrent requests unavailable, falling back to standard processing...');
 
 // Fallback to regular method
 realOpportunities = await seasonalService.screenSeasonalOpportunities(
 years, 
 500, // Reduced count for regular processing
 0, 
 (processed, total, foundOpportunities, currentSymbol) => {
 const now = Date.now();
 const shouldUpdate = now - lastUpdate > 100 || foundOpportunities.length > opportunities.length;
 
 if (shouldUpdate) {
 lastUpdate = now;
 setProgressStats({ processed, total, found: foundOpportunities.length });
 
 if (currentSymbol) {
 setStreamStatus(` Standard Processing: ${currentSymbol} - ${foundOpportunities.length} opportunities (${processed}/${total})`);
 }
 
 if (foundOpportunities.length > 0) {
 const sortedOpportunities = foundOpportunities
 .sort((a, b) => Math.abs(b.averageReturn) - Math.abs(a.averageReturn));
 setOpportunities(sortedOpportunities as unknown as SeasonalPattern[]);
 
 if (foundOpportunities.length === 1) {
 setLoading(false);
 setShowWebsite(true);
 }
 }
 }
 }
 );
 
 if (realOpportunities && realOpportunities.length > 0) {
 console.log(`✅ Fallback completed! Found ${realOpportunities.length} seasonal opportunities`);
 const finalSorted = realOpportunities.sort((a, b) => Math.abs(b.averageReturn) - Math.abs(a.averageReturn));
 setOpportunities(finalSorted as unknown as SeasonalPattern[]);
 setLoading(false);
 setStreamStatus('✅ Screening Completed');
 setProgressStats({ processed: 500, total: 500, found: realOpportunities.length });
 } else {
 throw new Error('No seasonal opportunities found in fallback mode');
 }
 }
 } catch (serviceError) {
 console.error(' Direct service failed, falling back to streaming API:', serviceError);
 
 // Fallback to streaming API as last resort
 setStreamStatus(' Falling back to streaming API...');
 
 // Close any existing EventSource connection
 if (eventSource) {
 console.log(' Closing existing EventSource connection...');
 eventSource.close();
 setEventSource(null);
 }
 
 // Use streaming API for progressive loading
 const newEventSource = new EventSource(`/api/patterns/stream?years=${years}`);
 setEventSource(newEventSource);
 
 newEventSource.onmessage = (event) => {
 try {
 const data = JSON.parse(event.data);
 
 switch (data.type) {
 case 'status':
 setStreamStatus(data.message);
 if (data.processed !== undefined) {
 setProgressStats({ processed: data.processed, total: data.total, found: data.found });
 }
 console.log(` ${data.message}`);
 break;
 
 case 'opportunity':
 // Add new opportunity to the list (check for duplicates with enhanced logic)
 setOpportunities(prev => {
 // Check if this symbol already exists (case insensitive)
 const exists = prev.some(existing => 
 existing.symbol.toUpperCase() === data.data.symbol.toUpperCase()
 );
 if (exists) {
 console.log(` Duplicate ${data.data.symbol} ignored (already exists)`);
 return prev; // Don't add duplicate
 }
 
 const newOpportunities = [...prev, data.data];
 // Sort by average return (best opportunities first) and ensure uniqueness
 const uniqueOpportunities = newOpportunities.filter((opp, index, array) => 
 array.findIndex(o => o.symbol.toUpperCase() === opp.symbol.toUpperCase()) === index
 );
 return uniqueOpportunities.sort((a, b) => Math.abs(b.averageReturn) - Math.abs(a.averageReturn));
 });
 setProgressStats(data.stats);
 console.log(` Found ${data.data.symbol}: ${data.data.averageReturn.toFixed(2)}% (${data.stats.found} total found)`);
 break;
 
 case 'show_website':
 setShowWebsite(true);
 setLoading(false);
 setStreamStatus(data.message);
 setProgressStats({ processed: data.processed, total: data.total, found: data.found });
 console.log(` ${data.message}`);
 break;
 
 case 'batch_complete':
 setStreamStatus(data.message);
 setProgressStats({ processed: data.processed, total: data.total, found: data.found });
 console.log(` ${data.message}`);
 break;
 
 case 'complete':
 setStreamStatus(data.message);
 setProgressStats({ processed: data.processed, total: data.total, found: data.found });
 setLoading(false);
 console.log(` ${data.message}`);
 newEventSource.close();
 setEventSource(null);
 break;
 
 case 'error':
 setError(data.message);
 setLoading(false);
 console.error(` ${data.message}`);
 newEventSource.close();
 setEventSource(null);
 break;
 }
 } catch (parseError) {
 console.error('Failed to parse stream data:', parseError);
 }
 };
 
 newEventSource.onerror = (event) => {
 console.error('Stream error:', event);
 setError('Connection to streaming API lost');
 setLoading(false);
 newEventSource.close();
 setEventSource(null);
 };
 }
 
 } catch (error) {
 const errorMsg = `Failed to start seasonal screening: ${error instanceof Error ? error.message : 'Unknown error'}`;
 console.error(` ${errorMsg}`);
 setError(errorMsg);
 setLoading(false);
 }
 };

 const handleScreenerStart = (market: string) => {
 console.log(`Starting screener for ${market}`);
 if (onStartScreener) {
 onStartScreener();
 }
 };

 const handleTabChange = (tabId: string) => {
 setActiveMarket(tabId);
 };



 if (loading && !showWebsite) {
 return (
 <div className="seasonax-loading">
 <div className="loading-spinner"></div>
 <p>Starting seasonal screener...</p>
 <p>{streamStatus}</p>
 {progressStats.processed > 0 && (
 <div className="progress-info">
 <p> Processed: {progressStats.processed} | Found: {progressStats.found} opportunities</p>
 <div className="progress-bar">
 <div 
 className="progress-fill" 
 style={{ width: `${(progressStats.processed / progressStats.total) * 100}%` }}
 ></div>
 </div>
 </div>
 )}
 </div>
 );
 }

 if (error) {
 return (
 <div className="seasonax-error">
 <div className="error-icon"></div>
 <h2>API Connection Error</h2>
 <p>{error}</p>
 <button onClick={loadMarketData} className="retry-button">
 Retry API Connection
 </button>
 </div>
 );
 }

 return (
 <div className="seasonax-container">

 {/* Hero Section */}
 <HeroSection 
 onScreenerStart={handleScreenerStart} 
 onStartScreener={onStartScreener}
 />

 {/* Controls Bar */}
 <div className="pro-controls-bar">
 <div className="control-group">
 <label className="control-label">Analysis Period</label>
 <select
 value={timePeriod}
 onChange={(e) => setTimePeriod(e.target.value)}
 className="pro-select"
 disabled={loading}
 >
 {timePeriodOptions.map((option) => (
 <option key={option.id} value={option.id}>
 {option.name}
 </option>
 ))}
 </select>
 </div>
 
 <div className="scan-stats">
 <div className="stat-item">
 <span className="stat-value">{progressStats.processed}</span>
 <span className="stat-label">Scanned</span>
 </div>
 <div className="stat-item">
 <span className="stat-value">{opportunities.length}</span>
 <span className="stat-label">Opportunities</span>
 </div>
 </div>
 </div>

 {/* Progress Section */}
 {streamStatus && (
 <div className="pro-progress">
 <div className="progress-header">
 <span className="progress-text">{streamStatus}</span>
 <span className="progress-percentage">
 {((progressStats.processed / progressStats.total) * 100).toFixed(0)}%
 </span>
 </div>
 <div className="progress-track">
 <div 
 className="progress-bar-fill" 
 style={{ width: `${(progressStats.processed / progressStats.total) * 100}%` }}
 />
 </div>
 </div>
 )}

 {/* Results Grid */}
 <div className="pro-results">
 {opportunities.length > 0 ? (
 <div className="split-results-container">
 {(() => {
 // Split opportunities into bullish and bearish
 const bullishOpps = opportunities.filter(opp => (opp.averageReturn || opp.avgReturn || 0) >= 0);
 const bearishOpps = opportunities.filter(opp => (opp.averageReturn || opp.avgReturn || 0) < 0);
 
 const topBullish = bullishOpps.length > 0 ? 
 bullishOpps.reduce((prev, curr) => {
 const prevScore = (prev.winRate + ((prev as any).correlation || 0)) / 2;
 const currScore = (curr.winRate + ((curr as any).correlation || 0)) / 2;
 return currScore > prevScore ? curr : prev;
 }) : null;
 
 const topBearish = bearishOpps.length > 0 ? 
 bearishOpps.reduce((prev, curr) => {
 const prevScore = (prev.winRate + ((prev as any).correlation || 0)) / 2;
 const currScore = (curr.winRate + ((curr as any).correlation || 0)) / 2;
 return currScore > prevScore ? curr : prev;
 }) : null;

 return (
 <>
 {/* Bullish Section - Left Side */}
 <div className="bullish-section">
 <div className="section-header-split bullish-header">
 <div className="section-title">
 <span className="bull-icon"></span>
 BULLISH OPPORTUNITIES
 <span className="count">({bullishOpps.length})</span>
 </div>
 </div>
 <div className="results-grid-split">
 {bullishOpps.map((opportunity, index) => {
 const isTopBullish = topBullish ? opportunity.symbol === topBullish.symbol : false;
 return (
 <OpportunityCard
 key={`bullish-${opportunity.symbol}-${index}`}
 pattern={opportunity}
 rank={index + 1}
 isTopBullish={isTopBullish}
 isTopBearish={false}
 />
 );
 })}
 </div>
 </div>

 {/* Golden Vertical Separator */}
 <div className="golden-separator">
 <div className="separator-line"></div>
 <div className="separator-orb">
 <div className="orb-inner"></div>
 </div>
 </div>

 {/* Bearish Section - Right Side */}
 <div className="bearish-section">
 <div className="section-header-split bearish-header">
 <div className="section-title">
 <span className="bear-icon">🩸</span>
 BEARISH OPPORTUNITIES
 <span className="count">({bearishOpps.length})</span>
 </div>
 </div>
 <div className="results-grid-split">
 {bearishOpps.map((opportunity, index) => {
 const isTopBearish = topBearish ? opportunity.symbol === topBearish.symbol : false;
 return (
 <OpportunityCard
 key={`bearish-${opportunity.symbol}-${index}`}
 pattern={opportunity}
 rank={index + 1}
 isTopBullish={false}
 isTopBearish={isTopBearish}
 />
 );
 })}
 </div>
 </div>
 </>
 );
 })()}
 </div>
 ) : error ? (
 <div className="pro-error">
 <div className="error-icon"></div>
 <div className="error-text">Connection Error</div>
 <div className="error-details">{error}</div>
 </div>
 ) : (
 <div className="pro-loading">
 <div className="loading-indicator"></div>
 <div className="loading-text">Scanning Markets...</div>
 </div>
 )}
 </div>


 </div>
 );
};

export default SeasonaxLanding;
