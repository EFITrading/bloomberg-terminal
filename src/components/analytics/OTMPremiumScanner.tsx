'use client'

import { Layers, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react'

import React, { useEffect, useRef, useState } from 'react'

import { TOP_1000_SYMBOLS } from '@/lib/Top1000Symbols'

interface PremiumImbalance {
  symbol: string
  stockPrice: number
  atmStrike: number
  callMid: number
  callBid: number
  callAsk: number
  callSpreadPercent: number
  putMid: number
  putBid: number
  putAsk: number
  putSpreadPercent: number
  premiumDifference: number
  imbalancePercent: number
  expensiveSide: 'CALLS' | 'PUTS'
  imbalanceSeverity: 'EXTREME' | 'HIGH' | 'MODERATE'
  strikeSpacing: number
  putStrike: number
  callStrike: number
}

interface OTMPremiumScannerProps {
  compactMode?: boolean
}

// Helper function to calculate next monthly expiry (3rd Friday of next month)
const getNextMonthlyExpiry = () => {
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()
  const nextMonth = new Date(year, month + 1, 1)
  let firstFriday = 1
  while (new Date(nextMonth.getFullYear(), nextMonth.getMonth(), firstFriday).getDay() !== 5) {
    firstFriday++
  }
  const thirdFriday = firstFriday + 14
  const expiryDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), thirdFriday)
  const yyyy = expiryDate.getFullYear()
  const mm = String(expiryDate.getMonth() + 1).padStart(2, '0')
  const dd = String(expiryDate.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// Helper function to calculate next weekly expiry (next Friday)
const getNextWeeklyExpiry = () => {
  const today = new Date()
  const dayOfWeek = today.getDay() // 0 = Sunday, 5 = Friday
  let daysUntilFriday = 5 - dayOfWeek

  // If today is Friday, look at the time to determine if we should use today or next Friday
  if (daysUntilFriday === 0) {
    // If it's past 4 PM ET on Friday, use next Friday
    const currentHour = today.getHours()
    if (currentHour >= 16) {
      daysUntilFriday = 7
    }
  } else if (daysUntilFriday < 0) {
    daysUntilFriday += 7
  }

  const nextFriday = new Date(today)
  nextFriday.setDate(today.getDate() + daysUntilFriday)

  const yyyy = nextFriday.getFullYear()
  const mm = String(nextFriday.getMonth() + 1).padStart(2, '0')
  const dd = String(nextFriday.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export default function OTMPremiumScanner({ compactMode = false }: OTMPremiumScannerProps) {
  const [otmResults, setOtmResults] = useState<PremiumImbalance[]>([])
  const [otmLoading, setOtmLoading] = useState(false)
  const [otmSymbols] = useState(TOP_1000_SYMBOLS.join(','))
  const [otmLastUpdate, setOtmLastUpdate] = useState<Date | null>(null)
  const [otmScanProgress, setOtmScanProgress] = useState({ current: 0, total: 0 })
  const [otmScanningSymbol, setOtmScanningSymbol] = useState('')
  const [customTicker, setCustomTicker] = useState('')
  const [expiryType, setExpiryType] = useState<'weekly' | 'monthly'>('monthly')
  const otmEventSourceRef = useRef<EventSource | null>(null)

  // Calculate expiry based on selected type
  const otmExpiry = expiryType === 'monthly' ? getNextMonthlyExpiry() : getNextWeeklyExpiry()

  const scanOTMPremiums = async () => {
    setOtmLoading(true)
    setOtmResults([])
    setOtmScanProgress({ current: 0, total: otmSymbols.split(',').length })

    if (otmEventSourceRef.current) {
      otmEventSourceRef.current.close()
    }

    try {
      const eventSource = new EventSource(
        `/api/scan-premium-stream?symbols=${encodeURIComponent(otmSymbols)}&expiry=${encodeURIComponent(otmExpiry)}`
      )
      otmEventSourceRef.current = eventSource

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data)

        if (data.type === 'progress') {
          setOtmScanProgress(data.progress)
          setOtmScanningSymbol(data.symbol)
        } else if (data.type === 'result') {
          setOtmResults((prev) => {
            const newResults = [...prev, data.result]
            return newResults.sort(
              (a, b) => Math.abs(b.imbalancePercent) - Math.abs(a.imbalancePercent)
            )
          })
        } else if (data.type === 'complete') {
          setOtmLoading(false)
          setOtmLastUpdate(new Date())
          setOtmScanningSymbol('')
          eventSource.close()
        } else if (data.type === 'error') {
          console.error('OTM Scan error:', data.error)
        }
      }

      eventSource.onerror = () => {
        setOtmLoading(false)
        setOtmScanningSymbol('')
        eventSource.close()
      }
    } catch (error) {
      console.error('OTM Scan error:', error)
      setOtmLoading(false)
    }
  }

  const scanCustomTicker = async () => {
    if (!customTicker.trim()) return

    setOtmLoading(true)
    setOtmResults([])
    setOtmScanProgress({ current: 0, total: 1 })

    if (otmEventSourceRef.current) {
      otmEventSourceRef.current.close()
    }

    try {
      const eventSource = new EventSource(
        `/api/scan-premium-stream?symbols=${encodeURIComponent(customTicker.toUpperCase().trim())}&expiry=${encodeURIComponent(otmExpiry)}`
      )
      otmEventSourceRef.current = eventSource

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data)

        if (data.type === 'progress') {
          setOtmScanProgress(data.progress)
          setOtmScanningSymbol(data.symbol)
        } else if (data.type === 'result') {
          setOtmResults((prev) => {
            const newResults = [...prev, data.result]
            return newResults.sort(
              (a, b) => Math.abs(b.imbalancePercent) - Math.abs(a.imbalancePercent)
            )
          })
        } else if (data.type === 'complete') {
          setOtmLoading(false)
          setOtmLastUpdate(new Date())
          setOtmScanningSymbol('')
          setCustomTicker('')
          eventSource.close()
        } else if (data.type === 'error') {
          console.error('OTM Scan error:', data.error)
        }
      }

      eventSource.onerror = () => {
        setOtmLoading(false)
        setOtmScanningSymbol('')
        eventSource.close()
      }
    } catch (error) {
      console.error('OTM Scan error:', error)
      setOtmLoading(false)
    }
  }

  const formatExpiryDate = (dateStr: string) => {
    if (!dateStr) return ''
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div
      className="text-white overflow-hidden"
      style={{
        background: '#06060a',
        border: '1px solid rgba(255,120,0,0.18)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.8)',
      }}
    >
      {/* ── Title bar ── */}
      <div
        className="flex items-center gap-4 px-6 py-4"
        style={{
          background: 'linear-gradient(180deg, #101016 0%, #08080d 100%)',
          borderBottom: '1px solid rgba(255,120,0,0.22)',
        }}
      >
        <Layers className="w-7 h-7 flex-shrink-0" style={{ color: '#f97316' }} />
        <div
          className="font-black text-white"
          style={{ letterSpacing: '0.18em', fontSize: '1.35rem' }}
        >
          OTM PREMIUM SCANNER
        </div>
        {otmLoading && (
          <div
            className="flex items-center gap-2 ml-2 px-3 py-1 rounded-full"
            style={{
              background: 'rgba(249,115,22,0.15)',
              border: '1px solid rgba(249,115,22,0.3)',
            }}
          >
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#f97316' }} />
            <span
              className="text-xs font-black"
              style={{ color: '#f97316', letterSpacing: '0.1em' }}
            >
              SCANNING {otmScanProgress.current}/{otmScanProgress.total}
            </span>
          </div>
        )}
        {!otmLoading && otmResults.length > 0 && (
          <div className="flex items-center gap-3 ml-2">
            <div
              className="px-2 py-0.5 rounded"
              style={{
                background: 'rgba(255,40,40,0.15)',
                border: '1px solid rgba(255,40,40,0.3)',
              }}
            >
              <span
                className="text-xs font-black"
                style={{ color: '#ff4444', letterSpacing: '0.08em' }}
              >
                EXTREME {otmResults.filter((r) => r.imbalanceSeverity === 'EXTREME').length}
              </span>
            </div>
            <div
              className="px-2 py-0.5 rounded"
              style={{
                background: 'rgba(234,179,8,0.15)',
                border: '1px solid rgba(234,179,8,0.3)',
              }}
            >
              <span
                className="text-xs font-black"
                style={{ color: '#eab308', letterSpacing: '0.08em' }}
              >
                HIGH {otmResults.filter((r) => r.imbalanceSeverity === 'HIGH').length}
              </span>
            </div>
            <div
              className="px-2 py-0.5 rounded"
              style={{
                background: 'rgba(59,130,246,0.15)',
                border: '1px solid rgba(59,130,246,0.3)',
              }}
            >
              <span
                className="text-xs font-black"
                style={{ color: '#3b82f6', letterSpacing: '0.08em' }}
              >
                MOD {otmResults.filter((r) => r.imbalanceSeverity === 'MODERATE').length}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Controls bar ── */}
      <div
        className="flex flex-wrap items-center gap-3 px-6 py-3"
        style={{ background: '#0a0a0f', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <button
          onClick={scanOTMPremiums}
          disabled={otmLoading}
          style={{
            background: otmLoading
              ? '#1a1a22'
              : 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
            border: otmLoading
              ? '1px solid rgba(255,255,255,0.08)'
              : '1px solid rgba(249,115,22,0.5)',
            color: otmLoading ? '#555' : '#fff',
            padding: '8px 18px',
            borderRadius: 8,
            fontWeight: 800,
            fontSize: 12,
            letterSpacing: '0.1em',
            cursor: otmLoading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            flexShrink: 0,
            boxShadow: otmLoading ? 'none' : '0 2px 12px rgba(249,115,22,0.35)',
            transition: 'all 0.15s',
          }}
        >
          <RefreshCw
            style={{ width: 14, height: 14 }}
            className={otmLoading ? 'animate-spin' : ''}
          />
          {otmLoading ? 'SCANNING...' : 'SCAN ALL'}
        </button>

        <div
          style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }}
        />

        <input
          type="text"
          value={customTicker}
          onChange={(e) => setCustomTicker(e.target.value.toUpperCase())}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && customTicker.trim()) scanCustomTicker()
          }}
          placeholder="TICKER / FILTER"
          disabled={otmLoading}
          style={{
            background: '#0d0d12',
            border: '1px solid rgba(255,255,255,0.14)',
            color: '#fff',
            padding: '8px 12px',
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: '0.12em',
            outline: 'none',
            width: 160,
            opacity: otmLoading ? 0.45 : 1,
            fontFamily: 'monospace',
          }}
        />
        <button
          onClick={scanCustomTicker}
          disabled={!customTicker.trim() || otmLoading}
          style={{
            background:
              customTicker.trim() && !otmLoading
                ? 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'
                : '#14141a',
            border:
              customTicker.trim() && !otmLoading
                ? '1px solid rgba(249,115,22,0.5)'
                : '1px solid rgba(255,255,255,0.07)',
            color: customTicker.trim() && !otmLoading ? '#fff' : '#444',
            padding: '8px 14px',
            borderRadius: 8,
            fontWeight: 800,
            fontSize: 12,
            letterSpacing: '0.1em',
            cursor: customTicker.trim() && !otmLoading ? 'pointer' : 'not-allowed',
            flexShrink: 0,
            transition: 'all 0.15s',
          }}
        >
          SCAN
        </button>

        <div
          style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }}
        />

        <div style={{ flex: 1 }} />

        <select
          value={expiryType}
          onChange={(e) => setExpiryType(e.target.value as 'weekly' | 'monthly')}
          disabled={otmLoading}
          style={{
            appearance: 'none' as const,
            background: '#0d0d12',
            border: '1px solid rgba(255,255,255,0.14)',
            color: '#fff',
            padding: '8px 36px 8px 14px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            outline: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 10px center',
            backgroundSize: '10px',
            minWidth: 120,
            opacity: otmLoading ? 0.45 : 1,
          }}
        >
          <option value="weekly">
            Weekly {expiryType === 'weekly' ? `· ${formatExpiryDate(otmExpiry)}` : ''}
          </option>
          <option value="monthly">
            Monthly {expiryType === 'monthly' ? `· ${formatExpiryDate(otmExpiry)}` : ''}
          </option>
        </select>
      </div>

      {/* ── Scan progress ── */}
      {otmLoading && otmScanProgress.total > 0 && (
        <div
          style={{
            background: '#08080d',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            padding: '0 24px',
          }}
        >
          <div style={{ height: 3, background: '#111118', borderRadius: 2, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                background: 'linear-gradient(90deg, #f97316, #fb923c)',
                borderRadius: 2,
                width: `${otmScanProgress.total > 0 ? (otmScanProgress.current / otmScanProgress.total) * 100 : 0}%`,
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      )}

      {/* Results */}
      <div className="space-y-3 px-3 md:px-6 py-3 md:py-6">
        {otmResults.length === 0 && !otmLoading && !otmLastUpdate && (
          <div className="text-center py-16">
            <div className="text-xl font-semibold text-gray-500">
              Click "Scan Now" to begin analysis
            </div>
          </div>
        )}

        {otmResults.length === 0 && !otmLoading && otmLastUpdate && (
          <div className="text-center py-16">
            <div className="text-xl font-semibold text-gray-500">No results found</div>
          </div>
        )}

        {otmResults.length === 0 && otmLoading && (
          <div className="text-center py-8 md:py-16">
            <RefreshCw className="w-6 h-6 md:w-8 md:h-8 text-white animate-spin mb-3 md:mb-4 mx-auto" />
            <div className="text-white text-xs md:text-sm font-medium">
              Scanning TOP 1000 stocks for OTM premium imbalances...
            </div>
            <div className="text-gray-400 text-xs mt-2">
              Finding calls above stock vs puts below stock imbalances
            </div>
          </div>
        )}

        {otmResults.map((result, idx) => (
          <div
            key={`${result.symbol}-${idx}`}
            className="bg-gradient-to-br from-gray-900 via-black to-gray-900 border-2 border-gray-700 rounded-xl p-4 md:p-6 hover:border-blue-500/50 transition-all duration-300 shadow-xl"
          >
            {/* Header Row */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-2xl md:text-3xl font-black text-white mb-1">
                  {result.symbol}
                </div>
                <div className="text-xs text-white font-medium">
                  ${result.stockPrice.toFixed(2)}
                </div>
              </div>
              <div
                className={`px-3 py-1 text-xs font-black ${
                  result.imbalanceSeverity === 'EXTREME'
                    ? 'bg-gradient-to-r from-red-500 to-red-400 text-white'
                    : result.imbalanceSeverity === 'HIGH'
                      ? 'bg-gradient-to-r from-red-400 to-red-300 text-white'
                      : 'bg-gradient-to-r from-yellow-500 to-yellow-400 text-black'
                } rounded-lg`}
              >
                {result.imbalanceSeverity}
              </div>
            </div>

            {/* Strikes Info */}
            <div className="text-center bg-gray-900/50 rounded-lg p-2 mb-4">
              <div className="text-xs text-gray-300 font-bold mb-1">STRIKES</div>
              <div className="text-white font-bold text-sm">
                ${result.putStrike} / ${result.callStrike}
              </div>
              <div className="text-xs text-gray-400 font-medium mt-0.5">
                ({result.strikeSpacing} spacing)
              </div>
            </div>

            {/* Calls vs Puts */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="bg-green-900/20 border border-green-500/30 p-2 rounded-lg">
                <div className="flex items-center gap-1 mb-1">
                  <TrendingUp className="w-3 h-3 text-green-400" />
                  <span className="text-xs text-green-300 font-bold">CALLS</span>
                </div>
                <div className="text-lg font-black text-white">${result.callMid.toFixed(2)}</div>
                <div className="text-xs text-gray-300 font-medium mt-1">${result.callStrike}</div>
                <div className="text-xs text-gray-400">
                  {result.callBid.toFixed(2)} × {result.callAsk.toFixed(2)}
                </div>
              </div>

              <div className="bg-red-900/20 border border-red-500/30 p-2 rounded-lg">
                <div className="flex items-center gap-1 mb-1">
                  <TrendingDown className="w-3 h-3 text-red-400" />
                  <span className="text-xs text-red-300 font-bold">PUTS</span>
                </div>
                <div className="text-lg font-black text-white">${result.putMid.toFixed(2)}</div>
                <div className="text-xs text-gray-300 font-medium mt-1">${result.putStrike}</div>
                <div className="text-xs text-gray-400">
                  {result.putBid.toFixed(2)} × {result.putAsk.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="bg-gray-900/50 rounded-lg p-2 text-center">
                <div className="text-xs text-gray-300 font-bold mb-1">DIFFERENCE</div>
                <div
                  className={`text-lg font-black ${result.premiumDifference > 0 ? 'text-green-300' : 'text-red-300'}`}
                >
                  ${Math.abs(result.premiumDifference).toFixed(2)}
                </div>
              </div>

              <div className="bg-gray-900/50 rounded-lg p-2 text-center">
                <div className="text-xs text-gray-300 font-bold mb-1">IMBALANCE</div>
                <div
                  className={`text-2xl font-black ${
                    result.imbalanceSeverity === 'EXTREME'
                      ? 'text-red-500'
                      : result.imbalanceSeverity === 'HIGH'
                        ? 'text-red-400'
                        : 'text-yellow-400'
                  }`}
                >
                  {Math.abs(result.imbalancePercent).toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Footer Info */}
            <div className="border-t border-gray-700 pt-2 space-y-1 text-xs">
              <div className="text-gray-300">
                Call Spread:{' '}
                <span className="text-white font-bold">{result.callSpreadPercent.toFixed(1)}%</span>
              </div>
              <div className="text-gray-300">
                Put Spread:{' '}
                <span className="text-white font-bold">{result.putSpreadPercent.toFixed(1)}%</span>
              </div>
              <div className="text-white font-bold text-xs">
                {result.expensiveSide === 'CALLS'
                  ? `→ OTM Calls more expensive - BULLISH`
                  : `→ OTM Puts more expensive - BEARISH`}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
