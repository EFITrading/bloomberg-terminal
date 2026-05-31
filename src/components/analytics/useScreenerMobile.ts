import { useState, useEffect } from 'react'

/**
 * Mobile pagination hook shared by GEXScreener and AttractionZoneScanner.
 * Extracted from those files — centralises mobile detection and per-page count.
 */
export function useScreenerMobile() {
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

    const itemsPerPage = isMobile ? 10 : 20

    return { isMobile, itemsPerPage }
}
