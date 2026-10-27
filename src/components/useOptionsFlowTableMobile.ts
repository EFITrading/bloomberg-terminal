import { useState, useEffect } from 'react'

/**
 * Mobile/tablet detection hook for OptionsFlowTable.
 * isMobileView: < 768px
 * isTabletView: 768px – 1199px
 * windowWidth: current window width
 */
export function useOptionsFlowTableMobile() {
    const [isMobileView, setIsMobileView] = useState(false)
    const [isTabletView, setIsTabletView] = useState(false)
    const [windowWidth, setWindowWidth] = useState(1440)

    useEffect(() => {
        let raf = 0
        const check = () => {
            raf = 0
            const w = window.innerWidth
            // Bucketed so state only changes (and the big table only re-renders) when a layout
            // breakpoint is crossed, not on every pixel of a drag-resize.
            setWindowWidth(w < 1440 ? 1439 : w < 1800 ? 1799 : 1800)
            setIsMobileView(w < 768)
            setIsTabletView(w >= 768 && w < 1200)
        }
        const onResize = () => {
            if (!raf) raf = requestAnimationFrame(check)
        }
        check()
        window.addEventListener('resize', onResize)
        return () => {
            if (raf) cancelAnimationFrame(raf)
            window.removeEventListener('resize', onResize)
        }
    }, [])

    return { isMobileView, isTabletView, windowWidth }
}
