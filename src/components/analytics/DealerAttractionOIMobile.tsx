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
  const [expectedRange90, setExpectedRange90] = useState<{call: number, put: number} | null>(null);
  
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
      {/* MOBILE Control Bar - 2 Rows × 3 Columns Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, max-content))',
        gap: '8px',
        padding: '12px',
        background: '#000000',
        borderRadius: '12px',
        border: '1px solid #333333',
        boxShadow: `
          0 8px 32px rgba(0, 0, 0, 0.8),
          0 2px 8px rgba(0, 0, 0, 0.6),
          inset 0 1px 0 rgba(255, 255, 255, 0.1),
          inset 0 -1px 0 rgba(0, 0, 0, 0.8)
        `,
        position: 'relative' as const,
        zIndex: 100,
        transform: 'translateZ(0)',
        backdropFilter: 'blur(20px)'
      }}>
        {/* 3D Highlight Effect */}
        <div style={{
          position: 'absolute' as const,
          top: '1px',
          left: '1px',
          right: '1px',
          height: '50%',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '12px 12px 0 0',
          pointerEvents: 'none' as const
        }} />
        
        {/* Row 1, Col 1: Expiration Selector */}
        <select
          value={sharedExpiration}
          onChange={(e) => setSharedExpiration(e.target.value)}
          style={{
            background: '#000000',
            border: '1px solid #333333',
            borderRadius: '8px',
            color: '#ffffff',
            padding: '8px 10px',
            fontSize: '11px',
            fontWeight: '500',
            outline: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
            boxShadow: `
              inset 0 2px 4px rgba(0, 0, 0, 0.6),
              inset 0 -1px 0 rgba(255, 255, 255, 0.05),
              0 1px 0 rgba(255, 255, 255, 0.1)
            `,
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)',
            zIndex: 1
          }}
        >
          <option key="45-days" value="45-days" style={{ background: '#000000', color: '#ffffff', fontWeight: '600' }}>
            45 Days (All)
          </option>
          {expirationDates.map(date => (
            <option key={date} value={date} style={{ background: '#000000', color: '#ffffff' }}>
              {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })}
            </option>
          ))}
        </select>

        {/* Row 1, Col 2: 90% Range P/C Display */}
        <div style={{
          display: 'flex',
          flexDirection: 'column' as const,
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2px',
          padding: '6px 8px',
          background: '#000000',
          borderRadius: '8px',
          border: '1px solid #333333',
          boxShadow: `
            inset 0 2px 4px rgba(0, 0, 0, 0.6),
            inset 0 -1px 0 rgba(255, 255, 255, 0.05),
            0 1px 0 rgba(255, 255, 255, 0.1)
          `,
          zIndex: 1
        }}>
          <div style={{
            color: '#ff6600',
            fontSize: '9px',
            fontWeight: '600',
            letterSpacing: '0.5px',
            textTransform: 'uppercase' as const
          }}>
            90% Range P/C
          </div>
          <div style={{
            color: '#ffffff',
            fontSize: '11px',
            fontWeight: '600',
            fontFamily: '"SF Mono", "Monaco", "Courier New", monospace'
          }}>
            {expectedRangePCRatio || 'Calc...'}
          </div>
        </div>

        {/* Row 1, Col 3: 45D P/C Display */}
        <div style={{
          display: 'flex',
          flexDirection: 'column' as const,
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2px',
          padding: '6px 8px',
          background: '#000000',
          borderRadius: '8px',
          border: '1px solid #333333',
          boxShadow: `
            inset 0 2px 4px rgba(0, 0, 0, 0.6),
            inset 0 -1px 0 rgba(255, 255, 255, 0.05),
            0 1px 0 rgba(255, 255, 255, 0.1)
          `,
          zIndex: 1
        }}>
          <div style={{
            color: '#ff6600',
            fontSize: '9px',
            fontWeight: '600',
            letterSpacing: '0.5px',
            textTransform: 'uppercase' as const
          }}>
            45D P/C
          </div>
          <div style={{
            color: '#ffffff',
            fontSize: '11px',
            fontWeight: '600',
            fontFamily: '"SF Mono", "Monaco", "Courier New", monospace'
          }}>
            {cumulativePCRatio45Days || 'Calc...'}
          </div>
        </div>

        {/* Row 2, Col 1: Premium Button */}
        <button
          onClick={() => setShowPremium(!showPremium)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            padding: '8px 10px',
            background: showPremium ? 'rgba(255, 170, 0, 0.2)' : '#000000',
            border: showPremium ? '1px solid #ffaa00' : '1px solid #333333',
            borderRadius: '8px',
            color: showPremium ? '#ffaa00' : '#ffffff',
            fontSize: '11px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: showPremium ? 'none' : `
              inset 0 2px 4px rgba(0, 0, 0, 0.6),
              inset 0 -1px 0 rgba(255, 255, 255, 0.05),
              0 1px 0 rgba(255, 255, 255, 0.1)
            `,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.5px',
            zIndex: 1
          }}
        >
          💰 Premium
        </button>

        {/* Row 2, Col 2: AI Button */}
        <button
          onClick={() => setShowAITowers(!showAITowers)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            padding: '8px 10px',
            background: showAITowers ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#000000',
            border: showAITowers ? '1px solid #667eea' : '1px solid #333333',
            borderRadius: '8px',
            color: '#ffffff',
            fontSize: '11px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: showAITowers ? '0 4px 12px rgba(102, 126, 234, 0.4)' : `
              inset 0 2px 4px rgba(0, 0, 0, 0.6),
              inset 0 -1px 0 rgba(255, 255, 255, 0.05),
              0 1px 0 rgba(255, 255, 255, 0.1)
            `,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.5px',
            zIndex: 1
          }}
        >
          👑 AI
        </button>

        {/* Row 2, Col 3: Combined OI & GEX Dropdown - MOBILE ONLY */}
        <select
          value={
            showNetOI ? 'net-oi' :
            showNetGamma ? 'net-gex' :
            (showCalls && showPuts && showPositiveGamma && showNegativeGamma) ? 'both' :
            (showCalls && showPuts) ? 'oi-both' :
            showCalls ? 'calls' :
            showPuts ? 'puts' :
            showPositiveGamma ? 'positive' :
            'negative'
          }
          onChange={(e) => {
            const value = e.target.value;
            if (value === 'both') {
              setShowCalls(true);
              setShowPuts(true);
              setShowNetOI(false);
              setShowPositiveGamma(true);
              setShowNegativeGamma(true);
              setShowNetGamma(false);
            } else if (value === 'oi-both') {
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
            } else if (value === 'net-oi') {
              setShowNetOI(true);
              setShowCalls(false);
              setShowPuts(false);
            } else if (value === 'positive') {
              setShowPositiveGamma(true);
              setShowNegativeGamma(false);
              setShowNetGamma(false);
            } else if (value === 'negative') {
              setShowPositiveGamma(false);
              setShowNegativeGamma(true);
              setShowNetGamma(false);
            } else if (value === 'net-gex') {
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
            padding: '8px 10px',
            fontSize: '11px',
            fontWeight: '500',
            outline: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
            boxShadow: `
              inset 0 2px 4px rgba(0, 0, 0, 0.6),
              inset 0 -1px 0 rgba(255, 255, 255, 0.05),
              0 1px 0 rgba(255, 255, 255, 0.1)
            `,
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)',
            zIndex: 1
          }}
        >
          <optgroup label="━━━ OI Options ━━━" style={{ background: '#000000', color: '#ff6600' }}>
            <option value="oi-both" style={{ background: '#000000', color: '#ffffff' }}>OI: Both</option>
            <option value="calls" style={{ background: '#000000', color: '#ffffff' }}>OI: Calls Only</option>
            <option value="puts" style={{ background: '#000000', color: '#ffffff' }}>OI: Puts Only</option>
            <option value="net-oi" style={{ background: '#000000', color: '#ffffff' }}>OI: Net</option>
          </optgroup>
          <optgroup label="━━━ GEX Options ━━━" style={{ background: '#000000', color: '#667eea' }}>
            <option value="both" style={{ background: '#000000', color: '#ffffff' }}>GEX: Both</option>
            <option value="positive" style={{ background: '#000000', color: '#ffffff' }}>GEX: Positive</option>
            <option value="negative" style={{ background: '#000000', color: '#ffffff' }}>GEX: Negative</option>
            <option value="net-gex" style={{ background: '#000000', color: '#ffffff' }}>GEX: Net</option>
          </optgroup>
        </select>
      </div>

      {/* MOBILE: Scaled Charts */}
      <div className="w-full" style={{ 
        transform: 'scale(0.65)',
        transformOrigin: 'top left',
        width: '154%',
        marginBottom: '-18%'
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
      <div className="w-full" style={{ 
        transform: 'scale(0.65)',
        transformOrigin: 'top left',
        width: '154%'
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
  );
};

export default DealerAttractionOIMobile;
