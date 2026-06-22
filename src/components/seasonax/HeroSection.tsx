'use client'

import React, { useEffect, useState } from 'react'

interface HeroSectionProps {
  onScreenerStart?: (market: string) => void
  timePeriod?: string
  onTimePeriodChange?: (period: string) => void
  progressStats?: { processed: number; total: number; found: number }
  opportunitiesCount?: number
  loading?: boolean
  timePeriodOptions?: Array<{ id: string; name: string; years: number; description: string }>
  onFilterChange?: (filters: {
    highWinRate: string
    startingSoon: string
    fiftyTwoWeek: boolean
  }) => void
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
  onFilterChange,
  onSeasonedScan,
  onBestScan,
}) => {
  const [selectedMarket, setSelectedMarket] = useState('S&P 500')
  const [highWinRateFilter, setHighWinRateFilter] = useState('')
  const [startingSoonFilter, setStartingSoonFilter] = useState('')
  const [fiftyTwoWeekFilter, setFiftyTwoWeekFilter] = useState(false)
  const [isMobileView, setIsMobileView] = useState(false)
  const [showFilterPanel, setShowFilterPanel] = useState(false)

  useEffect(() => {
    const check = () => setIsMobileView(window.innerWidth <= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const handleWinRateChange = (value: string) => {
    setHighWinRateFilter(value)
    onFilterChange?.({
      highWinRate: value,
      startingSoon: startingSoonFilter,
      fiftyTwoWeek: fiftyTwoWeekFilter,
    })
  }

  const handleStartingSoonChange = (value: string) => {
    setStartingSoonFilter(value)
    onFilterChange?.({
      highWinRate: highWinRateFilter,
      startingSoon: value,
      fiftyTwoWeek: fiftyTwoWeekFilter,
    })
  }

  const handleFilterToggle = (filterType: 'fiftyTwoWeek') => {
    const newValue = !fiftyTwoWeekFilter
    setFiftyTwoWeekFilter(newValue)
    onFilterChange?.({
      highWinRate: highWinRateFilter,
      startingSoon: startingSoonFilter,
      fiftyTwoWeek: newValue,
    })
  }

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
    background: 'linear-gradient(180deg, #ff8c00 0%, #FF6B00 45%, #d45800 100%)',
    boxShadow:
      'inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(0,0,0,0.5), 0 2px 8px rgba(255,107,0,0.35), 0 1px 2px rgba(0,0,0,0.8)',
    color: '#FFFFFF',
    border: '1px solid #c45200',
  }

  return (
    <div
      style={{
        position: 'relative',
        top: isMobileView ? '0' : '-45px',
        marginBottom: isMobileView ? '0' : '-45px',
        fontFamily: '"Roboto Mono", monospace',
      }}
    >
      <style>{`
        .hs-btn:hover { filter: brightness(1.15); }
        .hs-btn:active { filter: brightness(0.9); transform: translateY(1px); }
        .hs-select:hover { filter: brightness(1.2); }
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
                <option key={option.id} value={option.id} style={{ background: '#0d0d0d' }}>{option.name}</option>
              ))}
            </select>

            <button
              className="hs-btn"
              onClick={handleStartScreener}
              style={{ ...btnBase, ...solidBlack, color: '#FF6B00', fontSize: 9, padding: '0 4px', height: 24, minHeight: 24, letterSpacing: '0.5px', flex: 1, whiteSpace: 'nowrap' }}
            >
              SCAN
            </button>

            {/* Filter button */}
            <button
              className="hs-btn"
              onClick={() => setShowFilterPanel(v => !v)}
              title="Filters"
              style={{
                ...btnBase,
                ...((startingSoonFilter || fiftyTwoWeekFilter) ? solidOrange : solidBlack),
                padding: '0 4px',
                height: 24,
                minHeight: 24,
                flex: 1,
                lineHeight: 1,
                position: 'relative',
                gap: 0,
                whiteSpace: 'nowrap',
              }}
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 3h14M3.5 8h9M6 13h4" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.4px', marginLeft: 4, lineHeight: 1 }}>FILTER</span>
              {(startingSoonFilter || fiftyTwoWeekFilter) && (
                <span style={{ position: 'absolute', top: 1, right: 2, width: 4, height: 4, borderRadius: '50%', background: '#fff', display: 'block' }} />
              )}
            </button>
          </div>

          {/* Row 2: Best of Each Frame + Multi Timeframe */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'nowrap' }}>
            <button
              className="hs-btn"
              onClick={() => onBestScan?.(selectedMarket)}
              disabled={loading}
              style={{ ...btnBase, ...solidBlack, fontSize: 7, padding: '0 4px', height: 24, minHeight: 24, letterSpacing: '0.2px', flex: 1, opacity: loading ? 0.5 : 1, whiteSpace: 'nowrap' }}
            >
              BEST OF EACH FRAME
            </button>

            <button
              className="hs-btn"
              onClick={() => onSeasonedScan?.(selectedMarket)}
              disabled={loading}
              style={{ ...btnBase, ...solidBlack, fontSize: 7, padding: '0 4px', height: 24, minHeight: 24, letterSpacing: '0.2px', flex: 1, opacity: loading ? 0.5 : 1, whiteSpace: 'nowrap' }}
            >
              MULTI TIMEFRAME
            </button>
          </div>

          {/* Filter popover */}
          {showFilterPanel && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 8px',
              background: '#111',
              border: '1px solid #333',
              borderRadius: 4,
            }}>
              <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 8, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Entry:</span>
              <select
                value={startingSoonFilter}
                onChange={(e) => handleStartingSoonChange(e.target.value)}
                className="hs-select"
                style={{
                  ...selectBase,
                  ...solidBlack,
                  fontSize: 8,
                  padding: '4px 18px 4px 6px',
                  flex: 1,
                  minWidth: 0,
                  letterSpacing: '0.3px',
                  color: startingSoonFilter ? '#FFFFFF' : 'rgba(255,255,255,0.55)',
                }}
              >
                <option value="" style={{ background: '#0d0d0d' }}>Any</option>
                <option value="1d" style={{ background: '#0d0d0d' }}>1 Day</option>
                <option value="3d" style={{ background: '#0d0d0d' }}>3 Day</option>
                <option value="9d" style={{ background: '#0d0d0d' }}>9 Day</option>
              </select>

              <button
                className="hs-btn"
                onClick={() => handleFilterToggle('fiftyTwoWeek')}
                style={{
                  ...btnBase,
                  ...(fiftyTwoWeekFilter ? solidOrange : solidBlack),
                  fontSize: 8,
                  padding: '4px 8px',
                  letterSpacing: '0.3px',
                  flex: '0 0 auto',
                  whiteSpace: 'nowrap',
                }}
              >
                {fiftyTwoWeekFilter ? '✓ ' : ''}52W HIGH/LOW
              </button>
            </div>
          )}
        </div>
      ) : (
        /* ── DESKTOP: original layout ── */
        <div
          style={{
            padding: '40px 16px 10px',
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

          {/* ── Best Picks + MultiFrame Picks + SCAN ── */}
          <button
            className="hs-btn"
            onClick={() => onBestScan?.(selectedMarket)}
            disabled={loading}
            style={{ ...btnBase, ...solidBlack, minWidth: 120, opacity: loading ? 0.5 : 1 }}
          >
            Best Picks
          </button>

          <button
            className="hs-btn"
            onClick={() => onSeasonedScan?.(selectedMarket)}
            disabled={loading}
            style={{ ...btnBase, ...solidBlack, minWidth: 160, opacity: loading ? 0.5 : 1 }}
          >
            MultiFrame Picks
          </button>

          <button
            className="hs-btn"
            onClick={handleStartScreener}
            style={{ ...btnBase, ...solidOrange, minWidth: 100 }}
          >
            SCAN
          </button>

          {/* ── Right side: Entry Window + 52 Week High/Low ── */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <select
              value={startingSoonFilter}
              onChange={(e) => handleStartingSoonChange(e.target.value)}
              className="hs-select"
              style={{
                ...selectBase,
                ...solidBlack,
                minWidth: 150,
                color: startingSoonFilter ? '#FFFFFF' : 'rgba(255,255,255,0.55)',
              }}
            >
              <option value="" style={{ background: '#0d0d0d' }}>
                Entry Window
              </option>
              <option value="1d" style={{ background: '#0d0d0d' }}>
                1 Day Entry
              </option>
              <option value="3d" style={{ background: '#0d0d0d' }}>
                3 Day Entry
              </option>
              <option value="9d" style={{ background: '#0d0d0d' }}>
                9 Day Entry
              </option>
            </select>

            <button
              className="hs-btn"
              onClick={() => handleFilterToggle('fiftyTwoWeek')}
              style={{
                ...btnBase,
                ...(fiftyTwoWeekFilter ? solidOrange : solidBlack),
                minWidth: 170,
              }}
            >
              {fiftyTwoWeekFilter ? '✓ ' : ''}52 Week High/Low
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default HeroSection
