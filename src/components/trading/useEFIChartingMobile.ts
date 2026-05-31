'use client'

import { useState, useEffect } from 'react'

/**
 * Mobile detection hook for EFICharting.
 * Extracted from EFICharting.tsx — provides isMobile flag and all
 * mobile accordion group open/close states.
 *
 * isLandscapePhone: phone rotated to landscape (width > 768 & height ≤ 500).
 * iPhone 17 Pro landscape = 874×402 CSS px. Must be treated like mobile
 * for sidebar visibility (no sidebar, use hamburger instead).
 */
export function useEFIChartingMobile() {
    const [isMobile, setIsMobile] = useState(false)
    const [isLandscapePhone, setIsLandscapePhone] = useState(false)
    const [isMounted, setIsMounted] = useState(false)
    const [isMobileGroup1Open, setIsMobileGroup1Open] = useState(false)
    const [isMobileGroup2Open, setIsMobileGroup2Open] = useState(false)
    const [isMobileGroup3Open, setIsMobileGroup3Open] = useState(false)

    useEffect(() => {
        setIsMounted(true)
        const update = () => {
            const w = window.innerWidth
            const h = window.innerHeight
            setIsMobile(w < 768)
            setIsLandscapePhone(w >= 768 && w <= 1024 && h <= 500)
        }
        update()
        window.addEventListener('resize', update)
        window.addEventListener('orientationchange', update)
        return () => {
            window.removeEventListener('resize', update)
            window.removeEventListener('orientationchange', update)
        }
    }, [])

    return {
        isMobile,
        isLandscapePhone,
        isMounted,
        isMobileGroup1Open,
        setIsMobileGroup1Open,
        isMobileGroup2Open,
        setIsMobileGroup2Open,
        isMobileGroup3Open,
        setIsMobileGroup3Open,
    }
}
