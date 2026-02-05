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
        const fetchTickerData = async () => {
            try {
                const symbols = ['SPY', 'QQQ', 'AAPL', 'TSLA', 'NVDA', 'AMZN', 'MSFT', 'AVGO', 'AMD', 'BABA', 'JPM', 'CAT', 'BA'];
                const promises = symbols.map(async (symbol) => {
                    try {
                        // Get last 5 days to ensure we have at least 2 trading days
                        const today = new Date();
                        const fiveDaysAgo = new Date(today);
                        fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

                        const todayStr = today.toISOString().split('T')[0];
                        const fiveDaysAgoStr = fiveDaysAgo.toISOString().split('T')[0];

                        // Get daily bars
                        const dailyUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fiveDaysAgoStr}/${todayStr}?adjusted=true&sort=desc&apiKey=kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf`;
                        const response = await fetch(dailyUrl);
                        const result = await response.json();

                        if (!response.ok || !result?.results || result.results.length < 2) {
                            return { symbol, change: 0 };
                        }

                        // results[0] is most recent day, results[1] is previous trading day
                        const todayClose = result.results[0].c;
                        const previousClose = result.results[1].c;

                        // Calculate percentage change
                        const changePercent = ((todayClose - previousClose) / previousClose) * 100;

                        return { symbol, change: changePercent };
                    } catch (error) {
                        return { symbol, change: 0 };
                    }
                });

                const results = await Promise.all(promises);
                setTickerData(results);
            } catch (error) {
                console.error('Error fetching ticker data:', error);
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
