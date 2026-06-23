'use client'

import { useState } from 'react'
import { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'

interface NavLink {
    name: string
    path: string
}

interface Props {
    navLinks: NavLink[]
    pathname: string
    isAuthenticated: boolean
    isClient: boolean
    router: AppRouterInstance
    isSmallMobile: boolean
    hideOnInnerPages?: boolean
}

/**
 * Mobile-only navigation: hamburger button + full-screen overlay menu.
 * Extracted from Navigation.tsx so the desktop nav stays separate.
 * Renders a React Fragment: the hamburger button (used inside nav-right)
 * and the overlay (position: fixed, rendered after the <nav>).
 */
export default function NavigationMobileMenu({
    navLinks,
    pathname,
    isAuthenticated,
    isClient,
    router,
    isSmallMobile,
    hideOnInnerPages = false,
}: Props) {
    const [isOpen, setIsOpen] = useState(false)

    const activePageName = navLinks.find((l) => l.path === pathname)?.name ?? null
    const isLanding = pathname === '/' || pathname === '/login' || pathname === '/auth'

    // On inner pages the bottom tab bar handles navigation — hide the hamburger
    if (hideOnInnerPages && !isLanding) return null

    return (
        <>
            {/* ── Hamburger button (shown on mobile via .mobile-menu-btn CSS) ── */}
            <button
                className="mobile-menu-btn"
                onClick={() => setIsOpen((o) => !o)}
                aria-label="Toggle mobile menu"
                style={{
                    display: 'flex',
                    zIndex: 10001,
                    position: 'relative',
                    flexDirection: 'row',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: activePageName ? '10px' : '0',
                    width: activePageName ? 'auto' : isSmallMobile ? '38px' : '44px',
                    height: isSmallMobile ? '36px' : '44px',
                    padding: activePageName ? (isSmallMobile ? '0 10px' : '0 14px') : '0',
                    background: 'rgba(0, 0, 0, 0.85)',
                    border: '2px solid rgba(255, 133, 0, 0.5)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                }}
            >
                {/* Hamburger lines */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                    <span className={`hamburger-line ${isOpen ? 'open' : ''}`} style={{ width: '20px', height: '2px', background: '#FFFFFF', borderRadius: '2px', display: 'block' }} />
                    <span className={`hamburger-line ${isOpen ? 'open' : ''}`} style={{ width: '20px', height: '2px', background: '#FFFFFF', borderRadius: '2px', display: 'block' }} />
                    <span className={`hamburger-line ${isOpen ? 'open' : ''}`} style={{ width: '20px', height: '2px', background: '#FFFFFF', borderRadius: '2px', display: 'block' }} />
                </div>
                {/* Active page label */}
                {activePageName && (
                    <span
                        style={{
                            fontSize: isSmallMobile ? '9px' : '11px',
                            fontWeight: 700,
                            letterSpacing: isSmallMobile ? '0.03em' : '0.06em',
                            textTransform: 'uppercase',
                            color: '#FF8500',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {activePageName}
                    </span>
                )}
            </button>

            {/* ── Full-screen overlay (position: fixed, outside nav flow) ── */}
            <div
                className={`mobile-menu-overlay ${isOpen ? 'open' : ''}`}
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100vw',
                    height: '100vh',
                    background: isOpen ? 'rgba(0, 0, 0, 0.95)' : 'transparent',
                    zIndex: isOpen ? 2000000 : -1,
                    opacity: isOpen ? 1 : 0,
                    visibility: isOpen ? 'visible' : 'hidden',
                    display: isOpen ? 'flex' : 'none',
                    flexDirection: 'column',
                    transition: 'all 0.3s ease',
                }}
            >
                <div
                    className="mobile-menu-content"
                    style={{
                        padding: '20px',
                        height: '100%',
                        background: 'rgba(0, 0, 0, 0.98)',
                        color: 'white',
                        position: 'relative',
                    }}
                >
                    {/* Header */}
                    <div
                        className="mobile-menu-header"
                        style={{
                            marginBottom: '30px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}
                    >
                        <div className="mobile-logo">
                            <span className="logo-evolving" style={{ color: '#FF6600' }}>EFI</span>
                            <span className="logo-finance" style={{ color: '#FFFFFF', marginLeft: '5px' }}>TERMINAL</span>
                        </div>
                        <button
                            className="mobile-close-btn"
                            onClick={() => setIsOpen(false)}
                            aria-label="Close mobile menu"
                            style={{
                                background: 'none',
                                border: '2px solid rgba(255, 255, 255, 0.2)',
                                color: '#FFFFFF',
                                fontSize: '24px',
                                width: '40px',
                                height: '40px',
                                borderRadius: '50%',
                                cursor: 'pointer',
                            }}
                        >
                            ×
                        </button>
                    </div>

                    {/* Nav links */}
                    <div
                        className="mobile-menu-links"
                        style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}
                    >
                        {navLinks.map((link) => {
                            const isLocked = link.path === '/analysis-suite' || link.path === '/ai-suite'
                            return isLocked ? (
                                <div
                                    key={link.path}
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '15px 20px',
                                        background: 'rgba(255, 255, 255, 0.02)',
                                        border: '2px solid rgba(255, 255, 255, 0.06)',
                                        borderRadius: '8px',
                                        color: 'rgba(255,255,255,0.3)',
                                        fontSize: '16px',
                                        fontWeight: '500',
                                        cursor: 'default',
                                    }}
                                >
                                    <span>{link.name}</span>
                                    <svg width="13" height="15" viewBox="0 0 12 15" fill="none">
                                        <rect x="1" y="6" width="10" height="8" rx="1.5" fill="rgba(255,133,0,0.15)" stroke="rgba(255,133,0,0.6)" strokeWidth="1.2" />
                                        <path d="M3 6V4.5C3 2.57 4.34 1.5 6 1.5C7.66 1.5 9 2.57 9 4.5V6" stroke="rgba(255,133,0,0.6)" strokeWidth="1.2" strokeLinecap="round" fill="none" />
                                        <circle cx="6" cy="9.8" r="1.2" fill="rgba(255,133,0,0.7)" />
                                    </svg>
                                </div>
                            ) : (
                                <a
                                    key={link.path}
                                    href={link.path}
                                    className={`mobile-nav-link ${pathname === link.path ? 'active' : ''}`}
                                    onClick={() => setIsOpen(false)}
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '15px 20px',
                                        background:
                                            pathname === link.path
                                                ? 'rgba(255, 255, 255, 0.1)'
                                                : 'rgba(255, 255, 255, 0.05)',
                                        border: `2px solid ${pathname === link.path ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
                                        borderRadius: '8px',
                                        color: '#FFFFFF',
                                        textDecoration: 'none',
                                        fontSize: '16px',
                                        fontWeight: '500',
                                    }}
                                >
                                    <span className="mobile-link-text">{link.name}</span>
                                    <span className="mobile-link-arrow" style={{ color: '#FF6600' }}>→</span>
                                </a>
                            )
                        })}
                    </div>

                    {/* Auth button */}
                    <div className="mobile-menu-footer">
                        {isClient && (
                            <>
                                {isAuthenticated ? (
                                    <button
                                        className="mobile-btn-login"
                                        onClick={async () => {
                                            try {
                                                await fetch('/api/auth', { method: 'DELETE' })
                                                document.cookie = 'efi-auth=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;'
                                                setIsOpen(false)
                                                router.push('/login')
                                            } catch (error) {
                                                console.error('Logout error:', error)
                                                window.location.href = '/login'
                                            }
                                        }}
                                    >
                                        Logout
                                    </button>
                                ) : (
                                    <button
                                        className="mobile-btn-login"
                                        onClick={() => {
                                            setIsOpen(false)
                                            router.push('/login')
                                        }}
                                    >
                                        Login
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </>
    )
}
