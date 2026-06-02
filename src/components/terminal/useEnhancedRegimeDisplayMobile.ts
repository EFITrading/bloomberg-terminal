'use client'

import { useState, useEffect } from 'react'

/**
 * Mobile detection hook for EnhancedRegimeDisplay.
 * Extracted from EnhancedRegimeDisplay.tsx.
 */
export function useEnhancedRegimeDisplayMobile() {
    const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)

    useEffect(() => {
        const onResize = () => setIsMobile(window.innerWidth < 768)
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
    }, [])

    return { isMobile }
}
