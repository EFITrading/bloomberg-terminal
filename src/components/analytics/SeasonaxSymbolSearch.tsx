'use client'

import React, { useEffect, useRef, useState } from 'react'

interface SearchResult {
  ticker: string
  name: string
}

interface SeasonaxSymbolSearchProps {
  onSymbolSelect: (symbol: string) => void
  initialSymbol: string
  onElectionPeriodSelect?: (period: string) => void
  onElectionModeToggle?: (isElectionMode: boolean) => void
  selectedElectionPeriod?: string
  availableYears?: number[]
  currentYears?: number
  onYearsChange?: (years: number) => void
  sweetSpotActive?: boolean
  painPointActive?: boolean
  onSweetSpotToggle?: () => void
  onPainPointToggle?: () => void
  currentYearMode?: 'off' | 'raw' | 'benchmarked'
  onCurrentYearModeChange?: (mode: 'off' | 'raw' | 'benchmarked') => void
  isCompareMode?: boolean
  compareSymbol?: string
  onCompareClick?: () => void
  onCompareSymbolChange?: (symbol: string) => void
  onCompareSubmit?: () => void
}

const electionPeriods = ['Normal Mode', 'Election Year', 'Post-Election', 'Mid-Term', 'Pre-Election']

const SeasonaxSymbolSearch: React.FC<SeasonaxSymbolSearchProps> = ({
  onSymbolSelect,
  initialSymbol,
  onElectionPeriodSelect,
  onElectionModeToggle,
  selectedElectionPeriod: externalElectionPeriod,
  availableYears = [1, 3, 5, 10, 15, 20],
  currentYears = 20,
  onYearsChange,
  sweetSpotActive = false,
  painPointActive = false,
  onSweetSpotToggle,
  onPainPointToggle,
  currentYearMode = 'off' as 'off' | 'raw' | 'benchmarked',
  onCurrentYearModeChange,
  isCompareMode,
  compareSymbol,
  onCompareClick,
  onCompareSymbolChange,
  onCompareSubmit,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>(initialSymbol)
  const [isOpen, setIsOpen] = useState<boolean>(false)
  const [isElectionDropdownOpen, setIsElectionDropdownOpen] = useState<boolean>(false)
  const [isYearsDropdownOpen, setIsYearsDropdownOpen] = useState<boolean>(false)
  const [isCurrentYearDropdownOpen, setIsCurrentYearDropdownOpen] = useState<boolean>(false)
  const [localElectionPeriod, setLocalElectionPeriod] = useState<string>(externalElectionPeriod || 'Normal Mode')
  const [recentSymbols] = useState<string[]>(['MSFT', 'AAPL', 'GOOGL', 'AMZN', 'TSLA', 'NVDA'])
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState<boolean>(false)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  const displayElection = externalElectionPeriod || localElectionPeriod
  const isElectionActive = displayElection !== 'Normal Mode'

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setIsElectionDropdownOpen(false)
        setIsYearsDropdownOpen(false)
        setIsCurrentYearDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchTerm(value)
    setIsElectionDropdownOpen(false)
    setIsYearsDropdownOpen(false)
    setIsOpen(true)

    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    if (value.trim().length < 1) { setSearchResults([]); return }

    searchDebounceRef.current = setTimeout(async () => {
      setIsSearching(true)
      try {
        const res = await fetch(`/api/ticker-search?q=${encodeURIComponent(value)}`)
        const data = await res.json()
        setSearchResults(data.results || [])
      } catch {
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }, 250)
  }

  const handleSymbolClick = (symbol: string) => {
    setSearchTerm(symbol)
    setSearchResults([])
    setIsOpen(false)
    onSymbolSelect(symbol)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchTerm.length > 0) {
      handleSymbolClick(searchTerm.trim().toUpperCase())
    }
  }

  const handleElectionSelect = (period: string) => {
    setLocalElectionPeriod(period)
    setIsElectionDropdownOpen(false)
    if (period === 'Normal Mode') {
      onElectionModeToggle?.(false)
    } else {
      onElectionModeToggle?.(true)
      onElectionPeriodSelect?.(period)
    }
  }

  return (
    <div className="seasonax-symbol-search" ref={searchRef} style={{ display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexWrap: 'nowrap' }}>
        {/* ── Search input ── */}
        <div className="search-input-container" style={{ position: 'relative' }}>
          <input
            type="text"
            value={searchTerm}
            onChange={handleInputChange}
            onFocus={() => { setIsOpen(true); setIsElectionDropdownOpen(false) }}
            onKeyDown={handleKeyDown}
            placeholder="Search..."
            className="seasonax-search-input"
            autoComplete="off"
          />
          <div className="search-icon" />

          {isOpen && (searchResults.length > 0 || isSearching || searchTerm.trim().length === 0) && (
            <div className="seasonax-search-dropdown" style={{ position: 'absolute', top: '100%', left: 0, zIndex: 2000, minWidth: '260px' }}>
              {isSearching && (
                <div className="search-section-title">Searching...</div>
              )}
              {!isSearching && searchResults.length > 0 && searchResults.map((r) => (
                <div key={r.ticker} className="search-result-item" onMouseDown={() => handleSymbolClick(r.ticker)}>
                  <span className="result-symbol">{r.ticker}</span>
                  <span className="result-name">{r.name}</span>
                </div>
              ))}
              {!isSearching && searchResults.length === 0 && searchTerm.trim().length === 0 && (
                <>
                  <div className="search-section-title">RECENT</div>
                  {recentSymbols.map((sym) => (
                    <div key={sym} className="search-result-item" onMouseDown={() => handleSymbolClick(sym)}>
                      <span className="result-symbol">{sym}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Years select ── */}
        {onYearsChange && (
          <select
            className="date-select"
            value={`${currentYears} years`}
            onChange={(e) => onYearsChange(parseInt(e.target.value.split(' ')[0]))}
            title="Select data period"
          >
            {availableYears.map((y) => (
              <option key={y} value={`${y} years`}>{y} {y === 1 ? 'Year' : 'Years'} Data</option>
            ))}
          </select>
        )}

        {/* ── Election dropdown ── */}
        <div className={`election-dropdown-container${isElectionDropdownOpen ? ' open' : ''}`}>
          <button
            className={`election-btn${isElectionActive ? ' active' : ' inactive'}`}
            onClick={() => { setIsElectionDropdownOpen(!isElectionDropdownOpen); setIsOpen(false) }}
          >
            <span className="election-text">{isElectionActive ? displayElection : 'Election Modes'}</span>
            <span className="dropdown-arrow">▼</span>
          </button>
          {isElectionDropdownOpen && (
            <div className="election-dropdown">
              {electionPeriods.map((period) => (
                <div
                  key={period}
                  className={`election-option${displayElection === period ? ' selected' : ''}`}
                  onMouseDown={() => handleElectionSelect(period)}
                >
                  {period}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Compare ── */}
        {onCompareClick !== undefined && (
          isCompareMode ? (
            <>
              <div style={{ width: '1px', background: 'rgba(255,102,0,0.5)', alignSelf: 'stretch', margin: '6px 2px' }} />
              <input
                type="text"
                className="seasonax-search-input"
                placeholder="vs..."
                value={compareSymbol || ''}
                onChange={(e) => onCompareSymbolChange?.(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onCompareSubmit?.()
                  if (e.key === 'Escape') onCompareClick?.()
                }}
                onBlur={() => { if (!compareSymbol?.trim()) onCompareClick?.() }}
                autoFocus
                style={{ width: '80px', minWidth: '80px' }}
              />
              <button onClick={onCompareClick} className="compare-btn" style={{ minWidth: 'unset', padding: '0 6px' }}>×</button>
            </>
          ) : (
            <button onClick={onCompareClick} className="compare-btn" title="Compare with another symbol">Compare</button>
          )
        )}
      </div>

      {/* ── Row 2: Sweet Spot, Pain Point & Current Year ── */}
      {(onSweetSpotToggle || onPainPointToggle || onCurrentYearToggle) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'nowrap' }}>
          {onSweetSpotToggle && (
            <button
              className={`sweet-spot-btn compare-btn${sweetSpotActive ? ' active' : ''}`}
              onClick={() => { onSweetSpotToggle(); setIsOpen(false) }}
              title="Highlight best seasonal period"
            >
              ★ Sweet Spot
            </button>
          )}
          {onPainPointToggle && (
            <button
              className={`pain-point-btn compare-btn${painPointActive ? ' active' : ''}`}
              onClick={() => { onPainPointToggle(); setIsOpen(false) }}
              title="Highlight worst seasonal period"
            >
              ▼ Pain Point
            </button>
          )}
          {onCurrentYearModeChange && (
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <button
                className={`compare-btn${currentYearMode !== 'off' ? ' active' : ''}`}
                onClick={() => { setIsCurrentYearDropdownOpen(v => !v); setIsOpen(false) }}
                style={{
                  borderColor: currentYearMode !== 'off' ? '#00D4FF' : undefined,
                  color: currentYearMode !== 'off' ? '#00D4FF' : undefined,
                }}
              >
                {currentYearMode === 'benchmarked' ? '⊨ Benchmarked' : '⊨ Current Year'}
                {currentYearMode !== 'off' && ' ✓'}
                <span style={{ fontSize: '8px', marginLeft: '4px', opacity: 0.7 }}>▼</span>
              </button>
              {isCurrentYearDropdownOpen && (
                <div className="election-dropdown">
                  <div
                    className={`election-option${currentYearMode === 'raw' ? ' selected' : ''}`}
                    onMouseDown={() => { onCurrentYearModeChange(currentYearMode === 'raw' ? 'off' : 'raw'); setIsCurrentYearDropdownOpen(false) }}
                  >
                    Current Year
                  </div>
                  <div
                    className={`election-option${currentYearMode === 'benchmarked' ? ' selected' : ''}`}
                    onMouseDown={() => { onCurrentYearModeChange(currentYearMode === 'benchmarked' ? 'off' : 'benchmarked'); setIsCurrentYearDropdownOpen(false) }}
                  >
                    Benchmarked vs SPY
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default SeasonaxSymbolSearch
