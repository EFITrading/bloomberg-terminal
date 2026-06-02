'use client'

import { useState, useEffect } from 'react'

/**
 * Mobile layout hook for ClusterCard sub-component inside DealerClusterScreener.
 * Tracks whether the card is rendering on a mobile viewport (<768px).
 */
export function useClusterCardMobile() {
    const [isMobileCard, setIsMobileCard] = useState(false)
    useEffect(() => {
        const check = () => setIsMobileCard(window.innerWidth < 768)
        check()
        window.addEventListener('resize', check)
        return () => window.removeEventListener('resize', check)
    }, [])
    return { isMobileCard }
}
