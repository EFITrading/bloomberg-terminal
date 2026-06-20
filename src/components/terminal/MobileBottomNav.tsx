'use client'

import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'

interface NavLink {
  name: string
  path: string
  color: string
}

interface Props {
  navLinks: NavLink[]
  pathname: string
  isAuthenticated: boolean
  isClient: boolean
  router: AppRouterInstance
}

const ACTIVE_COLOR = '#FF8500'
const INACTIVE_COLOR = '#ffffff'

function IconMarket({ active }: { active: boolean }) {
  const c = active ? ACTIVE_COLOR : INACTIVE_COLOR
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ overflow: 'visible' }}>
      <line x1="4.5" y1="7" x2="4.5" y2="10" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
      <rect x="3" y="10" width="3" height="6" rx="0.5" fill={c} />
      <line x1="4.5" y1="16" x2="4.5" y2="19" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12" y1="4" x2="12" y2="7" stroke={c} strokeWidth="1.5" strokeLinecap="round" className={active ? 'efi-candle-wick-mid' : ''} />
      <rect x="10" y="7" width="4" height="9" rx="0.5" fill={c} className={active ? 'efi-candle-body-mid' : ''} style={{ transformOrigin: '12px 21px' }} />
      <line x1="12" y1="16" x2="12" y2="20" stroke={c} strokeWidth="1.5" strokeLinecap="round" className={active ? 'efi-candle-wick-mid' : ''} />
      <line x1="19.5" y1="6" x2="19.5" y2="9" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
      <rect x="18" y="9" width="3" height="7" rx="0.5" fill={c} />
      <line x1="19.5" y1="16" x2="19.5" y2="18" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function IconAnalysis({ active }: { active: boolean }) {
  const c = active ? ACTIVE_COLOR : INACTIVE_COLOR
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ overflow: 'visible' }}>
      <circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.5" fill="none" />
      <circle cx="12" cy="12" r="5" stroke={c} strokeWidth="1" fill="none" opacity="0.4" />
      <line x1="12" y1="12" x2="12" y2="3" stroke={c} strokeWidth="1.5" strokeLinecap="round" className={active ? 'efi-radar-sweep' : ''} style={{ transformOrigin: '12px 12px' }} />
      <circle cx="12" cy="5" r="1.5" fill={c} className={active ? 'efi-radar-blip' : ''} />
      <circle cx="12" cy="12" r="1.5" fill={c} />
    </svg>
  )
}

function IconData({ active }: { active: boolean }) {
  const c = active ? ACTIVE_COLOR : INACTIVE_COLOR
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ overflow: 'visible' }}>
      <ellipse cx="12" cy="17" rx="8" ry="2.2" fill={c} opacity="0.4" />
      <ellipse cx="12" cy="12" rx="8" ry="2.2" fill={c} opacity="0.65" className={active ? 'efi-db-mid' : ''} />
      <ellipse cx="12" cy="7" rx="8" ry="2.2" fill={c} className={active ? 'efi-db-top' : ''} />
      <line x1="4" y1="7" x2="4" y2="17" stroke={c} strokeWidth="1.5" opacity="0.4" />
      <line x1="20" y1="7" x2="20" y2="17" stroke={c} strokeWidth="1.5" opacity="0.4" />
    </svg>
  )
}

function IconAnalytics({ active }: { active: boolean }) {
  const c = active ? ACTIVE_COLOR : INACTIVE_COLOR
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ overflow: 'visible' }}>
      <line x1="2" y1="21" x2="22" y2="21" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
      <rect x="3" y="15" width="4" height="6" rx="0.5" fill={c} opacity="0.6" className={active ? 'efi-bar-1' : ''} style={{ transformOrigin: '5px 21px' }} />
      <rect x="10" y="10" width="4" height="11" rx="0.5" fill={c} opacity="0.8" className={active ? 'efi-bar-2' : ''} style={{ transformOrigin: '12px 21px' }} />
      <rect x="17" y="4" width="4" height="17" rx="0.5" fill={c} className={active ? 'efi-bar-3' : ''} style={{ transformOrigin: '19px 21px' }} />
    </svg>
  )
}

function IconAI({ active }: { active: boolean }) {
  const c = active ? ACTIVE_COLOR : INACTIVE_COLOR
  const pins: [string,string,string,string][] = [
    ['10','4','10','7'],['14','4','14','7'],
    ['10','17','10','20'],['14','17','14','20'],
    ['4','10','7','10'],['4','14','7','14'],
    ['17','10','20','10'],['17','14','20','14'],
  ]
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ overflow: 'visible' }}>
      <rect x="7" y="7" width="10" height="10" rx="1.5" fill={c} />
      {pins.map(([x1,y1,x2,y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={c} strokeWidth="1.5" strokeLinecap="round" className={active ? `efi-ai-pin efi-ai-pin-${i % 4}` : ''} />
      ))}
      <rect x="10" y="10" width="4" height="4" rx="0.5" fill="#090909" />
      <circle cx="12" cy="12" r="1" fill={c} className={active ? 'efi-ai-core' : ''} />
    </svg>
  )
}

function IconFlow({ active }: { active: boolean }) {
  const c = active ? ACTIVE_COLOR : INACTIVE_COLOR
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ overflow: 'visible' }}>
      <path
        d="M1 12 C3.5 6,6.5 6,8 12 C9.5 18,12.5 18,14 12 C15.5 6,18.5 6,20 12 C21 16,22 14,23 12"
        stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"
        className={active ? 'efi-wave' : ''}
        style={active ? { strokeDasharray: 60, strokeDashoffset: 60 } : {}}
      />
    </svg>
  )
}

