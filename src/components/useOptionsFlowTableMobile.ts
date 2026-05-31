import { useState, useEffect } from 'react'

/**
 * Mobile detection hook for OptionsFlowTable.
 * Treats both portrait phone (<768px) and landscape phone (>768px, height<=500) as mobile.
 */
export function useOptionsFlowTableMobile() {
    const [isMobileView, setIsMobileView] = useState(false)

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
