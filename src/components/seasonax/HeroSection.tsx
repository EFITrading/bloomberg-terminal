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
    <path d="M12 3 2 8l10 5 10-5-10-5Z" fill="#2dd4bf" opacity="0.9" />
    <path d="M2 12l10 5 10-5" stroke="#14b8a6" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 16l10 5 10-5" stroke="#0d9488" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

// Explicit chevron rendered as a real sibling element (not a select background-image) - those
// render inconsistently/invisibly once appearance:none is paired with a custom gradient fill.
const Chevron = ({ color = '#FF6B00', size = 9 }: { color?: string; size?: number }) => (
  <svg width={size} height={size * 0.6} viewBox="0 0 10 6" fill="none" style={{ position: 'absolute', pointerEvents: 'none' }}>
    <path d="M0 0l5 6 5-6z" fill={color} />
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
  const [scanMode, setScanMode] = useState<'normal' | 'leaps' | 'multiframe'>('normal')
  const [isMobileView, setIsMobileView] = useState(false)

  useEffect(() => {
    const check = () => setIsMobileView(window.innerWidth <= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Grouped index/scan options shown in the dropdown (value used directly by getMarketStocks)
  const marketOptionGroups: Array<{ label: string; options: Array<{ value: string; label: string }> }> = [
    {
      label: 'INDEXES',
      options: [
        { value: 'S&P 500', label: 'S&P 500' },
        { value: 'NASDAQ 100', label: 'NASDAQ 100' },
        { value: 'DOW JONES', label: 'DOW JONES' },
        { value: 'TOP 10', label: 'Top 10 Stocks' },
      ],
    },
    {
      label: 'CAP SIZE',
      options: [
        { value: 'MIDCAP', label: 'Midcap (MDY / ARKK style)' },
        { value: 'SMALLCAP', label: 'Small Cap (liquid)' },
      ],
    },
    {
      label: 'SECTORS',
      options: [
        { value: 'SECTOR-ALL', label: 'All 11 Sectors' },
        { value: 'SECTOR-XLK', label: 'Technology (XLK)' },
        { value: 'SECTOR-XLF', label: 'Financials (XLF)' },
        { value: 'SECTOR-XLE', label: 'Energy (XLE)' },
        { value: 'SECTOR-XLV', label: 'Healthcare (XLV)' },
        { value: 'SECTOR-XLI', label: 'Industrials (XLI)' },
        { value: 'SECTOR-XLY', label: 'Consumer Discretionary (XLY)' },
        { value: 'SECTOR-XLP', label: 'Consumer Staples (XLP)' },
        { value: 'SECTOR-XLU', label: 'Utilities (XLU)' },
        { value: 'SECTOR-XLB', label: 'Materials (XLB)' },
        { value: 'SECTOR-XLRE', label: 'Real Estate (XLRE)' },
        { value: 'SECTOR-XLC', label: 'Communication Services (XLC)' },
      ],
    },
    {
      label: 'INDUSTRIES',
      options: [
        { value: 'INDUSTRY-ALL', label: 'All Industries' },
        { value: 'INDUSTRY-SMH', label: 'Semiconductors (SMH)' },
        { value: 'INDUSTRY-IGV', label: 'Software (IGV)' },
        { value: 'INDUSTRY-KRE', label: 'Regional Banks (KRE)' },
        { value: 'INDUSTRY-XBI', label: 'Biotech (XBI)' },
        { value: 'INDUSTRY-ITB', label: 'Homebuilders (ITB)' },
        { value: 'INDUSTRY-XOP', label: 'Oil & Gas Expl. (XOP)' },
        { value: 'INDUSTRY-JETS', label: 'Airlines (JETS)' },
      ],
    },
    {
      label: 'DATA HISTORY',
      options: [
        { value: 'LEGACY', label: 'Legacy (20+ years data)' },
        { value: 'NEW ERA', label: 'New Era (8-10 years data)' },
      ],
    },
  ]

  const handleStartScreener = (mode: 'normal' | 'leaps' | 'multiframe' = scanMode) => {
    if (mode === 'leaps') {
      onBestScan?.(selectedMarket)
    } else if (mode === 'multiframe') {
      onSeasonedScan?.(selectedMarket)
    } else {
      onScreenerStart?.(selectedMarket)
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
    paddingRight: 30,
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

  // Scan-mode buttons (Seasonal Leaps / MultiFrame Picks) — professional segmented-card design,
  // each mode gets its own accent color (indigo / teal) and lights up fully when it's the last
  // mode the user triggered, instead of looking like two identical inert badges.
  const scanModeBtn = (accent: string, active: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    padding: '7px 18px 7px 8px',
    borderRadius: 10,
    border: `1px solid ${active ? accent : 'rgba(255,255,255,0.12)'}`,
    background: active
      ? `linear-gradient(135deg, ${accent}26 0%, rgba(10,10,14,0.95) 65%)`
      : 'linear-gradient(180deg, #121215 0%, #0a0a0c 100%)',
    boxShadow: active
      ? `inset 0 1px 0 rgba(255,255,255,0.14), 0 0 0 1px ${accent}33, 0 4px 10px -2px ${accent}40`
      : 'inset 0 1px 0 rgba(255,255,255,0.05)',
    cursor: 'pointer',
    outline: 'none',
    position: 'relative',
    overflow: 'hidden',
    fontFamily: '"Roboto Mono", monospace',
    transition: 'all 0.15s ease',
  })
  const scanModeIconBadge = (accent: string, active: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    borderRadius: 7,
    background: active ? `${accent}2e` : 'rgba(255,255,255,0.05)',
    border: `1px solid ${active ? accent : 'rgba(255,255,255,0.12)'}`,
    flexShrink: 0,
  })

  // Mobile Row 1 controls — rounded select/scan buttons, replacing the old cramped 24px-tall sharp-cornered bar
  const selectMobile: React.CSSProperties = {
    appearance: 'none',
    WebkitAppearance: 'none',
    minWidth: 0,
    height: 30,
    boxSizing: 'border-box',
    padding: '0 15px 0 6px',
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.2px',
    fontFamily: '"Roboto Mono", monospace',
    textTransform: 'uppercase',
    color: '#FFFFFF',
    background: 'linear-gradient(180deg, #1c1c1c 0%, #0d0d0d 60%, #050505 100%)',
    backgroundImage: `linear-gradient(180deg, #1c1c1c 0%, #0d0d0d 60%, #050505 100%), url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='9' height='6'%3E%3Cpath d='M0 0l4.5 6 4.5-6z' fill='%23FF6B00'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat, no-repeat',
    backgroundPosition: '0 0, right 6px center',
    border: '1px solid #2e2e2e',
    borderRadius: 7,
    outline: 'none',
    cursor: 'pointer',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
    textOverflow: 'ellipsis',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
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
        .hs-mode-card:active { filter: brightness(1.3); transform: scale(0.97); }
        .hs-mode-shine {
          position: absolute;
          top: 0; left: -60%;
          width: 40%; height: 100%;
          background: linear-gradient(120deg, transparent, rgba(255,255,255,0.10), transparent);
          pointer-events: none;
        }
        .hs-select-mobile:active { filter: brightness(1.2); }
        .hs-select option, .hs-select-mobile option {
          background: #0d0d0d; color: #ffffff;
        }
        .hs-select optgroup, .hs-select-mobile optgroup {
          background: #000000; color: #FF6B00;
          font-weight: 800; font-size: 10px; letter-spacing: 0.8px;
        }
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
          {/* Row 1: Index + Year + Scan mode (triggers scan on select) */}
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 5, flexWrap: 'nowrap' }}>
            <select
              value={selectedMarket}
              onChange={(e) => setSelectedMarket(e.target.value)}
              className="hs-select-mobile"
              style={{ ...selectMobile, flex: 1, padding: '0 16px 0 6px' }}
            >
              {marketOptionGroups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((opt) => (
                    <option key={opt.value} value={opt.value} style={{ background: '#0d0d0d' }}>{opt.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>

            <select
              value={timePeriod}
              onChange={(e) => onTimePeriodChange?.(e.target.value)}
              className="hs-select-mobile"
              disabled={loading}
              style={{ ...selectMobile, flex: 0.6, padding: '0 16px 0 6px', opacity: loading ? 0.5 : 1 }}
            >
              {timePeriodOptions.map((option) => (
                <option key={option.id} value={option.id} style={{ background: '#0d0d0d' }}>{option.id}</option>
              ))}
            </select>

            <select
              value={scanMode}
              onChange={(e) => {
                const mode = e.target.value as 'normal' | 'leaps' | 'multiframe'
                setScanMode(mode)
                handleStartScreener(mode)
              }}
              className="hs-select-mobile"
              disabled={loading}
              style={{ ...selectMobile, flex: 1, padding: '0 16px 0 6px', opacity: loading ? 0.5 : 1 }}
            >
              <option value="normal" style={{ background: '#0d0d0d' }}>⌕ Scan Normal</option>
              <option value="leaps" style={{ background: '#0d0d0d' }}>⌕ Scan Leaps</option>
              <option value="multiframe" style={{ background: '#0d0d0d' }}>⌕ Scan MultiFrame</option>
            </select>
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
          <div style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
            <select
              value={selectedMarket}
              onChange={(e) => setSelectedMarket(e.target.value)}
              className="hs-select"
              style={{ ...selectBase, ...solidBlack, width: 210 }}
            >
              {marketOptionGroups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((opt) => (
                    <option key={opt.value} value={opt.value} style={{ background: '#0d0d0d' }}>
                      {opt.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <span style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', display: 'flex' }}><Chevron /></span>
          </div>

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
          <div style={{ position: 'relative', display: 'inline-flex', flexShrink: 0, opacity: loading ? 0.5 : 1 }}>
            <select
              value={timePeriod}
              onChange={(e) => onTimePeriodChange?.(e.target.value)}
              className="hs-select"
              disabled={loading}
              style={{ ...selectBase, ...solidBlack, width: 150 }}
            >
              {timePeriodOptions.map((option) => (
                <option key={option.id} value={option.id} style={{ background: '#0d0d0d' }}>
                  {option.name}
                </option>
              ))}
            </select>
            <span style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', display: 'flex' }}><Chevron /></span>
          </div>

          <div style={{ width: 1, height: 28, background: '#2a2a2a', margin: '0 4px' }} />

          {/* ── Scan modes: Seasonal Leaps (indigo) + MultiFrame Picks (teal) — each lights up with
              its own accent once it's the last-triggered mode ── */}
          <button
            className="hs-mode-btn"
            onClick={() => { setScanMode('leaps'); onBestScan?.(selectedMarket) }}
            disabled={loading}
            style={{ ...scanModeBtn('#818cf8', scanMode === 'leaps'), opacity: loading ? 0.5 : 1 }}
          >
            <span style={scanModeIconBadge('#818cf8', scanMode === 'leaps')}><RocketIcon /></span>
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '1px', color: 'rgba(199,201,255,0.65)' }}>SCAN MODE</span>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.4px', color: '#c7c9ff' }}>Seasonal Leaps</span>
            </span>
          </button>

          <button
            className="hs-mode-btn"
            onClick={() => { setScanMode('multiframe'); onSeasonedScan?.(selectedMarket) }}
            disabled={loading}
            style={{ ...scanModeBtn('#2dd4bf', scanMode === 'multiframe'), opacity: loading ? 0.5 : 1 }}
          >
            <span style={scanModeIconBadge('#2dd4bf', scanMode === 'multiframe')}><LayersIcon /></span>
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '1px', color: 'rgba(153,246,228,0.65)' }}>SCAN MODE</span>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.4px', color: '#99f6e4' }}>MultiFrame Picks</span>
            </span>
          </button>

          <button
            className="hs-btn hs-btn-orange-text"
            onClick={() => { setScanMode('normal'); handleStartScreener('normal') }}
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
