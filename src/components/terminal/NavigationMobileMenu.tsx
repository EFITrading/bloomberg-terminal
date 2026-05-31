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
    isLandscapePhone?: boolean
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
    isLandscapePhone = false,
}: Props) {
    const [isOpen, setIsOpen] = useState(false)

    const activePageName = navLinks.find((l) => l.path === pathname)?.name ?? null

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
                    height: '100dvh',
                    background: isOpen ? 'rgba(0, 0, 0, 0.97)' : 'transparent',
                    zIndex: isOpen ? 9999999 : -1,
                    opacity: isOpen ? 1 : 0,
                    visibility: isOpen ? 'visible' : 'hidden',
                    display: isOpen ? 'flex' : 'none',
                    flexDirection: 'column',
                    overflowY: 'auto',
                    transition: 'all 0.25s ease',
                }}
            >
                <div
                    className="mobile-menu-content"
                    style={{
                        padding: isLandscapePhone ? '12px 16px' : '20px',
                        minHeight: '100%',
                        background: 'rgba(0, 0, 0, 0.98)',
                        color: 'white',
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    {/* Header */}
                    <div
                        className="mobile-menu-header"
                        style={{
                            marginBottom: isLandscapePhone ? '12px' : '30px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}
                    >
                        <div className="mobile-logo">
                            <span className="logo-evolving" style={{ color: '#FF6600', fontSize: isLandscapePhone ? '14px' : undefined }}>EFI</span>
                            <span className="logo-finance" style={{ color: '#FFFFFF', marginLeft: '5px', fontSize: isLandscapePhone ? '14px' : undefined }}>TERMINAL</span>
                        </div>
                        <button
                            className="mobile-close-btn"
                            onClick={() => setIsOpen(false)}
                            aria-label="Close mobile menu"
                            style={{
                                background: 'none',
                                border: '2px solid rgba(255, 255, 255, 0.2)',
                                color: '#FFFFFF',
                                fontSize: isLandscapePhone ? '18px' : '24px',
                                width: isLandscapePhone ? '32px' : '40px',
                                height: isLandscapePhone ? '32px' : '40px',
                                borderRadius: '50%',
                                cursor: 'pointer',
                                flexShrink: 0,
                            }}
                        >
                            ×
                        </button>
                    </div>

                    {/* Nav links — 2-column grid on landscape phone */}
                    <div
                        className="mobile-menu-links"
                        style={{
                            display: 'grid',
                            gridTemplateColumns: isLandscapePhone ? '1fr 1fr' : '1fr',
                            gap: isLandscapePhone ? '8px' : '15px',
                            flex: 1,
                        }}
                    >
                        {navLinks.map((link) => (
                            <a
                                key={link.path}
                                href={link.path}
                                className={`mobile-nav-link ${pathname === link.path ? 'active' : ''}`}
                                onClick={() => setIsOpen(false)}
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: isLandscapePhone ? '10px 14px' : '15px 20px',
                                    background:
                                        pathname === link.path
                                            ? 'rgba(255, 255, 255, 0.1)'
                                            : 'rgba(255, 255, 255, 0.05)',
                                    border: `2px solid ${pathname === link.path ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
                                    borderRadius: '8px',
                                    color: '#FFFFFF',
                                    textDecoration: 'none',
                                    fontSize: isLandscapePhone ? '13px' : '16px',
                                    fontWeight: '500',
                                }}
                            >
                                <span className="mobile-link-text">{link.name}</span>
                                <span className="mobile-link-arrow" style={{ color: '#FF6600' }}>→</span>
                            </a>
                        ))}
                    </div>

                    {/* Auth button */}
                    <div className="mobile-menu-footer" style={{ marginTop: isLandscapePhone ? '12px' : undefined }}>
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
