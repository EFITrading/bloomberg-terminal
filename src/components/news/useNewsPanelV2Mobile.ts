'use client'

import { useState, useEffect } from 'react'

/**
 * Mobile detection hook for NewsPanelV2.
 * Extracted from NewsPanelV2.tsx — provides reactive isMobile flag.
 */
export function useNewsPanelV2Mobile() {
    const [isMobile, setIsMobile] = useState(false)

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768)
        check()
        window.addEventListener('resize', check)
        return () => window.removeEventListener('resize', check)
    }, [])

    return { isMobile }
}
