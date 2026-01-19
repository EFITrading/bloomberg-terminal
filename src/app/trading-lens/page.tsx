'use client';

import React, { useState, useRef, useEffect } from 'react';

type IVDataPoint = {
    date: string;
    callIV: number;
    putIV: number;
    netIV: number;
    ivRank: number;
    ivPercentile: number;
    price: number;
};

type IVChartsPanelProps = {
    data: IVDataPoint[];
    ticker: string;
    period: '1Y' | '2Y' | '5Y';
    onPeriodChange: (period: '1Y' | '2Y' | '5Y') => void;
    isScanning: boolean;
};

export default function TradingLensPage() {
    const [tickerInput, setTickerInput] = useState('');
    const [timeframe, setTimeframe] = useState<'1D' | '3D'>('1D');
    const [isScanning, setIsScanning] = useState(false);
    const [ivData, setIvData] = useState<IVDataPoint[]>([]);
    const [ivPeriod, setIvPeriod] = useState<'1Y' | '2Y' | '5Y'>('1Y');
    const [currentTicker, setCurrentTicker] = useState('');
    const [ivDataCache, setIvDataCache] = useState<Record<string, Record<string, IVDataPoint[]>>>({});
    const [optionsFlowData, setOptionsFlowData] = useState<any[]>([]);

    // Build a Trade analysis state
    const [rsSignals, setRsSignals] = useState<{ breakout: boolean; rareLow: boolean; breakdown: boolean; classification: string | null; percentile: number; currentPrice: number; priceChange: number; priceChangePercent: number }>({ breakout: false, rareLow: false, breakdown: false, classification: null, percentile: 0, currentPrice: 0, priceChange: 0, priceChangePercent: 0 });
    const [leadershipSignal, setLeadershipSignal] = useState<{ isLeader: boolean; breakoutType: string | null; classification: string | null; leadershipScore: number; currentPrice: number; priceChange: number; priceChangePercent: number; volumeRatio: number; daysSinceLastHigh: number; highDistance: number; trend?: string; currentVolume?: number; avgVolume?: number } | null>(null);

    // Expected Range state
    const [expectedRangeLevels, setExpectedRangeLevels] = useState<any>(null);
    const [isLoadingExpectedRange, setIsLoadingExpectedRange] = useState(false);

    const fetchIVData = async (ticker: string, period: '1Y' | '2Y' | '5Y') => {
        const days = period === '1Y' ? 365 : period === '2Y' ? 730 : 1825;

        try {
            const response = await fetch(`/api/calculate-historical-iv?ticker=${ticker}&days=${days}`);

            if (response.ok) {
                const result = await response.json();
                if (result.success && result.data?.history?.length > 0) {
                    const history = result.data.history;

                    const ivValues = history
                        .map((h: any) => (h.callIV && h.putIV) ? (h.callIV + h.putIV) / 2 : null)
                        .filter((v: any) => v !== null);
                    const minIV = Math.min(...ivValues);
                    const maxIV = Math.max(...ivValues);

                    const chartData = history.map((h: any) => {
                        const netIV = (h.callIV && h.putIV) ? (h.callIV + h.putIV) / 2 : 0;
                        const ivRank = netIV && maxIV !== minIV ? ((netIV - minIV) / (maxIV - minIV)) * 100 : 0;
                        const ivPercentile = netIV ? (ivValues.filter((v: number) => v <= netIV).length / ivValues.length) * 100 : 0;

                        return {
                            date: h.date,
                            callIV: h.callIV || 0,
                            putIV: h.putIV || 0,
                            netIV,
                            ivRank,
                            ivPercentile,
                            price: h.price || 0
                        };
                    });

                    return chartData;
                }
            }
        } catch (error) {
            console.error('Failed to fetch IV data:', error);
        }
        return null;
    };

    const handlePeriodChange = async (newPeriod: '1Y' | '2Y' | '5Y') => {
        if (!currentTicker) return;

        setIvPeriod(newPeriod);

        // Check if data is cached
        if (ivDataCache[currentTicker]?.[newPeriod]) {
            setIvData(ivDataCache[currentTicker][newPeriod]);
            return;
        }

        // Fetch new data
        setIsScanning(true);
        const data = await fetchIVData(currentTicker, newPeriod);
        setIsScanning(false);

        if (data) {
            setIvData(data);
            setIvDataCache(prev => ({
                ...prev,
                [currentTicker]: {
                    ...prev[currentTicker],
                    [newPeriod]: data
                }
            }));
        }
    };

    const handleAnalyze = async () => {
        if (!tickerInput.trim()) return;

        setIsScanning(true);
        setIvData([]);
        setOptionsFlowData([]);
        setCurrentTicker(tickerInput);

        // Clear RS and Leadership signals immediately when new ticker is searched
        setRsSignals({ breakout: false, rareLow: false, breakdown: false, classification: null, percentile: 0, currentPrice: 0, priceChange: 0, priceChangePercent: 0 });
        setLeadershipSignal(null);

        // Always fetch fresh IV data to show loading state, don't use cache during initial scan
        const data = await fetchIVData(tickerInput, ivPeriod);
        if (data) {
            setIvData(data);
            setIvDataCache(prev => ({
                ...prev,
                [tickerInput]: {
                    ...prev[tickerInput],
                    [ivPeriod]: data
                }
            }));
        }

        // Fetch options flow data after IV data
        try {
            const flowResponse = await fetch(`/api/efi-with-positioning?ticker=${tickerInput}`);
            if (flowResponse.ok) {
                const flowResult = await flowResponse.json();
                if (flowResult.trades && flowResult.trades.length > 0) {
                    setOptionsFlowData(flowResult.trades);
                }
            }
        } catch (error) {
            console.error('Failed to fetch options flow:', error);
        }

        // Fetch RS and Leadership signals
        checkRSSignals(tickerInput);
        checkLeadershipSignals(tickerInput);

        setIsScanning(false);
    };

    // Check RS Signals
    const checkRSSignals = async (ticker: string) => {
        try {
            const endDate = new Date().toISOString().split('T')[0];
            const startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            const [tickerResp, spyResp] = await Promise.all([
                fetch(`https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${startDate}/${endDate}?adjusted=true&sort=asc&apiKey=kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf`),
                fetch(`https://api.polygon.io/v2/aggs/ticker/SPY/range/1/day/${startDate}/${endDate}?adjusted=true&sort=asc&apiKey=kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf`)
            ]);

            if (!tickerResp.ok || !spyResp.ok) return;

            const tickerData = await tickerResp.json();
            const spyData = await spyResp.json();

            if (!tickerData.results || !spyData.results) return;

            const rsRatios: number[] = [];
            const minLength = Math.min(tickerData.results.length, spyData.results.length);
            for (let i = 0; i < minLength; i++) {
                const tickerPrice = tickerData.results[i].c;
                const spyPrice = spyData.results[i].c;
                if (tickerPrice && spyPrice && spyPrice !== 0) {
                    rsRatios.push(tickerPrice / spyPrice);
                }
            }

            if (rsRatios.length < 50) return;

            const currentRS = rsRatios[rsRatios.length - 1];
            const rsHigh = Math.max(...rsRatios);
            const rsLow = Math.min(...rsRatios);
            const rsSMA50 = rsRatios.slice(-50).reduce((a, b) => a + b, 0) / 50;
            const percentile = ((currentRS - rsLow) / (rsHigh - rsLow)) * 100;

            const latest = tickerData.results[tickerData.results.length - 1];
            const previous = tickerData.results[tickerData.results.length - 2];

            setRsSignals({
                breakout: currentRS >= rsHigh * 0.97 && percentile >= 85,
                rareLow: percentile <= 25 && currentRS >= rsSMA50,
                breakdown: currentRS <= rsLow * 1.03 && percentile <= 15,
                classification: percentile >= 85 ? 'Leader' : percentile >= 50 ? 'Above Average' : percentile >= 25 ? 'Below Average' : 'Laggard',
                percentile,
                currentPrice: latest.c,
                priceChange: latest.c - previous.c,
                priceChangePercent: ((latest.c - previous.c) / previous.c) * 100
            });
        } catch (error) {
            console.error('RS check failed:', error);
        }
    };

    // Check Leadership Signals
    const checkLeadershipSignals = async (ticker: string) => {
        try {
            const endDate = new Date().toISOString().split('T')[0];
            const startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const response = await fetch(`https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${startDate}/${endDate}?adjusted=true&sort=asc&apiKey=kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf`);
            if (!response.ok) {
                setLeadershipSignal(null);
                return;
            }
            const data = await response.json();
            if (!data.results || data.results.length < 50) {
                setLeadershipSignal(null);
                return;
            }

            const prices = data.results.map((r: any) => r.c);
            const volumes = data.results.map((r: any) => r.v);
            const highs = data.results.map((r: any) => r.h);

            const currentPrice = prices[prices.length - 1];
            const previousPrice = prices[prices.length - 2];
            const priceChange = currentPrice - previousPrice;
            const priceChangePercent = (priceChange / previousPrice) * 100;

            // Calculate 52-week high and ALL-TIME high
            const weekHigh52 = Math.max(...highs);
            const allTimeHighInData = Math.max(...highs);
            const highDistance = ((currentPrice - weekHigh52) / weekHigh52) * 100;

            // FRESH BREAKOUT DETECTION
            const minDaysBelow = 45;
            let isNewBreakout = false;
            let breakoutType: 'Fresh 52W High' | 'All-Time High' | 'Near High' = 'Near High';
            let daysSinceLastHigh = 0;

            const isReachingATH = currentPrice >= allTimeHighInData * 0.99;
            const isReaching52WHigh = currentPrice >= weekHigh52 * 0.99;

            if (isReachingATH || isReaching52WHigh) {
                let wasBelow = true;

                for (let i = highs.length - 2; i >= Math.max(0, highs.length - 90); i--) {
                    const pastHigh = highs[i];
                    const daysAgo = highs.length - 1 - i;

                    if (pastHigh >= weekHigh52 * 0.99) {
                        if (daysAgo <= minDaysBelow) {
                            wasBelow = false;
                            break;
                        } else {
                            daysSinceLastHigh = daysAgo;
                            break;
                        }
                    }
                }

                if (daysSinceLastHigh === 0) {
                    daysSinceLastHigh = 90;
                }

                if (wasBelow && daysSinceLastHigh >= minDaysBelow) {
                    isNewBreakout = true;

                    if (currentPrice >= allTimeHighInData * 0.99) {
                        breakoutType = 'All-Time High';
                    } else {
                        breakoutType = 'Fresh 52W High';
                    }
                }
            }

            // Only process stocks that are fresh breakouts
            if (!isNewBreakout) {
                setLeadershipSignal(null);
                return;
            }

            // Volume analysis
            const currentVolume = volumes[volumes.length - 1];
            const avgVolume = volumes.slice(-20).reduce((a: number, b: number) => a + b, 0) / 20;
            const volumeRatio = currentVolume / avgVolume;

            // Moving averages
            const ma20 = prices.slice(-20).reduce((a: number, b: number) => a + b, 0) / 20;
            const ma50 = prices.slice(-50).reduce((a: number, b: number) => a + b, 0) / 50;
            const ma200 = prices.slice(-200).reduce((a: number, b: number) => a + b, 0) / 200;

            // Trend Analysis
            const shortTermTrend = currentPrice > ma20 && ma20 > ma50;
            const longTermTrend = ma50 > ma200;
            const priceAboveMA = currentPrice > ma20 && currentPrice > ma50 && currentPrice > ma200;

            let trend: string;
            let trendStrength = 0;

            if (priceAboveMA && shortTermTrend && longTermTrend) {
                trend = 'Strong Uptrend';
                trendStrength = 90;
            } else if (priceAboveMA && shortTermTrend) {
                trend = 'Moderate Uptrend';
                trendStrength = 70;
            } else if (currentPrice > ma20) {
                trend = 'Consolidating';
                trendStrength = 50;
            } else {
                trend = 'Weakening';
                trendStrength = 30;
            }

            // Enhanced Leadership Score for Fresh Breakouts
            const breakoutScore = breakoutType === 'All-Time High' ? 40 : 35;
            const volumeScore = volumeRatio >= 2.0 ? 30 : volumeRatio >= 1.5 ? 20 : 10;
            const maScore = priceAboveMA ? 20 : currentPrice > ma20 ? 10 : 0;
            const momentumScore = priceChangePercent >= 3 ? 15 : priceChangePercent >= 1 ? 10 : 5;

            const leadershipScore = breakoutScore + volumeScore + maScore + momentumScore;

            // Classification for Breakout Stocks
            let classification: string;
            if (leadershipScore >= 90 && breakoutType === 'All-Time High') {
                classification = 'Market Leader';
            } else if (leadershipScore >= 80) {
                classification = 'Sector Leader';
            } else if (leadershipScore >= 70) {
                classification = 'Emerging Leader';
            } else {
                classification = 'Momentum Play';
            }

            // Higher threshold for fresh breakouts - we want quality
            if (leadershipScore >= 70 && volumeRatio >= 1.2) {
                setLeadershipSignal({
                    isLeader: true,
                    breakoutType,
                    classification,
                    leadershipScore,
                    currentPrice,
                    priceChange,
                    priceChangePercent,
                    volumeRatio,
                    daysSinceLastHigh,
                    highDistance,
                    trend,
                    currentVolume,
                    avgVolume
                });
            } else {
                setLeadershipSignal(null);
            }
        } catch (error) {
            console.error('Leadership check failed:', error);
            setLeadershipSignal(null);
        }
    };

    // EXACT SAME LOGIC FROM EFI CHARTING - Expected Range Calculations
    const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
    const riskFreeRate = 0.0387;

    // Normal CDF for Black-Scholes
    const normalCDF = (x: number): number => {
        const erf = (x: number): number => {
            const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
            const sign = x >= 0 ? 1 : -1;
            x = Math.abs(x);
            const t = 1.0 / (1.0 + p * x);
            const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
            return sign * y;
        };
        return 0.5 * (1 + erf(x / Math.sqrt(2)));
    };

    const calculateD2 = (currentPrice: number, strikePrice: number, riskFreeRate: number, volatility: number, timeToExpiry: number): number => {
        const d1 = (Math.log(currentPrice / strikePrice) + (riskFreeRate + 0.5 * volatility * volatility) * timeToExpiry) / (volatility * Math.sqrt(timeToExpiry));
        return d1 - volatility * Math.sqrt(timeToExpiry);
    };

    const chanceOfProfitSellCall = (currentPrice: number, strikePrice: number, riskFreeRate: number, volatility: number, timeToExpiry: number): number => {
        const d2 = calculateD2(currentPrice, strikePrice, riskFreeRate, volatility, timeToExpiry);
        return (1 - normalCDF(d2)) * 100;
    };

    const chanceOfProfitSellPut = (currentPrice: number, strikePrice: number, riskFreeRate: number, volatility: number, timeToExpiry: number): number => {
        const d2 = calculateD2(currentPrice, strikePrice, riskFreeRate, volatility, timeToExpiry);
        return normalCDF(d2) * 100;
    };

    const findStrikeForProbability = (S: number, r: number, sigma: number, T: number, targetProb: number, isCall: boolean): number => {
        if (isCall) {
            let low = S + 0.01, high = S * 1.50;
            for (let i = 0; i < 50; i++) {
                const mid = (low + high) / 2;
                const prob = chanceOfProfitSellCall(S, mid, r, sigma, T);
                if (Math.abs(prob - targetProb) < 0.1) return mid;
                if (prob < targetProb) low = mid;
                else high = mid;
            }
            return (low + high) / 2;
        } else {
            let low = S * 0.50, high = S - 0.01;
            for (let i = 0; i < 50; i++) {
                const mid = (low + high) / 2;
                const prob = chanceOfProfitSellPut(S, mid, r, sigma, T);
                if (Math.abs(prob - targetProb) < 0.1) return mid;
                if (prob < targetProb) high = mid;
                else low = mid;
            }
            return (low + high) / 2;
        }
    };

    // Calculate Expected Range for ticker
    const calculateExpectedRange = async (ticker: string) => {
        try {
            setIsLoadingExpectedRange(true);
            
            // Import expiration utils dynamically
            const { getExpirationDatesFromAPI, getDaysUntilExpiration } = await import('@/lib/optionsExpirationUtils');
            
            // Get current stock price
            const stockResponse = await fetch(`https://api.polygon.io/v2/last/trade/${ticker}?apikey=${POLYGON_API_KEY}`);
            if (!stockResponse.ok) throw new Error('Failed to fetch stock data');
            const stockData = await stockResponse.json();
            const currentPrice = stockData.results.p;

            const lowerBound = currentPrice * 0.80;
            const upperBound = currentPrice * 1.20;

            // Get expiration dates
            const { weeklyExpiry, monthlyExpiry, weeklyDate, monthlyDate } = await getExpirationDatesFromAPI(ticker);
            const weeklyDTE = Math.max(1, getDaysUntilExpiration(weeklyDate));
            const monthlyDTE = Math.max(1, getDaysUntilExpiration(monthlyDate));
            const weeklyTimeToExpiry = weeklyDTE / 365;
            const monthlyTimeToExpiry = monthlyDTE / 365;

            console.log(`📅 Expected Range for ${ticker}: Weekly ${weeklyExpiry} (${weeklyDTE}D), Monthly ${monthlyExpiry} (${monthlyDTE}D)`);

            // Fetch options chains
            const [weeklyOptionsResponse, monthlyOptionsResponse] = await Promise.all([
                fetch(`https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&expiration_date=${weeklyExpiry}&strike_price.gte=${Math.floor(lowerBound)}&strike_price.lte=${Math.ceil(upperBound)}&limit=300&apikey=${POLYGON_API_KEY}`),
                fetch(`https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&expiration_date=${monthlyExpiry}&strike_price.gte=${Math.floor(lowerBound)}&strike_price.lte=${Math.ceil(upperBound)}&limit=300&apikey=${POLYGON_API_KEY}`)
            ]);

            const weeklyOptionsData = await weeklyOptionsResponse.json();
            const monthlyOptionsData = await monthlyOptionsResponse.json();

            const getIVFromPolygonSnapshot = async (optionTicker: string, underlyingTicker: string): Promise<number | null> => {
                try {
                    const response = await fetch(`https://api.polygon.io/v3/snapshot/options/${underlyingTicker}/${optionTicker}?apiKey=${POLYGON_API_KEY}`);
                    const data = await response.json();
                    if (data.results && data.results.implied_volatility) {
                        return data.results.implied_volatility;
                    }
                    return null;
                } catch (error) {
                    console.error(`Failed to fetch IV for ${optionTicker}:`, error);
                    return null;
                }
            };

            const calculateIVFromOptionsChain = async (optionsResults: any[], ticker: string, label: string): Promise<number> => {
                console.log(`${label} - Fetching IV from ${optionsResults.length} options`);
                if (optionsResults.length === 0) throw new Error(`No options found for ${label}`);
                
                // Take first 5 ATM/OTM options
                const options = optionsResults.slice(0, 5);
                const ivPromises = options.map(opt => getIVFromPolygonSnapshot(opt.ticker, ticker));
                const ivResults = await Promise.all(ivPromises);
                
                const validIVs = ivResults.filter((iv): iv is number => iv !== null && iv > 0 && iv < 3);
                
                if (validIVs.length > 0) {
                    const avgIV = validIVs.reduce((a, b) => a + b) / validIVs.length;
                    console.log(`✅ ${label} IV: ${(avgIV * 100).toFixed(2)}% (from ${validIVs.length} strikes)`);
                    return avgIV;
                } else {
                    throw new Error(`No valid IV found for ${label}`);
                }
            };

            // Calculate IVs in parallel using Polygon's IV data
            const [weeklyCallIV, weeklyPutIV, monthlyCallIV, monthlyPutIV] = await Promise.all([
                calculateIVFromOptionsChain(
                    weeklyOptionsData.results.filter((opt: any) => opt.contract_type === 'call'),
                    ticker, 'Weekly Call'
                ),
                calculateIVFromOptionsChain(
                    weeklyOptionsData.results.filter((opt: any) => opt.contract_type === 'put'),
                    ticker, 'Weekly Put'
                ),
                calculateIVFromOptionsChain(
                    monthlyOptionsData.results.filter((opt: any) => opt.contract_type === 'call'),
                    ticker, 'Monthly Call'
                ),
                calculateIVFromOptionsChain(
                    monthlyOptionsData.results.filter((opt: any) => opt.contract_type === 'put'),
                    ticker, 'Monthly Put'
                )
            ]);

            const weeklyIV = (weeklyCallIV + weeklyPutIV) / 2;
            const monthlyIV = (monthlyCallIV + monthlyPutIV) / 2;

            console.log(`📊 Final IVs: Weekly ${(weeklyIV * 100).toFixed(2)}%, Monthly ${(monthlyIV * 100).toFixed(2)}%`);

            // Calculate levels using EXACT same logic
            const levels = {
                weekly80Call: findStrikeForProbability(currentPrice, riskFreeRate, weeklyIV, weeklyTimeToExpiry, 80, true),
                weekly90Call: findStrikeForProbability(currentPrice, riskFreeRate, weeklyIV, weeklyTimeToExpiry, 90, true),
                weekly80Put: findStrikeForProbability(currentPrice, riskFreeRate, weeklyIV, weeklyTimeToExpiry, 80, false),
                weekly90Put: findStrikeForProbability(currentPrice, riskFreeRate, weeklyIV, weeklyTimeToExpiry, 90, false),
                monthly80Call: findStrikeForProbability(currentPrice, riskFreeRate, monthlyIV, monthlyTimeToExpiry, 80, true),
                monthly90Call: findStrikeForProbability(currentPrice, riskFreeRate, monthlyIV, monthlyTimeToExpiry, 90, true),
                monthly80Put: findStrikeForProbability(currentPrice, riskFreeRate, monthlyIV, monthlyTimeToExpiry, 80, false),
                monthly90Put: findStrikeForProbability(currentPrice, riskFreeRate, monthlyIV, monthlyTimeToExpiry, 90, false),
                currentPrice,
                weeklyIV,
                monthlyIV,
                weeklyDTE,
                monthlyDTE
            };

            setExpectedRangeLevels(levels);
            setIsLoadingExpectedRange(false);
        } catch (error) {
            console.error('Expected Range calculation failed:', error);
            setExpectedRangeLevels(null);
            setIsLoadingExpectedRange(false);
        }
    };

    // Fetch Expected Range when ticker changes
    useEffect(() => {
        if (currentTicker) {
            calculateExpectedRange(currentTicker);
        }
    }, [currentTicker]);

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(180deg, #000000 0%, #0A0A0A 100%)',
            color: '#FFFFFF',
            padding: '0',
            position: 'relative'
        }}>
            {/* Compact Search Bar - Top Left Corner */}
            <div style={{
                position: 'absolute',
                top: '10px',
                left: '20px',
                maxWidth: '600px',
                background: 'linear-gradient(145deg, #020B14, #000508)',
                border: '1px solid rgba(30, 58, 138, 0.2)',
                borderRadius: '8px',
                padding: '15px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                zIndex: 10
            }}>
                <div style={{
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'center'
                }}>
                    <input
                        type="text"
                        value={tickerInput}
                        onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !isScanning && tickerInput.trim()) {
                                handleAnalyze();
                            }
                        }}
                        placeholder="TICKER"
                        style={{
                            background: 'linear-gradient(145deg, #051229, #020B14)',
                            border: '1px solid rgba(30, 58, 138, 0.4)',
                            color: '#FFFFFF',
                            padding: '10px 15px',
                            fontSize: '14px',
                            fontFamily: 'monospace',
                            fontWeight: '700',
                            outline: 'none',
                            borderRadius: '4px',
                            boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.5)',
                            width: '200px'
                        }}
                    />

                    <select
                        value={timeframe}
                        onChange={(e) => setTimeframe(e.target.value as '1D' | '3D')}
                        style={{
                            background: 'linear-gradient(145deg, #051229, #020B14)',
                            border: '1px solid rgba(30, 58, 138, 0.4)',
                            color: '#FFFFFF',
                            padding: '10px 15px',
                            fontSize: '12px',
                            fontFamily: 'monospace',
                            fontWeight: '700',
                            outline: 'none',
                            borderRadius: '4px',
                            boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.5)',
                            cursor: 'pointer',
                            width: '100px'
                        }}
                    >
                        <option value="1D">1D</option>
                        <option value="3D">3D</option>
                    </select>

                    <button
                        onClick={handleAnalyze}
                        disabled={isScanning || !tickerInput.trim()}
                        style={{
                            background: isScanning
                                ? 'linear-gradient(145deg, #1A1A1A, #0F0F0F)'
                                : 'linear-gradient(145deg, #FFFFFF, #D0D0D0)',
                            color: isScanning ? '#666666' : '#000000',
                            border: '1px solid rgba(192, 192, 192, 0.5)',
                            padding: '10px 20px',
                            fontSize: '12px',
                            fontFamily: 'monospace',
                            fontWeight: '700',
                            cursor: isScanning ? 'not-allowed' : 'pointer',
                            letterSpacing: '1px',
                            borderRadius: '4px',
                            boxShadow: isScanning
                                ? 'inset 0 2px 8px rgba(0, 0, 0, 0.5)'
                                : '0 4px 12px rgba(255, 255, 255, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        {isScanning ? 'SCAN...' : 'GO'}
                    </button>
                </div>
            </div>

            {/* Leadership Signal Card */}
            <div style={{
                position: 'absolute',
                top: '150px',
                left: '20px',
                width: '460px',
                background: 'linear-gradient(145deg, #020B14, #000508)',
                border: '1px solid rgba(30, 58, 138, 0.2)',
                borderRadius: '8px',
                padding: '12px',
                boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                fontFamily: 'JetBrains Mono, monospace',
                minHeight: '140px',
                maxHeight: '140px',
                overflow: 'hidden'
            }}>
                <div style={{
                    fontSize: '19px',
                    fontWeight: '800',
                    fontFamily: 'monospace',
                    color: '#FFFFFF',
                    marginBottom: '8px',
                    letterSpacing: '2px',
                    textAlign: 'center',
                    textShadow: '0 2px 4px rgba(0, 0, 0, 0.8)',
                    background: 'linear-gradient(90deg, #00d4ff, #0099cc, #00d4ff)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    filter: 'contrast(1.2) brightness(1.1)'
                }}>
                    LEADERSHIP SIGNAL
                </div>

                {leadershipSignal ? (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <div style={{
                                color: '#ff8c00',
                                fontSize: '19.2px',
                                fontWeight: '900',
                                letterSpacing: '1px',
                                textShadow: '0 0 10px rgba(255, 140, 0, 0.4)'
                            }}>
                                {currentTicker || 'TICKER'} <span style={{ color: '#00ff41', fontSize: '16.8px' }}>{leadershipSignal.leadershipScore.toFixed(0)}/105</span>
                            </div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                {leadershipSignal.breakoutType && (
                                    <div style={{
                                        background: 'linear-gradient(135deg, rgba(255, 255, 0, 0.2), rgba(255, 255, 0, 0.4))',
                                        border: '1px solid #ffff00',
                                        borderRadius: '4px',
                                        padding: '4px 8px',
                                        color: '#ffff00',
                                        fontSize: '10.8px',
                                        fontWeight: '700',
                                        textShadow: '0 0 8px rgba(255, 255, 0, 0.4)'
                                    }}>
                                        {leadershipSignal.breakoutType}
                                    </div>
                                )}
                                {leadershipSignal.classification && (
                                    <div style={{
                                        background: 'linear-gradient(135deg, rgba(0, 255, 65, 0.2), rgba(0, 255, 65, 0.4))',
                                        border: '1px solid #00ff41',
                                        borderRadius: '4px',
                                        padding: '4px 8px',
                                        color: '#00ff41',
                                        fontSize: '10.8px',
                                        fontWeight: '700',
                                        textShadow: '0 0 8px rgba(0, 255, 65, 0.4)'
                                    }}>
                                        {leadershipSignal.classification}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                            <div>
                                <div style={{
                                    color: '#FFFFFF',
                                    marginBottom: '2px',
                                    fontSize: '10.8px',
                                    fontWeight: '600',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px'
                                }}>
                                    CURRENT PRICE
                                </div>
                                <div style={{
                                    color: '#ffffff',
                                    fontWeight: '800',
                                    fontSize: '16.8px'
                                }}>
                                    ${leadershipSignal.currentPrice.toFixed(2)}
                                </div>
                            </div>
                            <div>
                                <div style={{
                                    color: '#FFFFFF',
                                    marginBottom: '2px',
                                    fontSize: '10.8px',
                                    fontWeight: '600',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px'
                                }}>
                                    DAILY CHANGE
                                </div>
                                <div style={{
                                    color: leadershipSignal.priceChangePercent >= 0 ? '#00ff41' : '#ff073a',
                                    fontWeight: '800',
                                    fontSize: '14.4px'
                                }}>
                                    {leadershipSignal.priceChangePercent >= 0 ? '+' : ''}{leadershipSignal.priceChangePercent.toFixed(2)}%
                                </div>
                            </div>
                            <div>
                                <div style={{
                                    color: '#FFFFFF',
                                    marginBottom: '2px',
                                    fontSize: '10.8px',
                                    fontWeight: '600',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px'
                                }}>
                                    VOL RATIO
                                </div>
                                <div style={{
                                    color: leadershipSignal.volumeRatio >= 1.5 ? '#00ff41' : '#ffffff',
                                    fontWeight: '800',
                                    fontSize: '14.4px'
                                }}>
                                    {leadershipSignal.volumeRatio.toFixed(2)}x
                                </div>
                            </div>
                            <div>
                                <div style={{
                                    color: '#FFFFFF',
                                    marginBottom: '2px',
                                    fontSize: '10.8px',
                                    fontWeight: '600',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px'
                                }}>
                                    DAYS SINCE HIGH
                                </div>
                                <div style={{
                                    color: leadershipSignal.daysSinceLastHigh >= 60 ? '#00ff41' : leadershipSignal.daysSinceLastHigh >= 30 ? '#ffff00' : '#ff8c00',
                                    fontWeight: '800',
                                    fontSize: '14.4px'
                                }}>
                                    {leadershipSignal.daysSinceLastHigh}+ DAYS
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#666',
                        fontSize: '14px',
                        fontFamily: 'monospace',
                        minHeight: '100px',
                        gap: '10px'
                    }}>
                        {isScanning ? (
                            <>
                                <div style={{
                                    width: '16px',
                                    height: '16px',
                                    border: '2px solid #333',
                                    borderTop: '2px solid #00d4ff',
                                    borderRadius: '50%',
                                    animation: 'spin 1s linear infinite'
                                }} />
                                <span>Scanning Leadership</span>
                                <style jsx>{`
                                    @keyframes spin {
                                        0% { transform: rotate(0deg); }
                                        100% { transform: rotate(360deg); }
                                    }
                                `}</style>
                            </>
                        ) : (
                            currentTicker ? 'Not a Leader' : 'No Leadership'
                        )}
                    </div>
                )}
            </div>

            {/* RS Status Card */}
            <div style={{
                position: 'absolute',
                top: '150px',
                left: '490px',
                width: '460px',
                background: 'linear-gradient(145deg, #020B14, #000508)',
                border: '1px solid rgba(30, 58, 138, 0.2)',
                borderRadius: '8px',
                padding: '12px',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                fontFamily: 'JetBrains Mono, monospace',
                minHeight: '140px',
                maxHeight: '140px',
                overflow: 'hidden',
                backdropFilter: 'blur(10px)'
            }}>
                {/* Animated background glow */}
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'linear-gradient(45deg, transparent 0%, rgba(255, 140, 0, 0.02) 50%, transparent 100%)',
                    borderRadius: '8px',
                    pointerEvents: 'none',
                    opacity: 0.6
                }} />

                <div style={{
                    fontSize: '19px',
                    fontWeight: '800',
                    fontFamily: 'monospace',
                    color: '#FFFFFF',
                    marginBottom: '8px',
                    letterSpacing: '2px',
                    textAlign: 'center',
                    textShadow: '0 2px 4px rgba(0, 0, 0, 0.8)',
                    background: 'linear-gradient(90deg, #00ff41, #00cc33, #00ff41)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    filter: 'contrast(1.2) brightness(1.1)',
                    position: 'relative',
                    zIndex: 1
                }}>
                    RS STATUS
                </div>

                {rsSignals.classification ? (
                    <div style={{ position: 'relative', zIndex: 1 }}>
                        {/* Row 1: Ticker and Badge */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '12px',
                            fontSize: '11px',
                            marginBottom: '8px'
                        }}>
                            <div>
                                <div style={{
                                    color: '#ff8c00',
                                    fontWeight: '800',
                                    fontSize: '16.8px',
                                    letterSpacing: '1.5px',
                                    textShadow: '0 0 10px rgba(255, 140, 0, 0.3), 0 1px 0 rgba(0, 0, 0, 0.8)',
                                    WebkitTextStroke: '0.5px rgba(255, 140, 0, 0.1)',
                                    textRendering: 'optimizeLegibility',
                                    WebkitFontSmoothing: 'antialiased',
                                    MozOsxFontSmoothing: 'grayscale'
                                }}>
                                    {currentTicker || 'TICKER'}
                                </div>
                            </div>
                            {(rsSignals.breakout || rsSignals.rareLow || rsSignals.breakdown) && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{
                                        color: '#FFFFFF',
                                        fontSize: '10.8px',
                                        fontWeight: '600',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        textShadow: '0 1px 0 rgba(0, 0, 0, 0.8)'
                                    }}>
                                        SIGNAL
                                    </div>
                                    <div style={{
                                        background: rsSignals.breakout
                                            ? 'linear-gradient(135deg, rgba(0, 255, 65, 0.2), rgba(0, 255, 65, 0.4))'
                                            : rsSignals.rareLow
                                                ? 'linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(0, 212, 255, 0.4))'
                                                : 'linear-gradient(135deg, rgba(255, 7, 58, 0.2), rgba(255, 7, 58, 0.4))',
                                        border: rsSignals.breakout
                                            ? '1px solid #00ff41'
                                            : rsSignals.rareLow
                                                ? '1px solid #00d4ff'
                                                : '1px solid #ff073a',
                                        borderRadius: '4px',
                                        padding: '4px 8px',
                                        color: rsSignals.breakout
                                            ? '#00ff41'
                                            : rsSignals.rareLow
                                                ? '#00d4ff'
                                                : '#ff073a',
                                        fontSize: '10.8px',
                                        fontWeight: '700',
                                        textShadow: rsSignals.breakout
                                            ? '0 0 8px rgba(0, 255, 65, 0.4)'
                                            : rsSignals.rareLow
                                                ? '0 0 8px rgba(0, 212, 255, 0.4)'
                                                : '0 0 8px rgba(255, 7, 58, 0.4)',
                                        textAlign: 'center',
                                        display: 'inline-block'
                                    }}>
                                        {rsSignals.breakout ? '52-WEEK RS HIGH' : rsSignals.rareLow ? 'RARE LOW' : 'RS BREAKDOWN'}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Row 2: Price/Change, Percentile, Classification */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1.2fr 0.9fr 1fr',
                            gap: '12px',
                            fontSize: '11px'
                        }}>
                            <div>
                                <div style={{
                                    color: '#FFFFFF',
                                    marginBottom: '4px',
                                    fontSize: '10.8px',
                                    fontWeight: '600',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px',
                                    textShadow: '0 1px 0 rgba(0, 0, 0, 0.8)'
                                }}>
                                    PRICE / CHANGE
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{
                                        color: '#e0e0e0',
                                        fontWeight: '800',
                                        fontSize: '15.6px',
                                        textShadow: '0 1px 0 rgba(0, 0, 0, 0.8), 0 0 8px rgba(224, 224, 224, 0.2)',
                                        WebkitFontSmoothing: 'antialiased'
                                    }}>
                                        ${rsSignals.currentPrice.toFixed(2)}
                                    </div>
                                    <div style={{
                                        color: rsSignals.priceChange >= 0 ? '#00ff41' : '#ff073a',
                                        fontSize: '13.2px',
                                        fontWeight: '700',
                                        textShadow: `0 0 8px ${rsSignals.priceChange >= 0 ? 'rgba(0, 255, 65, 0.4)' : 'rgba(255, 7, 58, 0.4)'}, 0 1px 0 rgba(0, 0, 0, 0.8)`,
                                        letterSpacing: '0.5px'
                                    }}>
                                        {rsSignals.priceChange >= 0 ? '+' : ''}{rsSignals.priceChangePercent.toFixed(2)}%
                                    </div>
                                </div>
                            </div>
                            <div>
                                <div style={{
                                    color: '#FFFFFF',
                                    marginBottom: '4px',
                                    fontSize: '10.8px',
                                    fontWeight: '600',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px',
                                    textShadow: '0 1px 0 rgba(0, 0, 0, 0.8)'
                                }}>
                                    RS PERCENTILE
                                </div>
                                <div style={{
                                    color: '#ff8c00',
                                    fontWeight: '800',
                                    fontSize: '15.6px',
                                    textShadow: '0 0 10px rgba(255, 140, 0, 0.4), 0 1px 0 rgba(0, 0, 0, 0.8)',
                                    letterSpacing: '0.5px',
                                    WebkitFontSmoothing: 'antialiased'
                                }}>
                                    {rsSignals.percentile.toFixed(1)}%
                                </div>
                            </div>
                            <div>
                                <div style={{
                                    color: '#FFFFFF',
                                    marginBottom: '4px',
                                    fontSize: '10.8px',
                                    fontWeight: '600',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px',
                                    textShadow: '0 1px 0 rgba(0, 0, 0, 0.8)'
                                }}>
                                    CLASSIFICATION
                                </div>
                                <div style={{
                                    color: rsSignals.classification === 'LEADING' ? '#00ff41' :
                                        rsSignals.classification === 'IMPROVING' ? '#00d4ff' :
                                            rsSignals.classification === 'WEAKENING' ? '#ffff00' : '#ff073a',
                                    fontWeight: '800',
                                    fontSize: '13.2px',
                                    textShadow: `0 0 12px ${rsSignals.classification === 'LEADING' ? '#00ff41' :
                                        rsSignals.classification === 'IMPROVING' ? '#00d4ff' :
                                            rsSignals.classification === 'WEAKENING' ? '#ffff00' : '#ff073a'}60, 0 1px 0 rgba(0, 0, 0, 0.8)`,
                                    letterSpacing: '0.8px',
                                    textTransform: 'uppercase',
                                    WebkitFontSmoothing: 'antialiased'
                                }}>
                                    {rsSignals.classification}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#666666',
                        fontSize: '12px',
                        fontFamily: 'JetBrains Mono, monospace',
                        minHeight: '60px',
                        position: 'relative',
                        zIndex: 1,
                        gap: '10px'
                    }}>
                        {isScanning ? (
                            <>
                                <div style={{
                                    width: '14px',
                                    height: '14px',
                                    border: '2px solid #333',
                                    borderTop: '2px solid #00ff41',
                                    borderRadius: '50%',
                                    animation: 'spin 1s linear infinite'
                                }} />
                                <span>Scanning Strength</span>
                            </>
                        ) : (
                            currentTicker ? 'No Strength' : 'NO RS DATA'
                        )}
                    </div>
                )}
            </div>

            {/* Options Flow Panel - Below Search Bar */}
            <div style={{
                position: 'absolute',
                top: '300px',
                left: '20px',
                width: '920px',
                height: '365px',
                background: 'linear-gradient(145deg, #020B14, #000508)',
                border: '1px solid rgba(30, 58, 138, 0.2)',
                borderRadius: '8px',
                padding: '15px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                zIndex: 5,
                display: 'flex',
                flexDirection: 'column'
            }}>
                <div style={{
                    fontSize: '19px',
                    fontWeight: '800',
                    fontFamily: 'monospace',
                    color: '#FFFFFF',
                    marginBottom: '12px',
                    letterSpacing: '2px',
                    textAlign: 'center',
                    textShadow: '0 2px 4px rgba(0, 0, 0, 0.8)',
                    background: 'linear-gradient(90deg, #FF8C00, #FFA500, #FF8C00)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    filter: 'contrast(1.2) brightness(1.1)'
                }}>
                    EFI FLOW HIGHLIGHTS
                </div>

                {optionsFlowData.length > 0 ? (
                    <div style={{
                        flex: 1,
                        overflowY: 'auto',
                        overflowX: 'hidden'
                    }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(30, 58, 138, 0.3)' }}>
                                    <th style={{ padding: '8px', textAlign: 'left', color: '#FF8C00', fontSize: '15px', fontFamily: 'monospace', borderRight: '1px solid rgba(30, 58, 138, 0.2)' }}>GRADE</th>
                                    <th style={{ padding: '8px', textAlign: 'left', color: '#FF8C00', fontSize: '15px', fontFamily: 'monospace', borderRight: '1px solid rgba(30, 58, 138, 0.2)' }}>TIME</th>
                                    <th style={{ padding: '8px', textAlign: 'left', color: '#FF8C00', fontSize: '15px', fontFamily: 'monospace', borderRight: '1px solid rgba(30, 58, 138, 0.2)' }}>C/P</th>
                                    <th style={{ padding: '8px', textAlign: 'left', color: '#FF8C00', fontSize: '15px', fontFamily: 'monospace', borderRight: '1px solid rgba(30, 58, 138, 0.2)' }}>EXPIRATION</th>
                                    <th style={{ padding: '8px', textAlign: 'left', color: '#FF8C00', fontSize: '15px', fontFamily: 'monospace', borderRight: '1px solid rgba(30, 58, 138, 0.2)' }}>TYPE</th>
                                    <th style={{ padding: '8px', textAlign: 'right', color: '#FF8C00', fontSize: '15px', fontFamily: 'monospace', borderRight: '1px solid rgba(30, 58, 138, 0.2)' }}>STRIKE</th>
                                    <th style={{ padding: '8px', textAlign: 'left', color: '#FF8C00', fontSize: '15px', fontFamily: 'monospace', borderRight: '1px solid rgba(30, 58, 138, 0.2)' }}>SIZE & FILL</th>
                                    <th style={{ padding: '8px', textAlign: 'left', color: '#FF8C00', fontSize: '15px', fontFamily: 'monospace', borderRight: '1px solid rgba(30, 58, 138, 0.2)' }}>SPOT {'>> '} CURRENT</th>
                                    <th style={{ padding: '8px', textAlign: 'right', color: '#FF8C00', fontSize: '15px', fontFamily: 'monospace' }}>PREMIUM</th>
                                </tr>
                            </thead>
                            <tbody>
                                {optionsFlowData.map((trade, index) => {
                                    const time = new Date(trade.trade_timestamp).toLocaleTimeString('en-US', {
                                        hour: 'numeric',
                                        minute: '2-digit',
                                        hour12: true,
                                        timeZone: 'America/New_York'
                                    });
                                    const grade = trade.positioning?.grade || 'N/A';
                                    const color = trade.positioning?.color || '#666';
                                    const fillStyle = trade.fill_style || 'N/A';
                                    const fillColor = fillStyle === 'A' || fillStyle === 'AA' ? '#22c55e' :
                                        fillStyle === 'B' || fillStyle === 'BB' ? '#ef4444' : '#666';

                                    // Parse expiry date correctly to avoid timezone shifts
                                    let expiryFormatted = 'N/A';
                                    if (trade.expiry) {
                                        const [year, month, day] = trade.expiry.split('-').map(Number);
                                        const expiryDate = new Date(year, month - 1, day);
                                        expiryFormatted = expiryDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
                                    }

                                    // Calculate P&L percentage
                                    const entryPrice = trade.premium_per_contract || 0;
                                    const currentPrice = trade.current_option_price || trade.current_price || entryPrice;
                                    const percentChange = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;
                                    const percentChangeColor = percentChange > 0 ? '#22c55e' : percentChange < 0 ? '#ef4444' : '#666';

                                    return (
                                        <tr key={index} style={{ borderBottom: '1px solid rgba(30, 58, 138, 0.1)' }}>
                                            <td style={{ padding: '8px', borderRight: '1px solid rgba(30, 58, 138, 0.2)' }}>
                                                <span style={{
                                                    display: 'inline-block',
                                                    padding: '2px 8px',
                                                    background: color,
                                                    color: '#000',
                                                    borderRadius: '4px',
                                                    fontSize: '15px',
                                                    fontWeight: '700',
                                                    fontFamily: 'monospace'
                                                }}>
                                                    {grade}
                                                </span>
                                                <span style={{
                                                    fontSize: '15px',
                                                    color: percentChangeColor,
                                                    fontFamily: 'monospace',
                                                    fontWeight: '700',
                                                    marginLeft: '6px'
                                                }}>
                                                    {percentChange >= 0 ? '+' : ''}{percentChange.toFixed(1)}%
                                                </span>
                                            </td>
                                            <td style={{ padding: '8px', color: '#FFFFFF', fontSize: '15px', fontFamily: 'monospace', borderRight: '1px solid rgba(30, 58, 138, 0.2)' }}>
                                                {time}
                                            </td>
                                            <td style={{ padding: '8px', fontSize: '15px', fontFamily: 'monospace', borderRight: '1px solid rgba(30, 58, 138, 0.2)' }}>
                                                <span style={{ color: trade.type === 'call' ? '#00FF00' : '#FF0000', fontWeight: '700' }}>
                                                    {trade.type?.toUpperCase()}
                                                </span>
                                            </td>
                                            <td style={{ padding: '8px', color: '#FFFFFF', fontSize: '15px', fontFamily: 'monospace', borderRight: '1px solid rgba(30, 58, 138, 0.2)' }}>
                                                {expiryFormatted}
                                            </td>
                                            <td style={{ padding: '8px', fontSize: '15px', fontFamily: 'monospace', borderRight: '1px solid rgba(30, 58, 138, 0.2)' }}>
                                                <span style={{
                                                    display: 'inline-block',
                                                    padding: '3px 10px',
                                                    background: trade.trade_type?.toLowerCase() === 'sweep'
                                                        ? 'linear-gradient(145deg, #FFD700, #FFA500)'
                                                        : 'linear-gradient(145deg, #1E90FF, #0066CC)',
                                                    color: '#000',
                                                    borderRadius: '5px',
                                                    fontSize: '13px',
                                                    fontWeight: '700',
                                                    boxShadow: trade.trade_type?.toLowerCase() === 'sweep'
                                                        ? '0 2px 4px rgba(255, 215, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)'
                                                        : '0 2px 4px rgba(30, 144, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
                                                    textShadow: '0 1px 1px rgba(0, 0, 0, 0.2)'
                                                }}>
                                                    {(trade.trade_type || 'N/A').toUpperCase()}
                                                </span>
                                            </td>
                                            <td style={{ padding: '8px', color: '#FFFFFF', fontSize: '15px', fontFamily: 'monospace', textAlign: 'right', borderRight: '1px solid rgba(30, 58, 138, 0.2)' }}>
                                                ${trade.strike?.toFixed(2)}
                                            </td>
                                            <td style={{ padding: '8px', fontSize: '15px', fontFamily: 'monospace', borderRight: '1px solid rgba(30, 58, 138, 0.2)' }}>
                                                <span style={{ color: '#06B6D4' }}>{trade.trade_size}</span>
                                                {' '}@
                                                <span style={{ color: '#EAB308' }}>${trade.premium_per_contract?.toFixed(2)}</span>
                                                <span style={{
                                                    display: 'inline-block',
                                                    padding: '1px 4px',
                                                    marginLeft: '4px',
                                                    background: `${fillColor}22`,
                                                    color: fillColor,
                                                    border: `1px solid ${fillColor}`,
                                                    borderRadius: '3px',
                                                    fontSize: '13px',
                                                    fontWeight: '700'
                                                }}>
                                                    {fillStyle}
                                                </span>
                                            </td>
                                            <td style={{ padding: '8px', fontSize: '15px', fontFamily: 'monospace', borderRight: '1px solid rgba(30, 58, 138, 0.2)' }}>
                                                <span style={{ color: '#FFFFFF' }}>${trade.spot_price?.toFixed(2)}</span>
                                                <span style={{ color: '#666' }}> {'>>'}  </span>
                                                <span style={{ color: '#ef4444' }}>${(trade.current_stock_price || trade.spot_price)?.toFixed(2)}</span>
                                            </td>
                                            <td style={{ padding: '8px', color: '#00FF00', fontSize: '15px', fontFamily: 'monospace', textAlign: 'right', fontWeight: '700' }}>
                                                ${(trade.total_premium / 1000).toFixed(0)}K
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#666',
                        fontSize: '14px',
                        fontFamily: 'monospace',
                        gap: '10px'
                    }}>
                        {isScanning ? (
                            <>
                                <div style={{
                                    width: '16px',
                                    height: '16px',
                                    border: '2px solid #333',
                                    borderTop: '2px solid #FF8C00',
                                    borderRadius: '50%',
                                    animation: 'spin 1s linear infinite'
                                }} />
                                <span>Scanning Flow</span>
                            </>
                        ) : (
                            currentTicker ? 'No Notable Flow' : 'No trades'
                        )}
                    </div>
                )}
            </div>

            {/* Expected Range Panel - Right Side */}
            <div style={{
                position: 'absolute',
                top: '10px',
                right: '20px',
                width: '380px',
                background: 'linear-gradient(145deg, #020B14, #000508)',
                border: '1px solid rgba(30, 58, 138, 0.2)',
                borderRadius: '8px',
                padding: '15px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                zIndex: 5
            }}>
                <div style={{
                    fontSize: '19px',
                    fontWeight: '800',
                    fontFamily: 'monospace',
                    color: '#FFFFFF',
                    marginBottom: '12px',
                    letterSpacing: '2px',
                    textAlign: 'center',
                    textShadow: '0 2px 4px rgba(0, 0, 0, 0.8)',
                    background: 'linear-gradient(90deg, #00d4ff, #0099cc, #00d4ff)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    filter: 'contrast(1.2) brightness(1.1)'
                }}>
                    EXPECTED RANGE
                </div>

                {isLoadingExpectedRange ? (
                    <div style={{ textAlign: 'center', color: '#666', padding: '40px', fontSize: '13px' }}>
                        <div style={{ width: '20px', height: '20px', border: '2px solid #333', borderTop: '2px solid #00d4ff', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 10px' }} />
                        Calculating Range...
                    </div>
                ) : expectedRangeLevels ? (
                    <>
                        {/* Current Price */}
                        <div style={{
                            background: 'rgba(0, 212, 255, 0.1)',
                            border: '1px solid rgba(0, 212, 255, 0.3)',
                            borderRadius: '6px',
                            padding: '10px',
                            marginBottom: '12px',
                            textAlign: 'center'
                        }}>
                            <div style={{ color: '#888', fontSize: '11px', marginBottom: '4px' }}>CURRENT PRICE</div>
                            <div style={{ color: '#00d4ff', fontSize: '24px', fontWeight: '800' }}>${expectedRangeLevels.currentPrice.toFixed(2)}</div>
                        </div>

                        {/* Weekly Range */}
                        <div style={{ marginBottom: '12px' }}>
                            <div style={{
                                fontSize: '14px',
                                fontWeight: '700',
                                color: '#00FF00',
                                marginBottom: '8px',
                                borderBottom: '1px solid rgba(0, 255, 0, 0.2)',
                                paddingBottom: '4px'
                            }}>
                                WEEKLY ({expectedRangeLevels.weeklyDTE}D) - IV: {(expectedRangeLevels.weeklyIV * 100).toFixed(1)}%
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                                <div>
                                    <div style={{ color: '#888', marginBottom: '2px' }}>90% Call</div>
                                    <div style={{ color: '#32CD32', fontWeight: '700' }}>${expectedRangeLevels.weekly90Call.toFixed(2)}</div>
                                </div>
                                <div>
                                    <div style={{ color: '#888', marginBottom: '2px' }}>80% Call</div>
                                    <div style={{ color: '#00FF00', fontWeight: '700' }}>${expectedRangeLevels.weekly80Call.toFixed(2)}</div>
                                </div>
                                <div>
                                    <div style={{ color: '#888', marginBottom: '2px' }}>80% Put</div>
                                    <div style={{ color: '#FF0000', fontWeight: '700' }}>${expectedRangeLevels.weekly80Put.toFixed(2)}</div>
                                </div>
                                <div>
                                    <div style={{ color: '#888', marginBottom: '2px' }}>90% Put</div>
                                    <div style={{ color: '#FF6347', fontWeight: '700' }}>${expectedRangeLevels.weekly90Put.toFixed(2)}</div>
                                </div>
                            </div>
                        </div>

                        {/* Monthly Range */}
                        <div>
                            <div style={{
                                fontSize: '14px',
                                fontWeight: '700',
                                color: '#0000FF',
                                marginBottom: '8px',
                                borderBottom: '1px solid rgba(0, 0, 255, 0.2)',
                                paddingBottom: '4px'
                            }}>
                                MONTHLY ({expectedRangeLevels.monthlyDTE}D) - IV: {(expectedRangeLevels.monthlyIV * 100).toFixed(1)}%
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                                <div>
                                    <div style={{ color: '#888', marginBottom: '2px' }}>90% Call</div>
                                    <div style={{ color: '#4169E1', fontWeight: '700' }}>${expectedRangeLevels.monthly90Call.toFixed(2)}</div>
                                </div>
                                <div>
                                    <div style={{ color: '#888', marginBottom: '2px' }}>80% Call</div>
                                    <div style={{ color: '#0000FF', fontWeight: '700' }}>${expectedRangeLevels.monthly80Call.toFixed(2)}</div>
                                </div>
                                <div>
                                    <div style={{ color: '#888', marginBottom: '2px' }}>80% Put</div>
                                    <div style={{ color: '#800080', fontWeight: '700' }}>${expectedRangeLevels.monthly80Put.toFixed(2)}</div>
                                </div>
                                <div>
                                    <div style={{ color: '#888', marginBottom: '2px' }}>90% Put</div>
                                    <div style={{ color: '#9370DB', fontWeight: '700' }}>${expectedRangeLevels.monthly90Put.toFixed(2)}</div>
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <div style={{ textAlign: 'center', color: '#666', padding: '40px', fontSize: '13px' }}>
                        {currentTicker ? 'No Expected Range Data' : 'Search a ticker to see range'}
                    </div>
                )}
            </div>

            {/* IV Charts Panel - Bottom Left */}
            <div style={{
                position: 'absolute',
                bottom: '140px',
                left: '20px',
                width: '550px'
            }}>
                <IVChartsPanel
                    data={ivData}
                    ticker={currentTicker || tickerInput}
                    period={ivPeriod}
                    onPeriodChange={handlePeriodChange}
                    isScanning={isScanning}
                />
            </div>
        </div>
    );
}

function IVChartsPanel({ data, ticker, period, onPeriodChange, isScanning }: IVChartsPanelProps) {
    const callPutIVCanvasRef = useRef<HTMLCanvasElement>(null);
    const ivRankCanvasRef = useRef<HTMLCanvasElement>(null);
    const ivPercentileCanvasRef = useRef<HTMLCanvasElement>(null);

    const [showNet, setShowNet] = useState(true);
    const [showCall, setShowCall] = useState(false);
    const [showPut, setShowPut] = useState(false);

    const drawCallPutIVChart = (canvas: HTMLCanvasElement | null, data: any[], showNet: boolean, showCall: boolean, showPut: boolean, mousePos: { x: number, y: number } | null = null) => {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const width = 520;
        const height = 220;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.scale(dpr, dpr);

        const padding = { top: 30, right: 40, bottom: 40, left: 60 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        // Navy blue border
        ctx.strokeStyle = 'rgba(30, 58, 138, 0.2)';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, width - 2, height - 2);

        // Centered title with gradient effect
        ctx.textAlign = 'center';
        ctx.font = 'bold 16px monospace';
        ctx.shadowColor = 'rgba(255, 140, 0, 0.5)';
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#FF8C00';
        ctx.fillText('NET IV', width / 2, 18);
        ctx.shadowBlur = 0;

        // Legend - NET IV on left, CALL/PUT on right
        ctx.font = '10px monospace';

        if (showNet) {
            ctx.textAlign = 'left';
            ctx.fillStyle = '#FF8C00';
            ctx.fillRect(padding.left, 12, 15, 3);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText('NET IV', padding.left + 20, 16);
        }

        let legendX = width - padding.right;
        ctx.textAlign = 'right';

        if (showPut) {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText('PUT IV', legendX, 16);
            ctx.fillStyle = '#FF0000';
            ctx.fillRect(legendX - 55, 12, 15, 3);
            legendX -= 80;
        }

        if (showCall) {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText('CALL IV', legendX, 16);
            ctx.fillStyle = '#00FF00';
            ctx.fillRect(legendX - 60, 12, 15, 3);
        }

        const callValues = data.map(d => d.callIV);
        const putValues = data.map(d => d.putIV);
        const netValues = data.map(d => d.netIV);

        const allValues = [];
        if (showNet) allValues.push(...netValues);
        if (showCall) allValues.push(...callValues);
        if (showPut) allValues.push(...putValues);

        const maxValue = Math.max(...allValues);
        const minValue = Math.min(...allValues);
        const range = maxValue - minValue || 1;

        ctx.strokeStyle = '#1A1A1A';
        ctx.lineWidth = 1;
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'right';

        for (let i = 0; i <= 5; i++) {
            const y = padding.top + (chartHeight * i / 5);
            const value = maxValue - (range * i / 5);
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(padding.left + chartWidth, y);
            ctx.stroke();
            ctx.fillText(value.toFixed(1), padding.left - 8, y + 4);
        }

        // X-axis labels with year
        ctx.textAlign = 'center';
        ctx.font = 'bold 13px monospace';
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        for (let i = 0; i <= 6; i++) {
            const index = Math.min(Math.floor(i * data.length / 6), data.length - 1);
            const x = padding.left + (chartWidth * index / (data.length - 1));
            const date = new Date(data[index].date);
            const monthLabel = months[date.getMonth()];
            const yearLabel = date.getFullYear().toString().slice(-2);
            ctx.fillText(`${monthLabel} '${yearLabel}`, x, height - 25);
        }

        // Draw Net IV line (orange)
        if (showNet) {
            ctx.strokeStyle = '#FF8C00';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            data.forEach((point, i) => {
                const x = padding.left + (chartWidth * i / (data.length - 1));
                const y = padding.top + chartHeight - ((point.netIV - minValue) / range * chartHeight);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
        }

        // Draw Call IV line (green)
        if (showCall) {
            ctx.strokeStyle = '#00FF00';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            data.forEach((point, i) => {
                const x = padding.left + (chartWidth * i / (data.length - 1));
                const y = padding.top + chartHeight - ((point.callIV - minValue) / range * chartHeight);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
        }

        // Draw Put IV line (red)
        if (showPut) {
            ctx.strokeStyle = '#FF0000';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            data.forEach((point, i) => {
                const x = padding.left + (chartWidth * i / (data.length - 1));
                const y = padding.top + chartHeight - ((point.putIV - minValue) / range * chartHeight);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
        }

        // Draw end labels with stacking to prevent overlap
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'left';
        const activeCount = [showNet, showCall, showPut].filter(Boolean).length;
        let labelOffset = 0;

        if (showNet) {
            const lastNetY = padding.top + chartHeight - ((netValues[netValues.length - 1] - minValue) / range * chartHeight);
            const adjustedY = activeCount > 1 ? lastNetY + labelOffset : lastNetY;
            ctx.fillStyle = '#FF8C00';
            ctx.fillText(netValues[netValues.length - 1].toFixed(1) + '%', padding.left + chartWidth + 5, adjustedY + 4);
            labelOffset += 15;
        }

        if (showCall) {
            const lastCallY = padding.top + chartHeight - ((callValues[callValues.length - 1] - minValue) / range * chartHeight);
            const adjustedY = activeCount > 1 ? lastCallY + labelOffset : lastCallY;
            ctx.fillStyle = '#00FF00';
            ctx.fillText(callValues[callValues.length - 1].toFixed(1) + '%', padding.left + chartWidth + 5, adjustedY + 4);
            labelOffset += 15;
        }

        if (showPut) {
            const lastPutY = padding.top + chartHeight - ((putValues[putValues.length - 1] - minValue) / range * chartHeight);
            const adjustedY = activeCount > 1 ? lastPutY + labelOffset : lastPutY;
            ctx.fillStyle = '#FF0000';
            ctx.fillText(putValues[putValues.length - 1].toFixed(1) + '%', padding.left + chartWidth + 5, adjustedY + 4);
        }

        // Draw crosshair if mouse is hovering
        if (mousePos && mousePos.x >= padding.left && mousePos.x <= padding.left + chartWidth &&
            mousePos.y >= padding.top && mousePos.y <= padding.top + chartHeight) {

            // Find closest data point
            const dataIndex = Math.round((mousePos.x - padding.left) / chartWidth * (data.length - 1));
            const point = data[Math.max(0, Math.min(dataIndex, data.length - 1))];

            // Draw vertical line
            ctx.strokeStyle = 'rgba(255, 140, 0, 0.5)';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(mousePos.x, padding.top);
            ctx.lineTo(mousePos.x, padding.top + chartHeight);
            ctx.stroke();

            // Draw horizontal line
            ctx.beginPath();
            ctx.moveTo(padding.left, mousePos.y);
            ctx.lineTo(padding.left + chartWidth, mousePos.y);
            ctx.stroke();
            ctx.setLineDash([]);

            // Calculate value at mouse Y position
            const valueAtY = maxValue - ((mousePos.y - padding.top) / chartHeight * range);

            // Display date on X-axis
            const date = new Date(point.date);
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const dateStr = `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;

            ctx.font = 'bold 11px monospace';
            ctx.fillStyle = '#000000';
            ctx.fillRect(mousePos.x - 50, height - 20, 100, 16);
            ctx.fillStyle = '#FF8C00';
            ctx.textAlign = 'center';
            ctx.fillText(dateStr, mousePos.x, height - 8);

            // Display values on right Y-axis
            ctx.textAlign = 'left';
            let yOffset = 0;

            if (showNet) {
                ctx.fillStyle = '#000000';
                ctx.fillRect(padding.left + chartWidth + 5, mousePos.y + yOffset - 10, 60, 14);
                ctx.fillStyle = '#FF8C00';
                ctx.fillText(`${point.netIV.toFixed(2)}%`, padding.left + chartWidth + 8, mousePos.y + yOffset + 2);
                yOffset += 16;
            }

            if (showCall) {
                ctx.fillStyle = '#000000';
                ctx.fillRect(padding.left + chartWidth + 5, mousePos.y + yOffset - 10, 80, 14);
                ctx.fillStyle = '#FF8C00';
                ctx.fillText(`CALL: ${point.callIV.toFixed(2)}%`, padding.left + chartWidth + 8, mousePos.y + yOffset + 2);
                yOffset += 16;
            }

            if (showPut) {
                ctx.fillStyle = '#000000';
                ctx.fillRect(padding.left + chartWidth + 5, mousePos.y + yOffset - 10, 80, 14);
                ctx.fillStyle = '#FF8C00';
                ctx.fillText(`PUT: ${point.putIV.toFixed(2)}%`, padding.left + chartWidth + 8, mousePos.y + yOffset + 2);
            }
        }
    };

    const drawChart = (canvas: HTMLCanvasElement | null, data: IVDataPoint[], key: keyof IVDataPoint, title: string, color: string, mousePos: { x: number, y: number } | null = null) => {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const width = 520;
        const height = 200;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.scale(dpr, dpr);

        const padding = { top: 40, right: 60, bottom: 50, left: 60 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        // Navy blue border
        ctx.strokeStyle = 'rgba(30, 58, 138, 0.2)';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, width - 2, height - 2);

        // Centered title with gradient effect
        ctx.textAlign = 'center';
        ctx.font = 'bold 16px monospace';
        ctx.shadowColor = 'rgba(255, 140, 0, 0.5)';
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#FF8C00';
        ctx.fillText(title, width / 2, 28);
        ctx.shadowBlur = 0;

        const values = data.map(d => d[key] as number);
        const maxValue = Math.max(...values);
        const minValue = Math.min(...values);
        const range = maxValue - minValue || 1;

        ctx.strokeStyle = '#1A1A1A';
        ctx.lineWidth = 1;
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'right';

        for (let i = 0; i <= 5; i++) {
            const y = padding.top + (chartHeight * i / 5);
            const value = maxValue - (range * i / 5);
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(padding.left + chartWidth, y);
            ctx.stroke();
            ctx.fillText(value.toFixed(1), padding.left - 8, y + 4);
        }

        // X-axis labels with year
        ctx.textAlign = 'center';
        ctx.font = 'bold 13px monospace';
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        for (let i = 0; i <= 6; i++) {
            const index = Math.min(Math.floor(i * data.length / 6), data.length - 1);
            const x = padding.left + (chartWidth * index / (data.length - 1));
            const date = new Date(data[index].date);
            const monthLabel = months[date.getMonth()];
            const yearLabel = date.getFullYear().toString().slice(-2);
            ctx.fillText(`${monthLabel} '${yearLabel}`, x, height - 25);
        }

        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();

        data.forEach((point, i) => {
            const x = padding.left + (chartWidth * i / (data.length - 1));
            const y = padding.top + chartHeight - (((point[key] as number) - minValue) / range * chartHeight);

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();

        const lastX = padding.left + chartWidth;
        const lastY = padding.top + chartHeight - ((values[values.length - 1] - minValue) / range * chartHeight);

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(values[values.length - 1].toFixed(1) + '%', lastX + 8, lastY + 4);

        // Draw crosshair if mouse is hovering
        if (mousePos && mousePos.x >= padding.left && mousePos.x <= padding.left + chartWidth &&
            mousePos.y >= padding.top && mousePos.y <= padding.top + chartHeight) {

            // Find closest data point
            const dataIndex = Math.round((mousePos.x - padding.left) / chartWidth * (data.length - 1));
            const point = data[Math.max(0, Math.min(dataIndex, data.length - 1))];

            // Draw vertical line
            ctx.strokeStyle = 'rgba(255, 140, 0, 0.5)';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(mousePos.x, padding.top);
            ctx.lineTo(mousePos.x, padding.top + chartHeight);
            ctx.stroke();

            // Draw horizontal line
            ctx.beginPath();
            ctx.moveTo(padding.left, mousePos.y);
            ctx.lineTo(padding.left + chartWidth, mousePos.y);
            ctx.stroke();
            ctx.setLineDash([]);

            // Display date on X-axis
            const date = new Date(point.date);
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const dateStr = `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;

            ctx.font = 'bold 11px monospace';
            ctx.fillStyle = '#000000';
            ctx.fillRect(mousePos.x - 50, height - 20, 100, 16);
            ctx.fillStyle = '#FF8C00';
            ctx.textAlign = 'center';
            ctx.fillText(dateStr, mousePos.x, height - 8);

            // Display value on right Y-axis
            const valueStr = `${(point[key] as number).toFixed(2)}%`;
            ctx.textAlign = 'left';
            ctx.fillStyle = '#000000';
            ctx.fillRect(padding.left + chartWidth + 5, mousePos.y - 10, 65, 14);
            ctx.fillStyle = '#FF8C00';
            ctx.fillText(valueStr, padding.left + chartWidth + 8, mousePos.y + 2);
        }
    };

    useEffect(() => {
        if (data.length === 0) return;

        drawCallPutIVChart(callPutIVCanvasRef.current, data, showNet, showCall, showPut);
        drawChart(ivRankCanvasRef.current, data, 'ivRank', 'IV RANK', '#FFD700');
        drawChart(ivPercentileCanvasRef.current, data, 'ivPercentile', 'IV PERCENTILE', '#9D4EDD');
    }, [data, showNet, showCall, showPut]);

    useEffect(() => {
        if (data.length === 0) return;
        if (!callPutIVCanvasRef.current || !ivRankCanvasRef.current || !ivPercentileCanvasRef.current) return;

        const handleCallPutMouseMove = (e: MouseEvent) => {
            if (!callPutIVCanvasRef.current) return;
            const rect = callPutIVCanvasRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            drawCallPutIVChart(callPutIVCanvasRef.current, data, showNet, showCall, showPut, { x, y });
        };

        const handleCallPutMouseLeave = () => {
            drawCallPutIVChart(callPutIVCanvasRef.current, data, showNet, showCall, showPut, null);
        };

        const handleRankMouseMove = (e: MouseEvent) => {
            if (!ivRankCanvasRef.current) return;
            const rect = ivRankCanvasRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            drawChart(ivRankCanvasRef.current, data, 'ivRank', 'IV RANK', '#FFD700', { x, y });
        };

        const handleRankMouseLeave = () => {
            drawChart(ivRankCanvasRef.current, data, 'ivRank', 'IV RANK', '#FFD700', null);
        };

        const handlePercentileMouseMove = (e: MouseEvent) => {
            if (!ivPercentileCanvasRef.current) return;
            const rect = ivPercentileCanvasRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            drawChart(ivPercentileCanvasRef.current, data, 'ivPercentile', 'IV PERCENTILE', '#9D4EDD', { x, y });
        };

        const handlePercentileMouseLeave = () => {
            drawChart(ivPercentileCanvasRef.current, data, 'ivPercentile', 'IV PERCENTILE', '#9D4EDD', null);
        };

        callPutIVCanvasRef.current.addEventListener('mousemove', handleCallPutMouseMove);
        callPutIVCanvasRef.current.addEventListener('mouseleave', handleCallPutMouseLeave);
        ivRankCanvasRef.current.addEventListener('mousemove', handleRankMouseMove);
        ivRankCanvasRef.current.addEventListener('mouseleave', handleRankMouseLeave);
        ivPercentileCanvasRef.current.addEventListener('mousemove', handlePercentileMouseMove);
        ivPercentileCanvasRef.current.addEventListener('mouseleave', handlePercentileMouseLeave);

        return () => {
            if (callPutIVCanvasRef.current) {
                callPutIVCanvasRef.current.removeEventListener('mousemove', handleCallPutMouseMove);
                callPutIVCanvasRef.current.removeEventListener('mouseleave', handleCallPutMouseLeave);
            }
            if (ivRankCanvasRef.current) {
                ivRankCanvasRef.current.removeEventListener('mousemove', handleRankMouseMove);
                ivRankCanvasRef.current.removeEventListener('mouseleave', handleRankMouseLeave);
            }
            if (ivPercentileCanvasRef.current) {
                ivPercentileCanvasRef.current.removeEventListener('mousemove', handlePercentileMouseMove);
                ivPercentileCanvasRef.current.removeEventListener('mouseleave', handlePercentileMouseLeave);
            }
        };
    }, [data, showNet, showCall, showPut]);

    const currentData = data.length > 0 ? data[data.length - 1] : null;

    return (
        <div style={{
            background: 'linear-gradient(145deg, #020B14, #000508)',
            border: '1px solid rgba(30, 58, 138, 0.2)',
            borderRadius: '8px',
            padding: '15px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 -1px 0 rgba(255, 255, 255, 0.05)',
            height: '780px',
            display: 'flex',
            flexDirection: 'column'
        }}>
            {/* Panel Title */}
            <div style={{
                fontSize: '19px',
                fontWeight: '800',
                fontFamily: 'monospace',
                color: '#FFFFFF',
                marginBottom: '12px',
                letterSpacing: '2px',
                textAlign: 'center',
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.8)',
                background: 'linear-gradient(90deg, #9333EA, #C084FC, #9333EA)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                filter: 'contrast(1.2) brightness(1.1)'
            }}>
                IMPLIED VOLATILITY STATS
            </div>

            {data.length === 0 ? (
                <div style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#666',
                    fontSize: '14px',
                    fontFamily: 'monospace',
                    gap: '10px'
                }}>
                    {isScanning ? (
                        <>
                            <div style={{
                                width: '16px',
                                height: '16px',
                                border: '2px solid #333',
                                borderTop: '2px solid #9333EA',
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite'
                            }} />
                            <span>Scanning IV</span>
                        </>
                    ) : (
                        ticker ? 'No IV Found' : 'No IV Data'
                    )}
                </div>
            ) : (
                <>
                    {/* Header with Period Selector and Current IV Values */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '15px',
                        paddingBottom: '10px',
                        borderBottom: '1px solid rgba(192, 192, 192, 0.2)'
                    }}>        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                            <div>
                                <span style={{
                                    fontSize: '10px',
                                    color: '#FFFFFF',
                                    opacity: 0.6,
                                    fontFamily: 'monospace',
                                    marginRight: '8px'
                                }}>CALL IV:</span>
                                <span style={{
                                    fontSize: '14px',
                                    color: '#00FF00',
                                    fontFamily: 'monospace',
                                    fontWeight: '700'
                                }}>{currentData?.callIV.toFixed(2)}%</span>
                            </div>
                            <div>
                                <span style={{
                                    fontSize: '10px',
                                    color: '#FFFFFF',
                                    opacity: 0.6,
                                    fontFamily: 'monospace',
                                    marginRight: '8px'
                                }}>PUT IV:</span>
                                <span style={{
                                    fontSize: '14px',
                                    color: '#FF0000',
                                    fontFamily: 'monospace',
                                    fontWeight: '700'
                                }}>{currentData?.putIV.toFixed(2)}%</span>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            {/* IV Toggle Buttons */}
                            <div style={{ display: 'flex', gap: '6px', marginRight: '10px' }}>
                                <button
                                    onClick={() => setShowNet(!showNet)}
                                    style={{
                                        background: showNet ? '#FF8C00' : 'linear-gradient(145deg, #1A1A1A, #0A0A0A)',
                                        color: showNet ? '#000000' : '#FFFFFF',
                                        border: '1px solid ' + (showNet ? '#FF8C00' : 'rgba(192, 192, 192, 0.3)'),
                                        padding: '5px 10px',
                                        fontSize: '10px',
                                        fontFamily: 'monospace',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        letterSpacing: '0.5px',
                                        borderRadius: '3px'
                                    }}
                                >
                                    NET
                                </button>
                                <button
                                    onClick={() => setShowCall(!showCall)}
                                    style={{
                                        background: showCall ? '#00FF00' : 'linear-gradient(145deg, #1A1A1A, #0A0A0A)',
                                        color: showCall ? '#000000' : '#FFFFFF',
                                        border: '1px solid ' + (showCall ? '#00FF00' : 'rgba(192, 192, 192, 0.3)'),
                                        padding: '5px 10px',
                                        fontSize: '10px',
                                        fontFamily: 'monospace',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        letterSpacing: '0.5px',
                                        borderRadius: '3px'
                                    }}
                                >
                                    CALL
                                </button>
                                <button
                                    onClick={() => setShowPut(!showPut)}
                                    style={{
                                        background: showPut ? '#FF0000' : 'linear-gradient(145deg, #1A1A1A, #0A0A0A)',
                                        color: showPut ? '#000000' : '#FFFFFF',
                                        border: '1px solid ' + (showPut ? '#FF0000' : 'rgba(192, 192, 192, 0.3)'),
                                        padding: '5px 10px',
                                        fontSize: '10px',
                                        fontFamily: 'monospace',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        letterSpacing: '0.5px',
                                        borderRadius: '3px'
                                    }}
                                >
                                    PUT
                                </button>
                            </div>

                            {/* Period Selector */}
                            <div style={{ display: 'flex', gap: '8px' }}>
                                {(['1Y', '2Y', '5Y'] as const).map((p) => (
                                    <button
                                        key={p}
                                        onClick={() => onPeriodChange(p)}
                                        style={{
                                            background: period === p
                                                ? 'linear-gradient(145deg, #FFFFFF, #D0D0D0)'
                                                : 'linear-gradient(145deg, #1A1A1A, #0A0A0A)',
                                            color: period === p ? '#000000' : '#FFFFFF',
                                            border: '1px solid rgba(192, 192, 192, 0.4)',
                                            padding: '6px 12px',
                                            fontSize: '11px',
                                            fontFamily: 'monospace',
                                            fontWeight: '700',
                                            cursor: 'pointer',
                                            letterSpacing: '1px',
                                            borderRadius: '4px',
                                            boxShadow: period === p
                                                ? '0 2px 8px rgba(255, 255, 255, 0.2)'
                                                : 'inset 0 2px 4px rgba(0, 0, 0, 0.5)'
                                        }}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Charts Stacked Vertically */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                    }}>
                        <div style={{
                            background: 'linear-gradient(145deg, #0A0A0A, #000000)',
                            borderRadius: '4px',
                            padding: '2px',
                            boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.8)',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center'
                        }}>
                            <canvas ref={callPutIVCanvasRef} style={{ display: 'block', border: '1px solid rgba(30, 58, 138, 0.2)' }} />
                        </div>

                        <div style={{
                            background: 'linear-gradient(145deg, #0A0A0A, #000000)',
                            borderRadius: '4px',
                            padding: '2px',
                            boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.8)',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center'
                        }}>
                            <canvas ref={ivRankCanvasRef} style={{ display: 'block', border: '1px solid rgba(30, 58, 138, 0.2)' }} />
                        </div>

                        <div style={{
                            background: 'linear-gradient(145deg, #0A0A0A, #000000)',
                            borderRadius: '4px',
                            padding: '2px',
                            boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.8)',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center'
                        }}>
                            <canvas ref={ivPercentileCanvasRef} style={{ display: 'block', border: '1px solid rgba(30, 58, 138, 0.2)' }} />
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

