import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity,
  AlertCircle,
  BarChart3,
  Gauge,
  RefreshCw,
  Target,
  TrendingUp,
} from 'lucide-react'

import React, { useEffect, useMemo, useRef, useState } from 'react'

// Import the Top 1000 symbols
import { PRELOAD_TIERS } from '../../lib/Top1000Symbols'
import { useDealerZonesStore } from '../../store/dealerZonesStore'
import DealerAttractionOIDesktop from './DealerAttractionOIDesktop'
import DealerAttractionOIMobile from './DealerAttractionOIMobile'
import DealerGEXChart from './DealerGEXChart'
import DealerOpenInterestChart from './DealerOpenInterestChart'
import GEXTimelineScrubber from './GEXTimelineScrubber'

// Unified OI/GEX Tab Component - now delegates to mobile/desktop specific components
const OIGEXTab: React.FC<{ selectedTicker: string; activeTableCount?: number }> = ({
  selectedTicker,
  activeTableCount = 0,
}) => {
  const [isMobile, setIsMobile] = useState<boolean>(false)

  // Detect mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(typeof window !== 'undefined' && window.innerWidth < 768)
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Render mobile or desktop component based on screen size
  if (isMobile) {
    return <DealerAttractionOIMobile selectedTicker={selectedTicker} />
  }

  return (
    <DealerAttractionOIDesktop
      selectedTicker={selectedTicker}
      activeTableCount={activeTableCount}
    />
  )
}

// Legacy OIGEXTab content removed - replaced by separate mobile/desktop components above
const OIGEXTabLegacy: React.FC<{ selectedTicker: string }> = ({ selectedTicker }) => {
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
    <div className="flex flex-col gap-0">
      {/* Mobile: compact single row matching row 1 style */}
      <div className="md:hidden w-full flex items-center gap-1.5 mb-0" style={{ height: 34 }}>
        {/* Expiration select */}
        <select
          value={sharedExpiration}
          onChange={(e) => setSharedExpiration(e.target.value)}
          style={{
            height: 34,
            flex: '2 1 0',
            minWidth: 0,
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
          <option value="45-days" style={{ background: '#000', color: '#fff', fontWeight: 600 }}>
            45D (All)
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
        {/* OI/GEX mode select */}
        <select
          value={
            showNetOI
              ? 'net-oi'
              : showNetGamma
                ? 'net-gex'
                : showCalls && showPuts && showPositiveGamma && showNegativeGamma
                  ? 'both'
                  : showCalls && showPuts
                    ? 'oi-both'
                    : showCalls
                      ? 'calls'
                      : showPuts
                        ? 'puts'
                        : showPositiveGamma
                          ? 'positive'
                          : 'negative'
          }
          onChange={(e) => {
            const value = e.target.value
            if (value === 'both') {
              setShowCalls(true)
              setShowPuts(true)
              setShowNetOI(false)
              setShowPositiveGamma(true)
              setShowNegativeGamma(true)
              setShowNetGamma(false)
            } else if (value === 'oi-both') {
              setShowCalls(true)
              setShowPuts(true)
              setShowNetOI(false)
            } else if (value === 'calls') {
              setShowCalls(true)
              setShowPuts(false)
              setShowNetOI(false)
            } else if (value === 'puts') {
              setShowCalls(false)
              setShowPuts(true)
              setShowNetOI(false)
            } else if (value === 'net-oi') {
              setShowNetOI(true)
              setShowCalls(false)
              setShowPuts(false)
            } else if (value === 'positive') {
              setShowPositiveGamma(true)
              setShowNegativeGamma(false)
              setShowNetGamma(false)
            } else if (value === 'negative') {
              setShowPositiveGamma(false)
              setShowNegativeGamma(true)
              setShowNetGamma(false)
            } else if (value === 'net-gex') {
              setShowNetGamma(true)
              setShowPositiveGamma(false)
              setShowNegativeGamma(false)
            }
          }}
          style={{
            height: 34,
            flex: '2 1 0',
            minWidth: 0,
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
            padding: '0 4px',
          }}
        >
          <option value="oi-both" style={{ background: '#000', color: '#fff' }}>
            OI: Both
          </option>
          <option value="calls" style={{ background: '#000', color: '#fff' }}>
            OI: Calls
          </option>
          <option value="puts" style={{ background: '#000', color: '#fff' }}>
            OI: Puts
          </option>
          <option value="net-oi" style={{ background: '#000', color: '#fff' }}>
            OI: Net
          </option>
          <option value="both" style={{ background: '#000', color: '#fff' }}>
            GEX: Both
          </option>
          <option value="positive" style={{ background: '#000', color: '#fff' }}>
            GEX: +
          </option>
          <option value="negative" style={{ background: '#000', color: '#fff' }}>
            GEX: -
          </option>
          <option value="net-gex" style={{ background: '#000', color: '#fff' }}>
            GEX: Net
          </option>
        </select>
        {/* $ Prem */}
        <button
          onClick={() => setShowPremium(!showPremium)}
          style={{
            height: 34,
            padding: '0 8px',
            background: showPremium
              ? 'rgba(255,170,0,0.2)'
              : 'linear-gradient(180deg,#1a1a1a 0%,#000 60%)',
            border: showPremium ? '1px solid #ffaa00' : '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6,
            color: showPremium ? '#ffaa00' : '#888',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: showPremium
              ? '0 0 8px rgba(255,170,0,0.2)'
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
      </div>

      {/* Desktop: full grid card */}
      <div
        className="hidden md:grid"
        style={{
          gridTemplateColumns: 'repeat(3, minmax(0, max-content))',
          gap: '8px',
          padding: '12px',
          background: '#000000',
          borderRadius: '12px',
          border: '1px solid #333333',
          boxShadow:
            '0 8px 32px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1)',
          position: 'relative' as const,
          zIndex: 100,
        }}
      >
        {/* 3D Highlight Effect */}
        <div
          style={{
            position: 'absolute' as const,
            top: '1px',
            left: '1px',
            right: '1px',
            height: '50%',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '12px 12px 0 0',
            pointerEvents: 'none' as const,
          }}
        />

        {/* Row 1, Col 1: Expiration Selector */}
        <select
          value={sharedExpiration}
          onChange={(e) => setSharedExpiration(e.target.value)}
          style={{
            background: 'linear-gradient(180deg,#1a1a1a 0%,#000 60%)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            color: '#ffffff',
            padding: '8px 10px',
            fontSize: '11px',
            fontWeight: '500',
            outline: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)',
            colorScheme: 'dark',
            zIndex: 1,
          }}
        >
          <option
            key="45-days"
            value="45-days"
            style={{ background: '#000000', color: '#ffffff', fontWeight: '600' }}
          >
            45 Days (All)
          </option>
          {expirationDates.map((date) => (
            <option key={date} value={date} style={{ background: '#000000', color: '#ffffff' }}>
              {new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                timeZone: 'America/Los_Angeles',
              })}
            </option>
          ))}
        </select>

        {/* Row 1, Col 2: 90% Range P/C Display */}
        <div
          className="flex flex-col items-center justify-center gap-0 md:gap-[2px] py-[2px] px-[4px] md:py-[6px] md:px-[8px]"
          style={{
            background: 'linear-gradient(180deg,#1a1a1a 0%,#000 60%)',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
            zIndex: 1,
          }}
        >
          <div
            className="text-[6px] md:text-[9px]"
            style={{
              color: '#ff6600',
              fontWeight: '600',
              letterSpacing: '0.5px',
              textTransform: 'uppercase' as const,
            }}
          >
            90% Range P/C
          </div>
          <div
            className="text-[8px] md:text-[11px]"
            style={{
              color: '#ffffff',
              fontWeight: '600',
              fontFamily: '"SF Mono", "Monaco", "Courier New", monospace',
            }}
          >
            {expectedRangePCRatio || 'Calc...'}
          </div>
        </div>

        {/* Row 1, Col 3: 45D P/C Display */}
        <div
          className="flex flex-col items-center justify-center gap-0 md:gap-[2px] py-[2px] px-[4px] md:py-[6px] md:px-[8px]"
          style={{
            background: 'linear-gradient(180deg,#1a1a1a 0%,#000 60%)',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
            zIndex: 1,
          }}
        >
          <div
            className="text-[6px] md:text-[9px]"
            style={{
              color: '#ff6600',
              fontWeight: '600',
              letterSpacing: '0.5px',
              textTransform: 'uppercase' as const,
            }}
          >
            45D P/C
          </div>
          <div
            className="text-[8px] md:text-[11px]"
            style={{
              color: '#ffffff',
              fontWeight: '600',
              fontFamily: '"SF Mono", "Monaco", "Courier New", monospace',
            }}
          >
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
            background: showPremium
              ? 'rgba(255, 170, 0, 0.2)'
              : 'linear-gradient(180deg,#1a1a1a 0%,#000 60%)',
            border: showPremium ? '1px solid #ffaa00' : '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            color: showPremium ? '#ffaa00' : '#ffffff',
            fontSize: '11px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: showPremium ? 'none' : 'inset 0 1px 0 rgba(255,255,255,0.08)',
            textTransform: 'uppercase' as const,
            letterSpacing: '0.5px',
            zIndex: 1,
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
            background: showAITowers
              ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
              : 'linear-gradient(180deg,#1a1a1a 0%,#000 60%)',
            border: showAITowers ? '1px solid #667eea' : '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            color: '#ffffff',
            fontSize: '11px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: showAITowers
              ? '0 4px 12px rgba(102, 126, 234, 0.4)'
              : 'inset 0 1px 0 rgba(255,255,255,0.08)',
            textTransform: 'uppercase' as const,
            letterSpacing: '0.5px',
            zIndex: 1,
          }}
        >
          👑 AI
        </button>

        {/* Row 2, Col 3: Combined OI & GEX Dropdown */}
        <select
          value={
            showNetOI
              ? 'net-oi'
              : showNetGamma
                ? 'net-gex'
                : showCalls && showPuts && showPositiveGamma && showNegativeGamma
                  ? 'both'
                  : showCalls && showPuts
                    ? 'oi-both'
                    : showCalls
                      ? 'calls'
                      : showPuts
                        ? 'puts'
                        : showPositiveGamma
                          ? 'positive'
                          : 'negative'
          }
          onChange={(e) => {
            const value = e.target.value
            if (value === 'both') {
              setShowCalls(true)
              setShowPuts(true)
              setShowNetOI(false)
              setShowPositiveGamma(true)
              setShowNegativeGamma(true)
              setShowNetGamma(false)
            } else if (value === 'oi-both') {
              setShowCalls(true)
              setShowPuts(true)
              setShowNetOI(false)
            } else if (value === 'calls') {
              setShowCalls(true)
              setShowPuts(false)
              setShowNetOI(false)
            } else if (value === 'puts') {
              setShowCalls(false)
              setShowPuts(true)
              setShowNetOI(false)
            } else if (value === 'net-oi') {
              setShowNetOI(true)
              setShowCalls(false)
              setShowPuts(false)
            } else if (value === 'positive') {
              setShowPositiveGamma(true)
              setShowNegativeGamma(false)
              setShowNetGamma(false)
            } else if (value === 'negative') {
              setShowPositiveGamma(false)
              setShowNegativeGamma(true)
              setShowNetGamma(false)
            } else if (value === 'net-gex') {
              setShowNetGamma(true)
              setShowPositiveGamma(false)
              setShowNegativeGamma(false)
            }
          }}
          style={{
            background: 'linear-gradient(180deg,#1a1a1a 0%,#000 60%)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            color: '#ffffff',
            padding: '8px 10px',
            fontSize: '11px',
            fontWeight: '500',
            outline: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)',
            colorScheme: 'dark',
            zIndex: 1,
          }}
        >
          <optgroup label="━━━ OI Options ━━━" style={{ background: '#000000', color: '#ff6600' }}>
            <option value="oi-both" style={{ background: '#000000', color: '#ffffff' }}>
              OI: Both
            </option>
            <option value="calls" style={{ background: '#000000', color: '#ffffff' }}>
              OI: Calls Only
            </option>
            <option value="puts" style={{ background: '#000000', color: '#ffffff' }}>
              OI: Puts Only
            </option>
            <option value="net-oi" style={{ background: '#000000', color: '#ffffff' }}>
              OI: Net
            </option>
          </optgroup>
          <optgroup label="━━━ GEX Options ━━━" style={{ background: '#000000', color: '#667eea' }}>
            <option value="both" style={{ background: '#000000', color: '#ffffff' }}>
              GEX: Both
            </option>
            <option value="positive" style={{ background: '#000000', color: '#ffffff' }}>
              GEX: Positive
            </option>
            <option value="negative" style={{ background: '#000000', color: '#ffffff' }}>
              GEX: Negative
            </option>
            <option value="net-gex" style={{ background: '#000000', color: '#ffffff' }}>
              GEX: Net
            </option>
          </optgroup>
        </select>
      </div>

      <div className="w-full md:w-auto overflow-x-auto">
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
      <div className="w-full md:w-auto overflow-x-auto">
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
  )
}

interface GEXData {
  strike: number
  [key: string]:
    | number
    | {
        call: number
        put: number
        net: number
        callOI: number
        putOI: number
        callPremium?: number
        putPremium?: number
        callVex?: number
        putVex?: number
        callDelta?: number
        putDelta?: number
        flowCall?: number
        flowPut?: number
        flowNet?: number
      }
}

interface ServerGEXData {
  ticker: string
  attractionLevel: number
  dealerSweat: number
  currentPrice: number
  netGex: number
  marketCap?: number
  gexImpactScore?: number
  largestWall?: {
    strike: number
    gex: number
    type: 'call' | 'put'
    pressure: number
    cluster?: {
      strikes: number[]
      centralStrike: number
      totalGEX: number
      contributions: number[]
      type: 'call' | 'put'
    }
  }
}

interface OptionContract {
  ticker: string
  expiration_date: string
  strike_price: number
  contract_type: 'call' | 'put'
}

interface MMData {
  strike: number
  netMM: number
  callMM: number
  putMM: number
  totalOI: number
  daysToExpiry: number
  impact: number
  // Enhanced Greeks data
  netDelta: number
  netGamma: number
  netTheta: number
  netVega: number
  callDelta: number
  putDelta: number
  callGamma: number
  putGamma: number
  callTheta: number
  putTheta: number
  callVega: number
  putVega: number
}

interface MMDashboardProps {
  selectedTicker: string
  currentPrice: number
  gexByStrikeByExpiration: {
    [expiration: string]: {
      [strike: number]: {
        call: number
        put: number
        callOI: number
        putOI: number
        callGamma?: number
        putGamma?: number
        callDelta?: number
        putDelta?: number
        callTheta?: number
        putTheta?: number
        callVega?: number
        putVega?: number
      }
    }
  }
  vexByStrikeByExpiration: {
    [expiration: string]: {
      [strike: number]: {
        call: number
        put: number
        callOI: number
        putOI: number
        callVega?: number
        putVega?: number
      }
    }
  }
  expirations: string[]
  strikeWidth?: number
}

// ─── GAUGE TRIO ────────────────────────────────────────────────────────────────
// Self-contained gauge panel rendered in the Greek Suite (ATTRACTION) tab.
interface GaugeTrioProps {
  currentPrice: number
  gexByStrikeByExpiration: MMDashboardProps['gexByStrikeByExpiration']
  vexByStrikeByExpiration: MMDashboardProps['vexByStrikeByExpiration']
  expirations: string[]
}

const GaugeTrio: React.FC<GaugeTrioProps> = ({
  currentPrice,
  gexByStrikeByExpiration,
  vexByStrikeByExpiration,
  expirations,
}) => {
  const mmExpirations = useMemo(() => {
    const today = new Date()
    const maxDate = new Date(today.getTime() + 45 * 24 * 60 * 60 * 1000)
    return expirations
      .filter((exp) => {
        const d = new Date(exp + 'T00:00:00Z')
        return d >= today && d <= maxDate
      })
      .sort()
  }, [expirations])

  const mmData = useMemo((): MMData[] => {
    if (!currentPrice || Object.keys(gexByStrikeByExpiration).length === 0) return []
    const sr = currentPrice * 0.2
    const minS = currentPrice - sr
    const maxS = currentPrice + sr
    const allStrikes = new Set<number>()
    mmExpirations.forEach((exp) => {
      if (gexByStrikeByExpiration[exp]) {
        Object.keys(gexByStrikeByExpiration[exp])
          .map(Number)
          .filter((s) => s >= minS && s <= maxS)
          .forEach((s) => allStrikes.add(s))
      }
    })
    return Array.from(allStrikes)
      .map((strike) => {
        let totalCallMM = 0,
          totalPutMM = 0,
          totalOI = 0,
          avgDTE = 0,
          validExp = 0
        let tCD = 0,
          tPD = 0,
          tCG = 0,
          tPG = 0,
          tCT = 0,
          tPT = 0,
          tCV = 0,
          tPV = 0
        mmExpirations.forEach((exp) => {
          const sd = gexByStrikeByExpiration[exp]?.[strike]
          if (sd) {
            const daysToExp = Math.ceil(
              (new Date(exp + 'T00:00:00Z').getTime() - Date.now()) / 86400000
            )
            const w = daysToExp >= 0 ? (8 - Math.min(7, daysToExp)) / 7 : 1
            totalCallMM += (sd.call / (currentPrice * 0.01)) * w
            totalPutMM += (sd.put / (currentPrice * 0.01)) * w
            totalOI += (sd.callOI || 0) + (sd.putOI || 0)
            const cOI = sd.callOI || 0,
              pOI = sd.putOI || 0
            const m = strike / currentPrice
            let cd = 0.4,
              pd = -0.6
            if (m > 1.1) {
              cd = 0.1
              pd = -0.9
            } else if (m > 1.05) {
              cd = 0.3
              pd = -0.7
            } else if (m > 0.95) {
              cd = 0.6
              pd = -0.4
            } else if (m > 0.9) {
              cd = 0.7
              pd = -0.3
            } else if (m <= 0.9) {
              cd = 0.9
              pd = -0.1
            }
            tCD += cd * cOI * 100 * w
            tPD += pd * pOI * 100 * w
            tCG += (sd.callGamma || 0) * cOI * w
            tPG += (sd.putGamma || 0) * pOI * w
            tCT += (sd.callTheta || 0) * cOI * w
            tPT += (sd.putTheta || 0) * pOI * w
            tCV += (sd.callVega || 0) * cOI * w
            tPV += (sd.putVega || 0) * pOI * w
            avgDTE += daysToExp
            validExp++
          }
        })
        if (validExp > 0) avgDTE /= validExp
        const netMM = totalCallMM + totalPutMM
        return {
          strike,
          netMM,
          callMM: totalCallMM,
          putMM: totalPutMM,
          totalOI,
          daysToExpiry: Math.round(avgDTE),
          impact: Math.abs(netMM),
          netDelta: tCD + tPD,
          netGamma: tCG + tPG,
          netTheta: tCT + tPT,
          netVega: tCV + tPV,
          callDelta: tCD,
          putDelta: tPD,
          callGamma: tCG,
          putGamma: tPG,
          callTheta: tCT,
          putTheta: tPT,
          callVega: tCV,
          putVega: tPV,
        }
      })
      .sort((a, b) => b.strike - a.strike)
  }, [currentPrice, gexByStrikeByExpiration, mmExpirations])

  const metrics = useMemo(() => {
    const tND = mmData.reduce((s, i) => s + i.netDelta, 0)
    const tNG = mmData.reduce((s, i) => s + i.netGamma, 0)
    const tNT = mmData.reduce((s, i) => s + i.netTheta, 0)
    const tNV = mmData.reduce((s, i) => s + i.netVega, 0)
    const dS = Math.max(-100, Math.min(100, tND / 100000))
    const gS = Math.max(-100, Math.min(100, tNG / 1000))
    const tS = Math.max(-100, Math.min(100, tNT / 1000))
    const vS = Math.max(-100, Math.min(100, tNV / 1000))
    const compositeScore = dS * 0.3 + gS * 0.35 + tS * 0.2 + vS * 0.15
    let signal = 'WAIT',
      signalExplanation = 'Mixed signals - no clear edge'
    if (compositeScore > 3) {
      signal = 'BUY SETUP'
      if (gS > 5 && dS > 3)
        signalExplanation = 'Strong long gamma + bullish delta - dealers will buy dips & stabilize'
      else if (tS < -5 && Math.abs(dS) > 5)
        signalExplanation = 'Large theta bleed + directional position - dealers need price movement'
      else signalExplanation = 'Net bullish positioning across all Greeks - favorable setup'
    } else if (compositeScore < -3) {
      signal = 'SELL SETUP'
      if (gS < -5 && dS < -3)
        signalExplanation =
          'Strong short gamma + bearish delta - dealers will sell rallies & amplify'
      else if (tS > 5 && vS < -3)
        signalExplanation = 'Collecting premium + short vol - dealers want compression & decay'
      else signalExplanation = 'Net bearish positioning across all Greeks - favorable short setup'
    } else if (compositeScore > 1) {
      signal = 'LEAN BUY'
      signalExplanation = 'Moderate bullish bias - consider smaller long positions'
    } else if (compositeScore < -1) {
      signal = 'LEAN SELL'
      signalExplanation = 'Moderate bearish bias - consider smaller short positions'
    } else {
      if (Math.abs(gS) < 2 && Math.abs(dS) < 2)
        signalExplanation = 'Low conviction across all Greeks - wait for clearer setup'
      else signalExplanation = 'Conflicting signals - Greeks not aligned for directional trade'
    }
    return { compositeScore, signal, signalExplanation }
  }, [mmData, currentPrice])

  const siMetrics = useMemo(() => {
    if (!currentPrice || Object.keys(gexByStrikeByExpiration).length === 0)
      return {
        siNorm: 0,
        stability: 'UNKNOWN',
        marketBehavior: 'No Data',
        stabilityColor: 'text-gray-400',
      }
    let totalGEX = 0,
      totalVEX = 0,
      totalDEX = 0
    mmExpirations.forEach((exp) => {
      const gexData = gexByStrikeByExpiration[exp]
      if (gexData) {
        Object.entries(gexData).forEach(([strike, data]) => {
          const sp = parseFloat(strike)
          const cOI = data.callOI || 0,
            pOI = data.putOI || 0
          if (cOI > 0 || pOI > 0) {
            const cG = data.callGamma || 0,
              pG = data.putGamma || 0
            if (cOI > 0 && cG !== 0) totalGEX += cG * cOI * (currentPrice * currentPrice) * 100
            if (pOI > 0 && pG !== 0) totalGEX += -pG * pOI * (currentPrice * currentPrice) * 100
            const cV = data.callVega || 0,
              pV = data.putVega || 0
            if (cOI > 0 && cV !== 0) totalVEX += cV * cOI * 100
            if (pOI > 0 && pV !== 0) totalVEX += -pV * pOI * 100
            const mn = sp / currentPrice
            let cd = 0.5
            if (mn > 1.05) cd = Math.max(0, Math.min(1, (mn - 1) * 2))
            else if (mn < 0.95) cd = Math.max(0, Math.min(1, 0.8 + (1 - mn) * 0.4))
            totalDEX += cd * cOI * 100 * currentPrice + (cd - 1) * pOI * 100 * currentPrice
          }
        })
      }
    })
    const denom = Math.abs(totalVEX) + Math.abs(totalDEX)
    const si = denom !== 0 ? totalGEX / denom : 0
    let stability = '',
      marketBehavior = '',
      stabilityColor = ''
    if (si >= 2.0) {
      stability = 'EXTREMELY STABLE'
      marketBehavior = 'Strong Mean Reversion'
      stabilityColor = 'text-green-500'
    } else if (si >= 0.5) {
      stability = 'HIGHLY STABLE'
      marketBehavior = 'Mean Reverting'
      stabilityColor = 'text-green-400'
    } else if (si >= 0) {
      stability = 'MILDLY SUPPORTIVE'
      marketBehavior = 'Range-bound'
      stabilityColor = 'text-blue-400'
    } else if (si >= -0.5) {
      stability = 'VOLATILITY BUILDING'
      marketBehavior = 'Breakout Likely'
      stabilityColor = 'text-yellow-400'
    } else if (si >= -2.0) {
      stability = 'REFLEXIVE MARKET'
      marketBehavior = 'Fragile & Explosive'
      stabilityColor = 'text-red-400'
    } else {
      stability = 'EXTREMELY REFLEXIVE'
      marketBehavior = 'Highly Explosive'
      stabilityColor = 'text-red-500'
    }
    return { siNorm: si, stability, marketBehavior, stabilityColor }
  }, [currentPrice, gexByStrikeByExpiration, vexByStrikeByExpiration, mmExpirations])

  return (
    <div
      className="relative border md:p-6 p-3"
      style={{
        background: '#0a0a0a',
        borderColor: '#0d2a45',
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.008) 3px, rgba(255,255,255,0.008) 4px)',
          zIndex: 0,
        }}
      />
      <div className="relative z-10 grid grid-cols-3 md:gap-6 gap-1">
        {/* ─── INTENSITY GAUGE ─── */}
        {(() => {
          const val = metrics.compositeScore
          const angle = -90 + ((Math.max(-20, Math.min(20, val)) + 20) / 40) * 180
          const cx = 200,
            cy = 215,
            r = 150
          const arcLen = Math.PI * r
          const scoreColor = val > 3 ? '#00ff88' : val < -3 ? '#ff2244' : '#ffcc00'
          const scoreLabel =
            val > 10
              ? 'BREAKOUT'
              : val > 3
                ? 'STRONG BUY'
                : val > 0.5
                  ? 'BUY SETUP'
                  : val < -10
                    ? 'BREAKDOWN'
                    : val < -3
                      ? 'STRONG SELL'
                      : val < -0.5
                        ? 'SELL SETUP'
                        : 'NEUTRAL'
          return (
            <div className="relative w-full" style={{ aspectRatio: '4/3.84' }}>
              <svg viewBox="0 -8 400 288" className="w-full h-full">
                <defs>
                  <radialGradient id="gtHg1" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="55%" stopColor={scoreColor} stopOpacity="0.85" />
                    <stop offset="100%" stopColor={scoreColor} stopOpacity="0.05" />
                  </radialGradient>
                  <linearGradient id="gtSf1" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#ff1144" />
                    <stop offset="50%" stopColor="#ff6600" />
                    <stop offset="100%" stopColor="#ffcc00" stopOpacity="0.2" />
                  </linearGradient>
                  <linearGradient id="gtBf1" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#ffcc00" stopOpacity="0.2" />
                    <stop offset="50%" stopColor="#00ccff" />
                    <stop offset="100%" stopColor="#00ff88" />
                  </linearGradient>
                  <style>{`@keyframes gtp1{0%,100%{opacity:.45}50%{opacity:1}}.gtp1{animation:gtp1 2s ease-in-out infinite}`}</style>
                </defs>
                <text
                  x="200"
                  y="8"
                  fill="#ff8000"
                  fontSize="18"
                  fontWeight="900"
                  textAnchor="middle"
                  letterSpacing="4"
                  opacity="1"
                >
                  FLOW INTENSITY
                </text>
                <path
                  d="M 50 215 A 150 150 0 0 1 350 215"
                  fill="none"
                  stroke="#071825"
                  strokeWidth="26"
                />
                <path
                  d="M 50 215 A 150 150 0 0 1 143 76"
                  fill="none"
                  stroke="#ff1144"
                  strokeWidth="26"
                  strokeOpacity="0.13"
                />
                <path
                  d="M 143 76 A 150 150 0 0 1 200 65"
                  fill="none"
                  stroke="#ffcc00"
                  strokeWidth="26"
                  strokeOpacity="0.10"
                />
                <path
                  d="M 200 65 A 150 150 0 0 1 257 76"
                  fill="none"
                  stroke="#ffcc00"
                  strokeWidth="26"
                  strokeOpacity="0.10"
                />
                <path
                  d="M 257 76 A 150 150 0 0 1 350 215"
                  fill="none"
                  stroke="#00ff88"
                  strokeWidth="26"
                  strokeOpacity="0.13"
                />
                {val < 0 ? (
                  <path
                    d="M 200 65 A 150 150 0 0 0 50 215"
                    fill="none"
                    stroke="url(#gtSf1)"
                    strokeWidth="26"
                    strokeDasharray={`${arcLen / 2} ${arcLen / 2}`}
                    strokeDashoffset={(arcLen / 2) * (1 - Math.min(Math.abs(val), 20) / 20)}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.4,0,0.2,1)' }}
                  />
                ) : (
                  <path
                    d="M 200 65 A 150 150 0 0 1 350 215"
                    fill="none"
                    stroke="url(#gtBf1)"
                    strokeWidth="26"
                    strokeDasharray={`${arcLen / 2} ${arcLen / 2}`}
                    strokeDashoffset={(arcLen / 2) * (1 - Math.min(val, 20) / 20)}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.4,0,0.2,1)' }}
                  />
                )}
                <path
                  d="M 20 215 A 180 180 0 0 1 380 215"
                  fill="none"
                  stroke="#0d2a45"
                  strokeWidth="1.5"
                />
                <path
                  d="M 62 215 A 138 138 0 0 1 338 215"
                  fill="none"
                  stroke="#0d2a45"
                  strokeWidth="1.5"
                />
                {Array.from({ length: 17 }).map((_, i) => {
                  const t = i / 16,
                    a = Math.PI - t * Math.PI,
                    major = i % 4 === 0
                  const ro = major ? 173 : 168,
                    ri = major ? 157 : 163
                  return (
                    <line
                      key={i}
                      x1={cx + ro * Math.cos(a)}
                      y1={cy - ro * Math.sin(a)}
                      x2={cx + ri * Math.cos(a)}
                      y2={cy - ri * Math.sin(a)}
                      stroke={major ? '#ff8c00' : '#1a0800'}
                      strokeWidth={major ? 2 : 1}
                    />
                  )
                })}
                <text fill="#ff2244" fontSize="12" fontWeight="bold" textAnchor="middle">
                  <tspan x="63" y="108" transform="rotate(-53 63 108)">
                    BREAK
                  </tspan>
                  <tspan x="63" y="117" transform="rotate(-53 63 117)">
                    DOWN
                  </tspan>
                </text>
                <text fill="#ff7700" fontSize="12" fontWeight="bold" textAnchor="middle">
                  <tspan x="98" y="66" transform="rotate(-36 98 66)">
                    STRONG
                  </tspan>
                  <tspan x="98" y="75" transform="rotate(-36 98 75)">
                    SELL
                  </tspan>
                </text>
                <text fill="#ffcc00" fontSize="12" fontWeight="bold" textAnchor="middle">
                  <tspan x="150" y="44" transform="rotate(-18 150 44)">
                    SELL
                  </tspan>
                  <tspan x="150" y="53" transform="rotate(-18 150 53)">
                    SETUP
                  </tspan>
                </text>
                <text fill="#00ccff" fontSize="12" fontWeight="bold" textAnchor="middle">
                  <tspan x="250" y="44" transform="rotate(18 250 44)">
                    BUY
                  </tspan>
                  <tspan x="250" y="53" transform="rotate(18 250 53)">
                    SETUP
                  </tspan>
                </text>
                <text fill="#00ff88" fontSize="12" fontWeight="bold" textAnchor="middle">
                  <tspan x="302" y="66" transform="rotate(36 302 66)">
                    STRONG
                  </tspan>
                  <tspan x="302" y="75" transform="rotate(36 302 75)">
                    BUY
                  </tspan>
                </text>
                <text fill="#00ff44" fontSize="12" fontWeight="bold" textAnchor="middle">
                  <tspan x="337" y="108" transform="rotate(53 337 108)">
                    BREAK
                  </tspan>
                  <tspan x="337" y="117" transform="rotate(53 337 117)">
                    OUT
                  </tspan>
                </text>
                <g
                  style={{
                    transformOrigin: `${cx}px ${cy}px`,
                    transform: `rotate(${angle}deg)`,
                    transition: 'transform 0.7s cubic-bezier(0.4,0,0.2,1)',
                  }}
                >
                  <polygon
                    points={`${cx - 3},${cy} ${cx + 3},${cy} ${cx},${cy - 138}`}
                    fill="white"
                    opacity="0.95"
                  />
                  <polygon
                    points={`${cx - 1.5},${cy} ${cx + 1.5},${cy} ${cx},${cy - 138}`}
                    fill="#ff8c00"
                    opacity="0.7"
                  />
                </g>
                <circle cx={cx} cy={cy} r="15" fill="#050505" stroke="#ff8c00" strokeWidth="1.5" />
                <circle cx={cx} cy={cy} r="9" fill="url(#gtHg1)" />
                <circle cx={cx} cy={cy} r="4" className="gtp1" fill={scoreColor} />
                <text
                  x="42"
                  y="233"
                  fill="#ff2244"
                  fontSize="13"
                  fontWeight="900"
                  textAnchor="middle"
                >
                  SELL
                </text>
                <text
                  x="358"
                  y="233"
                  fill="#00ff88"
                  fontSize="13"
                  fontWeight="900"
                  textAnchor="middle"
                >
                  BUY
                </text>
                <text
                  x="200"
                  y="250"
                  fill={scoreColor}
                  fontSize="27"
                  fontWeight="900"
                  textAnchor="middle"
                >
                  {val > 0 ? '+' : ''}
                  {val.toFixed(1)}
                </text>
                <text
                  x="200"
                  y="267"
                  fill={scoreColor}
                  fontSize="11"
                  fontWeight="bold"
                  textAnchor="middle"
                  letterSpacing="2.5"
                  opacity="0.9"
                >
                  {scoreLabel}
                </text>
              </svg>
            </div>
          )
        })()}

        {/* ─── DEALER SIGNAL GAUGE ─── */}
        {(() => {
          const dsScore = metrics.compositeScore
          const isBull = dsScore > 3,
            isBear = dsScore < -3
          const actionText = isBull ? 'BUY CALLS' : isBear ? 'BUY PUTS' : 'STAY OUT'
          const actionColor = isBull ? '#00ff88' : isBear ? '#ff2244' : '#ffcc00'
          const angle = -90 + ((Math.max(-20, Math.min(20, dsScore)) + 20) / 40) * 180
          const cx = 200,
            cy = 215,
            r = 150,
            arcLen = Math.PI * r
          return (
            <div className="relative w-full" style={{ aspectRatio: '4/3.84' }}>
              <svg viewBox="0 -8 400 288" className="w-full h-full">
                <defs>
                  <radialGradient id="gtHg2" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="55%" stopColor={actionColor} stopOpacity="0.85" />
                    <stop offset="100%" stopColor={actionColor} stopOpacity="0.05" />
                  </radialGradient>
                  <linearGradient id="gtDsf2" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#ff1144" />
                    <stop offset="100%" stopColor="#ff1144" stopOpacity="0.15" />
                  </linearGradient>
                  <linearGradient id="gtDbf2" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#00ff88" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#00ff88" />
                  </linearGradient>
                  <style>{`@keyframes gtp2{0%,100%{opacity:.45}50%{opacity:1}}.gtp2{animation:gtp2 2s ease-in-out infinite;animation-delay:.5s}`}</style>
                </defs>
                <text
                  x="200"
                  y="8"
                  fill="#a855ff"
                  fontSize="18"
                  fontWeight="900"
                  textAnchor="middle"
                  letterSpacing="4"
                  opacity="1"
                >
                  DEALER SIGNAL
                </text>
                <path
                  d="M 50 215 A 150 150 0 0 1 350 215"
                  fill="none"
                  stroke="#071825"
                  strokeWidth="26"
                />
                <path
                  d="M 50 215 A 150 150 0 0 1 163 70"
                  fill="none"
                  stroke="#ff1144"
                  strokeWidth="26"
                  strokeOpacity={isBear ? '0.28' : '0.09'}
                />
                <path
                  d="M 163 70 A 150 150 0 0 1 237 70"
                  fill="none"
                  stroke="#ffcc00"
                  strokeWidth="26"
                  strokeOpacity={!isBull && !isBear ? '0.28' : '0.09'}
                />
                <path
                  d="M 237 70 A 150 150 0 0 1 350 215"
                  fill="none"
                  stroke="#00ff88"
                  strokeWidth="26"
                  strokeOpacity={isBull ? '0.28' : '0.09'}
                />
                {dsScore < 0 ? (
                  <path
                    d="M 200 65 A 150 150 0 0 0 50 215"
                    fill="none"
                    stroke="url(#gtDsf2)"
                    strokeWidth="26"
                    strokeDasharray={`${arcLen / 2} ${arcLen / 2}`}
                    strokeDashoffset={(arcLen / 2) * (1 - Math.min(Math.abs(dsScore), 20) / 20)}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.4,0,0.2,1)' }}
                  />
                ) : (
                  <path
                    d="M 200 65 A 150 150 0 0 1 350 215"
                    fill="none"
                    stroke="url(#gtDbf2)"
                    strokeWidth="26"
                    strokeDasharray={`${arcLen / 2} ${arcLen / 2}`}
                    strokeDashoffset={(arcLen / 2) * (1 - Math.min(dsScore, 20) / 20)}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.4,0,0.2,1)' }}
                  />
                )}
                <path
                  d="M 20 215 A 180 180 0 0 1 380 215"
                  fill="none"
                  stroke="#0d2a45"
                  strokeWidth="1.5"
                />
                <path
                  d="M 62 215 A 138 138 0 0 1 338 215"
                  fill="none"
                  stroke="#0d2a45"
                  strokeWidth="1.5"
                />
                {Array.from({ length: 17 }).map((_, i) => {
                  const t = i / 16,
                    a = Math.PI - t * Math.PI,
                    major = i % 4 === 0
                  const ro = major ? 173 : 168,
                    ri = major ? 157 : 163
                  return (
                    <line
                      key={i}
                      x1={cx + ro * Math.cos(a)}
                      y1={cy - ro * Math.sin(a)}
                      x2={cx + ri * Math.cos(a)}
                      y2={cy - ri * Math.sin(a)}
                      stroke={major ? '#9b59ff' : '#0f0015'}
                      strokeWidth={major ? 2 : 1}
                    />
                  )
                })}
                <line x1="200" y1="50" x2="200" y2="67" stroke="#9b59ff" strokeWidth="2.5" />
                <text fill="#ff4466" fontSize="12" fontWeight="bold" textAnchor="middle">
                  <tspan x="63" y="108" transform="rotate(-53 63 108)">
                    BUY
                  </tspan>
                  <tspan x="63" y="117" transform="rotate(-53 63 117)">
                    PUTS
                  </tspan>
                </text>
                <text
                  x="200"
                  y="54"
                  fill="#9b59ff"
                  fontSize="13"
                  fontWeight="bold"
                  textAnchor="middle"
                  letterSpacing="1"
                >
                  CHOP
                </text>
                <text fill="#00ff88" fontSize="12" fontWeight="bold" textAnchor="middle">
                  <tspan x="337" y="108" transform="rotate(53 337 108)">
                    BUY
                  </tspan>
                  <tspan x="337" y="117" transform="rotate(53 337 117)">
                    CALLS
                  </tspan>
                </text>
                <g
                  style={{
                    transformOrigin: `${cx}px ${cy}px`,
                    transform: `rotate(${angle}deg)`,
                    transition: 'transform 0.7s cubic-bezier(0.4,0,0.2,1)',
                  }}
                >
                  <polygon
                    points={`${cx - 3},${cy} ${cx + 3},${cy} ${cx},${cy - 138}`}
                    fill="white"
                    opacity="0.95"
                  />
                  <polygon
                    points={`${cx - 1.5},${cy} ${cx + 1.5},${cy} ${cx},${cy - 138}`}
                    fill={actionColor}
                    opacity="0.75"
                  />
                </g>
                <circle cx={cx} cy={cy} r="15" fill="#050505" stroke="#9b59ff" strokeWidth="1.5" />
                <circle cx={cx} cy={cy} r="9" fill="url(#gtHg2)" />
                <circle cx={cx} cy={cy} r="4" className="gtp2" fill={actionColor} />
                <text
                  x="42"
                  y="233"
                  fill="#ff2244"
                  fontSize="13"
                  fontWeight="900"
                  textAnchor="middle"
                >
                  PUTS
                </text>
                <text
                  x="358"
                  y="233"
                  fill="#00ff88"
                  fontSize="13"
                  fontWeight="900"
                  textAnchor="middle"
                >
                  CALLS
                </text>
                <text
                  x="200"
                  y="256"
                  fill={actionColor}
                  fontSize="22"
                  fontWeight="900"
                  textAnchor="middle"
                  letterSpacing="3"
                >
                  {actionText}
                </text>
              </svg>
            </div>
          )
        })()}

        {/* ─── STABILITY GAUGE ─── */}
        {(() => {
          const val = siMetrics.siNorm
          const angle = -90 + ((Math.max(-10, Math.min(10, val)) + 10) / 20) * 180
          const cx = 200,
            cy = 215,
            r = 150,
            arcLen = Math.PI * r
          const scoreColor = val > 2 ? '#00ff88' : val < -2 ? '#ff2244' : '#ffcc00'
          const scoreLabel =
            val > 5
              ? 'STABLE/PINNED'
              : val > 2
                ? 'DAMPENED'
                : val > 0.5
                  ? 'NEUTRAL'
                  : val < -5
                    ? 'AMPLIFIED'
                    : val < -2
                      ? 'VOLATILE'
                      : val < -0.5
                        ? 'TRENDING'
                        : 'NEUTRAL'
          return (
            <div className="relative w-full" style={{ aspectRatio: '4/3.84' }}>
              <svg viewBox="0 -8 400 288" className="w-full h-full">
                <defs>
                  <radialGradient id="gtHg3" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="55%" stopColor={scoreColor} stopOpacity="0.85" />
                    <stop offset="100%" stopColor={scoreColor} stopOpacity="0.05" />
                  </radialGradient>
                  <linearGradient id="gtSf3" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#ff1144" />
                    <stop offset="50%" stopColor="#ff8800" />
                    <stop offset="100%" stopColor="#ffcc00" stopOpacity="0.2" />
                  </linearGradient>
                  <linearGradient id="gtBf3" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#ffcc00" stopOpacity="0.2" />
                    <stop offset="50%" stopColor="#00ccff" />
                    <stop offset="100%" stopColor="#00ff88" />
                  </linearGradient>
                  <style>{`@keyframes gtp3{0%,100%{opacity:.45}50%{opacity:1}}.gtp3{animation:gtp3 2s ease-in-out infinite;animation-delay:1s}`}</style>
                </defs>
                <text
                  x="200"
                  y="8"
                  fill="#00cfff"
                  fontSize="18"
                  fontWeight="900"
                  textAnchor="middle"
                  letterSpacing="4"
                  opacity="1"
                >
                  STABILITY INDEX
                </text>
                <path
                  d="M 50 215 A 150 150 0 0 1 350 215"
                  fill="none"
                  stroke="#071825"
                  strokeWidth="26"
                />
                <path
                  d="M 50 215 A 150 150 0 0 1 94 109"
                  fill="none"
                  stroke="#ff1144"
                  strokeWidth="26"
                  strokeOpacity="0.14"
                />
                <path
                  d="M 94 109 A 150 150 0 0 1 154 72"
                  fill="none"
                  stroke="#ff8800"
                  strokeWidth="26"
                  strokeOpacity="0.13"
                />
                <path
                  d="M 154 72 A 150 150 0 0 1 200 65"
                  fill="none"
                  stroke="#ffcc00"
                  strokeWidth="26"
                  strokeOpacity="0.10"
                />
                <path
                  d="M 200 65 A 150 150 0 0 1 246 72"
                  fill="none"
                  stroke="#ffcc00"
                  strokeWidth="26"
                  strokeOpacity="0.10"
                />
                <path
                  d="M 246 72 A 150 150 0 0 1 306 109"
                  fill="none"
                  stroke="#00ccff"
                  strokeWidth="26"
                  strokeOpacity="0.13"
                />
                <path
                  d="M 306 109 A 150 150 0 0 1 350 215"
                  fill="none"
                  stroke="#00ff88"
                  strokeWidth="26"
                  strokeOpacity="0.14"
                />
                {val < 0 ? (
                  <path
                    d="M 200 65 A 150 150 0 0 0 50 215"
                    fill="none"
                    stroke="url(#gtSf3)"
                    strokeWidth="26"
                    strokeDasharray={`${arcLen / 2} ${arcLen / 2}`}
                    strokeDashoffset={(arcLen / 2) * (1 - Math.min(Math.abs(val), 10) / 10)}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.4,0,0.2,1)' }}
                  />
                ) : (
                  <path
                    d="M 200 65 A 150 150 0 0 1 350 215"
                    fill="none"
                    stroke="url(#gtBf3)"
                    strokeWidth="26"
                    strokeDasharray={`${arcLen / 2} ${arcLen / 2}`}
                    strokeDashoffset={(arcLen / 2) * (1 - Math.min(val, 10) / 10)}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.4,0,0.2,1)' }}
                  />
                )}
                <path
                  d="M 20 215 A 180 180 0 0 1 380 215"
                  fill="none"
                  stroke="#0d2a45"
                  strokeWidth="1.5"
                />
                <path
                  d="M 62 215 A 138 138 0 0 1 338 215"
                  fill="none"
                  stroke="#0d2a45"
                  strokeWidth="1.5"
                />
                {Array.from({ length: 17 }).map((_, i) => {
                  const t = i / 16,
                    a = Math.PI - t * Math.PI,
                    major = i % 4 === 0
                  const ro = major ? 173 : 168,
                    ri = major ? 157 : 163
                  return (
                    <line
                      key={i}
                      x1={cx + ro * Math.cos(a)}
                      y1={cy - ro * Math.sin(a)}
                      x2={cx + ri * Math.cos(a)}
                      y2={cy - ri * Math.sin(a)}
                      stroke={major ? '#00d4ff' : '#0a2035'}
                      strokeWidth={major ? 2 : 1}
                    />
                  )
                })}
                <text fill="#ff2244" fontSize="12" fontWeight="bold" textAnchor="middle">
                  <tspan x="63" y="108" transform="rotate(-53 63 108)">
                    AMPL-
                  </tspan>
                  <tspan x="63" y="117" transform="rotate(-53 63 117)">
                    IFIED
                  </tspan>
                </text>
                <text fill="#ff8800" fontSize="12" fontWeight="bold" textAnchor="middle">
                  <tspan x="98" y="66" transform="rotate(-36 98 66)">
                    VOL-
                  </tspan>
                  <tspan x="98" y="75" transform="rotate(-36 98 75)">
                    ATILE
                  </tspan>
                </text>
                <text fill="#ffcc00" fontSize="12" fontWeight="bold" textAnchor="middle">
                  <tspan x="150" y="44" transform="rotate(-18 150 44)">
                    TREND-
                  </tspan>
                  <tspan x="150" y="53" transform="rotate(-18 150 53)">
                    ING
                  </tspan>
                </text>
                <text
                  x="200"
                  y="38"
                  fill="#888888"
                  fontSize="12"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  NEUTRAL
                </text>
                <text fill="#00ccff" fontSize="12" fontWeight="bold" textAnchor="middle">
                  <tspan x="250" y="44" transform="rotate(18 250 44)">
                    DAMP-
                  </tspan>
                  <tspan x="250" y="53" transform="rotate(18 250 53)">
                    ENED
                  </tspan>
                </text>
                <text fill="#00ff88" fontSize="12" fontWeight="bold" textAnchor="middle">
                  <tspan x="302" y="66" transform="rotate(36 302 66)">
                    REVER-
                  </tspan>
                  <tspan x="302" y="75" transform="rotate(36 302 75)">
                    SION
                  </tspan>
                </text>
                <text fill="#00ff44" fontSize="12" fontWeight="bold" textAnchor="middle">
                  <tspan x="337" y="108" transform="rotate(53 337 108)">
                    STABLE
                  </tspan>
                  <tspan x="337" y="117" transform="rotate(53 337 117)">
                    PINNED
                  </tspan>
                </text>
                <g
                  style={{
                    transformOrigin: `${cx}px ${cy}px`,
                    transform: `rotate(${angle}deg)`,
                    transition: 'transform 0.7s cubic-bezier(0.4,0,0.2,1)',
                  }}
                >
                  <polygon
                    points={`${cx - 3},${cy} ${cx + 3},${cy} ${cx},${cy - 138}`}
                    fill="white"
                    opacity="0.95"
                  />
                  <polygon
                    points={`${cx - 1.5},${cy} ${cx + 1.5},${cy} ${cx},${cy - 138}`}
                    fill={scoreColor}
                    opacity="0.75"
                  />
                </g>
                <circle cx={cx} cy={cy} r="15" fill="#020810" stroke="#0d2a45" strokeWidth="1.5" />
                <circle cx={cx} cy={cy} r="9" fill="url(#gtHg3)" />
                <circle cx={cx} cy={cy} r="4" className="gtp3" fill={scoreColor} />
                <text
                  x="42"
                  y="233"
                  fill="#ff2244"
                  fontSize="13"
                  fontWeight="900"
                  textAnchor="middle"
                >
                  VOLATILE
                </text>
                <text
                  x="358"
                  y="233"
                  fill="#00ff88"
                  fontSize="13"
                  fontWeight="900"
                  textAnchor="middle"
                >
                  STABLE
                </text>
                <text
                  x="200"
                  y="250"
                  fill={scoreColor}
                  fontSize="27"
                  fontWeight="900"
                  textAnchor="middle"
                >
                  {val > 0 ? '+' : ''}
                  {val.toFixed(1)}
                </text>
                <text
                  x="200"
                  y="267"
                  fill={scoreColor}
                  fontSize="11"
                  fontWeight="bold"
                  textAnchor="middle"
                  letterSpacing="2.5"
                  opacity="0.9"
                >
                  {scoreLabel}
                </text>
              </svg>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

// Helper function to calculate Vanna using Black-Scholes formula
// Vanna = -e^(-rT) × N'(d₁) × d₂/σ
const calculateVanna = (
  strike: number,
  spotPrice: number,
  T: number,
  impliedVol: number,
  riskFreeRate: number = 0.0408
): number => {
  if (T <= 0 || impliedVol <= 0 || spotPrice <= 0) return 0

  const sigma = impliedVol
  const r = riskFreeRate
  const S = spotPrice
  const K = strike

  // Calculate d1 and d2
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T))
  const d2 = d1 - sigma * Math.sqrt(T)

  // Calculate N'(d1) - standard normal probability density function
  const nPrime_d1 = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * d1 * d1)

  // Vanna = -e^(-rT) × N'(d₁) × d₂/σ
  const vanna = -Math.exp(-r * T) * nPrime_d1 * (d2 / sigma)

  return vanna
}

