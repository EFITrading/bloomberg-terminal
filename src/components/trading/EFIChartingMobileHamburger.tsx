'use client'

import React, { useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
    isMobile: boolean
    activeSidebarPanel: string | null
    onSidebarClick: (id: string) => void
}

const hmAccent: Record<string, string> = {
    orange: '#F97316', blue: '#3B82F6', emerald: '#10B981', amber: '#F59E0B',
    red: '#EF4444', cyan: '#06B6D4', purple: '#A855F7', pink: '#EC4899',
    lime: '#84CC16', teal: '#14B8A6', rose: '#F43F5E', platinum: '#C4CBD6',
}

const hmItems: Array<{ id: string; label: string; accent: string; icon: React.ReactNode }> = [
    {
        id: 'liquid', label: 'LIQUID', accent: 'orange', icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="4" rx="1" strokeWidth="1.8" />
                <rect x="3" y="10" width="14" height="4" rx="1" strokeWidth="1.8" />
                <rect x="3" y="16" width="10" height="4" rx="1" strokeWidth="1.8" />
                <path d="M19 17l3-3-3-3" strokeWidth="1.8" />
            </svg>
        )
    },
    {
        id: 'watch', label: 'WATCH', accent: 'blue', icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12c0 0 3.5-6 9-6s9 6 9 6-3.5 6-9 6-9-6-9-6z" strokeWidth="1.8" />
                <circle cx="12" cy="12" r="2.5" strokeWidth="1.8" />
                <path d="M8 12l1.5-2.5 2 2.5 2-4 2 3" strokeWidth="1.4" />
            </svg>
        )
    },
    {
        id: 'markets', label: 'MARKETS', accent: 'emerald', icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round">
                <line x1="5" y1="20" x2="5" y2="10" strokeWidth="3.5" /><line x1="5" y1="8" x2="5" y2="6" strokeWidth="1.5" /><line x1="5" y1="22" x2="5" y2="20" strokeWidth="1.5" />
                <line x1="12" y1="20" x2="12" y2="7" strokeWidth="3.5" /><line x1="12" y1="5" x2="12" y2="3" strokeWidth="1.5" /><line x1="12" y1="22" x2="12" y2="20" strokeWidth="1.5" />
                <line x1="19" y1="20" x2="19" y2="13" strokeWidth="3.5" /><line x1="19" y1="11" x2="19" y2="9" strokeWidth="1.5" /><line x1="19" y1="22" x2="19" y2="20" strokeWidth="1.5" />
            </svg>
        )
    },
    {
        id: 'news', label: 'NEWS', accent: 'amber', icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="4" width="16" height="16" rx="2" strokeWidth="1.8" />
                <path d="M8 9h8M8 13h8M8 17h5" strokeWidth="1.7" />
                <path d="M8 6h2v2H8z" strokeWidth="0" fill="currentColor" opacity="0.4" />
            </svg>
        )
    },
    {
        id: 'alerts', label: 'ALERTS', accent: 'red', icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3a7 7 0 017 7c0 3.5-1 5-2 7H7c-1-2-2-3.5-2-7a7 7 0 017-7z" strokeWidth="1.8" />
                <path d="M10.5 20.5a1.5 1.5 0 003 0" strokeWidth="1.8" />
                <line x1="12" y1="3" x2="12" y2="1.5" strokeWidth="1.8" />
                <circle cx="17.5" cy="5" r="2.5" fill="#EF4444" stroke="none" />
            </svg>
        )
    },
    {
        id: 'chain', label: 'CHAIN', accent: 'cyan', icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="9" height="9" rx="1.5" strokeWidth="1.7" />
                <rect x="13" y="2" width="9" height="9" rx="1.5" strokeWidth="1.7" />
                <rect x="2" y="13" width="9" height="9" rx="1.5" strokeWidth="1.7" />
                <rect x="13" y="13" width="9" height="9" rx="1.5" strokeWidth="1.7" />
            </svg>
        )
    },
    {
        id: 'plan', label: 'PLAN', accent: 'purple', icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1.6" />
                <path d="M3 9h18M3 15h18M9 3v18M15 3v18" strokeWidth="1" opacity="0.45" />
                <path d="M14 7l2.5 2.5L10 16l-3 .5.5-3L14 7z" strokeWidth="1.7" />
            </svg>
        )
    },
    {
        id: 'seasonality', label: 'SEASONAL', accent: 'pink', icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="16" rx="2" strokeWidth="1.7" />
                <path d="M3 10h18" strokeWidth="1.5" />
                <path d="M8 3v4M16 3v4" strokeWidth="2" />
                <path d="M4 17q2-3 4 0t4 0 4 0" strokeWidth="1.7" fill="none" />
            </svg>
        )
    },
    {
        id: 'flow', label: 'FLOW', accent: 'lime', icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 7c4 0 4 4 8 4s4-4 8-4" strokeWidth="1.8" />
                <path d="M4 12h16" strokeWidth="1.5" strokeDasharray="2 2" />
                <path d="M4 17c4 0 4-4 8-4s4 4 8 4" strokeWidth="1.8" />
                <path d="M18 5l3 2-3 2M18 15l3 2-3 2" strokeWidth="1.8" />
            </svg>
        )
    },
    {
        id: 'screeners', label: 'SCREENERS', accent: 'teal', icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 4h18l-6.5 8V19l-5-2.5V12L3 4z" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M7 10h5M8 13h3" strokeWidth="1.4" opacity="0.55" />
            </svg>
        )
    },
    {
        id: 'rrg', label: 'RRG', accent: 'rose', icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" strokeWidth="1.7" />
                <path d="M12 3v18M3 12h18" strokeWidth="1" opacity="0.4" />
                <path d="M15 7a6 6 0 10-8 8" strokeWidth="2" />
                <path d="M16.5 5.5l-1.5 2 2 1" strokeWidth="1.8" />
            </svg>
        )
    },
    {
        id: 'insight', label: 'INSIGHT', accent: 'platinum', icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9.5 21h5M12 3a6 6 0 016 6c0 2.5-1.4 4.4-3 6H9c-1.6-1.6-3-3.5-3-6a6 6 0 016-6z" strokeWidth="1.8" />
                <path d="M9.5 18h5" strokeWidth="1.7" />
                <path d="M10.5 14.5l1.5-3.5 1.5 3.5M10.5 14.5h3" strokeWidth="1.4" />
            </svg>
        )
    },
]

