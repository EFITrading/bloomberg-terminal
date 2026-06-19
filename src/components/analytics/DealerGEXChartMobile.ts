/**
 * Mobile configuration for DealerGEXChart's D3 draw function.
 * Extracted from DealerGEXChart.tsx.
 */
export function getDealerGEXChartMobileConfig(svgHeight: number) {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
    return {
        isMobile,
        totalSVGHeight: svgHeight,
    }
}
