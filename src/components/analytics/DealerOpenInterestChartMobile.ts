/**
 * Mobile configuration for DealerOpenInterestChart's D3 draw function.
 * Extracted from DealerOpenInterestChart.tsx — provides isMobile flag and
 * all derived sizing values used inside the D3 rendering useEffect.
 */
export function getDealerOIMobileConfig(svgHeight: number) {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
    return {
        isMobile,
        totalSVGHeight: isMobile ? 484 : svgHeight,
        labelFontSize: isMobile ? '21px' : '18px',
        subLabelFontSize: isMobile ? '20px' : '16px',
    }
}
