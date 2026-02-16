'use client';

import React, { useState } from 'react';
import OTMPremiumScanner from './OTMPremiumScanner';
import PivotScanner from './PivotScanner';
import AttractionZoneScanner from './AttractionZoneScanner';
import LiquidationScreener from './LiquidationScreener';
import RSScreener from '../RSScreener';
import HVScreener from '../HVScreener';
import LeadershipScan from '../LeadershipScan';
import { polygonService } from '../../lib/polygonService';

type ScreenerTab =
    | 'otm-premium'
    | 'pivot'
    | 'attraction'
    | 'liquidation'
    | 'rs-screener'
    | 'hv-screener'
    | 'leadership'
    | 'unified-search';

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
    };
}

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
    pricePosition: number;
    squeezeStatus: 'ON' | 'OFF';
    squeezeBarsCount: number;
    contractionPercent: number;
    qualifies?: boolean;
    failReason?: string;
    actualCompression?: number;
    requiredCompression?: number;
    isSideways?: boolean;
    netMovePercent?: number;
    isAtExtremes?: boolean;
    hasExpanded?: boolean;
}

interface UnifiedSearchResults {
    ticker: string;
    otmResults: PremiumImbalance[];
    attractionResults: GEXScreenerData[];
    pivotResults: ContractionResult[];
    rsResults: {
        breakouts: string[];
        rareLows: string[];
        breakdowns: string[];
    };
    hvResults: {
        hv10Day: boolean;
        hv20Day: boolean;
        hv52Week: boolean;
    };
    leadershipResults: {
        isLeader: boolean;
        timeframes: string[];
    };
    liquidationResults: {
        detected: boolean;
        mli?: number;
    };
}

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

const TABS = [
    { id: 'otm-premium' as const, label: 'OTM Premium', color: '#00d4ff' },
    { id: 'pivot' as const, label: 'Pivot Scanner', color: '#ff6b00' },
    { id: 'attraction' as const, label: 'Attraction Zones', color: '#9d4edd' },
    { id: 'liquidation' as const, label: 'Liquidation', color: '#ff073a' },
    { id: 'rs-screener' as const, label: 'Relative Strength', color: '#00ff88' },
    { id: 'hv-screener' as const, label: 'Historical Volatility', color: '#ffd700' },
    { id: 'leadership' as const, label: 'Leadership Scan', color: '#ff8c00' }
];

