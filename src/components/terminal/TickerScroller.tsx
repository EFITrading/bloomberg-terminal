'use client';

import { useState, useEffect } from 'react';

interface TickerData {
    symbol: string;
    change: number;
}

export default function TickerScroller() {
    const [tickerData, setTickerData] = useState<TickerData[]>([
        { symbol: 'SPY', change: 0 },
        { symbol: 'QQQ', change: 0 },
        { symbol: 'AAPL', change: 0 },
        { symbol: 'TSLA', change: 0 },
        { symbol: 'NVDA', change: 0 },
        { symbol: 'AMZN', change: 0 },
        { symbol: 'MSFT', change: 0 },
        { symbol: 'AVGO', change: 0 },
        { symbol: 'AMD', change: 0 },
        { symbol: 'BABA', change: 0 },
        { symbol: 'JPM', change: 0 },
        { symbol: 'CAT', change: 0 },
        { symbol: 'BA', change: 0 }
    ]);

    useEffect(() => {
        // Fetch real ticker data using same logic as EFICharting
        const fetchTickerData = async () => {
            try {
                const symbols = ['SPY', 'QQQ', 'AAPL', 'TSLA', 'NVDA', 'AMZN', 'MSFT', 'AVGO', 'AMD', 'BABA', 'JPM', 'CAT', 'BA'];
                const promises = symbols.map(async (symbol) => {
                    try {
                        // Use exact same logic as EFICharting - minute bars for live price
                        const today = new Date();
                        const yesterday = new Date(today);
                        yesterday.setDate(yesterday.getDate() - 1);

                        const todayStr = today.toISOString().split('T')[0];
                        const yesterdayStr = yesterday.toISOString().split('T')[0];

                        // Get most recent minute bar (same as chart)
                        const recentUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/minute/${yesterdayStr}/${todayStr}?adjusted=true&sort=desc&limit=1&apiKey=kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf`;
                        const response = await fetch(recentUrl);
                        const result = await response.json();

                        if (response.ok && result.status === 'OK' && result.results && result.results.length > 0) {
                            const livePrice = result.results[0].c;

                            // Get previous day's close (same as chart)
                            const prevDayUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf`;
                            const prevResponse = await fetch(prevDayUrl);

                            if (prevResponse.ok) {
                                const prevResult = await prevResponse.json();
                                if (prevResult?.results && prevResult.results.length > 0) {
                                    const previousClose = prevResult.results[0].c;
                                    const change = livePrice - previousClose;
                                    const changePercent = (change / previousClose) * 100;
                                    return { symbol, change: changePercent };
                                }
                            }
                        }

                        // Fallback to previous close if no live data
                        const fallbackUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf`;
                        const fallbackResponse = await fetch(fallbackUrl);
                        const fallbackResult = await fallbackResponse.json();

                        if (fallbackResult.status === 'OK' && fallbackResult.results?.[0]) {
                            return { symbol, change: 0 };
                        }

                        return { symbol, change: 0 };
                    } catch (error) {
                        return { symbol, change: 0 };
                    }
                });

                const results = await Promise.all(promises);
                setTickerData(results);
            } catch (error) {
                // Silent error handling
            }
        };

        fetchTickerData();
        const interval = setInterval(fetchTickerData, 60000); // Update every minute

        return () => clearInterval(interval);
    }, []);

    return (
        <>
            <div className="ticker-scroller-container" style={{
                width: '100%',
                background: 'linear-gradient(180deg, #0a0a0a 0%, #000000 100%)',
                borderBottom: '1px solid rgba(255, 165, 0, 0.2)',
                overflow: 'hidden',
                position: 'relative',
                height: '29px',
                zIndex: 10000,
                display: 'flex',
                alignItems: 'center'
            }}>

                <div style={{
                    display: 'flex',
                    animation: 'scroll 30s linear infinite',
                    width: 'fit-content',
                    alignItems: 'center',
                    height: '100%'
                }}>
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
                                letterSpacing: '0.5px'
                            }}
                        >
                            <span style={{ color: '#FFFFFF' }}>
                                {ticker.symbol}
                            </span>
                            <span style={{
                                color: ticker.change >= 0 ? '#00ff00' : '#ff0000',
                                fontWeight: '600'
                            }}>
                                {ticker.change >= 0 ? '+' : ''}{ticker.change.toFixed(2)}%
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
    );
}
