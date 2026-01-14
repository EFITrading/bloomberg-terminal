'use client';

import React, { useState, useEffect } from 'react';

interface SkewData {
    strike: number;
    callIV: number;
    putIV: number;
    moneyness: number;
    ivValue: number;
}

interface SkewMomentum {
    expiration: string;
    daysOut: number;
    currentSkew: number;
    skewChange: number;
    zScore: number;
    signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
const RISK_FREE_RATE = 0.05;

// Black-Scholes helper functions
function normCDF(x: number): number {
    // Accurate cumulative normal distribution approximation
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x) / Math.sqrt(2);

    const t = 1 / (1 + p * absX);
    const erf = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

    return 0.5 * (1 + sign * erf);
}

function blackScholesPrice(S: number, K: number, T: number, r: number, sigma: number, type: 'call' | 'put'): number {
    if (T <= 0) return type === 'call' ? Math.max(S - K, 0) : Math.max(K - S, 0);

    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);

    if (type === 'call') {
        return S * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2);
    } else {
        return K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1);
    }
}

function calculateIV(optionPrice: number, S: number, K: number, T: number, r: number, type: 'call' | 'put'): number | null {
    // Check for invalid inputs
    if (optionPrice <= 0.01 || T <= 0) return null;

    // Check intrinsic value
    const intrinsic = type === 'call' ? Math.max(S - K, 0) : Math.max(K - S, 0);
    if (optionPrice < intrinsic) return null;

    let sigma = 0.3; // Initial guess

    for (let i = 0; i < 100; i++) {
        const price = blackScholesPrice(S, K, T, r, sigma, type);
        const diff = optionPrice - price;

        if (Math.abs(diff) < 0.0001) return sigma;

        // Vega calculation
        const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
        const vega = S * Math.sqrt(T / (2 * Math.PI)) * Math.exp(-d1 * d1 / 2);

        if (vega < 0.0001) break; // Avoid division by very small numbers

        sigma = sigma + diff / vega;

        // Keep sigma in reasonable bounds
        if (sigma <= 0.01) sigma = 0.01;
        if (sigma >= 5) sigma = 5;
    }

    return null; // Failed to converge
}

