'use client';

import { useState, useEffect, useRef } from 'react';
import { polygonRateLimiter } from '@/lib/polygonRateLimiter';
import { polygonStocksWS } from '@/lib/polygonStocksWS';

const TICKER_SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'TSLA', 'NVDA', 'AMZN', 'MSFT', 'AVGO', 'AMD', 'BABA', 'JPM', 'CAT', 'BA'];

interface TickerData {
    symbol: string;
    change: number;
}

export default function TickerScroller() {
    const [tickerData, setTickerData] = useState<TickerData[]>(
        TICKER_SYMBOLS.map(s => ({ symbol: s, change: 0 }))
    );
    const prevCloseRef = useRef<Record<string, number>>({});

    useEffect(() => {
        let unsubWS: (() => void) | null = null;

        // ── 1. Seed prev-day closes once via REST ──
        const seedPrevCloses = async () => {
            const today = new Date();
            const fiveDaysAgo = new Date(today);
            fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
            const todayStr = today.toISOString().split('T')[0];
            const fiveDaysAgoStr = fiveDaysAgo.toISOString().split('T')[0];

            await Promise.all(TICKER_SYMBOLS.map(async (symbol) => {
                try {
                    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fiveDaysAgoStr}/${todayStr}?adjusted=true&sort=desc&apiKey=kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf`;
                    const result = await polygonRateLimiter.fetch(url);
                    if (result?.results?.length >= 2) {
                        prevCloseRef.current[symbol] = result.results[1].c;
                        const changePercent = ((result.results[0].c - result.results[1].c) / result.results[1].c) * 100;
                        setTickerData(prev => prev.map(t => t.symbol === symbol ? { ...t, change: changePercent } : t));
                    }
                } catch { /* singleton will keep retrying */ }
            }));
        };

        // ── 2. Subscribe to shared singleton for real-time AM.* updates ──
        seedPrevCloses().then(() => {
            if (!polygonStocksWS) return;
            unsubWS = polygonStocksWS.subscribe('ticker-scroller', {
                amSymbols: TICKER_SYMBOLS,
                onAM: (msg) => {
                    const prevClose = prevCloseRef.current[msg.sym];
                    if (prevClose) {
                        const changePercent = ((msg.c - prevClose) / prevClose) * 100;
                        setTickerData(prev => prev.map(t =>
                            t.symbol === msg.sym ? { ...t, change: changePercent } : t
                        ));
                    }
                },
            });
        });

        return () => {
            if (unsubWS) unsubWS();
        };
    }, []);

    return (
        <>
            <div className="ticker-scroller-container" style={{
                width: '100%',
                maxWidth: '100vw',
                background: 'linear-gradient(180deg, #0a0a0a 0%, #000000 100%)',
                borderBottom: '1px solid rgba(255, 165, 0, 0.2)',
                overflow: 'hidden',
                position: 'relative',
                height: '29px',
                zIndex: 10000,
                display: 'flex',
                alignItems: 'center',
                overflowX: 'hidden',
                overflowY: 'hidden'
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