export default function UnifiedScreenerPanel() {
    const [activeTab, setActiveTab] = useState<ScreenerTab>('otm-premium');
    const [searchTicker, setSearchTicker] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<UnifiedSearchResults | null>(null);

    const scanAllScreeners = async (ticker: string) => {
        if (!ticker.trim()) return;

        setIsSearching(true);
        setActiveTab('unified-search');

        const symbol = ticker.toUpperCase().trim();
        const results: UnifiedSearchResults = {
            ticker: symbol,
            otmResults: [],
            attractionResults: [],
            pivotResults: [],
            rsResults: { breakouts: [], rareLows: [], breakdowns: [] },
            hvResults: { hv10Day: false, hv20Day: false, hv52Week: false },
            leadershipResults: { isLeader: false, timeframes: [] },
            liquidationResults: { detected: false }
        };

        try {
            // Scan OTM Premium Scanner
            try {
                const nextMonthExpiry = getNextMonthlyExpiry();
                await new Promise<void>((resolve) => {
                    const eventSource = new EventSource(`/api/scan-premium-stream?symbols=${encodeURIComponent(symbol)}&expiry=${encodeURIComponent(nextMonthExpiry)}`);

                    eventSource.onmessage = (event) => {
                        try {
                            const data = JSON.parse(event.data);
                            if (data.type === 'result' && data.result) {
                                results.otmResults.push(data.result);
                            } else if (data.type === 'complete') {
                                eventSource.close();
                                resolve();
                            } else if (data.type === 'error') {
                                eventSource.close();
                                resolve();
                            }
                        } catch (e) { }
                    };

                    eventSource.onerror = () => {
                        eventSource.close();
                        resolve();
                    };

                    setTimeout(() => {
                        eventSource.close();
                        resolve();
                    }, 10000);
                });
            } catch (err) { }

            // Scan Attraction Zones
            try {
                const response = await fetch(`/api/gex-screener?symbols=${encodeURIComponent(symbol)}&expirationFilter=Default`);
                if (response.ok) {
                    const data = await response.json();
                    if (data && data.success && Array.isArray(data.data)) {
                        results.attractionResults = data.data.map((item: any) => ({
                            ticker: item.ticker,
                            attractionLevel: item.attractionLevel,
                            currentPrice: item.currentPrice,
                            dealerSweat: item.dealerSweat,
                            netGex: item.netGex,
                            bias: item.dealerSweat > 0 ? 'Bullish' as const : 'Bearish' as const,
                            strength: item.gexImpactScore || 0,
                            volatility: Math.abs(item.netGex || 0) > 2 ? 'High' as const :
                                Math.abs(item.netGex || 0) > 0.5 ? 'Medium' as const : 'Low' as const,
                            range: item.currentPrice ? Math.abs(((item.attractionLevel - item.currentPrice) / item.currentPrice) * 100) : 0,
                            marketCap: item.marketCap,
                            gexImpactScore: item.gexImpactScore,
                            largestWall: item.largestWall
                        }));
                    }
                }
            } catch (err) { }

            // Scan RS Screener (8 lookback periods)
            const lookbackPeriods = [0.5, 1.0, 1.5, 2.0, 5.0, 10.0, 15.0, 20.0];
            const periodLabels = ['6M', '1Y', '18M', '2Y', '5Y', '10Y', '15Y', '20Y'];

            const rsPromises = lookbackPeriods.map(async (years, idx) => {
                try {
                    const endDate = new Date().toISOString().split('T')[0];
                    const startDate = new Date(Date.now() - years * 365.25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

                    const [symbolData, spyData] = await Promise.all([
                        polygonService.getHistoricalData(symbol, startDate, endDate, 'day', 1),
                        polygonService.getHistoricalData('SPY', startDate, endDate, 'day', 1)
                    ]);

                    if (symbolData && symbolData.results && symbolData.results.length > 0 &&
                        spyData && spyData.results && spyData.results.length > 0) {
                        const symbolReturn = ((symbolData.results[symbolData.results.length - 1].c - symbolData.results[0].c) / symbolData.results[0].c) * 100;
                        const spyReturn = ((spyData.results[spyData.results.length - 1].c - spyData.results[0].c) / spyData.results[0].c) * 100;
                        const outperformance = symbolReturn - spyReturn;

                        const allReturns = await Promise.all(
                            lookbackPeriods.map(async (y) => {
                                const sd = new Date(Date.now() - y * 365.25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                                const [sData, spData] = await Promise.all([
                                    polygonService.getHistoricalData(symbol, sd, endDate, 'day', 1),
                                    polygonService.getHistoricalData('SPY', sd, endDate, 'day', 1)
                                ]);
                                if (sData && sData.results && sData.results.length > 0 &&
                                    spData && spData.results && spData.results.length > 0) {
                                    const sRet = ((sData.results[sData.results.length - 1].c - sData.results[0].c) / sData.results[0].c) * 100;
                                    const spRet = ((spData.results[spData.results.length - 1].c - spData.results[0].c) / spData.results[0].c) * 100;
                                    return sRet - spRet;
                                }
                                return null;
                            })
                        );

                        const validReturns = allReturns.filter(r => r !== null) as number[];
                        if (validReturns.length > 0) {
                            validReturns.sort((a, b) => a - b);
                            const percentile = (validReturns.filter(r => r <= outperformance).length / validReturns.length) * 100;

                            const label = `${symbol} [${periodLabels[idx]}]`;
                            if (percentile >= 85) results.rsResults.breakouts.push(label);
                            if (percentile <= 25) results.rsResults.rareLows.push(label);
                            if (percentile <= 15) results.rsResults.breakdowns.push(label);
                        }
                    }
                } catch (err) { }
            });

            await Promise.all(rsPromises);

            // Scan HV Screener
            const calculateHV = (prices: number[], period: number): number => {
                if (prices.length < period + 1) return 0;
                const returns: number[] = [];
                for (let i = 1; i < prices.length; i++) {
                    if (prices[i - 1] !== 0) {
                        returns.push(Math.log(prices[i] / prices[i - 1]));
                    }
                }
                if (returns.length === 0) return 0;
                const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
                const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
                return Math.sqrt(variance) * Math.sqrt(252) * 100;
            };

            const hvPromises = [
                { days: 10, lookback: 90, key: 'hv10Day' as const },
                { days: 20, lookback: 365, key: 'hv20Day' as const },
                { days: 252, lookback: 1825, key: 'hv52Week' as const }
            ].map(async ({ days, lookback, key }) => {
                try {
                    const endDate = new Date().toISOString().split('T')[0];
                    const startDate = new Date(Date.now() - (lookback + days + 30) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                    const data = await polygonService.getHistoricalData(symbol, startDate, endDate, 'day', 1);

                    if (data?.results && data.results.length >= days + 10) {
                        const prices = data.results.map(r => r.c);
                        const hvValues: number[] = [];
                        for (let i = days; i < prices.length; i++) {
                            const periodPrices = prices.slice(i - days, i + 1);
                            const hv = calculateHV(periodPrices, days);
                            if (hv > 0) hvValues.push(hv);
                        }

                        if (hvValues.length > 0) {
                            const currentHV = hvValues[hvValues.length - 1];
                            const hvLow = Math.min(...hvValues);
                            const percentFromLow = hvLow > 0 ? ((currentHV - hvLow) / hvLow) * 100 : 0;
                            results.hvResults[key] = percentFromLow <= 20;
                        }
                    }
                } catch (err) { }
            });

            await Promise.all(hvPromises);

            // Scan Leadership
            const leadershipTimeframes = [0.5, 1.0, 2.0];
            const tfLabels = ['6M', '1Y', '2Y'];

            const leadershipPromises = leadershipTimeframes.map(async (years, idx) => {
                try {
                    const endDate = new Date().toISOString().split('T')[0];
                    const startDate = new Date(Date.now() - years * 365.25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                    const data = await polygonService.getHistoricalData(symbol, startDate, endDate, 'day', 1);

                    if (data?.results && data.results.length > 60) {
                        const prices = data.results.map(r => r.c);
                        const high52w = Math.max(...prices.slice(-252));
                        const currentPrice = prices[prices.length - 1];
                        const distanceFromHigh = ((high52w - currentPrice) / high52w) * 100;

                        if (distanceFromHigh <= 2) {
                            let daysBelow = 0;
                            for (let i = prices.length - 2; i >= 0; i--) {
                                if (prices[i] < high52w * 0.98) daysBelow++;
                                else break;
                            }

                            if (daysBelow >= 45) {
                                results.leadershipResults.isLeader = true;
                                results.leadershipResults.timeframes.push(`${symbol} [${tfLabels[idx]}]`);
                            }
                        }
                    }
                } catch (err) { }
            });

            await Promise.all(leadershipPromises);

            // Scan Liquidation
            try {
                const endDate = new Date().toISOString().split('T')[0];
                const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                const data = await polygonService.getHistoricalData(symbol, startDate, endDate, 'day', 1);

                if (data?.results && data.results.length >= 20) {
                    const prices = data.results.map(r => r.c);
                    const volumes = data.results.map(r => r.v || 0);

                    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
                    const recentVolume = volumes[volumes.length - 1];
                    const volumeRatio = avgVolume > 0 ? recentVolume / avgVolume : 0;

                    const recentReturn = prices.length >= 5 ? ((prices[prices.length - 1] - prices[prices.length - 5]) / prices[prices.length - 5]) * 100 : 0;

                    const mli = volumeRatio * Math.abs(recentReturn);

                    if (mli >= 2.0) {
                        results.liquidationResults.detected = true;
                        results.liquidationResults.mli = mli;
                    }
                }
            } catch (err) { }

            // Scan Pivot
            try {
                console.log(`[Unified] Pivot scan starting for ${symbol}`);
                await new Promise<void>((resolve) => {
                    const eventSource = new EventSource(`/api/scan-contractions-stream?symbols=${symbol}`);

                    eventSource.onmessage = (event) => {
                        try {
                            const data = JSON.parse(event.data);
                            console.log('[Unified] Pivot event:', data.type, data);

                            if (data.type === 'result' && data.result) {
                                results.pivotResults.push(data.result);
                                console.log('[Unified] Pivot result added:', data.result.symbol, data.result.period, 'qualifies:', data.result.qualifies);
                            } else if (data.type === 'complete') {
                                console.log('[Unified] Pivot scan complete');
                                eventSource.close();
                                resolve();
                            } else if (data.type === 'error') {
                                console.error('[Unified] Pivot scan error:', data.error);
                                eventSource.close();
                                resolve();
                            }
                        } catch (parseErr) {
                            console.error('[Unified] Pivot parse error:', parseErr);
                        }
                    };

                    eventSource.onerror = (err) => {
                        console.error('[Unified] Pivot EventSource error:', err);
                        eventSource.close();
                        resolve();
                    };

                    setTimeout(() => {
                        console.log('[Unified] Pivot scan timeout');
                        eventSource.close();
                        resolve();
                    }, 10000);
                });
            } catch (err) {
                console.error('[Unified] Pivot scan error:', err);
            }

            console.log('[Unified] Final results:', {
                ticker: results.ticker,
                otmCount: results.otmResults.length,
                attractionCount: results.attractionResults.length,
                pivotCount: results.pivotResults.length,
                rsBreakouts: results.rsResults.breakouts.length,
                rsRareLows: results.rsResults.rareLows.length,
                rsBreakdowns: results.rsResults.breakdowns.length,
                hv: results.hvResults,
                leadership: results.leadershipResults.isLeader,
                liquidation: results.liquidationResults.detected
            });

            setSearchResults(results);
        } catch (error) {
        } finally {
            setIsSearching(false);
        }
    };

    const renderScreener = () => {
        if (activeTab === 'unified-search') {
            return (
                <div style={{ padding: '20px', fontFamily: 'JetBrains Mono, monospace', background: '#000000' }}>
                    {isSearching ? (
                        <div style={{ textAlign: 'center', padding: '60px 0', color: '#ffffff' }}>
                            <div style={{ fontSize: '60px', marginBottom: '16px' }}>🔍</div>
                            <div style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>
                                SCANNING ALL SCREENERS
                            </div>
                            <div style={{ fontSize: '18px', color: '#ffffff' }}>
                                Analyzing {searchResults?.ticker || searchTicker} across 7 screeners...
                            </div>
                        </div>
                    ) : searchResults ? (
                        <div>
                            {/* Header */}
                            <div style={{
                                background: '#000000',
                                border: '3px solid #00d4ff',
                                borderRadius: '10px',
                                padding: '20px',
                                marginBottom: '20px',
                                textAlign: 'center'
                            }}>
                                <div style={{ fontSize: '42px', fontWeight: '800', color: '#00d4ff', marginBottom: '6px', letterSpacing: '2px' }}>
                                    {searchResults.ticker}
                                </div>
                                <div style={{ fontSize: '18px', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
                                    Multi-Screener Analysis Results
                                </div>
                            </div>

                            {/* Results Grid - 2 Columns */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px', alignItems: 'start' }}>

                                {/* OTM Premium Results */}
                                {searchResults.otmResults.length > 0 && (
                                    <div style={{
                                        background: '#0a0a0a',
                                        border: '3px solid #00d4ff',
                                        borderRadius: '10px',
                                        padding: '18px'
                                    }}>
                                        <div style={{ fontSize: '24px', fontWeight: '800', color: '#00d4ff', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
                                            💰 OTM PREMIUM IMBALANCE
                                        </div>
                                        {searchResults.otmResults.map((result, idx) => (
                                            <div key={idx} style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: idx < searchResults.otmResults.length - 1 ? '1px solid #333' : 'none' }}>
                                                <div style={{ fontSize: '19px', fontWeight: '700', color: '#00d4ff', marginBottom: '6px' }}>
                                                    {result.symbol} @ ${result.stockPrice.toFixed(2)}
                                                </div>
                                                <div style={{ fontSize: '16px', color: '#ffffff', lineHeight: '1.5' }}>
                                                    <div>Imbalance: <span style={{ color: result.imbalancePercent >= 75 ? '#ff073a' : result.imbalancePercent >= 50 ? '#ff6b00' : '#ffd700' }}>{result.imbalancePercent.toFixed(1)}%</span> ({result.imbalanceSeverity})</div>
                                                    <div>Expensive Side: <span style={{ color: result.expensiveSide === 'CALLS' ? '#00ff88' : '#ff073a' }}>{result.expensiveSide}</span></div>
                                                    <div>Premium Diff: ${Math.abs(result.premiumDifference).toFixed(2)}</div>
                                                    <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #222' }}>
                                                        <div>Call ${result.callStrike}: ${result.callMid.toFixed(2)} (spread: {result.callSpreadPercent.toFixed(1)}%)</div>
                                                        <div>Put ${result.putStrike}: ${result.putMid.toFixed(2)} (spread: {result.putSpreadPercent.toFixed(1)}%)</div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Attraction Zone Results */}
                                {searchResults.attractionResults.length > 0 && (
                                    <div style={{
                                        background: '#0a0a0a',
                                        border: '3px solid #9d4edd',
                                        borderRadius: '10px',
                                        padding: '18px'
                                    }}>
                                        <div style={{ fontSize: '24px', fontWeight: '800', color: '#9d4edd', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
                                            🧲 ATTRACTION ZONES (GEX)
                                        </div>
                                        {searchResults.attractionResults.map((result, idx) => (
                                            <div key={idx} style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: idx < searchResults.attractionResults.length - 1 ? '1px solid #333' : 'none' }}>
                                                <div style={{ fontSize: '19px', fontWeight: '700', color: '#9d4edd', marginBottom: '8px' }}>
                                                    {result.ticker} @ ${result.currentPrice.toFixed(2)}
                                                </div>
                                                <div style={{ fontSize: '16px', color: '#ffffff', lineHeight: '1.8' }}>
                                                    <div style={{ marginBottom: '4px' }}>Attraction Level: <span style={{ color: result.attractionLevel >= 7 ? '#ff073a' : result.attractionLevel >= 5 ? '#ff6b00' : '#ffd700' }}>{result.attractionLevel.toFixed(2)}</span></div>
                                                    <div style={{ marginBottom: '4px' }}>Dealer Sweat: <span style={{ color: result.dealerSweat >= 7 ? '#ff073a' : result.dealerSweat >= 5 ? '#ff6b00' : '#00ff88' }}>{result.dealerSweat.toFixed(2)}</span></div>
                                                    <div style={{ marginBottom: '4px' }}>Net GEX: {result.netGex >= 0 ? '+' : ''}{(result.netGex / 1e6).toFixed(2)}M</div>
                                                    <div style={{ marginBottom: '4px' }}>Bias: <span style={{ color: result.bias === 'Bullish' ? '#00ff88' : '#ff073a' }}>{result.bias}</span></div>
                                                    <div style={{ marginBottom: '4px' }}>Strength: {result.strength.toFixed(2)}</div>
                                                    <div style={{ marginBottom: '4px' }}>Volatility: {result.volatility}</div>
                                                    {result.largestWall && (
                                                        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #222' }}>
                                                            <div style={{ marginBottom: '4px' }}>Largest Wall: ${result.largestWall.strike} ({result.largestWall.type})</div>
                                                            <div style={{ marginBottom: '4px' }}>Wall GEX: {(result.largestWall.gex / 1e6).toFixed(2)}M</div>
                                                            <div>Pressure: {result.largestWall.pressure.toFixed(2)}</div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Pivot Scanner Results */}
                                {searchResults.pivotResults.length > 0 && (
                                    <div style={{
                                        background: '#0a0a0a',
                                        border: '3px solid #ff6b00',
                                        borderRadius: '10px',
                                        padding: '18px'
                                    }}>
                                        <div style={{ fontSize: '24px', fontWeight: '800', color: '#ff6b00', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
                                            🔄 PIVOT SCANNER (CONSOLIDATION)
                                        </div>
                                        {searchResults.pivotResults.map((result, idx) => (
                                            <div key={idx} style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: idx < searchResults.pivotResults.length - 1 ? '1px solid #333' : 'none' }}>
                                                <div style={{ fontSize: '19px', fontWeight: '700', color: '#ff6b00', marginBottom: '6px' }}>
                                                    {result.symbol} [{result.period}] @ ${result.currentPrice.toFixed(2)}
                                                </div>
                                                <div style={{ fontSize: '16px', color: '#ffffff', lineHeight: '1.5' }}>
                                                    <div>Status: <span style={{ color: result.qualifies ? '#00ff88' : '#ff073a' }}>{result.qualifies ? '✓ QUALIFIED' : '✗ NOT QUALIFIED'}</span></div>
                                                    <div>Compression: <span style={{ color: result.contractionPercent >= 40 ? '#00ff88' : result.contractionPercent >= 30 ? '#ffd700' : '#ffffff' }}>{result.contractionPercent.toFixed(1)}%</span></div>
                                                    <div>Contraction Level: <span style={{ color: result.contractionLevel === 'EXTREME' ? '#ff073a' : result.contractionLevel === 'HIGH' ? '#ff6b00' : '#ffd700' }}>{result.contractionLevel}</span></div>
                                                    <div>Squeeze: <span style={{ color: result.squeezeStatus === 'ON' ? '#00ff88' : '#ffffff' }}>{result.squeezeStatus}</span></div>
                                                    <div>Price Position: {result.pricePosition.toFixed(1)}%</div>
                                                    <div>ATR: ${result.atr.toFixed(2)}</div>
                                                    {!result.qualifies && result.failReason && (
                                                        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #222', color: '#ff073a' }}>
                                                            Fail Reason: {result.failReason}
                                                        </div>
                                                    )}
                                                    {result.isSideways !== undefined && (
                                                        <div style={{ marginTop: '8px', fontSize: '15px', color: '#ffffff' }}>
                                                            <div>Sideways: {result.isSideways ? 'YES' : 'NO'}</div>
                                                            {result.netMovePercent !== undefined && <div>Net Move: {result.netMovePercent.toFixed(1)}%</div>}
                                                            {result.isAtExtremes !== undefined && <div>At Extremes: {result.isAtExtremes ? 'YES' : 'NO'}</div>}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* RS Screener Results */}
                                {(searchResults.rsResults.breakouts.length > 0 || searchResults.rsResults.rareLows.length > 0 || searchResults.rsResults.breakdowns.length > 0) && (
                                    <div style={{
                                        background: '#0a0a0a',
                                        border: '3px solid #00ff88',
                                        borderRadius: '10px',
                                        padding: '18px'
                                    }}>
                                        <div style={{ fontSize: '24px', fontWeight: '800', color: '#00ff88', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
                                            📊 RELATIVE STRENGTH
                                        </div>
                                        {searchResults.rsResults.breakouts.length > 0 && (
                                            <div style={{ marginBottom: '10px' }}>
                                                <div style={{ fontSize: '18px', color: '#00ff88', fontWeight: '700', marginBottom: '6px' }}>✓ BREAKOUTS (85th+ Percentile)</div>
                                                {searchResults.rsResults.breakouts.map(item => (
                                                    <div key={item} style={{ fontSize: '16px', color: '#ffffff', marginLeft: '12px', marginBottom: '4px' }}>• {item}</div>
                                                ))}
                                            </div>
                                        )}
                                        {searchResults.rsResults.rareLows.length > 0 && (
                                            <div style={{ marginBottom: '10px' }}>
                                                <div style={{ fontSize: '18px', color: '#ffd700', fontWeight: '700', marginBottom: '6px' }}>✓ RARE LOWS (15-25th Percentile)</div>
                                                {searchResults.rsResults.rareLows.map(item => (
                                                    <div key={item} style={{ fontSize: '16px', color: '#ffffff', marginLeft: '12px', marginBottom: '4px' }}>• {item}</div>
                                                ))}
                                            </div>
                                        )}
                                        {searchResults.rsResults.breakdowns.length > 0 && (
                                            <div style={{ marginBottom: '10px' }}>
                                                <div style={{ fontSize: '18px', color: '#ff073a', fontWeight: '700', marginBottom: '6px' }}>✓ BREAKDOWNS (&lt;15th Percentile)</div>
                                                {searchResults.rsResults.breakdowns.map(item => (
                                                    <div key={item} style={{ fontSize: '16px', color: '#ffffff', marginLeft: '12px', marginBottom: '4px' }}>• {item}</div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* HV Screener Results */}
                                {(searchResults.hvResults.hv10Day || searchResults.hvResults.hv20Day || searchResults.hvResults.hv52Week) && (
                                    <div style={{
                                        background: '#0a0a0a',
                                        border: '3px solid #ffd700',
                                        borderRadius: '10px',
                                        padding: '18px'
                                    }}>
                                        <div style={{ fontSize: '24px', fontWeight: '800', color: '#ffd700', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
                                            📉 HISTORICAL VOLATILITY (NEAR LOWS)
                                        </div>
                                        <div style={{ fontSize: '16px', color: '#ffffff', lineHeight: '1.6' }}>
                                            {searchResults.hvResults.hv10Day && (
                                                <div style={{ color: '#00ff88', fontWeight: '700' }}>✓ 10-Day HV Near Low (≤20% from low)</div>
                                            )}
                                            {searchResults.hvResults.hv20Day && (
                                                <div style={{ color: '#00ff88', fontWeight: '700' }}>✓ 20-Day HV Near Low (≤20% from low)</div>
                                            )}
                                            {searchResults.hvResults.hv52Week && (
                                                <div style={{ color: '#00ff88', fontWeight: '700' }}>✓ 52-Week HV Near Low (≤20% from low)</div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Leadership Scan Results */}
                                {searchResults.leadershipResults.isLeader && (
                                    <div style={{
                                        background: '#0a0a0a',
                                        border: '3px solid #ff8c00',
                                        borderRadius: '10px',
                                        padding: '18px'
                                    }}>
                                        <div style={{ fontSize: '24px', fontWeight: '800', color: '#ff8c00', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
                                            👑 LEADERSHIP BREAKOUT
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '18px', color: '#00ff88', fontWeight: '700', marginBottom: '6px' }}>✓ LEADERSHIP DETECTED (45+ day consolidation breakout)</div>
                                            {searchResults.leadershipResults.timeframes.map(tf => (
                                                <div key={tf} style={{ fontSize: '16px', color: '#ffffff', marginLeft: '12px', marginBottom: '4px' }}>• {tf}</div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Liquidation Results */}
                                {searchResults.liquidationResults.detected && (
                                    <div style={{
                                        background: '#0a0a0a',
                                        border: '3px solid #ff073a',
                                        borderRadius: '10px',
                                        padding: '18px'
                                    }}>
                                        <div style={{ fontSize: '24px', fontWeight: '800', color: '#ff073a', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
                                            💥 MASS LIQUIDATION EVENT
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '18px', color: '#ff073a', fontWeight: '700', marginBottom: '6px' }}>
                                                ✓ LIQUIDATION DETECTED
                                            </div>
                                            {searchResults.liquidationResults.mli && (
                                                <div style={{ fontSize: '16px', color: '#ffffff', marginLeft: '12px' }}>
                                                    Mass Liquidation Index (MLI): <span style={{ fontWeight: '700', color: searchResults.liquidationResults.mli >= 5 ? '#ff073a' : searchResults.liquidationResults.mli >= 3 ? '#ff6b00' : '#ffd700' }}>{searchResults.liquidationResults.mli.toFixed(2)}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* No Results Message */}
                                {searchResults.otmResults.length === 0 &&
                                    searchResults.attractionResults.length === 0 &&
                                    searchResults.pivotResults.length === 0 &&
                                    searchResults.rsResults.breakouts.length === 0 &&
                                    searchResults.rsResults.rareLows.length === 0 &&
                                    searchResults.rsResults.breakdowns.length === 0 &&
                                    !searchResults.hvResults.hv10Day &&
                                    !searchResults.hvResults.hv20Day &&
                                    !searchResults.hvResults.hv52Week &&
                                    !searchResults.leadershipResults.isLeader &&
                                    !searchResults.liquidationResults.detected && (
                                        <div style={{ textAlign: 'center', padding: '60px 0', color: '#ffffff', gridColumn: '1 / -1' }}>
                                            <div style={{ fontSize: '32px', marginBottom: '12px' }}>📊</div>
                                            <div style={{ fontSize: '20px', fontWeight: '700' }}>
                                                No qualifying signals detected for {searchResults.ticker}
                                            </div>
                                            <div style={{ fontSize: '16px', marginTop: '8px', color: '#ffffff' }}>
                                                This ticker did not meet the criteria for any of the 7 screeners
                                            </div>
                                        </div>
                                    )}
                            </div>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '80px 0', color: '#ffffff' }}>
                            <div style={{ fontSize: '60px', marginBottom: '18px' }}>🔍</div>
                            <div style={{ fontSize: '22px', fontWeight: '700' }}>
                                Enter a ticker above to scan all screeners
                            </div>
                        </div>
                    )}
                </div>
            );
        }

        switch (activeTab) {
            case 'otm-premium':
                return <OTMPremiumScanner />;
            case 'pivot':
                return <PivotScanner />;
            case 'attraction':
                return <AttractionZoneScanner />;
            case 'liquidation':
                return <LiquidationScreener />;
            case 'rs-screener':
                return <RSScreener />;
            case 'hv-screener':
                return <HVScreener />;
            case 'leadership':
                return <LeadershipScan />;
            default:
                return null;
        }
    };

    return (
        <div style={{
            background: 'rgba(0, 0, 0, 0.95)',
            borderRadius: '0px',
            border: '1px solid #333',
            overflow: 'hidden'
        }}>
            {/* Unified Search Bar */}
            <div style={{
                background: 'linear-gradient(135deg, #0a0a0a, #000000)',
                borderBottom: '2px solid #00d4ff',
                padding: '20px 30px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
            }}>
                <div style={{
                    fontSize: '20px',
                    fontWeight: '800',
                    color: '#00d4ff',
                    fontFamily: 'JetBrains Mono, monospace',
                    letterSpacing: '1px',
                    textShadow: '0 0 10px rgba(0, 212, 255, 0.4)',
                    marginRight: '20px'
                }}>
                    🔍 UNIFIED SCAN
                </div>
                <input
                    type="text"
                    value={searchTicker}
                    onChange={(e) => setSearchTicker(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            scanAllScreeners(searchTicker);
                        }
                    }}
                    placeholder="ENTER TICKER TO SCAN ALL SCREENERS"
                    style={{
                        flex: 1,
                        background: '#000000',
                        border: '2px solid #333333',
                        borderRadius: '8px',
                        color: '#ffffff',
                        padding: '14px 20px',
                        fontSize: '15px',
                        fontWeight: '700',
                        fontFamily: 'JetBrains Mono, monospace',
                        outline: 'none',
                        textTransform: 'uppercase',
                        letterSpacing: '1px',
                        boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.6)',
                        transition: 'all 0.3s ease'
                    }}
                    onFocus={(e) => {
                        e.currentTarget.style.borderColor = '#00d4ff';
                        e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.6), 0 0 12px rgba(0, 212, 255, 0.3)';
                    }}
                    onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#333333';
                        e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.6)';
                    }}
                />
                <button
                    onClick={() => scanAllScreeners(searchTicker)}
                    disabled={isSearching || !searchTicker.trim()}
                    style={{
                        background: isSearching
                            ? 'linear-gradient(135deg, #666666, #444444)'
                            : 'linear-gradient(135deg, #00d4ff, #0099cc)',
                        border: 'none',
                        borderRadius: '8px',
                        color: '#000000',
                        padding: '14px 32px',
                        fontSize: '15px',
                        fontWeight: '800',
                        fontFamily: 'JetBrains Mono, monospace',
                        cursor: isSearching || !searchTicker.trim() ? 'not-allowed' : 'pointer',
                        textTransform: 'uppercase',
                        letterSpacing: '1px',
                        boxShadow: isSearching
                            ? 'none'
                            : '0 4px 12px rgba(0, 212, 255, 0.4)',
                        transition: 'all 0.3s ease',
                        opacity: isSearching || !searchTicker.trim() ? 0.5 : 1
                    }}
                    onMouseEnter={(e) => {
                        if (!isSearching && searchTicker.trim()) {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 212, 255, 0.5)';
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (!isSearching && searchTicker.trim()) {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 212, 255, 0.4)';
                        }
                    }}
                >
                    {isSearching ? 'SCANNING...' : 'SCAN ALL'}
                </button>
            </div>

            {/* Tab Navigation */}
            <div style={{
                display: 'flex',
                flexDirection: 'row',
                background: 'linear-gradient(180deg, #0a0a0a 0%, #000000 100%)',
                borderBottom: '2px solid #1a1a1a',
                overflowX: 'auto',
                overflowY: 'hidden',
                scrollbarWidth: 'thin',
                scrollbarColor: '#333 #000'
            }}>
                {TABS.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                flex: '1 0 auto',
                                minWidth: '140px',
                                padding: '16px 20px',
                                background: isActive
                                    ? `linear-gradient(180deg, ${tab.color}15 0%, ${tab.color}08 100%)`
                                    : 'transparent',
                                border: 'none',
                                borderBottom: isActive ? `3px solid ${tab.color}` : '3px solid transparent',
                                color: isActive ? tab.color : '#ffffff',
                                fontSize: '16px',
                                fontWeight: isActive ? '800' : '600',
                                fontFamily: 'JetBrains Mono, monospace',
                                textTransform: 'uppercase',
                                letterSpacing: '1px',
                                cursor: 'pointer',
                                transition: 'all 0.3s ease',
                                position: 'relative',
                                textShadow: isActive ? `0 0 10px ${tab.color}40` : 'none',
                                whiteSpace: 'nowrap'
                            }}
                            onMouseEnter={(e) => {
                                if (!isActive) {
                                    e.currentTarget.style.color = '#ffffff';
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isActive) {
                                    e.currentTarget.style.color = '#ffffff';
                                    e.currentTarget.style.background = 'transparent';
                                }
                            }}
                        >
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Screener Content */}
            <div style={{
                background: '#000000',
                minHeight: '600px'
            }}>
                {renderScreener()}
            </div>
        </div>
    );
}
