'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface LiveData {
    regimeLabel: string | null;
    regimeScore: number | null;
    spxPrice: number | null;
}

async function getJson(url: string) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
        const r = await fetch(url, { signal: ctrl.signal });
        return r.ok ? await r.json() : null;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

export default function ToolsSection() {
    const [hoveredTool, setHoveredTool] = useState<number | null>(null);
    const [live, setLive] = useState<LiveData>({ regimeLabel: null, regimeScore: null, spxPrice: null });

    useEffect(() => {
        getJson('/api/composite-history').then(d => {
            if (!d?.history?.length) return;
            const latest = d.history[d.history.length - 1];
            setLive(p => ({ ...p, regimeLabel: latest.label ?? null, regimeScore: latest.compositeScore ?? null }));
        });
        getJson('/api/live-prices?symbols=SPY').then(d => {
            if (d?.success && d.prices?.SPY) setLive(p => ({ ...p, spxPrice: d.prices.SPY }));
        });
    }, []);

    const regimeName = live.regimeLabel ? live.regimeLabel.split('\u2022')[0].trim() : 'SCANNING';

    const tools = [
        {
            id: 1,
            category: 'SEASONAL ANALYSIS',
            badge: 'LIVE DATA',
            badgeType: 'green',
            name: '20-Year Seasonality Engine',
            description: 'Seasonal charts built from up to 23 years of price history. Monthly average returns, Sweet Spot and Pain Point windows, bullish and bearish 30-day periods, and election-cycle modes for any symbol.',
            features: ['Sweet Spot', 'Pain Point', 'Election Modes', 'Compare'],
            stat1: { val: '23 Yrs', lbl: 'Data History' },
            stat2: { val: 'Any Symbol', lbl: 'Coverage' },
            href: '/data-driven',
            img: '/tools/seasonal.png',
            alt: 'Seasonality chart for SPY with monthly returns and bullish and bearish windows',
        },
        {
            id: 2,
            category: 'OPTIONS FLOW',
            badge: 'REAL-TIME',
            badgeType: 'orange',
            name: 'Derivative Flow Scanner',
            description: 'Market-wide options flow tape with time, symbol, strike, size and premium, spot vs. current price, Vol/OI, and trade type tags for sweeps, blocks, and multi-leg. Includes Algo Flow, SpamAlert, and Historical modes.',
            features: ['Sweeps & Blocks', 'Algo Flow', 'SpamAlert', 'Historical'],
            stat1: { val: 'Market-Wide', lbl: 'Scan' },
            stat2: { val: 'SweepSense', lbl: 'Flow Summary' },
            href: '/options-flow',
            img: '/tools/options-flow.png',
            alt: 'Options flow table showing live sweeps, blocks and multi-leg trades',
        },
        {
            id: 3,
            category: 'CHARTING',
            badge: 'LIVE PRICE',
            badgeType: 'cyan',
            name: 'Professional Charting Suite',
            description: 'Full charting workspace with 5M, 1H and daily timeframes, Expected Range, Seasonality, Gamma Exposure (GEX), Implied Volatility overlays, option chain, news, and a complete drawing toolbar.',
            features: ['Gamma Exposure', 'Expected Range', 'Option Chain', 'Drawing Tools'],
            stat1: { val: live.spxPrice ? live.spxPrice.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '--', lbl: 'SPY Last' },
            stat2: { val: 'GEX', lbl: 'Overlays' },
            href: '/market-overview',
            img: '/tools/charting.png',
            alt: 'SPY candlestick chart with volume, sidebar tools and overlay menus',
        },
        {
            id: 4,
            category: 'REGIME DETECTION',
            badge: 'LIVE SCORE',
            badgeType: 'purple',
            name: 'Market Regime Engine',
            description: 'Composite defensive-to-growth gauge plus Today, Week, 13D, Month, Quarter and YTD regime readings, with a watchlist of leaders and laggards scored across sector and industry ETFs.',
            features: ['Composite Gauge', 'Multi-Timeframe', 'Money Flow', 'Watchlist Scores'],
            stat1: { val: regimeName, lbl: 'Current Regime' },
            stat2: { val: live.regimeScore !== null ? live.regimeScore.toFixed(2) : '--', lbl: 'Composite Score' },
            href: '/market-overview',
            img: '/tools/regime.png',
            alt: 'Market regime composite gauge with six timeframe gauges and watchlist table',
        },
        {
            id: 5,
            category: 'STOCK SCREENING',
            badge: 'MULTI-FACTOR',
            badgeType: 'green',
            name: 'Analytics & Screener Suite',
            description: 'Relative Rotation Graphs (RRG) for sectors and stocks with tails and historical lookback, plus IV RRG, RRG Screener, Leadership, HV Screener, Heatmap, Market Cycle, and Dealer Cluster tools.',
            features: ['RRG', 'HV Screener', 'Leadership', 'Heatmap'],
            stat1: { val: 'RRG', lbl: 'Rotation' },
            stat2: { val: '11', lbl: 'Analytics Tools' },
            href: '/analytics',
            img: '/tools/screener.png',
            alt: 'Relative Rotation Graph of sector ETFs with analytics tool menu',
        },
        {
            id: 6,
            category: 'AI SUITE',
            badge: 'AI ASSISTED',
            badgeType: 'gold',
            name: 'EFI Studio & AI Assistant',
            description: 'Script environment with templates, saved and community scripts, a live code editor, output console, and an AI assistant that writes or reviews your scripts against the terminal data API.',
            features: ['Script Editor', 'Templates', 'Community Scripts', 'AI Assistant'],
            stat1: { val: 'Custom', lbl: 'Scripts' },
            stat2: { val: 'AI', lbl: 'Assistant' },
            href: '/ai-suite',
            img: '/tools/ai-suite.png',
            alt: 'EFI Studio script editor with templates list and AI assistant panel',
        },
    ];

    return (
        <section className="tsv2">
            <div className="tsv2-inner">
                <div className="tsv2-header">
                    <div className="tsv2-pill">
                        <span className="tsv2-pill-dot" />
                        <span>Professional Suite</span>
                    </div>
                    <h2 className="tsv2-title">Professional-Grade<br />Trading Arsenal</h2>
                    <p className="tsv2-subtitle">
                        Enterprise analytics platform — options flow, seasonality edge, live regime detection, and institutional screening all in one terminal.
                    </p>
                </div>

                <div className="tsv2-grid">
                    {tools.map((tool) => (
                        <div
                            key={tool.id}
                            className={`tsv2-card${hoveredTool === tool.id ? ' tsv2-card--hov' : ''}`}
                            onMouseEnter={() => setHoveredTool(tool.id)}
                            onMouseLeave={() => setHoveredTool(null)}
                        >
                            <div className="tsv2-card-head">
                                <span className="tsv2-cat">{tool.category}</span>
                                <span className={`tsv2-badge tsv2-badge--${tool.badgeType}`}>
                                    <span className="tsv2-badge-dot" />
                                    {tool.badge}
                                </span>
                            </div>

                            <div className="tsv2-viz">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img className="tsv2-viz-img" src={tool.img} alt={tool.alt} loading="lazy" />
                            </div>

                            <div className="tsv2-stats-row">
                                <div className="tsv2-stat">
                                    <span className="tsv2-stat-val">{tool.stat1.val}</span>
                                    <span className="tsv2-stat-lbl">{tool.stat1.lbl}</span>
                                </div>
                                <div className="tsv2-stat-sep" />
                                <div className="tsv2-stat">
                                    <span className="tsv2-stat-val">{tool.stat2.val}</span>
                                    <span className="tsv2-stat-lbl">{tool.stat2.lbl}</span>
                                </div>
                            </div>

                            <h3 className="tsv2-name">{tool.name}</h3>
                            <p className="tsv2-desc">{tool.description}</p>

                            <div className="tsv2-tags">
                                {tool.features.map(f => (
                                    <span key={f} className="tsv2-tag">{f}</span>
                                ))}
                            </div>

                            <Link href="/login" className="tsv2-cta">
                                <span>Log in to Access</span>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                                    <path d="M7 17L17 7M17 7H7M17 7V17" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </Link>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
