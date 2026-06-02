'use client'

import { useState, useEffect } from 'react'

/**
 * Mobile detection hook for EFICharting.
 * Extracted from EFICharting.tsx — provides isMobile flag and all
 * mobile accordion group open/close states.
 */
export function useEFIChartingMobile() {
    const [isMobile, setIsMobile] = useState(false)
    const [isMounted, setIsMounted] = useState(false)
    const [isMobileGroup1Open, setIsMobileGroup1Open] = useState(false)
    const [isMobileGroup2Open, setIsMobileGroup2Open] = useState(false)
    const [isMobileGroup3Open, setIsMobileGroup3Open] = useState(false)

    useEffect(() => {
        setIsMounted(true)
        setIsMobile(window.innerWidth < 768)
        const handler = () => setIsMobile(window.innerWidth < 768)
        window.addEventListener('resize', handler)
        return () => window.removeEventListener('resize', handler)
    }, [])

    return {
        isMobile,
        isMounted,
        isMobileGroup1Open,
        setIsMobileGroup1Open,
        isMobileGroup2Open,
        setIsMobileGroup2Open,
        isMobileGroup3Open,
        setIsMobileGroup3Open,
    }
}
