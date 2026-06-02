import { useState, useEffect } from 'react'

/**
 * Mobile-state hook for AlmanacCalendar.
 * Extracted from AlmanacCalendar.tsx — provides isMobile for
 * day-header abbreviation (Mon vs M) and win-rate label (short vs long).
 */
export function useAlmanacCalendarMobile() {
    const [isMobile, setIsMobile] = useState(false)

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth <= 768)
        check()
        window.addEventListener('resize', check)
        return () => window.removeEventListener('resize', check)
    }, [])

    return { isMobile }
}
