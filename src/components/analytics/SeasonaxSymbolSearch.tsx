'use client'

import React, { useEffect, useRef, useState } from 'react'

interface SearchResult {
  ticker: string
  name: string
}

interface QuickScan {
  name: string
  label: string
  tickers: string[]
  color: string
  icon: string
}

interface SectorScan {
  etf: string
  label: string
  tickers: string[]
  color: string
}

const SECTOR_SCANS: SectorScan[] = [
  { etf: 'XLK', label: 'TECH', color: '#00BFFF', tickers: ['MSFT', 'AAPL', 'NVDA', 'AVGO', 'META', 'ORCL', 'AMD', 'QCOM', 'TXN', 'CRM'] },
  { etf: 'XLV', label: 'HEALTH', color: '#FF6B9D', tickers: ['LLY', 'UNH', 'ABBV', 'JNJ', 'MRK', 'TMO', 'ABT', 'DHR', 'BMY', 'AMGN'] },
  { etf: 'XLF', label: 'FINANCE', color: '#4CAF50', tickers: ['JPM', 'V', 'MA', 'BAC', 'GS', 'MS', 'WFC', 'AXP', 'SPGI', 'CB'] },
  { etf: 'XLE', label: 'ENERGY', color: '#FF8C00', tickers: ['XOM', 'CVX', 'COP', 'EOG', 'PSX', 'MPC', 'SLB', 'WMB', 'OKE', 'VLO'] },
  { etf: 'XLI', label: 'INDUST', color: '#9370DB', tickers: ['GE', 'RTX', 'HON', 'CAT', 'UPS', 'DE', 'LMT', 'UNP', 'ETN', 'BA'] },
  { etf: 'XLY', label: 'DISCRET', color: '#FFD700', tickers: ['AMZN', 'TSLA', 'HD', 'MCD', 'NKE', 'LOW', 'SBUX', 'TGT', 'BKNG', 'F'] },
  { etf: 'XLP', label: 'STAPLES', color: '#20B2AA', tickers: ['PG', 'COST', 'WMT', 'KO', 'PEP', 'PM', 'MDLZ', 'CL', 'MNST', 'GIS'] },
  { etf: 'XLU', label: 'UTILS', color: '#FF4500', tickers: ['NEE', 'SO', 'DUK', 'SRE', 'AEP', 'D', 'PCG', 'EXC', 'XEL', 'CEG'] },
  { etf: 'XLRE', label: 'REIT', color: '#87CEEB', tickers: ['PLD', 'AMT', 'EQIX', 'WELL', 'SPG', 'PSA', 'VICI', 'O', 'DLR', 'AVB'] },
  { etf: 'XLB', label: 'MATRLS', color: '#CD853F', tickers: ['LIN', 'APD', 'SHW', 'ECL', 'NEM', 'FCX', 'CTVA', 'PPG', 'VMC', 'NUE'] },
  { etf: 'XLC', label: 'COMMS', color: '#00CED1', tickers: ['META', 'GOOGL', 'GOOG', 'NFLX', 'T', 'DIS', 'VZ', 'TMUS', 'CHTR', 'EA'] },
  { etf: 'XTRA', label: 'MACRO', color: '#E879F9', tickers: ['TLT', 'GLD', 'SLV', 'HYG', 'KWEB', 'BTC'] },
]

