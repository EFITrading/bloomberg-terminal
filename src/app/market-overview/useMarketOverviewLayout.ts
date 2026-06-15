'use client'
import { useState } from 'react'

/**
 * Mobile-specific layout logic for the Market Overview page.
 * Extracted from page.tsx so the page file stays desktop-layout-clean.
 */
export function useMarketOverviewLayout() {
    const [isMobile, setIsMobile] = useState(false)
    const [chartHeight, setChartHeight] = useState(600)

    function updateLayout() {
        const mobile = window.innerWidth <= 768
        setIsMobile(mobile)
        const navHeight = mobile ? 138 : 170
        const computed = Math.max(400, window.innerHeight - navHeight)
        setChartHeight(computed)
    }

    const paddingTop = isMobile ? '60px' : '120px'

    return { chartHeight, paddingTop, updateLayout }
}
