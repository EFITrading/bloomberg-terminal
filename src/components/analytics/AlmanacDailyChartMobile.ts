/**
 * Mobile utilities for AlmanacDailyChart.
 * Extracted from AlmanacDailyChart.tsx.
 */

/** Returns mobile flag for use inside canvas draw functions. */
export function getAlmanacDailyChartMobile() {
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768
    return { isMobile }
}

/** Returns mobile-specific padding value for the chart wrapper. */
export function getAlmanacDailyChartPadding() {
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768
    return isMobile ? '8px' : '20px'
}
