/**
 * Mobile utilities for SeasonaxMainChart.
 * Extracted from SeasonaxMainChart.tsx.
 */

/** Returns mobile flag + months-to-show for the X-axis label rendering. */
export function getSeasonaxMainChartMobile() {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1920
    const h = typeof window !== 'undefined' ? window.innerHeight : 1080
    const isMobile = w <= 768 || (w > 768 && w <= 1024 && h <= 500)
    const monthsToShow = isMobile
        ? [0, 3, 6, 9]
        : Array.from({ length: 12 }, (_, i) => i)
    return { isMobile, monthsToShow }
}

/** Returns the min-height for the chart container div. */
export function getSeasonaxMainChartMinHeight() {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1920
    const h = typeof window !== 'undefined' ? window.innerHeight : 1080
    const isMobile = w < 768 || (w > 768 && w <= 1024 && h <= 500)
    return isMobile ? '612px' : '650px'
}
