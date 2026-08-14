'use client'

import React, { useEffect, useState } from 'react'

const RocketIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
    <path d="M12 2C12 2 7 6 7 12c0 2.5 1 4.5 2 5.8L12 21l3-3.2c1-1.3 2-3.3 2-5.8 0-6-5-10-5-10Z" fill="#818cf8" opacity="0.85" />
    <circle cx="12" cy="10.5" r="2" fill="#050508" />
    <path d="M7 13.5 4 16l2.5.7Z" fill="#6366f1" />
    <path d="M17 13.5 20 16l-2.5.7Z" fill="#6366f1" />
  </svg>
)

const LayersIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
    <path d="M12 3 2 8l10 5 10-5-10-5Z" fill="#818cf8" opacity="0.9" />
    <path d="M2 12l10 5 10-5" stroke="#6366f1" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 16l10 5 10-5" stroke="#4c4fb8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)


interface HeroSectionProps {
  onScreenerStart?: (market: string) => void
  timePeriod?: string
  onTimePeriodChange?: (period: string) => void
  progressStats?: { processed: number; total: number; found: number }
  opportunitiesCount?: number
  loading?: boolean
  timePeriodOptions?: Array<{ id: string; name: string; years: number; description: string }>
  onSeasonedScan?: (market: string) => void
  onBestScan?: (market: string) => void
}

