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
        const check = () => setIsMobile(window.innerWidth < 768)
        check()
        window.addEventListener('resize', check)
        return () => window.removeEventListener('resize', check)
    }, [])
    return { isMobile, mobileTower, setMobileTower }
}
