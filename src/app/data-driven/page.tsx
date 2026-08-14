'use client'

import { useEffect, useState } from 'react'
import HistoricalEventsResearch from '@/components/analytics/HistoricalEventsResearch'
import SeasonalityChart from '@/components/analytics/SeasonalityChart'
import DataDrivenMobileLayout from './DataDrivenMobileLayout'

import '../almanac.css'
import '../seasonal-cards.css'
import '../seasonality.css'
import '../seasonax.css'

// Below this width the side-by-side grid gets too cramped (chart collides with the
// research/almanac column), so we switch to a slide-in drawer instead — same pattern
// used by OptionsFlowTable's tablet/laptop Flow Tracking drawer.
const SIDEBAR_MIN_WIDTH = 1500
const MOBILE_BREAKPOINT = 768

export default function DataDriven() {
  // Always start at the server-rendered width (1920) to avoid a hydration mismatch;
  // the real width is applied after mount via the resize effect below.
  const [windowWidth, setWindowWidth] = useState<number>(1920)
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false)

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const prevBody = document.body.style.overflow
    const prevHtml = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevBody
      document.documentElement.style.overflow = prevHtml
    }
  }, [])

  const isTabletOrLaptop = windowWidth > MOBILE_BREAKPOINT && windowWidth < SIDEBAR_MIN_WIDTH

  return (
    <>
      <div className="data-driven-container" style={{ minHeight: 'auto' }}>
        {/* Desktop view - shows all components side by side */}
        <div className="desktop-view">
          {isTabletOrLaptop ? (
            <div style={{ minWidth: 0, width: '100%', paddingTop: '20px', position: 'relative' }}>
              <SeasonalityChart autoStart={true} hideScreener={true} initialSymbol="SPY" />

              {/* Tab button - fixed on the right edge */}
              <button
                onClick={() => setDrawerOpen((v) => !v)}
                style={{
                  position: 'fixed',
                  top: '50%',
                  right: drawerOpen ? '100vw' : '0px',
                  transform: 'translateY(-50%)',
                  zIndex: 10010,
                  background: 'linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 100%)',
                  border: '1px solid #ff6600',
                  borderRight: drawerOpen ? '1px solid #ff6600' : 'none',
                  borderRadius: '8px 0 0 8px',
                  color: '#ff6600',
                  padding: '10px 6px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  writingMode: 'vertical-rl',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '1.5px',
                  textTransform: 'uppercase',
                  fontFamily: 'monospace',
                  boxShadow: '-4px 0 16px rgba(0,0,0,0.8)',
                  transition: 'right 0.3s ease',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ff6600" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4l3 3" />
                </svg>
                {drawerOpen ? '✕' : 'RESEARCH'}
              </button>

              {/* Backdrop */}
              {drawerOpen && (
                <div
                  onClick={() => setDrawerOpen(false)}
                  style={{
                    position: 'fixed', inset: 0, zIndex: 10005,
                    background: 'rgba(0,0,0,0.45)',
                  }}
                />
              )}

              {/* Drawer */}
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  right: 0,
                  bottom: 0,
                  width: '100vw',
                  zIndex: 10008,
                  background: '#000000',
                  borderLeft: '1px solid #ff6600',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  transform: drawerOpen ? 'translateX(0)' : 'translateX(100%)',
                  transition: 'transform 0.3s ease',
                  boxShadow: '-8px 0 32px rgba(0,0,0,0.9)',
                }}
              >
                <div className="data-driven-drawer-content" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                  <HistoricalEventsResearch inDrawer onCloseDrawer={() => setDrawerOpen(false)} />
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '46% 53.75%',
                gap: '0.25%',
                width: '100%',
                marginTop: '0',
              }}
            >
              <div style={{ minWidth: 0, width: '100%', paddingTop: '20px' }}>
                <SeasonalityChart autoStart={true} hideScreener={true} initialSymbol="SPY" />
              </div>
              <div
                style={{
                  minWidth: 0,
                  marginTop: '0',
                  height: 'calc(94vh - 40px)',
                  overflow: 'hidden',
                }}
              >
                <HistoricalEventsResearch />
              </div>
            </div>
          )}
        </div>

        {/* Mobile view — extracted to DataDrivenMobileLayout.tsx */}
        <DataDrivenMobileLayout />
      </div>
    </>
  )
}
