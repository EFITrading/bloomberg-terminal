'use client'
import { useState } from 'react'

/**
 * Layout hook for the Market Overview page.
 * paddingTop = nav + ticker (desktop) or just nav (mobile — ticker is hidden on mobile).
 * Ticker is 29px tall, shown only at >1024px.
 */
export function useMarketOverviewLayout() {
    const [totalOffset, setTotalOffset] = useState(119)  // 90 nav + 29 ticker
    const [chartHeight, setChartHeight] = useState(800)

    function updateLayout() {
        const w = window.innerWidth
        const h = window.innerHeight
        const isPortraitPhone = w <= 768
        const isLandscapePhone = w > 768 && w <= 1024 && h <= 500
        const isMobileLayout = isPortraitPhone || isLandscapePhone

        // Ticker is hidden on ≤1024px (CSS: display:none)
        const navH = isLandscapePhone ? 48 : isPortraitPhone ? 56 : 90
        const tickerH = isMobileLayout ? 0 : 29
        const offset = navH + tickerH

        setTotalOffset(offset)
        setChartHeight(Math.max(300, h - offset))
    }

    return { chartHeight, paddingTop: `${totalOffset}px`, updateLayout }
}
