'use client'

import { useState, useEffect } from 'react'

/**
 * Mobile swipe-to-delete state for FlowTrackingPanel.
 * Treats both portrait phone (<768px) and landscape phone (>768px, height<=500) as mobile.
 */
export function useFlowTrackingPanelMobile() {
    const [isMobile, setIsMobile] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false
        const w = window.innerWidth; const h = window.innerHeight
        return w < 768 || (w > 768 && w <= 1024 && h <= 500)
    })

    useEffect(() => {
        const check = () => {
            const w = window.innerWidth; const h = window.innerHeight
            setIsMobile(w < 768 || (w > 768 && w <= 1024 && h <= 500))
        }
        window.addEventListener('resize', check)
        window.addEventListener('orientationchange', check)
        return () => {
            window.removeEventListener('resize', check)
            window.removeEventListener('orientationchange', check)
        }
    }, [])
    const [swipedFlowId, setSwipedFlowId] = useState<string | null>(null)
    const [touchStart, setTouchStart] = useState<number>(0)
    const [touchCurrent, setTouchCurrent] = useState<number>(0)

    return { isMobile, swipedFlowId, setSwipedFlowId, touchStart, setTouchStart, touchCurrent, setTouchCurrent }
}
