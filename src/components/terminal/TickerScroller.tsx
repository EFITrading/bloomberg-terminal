'use client';

import { useState, useEffect } from 'react';
import { TbSunrise, TbMoon, TbX, TbTrendingUp, TbTrendingDown } from 'react-icons/tb';
import { TOP_1800_SYMBOLS } from '@/lib/Top1000Symbols';

interface TickerData {
    symbol: string;
    change: number;
}

interface MoverData {
    symbol: string;
    price: number;
    change: number;
    changePercent: number;
    hasPreMarket?: boolean;
    hasAfterHours?: boolean;
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

    const [showPreMarket, setShowPreMarket] = useState(false);
    const [showAfterHours, setShowAfterHours] = useState(false);
    const [preMarketMovers, setPreMarketMovers] = useState<{ gainers: MoverData[], losers: MoverData[] }>({ gainers: [], losers: [] });
    const [afterHoursMovers, setAfterHoursMovers] = useState<{ gainers: MoverData[], losers: MoverData[] }>({ gainers: [], losers: [] });
    const [moversLoading, setMoversLoading] = useState(false);

    // Fetch Pre-Market Movers (current day 4AM-9:30AM)
    useEffect(() => {
        const fetchPreMarketMovers = async () => {
            setMoversLoading(true);
            try {
                // Use snapshot endpoint - gets ALL tickers in ONE call
                const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf`;
                const response = await fetch(url);

                if (!response.ok) {
                    setMoversLoading(false);
                    return;
                }

                const data = await response.json();
                const results: MoverData[] = [];

                if (data.tickers) {
                    for (const ticker of data.tickers) {
                        if (!TOP_1800_SYMBOLS.includes(ticker.ticker)) continue;

                        if (ticker.prevDay?.c && ticker.todaysChangePerc !== undefined) {
                            const changePercent = ticker.todaysChangePerc;
                            const price = ticker.lastTrade?.p || ticker.prevDay.c;
                            const change = price - ticker.prevDay.c;

                            if (Math.abs(changePercent) > 0.5) {
                                results.push({
                                    symbol: ticker.ticker,
                                    price,
                                    change,
                                    changePercent,
                                    hasPreMarket: true,
                                    hasAfterHours: false
                                });
                            }
                        }
                    }
                }

                const sortedByChange = [...results].sort((a, b) => b.changePercent - a.changePercent);

                setPreMarketMovers({
                    gainers: sortedByChange.slice(0, 10),
                    losers: sortedByChange.slice(-10).reverse()
                });

            } catch (error) {
                // Silent error
            } finally {
                setMoversLoading(false);
            }
        };

        fetchPreMarketMovers();
        const interval = setInterval(fetchPreMarketMovers, 300000);
        return () => clearInterval(interval);
    }, []);

    // Fetch After-Hours Movers (previous trading day market close to 7:55PM)
    useEffect(() => {
        const fetchAfterHoursMovers = async () => {
            try {
                // Use snapshot endpoint - gets ALL tickers in ONE call
                const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey=kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf`;
                const response = await fetch(url);

                if (!response.ok) return;

                const data = await response.json();
                const results: MoverData[] = [];

                if (data.tickers) {
                    for (const ticker of data.tickers) {
                        if (!TOP_1800_SYMBOLS.includes(ticker.ticker)) continue;

                        if (ticker.prevDay?.c && ticker.todaysChangePerc !== undefined) {
                            const changePercent = ticker.todaysChangePerc;
                            const price = ticker.lastTrade?.p || ticker.prevDay.c;
                            const change = price - ticker.prevDay.c;

                            if (Math.abs(changePercent) > 0.5) {
                                results.push({
                                    symbol: ticker.ticker,
                                    price,
                                    change,
                                    changePercent,
                                    hasPreMarket: false,
                                    hasAfterHours: true
                                });
                            }
                        }
                    }
                }

                const sortedByChange = [...results].sort((a, b) => b.changePercent - a.changePercent);

                setAfterHoursMovers({
                    gainers: sortedByChange.slice(0, 10),
                    losers: sortedByChange.slice(-10).reverse()
                });

            } catch (error) {
                // Silent error
            }
        };

        fetchAfterHoursMovers();
        const interval = setInterval(fetchAfterHoursMovers, 300000);
        return () => clearInterval(interval);
    }, []);

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
            <div style={{
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
                {/* Pre-Market Button */}
                <button
                    onClick={() => setShowPreMarket(!showPreMarket)}
                    style={{
                        position: 'absolute',
                        right: '130px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: showPreMarket ? 'rgba(255, 140, 0, 0.15)' : 'rgba(20, 20, 20, 0.95)',
                        border: showPreMarket ? '1px solid rgba(255, 140, 0, 0.5)' : '1px solid rgba(80, 80, 80, 0.4)',
                        color: '#FFA500',
                        padding: '4px 12px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        zIndex: 10001,
                        transition: 'all 0.2s',
                        boxShadow: showPreMarket ? '0 0 12px rgba(255, 140, 0, 0.3)' : 'none'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 140, 0, 0.15)';
                        e.currentTarget.style.borderColor = 'rgba(255, 140, 0, 0.5)';
                    }}
                    onMouseLeave={(e) => {
                        if (!showPreMarket) {
                            e.currentTarget.style.background = 'rgba(20, 20, 20, 0.95)';
                            e.currentTarget.style.borderColor = 'rgba(80, 80, 80, 0.4)';
                        }
                    }}
                >
                    <TbSunrise size={14} />
                    PRE-MARKET
                </button>

                {/* After-Hours Button */}
                <button
                    onClick={() => setShowAfterHours(!showAfterHours)}
                    style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: showAfterHours ? 'rgba(0, 174, 239, 0.15)' : 'rgba(20, 20, 20, 0.95)',
                        border: showAfterHours ? '1px solid rgba(0, 174, 239, 0.5)' : '1px solid rgba(80, 80, 80, 0.4)',
                        color: '#00AEEF',
                        padding: '4px 12px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        zIndex: 10001,
                        transition: 'all 0.2s',
                        boxShadow: showAfterHours ? '0 0 12px rgba(0, 174, 239, 0.3)' : 'none'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(0, 174, 239, 0.15)';
                        e.currentTarget.style.borderColor = 'rgba(0, 174, 239, 0.5)';
                    }}
                    onMouseLeave={(e) => {
                        if (!showAfterHours) {
                            e.currentTarget.style.background = 'rgba(20, 20, 20, 0.95)';
                            e.currentTarget.style.borderColor = 'rgba(80, 80, 80, 0.4)';
                        }
                    }}
                >
                    <TbMoon size={14} />
                    AFTER-HOURS
                </button>

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

            {/* Pre-Market Popup */}
            {showPreMarket && (
                <div style={{
                    position: 'fixed',
                    top: '90px',
                    right: '20px',
                    width: '680px',
                    maxHeight: '85vh',
                    background: '#0a0a0a',
                    border: '1px solid #222',
                    borderRadius: '6px',
                    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.8)',
                    zIndex: 10002,
                    overflow: 'hidden'
                }}>
                    {/* Header */}
                    <div style={{
                        padding: '18px 24px',
                        borderBottom: '1px solid #222',
                        background: '#0f0f0f',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative'
                    }}>
                        <h3 style={{
                            margin: 0,
                            fontSize: '18px',
                            fontWeight: '600',
                            color: '#ffffff',
                            textTransform: 'uppercase',
                            letterSpacing: '2px'
                        }}>Pre-Market Movers</h3>
                        <button
                            onClick={() => setShowPreMarket(false)}
                            style={{
                                position: 'absolute',
                                right: '20px',
                                background: 'transparent',
                                border: 'none',
                                color: '#666',
                                cursor: 'pointer',
                                padding: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                transition: 'color 0.15s'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.color = '#fff';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.color = '#666';
                            }}
                        >
                            <TbX size={18} />
                        </button>
                    </div>

                    {/* Content */}
                    <div style={{ overflowY: 'auto', maxHeight: 'calc(85vh - 90px)' }}>
                        {moversLoading ? (
                            <div style={{ padding: '40px', textAlign: 'center' }}>
                                <div style={{
                                    width: '40px',
                                    height: '40px',
                                    border: '3px solid rgba(255, 140, 0, 0.2)',
                                    borderTop: '3px solid #FFA500',
                                    borderRadius: '50%',
                                    margin: '0 auto 16px',
                                    animation: 'spin 1s linear infinite'
                                }} />
                                <p style={{ color: '#888', fontSize: '14px', margin: 0 }}>Loading movers...</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: '1px', background: '#000' }}>
                                {/* Gainers Column */}
                                <div style={{ flex: 1, padding: '0', background: '#0a0a0a' }}>
                                    <div style={{
                                        padding: '14px 20px',
                                        background: '#0f0f0f',
                                        borderBottom: '1px solid #1a1a1a',
                                        textAlign: 'center'
                                    }}>
                                        <h4 style={{
                                            margin: 0,
                                            fontSize: '13px',
                                            fontWeight: '600',
                                            color: '#22C55E',
                                            textTransform: 'uppercase',
                                            letterSpacing: '1.5px'
                                        }}>Gainers</h4>
                                    </div>
                                    <div style={{ padding: '6px' }}>
                                        {preMarketMovers.gainers.slice(0, 10).map((mover, idx) => (
                                            <div key={mover.symbol} style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '12px 14px',
                                                marginBottom: '2px',
                                                background: 'linear-gradient(145deg, #0f0f0f, #0a0a0a)',
                                                border: '1px solid #1a1a1a',
                                                borderRadius: '3px',
                                                boxShadow: '2px 2px 4px rgba(0, 0, 0, 0.5), -1px -1px 3px rgba(255, 255, 255, 0.02)',
                                                transition: 'all 0.15s',
                                                cursor: 'pointer'
                                            }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.background = 'linear-gradient(145deg, #141414, #0c0c0c)';
                                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                                    e.currentTarget.style.boxShadow = '3px 3px 6px rgba(0, 0, 0, 0.6), -1px -1px 4px rgba(255, 255, 255, 0.03)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = 'linear-gradient(145deg, #0f0f0f, #0a0a0a)';
                                                    e.currentTarget.style.transform = 'translateY(0)';
                                                    e.currentTarget.style.boxShadow = '2px 2px 4px rgba(0, 0, 0, 0.5), -1px -1px 3px rgba(255, 255, 255, 0.02)';
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <div style={{
                                                        width: '24px',
                                                        height: '24px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: '11px',
                                                        fontWeight: '600',
                                                        color: '#666'
                                                    }}>{idx + 1}</div>
                                                    <div>
                                                        <div style={{
                                                            fontSize: '14px',
                                                            fontWeight: '600',
                                                            color: '#ffffff',
                                                            marginBottom: '2px',
                                                            letterSpacing: '0.3px'
                                                        }}>{mover.symbol}</div>
                                                        <div style={{
                                                            fontSize: '11px',
                                                            color: '#22C55E',
                                                            fontWeight: '600'
                                                        }}>${mover.price.toFixed(2)}</div>
                                                    </div>
                                                </div>
                                                <div style={{
                                                    fontSize: '14px',
                                                    fontWeight: '700',
                                                    color: '#22C55E',
                                                    letterSpacing: '0.3px'
                                                }}>+{mover.changePercent.toFixed(2)}%</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Losers Column */}
                                <div style={{ flex: 1, padding: '0', background: '#0a0a0a' }}>
                                    <div style={{
                                        padding: '14px 20px',
                                        background: '#0f0f0f',
                                        borderBottom: '1px solid #1a1a1a',
                                        textAlign: 'center'
                                    }}>
                                        <h4 style={{
                                            margin: 0,
                                            fontSize: '13px',
                                            fontWeight: '600',
                                            color: '#EF4444',
                                            textTransform: 'uppercase',
                                            letterSpacing: '1.5px'
                                        }}>Losers</h4>
                                    </div>
                                    <div style={{ padding: '6px' }}>
                                        {preMarketMovers.losers.slice(0, 10).map((mover, idx) => (
                                            <div key={mover.symbol} style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '12px 14px',
                                                marginBottom: '2px',
                                                background: 'linear-gradient(145deg, #0f0f0f, #0a0a0a)',
                                                border: '1px solid #1a1a1a',
                                                borderRadius: '3px',
                                                boxShadow: '2px 2px 4px rgba(0, 0, 0, 0.5), -1px -1px 3px rgba(255, 255, 255, 0.02)',
                                                transition: 'all 0.15s',
                                                cursor: 'pointer'
                                            }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.background = 'linear-gradient(145deg, #141414, #0c0c0c)';
                                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                                    e.currentTarget.style.boxShadow = '3px 3px 6px rgba(0, 0, 0, 0.6), -1px -1px 4px rgba(255, 255, 255, 0.03)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = 'linear-gradient(145deg, #0f0f0f, #0a0a0a)';
                                                    e.currentTarget.style.transform = 'translateY(0)';
                                                    e.currentTarget.style.boxShadow = '2px 2px 4px rgba(0, 0, 0, 0.5), -1px -1px 3px rgba(255, 255, 255, 0.02)';
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <div style={{
                                                        width: '24px',
                                                        height: '24px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: '11px',
                                                        fontWeight: '600',
                                                        color: '#666'
                                                    }}>{idx + 1}</div>
                                                    <div>
                                                        <div style={{
                                                            fontSize: '14px',
                                                            fontWeight: '600',
                                                            color: '#ffffff',
                                                            marginBottom: '2px',
                                                            letterSpacing: '0.3px'
                                                        }}>{mover.symbol}</div>
                                                        <div style={{
                                                            fontSize: '11px',
                                                            color: '#EF4444',
                                                            fontWeight: '600'
                                                        }}>${mover.price.toFixed(2)}</div>
                                                    </div>
                                                </div>
                                                <div style={{
                                                    fontSize: '14px',
                                                    fontWeight: '700',
                                                    color: '#EF4444',
                                                    letterSpacing: '0.3px'
                                                }}>{mover.changePercent.toFixed(2)}%</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* After-Hours Popup */}
            {showAfterHours && (
                <div style={{
                    position: 'fixed',
                    top: '90px',
                    right: '20px',
                    width: '680px',
                    maxHeight: '85vh',
                    background: '#0a0a0a',
                    border: '1px solid #222',
                    borderRadius: '6px',
                    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.8)',
                    zIndex: 10002,
                    overflow: 'hidden'
                }}>
                    {/* Header */}
                    <div style={{
                        padding: '18px 24px',
                        borderBottom: '1px solid #222',
                        background: '#0f0f0f',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative'
                    }}>
                        <h3 style={{
                            margin: 0,
                            fontSize: '18px',
                            fontWeight: '600',
                            color: '#ffffff',
                            textTransform: 'uppercase',
                            letterSpacing: '2px'
                        }}>After-Hours Movers</h3>
                        <button
                            onClick={() => setShowAfterHours(false)}
                            style={{
                                position: 'absolute',
                                right: '20px',
                                background: 'transparent',
                                border: 'none',
                                color: '#666',
                                cursor: 'pointer',
                                padding: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                transition: 'color 0.15s'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.color = '#fff';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.color = '#666';
                            }}
                        >
                            <TbX size={18} />
                        </button>
                    </div>

                    {/* Content */}
                    <div style={{ overflowY: 'auto', maxHeight: 'calc(85vh - 90px)' }}>
                        {moversLoading ? (
                            <div style={{ padding: '40px', textAlign: 'center' }}>
                                <div style={{
                                    width: '40px',
                                    height: '40px',
                                    border: '3px solid #222',
                                    borderTop: '3px solid #fff',
                                    borderRadius: '50%',
                                    margin: '0 auto 16px',
                                    animation: 'spin 1s linear infinite'
                                }} />
                                <p style={{ color: '#888', fontSize: '14px', margin: 0 }}>Loading movers...</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: '1px', background: '#000' }}>
                                {/* Gainers Column */}
                                <div style={{ flex: 1, padding: '0', background: '#0a0a0a' }}>
                                    <div style={{
                                        padding: '14px 20px',
                                        background: '#0f0f0f',
                                        borderBottom: '1px solid #1a1a1a',
                                        textAlign: 'center'
                                    }}>
                                        <h4 style={{
                                            margin: 0,
                                            fontSize: '13px',
                                            fontWeight: '600',
                                            color: '#22C55E',
                                            textTransform: 'uppercase',
                                            letterSpacing: '1.5px'
                                        }}>Gainers</h4>
                                    </div>
                                    <div style={{ padding: '6px' }}>
                                        {afterHoursMovers.gainers.slice(0, 10).map((mover, idx) => (
                                            <div key={mover.symbol} style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '12px 14px',
                                                marginBottom: '2px',
                                                background: 'linear-gradient(145deg, #0f0f0f, #0a0a0a)',
                                                border: '1px solid #1a1a1a',
                                                borderRadius: '3px',
                                                boxShadow: '2px 2px 4px rgba(0, 0, 0, 0.5), -1px -1px 3px rgba(255, 255, 255, 0.02)',
                                                transition: 'all 0.15s',
                                                cursor: 'pointer'
                                            }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.background = 'linear-gradient(145deg, #141414, #0c0c0c)';
                                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                                    e.currentTarget.style.boxShadow = '3px 3px 6px rgba(0, 0, 0, 0.6), -1px -1px 4px rgba(255, 255, 255, 0.03)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = 'linear-gradient(145deg, #0f0f0f, #0a0a0a)';
                                                    e.currentTarget.style.transform = 'translateY(0)';
                                                    e.currentTarget.style.boxShadow = '2px 2px 4px rgba(0, 0, 0, 0.5), -1px -1px 3px rgba(255, 255, 255, 0.02)';
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <div style={{
                                                        width: '24px',
                                                        height: '24px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: '11px',
                                                        fontWeight: '600',
                                                        color: '#666'
                                                    }}>{idx + 1}</div>
                                                    <div>
                                                        <div style={{
                                                            fontSize: '14px',
                                                            fontWeight: '600',
                                                            color: '#ffffff',
                                                            marginBottom: '2px',
                                                            letterSpacing: '0.3px'
                                                        }}>{mover.symbol}</div>
                                                        <div style={{
                                                            fontSize: '11px',
                                                            color: '#22C55E',
                                                            fontWeight: '600'
                                                        }}>${mover.price.toFixed(2)}</div>
                                                    </div>
                                                </div>
                                                <div style={{
                                                    fontSize: '14px',
                                                    fontWeight: '700',
                                                    color: '#22C55E',
                                                    letterSpacing: '0.3px'
                                                }}>+{mover.changePercent.toFixed(2)}%</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Losers Column */}
                                <div style={{ flex: 1, padding: '0', background: '#0a0a0a' }}>
                                    <div style={{
                                        padding: '14px 20px',
                                        background: '#0f0f0f',
                                        borderBottom: '1px solid #1a1a1a',
                                        textAlign: 'center'
                                    }}>
                                        <h4 style={{
                                            margin: 0,
                                            fontSize: '13px',
                                            fontWeight: '600',
                                            color: '#EF4444',
                                            textTransform: 'uppercase',
                                            letterSpacing: '1.5px'
                                        }}>Losers</h4>
                                    </div>
                                    <div style={{ padding: '6px' }}>
                                        {afterHoursMovers.losers.slice(0, 10).map((mover, idx) => (
                                            <div key={mover.symbol} style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '12px 14px',
                                                marginBottom: '2px',
                                                background: 'linear-gradient(145deg, #0f0f0f, #0a0a0a)',
                                                border: '1px solid #1a1a1a',
                                                borderRadius: '3px',
                                                boxShadow: '2px 2px 4px rgba(0, 0, 0, 0.5), -1px -1px 3px rgba(255, 255, 255, 0.02)',
                                                transition: 'all 0.15s',
                                                cursor: 'pointer'
                                            }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.background = 'linear-gradient(145deg, #141414, #0c0c0c)';
                                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                                    e.currentTarget.style.boxShadow = '3px 3px 6px rgba(0, 0, 0, 0.6), -1px -1px 4px rgba(255, 255, 255, 0.03)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = 'linear-gradient(145deg, #0f0f0f, #0a0a0a)';
                                                    e.currentTarget.style.transform = 'translateY(0)';
                                                    e.currentTarget.style.boxShadow = '2px 2px 4px rgba(0, 0, 0, 0.5), -1px -1px 3px rgba(255, 255, 255, 0.02)';
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <div style={{
                                                        width: '24px',
                                                        height: '24px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: '11px',
                                                        fontWeight: '600',
                                                        color: '#666'
                                                    }}>{idx + 1}</div>
                                                    <div>
                                                        <div style={{
                                                            fontSize: '14px',
                                                            fontWeight: '600',
                                                            color: '#ffffff',
                                                            marginBottom: '2px',
                                                            letterSpacing: '0.3px'
                                                        }}>{mover.symbol}</div>
                                                        <div style={{
                                                            fontSize: '11px',
                                                            color: '#EF4444',
                                                            fontWeight: '600'
                                                        }}>${mover.price.toFixed(2)}</div>
                                                    </div>
                                                </div>
                                                <div style={{
                                                    fontSize: '14px',
                                                    fontWeight: '700',
                                                    color: '#EF4444',
                                                    letterSpacing: '0.3px'
                                                }}>{mover.changePercent.toFixed(2)}%</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <style jsx>{`
                        @keyframes spin {
                          0% { transform: rotate(0deg); }
                          100% { transform: rotate(360deg); }
                        }
                    `}</style>
                </div>
            )}
        </>
    );
}
