/**
 * Mobile configuration for DealerOpenInterestChart's D3 draw function.
 * Extracted from DealerOpenInterestChart.tsx — provides isMobile flag and
 * all derived sizing values used inside the D3 rendering useEffect.
 */
export function getDealerOIMobileConfig(svgHeight: number) {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1920
    const h = typeof window !== 'undefined' ? window.innerHeight : 1080
    const isMobile = w < 768 || (w > 768 && w <= 1024 && h <= 500)
    return {
        isMobile,
        totalSVGHeight: isMobile ? 484 : svgHeight,
        labelFontSize: isMobile ? '21px' : '18px',
        subLabelFontSize: isMobile ? '20px' : '16px',
    }
}
