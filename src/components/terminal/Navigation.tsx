'use client'

import React, { useEffect, useState } from 'react'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

import { useMarketRegime } from '@/contexts/MarketRegimeContext'

import FearGreedGauge from './FearGreedGauge'
import NavigationMobileMenu from './NavigationMobileMenu'
import TickerScroller from './TickerScroller'
import { useNavigationMobile } from './useNavigationMobile'

export default function Navigation() {
  const { regimes, regimeAnalysis } = useMarketRegime()
  const [currentTime, setCurrentTime] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isClient, setIsClient] = useState(false)
  const { isMobile, isSmallMobile } = useNavigationMobile()
  const pathname = usePathname()
  const router = useRouter()

  // Fix hydration - only run on client
  useEffect(() => {
    setIsClient(true)
  }, [])



  useEffect(() => {
    if (!isClient) return

    const updateClock = () => {
      const now = new Date()
      const hours = String(now.getHours()).padStart(2, '0')
      const minutes = String(now.getMinutes()).padStart(2, '0')
      const seconds = String(now.getSeconds()).padStart(2, '0')
      setCurrentTime(`${hours}:${minutes}:${seconds} EST`)
    }

    updateClock()
    const interval = setInterval(updateClock, 1000)
    return () => clearInterval(interval)
  }, [isClient])

  // Check authentication status
  useEffect(() => {
    if (!isClient) return

    const checkAuth = () => {
      const cookies = document.cookie.split(';')
      const authCookie = cookies.find((cookie) => cookie.trim().startsWith('efi-auth='))
      const isAuth = authCookie && authCookie.includes('authenticated')
      setIsAuthenticated(!!isAuth)
    }

    checkAuth()
    // Check auth status when pathname changes
  }, [pathname, isClient])

  const navLinks = [
    { name: 'Market Overview', path: '/market-overview', color: '#38bdf8' },
    { name: 'Analysis Suite', path: '/analysis-suite', color: '#a855f7' },
    { name: 'Data Driven', path: '/data-driven', color: '#22c55e' },
    { name: 'Analytics', path: '/analytics', color: '#FF8500' },
    { name: 'AI Suite', path: '/ai-suite', color: '#ec4899' },
    { name: 'OptionsFlow', path: '/options-flow', color: '#06b6d4' },
  ]

  return (
    <>
      <nav
        className="nav"
        style={{
          background: 'linear-gradient(180deg, #2e2e2e 0%, #1c1c1c 30%, #0e0e0e 60%, #050505 100%)',
          borderBottom: '1px solid rgba(255, 133, 0, 0.3)',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(255,255,255,0.18), inset 0 2px 6px rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.8)',
          position: 'sticky',
          top: 0,
          width: '100%',
          overflow: 'hidden',
          zIndex: 1000,
        }}
      >
        {/* Gloss sheen overlay */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '55%',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.03) 70%, transparent 100%)',
            borderRadius: '0 0 60% 60% / 0 0 30px 30px',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
        {/* Top highlight line */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '1px',
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 30%, rgba(255,255,255,0.55) 50%, rgba(255,255,255,0.35) 70%, transparent 100%)',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />
        {/* Animated background accent */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '2px',
            background: 'linear-gradient(90deg, transparent, #FF8500, transparent)',
            animation: 'shimmer 3s infinite',
            opacity: 0.6,
          }}
        />

        <div
          className="nav-main"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '0',
            paddingBottom: '0',
            paddingLeft: isSmallMobile ? '8px' : isMobile ? '12px' : '24px',
            paddingRight: isSmallMobile ? '8px' : isMobile ? '12px' : '24px',
            gap: isMobile ? '10px' : '0',
            height: isMobile ? '56px' : '90px',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <div className="nav-brand" style={{ flexShrink: 1, minWidth: 0 }}>
            <Link href="/" style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '8px',
                  }}
                >
                  <span
                    style={{
                      fontSize: isSmallMobile ? '12px' : isMobile ? '15px' : '22px',
                      fontWeight: '800',
                      letterSpacing: isSmallMobile ? '0.5px' : '1.5px',
                      background: 'linear-gradient(135deg, #FFFFFF 0%, #999999 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      textShadow: '0 0 20px rgba(255, 255, 255, 0.3)',
                    }}
                  >
                    EVOLVING
                  </span>
                  <span
                    style={{
                      fontSize: isSmallMobile ? '12px' : isMobile ? '15px' : '22px',
                      fontWeight: '800',
                      letterSpacing: isSmallMobile ? '0.5px' : '1.5px',
                      background: 'linear-gradient(135deg, #FF8500 0%, #FFB800 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      textShadow: '0 0 20px rgba(255, 133, 0, 0.5)',
                    }}
                  >
                    FINANCE
                  </span>
                </div>
                <div
                  style={{
                    height: '2px',
                    background: 'linear-gradient(90deg, #FF8500 0%, #FFB800 50%, #FF8500 100%)',
                    borderRadius: '2px',
                    boxShadow: '0 0 10px rgba(255, 133, 0, 0.5)',
                  }}
                />
                {!isSmallMobile && (
                  <div
                    style={{
                      fontSize: isSmallMobile ? '12px' : isMobile ? '15px' : '20px',
                      fontWeight: '800',
                      letterSpacing: isSmallMobile ? '0.5px' : '1.5px',
                      color: '#999',
                      textAlign: 'center',
                      marginTop: '2px',
                    }}
                  >
                    INSTITUTE
                  </div>
                )}
              </div>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div
            className="nav-center"
            style={{
              display: 'flex',
              alignItems: 'stretch',
              gap: '0',
              borderBottom: '1px solid rgba(255, 133, 0, 0.12)',
            }}
          >
            {navLinks.map((link, i) => {
              const isActive = pathname === link.path
              return (
                <React.Fragment key={link.path}>
                  {i > 0 && (
                    <span
                      style={{
                        width: '1px',
                        margin: '12px 0',
                        background: 'rgba(255, 133, 0, 0.15)',
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <Link
                    href={link.path}
                    style={{
                      padding: '0 22px',
                      height: '48px',
                      fontSize: '15px',
                      fontWeight: '700',
                      letterSpacing: '1.8px',
                      background: isActive
                        ? `linear-gradient(180deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.04) 50%, rgba(0,0,0,0.15) 100%)`
                        : 'linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 50%, rgba(0,0,0,0.1) 100%)',
                      borderRadius: '6px 6px 0 0',
                      textTransform: 'uppercase',
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      position: 'relative',
                      color: isActive ? '#FF8500' : 'rgba(255,255,255,0.75)',
                      WebkitTextFillColor: isActive ? '#FF8500' : 'rgba(255,255,255,0.75)',
                      borderBottom: isActive
                        ? `2px solid ${link.color}`
                        : '2px solid transparent',
                      boxShadow: isActive ? `0 2px 14px ${link.color}70` : 'none',
                      textShadow: isActive
                        ? `0 2px 4px ${link.color}CC, 0 4px 10px rgba(0,0,0,0.9), 0 0 22px ${link.color}80`
                        : '0 1px 0 rgba(120,120,120,0.12), 0 2px 4px rgba(0,0,0,0.7)',
                      transform: 'scale(1) translateY(0px)',
                      transition: 'color 0.18s ease, border-color 0.18s ease, text-shadow 0.18s ease, transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.18s ease',
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.color = '#FFFFFF'
                        e.currentTarget.style.WebkitTextFillColor = '#FFFFFF'
                        e.currentTarget.style.borderBottomColor = `${link.color}80`
                        e.currentTarget.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 50%, rgba(0,0,0,0.1) 100%)'
                      }
                      e.currentTarget.style.transform = 'scale(1.1) translateY(-2px)'
                      e.currentTarget.style.boxShadow = `0 6px 22px ${link.color}55`
                      e.currentTarget.style.textShadow = `0 2px 4px ${link.color}CC, 0 0 24px ${link.color}99, 0 4px 10px rgba(0,0,0,0.9)`
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.color = 'rgba(255,255,255,0.75)'
                        e.currentTarget.style.WebkitTextFillColor = 'rgba(255,255,255,0.75)'
                        e.currentTarget.style.borderBottomColor = 'transparent'
                        e.currentTarget.style.boxShadow = 'none'
                        e.currentTarget.style.textShadow = '0 1px 0 rgba(120,120,120,0.12), 0 2px 4px rgba(0,0,0,0.7)'
                        e.currentTarget.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 50%, rgba(0,0,0,0.1) 100%)'
                      } else {
                        e.currentTarget.style.boxShadow = `0 2px 14px ${link.color}70`
                        e.currentTarget.style.textShadow = `0 2px 4px ${link.color}CC, 0 4px 10px rgba(0,0,0,0.9), 0 0 22px ${link.color}80`
                        e.currentTarget.style.background = `linear-gradient(180deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.04) 50%, rgba(0,0,0,0.15) 100%)`
                      }
                      e.currentTarget.style.transform = 'scale(1) translateY(0px)'
                    }}
                  >
                    {link.name}
                  </Link>
                </React.Fragment>
              )
            })}
          </div>

          <div
            className="nav-right"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
            }}
          >
            {/* Mobile hamburger + overlay — extracted to NavigationMobileMenu.tsx */}
            <NavigationMobileMenu
              navLinks={navLinks}
              pathname={pathname}
              isAuthenticated={isAuthenticated}
              isClient={isClient}
              router={router}
              isSmallMobile={isSmallMobile}
            />

            {/* Desktop Status and Auth */}
            <div
              className="desktop-nav-right"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
              }}
            >
              {/* Fear & Greed Gauge */}
              {Object.keys(regimeAnalysis).length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'center',
                    padding: '8px 16px',
                    background: 'rgba(255, 255, 255, 0.02)',
                    borderRadius: '10px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  <FearGreedGauge regimeAnalysis={regimeAnalysis} />
                </div>
              )}

              {/* OLD: Individual Regime Indicators (keeping for reference/toggle) */}
              {false && regimes.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    gap: '12px',
                    marginRight: '16px',
                    alignItems: 'center',
                  }}
                >
                  {regimes.map(({ period, regime }) => (
                    <div
                      key={period}
                      className="regime-indicator"
                      data-regime={regime}
                      style={{
                        position: 'relative',
                        padding: '12px 20px 12px 48px',
                        borderRadius: '12px',
                        fontWeight: '600',
                        fontSize: '13px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: '2px',
                        minWidth: '140px',
                        background:
                          regime === 'RISK ON'
                            ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.08) 100%)'
                            : regime === 'DEFENSIVE'
                              ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(220, 38, 38, 0.08) 100%)'
                              : 'linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(245, 158, 11, 0.08) 100%)',
                        border: `2px solid ${regime === 'RISK ON' ? 'rgba(16, 185, 129, 0.6)' : regime === 'DEFENSIVE' ? 'rgba(239, 68, 68, 0.6)' : 'rgba(251, 191, 36, 0.6)'}`,
                        boxShadow:
                          regime === 'RISK ON'
                            ? '0 8px 32px rgba(16, 185, 129, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                            : regime === 'DEFENSIVE'
                              ? '0 8px 32px rgba(239, 68, 68, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                              : '0 8px 32px rgba(251, 191, 36, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                        color:
                          regime === 'RISK ON'
                            ? '#10b981'
                            : regime === 'DEFENSIVE'
                              ? '#ef4444'
                              : '#fbbf24',
                        backdropFilter: 'blur(12px)',
                        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                        overflow: 'visible',
                        cursor: 'pointer',
                      }}
                    >
                      {/* 3D Animated Icon Container */}
                      <div
                        style={{
                          position: 'absolute',
                          left: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: '32px',
                          height: '32px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {regime === 'DEFENSIVE' && (
                          <div className="regime-icon-defensive">
                            {/* 3D Alert Icon */}
                            <svg
                              width="28"
                              height="28"
                              viewBox="0 0 24 24"
                              fill="none"
                              style={{ filter: 'drop-shadow(0 0 8px rgba(239, 68, 68, 0.6))' }}
                            >
                              <path
                                d="M12 2L2 19.5h20L12 2z"
                                fill="url(#defensiveGradient)"
                                stroke="#ef4444"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <path
                                d="M12 9v4M12 17h.01"
                                stroke="#fff"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                              />
                              <defs>
                                <linearGradient
                                  id="defensiveGradient"
                                  x1="12"
                                  y1="2"
                                  x2="12"
                                  y2="19.5"
                                >
                                  <stop offset="0%" stopColor="#ef4444" stopOpacity="0.9" />
                                  <stop offset="100%" stopColor="#dc2626" stopOpacity="0.7" />
                                </linearGradient>
                              </defs>
                            </svg>
                            <div className="siren-light"></div>
                          </div>
                        )}
                        {regime === 'RISK ON' && (
                          <div className="regime-icon-risk-on">
                            {/* 3D Rocket Icon */}
                            <svg
                              width="28"
                              height="28"
                              viewBox="0 0 24 24"
                              fill="none"
                              style={{ filter: 'drop-shadow(0 0 8px rgba(16, 185, 129, 0.6))' }}
                            >
                              <path
                                d="M12 2c3.5 3.5 5 7 5 10.5 0 2.5-2 4.5-4.5 4.5S8 15 8 12.5C8 9 9.5 5.5 13 2h-1z"
                                fill="url(#riskOnGradient)"
                                stroke="#10b981"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <path
                                d="M7 17l-2 5h4l-2-5zM15 17l2 5h-4l2-5z"
                                fill="#10b981"
                                opacity="0.6"
                              />
                              <circle cx="12" cy="10" r="1.5" fill="#fff" />
                              <defs>
                                <linearGradient id="riskOnGradient" x1="12" y1="2" x2="12" y2="17">
                                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.9" />
                                  <stop offset="100%" stopColor="#059669" stopOpacity="0.7" />
                                </linearGradient>
                              </defs>
                            </svg>
                            <div className="sparkle sparkle-1"></div>
                            <div className="sparkle sparkle-2"></div>
                            <div className="sparkle sparkle-3"></div>
                          </div>
                        )}
                        {regime === 'VALUE' && (
                          <div className="regime-icon-value">
                            {/* 3D Coin Stack Icon */}
                            <svg
                              width="28"
                              height="28"
                              viewBox="0 0 24 24"
                              fill="none"
                              style={{ filter: 'drop-shadow(0 0 8px rgba(251, 191, 36, 0.6))' }}
                            >
                              <ellipse
                                cx="12"
                                cy="8"
                                rx="7"
                                ry="3"
                                fill="url(#valueGradient1)"
                                stroke="#fbbf24"
                                strokeWidth="2"
                              />
                              <ellipse
                                cx="12"
                                cy="12"
                                rx="7"
                                ry="3"
                                fill="url(#valueGradient2)"
                                stroke="#fbbf24"
                                strokeWidth="2"
                              />
                              <ellipse
                                cx="12"
                                cy="16"
                                rx="7"
                                ry="3"
                                fill="url(#valueGradient3)"
                                stroke="#fbbf24"
                                strokeWidth="2"
                              />
                              <text
                                x="12"
                                y="17"
                                textAnchor="middle"
                                fill="#000"
                                fontSize="10"
                                fontWeight="bold"
                              >
                                $
                              </text>
                              <defs>
                                <linearGradient id="valueGradient1" x1="12" y1="5" x2="12" y2="11">
                                  <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.9" />
                                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.6" />
                                </linearGradient>
                                <linearGradient id="valueGradient2" x1="12" y1="9" x2="12" y2="15">
                                  <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.8" />
                                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.5" />
                                </linearGradient>
                                <linearGradient id="valueGradient3" x1="12" y1="13" x2="12" y2="19">
                                  <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.9" />
                                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.7" />
                                </linearGradient>
                              </defs>
                            </svg>
                            <div className="coin-shine"></div>
                          </div>
                        )}
                      </div>

                      <span
                        style={{
                          fontSize: '9px',
                          opacity: 0.7,
                          fontWeight: '600',
                          letterSpacing: '1px',
                          textTransform: 'uppercase',
                          marginBottom: '2px',
                        }}
                      >
                        {period}
                      </span>
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: '700',
                          letterSpacing: '0.5px',
                          textShadow: `0 2px 8px ${regime === 'RISK ON' ? 'rgba(16, 185, 129, 0.6)' : regime === 'DEFENSIVE' ? 'rgba(239, 68, 68, 0.6)' : 'rgba(251, 191, 36, 0.6)'}`,
                        }}
                      >
                        {regime}
                      </span>

                      {/* Animated border overlay */}
                      <div className="regime-border-glow"></div>
                    </div>
                  ))}
                </div>
              )}

              {isClient && (
                <>
                  {isAuthenticated ? (
                    <button
                      onClick={() => router.push('/account')}
                      style={{
                        background: 'linear-gradient(135deg, #FF8500 0%, #FFB800 100%)',
                        border: '1px solid rgba(255, 184, 0, 0.5)',
                        color: '#000',
                        padding: '12px 28px',
                        borderRadius: '10px',
                        fontSize: '14px',
                        fontWeight: '700',
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        boxShadow:
                          '0 4px 15px rgba(255, 133, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
                        transition: 'all 0.3s ease',
                        position: 'relative',
                        overflow: 'hidden',
                        minWidth: '100px',
                        whiteSpace: 'nowrap',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)'
                        e.currentTarget.style.boxShadow =
                          '0 6px 20px rgba(255, 133, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.3)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)'
                        e.currentTarget.style.boxShadow =
                          '0 4px 15px rgba(255, 133, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)'
                      }}
                    >
                      Member
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        router.push('/login')
                      }}
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '2px solid rgba(255, 133, 0, 0.3)',
                        color: '#FF8500',
                        padding: '12px 28px',
                        borderRadius: '10px',
                        fontSize: '14px',
                        fontWeight: '700',
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        minWidth: '100px',
                        whiteSpace: 'nowrap',
                        backdropFilter: 'blur(10px)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 133, 0, 0.1)'
                        e.currentTarget.style.borderColor = 'rgba(255, 133, 0, 0.6)'
                        e.currentTarget.style.boxShadow = '0 0 20px rgba(255, 133, 0, 0.3)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                        e.currentTarget.style.borderColor = 'rgba(255, 133, 0, 0.3)'
                        e.currentTarget.style.boxShadow = 'none'
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
      </nav>

      {/* Mobile overlay — extracted to NavigationMobileMenu.tsx */}
      <TickerScroller />
    </>
  )
}
