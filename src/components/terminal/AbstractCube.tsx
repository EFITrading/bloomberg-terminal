'use client'

import { useEffect, useRef, useState } from 'react'

import { polygonRateLimiter } from '@/lib/polygonRateLimiter'
import { polygonStocksWS } from '@/lib/polygonStocksWS'

import './AbstractCube.css'

const POLYGON_API_KEY = process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''

interface MarketStock {
  symbol: string
  price: number
  change: number
  changePercent: number
}

interface NewsItem {
  time: string
  headline: string
}

export default function AbstractCube() {
  const [time, setTime] = useState(new Date())
  const [marketData, setMarketData] = useState<MarketStock[]>([])
  const [news, setNews] = useState<NewsItem[]>([])
  const [heatmapData, setHeatmapData] = useState<[string, number][]>([])
  const [loading, setLoading] = useState(true)
  const prevCloseRef = useRef<Record<string, number>>({})
  const marketDataRef = useRef<MarketStock[]>([])

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    fetchMarketData()
    fetchNews()

    // Refresh every 60 seconds as fallback
    const interval = setInterval(() => {
      fetchMarketData()
      fetchNews()
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  const MARKET_TICKERS = [
    'SPY', 'QQQ', 'AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL', 'AMZN',
    'META', 'NFLX', 'AMD', 'INTC', 'CRM', 'ORCL', 'UBER', 'DIS', 'BA', 'JPM',
  ]

  const applySnapshot = (stocks: MarketStock[]) => {
    if (stocks.length === 0) return
    marketDataRef.current = stocks
    const topMovers = [...stocks]
      .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
      .slice(0, 10)
    setMarketData(topMovers)
    const heatmap = stocks.map((s) => [s.symbol, s.changePercent] as [string, number])
    setHeatmapData(heatmap.slice(0, 16))
  }

  const fetchMarketData = async () => {
    try {
      // Use snapshot endpoint — returns real-time intraday change vs prev close
      const tickerList = MARKET_TICKERS.join(',')
      const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickerList}&apiKey=${POLYGON_API_KEY}`
      const data = await polygonRateLimiter.fetch(url)

      if (data.tickers && data.tickers.length > 0) {
        const stocks: MarketStock[] = data.tickers
          .filter((t: any) => t.day?.c)
          .map((t: any) => {
            const price = t.day.c
            const prevClose = t.prevDay?.c || price
            prevCloseRef.current[t.ticker] = prevClose
            const changePercent = t.todaysChangePerc ?? ((price - prevClose) / prevClose) * 100
            return {
              symbol: t.ticker,
              price,
              change: price - prevClose,
              changePercent,
            }
          })

        applySnapshot(stocks)

        // Subscribe to WebSocket for real-time AM updates
        if (polygonStocksWS) {
          polygonStocksWS.subscribe('abstract-cube', {
            amSymbols: MARKET_TICKERS,
            onAM: (msg) => {
              const prevClose = prevCloseRef.current[msg.sym]
              if (!prevClose) return
              const changePercent = ((msg.c - prevClose) / prevClose) * 100
              setMarketData((prev) => {
                const updated = prev.map((s) =>
                  s.symbol === msg.sym
                    ? { ...s, price: msg.c, change: msg.c - prevClose, changePercent }
                    : s
                )
                return updated
              })
              setHeatmapData((prev) =>
                prev.map(([sym, val]) => (sym === msg.sym ? [sym, changePercent] : [sym, val]))
              )
            },
          })
        }
      }

      setLoading(false)
    } catch (error) {
      console.error('Error fetching market data:', error)
      setLoading(false)
    }
  }

  const fetchNews = async () => {
    try {
      const params = new URLSearchParams({ limit: '50', _t: Date.now().toString() })
      const res = await fetch(`/api/news?${params}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      })
      const data = await res.json()
      if (!data.success) return

      // Same urgency filter as TickerScroller / NewsPanelV2 breaking news
      const breaking = (data.articles as any[]).filter(
        (a) => a.urgency >= 0.65 || a.category === 'breaking'
      )

      const newsItems = (breaking.length > 0 ? breaking : data.articles)
        .slice(0, 5)
        .map((item: any) => {
          const publishedTime = new Date(item.published_utc || item.publishedAt || Date.now())
          const now = new Date()
          const diffMins = Math.floor((now.getTime() - publishedTime.getTime()) / 60000)
          const diffHours = Math.floor(diffMins / 60)
          const timeAgo =
            diffMins < 60
              ? `${diffMins}m ago`
              : diffHours < 24
                ? `${diffHours}h ago`
                : `${Math.floor(diffHours / 24)}d ago`
          return { time: timeAgo, headline: item.title || item.headline }
        })

      setNews(newsItems)
    } catch {
      /* silent */
    }
  }

  const getHeatColor = (value: number) => {
    if (value > 2) return 'linear-gradient(145deg, #16a34a 0%, #15803d 60%, #14532d 100%)'
    if (value > 0) return 'linear-gradient(145deg, #22c55e 0%, #16a34a 60%, #166534 100%)'
    if (value > -2) return 'linear-gradient(145deg, #dc2626 0%, #b91c1c 60%, #7f1d1d 100%)'
    return 'linear-gradient(145deg, #b91c1c 0%, #991b1b 60%, #450a0a 100%)'
  }

  if (loading) {
    return (
      <div className="financial-dashboard">
        <div className="dashboard-header">
          <div className="header-title">
            <span className="title-text">Loading Market Data...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="financial-dashboard">
      {/* Market Overview Header */}
      <div className="dashboard-header">
        <div className="header-title">
          <span className="title-text">Live Market Data</span>
          <span className="live-indicator">
            <span className="live-dot"></span>
            LIVE
          </span>
        </div>
        <div className="market-time">
          {time.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Market Heatmap */}
        <div className="widget widget-heatmap">
          <div className="widget-header">
            <svg
              className="widget-icon"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path d="M0 0h7v7H0zM9 0h7v7H9zM0 9h7v7H0zM9 9h7v7H9z" />
            </svg>
            <span className="widget-title">Market Heatmap</span>
          </div>
          <div className="heatmap-grid">
            {heatmapData.map(([symbol, value], idx) => (
              <div
                key={idx}
                className="heatmap-cell"
                style={{ background: getHeatColor(value as number) }}
              >
                <div className="heatmap-symbol">{symbol}</div>
                <div className="heatmap-value">
                  {(value as number) > 0 ? '+' : ''}
                  {(value as number).toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Breaking News - full width */}
        <div className="widget widget-news widget-news-full">
          <div className="widget-header">
            <svg
              className="widget-icon"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path d="M0 0h16v3H0zM0 5h11v2H0zM0 9h11v2H0zM0 13h16v3H0z" />
            </svg>
            <span className="widget-title">Breaking News</span>
          </div>
          <div className="news-list">
            {news.map((item, idx) => (
              <div key={idx} className="news-item">
                <div className="news-time">{item.time}</div>
                <div className="news-headline">{item.headline}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
