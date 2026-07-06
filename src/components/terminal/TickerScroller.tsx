'use client'

import { useEffect, useRef, useState } from 'react'

import { usePathname } from 'next/navigation'

import { polygonRateLimiter } from '@/lib/polygonRateLimiter'
import { polygonStocksWS } from '@/lib/polygonStocksWS'

const TICKER_SYMBOLS = [
  'SPY',
  'QQQ',
  'AAPL',
  'TSLA',
  'NVDA',
  'AMZN',
  'MSFT',
  'AVGO',
  'AMD',
  'BABA',
  'JPM',
  'CAT',
  'BA',
]

interface TickerData {
  symbol: string
  change: number
}

export default function TickerScroller() {
  const pathname = usePathname()
  const [tickerData, setTickerData] = useState<TickerData[]>(
    TICKER_SYMBOLS.map((s) => ({ symbol: s, change: 0 }))
  )
  const [isBlindMe, setIsBlindMe] = useState(false)
  const prevCloseRef = useRef<Record<string, number>>({})


  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsBlindMe(document.body.classList.contains('theme-toned'))
    })
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    setIsBlindMe(document.body.classList.contains('theme-toned'))
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    // Skip bulk REST fetch on analysis-suite â€” no multi-stock scans needed there
    if (pathname === '/analysis-suite') return

    let unsubWS: (() => void) | null = null

    // â”€â”€ 1. Seed prev-day closes once via REST â”€â”€
    const seedPrevCloses = async () => {
      try {
        const apiKey = process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''
        // Single snapshot call returns current price + prev close for all tickers at once
        const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${TICKER_SYMBOLS.join(',')}&apiKey=${apiKey}`
        const result = await polygonRateLimiter.fetch(url)
        if (!result?.tickers) return
        for (const t of result.tickers) {
          // prevDay.c = last trading session's close (always populated even on weekends/holidays)
          const prevClose = t.prevDay?.c ?? t.day?.prevC
          // lastTrade.p = most recent actual trade price regardless of session
          const lastPrice = t.lastTrade?.p ?? t.lastQuote?.P ?? t.day?.c
          if (!prevClose) continue

          if (lastPrice && lastPrice !== prevClose) {
            // Active session or after-hours: show change vs last close
            prevCloseRef.current[t.ticker] = prevClose
            const changePercent = ((lastPrice - prevClose) / prevClose) * 100
            setTickerData((prev) =>
              prev.map((d) => (d.symbol === t.ticker ? { ...d, change: changePercent } : d))
            )
          } else {
            // Weekend/holiday: no new trading â€” show last trading day's own change (openâ†’close)
            const lastDayOpen = t.prevDay?.o
            const lastDayClose = t.prevDay?.c
            if (lastDayOpen && lastDayClose) {
              prevCloseRef.current[t.ticker] = prevClose
              const changePercent = ((lastDayClose - lastDayOpen) / lastDayOpen) * 100
              setTickerData((prev) =>
                prev.map((d) => (d.symbol === t.ticker ? { ...d, change: changePercent } : d))
              )
            }
          }
        }
      } catch {
        /* singleton will keep retrying */
      }
    }

    // â”€â”€ 2. Subscribe to shared singleton for real-time AM.* updates â”€â”€
    seedPrevCloses().then(() => {
      if (!polygonStocksWS) return
      unsubWS = polygonStocksWS.subscribe('ticker-scroller', {
        amSymbols: TICKER_SYMBOLS,
        onAM: (msg) => {
          const prevClose = prevCloseRef.current[msg.sym]
          if (prevClose) {
            const changePercent = ((msg.c - prevClose) / prevClose) * 100
            setTickerData((prev) =>
              prev.map((t) => (t.symbol === msg.sym ? { ...t, change: changePercent } : t))
            )
          }
        },
      })
    })

    return () => {
      if (unsubWS) unsubWS()
    }
  }, [])


  return (
    <>
      <div
        className="ticker-scroller-container"
        style={{
          width: '100%',
          maxWidth: '100vw',
          background: isBlindMe
            ? 'linear-gradient(180deg, #c8a878 0%, #b89660 100%)'
            : 'linear-gradient(180deg, #0a0a0a 0%, #000000 100%)',
          borderBottom: isBlindMe
            ? '1px solid #8a6838'
            : '1px solid rgba(255, 165, 0, 0.2)',
          overflow: 'hidden',
          position: 'fixed',
          top: '90px',
          left: 0,
          right: 0,
          height: '29px',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          overflowX: 'hidden',
          overflowY: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            animation: 'scroll 30s linear infinite',
            width: 'fit-content',
            alignItems: 'center',
            height: '100%',
          }}
        >
          {/* Duplicate the ticker data for seamless scrolling */}
          {[...tickerData, ...tickerData, ...tickerData].map((ticker, index) => (
            <div
              key={`${ticker.symbol}-${index}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '0 32px',
                whiteSpace: 'nowrap',
                fontSize: '14px',
                fontWeight: '700',
                letterSpacing: '0.5px',
              }}
            >
              <span style={{
                color: isBlindMe ? '#ffffff' : '#FFFFFF',
                background: isBlindMe ? 'rgba(0,0,0,0.72)' : 'none',
                borderRadius: isBlindMe ? '3px' : '0',
                padding: isBlindMe ? '1px 5px' : '0',
              }}>{ticker.symbol}</span>
              <span
                style={{
                  color: ticker.change >= 0 ? (isBlindMe ? '#00cc44' : '#00ff00') : (isBlindMe ? '#ff2222' : '#ff0000'),
                  fontWeight: '700',
                  background: isBlindMe ? 'rgba(0,0,0,0.72)' : 'none',
                  borderRadius: isBlindMe ? '3px' : '0',
                  padding: isBlindMe ? '1px 5px' : '0',
                }}
              >
                {ticker.change >= 0 ? '+' : ''}
                {ticker.change.toFixed(2)}%
              </span>
            </div>
          ))}
        </div>

        <style jsx>{`
          @keyframes scroll {
            0% {
              transform: translateX(0);
            }
            100% {
              transform: translateX(-33.33%);
            }
          }
        `}</style>
      </div>
    </>
  )
}