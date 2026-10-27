'use client'

import { useState } from 'react'
import AdminOnlyGate from '@/components/AdminOnlyGate'
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
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch' as any,
    overscrollBehavior: 'contain',
  }

  return (
    <div className="mobile-view">
      {/* Tab bar (fixed height, never scrolls) */}
      <div style={{ flexShrink: 0, zIndex: 20, background: '#000', padding: '4px 8px 4px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          background: '#0a0a0a',
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: 12,
          padding: 3,
          gap: 3,
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.9)',
        }}>
          {TABS.map(({ key, label }) => {
            const on = active === key
            return (
              <button
                key={key}
                onClick={() => setActive(key)}
                data-active={on ? 'true' : 'false'}
                style={{
                  height: 30,
                  minWidth: 0,
                  padding: '0 2px',
                  whiteSpace: 'nowrap',
                  background: on ? 'linear-gradient(180deg, #262626 0%, #0f0f0f 100%)' : 'transparent',
                  border: on ? '1px solid rgba(255,255,255,0.22)' : '1px solid transparent',
                  borderRadius: 8,
                  color: on ? '#ff8a1f' : '#ffffff',
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontFamily: '"JetBrains Mono", monospace',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  transition: 'color 0.15s, background 0.15s',
                  boxShadow: on ? 'inset 0 -2px 0 #ff6600, 0 2px 8px rgba(0,0,0,0.7)' : 'none',
                  WebkitFontSmoothing: 'antialiased',
                } as React.CSSProperties}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Panel content */}
      {active === 'seasonal' && (
        <div className="mobile-seasonality-wrapper" style={PANEL_STYLE}>
          <SeasonalityChart autoStart={true} hideScreener={true} initialSymbol="SPY" hideFullscreenToggle={true} />
        </div>
      )}

      {active === 'monthly' && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <AlmanacDailyChart
            month={new Date().getMonth()}
            showPostElection={true}
            symbol="SPY"
          />
        </div>
      )}

      {active === 'events' && (
        <div style={{ ...PANEL_STYLE, paddingBottom: 70 }}>
          <HistoricalEventsResearch hideFullscreenToggle={true} />
        </div>
      )}

      {active === 'screener' && (
        <div style={PANEL_STYLE}>
          <AdminOnlyGate message="Members will gain access to these tools very soon, currently beta testing Seasonal Annual and Monthly charts only.">
            <SeasonaxLanding />
          </AdminOnlyGate>
        </div>
      )}
    </div>
  )
}
