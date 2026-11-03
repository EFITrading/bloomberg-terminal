'use client'

import React, { useEffect, useState } from 'react'

import DealerGEXChart from './DealerGEXChart'
import DealerOpenInterestChart from './DealerOpenInterestChart'
import OIConcentration3D from './OIConcentration3D'

// DESKTOP ONLY - OI/GEX Tab Component
const DealerAttractionOIDesktop: React.FC<{
  selectedTicker: string
  activeTableCount?: number
}> = ({ selectedTicker, activeTableCount = 0 }) => {
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
    <div className="space-y-8">
      {/* DESKTOP Control Bar */}
      <style>{`
        .oi-bar { display:flex; align-items:stretch; flex-wrap:nowrap; gap:8px; padding:8px 10px; overflow-x:auto; background:#050505; border:1px solid #1f1f1f; border-radius:10px; position:relative; z-index:100; font-family:Inter,"SF Pro Display",-apple-system,BlinkMacSystemFont,sans-serif; }
        .oi-group { display:flex; align-items:stretch; gap:8px; flex:0 0 auto; }
        .oi-divider { width:1px; background:#1f1f1f; margin:4px 2px; }
        .oi-select { height:40px; padding:0 30px 0 12px; background:#0b0b0b url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M6 9L1 4h10z'/%3E%3C/svg%3E") no-repeat right 12px center; border:1px solid #262626; border-radius:8px; color:#fff; font-size:15px; font-weight:700; outline:none; cursor:pointer; appearance:none; -webkit-appearance:none; transition:border-color .15s; }
        .oi-select:hover, .oi-select:focus { border-color:#555; }
        .oi-select option { background:#000; color:#fff; font-size:15px; }
        .oi-stat { display:flex; flex-direction:column; justify-content:center; gap:3px; min-width:0; padding:0 12px; height:40px; background:#0b0b0b; border:1px solid #262626; border-radius:8px; }
        .oi-stat-label { color:#8a8a8a; font-size:10.5px; font-weight:700; letter-spacing:.8px; text-transform:uppercase; line-height:1; }
        .oi-stat-value { color:#fff; font-size:14px; font-weight:700; font-family:"SF Mono",Menlo,Consolas,monospace; line-height:1; }
        .oi-toggle { height:40px; padding:0 14px; white-space:nowrap; display:flex; align-items:center; gap:8px; background:#0b0b0b; border:1px solid #262626; border-radius:8px; color:#bdbdbd; font-size:13px; font-weight:800; letter-spacing:.8px; text-transform:uppercase; cursor:pointer; transition:all .15s; }
        .oi-toggle:hover { border-color:#444; color:#fff; }
        .oi-toggle.on-premium { background:#2a2a2a; border-color:#ffaa00; color:#ffaa00; }
        .oi-toggle.on-ai { background:#2a2a2a; border-color:#9b86ff; color:#c4b5ff; }
        .oi-seg { display:flex; align-items:stretch; height:40px; background:#0b0b0b; border:1px solid #262626; border-radius:8px; overflow:hidden; }
        .oi-seg-title { display:flex; align-items:center; padding:0 12px; font-size:12px; font-weight:900; letter-spacing:1.2px; border-right:1px solid #262626; }
        .oi-seg button { padding:0 11px; background:transparent; border:none; border-right:1px solid #1a1a1a; color:#9a9a9a; font-size:13px; font-weight:700; cursor:pointer; transition:all .15s; white-space:nowrap; }
        .oi-seg button:last-child { border-right:none; }
        .oi-seg button:hover { color:#fff; background:#141414; }
        .oi-seg.oi button.active { background:#2a2a2a; color:#fff; box-shadow:inset 0 -2px 0 #ff6600; }
        .oi-seg.gex button.active { background:#2a2a2a; color:#fff; box-shadow:inset 0 -2px 0 #9b86ff; }
      `}</style>
      <div className="oi-bar">
        <div className="oi-group">
          <select
            className="oi-select"
            value={sharedExpiration}
            onChange={(e) => setSharedExpiration(e.target.value)}
          >
            <option value="all-expirations">All Expirations</option>
            <option value="45-days">45 Days (All)</option>
            {expirationDates.map((date) => (
              <option key={date} value={date}>
                {new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  timeZone: 'America/Los_Angeles',
                })}
              </option>
            ))}
          </select>
          <div className="oi-stat">
            <span className="oi-stat-label">90% Range P/C</span>
            <span className="oi-stat-value">{expectedRangePCRatio || 'Calc...'}</span>
          </div>
          <div className="oi-stat">
            <span className="oi-stat-label">45D P/C</span>
            <span className="oi-stat-value">{cumulativePCRatio45Days || 'Calc...'}</span>
          </div>
        </div>

        <div className="oi-group">
          <button
            className={`oi-toggle${showPremium ? ' on-premium' : ''}`}
            onClick={() => setShowPremium(!showPremium)}
          >
            💰 Premium
          </button>
          <button
            className={`oi-toggle${showAITowers ? ' on-ai' : ''}`}
            onClick={() => setShowAITowers(!showAITowers)}
          >
            👑 AI
          </button>
        </div>

        <div className="oi-divider" />

        <div className="oi-group">
          <div className="oi-seg oi">
            <span className="oi-seg-title" style={{ color: '#ff6600' }}>OI</span>
            {[
              { k: 'both', l: 'All' },
              { k: 'calls', l: 'Calls' },
              { k: 'puts', l: 'Puts' },
              { k: 'net', l: 'Net' },
            ].map(({ k, l }) => {
              const cur = showNetOI ? 'net' : showCalls && showPuts ? 'both' : showCalls ? 'calls' : 'puts'
              return (
                <button
                  key={k}
                  className={cur === k ? 'active' : ''}
                  onClick={() => {
                    setShowNetOI(k === 'net')
                    setShowCalls(k === 'both' || k === 'calls')
                    setShowPuts(k === 'both' || k === 'puts')
                  }}
                >
                  {l}
                </button>
              )
            })}
          </div>
          <div className="oi-seg gex">
            <span className="oi-seg-title" style={{ color: '#9b86ff' }}>GEX</span>
            {[
              { k: 'both', l: 'Both' },
              { k: 'positive', l: 'Pos' },
              { k: 'negative', l: 'Neg' },
              { k: 'net', l: 'Net' },
            ].map(({ k, l }) => {
              const cur = showNetGamma
                ? 'net'
                : showPositiveGamma && showNegativeGamma
                  ? 'both'
                  : showPositiveGamma
                    ? 'positive'
                    : 'negative'
              return (
                <button
                  key={k}
                  className={cur === k ? 'active' : ''}
                  onClick={() => {
                    setShowNetGamma(k === 'net')
                    setShowPositiveGamma(k === 'both' || k === 'positive')
                    setShowNegativeGamma(k === 'both' || k === 'negative')
                  }}
                >
                  {l}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* DESKTOP: Normal size charts (no scaling) - Dynamic width based on table count */}
      {showAITowers && (
        <OIConcentration3D selectedTicker={selectedTicker} selectedExpiration={sharedExpiration} premium={showPremium} />
      )}
      <div
        style={{
          width: '100%',
          maxWidth: '100%',
          display: showAITowers ? 'none' : undefined,
        }}
      >
        <DealerOpenInterestChart
          selectedTicker={selectedTicker}
          compactMode={true}
          chartWidth={activeTableCount === 2 ? 1048 : 1148}
          selectedExpiration={sharedExpiration}
          hideAllControls={true}
          oiViewMode={showPremium ? 'premium' : 'contracts'}
          showCalls={showCalls}
          showPuts={showPuts}
          showNetOI={showNetOI}
          onExpectedRangePCRatioChange={setExpectedRangePCRatio}
          onCumulativePCRatio45DaysChange={setCumulativePCRatio45Days}
          onExpectedRange90Change={setExpectedRange90}
        />
      </div>
      <div
        style={{
          width: '100%',
          maxWidth: '100%',
          display: showAITowers ? 'none' : undefined,
        }}
      >
        <DealerGEXChart
          selectedTicker={selectedTicker}
          compactMode={true}
          chartWidth={activeTableCount === 2 ? 1048 : 1148}
          selectedExpiration={sharedExpiration}
          hideAllControls={true}
          gexViewMode={showPremium ? 'premium' : 'gex'}
          showPositiveGamma={showPositiveGamma}
          showNegativeGamma={showNegativeGamma}
          showNetGamma={showNetGamma}
          expectedRange90={expectedRange90}
        />
      </div>
    </div>
  )
}

export default DealerAttractionOIDesktop
