'use client'

import * as d3Hierarchy from 'd3-hierarchy'
import { useEffect, useRef, useState } from 'react'

const POLYGON_API_KEY = process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''

// Top 10 per sector with approximate relative market caps (billions)
const SECTORS: Record<string, { stocks: string[]; caps: number[] }> = {
    Technology: {
        stocks: ['AAPL', 'MSFT', 'NVDA', 'AVGO', 'GOOGL', 'META', 'ORCL', 'ADBE', 'CSCO', 'AMD'],
        caps: [3000, 2900, 2500, 700, 2000, 1300, 300, 200, 200, 200],
    },
    Financials: {
        stocks: ['JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'SPGI', 'BLK', 'AXP'],
        caps: [600, 500, 400, 300, 200, 150, 150, 150, 150, 150],
    },
    Healthcare: {
        stocks: ['UNH', 'LLY', 'JNJ', 'ABBV', 'MRK', 'TMO', 'ABT', 'DHR', 'AMGN', 'PFE'],
        caps: [500, 800, 400, 300, 300, 200, 200, 150, 150, 150],
    },
    'Consumer Disc.': {
        stocks: ['AMZN', 'TSLA', 'HD', 'MCD', 'BKNG', 'NKE', 'LOW', 'SBUX', 'TJX', 'ORLY'],
        caps: [2000, 700, 350, 200, 150, 130, 130, 100, 100, 100],
    },
    'Consumer Staples': {
        stocks: ['WMT', 'COST', 'PG', 'KO', 'PEP', 'PM', 'MDLZ', 'CL', 'KMB', 'MNST'],
        caps: [500, 350, 350, 280, 250, 160, 100, 70, 50, 55],
    },
    Industrials: {
        stocks: ['GE', 'CAT', 'UNP', 'ETN', 'RTX', 'HON', 'UPS', 'LMT', 'BA', 'DE'],
        caps: [180, 175, 150, 150, 140, 130, 130, 120, 110, 130],
    },
    Energy: {
        stocks: ['XOM', 'CVX', 'COP', 'EOG', 'OXY', 'SLB', 'PSX', 'VLO', 'MPC', 'BKR'],
        caps: [450, 290, 130, 80, 60, 70, 70, 55, 55, 50],
    },
    'Comm. Services': {
        stocks: ['GOOGL', 'META', 'NFLX', 'DIS', 'CMCSA', 'TMUS', 'VZ', 'T', 'CHTR', 'EA'],
        caps: [2000, 1200, 300, 200, 170, 220, 160, 150, 50, 40],
    },
    Utilities: {
        stocks: ['NEE', 'SO', 'DUK', 'CEG', 'SRE', 'AEP', 'D', 'PCG', 'VST', 'PEG'],
        caps: [120, 80, 75, 70, 50, 50, 50, 40, 40, 35],
    },
    'Real Estate': {
        stocks: ['PLD', 'AMT', 'EQIX', 'PSA', 'WELL', 'DLR', 'CCI', 'O', 'SBAC', 'EXR'],
        caps: [90, 80, 75, 55, 55, 50, 50, 50, 40, 35],
    },
    Materials: {
        stocks: ['LIN', 'SHW', 'APD', 'FCX', 'ECL', 'VMC', 'MLM', 'NUE', 'NEM', 'DD'],
        caps: [200, 90, 60, 60, 55, 40, 35, 35, 45, 30],
    },
}

// Build symbol → sector lookup
const SECTOR_MAP: Record<string, string> = {}
Object.entries(SECTORS).forEach(([sector, data]) => {
    data.stocks.forEach((sym) => { SECTOR_MAP[sym] = sector })
})

// Deduplicated flat list of all symbols
const ALL_SYMBOLS = Array.from(new Set(Object.values(SECTORS).flatMap((s) => s.stocks)))

const SECTOR_ORDER: Record<string, number> = {
    Technology: 1,
    'Comm. Services': 2,
    'Consumer Disc.': 3,
    Healthcare: 4,
    Financials: 5,
    Industrials: 6,
    'Consumer Staples': 7,
    Energy: 8,
    'Real Estate': 9,
    Utilities: 10,
    Materials: 11,
}

const getColor = (change: number): string => {
    if (change >= 4) return '#16a34a'
    if (change >= 2) return '#22c55e'
    if (change >= 0.5) return '#4ade80'
    if (change > 0) return '#86efac'
    if (change === 0) return '#6b7280'
    if (change > -0.5) return '#fca5a5'
    if (change > -2) return '#f87171'
    if (change > -4) return '#ef4444'
    return '#b91c1c'
}

interface StockData {
    symbol: string
    changePercent: number
    sector: string
    cap: number
}

export default function MiniMarketHeatmap() {
    const [stocks, setStocks] = useState<StockData[]>([])
    const [loading, setLoading] = useState(true)
    const [size, setSize] = useState({ width: 0, height: 0 })
    const containerRef = useRef<HTMLDivElement>(null)

    // Observe container size
    useEffect(() => {
        const el = containerRef.current
        if (!el) return
        const update = () => setSize({ width: el.clientWidth, height: el.clientHeight })
        const ro = new ResizeObserver(update)
        ro.observe(el)
        update()
        return () => ro.disconnect()
    }, [])

    // Fetch snapshot data
    const fetchData = async () => {
        try {
            const tickers = ALL_SYMBOLS.join(',')
            const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickers}&apiKey=${POLYGON_API_KEY}`
            const res = await fetch(url)
            const data = await res.json()
            if (!data.tickers) return

            const result: StockData[] = data.tickers.map((t: any) => {
                const sym = t.ticker
                const sector = SECTOR_MAP[sym] || 'Other'
                const sectorData = SECTORS[sector]
                const idx = sectorData?.stocks.indexOf(sym) ?? -1
                const cap = idx >= 0 ? sectorData.caps[idx] : 50
                return {
                    symbol: sym,
                    changePercent: t.todaysChangePerc ?? 0,
                    sector,
                    cap,
                }
            })
            setStocks(result)
        } catch (e) {
            console.error('MiniMarketHeatmap fetch error:', e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
        const interval = setInterval(fetchData, 60000)
        return () => clearInterval(interval)
    }, [])

    if (loading) {
        return (
            <div
                ref={containerRef}
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#555',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 13,
                    background: '#000',
                }}
            >
                Loading heatmap...
            </div>
        )
    }

    if (!size.width || !size.height) {
        return <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#000' }} />
    }

    const { width, height } = size

    // Group stocks by sector
    const sectorMap = new Map<string, StockData[]>()
    stocks.forEach((s) => {
        if (!sectorMap.has(s.sector)) sectorMap.set(s.sector, [])
        sectorMap.get(s.sector)!.push(s)
    })

    // Build D3 hierarchy
    const root = {
        name: 'root',
        children: Array.from(sectorMap.entries())
            .sort((a, b) => (SECTOR_ORDER[a[0]] ?? 99) - (SECTOR_ORDER[b[0]] ?? 99))
            .map(([sectorName, sectorStocks]) => ({
                name: sectorName,
                children: sectorStocks.map((s) => ({
                    name: s.symbol,
                    value: s.cap,
                    changePercent: s.changePercent,
                })),
            })),
    }

    const hier = d3Hierarchy
        .hierarchy(root)
        .sum((d: any) => d.value || 0)
        .sort((a: any, b: any) => (b.value || 0) - (a.value || 0))

    const treemapLayout = d3Hierarchy
        .treemap<any>()
        .size([width, height])
        .paddingOuter(2)
        .paddingTop(16)
        .paddingInner(1)
        .tile(d3Hierarchy.treemapBinary)

    treemapLayout(hier as any)

    return (
        <div
            ref={containerRef}
            style={{ width: '100%', height: '100%', position: 'relative', background: '#000', overflow: 'hidden' }}
        >
            {hier.children?.map((sectorNode: any, sIdx: number) => {
                const sw = sectorNode.x1 - sectorNode.x0
                const sh = sectorNode.y1 - sectorNode.y0
                const labelSize = Math.max(8, Math.min(11, sw * 0.06))

                return (
                    <div key={sIdx}>
                        {/* Sector border + label */}
                        <div
                            style={{
                                position: 'absolute',
                                left: sectorNode.x0,
                                top: sectorNode.y0,
                                width: sw,
                                height: sh,
                                border: '2px solid #111',
                                boxSizing: 'border-box',
                                pointerEvents: 'none',
                            }}
                        >
                            <div
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 3,
                                    fontFamily: 'JetBrains Mono, monospace',
                                    fontSize: labelSize + 'px',
                                    fontWeight: 700,
                                    color: '#fff',
                                    textShadow: '-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000',
                                    letterSpacing: '0.3px',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    maxWidth: sw - 8,
                                    lineHeight: '15px',
                                    pointerEvents: 'none',
                                }}
                            >
                                {sectorNode.data.name}
                            </div>
                        </div>

                        {/* Stock tiles */}
                        {sectorNode.children?.map((stockNode: any, stIdx: number) => {
                            const tw = stockNode.x1 - stockNode.x0
                            const th = stockNode.y1 - stockNode.y0
                            const pct: number = stockNode.data.changePercent ?? 0
                            const area = tw * th
                            const symSize = Math.max(7, Math.min(20, Math.sqrt(area) * 0.16))
                            const chgSize = Math.max(6, Math.min(15, Math.sqrt(area) * 0.12))
                            const showSym = tw > 22 && th > 14
                            const showChg = th > 28 && tw > 28

                            return (
                                <div
                                    key={stIdx}
                                    title={`${stockNode.data.name}: ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`}
                                    style={{
                                        position: 'absolute',
                                        left: stockNode.x0,
                                        top: stockNode.y0,
                                        width: tw,
                                        height: th,
                                        backgroundColor: getColor(pct),
                                        border: '1px solid rgba(0,0,0,0.5)',
                                        boxSizing: 'border-box',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        overflow: 'hidden',
                                        cursor: 'default',
                                    }}
                                >
                                    {showSym && (
                                        <div
                                            style={{
                                                fontFamily: 'JetBrains Mono, monospace',
                                                fontSize: symSize + 'px',
                                                fontWeight: 700,
                                                color: '#fff',
                                                textShadow: '0 0 4px rgba(0,0,0,0.8)',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                width: '100%',
                                                textAlign: 'center',
                                                lineHeight: 1.1,
                                            }}
                                        >
                                            {stockNode.data.name}
                                        </div>
                                    )}
                                    {showChg && (
                                        <div
                                            style={{
                                                fontFamily: 'JetBrains Mono, monospace',
                                                fontSize: chgSize + 'px',
                                                fontWeight: 700,
                                                color: '#fff',
                                                textShadow: '0 0 4px rgba(0,0,0,0.8)',
                                                whiteSpace: 'nowrap',
                                                marginTop: 1,
                                                lineHeight: 1.1,
                                            }}
                                        >
                                            {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )
            })}
        </div>
    )
}
