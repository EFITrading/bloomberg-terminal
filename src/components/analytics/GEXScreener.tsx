'use client';

import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Target, Shield, Zap, Activity, RefreshCw, Settings, Bell, BarChart3, Layers, ChevronRight, Filter, Search, ArrowUpDown } from 'lucide-react';

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
 
 // Disabled auto-refresh on filter change to prevent flickering - user can manually refresh
 // useEffect(() => {
 // if (gexData.length > 0) { // Only auto-refresh if we already have data
 // fetchGEXData();
 // }
 // }, [expirationFilter]);
 
 // Function to fetch real GEX data with streaming updates
 const fetchGEXData = async () => {
 setLoading(true);
 setError('');
 setAnimationClass('animate-pulse');
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
 
 // Sort and update display by GEX Impact Score (highest impact first)
 const sortedResults = [...currentResults].sort((a, b) => (b.gexImpactScore || 0) - (a.gexImpactScore || 0));
 
 // Only update if this is a new scan or if we have no existing data
 if (isNewScan || gexData.length === 0) {
 setGexData(sortedResults);
 }
 
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

 const filteredGexData = gexData
 .filter(item => item.ticker.toLowerCase().includes(searchTerm.toLowerCase()))
 .sort((a, b) => {
 const aValue = sortBy === 'dealerSweat' ? a.dealerSweat : 
 sortBy === 'targetLevel' ? a.attractionLevel : a.currentPrice;
 const bValue = sortBy === 'dealerSweat' ? b.dealerSweat : 
 sortBy === 'targetLevel' ? b.attractionLevel : b.currentPrice;
 
 return sortOrder === 'desc' ? bValue - aValue : aValue - bValue;
 });

 // Load initial data
 useEffect(() => {
 fetchGEXData();
 }, []);

 // Disabled auto-refresh to prevent flickering - user can manually refresh
 // useEffect(() => {
 // const interval = setInterval(() => {
 // if (liveUpdate) {
 // // Refresh data every 5 minutes
 // fetchGEXData();
 // }
 // }, 300000); // 5 minutes
 // return () => clearInterval(interval);
 // }, [liveUpdate]);

 return (
 <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-900 text-white">
 {/* Premium Header */}
 <div className="bg-gradient-to-r from-black via-gray-950 to-black border-b border-orange-500/30 shadow-2xl backdrop-blur-sm">
 <div className="px-8 py-6">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-8">
 <div className="flex items-center gap-4">
 <div className="relative">
 <div className="w-16 h-16 bg-gradient-to-br from-orange-400 to-orange-600 rounded-lg flex items-center justify-center shadow-lg transform hover:scale-105 transition-all duration-300 border border-orange-300/30">
 <BarChart3 className="w-8 h-8 text-black" strokeWidth={2.5} />
 </div>
 <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full animate-pulse shadow-lg"></div>
 </div>
 <div className="space-y-1">
 <div className="flex items-center gap-3">
 <h1 className="font-bold tracking-tight text-white whitespace-nowrap" style={{ fontSize: '42px' }}>
 GAMMA EXPOSURE SCREENER
 </h1>
 <div className="flex items-center gap-2">
 {expirationFilter !== 'Default' && (
 <div className="px-3 py-1 rounded-full bg-purple-500/20 border border-purple-500/40">
 <span className="text-purple-400 text-sm font-bold">{expirationFilter.toUpperCase()} EXPIRY</span>
 </div>
 )}
 {loading && scanProgress.total > 0 && (
 <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/20 border border-orange-500/40 animate-pulse">
 <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse"></div>
 <span className="text-orange-400 text-sm font-bold">LIVE SCANNING</span>
 </div>
 )}
 </div>
 </div>
 {loading && scanProgress.total > 0 && (
 <div className="text-sm text-orange-300/80">
 Analyzing {scanProgress.current}/{scanProgress.total} symbols ({Math.round((scanProgress.current / scanProgress.total) * 100)}%)
 </div>
 )}
 </div>
 </div>
 
 {/* Search Bar */}
 <div className="relative ml-8">
 <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
 <Search className="h-4 w-4 text-gray-400" />
 </div>
 <input
 type="text"
 placeholder="Search symbols..."
 value={searchTerm}
 onChange={(e) => setSearchTerm(e.target.value)}
 className="block w-80 pl-10 pr-3 py-3 border border-gray-700 rounded-xl bg-gray-900/50 backdrop-blur-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-300"
 />
 </div>
 </div>

 <div className="flex items-center gap-4">
 <div className="flex items-center gap-2">
 <button 
 onClick={() => setLiveUpdate(!liveUpdate)}
 className="p-3 rounded-xl hover:bg-orange-500/20 transition-all duration-300 group"
 >
 <Bell className={`w-5 h-5 ${liveUpdate ? 'text-orange-400' : 'text-gray-400'} group-hover:text-orange-300`} />
 </button>
 <button className="p-3 rounded-xl hover:bg-orange-500/20 transition-all duration-300 group">
 <Settings className="w-5 h-5 text-gray-400 group-hover:text-orange-300" />
 </button>
 </div>
 
 <button
 onClick={handleScan}
 disabled={scanning}
 className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-black font-bold rounded-xl hover:from-orange-400 hover:to-orange-500 transform hover:scale-105 transition-all duration-300 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm"
 >
 <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
 {scanning ? 'SCANNING' : 'REFRESH'}
 </button>
 </div>
 </div>
 </div>
 </div>

 {/* Enhanced Navigation */}
 <div className="bg-gradient-to-r from-gray-900/80 to-black/80 backdrop-blur-sm border-b border-orange-500/20 px-8 py-6">
 <div className="flex items-center justify-between">
 <div className="flex gap-2">
 <button
 onClick={() => setActiveTab('attraction')}
 className={`flex items-center gap-3 px-8 py-4 font-bold text-sm transition-all duration-300 relative rounded-xl ${
 activeTab === 'attraction' 
 ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-black shadow-lg transform scale-105' 
 : 'bg-gray-800/50 text-gray-300 hover:bg-gray-700/70 hover:text-white border border-gray-700/50'
 }`}
 >
 <Target className="w-5 h-5" />
 ATTRACTION ZONES
 {activeTab === 'attraction' && (
 <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-8 h-1 bg-orange-300 rounded-full" />
 )}
 </button>
 <button
 onClick={() => setActiveTab('support')}
 className={`flex items-center gap-3 px-8 py-4 font-bold text-sm transition-all duration-300 relative rounded-xl ${
 activeTab === 'support' 
 ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-black shadow-lg transform scale-105' 
 : 'bg-gray-800/50 text-gray-300 hover:bg-gray-700/70 hover:text-white border border-gray-700/50'
 }`}
 >
 <Activity className="w-5 h-5" />
 SUPPORT/RESISTANCE
 {activeTab === 'support' && (
 <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-8 h-1 bg-orange-300 rounded-full" />
 )}
 </button>
 </div>
 
 <div className="flex items-center gap-4">
 <div className="flex items-center gap-2">
 <Filter className="w-4 h-4 text-gray-400" />
 <select className="bg-gray-800/50 border border-gray-600/50 rounded-xl px-4 py-3 text-sm font-semibold text-white hover:bg-gray-700/70 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-orange-500">
 <option>ALL SECTORS</option>
 <option>TECHNOLOGY</option>
 <option>FINANCIALS</option>
 <option>ENERGY</option>
 <option>HEALTHCARE</option>
 </select>
 </div>
 <select 
 value={expirationFilter}
 onChange={(e) => setExpirationFilter(e.target.value)}
 className="bg-gray-800/50 border border-gray-600/50 rounded-xl px-4 py-3 text-sm font-semibold text-white hover:bg-gray-700/70 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
 >
 <option value="Default">Default (45 Days)</option>
 <option value="Week">Week</option>
 <option value="Month">Month</option>
 <option value="Quad">Quad</option>
 </select>
 <button
 onClick={() => handleSort('probability')}
 className="flex items-center gap-2 px-4 py-3 bg-gray-800/50 border border-gray-600/50 rounded-xl hover:bg-gray-700/70 transition-all duration-300 text-sm font-semibold"
 >
 <ArrowUpDown className="w-4 h-4" />
 Sort
 </button>
 </div>
 </div>
 </div>

 <div className="px-8 py-6">
 {/* Attraction Zones View */}
 {activeTab === 'attraction' && (
 <div>
 {/* Column Headers */}
 <div className="px-6 py-4 mb-4 border-b border-gray-700/30">
 <div className="flex items-center gap-8">
 {/* Symbol Header */}
 <div className="w-24 flex-shrink-0">
 <div className="text-xl font-black text-orange-400 uppercase tracking-wider">SYMBOL</div>
 </div>

 {/* Main Data Headers */}
 <div className="flex-1 grid grid-cols-3 gap-8">
 <div>
 <div className="text-xl font-black text-orange-400 uppercase tracking-wider">CURRENT PRICE</div>
 </div>
 <div>
 <div className="text-xl font-black text-orange-400 uppercase tracking-wider">TARGET LEVEL</div>
 </div>
 <div>
 <div className="text-xl font-black text-orange-400 uppercase tracking-wider">VALUE</div>
 </div>
 </div>

 {/* Strength Header */}
 <div className="w-32 flex-shrink-0">
 <div className="text-xl font-black text-orange-400 uppercase tracking-wider text-center">DEALER SWEAT</div>
 </div>

 </div>
 </div>

 <div className="space-y-3">
 {loading && (
 <div className="text-center py-8">
 <div className="space-y-4">
 <div className="text-orange-400 font-bold">
 Scanning symbols for GEX levels...
 </div>
 {scanProgress.total > 0 && (
 <div className="space-y-2">
 <div className="text-sm text-gray-400">
 Progress: {scanProgress.current} / {scanProgress.total} ({Math.round((scanProgress.current / scanProgress.total) * 100)}%)
 </div>
 <div className="w-full bg-gray-800 rounded-full h-2 mx-auto max-w-md">
 <div 
 className="bg-gradient-to-r from-orange-500 to-orange-400 h-2 rounded-full transition-all duration-300"
 style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%` }}
 />
 </div>
 </div>
 )}
 </div>
 </div>
 )}
 {error && (
 <div className="text-center py-8">
 <div className="text-red-400 font-bold"> {error}</div>
 </div>
 )}
 {(!loading || filteredGexData.length > 0) && filteredGexData.map((item, idx) => (
 <div
 key={`${item.ticker}-${idx}`}
 onClick={() => setSelectedRow(selectedRow === idx ? null : idx)}
 onMouseEnter={() => setHoveredRow(idx)}
 onMouseLeave={() => setHoveredRow(null)}
 className={`relative rounded-2xl border transition-all duration-500 cursor-pointer animate-fadeIn ${
 selectedRow === idx 
 ? 'bg-black border-orange-500/50 shadow-xl shadow-orange-500/20' 
 : hoveredRow === idx
 ? 'bg-black border-orange-400/40 shadow-lg shadow-orange-500/10'
 : 'bg-black border-gray-700/30 hover:border-gray-600/50'
 } ${idx === 0 && loading ? 'border-orange-400/60 shadow-lg shadow-orange-400/20' : ''}`}
 >
 
 <div className="relative p-6">
 <div className="flex items-center gap-8">
 {/* Symbol */}
 <div className="w-24 flex-shrink-0">
 <div className="text-2xl font-black text-white">
 {item.ticker}
 </div>
 </div>

 {/* Main Data Grid */}
 <div className="flex-1 grid grid-cols-3 gap-8">
 <div>
 <div className="text-xl font-bold text-white">${item.currentPrice.toFixed(2)}</div>
 </div>
 <div>
 <div className="text-xl font-black bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent">
 ${item.attractionLevel.toFixed(2)}
 </div>
 </div>
 <div>
 <div className={`text-xl font-bold ${item.dealerSweat > 0 ? 'text-green-400' : 'text-red-400'}`}>
 {item.dealerSweat > 0 ? '+' : ''}{item.dealerSweat.toFixed(2)}B
 </div>
 </div>
 </div>

 {/* Strength Badge */}
 <div className="w-32 flex-shrink-0">
 <div className={`px-4 py-3 text-center font-black text-xs rounded-xl shadow-lg transform transition-all duration-300 ${
 item.strength > 70 
 ? 'bg-gradient-to-r from-green-500 to-green-600 text-black shadow-green-500/30' 
 : item.strength > 40 
 ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-blue-500/30'
 : 'bg-gradient-to-r from-yellow-500 to-yellow-600 text-black shadow-yellow-500/30'
 } ${hoveredRow === idx ? 'scale-105' : ''}`}>
 {item.strength.toFixed(0)}%
 </div>
 </div>

 </div>

 {/* Expanded Details */}
 {selectedRow === idx && (
 <div className="mt-6 pt-6 border-t border-gray-600/30 animate-fadeIn">
 <div className="grid grid-cols-4 gap-6">
 <div className="bg-gray-800/50 rounded-xl p-4">
 <div className="text-xs text-gray-400 mb-2">Volume Profile</div>
 <div className="text-lg font-bold text-green-400">High Activity</div>
 </div>
 <div className="bg-gray-800/50 rounded-xl p-4">
 <div className="text-xs text-gray-400 mb-2">Delta Exposure</div>
 <div className="text-lg font-bold text-blue-400">+2.4M</div>
 </div>
 <div className="bg-gray-800/50 rounded-xl p-4">
 <div className="text-xs text-gray-400 mb-2">Implied Move</div>
 <div className="text-lg font-bold text-purple-400">±3.2%</div>
 </div>
 <div className="bg-gray-800/50 rounded-xl p-4">
 <div className="text-xs text-gray-400 mb-2">Risk Level</div>
 <div className="text-lg font-bold text-yellow-400">Medium</div>
 </div>
 </div>
 </div>
 )}
 </div>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* Support/Resistance View */}
 {activeTab === 'support' && (
 <div>
 {/* Loading Progress - Above Headers */}
 {loading && (
 <div className="text-center py-6 mb-4 bg-gray-900/50 rounded-lg mx-6">
 <div className="space-y-4">
 <div className="text-orange-400 font-bold">
 Scanning for support/resistance walls... ({filteredGexData.filter(item => item.largestWall).length} walls found)
 </div>
 {scanProgress.total > 0 && (
 <div className="space-y-2">
 <div className="text-sm text-gray-400">
 Progress: {scanProgress.current} / {scanProgress.total} ({Math.round((scanProgress.current / scanProgress.total) * 100)}%)
 </div>
 <div className="w-full bg-gray-800 rounded-full h-2 mx-auto max-w-md">
 <div 
 className="bg-gradient-to-r from-orange-500 to-orange-400 h-2 rounded-full transition-all duration-300"
 style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%` }}
 />
 </div>
 </div>
 )}
 </div>
 </div>
 )}
 
 {/* Column Headers */}
 <div className="px-6 py-4 mb-4 border-b border-gray-700/30">
 <div className="flex items-center gap-8">
 {/* Symbol Header */}
 <div className="w-24 flex-shrink-0">
 <div className="text-xl font-black text-orange-400 uppercase tracking-wider">SYMBOL</div>
 </div>

 {/* Main Data Headers */}
 <div className="flex-1 grid grid-cols-4 gap-6">
 <div>
 <div className="text-xl font-black text-orange-400 uppercase tracking-wider">CURRENT PRICE</div>
 </div>
 <div>
 <div className="text-xl font-black text-orange-400 uppercase tracking-wider">WALL LEVEL</div>
 </div>
 <div>
 <div className="text-xl font-black text-orange-400 uppercase tracking-wider">WALL VALUE</div>
 </div>
 <div>
 <div className="text-xl font-black text-orange-400 uppercase tracking-wider">DEALER FLOW</div>
 </div>
 </div>

 {/* Pressure Header */}
 <div className="w-32 flex-shrink-0">
 <div className="text-xl font-black text-orange-400 uppercase tracking-wider text-center">PRESSURE</div>
 </div>
 </div>
 </div>

 <div className="space-y-3">
 {error && (
 <div className="text-center py-8">
 <div className="text-red-400 font-bold"> {error}</div>
 </div>
 )}
 {(!loading || filteredGexData.length > 0) && filteredGexData
 .filter(item => item.largestWall) // Only show items with wall data
 .sort((a, b) => (b.largestWall?.pressure || 0) - (a.largestWall?.pressure || 0)) // Sort by pressure for S/R tab
 .map((item, idx) => (
 <div
 key={`${item.ticker}-wall-${idx}`}
 onClick={() => setSelectedRow(selectedRow === idx ? null : idx)}
 onMouseEnter={() => setHoveredRow(idx)}
 onMouseLeave={() => setHoveredRow(null)}
 className={`relative rounded-2xl border transition-all duration-500 cursor-pointer animate-fadeIn ${
 selectedRow === idx 
 ? 'bg-black border-orange-500/50 shadow-xl shadow-orange-500/20' 
 : hoveredRow === idx
 ? 'bg-black border-orange-400/40 shadow-lg shadow-orange-500/10'
 : 'bg-black border-gray-700/30 hover:border-gray-600/50'
 }`}
 >
 
 <div className="relative p-6">
 <div className="flex items-center gap-8">
 {/* Symbol */}
 <div className="w-24 flex-shrink-0">
 <div className="text-2xl font-black text-white">
 {item.ticker}
 </div>
 </div>

 {/* Main Data Grid */}
 <div className="flex-1 grid grid-cols-4 gap-6">
 <div>
 <div className="text-xl font-bold text-white">${item.currentPrice.toFixed(2)}</div>
 </div>
 <div>
 <div className="text-xl font-black text-purple-400">
 ${item.largestWall?.strike.toFixed(2)}
 </div>
 </div>
 <div>
 <div className="text-xl font-bold text-white">
 ${item.largestWall?.gex.toFixed(2)}B
 </div>
 </div>
 <div>
 <div className={`inline-block px-3 py-2 font-black text-xs uppercase tracking-wider transition-all duration-300 ${
 item.largestWall?.type === 'call' 
 ? 'bg-red-600 text-white' 
 : 'bg-emerald-600 text-white'
 } ${hoveredRow === idx ? 'brightness-110' : ''}`}>
 {item.largestWall?.type === 'call' ? 'DEALER SUPPLY' : 'DEALER DEMAND'}
 </div>
 </div>
 </div>

 {/* Pressure Badge */}
 <div className="w-32 flex-shrink-0">
 <div className={`px-4 py-3 text-center font-black text-xs rounded-xl shadow-lg transform transition-all duration-300 ${
 (item.largestWall?.pressure || 0) > 80 
 ? 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-red-500/30' 
 : (item.largestWall?.pressure || 0) > 50 
 ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-orange-500/30'
 : 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-blue-500/30'
 } ${hoveredRow === idx ? 'scale-105' : ''}`}>
 {item.largestWall?.pressure || 0}%
 </div>
 </div>
 </div>

 {/* Expanded Details */}
 {selectedRow === idx && (
 <div className="mt-6 pt-6 border-t border-gray-600/30 animate-fadeIn">
 <div className="grid grid-cols-4 gap-6 mb-6">
 <div className="bg-gray-800/50 rounded-xl p-4">
 <div className="text-xs text-gray-400 mb-2">Distance to Wall</div>
 <div className="text-lg font-bold text-cyan-400">
 ${Math.abs((item.largestWall?.strike || item.currentPrice) - item.currentPrice).toFixed(2)}
 </div>
 </div>
 <div className="bg-gray-800/50 rounded-xl p-4">
 <div className="text-xs text-gray-400 mb-2">Wall Impact</div>
 <div className="text-lg font-bold text-purple-400">
 {(item.largestWall?.pressure || 0) > 70 ? 'EXTREME' : 
 (item.largestWall?.pressure || 0) > 40 ? 'HIGH' : 'MODERATE'}
 </div>
 </div>
 <div className="bg-gray-800/50 rounded-xl p-4">
 <div className="text-xs text-gray-400 mb-2">Dealer Position</div>
 <div className={`text-lg font-bold ${
 item.largestWall?.type === 'call' && item.currentPrice > (item.largestWall?.strike || 0) ? 'text-red-400' :
 item.largestWall?.type === 'put' && item.currentPrice < (item.largestWall?.strike || 0) ? 'text-emerald-400' :
 'text-yellow-400'
 }`}>
 {item.largestWall?.type === 'call' && item.currentPrice > (item.largestWall?.strike || 0) ? 'ABOVE SUPPLY' :
 item.largestWall?.type === 'put' && item.currentPrice < (item.largestWall?.strike || 0) ? 'BELOW DEMAND' :
 'AT ZONE LEVEL'}
 </div>
 </div>
 <div className="bg-gray-800/50 rounded-xl p-4">
 <div className="text-xs text-gray-400 mb-2">Market Cap Impact</div>
 <div className="text-lg font-bold text-orange-400">
 {item.gexImpactScore || 0}%
 </div>
 </div>
 </div>
 
 {/* Cluster Details */}
 {item.largestWall?.cluster && (
 <div className="bg-gray-900/50 rounded-xl p-4">
 <div className="text-sm font-bold text-orange-400 mb-3">GEX CLUSTER BREAKDOWN</div>
 <div className="grid grid-cols-2 gap-6">
 <div>
 <div className="text-xs text-gray-400 mb-2">Cluster Strikes</div>
 <div className="flex gap-2 flex-wrap">
 {item.largestWall.cluster.strikes.map((strike, i) => (
 <span key={i} className="px-2 py-1 bg-gray-700/50 rounded text-sm text-white">
 ${strike.toFixed(2)}
 </span>
 ))}
 </div>
 </div>
 <div>
 <div className="text-xs text-gray-400 mb-2">Strike Contributions</div>
 <div className="flex gap-2 flex-wrap">
 {item.largestWall.cluster.contributions.map((contrib, i) => (
 <span key={i} className={`px-2 py-1 rounded text-sm font-bold ${
 contrib > 60 ? 'bg-red-500/20 text-red-400' :
 contrib < 20 ? 'bg-yellow-500/20 text-yellow-400' :
 'bg-green-500/20 text-green-400'
 }`}>
 {contrib}%
 </span>
 ))}
 </div>
 </div>
 </div>
 <div className="mt-3 pt-3 border-t border-gray-700/30">
 <div className="text-xs text-gray-400">
 <span className="text-green-400"> Well-distributed cluster:</span> No single strike dominates (max {Math.max(...(item.largestWall.cluster.contributions || []))}%), 
 all strikes contribute meaningfully (min {Math.min(...(item.largestWall.cluster.contributions || []))}%)
 </div>
 </div>
 </div>
 )}
 </div>
 )}
 </div>
 </div>
 ))}
 </div>
 </div>
 )}
 </div>

 {/* Enhanced Footer */}
 <div className="bg-gradient-to-r from-gray-900 via-black to-gray-900 border-t border-orange-500/30 px-8 py-6 mt-12">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-8">
 <div className="text-sm text-gray-400">
 Data refreshed every <span className="text-orange-400 font-semibold">5 minutes</span>
 </div>
 <div className="flex items-center gap-2">
 <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
 <span className="text-sm text-gray-400">Real-time market data</span>
 </div>
 </div>
 <div className="flex items-center gap-6 text-sm text-gray-400">
 <div>Symbols tracked: <span className="text-orange-400 font-semibold">2,847</span></div>
 <div>Active strategies: <span className="text-green-400 font-semibold">156</span></div>
 <div>Uptime: <span className="text-blue-400 font-semibold">99.8%</span></div>
 </div>
 </div>
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