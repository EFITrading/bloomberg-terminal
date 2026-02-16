'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Activity, AlertCircle, TrendingUp, TrendingDown, X } from 'lucide-react';
import { TOP_1000_SYMBOLS } from '@/lib/Top1000Symbols';
import { consolidationTradeCalculator } from '@/lib/consolidationTradeCalculator';

interface ContractionResult {
    symbol: string;
    currentPrice: number;
    change: number;
    changePercent: number;
    period: '5-DAY' | '13-DAY';
    averageVolume: number;
    currentVolume: number;
    volumeRatio: number;
    atr: number;
    contractionScore: number;
    contractionLevel: 'EXTREME' | 'HIGH' | 'MODERATE';
    daysSinceHigh: number;
    daysSinceLow: number;
    pricePosition: number; // 0-100, where price is in recent range
    squeezeStatus: 'ON' | 'OFF';
    squeezeBarsCount: number;
    contractionPercent: number; // Price range contraction %
    // Diagnostic fields for non-qualifying tickers
    qualifies?: boolean;
    failReason?: string;
    actualCompression?: number;
    requiredCompression?: number;
    isSideways?: boolean;
    netMovePercent?: number;
    isAtExtremes?: boolean;
    hasExpanded?: boolean;
}

interface TradeSetup {
    symbol: string;
    currentPrice: number;
    period: '5-DAY' | '13-DAY';
    contractionPercent: number;
    callStrike: number;
    callPremium: number;
    callBid: number;
    callAsk: number;
    callTarget1: number;
    callTarget1Premium: number;
    callTarget2: number;
    callTarget2Premium: number;
    callImpliedVolatility: number;
    putStrike: number;
    putPremium: number;
    putBid: number;
    putAsk: number;
    putTarget1: number;
    putTarget1Premium: number;
    putTarget2: number;
    putTarget2Premium: number;
    putImpliedVolatility: number;
    expiration: string;
    daysToExpiration: number;
    totalCost: number;
    breakevens: { upper: number; lower: number };
}

interface PivotScannerProps {
    compactMode?: boolean;
}

