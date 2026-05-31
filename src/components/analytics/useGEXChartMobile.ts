import { useState, useEffect } from 'react'

interface GEXChartMobileConfig {
    isMobile: boolean
    margin: { top: number; right: number; bottom: number; left: number }
    svgWidth: number
    svgHeight: number
    marginTop: string
    svgStyle: React.CSSProperties
}

/**
 * Mobile-specific chart configuration for GEXChart.
 * Extracted from GEXChart.tsx — provides isMobile state and all derived
 * chart sizing values so GEXChart can stay decoupled from mobile detection logic.
 */
export function useGEXChartMobile(compactMode: boolean): GEXChartMobileConfig {
    const [isMobile, setIsMobile] = useState(false)

    useEffect(() => {
        const check = () => {
            const w = window.innerWidth; const h = window.innerHeight
            setIsMobile(w <= 768 || (w > 768 && w <= 1024 && h <= 500))
        }
        check()
        window.addEventListener('resize', check)
        window.addEventListener('orientationchange', check)
        return () => {
            window.removeEventListener('resize', check)
            window.removeEventListener('orientationchange', check)
        }
    }, [])

    const margin = isMobile
        ? { top: 50, right: 30, bottom: 80, left: 50 }
        : compactMode
            ? { top: 50, right: 20, bottom: 70, left: 60 }
            : { top: 60, right: 180, bottom: 80, left: 100 }

    return {
        isMobile,
        margin,
        svgWidth: isMobile ? 350 : compactMode ? 1200 : 1500,
        svgHeight: isMobile ? 415 : compactMode ? 650 : 560,
        marginTop: isMobile ? '0px' : compactMode ? '-20px' : '32px',
        svgStyle: {
            background: 'transparent',
            width: isMobile ? '100%' : 'auto',
            height: 'auto',
            maxWidth: isMobile ? '100%' : 'none',
        },
    }
}
