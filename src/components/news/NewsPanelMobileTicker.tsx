'use client'

import { TbFlame, TbX } from 'react-icons/tb'

interface Props {
    tickerText: string
    onClose?: () => void
}

/**
 * Mobile-only breaking news ticker bar for NewsPanelV2.
 * Extracted from NewsPanelV2.tsx — shows fire badge + two-row headline on mobile.
 * Desktop uses a scrolling marquee in NewsPanelV2.tsx directly.
 */
export default function NewsPanelMobileTicker({ tickerText, onClose }: Props) {
    return (
        <div
            style={{ background: 'linear-gradient(90deg, #7f1d1d 0%, #991b1b 40%, #7f1d1d 100%)', flexShrink: 0, display: 'flex', alignItems: 'stretch', gap: 0, position: 'relative' }}
        >
            {/* fire badge */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 12px', background: 'linear-gradient(90deg, #b91c1c 0%, #991b1b 100%)', borderRight: '1px solid #ef4444', flexShrink: 0 }}>
                <TbFlame className="w-6 h-6 text-white" style={{ animation: 'pulse 1s ease-in-out infinite' }} />
            </div>
            {/* two-row text */}
            <div style={{ flex: 1, padding: '5px 10px', overflow: 'hidden' }}>
                {tickerText ? (
                    <>
                        <div style={{ color: '#fef2f2', fontWeight: 900, fontSize: 12, lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {tickerText.split('●')[0]?.trim() || tickerText}
                        </div>
                        <div style={{ color: '#fca5a5', fontWeight: 700, fontSize: 11, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.8 }}>
                            {tickerText.split('●')[1]?.trim() || ''}
                        </div>
                    </>
                ) : (
                    <div style={{ color: '#fca5a5', fontWeight: 700, fontSize: 12, animation: 'pulse 1s ease-in-out infinite' }}>Loading…</div>
                )}
            </div>
            {/* close button */}
            {onClose && (
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close panel"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 14px', background: 'rgba(0,0,0,0.3)', border: 'none', borderLeft: '1px solid rgba(239,68,68,0.35)', cursor: 'pointer', flexShrink: 0, color: '#fca5a5' }}
                >
                    <TbX style={{ width: 20, height: 20 }} />
                </button>
            )}
        </div>
    )
}
