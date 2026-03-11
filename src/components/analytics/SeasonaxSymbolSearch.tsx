'use client'

import React, { useEffect, useRef, useState } from 'react'

interface SeasonaxSymbolSearchProps {
  onSymbolSelect: (symbol: string) => void
  initialSymbol: string
  onElectionPeriodSelect?: (period: string) => void
  onElectionModeToggle?: (isElectionMode: boolean) => void
  isCompareMode?: boolean
  compareSymbol?: string
  onCompareClick?: () => void
  onCompareSymbolChange?: (symbol: string) => void
  onCompareSubmit?: () => void
}

const SeasonaxSymbolSearch: React.FC<SeasonaxSymbolSearchProps> = ({
  onSymbolSelect,
  initialSymbol,
  onElectionPeriodSelect,
  onElectionModeToggle,
  isCompareMode,
  compareSymbol,
  onCompareClick,
  onCompareSymbolChange,
  onCompareSubmit,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>(initialSymbol)
  const [isOpen, setIsOpen] = useState<boolean>(false)
  const [isElectionDropdownOpen, setIsElectionDropdownOpen] = useState<boolean>(false)
  const [selectedElectionPeriod, setSelectedElectionPeriod] = useState<string>('Normal Mode')
  const [isElectionMode, setIsElectionMode] = useState<boolean>(false)
  const [recentSymbols] = useState<string[]>(['MSFT', 'AAPL', 'GOOGL', 'AMZN', 'TSLA', 'NVDA'])

  const searchRef = useRef<HTMLDivElement>(null)

  const electionPeriods = [
    'Normal Mode',
    'Election Year',
    'Post-Election',
    'Mid-Term',
    'Pre-Election',
  ]

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setIsElectionDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase()
    setSearchTerm(value)
    setIsOpen(true)
  }

  const handleSymbolClick = (symbol: string) => {
    setSearchTerm(symbol)
    setIsOpen(false)
    onSymbolSelect(symbol)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchTerm.length > 0) {
      handleSymbolClick(searchTerm)
    }
  }

  const getCompanyName = (symbol: string): string => {
    const companies: { [key: string]: string } = {
      MSFT: 'Microsoft Corporation',
      AAPL: 'Apple Inc.',
      GOOGL: 'Alphabet Inc.',
      AMZN: 'Amazon.com Inc.',
      TSLA: 'Tesla Inc.',
      NVDA: 'NVIDIA Corporation',
      META: 'Meta Platforms Inc.',
      SPY: 'SPDR S&P 500 ETF',
      QQQ: 'Invesco QQQ Trust',
      DIA: 'SPDR Dow Jones Industrial Average ETF',
    }
    return companies[symbol] || symbol
  }

  const handleElectionClick = () => {
    setIsElectionDropdownOpen(!isElectionDropdownOpen)
    setIsOpen(false) // Close search dropdown if open
  }

  const handleElectionPeriodSelect = (period: string) => {
    setSelectedElectionPeriod(period)
    setIsElectionDropdownOpen(false)
    console.log('Selected election period:', period)

    if (period === 'Normal Mode') {
      // Switch back to normal mode
      setIsElectionMode(false)
      if (onElectionModeToggle) {
        onElectionModeToggle(false)
      }
    } else {
      // Switch to election mode
      setIsElectionMode(true)
      if (onElectionModeToggle) {
        onElectionModeToggle(true)
      }
      // Notify parent component about election period selection
      if (onElectionPeriodSelect) {
        onElectionPeriodSelect(period)
      }
    }
  }

  return (
    <div className="seasonax-symbol-search" ref={searchRef}>
      <div className="search-input-container">
        <input
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search instruments..."
          className="seasonax-search-input"
          autoComplete="off"
        />
        <div className="search-icon"></div>
      </div>
      {onCompareClick !== undefined &&
        (isCompareMode ? (
          <>
            <div
              style={{
                width: '1px',
                background: 'rgba(255,102,0,0.5)',
                alignSelf: 'stretch',
                margin: '6px 2px',
              }}
            />
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
              onBlur={() => {
                if (!compareSymbol?.trim()) onCompareClick?.()
              }}
              autoFocus
              style={{ color: '#FF6600', fontWeight: 600, width: '80px', minWidth: '80px' }}
            />
            <button
              onClick={onCompareClick}
              title="Clear compare"
              style={{
                background: 'none',
                border: 'none',
                color: '#FF6600',
                cursor: 'pointer',
                padding: '0 4px',
                fontSize: '15px',
                lineHeight: 1,
                fontWeight: 900,
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </>
        ) : (
          <button
            onClick={onCompareClick}
            title="Compare with another symbol"
            style={{
              background: 'none',
              border: '1px solid rgba(255,102,0,0.45)',
              color: '#FF6600',
              cursor: 'pointer',
              padding: '2px 7px',
              fontSize: '16px',
              lineHeight: 1,
              fontWeight: 900,
              borderRadius: '3px',
              flexShrink: 0,
            }}
          >
            +
          </button>
        ))}
    </div>
  )
}

export default SeasonaxSymbolSearch
