'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

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

const BREAKING_DURATION_MS = 60 * 1000 // show breaking news for 1 minute

interface TickerData {
  symbol: string
  change: number
}

interface BreakingArticle {
  id: string
  title: string
  urgency: number
  category: string
  tickers: string[]
}

export default function TickerScroller() {
  const pathname = usePathname()
  const [tickerData, setTickerData] = useState<TickerData[]>(
    TICKER_SYMBOLS.map((s) => ({ symbol: s, change: 0 }))
  )
  const [isBlindMe, setIsBlindMe] = useState(false)
  const prevCloseRef = useRef<Record<string, number>>({})

  // ── Breaking news state ────────────────────────────────────────────────────
  const [breakingNews, setBreakingNews] = useState<BreakingArticle[]>([])
  const [showBreaking, setShowBreaking] = useState(false)
  const seenBreakingIds = useRef<Set<string>>(new Set())
  const breakingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsBlindMe(document.body.classList.contains('theme-toned'))
    })
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    setIsBlindMe(document.body.classList.contains('theme-toned'))
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    // Skip bulk REST fetch on analysis-suite — no multi-stock scans needed there
    if (pathname === '/analysis-suite') return

    let unsubWS: (() => void) | null = null

    // ── 1. Seed prev-day closes once via REST ──
    const seedPrevCloses = async () => {
      try {
        const apiKey = process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''
        // Single snapshot call returns current price + prev close for all tickers at once
        const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${TICKER_SYMBOLS.join(',')}&apiKey=${apiKey}`
        const result = await polygonRateLimiter.fetch(url)
        if (!result?.tickers) return
        for (const t of result.tickers) {
          const prevClose = t.day?.prevC ?? t.prevDay?.c
          const lastPrice = t.lastTrade?.p ?? t.lastQuote?.P ?? prevClose
          if (!prevClose || !lastPrice) continue
          prevCloseRef.current[t.ticker] = prevClose
          const changePercent = ((lastPrice - prevClose) / prevClose) * 100
          setTickerData((prev) =>
            prev.map((d) => (d.symbol === t.ticker ? { ...d, change: changePercent } : d))
          )
        }
      } catch {
        /* singleton will keep retrying */
      }
    }

    // ── 2. Subscribe to shared singleton for real-time AM.* updates ──
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

  // ── Breaking news polling ─────────────────────────────────────────────────
  const checkBreakingNews = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '50', _t: Date.now().toString() })
      const res = await fetch(`/api/news?${params}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      })
      const data = await res.json()
      if (!data.success) return

      const breaking: BreakingArticle[] = (data.articles as BreakingArticle[]).filter(
        (a) => a.urgency >= 0.65 || a.category === 'breaking'
      )

      // Only trigger for articles we haven't shown yet
      const newBreaking = breaking.filter((a) => !seenBreakingIds.current.has(a.id))
      if (newBreaking.length > 0) {
        newBreaking.forEach((a) => seenBreakingIds.current.add(a.id))
        setBreakingNews(newBreaking)
        setShowBreaking(true)

        if (breakingTimerRef.current) clearTimeout(breakingTimerRef.current)
        breakingTimerRef.current = setTimeout(() => {
          setShowBreaking(false)
        }, BREAKING_DURATION_MS)
      }
    } catch {
      /* silent — breaking news is non-critical */
    }
  }, [])

  useEffect(() => {
    checkBreakingNews()
    const id = setInterval(checkBreakingNews, 5 * 60 * 1000) // re-check every 5 min
    return () => {
      clearInterval(id)
      if (breakingTimerRef.current) clearTimeout(breakingTimerRef.current)
    }
  }, [checkBreakingNews])

  return (
    <>
      <div
        className="ticker-scroller-container"
        style={{
          width: '100%',
          maxWidth: '100vw',
          background: showBreaking && breakingNews.length > 0
            ? 'linear-gradient(180deg, #1a0000 0%, #0d0000 100%)'
            : isBlindMe
              ? 'linear-gradient(180deg, #c8a878 0%, #b89660 100%)'
              : 'linear-gradient(180deg, #0a0a0a 0%, #000000 100%)',
          borderBottom: showBreaking && breakingNews.length > 0
            ? '1px solid rgba(255, 0, 0, 0.5)'
            : isBlindMe
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
        {showBreaking && breakingNews.length > 0 ? (
          /* ── BREAKING NEWS MODE ── */
          <>
            {/* Pinned "BREAKING" badge */}
            <div
              style={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '0 10px',
                height: '100%',
                background: '#cc0000',
                borderRight: '1px solid rgba(255,80,80,0.5)',
                whiteSpace: 'nowrap',
                fontSize: '11px',
                fontWeight: '900',
                letterSpacing: '1px',
                color: '#ffffff',
                zIndex: 1,
              }}
            >
              🔴 BREAKING
            </div>
            {/* Scrolling headlines */}
            <div
              style={{
                display: 'flex',
                animation: 'scroll-breaking 80s linear infinite',
                width: 'fit-content',
                alignItems: 'center',
                height: '100%',
              }}
            >
              {[...breakingNews, ...breakingNews, ...breakingNews].map((article, index) => (
                <div
                  key={`${article.id}-${index}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '0 36px',
                    whiteSpace: 'nowrap',
                    fontSize: '13px',
                    fontWeight: '600',
                    letterSpacing: '0.3px',
                    color: isBlindMe ? '#ffffff' : '#ffcccc',
                    background: isBlindMe ? 'rgba(0,0,0,0.75)' : 'none',
                    borderRadius: isBlindMe ? '4px' : '0',
                    margin: isBlindMe ? '0 8px' : '0',
                  }}
                >
                  {article.tickers.length > 0 && (
                    <span style={{ color: isBlindMe ? '#ff4444' : '#ff6666', fontWeight: '800', fontSize: '12px' }}>
                      [{article.tickers.slice(0, 3).join(', ')}]
                    </span>
                  )}
                  <span>{article.title}</span>
                  <span style={{ color: isBlindMe ? 'rgba(255,80,80,0.7)' : 'rgba(255,100,100,0.4)', fontSize: '18px' }}>·</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          /* ── NORMAL TICKER MODE ── */
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
        )}

        <style jsx>{`
          @keyframes scroll {
            0% {
              transform: translateX(0);
            }
            100% {
              transform: translateX(-33.33%);
            }
          }
          @keyframes scroll-breaking {
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
