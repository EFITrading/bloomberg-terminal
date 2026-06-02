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
            setIsMobile(typeof window !== 'undefined' && window.innerWidth < 768)
        }
        checkMobile()
        window.addEventListener('resize', checkMobile)
        return () => window.removeEventListener('resize', checkMobile)
    }, [])

    return { isMobile }
}

/**
 * Mobile detection hook for the main LiquidPanel component.
 * Extracted from LiquidPanel.tsx.
 */
export function useLiquidPanelMobile() {
    const [isMobilePanel, setIsMobilePanel] = useState<boolean>(() => typeof window !== 'undefined' && window.innerWidth < 768)

    useEffect(() => {
        const checkMobile = () => setIsMobilePanel(typeof window !== 'undefined' && window.innerWidth < 768)
        checkMobile()
        window.addEventListener('resize', checkMobile)
        return () => window.removeEventListener('resize', checkMobile)
    }, [])

    return { isMobilePanel }
}