/**
 * Mobile/sidebar-hidden hamburger navigation menu for EFICharting.
 * Extracted from EFICharting.tsx so the main component stays clean.
 * Manages isHamburgerOpen, hmDropPos, hmPressed state internally.
 */
export default function EFIChartingMobileHamburger({ isMobile, activeSidebarPanel, onSidebarClick }: Props) {
    const [isHamburgerOpen, setIsHamburgerOpen] = useState(false)
    const [hmDropPos, setHmDropPos] = useState({ top: 48, left: 8 })
    const [hmPressed, setHmPressed] = useState(false)

    return (
        <div style={{ position: 'relative', flexShrink: 0, marginRight: '10px' }}>
            {isHamburgerOpen && createPortal(
                <div
                    style={{ position: 'fixed', inset: 0, zIndex: 99998 }}
                    onClick={() => setIsHamburgerOpen(false)}
                />,
                document.body
            )}
            <button
                onClick={(e) => {
                    const nextOpen = !isHamburgerOpen
                    if (nextOpen) {
                        const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                        setHmDropPos({ top: rect.bottom + 8, left: rect.left })
                    }
                    setIsHamburgerOpen(nextOpen)
                }}
                onMouseDown={() => setHmPressed(true)}
                onMouseUp={() => setHmPressed(false)}
                onMouseLeave={() => setHmPressed(false)}
                onTouchStart={() => setHmPressed(true)}
                onTouchEnd={() => setHmPressed(false)}
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    position: 'relative', overflow: 'hidden',
                    width: isMobile ? '34px' : '40px',
                    height: isMobile ? '36px' : '42px',
                    padding: 0, flexShrink: 0,
                    background: isHamburgerOpen
                        ? 'linear-gradient(175deg, #111111 0%, #050505 40%, #000000 100%)'
                        : 'linear-gradient(175deg, #181818 0%, #080808 45%, #000000 100%)',
                    borderTop: `1px solid ${isHamburgerOpen ? 'rgba(255,140,30,0.85)' : 'rgba(255,140,30,0.45)'}`,
                    borderRight: `1px solid ${isHamburgerOpen ? 'rgba(255,140,30,0.6)' : 'rgba(255,140,30,0.25)'}`,
                    borderBottom: `1px solid ${isHamburgerOpen ? 'rgba(255,140,30,0.45)' : 'rgba(255,140,30,0.15)'}`,
                    borderLeft: `1px solid ${isHamburgerOpen ? 'rgba(255,140,30,0.6)' : 'rgba(255,140,30,0.25)'}`,
                    borderRadius: '8px',
                    boxShadow: hmPressed
                        ? `0 1px 4px rgba(0,0,0,0.9), 0 0 0 1px rgba(0,0,0,0.6), inset 0 2px 6px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.04)${isHamburgerOpen ? ', 0 0 10px rgba(255,102,0,0.2)' : ''}`
                        : isHamburgerOpen
                            ? '0 0 20px rgba(255,102,0,0.3), 0 4px 16px rgba(0,0,0,0.9), 0 1px 0 rgba(255,255,255,0.05), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.7)'
                            : '0 6px 20px rgba(0,0,0,0.95), 0 2px 6px rgba(0,0,0,0.7), 0 1px 0 rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -2px 0 rgba(0,0,0,0.8)',
                    cursor: 'pointer',
                    transform: hmPressed ? 'translateY(1px) scale(0.97)' : 'translateY(0) scale(1)',
                    transition: 'all 0.18s cubic-bezier(0.34,1.56,0.64,1)',
                }}
                aria-label="Toggle navigation menu"
            >
                {/* Gloss overlay */}
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0,
                    height: '52%', borderRadius: '8px 8px 40% 40%',
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0.03) 70%, transparent 100%)',
                    pointerEvents: 'none', zIndex: 1,
                }} />
                {/* Edge glow when open */}
                {isHamburgerOpen && (
                    <div style={{
                        position: 'absolute', inset: 0, borderRadius: '8px',
                        boxShadow: 'inset 0 0 12px rgba(255,102,0,0.12)',
                        pointerEvents: 'none', zIndex: 2,
                    }} />
                )}
                <svg width={isMobile ? 14 : 15} height={isMobile ? 12 : 13} viewBox="0 0 15 12" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ position: 'relative', zIndex: 3 }}>
                    <g style={{ opacity: isHamburgerOpen ? 0 : 1, transition: 'opacity 0.2s ease', pointerEvents: 'none' }}>
                        <line x1="0" y1="1" x2="15" y2="1" stroke="rgba(255,255,255,0.92)" strokeWidth="1.9" strokeLinecap="round" />
                        <line x1="0" y1="6" x2="15" y2="6" stroke="rgba(255,255,255,0.92)" strokeWidth="1.9" strokeLinecap="round" />
                        <line x1="0" y1="11" x2="15" y2="11" stroke="rgba(255,255,255,0.92)" strokeWidth="1.9" strokeLinecap="round" />
                    </g>
                    <g style={{ opacity: isHamburgerOpen ? 1 : 0, transition: 'opacity 0.2s ease', pointerEvents: 'none' }}>
                        <line x1="1.5" y1="1.5" x2="13.5" y2="10.5" stroke="#FF6600" strokeWidth="2" strokeLinecap="round" />
                        <line x1="13.5" y1="1.5" x2="1.5" y2="10.5" stroke="#FF6600" strokeWidth="2" strokeLinecap="round" />
                    </g>
                </svg>
            </button>

            {isHamburgerOpen && createPortal(
                <div style={{
                    position: 'fixed', top: `${hmDropPos.top}px`, left: `${hmDropPos.left}px`, zIndex: 99999,
                    background: 'linear-gradient(160deg, #161616 0%, #0a0a0a 100%)',
                    borderTop: '1px solid rgba(255,255,255,0.25)',
                    borderRight: '1px solid rgba(255,255,255,0.1)',
                    borderBottom: '1px solid rgba(255,255,255,0.1)',
                    borderLeft: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '10px',
                    boxShadow: '0 24px 60px rgba(0,0,0,0.95),0 8px 24px rgba(0,0,0,0.8),inset 0 1px 0 rgba(255,255,255,0.06)',
                    backdropFilter: 'blur(24px)', overflow: 'hidden', width: 'max-content', minWidth: '160px',
                    animation: 'hmDrop 0.18s cubic-bezier(0.22,1,0.36,1)',
                }}>
                    <style>{`@keyframes hmDrop{from{opacity:0;transform:translateY(-8px) scale(0.97)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>
                    {hmItems.map((item, idx) => {
                        const clr = hmAccent[item.accent]
                        const active = activeSidebarPanel === item.id
                        return (
                            <button
                                key={item.id}
                                onClick={() => { onSidebarClick(item.id); setIsHamburgerOpen(false) }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '12px',
                                    width: '100%', padding: '10px 14px',
                                    background: active ? `linear-gradient(90deg,${clr}18 0%,rgba(255,255,255,0.03) 100%)` : 'transparent',
                                    borderLeft: `3px solid ${active ? clr : 'transparent'}`,
                                    borderRight: 'none', borderTop: 'none',
                                    borderBottom: idx < hmItems.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                                    cursor: 'pointer', transition: 'all 0.15s ease',
                                    position: 'relative', overflow: 'hidden',
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.background = `linear-gradient(90deg,${clr}14 0%,rgba(255,255,255,0.02) 100%)`
                                    e.currentTarget.style.borderLeft = `3px solid ${clr}80`
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.background = active ? `linear-gradient(90deg,${clr}18 0%,rgba(255,255,255,0.03) 100%)` : 'transparent'
                                    e.currentTarget.style.borderLeft = `3px solid ${active ? clr : 'transparent'}`
                                }}
                            >
                                <div style={{
                                    width: '34px', height: '34px', borderRadius: '8px', flexShrink: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: `linear-gradient(145deg,${clr}30 0%,${clr}10 50%,rgba(0,0,0,0.5) 100%)`,
                                    borderTop: `1px solid ${clr}80`, borderRight: `1px solid ${clr}50`, borderBottom: `1px solid ${clr}50`, borderLeft: `1px solid ${clr}50`,
                                    boxShadow: `0 4px 12px ${clr}25,inset 0 1px 0 ${clr}30,inset 0 -1px 0 rgba(0,0,0,0.5)`,
                                    color: clr, position: 'relative', overflow: 'hidden',
                                }}>
                                    <div style={{ position: 'absolute', inset: 0, borderRadius: '8px', background: 'linear-gradient(160deg,rgba(255,255,255,0.18) 0%,transparent 55%)', pointerEvents: 'none' }} />
                                    <div style={{ width: '18px', height: '18px', position: 'relative', zIndex: 1, filter: `drop-shadow(0 0 4px ${clr}80)` }}>
                                        {item.icon}
                                    </div>
                                </div>
                                <span style={{
                                    fontSize: '13px', fontWeight: 700, letterSpacing: '0.08em',
                                    color: active ? clr : 'rgba(255,255,255,0.85)',
                                    textTransform: 'uppercase',
                                    textShadow: active ? `0 0 10px ${clr}60` : '0 1px 3px rgba(0,0,0,0.8)',
                                    fontFamily: 'system-ui,-apple-system,sans-serif',
                                }}>
                                    {item.label}
                                </span>
                                {active && (
                                    <div style={{ marginLeft: 'auto', width: '6px', height: '6px', borderRadius: '50%', background: clr, boxShadow: `0 0 6px ${clr}`, flexShrink: 0 }} />
                                )}
                            </button>
                        )
                    })}
                </div>,
                document.body
            )}
        </div>
    )
}
