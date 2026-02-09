'use client';

import { useEffect, useState } from 'react';
import './AbstractCube.css';
import { polygonRateLimiter } from '@/lib/polygonRateLimiter';

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

interface MarketStock {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
}

interface NewsItem {
  time: string;
  headline: string;
}

interface RSScreenerData {
  symbol: string;
  percentile: number;
  price: number;
  change: number;
  status: string;
}

export default function AbstractCube() {
  const [time, setTime] = useState(new Date());
  const [marketData, setMarketData] = useState<MarketStock[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [heatmapData, setHeatmapData] = useState<[string, number][]>([]);
  const [rsScreenerData, setRsScreenerData] = useState<RSScreenerData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchMarketData();
    fetchNews();
    fetchRSScreenerData();
    
    // Refresh market data every 30 seconds
    const interval = setInterval(() => {
      fetchMarketData();
      fetchRSScreenerData();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const fetchMarketData = async () => {
    try {
      const tickers = ['SPY', 'QQQ', 'AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 
                       'META', 'NFLX', 'AMD', 'INTC', 'CRM', 'ORCL', 'UBER', 'DIS', 'BA', 'JPM'];
      
      const fetchWithRetry = async (ticker: string, retries = 2) => {
        try {
          const prevDayUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`;
          const data = await polygonRateLimiter.fetch(prevDayUrl);
          
          if (data.results && data.results.length > 0) {
            const result = data.results[0];
            const close = result.c || 0;
            const open = result.o || close;
            const change = close - open;
            const changePercent = open !== 0 ? (change / open) * 100 : 0;
            
            return {
              symbol: ticker,
              price: close,
              change: change,
              changePercent: changePercent
            };
          }
          return null;
        } catch (error) {
          console.warn(`Failed to fetch ${ticker}:`, error);
          return null;
        }
      };
      
      const promises = tickers.map(ticker => fetchWithRetry(ticker));
      const results = await Promise.all(promises);
      const validResults = results.filter((r): r is MarketStock => r !== null);
      
      if (validResults.length > 0) {
        // Sort by absolute change percent for top movers
        const topMovers = validResults
          .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
          .slice(0, 6);
        
        setMarketData(topMovers);
        
        // Use all valid results for heatmap
        const heatmap = validResults.map(stock => [stock.symbol, stock.changePercent] as [string, number]);
        setHeatmapData(heatmap.slice(0, 12));
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error fetching market data:', error);
      setLoading(false);
    }
  };

  const fetchNews = async () => {
    try {
      const newsUrl = `https://api.polygon.io/v2/reference/news?limit=4&apiKey=${POLYGON_API_KEY}`;
      const response = await fetch(newsUrl);
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        const newsItems = data.results.map((item: any) => {
          const publishedTime = new Date(item.published_utc);
          const now = new Date();
          const diffMs = now.getTime() - publishedTime.getTime();
          const diffMins = Math.floor(diffMs / 60000);
          const diffHours = Math.floor(diffMins / 60);
          
          let timeAgo = '';
          if (diffMins < 60) {
            timeAgo = `${diffMins}m ago`;
          } else if (diffHours < 24) {
            timeAgo = `${diffHours}h ago`;
          } else {
            const diffDays = Math.floor(diffHours / 24);
            timeAgo = `${diffDays}d ago`;
          }
          
          return {
            time: timeAgo,
            headline: item.title
          };
        });
        
        setNews(newsItems);
      }
    } catch (error) {
      console.error('Error fetching news:', error);
    }
  };

  const fetchRSScreenerData = async () => {
    try {
      const tickers = ['SPY', 'QQQ', 'AAPL', 'TSLA', 'NVDA', 'MSFT'];
      
      // Get 52-week range for each ticker
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const startDate = oneYearAgo.toISOString().split('T')[0];
      const endDate = new Date().toISOString().split('T')[0];
      
      const fetchRSWithRetry = async (ticker: string, retries = 2) => {
        for (let i = 0; i < retries; i++) {
          try {
            const histUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${startDate}/${endDate}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`;
            const data = await polygonRateLimiter.fetch(histUrl);
            
            if (data.results && data.results.length > 0) {
              const prices = data.results.map((r: any) => r.c);
              const high52w = Math.max(...prices);
              const low52w = Math.min(...prices);
              const currentPrice = prices[prices.length - 1];
              
              // Calculate percentile within 52-week range
              const percentile = ((currentPrice - low52w) / (high52w - low52w)) * 100;
              
              // Calculate change
              const prevPrice = prices[prices.length - 2] || currentPrice;
              const change = ((currentPrice - prevPrice) / prevPrice) * 100;
              
              let status = 'Neutral';
              if (percentile >= 95) status = '52W High';
              else if (percentile >= 75) status = 'Strong';
              else if (percentile <= 25) status = 'Weak';
              
              return {
                symbol: ticker,
                percentile: Math.round(percentile),
                price: currentPrice,
                change: change,
                status: status
              };
            }
            return null;
          } catch (error) {
            if (i === retries - 1) {
              console.warn(`Failed to fetch RS data for ${ticker} after ${retries} attempts`);
              return null;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        return null;
      };
      
      const rsPromises = tickers.map(ticker => fetchRSWithRetry(ticker));
      const results = await Promise.all(rsPromises);
      const validResults = results.filter((r): r is RSScreenerData => r !== null);
      
      if (validResults.length > 0) {
        setRsScreenerData(validResults.sort((a, b) => b.percentile - a.percentile));
      }
    } catch (error) {
      console.error('Error fetching RS screener data:', error);
    }
  };

  const getHeatColor = (value: number) => {
    if (value > 2) return 'rgba(34, 197, 94, 0.8)';
    if (value > 0) return 'rgba(34, 197, 94, 0.4)';
    if (value > -2) return 'rgba(239, 68, 68, 0.4)';
    return 'rgba(239, 68, 68, 0.8)';
  };

  if (loading) {
    return (
      <div className="financial-dashboard">
        <div className="dashboard-header">
          <div className="header-title">
            <span className="title-text">Loading Market Data...</span>
          </div>
        </div>
      </div>
    );
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
          {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Top Movers */}
        <div className="widget widget-movers">
          <div className="widget-header">
            <svg className="widget-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0l8 8-2.5 2.5L10 7v9H6V7L2.5 10.5 0 8z"/>
            </svg>
            <span className="widget-title">Top Movers</span>
          </div>
          <div className="movers-list">
            {marketData.map((stock, idx) => (
              <div key={idx} className="mover-item">
                <div className="mover-symbol">{stock.symbol}</div>
                <div className="mover-price">${stock.price.toFixed(2)}</div>
                <div className={`mover-change ${stock.change > 0 ? 'positive' : 'negative'}`}>
                  {stock.change > 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Market Heatmap */}
        <div className="widget widget-heatmap">
          <div className="widget-header">
            <svg className="widget-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M0 0h7v7H0zM9 0h7v7H9zM0 9h7v7H0zM9 9h7v7H9z"/>
            </svg>
            <span className="widget-title">Market Heatmap</span>
          </div>
          <div className="heatmap-grid">
            {heatmapData.map(([symbol, value], idx) => (
              <div
                key={idx}
                className="heatmap-cell"
                style={{ backgroundColor: getHeatColor(value as number) }}
              >
                <div className="heatmap-symbol">{symbol}</div>
                <div className="heatmap-value">
                  {value as number > 0 ? '+' : ''}{(value as number).toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* News Feed */}
        <div className="widget widget-news">
          <div className="widget-header">
            <svg className="widget-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M0 0h16v3H0zM0 5h11v2H0zM0 9h11v2H0zM0 13h16v3H0z"/>
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

        {/* RS Screener - 52 Week Highs */}
        <div className="widget widget-rs-screener">
          <div className="widget-header">
            <svg className="widget-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M0 15h2V8H0zM4 15h2V3H4zM8 15h2V0H8zM12 15h2V5h-2z"/>
            </svg>
            <span className="widget-title">52 Week Analysis</span>
          </div>
          <div className="rs-screener-list">
            {rsScreenerData.map((stock, idx) => (
              <div key={idx} className="rs-screener-item">
                <div className="rs-symbol">{stock.symbol}</div>
                <div className="rs-percentile">
                  <div className="rs-bar-bg">
                    <div 
                      className="rs-bar-fill" 
                      style={{ 
                        width: `${stock.percentile}%`,
                        background: stock.percentile >= 90 ? '#22c55e' : stock.percentile >= 75 ? '#3b82f6' : stock.percentile <= 25 ? '#ef4444' : '#6b7280'
                      }}
                    ></div>
                  </div>
                  <span className="rs-percentile-text">{stock.percentile.toFixed(0)}%</span>
                </div>
                <div className={`rs-status ${stock.status === '52W High' ? 'high' : stock.status === 'Strong' ? 'strong' : stock.status === 'Weak' ? 'weak' : 'neutral'}`}>
                  {stock.status}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