const HeroSection: React.FC<HeroSectionProps> = ({
  onScreenerStart,
  timePeriod = '15Y',
  onTimePeriodChange,
  progressStats = { processed: 0, total: 1000, found: 0 },
  opportunitiesCount = 0,
  loading = false,
  timePeriodOptions = [],
  onSeasonedScan,
  onBestScan,
}) => {
  const [selectedMarket, setSelectedMarket] = useState('S&P 500')
  const [isMobileView, setIsMobileView] = useState(false)

  useEffect(() => {
    const check = () => setIsMobileView(window.innerWidth <= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const markets = ['S&P 500', 'NASDAQ 100', 'DOW JONES']

  const handleStartScreener = () => {
    if (onScreenerStart) {
      onScreenerStart(selectedMarket)
    }
  }

  const btnBase: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '11px 22px',
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: '1.2px',
    textTransform: 'uppercase',
    fontFamily: '"Roboto Mono", monospace',
    border: 'none',
    outline: 'none',
    cursor: 'pointer',
    borderRadius: 0,
    transition: 'filter 0.15s',
  }

  const selectBase: React.CSSProperties = {
    ...btnBase,
    appearance: 'none',
    WebkitAppearance: 'none',
    paddingRight: 32,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23ffffff'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    cursor: 'pointer',
  }

  const solidBlack: React.CSSProperties = {
    background: 'linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 50%, #050505 100%)',
    boxShadow:
      'inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 0 rgba(0,0,0,0.8), 0 2px 6px rgba(0,0,0,0.9), 0 1px 2px rgba(0,0,0,0.9)',
    color: '#FFFFFF',
    border: '1px solid #2e2e2e',
  }

  const solidOrange: React.CSSProperties = {
    background: 'linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,133,0,0.08) 22%, rgba(20,20,20,0.55) 55%, rgba(5,5,5,0.95) 100%)',
    backdropFilter: 'blur(10px) saturate(160%)',
    WebkitBackdropFilter: 'blur(10px) saturate(160%)',
    boxShadow:
      'inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -10px 16px rgba(0,0,0,0.4), 0 2px 8px rgba(255,107,0,0.2), 0 1px 2px rgba(0,0,0,0.8)',
    color: '#FF6B00',
    border: '1px solid #FF6B00',
  }

  // Scan-mode buttons (Seasonal Leaps / MultiFrame Picks) — pill-shaped badge design, distinct shape from every other flat rectangular button
  const scanModeBtn: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '5px 16px 5px 6px',
    borderRadius: 999,
    border: '1px solid rgba(129,140,248,0.5)',
    background: 'radial-gradient(120% 150% at 0% 0%, rgba(129,140,248,0.22) 0%, rgba(10,10,14,0.92) 60%)',
    cursor: 'pointer',
    outline: 'none',
    fontFamily: '"Roboto Mono", monospace',
    transition: 'filter 0.15s',
  }
  const scanModeIconBadge: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: 'rgba(129,140,248,0.18)',
    border: '1px solid rgba(129,140,248,0.5)',
    flexShrink: 0,
  }

  return (
    <div
      style={{
        fontFamily: '"Roboto Mono", monospace',
      }}
    >
      <style>{`
        .hs-btn:hover { filter: brightness(1.15); }
        .hs-btn:active { filter: brightness(0.9); transform: translateY(1px); }
        .hs-select:hover { filter: brightness(1.2); }
        .hs-btn-orange-text, .hs-btn-orange-text * { color: #FF6B00 !important; }
        .hs-mode-eyebrow, .hs-mode-eyebrow * { color: rgba(199,201,255,0.65) !important; }
        .hs-mode-title, .hs-mode-title * { color: #c7c9ff !important; }
        .hs-mode-btn:hover { filter: brightness(1.25); }
        .hs-mode-btn:active { filter: brightness(0.9); transform: translateY(1px); }
      `}</style>

      {isMobileView ? (
        /* ── MOBILE: single-row layout ── */
        <div
          style={{
            padding: '6px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
            background: '#000',
            border: '1px solid #2e2e2e',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          {/* Row 1: Index + Year + SCAN + Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'nowrap' }}>
            <select
              value={selectedMarket}
              onChange={(e) => setSelectedMarket(e.target.value)}
              className="hs-select"
              style={{ ...selectBase, ...solidBlack, fontSize: 9, padding: '0 14px 0 5px', minWidth: 0, flex: 1, height: 24, minHeight: 24, boxSizing: 'border-box', letterSpacing: '0.2px' }}
            >
              {markets.map((market) => (
                <option key={market} value={market} style={{ background: '#0d0d0d' }}>{market}</option>
              ))}
            </select>

            <select
              value={timePeriod}
              onChange={(e) => onTimePeriodChange?.(e.target.value)}
              className="hs-select"
              disabled={loading}
              style={{ ...selectBase, ...solidBlack, fontSize: 9, padding: '0 14px 0 5px', minWidth: 0, flex: 1, height: 24, minHeight: 24, boxSizing: 'border-box', opacity: loading ? 0.5 : 1, letterSpacing: '0.2px' }}
            >
              {timePeriodOptions.map((option) => (
                <option key={option.id} value={option.id} style={{ background: '#0d0d0d' }}>{option.id}</option>
              ))}
            </select>

            <button
              className="hs-btn hs-btn-orange-text"
              onClick={handleStartScreener}
              style={{ ...btnBase, ...solidBlack, color: '#FF6B00', fontSize: 9, padding: '0 4px', height: 24, minHeight: 24, letterSpacing: '0.5px', flex: 1, whiteSpace: 'nowrap' }}
            >
              SCAN
            </button>
          </div>

          {/* Row 2: Best of Each Frame + Multi Timeframe */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'nowrap' }}>
            <button
              className="hs-mode-btn"
              onClick={() => onBestScan?.(selectedMarket)}
              disabled={loading}
              style={{ ...scanModeBtn, padding: '3px 10px 3px 4px', flex: 1, opacity: loading ? 0.5 : 1 }}
            >
              <span style={{ ...scanModeIconBadge, width: 18, height: 18 }}><RocketIcon /></span>
              <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05, alignItems: 'flex-start' }}>
                <span className="hs-mode-eyebrow" style={{ fontSize: 6, fontWeight: 700, letterSpacing: '0.5px' }}>SCAN MODE</span>
                <span className="hs-mode-title" style={{ fontSize: 7, fontWeight: 800, letterSpacing: '0.2px', whiteSpace: 'nowrap' }}>SEASONAL LEAPS</span>
              </span>
            </button>

            <button
              className="hs-mode-btn"
              onClick={() => onSeasonedScan?.(selectedMarket)}
              disabled={loading}
              style={{ ...scanModeBtn, padding: '3px 10px 3px 4px', flex: 1, opacity: loading ? 0.5 : 1 }}
            >
              <span style={{ ...scanModeIconBadge, width: 18, height: 18 }}><LayersIcon /></span>
              <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05, alignItems: 'flex-start' }}>
                <span className="hs-mode-eyebrow" style={{ fontSize: 6, fontWeight: 700, letterSpacing: '0.5px' }}>SCAN MODE</span>
                <span className="hs-mode-title" style={{ fontSize: 7, fontWeight: 800, letterSpacing: '0.2px', whiteSpace: 'nowrap' }}>MULTIFRAME PICKS</span>
              </span>
            </button>
          </div>
        </div>
      ) : (
        /* ── DESKTOP: original layout ── */
        <div
          style={{
            padding: '10px 16px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            background: '#000',
            border: '1px solid #2e2e2e',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          {/* ── Left: Index label + market select ── */}
          <span
            style={{
              color: 'rgba(255,255,255,0.45)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '1px',
              textTransform: 'uppercase',
            }}
          >
            Index :
          </span>
          <select
            value={selectedMarket}
            onChange={(e) => setSelectedMarket(e.target.value)}
            className="hs-select"
            style={{ ...selectBase, ...solidBlack, minWidth: 140 }}
          >
            {markets.map((market) => (
              <option key={market} value={market} style={{ background: '#0d0d0d' }}>
                {market}
              </option>
            ))}
          </select>

          {/* ── Timeframe label + period select ── */}
          <span
            style={{
              color: 'rgba(255,255,255,0.45)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '1px',
              textTransform: 'uppercase',
              marginLeft: 4,
            }}
          >
            Timeframe :
          </span>
          <select
            value={timePeriod}
            onChange={(e) => onTimePeriodChange?.(e.target.value)}
            className="hs-select"
            disabled={loading}
            style={{ ...selectBase, ...solidBlack, minWidth: 130, opacity: loading ? 0.5 : 1 }}
          >
            {timePeriodOptions.map((option) => (
              <option key={option.id} value={option.id} style={{ background: '#0d0d0d' }}>
                {option.name}
              </option>
            ))}
          </select>

          <div style={{ width: 1, height: 28, background: '#2a2a2a', margin: '0 4px' }} />

          {/* ── Scan modes: Seasonal Leaps + MultiFrame Picks — pill badge design, distinct from every rectangular button ── */}
          <button
            className="hs-mode-btn"
            onClick={() => onBestScan?.(selectedMarket)}
            disabled={loading}
            style={{ ...scanModeBtn, opacity: loading ? 0.5 : 1 }}
          >
            <span style={scanModeIconBadge}><RocketIcon /></span>
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, alignItems: 'flex-start' }}>
              <span className="hs-mode-eyebrow" style={{ fontSize: 8, fontWeight: 700, letterSpacing: '1px' }}>SCAN MODE</span>
              <span className="hs-mode-title" style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.4px' }}>Seasonal Leaps</span>
            </span>
          </button>

          <button
            className="hs-mode-btn"
            onClick={() => onSeasonedScan?.(selectedMarket)}
            disabled={loading}
            style={{ ...scanModeBtn, opacity: loading ? 0.5 : 1 }}
          >
            <span style={scanModeIconBadge}><LayersIcon /></span>
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, alignItems: 'flex-start' }}>
              <span className="hs-mode-eyebrow" style={{ fontSize: 8, fontWeight: 700, letterSpacing: '1px' }}>SCAN MODE</span>
              <span className="hs-mode-title" style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.4px' }}>MultiFrame Picks</span>
            </span>
          </button>

          <button
            className="hs-btn hs-btn-orange-text"
            onClick={handleStartScreener}
            style={{ ...btnBase, ...solidOrange, minWidth: 100, marginLeft: 'auto' }}
          >
            SCAN
          </button>
        </div>
      )}
    </div>
  )
}

export default HeroSection
