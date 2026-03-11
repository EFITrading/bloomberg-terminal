'use client'

import React, { useState } from 'react'

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

  return (
    <div className="pro-hero" style={{ position: 'relative', top: '-45px', marginBottom: '-45px' }}>
      <div className="hero-container">
        <div className="hero-header" style={{ marginTop: '15px' }}>
          <h1 className="hero-title">SEASONAL PATTERNS</h1>
          <div
            style={{ display: 'flex', gap: '12px', marginTop: '12px', justifyContent: 'center' }}
          >
            <select
              value={startingSoonFilter}
              onChange={(e) => handleStartingSoonChange(e.target.value)}
              style={{
                background: '#000000',
                color: startingSoonFilter ? '#fff' : '#888',
                border: `1px solid ${startingSoonFilter ? '#aaa' : '#333'}`,
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: '600',
                borderRadius: '4px',
                cursor: 'pointer',
                outline: 'none',
                fontFamily: 'monospace',
                appearance: 'none',
                WebkitAppearance: 'none',
                paddingRight: '28px',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23888'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 10px center',
              }}
            >
              <option value="">Entry Window</option>
              <option value="1d">1 Day Entry</option>
              <option value="3d">3 Day Entry</option>
              <option value="9d">9 Day Entry</option>
            </select>
            <button
              onClick={() => handleFilterToggle('fiftyTwoWeek')}
              style={{
                background: '#000000',
                color: '#fff',
                border: '1px solid #333333',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: '600',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                outline: 'none',
                fontFamily: 'monospace',
                boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
                textShadow: '0 1px 2px rgba(0,0,0,0.5)',
              }}
            >
              {fiftyTwoWeekFilter ? '✓ ' : ''}52WK H/L
            </button>
          </div>
        </div>

        <div className="hero-controls">
          <select
            value={selectedMarket}
            onChange={(e) => setSelectedMarket(e.target.value)}
            className="pro-market-select"
          >
            {markets.map((market) => (
              <option key={market} value={market}>
                {market}
              </option>
            ))}
          </select>

          <select
            value={timePeriod}
            onChange={(e) => onTimePeriodChange && onTimePeriodChange(e.target.value)}
            className="pro-market-select"
            disabled={loading}
          >
            {timePeriodOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>

          <button className="pro-scan-btn" onClick={handleStartScreener}>
            SCAN
          </button>

          <button
            onClick={() => onBestScan?.(selectedMarket)}
            disabled={loading}
            style={{
              backgroundColor: '#000000',
              color: '#ff6600',
              border: '1px solid #ff6600',
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: '600',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s ease',
              marginLeft: '12px',
              outline: 'none',
              textDecoration: 'none',
              opacity: loading ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.backgroundColor = '#ff6600'
                e.currentTarget.style.color = '#000000'
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.backgroundColor = '#000000'
                e.currentTarget.style.color = '#ff6600'
              }
            }}
          >
            BEST
          </button>

          <button
            onClick={() => onSeasonedScan?.(selectedMarket)}
            disabled={loading}
            style={{
              backgroundColor: '#000000',
              color: '#00d4ff',
              border: '1px solid #00d4ff',
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: '600',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s ease',
              marginLeft: '12px',
              outline: 'none',
              textDecoration: 'none',
              opacity: loading ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.backgroundColor = '#00d4ff'
                e.currentTarget.style.color = '#000000'
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.backgroundColor = '#000000'
                e.currentTarget.style.color = '#00d4ff'
              }
            }}
          >
            SEASONED
          </button>
        </div>
      </div>
    </div>
  )
}

export default HeroSection
