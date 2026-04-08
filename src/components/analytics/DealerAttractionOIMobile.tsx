'use client'

import React, { useEffect, useState } from 'react'

import DealerGEXChart from './DealerGEXChart'
import DealerOpenInterestChart from './DealerOpenInterestChart'

// MOBILE ONLY - OI/GEX Tab Component
const DealerAttractionOIMobile: React.FC<{ selectedTicker: string }> = ({ selectedTicker }) => {
  const [sharedExpiration, setSharedExpiration] = useState<string>('')
  const [expirationDates, setExpirationDates] = useState<string[]>([])

  // OI Chart State
  const [showCalls, setShowCalls] = useState<boolean>(true)
  const [showPuts, setShowPuts] = useState<boolean>(true)
  const [showNetOI, setShowNetOI] = useState<boolean>(false)
  const [cumulativePCRatio45Days, setCumulativePCRatio45Days] = useState<string>('')
  const [expectedRangePCRatio, setExpectedRangePCRatio] = useState<string>('')
  const [expectedRange90, setExpectedRange90] = useState<{ call: number; put: number } | null>(null)

  // GEX Chart State
  const [showPositiveGamma, setShowPositiveGamma] = useState<boolean>(true)
  const [showNegativeGamma, setShowNegativeGamma] = useState<boolean>(true)
  const [showNetGamma, setShowNetGamma] = useState<boolean>(true)

  // Unified Controls (affect both charts)
  const [showPremium, setShowPremium] = useState<boolean>(false)
  const [showAITowers, setShowAITowers] = useState<boolean>(false)

  // Fetch expiration dates once
  useEffect(() => {
    if (!selectedTicker) return

    const fetchExpirations = async () => {
      try {
        const response = await fetch(`/api/dealer-options-premium?ticker=${selectedTicker}`)
        const result = await response.json()

        if (result.success && result.data) {
          const dates = Object.keys(result.data).sort()
          setExpirationDates(dates)

          if (dates.length > 0 && !sharedExpiration) {
            setSharedExpiration(dates[0])
          }
        }
      } catch (err) {
        console.error('Error fetching expirations:', err)
      }
    }

    fetchExpirations()
  }, [selectedTicker])

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* MOBILE Control Bar - matches row 1 style */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          height: 34,
          flexShrink: 0,
        }}
      >
        {/* Expiration Selector */}
        <select
          value={sharedExpiration}
          onChange={(e) => setSharedExpiration(e.target.value)}
          style={{
            height: 34,
            flex: '1 1 0',
            minWidth: 0,
            maxWidth: 80,
            background: 'linear-gradient(180deg,#1a1a1a 0%,#000 60%)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6,
            color: '#fff',
            fontSize: 12,
            fontWeight: 500,
            outline: 'none',
            cursor: 'pointer',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
            colorScheme: 'dark',
            padding: '0 6px',
          }}
        >
          <option value="45-days" style={{ background: '#000', color: '#fff' }}>
            45D
          </option>
          {expirationDates.map((date) => (
            <option key={date} value={date} style={{ background: '#000', color: '#fff' }}>
              {new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                timeZone: 'America/Los_Angeles',
              })}
            </option>
          ))}
        </select>

        {/* $ Prem */}
        <button
          onClick={() => setShowPremium(!showPremium)}
          style={{
            height: 34,
            padding: '0 8px',
            flexShrink: 0,
            background: showPremium ? '#00c853' : 'linear-gradient(180deg,#1a1a1a 0%,#000 60%)',
            border: showPremium ? '1px solid #00c853' : '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6,
            color: showPremium ? '#fff' : '#888',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: showPremium
              ? '0 0 10px rgba(0,200,83,0.35)'
              : 'inset 0 1px 0 rgba(255,255,255,0.08)',
            whiteSpace: 'nowrap',
          }}
        >
          $ Prem
        </button>

        {/* AI */}
        <button
          onClick={() => setShowAITowers(!showAITowers)}
          style={{
            height: 34,
            padding: '0 8px',
            flexShrink: 0,
            background: showAITowers
              ? 'linear-gradient(135deg,#667eea 0%,#764ba2 100%)'
              : 'linear-gradient(180deg,#1a1a1a 0%,#000 60%)',
            border: showAITowers ? '1px solid #667eea' : '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6,
            color: '#fff',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: showAITowers
              ? '0 4px 12px rgba(102,126,234,0.4)'
              : 'inset 0 1px 0 rgba(255,255,255,0.08)',
            whiteSpace: 'nowrap',
          }}
        >
          👑 AI
        </button>

        {/* P/C Ratio chips — inline in same row */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            width: 110,
            height: 34,
            background: 'linear-gradient(180deg,#1a1a1a 0%,#000 60%)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
          }}
        >
          <span
            style={{
              fontSize: 8,
              color: '#ff6600',
              fontWeight: 600,
              letterSpacing: '0.3px',
              textTransform: 'uppercase',
              lineHeight: 1,
            }}
          >
            90% P/C
          </span>
          <span
            style={{
              fontSize: 11,
              color: '#fff',
              fontWeight: 600,
              fontFamily: '"SF Mono","Monaco","Courier New",monospace',
              lineHeight: 1.3,
            }}
          >
            {expectedRangePCRatio || '—'}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            width: 110,
            height: 34,
            background: 'linear-gradient(180deg,#1a1a1a 0%,#000 60%)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
          }}
        >
          <span
            style={{
              fontSize: 8,
              color: '#ff6600',
              fontWeight: 600,
              letterSpacing: '0.3px',
              textTransform: 'uppercase',
              lineHeight: 1,
            }}
          >
            45D P/C
          </span>
          <span
            style={{
              fontSize: 11,
              color: '#fff',
              fontWeight: 600,
              fontFamily: '"SF Mono","Monaco","Courier New",monospace',
              lineHeight: 1.3,
            }}
          >
            {cumulativePCRatio45Days || '—'}
          </span>
        </div>
      </div>

      {/* MOBILE: Scrollable Charts Container */}
      <div
        style={{
          height: 'calc(100vh - 200px)',
          overflowY: 'scroll',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          marginTop: '4px',
        }}
      >
        {/* MOBILE: Scaled Charts */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0px',
            paddingBottom: '100px',
          }}
        >
          <div
            style={{
              width: '100%',
              height: '320px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                transform: 'scale(0.66)',
                transformOrigin: 'top left',
                width: '769px',
                height: '484px',
              }}
            >
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

          <div
            className="w-full"
            style={{
              width: '100%',
              height: '320px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                transform: 'scale(0.66)',
                transformOrigin: 'top left',
                width: '769px',
                height: '484px',
              }}
            >
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
      </div>
    </div>
  )
}

export default DealerAttractionOIMobile
