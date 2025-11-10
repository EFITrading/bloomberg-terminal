'use client';

import React, { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, Target, Shield, Zap, Activity, RefreshCw, Settings, Bell, BarChart3, Layers, ChevronRight, Filter, Search, ArrowUpDown } from 'lucide-react';
import { TOP_1000_SYMBOLS } from '@/lib/Top1000Symbols';

interface GEXScreenerData {
 ticker: string;
 attractionLevel: number;
 currentPrice: number;
 dealerSweat: number;
 netGex: number;
 bias: 'Bullish' | 'Bearish';
 strength: number;
 volatility: 'Low' | 'Medium' | 'High';
 range: number;
 marketCap?: number;
 gexImpactScore?: number;
 // Wall data for Support/Resistance tab
 largestWall?: {
 strike: number;
 gex: number;
 type: 'call' | 'put';
 pressure: number;
 cluster?: {
 strikes: number[];
 centralStrike: number;
 totalGEX: number;
 contributions: number[]; // Percentage contributions
 type: 'call' | 'put';
 };
 };
}

interface PremiumImbalance {
 symbol: string;
 stockPrice: number;
 atmStrike: number;
 callMid: number;
 callBid: number;
 callAsk: number;
 callSpreadPercent: number;
 putMid: number;
 putBid: number;
 putAsk: number;
 putSpreadPercent: number;
 premiumDifference: number;
 imbalancePercent: number;
 expensiveSide: 'CALLS' | 'PUTS';
 imbalanceSeverity: 'EXTREME' | 'HIGH' | 'MODERATE';
 strikeSpacing: number;
 putStrike: number;
 callStrike: number;
}

