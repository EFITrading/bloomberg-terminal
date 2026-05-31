/**
 * Mobile configuration for DealerGEXChart's D3 draw function.
 * Extracted from DealerGEXChart.tsx.
 */
export function getDealerGEXChartMobileConfig(svgHeight: number) {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1920
    const h = typeof window !== 'undefined' ? window.innerHeight : 1080
    const isMobile = w < 768 || (w > 768 && w <= 1024 && h <= 500)
    return {
        isMobile,
        totalSVGHeight: isMobile ? 484 : svgHeight,
    }
}
