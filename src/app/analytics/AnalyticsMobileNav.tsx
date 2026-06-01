'use client'

import { useState } from 'react'

/**
 * Mobile-only navigation header for the Analytics page.
 * Replaces the fixed left sidebar with a collapsible dropdown on narrow screens.
 * Extracted from analytics/page.tsx so desktop layout code stays separate.
 */

const MOBILE_TABS = [
    { id: 'rrg', label: 'RRG' },
    { id: 'performance', label: 'Performance' },
    { id: 'iv-rrg', label: 'IV RRG' },
    { id: 'rrg-screener', label: 'RRG Screener' },
    { id: 'leadership-scan', label: 'Leadership' },
    { id: 'hv-screener', label: 'HV Screener' },
    { id: 'heatmap', label: 'Heatmap' },
    { id: 'screeners', label: 'Screeners' },
    { id: 'market-cycle', label: 'Market Cycle' },
    { id: 'buy-sell-scanner', label: 'Buy/Sell Scan' },
    { id: 'dealer-cluster', label: 'Dealer Cluster' },
]

const PANEL_LABELS: Record<string, string> = Object.fromEntries(
    MOBILE_TABS.map((t) => [t.id, t.label])
)

interface Props {
    activePanel: string
    onSelectPanel: (id: string) => void
}

export function AnalyticsMobileNav({ activePanel, onSelectPanel }: Props) {
    const [isOpen, setIsOpen] = useState(false)

    const handleSelect = (id: string) => {
        onSelectPanel(id)
        setIsOpen(false)
    }

    return (
        <div className="analytics-mobile-header">
            <button
                className="analytics-mobile-trigger"
                onClick={() => setIsOpen((o) => !o)}
            >
                <span>&#9776; {PANEL_LABELS[activePanel] ?? 'Analytics'}</span>
                <span style={{ fontSize: '12px', opacity: 0.7 }}>{isOpen ? '▲' : '▼'}</span>
            </button>

            {isOpen && (
                <div className="analytics-mobile-dropdown">
                    {MOBILE_TABS.map(({ id, label }) => {
                        const isActive = activePanel === id
                        return (
                            <button
                                key={id}
                                onClick={() => handleSelect(id)}
                                className="analytics-tab-btn"
                                style={{
                                    background: isActive
                                        ? 'linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)'
                                        : 'linear-gradient(135deg, #0d0d0d 0%, #050505 100%)',
                                    color: isActive ? '#FFB800' : '#FFFFFF',
                                    border: isActive
                                        ? '1px solid #D4AF37'
                                        : '1px solid rgba(255, 255, 255, 0.08)',
                                    borderLeft: isActive ? '4px solid #D4AF37' : '4px solid transparent',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    display: 'flex',
                                    alignItems: 'center',
                                    fontWeight: isActive ? '700' : '600',
                                    textTransform: 'uppercase',
                                }}
                            >
                                {label}
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
