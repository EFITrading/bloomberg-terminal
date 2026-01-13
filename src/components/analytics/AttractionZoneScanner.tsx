'use client';

import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Target, Shield, Zap, Activity, RefreshCw, Search, ArrowUpDown } from 'lucide-react';

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
    largestWall?: {
        strike: number;
        gex: number;
        type: 'call' | 'put';
        pressure: number;
        cluster?: {
            strikes: number[];
            centralStrike: number;
            totalGEX: number;
            contributions: number[];
            type: 'call' | 'put';
        };
    };
}

interface AttractionZoneScannerProps {
    compactMode?: boolean;
}

export default function AttractionZoneScanner({ compactMode = false }: AttractionZoneScannerProps) {
    const [scanning, setScanning] = useState(false);
    const [selectedRow, setSelectedRow] = useState<number | null>(null);
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

    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth <= 768);
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const itemsPerPage = isMobile ? 10 : 20;

    const fetchGEXData = async () => {
        setLoading(true);
        setError('');
        setAnimationClass('animate-pulse');

        try {
            console.log(`🎯 Starting real-time GEX screener scan with ${expirationFilter} expiration filter...`);

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

            while (true) {
                const { done, value } = await reader.read();

                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split('\n\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const messageData = JSON.parse(line.substring(6));

                            switch (messageData.type) {
                                case 'start':
                                    console.log(`📊 Starting scan of ${messageData.total} symbols...`);
                                    setScanProgress({ current: 0, total: messageData.total });
                                    currentResults.length = 0;
                                    break;

                                case 'result':
                                    setScanProgress({ current: messageData.progress, total: messageData.total });

                                    const transformedItem: GEXScreenerData = {
                                        ticker: messageData.data.ticker,
                                        attractionLevel: messageData.data.attractionLevel,
                                        currentPrice: messageData.data.currentPrice,
                                        dealerSweat: messageData.data.dealerSweat,
                                        netGex: messageData.data.netGex,
                                        bias: messageData.data.dealerSweat > 0 ? 'Bullish' as const : 'Bearish' as const,
                                        strength: messageData.data.gexImpactScore || 0,
                                        volatility: Math.abs(messageData.data.netGex) > 2 ? 'High' as const :
                                            Math.abs(messageData.data.netGex) > 0.5 ? 'Medium' as const : 'Low' as const,
                                        range: Math.abs(((messageData.data.attractionLevel - messageData.data.currentPrice) / messageData.data.currentPrice) * 100),
                                        marketCap: messageData.data.marketCap,
                                        gexImpactScore: messageData.data.gexImpactScore,
                                        largestWall: messageData.data.largestWall
                                    };

                                    currentResults.push(transformedItem);

                                    const sortedResults = [...currentResults].sort((a, b) => (b.gexImpactScore || 0) - (a.gexImpactScore || 0));
                                    setGexData(sortedResults);
                                    break;

                                case 'complete':
                                    console.log(`✅ GEX screener completed with ${messageData.count} results`);
                                    setScanProgress({ current: messageData.count, total: messageData.count });
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
            console.error('❌ GEX screener error:', err);
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
        .filter(item => {
            if (item.strength < 40) return false;

            if (strengthFilter === 'purple') return item.strength > 75;
            if (strengthFilter === 'blue') return item.strength >= 63 && item.strength <= 75;
            if (strengthFilter === 'yellow') return item.strength >= 40 && item.strength < 63;
            return true;
        })
        .sort((a, b) => {
            const aValue = sortBy === 'dealerSweat' ? a.dealerSweat :
                sortBy === 'targetLevel' ? a.attractionLevel : a.currentPrice;
            const bValue = sortBy === 'dealerSweat' ? b.dealerSweat :
                sortBy === 'targetLevel' ? b.attractionLevel : b.currentPrice;

            return sortOrder === 'desc' ? bValue - aValue : aValue - bValue;
        });

    const totalPages = Math.ceil(filteredGexData.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedData = filteredGexData.slice(startIndex, endIndex);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, sortBy, sortOrder, strengthFilter]);

    return (
        <div className="bg-gradient-to-br from-gray-950 via-black to-gray-900 text-white rounded-xl border border-orange-500/20 shadow-2xl">
            {/* Header */}
            <div className="bg-gradient-to-r from-black via-gray-950 to-black border-b border-orange-500/30 rounded-t-xl">
                <div className="px-3 md:px-8 py-3 md:py-6">
                    <div className="flex flex-col gap-3 md:gap-0 md:flex-row md:items-center md:justify-between">
                        {/* Title Section */}
                        {!compactMode && (
                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-8">
                                <div className="flex items-center gap-2 md:gap-4">
                                    <Target className="w-6 h-6 md:w-8 md:h-8 text-orange-500" />
                                    <div className="space-y-1">
                                        <h2 className="text-xl md:text-2xl font-black text-white tracking-wider">ATTRACTION ZONES</h2>
                                        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
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

                                {/* Search Bar */}
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
                        )}

                        {/* Action Buttons */}
                        {!compactMode && (
                            <div className="flex items-center gap-2 md:gap-4">
                                <button
                                    onClick={handleScan}
                                    disabled={loading}
                                    className={`px-4 md:px-6 py-2 md:py-3 font-bold text-xs md:text-sm transition-all duration-300 rounded-xl flex items-center gap-2 ${loading
                                            ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                            : 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
                                        }`}
                                >
                                    <RefreshCw className={`w-4 h-4 md:w-5 md:h-5 ${loading ? 'animate-spin' : ''}`} />
                                    {loading ? 'SCANNING...' : 'SCAN NOW'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-gradient-to-r from-gray-900/80 to-black/80 backdrop-blur-sm border-b border-orange-500/20 px-3 md:px-8 py-3 md:py-6">
                <div className="flex items-center gap-3 justify-end">
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

                    {compactMode && (
                        <button
                            onClick={handleScan}
                            disabled={loading}
                            className={`px-4 md:px-6 py-2 md:py-3 font-bold text-xs md:text-sm transition-all duration-300 rounded-xl flex items-center gap-2 ${loading
                                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
                                }`}
                        >
                            <RefreshCw className={`w-4 h-4 md:w-5 md:h-5 ${loading ? 'animate-spin' : ''}`} />
                            {loading ? 'SCANNING...' : 'SCAN NOW'}
                        </button>
                    )}
                </div>
            </div>

            <div className="px-3 md:px-8 py-3 md:py-6">
                {/* Scan Progress Bar */}
                {loading && scanProgress.total > 0 && (
                    <div className="mb-4 bg-gray-900/50 border border-blue-500/30 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold text-blue-400">
                                Scan Progress: {scanProgress.current} / {scanProgress.total} stocks
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
                <div className="hidden lg:block px-6 py-3 mb-4 bg-gradient-to-b from-black via-gray-900 to-black border border-gray-800 rounded-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                    <div className="flex items-center gap-8">
                        <div className="w-24 flex-shrink-0">
                            <span className="text-gray-400 font-black text-xs uppercase tracking-wider">Symbol</span>
                        </div>
                        <div className="flex-1 grid grid-cols-5 gap-4">
                            <div className="text-center">
                                <button onClick={() => handleSort('currentPrice')} className="text-gray-400 hover:text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1">
                                    Current <ArrowUpDown className="w-3 h-3" />
                                </button>
                            </div>
                            <div className="text-center">
                                <button onClick={() => handleSort('targetLevel')} className="text-gray-400 hover:text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1">
                                    Target <ArrowUpDown className="w-3 h-3" />
                                </button>
                            </div>
                            <div className="text-center">
                                <span className="text-gray-400 font-black text-xs uppercase tracking-wider">Distance</span>
                            </div>
                            <div className="text-center">
                                <button onClick={() => handleSort('dealerSweat')} className="text-gray-400 hover:text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1">
                                    Sweat <ArrowUpDown className="w-3 h-3" />
                                </button>
                            </div>
                            <div className="text-center">
                                <span className="text-gray-400 font-black text-xs uppercase tracking-wider">Strength</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Results */}
                <div className="space-y-2">
                    {paginatedData.length === 0 && !loading && (
                        <div className="text-center py-16 text-gray-400">
                            {searchTerm ? 'No results found for your search' : 'Click "SCAN NOW" to find attraction zones'}
                        </div>
                    )}

                    {paginatedData.map((item, index) => (
                        <div
                            key={`${item.ticker}-${index}`}
                            onClick={() => setSelectedRow(selectedRow === index ? null : index)}
                            onMouseEnter={() => setHoveredRow(index)}
                            onMouseLeave={() => setHoveredRow(null)}
                            className={`px-4 md:px-6 py-4 md:py-6 border rounded-xl transition-all duration-300 cursor-pointer ${selectedRow === index
                                    ? 'bg-gradient-to-r from-orange-500/20 to-orange-600/20 border-orange-500/60 shadow-lg'
                                    : hoveredRow === index
                                        ? 'bg-gray-900/80 border-gray-700/80 shadow-md'
                                        : 'bg-black/40 border-gray-800/60'
                                }`}
                        >
                            <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-8">
                                {/* Symbol */}
                                <div className="w-full lg:w-24 flex-shrink-0">
                                    <div className="flex items-center gap-3">
                                        <span className="text-xl md:text-2xl font-black text-white tracking-wide">{item.ticker}</span>
                                        {item.bias === 'Bullish' ? (
                                            <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-green-400" />
                                        ) : (
                                            <TrendingDown className="w-4 h-4 md:w-5 md:h-5 text-red-400" />
                                        )}
                                    </div>
                                </div>

                                {/* Data Grid */}
                                <div className="flex-1 grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
                                    {/* Current Price */}
                                    <div className="text-center lg:text-center">
                                        <div className="text-xs text-gray-400 font-semibold mb-1 lg:hidden">Current</div>
                                        <div className="text-lg md:text-xl font-bold text-white">${item.currentPrice.toFixed(2)}</div>
                                    </div>

                                    {/* Target Level */}
                                    <div className="text-center lg:text-center">
                                        <div className="text-xs text-gray-400 font-semibold mb-1 lg:hidden">Target</div>
                                        <div className={`text-lg md:text-xl font-bold ${item.attractionLevel > item.currentPrice ? 'text-green-400' : 'text-red-400'
                                            }`}>
                                            ${item.attractionLevel.toFixed(2)}
                                        </div>
                                    </div>

                                    {/* Distance */}
                                    <div className="text-center lg:text-center">
                                        <div className="text-xs text-gray-400 font-semibold mb-1 lg:hidden">Distance</div>
                                        <div className="text-base md:text-lg font-bold text-orange-400">
                                            {item.range.toFixed(1)}%
                                        </div>
                                    </div>

                                    {/* Dealer Sweat */}
                                    <div className="text-center lg:text-center">
                                        <div className="text-xs text-gray-400 font-semibold mb-1 lg:hidden">Sweat</div>
                                        <div className={`text-base md:text-lg font-bold ${Math.abs(item.dealerSweat) > 100 ? 'text-red-500' :
                                                Math.abs(item.dealerSweat) > 50 ? 'text-orange-400' :
                                                    'text-yellow-400'
                                            }`}>
                                            {item.dealerSweat.toFixed(0)}
                                        </div>
                                    </div>

                                    {/* Strength */}
                                    <div className="text-center lg:text-center">
                                        <div className="text-xs text-gray-400 font-semibold mb-1 lg:hidden">Strength</div>
                                        <div className="flex items-center justify-center gap-2">
                                            <div className={`w-3 h-3 rounded-full ${item.strength > 75 ? 'bg-purple-500' :
                                                    item.strength >= 63 ? 'bg-blue-500' :
                                                        'bg-yellow-500'
                                                }`}></div>
                                            <span className="text-base md:text-lg font-bold text-white">{item.strength.toFixed(0)}%</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Expanded Details */}
                            {selectedRow === index && item.largestWall && (
                                <div className="mt-4 pt-4 border-t border-gray-700/50">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="bg-gray-900/50 rounded-lg p-3">
                                            <div className="text-xs text-gray-400 font-semibold mb-1">Wall Type</div>
                                            <div className={`text-lg font-bold ${item.largestWall.type === 'call' ? 'text-green-400' : 'text-red-400'}`}>
                                                {item.largestWall.type.toUpperCase()}
                                            </div>
                                        </div>
                                        <div className="bg-gray-900/50 rounded-lg p-3">
                                            <div className="text-xs text-gray-400 font-semibold mb-1">Strike</div>
                                            <div className="text-lg font-bold text-white">${item.largestWall.strike.toFixed(2)}</div>
                                        </div>
                                        <div className="bg-gray-900/50 rounded-lg p-3">
                                            <div className="text-xs text-gray-400 font-semibold mb-1">Pressure</div>
                                            <div className="text-lg font-bold text-orange-400">{item.largestWall.pressure.toFixed(1)}%</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="mt-6 flex items-center justify-between">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="px-3 md:px-6 py-2 md:py-3 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 text-xs md:text-sm font-bold text-white"
                        >
                            <span className="hidden sm:inline">← Previous</span>
                            <span className="sm:hidden">←</span>
                        </button>
                        <div className="text-sm text-gray-400 font-semibold">
                            Page {currentPage} of {totalPages}
                        </div>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="px-3 md:px-6 py-2 md:py-3 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 text-xs md:text-sm font-bold text-white"
                        >
                            <span className="hidden sm:inline">Next →</span>
                            <span className="sm:hidden">→</span>
                        </button>
                    </div>
                )}
            </div>

            <style jsx>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
        </div>
    );
}
