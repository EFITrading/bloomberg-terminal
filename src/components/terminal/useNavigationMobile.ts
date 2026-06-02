'use client'

import { useState, useEffect } from 'react'

/**
 * Mobile detection hook for Navigation.
 * Extracted from Navigation.tsx — provides isMobile and isSmallMobile flags
 * with resize listener.
 */
export function useNavigationMobile() {
    const [isMobile, setIsMobile] = useState(false)
    const [isSmallMobile, setIsSmallMobile] = useState(false)

    useEffect(() => {
        setIsMobile(window.innerWidth <= 768)
        setIsSmallMobile(window.innerWidth <= 400)
        const handleResize = () => {
            setIsMobile(window.innerWidth <= 768)
            setIsSmallMobile(window.innerWidth <= 400)
        }
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    return { isMobile, isSmallMobile }
}
