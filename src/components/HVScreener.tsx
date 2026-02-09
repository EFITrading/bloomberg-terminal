'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { polygonService } from '../lib/polygonService';

interface HVMetrics {
    currentHV: number;
    hvLow: number;
    hvHigh: number;
    percentile: number;
    isNearLow: boolean;
    currentPrice: number;
    priceChange: number;
    volume: number;
}

interface StockHVSignal {
    symbol: string;
    currentHV: number;
    hvLow: number;
    percentFromLow: number;
    currentPrice: number;
    priceChange: number;
    priceChangePercent: number;
    volume: number;
    sector: string;
}

// Use same stocks as RS Screener
const SECTOR_STOCKS = {
    'Technology': [
        'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'TSLA', 'META', 'NVDA', 'NFLX', 'ADBE', 'CRM', 'ORCL', 'INTC', 'AMD', 'AVGO',
        'CSCO', 'IBM', 'QCOM', 'TXN', 'UBER', 'LYFT', 'SHOP', 'SNOW', 'PLTR', 'NET', 'DDOG', 'ZM', 'DOCU', 'TWLO', 'OKTA',
        'CRWD', 'ZS', 'PANW', 'FTNT', 'CYBR', 'SPLK', 'NOW', 'WDAY', 'VEEV', 'TEAM', 'ATLASSIAN', 'MDB', 'ESTC', 'GTLB'
    ],
    'Healthcare': [
        'JNJ', 'UNH', 'PFE', 'ABBV', 'TMO', 'ABT', 'DHR', 'BMY', 'LLY', 'MRK', 'AMGN', 'GILD', 'MDT', 'CI', 'CVS',
        'HUM', 'WBA', 'CVS', 'MCK', 'CAH', 'ABC', 'ISRG', 'SYK', 'BSX', 'EW', 'ZBH', 'BAX', 'BDX', 'A', 'ALGN', 'IDXX',
        'IQV', 'REGN', 'VRTX', 'BIIB', 'MRNA', 'BNTX', 'ZTS', 'ELV', 'CNC', 'MOH', 'HCA', 'UHS', 'DVA', 'FMS'
    ],
    'Financials': [
        'BRK.B', 'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'C', 'AXP', 'SCHW', 'BLK', 'SPGI', 'ICE', 'CME', 'MCO', 'MSCI',
        'COF', 'USB', 'TFC', 'PNC', 'BK', 'STT', 'NTRS', 'RF', 'CFG', 'HBAN', 'FITB', 'KEY', 'CMA', 'ZION', 'WTFC', 'FRC',
        'SIVB', 'PACW', 'WAL', 'SBNY', 'OZK', 'EWBC', 'CBSH', 'SNV', 'IBOC', 'FULT', 'ONB', 'UBSI', 'FFIN', 'WSFS'
    ],
    'Consumer Discretionary': [
        'AMZN', 'HD', 'MCD', 'NKE', 'SBUX', 'LOW', 'TJX', 'F', 'GM', 'BKNG', 'ABNB', 'EBAY', 'MAR', 'HLT', 'MGM', 'WYNN',
        'LVS', 'CZR', 'PENN', 'DKNG', 'NCLH', 'RCL', 'CCL', 'DAL', 'UAL', 'AAL', 'LUV', 'JBLU', 'ALK', 'SAVE', 'EXPE',
        'TRIP', 'LYFT', 'UBER', 'DIS', 'CMCSA', 'CHTR', 'DISH', 'NFLX', 'ROKU', 'SPOT', 'SIRI', 'WBD', 'PARA', 'FOX', 'FOXA'
    ],
    'Communication Services': [
        'GOOGL', 'GOOG', 'META', 'NFLX', 'DIS', 'CMCSA', 'VZ', 'T', 'CHTR', 'TMUS', 'DISH', 'SIRI', 'LUMN', 'WBD', 'PARA',
        'FOX', 'FOXA', 'NYT', 'ROKU', 'PINS', 'SNAP', 'TWTR', 'ZM', 'DOCU', 'TEAM', 'PTON', 'SPOT', 'TTD', 'TRADE', 'IAC',
        'MTCH', 'BMBL', 'ANGI', 'YELP', 'GRPN', 'QUOT', 'CARS', 'ZIP', 'REZI', 'OPRX', 'EVER', 'OPEN', 'RDFN', 'CARG'
    ],
    'Industrials': [
        'BA', 'HON', 'UPS', 'FDX', 'LMT', 'RTX', 'CAT', 'DE', 'GE', 'MMM', 'UNP', 'CSX', 'NSC', 'CP', 'CNI', 'KSU', 'ODFL',
        'XPO', 'CHRW', 'EXPD', 'JBHT', 'KNX', 'LSTR', 'ARCB', 'SAIA', 'YELL', 'WERN', 'ALK', 'MATX', 'GNTX', 'JOBY', 'ACHR',
        'LILM', 'EVTL', 'BLDE', 'PH', 'EMR', 'ETN', 'ITW', 'ROK', 'DOV', 'XYL', 'FTV', 'IEX', 'RRX', 'GNRC', 'IR', 'CARR'
    ],
    'Consumer Staples': [
        'PG', 'KO', 'PEP', 'WMT', 'COST', 'MDLZ', 'KHC', 'GIS', 'K', 'HSY', 'CPB', 'CAG', 'SJM', 'HRL', 'TSN', 'TYSON',
        'JM', 'BG', 'ADM', 'CALM', 'SAFM', 'LNDC', 'JJSF', 'USFD', 'SYY', 'PFGC', 'UNFI', 'ACI', 'KR', 'SFM', 'WBA', 'CVS',
        'RAD', 'RITE', 'DRUG', 'FRED', 'HIMS', 'GDDY', 'VIRT', 'EYE', 'VUZI', 'HEAR', 'KOSS', 'KODK', 'EXPR', 'BBBY'
    ],
    'Energy': [
        'XOM', 'CVX', 'COP', 'EOG', 'SLB', 'PXD', 'VLO', 'MPC', 'PSX', 'KMI', 'OKE', 'WMB', 'EPD', 'ET', 'MPLX', 'PAA',
        'PAGP', 'BKR', 'HAL', 'OIH', 'XLE', 'USO', 'UCO', 'DWT', 'SCO', 'ERX', 'ERY', 'GUSH', 'DRIP', 'NRGU', 'BOIL', 'KOLD',
        'UNG', 'UGAZ', 'DGAZ', 'AMJ', 'AMLP', 'MLPX', 'EMLP', 'MLPA', 'SMLP', 'NDP', 'OMP', 'NS', 'SRLP', 'USAC', 'DMLP'
    ],
    'Utilities': [
        'NEE', 'DUK', 'SO', 'D', 'AEP', 'EXC', 'XEL', 'WEC', 'PEG', 'ED', 'EIX', 'ETR', 'ES', 'PPL', 'FE', 'AWK', 'ATO',
        'CMS', 'CNP', 'NI', 'LNT', 'EVRG', 'AEE', 'PNW', 'SRE', 'PCG', 'IDA', 'UGI', 'NJR', 'SWX', 'ORA', 'BKH', 'MDU',
        'UTL', 'MGEE', 'AVA', 'AGR', 'AWR', 'CWT', 'YORW', 'CTWS', 'MSEX', 'SJW', 'GWRS', 'POWI', 'NOVA', 'SPWR', 'FSLR'
    ],
    'Materials': [
        'LIN', 'APD', 'SHW', 'ECL', 'DD', 'DOW', 'NUE', 'FCX', 'NEM', 'GOLD', 'PKG', 'IP', 'CF', 'LYB', 'EMN', 'IFF', 'FMC',
        'RPM', 'SEE', 'MLM', 'VMC', 'CRH', 'X', 'CLF', 'STLD', 'RS', 'CMC', 'GGB', 'SID', 'TX', 'TERN', 'CLW', 'KWR', 'OLN',
        'ASH', 'CBT', 'CC', 'CYH', 'FUL', 'GEF', 'HWKN', 'KOP', 'MERC', 'MOS', 'NEU', 'OEC', 'RGLD', 'SCCO', 'SMG', 'SON'
    ],
    'Real Estate': [
        'AMT', 'PLD', 'CCI', 'EQIX', 'WELL', 'SPG', 'DLR', 'O', 'PSA', 'CBRE', 'AVB', 'EQR', 'SBAC', 'VTR', 'ARE', 'MAA',
        'INVH', 'ESS', 'KIM', 'UDR', 'HST', 'REG', 'FRT', 'BXP', 'VNO', 'SLG', 'HIW', 'ARE', 'BMR', 'CDP', 'CUZ', 'DEI',
        'ELS', 'EPR', 'EXR', 'FPI', 'FR', 'GNL', 'GTY', 'HR', 'JBGS', 'KRC', 'KRG', 'LTC', 'MAC', 'MPW', 'NNN', 'OHI', 'OLP'
    ]
};

