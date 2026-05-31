'use client'

import { useState, useEffect } from 'react'

/**
 * Mobile detection hook for NewsPanelV2.
 * Extracted from NewsPanelV2.tsx — provides reactive isMobile flag.
 */
export function useNewsPanelV2Mobile() {
    const [isMobile, setIsMobile] = useState(false)

    useEffect(() => {
        const check = () => {
            const w = window.innerWidth; const h = window.innerHeight
            setIsMobile(w < 768 || (w > 768 && w <= 1024 && h <= 500))
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