export default function GEXScreener() {
 const [activeTab, setActiveTab] = useState('attraction');
 const [scanning, setScanning] = useState(false);
 const [selectedRow, setSelectedRow] = useState<number | null>(null);
 const [liveUpdate, setLiveUpdate] = useState(true);
 const [sortBy, setSortBy] = useState('dealerSweat');
 const [sortOrder, setSortOrder] = useState('desc');
 const [searchTerm, setSearchTerm] = useState('');
 const [hoveredRow, setHoveredRow] = useState<number | null>(null);
 const [animationClass, setAnimationClass] = useState('');
 const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });
 const [gexData, setGexData] = useState<GEXScreenerData[]>([]);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState('');
 const [expirationFilter, setExpirationFilter] = useState('Default');
 const [strengthFilter, setStrengthFilter] = useState<'all' | 'purple' | 'blue' | 'yellow'>('all');
 const [currentPage, setCurrentPage] = useState(1);
 
 // Auto-scan state for Attraction Zone
 const [autoScanEnabled, setAutoScanEnabled] = useState(true);
 const [nextScanTime, setNextScanTime] = useState<Date | null>(null);
 const [lastScanData, setLastScanData] = useState<GEXScreenerData[]>([]);
 const [isAutoScanning, setIsAutoScanning] = useState(false);
 const [lastScanTimestamp, setLastScanTimestamp] = useState<Date | null>(null);
 
 // Mobile detection
 const [isMobile, setIsMobile] = useState(false);
 
 useEffect(() => {
 const checkMobile = () => {
 setIsMobile(window.innerWidth <= 768);
 };
 checkMobile();
 window.addEventListener('resize', checkMobile);
 return () => window.removeEventListener('resize', checkMobile);
 }, []);
 
 // Responsive items per page: 10 for mobile, 20 for desktop
 const itemsPerPage = isMobile ? 10 : 20;

 // OTM Premium Scanner state
 const [otmResults, setOtmResults] = useState<PremiumImbalance[]>([]);
 const [otmLoading, setOtmLoading] = useState(false);
 const [otmSymbols] = useState(TOP_1000_SYMBOLS.join(','));
 const [otmExpiry, setOtmExpiry] = useState('');
 const [otmLastUpdate, setOtmLastUpdate] = useState<Date | null>(null);
 const [otmScanProgress, setOtmScanProgress] = useState({ current: 0, total: 0 });
 const [otmScanningSymbol, setOtmScanningSymbol] = useState('');
 const otmEventSourceRef = useRef<EventSource | null>(null);
 
 // OTM Auto-scan state
 const [otmAutoScanEnabled, setOtmAutoScanEnabled] = useState(true);
 const [otmNextScanTime, setOtmNextScanTime] = useState<Date | null>(null);
 const [otmLastScanData, setOtmLastScanData] = useState<PremiumImbalance[]>([]);
 const [otmIsAutoScanning, setOtmIsAutoScanning] = useState(false);
 const [otmLastScanTimestamp, setOtmLastScanTimestamp] = useState<Date | null>(null);
 
 // Disabled auto-refresh on filter change to prevent flickering - user can manually refresh
 // useEffect(() => {
 // if (gexData.length > 0) { // Only auto-refresh if we already have data
 // fetchGEXData();
 // }
 // }, [expirationFilter]);
 
 // Market hours checker for auto-scan (9:30 AM - 4:00 PM ET)
 const isMarketHours = () => {
   const now = new Date();
   const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
   const hours = etTime.getHours();
   const minutes = etTime.getMinutes();
   const currentMinutes = hours * 60 + minutes;
   
   // Market opens at 9:30 AM (570 minutes) and closes at 4:00 PM (960 minutes)
   const marketOpen = 9 * 60 + 30; // 570
   const marketClose = 16 * 60; // 960
   
   return currentMinutes >= marketOpen && currentMinutes < marketClose;
 };
 
 // Calculate next scan time (10 minutes from now)
 const calculateNextScanTime = () => {
   const now = new Date();
   const next = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes
   return next;
 };
 
 // Calculate next OTM scan time (13 minutes from now)
 const calculateOtmNextScanTime = () => {
   const now = new Date();
   const next = new Date(now.getTime() + 13 * 60 * 1000); // 13 minutes
   return next;
 };
 
 // Format countdown timer
 const getCountdownDisplay = () => {
   if (!nextScanTime) return '';
   
   const now = new Date();
   const diff = nextScanTime.getTime() - now.getTime();
   
   if (diff <= 0) return 'Scanning now...';
   
   const minutes = Math.floor(diff / 60000);
   const seconds = Math.floor((diff % 60000) / 1000);
   
   return `${minutes}m ${seconds}s`;
 };
 
 // Format OTM countdown timer
 const getOtmCountdownDisplay = () => {
   if (!otmNextScanTime) return '';
   
   const now = new Date();
   const diff = otmNextScanTime.getTime() - now.getTime();
   
   if (diff <= 0) return 'Scanning now...';
   
   const minutes = Math.floor(diff / 60000);
   const seconds = Math.floor((diff % 60000) / 1000);
   
   return `${minutes}m ${seconds}s`;
 };
 
 // Function to fetch real GEX data with streaming updates
 const fetchGEXData = async (isAutoScan = false) => {
 setLoading(true);
 setError('');
 setAnimationClass('animate-pulse');
 
 // Set auto-scanning flag if this is an auto-scan
 if (isAutoScan) {
   setIsAutoScanning(true);
   // Store current data as lastScanData before starting new scan
   if (gexData.length > 0) {
     setLastScanData([...gexData]);
     console.log(`📦 Auto-scan: Stored ${gexData.length} results from previous scan`);
   }
 }
 
 // Don't clear existing data to prevent flickering
 
 try {
 console.log(` Starting real-time GEX screener scan with ${expirationFilter} expiration filter...`);
 
 const response = await fetch(`/api/gex-screener?limit=1000&stream=true&expirationFilter=${expirationFilter}`);

 if (!response.ok) {
 throw new Error(`Failed to fetch GEX data: ${response.statusText}`);
 }

 const reader = response.body?.getReader();
 const decoder = new TextDecoder();
 
 if (!reader) {
 throw new Error('Failed to get response reader');
 }

 let buffer = '';
 const currentResults: GEXScreenerData[] = [];
 let isNewScan = false;

 while (true) {
 const { done, value } = await reader.read();
 
 if (done) break;
 
 buffer += decoder.decode(value, { stream: true });
 
 // Process complete messages
 const lines = buffer.split('\n\n');
 buffer = lines.pop() || ''; // Keep incomplete line in buffer
 
 for (const line of lines) {
 if (line.startsWith('data: ')) {
 try {
 const messageData = JSON.parse(line.substring(6));
 
 switch (messageData.type) {
 case 'start':
 console.log(` Starting scan of ${messageData.total} symbols...`);
 setScanProgress({ current: 0, total: messageData.total });
 isNewScan = true;
 // Clear results only when a new scan starts
 currentResults.length = 0;
 break;
 
 case 'result':
 // Update progress
 setScanProgress({ current: messageData.progress, total: messageData.total });
 
 // Transform and add new result
 const transformedItem: GEXScreenerData = {
 ticker: messageData.data.ticker,
 attractionLevel: messageData.data.attractionLevel,
 currentPrice: messageData.data.currentPrice,
 dealerSweat: messageData.data.dealerSweat,
 netGex: messageData.data.netGex,
 bias: messageData.data.dealerSweat > 0 ? 'Bullish' as const : 'Bearish' as const,
 strength: messageData.data.gexImpactScore || 0, // Use GEX Impact Score instead of simple calculation
 volatility: Math.abs(messageData.data.netGex) > 2 ? 'High' as const : 
 Math.abs(messageData.data.netGex) > 0.5 ? 'Medium' as const : 'Low' as const,
 range: Math.abs(((messageData.data.attractionLevel - messageData.data.currentPrice) / messageData.data.currentPrice) * 100),
 marketCap: messageData.data.marketCap,
 gexImpactScore: messageData.data.gexImpactScore,
 largestWall: messageData.data.largestWall
 };
 
 currentResults.push(transformedItem);
 
 // DON'T update display during scan - only log progress
 // This prevents flickering and constant re-renders
 
 const wallInfo = messageData.data.largestWall 
 ? messageData.data.largestWall.cluster 
 ? `| Cluster: ${messageData.data.largestWall.type.toUpperCase()} ${messageData.data.largestWall.cluster.strikes.length} strikes @ $${messageData.data.largestWall.strike.toFixed(0)} (${messageData.data.largestWall.pressure}% pressure)`
 : `| Wall: ${messageData.data.largestWall.type.toUpperCase()} $${messageData.data.largestWall.strike.toFixed(0)} (${messageData.data.largestWall.pressure}% pressure)`
 : '| No walls found';
 console.log(` Added ${messageData.data.ticker}: Attraction $${messageData.data.attractionLevel.toFixed(0)} | GEX Impact: ${messageData.data.gexImpactScore}% ${wallInfo} (${messageData.progress}/${messageData.total})`);
 break;
 
 case 'complete':
 console.log(` GEX screener completed with ${messageData.count} results`);
 setScanProgress({ current: messageData.count, total: messageData.count });
 // Set final sorted results
 const finalSortedResults = [...currentResults].sort((a, b) => (b.gexImpactScore || 0) - (a.gexImpactScore || 0));
 setGexData(finalSortedResults);
 setLoading(false);
 setAnimationClass('');
 
 // Auto-scan completion handling
 if (isAutoScan) {
   console.log(`✅ Auto-scan complete: Replacing old data (${lastScanData.length} items) with new data (${finalSortedResults.length} items)`);
   setLastScanTimestamp(new Date());
   setIsAutoScanning(false);
   // Clear lastScanData after replacement
   setLastScanData([]);
 }
 
 break;
 
 case 'error':
 throw new Error(messageData.error);
 }
 } catch (parseError) {
 console.error('Error parsing SSE message:', parseError);
 }
 }
 }
 }
 
 } catch (err) {
 console.error(' GEX screener error:', err);
 setError(err instanceof Error ? err.message : 'Failed to load GEX data');
 setLoading(false);
 setAnimationClass('');
 
 // Reset auto-scan flags on error
 if (isAutoScan) {
   setIsAutoScanning(false);
 }
 }
 };

 const handleScan = () => {
 setScanning(true);
 fetchGEXData().finally(() => {
 setScanning(false);
 });
 };

 const handleSort = (column: string) => {
 if (sortBy === column) {
 setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
 } else {
 setSortBy(column);
 setSortOrder('desc');
 }
 };

 // OTM Premium Scanner functions
 const getNextMonthlyExpiry = () => {
 const today = new Date();
 const year = today.getFullYear();
 const month = today.getMonth();
 const nextMonth = new Date(year, month + 1, 1);
 let firstFriday = 1;
 while (new Date(nextMonth.getFullYear(), nextMonth.getMonth(), firstFriday).getDay() !== 5) {
 firstFriday++;
 }
 const thirdFriday = firstFriday + 14;
 const expiryDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), thirdFriday);
 const yyyy = expiryDate.getFullYear();
 const mm = String(expiryDate.getMonth() + 1).padStart(2, '0');
 const dd = String(expiryDate.getDate()).padStart(2, '0');
 return `${yyyy}-${mm}-${dd}`;
 };

 const scanOTMPremiums = async (isAutoScan = false) => {
 setOtmLoading(true);
 setOtmResults([]);
 setOtmScanProgress({ current: 0, total: otmSymbols.split(',').length });
 
 // Set auto-scanning flag if this is an auto-scan
 if (isAutoScan) {
   setOtmIsAutoScanning(true);
   // Store current data as lastScanData before starting new scan
   if (otmResults.length > 0) {
     setOtmLastScanData([...otmResults]);
     console.log(`📦 OTM Auto-scan: Stored ${otmResults.length} results from previous scan`);
   }
 }
 
 if (otmEventSourceRef.current) {
 otmEventSourceRef.current.close();
 }

 try {
 const eventSource = new EventSource(`/api/scan-premium-stream?symbols=${encodeURIComponent(otmSymbols)}`);
 otmEventSourceRef.current = eventSource;

 eventSource.onmessage = (event) => {
 const data = JSON.parse(event.data);
 
 if (data.type === 'progress') {
 setOtmScanProgress(data.progress);
 setOtmScanningSymbol(data.symbol);
 } else if (data.type === 'result') {
 setOtmResults(prev => {
 const newResults = [...prev, data.result];
 return newResults.sort((a, b) => 
 Math.abs(b.imbalancePercent) - Math.abs(a.imbalancePercent)
 );
 });
 } else if (data.type === 'complete') {
 setOtmLoading(false);
 setOtmLastUpdate(new Date());
 setOtmScanningSymbol('');
 eventSource.close();
 
 // Auto-scan completion handling
 if (isAutoScan) {
   console.log(`✅ OTM Auto-scan complete: Replacing old data (${otmLastScanData.length} items) with new data`);
   setOtmLastScanTimestamp(new Date());
   setOtmIsAutoScanning(false);
   // Clear lastScanData after replacement
   setOtmLastScanData([]);
 }
 } else if (data.type === 'error') {
 console.error('OTM Scan error:', data.error);
 }
 };

 eventSource.onerror = () => {
 setOtmLoading(false);
 setOtmScanningSymbol('');
 eventSource.close();
 
 // Reset auto-scan flags on error
 if (isAutoScan) {
   setOtmIsAutoScanning(false);
 }
 };

 } catch (error) {
 console.error('OTM Scan error:', error);
 setOtmLoading(false);
 
 // Reset auto-scan flags on error
 if (isAutoScan) {
   setOtmIsAutoScanning(false);
 }
 }
 };

 const formatExpiryDate = (dateStr: string) => {
 if (!dateStr) return '';
 const date = new Date(dateStr + 'T00:00:00');
 return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
 };

 useEffect(() => {
 const monthlyExpiry = getNextMonthlyExpiry();
 setOtmExpiry(monthlyExpiry);
 }, []);

 // Auto-scan interval - runs every 10 minutes during market hours
 useEffect(() => {
   if (!autoScanEnabled) {
     setNextScanTime(null);
     return;
   }
   
   console.log('🔄 Auto-scan enabled for Attraction Zone - triggering immediate scan');
   
   // Trigger IMMEDIATE scan when auto-scan is enabled
   if (isMarketHours()) {
     fetchGEXData(true);
   }
   
   // Set next scan time for 10 minutes from now
   setNextScanTime(calculateNextScanTime());
   
   // Countdown timer - updates every second
   const countdownInterval = setInterval(() => {
     setNextScanTime(prevTime => {
       if (!prevTime) return prevTime;
       
       const now = new Date();
       const diff = prevTime.getTime() - now.getTime();
       
       // Trigger scan when countdown reaches 0
       if (diff <= 0 && isMarketHours()) {
         console.log('⏰ Auto-scan triggered: Starting scan...');
         fetchGEXData(true);
         return calculateNextScanTime();
       }
       
       return prevTime;
     });
   }, 1000); // Check every second
   
   // Main scan interval - every 10 minutes
   const scanInterval = setInterval(() => {
     if (isMarketHours()) {
       console.log('⏰ 10-minute interval: Starting auto-scan...');
       fetchGEXData(true);
       setNextScanTime(calculateNextScanTime());
     } else {
       console.log('🕐 Outside market hours (9:30 AM - 4:00 PM ET): Skipping auto-scan');
     }
   }, 10 * 60 * 1000); // 10 minutes
   
   return () => {
     clearInterval(countdownInterval);
     clearInterval(scanInterval);
     console.log('🛑 Auto-scan disabled');
   };
 }, [autoScanEnabled]);

 // OTM Auto-scan interval - runs every 13 minutes during market hours
 useEffect(() => {
   if (!otmAutoScanEnabled) {
     setOtmNextScanTime(null);
     return;
   }
   
   console.log('🔄 OTM Auto-scan enabled - triggering immediate scan');
   
   // Trigger IMMEDIATE scan when auto-scan is enabled
   if (isMarketHours()) {
     scanOTMPremiums(true);
   }
   
   // Set next scan time for 13 minutes from now
   setOtmNextScanTime(calculateOtmNextScanTime());
   
   // Countdown timer - updates every second
   const countdownInterval = setInterval(() => {
     setOtmNextScanTime(prevTime => {
       if (!prevTime) return prevTime;
       
       const now = new Date();
       const diff = prevTime.getTime() - now.getTime();
       
       // Trigger scan when countdown reaches 0
       if (diff <= 0 && isMarketHours()) {
         console.log('⏰ OTM Auto-scan triggered: Starting scan...');
         scanOTMPremiums(true);
         return calculateOtmNextScanTime();
       }
       
       return prevTime;
     });
   }, 1000); // Check every second
   
   // Main scan interval - every 13 minutes
   const scanInterval = setInterval(() => {
     if (isMarketHours()) {
       console.log('⏰ 13-minute interval: Starting OTM auto-scan...');
       scanOTMPremiums(true);
       setOtmNextScanTime(calculateOtmNextScanTime());
     } else {
       console.log('🕐 Outside market hours (9:30 AM - 4:00 PM ET): Skipping OTM auto-scan');
     }
   }, 13 * 60 * 1000); // 13 minutes
   
   return () => {
     clearInterval(countdownInterval);
     clearInterval(scanInterval);
     console.log('🛑 OTM Auto-scan disabled');
   };
 }, [otmAutoScanEnabled]);

 const filteredGexData = gexData
 .filter(item => item.ticker.toLowerCase().includes(searchTerm.toLowerCase()))
 .filter(item => {
 // Base filter: only show strength >= 40% (Yellow, Blue, Purple)
 if (item.strength < 40) return false;
 
 // Strength filter
 if (strengthFilter === 'purple') return item.strength > 75;
 if (strengthFilter === 'blue') return item.strength >= 63 && item.strength <= 75;
 if (strengthFilter === 'yellow') return item.strength >= 40 && item.strength < 63;
 return true; // 'all' shows all >= 40%
 })
 .sort((a, b) => {
 const aValue = sortBy === 'dealerSweat' ? a.dealerSweat : 
 sortBy === 'targetLevel' ? a.attractionLevel : a.currentPrice;
 const bValue = sortBy === 'dealerSweat' ? b.dealerSweat : 
 sortBy === 'targetLevel' ? b.attractionLevel : b.currentPrice;
 
 return sortOrder === 'desc' ? bValue - aValue : aValue - bValue;
 });

 // Pagination calculations
 const totalPages = Math.ceil(filteredGexData.length / itemsPerPage);
 const startIndex = (currentPage - 1) * itemsPerPage;
 const endIndex = startIndex + itemsPerPage;
 const paginatedData = filteredGexData.slice(startIndex, endIndex);

 // Support/Resistance tab pagination
 const filteredWallData = filteredGexData
 .filter(item => item.largestWall)
 .sort((a, b) => (b.largestWall?.pressure || 0) - (a.largestWall?.pressure || 0));
 const totalWallPages = Math.ceil(filteredWallData.length / itemsPerPage);
 const paginatedWallData = filteredWallData.slice(startIndex, endIndex);

 // Reset to page 1 when filters change
 useEffect(() => {
 setCurrentPage(1);
 }, [searchTerm, sortBy, sortOrder, strengthFilter]);

 return (
 <div className="bg-gradient-to-br from-gray-950 via-black to-gray-900 text-white">
 {/* Premium Header - Mobile Responsive */}
 <div className="bg-gradient-to-r from-black via-gray-950 to-black border-b border-orange-500/30 shadow-2xl backdrop-blur-sm">
 <div className="px-3 md:px-8 py-3 md:py-6">
 {/* Mobile: Stack everything vertically */}
 <div className="flex flex-col gap-3 md:gap-0 md:flex-row md:items-center md:justify-between">
 {/* Title and Status Row */}
 <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-8">
 <div className="flex items-center gap-2 md:gap-4">
 <div className="space-y-1">
 <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
 <h1 className="font-semibold tracking-tight text-[#ff9900] text-base leading-tight">
 DERIVATIVE SCREENING
 </h1>
 <div className="flex items-center gap-2 flex-wrap">
 {expirationFilter !== 'Default' && (
 <div className="px-2 md:px-3 py-1 rounded-full bg-purple-500/20 border border-purple-500/40">
 <span className="text-purple-400 text-xs md:text-sm font-bold">{expirationFilter.toUpperCase()} EXPIRY</span>
 </div>
 )}
 {loading && scanProgress.total > 0 && (
 <div className="flex items-center gap-2 px-2 md:px-3 py-1 rounded-full bg-orange-500/20 border border-orange-500/40 animate-pulse">
 <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-orange-400 rounded-full animate-pulse"></div>
 <span className="text-orange-400 text-xs md:text-sm font-bold">SCANNING</span>
 </div>
 )}
 </div>
 </div>
 {loading && scanProgress.total > 0 && (
 <div className="text-xs md:text-sm text-orange-300/80">
 {scanProgress.current}/{scanProgress.total} ({Math.round((scanProgress.current / scanProgress.total) * 100)}%)
 </div>
 )}
 </div>
 </div>
 
 {/* Search Bar - Full width on mobile */}
 <div className="relative w-full md:w-80 md:ml-8">
 <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
 <Search className="h-3 w-3 md:h-4 md:w-4 text-gray-400" />
 </div>
 <input
 type="text"
 placeholder="Search..."
 value={searchTerm}
 onChange={(e) => setSearchTerm(e.target.value)}
 className="block w-full pl-8 md:pl-10 pr-3 py-2 md:py-3 text-sm border border-gray-700 rounded-xl bg-gray-900/50 backdrop-blur-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-300"
 />
 </div>
 </div>

 {/* Action Buttons Row */}
 <div className="flex items-center gap-2 md:gap-4">
 <button
 onClick={handleScan}
 disabled={loading}
 className={`px-4 md:px-6 py-2 md:py-3 font-bold text-xs md:text-sm transition-all duration-300 rounded-xl flex items-center gap-2 ${
 loading
 ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
 : 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
 }`}
 >
 <RefreshCw className={`w-4 h-4 md:w-5 md:h-5 ${loading ? 'animate-spin' : ''}`} />
 {loading ? 'SCANNING...' : 'SCAN NOW'}
 </button>
 
 {gexData.length > 0 && (
 <div className="px-3 md:px-4 py-2 md:py-3 bg-gray-900/50 border border-gray-700 rounded-xl">
 <span className="text-gray-300 font-medium text-xs md:text-sm mr-2">Results:</span>
 <span className="text-white font-bold text-sm md:text-base">{gexData.length}</span>
 </div>
 )}
 </div>
 </div>
 </div>
 </div>

 {/* Enhanced Navigation - Mobile Responsive */}
 <div className="bg-gradient-to-r from-gray-900/80 to-black/80 backdrop-blur-sm border-b border-orange-500/20 px-3 md:px-8 py-3 md:py-6">
 <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
 {/* Tab Buttons - Scroll on mobile */}
 <div className="flex gap-2 md:gap-4 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
 <button
 onClick={() => {
 setActiveTab('attraction');
 setCurrentPage(1);
 }}
 className={`flex items-center gap-2 md:gap-4 px-6 md:px-12 py-3 md:py-6 font-black text-sm md:text-lg transition-all duration-300 relative rounded-xl whitespace-nowrap flex-shrink-0 ${
 activeTab === 'attraction' 
 ? 'bg-black text-orange-400 shadow-2xl transform scale-105 border-2 border-orange-500/50 backdrop-blur-sm' 
 : 'bg-black text-gray-300 hover:text-orange-300 border-2 border-gray-600/50 hover:border-orange-500/30 shadow-xl backdrop-blur-sm'
 } bg-gradient-to-b from-gray-900/80 to-black shadow-inner`}
 style={{
 background: activeTab === 'attraction' 
 ? 'linear-gradient(145deg, #1a1a1a, #000000), linear-gradient(to bottom, rgba(255,153,0,0.1), rgba(0,0,0,0.9))'
 : 'linear-gradient(145deg, #1a1a1a, #000000), linear-gradient(to bottom, rgba(55,65,81,0.1), rgba(0,0,0,0.9))'
 }}
 >
 <Target className="w-4 h-4 md:w-6 md:h-6" />
 <span className="hidden sm:inline tracking-wider">ATTRACTION ZONES</span>
 <span className="sm:hidden tracking-wider">ATTRACTION</span>
 {activeTab === 'attraction' && (
 <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-12 h-1.5 bg-gradient-to-r from-orange-400 to-orange-600 rounded-full shadow-lg" />
 )}
 </button>
 <button
 onClick={() => {
 setActiveTab('otm-premiums');
 setCurrentPage(1);
 }}
 className={`flex items-center gap-2 md:gap-4 px-6 md:px-12 py-3 md:py-6 font-black text-sm md:text-lg transition-all duration-300 relative rounded-xl whitespace-nowrap flex-shrink-0 ${
 activeTab === 'otm-premiums' 
 ? 'bg-black text-orange-400 shadow-2xl transform scale-105 border-2 border-orange-500/50 backdrop-blur-sm' 
 : 'bg-black text-gray-300 hover:text-orange-300 border-2 border-gray-600/50 hover:border-orange-500/30 shadow-xl backdrop-blur-sm'
 } bg-gradient-to-b from-gray-900/80 to-black shadow-inner`}
 style={{
 background: activeTab === 'otm-premiums' 
 ? 'linear-gradient(145deg, #1a1a1a, #000000), linear-gradient(to bottom, rgba(255,153,0,0.1), rgba(0,0,0,0.9))'
 : 'linear-gradient(145deg, #1a1a1a, #000000), linear-gradient(to bottom, rgba(55,65,81,0.1), rgba(0,0,0,0.9))'
 }}
 >
 <Layers className="w-4 h-4 md:w-6 md:h-6" />
 <span className="hidden sm:inline tracking-wider">OTM PREMIUMS</span>
 <span className="sm:hidden tracking-wider">OTM</span>
 {activeTab === 'otm-premiums' && (
 <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-12 h-1.5 bg-gradient-to-r from-orange-400 to-orange-600 rounded-full shadow-lg" />
 )}
 </button>
 <button
 onClick={() => {
 setActiveTab('flip-scan');
 setCurrentPage(1);
 }}
 className={`flex items-center gap-2 md:gap-4 px-6 md:px-12 py-3 md:py-6 font-black text-sm md:text-lg transition-all duration-300 relative rounded-xl whitespace-nowrap flex-shrink-0 ${
 activeTab === 'flip-scan' 
 ? 'bg-black text-orange-400 shadow-2xl transform scale-105 border-2 border-orange-500/50 backdrop-blur-sm' 
 : 'bg-black text-gray-300 hover:text-orange-300 border-2 border-gray-600/50 hover:border-orange-500/30 shadow-xl backdrop-blur-sm'
 } bg-gradient-to-b from-gray-900/80 to-black shadow-inner`}
 style={{
 background: activeTab === 'flip-scan' 
 ? 'linear-gradient(145deg, #1a1a1a, #000000), linear-gradient(to bottom, rgba(255,153,0,0.1), rgba(0,0,0,0.9))'
 : 'linear-gradient(145deg, #1a1a1a, #000000), linear-gradient(to bottom, rgba(55,65,81,0.1), rgba(0,0,0,0.9))'
 }}
 >
 <RefreshCw className="w-4 h-4 md:w-6 md:h-6" />
 <span className="hidden sm:inline tracking-wider">FLIP SCAN</span>
 <span className="sm:hidden tracking-wider">FLIP</span>
 {activeTab === 'flip-scan' && (
 <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-12 h-1.5 bg-gradient-to-r from-orange-400 to-orange-600 rounded-full shadow-lg" />
 )}
 </button>
 </div>
 
 {/* Filter Controls - Expiration and Strength Filters */}
 <div className="flex items-center gap-3">
 <select 
 value={expirationFilter}
 onChange={(e) => setExpirationFilter(e.target.value)}
 className="bg-gray-800/50 border border-gray-600/50 rounded-xl px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm font-semibold text-white hover:bg-gray-700/70 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
 >
 <option value="Default">Default (45 Days)</option>
 <option value="Week">Week</option>
 <option value="Month">Month</option>
 <option value="Quad">Quad</option>
 </select>
 
 <select 
 value={strengthFilter}
 onChange={(e) => setStrengthFilter(e.target.value as 'all' | 'purple' | 'blue' | 'yellow')}
 className="bg-gray-800/50 border border-gray-600/50 rounded-xl px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm font-semibold text-white hover:bg-gray-700/70 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
 >
 <option value="all">All Strengths</option>
 <option value="purple">🟣 Magnetic Only (&gt;75%)</option>
 <option value="blue">🔵 Moderate Only (63-75%)</option>
 <option value="yellow">🟡 Weak Pull (40-62%)</option>
 </select>
 </div>
 </div>
 </div>

 <div className="px-3 md:px-8 py-3 md:py-6">
 {/* Attraction Zones View */}
 {activeTab === 'attraction' && (
 <div>
 {/* Auto-Scan Controls Bar */}
 <div className="mb-4 bg-gradient-to-r from-gray-900/90 to-black/90 border border-orange-500/30 rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
 <div className="flex items-center gap-4 flex-wrap">
 {/* Auto-Scan Toggle */}
 <button
 onClick={() => {
 const newState = !autoScanEnabled;
 setAutoScanEnabled(newState);
 if (newState) {
 console.log('🔄 Auto-scan enabled');
 } else {
 console.log('🛑 Auto-scan disabled');
 }
 }}
 className={`px-4 py-2 rounded-lg font-bold text-sm transition-all duration-300 ${
 autoScanEnabled
 ? 'bg-green-600 text-white shadow-lg shadow-green-500/50 hover:bg-green-700'
 : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
 }`}
 >
 {autoScanEnabled ? '✓ Auto-Scan ON' : 'Auto-Scan OFF'}
 </button>
 
 {/* Countdown Timer */}
 {autoScanEnabled && nextScanTime && (
 <div className="flex items-center gap-2 px-4 py-2 bg-black/50 rounded-lg border border-orange-500/30">
 <Activity className="w-4 h-4 text-orange-400 animate-pulse" />
 <span className="text-sm font-bold text-orange-400">
 Next scan: {getCountdownDisplay()}
 </span>
 </div>
 )}
 
 {/* Auto-Scanning Indicator */}
 {isAutoScanning && (
 <div className="flex items-center gap-2 px-4 py-2 bg-blue-900/30 rounded-lg border border-blue-500/30">
 <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
 <span className="text-sm font-bold text-blue-400">
 Auto-scanning...
 </span>
 </div>
 )}
 
 {/* Last Scan Timestamp */}
 {lastScanTimestamp && (
 <div className="text-xs text-gray-400">
 Last scan: {lastScanTimestamp.toLocaleTimeString('en-US', { 
 hour: '2-digit', 
 minute: '2-digit',
 second: '2-digit'
 })}
 </div>
 )}
 </div>
 
 {/* Market Hours Status */}
 <div className="flex items-center gap-2">
 <div className={`w-2 h-2 rounded-full ${isMarketHours() ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
 <span className="text-xs font-semibold text-gray-400">
 {isMarketHours() ? 'Market Open' : 'Market Closed'}
 </span>
 </div>
 </div>
 
 {/* Scan Progress Bar - Shows for both auto-scan and manual scan */}
 {(loading || isAutoScanning) && scanProgress.total > 0 && (
 <div className="mb-4 bg-gray-900/50 border border-blue-500/30 rounded-xl p-4">
 <div className="flex items-center justify-between mb-2">
 <span className="text-sm font-bold text-blue-400">
 {isAutoScanning ? 'Auto-Scan' : 'Scan'} Progress: {scanProgress.current} / {scanProgress.total} stocks
 </span>
 <span className="text-sm font-bold text-blue-400">
 {Math.round((scanProgress.current / scanProgress.total) * 100)}%
 </span>
 </div>
 <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
 <div
 className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-300 ease-out relative"
 style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%` }}
 >
 <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
 </div>
 </div>
 </div>
 )}
 
 {/* Column Headers - Desktop Only */}
 <div className="hidden lg:block px-6 py-4 mb-4 border-b border-gray-700/30">
 <div className="flex items-center gap-8">
 {/* Symbol Header */}
 <div className="w-24 flex-shrink-0">
 <div className="text-xl font-black text-orange-400 uppercase tracking-wider">SYMBOL</div>
 </div>

 {/* Main Data Headers */}
 <div className="flex-1 grid grid-cols-5 gap-8">
 <div>
 <div className="text-xl font-black text-orange-400 uppercase tracking-wider">CURRENT PRICE</div>
 </div>
 <div>
 <div className="text-xl font-black text-orange-400 uppercase tracking-wider">TARGET LEVEL</div>
 </div>
 <div>
 <div className="text-xl font-black text-orange-400 uppercase tracking-wider">VALUE</div>
 </div>
 <div>
 <div className="text-xl font-black text-orange-400 uppercase tracking-wider">WALL LEVEL</div>
 </div>
 <div>
 <div className="text-xl font-black text-orange-400 uppercase tracking-wider">WALL VALUE</div>
 </div>
 </div>
 </div>
 </div>

 <div className="space-y-3">
 {error && (
 <div className="text-center py-8">
 <div className="text-red-400 font-bold text-sm"> {error}</div>
 </div>
 )}
 {(!loading || paginatedData.length > 0) && paginatedData.map((item, idx) => (
 <div
 key={`${item.ticker}-${idx}`}
 onClick={() => setSelectedRow(selectedRow === idx ? null : idx)}
 onMouseEnter={() => setHoveredRow(idx)}
 onMouseLeave={() => setHoveredRow(null)}
 className={`relative rounded-xl md:rounded-2xl border transition-all duration-500 cursor-pointer animate-fadeIn ${
 selectedRow === idx 
 ? 'bg-black border-orange-500/50 shadow-xl shadow-orange-500/20' 
 : hoveredRow === idx
 ? 'bg-black border-orange-400/40 shadow-lg shadow-orange-500/10'
 : 'bg-black border-gray-700/30 hover:border-gray-600/50'
 } ${idx === 0 && loading ? 'border-orange-400/60 shadow-lg shadow-orange-400/20' : ''}`}
 >
 
 {/* Desktop Layout */}
 <div className="hidden lg:block relative p-6">
 <div className="flex items-center gap-8">
 {/* Symbol */}
 <div className="w-24 flex-shrink-0">
 <div className="text-2xl font-black text-white">
 {item.ticker}
 </div>
 </div>

 {/* Main Data Grid */}
 <div className="flex-1 grid grid-cols-5 gap-8">
 <div>
 <div className="text-xl font-bold text-white">${item.currentPrice.toFixed(2)}</div>
 </div>
 <div>
 <div className={`text-xl font-black ${
 item.strength > 75 ? 'text-purple-400' :
 item.strength >= 63 ? 'text-blue-400' :
 item.strength >= 40 ? 'text-yellow-400' :
 'text-white'
 }`}>
 ${item.attractionLevel.toFixed(2)}
 </div>
 </div>
 <div>
 <div className={`text-xl font-bold ${item.dealerSweat > 0 ? 'text-green-400' : 'text-red-400'}`}>
 {item.dealerSweat > 0 ? '+' : ''}{item.dealerSweat.toFixed(2)}B
 </div>
 </div>
 <div>
 {item.largestWall ? (
 <div className={`text-xl font-black ${
 item.largestWall.type === 'call' ? 'text-red-500' : 'text-green-500'
 }`}>
 ${item.largestWall.strike.toFixed(2)}
 </div>
 ) : (
 <div className="text-xl font-bold text-gray-500">-</div>
 )}
 </div>
 <div>
 {item.largestWall ? (
 <div className="text-xl font-bold text-white">
 ${item.largestWall.gex.toFixed(2)}B
 </div>
 ) : (
 <div className="text-xl font-bold text-gray-500">-</div>
 )}
 </div>
 </div>
 </div>

 {/* Expanded Details */}
 {selectedRow === idx && (
 <div className="mt-6 pt-6 border-t border-gray-600/30 animate-fadeIn">
 <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
 <div className="bg-gray-800/50 rounded-xl p-3 md:p-4">
 <div className="text-xs text-gray-400 mb-1 md:mb-2">Volume Profile</div>
 <div className="text-sm md:text-lg font-bold text-green-400">High Activity</div>
 </div>
 <div className="bg-gray-800/50 rounded-xl p-3 md:p-4">
 <div className="text-xs text-gray-400 mb-1 md:mb-2">Delta Exposure</div>
 <div className="text-sm md:text-lg font-bold text-blue-400">+2.4M</div>
 </div>
 <div className="bg-gray-800/50 rounded-xl p-3 md:p-4">
 <div className="text-xs text-gray-400 mb-1 md:mb-2">Implied Move</div>
 <div className="text-sm md:text-lg font-bold text-purple-400">±3.2%</div>
 </div>
 <div className="bg-gray-800/50 rounded-xl p-3 md:p-4">
 <div className="text-xs text-gray-400 mb-1 md:mb-2">Risk Level</div>
 <div className="text-sm md:text-lg font-bold text-yellow-400">Medium</div>
 </div>
 </div>
 </div>
 )}
 </div>

 {/* Mobile Card Layout */}
 <div className="lg:hidden relative p-3 md:p-4">
 <div className="space-y-3">
 {/* Symbol and Price Row */}
 <div className="flex items-center justify-between">
 <div className="text-xl md:text-2xl font-black text-white">
 {item.ticker}
 </div>
 <div className="text-lg md:text-xl font-bold text-white">
 ${item.currentPrice.toFixed(2)}
 </div>
 </div>

 {/* Data Grid - 2 columns on mobile */}
 <div className="grid grid-cols-2 gap-3">
 <div className="bg-gray-900/50 rounded-lg p-2">
 <div className="text-xs text-orange-400 font-bold mb-1">TARGET LEVEL</div>
 <div className={`text-base font-black ${
 item.strength > 75 ? 'text-purple-400' :
 item.strength >= 63 ? 'text-blue-400' :
 item.strength >= 40 ? 'text-yellow-400' :
 'text-white'
 }`}>
 ${item.attractionLevel.toFixed(2)}
 </div>
 </div>

 <div className="bg-gray-900/50 rounded-lg p-2">
 <div className="text-xs text-orange-400 font-bold mb-1">VALUE</div>
 <div className={`text-base font-bold ${item.dealerSweat > 0 ? 'text-green-400' : 'text-red-400'}`}>
 {item.dealerSweat > 0 ? '+' : ''}{item.dealerSweat.toFixed(2)}B
 </div>
 </div>

 <div className="bg-gray-900/50 rounded-lg p-2">
 <div className="text-xs text-orange-400 font-bold mb-1">WALL LEVEL</div>
 {item.largestWall ? (
 <div className={`text-base font-black ${
 item.largestWall.type === 'call' ? 'text-red-500' : 'text-green-500'
 }`}>
 ${item.largestWall.strike.toFixed(2)}
 </div>
 ) : (
 <div className="text-base font-bold text-gray-500">-</div>
 )}
 </div>

 <div className="bg-gray-900/50 rounded-lg p-2">
 <div className="text-xs text-orange-400 font-bold mb-1">WALL VALUE</div>
 {item.largestWall ? (
 <div className="text-base font-bold text-white">
 ${item.largestWall.gex.toFixed(2)}B
 </div>
 ) : (
 <div className="text-base font-bold text-gray-500">-</div>
 )}
 </div>
 </div>
 </div>

 {/* Expanded Details for Mobile */}
 {selectedRow === idx && (
 <div className="mt-3 pt-3 border-t border-gray-600/30 animate-fadeIn">
 <div className="grid grid-cols-2 gap-3">
 <div className="bg-gray-800/50 rounded-xl p-3">
 <div className="text-xs text-gray-400 mb-1">Volume Profile</div>
 <div className="text-sm font-bold text-green-400">High Activity</div>
 </div>
 <div className="bg-gray-800/50 rounded-xl p-3">
 <div className="text-xs text-gray-400 mb-1">Delta Exposure</div>
 <div className="text-sm font-bold text-blue-400">+2.4M</div>
 </div>
 <div className="bg-gray-800/50 rounded-xl p-3">
 <div className="text-xs text-gray-400 mb-1">Implied Move</div>
 <div className="text-sm font-bold text-purple-400">±3.2%</div>
 </div>
 <div className="bg-gray-800/50 rounded-xl p-3">
 <div className="text-xs text-gray-400 mb-1">Risk Level</div>
 <div className="text-sm font-bold text-yellow-400">Medium</div>
 </div>
 </div>
 </div>
 )}
 </div>
 </div>
 ))}
 </div>

 {/* Pagination Controls for Attraction Tab */}
 {filteredGexData.length > itemsPerPage && (
 <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 md:mt-8 px-3 md:px-6 py-3 md:py-6 bg-gray-900/30 rounded-xl border border-gray-700/30">
 <div className="text-xs md:text-sm text-gray-400 font-semibold">
 {startIndex + 1}-{Math.min(endIndex, filteredGexData.length)} of {filteredGexData.length}
 </div>
 <div className="flex items-center gap-2 md:gap-3">
 <button
 onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
 disabled={currentPage === 1}
 className="px-3 md:px-6 py-2 md:py-3 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 text-xs md:text-sm font-bold text-white"
 >
 <span className="hidden sm:inline">← Previous</span>
 <span className="sm:hidden">←</span>
 </button>
 <div className="flex items-center gap-1 md:gap-2">
 {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
 const pageNum = currentPage <= 3 ? i + 1 : 
 currentPage >= totalPages - 2 ? totalPages - 4 + i :
 currentPage - 2 + i;
 return pageNum > 0 && pageNum <= totalPages ? (
 <button
 key={pageNum}
 onClick={() => setCurrentPage(pageNum)}
 className={`min-w-[32px] md:min-w-[44px] h-8 md:h-12 px-2 md:px-4 rounded-lg font-bold transition-all duration-300 text-xs md:text-base ${
 currentPage === pageNum
 ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-black shadow-lg scale-110'
 : 'bg-gray-800 border border-gray-700 text-white hover:bg-gray-700 hover:border-orange-500/50'
 }`}
 >
 {pageNum}
 </button>
 ) : null;
 })}
 </div>
 <button
 onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
 disabled={currentPage === totalPages}
 className="px-3 md:px-6 py-2 md:py-3 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 text-xs md:text-sm font-bold text-white"
 >
 <span className="hidden sm:inline">Next →</span>
 <span className="sm:hidden">→</span>
 </button>
 </div>
 <div className="text-sm text-gray-400 font-semibold">
 Page {currentPage} of {totalPages}
 </div>
 </div>
 )}
 </div>
 )}

 {/* OTM Premiums View */}
 {activeTab === 'otm-premiums' && (
 <div>
 {/* Auto-Scan Controls Bar */}
 <div className="mb-4 mx-3 md:mx-6 bg-gradient-to-r from-gray-900/90 to-black/90 border border-orange-500/30 rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
 <div className="flex items-center gap-4 flex-wrap">
 {/* Auto-Scan Toggle */}
 <button
 onClick={() => {
 const newState = !otmAutoScanEnabled;
 setOtmAutoScanEnabled(newState);
 setOtmAutoScanEnabled(newState);
 }}
 className={`px-4 py-2 rounded-lg font-bold text-sm transition-all duration-300 ${
 otmAutoScanEnabled
 ? 'bg-green-600 text-white shadow-lg shadow-green-500/50 hover:bg-green-700'
 : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
 }`}
 >
 {otmAutoScanEnabled ? '✓ Auto-Scan ON' : 'Auto-Scan OFF'}
 </button>
 
 {/* Countdown Timer */}
 {otmAutoScanEnabled && otmNextScanTime && (
 <div className="flex items-center gap-2 px-4 py-2 bg-black/50 rounded-lg border border-orange-500/30">
 <Activity className="w-4 h-4 text-orange-400 animate-pulse" />
 <span className="text-sm font-bold text-orange-400">
 Next scan: {getOtmCountdownDisplay()}
 </span>
 </div>
 )}
 
 {/* Auto-Scanning Indicator */}
 {otmIsAutoScanning && (
 <div className="flex items-center gap-2 px-4 py-2 bg-blue-900/30 rounded-lg border border-blue-500/30">
 <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
 <span className="text-sm font-bold text-blue-400">
 Auto-scanning...
 </span>
 </div>
 )}
 
 {/* Last Scan Timestamp */}
 {otmLastScanTimestamp && (
 <div className="text-xs text-gray-400">
 Last scan: {otmLastScanTimestamp.toLocaleTimeString('en-US', { 
 hour: '2-digit', 
 minute: '2-digit',
 second: '2-digit'
 })}
 </div>
 )}
 </div>
 
 {/* Market Hours Status */}
 <div className="flex items-center gap-2">
 <div className={`w-2 h-2 rounded-full ${isMarketHours() ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
 <span className="text-xs font-semibold text-gray-400">
 {isMarketHours() ? 'Market Open' : 'Market Closed'}
 </span>
 </div>
 </div>
 
 {/* Scan Progress Bar - Shows for both auto-scan and manual scan */}
 {(otmLoading || otmIsAutoScanning) && otmScanProgress.total > 0 && (
 <div className="mb-4 mx-3 md:mx-6 bg-gray-900/50 border border-blue-500/30 rounded-xl p-4">
 <div className="flex items-center justify-between mb-2">
 <span className="text-sm font-bold text-blue-400">
 {otmIsAutoScanning ? 'Auto-Scan' : 'Scan'} Progress: {otmScanProgress.current} / {otmScanProgress.total} stocks
 </span>
 <span className="text-sm font-bold text-blue-400">
 {Math.round((otmScanProgress.current / otmScanProgress.total) * 100)}%
 </span>
 </div>
 <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
 <div
 className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-300 ease-out relative"
 style={{ width: `${(otmScanProgress.current / otmScanProgress.total) * 100}%` }}
 >
 <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
 </div>
 </div>
 </div>
 )}
 
 {/* Control Bar - Mobile Responsive */}
 <div className="px-3 md:px-6 py-3 md:py-4 mb-3 md:mb-4 border-b border-gray-700/30">
 {/* First Row: Scan Button and Expiry */}
 <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 md:gap-6 mb-3">
 <button
 onClick={() => scanOTMPremiums(false)}
 disabled={otmLoading}
 className="px-4 md:px-6 py-2 md:py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-bold text-xs md:text-sm transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 md:gap-3 shadow-xl rounded-lg"
 >
 <RefreshCw className={`w-4 h-4 md:w-5 md:h-5 ${otmLoading ? 'animate-spin' : ''}`} />
 {otmLoading ? 'SCANNING' : 'SCAN'}
 </button>

 <div className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-3 bg-gray-900 rounded-lg border border-gray-700">
 <span className="text-gray-300 font-medium text-xs md:text-sm">EXPIRY:</span>
 <span className="text-white font-bold text-xs md:text-sm">{formatExpiryDate(otmExpiry)}</span>
 </div>

 {otmLoading && (
 <div className="flex-1">
 <div className="flex items-center justify-between text-xs mb-2">
 <span className="text-white font-bold truncate mr-2">
 {otmScanningSymbol ? <span className="text-blue-400">{otmScanningSymbol}</span> : <span className="text-gray-300">Processing...</span>}
 </span>
 <span className="text-white font-bold whitespace-nowrap">{otmScanProgress.current} / {otmScanProgress.total}</span>
 </div>
 <div className="h-2 md:h-3 bg-gray-900 rounded-full border border-gray-700 overflow-hidden">
 <div 
 className="h-full bg-gradient-to-r from-blue-500 via-blue-400 to-blue-500 transition-all duration-500"
 style={{ width: `${otmScanProgress.total > 0 ? (otmScanProgress.current / otmScanProgress.total) * 100 : 0}%` }}
 />
 </div>
 </div>
 )}
 </div>

 {/* Second Row: Stats and Severity */}
 <div className="flex flex-wrap items-center gap-2 md:gap-4">
 {!otmLoading && (
 <>
 <div className="px-3 md:px-4 py-2 md:py-3 bg-gray-900 border border-gray-700 rounded-lg">
 <span className="text-gray-300 font-medium text-xs md:text-sm mr-1 md:mr-2">Universe:</span>
 <span className="text-white font-bold text-xs md:text-sm">{otmSymbols.split(',').length}</span>
 </div>
 <div className="px-3 md:px-4 py-2 md:py-3 bg-gray-900 border border-gray-700 rounded-lg">
 <span className="text-gray-300 font-medium text-xs md:text-sm mr-1 md:mr-2">Qualified:</span>
 <span className="text-white font-bold text-sm md:text-lg">{otmResults.length}</span>
 </div>
 </>
 )}

 <div className="ml-auto flex gap-2 md:gap-4 text-xs">
 <div className="flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1 md:py-2 bg-gray-900 rounded-lg border border-red-500/30">
 <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-red-400 rounded-full animate-pulse"></div>
 <span className="text-red-200 font-bold text-xs">EXTREME</span>
 <span className="text-white font-bold text-xs">{otmResults.filter(r => r.imbalanceSeverity === 'EXTREME').length}</span>
 </div>
 <div className="flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1 md:py-2 bg-gray-900 rounded-lg border border-yellow-500/30">
 <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-yellow-400 rounded-full"></div>
 <span className="text-yellow-200 font-bold text-xs">HIGH</span>
 <span className="text-white font-bold text-xs">{otmResults.filter(r => r.imbalanceSeverity === 'HIGH').length}</span>
 </div>
 </div>
 </div>
 </div>

 {/* Results */}
 <div className="space-y-3 px-3 md:px-6">
 {otmResults.length === 0 && !otmLoading && (
 <div className="text-center py-8 md:py-16">
 <div className="text-lg md:text-xl font-bold text-white mb-2 md:mb-3">OTM Premium Scanner</div>
 <div className="text-xs md:text-sm mb-3 md:mb-4 max-w-md mx-auto text-gray-300 px-4">
 Scanning <span className="text-white font-bold">TOP 1000 STOCKS</span> for OTM premium imbalances.<br/>
 Compares first OTM calls (above) vs OTM puts (below) stock price.
 </div>
 <div className="text-xs text-gray-500">Example: Stock at $53.60 → Compare $54 calls vs $53 puts</div>
 </div>
 )}

 {otmResults.length === 0 && otmLoading && (
 <div className="text-center py-8 md:py-16">
 <RefreshCw className="w-6 h-6 md:w-8 md:h-8 text-white animate-spin mb-3 md:mb-4 mx-auto" />
 <div className="text-white text-xs md:text-sm font-medium">Scanning TOP 1000 stocks for OTM premium imbalances...</div>
 <div className="text-gray-400 text-xs mt-2">Finding calls above stock vs puts below stock imbalances</div>
 </div>
 )}

 {otmResults.length > 0 && otmResults.map((result, idx) => (
 <div
 key={`${result.symbol}-${idx}`}
 className="bg-black border border-gray-700 hover:border-gray-600 hover:shadow-xl transition-all duration-300 rounded-xl overflow-hidden"
 >
 {/* Desktop Layout */}
 <div className="hidden lg:grid grid-cols-12 gap-4 p-4 items-center">
 <div className="col-span-2">
 <div className="flex items-baseline gap-2">
 <span className="text-xl font-black text-orange-500">{result.symbol}</span>
 {result.imbalanceSeverity === 'EXTREME' && (
 <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse"></div>
 )}
 </div>
 <div className="text-sm text-white font-medium mt-0.5">${result.stockPrice.toFixed(2)}</div>
 </div>

 <div className="col-span-1 text-center">
 <div className="text-xs text-gray-300 font-bold mb-2">STRIKES</div>
 <div className="text-white font-bold text-sm">${result.putStrike} / ${result.callStrike}</div>
 <div className="text-xs text-gray-400 font-medium mt-1">({result.strikeSpacing} spacing)</div>
 </div>

 <div className="col-span-2 bg-green-900/20 border border-green-500/30 p-3 rounded-lg">
 <div className="flex items-center gap-2 mb-2">
 <TrendingUp className="w-4 h-4 text-green-400" />
 <span className="text-xs text-green-300 font-bold">OTM CALLS</span>
 </div>
 <div className="text-xl font-black text-white">${result.callMid.toFixed(2)}</div>
 <div className="text-xs text-gray-300 font-medium mt-2">${result.callStrike} | {result.callBid.toFixed(2)} × {result.callAsk.toFixed(2)}</div>
 </div>

 <div className="col-span-2 bg-red-900/20 border border-red-500/30 p-3 rounded-lg">
 <div className="flex items-center gap-2 mb-2">
 <TrendingDown className="w-4 h-4 text-red-400" />
 <span className="text-xs text-red-300 font-bold">OTM PUTS</span>
 </div>
 <div className="text-xl font-black text-white">${result.putMid.toFixed(2)}</div>
 <div className="text-xs text-gray-300 font-medium mt-2">${result.putStrike} | {result.putBid.toFixed(2)} × {result.putAsk.toFixed(2)}</div>
 </div>

 <div className="col-span-2 text-center">
 <div className="text-xs text-gray-300 font-bold mb-2">DIFFERENCE</div>
 <div className={`text-xl font-black ${result.premiumDifference > 0 ? 'text-green-300' : 'text-red-300'}`}>
 ${Math.abs(result.premiumDifference).toFixed(2)}
 </div>
 </div>

 <div className="col-span-2 text-center">
 <div className="text-xs text-gray-300 font-bold mb-2">IMBALANCE</div>
 <div className={`text-3xl font-black ${
 result.imbalanceSeverity === 'EXTREME' ? 'text-red-500' :
 result.imbalanceSeverity === 'HIGH' ? 'text-red-400' :
 'text-yellow-400'
 }`}>
 {Math.abs(result.imbalancePercent).toFixed(1)}%
 </div>
 </div>

 <div className="col-span-1 flex justify-end">
 <div className={`px-4 py-2 text-xs font-black ${
 result.imbalanceSeverity === 'EXTREME' 
 ? 'bg-gradient-to-r from-red-500 to-red-400 text-white' 
 : result.imbalanceSeverity === 'HIGH'
 ? 'bg-gradient-to-r from-red-400 to-red-300 text-white'
 : 'bg-gradient-to-r from-yellow-500 to-yellow-400 text-black'
 } rounded-lg`}>
 {result.imbalanceSeverity}
 </div>
 </div>
 </div>

 {/* Desktop Footer */}
 <div className="hidden lg:flex border-t border-gray-700 px-4 py-3 bg-gray-900/50 items-center justify-between text-xs">
 <div className="flex gap-8">
 <span className="text-gray-300 font-medium">Call ${result.callStrike} Spread: <span className="text-white font-bold">{result.callSpreadPercent.toFixed(1)}%</span></span>
 <span className="text-gray-300 font-medium">Put ${result.putStrike} Spread: <span className="text-white font-bold">{result.putSpreadPercent.toFixed(1)}%</span></span>
 </div>
 <div className="text-white font-bold">
 {result.expensiveSide === 'CALLS' 
 ? `→ OTM Calls ($${result.callStrike}) more expensive - BULLISH FLOW` 
 : `→ OTM Puts ($${result.putStrike}) more expensive - BEARISH FLOW`}
 </div>
 </div>

 {/* Mobile Layout */}
 <div className="lg:hidden p-3 space-y-3">
 {/* Header Row */}
 <div className="flex items-center justify-between">
 <div>
 <div className="flex items-baseline gap-2">
 <span className="text-lg font-black text-orange-500">{result.symbol}</span>
 {result.imbalanceSeverity === 'EXTREME' && (
 <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse"></div>
 )}
 </div>
 <div className="text-xs text-white font-medium">${result.stockPrice.toFixed(2)}</div>
 </div>
 <div className={`px-3 py-1 text-xs font-black ${
 result.imbalanceSeverity === 'EXTREME' 
 ? 'bg-gradient-to-r from-red-500 to-red-400 text-white' 
 : result.imbalanceSeverity === 'HIGH'
 ? 'bg-gradient-to-r from-red-400 to-red-300 text-white'
 : 'bg-gradient-to-r from-yellow-500 to-yellow-400 text-black'
 } rounded-lg`}>
 {result.imbalanceSeverity}
 </div>
 </div>

 {/* Strikes Info */}
 <div className="text-center bg-gray-900/50 rounded-lg p-2">
 <div className="text-xs text-gray-300 font-bold mb-1">STRIKES</div>
 <div className="text-white font-bold text-sm">${result.putStrike} / ${result.callStrike}</div>
 <div className="text-xs text-gray-400 font-medium mt-0.5">({result.strikeSpacing} spacing)</div>
 </div>

 {/* Calls vs Puts */}
 <div className="grid grid-cols-2 gap-2">
 <div className="bg-green-900/20 border border-green-500/30 p-2 rounded-lg">
 <div className="flex items-center gap-1 mb-1">
 <TrendingUp className="w-3 h-3 text-green-400" />
 <span className="text-xs text-green-300 font-bold">CALLS</span>
 </div>
 <div className="text-lg font-black text-white">${result.callMid.toFixed(2)}</div>
 <div className="text-xs text-gray-300 font-medium mt-1">${result.callStrike}</div>
 <div className="text-xs text-gray-400">{result.callBid.toFixed(2)} × {result.callAsk.toFixed(2)}</div>
 </div>

 <div className="bg-red-900/20 border border-red-500/30 p-2 rounded-lg">
 <div className="flex items-center gap-1 mb-1">
 <TrendingDown className="w-3 h-3 text-red-400" />
 <span className="text-xs text-red-300 font-bold">PUTS</span>
 </div>
 <div className="text-lg font-black text-white">${result.putMid.toFixed(2)}</div>
 <div className="text-xs text-gray-300 font-medium mt-1">${result.putStrike}</div>
 <div className="text-xs text-gray-400">{result.putBid.toFixed(2)} × {result.putAsk.toFixed(2)}</div>
 </div>
 </div>

 {/* Metrics */}
 <div className="grid grid-cols-2 gap-2">
 <div className="bg-gray-900/50 rounded-lg p-2 text-center">
 <div className="text-xs text-gray-300 font-bold mb-1">DIFFERENCE</div>
 <div className={`text-lg font-black ${result.premiumDifference > 0 ? 'text-green-300' : 'text-red-300'}`}>
 ${Math.abs(result.premiumDifference).toFixed(2)}
 </div>
 </div>

 <div className="bg-gray-900/50 rounded-lg p-2 text-center">
 <div className="text-xs text-gray-300 font-bold mb-1">IMBALANCE</div>
 <div className={`text-2xl font-black ${
 result.imbalanceSeverity === 'EXTREME' ? 'text-red-500' :
 result.imbalanceSeverity === 'HIGH' ? 'text-red-400' :
 'text-yellow-400'
 }`}>
 {Math.abs(result.imbalancePercent).toFixed(1)}%
 </div>
 </div>
 </div>

 {/* Footer Info */}
 <div className="border-t border-gray-700 pt-2 space-y-1 text-xs">
 <div className="text-gray-300">
 Call Spread: <span className="text-white font-bold">{result.callSpreadPercent.toFixed(1)}%</span>
 </div>
 <div className="text-gray-300">
 Put Spread: <span className="text-white font-bold">{result.putSpreadPercent.toFixed(1)}%</span>
 </div>
 <div className="text-white font-bold text-xs">
 {result.expensiveSide === 'CALLS' 
 ? `→ OTM Calls more expensive - BULLISH` 
 : `→ OTM Puts more expensive - BEARISH`}
 </div>
 </div>
 </div>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* Flip Scan View */}
 {activeTab === 'flip-scan' && (
 <div>
 <div className="text-center py-8">
 <div className="text-xl font-bold text-white">Flip Scan</div>
 </div>
 </div>
 )}
 </div>

 {/* Custom Styles */}
 <style jsx>{`
 @keyframes shimmer {
 0% { transform: translateX(-100%); }
 100% { transform: translateX(100%); }
 }
 @keyframes fadeIn {
 from { opacity: 0; transform: translateY(20px); }
 to { opacity: 1; transform: translateY(0); }
 }
 .animate-fadeIn {
 animation: fadeIn 0.3s ease-out;
 }
 `}</style>
 </div>
 );
}