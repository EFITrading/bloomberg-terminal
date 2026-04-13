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
  lastSeenTime?: string
  expiry?: string
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

// Helper function to calculate next weekly expiry (next Friday, rolls if within 2 days)
const getNextWeeklyExpiry = () => {
  const today = new Date()
  const dayOfWeek = today.getDay() // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  let daysUntilFriday = 5 - dayOfWeek
  if (daysUntilFriday < 0) daysUntilFriday += 7

  // Less than 2 days until expiry (Thu or Fri) → roll to NEXT Friday
  if (daysUntilFriday < 2) daysUntilFriday += 7

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
  const [expiryType, setExpiryType] = useState<'weekly' | 'monthly'>('weekly')
  const [nextScanIn, setNextScanIn] = useState<number>(0)
  const otmEventSourceRef = useRef<EventSource | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const autoScanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const nextScanTimeRef = useRef<number>(0)
  const scanOTMPremiumsRef = useRef<() => void>(() => {})

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
      const url = `/api/scan-premium-stream?symbols=${encodeURIComponent(otmSymbols)}&expiry=${encodeURIComponent(otmExpiry)}`
      const eventSource = new EventSource(url)
      otmEventSourceRef.current = eventSource

      eventSource.onmessage = (event) => {
        try {
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
            console.error('[OTM] scanner error:', data.error)
          }
        } catch (e) {
          console.error('[OTM] parse error:', event.data, e)
        }
      }

      eventSource.onerror = (e) => {
        console.error('[OTM] EventSource error, readyState:', eventSource.readyState, e)
        setOtmLoading(false)
        setOtmScanningSymbol('')
        eventSource.close()
      }
    } catch (error) {
      console.error('[OTM] failed to open stream:', error)
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
        try {
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
            console.error('[OTM] scanner error:', data.error)
          }
        } catch (e) {
          console.error('[OTM] parse error:', event.data, e)
        }
      }

      eventSource.onerror = (e) => {
        console.error('[OTM] EventSource error, readyState:', eventSource.readyState, e)
        setOtmLoading(false)
        setOtmScanningSymbol('')
        eventSource.close()
      }
    } catch (error) {
      console.error('OTM Scan error:', error)
      setOtmLoading(false)
    }
  }

  // Keep ref in sync so the interval can always call the latest version
  scanOTMPremiumsRef.current = scanOTMPremiums

  const formatExpiryDate = (dateStr: string) => {
    if (!dateStr) return ''
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div
      className="text-white"
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
        {/* Last scan + next scan countdown */}
        <div className="flex items-center gap-3 ml-auto" style={{ flexShrink: 0 }}>
          {otmLastUpdate && !otmLoading && (
            <span
              style={{
                fontSize: 11,
                color: '#888',
                fontFamily: 'monospace',
                letterSpacing: '0.06em',
              }}
            >
              LAST{' '}
              <span style={{ color: '#ffffff' }}>
                {otmLastUpdate.toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                  timeZone: 'America/Los_Angeles',
                })}{' '}
                PST
              </span>
            </span>
          )}
          {!otmLoading && nextScanIn > 0 && (
            <span
              style={{
                fontSize: 11,
                color: '#888',
                fontFamily: 'monospace',
                letterSpacing: '0.06em',
              }}
            >
              NEXT{' '}
              <span style={{ color: '#00ff00' }}>
                {String(Math.floor(nextScanIn / 60)).padStart(2, '0')}:
                {String(nextScanIn % 60).padStart(2, '0')}
              </span>
            </span>
          )}
        </div>
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

      {/* Results Grid */}
      <div
        ref={scrollContainerRef}
        style={{
          padding: '12px 16px',
          overflowX: 'auto',
          overflowY: 'auto',
          maxHeight: 'calc(100vh - 210px)',
        }}
      >
        {/* Empty states */}
        {otmResults.length === 0 && !otmLoading && !otmLastUpdate && (
          <div
            style={{
              textAlign: 'center',
              padding: '40px 0',
              color: '#c0c0c8',
              fontSize: 14,
              fontFamily: 'monospace',
            }}
          >
            CLICK SCAN ALL TO BEGIN
          </div>
        )}
        {otmResults.length === 0 && !otmLoading && otmLastUpdate && (
          <div
            style={{
              textAlign: 'center',
              padding: '40px 0',
              color: '#c0c0c8',
              fontSize: 14,
              fontFamily: 'monospace',
            }}
          >
            NO IMBALANCES FOUND
          </div>
        )}
        {otmResults.length === 0 && otmLoading && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <RefreshCw
              style={{ width: 20, height: 20, color: '#f97316', display: 'inline-block' }}
              className="animate-spin"
            />
            <div style={{ color: '#d0d0e0', fontSize: 13, marginTop: 10, fontFamily: 'monospace' }}>
              SCANNING {otmScanProgress.current} / {otmScanProgress.total}
              {otmScanningSymbol ? ` · ${otmScanningSymbol}` : ''}
            </div>
          </div>
        )}

        {/* 5-column card grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 360px)',
            gap: 8,
            minWidth: 1840,
          }}
        >
          {otmResults.map((result, idx) => {
            const isBull = result.expensiveSide === 'CALLS'
            const sevColor =
              result.imbalanceSeverity === 'EXTREME'
                ? '#ff2222'
                : result.imbalanceSeverity === 'HIGH'
                  ? '#00ff00'
                  : '#ffffff'
            const accentRgb =
              result.imbalanceSeverity === 'EXTREME'
                ? '255,34,34'
                : result.imbalanceSeverity === 'HIGH'
                  ? '0,255,0'
                  : '255,255,255'
            const biasColor = isBull ? '#3db86a' : '#cc4444'
            return (
              <div
                key={`${result.symbol}-${idx}`}
                style={{
                  background: '#000000',
                  border: `1px solid rgba(${accentRgb},0.45)`,
                  borderRadius: 8,
                  fontFamily: 'monospace',
                  boxShadow: `0 2px 16px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)`,
                  position: 'relative' as const,
                }}
              >
                {/* Glossy top sheen */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 36,
                    background:
                      'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 100%)',
                    pointerEvents: 'none',
                    borderRadius: '8px 8px 0 0',
                  }}
                />

                {/* Header */}
                <div
                  style={{
                    padding: '11px 13px 10px',
                    borderBottom: `1px solid rgba(${accentRgb},0.25)`,
                    background: `linear-gradient(135deg, rgba(${accentRgb},0.12) 0%, rgba(${accentRgb},0.04) 100%)`,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 27,
                          fontWeight: 900,
                          color: '#ffffff',
                          letterSpacing: '0.05em',
                          lineHeight: 1,
                        }}
                      >
                        {result.symbol}
                      </div>
                      <div
                        style={{ fontSize: 18, color: '#ffffff', fontWeight: 700, marginTop: 4 }}
                      >
                        ${result.stockPrice.toFixed(2)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 800,
                          color: sevColor,
                          letterSpacing: '0.12em',
                          border: `1px solid rgba(${accentRgb},0.5)`,
                          borderRadius: 3,
                          padding: '3px 8px',
                          display: 'inline-block',
                          background: `rgba(${accentRgb},0.1)`,
                        }}
                      >
                        {result.imbalanceSeverity}
                      </div>
                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 800,
                          color: biasColor,
                          marginTop: 4,
                          letterSpacing: '0.05em',
                        }}
                      >
                        {isBull ? '▲ BULL' : '▼ BEAR'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Strikes */}
                <div
                  style={{
                    padding: '8px 13px',
                    borderBottom: `1px solid rgba(255,255,255,0.05)`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'rgba(0,0,0,0.2)',
                  }}
                >
                  <span
                    style={{
                      fontSize: 15,
                      color: '#ffffff',
                      fontWeight: 700,
                      letterSpacing: '0.1em',
                    }}
                  >
                    STRIKES
                  </span>
                  <span style={{ fontSize: 19, fontWeight: 800, color: '#ffffff' }}>
                    ${result.putStrike}/<wbr />${result.callStrike}
                  </span>
                  <span style={{ fontSize: 15, color: '#ffffff', fontWeight: 600 }}>
                    {result.strikeSpacing}spc
                  </span>
                </div>

                {/* Put / Call */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                  <div
                    style={{
                      padding: '10px 13px',
                      borderRight: `1px solid rgba(255,255,255,0.05)`,
                      background: 'rgba(180,30,30,0.07)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 15,
                        color: '#ff2222',
                        fontWeight: 800,
                        letterSpacing: '0.1em',
                        marginBottom: 4,
                      }}
                    >
                      PUT ${result.putStrike}
                    </div>
                    <div
                      style={{
                        fontSize: 25,
                        fontWeight: 900,
                        color: '#ff2222',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      ${result.putMid.toFixed(2)}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: '#ffffff',
                        marginTop: 4,
                        letterSpacing: '0.05em',
                      }}
                    >
                      <span style={{ color: '#00ff00', fontWeight: 700 }}>BID</span>{' '}
                      {result.putBid.toFixed(2)} /{' '}
                      <span style={{ color: '#ff2222', fontWeight: 700 }}>ASK</span>{' '}
                      {result.putAsk.toFixed(2)}
                    </div>
                    <div style={{ fontSize: 12, color: '#ffffff' }}>
                      spr {result.putSpreadPercent.toFixed(1)}%
                    </div>
                  </div>
                  <div style={{ padding: '10px 13px', background: 'rgba(30,180,80,0.07)' }}>
                    <div
                      style={{
                        fontSize: 15,
                        color: '#00ff00',
                        fontWeight: 800,
                        letterSpacing: '0.1em',
                        marginBottom: 4,
                      }}
                    >
                      CALL ${result.callStrike}
                    </div>
                    <div
                      style={{
                        fontSize: 25,
                        fontWeight: 900,
                        color: '#00ff00',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      ${result.callMid.toFixed(2)}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: '#ffffff',
                        marginTop: 4,
                        letterSpacing: '0.05em',
                      }}
                    >
                      <span style={{ color: '#00ff00', fontWeight: 700 }}>BID</span>{' '}
                      {result.callBid.toFixed(2)} /{' '}
                      <span style={{ color: '#ff2222', fontWeight: 700 }}>ASK</span>{' '}
                      {result.callAsk.toFixed(2)}
                    </div>
                    <div style={{ fontSize: 12, color: '#ffffff' }}>
                      spr {result.callSpreadPercent.toFixed(1)}%
                    </div>
                  </div>
                </div>

                {/* Expiry + Scan Time */}
                <div
                  style={{
                    padding: '5px 13px',
                    background: 'rgba(0,0,0,0.15)',
                    borderTop: '1px solid rgba(255,255,255,0.04)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#ffffff' }}>
                    <span style={{ color: '#ffffff', letterSpacing: '0.08em', fontWeight: 700 }}>
                      EXP
                    </span>{' '}
                    <span style={{ color: '#ffffff' }}>
                      {result.expiry ? formatExpiryDate(result.expiry) : '—'}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#ffffff' }}>
                    <span style={{ color: '#ffffff', letterSpacing: '0.08em', fontWeight: 700 }}>
                      SCANNED
                    </span>{' '}
                    <span style={{ color: '#ffffff' }}>{result.lastSeenTime || '—'}</span>
                  </div>
                </div>

                {/* Footer */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '9px 13px',
                    borderTop: `1px solid rgba(255,255,255,0.05)`,
                    background: 'rgba(0,0,0,0.25)',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        color: '#ffffff',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                      }}
                    >
                      DIFF
                    </div>
                    <div
                      style={{
                        fontSize: 21,
                        fontWeight: 900,
                        color: result.premiumDifference > 0 ? '#00ff00' : '#ff2222',
                      }}
                    >
                      ${Math.abs(result.premiumDifference).toFixed(2)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div
                      style={{
                        fontSize: 13,
                        color: '#ffffff',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                      }}
                    >
                      IMBALANCE
                    </div>
                    <div
                      style={{
                        fontSize: 30,
                        fontWeight: 900,
                        color: sevColor,
                        letterSpacing: '-0.02em',
                      }}
                    >
                      {Math.abs(result.imbalancePercent).toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
