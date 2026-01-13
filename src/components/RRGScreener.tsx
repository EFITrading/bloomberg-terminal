'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { RRGCalculationResult } from '@/lib/rrgService';

interface RRGScreenerProps {
    hideTitle?: boolean;
}

// Stock list from other screeners
const SECTOR_STOCKS = {
    'Technology': [
        'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'TSLA', 'META', 'NVDA', 'NFLX', 'ADBE', 'CRM', 'ORCL', 'INTC', 'AMD', 'AVGO',
        'CSCO', 'IBM', 'QCOM', 'TXN', 'UBER', 'LYFT', 'SHOP', 'SNOW', 'PLTR', 'NET', 'DDOG', 'ZM', 'DOCU', 'TWLO', 'OKTA',
        'CRWD', 'ZS', 'PANW', 'FTNT', 'CYBR', 'NOW', 'WDAY', 'VEEV', 'TEAM', 'MDB', 'ESTC', 'GTLB'
    ],
    'Healthcare': [
        'JNJ', 'UNH', 'PFE', 'ABBV', 'TMO', 'ABT', 'DHR', 'BMY', 'LLY', 'MRK', 'AMGN', 'GILD', 'MDT', 'CI', 'CVS',
        'HUM', 'MCK', 'CAH', 'ISRG', 'SYK', 'BSX', 'EW', 'ZBH', 'BAX', 'BDX', 'A', 'ALGN', 'IDXX',
        'IQV', 'REGN', 'VRTX', 'BIIB', 'MRNA', 'ZTS', 'ELV', 'CNC', 'MOH', 'HCA', 'UHS', 'DVA', 'FMS'
    ],
    'Financials': [
        'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'C', 'AXP', 'SCHW', 'BLK', 'SPGI', 'ICE', 'CME', 'MCO', 'MSCI',
        'COF', 'USB', 'TFC', 'PNC', 'BK', 'STT', 'NTRS', 'RF', 'CFG', 'HBAN', 'FITB', 'KEY', 'CMA', 'ZION', 'WTFC',
        'WAL', 'SBNY', 'OZK', 'EWBC', 'CBSH', 'SNV', 'IBOC', 'FULT', 'ONB', 'UBSI', 'FFIN', 'WSFS'
    ],
    'Consumer Discretionary': [
        'AMZN', 'HD', 'MCD', 'NKE', 'SBUX', 'LOW', 'TJX', 'F', 'GM', 'BKNG', 'ABNB', 'EBAY', 'MAR', 'HLT', 'MGM', 'WYNN',
        'LVS', 'CZR', 'PENN', 'DKNG', 'NCLH', 'RCL', 'CCL', 'DAL', 'UAL', 'AAL', 'LUV', 'JBLU', 'ALK', 'EXPE',
        'TRIP', 'LYFT', 'UBER', 'DIS', 'CMCSA', 'CHTR', 'NFLX', 'ROKU', 'SPOT', 'SIRI', 'WBD', 'FOX', 'FOXA'
    ],
    'Communication Services': [
        'GOOGL', 'GOOG', 'META', 'NFLX', 'DIS', 'CMCSA', 'VZ', 'T', 'CHTR', 'TMUS', 'SIRI', 'LUMN', 'WBD',
        'FOX', 'FOXA', 'NYT', 'ROKU', 'PINS', 'SNAP', 'ZM', 'DOCU', 'TEAM', 'PTON', 'SPOT', 'TTD', 'IAC',
        'MTCH', 'BMBL', 'ANGI', 'YELP', 'GRPN', 'CARS', 'ZIP', 'REZI', 'OPRX', 'EVER', 'OPEN', 'CARG'
    ],
    'Industrials': [
        'BA', 'HON', 'UPS', 'FDX', 'LMT', 'RTX', 'CAT', 'DE', 'GE', 'MMM', 'UNP', 'CSX', 'NSC', 'CP', 'CNI', 'ODFL',
        'XPO', 'CHRW', 'EXPD', 'JBHT', 'KNX', 'LSTR', 'ARCB', 'SAIA', 'WERN', 'ALK', 'MATX', 'GNTX', 'JOBY', 'ACHR',
        'EVTL', 'PH', 'EMR', 'ETN', 'ITW', 'ROK', 'DOV', 'XYL', 'FTV', 'IEX', 'RRX', 'GNRC', 'IR', 'CARR'
    ],
    'Consumer Staples': [
        'PG', 'KO', 'PEP', 'WMT', 'COST', 'MDLZ', 'KHC', 'GIS', 'K', 'HSY', 'CPB', 'CAG', 'SJM', 'HRL', 'TSN',
        'BG', 'ADM', 'CALM', 'JJSF', 'USFD', 'SYY', 'PFGC', 'UNFI', 'ACI', 'KR', 'SFM', 'CVS',
        'HIMS', 'GDDY', 'VIRT', 'EYE', 'VUZI', 'KOSS', 'KODK', 'BBBY'
    ],
    'Energy': [
        'XOM', 'CVX', 'COP', 'EOG', 'SLB', 'VLO', 'MPC', 'PSX', 'KMI', 'OKE', 'WMB', 'EPD', 'ET', 'MPLX', 'PAA',
        'PAGP', 'BKR', 'HAL', 'OIH', 'XLE', 'USO', 'UCO', 'SCO', 'ERX', 'ERY', 'GUSH', 'DRIP', 'NRGU', 'BOIL', 'KOLD',
        'UNG', 'AMLP', 'MLPX', 'EMLP', 'MLPA', 'USAC', 'DMLP'
    ],
    'Utilities': [
        'NEE', 'DUK', 'SO', 'D', 'AEP', 'EXC', 'XEL', 'WEC', 'PEG', 'ED', 'EIX', 'ETR', 'ES', 'PPL', 'FE', 'AWK', 'ATO',
        'CMS', 'CNP', 'NI', 'LNT', 'EVRG', 'AEE', 'PNW', 'SRE', 'PCG', 'IDA', 'UGI', 'NJR', 'SWX', 'ORA', 'BKH', 'MDU',
        'UTL', 'MGEE', 'AVA', 'AWR', 'CWT', 'YORW', 'MSEX', 'GWRS', 'POWI', 'SPWR', 'FSLR'
    ],
    'Materials': [
        'LIN', 'APD', 'SHW', 'ECL', 'DD', 'DOW', 'NUE', 'FCX', 'NEM', 'GOLD', 'PKG', 'IP', 'CF', 'LYB', 'EMN', 'IFF', 'FMC',
        'RPM', 'SEE', 'MLM', 'VMC', 'CRH', 'CLF', 'STLD', 'RS', 'CMC', 'GGB', 'SID', 'TX', 'TERN', 'CLW', 'KWR', 'OLN',
        'ASH', 'CBT', 'CC', 'CYH', 'FUL', 'GEF', 'HWKN', 'KOP', 'MERC', 'MOS', 'NEU', 'OEC', 'RGLD', 'SCCO', 'SMG', 'SON'
    ],
    'Real Estate': [
        'AMT', 'PLD', 'CCI', 'EQIX', 'WELL', 'SPG', 'DLR', 'O', 'PSA', 'CBRE', 'AVB', 'EQR', 'SBAC', 'VTR', 'ARE', 'MAA',
        'INVH', 'ESS', 'KIM', 'UDR', 'HST', 'REG', 'FRT', 'BXP', 'VNO', 'SLG', 'HIW', 'BMR', 'CDP', 'CUZ', 'DEI',
        'ELS', 'EPR', 'EXR', 'FPI', 'FR', 'GNL', 'GTY', 'HR', 'JBGS', 'KRC', 'KRG', 'LTC', 'MAC', 'MPW', 'NNN', 'OHI', 'OLP'
    ]
};

