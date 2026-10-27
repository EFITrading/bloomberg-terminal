'use client'

import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import DealerGEXChart from './DealerGEXChart'
import DealerOpenInterestChart from './DealerOpenInterestChart'

// MOBILE ONLY - OI/GEX Tab Component
const DealerAttractionOIMobile: React.FC<{ selectedTicker: string; controlsSlot?: HTMLElement | null }> = ({ selectedTicker, controlsSlot }) => {
  const [showPC, setShowPC] = useState(false)
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
      const perChart = Math.floor((available - 175) / 2) // 8px gap + buffer so the bottom of the GEX chart isn't cropped
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

  const controlsBar = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        height: 34,
        flexShrink: 0,
        ...(controlsSlot ? { flex: '1 1 0', minWidth: 0 } : {}),
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

        {/* Premium and AI toggles */}
        <button
          onClick={() => setShowPremium((p) => !p)}
          style={{
            height: 34,
            padding: '0 12px',
            flexShrink: 0,
            fontSize: 12,
            fontWeight: 700,
            borderRadius: 6,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            color: showPremium ? '#00c853' : '#fff',
            background: showPremium ? '#00c85322' : 'linear-gradient(180deg,#1a1a1a 0%,#000 60%)',
            border: showPremium ? '1px solid #00c853' : '1px solid rgba(255,255,255,0.1)',
            boxShadow: showPremium ? '0 0 10px #00c85333' : 'inset 0 1px 0 rgba(255,255,255,0.08)',
          }}
        >
          Premium
        </button>
        <button
          onClick={() => setShowAITowers((p) => !p)}
          style={{
            height: 34,
            padding: '0 12px',
            flexShrink: 0,
            fontSize: 12,
            fontWeight: 700,
            borderRadius: 6,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            color: showAITowers ? '#a78bfa' : '#fff',
            background: showAITowers ? '#a78bfa22' : 'linear-gradient(180deg,#1a1a1a 0%,#000 60%)',
            border: showAITowers ? '1px solid #a78bfa' : '1px solid rgba(255,255,255,0.1)',
            boxShadow: showAITowers ? '0 0 10px #a78bfa33' : 'inset 0 1px 0 rgba(255,255,255,0.08)',
          }}
        >
          👑 AI
        </button>
    </div>
  )

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {controlsSlot ? createPortal(controlsBar, controlsSlot) : controlsBar}

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
            <div style={{ position: 'absolute', top: 4, right: 6, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <button
                onClick={() => setShowPC((p) => !p)}
                style={{
                  height: 26,
                  padding: '0 12px',
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  borderRadius: 6,
                  cursor: 'pointer',
                  color: '#fff',
                  background: showPC ? 'rgba(255,102,0,0.18)' : 'linear-gradient(180deg,#1a1a1a 0%,#000 60%)',
                  border: showPC ? '1px solid #ff6600' : '1px solid rgba(255,255,255,0.18)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
                }}
              >
                PC
              </button>
              {showPC && (
                <div
                  style={{
                    minWidth: 112,
                    padding: '6px 10px',
                    borderRadius: 6,
                    background: 'linear-gradient(180deg,#1a1a1a 0%,#000 60%)',
                    border: '1px solid rgba(255,255,255,0.14)',
                    boxShadow: '0 6px 18px rgba(0,0,0,0.7)',
                  }}
                >
                  {[
                    { label: '90% P/C', value: expectedRangePCRatio },
                    { label: '45D P/C', value: cumulativePCRatio45Days },
                  ].map((r) => (
                    <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 11, lineHeight: '20px' }}>
                      <span style={{ color: '#ff6600', fontWeight: 700 }}>{r.label}</span>
                      <span style={{ color: '#fff', fontWeight: 700, fontFamily: '"SF Mono","Monaco","Courier New",monospace' }}>{r.value || '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
