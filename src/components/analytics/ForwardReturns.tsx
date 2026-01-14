'use client';

import React, { useState, useEffect } from 'react';

interface ForwardData {
    expiration: string;
    daysOut: number;
    forwardPrice: number;
    forwardReturn: number;
    callPrice: number;
    putPrice: number;
    strike: number;
    riskReversal: number;
    trapSignal: 'BULLISH_TRAP' | 'BEARISH_TRAP' | 'NEUTRAL';
}

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

export default function ForwardReturns() {
    const [ticker, setTicker] = useState('');
    const [spotPrice, setSpotPrice] = useState<number>(0);
    const [forwardCurve, setForwardCurve] = useState<ForwardData[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchForwardReturns = async () => {
        if (!ticker || ticker.trim() === '') return;
        setLoading(true);
        try {
            console.log('📊 FORWARD RETURNS:', ticker);

            // Get current spot
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const today = new Date();
            const spotUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${yesterday.toISOString().split('T')[0]}/${today.toISOString().split('T')[0]}?adjusted=true&sort=desc&limit=1&apiKey=${POLYGON_API_KEY}`;
            const spotRes = await fetch(spotUrl);
            const spotData = await spotRes.json();
            const spot = spotData.results?.[0]?.c || 0;
            setSpotPrice(spot);

            console.log('💰 Spot Price:', spot);

            // Fetch ALL contracts with pagination
            const allContracts: any[] = [];
            let nextUrl: string | null = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&limit=1000&apikey=${POLYGON_API_KEY}`;

            while (nextUrl && allContracts.length < 10000) {
                const res: Response = await fetch(nextUrl);
                const data: any = await res.json();

                if (data.results && data.results.length > 0) {
                    allContracts.push(...data.results);
                }

                nextUrl = data.next_url ? `${data.next_url}&apikey=${POLYGON_API_KEY}` : null;

                if (nextUrl) {
                    await new Promise(r => setTimeout(r, 100));
                }
            }

            console.log('📋 Total contracts fetched:', allContracts.length);

            if (allContracts.length === 0) {
                setLoading(false);
                return;
            }

            // Get unique expirations and sort
            const expirations = [...new Set(allContracts.map((c: any) => c.expiration_date))].sort();
            const futureExps = expirations.filter(exp => new Date(exp) > new Date());

            console.log('📅 Processing', futureExps.slice(0, 6).length, 'expirations');

            const forwardData: ForwardData[] = [];

            for (const expStr of futureExps.slice(0, 6)) {
                const daysOut = Math.round((new Date(expStr).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

                // Fetch snapshot with expiration and strike filtering
                const lowerBound = Math.floor(spot * 0.5);
                const upperBound = Math.ceil(spot * 1.5);
                const snapUrl = `https://api.polygon.io/v3/snapshot/options/${ticker}?expiration_date.gte=${expStr}&expiration_date.lte=${expStr}&strike_price.gte=${lowerBound}&strike_price.lte=${upperBound}&limit=250&apikey=${POLYGON_API_KEY}`;
                const snapRes = await fetch(snapUrl);
                const snapData = await snapRes.json();

                if (!snapData.results || snapData.results.length === 0) {
                    console.warn('⚠️ No data for', expStr);
                    continue;
                }

                // Find ATM strike - get all available strikes and find closest to spot
                const availableStrikes = [...new Set(snapData.results.map((o: any) => o.details.strike_price))].sort((a, b) => a - b);
                const atmStrike = availableStrikes.reduce((prev: number, curr: number) =>
                    Math.abs(curr - spot) < Math.abs(prev - spot) ? curr : prev
                );

                console.log(`  ${expStr}: Available strikes [${availableStrikes.slice(0, 5).join(', ')}...], Selected ATM: ${atmStrike}`);

                const callData = snapData.results.find(
                    (o: any) => o.details.contract_type === 'call' && o.details.strike_price === atmStrike
                );
                const putData = snapData.results.find(
                    (o: any) => o.details.contract_type === 'put' && o.details.strike_price === atmStrike
                );

                if (!callData || !putData || !callData.last_quote || !putData.last_quote) {
                    console.warn('⚠️ Missing ATM data for', expStr, '| Strike:', atmStrike);
                    continue;
                }

                const callMid = (callData.last_quote.bid + callData.last_quote.ask) / 2;
                const putMid = (putData.last_quote.bid + putData.last_quote.ask) / 2;

                // Forward price via Put-Call Parity: F = C - P + K
                const forwardPrice = callMid - putMid + atmStrike;
                const forwardReturn = ((forwardPrice - spot) / spot) * 100;

                console.log(`  ${expStr} (${daysOut}d): ATM ${atmStrike} | Call $${callMid.toFixed(2)} Put $${putMid.toFixed(2)} | Forward $${forwardPrice.toFixed(2)} (${forwardReturn > 0 ? '+' : ''}${forwardReturn.toFixed(2)}%)`);

                // Risk Reversal (25-delta approximation using OTM options)
                const otmCallStrike = atmStrike + Math.round(spot * 0.05);
                const otmPutStrike = atmStrike - Math.round(spot * 0.05);

                const otmCall = snapData.results.find(
                    (o: any) => o.details.contract_type === 'call' && o.details.strike_price === otmCallStrike
                );
                const otmPut = snapData.results.find(
                    (o: any) => o.details.contract_type === 'put' && o.details.strike_price === otmPutStrike
                );

                const callIV = otmCall?.implied_volatility || callData.implied_volatility || 0;
                const putIV = otmPut?.implied_volatility || putData.implied_volatility || 0;
                const riskReversal = callIV - putIV;

                // Trap detection
                let trapSignal: 'BULLISH_TRAP' | 'BEARISH_TRAP' | 'NEUTRAL' = 'NEUTRAL';
                if (forwardReturn > 0 && riskReversal < -0.02) {
                    trapSignal = 'BULLISH_TRAP'; // Market prices upside but overpays for downside
                } else if (forwardReturn < 0 && riskReversal > 0.02) {
                    trapSignal = 'BEARISH_TRAP'; // Market prices downside but overpays for upside
                }

                forwardData.push({
                    expiration: expStr,
                    daysOut,
                    forwardPrice,
                    forwardReturn,
                    callPrice: callMid,
                    putPrice: putMid,
                    strike: atmStrike,
                    riskReversal,
                    trapSignal
                });
            }

            setForwardCurve(forwardData);
        } catch (error) {
            console.error('Error fetching forward returns:', error);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchForwardReturns();
    }, []);

    return (
        <div style={{
            background: 'linear-gradient(135deg, #0a0a0a 0%, #000000 50%, #0a0a0a 100%)',
            minHeight: '100%',
            padding: '20px',
            fontFamily: '"Inter", "Segoe UI", system-ui, sans-serif'
        }}>
            {/* Header */}
            <div style={{
                background: 'linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)',
                padding: '20px 24px',
                borderRadius: '12px',
                border: '1px solid rgba(212, 175, 55, 0.3)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                marginBottom: '20px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <h2 style={{
                            margin: 0,
                            fontSize: '24px',
                            fontWeight: '700',
                            background: 'linear-gradient(90deg, #FFD700 0%, #FFA500 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            letterSpacing: '0.5px'
                        }}>
                            IMPLIED FORWARD RETURNS
                        </h2>
                        <p style={{
                            margin: '8px 0 0 0',
                            fontSize: '13px',
                            color: '#00d4ff',
                            fontWeight: '500'
                        }}>
                            Market-Priced Drift via Put-Call Parity | Asymmetric Trap Detection
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <input
                            type="text"
                            value={ticker}
                            onChange={(e) => setTicker(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === 'Enter' && !loading) fetchForwardReturns(); }} placeholder="Ticker"
                            style={{
                                background: 'rgba(0, 0, 0, 0.6)',
                                border: '1px solid rgba(212, 175, 55, 0.3)',
                                borderRadius: '6px',
                                padding: '10px 16px',
                                color: '#FFD700',
                                fontSize: '14px',
                                fontWeight: '600',
                                width: '100px',
                                textAlign: 'center'
                            }}
                        />
                        <button
                            onClick={fetchForwardReturns}
                            disabled={loading}
                            style={{
                                background: loading
                                    ? 'linear-gradient(135deg, #333 0%, #222 100%)'
                                    : 'linear-gradient(135deg, #D4AF37 0%, #FFD700 100%)',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '10px 20px',
                                color: '#000',
                                fontSize: '13px',
                                fontWeight: '700',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                boxShadow: '0 4px 16px rgba(212, 175, 55, 0.4)',
                                transition: 'all 0.3s ease'
                            }}
                        >
                            {loading ? 'LOADING...' : 'CALCULATE'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Current Spot */}
            {spotPrice > 0 && (
                <div style={{
                    background: 'linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)',
                    padding: '16px 24px',
                    borderRadius: '10px',
                    border: '1px solid rgba(0, 212, 255, 0.3)',
                    marginBottom: '20px',
                    display: 'inline-block'
                }}>
                    <div style={{ fontSize: '12px', color: '#00d4ff', fontWeight: '600', marginBottom: '4px' }}>
                        SPOT PRICE
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: '700', color: '#fff' }}>
                        ${spotPrice.toFixed(2)}
                    </div>
                </div>
            )}

            {/* Forward Curve Table */}
            {forwardCurve.length > 0 && (
                <div style={{
                    background: 'linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)',
                    borderRadius: '12px',
                    border: '1px solid rgba(212, 175, 55, 0.3)',
                    overflow: 'hidden',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)'
                }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%)' }}>
                                <th style={headerStyle}>EXPIRY</th>
                                <th style={headerStyle}>DAYS</th>
                                <th style={headerStyle}>STRIKE</th>
                                <th style={headerStyle}>CALL</th>
                                <th style={headerStyle}>PUT</th>
                                <th style={headerStyle}>FORWARD</th>
                                <th style={headerStyle}>IMPLIED RETURN</th>
                                <th style={headerStyle}>RR 25Δ</th>
                                <th style={headerStyle}>SIGNAL</th>
                            </tr>
                        </thead>
                        <tbody>
                            {forwardCurve.map((row, idx) => (
                                <tr key={idx} style={{
                                    background: idx % 2 === 0 ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.5)',
                                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
                                }}>
                                    <td style={cellStyle}>{row.expiration}</td>
                                    <td style={cellStyle}>{row.daysOut}</td>
                                    <td style={cellStyle}>${row.strike}</td>
                                    <td style={cellStyle}>${row.callPrice.toFixed(2)}</td>
                                    <td style={cellStyle}>${row.putPrice.toFixed(2)}</td>
                                    <td style={{ ...cellStyle, color: '#00d4ff', fontWeight: '700' }}>
                                        ${row.forwardPrice.toFixed(2)}
                                    </td>
                                    <td style={{
                                        ...cellStyle,
                                        color: row.forwardReturn > 0 ? '#00ff88' : '#ff4444',
                                        fontWeight: '700',
                                        fontSize: '15px'
                                    }}>
                                        {row.forwardReturn > 0 ? '+' : ''}{row.forwardReturn.toFixed(2)}%
                                    </td>
                                    <td style={{
                                        ...cellStyle,
                                        color: row.riskReversal > 0 ? '#00ff88' : '#ff4444'
                                    }}>
                                        {(row.riskReversal * 100).toFixed(2)}
                                    </td>
                                    <td style={cellStyle}>
                                        <span style={{
                                            padding: '4px 12px',
                                            borderRadius: '6px',
                                            fontSize: '11px',
                                            fontWeight: '700',
                                            background: row.trapSignal === 'BULLISH_TRAP'
                                                ? 'rgba(0, 255, 136, 0.2)'
                                                : row.trapSignal === 'BEARISH_TRAP'
                                                    ? 'rgba(255, 68, 68, 0.2)'
                                                    : 'rgba(128, 128, 128, 0.2)',
                                            color: row.trapSignal === 'BULLISH_TRAP'
                                                ? '#00ff88'
                                                : row.trapSignal === 'BEARISH_TRAP'
                                                    ? '#ff4444'
                                                    : '#888',
                                            border: `1px solid ${row.trapSignal === 'BULLISH_TRAP'
                                                    ? '#00ff88'
                                                    : row.trapSignal === 'BEARISH_TRAP'
                                                        ? '#ff4444'
                                                        : '#555'
                                                }`
                                        }}>
                                            {row.trapSignal === 'BULLISH_TRAP' ? '🚀 SQUEEZE SETUP' :
                                                row.trapSignal === 'BEARISH_TRAP' ? '⚠️ DUMP RISK' :
                                                    '─ NEUTRAL'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Legend */}
            <div style={{
                marginTop: '20px',
                padding: '16px',
                background: 'rgba(0, 0, 0, 0.5)',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.05)'
            }}>
                <div style={{ fontSize: '12px', color: '#00d4ff', fontWeight: '600', marginBottom: '8px' }}>
                    INTERPRETATION
                </div>
                <div style={{ fontSize: '12px', color: '#fff', lineHeight: '1.8' }}>
                    <div><span style={{ color: '#00ff88' }}>🚀 SQUEEZE SETUP</span>: Forward drift positive but puts expensive → latent short exposure, explosive potential</div>
                    <div><span style={{ color: '#ff4444' }}>⚠️ DUMP RISK</span>: Forward drift negative with calls expensive → distribution underway</div>
                    <div><span style={{ color: '#888' }}>─ NEUTRAL</span>: No asymmetric trap detected</div>
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
    color: '#D4AF37',
    letterSpacing: '1px',
    borderBottom: '2px solid rgba(212, 175, 55, 0.3)'
};

const cellStyle: React.CSSProperties = {
    padding: '12px 16px',
    fontSize: '13px',
    color: '#fff',
    fontWeight: '500'
};
