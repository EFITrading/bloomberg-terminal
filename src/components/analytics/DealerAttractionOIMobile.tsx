'use client';

import React, { useState, useEffect } from 'react';
import DealerOpenInterestChart from './DealerOpenInterestChart';
import DealerGEXChart from './DealerGEXChart';

// MOBILE ONLY - OI/GEX Tab Component
const DealerAttractionOIMobile: React.FC<{ selectedTicker: string }> = ({ selectedTicker }) => {
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

  // Unified Controls (affect both charts)
  const [showPremium, setShowPremium] = useState<boolean>(false);
  const [showAITowers, setShowAITowers] = useState<boolean>(false);

  // Fetch expiration dates once
  useEffect(() => {
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
    <div className="space-y-8">
      {/* MOBILE Control Bar - Redesigned for 430px */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '10px',
        background: 'linear-gradient(180deg, #0a0a0a 0%, #000000 100%)',
        borderRadius: '16px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.6)',
        maxWidth: '430px'
      }}>
        {/* Row 1: Date, Mode, Premium, AI */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '90px 90px 1fr 1fr',
          gap: '6px'
        }}>
          {/* Expiration Selector */}
          <select
            value={sharedExpiration}
            onChange={(e) => setSharedExpiration(e.target.value)}
            style={{
              background: 'linear-gradient(145deg, rgba(5, 10, 25, 0.95), rgba(0, 5, 15, 0.98))',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '10px',
              color: '#ffffff',
              padding: '10px 8px',
              fontSize: '12px',
              fontWeight: '600',
              outline: 'none',
              cursor: 'pointer',
              fontFamily: '"SF Pro Display", -apple-system, sans-serif',
              width: '100%',
              boxShadow: 'inset 0 1px 2px rgba(255, 255, 255, 0.1), 0 2px 8px rgba(0, 0, 0, 0.5)'
            }}
          >
            <option value="all-expirations" style={{ background: '#000', color: '#fff' }}>All Exp</option>
            <option value="45-days" style={{ background: '#000', color: '#fff' }}>45D</option>
            {expirationDates.map(date => (
              <option key={date} value={date} style={{ background: '#000', color: '#fff' }}>
                {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })}
              </option>
            ))}
          </select>

          {/* OI & GEX Mode Selector */}
          <select
            value={
              showNetOI ? 'net-oi' :
                showNetGamma ? 'net-gex' :
                  (showCalls && showPuts && showPositiveGamma && showNegativeGamma) ? 'both' :
                    (showCalls && showPuts) ? 'oi-both' :
                      showCalls ? 'calls' :
                        showPuts ? 'puts' :
                          showPositiveGamma ? 'pos-gex' :
                            showNegativeGamma ? 'neg-gex' : 'both'
            }
            onChange={(e) => {
              const value = e.target.value;
              if (value === 'both') {
                setShowCalls(true); setShowPuts(true);
                setShowPositiveGamma(true); setShowNegativeGamma(true);
                setShowNetOI(false); setShowNetGamma(false);
              } else if (value === 'oi-both') {
                setShowCalls(true); setShowPuts(true); setShowNetOI(false);
              } else if (value === 'calls') {
                setShowCalls(true); setShowPuts(false); setShowNetOI(false);
              } else if (value === 'puts') {
                setShowCalls(false); setShowPuts(true); setShowNetOI(false);
              } else if (value === 'net-oi') {
                setShowNetOI(true); setShowCalls(false); setShowPuts(false);
              } else if (value === 'pos-gex') {
                setShowPositiveGamma(true); setShowNegativeGamma(false); setShowNetGamma(false);
              } else if (value === 'neg-gex') {
                setShowPositiveGamma(false); setShowNegativeGamma(true); setShowNetGamma(false);
              } else if (value === 'net-gex') {
                setShowNetGamma(true); setShowPositiveGamma(false); setShowNegativeGamma(false);
              }
            }}
            style={{
              background: 'linear-gradient(145deg, rgba(5, 10, 25, 0.95), rgba(0, 5, 15, 0.98))',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '10px',
              color: '#ffffff',
              padding: '10px 8px',
              fontSize: '11px',
              fontWeight: '600',
              outline: 'none',
              cursor: 'pointer',
              fontFamily: '"SF Pro Display", -apple-system, sans-serif',
              width: '100%',
              boxShadow: 'inset 0 1px 2px rgba(255, 255, 255, 0.1), 0 2px 8px rgba(0, 0, 0, 0.5)'
            }}
          >
            <option value="both" style={{ background: '#000', color: '#fff' }}>All</option>
            <optgroup label="OI" style={{ background: '#000', color: '#888', fontSize: '10px' }}>
              <option value="oi-both" style={{ background: '#000', color: '#fff' }}>C+P</option>
              <option value="calls" style={{ background: '#000', color: '#0f0' }}>C</option>
              <option value="puts" style={{ background: '#000', color: '#f00' }}>P</option>
              <option value="net-oi" style={{ background: '#000', color: '#fff' }}>Net</option>
            </optgroup>
            <optgroup label="GEX" style={{ background: '#000', color: '#888', fontSize: '10px' }}>
              <option value="pos-gex" style={{ background: '#000', color: '#0f0' }}>+γ</option>
              <option value="neg-gex" style={{ background: '#000', color: '#f00' }}>-γ</option>
              <option value="net-gex" style={{ background: '#000', color: '#fff' }}>Net</option>
            </optgroup>
          </select>

          {/* Premium Button */}
          <button
            onClick={() => setShowPremium(!showPremium)}
            style={{
              padding: '6px 4px',
              background: showPremium ? 'linear-gradient(135deg, #ff9500 0%, #ff5f00 100%)' : 'linear-gradient(145deg, rgba(5, 10, 25, 0.95), rgba(0, 5, 15, 0.98))',
              border: `1px solid ${showPremium ? '#ff9500' : 'rgba(255, 255, 255, 0.15)'}`,
              borderRadius: '10px',
              color: '#ffffff',
              fontSize: '11px',
              fontWeight: '700',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              boxShadow: showPremium ? '0 2px 8px rgba(255, 149, 0, 0.3)' : 'none'
            }}
          >
            <span style={{ fontSize: '13px' }}>$</span>
            Prem
          </button>

          {/* AI Button */}
          <button
            onClick={() => setShowAITowers(!showAITowers)}
            style={{
              padding: '6px 4px',
              background: showAITowers ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'linear-gradient(145deg, rgba(5, 10, 25, 0.95), rgba(0, 5, 15, 0.98))',
              border: `1px solid ${showAITowers ? '#667eea' : 'rgba(255, 255, 255, 0.15)'}`,
              borderRadius: '10px',
              color: '#ffffff',
              fontSize: '11px',
              fontWeight: '700',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              boxShadow: showAITowers ? '0 2px 8px rgba(102, 126, 234, 0.3)' : 'none'
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            AI
          </button>
        </div>

        {/* Row 2: PC Ratio Display */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: 'linear-gradient(145deg, rgba(5, 10, 25, 0.9), rgba(0, 5, 15, 0.95))',
          borderRadius: '10px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: 'inset 0 1px 2px rgba(255, 255, 255, 0.08), 0 2px 8px rgba(0, 0, 0, 0.5)'
        }}>
          <div style={{
            color: '#ff6600',
            fontSize: '16.5px',
            fontWeight: '700',
            letterSpacing: '1px',
            textTransform: 'uppercase'
          }}>
            P/C Ratio
          </div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#ff4444', fontSize: '11px', fontWeight: '600', marginBottom: '2px' }}>90%</div>
              <div style={{
                color: '#ffffff',
                fontSize: '16px',
                fontWeight: '700',
                fontFamily: '"SF Mono", monospace'
              }}>
                {expectedRangePCRatio || '—'}
              </div>
            </div>
            <div style={{ color: '#333', fontSize: '20px', fontWeight: '300' }}>|</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#00d4ff', fontSize: '11px', fontWeight: '600', marginBottom: '2px' }}>45D</div>
              <div style={{
                color: '#ffffff',
                fontSize: '16px',
                fontWeight: '700',
                fontFamily: '"SF Mono", monospace'
              }}>
                {(cumulativePCRatio45Days || '—').replace(/\s*\(\d+\s*exp\)/, '')}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MOBILE: Scaled Charts */}
      <div className="w-full overflow-x-auto" style={{
        marginBottom: '0px',
        maxWidth: '100vw'
      }}>
        <div style={{
          transform: 'scale(0.59, 0.78)',
          transformOrigin: 'top left',
          width: '171%',
          height: '600px'
        }}>
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
        </div>
      </div>

      <div className="w-full overflow-x-auto" style={{
        marginTop: '-95px',
        maxWidth: '100vw'
      }}>
        <div style={{
          transform: 'scale(0.78, 0.78)',
          transformOrigin: 'top left',
          width: '128%',
          height: '600px'
        }}>
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
    </div>
  );
};

export default DealerAttractionOIMobile;
