/**
 * Mobile utilities for SeasonaxMainChart.
 * Extracted from SeasonaxMainChart.tsx.
 */

/** Returns mobile flag + months-to-show for the X-axis label rendering. */
export function getSeasonaxMainChartMobile() {
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768
    const monthsToShow = isMobile
        ? [0, 3, 6, 9]
        : Array.from({ length: 12 }, (_, i) => i)
    return { isMobile, monthsToShow }
}

/** Returns the min-height for the chart container div. */
export function getSeasonaxMainChartMinHeight() {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
    return isMobile ? '612px' : '650px'
}
