'use client';

import React, { useState, useEffect } from 'react';

interface RangeData {
    expiration: string;
    daysOut: number;
    atmIV: number;
    expectedMove: number;
    normalizedEM: number;
    curvature: number;
    regime: 'COILING' | 'BREAKING' | 'NEUTRAL';
}

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

export default function RangeProjection() {
    const [ticker, setTicker] = useState('');
    const [spotPrice, setSpotPrice] = useState<number>(0);
    const [rangeData, setRangeData] = useState<RangeData[]>([]);
    const [loading, setLoading] = useState(false);

    const calculateCurvature = (values: number[], index: number): number => {
        if (index === 0 || index === values.length - 1) return 0;
        return values[index + 1] - 2 * values[index] + values[index - 1];
    };

    const fetchRangeProjection = async () => {
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
            const futureExps = expirations.filter(exp => new Date(exp) > new Date());

            const tempRangeData: RangeData[] = [];

            for (const expStr of futureExps.slice(0, 7)) {
                const days = Math.round((new Date(expStr).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

                // Get snapshot with expiration and strike filtering
                const lowerBound = Math.floor(spot * 0.5);
                const upperBound = Math.ceil(spot * 1.5);
                const snapUrl = `https://api.polygon.io/v3/snapshot/options/${ticker}?expiration_date.gte=${expStr}&expiration_date.lte=${expStr}&strike_price.gte=${lowerBound}&strike_price.lte=${upperBound}&limit=250&apikey=${POLYGON_API_KEY}`;
                const snapRes = await fetch(snapUrl);
                const snapData = await snapRes.json();

                if (!snapData.results || snapData.results.length === 0) continue;

                const atmStrike = Math.round(spot);
                const atmOption = snapData.results.find(
                    (o: any) => o.details.strike_price === atmStrike
                );

                if (!atmOption) continue;

                const atmIV = atmOption.implied_volatility || 0;
                const timeToExp = days / 365;

                // Expected Move: S₀ * IV * √T
                const expectedMove = spot * atmIV * Math.sqrt(timeToExp);

                // Normalized Expected Move: EM / √T
                const normalizedEM = expectedMove / Math.sqrt(timeToExp);

                tempRangeData.push({
                    expiration: expStr,
                    daysOut: days,
                    atmIV,
                    expectedMove,
                    normalizedEM,
                    curvature: 0, // Will calculate after
                    regime: 'NEUTRAL'
                });
            }

            // Calculate curvature and regime
            const normalizedValues = tempRangeData.map(r => r.normalizedEM);
            tempRangeData.forEach((row, idx) => {
                row.curvature = calculateCurvature(normalizedValues, idx);

                // Regime detection
                if (idx < tempRangeData.length - 1) {
                    const frontEM = tempRangeData[0].normalizedEM;
                    const midEM = tempRangeData[Math.floor(tempRangeData.length / 2)]?.normalizedEM || frontEM;

                    if (row.curvature > 0.1 && frontEM < midEM) {
                        row.regime = 'COILING'; // Front flat, mid expanding → suppression
                    } else if (frontEM > midEM && row.curvature < -0.1) {
                        row.regime = 'BREAKING'; // Front > mid, curve inversion → imminent break
                    }
                }
            });

            setRangeData(tempRangeData);
        } catch (error) {
            console.error('Error fetching range projection:', error);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchRangeProjection();
    }, []);

    const maxCurvature = Math.max(...rangeData.map(r => Math.abs(r.curvature)), 0.1);

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
                border: '1px solid rgba(168, 85, 247, 0.3)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                marginBottom: '20px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <h2 style={{
                            margin: 0,
                            fontSize: '24px',
                            fontWeight: '700',
                            background: 'linear-gradient(90deg, #a855f7 0%, #c084fc 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            letterSpacing: '0.5px'
                        }}>
                            NONLINEAR RANGE PROJECTION
                        </h2>
                        <p style={{
                            margin: '8px 0 0 0',
                            fontSize: '13px',
                            color: '#c084fc',
                            fontWeight: '500'
                        }}>
                            Expected-Move Curvature | Dealer Suppression Detection
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <input
                            type="text"
                            value={ticker}
                            onChange={(e) => setTicker(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === 'Enter' && !loading) fetchRangeProjection(); }} placeholder="Ticker"
                            style={{
                                background: 'rgba(0, 0, 0, 0.6)',
                                border: '1px solid rgba(168, 85, 247, 0.3)',
                                borderRadius: '6px',
                                padding: '10px 16px',
                                color: '#a855f7',
                                fontSize: '14px',
                                fontWeight: '600',
                                width: '100px',
                                textAlign: 'center'
                            }}
                        />
                        <button
                            onClick={fetchRangeProjection}
                            disabled={loading}
                            style={{
                                background: loading
                                    ? 'linear-gradient(135deg, #333 0%, #222 100%)'
                                    : 'linear-gradient(135deg, #a855f7 0%, #c084fc 100%)',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '10px 20px',
                                color: '#000',
                                fontSize: '13px',
                                fontWeight: '700',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                boxShadow: '0 4px 16px rgba(168, 85, 247, 0.4)',
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
                    border: '1px solid rgba(168, 85, 247, 0.3)',
                    marginBottom: '20px',
                    display: 'inline-block'
                }}>
                    <div style={{ fontSize: '12px', color: '#c084fc', fontWeight: '600', marginBottom: '4px' }}>
                        SPOT PRICE
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: '700', color: '#fff' }}>
                        ${spotPrice.toFixed(2)}
                    </div>
                </div>
            )}

            {rangeData.length > 0 && (
                <>
                    {/* Visual Curvature Chart */}
                    <div style={{
                        background: 'linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)',
                        borderRadius: '12px',
                        border: '1px solid rgba(168, 85, 247, 0.3)',
                        padding: '24px',
                        marginBottom: '20px',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)'
                    }}>
                        <div style={{ fontSize: '13px', color: '#c084fc', fontWeight: '700', marginBottom: '16px', letterSpacing: '1px' }}>
                            CURVATURE VISUALIZATION
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', height: '150px' }}>
                            {rangeData.map((row, idx) => {
                                const height = (Math.abs(row.curvature) / maxCurvature) * 100;
                                const isPositive = row.curvature > 0;
                                return (
                                    <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                        <div style={{
                                            height: `${height}%`,
                                            width: '100%',
                                            background: isPositive
                                                ? 'linear-gradient(180deg, #00ff88 0%, #00cc66 100%)'
                                                : 'linear-gradient(180deg, #ff4444 0%, #cc0000 100%)',
                                            borderRadius: '6px 6px 0 0',
                                            boxShadow: '0 -4px 16px rgba(168, 85, 247, 0.3)',
                                            minHeight: '4px'
                                        }} />
                                        <div style={{ fontSize: '10px', color: '#888', fontWeight: '600' }}>
                                            {row.daysOut}D
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Data Table */}
                    <div style={{
                        background: 'linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)',
                        borderRadius: '12px',
                        border: '1px solid rgba(168, 85, 247, 0.3)',
                        overflow: 'hidden',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)'
                    }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%)' }}>
                                    <th style={headerStyle}>EXPIRY</th>
                                    <th style={headerStyle}>DAYS</th>
                                    <th style={headerStyle}>ATM IV</th>
                                    <th style={headerStyle}>EXPECTED MOVE</th>
                                    <th style={headerStyle}>NORMALIZED EM</th>
                                    <th style={headerStyle}>CURVATURE (κ)</th>
                                    <th style={headerStyle}>REGIME</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rangeData.map((row, idx) => (
                                    <tr key={idx} style={{
                                        background: idx % 2 === 0 ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.5)',
                                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
                                    }}>
                                        <td style={cellStyle}>{row.expiration}</td>
                                        <td style={cellStyle}>{row.daysOut}</td>
                                        <td style={cellStyle}>{(row.atmIV * 100).toFixed(2)}%</td>
                                        <td style={{ ...cellStyle, color: '#c084fc', fontWeight: '700' }}>
                                            ${row.expectedMove.toFixed(2)}
                                        </td>
                                        <td style={cellStyle}>{row.normalizedEM.toFixed(2)}</td>
                                        <td style={{
                                            ...cellStyle,
                                            color: row.curvature > 0 ? '#00ff88' : '#ff4444',
                                            fontWeight: '700'
                                        }}>
                                            {row.curvature > 0 ? '+' : ''}{row.curvature.toFixed(4)}
                                        </td>
                                        <td style={cellStyle}>
                                            <span style={{
                                                padding: '4px 12px',
                                                borderRadius: '6px',
                                                fontSize: '11px',
                                                fontWeight: '700',
                                                background: row.regime === 'COILING'
                                                    ? 'rgba(255, 165, 0, 0.2)'
                                                    : row.regime === 'BREAKING'
                                                        ? 'rgba(255, 68, 68, 0.2)'
                                                        : 'rgba(128, 128, 128, 0.2)',
                                                color: row.regime === 'COILING'
                                                    ? '#ffa500'
                                                    : row.regime === 'BREAKING'
                                                        ? '#ff4444'
                                                        : '#888',
                                                border: `1px solid ${row.regime === 'COILING'
                                                        ? '#ffa500'
                                                        : row.regime === 'BREAKING'
                                                            ? '#ff4444'
                                                            : '#555'
                                                    }`
                                            }}>
                                                {row.regime === 'COILING' ? '🔒 COILING' :
                                                    row.regime === 'BREAKING' ? '💥 BREAKING' :
                                                        '─ NEUTRAL'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            <div style={{
                marginTop: '20px',
                padding: '16px',
                background: 'rgba(0, 0, 0, 0.5)',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.05)'
            }}>
                <div style={{ fontSize: '12px', color: '#c084fc', fontWeight: '600', marginBottom: '8px' }}>
                    INTERPRETATION
                </div>
                <div style={{ fontSize: '12px', color: '#fff', lineHeight: '1.8' }}>
                    <div><span style={{ color: '#ffa500' }}>🔒 COILING</span>: Front-end flat, mid-term expanding (κ {'>'} 0) → Dealers suppressing spot until forced release</div>
                    <div><span style={{ color: '#ff4444' }}>💥 BREAKING</span>: Front {'>'} mid-term, curve inversion (κ {'<'} 0) → Move occurs NOW, not later</div>
                    <div><span style={{ color: '#888' }}>─ NEUTRAL</span>: Normal term structure, no imminent regime shift</div>
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
    color: '#a855f7',
    letterSpacing: '1px',
    borderBottom: '2px solid rgba(168, 85, 247, 0.3)'
};

const cellStyle: React.CSSProperties = {
    padding: '12px 16px',
    fontSize: '13px',
    color: '#fff',
    fontWeight: '500'
};
