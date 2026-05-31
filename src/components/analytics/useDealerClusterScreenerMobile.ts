'use client'

import { useState, useEffect } from 'react'

/**
 * Mobile layout hook for DealerClusterScreener main component.
 * Tracks isMobile viewport state and the mobileTower toggle ('call'|'put')
 * used to switch between CALL and PUT column visibility on narrow screens.
 */
export function useDealerClusterScreenerMobile() {
    const [isMobile, setIsMobile] = useState(false)
    const [mobileTower, setMobileTower] = useState<'call' | 'put'>('call')
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
    return { isMobile, mobileTower, setMobileTower }
}