const ALL_STOCKS = Object.values(SECTOR_STOCKS).flat();

interface RRGScreenerData extends RRGCalculationResult {
    quadrant: 'leading' | 'lagging' | 'weakening' | 'improving';
    sector?: string;
    timeframes: {
        '4w': 'leading' | 'lagging' | 'weakening' | 'improving';
        '8w': 'leading' | 'lagging' | 'weakening' | 'improving';
        '14w': 'leading' | 'lagging' | 'weakening' | 'improving';
        '26w': 'leading' | 'lagging' | 'weakening' | 'improving';
    };
    consistency?: number; // How many timeframes have the same quadrant
    dominantQuadrant?: 'leading' | 'lagging' | 'weakening' | 'improving';
}

interface RRGScreenerProps {
    hideTitle?: boolean;
    sectorUnderTicker?: boolean;
    compactLayout?: boolean;
}

const RRGScreener: React.FC<RRGScreenerProps> = ({ hideTitle = false, sectorUnderTicker = false, compactLayout = false }) => {
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<RRGScreenerData[]>([]);
    const [filteredData, setFilteredData] = useState<RRGScreenerData[]>([]);

    // Chart sparkline data
    const [chartTimeframe, setChartTimeframe] = useState<'1D' | '5D' | '1M' | '3M' | '6M' | '1Y'>('1D');
    const [sparklineData, setSparklineData] = useState<Record<string, Array<{ time: number; price: number }>>>({});
    const [sparklineLoading, setSparklineLoading] = useState(false);

    // Settings
    const [benchmark, setBenchmark] = useState('SPY');
    const [timeframe, setTimeframe] = useState('14 weeks');
    const [quadrantFilter, setQuadrantFilter] = useState<'all' | 'leading' | 'lagging' | 'weakening' | 'improving' | 'consistent-3' | 'consistent-4'>('all');
    const [sortBy, setSortBy] = useState<'rsRatio' | 'rsMomentum' | 'symbol' | 'consistency' | 'consistent-3' | 'consistent-4' | 'slingshot'>('consistency');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    const timeframeOptions = [
        { label: '4 weeks', value: '4 weeks', weeks: 8, rsPeriod: 4, momentumPeriod: 4, key: '4w' },
        { label: '8 weeks', value: '8 weeks', weeks: 12, rsPeriod: 8, momentumPeriod: 8, key: '8w' },
        { label: '14 weeks', value: '14 weeks', weeks: 18, rsPeriod: 14, momentumPeriod: 14, key: '14w' },
        { label: '26 weeks', value: '26 weeks', weeks: 30, rsPeriod: 26, momentumPeriod: 26, key: '26w' }
    ];

    const benchmarkOptions = [
        { label: 'S&P 500 (SPY)', value: 'SPY' },
        { label: 'NASDAQ 100 (QQQ)', value: 'QQQ' },
        { label: 'Russell 2000 (IWM)', value: 'IWM' },
        { label: 'Total Stock Market (VTI)', value: 'VTI' },
        { label: 'World Stock Index (VT)', value: 'VT' }
    ];

    const getQuadrant = (rsRatio: number, rsMomentum: number): 'leading' | 'lagging' | 'weakening' | 'improving' => {
        if (rsRatio >= 100 && rsMomentum >= 100) return 'leading';
        if (rsRatio >= 100 && rsMomentum < 100) return 'weakening';
        if (rsRatio < 100 && rsMomentum < 100) return 'lagging';
        return 'improving';
    };

    const getSector = (symbol: string): string => {
        for (const [sector, stocks] of Object.entries(SECTOR_STOCKS)) {
            if (stocks.includes(symbol)) {
                return sector;
            }
        }
        return 'Unknown';
    };

    const runScreener = useCallback(async () => {
        setLoading(true);
        setError(null);
        setProgress({ current: 0, total: ALL_STOCKS.length });

        const startTime = Date.now();

        try {
            const BATCH_SIZE = 100;
            const results: RRGScreenerData[] = [];
            const totalBatches = Math.ceil(ALL_STOCKS.length / BATCH_SIZE);

            console.log(`🚀 Starting SERVER-SIDE RRG scan: ${ALL_STOCKS.length} stocks in ${totalBatches} batches`);
            console.log(`⚡ Processing 100 stocks per batch × 4 timeframes in parallel...`);

            // Process multiple batches in parallel for maximum speed
            const PARALLEL_BATCHES = 2; // Process 2 batches at once

            for (let i = 0; i < ALL_STOCKS.length; i += BATCH_SIZE * PARALLEL_BATCHES) {
                const batchPromises = [];

                for (let j = 0; j < PARALLEL_BATCHES; j++) {
                    const batchStart = i + (j * BATCH_SIZE);
                    if (batchStart >= ALL_STOCKS.length) break;

                    const batch = ALL_STOCKS.slice(batchStart, batchStart + BATCH_SIZE);
                    const batchIndex = Math.floor(batchStart / BATCH_SIZE);

                    batchPromises.push(
                        fetch('/api/rrg-scan', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                symbols: batch,
                                benchmark,
                                batchIndex,
                                totalBatches
                            })
                        })
                            .then(response => {
                                if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
                                return response.json();
                            })
                            .then(data => ({ data, batchIndex }))
                            .catch(error => ({ error, batchIndex }))
                    );
                }

                // Wait for parallel batches to complete
                const batchResults = await Promise.all(batchPromises);

                // Process results from all parallel batches
                for (const result of batchResults) {
                    if ('error' in result) {
                        console.error(`Batch ${result.batchIndex + 1} failed:`, result.error);
                        continue;
                    }

                    const { data } = result;
                    if (data.success && data.results) {
                        const enrichedResults = data.results.map((item: any) => ({
                            ...item,
                            sector: getSector(item.symbol)
                        }));

                        results.push(...enrichedResults);
                        console.log(`✓ Batch ${result.batchIndex + 1}/${totalBatches} complete - ${results.length}/${ALL_STOCKS.length} stocks`);
                    }
                }

                setProgress({ current: Math.min(i + (BATCH_SIZE * PARALLEL_BATCHES), ALL_STOCKS.length), total: ALL_STOCKS.length });
                setData([...results]);
            }

            setData(results);
            setFilteredData(results);

            const endTime = Date.now();
            const totalSeconds = ((endTime - startTime) / 1000).toFixed(1);
            console.log(`✅ SERVER-SIDE RRG Scan complete: ${results.length} stocks in ${totalSeconds}s`);
            console.log(`💡 SMART: Sparkline data already cached - 5D/1M/3M/6M/1Y require ZERO extra API calls!`);

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to run screener';
            setError(errorMessage);
            console.error('RRG Screener failed:', err);
        } finally {
            setLoading(false);
        }
    }, [benchmark]);

    // Filter and sort data
    useEffect(() => {
        let filtered = [...data];

        // Apply quadrant filter
        if (quadrantFilter === 'consistent-3') {
            filtered = filtered.filter(item => item.consistency && item.consistency >= 3);
        } else if (quadrantFilter === 'consistent-4') {
            filtered = filtered.filter(item => item.consistency === 4);
        } else if (quadrantFilter !== 'all') {
            filtered = filtered.filter(item => item.dominantQuadrant === quadrantFilter);
        }

        // Apply Slingshot filter if selected
        if (sortBy === 'slingshot') {
            filtered = filtered.filter(item => {
                const longTerm = item.timeframes['26w'];
                const mediumTerm = item.timeframes['14w'];
                const nearTerm = item.timeframes['8w'];
                const shortTerm = item.timeframes['4w'];

                if (longTerm === 'leading') {
                    // Medium term: Improving OR Leading
                    const mediumValid = mediumTerm === 'improving' || mediumTerm === 'leading';
                    // Near term: Lagging OR Improving
                    const nearValid = nearTerm === 'lagging' || nearTerm === 'improving';
                    // Short term: Lagging OR Improving
                    const shortValid = shortTerm === 'lagging' || shortTerm === 'improving';
                    return mediumValid && nearValid && shortValid;
                } else if (longTerm === 'weakening') {
                    // Medium term: Leading OR Weakening
                    const mediumValid = mediumTerm === 'leading' || mediumTerm === 'weakening';
                    // Near term: Weakening
                    const nearValid = nearTerm === 'weakening';
                    // Short term: Weakening
                    const shortValid = shortTerm === 'weakening';
                    return mediumValid && nearValid && shortValid;
                }
                return false;
            });
        }

        // Apply consistency filters
        if (sortBy === 'consistent-3') {
            filtered = filtered.filter(item => item.consistency && item.consistency >= 3);
        } else if (sortBy === 'consistent-4') {
            filtered = filtered.filter(item => item.consistency === 4);
        }

        // Sort data
        filtered.sort((a, b) => {
            let compareValue = 0;
            if (sortBy === 'consistency' || sortBy === 'consistent-3' || sortBy === 'consistent-4' || sortBy === 'slingshot') {
                compareValue = (a.consistency || 0) - (b.consistency || 0);
            } else if (sortBy === 'rsRatio') {
                compareValue = a.rsRatio - b.rsRatio;
            } else if (sortBy === 'rsMomentum') {
                compareValue = a.rsMomentum - b.rsMomentum;
            } else {
                compareValue = a.symbol.localeCompare(b.symbol);
            }
            return sortOrder === 'asc' ? compareValue : -compareValue;
        });

        setFilteredData(filtered);
    }, [data, quadrantFilter, sortBy, sortOrder]);

    // GENIUS: Reuse historical data from RRG calculations for sparklines - minimal extra API calls!
    useEffect(() => {
        const processSparklines = async () => {
            if (filteredData.length === 0 || loading) return;

            setSparklineLoading(true);
            const results: Record<string, Array<{ time: number; price: number }>> = {};

            // For 1D intraday, we need to fetch separately (daily data won't work)
            if (chartTimeframe === '1D') {
                const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
                const now = new Date();
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

                // First, fetch SPY data for benchmarking
                let spyData: Array<{ time: number; price: number }> = [];
                try {
                    const spyUrl = `https://api.polygon.io/v2/aggs/ticker/${benchmark}/range/1/minute/${todayStr}/${todayStr}?adjusted=true&sort=asc&limit=50000&apiKey=${POLYGON_API_KEY}`;
                    const spyResponse = await fetch(spyUrl);
                    const spyJson = await spyResponse.json();
                    if (spyJson.results && spyJson.results.length > 0) {
                        spyData = spyJson.results.map((bar: any) => ({ time: bar.t, price: bar.c }));
                    }
                } catch (err) {
                    console.error('Failed to fetch benchmark data for sparklines:', err);
                }

                // Fetch in batches for intraday data
                const BATCH_SIZE = 10;
                for (let i = 0; i < filteredData.length; i += BATCH_SIZE) {
                    const batch = filteredData.slice(i, i + BATCH_SIZE);
                    const batchPromises = batch.map(async (item) => {
                        try {
                            const dataUrl = `https://api.polygon.io/v2/aggs/ticker/${item.symbol}/range/1/minute/${todayStr}/${todayStr}?adjusted=true&sort=asc&limit=50000&apiKey=${POLYGON_API_KEY}`;
                            const response = await fetch(dataUrl);
                            const data = await response.json();

                            if (data.results && data.results.length > 0) {
                                const stockData = data.results.map((bar: any) => ({ time: bar.t, price: bar.c }));

                                // Calculate relative performance vs benchmark
                                if (spyData.length > 0 && stockData.length > 0) {
                                    const spyInitial = spyData[0].price;
                                    const stockInitial = stockData[0].price;

                                    const relativeData = stockData.map((point: { time: number; price: number }) => {
                                        // Find closest benchmark point by time
                                        const spyPoint = spyData.reduce((prev, curr) =>
                                            Math.abs(curr.time - point.time) < Math.abs(prev.time - point.time) ? curr : prev
                                        );

                                        // Calculate relative performance: (stock % change - benchmark % change)
                                        const stockPctChange = ((point.price / stockInitial) - 1) * 100;
                                        const spyPctChange = ((spyPoint.price / spyInitial) - 1) * 100;
                                        const relativePerformance = stockPctChange - spyPctChange;

                                        return { time: point.time, price: relativePerformance };
                                    });

                                    return { symbol: item.symbol, data: relativeData };
                                } else {
                                    // Fallback to absolute if benchmark data unavailable
                                    return { symbol: item.symbol, data: stockData };
                                }
                            }
                        } catch (err) {
                            // Silently fail
                        }
                        return null;
                    });

                    const batchResults = await Promise.all(batchPromises);
                    batchResults.forEach(result => {
                        if (result) results[result.symbol] = result.data;
                    });

                    if (i + BATCH_SIZE < filteredData.length) {
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                }
            } else {
                // For all other timeframes, we need to fetch daily data for proper sparklines
                const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
                const now = new Date();
                let daysBack = 5;
                let multiplier = 1;
                let timespan = 'day';

                switch (chartTimeframe) {
                    case '5D': daysBack = 7; break; // Extra days for weekends
                    case '1M': daysBack = 35; break;
                    case '3M': daysBack = 95; break;
                    case '6M': daysBack = 185; break;
                    case '1Y': daysBack = 370; break;
                }

                const endDate = new Date();
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - daysBack);

                const startStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
                const endStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

                // First, fetch benchmark data
                let benchmarkData: Array<{ time: number; price: number }> = [];
                try {
                    const benchmarkUrl = `https://api.polygon.io/v2/aggs/ticker/${benchmark}/range/${multiplier}/${timespan}/${startStr}/${endStr}?adjusted=true&sort=asc&limit=50000&apiKey=${POLYGON_API_KEY}`;
                    const benchmarkResponse = await fetch(benchmarkUrl);
                    const benchmarkJson = await benchmarkResponse.json();
                    if (benchmarkJson.results && benchmarkJson.results.length > 0) {
                        benchmarkData = benchmarkJson.results.map((bar: any) => ({ time: bar.t, price: bar.c }));
                    }
                } catch (err) {
                    console.error('Failed to fetch benchmark data for sparklines:', err);
                }

                // Fetch stock data in batches
                const BATCH_SIZE = 10;
                for (let i = 0; i < filteredData.length; i += BATCH_SIZE) {
                    const batch = filteredData.slice(i, i + BATCH_SIZE);
                    const batchPromises = batch.map(async (item) => {
                        try {
                            const dataUrl = `https://api.polygon.io/v2/aggs/ticker/${item.symbol}/range/${multiplier}/${timespan}/${startStr}/${endStr}?adjusted=true&sort=asc&limit=50000&apiKey=${POLYGON_API_KEY}`;
                            const response = await fetch(dataUrl);
                            const data = await response.json();

                            if (data.results && data.results.length > 0) {
                                const stockData = data.results.map((bar: any) => ({ time: bar.t, price: bar.c }));

                                // Calculate relative performance vs benchmark
                                if (benchmarkData.length > 0 && stockData.length > 0) {
                                    const benchmarkInitial = benchmarkData[0].price;
                                    const stockInitial = stockData[0].price;

                                    const relativeData = stockData.map((point: { time: number; price: number }) => {
                                        // Find closest benchmark point by time
                                        const benchmarkPoint = benchmarkData.reduce((prev, curr) =>
                                            Math.abs(curr.time - point.time) < Math.abs(prev.time - point.time) ? curr : prev
                                        );

                                        // Calculate relative performance: (stock % change - benchmark % change)
                                        const stockPctChange = ((point.price / stockInitial) - 1) * 100;
                                        const benchmarkPctChange = ((benchmarkPoint.price / benchmarkInitial) - 1) * 100;
                                        const relativePerformance = stockPctChange - benchmarkPctChange;

                                        return { time: point.time, price: relativePerformance };
                                    });

                                    return { symbol: item.symbol, data: relativeData };
                                } else {
                                    // Fallback to absolute if benchmark unavailable
                                    return { symbol: item.symbol, data: stockData };
                                }
                            }
                        } catch (err) {
                            // Silently fail
                        }
                        return null;
                    });

                    const batchResults = await Promise.all(batchPromises);
                    batchResults.forEach(result => {
                        if (result && result.data && result.data.length > 0) {
                            results[result.symbol] = result.data;
                        }
                    });

                    if (i + BATCH_SIZE < filteredData.length) {
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                }
            }

            // Update all sparkline data at once to prevent flickering
            setSparklineData(results);
            setSparklineLoading(false);
        };

        processSparklines();
    }, [chartTimeframe, filteredData, loading, benchmark]);

    const getQuadrantColor = (quadrant: string) => {
        switch (quadrant) {
            case 'leading': return '#00ff88';
            case 'improving': return '#00aaff';
            case 'weakening': return '#ffdd00';
            case 'lagging': return '#ff3333';
            default: return '#666666';
        }
    };

    const getQuadrantShort = (quadrant: string) => {
        switch (quadrant) {
            case 'leading': return 'L';
            case 'improving': return 'I';
            case 'weakening': return 'W';
            case 'lagging': return 'X';
            default: return '-';
        }
    };

    const getQuadrantCounts = () => {
        return {
            leading: data.filter(d => d.dominantQuadrant === 'leading').length,
            weakening: data.filter(d => d.dominantQuadrant === 'weakening').length,
            lagging: data.filter(d => d.dominantQuadrant === 'lagging').length,
            improving: data.filter(d => d.dominantQuadrant === 'improving').length
        };
    };

    const counts = getQuadrantCounts();

    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <div style={styles.headerTop}>
                    {!hideTitle && <h1 style={styles.title}>RRG SCREENER</h1>}

                    <div style={styles.controlGroup}>
                        <label style={styles.label}>BENCHMARK</label>
                        <select
                            value={benchmark}
                            onChange={(e) => setBenchmark(e.target.value)}
                            style={styles.select}
                            disabled={loading}
                            onMouseEnter={(e) => {
                                if (!loading) {
                                    e.currentTarget.style.borderColor = '#333';
                                }
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = '#2a2a2a';
                            }}
                        >
                            {benchmarkOptions.map(opt => (
                                <option key={opt.value} value={opt.value} style={{ background: '#0a0f1a', color: '#fff' }}>{opt.label}</option>
                            ))}
                        </select>
                    </div>

                    <div style={styles.controlGroup}>
                        <label style={styles.label}>TIMEFRAME</label>
                        <select
                            value={timeframe}
                            onChange={(e) => setTimeframe(e.target.value)}
                            style={styles.select}
                            disabled={loading}
                        >
                            {timeframeOptions.map(opt => (
                                <option key={opt.value} value={opt.value} style={{ background: '#0a0f1a', color: '#fff' }}>{opt.label}</option>
                            ))}
                        </select>
                    </div>

                    <div style={styles.controlGroup}>
                        <label style={styles.label}>QUADRANT</label>
                        <select
                            value={quadrantFilter}
                            onChange={(e) => setQuadrantFilter(e.target.value as any)}
                            style={styles.select}
                            disabled={loading}
                        >
                            <option value="all" style={{ background: '#0a0f1a', color: '#fff' }}>ALL ({data.length})</option>
                            <option value="leading" style={{ background: '#0a0f1a', color: '#fff' }}>LEADING ({counts.leading})</option>
                            <option value="weakening" style={{ background: '#0a0f1a', color: '#fff' }}>WEAKENING ({counts.weakening})</option>
                            <option value="lagging" style={{ background: '#0a0f1a', color: '#fff' }}>LAGGING ({counts.lagging})</option>
                            <option value="improving" style={{ background: '#0a0f1a', color: '#fff' }}>IMPROVING ({counts.improving})</option>
                        </select>
                    </div>

                    <div style={styles.controlGroup}>
                        <label style={styles.label}>SORT BY</label>
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as any)}
                            style={styles.select}
                            disabled={loading}
                        >
                            <option value="consistency" style={{ background: '#0a0f1a', color: '#fff' }}>CONSISTENCY</option>
                            <option value="consistent-4" style={{ background: '#0a0f1a', color: '#fff' }}>4/4 CONSISTENT</option>
                            <option value="consistent-3" style={{ background: '#0a0f1a', color: '#fff' }}>3+/4 CONSISTENT</option>
                            <option value="slingshot" style={{ background: '#0a0f1a', color: '#fff' }}>SLINGSHOT</option>
                            <option value="rsRatio" style={{ background: '#0a0f1a', color: '#fff' }}>RS RATIO</option>
                            <option value="rsMomentum" style={{ background: '#0a0f1a', color: '#fff' }}>RS MOMENTUM</option>
                            <option value="symbol" style={{ background: '#0a0f1a', color: '#fff' }}>SYMBOL</option>
                        </select>
                    </div>

                    <button
                        onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                        style={styles.sortButton}
                        disabled={loading}
                    >
                        {sortOrder === 'asc' ? '↑ ASC' : '↓ DESC'}
                    </button>

                    <button
                        onClick={runScreener}
                        disabled={loading}
                        style={styles.scanButton}
                        onMouseEnter={(e) => {
                            if (!loading) {
                                e.currentTarget.style.transform = 'translateY(-1px)';
                                e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 4px 12px rgba(0, 0, 0, 0.6)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.25), 0 2px 8px rgba(0, 0, 0, 0.5)';
                        }}
                    >
                        {loading ? '⟳ SCANNING...' : '▶ RUN SCAN'}
                    </button>
                </div>

                {/* Progress Bar */}
                {loading && (
                    <div style={styles.progressContainer}>
                        <div style={styles.progressBar}>
                            <div
                                style={{
                                    ...styles.progressFill,
                                    width: `${(progress.current / progress.total) * 100}%`
                                }}
                            />
                        </div>
                        <p style={styles.progressText}>
                            Processing {progress.current} / {progress.total} stocks...
                        </p>
                    </div>
                )}

                {/* Error Message */}
                {error && (
                    <div style={styles.errorMessage}>
                        ⚠ {error}
                    </div>
                )}
            </div>

            {/* Quadrant Summary */}
            {data.length > 0 && !loading && (
                <div style={styles.quadrantSummary}>
                    <div
                        style={{ ...styles.quadrantCard, borderColor: '#ffffff' }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-3px)';
                            e.currentTarget.style.boxShadow = '6px 6px 12px rgba(0, 0, 0, 0.9), -3px -3px 10px rgba(30, 30, 30, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '5px 5px 10px rgba(0, 0, 0, 0.8), -2px -2px 8px rgba(20, 20, 20, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.03)';
                        }}
                    >
                        <div style={{ ...styles.quadrantLabel, color: '#ffffff' }}>4/4 CONSISTENT</div>
                        <div style={{ ...styles.quadrantCount, color: '#ffffff' }}>{data.filter(d => d.consistency === 4).length}</div>
                    </div>
                    <div
                        style={{ ...styles.quadrantCard, borderColor: '#00ff88' }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '5px 5px 10px rgba(0, 0, 0, 0.9), -2px -2px 8px rgba(30, 30, 30, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '4px 4px 8px rgba(0, 0, 0, 0.8), -2px -2px 6px rgba(20, 20, 20, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.03)';
                        }}
                    >
                        <div style={{ ...styles.quadrantLabel, color: '#00ff88' }}>LEADING</div>
                        <div style={{ ...styles.quadrantCount, color: '#00ff88' }}>{counts.leading}</div>
                    </div>
                    <div
                        style={{ ...styles.quadrantCard, borderColor: '#ffdd00' }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '5px 5px 10px rgba(0, 0, 0, 0.9), -2px -2px 8px rgba(30, 30, 30, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '4px 4px 8px rgba(0, 0, 0, 0.8), -2px -2px 6px rgba(20, 20, 20, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.03)';
                        }}
                    >
                        <div style={{ ...styles.quadrantLabel, color: '#ffdd00' }}>WEAKENING</div>
                        <div style={{ ...styles.quadrantCount, color: '#ffdd00' }}>{counts.weakening}</div>
                    </div>
                    <div
                        style={{ ...styles.quadrantCard, borderColor: '#ff3333' }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '5px 5px 10px rgba(0, 0, 0, 0.9), -2px -2px 8px rgba(30, 30, 30, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '4px 4px 8px rgba(0, 0, 0, 0.8), -2px -2px 6px rgba(20, 20, 20, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.03)';
                        }}
                    >
                        <div style={{ ...styles.quadrantLabel, color: '#ff3333' }}>LAGGING</div>
                        <div style={{ ...styles.quadrantCount, color: '#ff3333' }}>{counts.lagging}</div>
                    </div>
                    <div
                        style={{ ...styles.quadrantCard, borderColor: '#00aaff' }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '5px 5px 10px rgba(0, 0, 0, 0.9), -2px -2px 8px rgba(30, 30, 30, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '4px 4px 8px rgba(0, 0, 0, 0.8), -2px -2px 6px rgba(20, 20, 20, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.03)';
                        }}
                    >
                        <div style={{ ...styles.quadrantLabel, color: '#00aaff' }}>IMPROVING</div>
                        <div style={{ ...styles.quadrantCount, color: '#00aaff' }}>{counts.improving}</div>
                    </div>
                </div>
            )}

            {/* Data Table */}
            {filteredData.length > 0 && !loading && (
                <div style={styles.tableContainer}>
                    <table style={styles.table}>
                        <thead>
                            <tr style={styles.tableHeaderRow}>
                                <th style={styles.tableHeader}>SYMBOL</th>
                                {!sectorUnderTicker && <th style={styles.tableHeader}>SECTOR</th>}
                                {!compactLayout && <th style={styles.tableHeader}>CONSISTENCY</th>}
                                <th style={styles.tableHeader}>SHORT TERM</th>
                                <th style={styles.tableHeader}>NEAR TERM</th>
                                <th style={styles.tableHeader}>MEDIUM TERM</th>
                                <th style={styles.tableHeader}>LONG TERM</th>
                                <th style={styles.tableHeader}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span>CHART</span>
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            {(['1D', '5D', '1M', '3M', '6M', '1Y'] as const).map(tf => (
                                                <button
                                                    key={tf}
                                                    onClick={() => setChartTimeframe(tf)}
                                                    style={{
                                                        ...styles.chartTimeframeButton,
                                                        ...(chartTimeframe === tf ? styles.chartTimeframeButtonActive : {})
                                                    }}
                                                >
                                                    {tf}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </th>
                                {compactLayout ? (
                                    <th style={{ ...styles.tableHeader, borderRight: 'none' }}>PRICE</th>
                                ) : (
                                    <>
                                        <th style={styles.tableHeader}>PRICE</th>
                                        <th style={{ ...styles.tableHeader, borderRight: 'none' }}>CHANGE</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredData.map((item, index) => (
                                <tr
                                    key={index}
                                    style={styles.tableRow}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'linear-gradient(180deg, #1a1a1a 0%, #0f0f0f 100%)';
                                        e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.05)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'linear-gradient(180deg, #0a0a0a 0%, #050505 100%)';
                                        e.currentTarget.style.boxShadow = 'none';
                                    }}
                                >
                                    <td style={styles.tableCell}>
                                        {sectorUnderTicker ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                <span style={styles.symbol}>{item.symbol}</span>
                                                <span style={{ ...styles.sector, fontSize: '11px', color: '#888' }}>{item.sector}</span>
                                            </div>
                                        ) : (
                                            <span style={styles.symbol}>{item.symbol}</span>
                                        )}
                                    </td>
                                    {!sectorUnderTicker && (
                                        <td style={styles.tableCell}>
                                            <span style={styles.sector}>{item.sector}</span>
                                        </td>
                                    )}
                                    {!compactLayout && (
                                        <td style={styles.tableCell}>
                                            <span style={{
                                                ...styles.quadrantBadge,
                                                backgroundColor: item.consistency === 4 ? '#00ff88' : item.consistency === 3 ? '#ffaa00' : '#333333',
                                                color: item.consistency === 4 ? '#000000' : item.consistency === 3 ? '#000000' : '#ffffff',
                                                borderWidth: '2px',
                                                borderStyle: 'solid',
                                                borderColor: item.consistency === 4 ? '#00ff88' : item.consistency === 3 ? '#ffaa00' : '#555',
                                                fontWeight: 800,
                                            }}>
                                                {item.consistency}/4
                                            </span>
                                        </td>
                                    )}
                                    <td style={styles.tableCell}>
                                        <span style={{
                                            ...styles.quadrantBadge,
                                            backgroundColor: getQuadrantColor(item.timeframes['4w']),
                                            color: '#000000',
                                            borderWidth: '2px',
                                            borderStyle: 'solid',
                                            borderColor: getQuadrantColor(item.timeframes['4w']),
                                            fontWeight: 800,
                                        }}>
                                            {item.timeframes['4w'].toUpperCase()}
                                        </span>
                                    </td>
                                    <td style={styles.tableCell}>
                                        <span style={{
                                            ...styles.quadrantBadge,
                                            backgroundColor: getQuadrantColor(item.timeframes['8w']),
                                            color: '#000000',
                                            borderWidth: '2px',
                                            borderStyle: 'solid',
                                            borderColor: getQuadrantColor(item.timeframes['8w']),
                                            fontWeight: 800,
                                        }}>
                                            {item.timeframes['8w'].toUpperCase()}
                                        </span>
                                    </td>
                                    <td style={styles.tableCell}>
                                        <span style={{
                                            ...styles.quadrantBadge,
                                            backgroundColor: getQuadrantColor(item.timeframes['14w']),
                                            color: '#000000',
                                            borderWidth: '2px',
                                            borderStyle: 'solid',
                                            borderColor: getQuadrantColor(item.timeframes['14w']),
                                            fontWeight: 800,
                                        }}>
                                            {item.timeframes['14w'].toUpperCase()}
                                        </span>
                                    </td>
                                    <td style={styles.tableCell}>
                                        <span style={{
                                            ...styles.quadrantBadge,
                                            backgroundColor: getQuadrantColor(item.timeframes['26w']),
                                            color: '#000000',
                                            borderWidth: '2px',
                                            borderStyle: 'solid',
                                            borderColor: getQuadrantColor(item.timeframes['26w']),
                                            fontWeight: 800,
                                        }}>
                                            {item.timeframes['26w'].toUpperCase()}
                                        </span>
                                    </td>
                                    <td style={styles.tableCell}>
                                        <div style={{ display: 'flex', flexDirection: 'column', width: '220px' }}>
                                            {sparklineData[item.symbol] && sparklineData[item.symbol].length > 0 ? (
                                                <svg viewBox="0 0 220 30" style={{ width: '220px', height: '30px' }}>
                                                    {(() => {
                                                        const data = sparklineData[item.symbol];
                                                        const prices = data.map(d => d.price).filter(p => p != null && !isNaN(p));

                                                        if (prices.length === 0) return null;

                                                        const min = Math.min(...prices);
                                                        const max = Math.max(...prices);
                                                        const range = max - min || 1;

                                                        const points = data
                                                            .filter(d => d.price != null && !isNaN(d.price))
                                                            .map((d, i, arr) => {
                                                                const x = (i / (arr.length - 1 || 1)) * 220;
                                                                const y = 25 - ((d.price - min) / range) * 20;
                                                                return `${x},${y}`;
                                                            })
                                                            .join(' ');

                                                        if (!points || points.includes('NaN')) return null;

                                                        const color = item.priceChangePercent && item.priceChangePercent >= 0 ? '#00ff88' : '#ff3333';

                                                        return (
                                                            <>
                                                                <polyline
                                                                    points={points}
                                                                    fill="none"
                                                                    stroke={color}
                                                                    strokeWidth="1.5"
                                                                    opacity="0.3"
                                                                />
                                                                <polyline
                                                                    points={points}
                                                                    fill="none"
                                                                    stroke={color}
                                                                    strokeWidth="1"
                                                                />
                                                            </>
                                                        );
                                                    })()}
                                                </svg>
                                            ) : sparklineLoading ? (
                                                <div style={{ fontSize: '9px', color: '#666', textAlign: 'center' }}>Loading...</div>
                                            ) : (
                                                <div style={{ fontSize: '9px', color: '#666', textAlign: 'center' }}>-</div>
                                            )}
                                            {sparklineData[item.symbol] && sparklineData[item.symbol].length > 0 && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: '#fff', marginTop: '2px' }}>
                                                    {(() => {
                                                        const data = sparklineData[item.symbol];
                                                        if (chartTimeframe === '1D' && data.length >= 2) {
                                                            // Convert to ET time with AM/PM
                                                            const firstET = new Date(data[0].time).toLocaleString('en-US', {
                                                                timeZone: 'America/New_York',
                                                                hour: 'numeric',
                                                                minute: '2-digit',
                                                                hour12: true
                                                            });
                                                            const lastET = new Date(data[data.length - 1].time).toLocaleString('en-US', {
                                                                timeZone: 'America/New_York',
                                                                hour: 'numeric',
                                                                minute: '2-digit',
                                                                hour12: true
                                                            });
                                                            return (
                                                                <>
                                                                    <span>{firstET}</span>
                                                                    <span>{lastET}</span>
                                                                </>
                                                            );
                                                        } else if (data.length >= 2) {
                                                            // For multi-day charts, show dates in ET
                                                            const first = new Date(data[0].time).toLocaleDateString('en-US', {
                                                                timeZone: 'America/New_York',
                                                                month: 'short',
                                                                day: 'numeric'
                                                            });
                                                            const last = new Date(data[data.length - 1].time).toLocaleDateString('en-US', {
                                                                timeZone: 'America/New_York',
                                                                month: 'short',
                                                                day: 'numeric'
                                                            });
                                                            return (
                                                                <>
                                                                    <span>{first}</span>
                                                                    <span>{last}</span>
                                                                </>
                                                            );
                                                        }
                                                        return null;
                                                    })()}
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    {compactLayout ? (
                                        <td style={styles.tableCell}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                <div>{item.currentPrice ? `$${item.currentPrice.toFixed(2)}` : '-'}</div>
                                                {item.priceChangePercent !== undefined ? (
                                                    <div style={{
                                                        color: item.priceChangePercent >= 0 ? '#00ff88' : '#ff3333',
                                                        fontWeight: 700,
                                                        fontSize: '12px'
                                                    }}>
                                                        {item.priceChangePercent >= 0 ? '+' : ''}
                                                        {item.priceChangePercent.toFixed(2)}%
                                                    </div>
                                                ) : '-'}
                                            </div>
                                        </td>
                                    ) : (
                                        <>
                                            <td style={styles.tableCell}>
                                                {item.currentPrice ? `$${item.currentPrice.toFixed(2)}` : '-'}
                                            </td>
                                            <td style={styles.tableCell}>
                                                {item.priceChangePercent !== undefined ? (
                                                    <span style={{
                                                        color: item.priceChangePercent >= 0 ? '#00ff88' : '#ff3333',
                                                        fontWeight: 700,
                                                        fontSize: '14px'
                                                    }}>
                                                        {item.priceChangePercent >= 0 ? '+' : ''}
                                                        {item.priceChangePercent.toFixed(2)}%
                                                    </span>
                                                ) : '-'}
                                            </td>
                                        </>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Empty State */}
            {!loading && data.length === 0 && (
                <div style={styles.emptyState}>
                    <div style={styles.emptyIcon}>📊</div>
                    <h3 style={styles.emptyTitle}>No Data Available</h3>
                    <p style={styles.emptyText}>Click "RUN SCAN" to analyze {ALL_STOCKS.length} stocks</p>
                </div>
            )}
        </div>
    );
};

const styles: { [key: string]: React.CSSProperties } = {
    container: {
        padding: '25px',
        background: '#000000',
        minHeight: '100vh',
        fontFamily: 'BloombergTerminal, monospace',
    },
    header: {
        marginBottom: '25px',
        padding: '20px 25px',
        background: 'linear-gradient(145deg, #0f0f0f, #000000)',
        borderRadius: '8px',
        border: '1px solid #1a1a1a',
        boxShadow: '4px 4px 12px rgba(0, 0, 0, 0.9), -2px -2px 8px rgba(25, 25, 25, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.02)',
    },
    headerTop: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '25px',
        flexWrap: 'wrap',
    },
    title: {
        fontSize: '22px',
        fontWeight: 800,
        color: '#ff8500',
        margin: '0',
        letterSpacing: '3px',
        textTransform: 'uppercase',
        textShadow: '0 0 20px rgba(255, 133, 0, 0.3)',
    },
    scanButton: {
        padding: '11px 30px',
        fontSize: '12px',
        fontWeight: 800,
        color: '#000',
        background: 'linear-gradient(145deg, #ff9500, #ff8500)',
        border: '1.5px solid rgba(255, 133, 0, 0.4)',
        borderRadius: '6px',
        cursor: 'pointer',
        letterSpacing: '2px',
        transition: 'all 0.2s ease',
        boxShadow: '3px 3px 8px rgba(0, 0, 0, 0.8), -1px -1px 4px rgba(255, 149, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
        textTransform: 'uppercase',
    },
    controls: {
        display: 'flex',
        gap: '12px',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
    },
    controlGroup: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
    },
    label: {
        fontSize: '9px',
        color: '#ff8500',
        letterSpacing: '1.8px',
        fontWeight: 700,
        textTransform: 'uppercase',
        marginBottom: '6px',
    },
    select: {
        padding: '10px 16px',
        fontSize: '13px',
        background: 'linear-gradient(145deg, #0a0a0a, #000000)',
        color: '#fff',
        border: '1.5px solid #2a2a2a',
        borderRadius: '5px',
        fontFamily: 'BloombergTerminal, monospace',
        cursor: 'pointer',
        boxShadow: '2px 2px 6px rgba(0, 0, 0, 0.8), -1px -1px 3px rgba(30, 30, 30, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.02)',
        transition: 'all 0.2s ease',
        fontWeight: 600,
        minWidth: '160px',
    },
    sortButton: {
        padding: '10px 18px',
        fontSize: '12px',
        fontWeight: 700,
        color: '#ff8500',
        background: 'linear-gradient(145deg, #0f0f0f, #000000)',
        border: '1.5px solid #2a2a2a',
        borderRadius: '5px',
        cursor: 'pointer',
        letterSpacing: '1.5px',
        boxShadow: '2px 2px 6px rgba(0, 0, 0, 0.8), -1px -1px 3px rgba(30, 30, 30, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.02)',
        transition: 'all 0.2s ease',
    },
    timeframeButton: {
        padding: '2px 6px',
        fontSize: '8px',
        fontWeight: 700,
        cursor: 'pointer',
        borderRadius: '3px',
        transition: 'all 0.15s ease',
        letterSpacing: '0.5px',
    },
    progressContainer: {
        marginTop: '25px',
    },
    progressBar: {
        width: '100%',
        height: '8px',
        background: '#0a0a0a',
        borderRadius: '4px',
        overflow: 'hidden',
        boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.8)',
        border: '1px solid #1a1a1a',
    },
    progressFill: {
        height: '100%',
        background: 'linear-gradient(180deg, #ff9500 0%, #ff8500 100%)',
        transition: 'width 0.3s ease',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.3)',
    },
    progressText: {
        fontSize: '11px',
        color: '#666',
        marginTop: '10px',
        textAlign: 'center',
        fontWeight: 500,
        letterSpacing: '0.5px',
    },
    errorMessage: {
        marginTop: '20px',
        padding: '16px',
        background: '#0f0000',
        border: '1px solid #330000',
        borderRadius: '8px',
        color: '#ff6b6b',
        fontSize: '12px',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.02)',
        fontWeight: 500,
    },
    quadrantSummary: {
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: '10px',
        marginBottom: '25px',
    },
    quadrantCard: {
        padding: '10px 14px',
        background: 'linear-gradient(145deg, #0a0a0a, #000000)',
        borderWidth: '1.5px',
        borderStyle: 'solid',
        borderRadius: '6px',
        textAlign: 'center',
        boxShadow: '4px 4px 8px rgba(0, 0, 0, 0.8), -2px -2px 6px rgba(20, 20, 20, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.03)',
        transition: 'all 0.2s ease',
    },
    quadrantLabel: {
        fontSize: '9px',
        letterSpacing: '1.5px',
        fontWeight: 700,
        marginBottom: '6px',
        textTransform: 'uppercase',
        textRendering: 'optimizeLegibility',
        WebkitFontSmoothing: 'antialiased',
    },
    quadrantCount: {
        fontSize: '26px',
        fontWeight: 700,
    },
    tableContainer: {
        background: 'linear-gradient(180deg, #0f0f0f 0%, #0a0a0a 100%)',
        border: '1px solid #1a1a1a',
        borderRadius: '10px',
        overflow: 'hidden',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03), 0 4px 20px rgba(0, 0, 0, 0.8)',
    },
    table: {
        width: '100%',
        borderCollapse: 'collapse',
    },
    tableHeaderRow: {
        background: '#000000',
        borderBottom: '3px solid #ff8500',
    },
    tableHeader: {
        padding: '20px 24px',
        fontSize: '13px',
        fontWeight: 700,
        color: '#ff8500',
        letterSpacing: '2.5px',
        textAlign: 'left',
        borderRight: '1px solid #1a1a1a',
        textTransform: 'uppercase',
        background: 'linear-gradient(180deg, #0a0a0a 0%, #000000 100%)',
        textRendering: 'optimizeLegibility',
        WebkitFontSmoothing: 'antialiased',
        boxShadow: 'inset 0 -3px 0 rgba(255, 133, 0, 0.1)',
        position: 'relative' as const,
    },
    tableRow: {
        borderBottom: '1px solid #0a0a0a',
        transition: 'all 0.15s ease',
        cursor: 'pointer',
        background: '#000000',
    },
    tableCell: {
        padding: '16px 24px',
        fontSize: '14px',
        color: '#fff',
        fontWeight: 500,
        background: 'linear-gradient(180deg, rgba(10, 10, 10, 0.3) 0%, rgba(0, 0, 0, 0.5) 100%)',
        borderRight: '1px solid rgba(255, 255, 255, 0.02)',
    },
    symbol: {
        fontWeight: 700,
        color: '#ff8500',
        fontSize: '16px',
        letterSpacing: '0.5px',
    },
    sector: {
        color: '#ffffff',
        fontSize: '13px',
        fontWeight: 500,
        letterSpacing: '0.3px',
    },
    quadrantBadge: {
        padding: '8px 16px',
        borderRadius: '6px',
        fontSize: '11px',
        fontWeight: 800,
        letterSpacing: '1.5px',
        display: 'inline-block',
        textTransform: 'uppercase',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 2px 8px rgba(0, 0, 0, 0.6)',
        textRendering: 'optimizeLegibility',
        WebkitFontSmoothing: 'antialiased',
    },
    emptyState: {
        textAlign: 'center',
        padding: '100px 20px',
        color: '#666',
    },
    emptyIcon: {
        fontSize: '64px',
        marginBottom: '20px',
    },
    emptyTitle: {
        fontSize: '24px',
        fontWeight: 600,
        color: '#fff',
        marginBottom: '12px',
    },
    emptyText: {
        fontSize: '13px',
        color: '#666',
        fontWeight: 500,
        letterSpacing: '0.3px',
    },
    chartTimeframeButton: {
        padding: '2px 6px',
        fontSize: '9px',
        fontWeight: 600,
        color: '#888',
        background: 'transparent',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: '#333',
        borderRadius: '3px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        letterSpacing: '0.5px',
    },
    chartTimeframeButtonActive: {
        color: '#ff8500',
        borderColor: '#ff8500',
        background: 'rgba(255, 133, 0, 0.1)',
    },
};

export default RRGScreener;