export default function VolSurface() {
    const [ticker, setTicker] = useState('');
    const [spotPrice, setSpotPrice] = useState<number>(0);
    const [skewData, setSkewData] = useState<SkewData[]>([]);
    const [skewMomentum, setSkewMomentum] = useState<SkewMomentum[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchVolSurface = async () => {
        if (!ticker || ticker.trim() === '') return;
        setLoading(true);
        try {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const today = new Date();
            const spotUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${yesterday.toISOString().split('T')[0]}/${today.toISOString().split('T')[0]}?adjusted=true&sort=desc&limit=1&apiKey=${POLYGON_API_KEY}`;
            const spotRes = await fetch(spotUrl);
            const spotData = await spotRes.json();
            const spot = spotData.results?.[0]?.c || 0;
            setSpotPrice(spot);

            // Fetch ALL contracts with pagination
            const allContracts: any[] = [];
            let nextUrl: string | null = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&limit=1000&apikey=${POLYGON_API_KEY}`;

            while (nextUrl && allContracts.length < 10000) {
                const res: Response = await fetch(nextUrl);
                const data: any = await res.json();
                if (data.results && data.results.length > 0) allContracts.push(...data.results);
                nextUrl = data.next_url ? `${data.next_url}&apikey=${POLYGON_API_KEY}` : null;
                if (nextUrl) await new Promise(r => setTimeout(r, 100));
            }

            const expirations = [...new Set(allContracts.map((c: any) => c.expiration_date))].sort();
            const todayDate = new Date();
            const futureExps = expirations.filter(exp => new Date(exp) > todayDate);

            // Calculate most recent past Friday manually (contracts API doesn't include expired options)
            const getPreviousFriday = (date: Date): string => {
                const d = new Date(date);
                const dayOfWeek = d.getDay(); // 0 = Sunday, 5 = Friday
                const daysToSubtract = dayOfWeek === 0 ? 2 : dayOfWeek === 6 ? 1 : dayOfWeek + 2; // Days back to last Friday
                d.setDate(d.getDate() - daysToSubtract);
                return d.toISOString().split('T')[0];
            };

            const previousFriday = getPreviousFriday(todayDate);
            const daysSinceFriday = Math.round((todayDate.getTime() - new Date(previousFriday).getTime()) / (1000 * 60 * 60 * 24));

            // Use previous Friday as baseline if it's within last 7 days, otherwise use first future
            const useHistoricalBaseline = daysSinceFriday <= 7;
            const baselineExp = useHistoricalBaseline ? previousFriday : futureExps[0];


            // Use most recent PAST expiration as baseline (e.g., last Friday 1/09/26)


            // Get snapshot for FIRST FUTURE expiration to build skew curve
            const firstExp = futureExps[0];
            const lowerBound = Math.floor(spot * 0.5);
            const upperBound = Math.ceil(spot * 1.5);
            const skewSnapUrl = `https://api.polygon.io/v3/snapshot/options/${ticker}?expiration_date.gte=${firstExp}&expiration_date.lte=${firstExp}&strike_price.gte=${lowerBound}&strike_price.lte=${upperBound}&limit=250&apikey=${POLYGON_API_KEY}`;
            const skewSnapRes = await fetch(skewSnapUrl);
            const skewSnapData = await skewSnapRes.json();

            if (!skewSnapData.results || skewSnapData.results.length === 0) {
                setLoading(false);
                return;
            }

            // Build skew curve (IV vs moneyness) using snapshot data
            const tempSkewData: SkewData[] = [];
            const strikes = [...new Set(skewSnapData.results.map((o: any) => o.details.strike_price))].sort((a, b) => (a as number) - (b as number));

            for (const strikeValue of strikes.slice(0, 30)) {
                const strike = strikeValue as number;
                const callData = skewSnapData.results.find(
                    (o: any) => o.details.contract_type === 'call' && o.details.strike_price === strike
                );
                const putData = skewSnapData.results.find(
                    (o: any) => o.details.contract_type === 'put' && o.details.strike_price === strike
                );

                if (!callData && !putData) continue;

                const callIV = callData?.implied_volatility || 0;
                const putIV = putData?.implied_volatility || 0;
                const avgIV = (callIV + putIV) / 2 || callIV || putIV;

                if (avgIV === 0) continue;

                const moneyness = Math.log(strike / spot);
                tempSkewData.push({
                    strike,
                    callIV,
                    putIV,
                    moneyness,
                    ivValue: avgIV
                });
            }

            setSkewData(tempSkewData.slice(-15));

            const tempMomentum: SkewMomentum[] = [];
            const skewByExpiration: Array<{ expStr: string; days: number; skew: number }> = [];

            // First pass: Get baseline skew from EXPIRED expiration using historical prices
            let baselineSkew = 0;

            if (useHistoricalBaseline) {
                // Get contracts as of day before expiration
                const dayBeforeExp = new Date(new Date(baselineExp).getTime() - 24 * 60 * 60 * 1000);
                const asOfDate = dayBeforeExp.toISOString().split('T')[0];

                const contractsRes = await fetch(
                    `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&expiration_date=${baselineExp}&as_of=${asOfDate}&limit=1000&apiKey=${POLYGON_API_KEY}`
                );
                const contractsData = await contractsRes.json();

                if (contractsData.results && contractsData.results.length > 0) {
                    // Get stock price on that date
                    const stockPriceRes = await fetch(
                        `https://api.polygon.io/v1/open-close/${ticker}/${asOfDate}?adjusted=true&apiKey=${POLYGON_API_KEY}`
                    );
                    const stockPriceData = await stockPriceRes.json();

                    if (stockPriceData.status === 'OK' && stockPriceData.close) {
                        const historicalSpot = stockPriceData.close;

                        // Find ATM strike
                        const allStrikes = [...new Set(contractsData.results.map((c: any) => c.strike_price))].sort((a, b) => (a as number) - (b as number));
                        const atmStrike = allStrikes.reduce((prev, curr) =>
                            Math.abs((curr as number) - historicalSpot) < Math.abs((prev as number) - historicalSpot) ? curr : prev
                        ) as number;

                        // Build option tickers for ATM put and call
                        const expDateStr = baselineExp.replace(/-/g, '').substring(2); // "260109"
                        const strikeStr = String(atmStrike * 1000).padStart(8, '0');
                        const putTicker = `O:${ticker}${expDateStr}P${strikeStr}`;
                        const callTicker = `O:${ticker}${expDateStr}C${strikeStr}`;

                        // Fetch option prices from aggregate endpoint
                        const [putPriceRes, callPriceRes] = await Promise.all([
                            fetch(`https://api.polygon.io/v2/aggs/ticker/${putTicker}/range/1/day/${asOfDate}/${asOfDate}?apiKey=${POLYGON_API_KEY}`),
                            fetch(`https://api.polygon.io/v2/aggs/ticker/${callTicker}/range/1/day/${asOfDate}/${asOfDate}?apiKey=${POLYGON_API_KEY}`)
                        ]);

                        const putPriceData = await putPriceRes.json();
                        const callPriceData = await callPriceRes.json();

                        if (putPriceData.resultsCount > 0 && callPriceData.resultsCount > 0) {
                            const putPrice = putPriceData.results[0].c;
                            const callPrice = callPriceData.results[0].c;

                            // Calculate time to expiration (1 day)
                            const timeToExp = 1 / 365;

                            // Calculate IV using Black-Scholes
                            const putIV = calculateIV(putPrice, historicalSpot, atmStrike, timeToExp, RISK_FREE_RATE, 'put');
                            const callIV = calculateIV(callPrice, historicalSpot, atmStrike, timeToExp, RISK_FREE_RATE, 'call');

                            if (putIV !== null && callIV !== null) {
                                baselineSkew = putIV - callIV;
                            }
                        } else {
                            console.warn('⚠️ No price data available for', asOfDate);
                        }
                    } else {
                        console.warn('⚠️ No stock price for', asOfDate);
                    }
                } else {
                    console.warn('⚠️ No contracts available as of', asOfDate);
                }
            } else {
                // Fallback: use snapshot for first future expiration
                const baselineLb = Math.floor(spot * 0.5);
                const baselineUb = Math.ceil(spot * 1.5);
                const baselineSnapUrl = `https://api.polygon.io/v3/snapshot/options/${ticker}?expiration_date.gte=${baselineExp}&expiration_date.lte=${baselineExp}&strike_price.gte=${baselineLb}&strike_price.lte=${baselineUb}&limit=250&apikey=${POLYGON_API_KEY}`;
                const baselineSnapRes = await fetch(baselineSnapUrl);
                const baselineSnapData = await baselineSnapRes.json();

                if (baselineSnapData.results && baselineSnapData.results.length > 0) {
                    const allStrikes = [...new Set(baselineSnapData.results.map((o: any) => o.details.strike_price))].sort((a, b) => (a as number) - (b as number));
                    const atmStrike = allStrikes.reduce((prev, curr) =>
                        Math.abs((curr as number) - spot) < Math.abs((prev as number) - spot) ? curr : prev
                    ) as number;
                    const atmIndex = allStrikes.indexOf(atmStrike);
                    const putStrike = atmIndex > 0 ? allStrikes[atmIndex - 1] : atmStrike;
                    const callStrike = atmIndex < allStrikes.length - 1 ? allStrikes[atmIndex + 1] : atmStrike;

                    const otmPut = baselineSnapData.results.find(
                        (o: any) => o.details.contract_type === 'put' && o.details.strike_price === putStrike
                    );
                    const otmCall = baselineSnapData.results.find(
                        (o: any) => o.details.contract_type === 'call' && o.details.strike_price === callStrike
                    );

                    if (otmPut && otmCall) {
                        const putIV = otmPut.implied_volatility || 0;
                        const callIV = otmCall.implied_volatility || 0;
                        baselineSkew = putIV - callIV;
                    }
                }
            }


            // Second pass: collect all FUTURE skews
            for (const expStr of futureExps.slice(0, 10)) {
                const days = Math.round((new Date(expStr).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

                // Get snapshot with expiration and strike filtering
                const lb = Math.floor(spot * 0.5);
                const ub = Math.ceil(spot * 1.5);
                const snapUrl = `https://api.polygon.io/v3/snapshot/options/${ticker}?expiration_date.gte=${expStr}&expiration_date.lte=${expStr}&strike_price.gte=${lb}&strike_price.lte=${ub}&limit=250&apikey=${POLYGON_API_KEY}`;
                const snapRes = await fetch(snapUrl);
                const snapData = await snapRes.json();

                if (!snapData.results || snapData.results.length === 0) {
                    console.warn('⚠️ No data for', expStr);
                    continue;
                }

                // Find ALL available strikes
                const allStrikes = [...new Set(snapData.results.map((o: any) => o.details.strike_price))].sort((a, b) => (a as number) - (b as number));

                // Find closest strike to spot price (ATM)
                const atmStrike = allStrikes.reduce((prev, curr) =>
                    Math.abs((curr as number) - spot) < Math.abs((prev as number) - spot) ? curr : prev
                ) as number;
                const atmIndex = allStrikes.indexOf(atmStrike);

                // Get one strike below ATM for put and one above for call
                const putStrike = atmIndex > 0 ? allStrikes[atmIndex - 1] : atmStrike;
                const callStrike = atmIndex < allStrikes.length - 1 ? allStrikes[atmIndex + 1] : atmStrike;

                // Get OTM put and call
                const otmPut = snapData.results.find(
                    (o: any) => o.details.contract_type === 'put' && o.details.strike_price === putStrike
                );
                const otmCall = snapData.results.find(
                    (o: any) => o.details.contract_type === 'call' && o.details.strike_price === callStrike
                );

                if (!otmPut || !otmCall) continue;

                const putIV = otmPut.implied_volatility || 0;
                const callIV = otmCall.implied_volatility || 0;
                const currentSkew = putIV - callIV;

                skewByExpiration.push({ expStr, days, skew: currentSkew });
            }

            // Second pass: calculate term structure momentum (compare to PAST baseline)
            if (skewByExpiration.length > 0) {
                for (const { expStr, days, skew: currentSkew } of skewByExpiration) {
                    // Term structure: compare to PAST expiration baseline
                    const skewChange = currentSkew - baselineSkew;

                    // Z-score normalized by typical skew volatility (2% IV)
                    const zScore = skewChange / 0.02;

                    let signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
                    if (skewChange < -0.01) signal = 'BULLISH'; // Current cheaper than last week → fear decreasing
                    else if (skewChange > 0.01) signal = 'BEARISH'; // Current more expensive → fear increasing

                    tempMomentum.push({
                        expiration: expStr,
                        daysOut: days,
                        currentSkew,
                        skewChange,
                        zScore,
                        signal
                    });
                }
            }

            setSkewMomentum(tempMomentum);
        } catch (error) {
            console.error('Error fetching vol surface:', error);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchVolSurface();
    }, []);

    const maxIV = Math.max(...skewData.map(s => s.ivValue), 0.3);
    const minIV = Math.min(...skewData.map(s => s.ivValue), 0.1);

    return (
        <div style={{
            background: 'linear-gradient(135deg, #0a0a0a 0%, #000000 50%, #0a0a0a 100%)',
            minHeight: '100%',
            padding: '20px',
            fontFamily: '"Inter", "Segoe UI", system-ui, sans-serif'
        }}>
            <div style={{
                background: 'linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)',
                padding: '20px 24px',
                borderRadius: '12px',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                marginBottom: '20px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <h2 style={{
                            margin: 0,
                            fontSize: '24px',
                            fontWeight: '700',
                            background: 'linear-gradient(90deg, #10b981 0%, #22c55e 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            letterSpacing: '0.5px'
                        }}>
                            VOLATILITY SURFACE INTELLIGENCE
                        </h2>
                        <p style={{
                            margin: '8px 0 0 0',
                            fontSize: '13px',
                            color: '#22c55e',
                            fontWeight: '500'
                        }}>
                            Skew Dynamics & Momentum | Predictive Edge Before Spot Moves
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <input
                            type="text"
                            value={ticker}
                            onChange={(e) => setTicker(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === 'Enter' && !loading) fetchVolSurface(); }} placeholder="Ticker"
                            style={{
                                background: 'rgba(0, 0, 0, 0.6)',
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                borderRadius: '6px',
                                padding: '10px 16px',
                                color: '#10b981',
                                fontSize: '14px',
                                fontWeight: '600',
                                width: '100px',
                                textAlign: 'center'
                            }}
                        />
                        <button
                            onClick={fetchVolSurface}
                            disabled={loading}
                            style={{
                                background: loading
                                    ? 'linear-gradient(135deg, #333 0%, #222 100%)'
                                    : 'linear-gradient(135deg, #10b981 0%, #22c55e 100%)',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '10px 20px',
                                color: '#000',
                                fontSize: '13px',
                                fontWeight: '700',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                boxShadow: '0 4px 16px rgba(16, 185, 129, 0.4)',
                                transition: 'all 0.3s ease'
                            }}
                        >
                            {loading ? 'LOADING...' : 'CALCULATE'}
                        </button>
                    </div>
                </div>
            </div>

            {spotPrice > 0 && (
                <div style={{
                    background: 'linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)',
                    padding: '16px 24px',
                    borderRadius: '10px',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    marginBottom: '20px',
                    display: 'inline-block'
                }}>
                    <div style={{ fontSize: '12px', color: '#22c55e', fontWeight: '600', marginBottom: '4px' }}>
                        SPOT PRICE
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: '700', color: '#fff' }}>
                        ${spotPrice.toFixed(2)}
                    </div>
                </div>
            )}

            {skewData.length > 0 && (
                <div style={{
                    background: 'linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)',
                    borderRadius: '12px',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    padding: '24px',
                    marginBottom: '20px',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)'
                }}>
                    <div style={{ fontSize: '13px', color: '#22c55e', fontWeight: '700', marginBottom: '16px', letterSpacing: '1px' }}>
                        VOLATILITY SKEW CURVE (30-DAY)
                    </div>
                    <div style={{ position: 'relative', height: '200px', display: 'flex', alignItems: 'flex-end', gap: '4px' }}>
                        {skewData.map((point, idx) => {
                            const height = ((point.ivValue - minIV) / (maxIV - minIV)) * 100;
                            const isATM = Math.abs(point.strike - spotPrice) < spotPrice * 0.02;
                            return (
                                <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                    <div style={{ fontSize: '9px', color: '#888', fontWeight: '600' }}>
                                        {(point.ivValue * 100).toFixed(0)}
                                    </div>
                                    <div style={{
                                        height: `${height}%`,
                                        width: '100%',
                                        background: isATM
                                            ? 'linear-gradient(180deg, #FFD700 0%, #FFA500 100%)'
                                            : point.moneyness < 0
                                                ? 'linear-gradient(180deg, #ff4444 0%, #cc0000 100%)'
                                                : 'linear-gradient(180deg, #00ff88 0%, #00cc66 100%)',
                                        borderRadius: '4px 4px 0 0',
                                        boxShadow: isATM ? '0 0 12px rgba(255, 215, 0, 0.6)' : 'none',
                                        minHeight: '4px'
                                    }} />
                                    <div style={{ fontSize: '9px', color: isATM ? '#FFD700' : '#666', fontWeight: isATM ? '700' : '500' }}>
                                        {point.strike}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {skewMomentum.length > 0 && (
                <div style={{
                    background: 'linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)',
                    borderRadius: '12px',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    overflow: 'hidden',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)'
                }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%)' }}>
                                <th style={headerStyle}>EXPIRY</th>
                                <th style={headerStyle}>DAYS</th>
                                <th style={headerStyle}>CURRENT SKEW</th>
                                <th style={headerStyle}>Δ SKEW</th>
                                <th style={headerStyle}>Z-SCORE</th>
                                <th style={headerStyle}>SIGNAL</th>
                            </tr>
                        </thead>
                        <tbody>
                            {skewMomentum.map((row, idx) => (
                                <tr key={idx} style={{
                                    background: idx % 2 === 0 ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.5)',
                                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
                                }}>
                                    <td style={cellStyle}>{row.expiration}</td>
                                    <td style={cellStyle}>{row.daysOut}</td>
                                    <td style={{ ...cellStyle, color: '#22c55e' }}>
                                        {(row.currentSkew * 100).toFixed(2)}
                                    </td>
                                    <td style={{
                                        ...cellStyle,
                                        color: row.skewChange < 0 ? '#00ff88' : '#ff4444',
                                        fontWeight: '700'
                                    }}>
                                        {row.skewChange < 0 ? '' : '+'}{(row.skewChange * 100).toFixed(2)}
                                    </td>
                                    <td style={cellStyle}>{row.zScore.toFixed(2)}σ</td>
                                    <td style={cellStyle}>
                                        <span style={{
                                            padding: '4px 12px',
                                            borderRadius: '6px',
                                            fontSize: '11px',
                                            fontWeight: '700',
                                            background: row.signal === 'BULLISH'
                                                ? 'rgba(0, 255, 136, 0.2)'
                                                : row.signal === 'BEARISH'
                                                    ? 'rgba(255, 68, 68, 0.2)'
                                                    : 'rgba(128, 128, 128, 0.2)',
                                            color: row.signal === 'BULLISH'
                                                ? '#00ff88'
                                                : row.signal === 'BEARISH'
                                                    ? '#ff4444'
                                                    : '#888',
                                            border: `1px solid ${row.signal === 'BULLISH'
                                                    ? '#00ff88'
                                                    : row.signal === 'BEARISH'
                                                        ? '#ff4444'
                                                        : '#555'
                                                }`
                                        }}>
                                            {row.signal === 'BULLISH' ? '📈 BULLISH' :
                                                row.signal === 'BEARISH' ? '📉 BEARISH' :
                                                    '─ NEUTRAL'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div style={{
                marginTop: '20px',
                padding: '16px',
                background: 'rgba(0, 0, 0, 0.5)',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.05)'
            }}>
                <div style={{ fontSize: '12px', color: '#22c55e', fontWeight: '600', marginBottom: '8px' }}>
                    INTERPRETATION
                </div>
                <div style={{ fontSize: '12px', color: '#fff', lineHeight: '1.8' }}>
                    <div><span style={{ color: '#00ff88' }}>📈 BULLISH</span>: Current skew cheaper than expired baseline (ΔSkew {'<'} 0) → Fear decreasing</div>
                    <div><span style={{ color: '#ff4444' }}>📉 BEARISH</span>: Current skew steeper than expired baseline (ΔSkew {'>'} 0) → Fear increasing</div>
                    <div style={{ marginTop: '8px', color: '#FFD700', fontWeight: '600' }}>
                        💡 Historical Baseline: Compares all active expirations vs most recent expired Friday (calculated from historical prices).
                    </div>
                </div>
            </div>
        </div>
    );
}

const headerStyle: React.CSSProperties = {
    padding: '14px 16px',
    textAlign: 'left',
    fontSize: '11px',
    fontWeight: '700',
    color: '#10b981',
    letterSpacing: '1px',
    borderBottom: '2px solid rgba(16, 185, 129, 0.3)'
};

const cellStyle: React.CSSProperties = {
    padding: '12px 16px',
    fontSize: '13px',
    color: '#fff',
    fontWeight: '500'
};
