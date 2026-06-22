'use client'

import { useEffect } from 'react'
import HistoricalEventsResearch from '@/components/analytics/HistoricalEventsResearch'
import SeasonalityChart from '@/components/analytics/SeasonalityChart'
import DataDrivenMobileLayout from './DataDrivenMobileLayout'

import '../almanac.css'
import '../seasonal-cards.css'
import '../seasonality.css'
import '../seasonax.css'

export default function DataDriven() {
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

  return (
    <>
      <div className="data-driven-container" style={{ minHeight: 'auto' }}>
        {/* Desktop view - shows all components side by side */}
        <div className="desktop-view">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '46% 53.75%',
              gap: '0.25%',
              width: '100%',
              marginTop: '0',
            }}
          >
            <div style={{ minWidth: 0, width: '100%' }}>
              <SeasonalityChart autoStart={true} hideScreener={true} />
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
        </div>

        {/* Mobile view — extracted to DataDrivenMobileLayout.tsx */}
        <DataDrivenMobileLayout />
      </div>
    </>
  )
}
