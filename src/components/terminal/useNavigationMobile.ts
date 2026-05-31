'use client'

import { useState, useEffect } from 'react'

/**
 * Mobile detection hook for Navigation.
 * Provides isMobile, isSmallMobile, and isLandscapePhone flags.
 *
 * isLandscapePhone: phone rotated to landscape (width > 768, height ≤ 500).
 * iPhone 17 Pro landscape = 874×402 CSS px, Pro Max = 956×440 CSS px.
 * Tablets in landscape have height > 500px so they are NOT captured here.
 */
export function useNavigationMobile() {
    const [isMobile, setIsMobile] = useState(false)
    const [isSmallMobile, setIsSmallMobile] = useState(false)
    const [isLandscapePhone, setIsLandscapePhone] = useState(false)

    useEffect(() => {
        const update = () => {
            const w = window.innerWidth
            const h = window.innerHeight
            setIsMobile(w <= 768)
            setIsSmallMobile(w <= 400)
            setIsLandscapePhone(w > 768 && w <= 1024 && h <= 500)
        }
        update()
        window.addEventListener('resize', update)
        window.addEventListener('orientationchange', update)
        return () => {
            window.removeEventListener('resize', update)
            window.removeEventListener('orientationchange', update)
        }
    }, [])

    return { isMobile, isSmallMobile, isLandscapePhone }
}
