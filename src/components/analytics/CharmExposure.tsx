'use client';

import React, { useState, useEffect } from 'react';

interface CharmData {
    strike: number;
    openInterest: number;
    delta: number;
    gamma: number;
    charmEstimate: number;
    charmImpact: number;
}

interface CharmSummary {
    totalCharm: number;
    netDirection: 'DEALER_BUYING' | 'DEALER_SELLING' | 'NEUTRAL';
    regime: 'CHARM_DOMINANT' | 'GAMMA_DOMINANT' | 'BALANCED';
    gammaLevel: number;
}

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

export default function CharmExposure() {
    const [ticker, setTicker] = useState('');
    const [spotPrice, setSpotPrice] = useState<number>(0);
    const [charmData, setCharmData] = useState<CharmData[]>([]);
    const [summary, setSummary] = useState<CharmSummary | null>(null);
    const [loading, setLoading] = useState(false);

    const fetchCharmExposure = async () => {
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
            const expStr = futureExps[0];
            const daysUntilFriday = Math.round((new Date(expStr).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

            // Get snapshot with expiration and strike filtering
            const snapshotLowerBound = Math.floor(spot * 0.8);
            const snapshotUpperBound = Math.ceil(spot * 1.2);
            const snapUrl = `https://api.polygon.io/v3/snapshot/options/${ticker}?expiration_date.gte=${expStr}&expiration_date.lte=${expStr}&strike_price.gte=${snapshotLowerBound}&strike_price.lte=${snapshotUpperBound}&limit=250&apikey=${POLYGON_API_KEY}`;
            const snapRes = await fetch(snapUrl);
            const snapData = await snapRes.json();

            if (!snapData.results || snapData.results.length === 0) {
                setLoading(false);
                return;
            }

            const tempCharmData: CharmData[] = [];
            let totalCharm = 0;
            let totalGamma = 0;

            // Focus on strikes within 5% of spot
            const lowerBound = spot * 0.95;
            const upperBound = spot * 1.05;

            for (const option of snapData.results) {
                const strike = option.details.strike_price;
                if (strike < lowerBound || strike > upperBound) continue;

                const openInterest = option.open_interest || 0;
                if (openInterest === 0) continue;

                const delta = option.greeks?.delta || 0;
                const gamma = option.greeks?.gamma || 0;

                // Proper Charm formula: Charm ≈ -Gamma × Δ / T
                // This accounts for both ITM and OTM positions
                // Positive charm = dealers will buy, Negative = dealers will sell
                const timeToExp = daysUntilFriday / 365;
                const charmEstimate = -(gamma * delta) / timeToExp;

                // Aggregate charm impact (weighted by OI)
                const charmImpact = charmEstimate * openInterest;

                tempCharmData.push({
                    strike,
                    openInterest,
                    delta,
                    gamma,
                    charmEstimate,
                    charmImpact
                });

                totalCharm += charmImpact;
                totalGamma += Math.abs(gamma * openInterest);
            }

            // Sort by strike
            tempCharmData.sort((a, b) => a.strike - b.strike);
            setCharmData(tempCharmData);

            // Calculate summary
            let netDirection: 'DEALER_BUYING' | 'DEALER_SELLING' | 'NEUTRAL';
            if (totalCharm < -1000) netDirection = 'DEALER_SELLING';
            else if (totalCharm > 1000) netDirection = 'DEALER_BUYING';
            else netDirection = 'NEUTRAL';

            let regime: 'CHARM_DOMINANT' | 'GAMMA_DOMINANT' | 'BALANCED';
            const charmToGammaRatio = Math.abs(totalCharm) / (totalGamma || 1);
            if (charmToGammaRatio > 0.5) regime = 'CHARM_DOMINANT';
            else if (charmToGammaRatio < 0.2) regime = 'GAMMA_DOMINANT';
            else regime = 'BALANCED';

            setSummary({
                totalCharm,
                netDirection,
                regime,
                gammaLevel: totalGamma
            });
        } catch (error) {
            console.error('Error fetching charm exposure:', error);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchCharmExposure();
    }, []);

    const maxCharm = Math.max(...charmData.map(d => Math.abs(d.charmImpact)), 1);

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
                border: '1px solid rgba(245, 158, 11, 0.3)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                marginBottom: '20px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <h2 style={{
                            margin: 0,
                            fontSize: '24px',
                            fontWeight: '700',
                            background: 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            letterSpacing: '0.5px'
                        }}>
                            CHARM EXPOSURE
                        </h2>
                        <p style={{
                            margin: '8px 0 0 0',
                            fontSize: '13px',
                            color: '#fbbf24',
                            fontWeight: '500'
                        }}>
                            Dealer Greek Regime | Movement Without Catalysts
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <input
                            type="text"
                            value={ticker}
                            onChange={(e) => setTicker(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === 'Enter' && !loading) fetchCharmExposure(); }} placeholder="Ticker"
                            style={{
                                background: 'rgba(0, 0, 0, 0.6)',
                                border: '1px solid rgba(245, 158, 11, 0.3)',
                                borderRadius: '6px',
                                padding: '10px 16px',
                                color: '#f59e0b',
                                fontSize: '14px',
                                fontWeight: '600',
                                width: '100px',
                                textAlign: 'center'
                            }}
                        />
                        <button
                            onClick={fetchCharmExposure}
                            disabled={loading}
                            style={{
                                background: loading
                                    ? 'linear-gradient(135deg, #333 0%, #222 100%)'
                                    : 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '10px 20px',
                                color: '#000',
                                fontSize: '13px',
                                fontWeight: '700',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                boxShadow: '0 4px 16px rgba(245, 158, 11, 0.4)',
                                transition: 'all 0.3s ease'
                            }}
                        >
                            {loading ? 'LOADING...' : 'CALCULATE'}
                        </button>
                    </div>
                </div>
            </div>

            {spotPrice > 0 && (
                <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
                    <div style={{
                        background: 'linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)',
                        padding: '16px 24px',
                        borderRadius: '10px',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        flex: 1
                    }}>
                        <div style={{ fontSize: '12px', color: '#fbbf24', fontWeight: '600', marginBottom: '4px' }}>
                            SPOT PRICE
                        </div>
                        <div style={{ fontSize: '28px', fontWeight: '700', color: '#fff' }}>
                            ${spotPrice.toFixed(2)}
                        </div>
                    </div>

                    {summary && (
                        <>
                            <div style={{
                                background: 'linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)',
                                padding: '16px 24px',
                                borderRadius: '10px',
                                border: `1px solid ${summary.netDirection === 'DEALER_BUYING' ? 'rgba(0, 255, 136, 0.3)' :
                                        summary.netDirection === 'DEALER_SELLING' ? 'rgba(255, 68, 68, 0.3)' :
                                            'rgba(128, 128, 128, 0.3)'
                                    }`,
                                flex: 1
                            }}>
                                <div style={{ fontSize: '12px', color: '#fbbf24', fontWeight: '600', marginBottom: '4px' }}>
                                    NET CHARM
                                </div>
                                <div style={{
                                    fontSize: '28px',
                                    fontWeight: '700',
                                    color: summary.netDirection === 'DEALER_BUYING' ? '#00ff88' :
                                        summary.netDirection === 'DEALER_SELLING' ? '#ff4444' : '#888'
                                }}>
                                    {summary.totalCharm > 0 ? '+' : ''}{(summary.totalCharm / 1000).toFixed(1)}K
                                </div>
                            </div>

                            <div style={{
                                background: 'linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)',
                                padding: '16px 24px',
                                borderRadius: '10px',
                                border: '1px solid rgba(245, 158, 11, 0.3)',
                                flex: 1
                            }}>
                                <div style={{ fontSize: '12px', color: '#fbbf24', fontWeight: '600', marginBottom: '4px' }}>
                                    REGIME
                                </div>
                                <div style={{ fontSize: '16px', fontWeight: '700', color: '#fff' }}>
                                    {summary.regime === 'CHARM_DOMINANT' ? '⚡ CHARM DOMINANT' :
                                        summary.regime === 'GAMMA_DOMINANT' ? '🎯 GAMMA DOMINANT' :
                                            '⚖️ BALANCED'}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {charmData.length > 0 && (
                <>
                    <div style={{
                        background: 'linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)',
                        borderRadius: '12px',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        padding: '24px',
                        marginBottom: '20px',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)'
                    }}>
                        <div style={{ fontSize: '13px', color: '#fbbf24', fontWeight: '700', marginBottom: '16px', letterSpacing: '1px' }}>
                            CHARM IMPACT BY STRIKE
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '150px' }}>
                            {charmData.map((row, idx) => {
                                const height = (Math.abs(row.charmImpact) / maxCharm) * 100;
                                const isNegative = row.charmImpact < 0;
                                const isNearATM = Math.abs(row.strike - spotPrice) < spotPrice * 0.01;
                                return (
                                    <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                                        <div style={{ fontSize: '9px', color: '#888', marginBottom: '4px' }}>
                                            {(row.charmImpact / 1000).toFixed(1)}
                                        </div>
                                        <div style={{
                                            height: `${height}%`,
                                            width: '100%',
                                            background: isNegative
                                                ? 'linear-gradient(180deg, #ff4444 0%, #cc0000 100%)'
                                                : 'linear-gradient(180deg, #00ff88 0%, #00cc66 100%)',
                                            borderRadius: '4px 4px 0 0',
                                            boxShadow: isNearATM ? '0 0 12px rgba(255, 215, 0, 0.5)' : 'none',
                                            minHeight: '4px',
                                            border: isNearATM ? '2px solid #FFD700' : 'none'
                                        }} />
                                        <div style={{ fontSize: '9px', color: isNearATM ? '#FFD700' : '#666', fontWeight: isNearATM ? '700' : '500', marginTop: '4px' }}>
                                            {row.strike}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div style={{
                        background: 'linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)',
                        borderRadius: '12px',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        overflow: 'hidden',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)'
                    }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%)' }}>
                                    <th style={headerStyle}>STRIKE</th>
                                    <th style={headerStyle}>OPEN INTEREST</th>
                                    <th style={headerStyle}>DELTA</th>
                                    <th style={headerStyle}>GAMMA</th>
                                    <th style={headerStyle}>CHARM</th>
                                    <th style={headerStyle}>IMPACT</th>
                                </tr>
                            </thead>
                            <tbody>
                                {charmData.map((row, idx) => {
                                    const isNearATM = Math.abs(row.strike - spotPrice) < spotPrice * 0.01;
                                    return (
                                        <tr key={idx} style={{
                                            background: isNearATM
                                                ? 'rgba(255, 215, 0, 0.1)'
                                                : idx % 2 === 0 ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.5)',
                                            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                                            borderLeft: isNearATM ? '3px solid #FFD700' : 'none'
                                        }}>
                                            <td style={{ ...cellStyle, color: isNearATM ? '#FFD700' : '#fff', fontWeight: isNearATM ? '700' : '500' }}>
                                                ${row.strike}
                                            </td>
                                            <td style={cellStyle}>{row.openInterest.toLocaleString()}</td>
                                            <td style={{ ...cellStyle, color: '#00d4ff' }}>{row.delta.toFixed(4)}</td>
                                            <td style={cellStyle}>{row.gamma.toFixed(6)}</td>
                                            <td style={{
                                                ...cellStyle,
                                                color: row.charmEstimate < 0 ? '#ff4444' : '#00ff88',
                                                fontWeight: '700'
                                            }}>
                                                {row.charmEstimate.toFixed(6)}
                                            </td>
                                            <td style={{
                                                ...cellStyle,
                                                color: row.charmImpact < 0 ? '#ff4444' : '#00ff88',
                                                fontWeight: '700',
                                                fontSize: '14px'
                                            }}>
                                                {row.charmImpact < 0 ? '' : '+'}{(row.charmImpact / 1000).toFixed(2)}K
                                            </td>
                                        </tr>
                                    );
                                })}
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
                <div style={{ fontSize: '12px', color: '#fbbf24', fontWeight: '600', marginBottom: '8px' }}>
                    INTERPRETATION
                </div>
                <div style={{ fontSize: '12px', color: '#fff', lineHeight: '1.8' }}>
                    <div><span style={{ color: '#ff4444' }}>Negative Charm</span>: Dealers sell underlying as time passes (downward drift)</div>
                    <div><span style={{ color: '#00ff88' }}>Positive Charm</span>: Dealers buy underlying over time (upward drift)</div>
                    <div style={{ marginTop: '8px' }}>
                        <span style={{ color: '#fbbf24', fontWeight: '700' }}>⚡ CHARM-DOMINANT</span>: High OI near spot, gamma muted → Mean-reverting intraday drift, breakouts fail
                    </div>
                    <div style={{ marginTop: '4px', color: '#FFD700' }}>
                        💡 This explains "why price grinds for hours doing nothing" - it's mechanical, not fundamental
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
    color: '#f59e0b',
    letterSpacing: '1px',
    borderBottom: '2px solid rgba(245, 158, 11, 0.3)'
};

const cellStyle: React.CSSProperties = {
    padding: '12px 16px',
    fontSize: '13px',
    color: '#fff',
    fontWeight: '500'
};