interface LiquidPanelProps {
  onClose?: () => void
}

const LIVE_QUOTES = [
  "Real-time data doesn't remove uncertainty — it just makes you faster at being wrong.",
  'The tape never lies. Only the traders who read it do.',
  'Momentum is a fact. Direction is an opinion.',
  'Every print tells a story. Most traders skip to the last page.',
  'Flow precedes price. Always follow the paper.',
  'Options flow is the shadow of informed money moving through walls.',
  'When the smart money speaks, it speaks in size.',
  'The open interest never forgets. It remembers every position ever taken.',
  'Gamma is the accelerator. Delta is just where you are.',
  'Live data is a weapon. Interpretation is the trigger.',
  "The dealer's hedge today is tomorrow's price magnet.",
  'In live markets, hesitation is a position.',
  "Unusual options activity isn't always smart money — but it's always worth watching.",
  'The market moves toward max pain like a river to the sea.',
  "Size doesn't guarantee direction, but it always guarantees attention.",
  'The market is the only place where things go on sale and everyone runs out of the store.',
  'Bulls make money, bears make money, pigs get slaughtered. — Wall Street proverb',
  'Never confuse a bull market with brains. — Humphrey Neill',
  "The time to buy is when there's blood in the streets. — Baron Rothschild",
  'Compound interest is the eighth wonder of the world. — attributed to Einstein',
  'Know what you own and know why you own it. — Peter Lynch',
  'The market is not your enemy. Your emotions are. — anonymous',
  "A stock doesn't know you own it. — anonymous",
  'October is one of the peculiarly dangerous months to speculate in stocks. The others are July, January, September, April, November, May, March, June, December, August, and February. — Mark Twain',
]

const MARKET_QUOTES = [
  'The market is a device for transferring money from the impatient to the patient. — Warren Buffett',
  'In the short run, the market is a voting machine. In the long run, it is a weighing machine. — Benjamin Graham',
  "The four most dangerous words in investing are: 'This time it's different.' — Sir John Templeton",
  "Risk comes from not knowing what you're doing. — Warren Buffett",
  'The stock market is filled with individuals who know the price of everything, but the value of nothing. — Philip Fisher',
  'Be fearful when others are greedy, and greedy when others are fearful. — Warren Buffett',
  'Markets can remain irrational longer than you can remain solvent. — John Maynard Keynes',
  'The trend is your friend until the end. — Ed Seykota',
  'Opportunities come infrequently. When it rains gold, put out the bucket, not the thimble. — Warren Buffett',
  'Everyone has a plan until the market punches them in the face. — adapted',
  'Cut your losses short and let your winners run. — Wall Street axiom',
  'The market can do anything. — Mark Douglas',
  'Price is what you pay. Value is what you get. — Warren Buffett',
  'Volatility is not risk. The permanent loss of capital is risk. — Howard Marks',
  "If you don't know who the sucker at the table is, it's you. — Warren Buffett",
  'An investment in knowledge pays the best interest. — Benjamin Franklin',
  'Wide diversification is only required when investors do not understand what they are doing. — Warren Buffett',
  'The goal of a successful trader is to make the best trades. Money is secondary. — Alexander Elder',
  'In investing, what is comfortable is rarely profitable. — Robert Arnott',
  'The biggest risk is not taking any risk. — Mark Zuckerberg',
  "The stock market is a no-called-strike game. You don't have to swing at everything. — Warren Buffett",
  'Investing is the intersection of economics and psychology. — Seth Klarman',
  'The secret to investing is to figure out the value of something and then pay a lot less for it. — Joel Greenblatt',
  "If you spend more than 13 minutes analyzing economic and market forecasts, you've wasted 10 minutes. — Peter Lynch",
  'The time of maximum pessimism is the best time to buy. — Sir John Templeton',
  'Successful investing is about managing risk, not avoiding it. — Benjamin Graham',
  "It's not whether you're right or wrong that's important, but how much money you make when you're right. — George Soros",
  'The elder among traders says buy low, sell high. The wise one knows there is no high without a low before it. — anonymous',
]

