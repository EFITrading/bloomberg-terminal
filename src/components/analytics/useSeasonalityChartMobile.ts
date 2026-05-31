'use client'

import { useState, useEffect } from 'react'

/**
 * Mobile detection hook for SeasonalityChart.
 * Extracted from SeasonalityChart.tsx — provides isMobileView flag.
 */
export function useSeasonalityChartMobile() {
    const [isMobileView, setIsMobileView] = useState<boolean>(false)

    useEffect(() => {
        const check = () => {
            const w = window.innerWidth; const h = window.innerHeight
            setIsMobileView(w < 768 || (w > 768 && w <= 1024 && h <= 500))
        }
        check()
        window.addEventListener('resize', check)
        window.addEventListener('orientationchange', check)
        return () => {
            window.removeEventListener('resize', check)
            window.removeEventListener('orientationchange', check)
        }
    }, [])

    return { isMobileView }
}
