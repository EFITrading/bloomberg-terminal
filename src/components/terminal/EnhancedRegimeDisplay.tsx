'use client';

import { useState } from 'react';
import { RegimeAnalysis } from '@/contexts/MarketRegimeContext';

interface EnhancedRegimeDisplayProps {
    regimeAnalysis: Record<string, RegimeAnalysis>;
    selectedPeriod?: string;
}

export default function EnhancedRegimeDisplay({ regimeAnalysis, selectedPeriod = '1d' }: EnhancedRegimeDisplayProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [selectedTimeframe, setSelectedTimeframe] = useState(selectedPeriod);
    const [expandedSectors, setExpandedSectors] = useState<string[]>([]);

    const analysis = regimeAnalysis[selectedTimeframe];

    if (!analysis || Object.keys(regimeAnalysis).length === 0) {
        return null;
    }

    // Calculate weighted composite regime across all timeframes
    const timeframes = ['1d', '5d', '13d', '21d', '50d', 'ytd'];
    const weights = { '1d': 0.25, '5d': 0.20, '13d': 0.20, '21d': 0.15, '50d': 0.15, 'ytd': 0.05 }; // Recent data weighted more

    let compositeSpread = 0;
    let compositeDefensiveAvg = 0;
    let compositeGrowthAvg = 0;
    let compositeConfidence = 0;
    let totalWeight = 0;

    timeframes.forEach(tf => {
        const tfAnalysis = regimeAnalysis[tf];
        if (tfAnalysis) {
            const weight = weights[tf as keyof typeof weights];
            compositeSpread += tfAnalysis.defensiveGrowthSpread * weight;
            compositeDefensiveAvg += tfAnalysis.defensiveAvg * weight;
            compositeGrowthAvg += tfAnalysis.growthAvg * weight;
            compositeConfidence += tfAnalysis.confidence * weight;
            totalWeight += weight;
        }
    });

    // Normalize by actual total weight (in case some timeframes are missing)
    if (totalWeight > 0) {
        compositeSpread /= totalWeight;
        compositeDefensiveAvg /= totalWeight;
        compositeGrowthAvg /= totalWeight;
        compositeConfidence /= totalWeight;
    }

    // Determine composite regime
    const getCompositeRegime = () => {
        if (Math.abs(compositeSpread) < 0.5) return 'NEUTRAL';
        if (compositeSpread > 2) return 'DEFENSIVE STRONG';
        if (compositeSpread > 0) return 'DEFENSIVE';
        if (compositeSpread < -2) return 'RISK ON STRONG';
        return 'RISK ON';
    };

    const compositeRegime = getCompositeRegime();
    const compositeColor = compositeSpread > 0 ? '#ef4444' : compositeSpread < 0 ? '#10b981' : '#fbbf24';
    const compositeStrength = Math.abs(compositeSpread) > 2 ? 'EXTREME' :
        Math.abs(compositeSpread) > 1 ? 'STRONG' :
            Math.abs(compositeSpread) > 0.5 ? 'MODERATE' : 'WEAK';

    const { defensiveGrowthSpread, regime, confidence, spreadStrength, defensiveAvg, growthAvg, valueAvg } = analysis;

    // Determine color based on regime
    const getRegimeColor = () => {
        if (regime.includes('DEFENSIVE')) return '#ef4444';
        if (regime.includes('RISK ON')) return '#10b981';
        if (regime === 'VALUE') return '#fbbf24';
        if (regime === 'RISK OFF') return '#dc2626';
        return '#64748b';
    };

    const color = getRegimeColor();

    // Calculate normalized spread for visual bar width (0-50% range)
    const normalizedSpread = Math.min(Math.abs(compositeSpread) * 5, 50);

    // Calculate multi-timeframe alignment
    const alignmentScore = timeframes.reduce((score, tf) => {
        const tfAnalysis = regimeAnalysis[tf];
        if (!tfAnalysis) return score;

        // Check if regime direction matches composite
        const compositeIsDefensive = compositeSpread > 0;
        const tfIsDefensive = tfAnalysis.defensiveGrowthSpread > 0;

        return score + (compositeIsDefensive === tfIsDefensive ? 1 : 0);
    }, 0);

    const alignmentPercentage = (alignmentScore / timeframes.length) * 100;

    // Calculate velocity (rate of change between timeframes)
    const get5dAnalysis = regimeAnalysis['5d'];
    const velocity = get5dAnalysis
        ? ((analysis.defensiveGrowthSpread - get5dAnalysis.defensiveGrowthSpread) / 5).toFixed(3)
        : '0.000';

    // Calculate sector breadth (how many sectors are positive)
    const allSectors = [...analysis.defensiveSectors, ...analysis.growthSectors, ...analysis.valueSectors];
    const positiveSectors = allSectors.filter(s => s.change > 0).length;
    const breadthPercentage = (positiveSectors / allSectors.length) * 100;

    // Gauge component for circular visualization
    const RegimeGauge = ({
        value,
        label,
        size = 120,
        thickness = 12,
        showValue = true,
        regime = '',
        labelOffset = -5
    }: {
        value: number;
        label: string;
        size?: number;
        thickness?: number;
        showValue?: boolean;
        regime?: string;
        labelOffset?: number;
    }) => {
        // Normalize value to -10 to +10 range, map to 0-100 for gauge
        // INVERTED: Positive spread = defensive (left), Negative spread = growth (right)
        const normalizedValue = Math.max(-10, Math.min(10, -value)); // Inverted with negative
        const gaugePercentage = ((normalizedValue + 10) / 20) * 100;
        const rotation = (gaugePercentage / 100) * 180 - 90;

        // Color based on ORIGINAL value (positive = defensive/red, negative = growth/green)
        const getColor = () => {
            if (value > 2) return '#ef4444';      // Strong defensive
            if (value > 0.5) return '#ff6600';    // Moderate defensive
            if (value > -0.5) return '#fbbf24';   // Neutral
            if (value > -2) return '#10b981';     // Moderate growth
            return '#10b981';                      // Strong growth
        };

        // Determine outline color based on regime
        const getOutlineColor = () => {
            if (regime.includes('GROWTH + RISK ON')) return '#eab308';  // Yellow for growth + risk on
            return null; // No outline for other regimes
        };

        const color = getColor();
        const outlineColor = getOutlineColor();
        const radius = (size - thickness) / 2;
        const circumference = Math.PI * radius;
        const strokeDashoffset = circumference - (gaugePercentage / 100) * circumference;

        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <div style={{ position: 'relative', width: size, height: size / 2 + 20 }}>
                    {/* Background arc */}
                    <svg width={size} height={size / 2 + 20} style={{ transform: 'rotate(0deg)' }}>
                        {/* Outline ring for combined regimes */}
                        {outlineColor && (
                            <path
                                d={`M ${thickness / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - thickness / 2} ${size / 2}`}
                                fill="none"
                                stroke={outlineColor}
                                strokeWidth={thickness + 6}
                                strokeLinecap="round"
                                opacity={0.6}
                            />
                        )}
                        <path
                            d={`M ${thickness / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - thickness / 2} ${size / 2}`}
                            fill="none"
                            stroke="#1a1a1a"
                            strokeWidth={thickness}
                            strokeLinecap="round"
                        />
                        {/* Colored arc */}
                        <path
                            d={`M ${thickness / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - thickness / 2} ${size / 2}`}
                            fill="none"
                            stroke={color}
                            strokeWidth={thickness}
                            strokeLinecap="round"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeDashoffset}
                            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                        />
                    </svg>

                    {/* Center labels */}
                    <div style={{
                        position: 'absolute',
                        top: '45%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        textAlign: 'center'
                    }}>
                        {showValue && size > 150 && (
                            <div style={{
                                fontSize: size > 100 ? '24px' : '14px',
                                fontWeight: '900',
                                color: color,
                                fontFamily: 'monospace',
                                textShadow: `0 0 10px ${color}60`
                            }}>
                                {value >= 0 ? '+' : ''}{value.toFixed(2)}%
                            </div>
                        )}
                        <div style={{
                            fontSize: size > 100 ? '11px' : '9px',
                            color: '#ffffff',
                            fontWeight: '700',
                            fontFamily: 'monospace',
                            textTransform: 'uppercase',
                            letterSpacing: '0.1em',
                            marginTop: '2px'
                        }}>
                            {label}
                        </div>
                    </div>

                    {/* Needle indicator */}
                    <div style={{
                        position: 'absolute',
                        bottom: 0,
                        left: '50%',
                        width: '2px',
                        height: radius - 10,
                        background: '#ff6600',
                        transformOrigin: 'bottom center',
                        transform: `translateX(-50%) rotate(${rotation}deg)`,
                        transition: 'transform 0.5s ease',
                        boxShadow: `0 0 8px ${color}80`
                    }} />

                    {/* Labels */}
                    <div style={{
                        position: 'absolute',
                        bottom: labelOffset,
                        left: -10,
                        fontSize: '14px',
                        color: '#ef4444',
                        fontWeight: '900',
                        fontFamily: 'monospace'
                    }}>DEFENSIVE</div>
                    <div style={{
                        position: 'absolute',
                        bottom: labelOffset,
                        right: -10,
                        fontSize: '14px',
                        color: '#22c55e',
                        fontWeight: '900',
                        fontFamily: 'monospace'
                    }}>GROWTH</div>
                </div>
            </div>
        );
    };

    return (
        <div
            className="enhanced-regime-display"
            style={{
                position: 'relative',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
                background: '#000000',
                borderRadius: '2px',
                padding: '24px',
                border: '2px solid #333333',
                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 2px 4px rgba(0, 0, 0, 0.8)',
            }}
        >
            {/* Toggle Button */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                style={{
                    position: 'absolute',
                    top: '12px',
                    right: '12px',
                    padding: '8px 16px',
                    background: '#000000',
                    border: '2px solid #ff6600',
                    borderRadius: '2px',
                    color: '#ff6600',
                    fontSize: '12px',
                    fontWeight: '900',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 2px 4px rgba(0, 0, 0, 0.8)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    zIndex: 10
                }}
            >
                {isExpanded ? 'HIDE SECTORS' : 'SHOW SECTORS'}
            </button>

            {/* MAIN COMPOSITE GAUGE - Large Central Display */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '300px 1fr',
                gap: '20px',
                padding: '20px',
                background: '#000000',
                border: `3px solid #ffffff`,
                borderRadius: '2px',
                boxShadow: `inset 0 2px 0 rgba(255, 255, 255, 0.15), 0 4px 8px rgba(0, 0, 0, 0.9), 0 0 30px ${compositeColor}30`,
                alignItems: 'center'
            }}>
                {/* Left: Large Gauge */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        fontSize: '16px',
                        color: '#ff6600',
                        fontWeight: '900',
                        fontFamily: 'monospace',
                        letterSpacing: '0.3em',
                        textTransform: 'uppercase'
                    }}>
                        COMPOSITE
                    </div>

                    <RegimeGauge
                        value={compositeSpread}
                        label=""
                        size={239}
                        thickness={23}
                        regime={compositeRegime}
                        showValue={false}
                        labelOffset={-15}
                    />

                    <div style={{
                        padding: '10px 20px',
                        background: '#000000',
                        border: `2px solid ${compositeColor}`,
                        borderRadius: '2px',
                        boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 0 15px ${compositeColor}50`,
                        textAlign: 'center',
                        marginTop: '20px'
                    }}>
                        <div style={{
                            fontSize: '19px',
                            fontWeight: '900',
                            color: compositeColor,
                            fontFamily: 'monospace',
                            letterSpacing: '0.05em',
                            textShadow: `0 0 10px ${compositeColor}70`
                        }}>
                            {compositeRegime}
                        </div>
                        <div style={{
                            fontSize: '13px',
                            color: '#ff6600',
                            fontWeight: '800',
                            fontFamily: 'monospace',
                            marginTop: '4px',
                            letterSpacing: '0.15em'
                        }}>
                            {compositeStrength} • {Math.round(compositeConfidence)}%
                        </div>
                    </div>
                </div>

                {/* Right: Timeframe Gauges */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '12px'
                }}>
                    {timeframes.map(tf => {
                        const tfAnalysis = regimeAnalysis[tf];
                        if (!tfAnalysis) return null;

                        const isSelected = tf === selectedTimeframe;
                        const tfSpread = tfAnalysis.defensiveGrowthSpread;

                        return (
                            <div
                                key={tf}
                                onClick={() => setSelectedTimeframe(tf)}
                                style={{
                                    padding: '12px 8px',
                                    background: '#000000',
                                    border: isSelected ? `2px solid #ff6600` : '2px solid #333333',
                                    borderRadius: '2px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    boxShadow: isSelected ? `0 0 15px #ff660040` : 'none'
                                }}
                            >
                                <div style={{
                                    fontSize: '14px',
                                    color: '#ff6600',
                                    fontWeight: '900',
                                    fontFamily: 'monospace',
                                    textAlign: 'center',
                                    marginBottom: '8px',
                                    letterSpacing: '0.1em'
                                }}>
                                    {tf === '1d' ? 'TODAY' : tf === '5d' ? 'WEEK' : tf === '21d' ? 'MONTH' : tf === '50d' ? 'QUARTER' : tf.toUpperCase()}
                                </div>
                                <RegimeGauge
                                    value={tfSpread}
                                    label=""
                                    size={145}
                                    thickness={14}
                                    showValue={true}
                                    regime={tfAnalysis.regime}
                                />
                                <div style={{
                                    fontSize: '12px',
                                    color: '#ffffff',
                                    fontFamily: 'monospace',
                                    textAlign: 'center',
                                    marginTop: '6px'
                                }}>
                                    {tfAnalysis.regime}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* SECTOR BREAKDOWN - Expandable */}
            {isExpanded && (
                <div style={{
                    background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.98) 0%, rgba(15, 15, 15, 0.98) 100%)',
                    border: `2px solid ${compositeColor}50`,
                    borderRadius: '2px',
                    padding: '20px',
                    boxShadow: `0 8px 32px ${compositeColor}40, inset 0 1px 0 rgba(255, 255, 255, 0.05)`
                }}>
                    {/* Sector Breakdown with Holdings */}
                    <div>
                        <div style={{
                            fontSize: '13px',
                            fontWeight: '900',
                            color: '#ff6600',
                            marginBottom: '16px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.2em',
                            fontFamily: 'monospace',
                            textAlign: 'center'
                        }}>
                            SECTOR PERFORMANCE & HOLDINGS
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                            {/* Defensive Sectors */}
                            <div>
                                <div style={{
                                    fontSize: '14px',
                                    color: '#ef4444',
                                    fontWeight: '900',
                                    marginBottom: '10px',
                                    fontFamily: 'monospace',
                                    letterSpacing: '0.15em',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    padding: '8px 10px',
                                    background: '#000000',
                                    border: '2px solid #ef4444',
                                    borderRadius: '2px',
                                    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 2px 4px rgba(0, 0, 0, 0.8)'
                                }}>
                                    <span>DEFENSIVE</span>
                                    <span>{defensiveAvg.toFixed(2)}%</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {analysis.defensiveSectors.map(s => {
                                        // Mock top holdings data - in production, this would come from API
                                        const mockHoldings = {
                                            'XLP': [
                                                { symbol: 'PG', name: 'Procter & Gamble', weight: 8.5, change: 1.2 },
                                                { symbol: 'KO', name: 'Coca-Cola', weight: 7.2, change: -0.8 },
                                                { symbol: 'WMT', name: 'Walmart', weight: 6.8, change: 0.5 }
                                            ],
                                            'XLU': [
                                                { symbol: 'NEE', name: 'NextEra Energy', weight: 10.2, change: -1.1 },
                                                { symbol: 'DUK', name: 'Duke Energy', weight: 6.5, change: 0.3 },
                                                { symbol: 'SO', name: 'Southern Co', weight: 5.9, change: -0.5 }
                                            ],
                                            'XLRE': [
                                                { symbol: 'PLD', name: 'Prologis', weight: 9.8, change: -2.1 },
                                                { symbol: 'AMT', name: 'American Tower', weight: 8.1, change: -1.5 },
                                                { symbol: 'EQIX', name: 'Equinix', weight: 6.7, change: -0.9 }
                                            ],
                                            'XLV': [
                                                { symbol: 'UNH', name: 'UnitedHealth', weight: 11.2, change: 0.8 },
                                                { symbol: 'JNJ', name: 'Johnson & Johnson', weight: 8.9, change: -0.2 },
                                                { symbol: 'LLY', name: 'Eli Lilly', weight: 7.5, change: 1.5 }
                                            ]
                                        };

                                        const holdings = mockHoldings[s.sector as keyof typeof mockHoldings] || [];
                                        const isExpanded = expandedSectors.includes(s.sector);

                                        return (
                                            <div key={s.sector}>
                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        fontSize: '12px',
                                                        fontFamily: 'monospace',
                                                        padding: '8px 10px',
                                                        background: '#000000',
                                                        border: `2px solid ${s.change > 0 ? '#10b981' : '#ef4444'}`,
                                                        borderRadius: '2px',
                                                        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 2px 4px rgba(0, 0, 0, 0.8)',
                                                        cursor: 'pointer'
                                                    }}
                                                    onClick={() => setExpandedSectors(prev =>
                                                        prev.includes(s.sector) ? prev.filter(x => x !== s.sector) : [...prev, s.sector]
                                                    )}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ color: '#ff6600', fontSize: '10px' }}>
                                                            {isExpanded ? '▼' : '►'}
                                                        </span>
                                                        <span style={{ color: '#ffffff', fontWeight: '800', opacity: 1.0 }}>{s.sector}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
                                                        <span style={{
                                                            color: s.change >= 0 ? '#10b981' : '#ef4444',
                                                            fontWeight: '900',
                                                            fontSize: '14px',
                                                            opacity: 1.0
                                                        }}>
                                                            {s.change >= 0 ? '+' : ''}{s.change.toFixed(2)}%
                                                        </span>
                                                        <span style={{ fontSize: '11px', color: '#ff6600', opacity: 1.0, fontWeight: '700' }}>
                                                            vs SPY: {s.relativeToSPY >= 0 ? '+' : ''}{s.relativeToSPY.toFixed(2)}%
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Holdings Breakdown */}
                                                {isExpanded && holdings.length > 0 && (
                                                    <div style={{
                                                        marginTop: '4px',
                                                        marginLeft: '10px',
                                                        padding: '8px',
                                                        background: '#0a0a0a',
                                                        border: '1px solid #333333',
                                                        borderRadius: '2px'
                                                    }}>
                                                        <div style={{ fontSize: '10px', color: '#ff6600', fontWeight: '800', marginBottom: '6px', fontFamily: 'monospace' }}>
                                                            TOP HOLDINGS
                                                        </div>
                                                        {holdings.map(h => (
                                                            <div key={h.symbol} style={{
                                                                display: 'flex',
                                                                justifyContent: 'space-between',
                                                                padding: '4px 6px',
                                                                marginBottom: '2px',
                                                                background: '#000000',
                                                                border: `1px solid ${h.change >= 0 ? '#10b981' : '#ef4444'}`,
                                                                borderRadius: '2px'
                                                            }}>
                                                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                                    <span style={{ fontSize: '11px', color: '#ffffff', fontWeight: '800' }}>{h.symbol}</span>
                                                                    <span style={{ fontSize: '9px', color: '#ffffff' }}>({h.weight.toFixed(1)}%)</span>
                                                                </div>
                                                                <span style={{
                                                                    fontSize: '11px',
                                                                    color: h.change >= 0 ? '#10b981' : '#ef4444',
                                                                    fontWeight: '800'
                                                                }}>
                                                                    {h.change >= 0 ? '+' : ''}{h.change.toFixed(2)}%
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Growth Sectors */}
                            <div>
                                <div style={{
                                    fontSize: '14px',
                                    color: '#10b981',
                                    fontWeight: '900',
                                    marginBottom: '10px',
                                    fontFamily: 'monospace',
                                    letterSpacing: '0.15em',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    padding: '8px 10px',
                                    background: '#000000',
                                    border: '2px solid #10b981',
                                    borderRadius: '2px',
                                    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 2px 4px rgba(0, 0, 0, 0.8)'
                                }}>
                                    <span>GROWTH</span>
                                    <span>{growthAvg.toFixed(2)}%</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {analysis.growthSectors.map(s => {
                                        // Mock top holdings data - in production, this would come from API
                                        const mockHoldings = {
                                            'XLY': [
                                                { symbol: 'AMZN', name: 'Amazon', weight: 22.5, change: 2.3 },
                                                { symbol: 'TSLA', name: 'Tesla', weight: 15.1, change: -1.8 },
                                                { symbol: 'HD', name: 'Home Depot', weight: 9.7, change: 0.6 }
                                            ],
                                            'XLK': [
                                                { symbol: 'AAPL', name: 'Apple', weight: 21.8, change: 1.5 },
                                                { symbol: 'MSFT', name: 'Microsoft', weight: 20.5, change: 0.9 },
                                                { symbol: 'NVDA', name: 'Nvidia', weight: 8.2, change: 3.2 }
                                            ],
                                            'XLC': [
                                                { symbol: 'META', name: 'Meta', weight: 22.1, change: 2.1 },
                                                { symbol: 'GOOGL', name: 'Alphabet A', weight: 13.4, change: 1.2 },
                                                { symbol: 'GOOG', name: 'Alphabet C', weight: 11.8, change: 1.1 }
                                            ]
                                        };

                                        const holdings = mockHoldings[s.sector as keyof typeof mockHoldings] || [];
                                        const isExpanded = expandedSectors.includes(s.sector);

                                        return (
                                            <div key={s.sector}>
                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        fontSize: '12px',
                                                        fontFamily: 'monospace',
                                                        padding: '8px 10px',
                                                        background: '#000000',
                                                        border: `2px solid ${s.change > 0 ? '#10b981' : '#ef4444'}`,
                                                        borderRadius: '2px',
                                                        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 2px 4px rgba(0, 0, 0, 0.8)',
                                                        cursor: 'pointer'
                                                    }}
                                                    onClick={() => setExpandedSectors(prev =>
                                                        prev.includes(s.sector) ? prev.filter(x => x !== s.sector) : [...prev, s.sector]
                                                    )}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ color: '#ff6600', fontSize: '10px' }}>
                                                            {isExpanded ? '▼' : '►'}
                                                        </span>
                                                        <span style={{ color: '#ffffff', fontWeight: '800', opacity: 1.0 }}>{s.sector}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
                                                        <span style={{
                                                            color: s.change >= 0 ? '#10b981' : '#ef4444',
                                                            fontWeight: '900',
                                                            fontSize: '14px',
                                                            opacity: 1.0
                                                        }}>
                                                            {s.change >= 0 ? '+' : ''}{s.change.toFixed(2)}%
                                                        </span>
                                                        <span style={{ fontSize: '11px', color: '#ff6600', opacity: 1.0, fontWeight: '700' }}>
                                                            vs SPY: {s.relativeToSPY >= 0 ? '+' : ''}{s.relativeToSPY.toFixed(2)}%
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Holdings Breakdown */}
                                                {isExpanded && holdings.length > 0 && (
                                                    <div style={{
                                                        marginTop: '4px',
                                                        marginLeft: '10px',
                                                        padding: '8px',
                                                        background: '#0a0a0a',
                                                        border: '1px solid #333333',
                                                        borderRadius: '2px'
                                                    }}>
                                                        <div style={{ fontSize: '10px', color: '#ff6600', fontWeight: '800', marginBottom: '6px', fontFamily: 'monospace' }}>
                                                            TOP HOLDINGS
                                                        </div>
                                                        {holdings.map(h => (
                                                            <div key={h.symbol} style={{
                                                                display: 'flex',
                                                                justifyContent: 'space-between',
                                                                padding: '4px 6px',
                                                                marginBottom: '2px',
                                                                background: '#000000',
                                                                border: `1px solid ${h.change >= 0 ? '#10b981' : '#ef4444'}`,
                                                                borderRadius: '2px'
                                                            }}>
                                                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                                    <span style={{ fontSize: '11px', color: '#ffffff', fontWeight: '800' }}>{h.symbol}</span>
                                                                    <span style={{ fontSize: '9px', color: '#ffffff' }}>({h.weight.toFixed(1)}%)</span>
                                                                </div>
                                                                <span style={{
                                                                    fontSize: '11px',
                                                                    color: h.change >= 0 ? '#10b981' : '#ef4444',
                                                                    fontWeight: '800'
                                                                }}>
                                                                    {h.change >= 0 ? '+' : ''}{h.change.toFixed(2)}%
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Value Sectors */}
                            <div>
                                <div style={{
                                    fontSize: '14px',
                                    color: '#ff6600',
                                    fontWeight: '900',
                                    marginBottom: '10px',
                                    fontFamily: 'monospace',
                                    letterSpacing: '0.15em',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    padding: '8px 10px',
                                    background: '#000000',
                                    border: '2px solid #ff6600',
                                    borderRadius: '2px',
                                    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 2px 4px rgba(0, 0, 0, 0.8)'
                                }}>
                                    <span>VALUE</span>
                                    <span>{valueAvg.toFixed(2)}%</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {analysis.valueSectors.map(s => {
                                        // Mock top holdings data - in production, this would come from API
                                        const mockHoldings = {
                                            'XLB': [
                                                { symbol: 'LIN', name: 'Linde', weight: 16.8, change: 0.7 },
                                                { symbol: 'APD', name: 'Air Products', weight: 7.2, change: -0.3 },
                                                { symbol: 'SHW', name: 'Sherwin-Williams', weight: 6.9, change: 1.1 }
                                            ],
                                            'XLI': [
                                                { symbol: 'UPS', name: 'UPS', weight: 5.8, change: -1.2 },
                                                { symbol: 'BA', name: 'Boeing', weight: 5.5, change: 2.8 },
                                                { symbol: 'HON', name: 'Honeywell', weight: 5.2, change: 0.4 }
                                            ],
                                            'XLF': [
                                                { symbol: 'BRK.B', name: 'Berkshire Hathaway', weight: 13.2, change: 0.9 },
                                                { symbol: 'JPM', name: 'JP Morgan', weight: 10.8, change: 1.3 },
                                                { symbol: 'V', name: 'Visa', weight: 7.5, change: 0.5 }
                                            ],
                                            'XLE': [
                                                { symbol: 'XOM', name: 'Exxon Mobil', weight: 22.1, change: -2.5 },
                                                { symbol: 'CVX', name: 'Chevron', weight: 14.5, change: -1.8 },
                                                { symbol: 'COP', name: 'ConocoPhillips', weight: 6.8, change: -3.1 }
                                            ]
                                        };

                                        const holdings = mockHoldings[s.sector as keyof typeof mockHoldings] || [];
                                        const isExpanded = expandedSectors.includes(s.sector);

                                        return (
                                            <div key={s.sector}>
                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        fontSize: '12px',
                                                        fontFamily: 'monospace',
                                                        padding: '8px 10px',
                                                        background: '#000000',
                                                        border: `2px solid ${s.change > 0 ? '#10b981' : '#ef4444'}`,
                                                        borderRadius: '2px',
                                                        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 2px 4px rgba(0, 0, 0, 0.8)',
                                                        cursor: 'pointer'
                                                    }}
                                                    onClick={() => setExpandedSectors(prev =>
                                                        prev.includes(s.sector) ? prev.filter(x => x !== s.sector) : [...prev, s.sector]
                                                    )}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ color: '#ff6600', fontSize: '10px' }}>
                                                            {isExpanded ? '▼' : '►'}
                                                        </span>
                                                        <span style={{ color: '#ffffff', fontWeight: '800', opacity: 1.0 }}>{s.sector}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
                                                        <span style={{
                                                            color: s.change >= 0 ? '#10b981' : '#ef4444',
                                                            fontWeight: '900',
                                                            fontSize: '14px',
                                                            opacity: 1.0
                                                        }}>
                                                            {s.change >= 0 ? '+' : ''}{s.change.toFixed(2)}%
                                                        </span>
                                                        <span style={{ fontSize: '11px', color: '#ff6600', opacity: 1.0, fontWeight: '700' }}>
                                                            vs SPY: {s.relativeToSPY >= 0 ? '+' : ''}{s.relativeToSPY.toFixed(2)}%
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Holdings Breakdown */}
                                                {isExpanded && holdings.length > 0 && (
                                                    <div style={{
                                                        marginTop: '4px',
                                                        marginLeft: '10px',
                                                        padding: '8px',
                                                        background: '#0a0a0a',
                                                        border: '1px solid #333333',
                                                        borderRadius: '2px'
                                                    }}>
                                                        <div style={{ fontSize: '10px', color: '#ff6600', fontWeight: '800', marginBottom: '6px', fontFamily: 'monospace' }}>
                                                            TOP HOLDINGS
                                                        </div>
                                                        {holdings.map(h => (
                                                            <div key={h.symbol} style={{
                                                                display: 'flex',
                                                                justifyContent: 'space-between',
                                                                padding: '4px 6px',
                                                                marginBottom: '2px',
                                                                background: '#000000',
                                                                border: `1px solid ${h.change >= 0 ? '#10b981' : '#ef4444'}`,
                                                                borderRadius: '2px'
                                                            }}>
                                                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                                    <span style={{ fontSize: '11px', color: '#ffffff', fontWeight: '800' }}>{h.symbol}</span>
                                                                    <span style={{ fontSize: '9px', color: '#ffffff' }}>({h.weight.toFixed(1)}%)</span>
                                                                </div>
                                                                <span style={{
                                                                    fontSize: '11px',
                                                                    color: h.change >= 0 ? '#10b981' : '#ef4444',
                                                                    fontWeight: '800'
                                                                }}>
                                                                    {h.change >= 0 ? '+' : ''}{h.change.toFixed(2)}%
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Advanced Metrics */}
                    <div style={{
                        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                        paddingTop: '16px',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: '12px'
                    }}>
                        <div style={{
                            padding: '12px',
                            background: 'rgba(255, 255, 255, 0.03)',
                            borderRadius: '6px',
                            border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}>
                            <div style={{ fontSize: '11px', color: '#ffffff', fontWeight: '700', marginBottom: '6px', fontFamily: 'monospace' }}>
                                SPREAD VELOCITY
                            </div>
                            <div style={{ fontSize: '16px', fontWeight: '900', color: parseFloat(velocity) > 0 ? '#10b981' : '#ef4444', fontFamily: 'monospace' }}>
                                {parseFloat(velocity) >= 0 ? '+' : ''}{velocity}%/day
                            </div>
                            <div style={{ fontSize: '9px', color: '#ffffff', opacity: 0.6, marginTop: '4px', fontFamily: 'monospace' }}>
                                {parseFloat(velocity) > 0 ? 'Strengthening' : parseFloat(velocity) < 0 ? 'Weakening' : 'Stable'}
                            </div>
                        </div>

                        <div style={{
                            padding: '12px',
                            background: 'rgba(255, 255, 255, 0.03)',
                            borderRadius: '6px',
                            border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}>
                            <div style={{ fontSize: '11px', color: '#ffffff', fontWeight: '700', marginBottom: '6px', fontFamily: 'monospace' }}>
                                TIMEFRAME SYNC
                            </div>
                            <div style={{ fontSize: '16px', fontWeight: '900', color: alignmentPercentage >= 80 ? '#10b981' : alignmentPercentage >= 60 ? '#fbbf24' : '#ef4444', fontFamily: 'monospace' }}>
                                {Math.round(alignmentPercentage)}%
                            </div>
                            <div style={{ fontSize: '9px', color: '#ffffff', opacity: 0.6, marginTop: '4px', fontFamily: 'monospace' }}>
                                {alignmentScore}/{timeframes.length} Aligned
                            </div>
                        </div>

                        <div style={{
                            padding: '12px',
                            background: 'rgba(255, 255, 255, 0.03)',
                            borderRadius: '6px',
                            border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}>
                            <div style={{ fontSize: '11px', color: '#ffffff', fontWeight: '700', marginBottom: '6px', fontFamily: 'monospace' }}>
                                MARKET BREADTH
                            </div>
                            <div style={{ fontSize: '16px', fontWeight: '900', color: breadthPercentage >= 50 ? '#10b981' : '#ef4444', fontFamily: 'monospace' }}>
                                {Math.round(breadthPercentage)}%
                            </div>
                            <div style={{ fontSize: '9px', color: '#ffffff', opacity: 0.6, marginTop: '4px', fontFamily: 'monospace' }}>
                                {positiveSectors} of {allSectors.length} Up
                            </div>
                        </div>

                        <div style={{
                            padding: '12px',
                            background: 'rgba(255, 255, 255, 0.03)',
                            borderRadius: '6px',
                            border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}>
                            <div style={{ fontSize: '11px', color: '#ffffff', fontWeight: '700', marginBottom: '6px', fontFamily: 'monospace' }}>
                                REGIME STRENGTH
                            </div>
                            <div style={{ fontSize: '16px', fontWeight: '900', color: color, fontFamily: 'monospace' }}>
                                {spreadStrength}
                            </div>
                            <div style={{ fontSize: '9px', color: '#ffffff', opacity: 0.6, marginTop: '4px', fontFamily: 'monospace' }}>
                                {confidence.toFixed(0)}% Confidence
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <style jsx>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: .5;
          }
        }
      `}</style>
        </div>
    );
}