const ICONS: Record<string, React.ComponentType<{ active: boolean }>> = {
  '/market-overview': IconMarket,
  '/analysis-suite': IconAnalysis,
  '/data-driven': IconData,
  '/analytics': IconAnalytics,
  '/ai-suite': IconAI,
  '/options-flow': IconFlow,
}

const SHORT_LABELS: Record<string, string> = {
  '/market-overview': 'Market',
  '/analysis-suite': 'Analysis',
  '/data-driven': 'Data',
  '/analytics': 'Analytics',
  '/ai-suite': 'AI Suite',
  '/options-flow': 'Flow',
}

const STYLES = `
  @keyframes efi-candle-bounce {
    0%,100% { transform: scaleY(1); }
    40%     { transform: scaleY(1.35); }
    70%     { transform: scaleY(0.8); }
  }
  .efi-candle-body-mid { animation: efi-candle-bounce 1.4s ease-in-out infinite; }

  @keyframes efi-radar-rotate {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  .efi-radar-sweep { animation: efi-radar-rotate 1.8s linear infinite; }
  @keyframes efi-radar-blip {
    0%,100% { opacity:1; } 50% { opacity:0.2; }
  }
  .efi-radar-blip { animation: efi-radar-rotate 1.8s linear infinite, efi-radar-blip 1.8s ease-in-out infinite; transform-origin: 12px 12px; }

  @keyframes efi-db-float {
    0%,100% { transform: translateY(0); } 50% { transform: translateY(-2.5px); }
  }
  .efi-db-top { animation: efi-db-float 1.2s ease-in-out infinite; }
  @keyframes efi-db-mid-pulse {
    0%,100% { opacity:0.65; } 50% { opacity:1; }
  }
  .efi-db-mid { animation: efi-db-mid-pulse 1.2s ease-in-out infinite; }

  @keyframes efi-bar-grow-1 { 0%,100%{transform:scaleY(1)} 50%{transform:scaleY(1.5)} }
  @keyframes efi-bar-grow-2 { 0%,100%{transform:scaleY(1)} 50%{transform:scaleY(0.6)} }
  @keyframes efi-bar-grow-3 { 0%,100%{transform:scaleY(1)} 50%{transform:scaleY(1.25)} }
  .efi-bar-1 { animation: efi-bar-grow-1 1s ease-in-out infinite; }
  .efi-bar-2 { animation: efi-bar-grow-2 1s ease-in-out infinite 0.2s; }
  .efi-bar-3 { animation: efi-bar-grow-3 1s ease-in-out infinite 0.4s; }

  @keyframes efi-pin-pulse { 0%,100%{opacity:1} 50%{opacity:0.2} }
  .efi-ai-pin-0 { animation: efi-pin-pulse 0.9s ease-in-out infinite 0s; }
  .efi-ai-pin-1 { animation: efi-pin-pulse 0.9s ease-in-out infinite 0.22s; }
  .efi-ai-pin-2 { animation: efi-pin-pulse 0.9s ease-in-out infinite 0.44s; }
  .efi-ai-pin-3 { animation: efi-pin-pulse 0.9s ease-in-out infinite 0.66s; }
  @keyframes efi-core-pulse { 0%,100%{r:1px;opacity:1} 50%{r:3px;opacity:0.4} }
  .efi-ai-core { animation: efi-core-pulse 0.9s ease-in-out infinite; }

  @keyframes efi-wave-draw { from{stroke-dashoffset:60} to{stroke-dashoffset:-60} }
  .efi-wave { stroke-dasharray:60; animation: efi-wave-draw 1.2s linear infinite; }
`

export default function MobileBottomNav({ navLinks, pathname }: Props) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const isLanding = pathname === '/' || pathname === '/login' || pathname === '/auth'
  if (!mounted || isLanding) return null

  const bar = (
    <>
      <style>{STYLES}</style>
      <nav
        aria-label="Bottom navigation"
        style={{
          position: 'fixed',
          top: 'calc(100dvh - 60px)',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 2147483647,
          transform: 'translateZ(0)',
          WebkitTransform: 'translateZ(0)',
          background: '#080c12',
          borderTop: '1px solid rgba(255,133,0,0.25)',
          boxShadow: '0 -4px 28px rgba(0,0,0,0.98)',
          display: 'flex',
          alignItems: 'stretch',
          height: '60px',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {navLinks.map((link) => {
          const isActive = pathname === link.path
          const Icon = ICONS[link.path]
          const label = SHORT_LABELS[link.path] ?? link.name
          return (
            <Link
              key={link.path}
              href={link.path}
              aria-current={isActive ? 'page' : undefined}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                textDecoration: 'none',
                position: 'relative',
                background: isActive
                  ? 'linear-gradient(180deg,rgba(10,22,60,0.9) 0%,rgba(8,16,45,0.95) 100%)'
                  : 'transparent',
                borderTop: `2px solid ${isActive ? ACTIVE_COLOR : 'transparent'}`,
              }}
            >
              {Icon && <Icon active={isActive} />}
              <span style={{
                fontSize: '9px',
                fontWeight: isActive ? 700 : 500,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: isActive ? ACTIVE_COLOR : INACTIVE_COLOR,
                lineHeight: 1,
              }}>
                {label}
              </span>
            </Link>
          )
        })}
      </nav>
    </>
  )

  return createPortal(bar, document.body)
}
