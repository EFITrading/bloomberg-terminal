'use client'

import { useState, useEffect } from 'react'

/**
 * Mobile detection hook for LiquidPanel — OIGEXTab sub-component.
 * Extracted from LiquidPanel.tsx.
 */
export function useOIGEXTabMobile() {
    const [isMobile, setIsMobile] = useState<boolean>(false)

    useEffect(() => {
        const checkMobile = () => {
            const w = window.innerWidth; const h = window.innerHeight
            setIsMobile(w < 768 || (w > 768 && w <= 1024 && h <= 500))
        }
        checkMobile()
        window.addEventListener('resize', checkMobile)
        window.addEventListener('orientationchange', checkMobile)
        return () => {
            window.removeEventListener('resize', checkMobile)
            window.removeEventListener('orientationchange', checkMobile)
        }
    }, [])

    return { isMobile }
}

/**
 * Mobile detection hook for the main LiquidPanel component.
 * Treats both portrait phone (<768px) and landscape phone (>768px, w<=1024, height<=500) as mobile.
 */
export function useLiquidPanelMobile() {
    const [isMobilePanel, setIsMobilePanel] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false
        const w = window.innerWidth; const h = window.innerHeight
        return w < 768 || (w > 768 && w <= 1024 && h <= 500)
    })

    useEffect(() => {
        const checkMobile = () => {
            const w = window.innerWidth; const h = window.innerHeight
            setIsMobilePanel(w < 768 || (w > 768 && w <= 1024 && h <= 500))
        }
        checkMobile()
        window.addEventListener('resize', checkMobile)
        window.addEventListener('orientationchange', checkMobile)
        return () => {
            window.removeEventListener('resize', checkMobile)
            window.removeEventListener('orientationchange', checkMobile)
        }
    }, [])

    return { isMobilePanel }
}
