'use client';

import React, { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, Layers, RefreshCw } from 'lucide-react';
import { TOP_1000_SYMBOLS } from '@/lib/Top1000Symbols';

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

interface OTMPremiumScannerProps {
    compactMode?: boolean;
}

// Helper function to calculate next monthly expiry (3rd Friday of next month)
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

// Helper function to calculate next weekly expiry (next Friday)
const getNextWeeklyExpiry = () => {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 5 = Friday
    let daysUntilFriday = 5 - dayOfWeek;

    // If today is Friday, look at the time to determine if we should use today or next Friday
    if (daysUntilFriday === 0) {
        // If it's past 4 PM ET on Friday, use next Friday
        const currentHour = today.getHours();
        if (currentHour >= 16) {
            daysUntilFriday = 7;
        }
    } else if (daysUntilFriday < 0) {
        daysUntilFriday += 7;
    }

    const nextFriday = new Date(today);
    nextFriday.setDate(today.getDate() + daysUntilFriday);

    const yyyy = nextFriday.getFullYear();
    const mm = String(nextFriday.getMonth() + 1).padStart(2, '0');
    const dd = String(nextFriday.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

export default function OTMPremiumScanner({ compactMode = false }: OTMPremiumScannerProps) {
    const [otmResults, setOtmResults] = useState<PremiumImbalance[]>([]);
    const [otmLoading, setOtmLoading] = useState(false);
    const [otmSymbols] = useState(TOP_1000_SYMBOLS.join(','));
    const [otmLastUpdate, setOtmLastUpdate] = useState<Date | null>(null);
    const [otmScanProgress, setOtmScanProgress] = useState({ current: 0, total: 0 });
    const [otmScanningSymbol, setOtmScanningSymbol] = useState('');
    const [customTicker, setCustomTicker] = useState('');
    const [expiryType, setExpiryType] = useState<'weekly' | 'monthly'>('monthly');
    const otmEventSourceRef = useRef<EventSource | null>(null);

    // Calculate expiry based on selected type
    const otmExpiry = expiryType === 'monthly' ? getNextMonthlyExpiry() : getNextWeeklyExpiry();

    const scanOTMPremiums = async () => {
        setOtmLoading(true);
        setOtmResults([]);
        setOtmScanProgress({ current: 0, total: otmSymbols.split(',').length });

        if (otmEventSourceRef.current) {
            otmEventSourceRef.current.close();
        }

        try {
            const eventSource = new EventSource(`/api/scan-premium-stream?symbols=${encodeURIComponent(otmSymbols)}&expiry=${encodeURIComponent(otmExpiry)}`);
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
                } else if (data.type === 'error') {
                    console.error('OTM Scan error:', data.error);
                }
            };

            eventSource.onerror = () => {
                setOtmLoading(false);
                setOtmScanningSymbol('');
                eventSource.close();
            };

        } catch (error) {
            console.error('OTM Scan error:', error);
            setOtmLoading(false);
        }
    };

    const scanCustomTicker = async () => {
        if (!customTicker.trim()) return;

        setOtmLoading(true);
        setOtmResults([]);
        setOtmScanProgress({ current: 0, total: 1 });

        if (otmEventSourceRef.current) {
            otmEventSourceRef.current.close();
        }

        try {
            const eventSource = new EventSource(`/api/scan-premium-stream?symbols=${encodeURIComponent(customTicker.toUpperCase().trim())}&expiry=${encodeURIComponent(otmExpiry)}`);
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
                    setCustomTicker('');
                    eventSource.close();
                } else if (data.type === 'error') {
                    console.error('OTM Scan error:', data.error);
                }
            };

            eventSource.onerror = () => {
                setOtmLoading(false);
                setOtmScanningSymbol('');
                eventSource.close();
            };

        } catch (error) {
            console.error('OTM Scan error:', error);
            setOtmLoading(false);
        }
    };

    const formatExpiryDate = (dateStr: string) => {
        if (!dateStr) return '';
        const date = new Date(dateStr + 'T00:00:00');
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    return (
        <div className="bg-black text-white border border-gray-800">
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-950 via-red-950/20 to-green-950/20 border-b border-gray-800" style={{ padding: '16px 16px 5px 16px', height: '80px' }}>
                <div className="flex items-center justify-center gap-4" style={{ height: '100%' }}>
                    <h1 className="text-base font-bold text-center" style={{
                        background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FF8C00 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text'
                    }}>
                        OTM PREMIUM SCANNER
                    </h1>
                    {otmLoading && (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-900/50 border border-blue-500/30 rounded">
                            <div className="w-1 h-1 bg-blue-500 rounded-full animate-pulse"></div>
                            <span className="text-xs font-medium text-blue-400">SCANNING</span>
                        </div>
                    )}
                    {!otmLoading && otmResults.length > 0 && (
                        <div className="px-2 py-0.5 bg-slate-900/50 border border-gray-700 rounded">
                            <span className="text-xs text-gray-400">Results: </span>
                            <span className="text-xs font-bold text-white">{otmResults.length}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Control Bar */}
            <div className="bg-gradient-to-r from-slate-950 via-red-950/10 to-green-950/10 border-b border-gray-800 px-6 py-4">
                <div className="flex flex-wrap items-center gap-4">
                    <button
                        onClick={scanOTMPremiums}
                        disabled={otmLoading}
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white text-base font-semibold transition-colors rounded-lg disabled:opacity-50"
                    >
                        <RefreshCw className={`w-5 h-5 inline mr-2 ${otmLoading ? 'animate-spin' : ''}`} />
                        {otmLoading ? 'Scanning...' : 'Scan Now'}
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
                        disabled={otmLoading}
                        className="px-3 py-2 font-mono text-base font-bold rounded-lg disabled:opacity-50"
                        style={{
                            background: '#000',
                            color: '#ffffff',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            outline: 'none',
                            textTransform: 'uppercase',
                            letterSpacing: '0.1em',
                            width: '200px'
                        }}
                    />
                    <button
                        onClick={scanCustomTicker}
                        disabled={!customTicker.trim() || otmLoading}
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white text-base font-semibold transition-colors rounded-lg disabled:opacity-50"
                    >
                        SCAN
                    </button>
                </div>

                <div className="flex flex-wrap items-center gap-4 mt-4">
                    <div className="flex items-center gap-3 px-4 py-3 bg-slate-900 border border-gray-800 rounded-lg">
                        <span className="text-sm font-medium text-gray-400">Expiry:</span>
                        <select
                            value={expiryType}
                            onChange={(e) => setExpiryType(e.target.value as 'weekly' | 'monthly')}
                            disabled={otmLoading}
                            className="bg-slate-800 border-none text-sm font-bold text-white focus:outline-none disabled:opacity-50 px-2 py-1 rounded"
                        >
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                        </select>
                        <span className="text-base font-bold text-white">{formatExpiryDate(otmExpiry)}</span>
                    </div>

                    {otmLoading && (
                        <div className="flex-1 min-w-[200px]">
                            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                                <span>{otmScanningSymbol || 'Processing'}</span>
                                <span>{otmScanProgress.current} / {otmScanProgress.total}</span>
                            </div>
                            <div className="h-1 bg-slate-900 border border-gray-800 rounded overflow-hidden">
                                <div
                                    className="h-full bg-blue-500 transition-all"
                                    style={{ width: `${otmScanProgress.total > 0 ? (otmScanProgress.current / otmScanProgress.total) * 100 : 0}%` }}
                                />
                            </div>
                        </div>
                    )}

                    <div className="ml-auto flex items-center gap-3">
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-red-950/50 border border-red-900 rounded text-xs">
                            <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                            <span className="text-gray-400">Extreme</span>
                            <span className="text-white font-medium">{otmResults.filter(r => r.imbalanceSeverity === 'EXTREME').length}</span>
                        </div>
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-yellow-950/50 border border-yellow-900 rounded text-xs">
                            <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full"></div>
                            <span className="text-gray-400">High</span>
                            <span className="text-white font-medium">{otmResults.filter(r => r.imbalanceSeverity === 'HIGH').length}</span>
                        </div>
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-950/50 border border-blue-900 rounded text-xs">
                            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                            <span className="text-gray-400">Moderate</span>
                            <span className="text-white font-medium">{otmResults.filter(r => r.imbalanceSeverity === 'MODERATE').length}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Results */}
            <div className="space-y-3 px-3 md:px-6 py-3 md:py-6">
                {otmResults.length === 0 && !otmLoading && !otmLastUpdate && (
                    <div className="text-center py-16">
                        <div className="text-xl font-semibold text-gray-500">Click "Scan Now" to begin analysis</div>
                    </div>
                )}

                {otmResults.length === 0 && !otmLoading && otmLastUpdate && (
                    <div className="text-center py-16">
                        <div className="text-xl font-semibold text-gray-500">No results found</div>
                    </div>
                )}

                {otmResults.length === 0 && otmLoading && (
                    <div className="text-center py-8 md:py-16">
                        <RefreshCw className="w-6 h-6 md:w-8 md:h-8 text-white animate-spin mb-3 md:mb-4 mx-auto" />
                        <div className="text-white text-xs md:text-sm font-medium">Scanning TOP 1000 stocks for OTM premium imbalances...</div>
                        <div className="text-gray-400 text-xs mt-2">Finding calls above stock vs puts below stock imbalances</div>
                    </div>
                )}

                {otmResults.map((result, idx) => (
                    <div
                        key={`${result.symbol}-${idx}`}
                        className="bg-gradient-to-br from-gray-900 via-black to-gray-900 border-2 border-gray-700 rounded-xl p-4 md:p-6 hover:border-blue-500/50 transition-all duration-300 shadow-xl"
                    >
                        {/* Header Row */}
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <div className="text-2xl md:text-3xl font-black text-white mb-1">{result.symbol}</div>
                                <div className="text-xs text-white font-medium">${result.stockPrice.toFixed(2)}</div>
                            </div>
                            <div className={`px-3 py-1 text-xs font-black ${result.imbalanceSeverity === 'EXTREME'
                                ? 'bg-gradient-to-r from-red-500 to-red-400 text-white'
                                : result.imbalanceSeverity === 'HIGH'
                                    ? 'bg-gradient-to-r from-red-400 to-red-300 text-white'
                                    : 'bg-gradient-to-r from-yellow-500 to-yellow-400 text-black'
                                } rounded-lg`}>
                                {result.imbalanceSeverity}
                            </div>
                        </div>

                        {/* Strikes Info */}
                        <div className="text-center bg-gray-900/50 rounded-lg p-2 mb-4">
                            <div className="text-xs text-gray-300 font-bold mb-1">STRIKES</div>
                            <div className="text-white font-bold text-sm">${result.putStrike} / ${result.callStrike}</div>
                            <div className="text-xs text-gray-400 font-medium mt-0.5">({result.strikeSpacing} spacing)</div>
                        </div>

                        {/* Calls vs Puts */}
                        <div className="grid grid-cols-2 gap-2 mb-4">
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
                        <div className="grid grid-cols-2 gap-2 mb-4">
                            <div className="bg-gray-900/50 rounded-lg p-2 text-center">
                                <div className="text-xs text-gray-300 font-bold mb-1">DIFFERENCE</div>
                                <div className={`text-lg font-black ${result.premiumDifference > 0 ? 'text-green-300' : 'text-red-300'}`}>
                                    ${Math.abs(result.premiumDifference).toFixed(2)}
                                </div>
                            </div>

                            <div className="bg-gray-900/50 rounded-lg p-2 text-center">
                                <div className="text-xs text-gray-300 font-bold mb-1">IMBALANCE</div>
                                <div className={`text-2xl font-black ${result.imbalanceSeverity === 'EXTREME' ? 'text-red-500' :
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
                ))}
            </div>
        </div>
    );
}
