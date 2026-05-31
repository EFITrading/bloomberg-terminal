'use client'

import { useState, useEffect } from 'react'

/**
 * Mobile layout hook for ClusterCard sub-component inside DealerClusterScreener.
 * Tracks whether the card is rendering on a mobile viewport (<768px).
 */
export function useClusterCardMobile() {
    const [isMobileCard, setIsMobileCard] = useState(false)
    useEffect(() => {
        const check = () => {
            const w = window.innerWidth; const h = window.innerHeight
            setIsMobileCard(w < 768 || (w > 768 && w <= 1024 && h <= 500))
        }
        check()
        window.addEventListener('resize', check)
        window.addEventListener('orientationchange', check)
        return () => {
            window.removeEventListener('resize', check)
            window.removeEventListener('orientationchange', check)
        }
    }, [])
    return { isMobileCard }
}
