import { useState, useEffect } from 'react'

/**
 * Mobile-state hook for AlmanacCalendar.
 * Extracted from AlmanacCalendar.tsx — provides isMobile for
 * day-header abbreviation (Mon vs M) and win-rate label (short vs long).
 */
export function useAlmanacCalendarMobile() {
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

    return { isMobile }
}