export default function PivotScanner({ compactMode = false }: PivotScannerProps) {
    const [results, setResults] = useState<ContractionResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [symbols] = useState(TOP_1000_SYMBOLS.join(','));
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
    const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });
    const [scanningSymbol, setScanningSymbol] = useState('');
    const [sortBy, setSortBy] = useState<'highest' | 'lowest' | 'change-high' | 'change-low'>('highest');
    const [filterType, setFilterType] = useState<'all' | 'straddles' | 'squeeze-on' | 'squeeze-off'>('all');
    const [customTicker, setCustomTicker] = useState('');
    const [showSortDropdown, setShowSortDropdown] = useState(false);
    const [selectedTrade, setSelectedTrade] = useState<ContractionResult | null>(null);
    const [tradeSetup, setTradeSetup] = useState<TradeSetup | null>(null);
    const [loadingTrade, setLoadingTrade] = useState(false);
    const [chartTimeframe, setChartTimeframe] = useState<'1D' | '5D' | '1M'>('1D');
    const [chartData, setChartData] = useState<{
        price: number;
        change: number;
        sparklineData: Array<{ time: number; price: number; etMinutes?: number }>;
        previousDayClose?: number;
    } | null>(null);
    const eventSourceRef = useRef<EventSource | null>(null);

    const scanContractions = async () => {
        setLoading(true);
        setResults([]);
        setScanProgress({ current: 0, total: symbols.split(',').length });

        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }

        try {
            const eventSource = new EventSource(`/api/scan-contractions-stream?symbols=${encodeURIComponent(symbols)}`);
            eventSourceRef.current = eventSource;

            eventSource.onmessage = (event) => {
                const data = JSON.parse(event.data);

                if (data.type === 'progress') {
                    setScanProgress(data.progress);
                    setScanningSymbol(data.symbol);
                } else if (data.type === 'result') {
                    setResults(prev => {
                        // Deduplicate: remove existing entry with same symbol+period
                        const filtered = prev.filter(r => !(r.symbol === data.result.symbol && r.period === data.result.period));
                        const newResults = [...filtered, data.result];
                        return newResults.sort((a, b) => b.contractionScore - a.contractionScore);
                    });
                } else if (data.type === 'complete') {
                    setLoading(false);
                    setLastUpdate(new Date());
                    setScanningSymbol('');
                    eventSource.close();
                } else if (data.type === 'error') {
                    console.error('Contraction scan error:', data.error);
                }
            };

            eventSource.onerror = () => {
                setLoading(false);
                setScanningSymbol('');
                eventSource.close();
            };

        } catch (error) {
            console.error('Contraction scan error:', error);
            setLoading(false);
        }
    };

    const scanCustomTicker = async () => {
        if (!customTicker.trim()) return;

        setLoading(true);
        setResults([]);
        setScanProgress({ current: 0, total: 1 });

        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }

        try {
            const eventSource = new EventSource(`/api/scan-contractions-stream?symbols=${encodeURIComponent(customTicker.toUpperCase().trim())}`);
            eventSourceRef.current = eventSource;

            eventSource.onmessage = (event) => {
                const data = JSON.parse(event.data);

                if (data.type === 'progress') {
                    setScanProgress(data.progress);
                    setScanningSymbol(data.symbol);
                } else if (data.type === 'result') {
                    setResults(prev => {
                        const filtered = prev.filter(r => !(r.symbol === data.result.symbol && r.period === data.result.period));
                        const newResults = [...filtered, data.result];
                        return newResults.sort((a, b) => b.contractionScore - a.contractionScore);
                    });
                } else if (data.type === 'complete') {
                    setLoading(false);
                    setLastUpdate(new Date());
                    setScanningSymbol('');
                    setCustomTicker('');
                    eventSource.close();
                } else if (data.type === 'error') {
                    console.error('Contraction scan error:', data.error);
                }
            };

            eventSource.onerror = () => {
                setLoading(false);
                setScanningSymbol('');
                eventSource.close();
            };

        } catch (error) {
            console.error('Contraction scan error:', error);
            setLoading(false);
        }
    };

    useEffect(() => {
        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
            }
        };
    }, []);

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (!target.closest('.relative')) {
                setShowSortDropdown(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const loadTradeSetup = async (result: ContractionResult) => {
        setSelectedTrade(result);
        setLoadingTrade(true);
        setTradeSetup(null);
        setChartData(null);

        try {
            // Fetch trade setup and chart data in parallel
            const [setup] = await Promise.all([
                consolidationTradeCalculator.calculateTradeSetup(
                    result.symbol,
                    result.currentPrice,
                    result.period,
                    result.contractionPercent
                ),
                fetchChartData(result.symbol, chartTimeframe)
            ]);
            setTradeSetup(setup);
        } catch (error) {
            console.error('Error loading trade setup:', error);
        } finally {
            setLoadingTrade(false);
        }
    };

    // Refetch chart when timeframe changes
    useEffect(() => {
        if (selectedTrade) {
            fetchChartData(selectedTrade.symbol, chartTimeframe);
        }
    }, [chartTimeframe]);

    const fetchChartData = async (symbol: string, timeframe: '1D' | '5D' | '1M') => {
        try {
            const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
            const now = new Date();
            let pstDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));

            // Find last trading day (skip weekends)
            const dayOfWeek = pstDate.getDay();
            if (dayOfWeek === 0) { // Sunday
                pstDate.setDate(pstDate.getDate() - 2); // Go to Friday
            } else if (dayOfWeek === 6) { // Saturday
                pstDate.setDate(pstDate.getDate() - 1); // Go to Friday
            }
            // If after 1pm PST (4pm ET market close), also go to previous day
            const pstHour = pstDate.getHours();
            if (pstHour >= 13) {
                pstDate.setDate(pstDate.getDate() - 1);
                // Check if we landed on weekend
                const newDayOfWeek = pstDate.getDay();
                if (newDayOfWeek === 0) pstDate.setDate(pstDate.getDate() - 2);
                if (newDayOfWeek === 6) pstDate.setDate(pstDate.getDate() - 1);
            }

            const todayStr = `${pstDate.getFullYear()}-${String(pstDate.getMonth() + 1).padStart(2, '0')}-${String(pstDate.getDate()).padStart(2, '0')}`;

            // Use exact logic from tracking tab
            if (timeframe === '1D') {
                // Intraday 5-minute data
                const dataUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/5/minute/${todayStr}/${todayStr}?adjusted=true&sort=asc&limit=50000&apiKey=${POLYGON_API_KEY}`;
                const response = await fetch(dataUrl);
                const data = await response.json();

                if (!data.results || data.results.length === 0) {
                    console.log('No intraday data for', symbol);
                    return;
                }

                // Get previous day close
                const prevDayDate = new Date(pstDate);
                prevDayDate.setDate(prevDayDate.getDate() - 1);
                const prevDayStr = `${prevDayDate.getFullYear()}-${String(prevDayDate.getMonth() + 1).padStart(2, '0')}-${String(prevDayDate.getDate()).padStart(2, '0')}`;
                const prevDayUrl = `https://api.polygon.io/v1/open-close/${symbol}/${prevDayStr}?adjusted=true&apiKey=${POLYGON_API_KEY}`;
                const prevDayResponse = await fetch(prevDayUrl);
                const prevDayData = await prevDayResponse.json();
                const previousDayClose = prevDayData?.close || data.results[0].c;

                const currentPrice = data.results[data.results.length - 1].c;
                const changePercent = ((currentPrice - previousDayClose) / previousDayClose) * 100;

                const sparklineData = data.results.map((bar: any) => {
                    const timestamp = bar.t;
                    const date = new Date(timestamp);
                    const pstDate = new Date(date.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
                    const pstHours = pstDate.getHours();
                    const pstMinutes = pstDate.getMinutes();
                    const totalMinutes = pstHours * 60 + pstMinutes;

                    return {
                        time: timestamp,
                        price: bar.c,
                        etMinutes: totalMinutes
                    };
                });

                setChartData({
                    price: currentPrice,
                    change: changePercent,
                    sparklineData,
                    previousDayClose
                });
            } else {
                // Multi-day data
                let daysBack = timeframe === '5D' ? 5 : 30;
                let multiplier = timeframe === '5D' ? 30 : 1;
                let timespan = timeframe === '5D' ? 'minute' : 'hour';

                const rangeStartDate = new Date(pstDate);
                rangeStartDate.setDate(rangeStartDate.getDate() - daysBack);
                const rangeStartStr = `${rangeStartDate.getFullYear()}-${String(rangeStartDate.getMonth() + 1).padStart(2, '0')}-${String(rangeStartDate.getDate()).padStart(2, '0')}`;

                const dataUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${rangeStartStr}/${todayStr}?adjusted=true&sort=asc&limit=50000&apiKey=${POLYGON_API_KEY}`;
                const response = await fetch(dataUrl);
                const data = await response.json();

                if (!data.results || data.results.length === 0) {
                    console.log('No data for', symbol);
                    return;
                }

                const results = data.results;
                const currentPrice = results[results.length - 1].c;
                const startPrice = results[0].c;
                const changePercent = ((currentPrice - startPrice) / startPrice) * 100;

                const sparklineData = results.map((bar: any) => ({
                    time: bar.t,
                    price: bar.c
                }));

                setChartData({
                    price: currentPrice,
                    change: changePercent,
                    sparklineData,
                    previousDayClose: startPrice
                });
            }
        } catch (error) {
            console.error('Error fetching chart data:', error);
        }
    };

    const closeTradeModal = () => {
        setSelectedTrade(null);
        setTradeSetup(null);
        setLoadingTrade(false);
        setChartData(null);
    };

    const sortedResults = [...results]
        .filter(r => {
            // For bulk scans, only show qualifying results
            // For individual ticker searches, show all results
            const isSingleTickerSearch = results.length <= 2; // 2 because we scan both 5D and 13D
            if (!isSingleTickerSearch && r.qualifies === false) return false;

            if (filterType === 'all') return true;
            if (filterType === 'straddles') return r.contractionPercent >= 45;
            if (filterType === 'squeeze-on') return r.squeezeStatus === 'ON';
            if (filterType === 'squeeze-off') return r.squeezeStatus === 'OFF';
            return true;
        })
        .sort((a, b) => {
            if (sortBy === 'highest') {
                return b.contractionPercent - a.contractionPercent;
            } else if (sortBy === 'lowest') {
                return a.contractionPercent - b.contractionPercent;
            } else if (sortBy === 'change-high') {
                return b.changePercent - a.changePercent;
            } else {
                return a.changePercent - b.changePercent;
            }
        });

    // Separate results by period
    const results5Day = sortedResults.filter(r => r.period === '5-DAY');
    const results13Day = sortedResults.filter(r => r.period === '13-DAY');

    return (
        <div className="bg-black text-white" style={{ fontFamily: "'Courier New', 'Monaco', monospace" }}>
            {/* Header */}
            <div className="border-b-2" style={{ padding: '16px 24px', backgroundColor: '#000000', borderBottomColor: '#ff6b00' }}>
                <div className="flex items-center justify-between">
                    <h1 className="text-3xl font-bold tracking-widest" style={{ color: '#ff6b00' }}>
                        PIVOT SCANNER
                    </h1>
                    <div className="flex items-center gap-4">
                        {loading && (
                            <div className="flex items-center gap-2 px-2 py-1 border" style={{ borderColor: '#ff6b00', backgroundColor: '#1a0a00' }}>
                                <div className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: '#ff6b00' }}></div>
                                <span className="text-xl font-bold tracking-widest" style={{ color: '#ff6b00' }}>SCANNING</span>
                            </div>
                        )}
                        {lastUpdate && (
                            <div className="text-xl font-mono" style={{ color: '#ffffff' }}>
                                {lastUpdate.toLocaleTimeString()}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Control Panel */}
            <div className="border-b" style={{ padding: '16px 24px', backgroundColor: '#000000', borderBottomColor: '#222' }}>
                <div className="flex items-center justify-between">
                    {/* Left Side - Scan Controls */}
                    <div className="flex items-center gap-3">
                        {/* Start Scan Button */}
                        <button
                            onClick={scanContractions}
                            disabled={loading}
                            className="px-6 py-3 font-bold uppercase tracking-wider transition-all disabled:opacity-40 relative overflow-hidden"
                            style={{
                                background: loading ? 'linear-gradient(145deg, #1a1a1a, #0f0f0f)' : 'linear-gradient(145deg, #2a2a2a, #0a0a0a)',
                                color: '#ffffff',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: '6px',
                                boxShadow: loading ? 'inset 2px 2px 6px rgba(0,0,0,0.8)' : '0 4px 15px rgba(0,0,0,0.6), inset 1px 1px 2px rgba(255,255,255,0.1), inset -1px -1px 2px rgba(0,0,0,0.5)',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                                letterSpacing: '0.1em',
                                fontSize: '1.3rem'
                            }}
                            onMouseEnter={(e) => {
                                if (!loading) {
                                    e.currentTarget.style.background = 'linear-gradient(145deg, #353535, #151515)';
                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.7), inset 1px 1px 2px rgba(255,255,255,0.15), inset -1px -1px 2px rgba(0,0,0,0.5)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!loading) {
                                    e.currentTarget.style.background = 'linear-gradient(145deg, #2a2a2a, #0a0a0a)';
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = '0 4px 15px rgba(0,0,0,0.6), inset 1px 1px 2px rgba(255,255,255,0.1), inset -1px -1px 2px rgba(0,0,0,0.5)';
                                }
                            }}
                        >
                            {loading ? 'SCANNING...' : 'START SCAN'}
                        </button>

                        {/* Custom Ticker Search */}
                        <input
                            type="text"
                            value={customTicker}
                            onChange={(e) => setCustomTicker(e.target.value.toUpperCase())}
                            onKeyPress={(e) => {
                                if (e.key === 'Enter' && customTicker.trim()) {
                                    scanCustomTicker();
                                }
                            }}
                            placeholder="OR ENTER TICKER"
                            disabled={loading}
                            className="px-3 py-2 font-mono text-base font-bold"
                            style={{
                                background: '#000',
                                color: '#ffffff',
                                border: '1px solid rgba(255, 255, 255, 0.2)',
                                borderRadius: '4px',
                                outline: 'none',
                                textTransform: 'uppercase',
                                letterSpacing: '0.1em',
                                width: '200px',
                                opacity: loading ? 0.4 : 1,
                                cursor: loading ? 'not-allowed' : 'text'
                            }}
                        />
                        <button
                            onClick={scanCustomTicker}
                            disabled={!customTicker.trim() || loading}
                            className="px-4 py-2 font-bold text-sm uppercase tracking-wider transition-all disabled:opacity-40"
                            style={{
                                background: customTicker.trim() && !loading ? 'linear-gradient(145deg, #2a2a2a, #0a0a0a)' : 'linear-gradient(145deg, #1a1a1a, #0f0f0f)',
                                color: '#ffffff',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: '4px',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
                                cursor: customTicker.trim() && !loading ? 'pointer' : 'not-allowed',
                                fontSize: '1.1rem',
                                padding: '10px 20px'
                            }}
                        >
                            SCAN
                        </button>

                        {loading && (
                            <div className="flex items-center gap-2 text-base font-mono ml-2">
                                <span style={{ color: '#ff6b00', fontWeight: '600' }}>{scanningSymbol || 'PROCESSING'}</span>
                                <span style={{ color: '#888' }}>[{scanProgress.current}/{scanProgress.total}]</span>
                            </div>
                        )}
                    </div>

                    {/* Right Side - Sort & Filter Controls */}
                    {!loading && results.length > 0 && (
                        <div className="flex items-center gap-6">
                            {/* Sort Dropdown */}
                            <div className="flex items-center gap-3 relative">
                                <span className="font-bold tracking-wider" style={{ color: '#ffffff', textShadow: '0 1px 2px rgba(0,0,0,0.8)', fontSize: '1.3rem' }}>SORT:</span>
                                <div className="relative">
                                    <button
                                        onClick={() => setShowSortDropdown(!showSortDropdown)}
                                        className="px-4 py-2 font-bold uppercase tracking-wider transition-all flex items-center gap-2"
                                        style={{
                                            background: 'linear-gradient(145deg, #2a2a2a, #0a0a0a)',
                                            color: '#ffffff',
                                            border: '1px solid rgba(255, 255, 255, 0.1)',
                                            borderRadius: '6px',
                                            boxShadow: '0 4px 15px rgba(0,0,0,0.6), inset 1px 1px 2px rgba(255,255,255,0.1), inset -1px -1px 2px rgba(0,0,0,0.5)',
                                            cursor: 'pointer',
                                            minWidth: '180px',
                                            textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                                            fontSize: '1.14rem'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = 'linear-gradient(145deg, #353535, #151515)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'linear-gradient(145deg, #2a2a2a, #0a0a0a)';
                                        }}
                                    >
                                        <span>{sortBy === 'highest' ? 'HIGHEST %' : sortBy === 'lowest' ? 'LOWEST %' : sortBy === 'change-high' ? 'CHANGE HIGH' : 'CHANGE LOW'}</span>
                                        <span style={{ marginLeft: 'auto', fontSize: '1.3rem' }}>▼</span>
                                    </button>

                                    {/* Sort Dropdown Menu */}
                                    {showSortDropdown && (
                                        <div className="absolute top-full mt-2 left-0 z-50" style={{
                                            background: 'linear-gradient(145deg, #1a1a1a, #0a0a0a)',
                                            border: '1px solid rgba(255, 255, 255, 0.1)',
                                            borderRadius: '6px',
                                            boxShadow: '0 8px 24px rgba(0,0,0,0.8)',
                                            minWidth: '180px',
                                            overflow: 'hidden'
                                        }}>
                                            {[
                                                { value: 'highest' as const, label: 'HIGHEST %' },
                                                { value: 'lowest' as const, label: 'LOWEST %' },
                                                { value: 'change-high' as const, label: 'CHANGE HIGH' },
                                                { value: 'change-low' as const, label: 'CHANGE LOW' }
                                            ].map((option) => (
                                                <button
                                                    key={option.value}
                                                    onClick={() => {
                                                        setSortBy(option.value);
                                                        setShowSortDropdown(false);
                                                    }}
                                                    className="w-full px-4 py-2.5 font-bold text-sm uppercase tracking-wider text-left transition-all"
                                                    style={{
                                                        background: sortBy === option.value ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                                                        color: sortBy === option.value ? '#ff6b00' : '#ffffff',
                                                        border: 'none',
                                                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                                                        cursor: 'pointer',
                                                        textShadow: '0 1px 2px rgba(0,0,0,0.8)'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        if (sortBy !== option.value) {
                                                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                                        }
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        if (sortBy !== option.value) {
                                                            e.currentTarget.style.background = 'transparent';
                                                        }
                                                    }}
                                                >
                                                    {option.label}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="h-8 w-px" style={{ backgroundColor: '#333' }}></div>

                            {/* Filter Buttons */}
                            <div className="flex items-center gap-3">
                                <span className="font-bold tracking-wider" style={{ color: '#ffffff', textShadow: '0 1px 2px rgba(0,0,0,0.8)', fontSize: '1.3rem' }}>FILTER:</span>
                                <div className="flex gap-2">
                                    {[
                                        { value: 'all' as const, label: 'ALL', color: '#ff6b00' },
                                        { value: 'straddles' as const, label: 'STRADDLES', color: '#3b82f6' },
                                        { value: 'squeeze-on' as const, label: 'SQZ·ON', color: '#16a34a' },
                                        { value: 'squeeze-off' as const, label: 'SQZ·OFF', color: '#dc2626' }
                                    ].map((filter) => (
                                        <button
                                            key={filter.value}
                                            onClick={() => setFilterType(filter.value)}
                                            className="px-3 py-2 font-bold uppercase tracking-wider transition-all"
                                            style={{
                                                background: filterType === filter.value
                                                    ? `linear-gradient(145deg, ${filter.color}, ${filter.color}dd)`
                                                    : 'linear-gradient(145deg, #2a2a2a, #0a0a0a)',
                                                color: filterType === filter.value ? '#000' : '#ffffff',
                                                border: `1px solid ${filterType === filter.value ? filter.color : 'rgba(255, 255, 255, 0.1)'}`,
                                                borderRadius: '6px',
                                                boxShadow: filterType === filter.value
                                                    ? `0 0 15px ${filter.color}66, inset 1px 1px 2px rgba(255,255,255,0.2)`
                                                    : '0 4px 15px rgba(0,0,0,0.6), inset 1px 1px 2px rgba(255,255,255,0.1), inset -1px -1px 2px rgba(0,0,0,0.5)',
                                                cursor: 'pointer',
                                                textShadow: filterType === filter.value ? '0 1px 2px rgba(0,0,0,0.5)' : '0 1px 2px rgba(0,0,0,0.8)',
                                                fontSize: '1.14rem'
                                            }}
                                            onMouseEnter={(e) => {
                                                if (filterType !== filter.value) {
                                                    e.currentTarget.style.background = 'linear-gradient(145deg, #353535, #151515)';
                                                    e.currentTarget.style.borderColor = filter.color;
                                                }
                                            }}
                                            onMouseLeave={(e) => {
                                                if (filterType !== filter.value) {
                                                    e.currentTarget.style.background = 'linear-gradient(145deg, #2a2a2a, #0a0a0a)';
                                                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                                                }
                                            }}
                                        >
                                            {filter.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {loading && (
                <div style={{ height: '2px', backgroundColor: '#1a1a1a', overflow: 'hidden' }}>
                    <div
                        className="h-full transition-all duration-200"
                        style={{
                            width: `${scanProgress.total > 0 ? (scanProgress.current / scanProgress.total) * 100 : 0}%`,
                            backgroundColor: '#ff6b00'
                        }}
                    />
                </div>
            )}

            {/* Results Grid */}
            <div style={{ padding: '20px' }}>
                {results.length === 0 && !loading && !lastUpdate && (
                    <div className="text-center border" style={{ padding: '60px 0', borderColor: '#333', backgroundColor: '#000000' }}>
                        <AlertCircle className="w-12 h-12 mx-auto mb-4" style={{ color: '#ffffff' }} strokeWidth={1.5} />
                        <div className="text-xl font-bold tracking-widest mb-2" style={{ color: '#ff6b00' }}>NO DATA</div>
                        <div className="text-xl font-mono" style={{ color: '#ffffff' }}>EXECUTE SCAN TO BEGIN ANALYSIS</div>
                        <div className="text-xl font-mono mt-2" style={{ color: '#ffffff' }}>5D·13D LOOKBACK·DAILY BARS</div>
                    </div>
                )}

                {results.length === 0 && !loading && lastUpdate && (
                    <div className="text-center border" style={{ padding: '60px 0', borderColor: '#333', backgroundColor: '#000000' }}>
                        <AlertCircle className="w-12 h-12 mx-auto mb-4" style={{ color: '#ffffff' }} strokeWidth={1.5} />
                        <div className="text-xl font-bold tracking-widest mb-2" style={{ color: '#ff6b00' }}>NO RESULTS FOUND</div>
                    </div>
                )}

                {results.length === 0 && loading && (
                    <div className="text-center border" style={{ padding: '60px 0', borderColor: '#333', backgroundColor: '#000000' }}>
                        <div className="relative w-14 h-14 mx-auto mb-4">
                            <div className="absolute inset-0 border border-gray-800"></div>
                            <div className="absolute inset-0 border-t border-white animate-spin"></div>
                        </div>
                        <div className="text-xl font-bold tracking-widest mb-2" style={{ color: '#ff6b00' }}>SCANNING</div>
                        <div className="text-xl font-mono" style={{ color: '#ffffff' }}>
                            {scanProgress.current} / {scanProgress.total} SYMBOLS
                        </div>
                    </div>
                )}

                {/* Two Column Layout */}
                {results.length > 0 && (
                    <div className="grid grid-cols-2 gap-4">
                        {/* Left Column - 5-DAY */}
                        <div>
                            <div className="mb-4 pb-3 border-b" style={{ borderColor: '#ff6b00' }}>
                                <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-4" style={{ backgroundColor: '#ff6b00' }}></div>
                                    <h3 className="text-xl font-bold tracking-widest" style={{ color: '#ff6b00' }}>5D CONSOLIDATION</h3>
                                    <span className="text-xl font-mono" style={{ color: '#ffffff' }}>[{results5Day.length}]</span>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                {results5Day.map((result, idx) => (
                                    <div
                                        key={`${result.symbol}-5d-${idx}`}
                                        className="border transition-all hover:border-orange-600 cursor-pointer"
                                        style={{
                                            padding: '16px',
                                            borderColor: result.qualifies === false ? '#dc2626' : '#333',
                                            backgroundColor: '#000000',
                                            opacity: result.qualifies === false ? 0.8 : 1
                                        }}
                                        onClick={() => result.contractionPercent >= 45 && result.qualifies !== false && loadTradeSetup(result)}
                                    >
                                        {/* Ticker with Status Badge */}
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="text-3xl font-bold tracking-wider" style={{ color: '#ffffff', fontFamily: 'monospace' }}>{result.symbol}</div>
                                            {result.qualifies === false ? (
                                                <div className="text-xs font-bold tracking-wider px-2 py-1 rounded" style={{
                                                    backgroundColor: '#dc2626',
                                                    color: '#ffffff'
                                                }}>
                                                    NOT QUALIFIED
                                                </div>
                                            ) : (
                                                <div className="text-base font-bold tracking-wider" style={{
                                                    color: result.squeezeStatus === 'ON' ? '#16a34a' : '#dc2626'
                                                }}>
                                                    {result.squeezeStatus}
                                                </div>
                                            )}
                                        </div>

                                        {/* Diagnostic Info for Non-Qualifying */}
                                        {result.qualifies === false && result.failReason && (
                                            <div className="mb-3 p-2 border-l-2" style={{ borderColor: '#dc2626' }}>
                                                <div className="text-xs font-bold mb-1" style={{ color: '#ffffff' }}>WHY NOT QUALIFIED:</div>
                                                <div className="text-xs font-bold" style={{ color: '#ffffff' }}>{result.failReason}</div>
                                                <div className="mt-2 space-y-1">
                                                    {result.actualCompression !== undefined && (
                                                        <div className="text-xs font-bold" style={{ color: '#ffffff' }}>
                                                            Compression: {result.actualCompression.toFixed(1)}% (need {result.requiredCompression}%+)
                                                        </div>
                                                    )}
                                                    {result.netMovePercent !== undefined && (
                                                        <div className="text-xs font-bold" style={{ color: '#ffffff' }}>
                                                            Sideways: {result.isSideways ? 'YES' : 'NO'} ({result.netMovePercent.toFixed(1)}% net move)
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Price and Contraction Score */}
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="text-3xl font-mono" style={{ color: '#ffffff' }}>${result.currentPrice.toFixed(2)}</div>
                                            <div className="flex items-baseline gap-0.5">
                                                <span className="text-4xl font-bold" style={{ color: '#ff6b00', fontFamily: 'monospace' }}>{Math.abs(result.contractionPercent).toFixed(1)}</span>
                                                <span className="text-2xl font-bold" style={{ color: '#ff6b00' }}>%</span>
                                            </div>
                                        </div>

                                        {/* Change */}
                                        <div className="text-3xl font-mono font-bold mb-2" style={{
                                            color: result.change >= 0 ? '#16a34a' : '#dc2626'
                                        }}>
                                            {result.change >= 0 ? '+' : ''}{result.changePercent.toFixed(2)}%
                                        </div>

                                        {/* Trade Available Badge */}
                                        {result.contractionPercent >= 45 && (
                                            <div className="mt-3 pt-3 border-t" style={{ borderColor: '#333' }}>
                                                <div className="text-xs font-bold tracking-widest text-center py-1 px-2" style={{
                                                    backgroundColor: '#ff6b00',
                                                    color: '#000'
                                                }}>
                                                    STRADDLE AVAILABLE
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Right Column - 13-DAY */}
                        <div>
                            <div className="mb-4 pb-3 border-b" style={{ borderColor: '#ff6b00' }}>
                                <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-4" style={{ backgroundColor: '#ff6b00' }}></div>
                                    <h3 className="text-xl font-bold tracking-widest" style={{ color: '#ff6b00' }}>13D CONSOLIDATION</h3>
                                    <span className="text-xl font-mono" style={{ color: '#ffffff' }}>[{results13Day.length}]</span>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                {results13Day.map((result, idx) => (
                                    <div
                                        key={`${result.symbol}-13d-${idx}`}
                                        className="border transition-all hover:border-orange-600 cursor-pointer"
                                        style={{
                                            padding: '16px',
                                            borderColor: result.qualifies === false ? '#dc2626' : '#333',
                                            backgroundColor: '#000000',
                                            opacity: result.qualifies === false ? 0.8 : 1
                                        }}
                                        onClick={() => result.contractionPercent >= 45 && result.qualifies !== false && loadTradeSetup(result)}
                                    >
                                        {/* Ticker with Status Badge */}
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="text-3xl font-bold tracking-wider" style={{ color: '#ffffff', fontFamily: 'monospace' }}>{result.symbol}</div>
                                            {result.qualifies === false ? (
                                                <div className="text-xs font-bold tracking-wider px-2 py-1 rounded" style={{
                                                    backgroundColor: '#dc2626',
                                                    color: '#ffffff'
                                                }}>
                                                    NOT QUALIFIED
                                                </div>
                                            ) : (
                                                <div className="text-base font-bold tracking-wider" style={{
                                                    color: result.squeezeStatus === 'ON' ? '#16a34a' : '#dc2626'
                                                }}>
                                                    {result.squeezeStatus}
                                                </div>
                                            )}
                                        </div>

                                        {/* Diagnostic Info for Non-Qualifying */}
                                        {result.qualifies === false && result.failReason && (
                                            <div className="mb-3 p-2 border-l-2" style={{ borderColor: '#dc2626' }}>
                                                <div className="text-xs font-bold mb-1" style={{ color: '#ffffff' }}>WHY NOT QUALIFIED:</div>
                                                <div className="text-xs font-bold" style={{ color: '#ffffff' }}>{result.failReason}</div>
                                                <div className="mt-2 space-y-1">
                                                    {result.actualCompression !== undefined && (
                                                        <div className="text-xs font-bold" style={{ color: '#ffffff' }}>
                                                            Compression: {result.actualCompression.toFixed(1)}% (need {result.requiredCompression}%+)
                                                        </div>
                                                    )}
                                                    {result.netMovePercent !== undefined && (
                                                        <div className="text-xs font-bold" style={{ color: '#ffffff' }}>
                                                            Sideways: {result.isSideways ? 'YES' : 'NO'} ({result.netMovePercent.toFixed(1)}% net move)
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Price and Contraction Score */}
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="text-3xl font-mono" style={{ color: '#ffffff' }}>${result.currentPrice.toFixed(2)}</div>
                                            <div className="flex items-baseline gap-0.5">
                                                <span className="text-4xl font-bold" style={{ color: '#ff6b00', fontFamily: 'monospace' }}>{Math.abs(result.contractionPercent).toFixed(1)}</span>
                                                <span className="text-2xl font-bold" style={{ color: '#ff6b00' }}>%</span>
                                            </div>
                                        </div>

                                        {/* Change */}
                                        <div className="text-3xl font-mono font-bold mb-2" style={{
                                            color: result.change >= 0 ? '#16a34a' : '#dc2626'
                                        }}>
                                            {result.change >= 0 ? '+' : ''}{result.changePercent.toFixed(2)}%
                                        </div>

                                        {/* Trade Available Badge */}
                                        {result.contractionPercent >= 45 && (
                                            <div className="mt-3 pt-3 border-t" style={{ borderColor: '#333' }}>
                                                <div className="text-xs font-bold tracking-widest text-center py-1 px-2" style={{
                                                    backgroundColor: '#ff6b00',
                                                    color: '#000'
                                                }}>
                                                    STRADDLE AVAILABLE
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Trade Setup Modal */}
            {selectedTrade && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.95)' }}>
                    <div className="relative max-w-4xl w-full mx-4" style={{
                        backgroundColor: '#0a0a0a',
                        border: '1px solid #333333',
                        maxHeight: '108vh',
                        overflowY: 'auto',
                        borderRadius: '4px'
                    }}>
                        {/* Header */}
                        <div className="px-6 py-4 border-b" style={{ borderColor: '#333333', position: 'relative' }}>
                            <div className="flex items-start justify-between">
                                {/* Left Side - Ticker and % Change */}
                                <div>
                                    <h2 className="font-semibold" style={{ color: '#ffffff', fontSize: '1.8rem' }}>
                                        {selectedTrade.symbol} Straddle Setup
                                    </h2>
                                </div>

                                {/* Right Side - Period, Price, Consolidation */}
                                <div className="flex items-center gap-3" style={{ fontSize: '1.3rem', marginTop: '8px', marginRight: '50px' }}>
                                    <span style={{ color: '#FF6600', fontWeight: 700 }}>{selectedTrade.period}</span>
                                    <span style={{ color: '#666666' }}>•</span>
                                    <span style={{
                                        color: chartData?.change && chartData.change >= 0 ? '#22c55e' : '#ef4444',
                                        fontWeight: 700
                                    }}>${selectedTrade.currentPrice.toFixed(2)}</span>
                                    <span style={{ color: '#666666' }}>•</span>
                                    <span style={{ color: '#fbbf24', fontWeight: 700 }}>{selectedTrade.contractionPercent.toFixed(1)}% Consolidation</span>
                                </div>

                                {/* Close Button - Absolute Position */}
                                <button
                                    onClick={closeTradeModal}
                                    className="p-2 hover:bg-gray-800/50 transition-all rounded"
                                    style={{
                                        color: '#ffffff',
                                        position: 'absolute',
                                        top: '16px',
                                        right: '16px'
                                    }}
                                >
                                    <X size={24} />
                                </button>
                            </div>
                        </div>

                        {/* Loading State */}
                        {loadingTrade && (
                            <div className="p-8 text-center">
                                <div className="font-medium mb-2" style={{ color: '#ffffff', fontSize: '1.8rem' }}>
                                    Calculating Trade Setup...
                                </div>
                                <div style={{ color: '#ffffff', fontSize: '1.08rem' }}>
                                    Fetching options chain and calculating targets
                                </div>
                            </div>
                        )}

                        {/* Trade Setup Display */}
                        {!loadingTrade && tradeSetup && (
                            <div className="px-6 py-4">
                                {/* Position Overview */}
                                <div className="mb-4 px-4 py-3 border" style={{
                                    borderColor: '#333333',
                                    backgroundColor: '#000000'
                                }}>
                                    <div className="grid grid-cols-3 gap-4" style={{ fontSize: '1.3rem' }}>
                                        <div>
                                            <span style={{ color: '#ffffff', fontWeight: 700 }}>Expiration: </span>
                                            <span style={{ color: '#ffffff', fontWeight: 700 }}>{new Date(tradeSetup.expiration).toLocaleDateString()}</span>
                                        </div>
                                        <div>
                                            <span style={{ color: '#ffffff', fontWeight: 700 }}>Total Cost: </span>
                                            <span style={{ color: '#ffffff', fontWeight: 700 }}>${tradeSetup.totalCost.toFixed(0)}</span>
                                        </div>
                                        <div>
                                            <span style={{ color: '#ffffff', fontWeight: 700 }}>Max Loss: </span>
                                            <span style={{ color: '#ef4444', fontWeight: 700 }}>${tradeSetup.totalCost.toFixed(0)}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Layout - Calls/Puts row, then Breakeven below spanning those 2 columns, Chart on right spanning both rows */}
                                <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr 1.5fr', gridTemplateRows: 'auto auto' }}>
                                    {/* CALLS Side */}
                                    <div className="border p-3" style={{
                                        borderColor: '#22c55e',
                                        backgroundColor: '#000000'
                                    }}>
                                        <div className="flex items-center gap-2 mb-3">
                                            <TrendingUp size={24} style={{ color: '#22c55e' }} />
                                            <h3 className="font-semibold" style={{ color: '#22c55e', fontSize: '1.5rem' }}>
                                                Call Side
                                            </h3>
                                        </div>

                                        {/* Strike & Entry */}
                                        <div className="mb-3 pb-3 border-b" style={{ borderColor: '#22c55e' }}>
                                            <div className="flex justify-between mb-1.5" style={{ fontSize: '1.08rem' }}>
                                                <span style={{ color: '#ffffff', fontWeight: 700 }}>Strike:</span>
                                                <span style={{ color: '#fbbf24', fontWeight: 600, fontSize: '1.32rem' }}>${tradeSetup.callStrike.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between mb-1.5" style={{ fontSize: '1.08rem' }}>
                                                <span style={{ color: '#ffffff', fontWeight: 700 }}>Entry (Ask):</span>
                                                <span style={{ color: '#3b82f6', fontWeight: 600 }}>${tradeSetup.callPremium.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between mb-1.5" style={{ fontSize: '1.08rem' }}>
                                                <span style={{ color: '#ffffff', fontWeight: 700 }}>Bid/Ask:</span>
                                                <span style={{ color: '#ffffff' }}><span style={{ color: '#22c55e' }}>${tradeSetup.callBid.toFixed(2)}</span> / <span style={{ color: '#ef4444' }}>${tradeSetup.callAsk.toFixed(2)}</span></span>
                                            </div>
                                            <div className="flex justify-between" style={{ fontSize: '1.08rem' }}>
                                                <span style={{ color: '#ffffff', fontWeight: 700 }}>IV:</span>
                                                <span style={{ color: '#a855f7' }}>{(tradeSetup.callImpliedVolatility * 100).toFixed(1)}%</span>
                                            </div>
                                        </div>

                                        {/* Target 1 */}
                                        <div className="mb-2 p-2.5" style={{ backgroundColor: '#0a1a0f', border: '1px solid #22c55e' }}>
                                            <div className="font-semibold mb-1.5" style={{ color: '#22c55e', fontSize: '1.08rem' }}>
                                                TARGET 1 (84%)
                                            </div>
                                            <div className="flex justify-between mb-1" style={{ fontSize: '1.08rem' }}>
                                                <span style={{ color: '#ffffff', fontWeight: 700 }}>Stock Price:</span>
                                                <span style={{ color: '#22c55e', fontWeight: 600 }}>${tradeSetup.callTarget1.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between mb-1" style={{ fontSize: '1.08rem' }}>
                                                <span style={{ color: '#ffffff', fontWeight: 700 }}>Option Value:</span>
                                                <span style={{ color: '#22c55e', fontWeight: 600 }}>${tradeSetup.callTarget1Premium.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between" style={{ fontSize: '1.08rem' }}>
                                                <span style={{ color: '#ffffff', fontWeight: 700 }}>Profit:</span>
                                                <span style={{ color: '#10b981', fontWeight: 600 }}>
                                                    +{((tradeSetup.callTarget1Premium - tradeSetup.callPremium) / tradeSetup.callPremium * 100).toFixed(0)}%
                                                </span>
                                            </div>
                                        </div>

                                        {/* Target 2 */}
                                        <div className="p-2.5" style={{ backgroundColor: '#0a1a0f', border: '1px solid #22c55e' }}>
                                            <div className="font-semibold mb-1.5" style={{ color: '#22c55e', fontSize: '1.08rem' }}>
                                                TARGET 2 (93%)
                                            </div>
                                            <div className="flex justify-between mb-1" style={{ fontSize: '1.08rem' }}>
                                                <span style={{ color: '#ffffff', fontWeight: 700 }}>Stock Price:</span>
                                                <span style={{ color: '#22c55e', fontWeight: 600 }}>${tradeSetup.callTarget2.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between mb-1" style={{ fontSize: '1.08rem' }}>
                                                <span style={{ color: '#ffffff', fontWeight: 700 }}>Option Value:</span>
                                                <span style={{ color: '#22c55e', fontWeight: 600 }}>${tradeSetup.callTarget2Premium.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between" style={{ fontSize: '1.08rem' }}>
                                                <span style={{ color: '#ffffff', fontWeight: 700 }}>Profit:</span>
                                                <span style={{ color: '#10b981', fontWeight: 600 }}>
                                                    +{((tradeSetup.callTarget2Premium - tradeSetup.callPremium) / tradeSetup.callPremium * 100).toFixed(0)}%
                                                </span>
                                            </div>
                                        </div>

                                        {/* Upper Breakeven */}
                                        <div className="mt-3 p-2.5" style={{ backgroundColor: '#0a1a0f', border: '1px solid #22c55e' }}>
                                            <div className="flex justify-between mb-1" style={{ fontSize: '1.08rem' }}>
                                                <span style={{ color: '#ffffff', fontWeight: 700 }}>Upper Breakeven:</span>
                                                <span style={{ color: '#22c55e', fontWeight: 600 }}>${tradeSetup.breakevens.upper.toFixed(2)}</span>
                                            </div>
                                            <div style={{ color: '#ffffff', fontSize: '0.9rem', textAlign: 'center', marginTop: '4px' }}>
                                                Stock must move up {((tradeSetup.breakevens.upper - selectedTrade.currentPrice) / selectedTrade.currentPrice * 100).toFixed(1)}%
                                            </div>
                                        </div>
                                    </div>

                                    {/* PUTS Side */}
                                    <div className="border p-3" style={{
                                        borderColor: '#ef4444',
                                        backgroundColor: '#000000'
                                    }}>
                                        <div className="flex items-center gap-2 mb-3">
                                            <TrendingDown size={24} style={{ color: '#ef4444' }} />
                                            <h3 className="font-semibold" style={{ color: '#ef4444', fontSize: '1.5rem' }}>
                                                Put Side
                                            </h3>
                                        </div>

                                        {/* Strike & Entry */}
                                        <div className="mb-3 pb-3 border-b" style={{ borderColor: '#ef4444' }}>
                                            <div className="flex justify-between mb-1.5" style={{ fontSize: '1.08rem' }}>
                                                <span style={{ color: '#ffffff', fontWeight: 700 }}>Strike:</span>
                                                <span style={{ color: '#fbbf24', fontWeight: 600, fontSize: '1.32rem' }}>${tradeSetup.putStrike.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between mb-1.5" style={{ fontSize: '1.08rem' }}>
                                                <span style={{ color: '#ffffff', fontWeight: 700 }}>Entry (Ask):</span>
                                                <span style={{ color: '#3b82f6', fontWeight: 600 }}>${tradeSetup.putPremium.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between mb-1.5" style={{ fontSize: '1.08rem' }}>
                                                <span style={{ color: '#ffffff', fontWeight: 700 }}>Bid/Ask:</span>
                                                <span style={{ color: '#ffffff' }}><span style={{ color: '#22c55e' }}>${tradeSetup.putBid.toFixed(2)}</span> / <span style={{ color: '#ef4444' }}>${tradeSetup.putAsk.toFixed(2)}</span></span>
                                            </div>
                                            <div className="flex justify-between" style={{ fontSize: '1.08rem' }}>
                                                <span style={{ color: '#ffffff', fontWeight: 700 }}>IV:</span>
                                                <span style={{ color: '#a855f7' }}>{(tradeSetup.putImpliedVolatility * 100).toFixed(1)}%</span>
                                            </div>
                                        </div>

                                        {/* Target 1 */}
                                        <div className="mb-2 p-2.5" style={{ backgroundColor: '#1a0a0a', border: '1px solid #ef4444' }}>
                                            <div className="font-semibold mb-1.5" style={{ color: '#ef4444', fontSize: '1.08rem' }}>
                                                TARGET 1 (84%)
                                            </div>
                                            <div className="flex justify-between mb-1" style={{ fontSize: '1.08rem' }}>
                                                <span style={{ color: '#ffffff', fontWeight: 700 }}>Stock Price:</span>
                                                <span style={{ color: '#ef4444', fontWeight: 600 }}>${tradeSetup.putTarget1.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between mb-1" style={{ fontSize: '1.08rem' }}>
                                                <span style={{ color: '#ffffff', fontWeight: 700 }}>Option Value:</span>
                                                <span style={{ color: '#ef4444', fontWeight: 600 }}>${tradeSetup.putTarget1Premium.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between" style={{ fontSize: '1.08rem' }}>
                                                <span style={{ color: '#ffffff', fontWeight: 700 }}>Profit:</span>
                                                <span style={{ color: '#10b981', fontWeight: 600 }}>
                                                    +{((tradeSetup.putTarget1Premium - tradeSetup.putPremium) / tradeSetup.putPremium * 100).toFixed(0)}%
                                                </span>
                                            </div>
                                        </div>

                                        {/* Target 2 */}
                                        <div className="p-2.5" style={{ backgroundColor: '#1a0a0a', border: '1px solid #ef4444' }}>
                                            <div className="font-semibold mb-1.5" style={{ color: '#ef4444', fontSize: '1.08rem' }}>
                                                TARGET 2 (93%)
                                            </div>
                                            <div className="flex justify-between mb-1" style={{ fontSize: '1.08rem' }}>
                                                <span style={{ color: '#ffffff', fontWeight: 700 }}>Stock Price:</span>
                                                <span style={{ color: '#ef4444', fontWeight: 600 }}>${tradeSetup.putTarget2.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between mb-1" style={{ fontSize: '1.08rem' }}>
                                                <span style={{ color: '#ffffff', fontWeight: 700 }}>Option Value:</span>
                                                <span style={{ color: '#ef4444', fontWeight: 600 }}>${tradeSetup.putTarget2Premium.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between" style={{ fontSize: '1.08rem' }}>
                                                <span style={{ color: '#ffffff', fontWeight: 700 }}>Profit:</span>
                                                <span style={{ color: '#10b981', fontWeight: 600 }}>
                                                    +{((tradeSetup.putTarget2Premium - tradeSetup.putPremium) / tradeSetup.putPremium * 100).toFixed(0)}%
                                                </span>
                                            </div>
                                        </div>

                                        {/* Lower Breakeven */}
                                        <div className="mt-3 p-2.5" style={{ backgroundColor: '#1a0a0a', border: '1px solid #ef4444' }}>
                                            <div className="flex justify-between mb-1" style={{ fontSize: '1.08rem' }}>
                                                <span style={{ color: '#ffffff', fontWeight: 700 }}>Lower Breakeven:</span>
                                                <span style={{ color: '#ef4444', fontWeight: 600 }}>${tradeSetup.breakevens.lower.toFixed(2)}</span>
                                            </div>
                                            <div style={{ color: '#ffffff', fontSize: '0.9rem', textAlign: 'center', marginTop: '4px' }}>
                                                Stock must move down {((selectedTrade.currentPrice - tradeSetup.breakevens.lower) / selectedTrade.currentPrice * 100).toFixed(1)}%
                                            </div>
                                        </div>
                                    </div>

                                    {/* CHART Side - spans 2 rows */}
                                    <div className="border p-3" style={{
                                        borderColor: '#333333',
                                        backgroundColor: '#000000',
                                        gridRow: '1 / 3',
                                        gridColumn: '3',
                                        minWidth: '350px'
                                    }}>
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-3">
                                                <h3 className="font-semibold" style={{ color: '#ffffff', fontSize: '1.5rem' }}>
                                                    {selectedTrade.symbol}
                                                </h3>
                                                {chartData && (
                                                    <>
                                                        <div style={{ color: '#ffffff', fontSize: '1.3rem', fontWeight: 700 }}>
                                                            ${chartData.price.toFixed(2)}
                                                        </div>
                                                        <div style={{
                                                            color: chartData.change >= 0 ? '#22c55e' : '#ef4444',
                                                            fontSize: '1.3rem',
                                                            fontWeight: 700
                                                        }}>
                                                            {chartData.change >= 0 ? '+' : ''}{chartData.change.toFixed(2)}%
                                                        </div>
                                                    </>
                                                )}
                                            </div>

                                            {/* Timeframe Selector */}
                                            <div className="flex gap-1">
                                                {(['1D', '5D', '1M'] as const).map((tf) => (
                                                    <button
                                                        key={tf}
                                                        onClick={() => setChartTimeframe(tf)}
                                                        className={`px-3 py-1 font-bold rounded transition-all border`}
                                                        style={{
                                                            backgroundColor: chartTimeframe === tf ? '#0a0e1a' : '#000000',
                                                            color: chartTimeframe === tf ? '#FF6600' : '#ffffff',
                                                            borderColor: chartTimeframe === tf ? '#FF6600' : '#333333',
                                                            fontSize: '0.9rem'
                                                        }}
                                                    >
                                                        {tf}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {loadingTrade ? (
                                            <div className="flex items-center justify-center h-40">
                                                <div style={{ color: '#ffffff', fontSize: '1.08rem' }}>Loading chart...</div>
                                            </div>
                                        ) : chartData ? (
                                            <div className="flex flex-col">
                                                {/* Chart with Y-axis */}
                                                <div className="flex gap-2">
                                                    {/* Chart SVG */}
                                                    <svg
                                                        viewBox="0 0 200 50"
                                                        preserveAspectRatio="none"
                                                        className="flex-1"
                                                        style={{ height: '360px' }}
                                                    >
                                                        {chartData.sparklineData.length > 1 && (() => {
                                                            const prices = chartData.sparklineData.map(p => p.price);
                                                            const minPrice = Math.min(...prices);
                                                            const maxPrice = Math.max(...prices);
                                                            const priceRange = maxPrice - minPrice || 1;
                                                            const padding = 8;
                                                            const chartHeight = 50 - (padding * 2);

                                                            const points = chartData.sparklineData.map((point, i) => {
                                                                const x = (i / (chartData.sparklineData.length - 1)) * 200;
                                                                const y = padding + ((maxPrice - point.price) / priceRange) * chartHeight;
                                                                return `${x.toFixed(1)},${y.toFixed(1)}`;
                                                            }).join(' ');

                                                            const prevDayY = chartData.previousDayClose
                                                                ? padding + ((maxPrice - chartData.previousDayClose) / priceRange) * chartHeight
                                                                : null;

                                                            // Pre-calculate shading zones
                                                            const shadingZones: Array<{ x: number; width: number; color: string }> = [];
                                                            let currentZone: { start: number; color: string } | null = null;

                                                            chartData.sparklineData.forEach((point, i) => {
                                                                const totalMinutes = point.etMinutes || 0;
                                                                const preMarketStart = 1 * 60;        // 1:00 AM PST (4:00 AM ET)
                                                                const marketStart = 6 * 60 + 30;      // 6:30 AM PST (9:30 AM ET)
                                                                const marketEnd = 13 * 60;            // 1:00 PM PST (4:00 PM ET)
                                                                const afterHoursEnd = 17 * 60;        // 5:00 PM PST (8:00 PM ET)
                                                                let fillColor: string | null = null;
                                                                if (totalMinutes >= preMarketStart && totalMinutes < marketStart) {
                                                                    fillColor = 'rgba(255, 165, 0, 0.12)';
                                                                } else if (totalMinutes >= marketEnd && totalMinutes < afterHoursEnd) {
                                                                    fillColor = 'rgba(0, 174, 239, 0.12)';
                                                                }

                                                                if (fillColor) {
                                                                    if (!currentZone || currentZone.color !== fillColor) {
                                                                        if (currentZone !== null) {
                                                                            const x = (currentZone.start / (chartData.sparklineData.length - 1)) * 200;
                                                                            const endX = (i / (chartData.sparklineData.length - 1)) * 200;
                                                                            shadingZones.push({ x, width: endX - x, color: currentZone.color });
                                                                        }
                                                                        currentZone = { start: i, color: fillColor };
                                                                    }
                                                                } else if (currentZone !== null) {
                                                                    const x = (currentZone.start / (chartData.sparklineData.length - 1)) * 200;
                                                                    const endX = (i / (chartData.sparklineData.length - 1)) * 200;
                                                                    shadingZones.push({ x, width: endX - x, color: currentZone.color });
                                                                    currentZone = null;
                                                                }
                                                            });

                                                            if (currentZone !== null) {
                                                                const zone = currentZone as { start: number; color: string };
                                                                const x = (zone.start / (chartData.sparklineData.length - 1)) * 200;
                                                                shadingZones.push({ x, width: 200 - x, color: zone.color });
                                                            }

                                                            return (
                                                                <>
                                                                    {shadingZones.map((zone, idx) => (
                                                                        <rect
                                                                            key={`shade-${idx}`}
                                                                            x={zone.x}
                                                                            y="0"
                                                                            width={zone.width}
                                                                            height="50"
                                                                            fill={zone.color}
                                                                        />
                                                                    ))}

                                                                    {prevDayY !== null && (
                                                                        <line
                                                                            x1="0"
                                                                            y1={prevDayY.toFixed(1)}
                                                                            x2="200"
                                                                            y2={prevDayY.toFixed(1)}
                                                                            stroke="#444444"
                                                                            strokeWidth="1"
                                                                            strokeDasharray="3,2"
                                                                            opacity="0.4"
                                                                            vectorEffect="non-scaling-stroke"
                                                                        />
                                                                    )}

                                                                    <polyline
                                                                        fill="none"
                                                                        stroke={chartData.change >= 0 ? '#22c55e' : '#ef4444'}
                                                                        strokeWidth="1.5"
                                                                        points={points}
                                                                        strokeLinecap="round"
                                                                        strokeLinejoin="round"
                                                                        vectorEffect="non-scaling-stroke"
                                                                    />
                                                                </>
                                                            );
                                                        })()}
                                                    </svg>
                                                    {/* Y-axis Price Labels - RIGHT SIDE */}
                                                    <div className="flex flex-col justify-between" style={{ fontSize: '0.9rem', color: '#ffffff', fontWeight: 700, paddingTop: '8px', paddingBottom: '8px' }}>
                                                        <span>${Math.max(...chartData.sparklineData.map(p => p.price)).toFixed(2)}</span>
                                                        <span>${((Math.max(...chartData.sparklineData.map(p => p.price)) + Math.min(...chartData.sparklineData.map(p => p.price))) / 2).toFixed(2)}</span>
                                                        <span>${Math.min(...chartData.sparklineData.map(p => p.price)).toFixed(2)}</span>
                                                    </div>
                                                </div>

                                                {/* Time Labels (X-axis) - PROMINENT */}
                                                <div className="flex justify-between px-2 py-2 mt-2" style={{
                                                    fontSize: '1rem',
                                                    color: '#ffffff',
                                                    fontWeight: 700,
                                                    backgroundColor: '#0a0a0a',
                                                    border: '1px solid #333333',
                                                    borderRadius: '4px'
                                                }}>
                                                    {(() => {
                                                        const dataLength = chartData.sparklineData.length;
                                                        if (dataLength === 0) return <span>No data</span>;

                                                        const firstPoint = chartData.sparklineData[0];
                                                        const lastPoint = chartData.sparklineData[dataLength - 1];
                                                        const midPoint = chartData.sparklineData[Math.floor(dataLength / 2)];

                                                        const formatTime = (point: any) => {
                                                            // For 1D timeframe, use etMinutes if available
                                                            if (chartTimeframe === '1D') {
                                                                if (point.etMinutes !== undefined && point.etMinutes !== null) {
                                                                    const hours = Math.floor(point.etMinutes / 60);
                                                                    const mins = point.etMinutes % 60;
                                                                    const ampm = hours >= 12 ? 'PM' : 'AM';
                                                                    const displayHour = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
                                                                    return `${displayHour}:${mins.toString().padStart(2, '0')}${ampm}`;
                                                                }
                                                            }
                                                            // For multi-day or fallback, use timestamp
                                                            if (point.time) {
                                                                const date = new Date(point.time);
                                                                const month = String(date.getMonth() + 1).padStart(2, '0');
                                                                const day = String(date.getDate()).padStart(2, '0');
                                                                return `${month}/${day}`;
                                                            }
                                                            // Final fallback
                                                            return '';
                                                        };

                                                        const start = formatTime(firstPoint);
                                                        const mid = formatTime(midPoint);
                                                        const end = formatTime(lastPoint);

                                                        // If all are empty, show fallback
                                                        if (!start && !mid && !end) {
                                                            return <span>Time data unavailable</span>;
                                                        }

                                                        return (
                                                            <>
                                                                <span>{start || '...'}</span>
                                                                <span>{mid || '...'}</span>
                                                                <span>{end || '...'}</span>
                                                            </>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-center h-40">
                                                <div style={{ color: '#ffffff', fontSize: '1.08rem' }}>No chart data available</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Error State */}
                        {!loadingTrade && !tradeSetup && (
                            <div className="p-8 text-center">
                                <div className="font-medium mb-2" style={{ color: '#ef4444', fontSize: '1.8rem' }}>
                                    Unable to Generate Trade Setup
                                </div>
                                <div style={{ color: '#ffffff', fontSize: '1.08rem' }}>
                                    Options chain data not available or insufficient liquidity
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