const QUICK_SCANS: QuickScan[] = [
  {
    name: 'etf-trio',
    label: 'QQQ / SPY / DIA',
    tickers: ['QQQ', 'SPY', 'DIA'],
    color: '#00D4FF',
    icon: '◈',
  },
  {
    name: 'mag7',
    label: 'MAG 7',
    tickers: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'],
    color: '#FFD700',
    icon: '✦',
  },
  {
    name: 'sectors',
    label: '11 SECTORS',
    tickers: ['XLK', 'XLV', 'XLF', 'XLE', 'XLI', 'XLY', 'XLP', 'XLU', 'XLRE', 'XLB', 'XLC'],
    color: '#FF6B35',
    icon: '⊞',
  },
  {
    name: 'value',
    label: 'VALUE',
    tickers: ['XLI', 'XLB', 'XLE', 'XLF'],
    color: '#C084FC',
    icon: '◆',
  },
  {
    name: 'growth',
    label: 'GROWTH',
    tickers: ['XLK', 'XLC', 'XLY'],
    color: '#34D399',
    icon: '▲',
  },
  {
    name: 'defensives',
    label: 'DEFENSIVES',
    tickers: ['XLRE', 'XLV', 'XLU', 'XLP'],
    color: '#60A5FA',
    icon: '⬟',
  },
  {
    name: 'industries',
    label: 'INDUSTRIES',
    tickers: ['SMH', 'XRT', 'KIE', 'KRE', 'IGV', 'GDX', 'SLV', 'XHB', 'TAN', 'ITB', 'XME', 'XBI', 'XOP'],
    color: '#FBBF24',
    icon: '⬢',
  },
]

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
  onMonthsToggle?: () => void
  monthsOpen?: boolean
  currentYearMode?: 'off' | 'raw' | 'benchmarked'
  onCurrentYearModeChange?: (mode: 'off' | 'raw' | 'benchmarked') => void
  isCompareMode?: boolean
  compareSymbol?: string
  onCompareClick?: () => void
  onCompareSymbolChange?: (symbol: string) => void
  onCompareSubmit?: () => void
  onQuickScan?: (name: string, tickers: string[], benchmarkSymbol?: string) => void
  isFullscreen?: boolean
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
  onMonthsToggle,
  monthsOpen = false,
  currentYearMode = 'off' as 'off' | 'raw' | 'benchmarked',
  onCurrentYearModeChange,
  isCompareMode,
  compareSymbol,
  onCompareClick,
  onCompareSymbolChange,
  onCompareSubmit,
  onQuickScan,
  isFullscreen = false,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>(initialSymbol)
  const [isOpen, setIsOpen] = useState<boolean>(false)
  const [isElectionDropdownOpen, setIsElectionDropdownOpen] = useState<boolean>(false)
  const [isYearsDropdownOpen, setIsYearsDropdownOpen] = useState<boolean>(false)
  const [isCurrentYearDropdownOpen, setIsCurrentYearDropdownOpen] = useState<boolean>(false)
  const [isXtraDropdownOpen, setIsXtraDropdownOpen] = useState<boolean>(false)
  const [localElectionPeriod, setLocalElectionPeriod] = useState<string>(externalElectionPeriod || 'Normal Mode')
  const [recentSymbols] = useState<string[]>(['MSFT', 'AAPL', 'GOOGL', 'AMZN', 'TSLA', 'NVDA'])
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState<boolean>(false)
  const [activeQuickScan, setActiveQuickScan] = useState<string | null>(null)
  const [activeSectorScan, setActiveSectorScan] = useState<string | null>(null)
  const [isMobileView, setIsMobileView] = useState(false)
  useEffect(() => {
    const check = () => setIsMobileView(window.innerWidth <= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
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
        setIsXtraDropdownOpen(false)
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
    setActiveQuickScan(null)
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

  const handleQuickScanClick = (scan: QuickScan) => {
    setActiveQuickScan(scan.name)
    setActiveSectorScan(null)
    setIsOpen(false)
    if (onQuickScan) {
      onQuickScan(scan.name, scan.tickers)
    } else {
      // fallback: load first ticker
      setSearchTerm(scan.tickers[0])
      onSymbolSelect(scan.tickers[0])
    }
  }

  const handleSectorScanClick = (sector: SectorScan) => {
    if (activeSectorScan === sector.etf) {
      // toggle off
      setActiveSectorScan(null)
      return
    }
    setActiveSectorScan(sector.etf)
    setActiveQuickScan(null)
    setIsOpen(false)
    if (onQuickScan) {
      onQuickScan(`sector-${sector.etf}`, sector.tickers, sector.etf)
    }
  }

  const hasSymbol = !!initialSymbol

  // ── Quick scan buttons (shared between both states) ──
  const quickScanRow = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'nowrap' }}>
      {QUICK_SCANS.map((scan) => {
        const isActive = activeQuickScan === scan.name
        return (
          <button
            key={scan.name}
            onClick={() => handleQuickScanClick(scan)}
            title={scan.tickers.join(', ')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 10px',
              background: isActive ? `${scan.color}22` : 'rgba(255,255,255,0.04)',
              border: `1px solid ${isActive ? scan.color : 'rgba(255,255,255,0.15)'}`,
              borderRadius: '4px',
              color: isActive ? scan.color : 'rgba(255,255,255,0.6)',
              fontSize: '11px',
              fontFamily: '"Roboto Mono", monospace',
              fontWeight: '700',
              letterSpacing: '0.04em',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                ; (e.currentTarget as HTMLButtonElement).style.borderColor = scan.color
                  ; (e.currentTarget as HTMLButtonElement).style.color = scan.color
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                ; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.15)'
                  ; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.6)'
              }
            }}
          >
            <span style={{ fontSize: '13px', lineHeight: 1 }}>{scan.icon}</span>
            {scan.label}
          </button>
        )
      })}
    </div>
  )

  // ── No-symbol state: search + quick scans + sector buttons ──
  if (!hasSymbol) {
    return (
      <div className="seasonax-symbol-search" ref={searchRef} style={{ display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' }}>
        {/* Row 1: Search + Quick scans */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'nowrap' }}>
          {/* Search input */}
          <div className="search-input-container" style={{ position: 'relative' }}>
            <input
              type="text"
              value={searchTerm}
              onChange={handleInputChange}
              onFocus={() => { setIsOpen(true); setIsElectionDropdownOpen(false) }}
              onKeyDown={handleKeyDown}
              placeholder="Search ticker..."
              className="seasonax-search-input"
              autoComplete="off"
            />
            <div className="search-icon" />
            {isOpen && (searchResults.length > 0 || isSearching || searchTerm.trim().length === 0) && (
              <div className="seasonax-search-dropdown" style={{ position: 'absolute', top: '100%', left: 0, zIndex: 2000 }}>
                {isSearching && <div className="search-section-title">Searching...</div>}
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
          {/* Quick scan presets */}
          {QUICK_SCANS.map((scan) => {
            const isActive = activeQuickScan === scan.name
            return (
              <button
                key={scan.name}
                className="compare-btn"
                onClick={() => handleQuickScanClick(scan)}
                title={scan.tickers.join(', ')}
                style={{
                  borderColor: isActive ? scan.color : undefined,
                  color: isActive ? scan.color : undefined,
                  background: isActive ? `linear-gradient(180deg, ${scan.color}22 0%, ${scan.color}11 60%)` : undefined,
                }}
              >
                {scan.icon} {scan.label}
              </button>
            )
          })}
        </div>
        {/* Row 2: All 12 sector ETF buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'nowrap' }}>
          {SECTOR_SCANS.map((sector) => {
            const isActive = activeSectorScan === sector.etf
            return (
              <button
                key={sector.etf}
                className="compare-btn"
                onClick={() => handleSectorScanClick(sector)}
                title={`${sector.label} — ${sector.tickers.join(', ')} (vs ${sector.etf})`}
                style={{
                  borderColor: isActive ? sector.color : undefined,
                  color: isActive ? sector.color : undefined,
                  background: isActive ? `linear-gradient(180deg, ${sector.color}22 0%, ${sector.color}11 60%)` : undefined,
                }}
              >
                {sector.etf}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Symbol selected state: full 2-row layout ──
  return (
    <div className="seasonax-symbol-search" ref={searchRef} style={{ display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' }}>
      {/* Row 1: Search + Years + Election + Compare + Sweet Spot + Pain Point + Current Year */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexWrap: 'nowrap' }}>
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
            <div className="seasonax-search-dropdown" style={{ position: 'absolute', top: '100%', left: 0, zIndex: 2000 }}>
              {isSearching && <div className="search-section-title">Searching...</div>}
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

        {onYearsChange && (
          <select
            className="date-select"
            value={`${currentYears} years`}
            onChange={(e) => onYearsChange(parseInt(e.target.value.split(' ')[0]))}
            title="Select data period"
          >
            {availableYears.map((y) => (
              <option key={y} value={`${y} years`}>{isMobileView ? `${y} Years` : `${y} ${y === 1 ? 'Year' : 'Years'} Data`}</option>
            ))}
          </select>
        )}

        {isMobileView ? (
          <select
            className="date-select"
            value={displayElection}
            onChange={(e) => handleElectionSelect(e.target.value)}
            style={{ borderColor: isElectionActive ? '#ff8800' : undefined, color: isElectionActive ? '#ff8800' : undefined }}
          >
            {electionPeriods.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        ) : (
          <div className={`election-dropdown-container${isElectionDropdownOpen ? ' open' : ''}`}>
            <button
              className={`election-btn${isElectionActive ? ' active' : ' inactive'}`}
              onClick={() => { setIsElectionDropdownOpen(!isElectionDropdownOpen); setIsOpen(false); setIsXtraDropdownOpen(false) }}
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
        )}

        {!isMobileView && onCompareClick !== undefined && (
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
            !isMobileView && <button onClick={onCompareClick} className="compare-btn" title="Compare with another symbol">Compare</button>
          )
        )}

        {/* Sweet Spot + Pain Point + Current Year — on Row 1 in fullscreen only */}
        {isFullscreen && onSweetSpotToggle && (
          <button
            className={`sweet-spot-btn compare-btn${sweetSpotActive ? ' active' : ''}`}
            onClick={() => { onSweetSpotToggle(); setIsOpen(false) }}
            title="Highlight best seasonal period"
          >
            ★ Sweet Spot
          </button>
        )}
        {isFullscreen && onPainPointToggle && (
          <button
            className={`pain-point-btn compare-btn${painPointActive ? ' active' : ''}`}
            onClick={() => { onPainPointToggle(); setIsOpen(false) }}
            title="Highlight worst seasonal period"
          >
            ▼ Pain Point
          </button>
        )}
        {isFullscreen && onCurrentYearModeChange && (
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

        {/* First 6 sector buttons on Row 1 in fullscreen */}
        {isFullscreen && (
          <>
            <div style={{ width: '1px', height: '22px', background: 'rgba(255,255,255,0.12)', flexShrink: 0, margin: '0 2px' }} />
            {SECTOR_SCANS.slice(0, 6).map((sector) => {
              const isActive = activeSectorScan === sector.etf
              return (
                <button
                  key={sector.etf}
                  className="compare-btn"
                  onClick={() => handleSectorScanClick(sector)}
                  title={`${sector.label} — ${sector.tickers.join(', ')} (vs ${sector.etf})`}
                  style={{
                    borderColor: isActive ? sector.color : undefined,
                    color: isActive ? sector.color : undefined,
                    background: isActive ? `linear-gradient(180deg, ${sector.color}22 0%, ${sector.color}11 60%)` : undefined,
                  }}
                >
                  {sector.etf}
                </button>
              )
            })}
          </>
        )}
      </div>

      {/* Row 2 (normal mode only): Sweet Spot + Pain Point + Current Year */}
      {!isFullscreen && (onSweetSpotToggle || onPainPointToggle || onCurrentYearModeChange) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'nowrap' }}>
          {onSweetSpotToggle && !isMobileView && (
            <button
              className={`sweet-spot-btn compare-btn${sweetSpotActive ? ' active' : ''}`}
              onClick={() => { onSweetSpotToggle(); setIsOpen(false) }}
              title="Highlight best seasonal period"
            >
              ★ Sweet Spot
            </button>
          )}
          {onPainPointToggle && !isMobileView && (
            <button
              className={`pain-point-btn compare-btn${painPointActive ? ' active' : ''}`}
              onClick={() => { onPainPointToggle(); setIsOpen(false) }}
              title="Highlight worst seasonal period"
            >
              ▼ Pain Point
            </button>
          )}
          {onCurrentYearModeChange && (
            isMobileView ? (
              <select
                className="date-select"
                value={currentYearMode}
                onChange={(e) => onCurrentYearModeChange(e.target.value as 'off' | 'raw' | 'benchmarked')}
                style={{ borderColor: currentYearMode !== 'off' ? '#00D4FF' : undefined, color: currentYearMode !== 'off' ? '#00D4FF' : undefined }}
              >
                <option value="off">Cur Year</option>
                <option value="raw">Current Year</option>
                <option value="benchmarked">Benchmarked</option>
              </select>
            ) : (
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
            )
          )}
          {isMobileView && (
            <select
              className="date-select"
              value={activeQuickScan || ''}
              onChange={(e) => { const scan = QUICK_SCANS.find(s => s.name === e.target.value); if (scan) handleQuickScanClick(scan) }}
              style={{ color: activeQuickScan ? QUICK_SCANS.find(s => s.name === activeQuickScan)?.color : undefined }}
            >
              <option value="" disabled>Xtra</option>
              {QUICK_SCANS.map(scan => <option key={scan.name} value={scan.name}>{scan.icon} {scan.label}</option>)}
            </select>
          )}
          {isMobileView && onMonthsToggle && (
            <button
              className={`compare-btn${monthsOpen ? ' active' : ''}`}
              onClick={onMonthsToggle}
              title="Toggle monthly returns"
            >
              {monthsOpen ? <>Months <span style={{ fontSize: '16px', fontWeight: 900, lineHeight: 1 }}>−</span></> : <>Months <span style={{ fontSize: '16px', fontWeight: 900, lineHeight: 1 }}>+</span></>}
            </button>
          )}
        </div>
      )}

      {/* Row 2 (fullscreen only): Quick scans + last 6 sector buttons */}
      {isFullscreen && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'nowrap' }}>
          {QUICK_SCANS.map((scan) => {
            const isActive = activeQuickScan === scan.name
            return (
              <button
                key={scan.name}
                className="compare-btn"
                onClick={() => handleQuickScanClick(scan)}
                title={scan.tickers.join(', ')}
                style={{
                  borderColor: isActive ? scan.color : undefined,
                  color: isActive ? scan.color : undefined,
                  background: isActive ? `linear-gradient(180deg, ${scan.color}22 0%, ${scan.color}11 60%)` : undefined,
                }}
              >
                {scan.icon} {scan.label}
              </button>
            )
          })}

          <div style={{ width: '1px', height: '22px', background: 'rgba(255,255,255,0.12)', flexShrink: 0, margin: '0 2px' }} />

          {SECTOR_SCANS.slice(6).map((sector) => {
            const isActive = activeSectorScan === sector.etf
            return (
              <button
                key={sector.etf}
                className="compare-btn"
                onClick={() => handleSectorScanClick(sector)}
                title={`${sector.label} — ${sector.tickers.join(', ')} (vs ${sector.etf})`}
                style={{
                  borderColor: isActive ? sector.color : undefined,
                  color: isActive ? sector.color : undefined,
                  background: isActive ? `linear-gradient(180deg, ${sector.color}22 0%, ${sector.color}11 60%)` : undefined,
                }}
              >
                {sector.etf}
              </button>
            )
          })}
        </div>
      )}

    </div>
  )
}

export default SeasonaxSymbolSearch