const LiquidPanel: React.FC<LiquidPanelProps> = ({ onClose }) => {
  const [data, setData] = useState<GEXData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expirations, setExpirations] = useState<string[]>([])
  const [currentPrice, setCurrentPrice] = useState(0)
  const [selectedTicker, setSelectedTicker] = useState('')
  const [tickerInput, setTickerInput] = useState('')
  const [gexByStrikeByExpiration, setGexByStrikeByExpiration] = useState<{
    [expiration: string]: {
      [strike: number]: {
        call: number
        put: number
        callOI: number
        putOI: number
        callGamma?: number
        putGamma?: number
        callDelta?: number
        putDelta?: number
        callVanna?: number
        putVanna?: number
        callTheta?: number
        putTheta?: number
      }
    }
  }>({})
  const [dealerByStrikeByExpiration, setDealerByStrikeByExpiration] = useState<{
    [expiration: string]: {
      [strike: number]: {
        call: number
        put: number
        callOI: number
        putOI: number
        callGamma?: number
        putGamma?: number
        callDelta?: number
        putDelta?: number
        callVanna?: number
        putVanna?: number
        callVega?: number
        putVega?: number
        callTheta?: number
        putTheta?: number
      }
    }
  }>({})

  // Backup original base data before live mode modifies it
  const [baseGexByStrikeByExpiration, setBaseGexByStrikeByExpiration] = useState<{
    [expiration: string]: {
      [strike: number]: {
        call: number
        put: number
        callOI: number
        putOI: number
        callGamma?: number
        putGamma?: number
        callDelta?: number
        putDelta?: number
        callVanna?: number
        putVanna?: number
        callTheta?: number
        putTheta?: number
      }
    }
  }>({})
  const [baseDealerByStrikeByExpiration, setBaseDealerByStrikeByExpiration] = useState<{
    [expiration: string]: {
      [strike: number]: {
        call: number
        put: number
        callOI: number
        putOI: number
        callGamma?: number
        putGamma?: number
        callDelta?: number
        putDelta?: number
        callVanna?: number
        putVanna?: number
        callVega?: number
        putVega?: number
        callTheta?: number
        putTheta?: number
      }
    }
  }>({})

  const [viewMode, setViewMode] = useState<'NET' | 'CP'>('CP') // C/P by default
  const [analysisType, setAnalysisType] = useState<'GEX'>('GEX') // Gamma Exposure by default
  const [vexByStrikeByExpiration, setVexByStrikeByExpiration] = useState<{
    [expiration: string]: {
      [strike: number]: {
        call: number
        put: number
        callOI: number
        putOI: number
        callVega?: number
        putVega?: number
      }
    }
  }>({})
  const [flowGexByStrikeByExpiration, setFlowGexByStrikeByExpiration] = useState<{
    [expiration: string]: {
      [strike: number]: {
        call: number
        put: number
        callOI: number
        putOI: number
        callVolume: number
        putVolume: number
      }
    }
  }>({})
  // Desktop: Duo mode (both showGEX and showDealer true) | Mobile: Normal + Dealer (both true)
  const [showGEX, setShowGEX] = useState(true)
  const [showDealer, setShowDealer] = useState(true)
  const [duoMode, setDuoMode] = useState(
    typeof window !== 'undefined' && window.innerWidth >= 768 ? true : false
  )
  const [gexMode, setGexMode] = useState<'Net GEX' | 'Net Dealer'>('Net GEX')
  const [showFlowGEX, setShowFlowGEX] = useState(false)
  const [showHistoricalGEX, setShowHistoricalGEX] = useState(true) // Historical GEX Timeline - always on
  const [historicalTimestamp, setHistoricalTimestamp] = useState<number | null>(null) // Selected historical timestamp
  const [historicalPrice, setHistoricalPrice] = useState<number>(0) // Price at selected timestamp
  const [historicalGEXData, setHistoricalGEXData] = useState<{
    [expiration: string]: {
      [strike: number]: {
        call: number
        put: number
        callOI: number
        putOI: number
        callGamma?: number
        putGamma?: number
      }
    }
  }>({})

  const [showOI, setShowOI] = useState(false)
  const [mobileDropdownOpen, setMobileDropdownOpen] = useState(false)
  const [liveMode, setLiveMode] = useState(false) // Single live mode toggle for all metrics
  const [liveOIData, setLiveOIData] = useState<Map<string, number>>(new Map())
  const [flowTradesData, setFlowTradesData] = useState<any[]>([]) // Store all trades with premiums
  const [liveOILoading, setLiveOILoading] = useState(false)
  const [liveOIProgress, setLiveOIProgress] = useState(0)
  const [useBloombergTheme, setUseBloombergTheme] = useState(true) // Bloomberg Terminal theme - default ON
  const [showODTRIO, setShowODTRIO] = useState(false) // ODTRIO mode for SPX, QQQ, SPY
  const [odtrioData, setOdtrioData] = useState<{
    [key: string]: {
      data: any[]
      loading: boolean
      currentPrice?: number
      odteExpiry?: string
      timestamp?: number
    }
  }>({
    SPX: { data: [], loading: false },
    QQQ: { data: [], loading: false },
    SPY: { data: [], loading: false },
  })
  const [baseOdtrioData, setBaseOdtrioData] = useState<{
    [key: string]: {
      data: any[]
      loading: boolean
      currentPrice?: number
      odteExpiry?: string
      timestamp?: number
    }
  }>({
    SPX: { data: [], loading: false },
    QQQ: { data: [], loading: false },
    SPY: { data: [], loading: false },
  })
  const [activeTab, setActiveTab] = useState<'ATTRACTION'>('ATTRACTION')

  const POLYGON_API_KEY = process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''

  // Calculate number of active tables and update parent container width
  const activeTableCount = [showGEX, showDealer, showFlowGEX].filter(Boolean).length

  // Dynamic strike column width based on data
  const strikeColWidth = useMemo(() => {
    const allStrikes = data.map((d) => d.strike)
    const maxStrike = allStrikes.length > 0 ? Math.max(...allStrikes) : 0
    const strikeLength = Math.floor(maxStrike).toString().length
    // Tight calculation: 20px base + (6px per digit) + 8px for decimal
    const calculatedWidth = 20 + strikeLength * 6 + 8
    return Math.max(50, Math.min(calculatedWidth, 70)) // Min 50px, max 70px
  }, [data])

  React.useEffect(() => {
    // Find the parent sidebar panel and update its width ONLY if it's the dealer attraction panel
    const sidebarPanel = document.querySelector('[data-sidebar-panel="liquid"]') as HTMLElement
    if (sidebarPanel) {
      // Count total items: OI chart (if enabled) + tables
      const oiCount = showOI ? 1 : 0
      const totalItems = oiCount + activeTableCount

      if (totalItems === 0 || totalItems === 1) {
        // 0 items OR 1 item (OI only OR 1 table only) - 1200px
        sidebarPanel.style.width = '1200px'
      } else if (totalItems === 2) {
        if (showOI && activeTableCount === 1) {
          // OI + 1 table: 1200px + 900px = 2100px
          sidebarPanel.style.width = '2100px'
        } else if (duoMode && !showOI && activeTableCount === 2) {
          // DUO MODE: wider to fit all header controls
          sidebarPanel.style.width = '1400px'
        } else {
          // 2 tables (no OI) - 1775px
          sidebarPanel.style.width = '1775px'
        }
      } else if (totalItems === 3) {
        if (showOI && activeTableCount === 2) {
          // OI + 2 tables: 1100px + 895px + 895px + gaps = 2940px
          sidebarPanel.style.width = '2940px'
        } else {
          // 3 tables (no OI) - 2662px
          sidebarPanel.style.width = '2662px'
        }
      } else if (totalItems >= 4) {
        // OI + 3 tables - full width
        sidebarPanel.style.width = 'calc(100vw - 4.0625rem)'
      }
    }
  }, [activeTableCount, showOI, duoMode])

  // Live OI Update - Separate scan with AlgoFlow's exact logic
  const updateLiveOI = async () => {
    // Use whatever ticker is typed in the search bar
    const tickerToScan = (tickerInput.trim() || selectedTicker).toUpperCase()

    setLiveOILoading(true)
    setLiveOIProgress(0)

    const eventSource = new EventSource(`/api/stream-options-flow?ticker=${tickerToScan}`)
    let allTrades: any[] = []
    let scanComplete = false

    eventSource.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data)

        // Accumulate trades from ticker_complete events (API streams trades here, not in 'complete')
        if (data.type === 'ticker_complete' && data.trades?.length > 0) {
          allTrades.push(...data.trades)
          return
        }

        if (data.type === 'complete') {
          // If API still populates complete.trades (legacy), use them; otherwise use accumulated
          if (data.trades?.length > 0) allTrades = data.trades
          if (allTrades.length === 0) {
            console.warn('⚠️ No trades received from stream')
            eventSource.close()
            setLiveOILoading(false)
            setLiveOIProgress(0)
            return
          }

          scanComplete = true
          eventSource.close()
          setLiveOIProgress(20) // 20% - trades received

          // Step 1: Fetch volume and OI data for all trades using Polygon API
          const uniqueExpirations = [...new Set(allTrades.map((t) => t.expiry))]

          const allContracts = new Map()

          // Fetch data for each expiration — paginate to get ALL contracts (SPX has >250 per expiry)
          for (let i = 0; i < uniqueExpirations.length; i++) {
            const expiry = uniqueExpirations[i]
            const expiryParam = expiry.includes('T') ? expiry.split('T')[0] : expiry

            try {
              let pageUrl: string | null =
                `https://api.polygon.io/v3/snapshot/options/${tickerToScan}?expiration_date=${expiryParam}&limit=250&apiKey=${POLYGON_API_KEY}`
              let totalForExpiry = 0
              while (pageUrl) {
                const response: Response = await fetch(pageUrl)
                if (!response.ok) {
                  console.warn(`🔴 [LIVE] Expiry ${expiryParam} — HTTP ${response.status}`)
                  break
                }
                const chainData: any = await response.json()
                if (chainData.results) {
                  chainData.results.forEach((contract: any) => {
                    if (contract.details && contract.details.ticker) {
                      allContracts.set(contract.details.ticker, {
                        volume: contract.day?.volume || 0,
                        open_interest: contract.open_interest || 0,
                        bid: contract.last_quote?.bid || 0,
                        ask: contract.last_quote?.ask || 0,
                      })
                    }
                  })
                  totalForExpiry += chainData.results.length
                }
                pageUrl = chainData.next_url
                  ? `${chainData.next_url}&apiKey=${POLYGON_API_KEY}`
                  : null
              }
              // Update progress: 20% to 60% during contract fetching
              setLiveOIProgress(20 + Math.round(((i + 1) / uniqueExpirations.length) * 40))
            } catch (error) {
              console.error(`  ❌ Error fetching ${expiryParam}:`, error)
            }
          }

          setLiveOIProgress(60) // 60% - contracts fetched

          // Step 2: Enrich trades with volume/OI
          const enrichedTrades = allTrades.map((trade) => {
            const contractData = allContracts.get(trade.ticker)
            return {
              ...trade,
              volume: contractData?.volume || 0,
              open_interest: contractData?.open_interest || 0,
              underlying_ticker: trade.underlying_ticker || tickerToScan,
            }
          })
          setLiveOIProgress(70) // 70% - trades enriched

          // Step 3: Detect fill styles using HISTORICAL bid/ask at exact trade timestamp
          // Same approach as AlgoFlowScreener & Options Flow page — fetches the bid/ask
          // that existed at the moment the trade printed, not the current live snapshot.

          const normalizeTickerForOptions = (ticker: string) => {
            const specialCases: Record<string, string> = { 'BRK.B': 'BRK', 'BF.B': 'BF' }
            return specialCases[ticker] || ticker
          }

          const buildOptionTicker = (trade: any): string => {
            const expiry = trade.expiry.replace(/-/g, '').slice(2)
            const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0')
            const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'
            return `O:${normalizeTickerForOptions(trade.underlying_ticker)}${expiry}${optionType}${strikeFormatted}`
          }

          const computeFillStyle = (fillPrice: number, bid: number, ask: number): string => {
            const midpoint = (bid + ask) / 2
            if (fillPrice >= ask + 0.01) return 'AA'
            if (fillPrice <= bid - 0.01) return 'BB'
            if (fillPrice === ask) return 'A'
            if (fillPrice === bid) return 'B'
            return fillPrice >= midpoint ? 'A' : 'B'
          }

          // Build deduplicated batch payload — unique by contract + second bucket (same as AlgoFlow)
          // Use trade.ticker directly — it's the correct OCC ticker from Polygon (e.g. O:SPXW260325C06560000)
          // buildOptionTicker() produces wrong format for SPX (missing W in SPXW), so never use it for lookups
          type QuoteKey = string
          const uniqueQuotes = new Map<QuoteKey, { contract: string; timestamp_ns: number }>()
          for (const trade of enrichedTrades) {
            const contract = trade.ticker // already correct OCC ticker from Polygon
            const tradeMs =
              typeof trade.trade_timestamp === 'number'
                ? trade.trade_timestamp
                : new Date(trade.trade_timestamp).getTime()
            const timestampNs = tradeMs * 1_000_000
            const key: QuoteKey = `${contract}:${Math.floor(timestampNs / 1_000_000_000)}`
            if (!uniqueQuotes.has(key))
              uniqueQuotes.set(key, { contract, timestamp_ns: timestampNs })
          }

          // Single batch POST — server fans out Polygon /v3/quotes calls with timestamp.lte
          // to get the exact bid/ask at the moment each trade printed (works for SPX too)
          const batchPayload = Array.from(uniqueQuotes.entries()).map(([id, v]) => ({ id, ...v }))
          const quoteResultMap = new Map<QuoteKey, { bid: number; ask: number } | null>()
          try {
            const res = await fetch('/api/options-quotes-batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ trades: batchPayload }),
            })
            const batchData = await res.json()
            for (const r of batchData.results as {
              id: string
              bid: number | null
              ask: number | null
            }[]) {
              if (r.bid && r.ask && r.bid > 0 && r.ask > 0) {
                quoteResultMap.set(r.id, { bid: r.bid, ask: r.ask })
              } else {
                quoteResultMap.set(r.id, null)
              }
            }
          } catch {
            // All trades fall through to N/A fill style
            console.warn(`🔴 [LIVE] Historical quote batch failed — all fills will be N/A`)
          }

          setLiveOIProgress(78) // 78% - historical quotes fetched

          // Map historical quotes back to each trade using trade.ticker as the key
          const tradesWithFillStyle: any[] = enrichedTrades.map((trade) => {
            const contract = trade.ticker
            const tradeMs =
              typeof trade.trade_timestamp === 'number'
                ? trade.trade_timestamp
                : new Date(trade.trade_timestamp).getTime()
            const timestampNs = tradeMs * 1_000_000
            const key: QuoteKey = `${contract}:${Math.floor(timestampNs / 1_000_000_000)}`
            const quote = quoteResultMap.get(key) ?? null
            if (quote) {
              return {
                ...trade,
                fill_style: computeFillStyle(trade.premium_per_contract, quote.bid, quote.ask),
              }
            }
            return { ...trade, fill_style: 'N/A' }
          })

          setLiveOIProgress(80) // 80% - fill styles calculated

          // Store trades data for Flow Map
          setFlowTradesData(tradesWithFillStyle)

          // Step 4: Calculate Live OI for each unique contract
          const liveOIMap = new Map<string, number>()
          const uniqueContracts = new Set<string>()

          tradesWithFillStyle.forEach((trade) => {
            const contractKey = `${trade.underlying_ticker}_${trade.strike}_${trade.type}_${trade.expiry}`
            uniqueContracts.add(contractKey)
          })

          uniqueContracts.forEach((contractKey) => {
            const matchingTrade = tradesWithFillStyle.find(
              (t) => `${t.underlying_ticker}_${t.strike}_${t.type}_${t.expiry}` === contractKey
            )

            const originalOI = matchingTrade?.open_interest || 0

            // Calculate Live OI using the trades
            const contractTrades = tradesWithFillStyle.filter(
              (t) => `${t.underlying_ticker}_${t.strike}_${t.type}_${t.expiry}` === contractKey
            )

            let liveOI = originalOI
            const processedTradeIds = new Set<string>()

            // Sort trades chronologically
            const sortedTrades = [...contractTrades].sort(
              (a, b) =>
                new Date(a.trade_timestamp).getTime() - new Date(b.trade_timestamp).getTime()
            )

            sortedTrades.forEach((trade) => {
              const tradeId = `${trade.underlying_ticker}_${trade.strike}_${trade.type}_${trade.expiry}_${trade.trade_timestamp}_${trade.trade_size}`

              if (processedTradeIds.has(tradeId)) return
              processedTradeIds.add(tradeId)

              const contracts = trade.trade_size || 0
              const fillStyle = trade.fill_style

              switch (fillStyle) {
                case 'A':
                case 'AA':
                case 'BB':
                  liveOI += contracts
                  break
                case 'B':
                  if (contracts > originalOI) {
                    liveOI += contracts
                  } else {
                    liveOI -= contracts
                  }
                  break
              }
            })

            liveOI = Math.max(0, liveOI)
            liveOIMap.set(contractKey, liveOI)
          })

          setLiveOIData(liveOIMap)
          setLiveOIProgress(100) // 100% - complete

          // Check if base options data exists, if not fetch it first
          await fetchOptionsData(liveOIMap, tradesWithFillStyle)
          setLiveOILoading(false)
          setLiveOIProgress(100)
        }
      } catch (error) {
        console.error('🔴 [LIVE] ❌ Error:', error)
        setLiveOILoading(false)
        setLiveOIProgress(0)
      }
    }

    eventSource.onerror = (error) => {
      if (scanComplete) {
        // Stream closed normally after completion — not a real error
        eventSource.close()
        return
      }
      console.error('❌ EventSource error:', error)
      eventSource.close()
      setLiveOILoading(false)
      setLiveOIProgress(0)
    }
  }

  // ODTRIO Live OI Update - Only scan for ODTE expiration and strike range
  const updateOdtrioLiveOI = async () => {
    setLiveOILoading(true)
    setLiveOIProgress(0)

    const tickers = ['SPX', 'QQQ', 'SPY']
    const liveOIMap = new Map<string, number>()
    let totalTrades = 0

    for (const ticker of tickers) {
      const eventSource = new EventSource(`/api/stream-options-flow?ticker=${ticker}`)
      let allTrades: any[] = []

      await new Promise<void>((resolve) => {
        let odtrioScanComplete = false

        eventSource.onmessage = async (event) => {
          try {
            const data = JSON.parse(event.data)

            // Accumulate trades from ticker_complete events (API streams trades here, not in 'complete')
            if (data.type === 'ticker_complete' && data.trades?.length > 0) {
              allTrades.push(...data.trades)
              return
            }

            if (data.type === 'complete') {
              // If API still populates complete.trades (legacy), use them; otherwise use accumulated
              if (data.trades?.length > 0) allTrades = data.trades
              totalTrades += allTrades.length
              odtrioScanComplete = true
              eventSource.close()
              resolve()
            }
          } catch (error) {
            console.error(`❌ ${ticker} Error:`, error)
            eventSource.close()
            resolve()
          }
        }

        eventSource.onerror = (error) => {
          if (odtrioScanComplete) {
            // Stream closed normally after completion — not a real error
            eventSource.close()
            resolve()
            return
          }
          console.error(`❌ ${ticker} EventSource error:`, error)
          eventSource.close()
          resolve()
        }
      })

      if (allTrades.length === 0) {
        continue
      }

      // Get current ODTRIO data to determine expiration and strike range
      const tickerData = odtrioData[ticker]
      if (!tickerData || !tickerData.odteExpiry || !tickerData.currentPrice) {
        continue
      }

      const odteExpiry = tickerData.odteExpiry
      const currentPrice = tickerData.currentPrice

      let minStrike, maxStrike

      // For SPX: Get exactly 50 calls and 50 puts (100 total contracts)
      if (ticker === 'SPX') {
        // Get all available strikes from ODTRIO data to find closest ones
        const allStrikes = tickerData.data.map((row) => row.strike).sort((a, b) => a - b)

        // Find strikes closest to current price
        const callStrikes = allStrikes.filter((s) => s >= currentPrice).slice(0, 50) // 50 calls at/above price
        const putStrikes = allStrikes.filter((s) => s <= currentPrice).slice(-50) // 50 puts at/below price

        minStrike = Math.min(...putStrikes, ...callStrikes)
        maxStrike = Math.max(...putStrikes, ...callStrikes)
      } else {
        // For QQQ/SPY: Use percentage-based range
        let minStrikePercent = 0.95,
          maxStrikePercent = 1.08
        if (ticker === 'SPY') {
          minStrikePercent = 0.97
          maxStrikePercent = 1.04
        }

        minStrike = currentPrice * minStrikePercent
        maxStrike = currentPrice * maxStrikePercent
      }

      // Filter trades to only ODTE expiration and strike range
      const filteredTrades = allTrades.filter((trade) => {
        const tradeExpiry = trade.expiry.includes('T') ? trade.expiry.split('T')[0] : trade.expiry
        const strike = trade.strike
        return tradeExpiry === odteExpiry && strike >= minStrike && strike <= maxStrike
      })

      if (filteredTrades.length === 0) {
        continue
      }

      // Fetch volume/OI for ONLY the ODTE expiration
      const expiryParam = odteExpiry
      const allContracts = new Map()

      try {
        const response = await fetch(
          `https://api.polygon.io/v3/snapshot/options/${ticker}?expiration_date=${expiryParam}&limit=250&apiKey=${POLYGON_API_KEY}`
        )

        if (response.ok) {
          const chainData = await response.json()
          if (chainData.results) {
            chainData.results.forEach((contract: any) => {
              if (contract.details && contract.details.ticker) {
                const contractStrike = contract.details.strike_price
                // Only store contracts within our strike range
                if (contractStrike >= minStrike && contractStrike <= maxStrike) {
                  allContracts.set(contract.details.ticker, {
                    volume: contract.day?.volume || 0,
                    open_interest: contract.open_interest || 0,
                  })
                }
              }
            })
          }
        }
      } catch (error) {
        console.error(`  ❌ ${ticker} Error fetching ${expiryParam}:`, error)
      }

      // Enrich trades with volume/OI
      const enrichedTrades = filteredTrades.map((trade) => {
        const contractData = allContracts.get(trade.ticker)
        return {
          ...trade,
          volume: contractData?.volume || 0,
          open_interest: contractData?.open_interest || 0,
          underlying_ticker: ticker,
        }
      })

      // Calculate fill styles
      const tradesWithFillStyle = enrichedTrades.map((trade) => {
        const volume = trade.volume || 0
        const tradeSize = trade.trade_size || 0
        const oi = trade.open_interest || 0

        let fillStyle = 'N/A'
        if (tradeSize > oi * 0.5) {
          fillStyle = 'AA'
        } else if (tradeSize > volume * 0.3) {
          fillStyle = 'A'
        } else if (tradeSize > oi * 0.1) {
          fillStyle = 'BB'
        } else {
          fillStyle = 'B'
        }

        return { ...trade, fill_style: fillStyle }
      })

      // Calculate Live OI for each unique contract
      const uniqueContracts = new Set<string>()
      tradesWithFillStyle.forEach((trade) => {
        const contractKey = `${ticker}_${trade.strike}_${trade.type}_${odteExpiry}`
        uniqueContracts.add(contractKey)
      })

      uniqueContracts.forEach((contractKey) => {
        const matchingTrade = tradesWithFillStyle.find(
          (t) => `${ticker}_${t.strike}_${t.type}_${odteExpiry}` === contractKey
        )

        const originalOI = matchingTrade?.open_interest || 0

        const contractTrades = tradesWithFillStyle.filter(
          (t) => `${ticker}_${t.strike}_${t.type}_${odteExpiry}` === contractKey
        )

        let liveOI = originalOI
        const processedTradeIds = new Set<string>()

        const sortedTrades = [...contractTrades].sort(
          (a, b) => new Date(a.trade_timestamp).getTime() - new Date(b.trade_timestamp).getTime()
        )

        sortedTrades.forEach((trade) => {
          const tradeId = `${ticker}_${trade.strike}_${trade.type}_${odteExpiry}_${trade.trade_timestamp}_${trade.trade_size}`

          if (processedTradeIds.has(tradeId)) return
          processedTradeIds.add(tradeId)

          const contracts = trade.trade_size || 0
          const fillStyle = trade.fill_style

          switch (fillStyle) {
            case 'A':
            case 'AA':
            case 'BB':
              liveOI += contracts
              break
            case 'B':
              if (contracts > originalOI) {
                liveOI += contracts
              } else {
                liveOI -= contracts
              }
              break
          }
        })

        liveOI = Math.max(0, liveOI)
        liveOIMap.set(contractKey, liveOI)
      })
    }
    setLiveOIData(liveOIMap)
    setLiveOIProgress(100)
    setLiveOILoading(false)

    // Save current ODTRIO data as backup before applying live OI
    setBaseOdtrioData(JSON.parse(JSON.stringify(odtrioData)))

    // Trigger ODTRIO recalculation with live OI
    await fetchODTRIODataWithLiveOI(liveOIMap)
  }

  // Helper function to filter expirations to 3 months max
  const filterTo3Months = (expirations: string[]) => {
    const threeMonthsFromNow = new Date()
    threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3)

    return expirations.filter((exp) => {
      const expDate = new Date(exp + 'T00:00:00Z')
      return expDate <= threeMonthsFromNow
    })
  }

  const [otmFilter, setOtmFilter] = useState<
    '1%' | '2%' | '3%' | '5%' | '8%' | '10%' | '15%' | '20%' | '25%' | '40%' | '50%' | '100%'
  >('2%')
  const [progress, setProgress] = useState(0)

  // Update OTM filter based on selected ticker
  useEffect(() => {
    if (selectedTicker) {
      const ticker = selectedTicker.toUpperCase()
      // For SPX, SPY, QQQ, use 2% default; for all others use 20%
      if (ticker === 'SPX' || ticker === 'SPY' || ticker === 'QQQ') {
        setOtmFilter('2%')
      } else {
        setOtmFilter('20%')
      }
    }
  }, [selectedTicker])

  // Helper function to get strike range based on OTM filter
  const getStrikeRange = (price: number) => {
    const percentage = parseFloat(otmFilter.replace('%', '')) / 100
    const range = price * percentage
    return {
      min: price - range,
      max: price + range,
    }
  }

  // Fetch ODTRIO data for SPX, QQQ, SPY
  const fetchODTRIOData = async () => {
    const tickers = ['SPX', 'QQQ', 'SPY']

    // Set loading state for all tickers
    tickers.forEach((ticker) => {
      setOdtrioData((prev) => ({
        ...prev,
        [ticker]: { ...prev[ticker], loading: true },
      }))
    })

    for (const ticker of tickers) {
      try {
        // Check cache first (5 minute expiry)
        const now = Date.now()
        const cached = odtrioData[ticker]
        if (cached && cached.timestamp && now - cached.timestamp < 5 * 60 * 1000) {
          setOdtrioData((prev) => ({
            ...prev,
            [ticker]: { ...cached, loading: false },
          }))
          continue
        }

        // Special handling for SPX with strike range filtering
        if (ticker === 'SPX') {
          // STEP 1: Get all available expirations first (use same endpoint as QQQ/SPY)
          const allExpirationsResponse = await fetch(`/api/options-chain?ticker=SPX`)
          const allExpirationsResult = await allExpirationsResponse.json()

          if (!allExpirationsResult.success || !allExpirationsResult.data) {
            console.error(`❌ ${ticker} Failed to fetch available expirations`)
            setOdtrioData((prev) => ({
              ...prev,
              [ticker]: {
                data: [],
                loading: false,
                currentPrice: 0,
                odteExpiry: '',
                timestamp: now,
              },
            }))
            continue
          }

          const currentPrice = allExpirationsResult.currentPrice
          const allExpirations = Object.keys(allExpirationsResult.data).sort()

          // Get current time in Pacific Time
          const currentTimePST = new Date()
          const nowPST = new Date(
            currentTimePST.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
          )
          const currentHour = nowPST.getHours()
          const currentMinute = nowPST.getMinutes()

          console.log(
            `🕐 ${ticker} Current PST time: ${currentHour}:${currentMinute.toString().padStart(2, '0')}`
          )

          // After 1:15 PM PST, look for next trading day (same logic as QQQ/SPY)
          const targetDate = new Date()
          targetDate.setHours(0, 0, 0, 0)
          if (currentHour > 16 || (currentHour === 16 && currentMinute >= 15)) {
            targetDate.setDate(targetDate.getDate() + 1)
            console.log(`⏰ ${ticker} After 4:15 PM PST, targeting next day's expiration`)
          }

          // Find next available expiration (handles weekends automatically)
          let odteExpiry = allExpirations.find((exp) => {
            const expDate = new Date(exp)
            expDate.setHours(0, 0, 0, 0)
            const daysDiff = Math.ceil(
              (expDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24)
            )
            return daysDiff >= 0 && daysDiff <= 1
          })

          if (!odteExpiry && allExpirations.length > 0) {
            odteExpiry = allExpirations[0]
          }

          if (!odteExpiry) {
            console.error(`❌ ${ticker} No expiry available`)
            setOdtrioData((prev) => ({
              ...prev,
              [ticker]: {
                data: [],
                loading: false,
                currentPrice: 0,
                odteExpiry: '',
                timestamp: now,
              },
            }))
            continue
          }

          // STEP 2: Now fetch filtered data for that specific expiration
          const minStrike = currentPrice * 0.99
          const maxStrike = currentPrice * 1.02

          const odteResponse = await fetch(
            `/api/spx-fix?ticker=SPX&expiration=${odteExpiry}&minStrike=${minStrike}&maxStrike=${maxStrike}`
          )
          const result = await odteResponse.json()

          if (!result.success || !result.data) {
            console.error(`❌ ${ticker} ODTE fetch failed for ${odteExpiry}`)
            setOdtrioData((prev) => ({
              ...prev,
              [ticker]: {
                data: [],
                loading: false,
                currentPrice: 0,
                odteExpiry: '',
                timestamp: now,
              },
            }))
            continue
          }

          // Process filtered data (already filtered by API)
          const expData = result.data[odteExpiry]
          const gexByStrike: { [strike: number]: any } = {}

          const totalCallContracts = Object.keys(expData.calls || {}).length
          const totalPutContracts = Object.keys(expData.puts || {}).length

          // Process calls
          let callsWithGamma = 0
          let callsWithOI = 0
          let totalCallOI = 0
          let totalCallGEX = 0
          let totalCallDealer = 0

          const expirationDate = new Date(odteExpiry)
          const today = new Date()
          const T = Math.max(
            (expirationDate.getTime() - today.getTime()) / (365 * 24 * 60 * 60 * 1000),
            0.001
          )
          const wT = 1 / Math.sqrt(T)
          const beta = 0.25
          const rho_S_sigma = -0.7
          const contractMult = 100

          Object.keys(expData.calls || {}).forEach((strikeStr) => {
            const strike = parseFloat(strikeStr)
            const callData = expData.calls[strikeStr]
            const gamma = callData.greeks?.gamma || 0
            const delta = callData.greeks?.delta || 0
            const vanna = callData.greeks?.vanna || 0
            const oi = callData.open_interest || 0

            if (!gexByStrike[strike]) gexByStrike[strike] = {}

            // Normal GEX
            const callGex = gamma * oi * (currentPrice * currentPrice) * 100
            gexByStrike[strike].call_gex = callGex
            gexByStrike[strike].callOI = oi

            // Dealer formula
            const gammaEff = gamma + beta * vanna * rho_S_sigma
            const liveWeight = Math.abs(delta) * (1 - Math.abs(delta))
            const callDealer = oi * gammaEff * liveWeight * wT * currentPrice * contractMult
            gexByStrike[strike].call_dealer = callDealer

            if (gamma !== 0) callsWithGamma++
            if (oi > 0) {
              callsWithOI++
              totalCallOI += oi
            }
            if (callGex !== 0) totalCallGEX += callGex
            if (callDealer !== 0) totalCallDealer += callDealer
          })

          console.log(
            `📞 ${ticker} Calls: ${callsWithGamma} with gamma, ${callsWithOI} with OI, Total OI: ${totalCallOI.toLocaleString()}, Total GEX: ${totalCallGEX.toLocaleString()}`
          )

          // Process puts
          let putsWithGamma = 0
          let putsWithOI = 0
          let totalPutOI = 0
          let totalPutGEX = 0
          let totalPutDealer = 0

          Object.keys(expData.puts || {}).forEach((strikeStr) => {
            const strike = parseFloat(strikeStr)
            const putData = expData.puts[strikeStr]
            const gamma = putData.greeks?.gamma || 0
            const delta = putData.greeks?.delta || 0
            const vanna = putData.greeks?.vanna || 0
            const oi = putData.open_interest || 0

            if (!gexByStrike[strike]) gexByStrike[strike] = {}

            // Normal GEX
            const putGex = -gamma * oi * (currentPrice * currentPrice) * 100
            gexByStrike[strike].put_gex = putGex
            gexByStrike[strike].putOI = oi

            // Dealer formula
            const gammaEff = gamma + beta * vanna * rho_S_sigma
            const liveWeight = Math.abs(delta) * (1 - Math.abs(delta))
            const putDealer = -oi * gammaEff * liveWeight * wT * currentPrice * contractMult
            gexByStrike[strike].put_dealer = putDealer

            if (gamma !== 0) putsWithGamma++
            if (oi > 0) {
              putsWithOI++
              totalPutOI += oi
            }
            if (putGex !== 0) totalPutGEX += putGex
            if (putDealer !== 0) totalPutDealer += putDealer
          })

          console.log(
            `📉 ${ticker} Puts: ${putsWithGamma} with gamma, ${putsWithOI} with OI, Total OI: ${totalPutOI.toLocaleString()}, Total GEX: ${totalPutGEX.toLocaleString()}`
          )

          // Convert to array format
          const dataArray = Object.keys(gexByStrike)
            .map((strikeStr) => {
              const strike = parseFloat(strikeStr)
              return {
                strike,
                expirations: {
                  [odteExpiry]: gexByStrike[strike],
                },
              }
            })
            .sort((a, b) => b.strike - a.strike)

          const netGEX = totalCallGEX + totalPutGEX

          setOdtrioData((prev) => ({
            ...prev,
            [ticker]: {
              data: dataArray,
              loading: false,
              currentPrice,
              odteExpiry,
              timestamp: now,
            },
          }))

          continue
        }

        // QQQ and SPY handling (existing logic)
        const apiEndpoint =
          ticker === 'SPX' ? `/api/spx-fix?ticker=${ticker}` : `/api/options-chain?ticker=${ticker}`

        const response = await fetch(apiEndpoint)
        const result = await response.json()

        if (!result.success || !result.data) {
          console.error(`❌ ${ticker} API failed`)
          setOdtrioData((prev) => ({
            ...prev,
            [ticker]: { data: [], loading: false, currentPrice: 0, odteExpiry: '', timestamp: now },
          }))
          continue
        }

        const currentPrice = result.currentPrice
        const allExpirations = Object.keys(result.data).sort()

        // Find ODTE expiry using PST timezone
        const currentTimePST = new Date()
        const nowPST = new Date(
          currentTimePST.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
        )
        const currentHour = nowPST.getHours()
        const currentMinute = nowPST.getMinutes()

        console.log(
          `🕐 ${ticker} Current PST time: ${currentHour}:${currentMinute.toString().padStart(2, '0')}`
        )

        // After 4:15 PM PST, look for next trading day
        const targetDate = new Date()
        targetDate.setHours(0, 0, 0, 0)
        if (currentHour > 16 || (currentHour === 16 && currentMinute >= 15)) {
          targetDate.setDate(targetDate.getDate() + 1)
          console.log(`⏰ ${ticker} After 4:15 PM PST, targeting next day's expiration`)
        }

        let odteExpiry = allExpirations.find((exp) => {
          const expDate = new Date(exp)
          expDate.setHours(0, 0, 0, 0)
          const daysDiff = Math.ceil(
            (expDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24)
          )
          return daysDiff >= 0 && daysDiff <= 1
        })

        if (!odteExpiry && allExpirations.length > 0) {
          odteExpiry = allExpirations[0]
        }

        if (!odteExpiry) {
          console.error(`❌ ${ticker} No expiry available`)
          setOdtrioData((prev) => ({
            ...prev,
            [ticker]: { data: [], loading: false, currentPrice: 0, odteExpiry: '', timestamp: now },
          }))
          continue
        }

        // Define strike range based on ticker (for QQQ/SPY)
        let minStrikePercent = 0.95 // Default for QQQ
        let maxStrikePercent = 1.08 // Default for QQQ

        if (ticker === 'SPY') {
          minStrikePercent = 0.97 // 3% ITM
          maxStrikePercent = 1.04 // 4% OTM
        } else if (ticker === 'QQQ') {
          minStrikePercent = 0.95 // 5% ITM
          maxStrikePercent = 1.08 // 8% OTM
        }

        const minStrike = currentPrice * minStrikePercent
        const maxStrike = currentPrice * maxStrikePercent

        // Calculate GEX for ODTE
        const expData = result.data[odteExpiry]
        const gexByStrike: { [strike: number]: any } = {}

        const totalCallContracts = Object.keys(expData.calls || {}).length
        const totalPutContracts = Object.keys(expData.puts || {}).length

        // Calculate time-related variables for dealer formula
        const expirationDate = new Date(odteExpiry)
        const today = new Date()
        const T = Math.max(
          (expirationDate.getTime() - today.getTime()) / (365 * 24 * 60 * 60 * 1000),
          0.001
        )
        const wT = 1 / Math.sqrt(T)
        const beta = 0.25
        const rho_S_sigma = -0.7
        const contractMult = 100

        // Process calls (filter by strike range)
        let callsScanned = 0
        let callsWithGamma = 0
        let callsWithOI = 0
        let totalCallOI = 0
        let totalCallGEX = 0
        let totalCallDealer = 0

        Object.keys(expData.calls || {}).forEach((strikeStr) => {
          const strike = parseFloat(strikeStr)

          // Only process strikes within range
          if (strike < minStrike || strike > maxStrike) return

          callsScanned++
          const callData = expData.calls[strikeStr]
          const gamma = callData.greeks?.gamma || 0
          const delta = callData.greeks?.delta || 0
          const vanna = callData.greeks?.vanna || 0
          const oi = callData.open_interest || 0

          if (!gexByStrike[strike]) gexByStrike[strike] = {}

          // Normal GEX
          const callGex = gamma * oi * (currentPrice * currentPrice) * 100
          gexByStrike[strike].call_gex = callGex
          gexByStrike[strike].callOI = oi

          // Dealer formula
          const gammaEff = gamma + beta * vanna * rho_S_sigma
          const liveWeight = Math.abs(delta) * (1 - Math.abs(delta))
          const callDealer = oi * gammaEff * liveWeight * wT * currentPrice * contractMult
          gexByStrike[strike].call_dealer = callDealer

          if (gamma !== 0) callsWithGamma++
          if (oi > 0) {
            callsWithOI++
            totalCallOI += oi
          }
          if (callGex !== 0) totalCallGEX += callGex
          if (callDealer !== 0) totalCallDealer += callDealer
        })

        console.log(
          `📞 ${ticker} Calls: Scanned ${callsScanned}/${totalCallContracts}, ${callsWithGamma} with gamma, ${callsWithOI} with OI, Total OI: ${totalCallOI.toLocaleString()}, Total GEX: ${totalCallGEX.toLocaleString()}`
        )

        // Process puts (filter by strike range)
        let putsScanned = 0
        let putsWithGamma = 0
        let putsWithOI = 0
        let totalPutOI = 0
        let totalPutGEX = 0
        let totalPutDealer = 0

        Object.keys(expData.puts || {}).forEach((strikeStr) => {
          const strike = parseFloat(strikeStr)

          // Only process strikes within range
          if (strike < minStrike || strike > maxStrike) return

          putsScanned++
          const putData = expData.puts[strikeStr]
          const gamma = putData.greeks?.gamma || 0
          const delta = putData.greeks?.delta || 0
          const vanna = putData.greeks?.vanna || 0
          const oi = putData.open_interest || 0

          if (!gexByStrike[strike]) gexByStrike[strike] = {}

          // Normal GEX
          const putGex = -gamma * oi * (currentPrice * currentPrice) * 100
          gexByStrike[strike].put_gex = putGex
          gexByStrike[strike].putOI = oi

          // Dealer formula
          const gammaEff = gamma + beta * vanna * rho_S_sigma
          const liveWeight = Math.abs(delta) * (1 - Math.abs(delta))
          const putDealer = -oi * gammaEff * liveWeight * wT * currentPrice * contractMult
          gexByStrike[strike].put_dealer = putDealer

          if (gamma !== 0) putsWithGamma++
          if (oi > 0) {
            putsWithOI++
            totalPutOI += oi
          }
          if (putGex !== 0) totalPutGEX += putGex
          if (putDealer !== 0) totalPutDealer += putDealer
        })

        console.log(
          `📉 ${ticker} Puts: Scanned ${putsScanned}/${totalPutContracts}, ${putsWithGamma} with gamma, ${putsWithOI} with OI, Total OI: ${totalPutOI.toLocaleString()}, Total GEX: ${totalPutGEX.toLocaleString()}`
        )

        // Convert to array format
        const dataArray = Object.keys(gexByStrike)
          .map((strikeStr) => {
            const strike = parseFloat(strikeStr)
            return {
              strike,
              expirations: {
                [odteExpiry]: gexByStrike[strike],
              },
            }
          })
          .sort((a, b) => b.strike - a.strike)

        const netGEX = totalCallGEX + totalPutGEX

        setOdtrioData((prev) => ({
          ...prev,
          [ticker]: {
            data: dataArray,
            loading: false,
            currentPrice,
            odteExpiry,
            timestamp: now,
          },
        }))
      } catch (error) {
        console.error(`❌ ${ticker} Error:`, error)
        setOdtrioData((prev) => ({
          ...prev,
          [ticker]: { data: [], loading: false, currentPrice: 0, odteExpiry: '' },
        }))
      }
    }
  }

  // Fetch ODTRIO data with Live OI - Recalculate with live OI from filtered trades
  const fetchODTRIODataWithLiveOI = async (liveOIMap: Map<string, number>) => {
    const tickers = ['SPX', 'QQQ', 'SPY']

    for (const ticker of tickers) {
      try {
        const existingData = odtrioData[ticker]
        if (!existingData || !existingData.odteExpiry || existingData.data.length === 0) {
          continue
        }

        const odteExpiry = existingData.odteExpiry
        const currentPrice = existingData.currentPrice || 0

        if (!currentPrice) {
          continue
        }

        // Recalculate GEX and Dealer values with live OI
        const updatedData = existingData.data.map((row) => {
          const strike = row.strike
          const gexData = row.expirations[odteExpiry]

          if (!gexData) return row

          // Check for live OI
          const callKey = `${ticker}_${strike}_call_${odteExpiry}`
          const putKey = `${ticker}_${strike}_put_${odteExpiry}`

          const callOI = liveOIMap.has(callKey) ? liveOIMap.get(callKey)! : gexData.callOI || 0
          const putOI = liveOIMap.has(putKey) ? liveOIMap.get(putKey)! : gexData.putOI || 0

          // Need to fetch greeks from API since we only stored OI
          // For now, use the existing gamma/delta/vanna values but recalculate with new OI
          // This is a simplification - ideally we'd fetch fresh greeks too

          // Get time decay factor
          const expirationDate = new Date(odteExpiry)
          const today = new Date()
          const T = Math.max(
            (expirationDate.getTime() - today.getTime()) / (365 * 24 * 60 * 60 * 1000),
            0.001
          )
          const wT = 1 / Math.sqrt(T)
          const beta = 0.25
          const rho_S_sigma = -0.7
          const contractMult = 100

          // Recalculate using stored gamma/delta/vanna but with live OI
          // For calls
          const callGamma = gexData.call_gex
            ? gexData.call_gex / ((gexData.callOI || 1) * (currentPrice * currentPrice) * 100)
            : 0
          const callDelta = 0.5 // Approximation since we don't store delta
          const callVanna = 0 // Approximation since we don't store vanna

          const newCallGex = callGamma * callOI * (currentPrice * currentPrice) * 100
          const callGammaEff = callGamma + beta * callVanna * rho_S_sigma
          const callLiveWeight = Math.abs(callDelta) * (1 - Math.abs(callDelta))
          const newCallDealer =
            callOI * callGammaEff * callLiveWeight * wT * currentPrice * contractMult

          // For puts
          const putGamma = gexData.put_gex
            ? Math.abs(
                gexData.put_gex / ((gexData.putOI || 1) * (currentPrice * currentPrice) * 100)
              )
            : 0
          const putDelta = -0.5 // Approximation
          const putVanna = 0 // Approximation

          const newPutGex = -putGamma * putOI * (currentPrice * currentPrice) * 100
          const putGammaEff = putGamma + beta * putVanna * rho_S_sigma
          const putLiveWeight = Math.abs(putDelta) * (1 - Math.abs(putDelta))
          const newPutDealer =
            -putOI * putGammaEff * putLiveWeight * wT * currentPrice * contractMult

          return {
            ...row,
            expirations: {
              ...row.expirations,
              [odteExpiry]: {
                ...gexData,
                callOI,
                putOI,
                call_gex: newCallGex,
                put_gex: newPutGex,
                call_dealer: newCallDealer,
                put_dealer: newPutDealer,
              },
            },
          }
        })

        // Update state
        setOdtrioData((prev) => ({
          ...prev,
          [ticker]: {
            ...existingData,
            data: updatedData,
            timestamp: Date.now(),
          },
        }))
      } catch (error) {
        console.error(`❌ ${ticker} Error recalculating:`, error)
      }
    }
  }

  // Fetch detailed GEX data using Web Worker for parallel processing
  const fetchOptionsData = async (
    liveOIMapOverride?: Map<string, number>,
    tradesDataOverride?: any[]
  ) => {
    if (!liveOIMapOverride) setLoading(true)
    setError(null)
    setProgress(0)

    try {
      // Get options chain data
      setProgress(10)
      await new Promise((resolve) => setTimeout(resolve, 0)) // Force UI update

      // Use working endpoints for indices, regular endpoint for stocks
      const tickerUpper = selectedTicker.toUpperCase()
      const apiEndpoint =
        tickerUpper === 'SPX'
          ? `/api/spx-fix?ticker=${selectedTicker}`
          : tickerUpper === 'VIX'
            ? `/api/vix-fix?ticker=${selectedTicker}`
            : `/api/options-chain?ticker=${selectedTicker}`
      const optionsResponse = await fetch(apiEndpoint)
      const optionsResult = await optionsResponse.json()

      setProgress(20)
      await new Promise((resolve) => setTimeout(resolve, 0)) // Force UI update

      if (!optionsResult.success || !optionsResult.data) {
        throw new Error(optionsResult.error || 'Failed to fetch options data')
      }

      const currentPrice = optionsResult.currentPrice
      setCurrentPrice(currentPrice)

      // Get all available expiration dates, sorted
      const allExpirations = Object.keys(optionsResult.data).sort()

      // Filter to only 3 months max for performance
      const allAvailableExpirations = filterTo3Months(allExpirations)

      setExpirations(allAvailableExpirations)

      // Calculate OI, GEX, VEX for all expiration dates with organized processing order
      setProgress(25)
      await new Promise((resolve) => setTimeout(resolve, 0)) // Force UI update

      // Initialize data structures - CALCULATE BOTH Net GEX and Net Dealer
      const oiByStrikeByExp: {
        [expiration: string]: {
          [strike: number]: { call: number; put: number; callOI: number; putOI: number }
        }
      } = {}
      const gexByStrikeByExp: {
        [expiration: string]: {
          [strike: number]: {
            call: number
            put: number
            callOI: number
            putOI: number
            callGamma?: number
            putGamma?: number
            callDelta?: number
            putDelta?: number
            callVanna?: number
            putVanna?: number
            callVega?: number
            putVega?: number
            callTheta?: number
            putTheta?: number
          }
        }
      } = {}
      const dealerByStrikeByExp: {
        [expiration: string]: {
          [strike: number]: {
            call: number
            put: number
            callOI: number
            putOI: number
            callGamma?: number
            putGamma?: number
            callDelta?: number
            putDelta?: number
            callVanna?: number
            putVanna?: number
            callVega?: number
            putVega?: number
            callTheta?: number
            putTheta?: number
          }
        }
      } = {}
      const vexByStrikeByExp: {
        [expiration: string]: {
          [strike: number]: {
            call: number
            put: number
            callOI: number
            putOI: number
            callVega?: number
            putVega?: number
          }
        }
      } = {}
      const flowGexByStrikeByExp: {
        [expiration: string]: {
          [strike: number]: {
            call: number
            put: number
            callOI: number
            putOI: number
            callVolume: number
            putVolume: number
          }
        }
      } = {}
      const allStrikes = new Set<number>()

      // Get Live OI data from parameter (if passed) or React state
      const liveOIDataFromState = liveOIMapOverride || liveOIData
      const tradesData = tradesDataOverride || flowTradesData

      // Calculate premium values by strike from flow trades (AA, A, BB only)
      const flowPremiumByStrike: {
        [expiration: string]: {
          [strike: number]: {
            callPremium: number
            putPremium: number
            callContracts: number
            putContracts: number
          }
        }
      } = {}

      let openingTradesCount = 0
      let totalPremiumSum = 0

      tradesData.forEach((trade: any) => {
        // Only count opening trades (AA, A, BB)
        if (['AA', 'A', 'BB'].includes(trade.fill_style)) {
          openingTradesCount++

          const expiry = trade.expiry
          const strike = trade.strike
          const contracts = trade.trade_size || 0

          // Calculate premium - the total_premium should already be the full notional value
          const premiumPerContract = trade.premium_per_contract || 0
          const totalCost = trade.total_premium || premiumPerContract * contracts * 100

          totalPremiumSum += totalCost

          // DEBUG: Log if premium is zero
          if (totalCost === 0) {
            console.warn(
              `⚠️ ZERO PREMIUM: ${trade.type} ${strike} ${expiry} - premium_per_contract=${premiumPerContract}, total_premium=${trade.total_premium}, contracts=${contracts}`
            )
          }

          if (!flowPremiumByStrike[expiry]) flowPremiumByStrike[expiry] = {}
          if (!flowPremiumByStrike[expiry][strike]) {
            flowPremiumByStrike[expiry][strike] = {
              callPremium: 0,
              putPremium: 0,
              callContracts: 0,
              putContracts: 0,
            }
          }

          if (trade.type === 'call') {
            flowPremiumByStrike[expiry][strike].callPremium += totalCost
            flowPremiumByStrike[expiry][strike].callContracts += contracts
            if (totalCost > 0) {
            }
          } else {
            flowPremiumByStrike[expiry][strike].putPremium += totalCost
            flowPremiumByStrike[expiry][strike].putContracts += contracts
            if (totalCost > 0) {
            }
          }
        }
      })

      // DEBUG: Show sample of premiums by expiration
      Object.keys(flowPremiumByStrike)
        .slice(0, 2)
        .forEach((exp) => {
          const strikes = Object.keys(flowPremiumByStrike[exp]).slice(0, 3)

          strikes.forEach((strike) => {
            const data = flowPremiumByStrike[exp][parseFloat(strike)]
            if (data.callPremium > 0 || data.putPremium > 0) {
            }
          })
        })

      // Smart batching: larger batches for more expirations
      const batchSize =
        allAvailableExpirations.length <= 10
          ? allAvailableExpirations.length
          : allAvailableExpirations.length <= 30
            ? 10
            : 20

      for (
        let batchStart = 0;
        batchStart < allAvailableExpirations.length;
        batchStart += batchSize
      ) {
        const batchEnd = Math.min(batchStart + batchSize, allAvailableExpirations.length)
        const batch = allAvailableExpirations.slice(batchStart, batchEnd)

        // Process this batch - calculate BOTH Net GEX and Net Dealer simultaneously
        batch.forEach((expDate: string) => {
          const { calls, puts } = optionsResult.data[expDate]

          // Initialize all data structures for this expiration
          oiByStrikeByExp[expDate] = {}
          gexByStrikeByExp[expDate] = {}
          dealerByStrikeByExp[expDate] = {} // Initialize dealer data structure
          vexByStrikeByExp[expDate] = {}

          // STEP 1: Process calls - Calculate OI first, then build other metrics from it
          Object.entries(calls).forEach(([strike, data]: [string, any]) => {
            const strikeNum = parseFloat(strike)
            let oi = data.open_interest || 0

            // 🔥 USE LIVE OI IF AVAILABLE
            const contractKey = `${selectedTicker}_${strikeNum}_call_${expDate}`
            if (liveOIDataFromState && liveOIDataFromState.has(contractKey)) {
              const liveOI = liveOIDataFromState.get(contractKey) || 0
              // console.log(`🔥 USING LIVE OI for ${contractKey}: Original=${oi}, Live=${liveOI}`);
              oi = liveOI
            }

            if (oi > 0) {
              // STEP 1A: Calculate OI (Open Interest) - Foundation for all other calculations
              oiByStrikeByExp[expDate][strikeNum] = { call: oi, put: 0, callOI: oi, putOI: 0 }

              // STEP 1B: Calculate GEX and get all Greeks from API
              const gamma = data.greeks?.gamma || 0
              const delta = data.greeks?.delta || 0
              const vega = data.greeks?.vega || 0
              const theta = data.greeks?.theta || 0 // Use Polygon's theta directly
              let vanna = data.greeks?.vanna || 0

              // If vanna is 0 or missing, calculate it using Black-Scholes formula
              if (vanna === 0 && gamma !== 0) {
                const expirationDate = new Date(expDate)
                const today = new Date()
                const T = (expirationDate.getTime() - today.getTime()) / (365 * 24 * 60 * 60 * 1000)
                const iv = data.implied_volatility || 0.3 // Use API IV or default to 30%
                vanna = calculateVanna(strikeNum, currentPrice, T, iv)
              }

              gexByStrikeByExp[expDate][strikeNum] = {
                call: 0,
                put: 0,
                callOI: oi,
                putOI: 0,
                callGamma: gamma,
                putGamma: 0,
                callDelta: delta,
                putDelta: 0,
                callVanna: vanna,
                putVanna: 0,
                callTheta: theta,
                putTheta: 0,
                callVega: vega,
                putVega: 0,
              }
              dealerByStrikeByExp[expDate][strikeNum] = {
                call: 0,
                put: 0,
                callOI: oi,
                putOI: 0,
                callGamma: gamma,
                putGamma: 0,
                callDelta: delta,
                putDelta: 0,
                callVanna: vanna,
                putVanna: 0,
              }

              // Flow Map: Simple premium-based calculation (no GEX, no Greeks)
              if (!flowGexByStrikeByExp[expDate]) flowGexByStrikeByExp[expDate] = {}

              const flowData = flowPremiumByStrike[expDate]?.[strikeNum]
              const callPremium = flowData?.callPremium || 0
              const callContracts = flowData?.callContracts || 0

              flowGexByStrikeByExp[expDate][strikeNum] = {
                call: callPremium, // Store premium directly
                put: 0,
                callOI: oi,
                putOI: 0,
                callVolume: callContracts, // Store contract count
                putVolume: 0,
              }

              if (callPremium > 0) {
                // console.log(`💰 FLOW MAP Call: Strike ${strikeNum} = $${callPremium.toFixed(0)} (${callContracts} contracts)`);
              }

              // ALWAYS calculate BOTH formulas
              // 1. NET GEX - Standard formula
              if (gamma) {
                const gex = gamma * oi * (currentPrice * currentPrice) * 100
                gexByStrikeByExp[expDate][strikeNum].call = gex
              }

              // 2. NET DEALER - Enhanced formula
              if (gamma && delta !== undefined && vanna !== undefined) {
                const expirationDate = new Date(expDate)
                const today = new Date()
                const T = Math.max(
                  (expirationDate.getTime() - today.getTime()) / (365 * 24 * 60 * 60 * 1000),
                  0.001
                ) // Min 0.001 to avoid division by zero

                if (T >= 0) {
                  const beta = 0.25
                  const rho_S_sigma = -0.7
                  const contractMult = 100
                  const wT = 1 / Math.sqrt(T)
                  const gammaEff = gamma + beta * vanna * rho_S_sigma
                  const liveWeight = Math.abs(delta) * (1 - Math.abs(delta))
                  const dealerValue = oi * gammaEff * liveWeight * wT * currentPrice * contractMult
                  dealerByStrikeByExp[expDate][strikeNum].call = dealerValue
                }
              }

              // STEP 1C: Calculate VEX using the OI we already have
              if (!vexByStrikeByExp[expDate][strikeNum]) {
                vexByStrikeByExp[expDate][strikeNum] = {
                  call: 0,
                  put: 0,
                  callOI: 0,
                  putOI: 0,
                  callVega: 0,
                  putVega: 0,
                }
              }
              vexByStrikeByExp[expDate][strikeNum].callOI = oi
              vexByStrikeByExp[expDate][strikeNum].callVega = vega // Store vega for recalculation
              if (vega && vega !== 0) {
                // Professional VEX Formula (Goldman Sachs style):
                // VEX = Vega × OI × Spot × 100 × Moneyness_Weight × Time_Weight

                const expirationDate = new Date(expDate)
                const today = new Date()
                const T = (expirationDate.getTime() - today.getTime()) / (365 * 24 * 60 * 60 * 1000)

                // Moneyness weight: ATM options have highest vega sensitivity
                // Weight peaks at ATM and decays for OTM/ITM
                const moneyness = strikeNum / currentPrice
                const moneynessWeight = Math.exp(-Math.pow(Math.log(moneyness), 2) / 0.5) // Gaussian centered at ATM

                // Time weight: Vega is highest for longer-dated options
                // But also weight by near-term expiration impact (dealers more sensitive)
                const timeWeight = T > 0 ? Math.sqrt(T) * (1 + 0.5 / Math.max(T, 0.01)) : 0

                // Professional VEX with proper notional scaling
                const vex = vega * oi * currentPrice * 100 * moneynessWeight * timeWeight

                vexByStrikeByExp[expDate][strikeNum].call = vex
              }

              allStrikes.add(strikeNum)
            }
          })

          // STEP 2: Process puts - Same order: OI → GEX → VEX → Premium with Theta calculation

          // Special debugging for Nov 10
          if (expDate === '2025-11-10') {
            console.log(`🚨 NOV 10 PUT PROCESSING DEBUG:`)
            console.log(`  Raw puts object keys: ${Object.keys(puts).slice(0, 10).join(', ')}...`)
            console.log(`  6700 in puts: ${puts.hasOwnProperty('6700')}`)
            console.log(`  6750 in puts: ${puts.hasOwnProperty('6750')}`)
            console.log(`  6850 in puts: ${puts.hasOwnProperty('6850')}`)
            console.log(`  6900 in puts: ${puts.hasOwnProperty('6900')}`)
          }

          Object.entries(puts).forEach(([strike, data]: [string, any]) => {
            const strikeNum = parseFloat(strike)
            let oi = data.open_interest || 0

            // 🔥 USE LIVE OI IF AVAILABLE
            const contractKey = `${selectedTicker}_${strikeNum}_put_${expDate}`
            if (liveOIDataFromState && liveOIDataFromState.has(contractKey)) {
              const liveOI = liveOIDataFromState.get(contractKey) || 0
              // console.log(`🔥 USING LIVE OI for ${contractKey}: Original=${oi}, Live=${liveOI}`);
              oi = liveOI
            }

            // Log high OI puts for Nov 10
            if (expDate === '2025-11-10' && oi > 100) {
            }

            if (oi > 0) {
              // STEP 2A: Update OI with put data (initialize if not exists from calls)
              if (!oiByStrikeByExp[expDate][strikeNum]) {
                oiByStrikeByExp[expDate][strikeNum] = { call: 0, put: 0, callOI: 0, putOI: 0 }
              }
              oiByStrikeByExp[expDate][strikeNum].put = oi
              oiByStrikeByExp[expDate][strikeNum].putOI = oi

              // STEP 2B: Update GEX with put data and get all Greeks from API
              if (!gexByStrikeByExp[expDate][strikeNum]) {
                gexByStrikeByExp[expDate][strikeNum] = {
                  call: 0,
                  put: 0,
                  callOI: 0,
                  putOI: 0,
                  callGamma: 0,
                  putGamma: 0,
                  callDelta: 0,
                  putDelta: 0,
                  callVanna: 0,
                  putVanna: 0,
                  callTheta: 0,
                  putTheta: 0,
                  callVega: 0,
                  putVega: 0,
                }
              }
              // Initialize dealer data if not exists
              if (!dealerByStrikeByExp[expDate][strikeNum]) {
                dealerByStrikeByExp[expDate][strikeNum] = {
                  call: 0,
                  put: 0,
                  callOI: 0,
                  putOI: 0,
                  callGamma: 0,
                  putGamma: 0,
                  callDelta: 0,
                  putDelta: 0,
                  callVanna: 0,
                  putVanna: 0,
                }
              }

              const gamma = data.greeks?.gamma || 0
              const delta = data.greeks?.delta || 0
              const vega = data.greeks?.vega || 0
              const theta = data.greeks?.theta || 0 // Use Polygon's theta directly
              let vanna = data.greeks?.vanna || 0

              // If vanna is 0 or missing, calculate it using Black-Scholes formula
              if (vanna === 0 && gamma !== 0) {
                const expirationDate = new Date(expDate)
                const today = new Date()
                const T = (expirationDate.getTime() - today.getTime()) / (365 * 24 * 60 * 60 * 1000)
                const iv = data.implied_volatility || 0.3 // Use API IV or default to 30%
                vanna = calculateVanna(strikeNum, currentPrice, T, iv)
              }

              gexByStrikeByExp[expDate][strikeNum].putOI = oi
              gexByStrikeByExp[expDate][strikeNum].putGamma = gamma
              gexByStrikeByExp[expDate][strikeNum].putDelta = delta
              gexByStrikeByExp[expDate][strikeNum].putVanna = vanna
              gexByStrikeByExp[expDate][strikeNum].putTheta = theta
              gexByStrikeByExp[expDate][strikeNum].putVega = vega

              dealerByStrikeByExp[expDate][strikeNum].putOI = oi
              dealerByStrikeByExp[expDate][strikeNum].putGamma = gamma
              dealerByStrikeByExp[expDate][strikeNum].putDelta = delta
              dealerByStrikeByExp[expDate][strikeNum].putVanna = vanna

              // Flow Map: Simple premium-based calculation for puts (no GEX, no Greeks)
              if (!flowGexByStrikeByExp[expDate][strikeNum]) {
                flowGexByStrikeByExp[expDate][strikeNum] = {
                  call: 0,
                  put: 0,
                  callOI: 0,
                  putOI: oi,
                  callVolume: 0,
                  putVolume: 0,
                }
              }

              const putFlowData = flowPremiumByStrike[expDate]?.[strikeNum]
              const putPremium = putFlowData?.putPremium || 0
              const putContracts = putFlowData?.putContracts || 0

              flowGexByStrikeByExp[expDate][strikeNum].put = putPremium // Store premium directly
              flowGexByStrikeByExp[expDate][strikeNum].putOI = oi
              flowGexByStrikeByExp[expDate][strikeNum].putVolume = putContracts // Store contract count

              if (putPremium > 0) {
                // console.log(`💰 FLOW MAP Put: Strike ${strikeNum} = $${putPremium.toFixed(0)} (${putContracts} contracts)`);
              }

              // ALWAYS calculate BOTH formulas
              // 1. NET GEX - Standard formula
              if (gamma) {
                const gex = -gamma * oi * (currentPrice * currentPrice) * 100 // Negative for puts
                gexByStrikeByExp[expDate][strikeNum].put = gex
              }

              // 2. NET DEALER - Enhanced formula
              if (gamma && delta !== undefined && vanna !== undefined) {
                const expirationDate = new Date(expDate)
                const today = new Date()
                const T = Math.max(
                  (expirationDate.getTime() - today.getTime()) / (365 * 24 * 60 * 60 * 1000),
                  0.001
                ) // Min 0.001 to avoid division by zero

                if (T >= 0) {
                  const beta = 0.25
                  const rho_S_sigma = -0.7
                  const contractMult = 100
                  const wT = 1 / Math.sqrt(T)
                  const gammaEff = gamma + beta * vanna * rho_S_sigma
                  const liveWeight = Math.abs(delta) * (1 - Math.abs(delta))
                  const dealerValue = -oi * gammaEff * liveWeight * wT * currentPrice * contractMult
                  dealerByStrikeByExp[expDate][strikeNum].put = dealerValue
                }
              }

              // STEP 2C: Update VEX with put data
              if (!vexByStrikeByExp[expDate][strikeNum]) {
                vexByStrikeByExp[expDate][strikeNum] = {
                  call: 0,
                  put: 0,
                  callOI: 0,
                  putOI: 0,
                  callVega: 0,
                  putVega: 0,
                }
              }
              vexByStrikeByExp[expDate][strikeNum].putOI = oi
              vexByStrikeByExp[expDate][strikeNum].putVega = vega // Store vega for recalculation
              if (vega) {
                // Professional VEX Formula (Goldman Sachs style):
                // VEX = -Vega × OI × Spot × 100 × Moneyness_Weight × Time_Weight

                const expirationDate = new Date(expDate)
                const today = new Date()
                const T = (expirationDate.getTime() - today.getTime()) / (365 * 24 * 60 * 60 * 1000)

                // Moneyness weight: ATM options have highest vega sensitivity
                const moneyness = strikeNum / currentPrice
                const moneynessWeight = Math.exp(-Math.pow(Math.log(moneyness), 2) / 0.5) // Gaussian centered at ATM

                // Time weight: Vega is highest for longer-dated options
                const timeWeight = T > 0 ? Math.sqrt(T) * (1 + 0.5 / Math.max(T, 0.01)) : 0

                // Professional VEX with proper notional scaling (negative for puts)
                const vex = -vega * oi * currentPrice * 100 * moneynessWeight * timeWeight

                vexByStrikeByExp[expDate][strikeNum].put = vex
              }

              allStrikes.add(strikeNum)
            }
          })
        })

        // Update progress and yield to browser - FORCE UI UPDATE EVERY BATCH
        const prog = 25 + Math.round((batchEnd / allAvailableExpirations.length) * 65)
        setProgress(prog)

        // Always yield to UI for progress updates
        await new Promise((resolve) => setTimeout(resolve, 0))
      }

      setProgress(92)
      await new Promise((resolve) => setTimeout(resolve, 0)) // Force UI update

      // ALWAYS store ALL calculations - we calculated both formulas simultaneously

      // Store both calculations - they were computed in parallel
      setGexByStrikeByExpiration(gexByStrikeByExp)
      setDealerByStrikeByExpiration(dealerByStrikeByExp)

      // If NOT in live mode, also save as base (original) data
      if (!liveOIMapOverride) {
        setBaseGexByStrikeByExpiration(gexByStrikeByExp)
        setBaseDealerByStrikeByExpiration(dealerByStrikeByExp)
      }

      setFlowGexByStrikeByExpiration(flowGexByStrikeByExp)
      setProgress(87)
      await new Promise((resolve) => setTimeout(resolve, 0)) // Force UI update

      setVexByStrikeByExpiration(vexByStrikeByExp)
      setProgress(90)
      await new Promise((resolve) => setTimeout(resolve, 0)) // Force UI update

      setProgress(95)
      await new Promise((resolve) => setTimeout(resolve, 0)) // Force UI update

      // Format and display data - store ALL strikes, filter at render time
      const relevantStrikes = Array.from(allStrikes).sort((a, b) => b - a)

      const formattedData = relevantStrikes.map((strike) => {
        const row: GEXData = { strike }
        allAvailableExpirations.forEach((exp) => {
          const data = gexByStrikeByExp[exp]?.[strike] || { call: 0, put: 0, callOI: 0, putOI: 0 }
          const flowData = flowGexByStrikeByExp[exp]?.[strike] || {
            call: 0,
            put: 0,
            callOI: 0,
            putOI: 0,
            callVolume: 0,
            putVolume: 0,
          }
          const vexData = vexByStrikeByExp[exp]?.[strike] || {
            call: 0,
            put: 0,
            callOI: 0,
            putOI: 0,
          }

          // DEBUG: Log flow data for first few strikes
          if (relevantStrikes.indexOf(strike) < 3 && (flowData.call !== 0 || flowData.put !== 0)) {
          }

          row[exp] = {
            call: data.call,
            put: data.put,
            net: data.call + data.put,
            callOI: data.callOI,
            putOI: data.putOI,
            flowCall: flowData.call,
            flowPut: flowData.put,
            flowNet: flowData.call - flowData.put, // Net = Calls premium - Puts premium (positive = bullish)
            callVex: vexData.call,
            putVex: vexData.put,
          }
        })
        return row
      })

      setData(formattedData)
      setProgress(100)
      setLoading(false)

      // If this was triggered by Live OI, hide that loading state too
      if (liveOIMapOverride) {
        setLiveOILoading(false)
        setLiveOIProgress(100)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setLoading(false)

      // Also hide Live OI loading on error
      if (liveOIMapOverride) {
        setLiveOILoading(false)
        setLiveOIProgress(0)
      }
    }
  }

  // Auto-trigger data fetch when ticker or flow mode changes
  useEffect(() => {
    if (selectedTicker && showFlowGEX && !liveMode) {
      // Flow Map enabled and not in live mode yet - trigger live scan
      setLiveMode(true)
      updateLiveOI()
    } else if (selectedTicker && liveMode) {
      // Ticker changed while live mode is already on — fetch fresh base data first, then live scan
      setLiveOIData(new Map())
      fetchOptionsData().then(() => updateLiveOI())
    } else if (selectedTicker && !showFlowGEX && !liveMode) {
      // Normal fetch
      fetchOptionsData()
    }
  }, [selectedTicker, showFlowGEX])

  // Memoize GEX calculated data (always uses Net GEX formula)
  const allGEXCalculatedData = useMemo(() => {
    const gexData = gexByStrikeByExpiration
    const willUseLiveData = liveMode && liveOIData.size > 0

    if (!gexData || Object.keys(gexData).length === 0) {
      return []
    }

    const allStrikes = Array.from(
      new Set([...Object.values(gexData).flatMap((exp) => Object.keys(exp).map(Number))])
    ).sort((a, b) => b - a)

    return allStrikes.map((strike) => {
      const row: GEXData = { strike }
      expirations.forEach((exp) => {
        const greeksData = gexData[exp]?.[strike] || {
          call: 0,
          put: 0,
          callOI: 0,
          putOI: 0,
          callGamma: undefined,
          putGamma: undefined,
        }

        let callGEX = greeksData.call
        let putGEX = greeksData.put
        let callOI = greeksData.callOI
        let putOI = greeksData.putOI

        // Apply Live OI recalculations if active (Net GEX formula)
        if (liveMode && liveOIData.size > 0) {
          const callKey = `${selectedTicker}_${strike}_call_${exp}`
          const putKey = `${selectedTicker}_${strike}_put_${exp}`

          const liveCallOI = liveOIData.get(callKey)
          const livePutOI = liveOIData.get(putKey)

          if (liveCallOI !== undefined && greeksData.callGamma) {
            callOI = liveCallOI
            callGEX = greeksData.callGamma * liveCallOI * (currentPrice * currentPrice) * 100
          }

          if (livePutOI !== undefined && greeksData.putGamma) {
            putOI = livePutOI
            putGEX = -greeksData.putGamma * livePutOI * (currentPrice * currentPrice) * 100
          }
        }

        row[exp] = {
          call: callGEX,
          put: putGEX,
          net: callGEX + putGEX,
          callOI: callOI,
          putOI: putOI,
        }
      })
      return row
    })
  }, [gexByStrikeByExpiration, currentPrice, expirations, liveMode, selectedTicker, liveOIData])

  // Memoize Dealer calculated data (always uses Net Dealer formula)
  const allDealerCalculatedData = useMemo(() => {
    const dealerData = dealerByStrikeByExpiration
    const willUseLiveData = liveMode && liveOIData.size > 0

    if (!dealerData || Object.keys(dealerData).length === 0) {
      return []
    }

    const allStrikes = Array.from(
      new Set([...Object.values(dealerData).flatMap((exp) => Object.keys(exp).map(Number))])
    ).sort((a, b) => b - a)

    return allStrikes.map((strike) => {
      const row: GEXData = { strike }
      expirations.forEach((exp) => {
        const greeksData = dealerData[exp]?.[strike] || {
          call: 0,
          put: 0,
          callOI: 0,
          putOI: 0,
          callGamma: undefined,
          putGamma: undefined,
          callDelta: undefined,
          putDelta: undefined,
          callVanna: undefined,
          putVanna: undefined,
        }

        let callDealer = greeksData.call
        let putDealer = greeksData.put
        let callOI = greeksData.callOI
        let putOI = greeksData.putOI

        // Apply Live OI recalculations if active (Net Dealer formula)
        if (liveMode && liveOIData.size > 0) {
          const callKey = `${selectedTicker}_${strike}_call_${exp}`
          const putKey = `${selectedTicker}_${strike}_put_${exp}`

          const liveCallOI = liveOIData.get(callKey)
          const livePutOI = liveOIData.get(putKey)

          const expirationDate = new Date(exp + 'T00:00:00Z')
          const today = new Date()
          const T = (expirationDate.getTime() - today.getTime()) / (365 * 24 * 60 * 60 * 1000)

          if (
            liveCallOI !== undefined &&
            greeksData.callGamma &&
            greeksData.callDelta !== undefined &&
            greeksData.callVanna !== undefined &&
            T > 0
          ) {
            callOI = liveCallOI
            const beta = 0.25
            const rho_S_sigma = -0.7
            const contractMult = 100
            const wT = 1 / Math.sqrt(T)
            const gammaEff = greeksData.callGamma + beta * greeksData.callVanna * rho_S_sigma
            const liveWeight = Math.abs(greeksData.callDelta) * (1 - Math.abs(greeksData.callDelta))
            callDealer = liveCallOI * gammaEff * liveWeight * wT * currentPrice * contractMult
          }

          if (
            livePutOI !== undefined &&
            greeksData.putGamma &&
            greeksData.putDelta !== undefined &&
            greeksData.putVanna !== undefined &&
            T > 0
          ) {
            putOI = livePutOI
            const beta = 0.25
            const rho_S_sigma = -0.7
            const contractMult = 100
            const wT = 1 / Math.sqrt(T)
            const gammaEff = greeksData.putGamma + beta * greeksData.putVanna * rho_S_sigma
            const liveWeight = Math.abs(greeksData.putDelta) * (1 - Math.abs(greeksData.putDelta))
            putDealer = -livePutOI * gammaEff * liveWeight * wT * currentPrice * contractMult
          }
        }

        row[exp] = {
          call: callDealer,
          put: putDealer,
          net: callDealer + putDealer,
          callOI: callOI,
          putOI: putOI,
        }
      })
      return row
    })
  }, [dealerByStrikeByExpiration, currentPrice, expirations, liveMode, selectedTicker, liveOIData])

  // Flow-weighted Dealer data: base dealer GEX (70%) blended with live dealer GEX (30%)
  // The fresh OI change from live flow is weighted 30% — prominent but not overriding the base position.
  // When not yet in live mode (base === live), result equals standard dealer values.
  const allFlowWeightedDealerData = useMemo(() => {
    const baseData = baseDealerByStrikeByExpiration
    const liveData = dealerByStrikeByExpiration

    const hasLiveData = liveData && Object.keys(liveData).length > 0
    if (!hasLiveData) return []

    // If base data not yet captured (first load, live never triggered), treat base == live → result is pure dealer
    const effectiveBase = baseData && Object.keys(baseData).length > 0 ? baseData : liveData

    const allStrikes = Array.from(
      new Set([
        ...Object.values(liveData).flatMap((exp) => Object.keys(exp).map(Number)),
        ...Object.values(effectiveBase).flatMap((exp) => Object.keys(exp).map(Number)),
      ])
    ).sort((a, b) => b - a)

    return allStrikes.map((strike) => {
      const row: GEXData = { strike }
      expirations.forEach((exp) => {
        const base = effectiveBase[exp]?.[strike] || { call: 0, put: 0, callOI: 0, putOI: 0 }
        const live = liveData[exp]?.[strike] || { call: 0, put: 0, callOI: 0, putOI: 0 }

        // 70% base dealer GEX + 30% live dealer GEX
        const weightedCall = (base.call || 0) * 0.7 + (live.call || 0) * 0.3
        const weightedPut = (base.put || 0) * 0.7 + (live.put || 0) * 0.3

        row[exp] = {
          call: weightedCall,
          put: weightedPut,
          net: weightedCall + weightedPut,
          callOI: live.callOI || base.callOI || 0,
          putOI: live.putOI || base.putOI || 0,
        }
      })
      return row
    })
  }, [baseDealerByStrikeByExpiration, dealerByStrikeByExpiration, expirations])

  // Keep original allCalculatedData for backwards compatibility (uses gexMode to switch)
  const allCalculatedData = useMemo(() => {
    // Choose data source based on current mode
    const dealerData = dealerByStrikeByExpiration
    const gexData = gexByStrikeByExpiration

    // Use the correct data source based on gexMode
    const baseDataSource = gexMode === 'Net Dealer' ? dealerData : gexData

    const willUseLiveData = liveMode && liveOIData.size > 0

    if (!baseDataSource || Object.keys(baseDataSource).length === 0) {
      return []
    }

    const allStrikes = Array.from(
      new Set([...Object.values(baseDataSource).flatMap((exp) => Object.keys(exp).map(Number))])
    ).sort((a, b) => b - a)

    return allStrikes.map((strike) => {
      const row: GEXData = { strike }
      expirations.forEach((exp) => {
        const greeksData: {
          call: number
          put: number
          callOI: number
          putOI: number
          callGamma?: number
          putGamma?: number
          callDelta?: number
          putDelta?: number
          callVanna?: number
          putVanna?: number
          callVega?: number
          putVega?: number
          callTheta?: number
          putTheta?: number
        } = baseDataSource[exp]?.[strike] || {
          call: 0,
          put: 0,
          callOI: 0,
          putOI: 0,
          callGamma: undefined,
          putGamma: undefined,
          callDelta: undefined,
          putDelta: undefined,
          callVanna: undefined,
          putVanna: undefined,
          callVega: undefined,
          putVega: undefined,
          callTheta: undefined,
          putTheta: undefined,
        }
        const vexData: {
          call: number
          put: number
          callOI: number
          putOI: number
          callVega?: number
          putVega?: number
        } = vexByStrikeByExpiration[exp]?.[strike] || {
          call: 0,
          put: 0,
          callOI: 0,
          putOI: 0,
          callVega: undefined,
          putVega: undefined,
        }

        // Start with base calculated values
        let callGEX = greeksData.call
        let putGEX = greeksData.put
        let callOI = greeksData.callOI
        let putOI = greeksData.putOI
        let callVEX = vexData.call
        let putVEX = vexData.put

        // Apply Live OI recalculations if active
        if (liveMode && liveOIData.size > 0) {
          const callKey = `${selectedTicker}_${strike}_call_${exp}`
          const putKey = `${selectedTicker}_${strike}_put_${exp}`

          const liveCallOI = liveOIData.get(callKey)
          const livePutOI = liveOIData.get(putKey)

          const expirationDate = new Date(exp + 'T00:00:00Z')
          const today = new Date()
          const T = (expirationDate.getTime() - today.getTime()) / (365 * 24 * 60 * 60 * 1000)

          // Recalculate based on the current mode
          if (gexMode === 'Net Dealer') {
            // Use dealer formula for live recalc
            // console.log(`🔄 LIVE OI RECALC - NET DEALER MODE: Strike ${strike}, Exp ${exp}`);
            if (
              liveCallOI !== undefined &&
              greeksData.callGamma &&
              greeksData.callDelta !== undefined &&
              greeksData.callVanna !== undefined &&
              T > 0
            ) {
              callOI = liveCallOI
              const beta = 0.25
              const rho_S_sigma = -0.7
              const contractMult = 100
              const wT = 1 / Math.sqrt(T)
              const gammaEff = greeksData.callGamma + beta * greeksData.callVanna * rho_S_sigma
              const liveWeight =
                Math.abs(greeksData.callDelta) * (1 - Math.abs(greeksData.callDelta))
              callGEX = liveCallOI * gammaEff * liveWeight * wT * currentPrice * contractMult
              // console.log(`  📈 Call: LiveOI ${liveCallOI} × gammaEff ${gammaEff.toFixed(6)} × liveWeight ${liveWeight.toFixed(4)} = ${callGEX.toFixed(2)}`);
            }

            if (
              livePutOI !== undefined &&
              greeksData.putGamma &&
              greeksData.putDelta !== undefined &&
              greeksData.putVanna !== undefined &&
              T > 0
            ) {
              putOI = livePutOI
              const beta = 0.25
              const rho_S_sigma = -0.7
              const contractMult = 100
              const wT = 1 / Math.sqrt(T)
              const gammaEff = greeksData.putGamma + beta * greeksData.putVanna * rho_S_sigma
              const liveWeight = Math.abs(greeksData.putDelta) * (1 - Math.abs(greeksData.putDelta))
              putGEX = -livePutOI * gammaEff * liveWeight * wT * currentPrice * contractMult
              // console.log(`  📉 Put: LiveOI ${livePutOI} × gammaEff ${gammaEff.toFixed(6)} × liveWeight ${liveWeight.toFixed(4)} = ${putGEX.toFixed(2)}`);
            }
          } else {
            // Use standard GEX formula for live recalc
            // console.log(`🔄 LIVE OI RECALC - NET GEX MODE: Strike ${strike}, Exp ${exp}`);
            if (liveCallOI !== undefined && greeksData.callGamma) {
              callOI = liveCallOI
              callGEX = greeksData.callGamma * liveCallOI * (currentPrice * currentPrice) * 100
              // console.log(`  📈 Call: ${greeksData.callGamma} × ${liveCallOI} × ${currentPrice}² × 100 = ${callGEX.toFixed(2)}`);
            }

            if (livePutOI !== undefined && greeksData.putGamma) {
              putOI = livePutOI
              putGEX = -greeksData.putGamma * livePutOI * (currentPrice * currentPrice) * 100
              // console.log(`  📉 Put: -${greeksData.putGamma} × ${livePutOI} × ${currentPrice}² × 100 = ${putGEX.toFixed(2)}`);
            }
          }

          // Recalculate VEX with Live OI (same for both modes)
          if (liveCallOI !== undefined && vexData.callVega) {
            callVEX = vexData.callVega * liveCallOI * 100
          }

          if (livePutOI !== undefined && vexData.putVega) {
            putVEX = -vexData.putVega * livePutOI * 100
          }
        }

        row[exp] = {
          call: callGEX,
          put: putGEX,
          net: callGEX + putGEX,
          callOI: callOI,
          putOI: putOI,
          callVex: callVEX,
          putVex: putVEX,
        }
      })
      return row
    })
  }, [
    gexByStrikeByExpiration,
    dealerByStrikeByExpiration,
    vexByStrikeByExpiration,
    currentPrice,
    expirations,
    gexMode,
    liveMode,
    selectedTicker,
    liveOIData,
  ])

  const handleTickerSubmit = () => {
    const newTicker = tickerInput.trim().toUpperCase()
    if (newTicker && newTicker !== selectedTicker) {
      setSelectedTicker(newTicker)
      setTickerInput(newTicker) // Ensure input stays synchronized
    }
  }

  // Sync tickerInput with selectedTicker when selectedTicker changes
  useEffect(() => {
    setTickerInput(selectedTicker)
  }, [selectedTicker])

  // Recalculate GEX when historical timestamp changes
  useEffect(() => {
    // Only run if we have a valid historical timestamp
    if (!showHistoricalGEX) return
    if (!historicalTimestamp || !selectedTicker) return
    if (expirations.length === 0) return
    if (Object.keys(baseGexByStrikeByExpiration).length === 0) return // Need base data first

    const recalculateHistoricalGEX = async () => {
      try {
        const apiKey = process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''

        // Fetch ALL options contracts (increase limit to get all expirations)
        const allContracts: any[] = []
        let nextUrl: string | null =
          `https://api.polygon.io/v3/snapshot/options/${selectedTicker}?limit=250&apikey=${apiKey}`

        // Paginate to get all contracts
        while (nextUrl && allContracts.length < 5000) {
          const response: Response = await fetch(nextUrl)
          const data: any = await response.json()

          if (data.status !== 'OK') break
          if (data.results) allContracts.push(...data.results)

          nextUrl = data.next_url
          if (nextUrl && !nextUrl.includes('apikey=')) {
            nextUrl += `&apikey=${apiKey}`
          }

          // Small delay to avoid rate limits
          if (nextUrl) await new Promise((resolve) => setTimeout(resolve, 100))
        }

        // Filter contracts by our expirations
        const contracts = allContracts.filter((c: any) =>
          expirations.includes(c.details?.expiration_date)
        )

        // Build live OI map up to the historical timestamp (only for live mode)
        const liveOIAtTimestamp = new Map<string, number>()
        if (liveMode && flowTradesData.length > 0) {
          // Start with base OI from snapshot
          contracts.forEach((contract: any) => {
            const strike = contract.details?.strike_price
            const expiration = contract.details?.expiration_date
            const isCall = contract.details?.contract_type === 'call'
            if (!strike || !expiration) return

            const contractKey = `${selectedTicker}_${strike}_${isCall ? 'call' : 'put'}_${expiration}`
            liveOIAtTimestamp.set(contractKey, contract.open_interest || 0)
          })

          // Apply trades that occurred at or before the historical timestamp
          const sortedTrades = [...flowTradesData].sort(
            (a, b) => new Date(a.trade_timestamp).getTime() - new Date(b.trade_timestamp).getTime()
          )

          sortedTrades.forEach((trade) => {
            const tradeTime = new Date(trade.trade_timestamp).getTime()
            if (tradeTime > historicalTimestamp) return // Skip future trades

            const contractKey = `${trade.underlying_ticker}_${trade.strike}_${trade.type}_${trade.expiry}`
            const currentOI = liveOIAtTimestamp.get(contractKey) || 0
            const contracts = trade.trade_size || 0

            // Aggressive opening (AA, A, BB) adds to OI, closing (B) subtracts
            if (
              trade.fill_style === 'AA' ||
              trade.fill_style === 'A' ||
              trade.fill_style === 'BB'
            ) {
              liveOIAtTimestamp.set(contractKey, currentOI + contracts)
            } else if (trade.fill_style === 'B') {
              liveOIAtTimestamp.set(contractKey, Math.max(0, currentOI - contracts))
            }
          })
        }

        // Recalculate GEX at historical price using Black-Scholes
        const newGEXData: typeof gexByStrikeByExpiration = {}
        const newDealerData: typeof dealerByStrikeByExpiration = {}

        expirations.forEach((exp) => {
          newGEXData[exp] = {}
          newDealerData[exp] = {}
        })

        const today = new Date()

        contracts.forEach((contract: any) => {
          const strike = contract.details?.strike_price
          const expiration = contract.details?.expiration_date
          const isCall = contract.details?.contract_type === 'call'

          if (!strike || !expiration || !expirations.includes(expiration)) return

          // Use live OI if in live mode, otherwise use snapshot OI
          let OI = contract.open_interest || 0
          if (liveMode && flowTradesData.length > 0) {
            const contractKey = `${selectedTicker}_${strike}_${isCall ? 'call' : 'put'}_${expiration}`
            OI = liveOIAtTimestamp.get(contractKey) || OI
          }

          const IV = contract.implied_volatility || 0.3 // Default 30% if missing

          // Calculate time to expiration for THIS specific expiration
          const expirationDate = new Date(expiration)
          const T = Math.max(
            (expirationDate.getTime() - today.getTime()) / (365 * 24 * 60 * 60 * 1000),
            0.001
          )

          // Black-Scholes Gamma calculation
          const S = historicalPrice
          const K = strike
          const r = 0.05

          const d1 = (Math.log(S / K) + (r + 0.5 * IV * IV) * T) / (IV * Math.sqrt(T))
          const nPrimeD1 = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * d1 * d1)
          const gamma = nPrimeD1 / (S * IV * Math.sqrt(T))

          // Calculate Delta
          const normalCDF = (x: number) => {
            const t = 1 / (1 + 0.2316419 * Math.abs(x))
            const d = 0.3989423 * Math.exp((-x * x) / 2)
            const p =
              d *
              t *
              (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
            return x > 0 ? 1 - p : p
          }
          const delta = isCall ? normalCDF(d1) : normalCDF(d1) - 1

          // Net GEX formula
          const spotGEX = gamma * OI * S * S * 100 * (isCall ? 1 : -1)

          // Dealer GEX formula
          const gamma_eff = gamma * (isCall ? delta : 1 - Math.abs(delta))
          const dealerGEX = OI * gamma_eff * 1 * 1 * S * 100

          if (!newGEXData[expiration][strike]) {
            newGEXData[expiration][strike] = {
              call: 0,
              put: 0,
              callOI: 0,
              putOI: 0,
              callGamma: 0,
              putGamma: 0,
            }
            newDealerData[expiration][strike] = {
              call: 0,
              put: 0,
              callOI: 0,
              putOI: 0,
              callGamma: 0,
              putGamma: 0,
            }
          }

          if (isCall) {
            newGEXData[expiration][strike].call = spotGEX
            newGEXData[expiration][strike].callOI = OI
            newGEXData[expiration][strike].callGamma = gamma
            newDealerData[expiration][strike].call = dealerGEX
            newDealerData[expiration][strike].callOI = OI
            newDealerData[expiration][strike].callGamma = gamma
          } else {
            newGEXData[expiration][strike].put = spotGEX
            newGEXData[expiration][strike].putOI = OI
            newGEXData[expiration][strike].putGamma = gamma
            newDealerData[expiration][strike].put = dealerGEX
            newDealerData[expiration][strike].putOI = OI
            newDealerData[expiration][strike].putGamma = gamma
          }
        })

        setGexByStrikeByExpiration(newGEXData)
        setDealerByStrikeByExpiration(newDealerData)
      } catch (error) {
        console.error('Failed to recalculate historical GEX:', error)
      }
    }

    recalculateHistoricalGEX()
  }, [historicalTimestamp, historicalPrice, liveMode, flowTradesData])

  // Reset to base data when HIST GEX is turned off or timestamp is null
  useEffect(() => {
    if (!showHistoricalGEX || historicalTimestamp === null) {
      if (Object.keys(baseGexByStrikeByExpiration).length > 0) {
        setGexByStrikeByExpiration(baseGexByStrikeByExpiration)
        setDealerByStrikeByExpiration(baseDealerByStrikeByExpiration)
      }
    }
  }, [showHistoricalGEX, historicalTimestamp])

  const formatCurrency = (value: number) => {
    const absValue = Math.abs(value)
    const sign = value < 0 ? '-' : value > 0 ? '+' : ''

    // Original GEX formatting (always used for middle line)
    if (absValue >= 1e9) {
      return `${sign}${(absValue / 1e9).toFixed(2)}B`
    } else if (absValue >= 1e6) {
      return `${sign}${(absValue / 1e6).toFixed(1)}M`
    } else if (absValue >= 1000) {
      return `${sign}${(absValue / 1000).toFixed(1)}K`
    } else if (absValue > 0) {
      return `${sign}${absValue.toFixed(0)}`
    }
    return '0'
  }

  const formatPremium = (value: number) => {
    const absValue = Math.abs(value)
    const sign = value < 0 ? '-' : value > 0 ? '+' : ''

    // Smart premium formatting with $ prefix
    if (absValue >= 1e9) {
      // Billions: $1B, $4.32B
      const billions = absValue / 1e9
      if (billions >= 10) {
        return `${sign}$${billions.toFixed(2)}B`
      } else {
        return `${sign}$${billions % 1 === 0 ? billions.toFixed(0) : billions.toFixed(2)}B`
      }
    } else if (absValue >= 1e6) {
      // Millions: $1M, $1.34M, $12.32M, $124.42M
      const millions = absValue / 1e6
      if (millions >= 100) {
        return `${sign}$${millions.toFixed(2)}M`
      } else if (millions >= 10) {
        return `${sign}$${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(2)}M`
      } else {
        return `${sign}$${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(2)}M`
      }
    } else if (absValue >= 1000) {
      // Thousands: $1K, $1.2K, $13.4K, $104.4K
      const thousands = absValue / 1000
      if (thousands >= 100) {
        return `${sign}$${thousands.toFixed(1)}K`
      } else if (thousands >= 10) {
        return `${sign}$${thousands % 1 === 0 ? thousands.toFixed(0) : thousands.toFixed(1)}K`
      } else {
        return `${sign}$${thousands % 1 === 0 ? thousands.toFixed(0) : thousands.toFixed(1)}K`
      }
    } else if (absValue >= 500) {
      // 500-999: $0.5K
      return `${sign}$${(absValue / 1000).toFixed(1)}K`
    } else if (absValue > 0) {
      return `${sign}$${absValue.toFixed(0)}`
    }
    return '$0'
  }

  const formatOI = (value: number) => {
    return value.toLocaleString('en-US')
  }

  // MEMOIZED: Top values calculated from ALL strikes (unfiltered by OTM range)
  // This ensures highlighting is based on absolute highest values across complete chain
  // Helper function to calculate top values from strike/expiration map
  const calculateTopValuesFromMap = (dataMap: {
    [exp: string]: { [strike: number]: { call: number; put: number } }
  }) => {
    const positiveValues: number[] = []
    const negativeValues: number[] = []

    Object.keys(dataMap).forEach((exp) => {
      Object.keys(dataMap[exp]).forEach((strikeStr) => {
        const strikeData = dataMap[exp][parseFloat(strikeStr)]
        if (strikeData) {
          const displayValue = (strikeData.call || 0) + (strikeData.put || 0)
          if (displayValue > 0) {
            positiveValues.push(displayValue)
          } else if (displayValue < 0) {
            negativeValues.push(Math.abs(displayValue))
          }
        }
      })
    })

    const sortedPositive = positiveValues.sort((a, b) => b - a)
    const sortedNegative = negativeValues.sort((a, b) => b - a)

    return {
      highestPositive: sortedPositive[0] || 0,
      highestNegative: sortedNegative[0] || 0,
      highest: sortedPositive[0] || 0,
      second: sortedPositive[1] || 0,
      third: sortedPositive[2] || 0,
      fourth: sortedPositive[3] || 0,
      top10: sortedPositive.slice(0, 10),
      top5Positive: sortedPositive.slice(0, 10),
      top5Negative: sortedNegative.slice(0, 5),
    }
  }

  // Helper function to calculate top values for a specific data set
  const calculateTopValues = (
    sourceData: any[],
    mode: 'gex' | 'dealer' | 'flow' | 'vex',
    currentGexMode?: string,
    currentVexMode?: string
  ) => {
    if (sourceData.length === 0) {
      return {
        highestPositive: 0,
        highestNegative: 0,
        highest: 0,
        second: 0,
        third: 0,
        fourth: 0,
        top10: [],
        top5Positive: [],
        top5Negative: [],
      }
    }

    const positiveValues: number[] = []
    const negativeValues: number[] = []

    // Read from sourceData and collect positive and negative values separately
    sourceData.forEach((row) => {
      Object.keys(row).forEach((key) => {
        if (key === 'strike') return

        const cellData = row[key]
        if (!cellData || typeof cellData === 'number') return

        // Collect Flow GEX values
        if (mode === 'flow') {
          const flowNet = cellData.flowNet || 0
          if (flowNet > 0) positiveValues.push(flowNet)
          else if (flowNet < 0) negativeValues.push(Math.abs(flowNet))
        }
        // Collect GEX/Dealer values
        else if (mode === 'gex' || mode === 'dealer') {
          if (currentGexMode === 'Net GEX' || currentGexMode === 'Net Dealer') {
            const netGex = cellData.net || 0
            if (netGex > 0) positiveValues.push(netGex)
            else if (netGex < 0) negativeValues.push(Math.abs(netGex))
          } else {
            const callGex = cellData.call || 0
            const putGex = cellData.put || 0
            if (callGex > 0) positiveValues.push(callGex)
            else if (callGex < 0) negativeValues.push(Math.abs(callGex))
            if (putGex > 0) positiveValues.push(putGex)
            else if (putGex < 0) negativeValues.push(Math.abs(putGex))
          }
        }
        // Collect VEX values
        else if (mode === 'vex') {
          if (currentVexMode === 'Net VEX') {
            const netVex = (cellData.callVex || 0) + (cellData.putVex || 0)
            if (netVex > 0) positiveValues.push(netVex)
            else if (netVex < 0) negativeValues.push(Math.abs(netVex))
          } else {
            const callVex = cellData.callVex || 0
            const putVex = cellData.putVex || 0
            if (callVex > 0) positiveValues.push(callVex)
            else if (callVex < 0) negativeValues.push(Math.abs(callVex))
            if (putVex > 0) positiveValues.push(putVex)
            else if (putVex < 0) negativeValues.push(Math.abs(putVex))
          }
        }
      })
    })

    // Sort positive and negative values separately (highest to lowest)
    const sortedPositive = positiveValues.sort((a, b) => b - a)
    const sortedNegative = negativeValues.sort((a, b) => b - a)

    return {
      highestPositive: sortedPositive[0] || 0,
      highestNegative: sortedNegative[0] || 0,
      highest: sortedPositive[0] || 0,
      second: sortedPositive[1] || 0,
      third: sortedPositive[2] || 0,
      fourth: sortedPositive[3] || 0,
      top10: sortedPositive.slice(0, 10),
      top5Positive: sortedPositive.slice(0, 10),
      top5Negative: sortedNegative.slice(0, 5),
    }
  }

  // Calculate separate top values for each mode
  // Always use allCalculatedData since the tables always render from these arrays
  // (they already have live OI applied when liveMode is active)
  const gexTopValues = useMemo(() => {
    return calculateTopValues(allGEXCalculatedData, 'gex', 'Net GEX')
  }, [allGEXCalculatedData])

  const setDealerZone = useDealerZonesStore((s) => s.setZone)

  const dealerTopValues = useMemo(() => {
    const tv = calculateTopValues(allDealerCalculatedData, 'dealer', 'Net Dealer')

    // ── DEALER ATTRACTION MAIN TABLE DEBUG ───────────────────────────────────
    if (allDealerCalculatedData.length > 0) {
      // Find which strike+expiry is yellow (highest positive net dealer)
      let yellowStrike: number | null = null
      let yellowExp: string | null = null
      let yellowVal = -Infinity
      // Find which strike+expiry is purple (highest negative net dealer)
      let purpleStrike: number | null = null
      let purpleExp: string | null = null
      let purpleVal = Infinity

      allDealerCalculatedData.forEach((row: any) => {
        Object.keys(row).forEach((key) => {
          if (key === 'strike') return
          const cell = row[key]
          if (!cell || typeof cell !== 'object') return
          const net = (cell.call || 0) + (cell.put || 0)
          if (net > yellowVal) {
            yellowVal = net
            yellowStrike = row.strike
            yellowExp = key
          }
          if (net < purpleVal) {
            purpleVal = net
            purpleStrike = row.strike
            purpleExp = key
          }
        })
      })

      // Top 20 rows by |net| summed across all expirations
      const strikeNets = allDealerCalculatedData
        .map((row: any) => {
          let totalNet = 0
          Object.keys(row).forEach((key) => {
            if (key === 'strike') return
            const cell = row[key]
            if (cell && typeof cell === 'object') totalNet += (cell.call || 0) + (cell.put || 0)
          })
          return { strike: row.strike, totalNet }
        })
        .sort((a: any, b: any) => Math.abs(b.totalNet) - Math.abs(a.totalNet))

      // ── Write to global store so OptionsFlowTable can read identical values ──────
      const willUseLiveData = liveMode && liveOIData.size > 0
      setDealerZone(selectedTicker, {
        golden: yellowStrike,
        purple: purpleStrike,
        atmIV: null, // computed separately; will be overwritten by the API if needed
        goldenDetail:
          yellowStrike != null
            ? { strike: yellowStrike, expiry: yellowExp ?? '', net: yellowVal }
            : null,
        purpleDetail:
          purpleStrike != null
            ? { strike: purpleStrike, expiry: purpleExp ?? '', net: purpleVal }
            : null,
        isLive: willUseLiveData,
      })
      // ──────────────────────────────────────────────────────────────────────────────
    }
    // ─────────────────────────────────────────────────────────────────────────

    return tv
  }, [allDealerCalculatedData, expirations, selectedTicker, liveMode, liveOIData, setDealerZone])

  const flowTopValues = useMemo(
    () => calculateTopValues(allFlowWeightedDealerData, 'dealer', 'Net Dealer'),
    [allFlowWeightedDealerData]
  )

  const loadingQuoteRef = useRef(
    (() => {
      const q = MARKET_QUOTES[Math.floor(Math.random() * MARKET_QUOTES.length)]
      const body = q.includes(' — ') ? q.split(' — ')[0] : q
      const author = q.includes(' — ') ? '— ' + q.split(' — ')[1] : ''
      return { body, author }
    })()
  )
  const loadingQuote = loadingQuoteRef.current

  const liveLoadingQuoteRef = useRef(LIVE_QUOTES[Math.floor(Math.random() * LIVE_QUOTES.length)])
  const liveLoadingQuote = { body: liveLoadingQuoteRef.current, author: '' }

  // Legacy topValues for backward compatibility (uses first active mode)
  const topValues = useMemo(() => {
    if (showFlowGEX) return flowTopValues
    if (showDealer) return dealerTopValues
    if (showGEX) return gexTopValues
    return gexTopValues
  }, [showFlowGEX, showDealer, showGEX, flowTopValues, dealerTopValues, gexTopValues])

  // Detect clusters of high GEX values (top 3 if in same column AND consecutive strikes)
  const detectGEXClusters = useMemo(() => {
    const gexClusters = new Map<
      string,
      { color: 'green' | 'red'; cells: { strike: number; exp: string }[] }
    >()
    const dealerClusters = new Map<
      string,
      { color: 'green' | 'red'; cells: { strike: number; exp: string }[] }
    >()

    // Function to detect clusters in a dataset
    const findClusters = (
      calculatedData: any[],
      clusterMap: Map<string, { color: 'green' | 'red'; cells: { strike: number; exp: string }[] }>
    ) => {
      if (!calculatedData || calculatedData.length === 0) return

      // Collect ALL values across ALL expirations with their strike and expiration
      const allPositiveValues: { strike: number; exp: string; value: number }[] = []
      const allNegativeValues: { strike: number; exp: string; value: number }[] = []

      calculatedData.forEach((row) => {
        Object.keys(row).forEach((key) => {
          if (key !== 'strike') {
            const exp = key
            const expData = row[exp] as any
            if (expData) {
              const value = (expData.call || 0) + (expData.put || 0)
              if (value > 0) {
                allPositiveValues.push({ strike: row.strike, exp, value })
              } else if (value < 0) {
                allNegativeValues.push({ strike: row.strike, exp, value })
              }
            }
          }
        })
      })

      // Get ONLY the top 3 positive and negative (sorted by absolute highest values)
      const sortedPositive = allPositiveValues.sort((a, b) => b.value - a.value)
      const sortedNegative = allNegativeValues.sort((a, b) => a.value - b.value)

      // Take EXACTLY the top 3 - no more, no less
      const top3Positive = sortedPositive.slice(0, 3)
      const top3Negative = sortedNegative.slice(0, 3)

      // POSITIVE: Check if the absolute top 3 highest positive GEX values are in same column AND consecutive strikes
      if (top3Positive.length === 3) {
        const expirations = top3Positive.map((v) => v.exp)
        const uniqueExps = new Set(expirations)

        if (uniqueExps.size === 1) {
          // All in same column - now check if strikes are ACTUALLY consecutive in the strike ladder
          const targetExp = top3Positive[0].exp
          const strikes = top3Positive.map((v) => v.strike).sort((a, b) => b - a) // Sort descending

          // Get ALL strikes available in this expiration from the dataset (include ALL strikes)
          const allStrikesInExp: number[] = []
          calculatedData.forEach((row) => {
            const expData = row[targetExp] as any
            if (expData) {
              // Include ALL strikes in the ladder, even those with zero GEX
              allStrikesInExp.push(row.strike)
            }
          })
          allStrikesInExp.sort((a, b) => b - a) // Sort descending

          // Find indices of our top 3 strikes in the full strike ladder
          const indices = strikes.map((s) => allStrikesInExp.indexOf(s))

          // Check if they are consecutive indices (0,1,2 or 5,6,7, etc.)
          if (indices.length === 3 && indices.every((i) => i !== -1)) {
            indices.sort((a, b) => a - b)
            if (indices[1] === indices[0] + 1 && indices[2] === indices[1] + 1) {
              // Consecutive strikes! Mark all 3 for blue border
              top3Positive.forEach((v) => {
                const key = `${v.strike}-${v.exp}`
                clusterMap.set(key, {
                  color: 'green',
                  cells: top3Positive.map((p) => ({ strike: p.strike, exp: p.exp })),
                })
              })
            }
          }
        }
      }

      // NEGATIVE: Check if the absolute top 3 highest negative GEX values are in same column AND consecutive strikes
      if (top3Negative.length === 3) {
        const expirations = top3Negative.map((v) => v.exp)
        const uniqueExps = new Set(expirations)

        if (uniqueExps.size === 1) {
          // All in same column - now check if strikes are ACTUALLY consecutive in the strike ladder
          const targetExp = top3Negative[0].exp
          const strikes = top3Negative.map((v) => v.strike).sort((a, b) => b - a) // Sort descending

          // Get ALL strikes available in this expiration from the dataset (include ALL strikes)
          const allStrikesInExp: number[] = []
          calculatedData.forEach((row) => {
            const expData = row[targetExp] as any
            if (expData) {
              // Include ALL strikes in the ladder, even those with zero GEX
              allStrikesInExp.push(row.strike)
            }
          })
          allStrikesInExp.sort((a, b) => b - a) // Sort descending

          // Find indices of our top 3 strikes in the full strike ladder
          const indices = strikes.map((s) => allStrikesInExp.indexOf(s))

          // Check if they are consecutive indices (0,1,2 or 5,6,7, etc.)
          if (indices.length === 3 && indices.every((i) => i !== -1)) {
            indices.sort((a, b) => a - b)
            if (indices[1] === indices[0] + 1 && indices[2] === indices[1] + 1) {
              // Consecutive strikes! Mark all 3 for blue border
              top3Negative.forEach((v) => {
                const key = `${v.strike}-${v.exp}`
                clusterMap.set(key, {
                  color: 'red',
                  cells: top3Negative.map((n) => ({ strike: n.strike, exp: n.exp })),
                })
              })
            }
          }
        }
      }
    }

    // Detect clusters in GEX (NORMAL) data
    findClusters(allGEXCalculatedData, gexClusters)

    // Detect clusters in Dealer data
    findClusters(allDealerCalculatedData, dealerClusters)

    return { gex: gexClusters, dealer: dealerClusters }
  }, [allGEXCalculatedData, allDealerCalculatedData])

  const getCellStyle = (
    value: number,
    isVexValue: boolean = false,
    strike?: number,
    exp?: string,
    customTopValues?: any,
    tableType?: 'gex' | 'dealer'
  ): {
    bg: string
    ring: string
    text: string
    clusterPosition?: 'top' | 'middle' | 'bottom' | 'single'
    clusterColor?: 'green' | 'red'
  } => {
    let bgColor = ''
    const ringColor = ''
    const textColor = 'text-white' // Default text color
    let clusterPosition: 'top' | 'middle' | 'bottom' | 'single' | undefined = undefined
    let clusterColor: 'green' | 'red' | undefined = undefined

    // Determine which top values to use
    const topVals = customTopValues || topValues

    // Check if this is the highest positive or highest negative value (with small tolerance for floating point)
    const relativeEpsilon = 0.001
    const isHighestPositive =
      value > 0 &&
      Math.abs(value - topVals.highestPositive) <
        Math.max(Math.abs(topVals.highestPositive) * relativeEpsilon, 0.01)
    const isHighestNegative =
      value < 0 &&
      Math.abs(Math.abs(value) - topVals.highestNegative) <
        Math.max(topVals.highestNegative * relativeEpsilon, 0.01)

    // Bloomberg Terminal Theme
    if (useBloombergTheme) {
      if (isHighestPositive) {
        // Highest positive value - golden box
        bgColor =
          'text-black font-black border-2 border-amber-500 bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 shadow-lg shadow-amber-500/50'
      } else if (isHighestNegative) {
        // Highest negative value - purple box
        bgColor =
          'text-white font-black border-2 border-purple-500 bg-gradient-to-br from-purple-600 via-purple-700 to-purple-800 shadow-lg shadow-purple-500/50'
      } else if (value > 0) {
        // Positive values - green intensity based on value
        const intensity = Math.min(Math.abs(value) / (topVals.highestPositive || 1), 1)
        if (intensity > 0.7) {
          bgColor =
            'text-white border border-emerald-500/60 bg-gradient-to-br from-emerald-900 to-emerald-800'
        } else if (intensity > 0.4) {
          bgColor =
            'text-emerald-300 border border-emerald-600/40 bg-gradient-to-br from-emerald-950 to-black'
        } else {
          bgColor = 'text-emerald-400/80 border border-emerald-700/30 bg-black'
        }
      } else if (value < 0) {
        // Negative values - red intensity based on value
        const intensity = Math.min(Math.abs(value) / (topVals.highestNegative || 1), 1)
        if (intensity > 0.7) {
          bgColor = 'text-white border border-red-500/60 bg-gradient-to-br from-red-900 to-red-800'
        } else if (intensity > 0.4) {
          bgColor = 'text-red-300 border border-red-600/40 bg-gradient-to-br from-red-950 to-black'
        } else {
          bgColor = 'text-red-400/80 border border-red-700/30 bg-black'
        }
      } else {
        bgColor = 'text-gray-600 border border-gray-800/50 bg-black'
      }
    } else {
      // Original Theme (Default)
      if (isHighestPositive) {
        // Highest positive value - golden box
        bgColor =
          'text-black font-black border-2 border-amber-500 bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600'
      } else if (isHighestNegative) {
        // Highest negative value - purple box
        bgColor =
          'text-white font-black border-2 border-purple-500 bg-gradient-to-br from-purple-600 via-purple-700 to-purple-800'
      } else if (value !== 0) {
        bgColor = 'bg-gradient-to-br from-black to-gray-900 text-white border border-gray-700/30'
      } else {
        bgColor = 'bg-gradient-to-br from-gray-950 to-black text-gray-400 border border-gray-800/30'
      }
    }

    // Check if this cell is part of a GEX cluster and determine position in cluster
    if (strike !== undefined && exp !== undefined && tableType) {
      const clusterKey = `${strike}-${exp}`
      const clusterMap = tableType === 'gex' ? detectGEXClusters.gex : detectGEXClusters.dealer
      const clusterInfo = clusterMap.get(clusterKey)

      if (clusterInfo && clusterInfo.cells.length === 3) {
        // Sort cells by strike descending to determine top/middle/bottom
        const sortedCells = [...clusterInfo.cells].sort((a, b) => b.strike - a.strike)
        const currentIndex = sortedCells.findIndex((c) => c.strike === strike)

        if (currentIndex === 0) clusterPosition = 'top'
        else if (currentIndex === 1) clusterPosition = 'middle'

        clusterColor = clusterInfo.color
      }
    }

    return { bg: bgColor, ring: ringColor, text: textColor, clusterPosition, clusterColor }
  }

  const formatDate = (dateStr: string) => {
    // Parse the date string (YYYY-MM-DD format)
    const [year, month, day] = dateStr.split('-')

    // Create a Date object at noon UTC to avoid timezone shifting
    const date = new Date(`${dateStr}T12:00:00Z`)

    // Format the date (removed +1 day offset)
    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ]
    const monthName = monthNames[date.getUTCMonth()]
    const dayNum = date.getUTCDate()
    const yearShort = date.getUTCFullYear().toString().slice(-2)

    return `${monthName} ${dayNum}, ${yearShort}`
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 text-white p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-950/50 border border-red-800/50 rounded-xl p-6 backdrop-blur">
            <div className="flex items-center gap-3 text-red-400">
              <AlertCircle size={24} />
              <div>
                <div className="font-semibold text-lg">Error Loading Data</div>
                <div className="text-sm text-red-300 mt-1">{error}</div>
              </div>
            </div>
            <button
              onClick={() => fetchOptionsData()}
              className="mt-4 px-6 py-3 bg-red-600 hover:bg-red-700 transition-all rounded-lg font-medium"
            >
              Retry Connection
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Dynamic border colors for Bloomberg theme
  const borderColor = useBloombergTheme ? 'border-white/20' : 'border-gray-700'
  const borderColorDivider = useBloombergTheme ? 'border-white/15' : 'border-gray-800'
  const tableBorderColor = useBloombergTheme ? 'border-white/20' : 'border-gray-700'

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 text-white">
      <style>{`
        /* Custom scrollbar styling - Hidden */
        .overflow-x-auto::-webkit-scrollbar,
        .overflow-y-auto::-webkit-scrollbar,
        .overflow-auto::-webkit-scrollbar {
          display: none;
        }
        
        .overflow-x-auto,
        .overflow-y-auto,
        .overflow-auto {
          scrollbar-width: none; /* Firefox */
          -ms-overflow-style: none; /* IE and Edge */
        }
        
        /* Custom scrollbar for tables */
        .table-scroll-container {
          scrollbar-width: thin;
          scrollbar-color: #ff4500 #000000;
        }
        
        .table-scroll-container::-webkit-scrollbar {
          height: 12px;
        }
        
        .table-scroll-container::-webkit-scrollbar-track {
          background: #000000;
          border-radius: 6px;
        }
        
        .table-scroll-container::-webkit-scrollbar-thumb {
          background: #ff4500;
          border-radius: 6px;
        }
        
        .table-scroll-container::-webkit-scrollbar-thumb:hover {
          background: #ff6347;
        }
        
        @media (max-width: 768px) {
          .dealer-attraction-container {
            padding-top: 5px !important;
          }
          
          /* Hide scrollbars on mobile while keeping functionality */
          .table-scroll-container {
            scrollbar-width: none; /* Firefox */
            -ms-overflow-style: none; /* IE and Edge */
          }
          
          .table-scroll-container::-webkit-scrollbar {
            display: none; /* Chrome, Safari, Opera */
          }
        }
        
        /* Bloomberg Terminal Theme Styles */
        .bb-table-header {
          background: linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .bb-header {
          font-family: 'Bloomberg', 'Consolas', 'Monaco', monospace;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        
        .bb-cell {
          font-family: 'Bloomberg', 'Consolas', 'Monaco', monospace;
          transition: all 0.15s ease;
        }
        
        .bb-cell:hover {
          transform: scale(1.02);
          box-shadow: 0 0 8px rgba(255, 255, 255, 0.1);
        }
      `}</style>
      <div
        className="dealer-attraction-container"
        style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}
      >
        <div
          className={`${activeTableCount === 3 ? 'w-full' : 'max-w-[99vw] md:max-w-[99vw]'} px-4 mx-auto`}
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* Bloomberg Terminal Header */}
          <div className="mb-6 bg-black border border-gray-600/40" style={{ flexShrink: 0 }}>
            {/* Control Panel */}
            <div className="bg-black border-y border-gray-800">
              <div className="px-4 md:px-8 pt-1 pb-3 md:py-6">
                {/* Main Tabs */}
                <div className="flex gap-0 w-full mb-2 md:mb-4 relative">
                  <button
                    onClick={() => setActiveTab('ATTRACTION')}
                    className={`flex-1 font-black uppercase tracking-[0.15em] transition-all ${'relative text-orange-500 border-2 border-orange-500 shadow-[0_0_20px_rgba(255,102,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)]'}`}
                    style={{ padding: '14px 16px', fontSize: '14px' }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-b from-orange-500/20 to-transparent"></div>
                    <span className="relative" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                      GREEK SUITE
                    </span>
                  </button>

                  {/* Close Button - Only show when onClose prop exists */}
                  {onClose && (
                    <button
                      onClick={onClose}
                      className="absolute -top-2 -right-2 w-8 h-8 flex items-center justify-center bg-black border-2 border-orange-500 hover:bg-orange-500 hover:text-black text-orange-500 transition-all rounded"
                      style={{ zIndex: 10 }}
                    >
                      <span className="text-xl font-bold leading-none">×</span>
                    </button>
                  )}
                </div>

                {/* Only show these controls for GREEK SUITE tab */}
                {activeTab === 'ATTRACTION' && (
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    {/* Mobile Layout - Single Row */}
                    <div
                      className="md:hidden w-full flex items-center gap-1.5"
                      style={{ height: '34px' }}
                    >
                      {/* Ticker */}
                      <div
                        className="flex items-center gap-1 px-2 rounded flex-shrink-0"
                        style={{
                          height: '34px',
                          minWidth: '70px',
                          maxWidth: '90px',
                          background: 'linear-gradient(180deg,#1a1a1a 0%,#000 60%)',
                          border: '1px solid rgba(255,102,0,0.45)',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
                        }}
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          style={{ color: '#ff6600', flexShrink: 0 }}
                        >
                          <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2.5" />
                          <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2.5" />
                        </svg>
                        <input
                          type="text"
                          value={tickerInput}
                          onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleTickerSubmit()
                          }}
                          className="bg-transparent border-0 outline-none w-full font-black uppercase"
                          style={{ color: '#fff', fontSize: '11px', letterSpacing: '0.5px' }}
                          placeholder="TICKER"
                        />
                      </div>

                      {/* LIVE */}
                      <button
                        onClick={() => {
                          if (liveOILoading) return
                          const t = tickerInput.trim() || selectedTicker
                          if (!t) {
                            alert('Enter a ticker first')
                            return
                          }
                          if (tickerInput.trim() && tickerInput.trim() !== selectedTicker) {
                            const u = tickerInput.trim().toUpperCase()
                            setSelectedTicker(u)
                            setTickerInput(u)
                          }
                          if (!liveMode) {
                            setLiveMode(true)
                            updateLiveOI()
                          } else {
                            setLiveMode(false)
                            setLiveOIData(new Map())
                            setGexByStrikeByExpiration(baseGexByStrikeByExpiration)
                            setDealerByStrikeByExpiration(baseDealerByStrikeByExpiration)
                          }
                        }}
                        className="flex items-center gap-1 flex-shrink-0 font-black uppercase rounded"
                        style={{
                          height: '34px',
                          padding: '0 8px',
                          fontSize: '10px',
                          letterSpacing: '0.5px',
                          background: liveMode
                            ? 'rgba(34,197,94,0.15)'
                            : 'linear-gradient(180deg,#1a1a1a 0%,#000 60%)',
                          border: liveMode
                            ? '1px solid rgba(34,197,94,0.55)'
                            : '1px solid rgba(255,255,255,0.1)',
                          color: liveMode ? '#22c55e' : '#888',
                          boxShadow: liveMode
                            ? '0 0 8px rgba(34,197,94,0.2), inset 0 1px 0 rgba(255,255,255,0.06)'
                            : 'inset 0 1px 0 rgba(255,255,255,0.08)',
                        }}
                      >
                        <span
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: '50%',
                            background: liveMode ? '#22c55e' : '#555',
                            display: 'inline-block',
                            boxShadow: liveMode ? '0 0 5px #22c55e' : 'none',
                          }}
                        />
                        {liveOILoading ? `${liveOIProgress}%` : 'LIVE'}
                      </button>

                      {/* OTM Range */}
                      <select
                        value={otmFilter}
                        onChange={(e) => setOtmFilter(e.target.value as any)}
                        className="appearance-none cursor-pointer outline-none font-black uppercase text-center rounded flex-shrink-0"
                        style={{
                          height: '34px',
                          padding: '0 4px',
                          fontSize: '12px',
                          width: '52px',
                          backgroundColor: '#000',
                          background: 'linear-gradient(180deg,#1a1a1a 0%,#000 60%)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: '#fff',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
                          colorScheme: 'dark',
                        }}
                      >
                        <option value="1%">±1%</option>
                        <option value="2%">±2%</option>
                        <option value="3%">±3%</option>
                        <option value="5%">±5%</option>
                        <option value="8%">±8%</option>
                        <option value="10%">±10%</option>
                        <option value="15%">±15%</option>
                        <option value="20%">±20%</option>
                        <option value="25%">±25%</option>
                        <option value="40%">±40%</option>
                        <option value="50%">±50%</option>
                        <option value="100%">±100%</option>
                      </select>

                      {/* Mode */}
                      <select
                        value={
                          showGEX && !showDealer && !showFlowGEX && !showODTRIO
                            ? 'normal'
                            : showDealer
                              ? 'dealer'
                              : showFlowGEX
                                ? 'flowmap'
                                : showODTRIO
                                  ? 'odtrio'
                                  : 'normal'
                        }
                        onChange={(e) => {
                          const v = e.target.value
                          setShowGEX(v === 'normal')
                          setShowDealer(v === 'dealer')
                          setShowFlowGEX(v === 'flowmap')
                          setShowODTRIO(v === 'odtrio')
                          if (v === 'normal') setGexMode('Net GEX')
                          if (v === 'dealer') setGexMode('Net Dealer')
                          if (v === 'odtrio') fetchODTRIOData()
                        }}
                        className="appearance-none cursor-pointer outline-none font-black uppercase text-center rounded"
                        style={{
                          height: '34px',
                          padding: '0 4px',
                          fontSize: '12px',
                          flex: '2 1 0',
                          minWidth: 0,
                          backgroundColor: '#000',
                          background: showGEX
                            ? 'linear-gradient(180deg,rgba(34,197,94,0.18) 0%,rgba(34,197,94,0.06) 60%)'
                            : showDealer
                              ? 'linear-gradient(180deg,rgba(168,85,247,0.18) 0%,rgba(168,85,247,0.06) 60%)'
                              : showFlowGEX
                                ? 'linear-gradient(180deg,rgba(249,115,22,0.18) 0%,rgba(249,115,22,0.06) 60%)'
                                : 'linear-gradient(180deg,rgba(59,130,246,0.18) 0%,rgba(59,130,246,0.06) 60%)',
                          border: showGEX
                            ? '1px solid rgba(34,197,94,0.5)'
                            : showDealer
                              ? '1px solid rgba(168,85,247,0.5)'
                              : showFlowGEX
                                ? '1px solid rgba(249,115,22,0.5)'
                                : '1px solid rgba(59,130,246,0.5)',
                          color: showGEX
                            ? '#22c55e'
                            : showDealer
                              ? '#a855f7'
                              : showFlowGEX
                                ? '#f97316'
                                : '#3b82f6',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
                          colorScheme: 'dark',
                        }}
                      >
                        <option value="normal" style={{ background: '#000', color: '#22c55e' }}>
                          NORMAL
                        </option>
                        <option value="dealer" style={{ background: '#000', color: '#a855f7' }}>
                          DEALER
                        </option>
                        <option value="flowmap" style={{ background: '#000', color: '#f97316' }}>
                          FLOW MAP
                        </option>
                        <option value="odtrio" style={{ background: '#000', color: '#3b82f6' }}>
                          ODTRIO
                        </option>
                      </select>

                      {/* OI */}
                      <button
                        onClick={() => setShowOI(!showOI)}
                        className="flex items-center gap-1 flex-shrink-0 font-black uppercase rounded"
                        style={{
                          height: '34px',
                          padding: '0 8px',
                          fontSize: '10px',
                          letterSpacing: '0.5px',
                          background: showOI
                            ? 'rgba(59,130,246,0.15)'
                            : 'linear-gradient(180deg,#1a1a1a 0%,#000 60%)',
                          border: showOI
                            ? '1px solid rgba(59,130,246,0.55)'
                            : '1px solid rgba(255,255,255,0.1)',
                          color: showOI ? '#3b82f6' : '#888',
                          boxShadow: showOI
                            ? '0 0 8px rgba(59,130,246,0.2), inset 0 1px 0 rgba(255,255,255,0.06)'
                            : 'inset 0 1px 0 rgba(255,255,255,0.08)',
                        }}
                      >
                        <span
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: '50%',
                            background: showOI ? '#3b82f6' : '#444',
                            display: 'inline-block',
                            boxShadow: showOI ? '0 0 5px #3b82f6' : 'none',
                          }}
                        />
                        OI
                      </button>

                      {/* Refresh */}
                      <button
                        onClick={() => fetchOptionsData()}
                        disabled={loading}
                        className="flex items-center justify-center flex-shrink-0 rounded disabled:opacity-40"
                        style={{
                          height: '34px',
                          width: '34px',
                          background: 'linear-gradient(180deg,#1a1a1a 0%,#000 60%)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: '#ff6600',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
                        }}
                      >
                        <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                      </button>
                    </div>
                    {/* Desktop Layout - Original Horizontal */}
                    <div className="hidden md:flex md:items-center w-full">
                      {/* Left Controls */}
                      <div className="flex items-center gap-4 md:gap-8">
                        {/* Ticker Search */}
                        <div className="flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-4">
                          <div className="relative flex items-center">
                            <div className="search-bar-premium flex items-center space-x-2 px-3 py-2 rounded-md">
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                style={{ color: 'rgba(128, 128, 128, 0.5)' }}
                              >
                                <circle
                                  cx="11"
                                  cy="11"
                                  r="8"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                />
                                <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2" />
                              </svg>
                              <input
                                type="text"
                                value={tickerInput}
                                onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleTickerSubmit()
                                  }
                                }}
                                className="bg-transparent border-0 outline-none w-20 text-lg font-bold uppercase"
                                style={{
                                  color: '#ffffff',
                                  textShadow:
                                    '0 0 5px rgba(128, 128, 128, 0.2), 0 1px 2px rgba(0, 0, 0, 0.8)',
                                  fontFamily: 'system-ui, -apple-system, sans-serif',
                                  letterSpacing: '0.8px',
                                }}
                                placeholder="Search..."
                              />
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                style={{ color: '#666' }}
                              >
                                <path d="M12 5v14l7-7-7-7z" fill="currentColor" />
                              </svg>
                            </div>
                          </div>
                        </div>

                        {/* Analysis Type & OTM Dropdown */}
                        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-8">
                          {/* Display Toggle Checkboxes */}
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-6">
                              {/* DUO Button - Desktop Only */}
                              <button
                                onClick={() => {
                                  const newDuoMode = !duoMode
                                  setDuoMode(newDuoMode)
                                  if (newDuoMode) {
                                    setShowGEX(true)
                                    setShowDealer(true)
                                  } else {
                                    setShowGEX(false)
                                    setShowDealer(false)
                                  }
                                }}
                                className={`hidden md:block relative px-4 py-1.5 rounded transition-all duration-300 overflow-hidden ${
                                  duoMode
                                    ? 'bg-gradient-to-b from-lime-500/25 via-black to-lime-900/30 border border-lime-400/70 shadow-[0_0_15px_rgba(132,204,22,0.4),inset_0_1px_0_rgba(255,255,255,0.15)]'
                                    : 'bg-gradient-to-b from-black/80 via-black to-black/90 border border-white/10 hover:border-lime-500/40 hover:shadow-[0_0_10px_rgba(132,204,22,0.2)]'
                                }`}
                              >
                                <div className="absolute inset-0 bg-gradient-to-b from-white/8 via-transparent to-transparent pointer-events-none"></div>
                                <span
                                  className={`relative z-10 text-xs font-bold uppercase tracking-wider transition-all ${duoMode ? 'text-lime-300 drop-shadow-[0_0_8px_rgba(163,230,53,0.6)]' : 'text-lime-400'}`}
                                >
                                  DUO
                                </span>
                              </button>

                              {/* NORMAL (GEX) Checkbox */}
                              <div
                                className={`relative flex items-center gap-2 px-3 py-1.5 rounded transition-all duration-300 overflow-hidden ${
                                  showGEX
                                    ? 'bg-gradient-to-b from-emerald-500/25 via-black to-emerald-900/30 border border-emerald-400/70 shadow-[0_0_15px_rgba(16,185,129,0.4),inset_0_1px_0_rgba(255,255,255,0.15)]'
                                    : 'bg-gradient-to-b from-black/80 via-black to-black/90 border border-white/10 hover:border-emerald-500/40 hover:shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                                }`}
                              >
                                <div className="absolute inset-0 bg-gradient-to-b from-white/8 via-transparent to-transparent pointer-events-none"></div>
                                <input
                                  type="checkbox"
                                  checked={showGEX}
                                  onChange={(e) => {
                                    const isChecked = e.target.checked
                                    setShowGEX(isChecked)
                                    if (isChecked) {
                                      setGexMode('Net GEX')
                                    }
                                  }}
                                  className="relative z-10 w-4 h-4 bg-black border-2 rounded focus:ring-2 transition-all text-emerald-500 border-emerald-500/60 focus:ring-emerald-500 accent-emerald-500"
                                />
                                <span
                                  className={`relative z-10 text-xs font-bold uppercase tracking-wider transition-all ${showGEX ? 'text-emerald-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'text-white'}`}
                                >
                                  NORMAL
                                </span>
                              </div>

                              {/* MM ACTIVITY (Dealer) Checkbox */}
                              <div
                                className={`relative flex items-center gap-2 px-3 py-1.5 rounded transition-all duration-300 overflow-hidden ${
                                  showDealer
                                    ? 'bg-gradient-to-b from-amber-500/25 via-black to-amber-900/30 border border-amber-400/70 shadow-[0_0_15px_rgba(245,158,11,0.4),inset_0_1px_0_rgba(255,255,255,0.15)]'
                                    : 'bg-gradient-to-b from-black/80 via-black to-black/90 border border-white/10 hover:border-amber-500/40 hover:shadow-[0_0_10px_rgba(245,158,11,0.2)]'
                                }`}
                              >
                                <div className="absolute inset-0 bg-gradient-to-b from-white/8 via-transparent to-transparent pointer-events-none"></div>
                                <input
                                  type="checkbox"
                                  checked={showDealer}
                                  onChange={(e) => {
                                    const isChecked = e.target.checked
                                    setShowDealer(isChecked)
                                    if (isChecked) {
                                      setGexMode('Net Dealer')
                                    }
                                  }}
                                  className="relative z-10 w-4 h-4 bg-black border-2 rounded focus:ring-2 transition-all text-amber-500 border-amber-500/60 focus:ring-amber-500 accent-amber-500"
                                />
                                <span
                                  className={`relative z-10 text-xs font-bold uppercase tracking-wider transition-all ${showDealer ? 'text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]' : 'text-yellow-400'}`}
                                >
                                  DEALER
                                </span>
                              </div>

                              {/* FLOW MAP Checkbox */}
                              <div
                                className={`relative flex items-center gap-2 px-3 py-1.5 rounded transition-all duration-300 overflow-hidden ${
                                  showFlowGEX
                                    ? 'bg-gradient-to-b from-orange-500/25 via-black to-orange-900/30 border border-orange-400/70 shadow-[0_0_15px_rgba(249,115,22,0.4),inset_0_1px_0_rgba(255,255,255,0.15)]'
                                    : 'bg-gradient-to-b from-black/80 via-black to-black/90 border border-white/10 hover:border-orange-500/40 hover:shadow-[0_0_10px_rgba(249,115,22,0.2)]'
                                }`}
                              >
                                <div className="absolute inset-0 bg-gradient-to-b from-white/8 via-transparent to-transparent pointer-events-none"></div>
                                <input
                                  id="flowgex-checkbox-desktop"
                                  type="checkbox"
                                  checked={showFlowGEX}
                                  onClick={(e) => {
                                    console.log(
                                      `🔥 FLOW GEX CHECKBOX CLICKED (desktop) - Current: ${showFlowGEX}, Will be: ${!showFlowGEX}`
                                    )
                                  }}
                                  onChange={(e) => {
                                    console.log(
                                      `🔥 FLOW GEX CHECKBOX CHANGED (desktop) - New value: ${e.target.checked}`
                                    )
                                    setShowFlowGEX(e.target.checked)
                                  }}
                                  className="relative z-10 w-4 h-4 bg-black border-2 rounded focus:ring-2 transition-all text-orange-500 border-orange-500/60 focus:ring-orange-500 accent-orange-500"
                                />
                                <label
                                  htmlFor="flowgex-checkbox-desktop"
                                  className={`relative z-10 text-xs font-bold uppercase tracking-wider cursor-pointer transition-all ${showFlowGEX ? 'text-orange-300 drop-shadow-[0_0_8px_rgba(251,146,60,0.6)]' : 'text-orange-400'}`}
                                >
                                  FLOW MAP
                                </label>
                              </div>

                              {/* OI Checkbox */}
                              <div
                                className={`relative flex items-center gap-2 px-3 py-1.5 rounded transition-all duration-300 overflow-hidden ${
                                  showOI
                                    ? 'bg-gradient-to-b from-blue-500/25 via-black to-blue-900/30 border border-blue-400/70 shadow-[0_0_15px_rgba(59,130,246,0.4),inset_0_1px_0_rgba(255,255,255,0.15)]'
                                    : 'bg-gradient-to-b from-black/80 via-black to-black/90 border border-white/10 hover:border-blue-500/40 hover:shadow-[0_0_10px_rgba(59,130,246,0.2)]'
                                }`}
                              >
                                <div className="absolute inset-0 bg-gradient-to-b from-white/8 via-transparent to-transparent pointer-events-none"></div>
                                <input
                                  type="checkbox"
                                  checked={showOI}
                                  onChange={(e) => setShowOI(e.target.checked)}
                                  className="relative z-10 w-4 h-4 bg-black border-2 rounded focus:ring-2 transition-all text-blue-500 border-blue-500/60 focus:ring-blue-500 accent-blue-500"
                                />
                                <span
                                  className={`relative z-10 text-xs font-bold uppercase tracking-wider transition-all ${showOI ? 'text-blue-300 drop-shadow-[0_0_8px_rgba(96,165,250,0.6)]' : 'text-white'}`}
                                >
                                  OI
                                </span>
                              </div>

                              {/* LIVE Checkbox */}
                              <div
                                className={`relative flex items-center gap-2 px-3 py-1.5 rounded transition-all duration-300 overflow-hidden ${
                                  liveMode
                                    ? 'bg-gradient-to-b from-green-500/25 via-black to-green-900/30 border border-green-400/70 shadow-[0_0_15px_rgba(34,197,94,0.4),inset_0_1px_0_rgba(255,255,255,0.15)]'
                                    : 'bg-gradient-to-b from-black/80 via-black to-black/90 border border-white/10 hover:border-green-500/40 hover:shadow-[0_0_10px_rgba(34,197,94,0.2)]'
                                } ${liveOILoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                onClick={() => {
                                  if (liveOILoading) return
                                  const currentTicker = tickerInput.trim() || selectedTicker
                                  if (!currentTicker || currentTicker.trim() === '') {
                                    alert(
                                      'Please type a ticker in the search bar first before enabling Live OI'
                                    )
                                    return
                                  }
                                  if (tickerInput.trim() && tickerInput.trim() !== selectedTicker) {
                                    const newTicker = tickerInput.trim().toUpperCase()
                                    setSelectedTicker(newTicker)
                                    setTickerInput(newTicker)
                                  }
                                  if (!liveMode) {
                                    setLiveMode(true)
                                    updateLiveOI()
                                  } else {
                                    setLiveMode(false)
                                    setLiveOIData(new Map())
                                    setGexByStrikeByExpiration(baseGexByStrikeByExpiration)
                                    setDealerByStrikeByExpiration(baseDealerByStrikeByExpiration)
                                  }
                                }}
                              >
                                <div className="absolute inset-0 bg-gradient-to-b from-white/8 via-transparent to-transparent pointer-events-none"></div>
                                <input
                                  type="checkbox"
                                  checked={liveMode}
                                  onChange={() => {}}
                                  className="relative z-10 w-4 h-4 bg-black border-2 rounded focus:ring-2 transition-all text-green-500 border-green-500/60 focus:ring-green-500 accent-green-500 pointer-events-none"
                                />
                                <span
                                  className={`relative z-10 text-xs font-bold uppercase tracking-wider transition-all ${
                                    liveMode
                                      ? 'text-green-300 drop-shadow-[0_0_8px_rgba(74,222,128,0.6)]'
                                      : 'text-white'
                                  }`}
                                >
                                  {liveOILoading ? `LIVE ${liveOIProgress}%` : 'LIVE'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* OTM Filter Dropdown */}
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white uppercase tracking-wider">
                              RANGE
                            </span>
                            <div className="relative">
                              <select
                                value={otmFilter}
                                onChange={(e) =>
                                  setOtmFilter(
                                    e.target.value as
                                      | '1%'
                                      | '2%'
                                      | '3%'
                                      | '5%'
                                      | '8%'
                                      | '10%'
                                      | '15%'
                                      | '20%'
                                      | '25%'
                                      | '40%'
                                      | '50%'
                                      | '100%'
                                  )
                                }
                                className="bg-black border-2 border-gray-800 focus:border-orange-500 focus:outline-none px-4 py-2.5 pr-10 text-white text-sm font-bold uppercase appearance-none cursor-pointer min-w-[90px] transition-all"
                              >
                                <option value="1%">±1%</option>
                                <option value="2%">±2%</option>
                                <option value="3%">±3%</option>
                                <option value="5%">±5%</option>
                                <option value="8%">±8%</option>
                                <option value="10%">±10%</option>
                                <option value="15%">±15%</option>
                                <option value="20%">±20%</option>
                                <option value="25%">±25%</option>
                                <option value="40%">±40%</option>
                                <option value="50%">±50%</option>
                                <option value="100%">±100%</option>
                              </select>
                              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                                <svg
                                  className="w-4 h-4 text-orange-500"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* ODTRIO Button */}
                        <button
                          onClick={() => {
                            const newState = !showODTRIO
                            setShowODTRIO(newState)
                            if (newState) {
                              fetchODTRIOData()
                            }
                          }}
                          className="flex items-center justify-center px-4 py-2.5 font-black text-sm uppercase tracking-wider transition-all duration-200 border-2"
                          style={{
                            background: showODTRIO ? 'rgba(59,130,246,0.15)' : '#000000',
                            borderColor: showODTRIO ? '#3b82f6' : '#444',
                            color: '#3b82f6',
                            fontWeight: '900',
                            letterSpacing: '0.05em',
                          }}
                          title="ODTE Trio: SPX, QQQ, SPY"
                        >
                          ODTRIO
                        </button>

                        {/* ODTRIO LIVE OI Button - Desktop version */}
                        {showODTRIO && (
                          <button
                            onClick={() => {
                              if (!liveMode) {
                                setLiveMode(true)
                                updateOdtrioLiveOI()
                              } else {
                                setLiveMode(false)
                                setLiveOIData(new Map())
                                setOdtrioData(JSON.parse(JSON.stringify(baseOdtrioData)))
                              }
                            }}
                            disabled={liveOILoading}
                            className="flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-gray-800 font-black text-sm uppercase tracking-wider transition-all duration-200"
                            style={{
                              background: '#000000',
                              borderColor: '#444',
                              color: liveMode ? '#22c55e' : '#ef4444',
                              opacity: liveOILoading ? 0.5 : 1,
                              cursor: liveOILoading ? 'not-allowed' : 'pointer',
                            }}
                            title="ODTRIO Live OI - Scan flow for ODTE strikes only"
                          >
                            <span>{liveOILoading ? `${liveOIProgress}%` : 'LiveDte'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {loading ? (
              <div
                className="flex flex-col items-center justify-center w-full py-32 border border-orange-500/20 bg-black"
                style={{ minHeight: '600px' }}
              >
                <RefreshCw size={32} className="animate-spin mb-6" style={{ color: '#ff6600' }} />
                <p
                  className="text-base font-bold uppercase tracking-[0.25em] mb-6"
                  style={{ color: '#ff6600', fontFamily: 'monospace', fontSize: '1.65rem' }}
                >
                  Loading Gamma Exposure Data
                </p>
                {progress > 0 && (
                  <div className="w-72 mb-8">
                    <div className="relative w-full h-[2px] bg-gray-800 overflow-hidden">
                      <div
                        className="absolute top-0 left-0 h-full transition-all duration-300 ease-out"
                        style={{ width: `${progress}%`, background: '#ff6600' }}
                      />
                    </div>
                    <p
                      className="text-[16px] mt-2 text-right font-mono"
                      style={{ color: '#ff6600' }}
                    >
                      {progress}%
                    </p>
                  </div>
                )}
                <div className="max-w-lg text-center px-4">
                  <p
                    className="text-white font-semibold leading-relaxed"
                    style={{ fontSize: '1.2rem', textShadow: '0 0 20px rgba(255,255,255,0.15)' }}
                  >
                    &ldquo;{loadingQuote.body}&rdquo;
                  </p>
                  {loadingQuote.author && (
                    <p className="text-gray-400 mt-2 font-mono" style={{ fontSize: '1.05rem' }}>
                      {loadingQuote.author}
                    </p>
                  )}
                </div>
              </div>
            ) : liveOILoading && data.length > 0 ? (
              <div className="relative">
                {/* Show existing data in background with overlay */}
                <div className="opacity-30 pointer-events-none">
                  {/* Render existing data here (will be shown dimmed) */}
                </div>

                {/* Live OI Recalculation Overlay */}
                <div
                  className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-50"
                  style={{ marginTop: '80px' }}
                >
                  <div
                    className="flex flex-col items-center text-center px-8"
                    style={{ paddingTop: '15vh' }}
                  >
                    <p
                      className="font-bold uppercase tracking-[0.25em] mb-6"
                      style={{ color: '#ff6600', fontFamily: 'monospace', fontSize: '1.65rem' }}
                    >
                      Scanning Live Gamma Exposure
                    </p>
                    {/* Live OI Progress Bar */}
                    <div className="w-72 mb-8">
                      <div className="relative w-full h-[2px] bg-gray-800 overflow-hidden">
                        <div
                          className="absolute top-0 left-0 h-full transition-all duration-300 ease-out"
                          style={{ width: `${liveOIProgress}%`, background: '#ff6600' }}
                        />
                      </div>
                      <p
                        className="text-[16px] mt-2 text-right font-mono"
                        style={{ color: '#ff6600' }}
                      >
                        {liveOIProgress}%
                      </p>
                    </div>
                    <RefreshCw
                      size={48}
                      className="animate-spin mb-8"
                      style={{ color: '#ff6600' }}
                    />
                    <div className="max-w-lg px-4">
                      <p
                        className="text-white font-semibold leading-relaxed"
                        style={{
                          fontSize: '1.2rem',
                          textShadow: '0 0 20px rgba(255,255,255,0.15)',
                        }}
                      >
                        &ldquo;{liveLoadingQuote.body}&rdquo;
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  flex: 1,
                  minHeight: 0,
                  overflow: 'hidden',
                }}
              >
                <div style={{ flex: '0 1 auto', overflowY: 'auto' }}>
                  {/* Dealer Attraction Legend - Only show when Live OI mode is active */}

                  {/* GEX Timeline Scrubber - Show when showHistoricalGEX is true, ticker selected, and not in OI or ODTRIO mode */}
                  {showHistoricalGEX &&
                    !showODTRIO &&
                    selectedTicker &&
                    !showOI &&
                    !['SPX', 'VIX'].includes(selectedTicker.toUpperCase()) && (
                      <div className="px-4 pb-4">
                        <GEXTimelineScrubber
                          key={selectedTicker}
                          ticker={selectedTicker}
                          date={(() => {
                            // Get current time in PST
                            const now = new Date()

                            // Get PST time components
                            const etFormatter = new Intl.DateTimeFormat('en-US', {
                              timeZone: 'America/Los_Angeles',
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: false,
                            })

                            const parts = etFormatter.formatToParts(now)
                            let year = parts.find((p) => p.type === 'year')!.value
                            let month = parts.find((p) => p.type === 'month')!.value
                            let day = parts.find((p) => p.type === 'day')!.value
                            const hour = parseInt(parts.find((p) => p.type === 'hour')!.value)

                            // If it's before 6:30 AM PST, use previous day's data (since market hasn't opened yet)
                            if (
                              hour < 9 ||
                              (hour === 9 &&
                                parseInt(parts.find((p) => p.type === 'minute')!.value) < 30)
                            ) {
                              const yesterday = new Date(`${year}-${month}-${day}`)
                              yesterday.setDate(yesterday.getDate() - 1)
                              year = yesterday.getFullYear().toString()
                              month = String(yesterday.getMonth() + 1).padStart(2, '0')
                              day = String(yesterday.getDate()).padStart(2, '0')
                            }

                            // Create date object using the ET date components
                            const today = new Date(`${year}-${month}-${day}T12:00:00`)
                            const dayOfWeek = today.getDay()

                            // If Saturday (6), go back 1 day. If Sunday (0), go back 2 days.
                            if (dayOfWeek === 0)
                              today.setDate(today.getDate() - 2) // Sunday -> Friday
                            else if (dayOfWeek === 6) today.setDate(today.getDate() - 1) // Saturday -> Friday

                            // Format as YYYY-MM-DD
                            const finalYear = today.getFullYear()
                            const finalMonth = String(today.getMonth() + 1).padStart(2, '0')
                            const finalDay = String(today.getDate()).padStart(2, '0')
                            return `${finalYear}-${finalMonth}-${finalDay}`
                          })()}
                          currentPrice={currentPrice}
                          onTimeChange={(timestamp, price) => {
                            setHistoricalTimestamp(timestamp)
                            setHistoricalPrice(price)
                          }}
                        />
                      </div>
                    )}

                  {/* ODTRIO MODE - Takes priority over everything */}
                  {showODTRIO ? (
                    <div className="px-4">
                      <div className="flex gap-1 w-full">
                        {(() => {
                          // Count how many tickers have golden zones above current price
                          const tickerGoldenPositions: { [key: string]: 'above' | 'below' } = {}
                          ;['SPX', 'QQQ', 'SPY'].forEach((ticker) => {
                            const tickerData = odtrioData[ticker]
                            const tickerDataArray = tickerData?.data || []
                            const odteExpiry = tickerData?.odteExpiry
                            const currentPrice = tickerData?.currentPrice || 0

                            if (odteExpiry && tickerDataArray.length > 0) {
                              const normalGEXValues = tickerDataArray
                                .filter((row) => row.expirations && row.expirations[odteExpiry])
                                .map((row) => {
                                  const gexData = row.expirations![odteExpiry]
                                  return (gexData.call_gex || 0) + (gexData.put_gex || 0)
                                })
                              const dealerGEXValues = tickerDataArray
                                .filter((row) => row.expirations && row.expirations[odteExpiry])
                                .map((row) => {
                                  const gexData = row.expirations![odteExpiry]
                                  return (gexData.call_dealer || 0) + (gexData.put_dealer || 0)
                                })

                              const highestGEX = Math.max(...normalGEXValues)
                              const highestDealer = Math.max(...dealerGEXValues)

                              // Find golden zone row (highest GEX for both columns)
                              const goldenRow = tickerDataArray.find((row) => {
                                const gexData = row.expirations?.[odteExpiry]
                                if (!gexData) return false
                                const netGEX = (gexData.call_gex || 0) + (gexData.put_gex || 0)
                                const netDealer =
                                  (gexData.call_dealer || 0) + (gexData.put_dealer || 0)
                                return (
                                  netGEX === highestGEX &&
                                  netDealer === highestDealer &&
                                  netGEX > 0 &&
                                  netDealer > 0
                                )
                              })

                              if (goldenRow) {
                                tickerGoldenPositions[ticker] =
                                  goldenRow.strike > currentPrice ? 'above' : 'below'
                              }
                            }
                          })

                          const goldensAbove = Object.values(tickerGoldenPositions).filter(
                            (pos) => pos === 'above'
                          ).length
                          const isTurboMode = goldensAbove >= 2 // 2 or more tickers have golden zones above

                          return ['SPX', 'QQQ', 'SPY'].map((tricoTicker) => {
                            const isGoldenAbove = tickerGoldenPositions[tricoTicker] === 'above'
                            const tickerData = odtrioData[tricoTicker]
                            const tickerDataArray = tickerData?.data || []
                            const odteExpiry = tickerData?.odteExpiry
                            const currentPrice = tickerData?.currentPrice || 0
                            const isLoading = tickerData?.loading

                            if (isLoading) {
                              return null
                            }

                            if (!odteExpiry || tickerDataArray.length === 0) {
                              return (
                                <div
                                  key={tricoTicker}
                                  className="flex-1 flex items-center justify-center"
                                  style={{ minWidth: 0, minHeight: '400px' }}
                                >
                                  <div className="text-gray-400 text-sm">
                                    No ODTE data for {tricoTicker}
                                  </div>
                                </div>
                              )
                            }

                            // Find current price strike and center the display
                            const allStrikes = tickerDataArray
                              .filter((row) => row.expirations && row.expirations[odteExpiry])
                              .map((r) => r.strike)
                              .sort((a, b) => a - b)

                            const closestStrike = allStrikes.reduce(
                              (prev, curr) =>
                                Math.abs(curr - currentPrice) < Math.abs(prev - currentPrice)
                                  ? curr
                                  : prev,
                              allStrikes[0]
                            )
                            const currentIndex = allStrikes.indexOf(closestStrike)
                            const strikesToShow = 50 // Show 50 strikes total (24 above, current at row 25, 25 below)
                            const strikesAbove = 24 // Current price will be at row 25

                            // Calculate start and end indices to center around current price
                            let startIndex = Math.max(0, currentIndex - strikesAbove)
                            const endIndex = Math.min(allStrikes.length, startIndex + strikesToShow)

                            // Adjust if we hit the end
                            if (endIndex - startIndex < strikesToShow) {
                              startIndex = Math.max(0, endIndex - strikesToShow)
                            }

                            const displayStrikes = allStrikes.slice(startIndex, endIndex)
                            const minStrike = displayStrikes[0]
                            const maxStrike = displayStrikes[displayStrikes.length - 1]

                            const borderColor = useBloombergTheme
                              ? 'border-white/20'
                              : 'border-gray-700'
                            const borderColorDivider = useBloombergTheme
                              ? 'border-white/15'
                              : 'border-gray-800'
                            const tableBorderColor = useBloombergTheme
                              ? 'border-white/20'
                              : 'border-gray-700'
                            const isMobile =
                              typeof window !== 'undefined' && window.innerWidth < 768
                            const mobileStrikeWidth = isMobile ? 38 : 60
                            const mobileExpWidth = isMobile ? 48 : 90

                            // Calculate GEX ranges for both Normal and Dealer
                            const normalGEXValues = tickerDataArray
                              .filter((row) => row.expirations && row.expirations[odteExpiry])
                              .map((row) => {
                                const gexData = row.expirations![odteExpiry]
                                return (gexData.call_gex || 0) + (gexData.put_gex || 0)
                              })
                            const dealerGEXValues = tickerDataArray
                              .filter((row) => row.expirations && row.expirations[odteExpiry])
                              .map((row) => {
                                const gexData = row.expirations![odteExpiry]
                                return (gexData.call_dealer || 0) + (gexData.put_dealer || 0)
                              })

                            const highestGEX = Math.max(...normalGEXValues)
                            const lowestGEX = Math.min(...normalGEXValues)
                            const highestDealer = Math.max(...dealerGEXValues)
                            const lowestDealer = Math.min(...dealerGEXValues)

                            // ── DEALER ATTRACTION DEBUG ────────────────────────────────────────────
                            {
                              const goldenRow = tickerDataArray.find((row) => {
                                if (!row.expirations?.[odteExpiry]) return false
                                const nd =
                                  (row.expirations[odteExpiry].call_dealer || 0) +
                                  (row.expirations[odteExpiry].put_dealer || 0)
                                return nd === highestDealer && nd > 0
                              })
                              const purpleRow = tickerDataArray.find((row) => {
                                if (!row.expirations?.[odteExpiry]) return false
                                const nd =
                                  (row.expirations[odteExpiry].call_dealer || 0) +
                                  (row.expirations[odteExpiry].put_dealer || 0)
                                return nd === lowestDealer && nd < 0
                              })
                              const allRows = tickerDataArray
                                .filter((row) => row.expirations?.[odteExpiry])
                                .map((row) => ({
                                  strike: row.strike,
                                  netGEX: +(
                                    (row.expirations![odteExpiry].call_gex || 0) +
                                    (row.expirations![odteExpiry].put_gex || 0)
                                  ).toExponential(3),
                                  netDealer: +(
                                    (row.expirations![odteExpiry].call_dealer || 0) +
                                    (row.expirations![odteExpiry].put_dealer || 0)
                                  ).toExponential(3),
                                }))
                                .sort(
                                  (a, b) =>
                                    Math.abs(Number(b.netDealer)) - Math.abs(Number(a.netDealer))
                                )
                            }
                            // ──────────────────────────────────────────────────────────────────────

                            // Calculate top values for proper gradient opacity
                            const normalTopValues = {
                              highestPositive: Math.max(...normalGEXValues.filter((v) => v > 0)),
                              highestNegative: Math.abs(
                                Math.min(...normalGEXValues.filter((v) => v < 0))
                              ),
                            }
                            const dealerTopValues = {
                              highestPositive: Math.max(...dealerGEXValues.filter((v) => v > 0)),
                              highestNegative: Math.abs(
                                Math.min(...dealerGEXValues.filter((v) => v < 0))
                              ),
                            }

                            // Show both columns on mobile and desktop
                            const showNormalColumn = true
                            const showDealerColumn = true
                            const columnCount = 2

                            return (
                              <div key={tricoTicker} className="flex-1" style={{ minWidth: 0 }}>
                                <div
                                  className="border border-b-0 px-4 py-3 relative overflow-hidden"
                                  style={{
                                    background:
                                      'linear-gradient(180deg, #0a1929 0%, #051120 50%, #020a15 100%)',
                                    borderColor: '#1e3a5f',
                                    boxShadow:
                                      'inset 0 2px 4px rgba(0,0,0,0.8), inset 0 -2px 6px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.6)',
                                  }}
                                >
                                  <div
                                    className="absolute inset-0"
                                    style={{
                                      background:
                                        'radial-gradient(ellipse at top, rgba(30,58,95,0.3) 0%, transparent 70%)',
                                      pointerEvents: 'none',
                                    }}
                                  ></div>
                                  <div className="flex items-center justify-center gap-3 relative z-10">
                                    <div
                                      className="w-1.5 h-1.5 rounded-full"
                                      style={{
                                        background:
                                          'radial-gradient(circle, #60a5fa 0%, #3b82f6 100%)',
                                        boxShadow:
                                          '0 0 8px rgba(96,165,250,0.8), inset 0 1px 1px rgba(255,255,255,0.4)',
                                      }}
                                    ></div>
                                    <h3
                                      className="text-lg font-black uppercase tracking-widest text-center"
                                      style={{
                                        letterSpacing: '0.25em',
                                        color: '#ffffff',
                                        WebkitTextStroke: '1.5px #ff8c00',
                                        paintOrder: 'stroke fill',
                                        filter:
                                          'drop-shadow(0 2px 4px rgba(0,0,0,0.8)) drop-shadow(0 0 20px rgba(255,140,0,0.5))',
                                        textShadow: '0 0 8px rgba(0,0,0,1)',
                                      }}
                                    >
                                      • {tricoTicker} •
                                    </h3>
                                    <div
                                      className="w-1.5 h-1.5 rounded-full"
                                      style={{
                                        background:
                                          'radial-gradient(circle, #60a5fa 0%, #3b82f6 100%)',
                                        boxShadow:
                                          '0 0 8px rgba(96,165,250,0.8), inset 0 1px 1px rgba(255,255,255,0.4)',
                                      }}
                                    ></div>
                                  </div>
                                </div>
                                <div
                                  className={`${useBloombergTheme ? 'bg-black border-white/20' : 'bg-gray-900 border-gray-700'} border overflow-x-auto odtrio-scroll-container`}
                                  style={{
                                    maxHeight:
                                      typeof window !== 'undefined' && window.innerWidth < 768
                                        ? 'calc(90vh - 120px)'
                                        : 'calc(74.78vh - 270px)',
                                    overflowX: 'auto',
                                  }}
                                >
                                  <table
                                    style={{
                                      minWidth: `${mobileStrikeWidth + mobileExpWidth * columnCount}px`,
                                      width: '100%',
                                    }}
                                  >
                                    <thead
                                      className={`sticky top-0 z-20 ${useBloombergTheme ? 'bb-table-header' : 'bg-black backdrop-blur-sm'}`}
                                      style={{
                                        top: '0',
                                        backgroundColor: useBloombergTheme ? undefined : '#000000',
                                      }}
                                    >
                                      <tr
                                        className={
                                          useBloombergTheme
                                            ? ''
                                            : 'border-b border-gray-700 bg-black'
                                        }
                                      >
                                        <th
                                          className={`px-2 py-3 text-center sticky left-0 bg-black z-30 border-r ${borderColor} shadow-xl`}
                                          style={{
                                            width: `${mobileStrikeWidth}px`,
                                            minWidth: `${mobileStrikeWidth}px`,
                                            maxWidth: `${mobileStrikeWidth}px`,
                                          }}
                                        >
                                          <div
                                            className={
                                              useBloombergTheme
                                                ? 'bb-header text-orange-500 font-bold'
                                                : 'font-bold text-orange-500 uppercase'
                                            }
                                            style={{ fontSize: isMobile ? '0.45rem' : '1.35rem' }}
                                          >
                                            Strike
                                          </div>
                                        </th>
                                        {showNormalColumn && (
                                          <th
                                            className={`text-center bg-black border-l border-r ${borderColorDivider} shadow-lg px-2 py-3`}
                                            style={{
                                              width: `${mobileExpWidth}px`,
                                              minWidth: `${mobileExpWidth}px`,
                                              maxWidth: `${mobileExpWidth}px`,
                                            }}
                                          >
                                            <div
                                              className="font-bold text-blue-400 uppercase whitespace-nowrap"
                                              style={{ fontSize: isMobile ? '0.35rem' : '1.05rem' }}
                                            >
                                              Normal
                                            </div>
                                          </th>
                                        )}
                                        {showDealerColumn && (
                                          <th
                                            className={`text-center bg-black border-l border-r ${borderColorDivider} shadow-lg px-2 py-3`}
                                            style={{
                                              width: `${mobileExpWidth}px`,
                                              minWidth: `${mobileExpWidth}px`,
                                              maxWidth: `${mobileExpWidth}px`,
                                            }}
                                          >
                                            <div
                                              className="font-bold text-purple-400 uppercase whitespace-nowrap"
                                              style={{ fontSize: isMobile ? '0.35rem' : '1.05rem' }}
                                            >
                                              Dealer
                                            </div>
                                          </th>
                                        )}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(() => {
                                        const filteredRows = tickerDataArray.filter((row) => {
                                          const isInStrikeRange =
                                            row.strike >= minStrike && row.strike <= maxStrike
                                          const hasGEXData =
                                            row.expirations && row.expirations[odteExpiry]
                                          return isInStrikeRange && hasGEXData
                                        })

                                        // Find purple pivot row index
                                        const purplePivotIndex = filteredRows.findIndex((row) => {
                                          const gexData = row.expirations?.[odteExpiry]
                                          if (!gexData) return false
                                          const netGEX =
                                            (gexData.call_gex || 0) + (gexData.put_gex || 0)
                                          const netDealer =
                                            (gexData.call_dealer || 0) + (gexData.put_dealer || 0)
                                          const isLowestGEX = netGEX === lowestGEX && netGEX < 0
                                          const isLowestDealer =
                                            netDealer === lowestDealer && netDealer < 0
                                          return (
                                            showNormalColumn &&
                                            showDealerColumn &&
                                            isLowestGEX &&
                                            isLowestDealer
                                          )
                                        })

                                        // Find golden zone row index
                                        const goldenRowIndex = filteredRows.findIndex((row) => {
                                          const gexData = row.expirations?.[odteExpiry]
                                          if (!gexData) return false
                                          const netGEX =
                                            (gexData.call_gex || 0) + (gexData.put_gex || 0)
                                          const netDealer =
                                            (gexData.call_dealer || 0) + (gexData.put_dealer || 0)
                                          const isHighestGEX = netGEX === highestGEX && netGEX > 0
                                          const isHighestDealer =
                                            netDealer === highestDealer && netDealer > 0
                                          return (
                                            showNormalColumn &&
                                            showDealerColumn &&
                                            isHighestGEX &&
                                            isHighestDealer
                                          )
                                        })

                                        // Find current price row index
                                        const currentPriceRowIndex = filteredRows.findIndex(
                                          (row) => row.strike === closestStrike
                                        )

                                        return filteredRows.map((row, rowIndex) => {
                                          const gexData = row.expirations?.[odteExpiry]
                                          if (!gexData) return null

                                          const netGEX =
                                            (gexData.call_gex || 0) + (gexData.put_gex || 0)
                                          const netDealer =
                                            (gexData.call_dealer || 0) + (gexData.put_dealer || 0)

                                          // Check if this is highest or lowest GEX
                                          const isHighestGEX = netGEX === highestGEX && netGEX > 0
                                          const isLowestGEX = netGEX === lowestGEX && netGEX < 0
                                          const isHighestDealer =
                                            netDealer === highestDealer && netDealer > 0
                                          const isLowestDealer =
                                            netDealer === lowestDealer && netDealer < 0

                                          // Cell styles for Normal column
                                          let normalCellStyle
                                          if (isHighestGEX) {
                                            normalCellStyle = {
                                              bg: 'bg-yellow-500',
                                              ring: 'ring-2 ring-yellow-400',
                                              text: 'text-black',
                                            }
                                          } else if (isLowestGEX) {
                                            normalCellStyle = {
                                              bg: 'bg-purple-600',
                                              ring: 'ring-2 ring-purple-400',
                                              text: 'text-white',
                                            }
                                          } else {
                                            normalCellStyle = getCellStyle(
                                              netGEX,
                                              false,
                                              row.strike,
                                              odteExpiry,
                                              normalTopValues
                                            )
                                          }

                                          // Cell styles for Dealer column
                                          let dealerCellStyle
                                          if (isHighestDealer) {
                                            dealerCellStyle = {
                                              bg: 'bg-yellow-500',
                                              ring: 'ring-2 ring-yellow-400',
                                              text: 'text-black',
                                            }
                                          } else if (isLowestDealer) {
                                            dealerCellStyle = {
                                              bg: 'bg-purple-600',
                                              ring: 'ring-2 ring-purple-400',
                                              text: 'text-white',
                                            }
                                          } else {
                                            dealerCellStyle = getCellStyle(
                                              netDealer,
                                              false,
                                              row.strike,
                                              odteExpiry,
                                              dealerTopValues
                                            )
                                          }

                                          // Check if this is the current price row
                                          const isCurrentPriceRow = row.strike === closestStrike

                                          // Check if both columns are purple (pivot)
                                          const bothPurple =
                                            showNormalColumn &&
                                            showDealerColumn &&
                                            isLowestGEX &&
                                            isLowestDealer

                                          // Check if both columns are golden (highest positive GEX)
                                          const bothGolden =
                                            showNormalColumn &&
                                            showDealerColumn &&
                                            isHighestGEX &&
                                            isHighestDealer

                                          // Show arrows ON the purple pivot row itself
                                          const isPurplePivot = bothPurple

                                          // Conditional arrow display based on current price position relative to pivot
                                          // When current price is BELOW pivot (currentPriceRowIndex > purplePivotIndex): show RED only
                                          // When current price is ABOVE pivot (currentPriceRowIndex < purplePivotIndex): show GREEN only
                                          // When current price is AT pivot (currentPriceRowIndex === purplePivotIndex): show BOTH
                                          const showGreenUpFromPurple =
                                            isPurplePivot &&
                                            (currentPriceRowIndex < purplePivotIndex ||
                                              rowIndex === currentPriceRowIndex)
                                          const showRedDownFromPurple =
                                            isPurplePivot &&
                                            (currentPriceRowIndex > purplePivotIndex ||
                                              rowIndex === currentPriceRowIndex)

                                          // Show flowing pipe connecting current price to golden zone
                                          const showGoldenPipe =
                                            isCurrentPriceRow && goldenRowIndex !== -1
                                          const pipeDirection =
                                            goldenRowIndex > currentPriceRowIndex ? 'down' : 'up'
                                          const pipeHeight = Math.abs(
                                            goldenRowIndex - currentPriceRowIndex
                                          )

                                          // Show spinning pulley at golden zone
                                          const isGoldenZone =
                                            showNormalColumn &&
                                            showDealerColumn &&
                                            isHighestGEX &&
                                            isHighestDealer

                                          return (
                                            <tr
                                              key={`${tricoTicker}-${row.strike}`}
                                              className={`hover:bg-gray-800/20 transition-colors ${isCurrentPriceRow ? 'border-2 border-orange-500' : `border-b ${useBloombergTheme ? 'border-white/10' : 'border-gray-800/30'}`}`}
                                            >
                                              <td
                                                className={`px-2 py-3 font-bold sticky left-0 z-10 border-r ${borderColor} bg-black`}
                                                style={{
                                                  width: `${mobileStrikeWidth}px`,
                                                  minWidth: `${mobileStrikeWidth}px`,
                                                  maxWidth: `${mobileStrikeWidth}px`,
                                                }}
                                              >
                                                <div
                                                  className={`font-mono font-bold text-center ${isCurrentPriceRow ? 'text-orange-500' : isHighestGEX && isHighestDealer ? 'text-yellow-400' : isLowestGEX && isLowestDealer ? 'text-purple-400' : 'text-white'}`}
                                                  style={{
                                                    fontSize: isMobile ? '0.8rem' : '1.8rem',
                                                  }}
                                                >
                                                  {Math.round(row.strike)}
                                                </div>

                                                {/* Arrows at right edge of Dealer column */}
                                                {!isMobile &&
                                                  showNormalColumn &&
                                                  showDealerColumn && (
                                                    <>
                                                      {/* Green arrows UP - from purple box top */}
                                                      {showGreenUpFromPurple && (
                                                        <svg
                                                          style={{
                                                            position: 'absolute',
                                                            left: `${mobileStrikeWidth + mobileExpWidth * 2 - 40}px`,
                                                            bottom: '100%',
                                                            width: '70px',
                                                            height: '150px',
                                                            pointerEvents: 'none',
                                                            zIndex: 100,
                                                            overflow: 'visible',
                                                          }}
                                                        >
                                                          <defs>
                                                            <path
                                                              id={`greenUp-${row.strike}`}
                                                              d="M 25 150 Q 50 130 45 90 L 45 10"
                                                              fill="none"
                                                            />
                                                            <linearGradient
                                                              id={`greenGrad-${row.strike}`}
                                                              x1="0%"
                                                              y1="0%"
                                                              x2="100%"
                                                              y2="100%"
                                                            >
                                                              <stop
                                                                offset="0%"
                                                                style={{
                                                                  stopColor: '#00ffaa',
                                                                  stopOpacity: 1,
                                                                }}
                                                              />
                                                              <stop
                                                                offset="50%"
                                                                style={{
                                                                  stopColor: '#00ff88',
                                                                  stopOpacity: 1,
                                                                }}
                                                              />
                                                              <stop
                                                                offset="100%"
                                                                style={{
                                                                  stopColor: '#00cc66',
                                                                  stopOpacity: 1,
                                                                }}
                                                              />
                                                            </linearGradient>
                                                            <filter
                                                              id="greenGlow-${row.strike}"
                                                              x="-50%"
                                                              y="-50%"
                                                              width="200%"
                                                              height="200%"
                                                            >
                                                              <feGaussianBlur
                                                                stdDeviation="4"
                                                                result="coloredBlur"
                                                              />
                                                              <feMerge>
                                                                <feMergeNode in="coloredBlur" />
                                                                <feMergeNode in="SourceGraphic" />
                                                              </feMerge>
                                                            </filter>
                                                          </defs>
                                                          {/* 3D depth shadow layer */}
                                                          {[0, 1, 2].map((i) => (
                                                            <g key={`shadow-${i}`}>
                                                              <text
                                                                fontSize="42"
                                                                fill="#003322"
                                                                opacity="0.6"
                                                                style={{ fontWeight: 'bold' }}
                                                              >
                                                                ↑
                                                                <animateMotion
                                                                  dur="2.2s"
                                                                  begin={`${i * 0.7}s`}
                                                                  repeatCount="indefinite"
                                                                  path="M 23 152 Q 48 132 43 92 L 43 12"
                                                                />
                                                                <animate
                                                                  attributeName="opacity"
                                                                  values="0;0.2;0.6;0.6;0.6;0"
                                                                  dur="2.2s"
                                                                  begin={`${i * 0.7}s`}
                                                                  repeatCount="indefinite"
                                                                />
                                                              </text>
                                                            </g>
                                                          ))}
                                                          {/* Main 3D arrows with gradient and outline */}
                                                          {[0, 1, 2].map((i) => (
                                                            <g key={i}>
                                                              {/* Stroke outline for depth */}
                                                              <text
                                                                fontSize="42"
                                                                fill="none"
                                                                stroke="#00ffaa"
                                                                strokeWidth="3"
                                                                style={{ fontWeight: 'bold' }}
                                                              >
                                                                ↑
                                                                <animateMotion
                                                                  dur="2.2s"
                                                                  begin={`${i * 0.7}s`}
                                                                  repeatCount="indefinite"
                                                                  path="M 25 150 Q 50 130 45 90 L 45 10"
                                                                >
                                                                  <mpath
                                                                    href={`#greenUp-${row.strike}`}
                                                                  />
                                                                </animateMotion>
                                                                <animate
                                                                  attributeName="opacity"
                                                                  values="0;0.3;1;1;1;0"
                                                                  dur="2.2s"
                                                                  begin={`${i * 0.7}s`}
                                                                  repeatCount="indefinite"
                                                                />
                                                              </text>
                                                              {/* Inner fill with gradient */}
                                                              <text
                                                                fontSize="42"
                                                                fill="url(#greenGrad-${row.strike})"
                                                                style={{
                                                                  filter: `drop-shadow(0 0 20px #00ff88) drop-shadow(0 0 35px #00ff88) drop-shadow(3px 3px 0px #003322) url(#greenGlow-${row.strike})`,
                                                                  fontWeight: 'bold',
                                                                }}
                                                              >
                                                                ↑
                                                                <animateMotion
                                                                  dur="2.2s"
                                                                  begin={`${i * 0.7}s`}
                                                                  repeatCount="indefinite"
                                                                  path="M 25 150 Q 50 130 45 90 L 45 10"
                                                                >
                                                                  <mpath
                                                                    href={`#greenUp-${row.strike}`}
                                                                  />
                                                                </animateMotion>
                                                                <animate
                                                                  attributeName="opacity"
                                                                  values="0;0.3;1;1;1;0"
                                                                  dur="2.2s"
                                                                  begin={`${i * 0.7}s`}
                                                                  repeatCount="indefinite"
                                                                />
                                                                <animateTransform
                                                                  attributeName="transform"
                                                                  type="scale"
                                                                  values="0.9;1.05;1;1;0.9"
                                                                  dur="2.2s"
                                                                  begin={`${i * 0.7}s`}
                                                                  repeatCount="indefinite"
                                                                  additive="sum"
                                                                />
                                                              </text>
                                                            </g>
                                                          ))}
                                                          <path
                                                            d="M 45 150 Q 60 130 55 90 L 55 10"
                                                            stroke="url(#greenGrad-${row.strike})"
                                                            strokeWidth="4"
                                                            strokeDasharray="10,5"
                                                            fill="none"
                                                            opacity="0.8"
                                                            style={{
                                                              filter:
                                                                'drop-shadow(0 0 8px #00ff88)',
                                                            }}
                                                          />
                                                        </svg>
                                                      )}

                                                      {/* Red arrows DOWN - from purple box bottom */}
                                                      {showRedDownFromPurple && (
                                                        <svg
                                                          style={{
                                                            position: 'absolute',
                                                            left: `${mobileStrikeWidth + mobileExpWidth * 2 - 25}px`,
                                                            top: '100%',
                                                            width: '70px',
                                                            height: '150px',
                                                            pointerEvents: 'none',
                                                            zIndex: 100,
                                                            overflow: 'visible',
                                                          }}
                                                        >
                                                          <defs>
                                                            <path
                                                              id={`redDown-${row.strike}`}
                                                              d="M 25 0 Q 0 20 5 60 L 5 140"
                                                              fill="none"
                                                            />
                                                            <linearGradient
                                                              id={`redGrad-${row.strike}`}
                                                              x1="0%"
                                                              y1="0%"
                                                              x2="100%"
                                                              y2="100%"
                                                            >
                                                              <stop
                                                                offset="0%"
                                                                style={{
                                                                  stopColor: '#ff3366',
                                                                  stopOpacity: 1,
                                                                }}
                                                              />
                                                              <stop
                                                                offset="50%"
                                                                style={{
                                                                  stopColor: '#ff1744',
                                                                  stopOpacity: 1,
                                                                }}
                                                              />
                                                              <stop
                                                                offset="100%"
                                                                style={{
                                                                  stopColor: '#cc0022',
                                                                  stopOpacity: 1,
                                                                }}
                                                              />
                                                            </linearGradient>
                                                            <filter
                                                              id="redGlow-${row.strike}"
                                                              x="-50%"
                                                              y="-50%"
                                                              width="200%"
                                                              height="200%"
                                                            >
                                                              <feGaussianBlur
                                                                stdDeviation="4"
                                                                result="coloredBlur"
                                                              />
                                                              <feMerge>
                                                                <feMergeNode in="coloredBlur" />
                                                                <feMergeNode in="SourceGraphic" />
                                                              </feMerge>
                                                            </filter>
                                                          </defs>
                                                          {/* 3D depth shadow layer */}
                                                          {[0, 1, 2].map((i) => (
                                                            <g key={`shadow-${i}`}>
                                                              <text
                                                                fontSize="42"
                                                                fill="#330011"
                                                                opacity="0.6"
                                                                style={{ fontWeight: 'bold' }}
                                                              >
                                                                ↓
                                                                <animateMotion
                                                                  dur="2.2s"
                                                                  begin={`${i * 0.7}s`}
                                                                  repeatCount="indefinite"
                                                                  path="M 23 -2 Q -2 18 3 58 L 3 138"
                                                                />
                                                                <animate
                                                                  attributeName="opacity"
                                                                  values="0;0.2;0.6;0.6;0.6;0"
                                                                  dur="2.2s"
                                                                  begin={`${i * 0.7}s`}
                                                                  repeatCount="indefinite"
                                                                />
                                                              </text>
                                                            </g>
                                                          ))}
                                                          {/* Main 3D arrows with gradient and outline */}
                                                          {[0, 1, 2].map((i) => (
                                                            <g key={i}>
                                                              {/* Stroke outline for depth */}
                                                              <text
                                                                fontSize="42"
                                                                fill="none"
                                                                stroke="#ff3366"
                                                                strokeWidth="3"
                                                                style={{ fontWeight: 'bold' }}
                                                              >
                                                                ↓
                                                                <animateMotion
                                                                  dur="2.2s"
                                                                  begin={`${i * 0.7}s`}
                                                                  repeatCount="indefinite"
                                                                  path="M 25 0 Q 0 20 5 60 L 5 140"
                                                                >
                                                                  <mpath
                                                                    href={`#redDown-${row.strike}`}
                                                                  />
                                                                </animateMotion>
                                                                <animate
                                                                  attributeName="opacity"
                                                                  values="0;0.3;1;1;1;0"
                                                                  dur="2.2s"
                                                                  begin={`${i * 0.7}s`}
                                                                  repeatCount="indefinite"
                                                                />
                                                              </text>
                                                              {/* Inner fill with gradient */}
                                                              <text
                                                                fontSize="42"
                                                                fill="url(#redGrad-${row.strike})"
                                                                style={{
                                                                  filter: `drop-shadow(0 0 20px #ff1744) drop-shadow(0 0 35px #ff1744) drop-shadow(3px 3px 0px #330011) url(#redGlow-${row.strike})`,
                                                                  fontWeight: 'bold',
                                                                }}
                                                              >
                                                                ↓
                                                                <animateMotion
                                                                  dur="2.2s"
                                                                  begin={`${i * 0.7}s`}
                                                                  repeatCount="indefinite"
                                                                  path="M 25 0 Q 0 20 5 60 L 5 140"
                                                                >
                                                                  <mpath
                                                                    href={`#redDown-${row.strike}`}
                                                                  />
                                                                </animateMotion>
                                                                <animate
                                                                  attributeName="opacity"
                                                                  values="0;0.3;1;1;1;0"
                                                                  dur="2.2s"
                                                                  begin={`${i * 0.7}s`}
                                                                  repeatCount="indefinite"
                                                                />
                                                                <animateTransform
                                                                  attributeName="transform"
                                                                  type="scale"
                                                                  values="0.9;1.05;1;1;0.9"
                                                                  dur="2.2s"
                                                                  begin={`${i * 0.7}s`}
                                                                  repeatCount="indefinite"
                                                                  additive="sum"
                                                                />
                                                              </text>
                                                            </g>
                                                          ))}
                                                          <path
                                                            d="M 35 0 Q 15 20 15 60 L 15 140"
                                                            stroke="url(#redGrad-${row.strike})"
                                                            strokeWidth="4"
                                                            strokeDasharray="10,5"
                                                            fill="none"
                                                            opacity="0.8"
                                                            style={{
                                                              filter:
                                                                'drop-shadow(0 0 8px #ff1744)',
                                                            }}
                                                          />
                                                        </svg>
                                                      )}

                                                      {/* Horizontal rope at golden zone + Spinning pulley wheel */}
                                                      {!isMobile &&
                                                        isGoldenZone &&
                                                        (() => {
                                                          const wheelColor =
                                                            goldenRowIndex > currentPriceRowIndex
                                                              ? '#ff0000'
                                                              : '#00ff00'
                                                          const wheelDuration = isTurboMode
                                                            ? '0.5s'
                                                            : '2s' // Faster spin in turbo mode
                                                          return (
                                                            <>
                                                              {/* Spinning pulley wheel at golden zone */}
                                                              <svg
                                                                style={{
                                                                  position: 'absolute',
                                                                  left: `${mobileStrikeWidth + mobileExpWidth * 2 - 25}px`,
                                                                  top: '50%',
                                                                  width: '60px',
                                                                  height: '60px',
                                                                  pointerEvents: 'none',
                                                                  zIndex: 100,
                                                                  overflow: 'visible',
                                                                  transform: 'translateY(-50%)',
                                                                }}
                                                              >
                                                                <defs>
                                                                  <filter
                                                                    id={`pulleyGlow-${row.strike}`}
                                                                    x="-50%"
                                                                    y="-50%"
                                                                    width="200%"
                                                                    height="200%"
                                                                  >
                                                                    <feGaussianBlur
                                                                      stdDeviation="3"
                                                                      result="coloredBlur"
                                                                    />
                                                                    <feMerge>
                                                                      <feMergeNode in="coloredBlur" />
                                                                      <feMergeNode in="SourceGraphic" />
                                                                    </feMerge>
                                                                  </filter>
                                                                </defs>

                                                                {/* Smoke animation - only in turbo mode */}
                                                                {isTurboMode && (
                                                                  <>
                                                                    {[...Array(5)].map((_, i) => (
                                                                      <circle
                                                                        key={i}
                                                                        cx="30"
                                                                        cy="30"
                                                                        r="3"
                                                                        fill="#888"
                                                                        opacity="0"
                                                                      >
                                                                        <animate
                                                                          attributeName="cy"
                                                                          from="30"
                                                                          to="0"
                                                                          dur="2s"
                                                                          begin={`${i * 0.4}s`}
                                                                          repeatCount="indefinite"
                                                                        />
                                                                        <animate
                                                                          attributeName="cx"
                                                                          from="30"
                                                                          to={
                                                                            30 +
                                                                            (Math.random() - 0.5) *
                                                                              20
                                                                          }
                                                                          dur="2s"
                                                                          begin={`${i * 0.4}s`}
                                                                          repeatCount="indefinite"
                                                                        />
                                                                        <animate
                                                                          attributeName="r"
                                                                          from="2"
                                                                          to="8"
                                                                          dur="2s"
                                                                          begin={`${i * 0.4}s`}
                                                                          repeatCount="indefinite"
                                                                        />
                                                                        <animate
                                                                          attributeName="opacity"
                                                                          values="0;0.6;0.3;0"
                                                                          dur="2s"
                                                                          begin={`${i * 0.4}s`}
                                                                          repeatCount="indefinite"
                                                                        />
                                                                      </circle>
                                                                    ))}
                                                                  </>
                                                                )}

                                                                <g transform="translate(30, 30)">
                                                                  {/* Pulley shadow */}
                                                                  <circle
                                                                    cx="0"
                                                                    cy="0"
                                                                    r="22"
                                                                    fill="#333"
                                                                    opacity="0.5"
                                                                    style={{ filter: 'blur(4px)' }}
                                                                  />
                                                                  {/* Pulley outer ring - golden color with conditional outline */}
                                                                  <circle
                                                                    cx="0"
                                                                    cy="0"
                                                                    r="20"
                                                                    fill="#ffd700"
                                                                    stroke={wheelColor}
                                                                    strokeWidth="3"
                                                                    style={{
                                                                      filter: `url(#pulleyGlow-${row.strike})`,
                                                                    }}
                                                                  />
                                                                  {/* Inner dark ring */}
                                                                  <circle
                                                                    cx="0"
                                                                    cy="0"
                                                                    r="15"
                                                                    fill="#444"
                                                                  />
                                                                  {/* Spinning spokes - golden */}
                                                                  <g>
                                                                    <line
                                                                      x1="0"
                                                                      y1="-15"
                                                                      x2="0"
                                                                      y2="15"
                                                                      stroke="#ffd700"
                                                                      strokeWidth="3"
                                                                    />
                                                                    <line
                                                                      x1="-15"
                                                                      y1="0"
                                                                      x2="15"
                                                                      y2="0"
                                                                      stroke="#ffd700"
                                                                      strokeWidth="3"
                                                                    />
                                                                    <line
                                                                      x1="-10.5"
                                                                      y1="-10.5"
                                                                      x2="10.5"
                                                                      y2="10.5"
                                                                      stroke="#ffd700"
                                                                      strokeWidth="3"
                                                                    />
                                                                    <line
                                                                      x1="-10.5"
                                                                      y1="10.5"
                                                                      x2="10.5"
                                                                      y2="-10.5"
                                                                      stroke="#ffd700"
                                                                      strokeWidth="3"
                                                                    />
                                                                    <animateTransform
                                                                      attributeName="transform"
                                                                      type="rotate"
                                                                      from="0"
                                                                      to="360"
                                                                      dur={wheelDuration}
                                                                      repeatCount="indefinite"
                                                                    />
                                                                  </g>
                                                                  {/* Center bolt - golden */}
                                                                  <circle
                                                                    cx="0"
                                                                    cy="0"
                                                                    r="5"
                                                                    fill="#b8860b"
                                                                    stroke="#ffd700"
                                                                    strokeWidth="2"
                                                                  />
                                                                  {/* Metallic shine */}
                                                                  <circle
                                                                    cx="-5"
                                                                    cy="-5"
                                                                    r="8"
                                                                    fill="#fff"
                                                                    opacity="0.4"
                                                                  />
                                                                </g>
                                                              </svg>
                                                            </>
                                                          )
                                                        })()}
                                                    </>
                                                  )}
                                              </td>
                                              {showNormalColumn && (
                                                <td
                                                  className={`px-1 py-3 ${useBloombergTheme ? `border-l ${borderColorDivider}` : ''}`}
                                                  style={{
                                                    width: `${mobileExpWidth}px`,
                                                    minWidth: `${mobileExpWidth}px`,
                                                    maxWidth: `${mobileExpWidth}px`,
                                                  }}
                                                >
                                                  <div
                                                    className={`${normalCellStyle.bg} ${normalCellStyle.ring} px-1 py-3 ${useBloombergTheme ? 'bb-cell' : 'rounded-lg'} text-center font-mono transition-all`}
                                                  >
                                                    <div
                                                      className={`font-bold mb-1 ${normalCellStyle.text}`}
                                                      style={{
                                                        fontSize: isMobile ? '0.65rem' : '1.5rem',
                                                      }}
                                                    >
                                                      {formatCurrency(netGEX)}
                                                    </div>
                                                  </div>
                                                </td>
                                              )}
                                              {showDealerColumn && (
                                                <td
                                                  className={`px-1 py-3 ${useBloombergTheme ? `border-l ${borderColorDivider}` : ''}`}
                                                  style={{
                                                    width: `${mobileExpWidth}px`,
                                                    minWidth: `${mobileExpWidth}px`,
                                                    maxWidth: `${mobileExpWidth}px`,
                                                  }}
                                                >
                                                  <div
                                                    className={`${dealerCellStyle.bg} ${dealerCellStyle.ring} px-1 py-3 ${useBloombergTheme ? 'bb-cell' : 'rounded-lg'} text-center font-mono transition-all`}
                                                  >
                                                    <div
                                                      className={`font-bold mb-1 ${dealerCellStyle.text}`}
                                                      style={{
                                                        fontSize: isMobile ? '0.65rem' : '1.5rem',
                                                      }}
                                                    >
                                                      {formatCurrency(netDealer)}
                                                    </div>
                                                  </div>
                                                </td>
                                              )}
                                            </tr>
                                          )
                                        })
                                      })()}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )
                          })
                        })()}
                      </div>
                    </div>
                  ) : /* Show multiple tables/charts side by side when multiple modes are enabled OR when OI is selected alone */
                  showOI ||
                    (showGEX && showDealer) ||
                    (showGEX && showFlowGEX) ||
                    (showDealer && showFlowGEX) ||
                    (showGEX && showDealer && showFlowGEX) ? (
                    <div
                      className="flex overflow-x-auto"
                      style={{
                        gap:
                          typeof window !== 'undefined' && window.innerWidth < 768 ? '2px' : '12px',
                      }}
                    >
                      {/* OI/GEX Charts - Show when OI checkbox is active */}
                      {showOI && (
                        <div
                          className="flex-shrink-0"
                          style={{
                            width: activeTableCount === 2 ? '1100px' : '1200px',
                            minWidth: activeTableCount === 2 ? '1100px' : '1200px',
                          }}
                        >
                          <OIGEXTab selectedTicker={selectedTicker} />
                        </div>
                      )}
                      {(() => {
                        // Calculate table width based on context
                        const tableWidths: string[] = []

                        if (showOI && activeTableCount === 1) {
                          // OI + 1 table: table gets 900px
                          tableWidths.push('900px')
                        } else if (showOI && activeTableCount === 2) {
                          // OI + 2 tables: each table gets 895px
                          tableWidths.push('895px', '895px')
                        } else if (!showOI && activeTableCount === 2 && duoMode) {
                          // DUO MODE: 2 tables fit in width of 1 table - each gets 540px (1080px total / 2)
                          tableWidths.push('540px', '540px')
                        } else if (!showOI && activeTableCount === 2) {
                          // 2 tables only: split 1775px between 2 tables (1775 - 1px gap = 1774 / 2 = 887px each)
                          tableWidths.push('887px', '887px')
                        } else if (!showOI && activeTableCount === 3) {
                          // 3 tables only: split 2662px between 3 tables (2662 - 2px gaps = 2660 / 3 = 886.67px each)
                          tableWidths.push('887px', '887px', '886px')
                        }

                        // Mobile detection - needed for getTableWidth function
                        const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

                        let currentTableIndex = 0
                        const getTableWidth = () => {
                          // On mobile, enforce equal widths so tables don't collapse when empty
                          if (isMobile) {
                            if (activeTableCount === 3) {
                              return { width: 'calc(33.33% - 2px)', minWidth: 'calc(33.33% - 2px)' }
                            } else if (activeTableCount === 2) {
                              return { width: 'calc(50% - 1px)', minWidth: 'calc(50% - 1px)' }
                            }
                            return undefined
                          }
                          if (tableWidths.length > 0 && currentTableIndex < tableWidths.length) {
                            return {
                              width: tableWidths[currentTableIndex],
                              minWidth: tableWidths[currentTableIndex++],
                            }
                          }
                          return undefined
                        }

                        // Mobile/Duo expiration splitting: show fewer expirations per table to fit on screen
                        const allThreeActive = showGEX && showDealer && showFlowGEX
                        const mobileStrikeWidth = isMobile
                          ? 45
                          : allThreeActive
                            ? Math.round(strikeColWidth * 0.56)
                            : strikeColWidth
                        let mobileExpWidth = isMobile ? 82 : allThreeActive ? 50 : 90

                        // Duo mode adjustment: ONLY when duo button is active AND both tables are showing
                        if (duoMode && showGEX && showDealer && !isMobile) {
                          mobileExpWidth = allThreeActive ? 50 : 70
                        }

                        let table1Expirations = expirations
                        let table2Expirations = expirations
                        let table3Expirations = expirations

                        // Duo/trio mode on desktop: limit expirations per table to fit side-by-side
                        if (duoMode && showGEX && showDealer && !isMobile) {
                          // Duo mode (no flow map): 6 expirations
                          table1Expirations = expirations.slice(0, 6)
                          table2Expirations = expirations.slice(0, 6)
                          table3Expirations = expirations.slice(0, 6)
                        } else if (allThreeActive && !duoMode && !isMobile) {
                          // All three tables without duo mode: 8 expirations
                          table1Expirations = expirations.slice(0, 8)
                          table2Expirations = expirations.slice(0, 8)
                          table3Expirations = expirations.slice(0, 8)
                        }

                        if (isMobile) {
                          if (activeTableCount === 3) {
                            // 3 tables on mobile: each gets 1 expiration
                            table1Expirations = expirations.slice(0, 1)
                            table2Expirations = expirations.slice(0, 1)
                            table3Expirations = expirations.slice(0, 1)
                          } else if (activeTableCount === 2) {
                            // 2 tables on mobile: each gets 2 expirations
                            table1Expirations = expirations.slice(0, 2)
                            table2Expirations = expirations.slice(0, 2)
                            table3Expirations = expirations.slice(0, 2)
                          }
                        }

                        return (
                          <>
                            {/* GEX/NORMAL TABLE */}
                            {showGEX && (
                              <div className="flex-shrink-0" style={getTableWidth()}>
                                <div
                                  className={`${
                                    useBloombergTheme
                                      ? 'bg-gradient-to-r from-emerald-950 via-black to-emerald-950 border-emerald-500/60 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                                      : 'bg-black border-gray-700'
                                  } border border-b-0 px-4 py-3 relative overflow-hidden`}
                                >
                                  {useBloombergTheme && (
                                    <div
                                      className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 via-transparent to-emerald-500/10 animate-pulse"
                                      style={{ animationDuration: '3s' }}
                                    ></div>
                                  )}
                                  <div className="flex items-center justify-center gap-3 relative z-10">
                                    {useBloombergTheme && (
                                      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]"></div>
                                    )}
                                    <h3
                                      className={`text-lg font-black uppercase tracking-widest text-center ${useBloombergTheme ? 'text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]' : 'text-white'}`}
                                      style={{
                                        letterSpacing: '0.2em',
                                        textShadow: useBloombergTheme
                                          ? '0 0 20px rgba(52,211,153,0.5)'
                                          : '0 2px 4px rgba(0,0,0,0.8)',
                                      }}
                                    >
                                      NORMAL
                                    </h3>
                                    {useBloombergTheme && (
                                      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]"></div>
                                    )}
                                  </div>
                                </div>
                                <div
                                  className={`${useBloombergTheme ? 'bg-black border-white/20' : 'bg-gray-900 border-gray-700'} border overflow-x-auto table-scroll-container`}
                                  style={{
                                    maxHeight: isMobile
                                      ? 'calc(74.78vh - 225px)'
                                      : 'calc(74.78vh - 270px)',
                                    overflowX: 'auto',
                                  }}
                                >
                                  <table
                                    style={{
                                      minWidth: `${mobileStrikeWidth + table1Expirations.length * mobileExpWidth}px`,
                                      width: '100%',
                                    }}
                                  >
                                    <thead
                                      className={`sticky top-0 z-20 ${useBloombergTheme ? 'bb-table-header' : 'bg-black backdrop-blur-sm'}`}
                                      style={{
                                        top: '0',
                                        backgroundColor: useBloombergTheme ? undefined : '#000000',
                                      }}
                                    >
                                      <tr
                                        className={
                                          useBloombergTheme
                                            ? ''
                                            : 'border-b border-gray-700 bg-black'
                                        }
                                      >
                                        <th
                                          className={`px-2 py-3 text-left sticky left-0 bg-black z-30 border-r ${borderColor} shadow-xl`}
                                          style={{
                                            width: `${mobileStrikeWidth}px`,
                                            minWidth: `${mobileStrikeWidth}px`,
                                            maxWidth: `${mobileStrikeWidth}px`,
                                          }}
                                        >
                                          <div
                                            className={
                                              useBloombergTheme
                                                ? 'bb-header text-xs md:text-sm text-gray-400'
                                                : 'text-xs md:text-sm font-bold text-white uppercase'
                                            }
                                          >
                                            Strike
                                          </div>
                                        </th>
                                        {table1Expirations.map((exp) => (
                                          <th
                                            key={exp}
                                            className={`text-center bg-black border-l border-r ${borderColorDivider} shadow-lg px-2 py-3`}
                                            style={{
                                              width: `${mobileExpWidth}px`,
                                              minWidth: `${mobileExpWidth}px`,
                                              maxWidth: `${mobileExpWidth}px`,
                                            }}
                                          >
                                            <div
                                              className={`${duoMode && !allThreeActive ? 'text-[10px] md:text-xs' : 'text-xs md:text-sm'} font-bold text-white uppercase whitespace-nowrap`}
                                            >
                                              {formatDate(exp)}
                                            </div>
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {allCalculatedData
                                        .filter((row) => {
                                          const strikeRange = getStrikeRange(currentPrice)
                                          return (
                                            row.strike >= strikeRange.min &&
                                            row.strike <= strikeRange.max
                                          )
                                        })
                                        .map((row, idx) => {
                                          // Use historical price when scrubbing, otherwise current price
                                          const priceForRow = historicalTimestamp
                                            ? historicalPrice
                                            : currentPrice
                                          const closestStrike =
                                            priceForRow > 0
                                              ? data.reduce((closest, current) =>
                                                  Math.abs(current.strike - priceForRow) <
                                                  Math.abs(closest.strike - priceForRow)
                                                    ? current
                                                    : closest
                                                ).strike
                                              : 0

                                          const isCurrentPriceRow =
                                            priceForRow > 0 && row.strike === closestStrike

                                          return (
                                            <tr
                                              key={idx}
                                              className={`hover:bg-gray-800/20 transition-colors ${
                                                isCurrentPriceRow
                                                  ? 'border-2 border-orange-500'
                                                  : `border-b ${useBloombergTheme ? 'border-white/10' : 'border-gray-800/30'}`
                                              }`}
                                            >
                                              <td
                                                className={`px-2 py-3 font-bold sticky left-0 z-10 border-r ${borderColor} bg-black`}
                                                style={{
                                                  width: `${mobileStrikeWidth}px`,
                                                  minWidth: `${mobileStrikeWidth}px`,
                                                  maxWidth: `${mobileStrikeWidth}px`,
                                                }}
                                              >
                                                <div
                                                  className={`text-base md:text-lg font-mono font-bold ${isCurrentPriceRow ? 'text-orange-500' : 'text-white'}`}
                                                >
                                                  {row.strike.toFixed(1)}
                                                </div>
                                              </td>
                                              {table1Expirations.map((exp) => {
                                                // Use allGEXCalculatedData for NORMAL table (Net GEX formula)
                                                const calculatedRow = allGEXCalculatedData.find(
                                                  (r) => r.strike === row.strike
                                                )
                                                const gexValue = calculatedRow?.[exp] as any
                                                const displayValue =
                                                  (gexValue?.call || 0) + (gexValue?.put || 0)
                                                const cellStyle = getCellStyle(
                                                  displayValue,
                                                  false,
                                                  row.strike,
                                                  exp,
                                                  gexTopValues,
                                                  'gex'
                                                )

                                                return (
                                                  <td
                                                    key={exp}
                                                    className={`px-1 py-3 ${useBloombergTheme ? `border-l ${borderColorDivider}` : ''}`}
                                                    style={{
                                                      width: `${mobileExpWidth}px`,
                                                      minWidth: `${mobileExpWidth}px`,
                                                      maxWidth: `${mobileExpWidth}px`,
                                                    }}
                                                  >
                                                    <div
                                                      className={`${cellStyle.bg} ${cellStyle.ring} px-1 py-3 ${useBloombergTheme ? 'bb-cell' : 'rounded-lg'} text-center font-mono transition-all`}
                                                    >
                                                      <div className="text-sm md:text-base font-bold mb-1">
                                                        {formatCurrency(displayValue)}
                                                      </div>
                                                    </div>
                                                  </td>
                                                )
                                              })}
                                            </tr>
                                          )
                                        })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                            {/* MM ACTIVITY (Net Dealer) Table - conditionally rendered */}
                            {showDealer && (
                              <div
                                key={`dealer-${liveMode}-${liveOIData.size}`}
                                className="flex-shrink-0"
                                style={
                                  showOI && activeTableCount === 1
                                    ? { width: '900px', minWidth: '900px' }
                                    : getTableWidth()
                                }
                              >
                                <div
                                  className={`${
                                    useBloombergTheme
                                      ? 'bg-gradient-to-r from-amber-950 via-black to-amber-950 border-amber-500/60 shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                                      : 'bg-black border-gray-700'
                                  } border border-b-0 px-4 py-3 relative overflow-hidden`}
                                >
                                  {useBloombergTheme && (
                                    <div
                                      className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-transparent to-amber-500/10 animate-pulse"
                                      style={{ animationDuration: '3s' }}
                                    ></div>
                                  )}
                                  <div className="flex items-center justify-center gap-3 relative z-10">
                                    {useBloombergTheme && (
                                      <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.8)]"></div>
                                    )}
                                    <h3
                                      className={`text-lg font-black uppercase tracking-widest text-center ${useBloombergTheme ? 'text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]' : 'text-yellow-400'}`}
                                      style={{
                                        letterSpacing: '0.2em',
                                        textShadow: useBloombergTheme
                                          ? '0 0 20px rgba(251,191,36,0.5)'
                                          : '0 2px 4px rgba(0,0,0,0.8)',
                                      }}
                                    >
                                      DEALER
                                    </h3>
                                    {useBloombergTheme && (
                                      <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.8)]"></div>
                                    )}
                                  </div>
                                </div>
                                <div
                                  className={`${useBloombergTheme ? 'bg-black border-white/20' : 'bg-gray-900 border-gray-700'} border overflow-x-auto table-scroll-container`}
                                  style={{
                                    maxHeight: isMobile
                                      ? 'calc(74.78vh - 225px)'
                                      : 'calc(74.78vh - 270px)',
                                    overflowX: 'auto',
                                  }}
                                >
                                  <table
                                    style={{
                                      minWidth: `${mobileStrikeWidth + table2Expirations.length * mobileExpWidth}px`,
                                      width: '100%',
                                    }}
                                  >
                                    <thead
                                      className={`sticky top-0 z-20 ${useBloombergTheme ? 'bb-table-header' : 'bg-black backdrop-blur-sm'}`}
                                      style={{
                                        top: '0',
                                        backgroundColor: useBloombergTheme ? undefined : '#000000',
                                      }}
                                    >
                                      <tr
                                        className={
                                          useBloombergTheme
                                            ? ''
                                            : 'border-b border-gray-700 bg-black'
                                        }
                                      >
                                        <th
                                          className={`px-2 py-3 text-left sticky left-0 bg-black z-30 border-r ${borderColor} shadow-xl`}
                                          style={{
                                            width: `${mobileStrikeWidth}px`,
                                            minWidth: `${mobileStrikeWidth}px`,
                                            maxWidth: `${mobileStrikeWidth}px`,
                                          }}
                                        >
                                          <div
                                            className={
                                              useBloombergTheme
                                                ? 'bb-header text-xs md:text-sm text-gray-400'
                                                : 'text-xs md:text-sm font-bold text-white uppercase'
                                            }
                                          >
                                            Strike
                                          </div>
                                        </th>
                                        {table2Expirations.map((exp) => (
                                          <th
                                            key={exp}
                                            className={`text-center bg-black border-l border-r ${borderColorDivider} shadow-lg px-2 py-3`}
                                            style={{
                                              width: `${mobileExpWidth}px`,
                                              minWidth: `${mobileExpWidth}px`,
                                              maxWidth: `${mobileExpWidth}px`,
                                            }}
                                          >
                                            <div
                                              className={`${duoMode && !allThreeActive ? 'text-[10px] md:text-xs' : 'text-xs md:text-sm'} font-bold text-white uppercase whitespace-nowrap`}
                                            >
                                              {formatDate(exp)}
                                            </div>
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {allCalculatedData
                                        .filter((row) => {
                                          const strikeRange = getStrikeRange(currentPrice)
                                          return (
                                            row.strike >= strikeRange.min &&
                                            row.strike <= strikeRange.max
                                          )
                                        })
                                        .map((row, idx) => {
                                          // Use historical price when scrubbing, otherwise current price
                                          const priceForRow = historicalTimestamp
                                            ? historicalPrice
                                            : currentPrice
                                          const closestStrike =
                                            priceForRow > 0
                                              ? data.reduce((closest, current) =>
                                                  Math.abs(current.strike - priceForRow) <
                                                  Math.abs(closest.strike - priceForRow)
                                                    ? current
                                                    : closest
                                                ).strike
                                              : 0

                                          const isCurrentPriceRow =
                                            priceForRow > 0 && row.strike === closestStrike

                                          return (
                                            <tr
                                              key={idx}
                                              className={`hover:bg-gray-800/20 transition-colors ${
                                                isCurrentPriceRow
                                                  ? 'border-2 border-orange-500'
                                                  : `border-b ${useBloombergTheme ? 'border-white/10' : 'border-gray-800/30'}`
                                              }`}
                                            >
                                              <td
                                                className={`px-2 py-3 font-bold sticky left-0 z-10 border-r ${borderColor} bg-black`}
                                                style={{
                                                  width: `${mobileStrikeWidth}px`,
                                                  minWidth: `${mobileStrikeWidth}px`,
                                                  maxWidth: `${mobileStrikeWidth}px`,
                                                }}
                                              >
                                                <div
                                                  className={`text-base md:text-lg font-mono font-bold ${isCurrentPriceRow ? 'text-orange-500' : 'text-white'}`}
                                                >
                                                  {row.strike.toFixed(1)}
                                                </div>
                                              </td>
                                              {table2Expirations.map((exp) => {
                                                // Use allDealerCalculatedData for MM ACTIVITY table (Net Dealer formula)
                                                const calculatedRow = allDealerCalculatedData.find(
                                                  (r) => r.strike === row.strike
                                                )
                                                const dealerValue = calculatedRow?.[exp] as any
                                                const displayValue =
                                                  (dealerValue?.call || 0) + (dealerValue?.put || 0)
                                                const cellStyle = getCellStyle(
                                                  displayValue,
                                                  false,
                                                  row.strike,
                                                  exp,
                                                  dealerTopValues,
                                                  'dealer'
                                                )

                                                return (
                                                  <td
                                                    key={exp}
                                                    className={`px-1 py-3 ${useBloombergTheme ? `border-l ${borderColorDivider}` : ''}`}
                                                    style={{
                                                      width: `${mobileExpWidth}px`,
                                                      minWidth: `${mobileExpWidth}px`,
                                                      maxWidth: `${mobileExpWidth}px`,
                                                    }}
                                                  >
                                                    <div
                                                      className={`${cellStyle.bg} ${cellStyle.ring} px-1 py-3 ${useBloombergTheme ? 'bb-cell' : 'rounded-lg'} text-center font-mono transition-all ${
                                                        cellStyle.clusterPosition === 'top'
                                                          ? `border-t-[3px] border-l-[3px] border-r-[3px] ${cellStyle.clusterColor === 'green' ? 'border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)]' : 'border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]'}`
                                                          : cellStyle.clusterPosition === 'middle'
                                                            ? `border-l-[3px] border-r-[3px] ${cellStyle.clusterColor === 'green' ? 'border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)]' : 'border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]'}`
                                                            : cellStyle.clusterPosition === 'bottom'
                                                              ? `border-b-[3px] border-l-[3px] border-r-[3px] ${cellStyle.clusterColor === 'green' ? 'border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)]' : 'border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]'}`
                                                              : ''
                                                      }`}
                                                    >
                                                      <div className="text-sm md:text-base font-bold mb-1">
                                                        {formatCurrency(displayValue)}
                                                      </div>
                                                    </div>
                                                  </td>
                                                )
                                              })}
                                            </tr>
                                          )
                                        })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                            {/* FLOW MAP Table - conditionally rendered */}
                            {showFlowGEX && (
                              <div
                                key={`flowmap-${liveMode}-${liveOIData.size}`}
                                className="flex-shrink-0"
                                style={
                                  showOI && activeTableCount === 1
                                    ? { width: '900px', minWidth: '900px' }
                                    : getTableWidth()
                                }
                              >
                                <div
                                  className={`${
                                    useBloombergTheme
                                      ? 'bg-gradient-to-r from-orange-950 via-black to-orange-950 border-orange-500/60 shadow-[0_0_15px_rgba(249,115,22,0.3)]'
                                      : 'bg-black border-gray-700'
                                  } border border-b-0 px-4 py-3 relative overflow-hidden`}
                                >
                                  {useBloombergTheme && (
                                    <div
                                      className="absolute inset-0 bg-gradient-to-r from-orange-500/10 via-transparent to-orange-500/10 animate-pulse"
                                      style={{ animationDuration: '3s' }}
                                    ></div>
                                  )}
                                  <div className="flex items-center justify-center gap-3 relative z-10">
                                    {useBloombergTheme && (
                                      <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse shadow-[0_0_8px_rgba(251,146,60,0.8)]"></div>
                                    )}
                                    <h3
                                      className={`text-lg font-black uppercase tracking-widest text-center ${useBloombergTheme ? 'text-orange-400 drop-shadow-[0_0_10px_rgba(251,146,60,0.5)]' : 'text-orange-400'}`}
                                      style={{
                                        letterSpacing: '0.2em',
                                        textShadow: useBloombergTheme
                                          ? '0 0 20px rgba(251,146,60,0.5)'
                                          : '0 2px 4px rgba(0,0,0,0.8)',
                                      }}
                                    >
                                      FLOW MAP
                                    </h3>
                                    {useBloombergTheme && (
                                      <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse shadow-[0_0_8px_rgba(251,146,60,0.8)]"></div>
                                    )}
                                  </div>
                                </div>
                                <div
                                  className={`${useBloombergTheme ? 'bg-black border-white/20' : 'bg-gray-900 border-gray-700'} border overflow-x-auto table-scroll-container`}
                                  style={{
                                    maxHeight: isMobile
                                      ? 'calc(74.78vh - 225px)'
                                      : 'calc(74.78vh - 270px)',
                                    overflowX: 'auto',
                                  }}
                                >
                                  <table
                                    style={{
                                      minWidth: `${mobileStrikeWidth + table3Expirations.length * mobileExpWidth}px`,
                                      width: '100%',
                                    }}
                                  >
                                    <thead
                                      className={`sticky top-0 z-20 ${useBloombergTheme ? 'bb-table-header' : 'bg-black backdrop-blur-sm'}`}
                                      style={{
                                        top: '0',
                                        backgroundColor: useBloombergTheme ? undefined : '#000000',
                                      }}
                                    >
                                      <tr
                                        className={
                                          useBloombergTheme
                                            ? ''
                                            : 'border-b border-gray-700 bg-black'
                                        }
                                      >
                                        <th
                                          className={`px-2 py-3 text-left sticky left-0 bg-black z-30 border-r ${borderColor} shadow-xl`}
                                          style={{
                                            width: `${mobileStrikeWidth}px`,
                                            minWidth: `${mobileStrikeWidth}px`,
                                            maxWidth: `${mobileStrikeWidth}px`,
                                          }}
                                        >
                                          <div
                                            className={
                                              useBloombergTheme
                                                ? 'bb-header text-xs md:text-sm text-gray-400'
                                                : 'text-xs md:text-sm font-bold text-white uppercase'
                                            }
                                          >
                                            Strike
                                          </div>
                                        </th>
                                        {table3Expirations.map((exp) => (
                                          <th
                                            key={exp}
                                            className={`text-center bg-black border-l border-r ${borderColorDivider} shadow-lg px-2 py-3`}
                                            style={{
                                              width: `${mobileExpWidth}px`,
                                              minWidth: `${mobileExpWidth}px`,
                                              maxWidth: `${mobileExpWidth}px`,
                                            }}
                                          >
                                            <div className="text-xs md:text-sm font-bold text-white uppercase whitespace-nowrap">
                                              {formatDate(exp)}
                                            </div>
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {allFlowWeightedDealerData
                                        .filter((row) => {
                                          const strikeRange = getStrikeRange(currentPrice)
                                          return (
                                            row.strike >= strikeRange.min &&
                                            row.strike <= strikeRange.max
                                          )
                                        })
                                        .map((row, idx) => {
                                          // Use historical price when scrubbing, otherwise current price
                                          const priceForRow = historicalTimestamp
                                            ? historicalPrice
                                            : currentPrice
                                          const closestStrike =
                                            priceForRow > 0
                                              ? data.reduce((closest, current) =>
                                                  Math.abs(current.strike - priceForRow) <
                                                  Math.abs(closest.strike - priceForRow)
                                                    ? current
                                                    : closest
                                                ).strike
                                              : 0

                                          const isCurrentPriceRow =
                                            priceForRow > 0 && row.strike === closestStrike

                                          return (
                                            <tr
                                              key={idx}
                                              className={`hover:bg-gray-800/20 transition-colors ${
                                                isCurrentPriceRow
                                                  ? 'border-2 border-orange-500'
                                                  : `border-b ${useBloombergTheme ? 'border-white/10' : 'border-gray-800/30'}`
                                              }`}
                                            >
                                              <td
                                                className={`px-2 py-3 font-bold sticky left-0 z-10 border-r ${borderColor} bg-black`}
                                                style={{
                                                  width: `${mobileStrikeWidth}px`,
                                                  minWidth: `${mobileStrikeWidth}px`,
                                                  maxWidth: `${mobileStrikeWidth}px`,
                                                }}
                                              >
                                                <div
                                                  className={`text-base md:text-lg font-mono font-bold ${isCurrentPriceRow ? 'text-orange-500' : 'text-white'}`}
                                                >
                                                  {row.strike.toFixed(1)}
                                                </div>
                                              </td>
                                              {table3Expirations.map((exp) => {
                                                const value = row[exp] as any
                                                const displayValue =
                                                  (value?.call || 0) + (value?.put || 0)
                                                const cellStyle = getCellStyle(
                                                  displayValue,
                                                  false,
                                                  row.strike,
                                                  exp,
                                                  flowTopValues
                                                )

                                                return (
                                                  <td
                                                    key={exp}
                                                    className={`px-1 py-3 ${useBloombergTheme ? `border-l ${borderColorDivider}` : ''}`}
                                                    style={{
                                                      width: `${mobileExpWidth}px`,
                                                      minWidth: `${mobileExpWidth}px`,
                                                      maxWidth: `${mobileExpWidth}px`,
                                                    }}
                                                  >
                                                    <div
                                                      className={`${cellStyle.bg} ${cellStyle.ring} px-1 py-3 ${useBloombergTheme ? 'bb-cell' : 'rounded-lg'} text-center font-mono transition-all`}
                                                    >
                                                      <div className="text-sm md:text-base font-bold mb-1">
                                                        {formatCurrency(displayValue)}
                                                      </div>
                                                    </div>
                                                  </td>
                                                )
                                              })}
                                            </tr>
                                          )
                                        })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  ) : (
                    /* Original single table when only one mode is active */
                    <div>
                      {/* Title banner for single-table mode */}
                      <div
                        className={`${
                          showGEX
                            ? useBloombergTheme
                              ? 'bg-gradient-to-r from-emerald-950 via-black to-emerald-950 border-emerald-500/60 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                              : 'bg-black border-gray-700'
                            : showDealer
                              ? useBloombergTheme
                                ? 'bg-gradient-to-r from-amber-950 via-black to-amber-950 border-amber-500/60 shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                                : 'bg-black border-gray-700'
                              : showFlowGEX
                                ? useBloombergTheme
                                  ? 'bg-gradient-to-r from-orange-950 via-black to-orange-950 border-orange-500/60 shadow-[0_0_15px_rgba(249,115,22,0.3)]'
                                  : 'bg-black border-gray-700'
                                : 'bg-black border-gray-700'
                        } border border-b-0 px-4 py-3 relative overflow-hidden`}
                      >
                        <div className="flex items-center justify-center gap-3 relative z-10">
                          {useBloombergTheme && (
                            <div
                              className={`w-2 h-2 rounded-full animate-pulse ${showGEX ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : showDealer ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]' : 'bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.8)]'}`}
                            ></div>
                          )}
                          <h3
                            className={`text-lg font-black uppercase tracking-widest text-center ${
                              useBloombergTheme
                                ? showGEX
                                  ? 'text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]'
                                  : showDealer
                                    ? 'text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]'
                                    : 'text-orange-400 drop-shadow-[0_0_10px_rgba(251,146,60,0.5)]'
                                : 'text-white'
                            }`}
                            style={{ letterSpacing: '0.2em' }}
                          >
                            {showGEX
                              ? 'NORMAL'
                              : showDealer
                                ? 'DEALER'
                                : showFlowGEX
                                  ? 'FLOW MAP'
                                  : ''}
                          </h3>
                          {useBloombergTheme && (
                            <div
                              className={`w-2 h-2 rounded-full animate-pulse ${showGEX ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : showDealer ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]' : 'bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.8)]'}`}
                            ></div>
                          )}
                        </div>
                      </div>
                      <div
                        className={`${useBloombergTheme ? 'bg-black border-white/20' : 'bg-gray-900 border-gray-700'} border overflow-x-auto table-scroll-container`}
                        style={{
                          maxHeight:
                            typeof window !== 'undefined' && window.innerWidth < 768
                              ? 'calc(74.78vh - 225px)'
                              : 'calc(74.78vh - 270px)',
                          overflowX: 'auto',
                        }}
                      >
                        <table
                          style={{
                            minWidth: `${strikeColWidth + expirations.length * 90}px`,
                            width: '100%',
                          }}
                        >
                          <thead
                            className={`sticky top-0 z-20 ${useBloombergTheme ? 'bb-table-header' : 'bg-black'}`}
                          >
                            <tr
                              className={
                                useBloombergTheme ? '' : 'border-b border-gray-700 bg-black'
                              }
                            >
                              <th
                                className={`px-3 py-4 text-left sticky left-0 ${useBloombergTheme ? 'bg-black' : 'bg-gradient-to-br from-black via-gray-900 to-black'} z-30 border-r ${borderColor} shadow-xl`}
                                style={{
                                  width: `${strikeColWidth}px`,
                                  minWidth: `${strikeColWidth}px`,
                                  maxWidth: `${strikeColWidth}px`,
                                }}
                              >
                                <div
                                  className={
                                    useBloombergTheme
                                      ? 'bb-header text-xs md:text-sm text-gray-400'
                                      : 'text-xs md:text-sm font-bold text-white uppercase'
                                  }
                                >
                                  Strike
                                </div>
                              </th>
                              {expirations.map((exp) => (
                                <th
                                  key={exp}
                                  className={`text-center ${useBloombergTheme ? 'bg-black' : 'bg-gradient-to-br from-black via-gray-900 to-black'} border-l border-r ${borderColorDivider} shadow-lg px-4 py-4`}
                                  style={{ width: '90px', minWidth: '90px', maxWidth: '90px' }}
                                >
                                  <div className="text-xs md:text-sm font-bold text-white uppercase whitespace-nowrap">
                                    {formatDate(exp)}
                                  </div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(showFlowGEX
                              ? allFlowWeightedDealerData
                              : showDealer
                                ? allDealerCalculatedData
                                : allGEXCalculatedData
                            )
                              .filter((row) => {
                                const strikeRange = getStrikeRange(currentPrice)
                                return (
                                  row.strike >= strikeRange.min && row.strike <= strikeRange.max
                                )
                              })
                              .map((row, idx) => {
                                // Find the single closest strike to current price (use historical when scrubbing)
                                const priceForRow = historicalTimestamp
                                  ? historicalPrice
                                  : currentPrice
                                const closestStrike =
                                  priceForRow > 0
                                    ? data.reduce((closest, current) =>
                                        Math.abs(current.strike - priceForRow) <
                                        Math.abs(closest.strike - priceForRow)
                                          ? current
                                          : closest
                                      ).strike
                                    : 0

                                // Find the strike with the highest GEX value using the same logic as cell highlighting
                                // This ensures purple row highlight is always on the same strike as the gold cell
                                const tolerance = 1
                                const largestValueStrike =
                                  allCalculatedData.length > 0 && topValues.highest > 0
                                    ? (allCalculatedData.find((row) => {
                                        return expirations.some((exp) => {
                                          const value = row[exp] as {
                                            call: number
                                            put: number
                                            net: number
                                          }

                                          // For Net modes, check the net value
                                          if (gexMode === 'Net GEX' || gexMode === 'Net Dealer') {
                                            const netAbs = Math.abs(value?.net || 0)
                                            return Math.abs(netAbs - topValues.highest) < tolerance
                                          }

                                          // For split modes, check call and put separately
                                          const callAbs = Math.abs(value?.call || 0)
                                          const putAbs = Math.abs(value?.put || 0)
                                          return (
                                            Math.abs(callAbs - topValues.highest) < tolerance ||
                                            Math.abs(putAbs - topValues.highest) < tolerance
                                          )
                                        })
                                      })?.strike ?? 0)
                                    : 0

                                // Find the cell with largest VEX value (only when VEX is enabled)
                                const isCurrentPriceRow =
                                  currentPrice > 0 && row.strike === closestStrike
                                const isLargestValueRow = row.strike === largestValueStrike

                                return (
                                  <tr
                                    key={idx}
                                    className={`hover:bg-gray-800/20 transition-colors ${
                                      isCurrentPriceRow
                                        ? 'border-2 border-orange-500'
                                        : `border-b ${useBloombergTheme ? 'border-white/10' : 'border-gray-800/30'}`
                                    }`}
                                  >
                                    <td
                                      className={`px-3 py-4 font-bold sticky left-0 z-10 border-r ${borderColor} bg-black`}
                                      style={{
                                        width: `${strikeColWidth}px`,
                                        minWidth: `${strikeColWidth}px`,
                                        maxWidth: `${strikeColWidth}px`,
                                      }}
                                    >
                                      <div
                                        className={`text-base md:text-lg font-mono font-bold ${isCurrentPriceRow ? 'text-orange-500' : 'text-white'}`}
                                      >
                                        {row.strike.toFixed(1)}
                                      </div>
                                    </td>
                                    {expirations.map((exp) => {
                                      const value = row[exp] as any
                                      const displayValue = (value?.call || 0) + (value?.put || 0)

                                      // Determine which top values and table type to use
                                      const modeTopValues = showFlowGEX
                                        ? flowTopValues
                                        : showDealer
                                          ? dealerTopValues
                                          : gexTopValues
                                      const tableType: 'gex' | 'dealer' | undefined = showFlowGEX
                                        ? undefined
                                        : showDealer
                                          ? 'dealer'
                                          : 'gex'

                                      const cellStyle = getCellStyle(
                                        displayValue,
                                        false,
                                        row.strike,
                                        exp,
                                        modeTopValues,
                                        tableType
                                      )
                                      return (
                                        <td
                                          key={exp}
                                          className={`px-1 py-3 ${useBloombergTheme ? `border-l ${borderColorDivider}` : ''}`}
                                          style={{
                                            width: '90px',
                                            minWidth: '90px',
                                            maxWidth: '90px',
                                          }}
                                        >
                                          {/* Always display net value in a single cell */}
                                          <div
                                            className={`${cellStyle.bg} ${cellStyle.ring} px-1 py-3 ${useBloombergTheme ? 'bb-cell' : 'rounded-lg'} text-center font-mono transition-all hover:scale-105 ${
                                              cellStyle.clusterPosition === 'top'
                                                ? `border-t-[3px] border-l-[3px] border-r-[3px] ${cellStyle.clusterColor === 'green' ? 'border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)]' : 'border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]'}`
                                                : cellStyle.clusterPosition === 'middle'
                                                  ? `border-l-[3px] border-r-[3px] ${cellStyle.clusterColor === 'green' ? 'border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)]' : 'border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]'}`
                                                  : cellStyle.clusterPosition === 'bottom'
                                                    ? `border-b-[3px] border-l-[3px] border-r-[3px] ${cellStyle.clusterColor === 'green' ? 'border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)]' : 'border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]'}`
                                                    : ''
                                            }`}
                                          >
                                            {/* Display the net value */}
                                            <div className="text-sm md:text-base font-bold mb-1">
                                              {formatCurrency(displayValue)}
                                            </div>
                                          </div>
                                        </td>
                                      )
                                    })}
                                  </tr>
                                )
                              })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
                {/* ── Trading Signal Gauges — hidden when OI mode or ODTRIO is active ── */}
                {!showOI && !showODTRIO && (
                  <div
                    className="md:mt-0"
                    style={{
                      flexShrink: 0,
                      marginTop:
                        typeof window !== 'undefined' && window.innerWidth < 768
                          ? '5px'
                          : undefined,
                    }}
                  >
                    <GaugeTrio
                      currentPrice={currentPrice}
                      gexByStrikeByExpiration={gexByStrikeByExpiration}
                      vexByStrikeByExpiration={vexByStrikeByExpiration}
                      expirations={expirations}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default LiquidPanel
