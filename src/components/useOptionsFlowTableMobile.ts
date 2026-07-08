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
        const check = () => {
            const w = window.innerWidth
            setWindowWidth(w)
            setIsMobileView(w < 768)
            setIsTabletView(w >= 768 && w < 1200)
        }
        check()
        window.addEventListener('resize', check)
        return () => window.removeEventListener('resize', check)
    }, [])

    return { isMobileView, isTabletView, windowWidth }
}