const ALL_STOCKS = Object.values(SECTOR_STOCKS).flat();

const HVScreener: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [signals, setSignals] = useState<{
        hv10Day: StockHVSignal[];
        hv20Day: StockHVSignal[];
        hv52Week: StockHVSignal[];
    }>({
        hv10Day: [],
        hv20Day: [],
        hv52Week: []
    });
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

    // Get sector for a stock
    const getSectorForStock = (symbol: string): string => {
        for (const [sector, stocks] of Object.entries(SECTOR_STOCKS)) {
            if (stocks.includes(symbol)) {
                return sector;
            }
        }
        return 'Unknown';
    };

    // Calculate Historical Volatility
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
        const stdDev = Math.sqrt(variance);

        // Annualize the volatility
        return stdDev * Math.sqrt(252) * 100;
    };

    // Calculate HV metrics for a given symbol and period
    const calculateHVMetrics = async (symbol: string, days: number, lookbackDays: number): Promise<HVMetrics | null> => {
        try {
            // Get enough historical data for the lookback period plus the calculation period
            const endDate = new Date().toISOString().split('T')[0];
            const startDate = new Date(Date.now() - (lookbackDays + days + 30) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            const data = await polygonService.getHistoricalData(symbol, startDate, endDate, 'day', 1);

            if (!data || !data.results || data.results.length < days + 10) {
                return null;
            }

            const prices = data.results.map(r => r.c);

            // Calculate rolling HV for the lookback period to find the low
            const hvValues: number[] = [];
            for (let i = days; i < prices.length; i++) {
                const periodPrices = prices.slice(i - days, i + 1);
                const hv = calculateHV(periodPrices, days);
                if (hv > 0) hvValues.push(hv);
            }

            if (hvValues.length === 0) {
                return null;
            }

            // Current HV is the most recent value
            const currentHV = hvValues[hvValues.length - 1];
            // Find the low and high from the lookback period
            const hvLow = Math.min(...hvValues);
            const hvHigh = Math.max(...hvValues);
            const percentile = hvHigh > hvLow ? ((currentHV - hvLow) / (hvHigh - hvLow)) * 100 : 0;

            // Calculate percent from low
            const percentFromLow = hvLow > 0 ? ((currentHV - hvLow) / hvLow) * 100 : 0;

            // Check if near low (within 20% margin from the low)
            const isNearLow = percentFromLow <= 20;


            // Get current price data
            const latest = data.results[data.results.length - 1];
            const previous = data.results[data.results.length - 2];
            const currentPrice = latest.c;
            const priceChange = previous ? latest.c - previous.c : 0;
            const volume = latest.v || 0;

            return {
                currentHV,
                hvLow,
                hvHigh,
                percentile,
                isNearLow,
                currentPrice,
                priceChange,
                volume
            };
        } catch (error) {
            console.error(`${symbol}: Error calculating HV -`, error);
            return null;
        }
    };

    // Run the screener
    const runScreener = useCallback(async () => {
        setLoading(true);
        setProgress({ current: 0, total: ALL_STOCKS.length });

        // Reset signals at start
        setSignals({
            hv10Day: [],
            hv20Day: [],
            hv52Week: []
        });

        // Accumulate results to avoid excessive re-renders
        const results = {
            hv10Day: [] as StockHVSignal[],
            hv20Day: [] as StockHVSignal[],
            hv52Week: [] as StockHVSignal[]
        };

        try {
            // Process in optimal batches (50 stocks = 150 concurrent API calls)
            // This balances speed with browser resource limits
            const BATCH_SIZE = 50;

            for (let i = 0; i < ALL_STOCKS.length; i += BATCH_SIZE) {
                const batch = ALL_STOCKS.slice(i, i + BATCH_SIZE);

                await Promise.all(batch.map(async (symbol) => {
                    try {
                        // Calculate HV for all three periods with their respective lookback periods
                        const [hv10, hv20, hv52] = await Promise.all([
                            calculateHVMetrics(symbol, 10, 90), // 10-day HV, 3-month lookback
                            calculateHVMetrics(symbol, 20, 365), // 20-day HV, 1-year lookback
                            calculateHVMetrics(symbol, 252, 1825) // 52-week HV, 5-year lookback
                        ]);

                        const sector = getSectorForStock(symbol);

                        // Process 10-day HV
                        if (hv10 && hv10.isNearLow) {
                            const percentFromLow = ((hv10.currentHV - hv10.hvLow) / hv10.hvLow) * 100;
                            const priceChangePercent = hv10.currentPrice > 0 ? (hv10.priceChange / (hv10.currentPrice - hv10.priceChange)) * 100 : 0;

                            results.hv10Day.push({
                                symbol,
                                currentHV: hv10.currentHV,
                                hvLow: hv10.hvLow,
                                percentFromLow,
                                currentPrice: hv10.currentPrice,
                                priceChange: hv10.priceChange,
                                priceChangePercent,
                                volume: hv10.volume,
                                sector
                            });
                        }

                        // Process 20-day HV
                        if (hv20 && hv20.isNearLow) {
                            const percentFromLow = ((hv20.currentHV - hv20.hvLow) / hv20.hvLow) * 100;
                            const priceChangePercent = hv20.currentPrice > 0 ? (hv20.priceChange / (hv20.currentPrice - hv20.priceChange)) * 100 : 0;

                            results.hv20Day.push({
                                symbol,
                                currentHV: hv20.currentHV,
                                hvLow: hv20.hvLow,
                                percentFromLow,
                                currentPrice: hv20.currentPrice,
                                priceChange: hv20.priceChange,
                                priceChangePercent,
                                volume: hv20.volume,
                                sector
                            });
                        }

                        // Process 52-week HV
                        if (hv52 && hv52.isNearLow) {
                            const percentFromLow = ((hv52.currentHV - hv52.hvLow) / hv52.hvLow) * 100;
                            const priceChangePercent = hv52.currentPrice > 0 ? (hv52.priceChange / (hv52.currentPrice - hv52.priceChange)) * 100 : 0;

                            results.hv52Week.push({
                                symbol,
                                currentHV: hv52.currentHV,
                                hvLow: hv52.hvLow,
                                percentFromLow,
                                currentPrice: hv52.currentPrice,
                                priceChange: hv52.priceChange,
                                priceChangePercent,
                                volume: hv52.volume,
                                sector
                            });
                        }
                    } catch (error) {
                        // Silent error handling for individual stocks
                    }

                    // Update progress
                    setProgress(prev => ({ ...prev, current: prev.current + 1 }));
                }));

                // Update UI every 2 batches to show progress
                if (i % (BATCH_SIZE * 2) === 0 || i + BATCH_SIZE >= ALL_STOCKS.length) {
                    setSignals({
                        hv10Day: [...results.hv10Day].sort((a, b) => a.percentFromLow - b.percentFromLow).slice(0, 30),
                        hv20Day: [...results.hv20Day].sort((a, b) => a.percentFromLow - b.percentFromLow).slice(0, 30),
                        hv52Week: [...results.hv52Week].sort((a, b) => a.percentFromLow - b.percentFromLow).slice(0, 30)
                    });
                }

                // Tiny delay to let browser breathe
                if (i + BATCH_SIZE < ALL_STOCKS.length) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            }

            // Final update with complete sorted results
            setSignals({
                hv10Day: results.hv10Day.sort((a, b) => a.percentFromLow - b.percentFromLow).slice(0, 30),
                hv20Day: results.hv20Day.sort((a, b) => a.percentFromLow - b.percentFromLow).slice(0, 30),
                hv52Week: results.hv52Week.sort((a, b) => a.percentFromLow - b.percentFromLow).slice(0, 30)
            });

            setLastUpdate(new Date());

        } catch (error) {
            console.error('Error running HV screener:', error);
        } finally {
            setLoading(false);
            setProgress({ current: 0, total: 0 });
        }
    }, []);

    const formatPrice = (price: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(price);
    };

    const formatVolume = (volume: number) => {
        if (volume >= 1000000) {
            return `${(volume / 1000000).toFixed(1)}M`;
        } else if (volume >= 1000) {
            return `${(volume / 1000).toFixed(1)}K`;
        }
        return volume.toString();
    };

    const renderSignalCard = (signal: StockHVSignal, index: number) => (
        <div
            key={`${signal.symbol}-${index}`}
            style={{
                background: 'linear-gradient(135deg, #0a0a0a 0%, #000000 100%)',
                border: '1px solid #1a1a1a',
                borderLeft: '3px solid #ff8c00',
                borderRadius: '4px',
                padding: '14px 16px',
                marginBottom: '8px',
                position: 'relative',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                cursor: 'pointer',
                fontFamily: 'JetBrains Mono, Consolas, Monaco, "Courier New", monospace',
                overflow: 'hidden',
                animation: `slideIn 0.4s ease-out ${index * 0.05}s both`,
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.8)'
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.borderLeftColor = '#ffaa00';
                e.currentTarget.style.borderLeftWidth = '4px';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 140, 0, 0.2), inset 0 0 0 1px rgba(255, 140, 0, 0.1)';
                e.currentTarget.style.transform = 'translateX(2px)';
                e.currentTarget.style.background = 'linear-gradient(135deg, #0f0f0f 0%, #050505 100%)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.borderLeftColor = '#ff8c00';
                e.currentTarget.style.borderLeftWidth = '3px';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.8)';
                e.currentTarget.style.transform = 'translateX(0)';
                e.currentTarget.style.background = 'linear-gradient(135deg, #0a0a0a 0%, #000000 100%)';
            }}
        >
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '10px',
            }}>
                <div style={{ flex: 1 }}>
                    <div style={{
                        color: '#ff8c00',
                        fontWeight: '700',
                        fontSize: '25px',
                        letterSpacing: '1px',
                        marginBottom: '3px',
                    }}>
                        {signal.symbol}
                    </div>
                    <div style={{
                        color: '#666666',
                        fontSize: '14px',
                        textTransform: 'uppercase',
                        fontWeight: '600',
                        letterSpacing: '0.5px',
                    }}>
                        {signal.sector}
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{
                        color: '#e0e0e0',
                        fontWeight: '700',
                        fontSize: '22px',
                        marginBottom: '2px',
                    }}>
                        {formatPrice(signal.currentPrice)}
                    </div>
                    <div style={{
                        color: signal.priceChange >= 0 ? '#00ff88' : '#ff3366',
                        fontSize: '18px',
                        fontWeight: '600',
                    }}>
                        {signal.priceChange >= 0 ? '+' : ''}{signal.priceChangePercent.toFixed(2)}%
                    </div>
                </div>
            </div>

            <div style={{
                background: 'rgba(255, 140, 0, 0.05)',
                border: '1px solid rgba(255, 140, 0, 0.15)',
                borderRadius: '3px',
                padding: '8px 10px',
                marginBottom: '8px',
            }}>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: '10px',
                    fontSize: '10px',
                }}>
                    <div>
                        <div style={{
                            color: '#666666',
                            marginBottom: '3px',
                            fontSize: '11px',
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                        }}>
                            Current
                        </div>
                        <div style={{
                            color: '#ff8c00',
                            fontWeight: '700',
                            fontSize: '17px',
                        }}>
                            {signal.currentHV.toFixed(1)}%
                        </div>
                    </div>
                    <div>
                        <div style={{
                            color: '#666666',
                            marginBottom: '3px',
                            fontSize: '13px',
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                        }}>
                            Low
                        </div>
                        <div style={{
                            color: '#00d4ff',
                            fontWeight: '700',
                            fontSize: '20px',
                        }}>
                            {signal.hvLow.toFixed(1)}%
                        </div>
                    </div>
                    <div>
                        <div style={{
                            color: '#666666',
                            marginBottom: '3px',
                            fontSize: '13px',
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                        }}>
                            From Low
                        </div>
                        <div style={{
                            color: '#00ff88',
                            fontWeight: '700',
                            fontSize: '20px',
                        }}>
                            +{signal.percentFromLow.toFixed(1)}%
                        </div>
                    </div>
                </div>
            </div>

            <div style={{
                borderTop: '1px solid #1a1a1a',
                paddingTop: '6px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
            }}>
                <div style={{
                    color: '#555555',
                    fontSize: '14px',
                    fontWeight: '600',
                    letterSpacing: '0.5px',
                }}>
                    VOL: {formatVolume(signal.volume)}
                </div>
                <div style={{
                    background: signal.percentFromLow <= 5
                        ? 'rgba(0, 255, 136, 0.15)'
                        : signal.percentFromLow <= 10
                            ? 'rgba(0, 212, 255, 0.15)'
                            : 'rgba(255, 140, 0, 0.15)',
                    color: signal.percentFromLow <= 5
                        ? '#00ff88'
                        : signal.percentFromLow <= 10
                            ? '#00d4ff'
                            : '#ff8c00',
                    padding: '2px 8px',
                    borderRadius: '2px',
                    fontSize: '13px',
                    fontWeight: '700',
                    letterSpacing: '0.5px',
                    border: `1px solid ${signal.percentFromLow <= 5
                        ? 'rgba(0, 255, 136, 0.3)'
                        : signal.percentFromLow <= 10
                            ? 'rgba(0, 212, 255, 0.3)'
                            : 'rgba(255, 140, 0, 0.3)'
                        }`,
                }}>
                    {signal.percentFromLow <= 5 ? 'EXTREME' : signal.percentFromLow <= 10 ? 'COMPRESSED' : 'SETUP'}
                </div>
            </div>
        </div>
    );

    return (
        <div className="terminal-panel" style={{
            margin: '20px',
            height: '85vh',
            maxHeight: '85vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'JetBrains Mono, Consolas, Monaco, "Courier New", monospace'
        }}>
            <style jsx>{`
 @keyframes slideIn {
 from {
 opacity: 0;
 transform: translateY(20px) scale(0.95);
 }
 to {
 opacity: 1;
 transform: translateY(0) scale(1);
 }
 }
 
 @keyframes pulse {
 0%, 100% {
 opacity: 1;
 }
 50% {
 opacity: 0.7;
 }
 }
 
 @keyframes glow {
 0%, 100% {
 box-shadow: 0 0 15px rgba(255, 140, 0, 0.3);
 }
 50% {
 box-shadow: 0 0 25px rgba(255, 140, 0, 0.6);
 }
 }
 
 @keyframes scanLine {
 0% {
 transform: translateX(-100%);
 }
 100% {
 transform: translateX(100%);
 }
 }
 
 .custom-scrollbar::-webkit-scrollbar {
 width: 6px;
 }
 
 .custom-scrollbar::-webkit-scrollbar-track {
 background: #0a0a0a;
 }
 
 .custom-scrollbar::-webkit-scrollbar-thumb {
 background: #2a2a2a;
 border-radius: 3px;
 }
 
 .custom-scrollbar::-webkit-scrollbar-thumb:hover {
 background: #3a3a3a;
 }
 `}</style>

            {/* Unified Header Row */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                position: 'relative',
                background: 'linear-gradient(135deg, #000000 0%, #0a2818 50%, #000000 100%)',
                padding: '16px 24px',
                borderRadius: '0',
                gap: '24px'
            }}>
                {/* Title and Subtitle */}
                <div style={{ flex: 1 }}>
                    <h1 style={{
                        fontFamily: 'JetBrains Mono, Consolas, Monaco, "Courier New", monospace',
                        fontSize: '18px',
                        fontWeight: '700',
                        color: '#ffffff',
                        textTransform: 'uppercase',
                        letterSpacing: '1.5px',
                        margin: 0,
                        marginBottom: '4px'
                    }}>
                        <span style={{ color: '#ff8c00' }}>HISTORICAL VOLATILITY</span> SCREENER
                    </h1>
                    <div style={{
                        color: '#ffffff',
                        fontSize: '12px',
                        fontFamily: 'JetBrains Mono, Consolas, Monaco, "Courier New", monospace',
                        fontWeight: '500',
                        letterSpacing: '0.5px',
                        opacity: 0.9
                    }}>
                        Scanning <span style={{ color: '#ff8c00' }}>{ALL_STOCKS.length}</span> tickers | Low volatility compression setups
                        {lastUpdate && (
                            <span style={{
                                marginLeft: '16px',
                                opacity: 0.6
                            }}>
                                | Last: {lastUpdate.toLocaleTimeString()}
                            </span>
                        )}
                    </div>
                </div>

                {/* Run Scan Button */}
                <button
                    onClick={runScreener}
                    disabled={loading}
                    style={{
                        background: loading ? '#1a1a1a' : '#ff8c00',
                        color: loading ? '#666666' : '#000000',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        padding: '8px 24px',
                        borderRadius: '4px',
                        fontFamily: 'JetBrains Mono, Consolas, Monaco, "Courier New", monospace',
                        fontSize: '12px',
                        fontWeight: '700',
                        textTransform: 'uppercase',
                        letterSpacing: '1px',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        whiteSpace: 'nowrap'
                    }}
                >
                    {loading ? 'SCANNING...' : 'RUN SCAN'}
                </button>

                {loading && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        flex: 1
                    }}>
                        <div style={{
                            color: '#ffffff',
                            fontFamily: 'JetBrains Mono, Consolas, Monaco, "Courier New", monospace',
                            fontSize: '11px',
                            fontWeight: '600',
                            letterSpacing: '0.5px',
                            whiteSpace: 'nowrap'
                        }}>
                            {progress.current} / {progress.total}
                        </div>
                        <div style={{
                            flex: 1,
                            maxWidth: '200px',
                            height: '6px',
                            background: 'rgba(0, 0, 0, 0.6)',
                            borderRadius: '3px',
                            overflow: 'hidden',
                            border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}>
                            <div
                                style={{
                                    height: '100%',
                                    background: '#ff8c00',
                                    borderRadius: '2px',
                                    width: `${(progress.current / progress.total) * 100}%`,
                                    transition: 'width 0.3s ease'
                                }}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Three Main Sections */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                flex: 1,
                height: '100%',
                maxHeight: loading ? 'calc(85vh - 200px)' : 'calc(85vh - 140px)',
                minHeight: '600px',
                gap: '1px',
                background: '#000000'
            }}>
                {/* 10-DAY HV */}
                <div style={{
                    background: '#000000',
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%',
                    maxHeight: '100%',
                    overflow: 'hidden',
                    borderRight: '1px solid #1a1a1a',
                }}>
                    <div style={{
                        background: '#0a0a0a',
                        borderBottom: '2px solid #00ff88',
                        padding: '14px 16px',
                    }}>
                        <h2 style={{
                            color: '#00ff88',
                            fontSize: '21px',
                            fontWeight: '700',
                            textTransform: 'uppercase',
                            letterSpacing: '1px',
                            margin: 0,
                        }}>
                            10-Day HV
                        </h2>
                        <div style={{
                            color: '#e0e0e0',
                            fontSize: '17px',
                            marginTop: '4px',
                            fontWeight: '600',
                            letterSpacing: '0.3px',
                        }}>
                            3-Month Lookback | Short-Term
                        </div>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            alignItems: 'center',
                            marginTop: '8px',
                        }}>
                            <div style={{
                                background: 'rgba(0, 255, 136, 0.1)',
                                border: '1px solid rgba(0, 255, 136, 0.2)',
                                borderRadius: '3px',
                                padding: '3px 8px',
                                color: '#00ff88',
                                fontSize: '20px',
                                fontWeight: '700',
                            }}>
                                {signals.hv10Day.length}
                            </div>
                        </div>
                    </div>
                    <div style={{
                        flex: 1,
                        padding: '16px 12px',
                        overflowY: 'auto',
                        overflowX: 'hidden'
                    }} className="custom-scrollbar">
                        {signals.hv10Day.length > 0 ? (
                            signals.hv10Day.map((signal, index) => renderSignalCard(signal, index))
                        ) : (
                            <div style={{
                                textAlign: 'center',
                                color: '#666666',
                                marginTop: '40px'
                            }}>
                                <div style={{ fontSize: '32px', marginBottom: '16px' }}></div>
                                <div style={{ fontSize: '12px', fontWeight: '600' }}>NO COMPRESSION DETECTED</div>
                                <div style={{ fontSize: '10px', marginTop: '4px' }}>Normal volatility levels</div>
                            </div>
                        )}
                    </div>
                </div>

                {/* 20-DAY HV */}
                <div style={{
                    background: '#000000',
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%',
                    maxHeight: '100%',
                    overflow: 'hidden',
                    borderRight: '1px solid #1a1a1a',
                }}>
                    <div style={{
                        background: '#0a0a0a',
                        borderBottom: '2px solid #00d4ff',
                        padding: '14px 16px',
                    }}>
                        <h2 style={{
                            color: '#00d4ff',
                            fontSize: '21px',
                            fontWeight: '700',
                            textTransform: 'uppercase',
                            letterSpacing: '1px',
                            margin: 0,
                        }}>
                            20-Day HV
                        </h2>
                        <div style={{
                            color: '#e0e0e0',
                            fontSize: '17px',
                            marginTop: '4px',
                            fontWeight: '600',
                            letterSpacing: '0.3px',
                        }}>
                            1-Year Lookback | Medium-Term
                        </div>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            alignItems: 'center',
                            marginTop: '8px',
                        }}>
                            <div style={{
                                background: 'rgba(0, 212, 255, 0.1)',
                                border: '1px solid rgba(0, 212, 255, 0.2)',
                                borderRadius: '3px',
                                padding: '3px 8px',
                                color: '#00d4ff',
                                fontSize: '20px',
                                fontWeight: '700',
                            }}>
                                {signals.hv20Day.length}
                            </div>
                        </div>
                    </div>
                    <div style={{
                        flex: 1,
                        padding: '16px 12px',
                        overflowY: 'auto',
                        overflowX: 'hidden'
                    }} className="custom-scrollbar">
                        {signals.hv20Day.length > 0 ? (
                            signals.hv20Day.map((signal, index) => renderSignalCard(signal, index))
                        ) : (
                            <div style={{
                                textAlign: 'center',
                                color: '#666666',
                                marginTop: '40px'
                            }}>
                                <div style={{ fontSize: '32px', marginBottom: '16px' }}></div>
                                <div style={{ fontSize: '12px', fontWeight: '600' }}>NO COMPRESSION DETECTED</div>
                                <div style={{ fontSize: '10px', marginTop: '4px' }}>Normal volatility levels</div>
                            </div>
                        )}
                    </div>
                </div>

                {/* 52-WEEK HV */}
                <div style={{
                    background: '#000000',
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%',
                    maxHeight: '100%',
                    overflow: 'hidden',
                }}>
                    <div style={{
                        background: '#0a0a0a',
                        borderBottom: '2px solid #ffaa00',
                        padding: '14px 16px',
                    }}>
                        <h2 style={{
                            color: '#ffaa00',
                            fontSize: '21px',
                            fontWeight: '700',
                            textTransform: 'uppercase',
                            letterSpacing: '1px',
                            margin: 0,
                        }}>
                            52-Week HV
                        </h2>
                        <div style={{
                            color: '#e0e0e0',
                            fontSize: '17px',
                            marginTop: '4px',
                            fontWeight: '600',
                            letterSpacing: '0.3px',
                        }}>
                            5-Year Lookback | Long-Term
                        </div>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            alignItems: 'center',
                            marginTop: '8px',
                        }}>
                            <div style={{
                                background: 'rgba(255, 170, 0, 0.1)',
                                border: '1px solid rgba(255, 170, 0, 0.2)',
                                borderRadius: '3px',
                                padding: '3px 8px',
                                color: '#ffaa00',
                                fontSize: '20px',
                                fontWeight: '700',
                            }}>
                                {signals.hv52Week.length}
                            </div>
                        </div>
                    </div>
                    <div style={{
                        flex: 1,
                        padding: '16px 12px',
                        overflowY: 'auto',
                        overflowX: 'hidden'
                    }} className="custom-scrollbar">
                        {signals.hv52Week.length > 0 ? (
                            signals.hv52Week.map((signal, index) => renderSignalCard(signal, index))
                        ) : (
                            <div style={{
                                textAlign: 'center',
                                color: '#666666',
                                marginTop: '40px'
                            }}>
                                <div style={{ fontSize: '32px', marginBottom: '16px' }}></div>
                                <div style={{ fontSize: '12px', fontWeight: '600' }}>NO COMPRESSION DETECTED</div>
                                <div style={{ fontSize: '10px', marginTop: '4px' }}>Normal volatility levels</div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HVScreener;