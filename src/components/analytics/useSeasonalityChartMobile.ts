'use client'

import { useState, useEffect } from 'react'

/**
 * Mobile detection hook for SeasonalityChart.
 * Extracted from SeasonalityChart.tsx — provides isMobileView flag.
 */
export function useSeasonalityChartMobile() {
    const [isMobileView, setIsMobileView] = useState<boolean>(false)

    useEffect(() => {
        const check = () => setIsMobileView(window.innerWidth < 768)
        check()
        window.addEventListener('resize', check)
        return () => window.removeEventListener('resize', check)
    }, [])

    return { isMobileView }
}
