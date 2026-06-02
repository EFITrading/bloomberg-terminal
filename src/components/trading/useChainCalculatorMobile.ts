'use client'

import { useState, useEffect } from 'react'

/**
 * Mobile detection hook for ChainCalculator.
 * Extracted from ChainCalculator.tsx.
 */
export function useChainCalculatorMobile() {
    const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)

    useEffect(() => {
        const onResize = () => setIsMobile(window.innerWidth < 768)
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
    }, [])

    return { isMobile }
}
