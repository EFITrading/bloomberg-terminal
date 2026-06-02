'use client'

import { useState } from 'react'

/**
 * Mobile swipe-to-delete state for FlowTrackingPanel.
 * Extracted from FlowTrackingPanel.tsx — provides swipe gesture state
 * used only on mobile (md:hidden swipe-delete UI) and isMobile flag.
 */
export function useFlowTrackingPanelMobile() {
    const [isMobile] = useState<boolean>(() => typeof window !== 'undefined' && window.innerWidth < 768)
    const [swipedFlowId, setSwipedFlowId] = useState<string | null>(null)
    const [touchStart, setTouchStart] = useState<number>(0)
    const [touchCurrent, setTouchCurrent] = useState<number>(0)

    return { isMobile, swipedFlowId, setSwipedFlowId, touchStart, setTouchStart, touchCurrent, setTouchCurrent }
}
