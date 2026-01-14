'use client';

import React, { useState, useEffect } from 'react';
import RRGChart from './RRGChart';
import RRGService, { RRGCalculationResult } from '@/lib/rrgService';
import './RRGAnalytics.css';

interface RRGAnalyticsProps {
    defaultTimeframe?: string;
    defaultBenchmark?: string;
}

const RRGAnalytics: React.FC<RRGAnalyticsProps> = ({
    defaultTimeframe = '12 weeks',
    defaultBenchmark = 'SPY'
}) => {
    const [rrgData, setRrgData] = useState<RRGCalculationResult[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showTails, setShowTails] = useState(true);
    const [tailLength, setTailLength] = useState(() => {
        // Load from localStorage or default to 5
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('rrg-tail-length');
            return saved ? parseInt(saved, 10) : 5;
        }
        return 5;
    });
    const [timeframe, setTimeframe] = useState(defaultTimeframe);
    const [benchmark, setBenchmark] = useState(defaultBenchmark);
    const [selectedMode, setSelectedMode] = useState<'sectors' | 'industries' | 'custom' | 'weightedRRG'>('sectors');
    const [selectedSectorETF, setSelectedSectorETF] = useState<string | null>(null);
    const [selectedIndustryETF, setSelectedIndustryETF] = useState<string | null>(null);
    const [customSymbols, setCustomSymbols] = useState<string>('');
    const [refreshing, setRefreshing] = useState(false);

    const rrgService = new RRGService();

    // Handle tail length change with persistence
    const handleTailLengthChange = (newLength: number) => {
        setTailLength(newLength);
        if (typeof window !== 'undefined') {
            localStorage.setItem('rrg-tail-length', newLength.toString());
        }
    };

    const timeframeOptions = [
        { label: '5 days', value: '5 days', weeks: 10, rsPeriod: 5, momentumPeriod: 5 },
        { label: '3 weeks', value: '3 weeks', weeks: 8, rsPeriod: 10, momentumPeriod: 10 },
        { label: '12 weeks', value: '12 weeks', weeks: 18, rsPeriod: 10, momentumPeriod: 10 },
        { label: '52 weeks', value: '52 weeks', weeks: 60, rsPeriod: 10, momentumPeriod: 10 }
    ]; const benchmarkOptions = [
        { label: 'S&P 500 (SPY)', value: 'SPY' },
        { label: 'NASDAQ 100 (QQQ)', value: 'QQQ' },
        { label: 'Russell 2000 (IWM)', value: 'IWM' },
        { label: 'Total Stock Market (VTI)', value: 'VTI' },
        { label: 'World Stock Index (VT)', value: 'VT' }
    ];

    const industryETFs = {
        'IGV': {
            name: 'Software',
            holdings: ['MSFT', 'AAPL', 'NVDA', 'CRM', 'ORCL', 'ADBE', 'NOW', 'INTU', 'PANW', 'WDAY']
        },
        'SMH': {
            name: 'Semiconductors',
            holdings: ['TSM', 'NVDA', 'AVGO', 'AMD', 'QCOM', 'MU', 'INTC', 'AMAT', 'ADI', 'MRVL']
        },
        'XRT': {
            name: 'Retail',
            holdings: ['AMZN', 'HD', 'LOW', 'TJX', 'TGT', 'COST', 'WMT', 'DG', 'DLTR', 'BBY']
        },
        'KIE': {
            name: 'Insurance',
            holdings: ['BRK-B', 'PGR', 'TRV', 'AIG', 'MET', 'PRU', 'ALL', 'CB', 'AFL', 'L']
        },
        'KRE': {
            name: 'Regional Banks',
            holdings: ['WFC', 'USB', 'PNC', 'TFC', 'COF', 'MTB', 'FITB', 'HBAN', 'RF', 'KEY']
        },
        'GDX': {
            name: 'Gold Miners',
            holdings: ['NEM', 'GOLD', 'AEM', 'FNV', 'WPM', 'AU', 'KGC', 'PAAS', 'EGO', 'AUY']
        },
        'ITA': {
            name: 'Aerospace & Defense',
            holdings: ['BA', 'RTX', 'LMT', 'NOC', 'GD', 'LHX', 'TXT', 'HWM', 'CW', 'TDG']
        },
        'TAN': {
            name: 'Solar Energy',
            holdings: ['ENPH', 'FSLR', 'SEDG', 'NOVA', 'ARRY', 'RUN', 'SOL', 'CSIQ', 'JKS', 'DQ']
        },
        'XBI': {
            name: 'Biotechnology',
            holdings: ['GILD', 'AMGN', 'BIIB', 'MRNA', 'VRTX', 'REGN', 'ILMN', 'BMRN', 'ALNY', 'TECH']
        },
        'ITB': {
            name: 'Homebuilders',
            holdings: ['LEN', 'NVR', 'DHI', 'PHM', 'KBH', 'TOL', 'TPG', 'BZH', 'MTH', 'GRBK']
        },
        'XHB': {
            name: 'Homebuilders ETF',
            holdings: ['HD', 'LOW', 'LEN', 'DHI', 'PHM', 'AMZN', 'SHW', 'BLD', 'FND', 'BLDR']
        },
        'XOP': {
            name: 'Oil & Gas Exploration',
            holdings: ['FANG', 'OVV', 'EQT', 'MTDR', 'MGY', 'MRO', 'AR', 'SM', 'PR', 'CIVI']
        },
        'OIH': {
            name: 'Oil Services',
            holdings: ['SLB', 'HAL', 'BKR', 'FTI', 'NOV', 'WFRD', 'HP', 'CHX', 'LBRT', 'PTEN']
        },
        'XME': {
            name: 'Metals & Mining',
            holdings: ['FCX', 'NEM', 'STLD', 'NUE', 'CLF', 'X', 'MP', 'AA', 'CRS', 'RS']
        },
        'ARKK': {
            name: 'Innovation',
            holdings: ['TSLA', 'ROKU', 'COIN', 'SHOP', 'ZM', 'SQ', 'HOOD', 'PATH', 'GBTC', 'RBLX']
        },
        'IPO': {
            name: 'IPOs',
            holdings: ['RBLX', 'COIN', 'DDOG', 'ZM', 'SNOW', 'U', 'ABNB', 'PLTR', 'DASH', 'CPNG']
        },
        'VNQ': {
            name: 'Real Estate (REITs)',
            holdings: ['PLD', 'AMT', 'CCI', 'EQIX', 'PSA', 'WY', 'DLR', 'O', 'SBAC', 'EXR']
        },
        'JETS': {
            name: 'Airlines',
            holdings: ['DAL', 'UAL', 'AAL', 'LUV', 'SAVE', 'ALK', 'JBLU', 'HA', 'SKYW', 'MESA']
        },
        'KWEB': {
            name: 'China Internet',
            holdings: ['BABA', 'TCEHY', 'PDD', 'JD', 'NTES', 'BIDU', 'TME', 'BILI', 'IQ', 'VIPS']
        }
    };

    const sectorETFs = {
        'XLK': {
            name: 'Technology Select Sector SPDR Fund',
            holdings: ['AAPL', 'MSFT', 'NVDA', 'AVGO', 'CRM', 'ORCL', 'ADBE', 'ACN', 'CSCO', 'AMD', 'INTC', 'IBM', 'TXN', 'QCOM', 'AMAT', 'MU', 'ADI', 'KLAC', 'LRCX', 'MCHP']
        },
        'XLF': {
            name: 'Financial Select Sector SPDR Fund',
            holdings: ['BRK-B', 'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'SPGI', 'AXP', 'PGR', 'BLK', 'C', 'SCHW', 'CB', 'MMC', 'ICE', 'CME', 'PNC', 'AON']
        },
        'XLV': {
            name: 'Health Care Select Sector SPDR Fund',
            holdings: ['UNH', 'JNJ', 'PFE', 'ABBV', 'MRK', 'TMO', 'ABT', 'DHR', 'BMY', 'ELV', 'CVS', 'MDT', 'ISRG', 'VRTX', 'GILD', 'REGN', 'CI', 'HUM', 'AMGN', 'SYK']
        },
        'XLI': {
            name: 'Industrial Select Sector SPDR Fund',
            holdings: ['CAT', 'RTX', 'HON', 'UPS', 'LMT', 'BA', 'UNP', 'ADP', 'DE', 'MMM', 'GE', 'FDX', 'NOC', 'WM', 'EMR', 'ETN', 'ITW', 'CSX', 'CARR', 'NSC']
        },
        'XLY': {
            name: 'Consumer Discretionary Select Sector SPDR Fund',
            holdings: ['AMZN', 'TSLA', 'HD', 'MCD', 'BKNG', 'NKE', 'LOW', 'SBUX', 'TJX', 'ORLY', 'GM', 'F', 'CMG', 'MAR', 'HLT', 'ABNB', 'RCL', 'CCL', 'NCLH', 'YUM']
        },
        'XLP': {
            name: 'Consumer Staples Select Sector SPDR Fund',
            holdings: ['PG', 'KO', 'PEP', 'WMT', 'COST', 'MDLZ', 'CL', 'KMB', 'GIS', 'K', 'HSY', 'CHD', 'CLX', 'SJM', 'CAG', 'CPB', 'MKC', 'TSN', 'HRL', 'LW']
        },
        'XLE': {
            name: 'Energy Select Sector SPDR Fund',
            holdings: ['XOM', 'CVX', 'COP', 'EOG', 'SLB', 'PSX', 'VLO', 'MPC', 'OXY', 'BKR', 'HAL', 'DVN', 'FANG', 'APA', 'EQT', 'TPG', 'CTRA', 'MRO', 'OVV', 'HES']
        },
        'XLU': {
            name: 'Utilities Select Sector SPDR Fund',
            holdings: ['NEE', 'SO', 'DUK', 'CEG', 'SRE', 'AEP', 'VST', 'D', 'PCG', 'PEG', 'EXC', 'XEL', 'EIX', 'WEC', 'AWK', 'DTE', 'PPL', 'ES', 'AEE', 'CMS']
        },
        'XLRE': {
            name: 'Real Estate Select Sector SPDR Fund',
            holdings: ['PLD', 'AMT', 'CCI', 'EQIX', 'PSA', 'WELL', 'DLR', 'O', 'SBAC', 'EQR', 'BXP', 'VTR', 'ESS', 'MAA', 'KIM', 'DOC', 'UDR', 'CPT', 'HST', 'REG']
        },
        'XLB': {
            name: 'Materials Select Sector SPDR Fund',
            holdings: ['LIN', 'SHW', 'APD', 'FCX', 'ECL', 'CTVA', 'VMC', 'MLM', 'NUE', 'DD', 'PPG', 'IFF', 'PKG', 'IP', 'CF', 'ALB', 'AMCR', 'EMN', 'CE', 'FMC']
        },
        'XLC': {
            name: 'Communication Services Select Sector SPDR Fund',
            holdings: ['GOOGL', 'GOOG', 'META', 'NFLX', 'DIS', 'CMCSA', 'VZ', 'T', 'TMUS', 'CHTR', 'EA', 'TTWO', 'MTCH', 'ROKU', 'PINS', 'SNAP', 'TWTR', 'DISH', 'FOXA', 'FOX']
        }
    };

    const loadRRGData = async () => {
        setLoading(true);
        setError(null);

        try {
            // Get the selected timeframe
            const selectedTimeframe = timeframeOptions.find(tf => tf.value === timeframe);

            if (!selectedTimeframe) {
                console.warn(`Invalid timeframe "${timeframe}", defaulting...`);
                // Default to first option if current timeframe is invalid
                const defaultTimeframe = timeframeOptions[0];
                setTimeframe(defaultTimeframe.value);
                return; // Let the useEffect re-trigger with valid timeframe
            }

            // Load RS-based RRG data
            let data: RRGCalculationResult[];
            // Determine interval based on timeframe
            const interval: '1hour' | '4hour' | 'day' | 'week' = timeframe === '5 days' ? '1hour' : timeframe === '3 weeks' ? '4hour' : timeframe === '52 weeks' ? 'week' : 'day';

            if (selectedMode === 'weightedRRG') {
                // Weighted RRG mode - ultra-optimized batching
                console.log('📊 Loading Weighted RRG mode - ultra-optimized batching...');
                console.time('WeightedRRG Total Time');

                const sectorSymbols = ['XLK', 'XLY', 'XLC', 'XLI', 'XLB', 'XLE', 'XLF', 'XLV', 'XLU', 'XLRE', 'XLP'];

                // Batch by timeframe - only 4 API calls instead of 44!
                console.log(`📦 Batching into ${timeframeOptions.length} optimized requests (was ${sectorSymbols.length * timeframeOptions.length})...`);

                const allTimeframeResults = await Promise.all(
                    timeframeOptions.map(async (tf) => {
                        const tfInterval: '1hour' | '4hour' | 'day' | 'week' =
                            tf.value === '5 days' ? '1hour' :
                                tf.value === '3 weeks' ? '4hour' :
                                    tf.value === '52 weeks' ? 'week' :
                                        'day';

                        try {
                            // Fetch ALL sectors at once per timeframe
                            const results = await rrgService.calculateCustomRRG(
                                sectorSymbols,
                                benchmark,
                                tf.weeks,
                                tf.rsPeriod,
                                tf.momentumPeriod,
                                15, // Reduced to 15 for even faster processing
                                tfInterval
                            );
                            return { timeframe: tf.label, timeframeIndex: timeframeOptions.indexOf(tf), data: results };
                        } catch (error) {
                            console.error(`Failed to fetch ${tf.label}:`, error);
                            return null;
                        }
                    })
                );

                const validResults = allTimeframeResults.filter(r => r !== null);
                console.log(`✅ Fetched ${validResults.length}/4 timeframes in parallel`);

                // Build lookup map for fast access
                const dataMap = new Map<string, Map<number, any>>();
                validResults.forEach(tfResult => {
                    tfResult.data.forEach(sectorData => {
                        if (!dataMap.has(sectorData.symbol)) {
                            dataMap.set(sectorData.symbol, new Map());
                        }
                        dataMap.get(sectorData.symbol)!.set(tfResult.timeframeIndex, sectorData);
                    });
                });

                // Calculate weighted averages
                const weights = [1, 2, 3, 4]; // 5 days=1, 3 weeks=2, 12 weeks=3, 52 weeks=4
                data = [];

                sectorSymbols.forEach(sectorSymbol => {
                    const sectorTimeframeData = dataMap.get(sectorSymbol);

                    if (sectorTimeframeData && sectorTimeframeData.size > 0) {
                        let totalWeight = 0;
                        let weightedRsRatio = 0;
                        let weightedRsMomentum = 0;

                        // Calculate weighted position
                        sectorTimeframeData.forEach((sectorData, tfIndex) => {
                            const weight = weights[tfIndex];
                            totalWeight += weight;
                            weightedRsRatio += sectorData.rsRatio * weight;
                            weightedRsMomentum += sectorData.rsMomentum * weight;
                        });

                        if (totalWeight > 0) {
                            const avgRsRatio = weightedRsRatio / totalWeight;
                            const avgRsMomentum = weightedRsMomentum / totalWeight;

                            // Calculate weighted tail (optimized)
                            const allTails = Array.from(sectorTimeframeData.values()).map(d => d.tail || []);
                            const maxTailLength = Math.max(...allTails.map(t => t.length), 0);
                            const avgTail: Array<{ rsRatio: number; rsMomentum: number; date: string }> = [];

                            for (let i = 0; i < maxTailLength; i++) {
                                let tailWeightedRsRatio = 0;
                                let tailWeightedRsMomentum = 0;
                                let tailTotalWeight = 0;
                                let date = '';

                                sectorTimeframeData.forEach((sectorData, tfIndex) => {
                                    if (sectorData.tail?.[i]) {
                                        const weight = weights[tfIndex];
                                        tailTotalWeight += weight;
                                        tailWeightedRsRatio += sectorData.tail[i].rsRatio * weight;
                                        tailWeightedRsMomentum += sectorData.tail[i].rsMomentum * weight;
                                        if (!date) date = sectorData.tail[i].date;
                                    }
                                });

                                if (tailTotalWeight > 0) {
                                    avgTail.push({
                                        rsRatio: tailWeightedRsRatio / tailTotalWeight,
                                        rsMomentum: tailWeightedRsMomentum / tailTotalWeight,
                                        date: date
                                    });
                                }
                            }

                            data.push({
                                symbol: `${sectorSymbol} (Weighted)`,
                                name: `${sectorSymbol} (Weighted Avg)`,
                                rsRatio: avgRsRatio,
                                rsMomentum: avgRsMomentum,
                                tail: avgTail,
                                currentPrice: undefined,
                                priceChange: undefined,
                                priceChangePercent: undefined
                            });
                        }
                    }
                });

                console.timeEnd('WeightedRRG Total Time');
                console.log(`✅ Generated ${data.length} weighted lines (11x faster batching)`);
            } else if (selectedMode === 'waves') {
                // For waves mode, load all sector ETFs for wave detection
                console.log('🌊 Loading Waves mode - fetching all sector ETFs...');
                const waveSymbols = ['XLK', 'XLY', 'XLC', 'XLI', 'XLB', 'XLE', 'XLF', 'XLV', 'XLU', 'XLRE', 'XLP'];
                data = await rrgService.calculateCustomRRG(
                    waveSymbols,
                    benchmark,
                    selectedTimeframe.weeks,
                    selectedTimeframe.rsPeriod,
                    selectedTimeframe.momentumPeriod,
                    50,
                    interval
                );
            } else if (selectedMode === 'sectors') {
                if (selectedSectorETF && sectorETFs[selectedSectorETF as keyof typeof sectorETFs]) {
                    // Load holdings of selected sector ETF
                    const etfInfo = sectorETFs[selectedSectorETF as keyof typeof sectorETFs];
                    console.log(` Loading ${selectedSectorETF} holdings RRG data...`);
                    data = await rrgService.calculateCustomRRG(
                        etfInfo.holdings,
                        selectedSectorETF,
                        selectedTimeframe.weeks,
                        selectedTimeframe.rsPeriod,
                        selectedTimeframe.momentumPeriod,
                        50,
                        interval
                    );
                } else {
                    // Load standard sector analysis
                    console.log(' Loading Sector RRG data...');
                    data = await rrgService.calculateSectorRRG(
                        selectedTimeframe.weeks,
                        selectedTimeframe.rsPeriod,
                        selectedTimeframe.momentumPeriod,
                        50,
                        interval
                    );
                }
            } else if (selectedMode === 'industries') {
                if (selectedIndustryETF && industryETFs[selectedIndustryETF as keyof typeof industryETFs]) {
                    // Load holdings of selected industry ETF
                    const etfInfo = industryETFs[selectedIndustryETF as keyof typeof industryETFs];
                    console.log(` Loading ${selectedIndustryETF} holdings RRG data...`);
                    data = await rrgService.calculateCustomRRG(
                        etfInfo.holdings,
                        selectedIndustryETF,
                        selectedTimeframe.weeks,
                        selectedTimeframe.rsPeriod,
                        selectedTimeframe.momentumPeriod,
                        50,
                        interval
                    );
                } else {
                    // Load all industry ETFs for comparison
                    console.log(' Loading Industry ETFs RRG data...');
                    const industrySymbols = Object.keys(industryETFs);
                    data = await rrgService.calculateCustomRRG(
                        industrySymbols,
                        benchmark,
                        selectedTimeframe.weeks,
                        selectedTimeframe.rsPeriod,
                        selectedTimeframe.momentumPeriod,
                        50,
                        interval
                    );
                }
            } else {
                const symbols = customSymbols
                    .split(',')
                    .map(s => s && s.trim() ? s.trim().toUpperCase() : '')
                    .filter(s => s.length > 0);

                if (symbols.length === 0) {
                    // Don't throw error, just set empty data and exit loading state
                    setRrgData([]);
                    setLoading(false);
                    return;
                }

                // Multi-timeframe analysis for single ticker
                if (symbols.length === 1) {
                    console.log(`🔄 Loading multi-timeframe RRG for ${symbols[0]}...`);

                    // Fetch data for all 4 timeframes in parallel
                    const allData = await Promise.all(
                        timeframeOptions.map(async (tf) => {
                            const tfInterval: '1hour' | '4hour' | 'day' | 'week' = tf.value === '5 days' ? '1hour' : tf.value === '3 weeks' ? '4hour' : tf.value === '52 weeks' ? 'week' : 'day';
                            const results = await rrgService.calculateCustomRRG(
                                symbols,
                                benchmark,
                                tf.weeks,
                                tf.rsPeriod,
                                tf.momentumPeriod,
                                50,
                                tfInterval
                            );
                            return { timeframe: tf.label, data: results[0] };
                        })
                    );

                    // Transform into multiple points for the same ticker across timeframes
                    data = allData
                        .filter(item => item.data)
                        .map(item => ({
                            symbol: `${symbols[0]} (${item.timeframe})`,
                            name: `${symbols[0]} (${item.timeframe})`,
                            rsRatio: item.data.rsRatio,
                            rsMomentum: item.data.rsMomentum,
                            tail: item.data.tail,
                            currentPrice: item.data.currentPrice,
                            priceChange: item.data.priceChange,
                            priceChangePercent: item.data.priceChangePercent
                        }));

                    // Calculate weighted average (longer timeframes weighted more)
                    // Weights: 5 days=1, 3 weeks=2, 12 weeks=3, 52 weeks=4
                    const weights = [1, 2, 3, 4];
                    const validData = allData.filter(item => item.data);

                    if (validData.length > 0) {
                        let totalWeight = 0;
                        let weightedRsRatio = 0;
                        let weightedRsMomentum = 0;

                        validData.forEach((item, index) => {
                            const weight = weights[index] || 1;
                            totalWeight += weight;
                            weightedRsRatio += item.data.rsRatio * weight;
                            weightedRsMomentum += item.data.rsMomentum * weight;
                        });

                        const avgRsRatio = weightedRsRatio / totalWeight;
                        const avgRsMomentum = weightedRsMomentum / totalWeight;

                        // Calculate weighted average tail
                        const maxTailLength = Math.max(...validData.map(item => item.data.tail?.length || 0));
                        const avgTail: Array<{ rsRatio: number; rsMomentum: number; date: string }> = [];

                        for (let i = 0; i < maxTailLength; i++) {
                            let tailWeightedRsRatio = 0;
                            let tailWeightedRsMomentum = 0;
                            let tailTotalWeight = 0;
                            let date = '';

                            validData.forEach((item, index) => {
                                if (item.data.tail && item.data.tail[i]) {
                                    const weight = weights[index] || 1;
                                    tailTotalWeight += weight;
                                    tailWeightedRsRatio += item.data.tail[i].rsRatio * weight;
                                    tailWeightedRsMomentum += item.data.tail[i].rsMomentum * weight;
                                    if (!date) date = item.data.tail[i].date;
                                }
                            });

                            if (tailTotalWeight > 0) {
                                avgTail.push({
                                    rsRatio: tailWeightedRsRatio / tailTotalWeight,
                                    rsMomentum: tailWeightedRsMomentum / tailTotalWeight,
                                    date: date
                                });
                            }
                        }

                        // Add the weighted average as a separate point
                        data.push({
                            symbol: `${symbols[0]} (Weighted Avg)`,
                            name: `${symbols[0]} (Weighted Avg)`,
                            rsRatio: avgRsRatio,
                            rsMomentum: avgRsMomentum,
                            tail: avgTail,
                            currentPrice: validData[0].data.currentPrice,
                            priceChange: validData[0].data.priceChange,
                            priceChangePercent: validData[0].data.priceChangePercent
                        });
                    }

                    console.log(`✅ Loaded ${symbols[0]} across ${data.length} timeframes`);
                } else {
                    // Normal multi-ticker single timeframe analysis
                    console.log(' Loading Custom RRG data...');
                    data = await rrgService.calculateCustomRRG(
                        symbols,
                        benchmark,
                        selectedTimeframe.weeks,
                        selectedTimeframe.rsPeriod,
                        selectedTimeframe.momentumPeriod,
                        50,
                        interval
                    );
                }
            }

            setRrgData(data);
            console.log(' RRG data loaded successfully:', data.length, 'items');

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to load RRG data';
            setError(errorMessage);
            console.error(' RRG data loading failed:', err);
        } finally {
            setLoading(false);
        }
    };

    // Load data on component mount and when settings change
    useEffect(() => {
        loadRRGData();
    }, [timeframe, benchmark, selectedMode, selectedSectorETF, selectedIndustryETF]);

    const getQuadrantSummary = () => {
        const summary = {
            leading: rrgData.filter(d => d.rsRatio >= 100 && d.rsMomentum >= 100),
            weakening: rrgData.filter(d => d.rsRatio >= 100 && d.rsMomentum < 100),
            lagging: rrgData.filter(d => d.rsRatio < 100 && d.rsMomentum < 100),
            improving: rrgData.filter(d => d.rsRatio < 100 && d.rsMomentum >= 100)
        };

        return summary;
    };

    const quadrantSummary = getQuadrantSummary();

    return (
        <div className="rrg-analytics-container" style={{ position: 'relative' }}>

            {loading && (
                <div className="rrg-loading">
                    <div className="loading-content">
                        <div className="loading-spinner"></div>
                        <h3>Loading RRG Data...</h3>
                        <p>Fetching historical price data and calculating relative rotation metrics</p>
                    </div>
                </div>
            )}

            {error && (
                <div className="rrg-error">
                    <div className="error-content">
                        <h3>❌ Error Loading Data</h3>
                        <p>{error}</p>
                        <button onClick={loadRRGData} className="retry-btn">
                            Retry
                        </button>
                    </div>
                </div>
            )}

            {!loading && !error && (
                <>
                    <RRGChart
                        data={rrgData}
                        benchmark={benchmark}
                        width={1500}
                        height={1100}
                        showTails={showTails}
                        tailLength={tailLength}
                        timeframe={timeframe}
                        onShowTailsChange={setShowTails}
                        onTailLengthChange={handleTailLengthChange}
                        onLookbackChange={(index) => {
                            console.log(`Lookback changed to ${index} weeks ago`);
                        }}
                        onRefresh={loadRRGData}
                        // Pass control props
                        selectedMode={selectedMode}
                        selectedSectorETF={selectedSectorETF}
                        customSymbols={customSymbols}
                        timeframeOptions={timeframeOptions}
                        benchmarkOptions={benchmarkOptions}
                        sectorETFs={sectorETFs}
                        onModeChange={setSelectedMode}
                        onSectorETFChange={setSelectedSectorETF}
                        onIndustryETFChange={setSelectedIndustryETF}
                        onCustomSymbolsChange={setCustomSymbols}
                        onBenchmarkChange={setBenchmark}
                        onTimeframeChange={setTimeframe}
                        industryETFs={industryETFs}
                        selectedIndustryETF={selectedIndustryETF}
                        loading={loading}
                    />
                </>
            )}
        </div>
    );
};

export default RRGAnalytics;
