'use client';

import React, { useState } from 'react';

interface HeroSectionProps {
  onScreenerStart?: (market: string) => void;
  timePeriod?: string;
  onTimePeriodChange?: (period: string) => void;
  progressStats?: { processed: number; total: number; found: number };
  opportunitiesCount?: number;
  loading?: boolean;
  timePeriodOptions?: Array<{ id: string; name: string; years: number; description: string }>;
  onFilterChange?: (filters: { highWinRate: boolean; startingSoon: boolean; fiftyTwoWeek: boolean }) => void;
  onSeasonedScan?: (market: string) => void;
  onBestScan?: (market: string) => void;
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
  onBestScan
}) => {
  const [selectedMarket, setSelectedMarket] = useState('S&P 500');
  const [highWinRateFilter, setHighWinRateFilter] = useState(false);
  const [startingSoonFilter, setStartingSoonFilter] = useState(false);
  const [fiftyTwoWeekFilter, setFiftyTwoWeekFilter] = useState(false);

  const handleFilterToggle = (filterType: 'highWinRate' | 'startingSoon' | 'fiftyTwoWeek') => {
    if (filterType === 'highWinRate') {
      const newValue = !highWinRateFilter;
      setHighWinRateFilter(newValue);
      onFilterChange?.({ highWinRate: newValue, startingSoon: startingSoonFilter, fiftyTwoWeek: fiftyTwoWeekFilter });
    } else if (filterType === 'startingSoon') {
      const newValue = !startingSoonFilter;
      setStartingSoonFilter(newValue);
      onFilterChange?.({ highWinRate: highWinRateFilter, startingSoon: newValue, fiftyTwoWeek: fiftyTwoWeekFilter });
    } else {
      const newValue = !fiftyTwoWeekFilter;
      setFiftyTwoWeekFilter(newValue);
      onFilterChange?.({ highWinRate: highWinRateFilter, startingSoon: startingSoonFilter, fiftyTwoWeek: newValue });
    }
  };

  const markets = [
    'S&P 500',
    'NASDAQ 100',
    'DOW JONES'
  ];

  const handleStartScreener = () => {
    if (onScreenerStart) {
      onScreenerStart(selectedMarket);
    }
  };

  return (
    <div className="pro-hero">
      <div className="hero-container">
        <div className="hero-header" style={{ marginTop: '15px' }}>
          <h1 className="hero-title">SEASONAL PATTERNS</h1>
          <div style={{ display: 'flex', gap: '12px', marginTop: '12px', justifyContent: 'center' }}>
            <button
              onClick={() => handleFilterToggle('highWinRate')}
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
                textShadow: '0 1px 2px rgba(0,0,0,0.5)'
              }}
            >
              {highWinRateFilter ? '✓ ' : ''}60%+ Win Rate
            </button>
            <button
              onClick={() => handleFilterToggle('startingSoon')}
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
                textShadow: '0 1px 2px rgba(0,0,0,0.5)'
              }}
            >
              {startingSoonFilter ? '✓ ' : ''}Starting in 1-3 Days
            </button>
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
                textShadow: '0 1px 2px rgba(0,0,0,0.5)'
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

          <button
            className="pro-scan-btn"
            onClick={handleStartScreener}
          >
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
              opacity: loading ? 0.5 : 1
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.backgroundColor = '#ff6600';
                e.currentTarget.style.color = '#000000';
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.backgroundColor = '#000000';
                e.currentTarget.style.color = '#ff6600';
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
              opacity: loading ? 0.5 : 1
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.backgroundColor = '#00d4ff';
                e.currentTarget.style.color = '#000000';
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.backgroundColor = '#000000';
                e.currentTarget.style.color = '#00d4ff';
              }
            }}
          >
            SEASONED
          </button>
        </div>
      </div>
    </div>
  );
};

export default HeroSection;
