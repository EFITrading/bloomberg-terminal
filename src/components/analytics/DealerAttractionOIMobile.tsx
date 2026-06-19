'use client'

import React, { useEffect, useRef, useState } from 'react'

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
  const [showOptDropdown, setShowOptDropdown] = useState(false)
  const optButtonRef = useRef<HTMLButtonElement>(null)

  // Dynamic chart sizing — measures the actual available scroll container height
  // so both charts always fit without clipping or overlap, on any screen size
  const chartsScrollRef = useRef<HTMLDivElement>(null)
  const [chartH, setChartH] = useState(280)
  const svgH = Math.round((chartH * 1120) / 769)
  useEffect(() => {
    const update = () => {
      if (!chartsScrollRef.current) return
      const available = chartsScrollRef.current.clientHeight
      const perChart = Math.floor((available - 118) / 2) // 8px gap + 110px total reduction buffer
      setChartH(Math.max(180, Math.min(420, perChart)))
    }
    const ro = new ResizeObserver(update)
    if (chartsScrollRef.current) ro.observe(chartsScrollRef.current)
    update()
    const onOrient = () => setTimeout(update, 100)
    window.addEventListener('orientationchange', onOrient)
    return () => { ro.disconnect(); window.removeEventListener('orientationchange', onOrient) }
  }, [])

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

        {/* $ Prem + AI combined dropdown */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            ref={optButtonRef}
            onClick={() => setShowOptDropdown((p) => !p)}
            style={{
              height: 34,
              padding: '0 10px',
              background:
                showPremium || showAITowers
                  ? 'linear-gradient(135deg,#1a2a1a 0%,#0a1a0a 100%)'
                  : 'linear-gradient(180deg,#1a1a1a 0%,#000 60%)',
              border:
                showPremium && showAITowers
                  ? '1px solid #667eea'
                  : showPremium
                    ? '1px solid #00c853'
                    : showAITowers
                      ? '1px solid #667eea'
                      : '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6,
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow:
                showPremium || showAITowers
                  ? '0 0 10px rgba(102,126,234,0.25)'
                  : 'inset 0 1px 0 rgba(255,255,255,0.08)',
            }}
          >
            {showPremium && showAITowers
              ? '$ | 👑'
              : showPremium
                ? 'Premium'
                : showAITowers
                  ? '👑 AI'
                  : 'Premium ▾'}
          </button>
          {showOptDropdown && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowOptDropdown(false)}
              />
              <div
                className="fixed z-50 rounded overflow-hidden"
                style={{
                  top: (optButtonRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                  left: optButtonRef.current?.getBoundingClientRect().left ?? 0,
                  minWidth: 100,
                  background:
                    'linear-gradient(180deg,#1c1c1c 0%,#0d0d0d 40%,#080808 100%)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  boxShadow:
                    '0 8px 24px rgba(0,0,0,0.8),inset 0 1px 0 rgba(255,255,255,0.06)',
                }}
              >
                <button
                  onClick={() => setShowPremium((p) => !p)}
                  className="w-full text-left"
                  style={{
                    height: 36,
                    padding: '0 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    color: showPremium ? '#00c853' : '#888',
                    background: showPremium
                      ? 'linear-gradient(90deg,rgba(0,200,83,0.12) 0%,transparent 100%)'
                      : 'transparent',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    boxShadow: showPremium ? 'inset 0 -2px 0 #00c853' : 'none',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {showPremium ? '✓' : '○'} $ Prem
                </button>
                <button
                  onClick={() => setShowAITowers((p) => !p)}
                  className="w-full text-left"
                  style={{
                    height: 36,
                    padding: '0 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    color: showAITowers ? '#a78bfa' : '#888',
                    background: showAITowers
                      ? 'linear-gradient(90deg,rgba(167,139,250,0.12) 0%,transparent 100%)'
                      : 'transparent',
                    boxShadow: showAITowers ? 'inset 0 -2px 0 #a78bfa' : 'none',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {showAITowers ? '✓' : '○'} 👑 AI
                </button>
              </div>
            </>
          )}
        </div>

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
        ref={chartsScrollRef}
        style={{
          flex: 1,
          overflowY: 'hidden',
          overflowX: 'clip',
          WebkitOverflowScrolling: 'touch',
          marginTop: '4px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            paddingBottom: '100px',
          }}
        >
          {/* OI Chart — scaleX keeps full height, reduces width */}
          <div style={{ width: '100%', height: `${chartH}px`, overflow: 'visible', position: 'relative' }}>
            <div style={{ transform: 'translateZ(0) scaleX(0.55)', transformOrigin: 'top left', width: '769px', height: `${svgH}px`, willChange: 'transform', WebkitBackfaceVisibility: 'hidden' as React.CSSProperties['WebkitBackfaceVisibility'], backfaceVisibility: 'hidden' as React.CSSProperties['backfaceVisibility'] }}>
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
                svgHeight={svgH}
              />
            </div>
          </div>

          {/* GEX Chart — same approach */}
          <div style={{ width: '100%', height: `${chartH}px`, overflow: 'visible', position: 'relative' }}>
            <div style={{ transform: 'translateZ(0) scaleX(0.55)', transformOrigin: 'top left', width: '769px', height: `${svgH}px`, willChange: 'transform', WebkitBackfaceVisibility: 'hidden' as React.CSSProperties['WebkitBackfaceVisibility'], backfaceVisibility: 'hidden' as React.CSSProperties['backfaceVisibility'] }}>
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
                svgHeight={svgH}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DealerAttractionOIMobile
