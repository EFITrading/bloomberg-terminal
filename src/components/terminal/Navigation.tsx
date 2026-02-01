'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { useMarketRegime } from '@/contexts/MarketRegimeContext';
import FearGreedGauge from './FearGreedGauge';
import LoginModal from '@/components/LoginModal';
import TickerScroller from './TickerScroller';



export default function Navigation() {
  const { data: session } = useSession();
  const { regimes } = useMarketRegime();
  const [currentTime, setCurrentTime] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Fix hydration - only run on client
  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;

    const updateClock = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      setCurrentTime(`${hours}:${minutes}:${seconds} EST`);
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, [isClient]);

  // Check authentication status
  useEffect(() => {
    if (!isClient) return;

    const checkAuth = () => {
      const cookies = document.cookie.split(';');
      const authCookie = cookies.find(cookie => cookie.trim().startsWith('efi-auth='));
      const isAuth = authCookie && authCookie.includes('authenticated');
      const hasDiscordAuth = (session as any)?.hasAccess;
      setIsAuthenticated(!!isAuth || !!hasDiscordAuth);
    };

    checkAuth();
    // Check auth status when pathname changes
  }, [pathname, isClient, session]);

  const navLinks = [
    { name: 'Market Overview', path: '/market-overview' },
    { name: 'Analysis Suite', path: '/analysis-suite' },
    { name: 'Data Driven', path: '/data-driven' },
    { name: 'Analytics', path: '/analytics' },
    { name: 'AI Suite', path: '/ai-suite' },
    { name: 'Lens', path: '/trading-lens' },
    { name: 'OptionsFlow', path: '/options-flow' }
  ];

  return (
    <>
      <nav className="nav" style={{
        background: 'linear-gradient(180deg, #000000 0%, #0a0a0a 100%)',
        borderBottom: '1px solid rgba(255, 133, 0, 0.3)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.8), 0 1px 0 rgba(255, 133, 0, 0.1)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Animated background accent */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '2px',
          background: 'linear-gradient(90deg, transparent, #FF8500, transparent)',
          animation: 'shimmer 3s infinite',
          opacity: 0.6
        }} />

        <div className="nav-main" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          height: typeof window !== 'undefined' && window.innerWidth <= 768 ? '90px' : '90px',
          position: 'relative',
          zIndex: 1,
          paddingTop: typeof window !== 'undefined' && window.innerWidth <= 768 ? '20px' : '0'
        }}>
          <div className="nav-brand">
            <Link
              href="/"
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '2px'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '8px'
                }}>
                  <span style={{
                    fontSize: '22px',
                    fontWeight: '800',
                    letterSpacing: '1.5px',
                    background: 'linear-gradient(135deg, #FFFFFF 0%, #999999 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    textShadow: '0 0 20px rgba(255, 255, 255, 0.3)'
                  }}>EVOLVING</span>
                  <span style={{
                    fontSize: '22px',
                    fontWeight: '800',
                    letterSpacing: '1.5px',
                    background: 'linear-gradient(135deg, #FF8500 0%, #FFB800 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    textShadow: '0 0 20px rgba(255, 133, 0, 0.5)'
                  }}>FINANCE</span>
                </div>
                <div style={{
                  height: '2px',
                  background: 'linear-gradient(90deg, #FF8500 0%, #FFB800 50%, #FF8500 100%)',
                  borderRadius: '2px',
                  boxShadow: '0 0 10px rgba(255, 133, 0, 0.5)'
                }} />
                <div style={{
                  fontSize: '9px',
                  fontWeight: '700',
                  letterSpacing: '3px',
                  color: '#999',
                  textAlign: 'center',
                  marginTop: '2px'
                }}>INSTITUTE</div>
              </div>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="nav-center" style={{
            display: 'flex',
            gap: '6px',
            alignItems: 'center',
            background: '#000000',
            padding: '8px',
            borderRadius: '12px',
            border: '1px solid rgba(255, 165, 0, 0.3)'
          }}>
            {navLinks.map((link) => {
              const isActive = pathname === link.path;
              return (
                <Link
                  key={link.path}
                  href={link.path}
                  style={{
                    padding: '14px 28px',
                    fontSize: '14px',
                    fontWeight: '700',
                    letterSpacing: '0.8px',
                    textTransform: 'uppercase',
                    color: '#FFFFFF',
                    background: isActive ? '#000000' : 'transparent',
                    borderRadius: '8px',
                    textDecoration: 'none',
                    display: 'inline-block',
                    border: isActive ? '2px solid #FFA500' : '1px solid rgba(255, 165, 0, 0.3)',
                    cursor: 'pointer',
                    opacity: 1,
                    filter: 'none',
                    backdropFilter: 'none',
                    WebkitTextFillColor: isActive ? '#FFA500' : '#FFFFFF',
                    transition: 'none',
                    transform: 'none',
                    boxShadow: isActive ? '0 4px 12px rgba(255, 165, 0, 0.4)' : 'none',
                    textShadow: 'none'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.borderColor = '#FFA500';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.borderColor = 'rgba(255, 165, 0, 0.3)';
                    }
                  }}
                >
                  <span style={{ color: isActive ? '#FFA500' : '#FFFFFF', opacity: 1, filter: 'none' }}>
                    {link.name}
                  </span>
                </Link>
              );
            })}
          </div>

          <div className="nav-right" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}>
            {/* Mobile Menu Button */}
            <button
              className="mobile-menu-btn"
              onClick={() => {
                setIsMobileMenuOpen(!isMobileMenuOpen);
              }}
              aria-label="Toggle mobile menu"
              style={{
                display: 'flex',
                zIndex: 10001,
                position: 'relative',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                width: '50px',
                height: '50px',
                background: 'rgba(0, 0, 0, 0.8)',
                border: '2px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)'
              }}
            >
              <span
                className={`hamburger-line ${isMobileMenuOpen ? 'open' : ''}`}
                style={{
                  width: '30px',
                  height: '4px',
                  background: '#FFFFFF',
                  margin: '2px 0',
                  borderRadius: '2px',
                  display: 'block',
                  boxShadow: '0 0 3px rgba(255, 255, 255, 0.8)'
                }}
              ></span>
              <span
                className={`hamburger-line ${isMobileMenuOpen ? 'open' : ''}`}
                style={{
                  width: '30px',
                  height: '4px',
                  background: '#FFFFFF',
                  margin: '2px 0',
                  borderRadius: '2px',
                  display: 'block',
                  boxShadow: '0 0 3px rgba(255, 255, 255, 0.8)'
                }}
              ></span>
              <span
                className={`hamburger-line ${isMobileMenuOpen ? 'open' : ''}`}
                style={{
                  width: '30px',
                  height: '4px',
                  background: '#FFFFFF',
                  margin: '2px 0',
                  borderRadius: '2px',
                  display: 'block',
                  boxShadow: '0 0 3px rgba(255, 255, 255, 0.8)'
                }}
              ></span>
            </button>

            {/* Desktop Status and Auth */}
            <div className="desktop-nav-right" style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px'
            }}>
              {/* Fear & Greed Gauge */}
              {regimes.length > 0 && (
                <div style={{
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'center',
                  padding: '8px 16px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  borderRadius: '10px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  backdropFilter: 'blur(10px)'
                }}>
                  <FearGreedGauge regimes={regimes} />
                </div>
              )}

              {/* OLD: Individual Regime Indicators (keeping for reference/toggle) */}
              {false && regimes.length > 0 && (
                <div style={{ display: 'flex', gap: '12px', marginRight: '16px', alignItems: 'center' }}>
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
                        background: regime === 'RISK ON'
                          ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.08) 100%)'
                          : regime === 'DEFENSIVE'
                            ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(220, 38, 38, 0.08) 100%)'
                            : 'linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(245, 158, 11, 0.08) 100%)',
                        border: `2px solid ${regime === 'RISK ON' ? 'rgba(16, 185, 129, 0.6)' : regime === 'DEFENSIVE' ? 'rgba(239, 68, 68, 0.6)' : 'rgba(251, 191, 36, 0.6)'}`,
                        boxShadow: regime === 'RISK ON'
                          ? '0 8px 32px rgba(16, 185, 129, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                          : regime === 'DEFENSIVE'
                            ? '0 8px 32px rgba(239, 68, 68, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                            : '0 8px 32px rgba(251, 191, 36, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                        color: regime === 'RISK ON' ? '#10b981' : regime === 'DEFENSIVE' ? '#ef4444' : '#fbbf24',
                        backdropFilter: 'blur(12px)',
                        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                        overflow: 'visible',
                        cursor: 'pointer'
                      }}
                    >
                      {/* 3D Animated Icon Container */}
                      <div style={{
                        position: 'absolute',
                        left: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: '32px',
                        height: '32px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {regime === 'DEFENSIVE' && (
                          <div className="regime-icon-defensive">
                            {/* 3D Alert Icon */}
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ filter: 'drop-shadow(0 0 8px rgba(239, 68, 68, 0.6))' }}>
                              <path d="M12 2L2 19.5h20L12 2z" fill="url(#defensiveGradient)" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M12 9v4M12 17h.01" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
                              <defs>
                                <linearGradient id="defensiveGradient" x1="12" y1="2" x2="12" y2="19.5">
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
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ filter: 'drop-shadow(0 0 8px rgba(16, 185, 129, 0.6))' }}>
                              <path d="M12 2c3.5 3.5 5 7 5 10.5 0 2.5-2 4.5-4.5 4.5S8 15 8 12.5C8 9 9.5 5.5 13 2h-1z" fill="url(#riskOnGradient)" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M7 17l-2 5h4l-2-5zM15 17l2 5h-4l2-5z" fill="#10b981" opacity="0.6" />
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
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ filter: 'drop-shadow(0 0 8px rgba(251, 191, 36, 0.6))' }}>
                              <ellipse cx="12" cy="8" rx="7" ry="3" fill="url(#valueGradient1)" stroke="#fbbf24" strokeWidth="2" />
                              <ellipse cx="12" cy="12" rx="7" ry="3" fill="url(#valueGradient2)" stroke="#fbbf24" strokeWidth="2" />
                              <ellipse cx="12" cy="16" rx="7" ry="3" fill="url(#valueGradient3)" stroke="#fbbf24" strokeWidth="2" />
                              <text x="12" y="17" textAnchor="middle" fill="#000" fontSize="10" fontWeight="bold">$</text>
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

                      <span style={{
                        fontSize: '9px',
                        opacity: 0.7,
                        fontWeight: '600',
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                        marginBottom: '2px'
                      }}>{period}</span>
                      <span style={{
                        fontSize: '13px',
                        fontWeight: '700',
                        letterSpacing: '0.5px',
                        textShadow: `0 2px 8px ${regime === 'RISK ON' ? 'rgba(16, 185, 129, 0.6)' : regime === 'DEFENSIVE' ? 'rgba(239, 68, 68, 0.6)' : 'rgba(251, 191, 36, 0.6)'}`
                      }}>{regime}</span>

                      {/* Animated border overlay */}
                      <div className="regime-border-glow"></div>
                    </div>
                  ))}
                </div>
              )}

              {isClient && (
                <>
                  {isAuthenticated ? (
                    session?.user?.image ? (
                      <button
                        onClick={() => router.push('/account')}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          padding: '0',
                          cursor: 'pointer',
                          position: 'relative'
                        }}
                      >
                        <div style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '50%',
                          border: '2px solid rgba(255, 133, 0, 0.5)',
                          padding: '2px',
                          background: 'linear-gradient(135deg, rgba(255, 133, 0, 0.1) 0%, rgba(255, 184, 0, 0.1) 100%)',
                          boxShadow: '0 0 20px rgba(255, 133, 0, 0.3)',
                          transition: 'all 0.3s ease'
                        }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.boxShadow = '0 0 30px rgba(255, 133, 0, 0.6)';
                            e.currentTarget.style.borderColor = 'rgba(255, 133, 0, 0.8)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.boxShadow = '0 0 20px rgba(255, 133, 0, 0.3)';
                            e.currentTarget.style.borderColor = 'rgba(255, 133, 0, 0.5)';
                          }}
                        >
                          <img
                            src={session.user.image}
                            alt="Profile"
                            style={{
                              width: '100%',
                              height: '100%',
                              borderRadius: '50%',
                              objectFit: 'cover'
                            }}
                          />
                        </div>
                      </button>
                    ) : (
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
                          boxShadow: '0 4px 15px rgba(255, 133, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
                          transition: 'all 0.3s ease',
                          position: 'relative',
                          overflow: 'hidden',
                          minWidth: '100px',
                          whiteSpace: 'nowrap'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = '0 6px 20px rgba(255, 133, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.3)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = '0 4px 15px rgba(255, 133, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)';
                        }}
                      >
                        Member
                      </button>
                    )
                  ) : (
                    <button
                      onClick={() => {
                        setIsLoginModalOpen(true);
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
                        backdropFilter: 'blur(10px)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 133, 0, 0.1)';
                        e.currentTarget.style.borderColor = 'rgba(255, 133, 0, 0.6)';
                        e.currentTarget.style.boxShadow = '0 0 20px rgba(255, 133, 0, 0.3)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        e.currentTarget.style.borderColor = 'rgba(255, 133, 0, 0.3)';
                        e.currentTarget.style.boxShadow = 'none';
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

      {/* Login Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        redirectTo="/market-overview"
      />

      {/* Mobile Menu Overlay */}
      <div
        className={`mobile-menu-overlay ${isMobileMenuOpen ? 'open' : ''}`}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: isMobileMenuOpen ? 'rgba(0, 0, 0, 0.95)' : 'transparent',
          zIndex: isMobileMenuOpen ? 99999 : -1,
          opacity: isMobileMenuOpen ? 1 : 0,
          visibility: isMobileMenuOpen ? 'visible' : 'hidden',
          display: isMobileMenuOpen ? 'flex' : 'none',
          flexDirection: 'column',
          transition: 'all 0.3s ease'
        }}
      >
        <div
          className="mobile-menu-content"
          style={{
            padding: '20px',
            height: '100%',
            background: 'rgba(0, 0, 0, 0.98)',
            color: 'white',
            position: 'relative'
          }}
        >
          <div className="mobile-menu-header" style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="mobile-logo">
              <span className="logo-evolving" style={{ color: '#FF6600' }}>EFI</span>
              <span className="logo-finance" style={{ color: '#FFFFFF', marginLeft: '5px' }}>TERMINAL</span>
            </div>
            <button
              className="mobile-close-btn"
              onClick={() => setIsMobileMenuOpen(false)}
              aria-label="Close mobile menu"
              style={{
                background: 'none',
                border: '2px solid rgba(255, 255, 255, 0.2)',
                color: '#FFFFFF',
                fontSize: '24px',
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                cursor: 'pointer'
              }}
            >
              ×
            </button>
          </div>

          <div className="mobile-menu-links" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {navLinks.map((link) => (
              <a
                key={link.path}
                href={link.path}
                className={`mobile-nav-link ${pathname === link.path ? 'active' : ''}`}
                onClick={() => {
                  setIsMobileMenuOpen(false);
                }}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '15px 20px',
                  background: pathname === link.path ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                  border: `2px solid ${pathname === link.path ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
                  borderRadius: '8px',
                  color: '#FFFFFF',
                  textDecoration: 'none',
                  fontSize: '16px',
                  fontWeight: '500'
                }}
              >
                <span className="mobile-link-text">{link.name}</span>
                <span className="mobile-link-arrow" style={{ color: '#FF6600' }}>→</span>
              </a>
            ))}
          </div>

          <div className="mobile-menu-footer">
            {isClient && (
              <>
                {isAuthenticated ? (
                  <button
                    className="mobile-btn-login"
                    onClick={async () => {
                      try {
                        await fetch('/api/auth', { method: 'DELETE' });
                        document.cookie = 'efi-auth=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
                        setIsMobileMenuOpen(false);
                        router.push('/login');
                      } catch (error) {
                        console.error('Logout error:', error);
                        window.location.href = '/login';
                      }
                    }}
                  >
                    Logout
                  </button>
                ) : (
                  <button
                    className="mobile-btn-login"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      setIsLoginModalOpen(true);
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
      <TickerScroller />
    </>
  );
}
