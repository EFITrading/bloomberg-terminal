'use client'

import { useState, useEffect } from 'react'

/**
 * Mobile detection hook for ChainPanel.
 * Extracted from ChainPanel.tsx.
 */
export function useChainPanelMobile() {
    const [isMobile, setIsMobile] = useState(() => {
        if (typeof window === 'undefined') return false
        const w = window.innerWidth; const h = window.innerHeight
        return w < 768 || (w > 768 && w <= 1024 && h <= 500)
    })

    useEffect(() => {
        const onResize = () => {
            const w = window.innerWidth; const h = window.innerHeight
            setIsMobile(w < 768 || (w > 768 && w <= 1024 && h <= 500))
        }
        window.addEventListener('resize', onResize)
        window.addEventListener('orientationchange', onResize)
        return () => {
            window.removeEventListener('resize', onResize)
            window.removeEventListener('orientationchange', onResize)
        }
    }, [])

    return { isMobile }
}
