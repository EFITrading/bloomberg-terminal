'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    SeasonalityVisualization,
    OptionsFlowVisualization,
    ChartingVisualization,
    RegimeVisualization,
    ScreenerVisualization,
    AlertsVisualization,
} from './ToolVisualizations';

interface LiveData {
    regimeLabel: string | null;
    regimeScore: number | null;
}

export default function ToolsSection() {
    const [hoveredTool, setHoveredTool] = useState<number | null>(null);
    const [live, setLive] = useState<LiveData>({ regimeLabel: null, regimeScore: null });

    useEffect(() => {
        const fetchRegime = async () => {
            try {
                const ctrl = new AbortController();
                const timer = setTimeout(() => ctrl.abort(), 6000);
                const r = await fetch('/api/composite-history', { signal: ctrl.signal });
                clearTimeout(timer);
                if (!r.ok) return;
                const d = await r.json();
                if (d.history?.length) {
                    const latest = d.history[d.history.length - 1];
                    setLive(p => ({ ...p, regimeLabel: latest.label ?? null, regimeScore: latest.compositeScore ?? null }));
                }
            } catch { /* silent fallback */ }
        };

        fetchRegime();
    }, []);

    const regimeName = live.regimeLabel ? live.regimeLabel.split('•')[0].trim() : 'SCANNING';

    const tools = [
        {
            id: 1,
            category: 'SEASONAL ANALYSIS',
            badge: 'LIVE DATA',
            badgeType: 'green',
            name: '20-Year Seasonality Engine',
            description: 'Statistical edge from 20 years of market data. Monthly win rates, election cycles, earnings seasonality, and proprietary backtesting across 4,000+ instruments.',
            features: ['Monthly Win Rates', 'Election Cycles', 'Earnings Seasonality', 'Custom Backtesting'],
            stat1: { val: '94.7%', lbl: 'Avg Accuracy' },
            stat2: { val: '20 Yrs', lbl: 'Data History' },
            href: '/data-driven',
            viz: <SeasonalityVisualization />,
        },
        {
            id: 2,
            category: 'OPTIONS FLOW',
            badge: 'REAL-TIME',
            badgeType: 'orange',
            name: 'Derivative Flow Scanner',
            description: 'Real-time sweep and block detection across all US exchanges. Track institutional positioning, unusual activity, and dark pool prints as they hit the tape.',
            features: ['Sweep Detection', 'Dark Pool Prints', 'Institutional Tracking', 'All Exchanges'],
            stat1: { val: '<50ms', lbl: 'Latency' },
            stat2: { val: '15+ Exch.', lbl: 'Coverage' },
            href: '/options-flow',
            viz: <OptionsFlowVisualization />,
        },
        {
            id: 3,
            category: 'CHARTING',
            badge: 'LIVE PRICE',
            badgeType: 'cyan',
            name: 'Professional Charting Suite',
            description: 'Institutional-grade charting with GEX overlays, dealer zones, EFI momentum indicators, and multi-timeframe layouts. No watermarks, no limitations.',
            features: ['GEX Overlays', 'Dealer Zones', 'EFI Indicators', 'Multi-Timeframe'],
            stat1: { val: '200+', lbl: 'Indicators' },
            stat2: { val: 'Pro', lbl: 'Grade' },
            href: '/market-overview',
            viz: <ChartingVisualization spxPrice={null} />,
        },
        {
            id: 4,
            category: 'REGIME DETECTION',
            badge: 'AI POWERED',
            badgeType: 'purple',
            name: 'Market Regime Engine',
            description: 'Composite scoring across 20 sector ETFs to classify bull/bear/neutral regimes before they become obvious. VIX-adjusted signals refreshed every 30 minutes.',
            features: ['20-ETF Composite', 'VIX Integration', 'Live Scoring', 'Regime History'],
            stat1: { val: regimeName, lbl: 'Current Regime' },
            stat2: { val: '91.3%', lbl: 'Detection Rate' },
            href: '/analysis-suite',
            viz: <RegimeVisualization regimeLabel={live.regimeLabel} regimeScore={live.regimeScore} />,
        },
        {
            id: 5,
            category: 'STOCK SCREENING',
            badge: 'MULTI-FACTOR',
            badgeType: 'green',
            name: 'Multi-Factor Screener Suite',
            description: 'Screen 10,000+ securities using RS rankings, HV percentiles, RRG momentum quadrants, leadership scoring, and live market heatmaps to surface setups ahead of the crowd.',
            features: ['RS Rankings', 'HV Percentile', 'RRG Momentum', 'Leadership Scan'],
            stat1: { val: '10,847', lbl: 'Securities' },
            stat2: { val: '200+', lbl: 'Metrics' },
            href: '/analytics',
            viz: <ScreenerVisualization />,
        },
        {
            id: 6,
            category: 'AI + ALERTS',
            badge: 'AI GRADED',
            badgeType: 'gold',
            name: 'AI Trade Intelligence',
            description: 'AI-graded setups combining options flow signals, seasonality triggers, and live regime context. Alerts fire the moment high-probability setups materialize.',
            features: ['AI Trade Scoring', 'Flow + Season Sync', 'Regime Context', 'Instant Alerts'],
            stat1: { val: 'INSTANT', lbl: 'Alert Speed' },
            stat2: { val: 'All Events', lbl: 'Coverage' },
            href: '/ai-suite',
            viz: <AlertsVisualization />,
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
                                {tool.viz}
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

                            <Link href={tool.href} className="tsv2-cta">
                                <span>Access Tool</span>
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
