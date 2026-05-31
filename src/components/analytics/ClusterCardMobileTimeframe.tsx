'use client'

import React from 'react'

type TF = '1d' | '1h' | '5m'

interface Props {
    isExpanded: boolean
    onClose: () => void
    timeframe: TF
    setTimeframe: (tf: TF) => void
    accentColor: string
}

/**
 * Mobile-only timeframe control for ClusterCard in DealerClusterScreener.
 * Extracted from DealerClusterScreener.tsx — replaces the {isMobileCard ? ... : ...} ternary
 * that renders a dropdown + close button on mobile vs three buttons on desktop.
 */
export default function ClusterCardMobileTimeframe({ isExpanded, onClose, timeframe, setTimeframe, accentColor }: Props) {
    if (isExpanded) {
        return (
            <button
                onClick={(e) => { e.stopPropagation(); onClose() }}
                style={{
                    fontSize: 12,
                    fontFamily: 'monospace',
                    fontWeight: 800,
                    letterSpacing: '0.12em',
                    padding: '3px 10px',
                    border: `1px solid ${accentColor}55`,
                    borderRadius: 2,
                    background: 'transparent',
                    color: accentColor,
                    cursor: 'pointer',
                    flexShrink: 0,
                    marginRight: 4,
                }}
            >✕ CLOSE</button>
        )
    }

    return (
        <select
            value={timeframe}
            onChange={e => setTimeframe(e.target.value as TF)}
            style={{
                fontSize: 12,
                fontFamily: 'monospace',
                fontWeight: 800,
                letterSpacing: '0.1em',
                padding: '2px 6px',
                border: '1px solid rgba(255,255,255,0.35)',
                borderRadius: 2,
                background: '#0a0a0a',
                color: '#ffffff',
                cursor: 'pointer',
                flexShrink: 0,
                appearance: 'none',
                paddingRight: 18,
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 8 8'%3E%3Cpath fill='%23aaa' d='M4 6L0 2h8z'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 4px center',
                backgroundSize: '6px',
            }}
        >
            {(['1d', '1h', '5m'] as const).map(tf => (
                <option key={tf} value={tf}>{tf.toUpperCase()}</option>
            ))}
        </select>
    )
}
