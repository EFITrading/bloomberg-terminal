'use client';

import React, { useState } from 'react';
import DealerOpenInterestChart from '../../components/analytics/DealerOpenInterestChart';
import DealerGEXChart from '../../components/analytics/DealerGEXChart';
import UnifiedScreenerPanel from '../../components/analytics/UnifiedScreenerPanel';
import RRGAnalytics from '../../components/analytics/RRGAnalytics';
import PerformanceDashboard from '../../components/charts/PerformanceDashboard';
import MarketHeatmap from '../../components/analytics/MarketHeatmap';

export default function AnalysisSuite() {
    const [tickerInput, setTickerInput] = useState('');
    const [selectedTicker, setSelectedTicker] = useState('');
    const [sharedExpiration, setSharedExpiration] = useState<string>('');
    const [expirationDates, setExpirationDates] = useState<string[]>([]);

    // OI Chart State
    const [showCalls, setShowCalls] = useState<boolean>(true);
    const [showPuts, setShowPuts] = useState<boolean>(true);
    const [showNetOI, setShowNetOI] = useState<boolean>(false);
    const [cumulativePCRatio45Days, setCumulativePCRatio45Days] = useState<string>('');
    const [expectedRangePCRatio, setExpectedRangePCRatio] = useState<string>('');
    const [expectedRange90, setExpectedRange90] = useState<{ call: number, put: number } | null>(null);

    // GEX Chart State
    const [showPositiveGamma, setShowPositiveGamma] = useState<boolean>(true);
    const [showNegativeGamma, setShowNegativeGamma] = useState<boolean>(true);
    const [showNetGamma, setShowNetGamma] = useState<boolean>(true);

    // Unified Controls
    const [showPremium, setShowPremium] = useState<boolean>(false);
    const [showAITowers, setShowAITowers] = useState<boolean>(false);

    // Fetch expiration dates
    React.useEffect(() => {
        if (!selectedTicker) return;

        const fetchExpirations = async () => {
            try {
                const response = await fetch(`/api/dealer-options-premium?ticker=${selectedTicker}`);
                const result = await response.json();

                if (result.success && result.data) {
                    const dates = Object.keys(result.data).sort();
                    setExpirationDates(dates);

                    if (dates.length > 0 && !sharedExpiration) {
                        setSharedExpiration(dates[0]);
                    }
                }
            } catch (err) {
                console.error('Error fetching expirations:', err);
            }
        };

        fetchExpirations();
    }, [selectedTicker]);

    return (
        <div style={{
            background: 'transparent',
            minHeight: '100vh',
            padding: '20px',
            color: 'white',
            fontFamily: '"Roboto Mono", monospace',
            position: 'relative',
            zIndex: 1
        }}>

            <div style={{
                maxWidth: '1400px',
                margin: '0 auto',
                paddingTop: '60px',
                width: '100%'
            }}>
                {/* OI/GEX Charts Section with Unified Control Bar */}
                <div style={{
                    background: 'rgba(0, 0, 0, 0.95)',
                    borderRadius: '0px',
                    padding: '20px',
                    marginBottom: '20px'
                }}>
                    {/* Unified Control Bar */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: '16px',
                        alignItems: 'center',
                        padding: '20px 24px',
                        background: '#000000',
                        borderRadius: '12px',
                        border: '1px solid #333333',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8), 0 2px 8px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 -1px 0 rgba(0, 0, 0, 0.8)',
                        position: 'relative',
                        zIndex: 100,
                        transform: 'translateZ(0)',
                        backdropFilter: 'blur(20px)',
                        overflow: 'visible',
                        marginBottom: '20px'
                    }}>
                        <div style={{
                            position: 'absolute',
                            top: '1px',
                            left: '1px',
                            right: '1px',
                            height: '50%',
                            background: 'rgba(255, 255, 255, 0.05)',
                            borderRadius: '12px 12px 0 0',
                            pointerEvents: 'none'
                        }} />

                        {/* Ticker Input */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', zIndex: 1 }}>
                            <input
                                type="text"
                                value={tickerInput}
                                onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        setSelectedTicker(tickerInput);
                                    }
                                }}
                                placeholder="Ticker"
                                style={{
                                    background: '#000000',
                                    border: '1px solid #333333',
                                    borderRadius: '8px',
                                    color: '#ffffff',
                                    padding: '10px 14px',
                                    fontSize: '14px',
                                    fontWeight: '600',
                                    width: '120px',
                                    outline: 'none',
                                    textTransform: 'uppercase',
                                    boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.6), inset 0 -1px 0 rgba(255, 255, 255, 0.05), 0 1px 0 rgba(255, 255, 255, 0.1)'
                                }}
                            />
                        </div>

                        <div style={{ width: '1px', height: '30px', background: 'linear-gradient(180deg, transparent, #333333, transparent)', margin: '0 8px', zIndex: 1 }} />

                        {/* Expiration Selector */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', zIndex: 1 }}>
                            <select
                                value={sharedExpiration}
                                onChange={(e) => setSharedExpiration(e.target.value)}
                                style={{
                                    background: '#000000',
                                    border: '1px solid #333333',
                                    borderRadius: '8px',
                                    color: '#ffffff',
                                    padding: '10px 14px',
                                    fontSize: '14px',
                                    fontWeight: '500',
                                    minWidth: '85px',
                                    outline: 'none',
                                    cursor: 'pointer',
                                    boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.6), inset 0 -1px 0 rgba(255, 255, 255, 0.05), 0 1px 0 rgba(255, 255, 255, 0.1)'
                                }}
                            >
                                <option value="45-days">45 Days (All)</option>
                                {expirationDates.map(date => (
                                    <option key={date} value={date}>
                                        {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div style={{ width: '1px', height: '30px', background: 'linear-gradient(180deg, transparent, #333333, transparent)', margin: '0 8px', zIndex: 1 }} />

                        {/* 90% Range P/C Display */}
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '2px',
                            padding: '10px 14px',
                            background: '#000000',
                            borderRadius: '8px',
                            border: '1px solid #333333',
                            boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.6), inset 0 -1px 0 rgba(255, 255, 255, 0.05), 0 1px 0 rgba(255, 255, 255, 0.1)',
                            zIndex: 1
                        }}>
                            <div style={{ color: '#ff6600', fontSize: '10px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                                90% Range P/C
                            </div>
                            <div style={{ color: '#ffffff', fontSize: '13px', fontWeight: '600', fontFamily: '"SF Mono", "Monaco", "Courier New", monospace' }}>
                                {expectedRangePCRatio || 'Calculating...'}
                            </div>
                        </div>

                        {/* 45D P/C Display */}
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '2px',
                            padding: '10px 14px',
                            background: '#000000',
                            borderRadius: '8px',
                            border: '1px solid #333333',
                            boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.6), inset 0 -1px 0 rgba(255, 255, 255, 0.05), 0 1px 0 rgba(255, 255, 255, 0.1)',
                            zIndex: 1
                        }}>
                            <div style={{ color: '#ff6600', fontSize: '10px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                                45D P/C
                            </div>
                            <div style={{ color: '#ffffff', fontSize: '13px', fontWeight: '600', fontFamily: '"SF Mono", "Monaco", "Courier New", monospace' }}>
                                {cumulativePCRatio45Days || 'Calculating...'}
                            </div>
                        </div>

                        <div style={{ width: '1px', height: '30px', background: 'linear-gradient(180deg, transparent, #333333, transparent)', margin: '0 8px', zIndex: 1 }} />

                        {/* AI Button */}
                        <button
                            onClick={() => setShowAITowers(!showAITowers)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '10px 16px',
                                background: showAITowers ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#000000',
                                border: showAITowers ? '1px solid #667eea' : '1px solid #333333',
                                borderRadius: '8px',
                                color: '#ffffff',
                                fontSize: '13px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                boxShadow: showAITowers ? '0 4px 12px rgba(102, 126, 234, 0.4)' : 'inset 0 2px 4px rgba(0, 0, 0, 0.6), inset 0 -1px 0 rgba(255, 255, 255, 0.05), 0 1px 0 rgba(255, 255, 255, 0.1)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                zIndex: 1
                            }}
                        >
                            👑 AI
                        </button>

                        {/* Premium Button */}
                        <button
                            onClick={() => setShowPremium(!showPremium)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '10px 16px',
                                background: showPremium ? 'rgba(255, 170, 0, 0.2)' : '#000000',
                                border: showPremium ? '1px solid #ffaa00' : '1px solid #333333',
                                borderRadius: '8px',
                                color: showPremium ? '#ffaa00' : '#ffffff',
                                fontSize: '13px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                boxShadow: showPremium ? 'none' : 'inset 0 2px 4px rgba(0, 0, 0, 0.6), inset 0 -1px 0 rgba(255, 255, 255, 0.05), 0 1px 0 rgba(255, 255, 255, 0.1)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                zIndex: 1
                            }}
                        >
                            💰 Premium
                        </button>

                        <div style={{ width: '1px', height: '30px', background: 'linear-gradient(180deg, transparent, #333333, transparent)', margin: '0 8px', zIndex: 1 }} />

                        {/* Calls/Puts Dropdown */}
                        <select
                            value={showNetOI ? 'net' : (showCalls && showPuts ? 'both' : (showCalls ? 'calls' : 'puts'))}
                            onChange={(e) => {
                                const value = e.target.value;
                                if (value === 'both') {
                                    setShowCalls(true);
                                    setShowPuts(true);
                                    setShowNetOI(false);
                                } else if (value === 'calls') {
                                    setShowCalls(true);
                                    setShowPuts(false);
                                    setShowNetOI(false);
                                } else if (value === 'puts') {
                                    setShowCalls(false);
                                    setShowPuts(true);
                                    setShowNetOI(false);
                                } else if (value === 'net') {
                                    setShowNetOI(true);
                                    setShowCalls(false);
                                    setShowPuts(false);
                                }
                            }}
                            style={{
                                background: '#000000',
                                border: '1px solid #333333',
                                borderRadius: '8px',
                                color: '#ffffff',
                                padding: '10px 14px',
                                fontSize: '13px',
                                fontWeight: '500',
                                minWidth: '60px',
                                outline: 'none',
                                cursor: 'pointer',
                                boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.6), inset 0 -1px 0 rgba(255, 255, 255, 0.05), 0 1px 0 rgba(255, 255, 255, 0.1)',
                                zIndex: 1
                            }}
                        >
                            <option value="both">OI</option>
                            <option value="calls">Calls Only</option>
                            <option value="puts">Puts Only</option>
                            <option value="net">Net OI</option>
                        </select>

                        <div style={{ width: '1px', height: '30px', background: 'linear-gradient(180deg, transparent, #333333, transparent)', margin: '0 8px', zIndex: 1 }} />

                        {/* Gamma Dropdown */}
                        <select
                            value={showNetGamma ? 'net' : (showPositiveGamma && showNegativeGamma ? 'both' : (showPositiveGamma ? 'positive' : 'negative'))}
                            onChange={(e) => {
                                const value = e.target.value;
                                if (value === 'both') {
                                    setShowPositiveGamma(true);
                                    setShowNegativeGamma(true);
                                    setShowNetGamma(false);
                                } else if (value === 'positive') {
                                    setShowPositiveGamma(true);
                                    setShowNegativeGamma(false);
                                    setShowNetGamma(false);
                                } else if (value === 'negative') {
                                    setShowPositiveGamma(false);
                                    setShowNegativeGamma(true);
                                    setShowNetGamma(false);
                                } else if (value === 'net') {
                                    setShowNetGamma(true);
                                    setShowPositiveGamma(false);
                                    setShowNegativeGamma(false);
                                }
                            }}
                            style={{
                                background: '#000000',
                                border: '1px solid #333333',
                                borderRadius: '8px',
                                color: '#ffffff',
                                padding: '10px 14px',
                                fontSize: '13px',
                                fontWeight: '500',
                                minWidth: '65px',
                                outline: 'none',
                                cursor: 'pointer',
                                boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.6), inset 0 -1px 0 rgba(255, 255, 255, 0.05), 0 1px 0 rgba(255, 255, 255, 0.1)',
                                zIndex: 1
                            }}
                        >
                            <option value="both">GEX</option>
                            <option value="positive">Positive Only</option>
                            <option value="negative">Negative Only</option>
                            <option value="net">Net GEX</option>
                        </select>
                    </div>

                    <DealerOpenInterestChart
                        selectedTicker={selectedTicker}
                        compactMode={true}
                        selectedExpiration={sharedExpiration}
                        hideAllControls={true}
                        oiViewMode={showPremium ? 'premium' : 'contracts'}
                        showCalls={showCalls}
                        showPuts={showPuts}
                        showNetOI={showNetOI}
                        showTowers={showAITowers}
                        onExpectedRangePCRatioChange={setExpectedRangePCRatio}
                        onCumulativePCRatio45DaysChange={setCumulativePCRatio45Days}
                        onExpectedRange90Change={setExpectedRange90}
                    />
                    <div style={{ marginTop: '20px' }}>
                        <DealerGEXChart
                            selectedTicker={selectedTicker}
                            compactMode={true}
                            selectedExpiration={sharedExpiration}
                            hideAllControls={true}
                            gexViewMode={showPremium ? 'premium' : 'gex'}
                            showPositiveGamma={showPositiveGamma}
                            showNegativeGamma={showNegativeGamma}
                            showNetGamma={showNetGamma}
                            showAttrax={showAITowers}
                            expectedRange90={expectedRange90}
                        />
                    </div>
                </div>

                {/* Unified Screeners Panel */}
                <div style={{
                    marginTop: '20px'
                }}>
                    <UnifiedScreenerPanel />
                </div>

                {/* RRG Analytics Section */}
                <div style={{
                    background: 'rgba(0, 0, 0, 0.95)',
                    borderRadius: '0px',
                    marginTop: '20px',
                    border: '1px solid #333',
                    overflow: 'hidden'
                }}>
                    <RRGAnalytics
                        defaultTimeframe="14 weeks"
                        defaultBenchmark="SPY"
                    />
                </div>

                {/* Performance Dashboard Section */}
                <div style={{
                    background: 'rgba(0, 0, 0, 0.95)',
                    borderRadius: '0px',
                    marginTop: '20px',
                    border: '1px solid #333',
                    overflow: 'hidden',
                    minHeight: '600px'
                }}>
                    <PerformanceDashboard isVisible={true} />
                </div>

                {/* Market Heatmap Section */}
                <div style={{
                    background: 'rgba(0, 0, 0, 0.95)',
                    borderRadius: '0px',
                    marginTop: '20px',
                    border: '1px solid #333',
                    overflow: 'hidden',
                    minHeight: '600px'
                }}>
                    <MarketHeatmap />
                </div>
            </div>
        </div>
    );
}