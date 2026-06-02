import { useState, useEffect } from 'react'

/**
 * Mobile detection hook for OptionsFlowTable.
 * Extracted from OptionsFlowTable.tsx — provides isMobileView state (breakpoint < 768px).
 */
export function useOptionsFlowTableMobile() {
    const [isMobileView, setIsMobileView] = useState(false)

    useEffect(() => {
        const check = () => setIsMobileView(window.innerWidth < 768)
        check()
        window.addEventListener('resize', check)
        return () => window.removeEventListener('resize', check)
    }, [])

    return { isMobileView }
}
