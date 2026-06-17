'use client'

import { useEffect } from 'react'
import AlmanacDailyChart from '@/components/analytics/AlmanacDailyChart'
import HistoricalEventsResearch from '@/components/analytics/HistoricalEventsResearch'
import SeasonalityChart from '@/components/analytics/SeasonalityChart'
import SeasonaxLanding from '@/components/seasonax/SeasonaxLanding'
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

  // DEBUG: log everything being covered by the fixed nav + ticker scroller
  useEffect(() => {
    const runDebug = () => {
      const nav = document.querySelector('nav') as HTMLElement | null
      const ticker = document.querySelector('.ticker-scroller-container') as HTMLElement | null

      const navBottom = nav ? nav.getBoundingClientRect().bottom : 0
      const tickerBottom = ticker ? ticker.getBoundingClientRect().bottom : 0
      const coverageBottom = Math.max(navBottom, tickerBottom)

      console.group('%c[DataDriven] Overlap Debug', 'color: #FF8500; font-weight: bold')
      console.log('Nav element:', nav)
      console.log('Nav bottom (viewport px):', navBottom.toFixed(1))
      console.log('Ticker scroller element:', ticker)
      console.log('Ticker scroller bottom (viewport px):', tickerBottom.toFixed(1))
      console.log('Total fixed coverage bottom:', coverageBottom.toFixed(1), 'px from top')

      const allElements = document.querySelectorAll('*')
      const overlapped: { element: Element; tag: string; classes: string; id: string; top: number; bottom: number }[] = []

      allElements.forEach((el) => {
        if (el === nav || el === ticker || nav?.contains(el)) return
        const rect = el.getBoundingClientRect()
        // only elements that have visible area overlapping the nav coverage zone
        if (rect.width > 0 && rect.height > 0 && rect.top < coverageBottom && rect.bottom > 0) {
          overlapped.push({
            element: el,
            tag: el.tagName.toLowerCase(),
            classes: el.className?.toString().slice(0, 80) || '',
            id: el.id || '',
            top: Math.round(rect.top),
            bottom: Math.round(rect.bottom),
          })
        }
      })

      console.log(`\nElements with visible area behind the nav/ticker (top < ${coverageBottom.toFixed(0)}px):`)
      overlapped.forEach(({ tag, classes, id, top, bottom }) => {
        console.log(
          `  %c${tag}${id ? '#' + id : ''}${classes ? ' .' + classes.replace(/\s+/g, ' .') : ''}`,
          'color: #f87171',
          `| top: ${top}px  bottom: ${bottom}px`
        )
      })

      if (overlapped.length === 0) {
        console.log('%c  ✓ No elements detected behind the nav/ticker scroller', 'color: #4ade80')
      }
      console.groupEnd()
    }

    // Run after paint so layout is settled
    const id = requestAnimationFrame(() => setTimeout(runDebug, 300))
    return () => cancelAnimationFrame(id)
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
