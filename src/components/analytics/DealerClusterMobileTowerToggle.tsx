'use client'

import React from 'react'

interface Props {
    mobileTower: 'call' | 'put'
    setMobileTower: (fn: (t: 'call' | 'put') => 'call' | 'put') => void
    positiveCount: number
    negativeCount: number
}

/**
 * Mobile-only CALL/PUT tower toggle button for DealerClusterScreener toolbar.
 * Extracted from DealerClusterScreener.tsx — replaces the {isMobile && hasData && (...)} block.
 * On mobile, tapping this switches the single-column grid between the CALL and PUT tower.
 */
export default function DealerClusterMobileTowerToggle({ mobileTower, setMobileTower, positiveCount, negativeCount }: Props) {
    return (
        <button
            onClick={() => setMobileTower(t => t === 'call' ? 'put' : 'call')}
            style={{
                display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                background: mobileTower === 'call' ? 'rgba(255,34,34,0.15)' : 'rgba(0,210,100,0.1)',
                border: mobileTower === 'call' ? '1px solid rgba(255,68,68,0.45)' : '1px solid rgba(0,210,100,0.35)',
                borderRadius: 4, padding: '5px 10px', cursor: 'pointer',
            }}
        >
            <span style={{ fontSize: 10, fontWeight: 800, color: mobileTower === 'call' ? '#ff4444' : '#00d264', letterSpacing: '0.1em' }}>
                {mobileTower === 'call' ? '▲ CALL' : '▼ PUT'}
            </span>
            <span style={{ fontSize: 13, fontWeight: 900, color: mobileTower === 'call' ? '#ff4444' : '#00d264' }}>
                {mobileTower === 'call' ? positiveCount : negativeCount}
            </span>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.05em', marginLeft: 2 }}>TAP</span>
        </button>
    )
}
