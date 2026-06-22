'use client'

import { useState } from 'react'
import AlmanacDailyChart from '@/components/analytics/AlmanacDailyChart'
import HistoricalEventsResearch from '@/components/analytics/HistoricalEventsResearch'
import SeasonalityChart from '@/components/analytics/SeasonalityChart'
import SeasonaxLanding from '@/components/seasonax/SeasonaxLanding'

type MobileTab = 'seasonal' | 'monthly' | 'events' | 'screener'

const TABS: { key: MobileTab; label: string }[] = [
  { key: 'seasonal', label: 'SEASONAL' },
  { key: 'monthly', label: 'MONTHLY' },
  { key: 'events', label: 'HISTORY' },
  { key: 'screener', label: 'SCREENER' },
]

/**
 * Mobile-only layout for the Data Driven page.
 * Replaces the side-by-side desktop grid with a full-screen single-panel
 * tabbed view: SEASONAL / MONTHLY / EVENTS / SCREENER.
 */
export default function DataDrivenMobileLayout() {
  const [active, setActive] = useState<MobileTab>('seasonal')

  const PANEL_STYLE: React.CSSProperties = {
    minHeight: 'calc(100dvh - 110px)',
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch' as any,
  }

  return (
    <div className="mobile-view">
      {/* Sticky tab bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        background: '#000000',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        zIndex: 20,
        padding: '6px 6px 0',
        gap: '4px',
      }}>
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActive(key)}
            data-active={active === key ? 'true' : 'false'}
            style={{
              padding: '10px 4px',
              background: active === key
                ? 'linear-gradient(180deg, #1a1a1a 0%, #000000 100%)'
                : 'transparent',
              border: active === key
                ? '1px solid rgba(255,255,255,0.22)'
                : '1px solid transparent',
              borderBottom: active === key ? '2px solid #ff6600' : '2px solid transparent',
              borderRadius: '6px 6px 0 0',
              color: active === key ? '#ff6600' : '#ffffff',
              fontSize: 11,
              fontWeight: 800,
              cursor: 'pointer',
              fontFamily: '"JetBrains Mono", monospace',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              transition: 'color 0.15s, border-color 0.15s, background 0.15s',
              boxShadow: active === key
                ? 'inset 0 1px 0 rgba(255,255,255,0.1)'
                : 'none',
              WebkitFontSmoothing: 'antialiased',
            } as React.CSSProperties}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Panel content */}
      {active === 'seasonal' && (
        <div className="mobile-seasonality-wrapper" style={PANEL_STYLE}>
          <SeasonalityChart autoStart={true} hideScreener={true} initialSymbol="SPY" />
        </div>
      )}

      {active === 'monthly' && (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 136px)', overflow: 'hidden' }}>
          <AlmanacDailyChart
            month={new Date().getMonth()}
            showPostElection={true}
            symbol="SPY"
          />
        </div>
      )}

      {active === 'events' && (
        <div style={{ height: 'calc(100dvh - 136px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <HistoricalEventsResearch />
        </div>
      )}

      {active === 'screener' && (
        <div style={PANEL_STYLE}>
          <SeasonaxLanding />
        </div>
      )}
    </div>
  )
}
