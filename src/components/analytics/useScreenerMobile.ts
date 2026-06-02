import { useState, useEffect } from 'react'

/**
 * Mobile pagination hook shared by GEXScreener and AttractionZoneScanner.
 * Extracted from those files — centralises mobile detection and per-page count.
 */
export function useScreenerMobile() {
    const [isMobile, setIsMobile] = useState(false)

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth <= 768)
        check()
        window.addEventListener('resize', check)
        return () => window.removeEventListener('resize', check)
    }, [])

    const itemsPerPage = isMobile ? 10 : 20

    return { isMobile, itemsPerPage }
}
