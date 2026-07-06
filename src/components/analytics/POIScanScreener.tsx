'use client'

import React, { useRef, useState } from 'react'

// ── Constants ──────────────────────────────────────────────────────────────────
const DARK_POOL_EXCHANGES = new Set([4, 6, 16, 201, 202, 203])
const LIT_BLOCK_MIN_NOTIONAL = 250_000
const LOOKBACK_DAYS = 45
const TICKER_CONCURRENCY = 3

// ── Rate limiter (shared across all fetch calls in this module) ────────────────
const _POLY_MAX = 4
let _polyInflight = 0
const _polyWaiting: Array<() => void> = []
const polyAcquire = (): Promise<void> =>
    new Promise(resolve => {
        if (_polyInflight < _POLY_MAX) { _polyInflight++; resolve() }
        else _polyWaiting.push(() => { _polyInflight++; resolve() })
    })
const polyRelease = () => {
    _polyInflight = Math.max(0, _polyInflight - 1)
    if (_polyWaiting.length) _polyWaiting.shift()!()
}

// ── Default ticker universe ────────────────────────────────────────────────────
const POI_TICKERS = [
    'SPY', 'QQQ', 'IWM', 'DIA',
    'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'NFLX', 'AVGO', 'AMD',
    'PLTR', 'COIN', 'MSTR', 'ARM', 'SMCI', 'HOOD',
    'JPM', 'GS', 'MS', 'BAC', 'C',
    'XOM', 'CVX', 'OXY',
    'LLY', 'ABBV', 'UNH', 'MRNA', 'PFE',
    'BA', 'LMT', 'RTX',
    'V', 'MA', 'PYPL',
    'CRM', 'ORCL', 'SNOW', 'DDOG',
    'UBER', 'ABNB', 'DASH',
    'GLD', 'TLT', 'HYG',
    'NKE', 'SBUX',
]

// ── Types ──────────────────────────────────────────────────────────────────────
interface DPPrint { price: number; size: number; ts: number }
interface DPDay { date: string; top10: DPPrint[]; totalNotional: number; topPrint: DPPrint }
interface POIResult {
    symbol: string
    currentPrice: number
    prevClose: number
    topDay: DPDay
    totalNotional45d: number
    globalRank: number
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtNotional(n: number): string {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
    return (n / 1e3).toFixed(0) + 'K'
}
function fmtPrice(p: number): string {
    return p >= 1000 ? p.toFixed(0) : p.toFixed(2)
}
function fmtDate(dateStr: string): string {
    const parts = dateStr.split('-').map(Number)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${months[parts[1] - 1]} ${parts[2]}`
}

const RANK_COLORS = [
    { border: 'rgba(255,160,40,0.7)', top: '#FFA028', bg: 'rgba(255,140,40,0.10)', label: '#FFD700' },
    { border: 'rgba(80,180,255,0.6)', top: '#41B6F6', bg: 'rgba(60,160,255,0.07)', label: '#41B6F6' },
    { border: 'rgba(230,230,230,0.5)', top: '#D0D0D0', bg: 'rgba(200,200,200,0.05)', label: '#CCCCCC' },
    { border: 'rgba(100,100,100,0.4)', top: '#888888', bg: 'rgba(100,100,100,0.04)', label: '#888888' },
]
function rankStyle(rank: number) { return RANK_COLORS[Math.min(rank, 3)] }

// ── scanDPDays — fetches 45 days of dark pool data for one ticker ──────────────
type RawTrade = { sip_timestamp: number; price: number; size: number; exchange: number }

async function scanDPDays(
    dates: string[],
    symbol: string,
    apiKey: string,
    signal: AbortSignal,
): Promise<DPDay[]> {
    let aborted = false
    signal.addEventListener('abort', () => { aborted = true })

    const fetchWithRetry = async (url: string, maxAttempts = 3): Promise<Response | null> => {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            if (aborted) return null
            const ac = new AbortController()
            const timer = setTimeout(() => ac.abort(), 10_000)
            try {
                const res = await fetch(url, { signal: ac.signal })
                clearTimeout(timer)
                if (res.ok) return res
                if (res.status === 429) {
                    await new Promise(r => setTimeout(r, 2000 * (attempt + 1) + Math.random() * 500))
                    continue
                }
                await res.text().catch(() => { })
                return null
            } catch {
                clearTimeout(timer)
                if (aborted) return null
                if (attempt < maxAttempts - 1) {
                    await new Promise(r => setTimeout(r, Math.min(300 * Math.pow(2, attempt) + Math.random() * 200, 3000)))
                }
            }
        }
        return null
    }

    const fetchWindow = async (url: string): Promise<{ prints: DPPrint[]; windowNotional: number }> => {
        let top: DPPrint[] = []
        let windowNotional = 0
        if (aborted) return { prints: top, windowNotional }
        await polyAcquire()
        const res = await fetchWithRetry(url)
        polyRelease()
        if (!res) return { prints: top, windowNotional }
        let json: { results?: RawTrade[] }
        try { json = await res.json() } catch { return { prints: top, windowNotional } }
        for (const t of (json.results || []) as RawTrade[]) {
            const notional = t.size * t.price
            if (DARK_POOL_EXCHANGES.has(t.exchange) || notional >= LIT_BLOCK_MIN_NOTIONAL) {
                windowNotional += notional
                top.push({ price: t.price, size: t.size, ts: Math.floor(t.sip_timestamp / 1_000_000) })
            }
        }
        if (top.length > 50) top = top.sort((a, b) => b.size * b.price - a.size * a.price).slice(0, 50)
        return { prints: top, windowNotional }
    }

    const results: DPDay[] = []
    const queue: string[] = [...dates]

    const fetchDay = async (dk: string) => {
        if (aborted) return
        const dayStartMs = new Date(dk).getTime()
        const d = new Date(dk + 'T12:00:00Z')
        const yr = d.getUTCFullYear()
        const marchSun = new Date(Date.UTC(yr, 2, 8))
        while (marchSun.getUTCDay() !== 0) marchSun.setUTCDate(marchSun.getUTCDate() + 1)
        const novSun = new Date(Date.UTC(yr, 10, 1))
        while (novSun.getUTCDay() !== 0) novSun.setUTCDate(novSun.getUTCDate() + 1)
        const isEDT = d >= marchSun && d < novSun
        const etOff = isEDT ? 4 * 3600_000 : 5 * 3600_000
        const rthStartNs = (dayStartMs + 9 * 3600_000 + 30 * 60_000 + etOff) * 1_000_000
        const rthEndNs = (dayStartMs + 16 * 3600_000 + 15 * 60_000 + etOff) * 1_000_000
        const winNs = (rthEndNs - rthStartNs) / 3

        const winResults: Array<{ prints: DPPrint[]; windowNotional: number }> = []
        for (let i = 0; i < 3; i++) {
            if (aborted) return
            const s = rthStartNs + i * winNs
            const e = rthStartNs + (i + 1) * winNs
            const base = `/api/polygon/v3/trades/${symbol}?timestamp.gte=${s}&timestamp.lte=${e}&limit=50000&apiKey=${apiKey}`
            // Fetch asc + desc so a massive block anywhere in the window isn't cut off
            const ascResult = await fetchWindow(base + '&order=asc')
            const descResult = await fetchWindow(base + '&order=desc')
            const seen = new Set<string>()
            const merged: DPPrint[] = []
            for (const p of [...ascResult.prints, ...descResult.prints]) {
                const key = `${p.ts}|${p.price}|${p.size}`
                if (!seen.has(key)) { seen.add(key); merged.push(p) }
            }
            merged.sort((a, b) => b.size * b.price - a.size * a.price)
            winResults.push({
                prints: merged.slice(0, 50),
                windowNotional: ascResult.windowNotional + descResult.windowNotional,
            })
        }

        const allPrints = winResults.flatMap(w => w.prints).sort((a, b) => b.size * b.price - a.size * a.price)
        const totalNotional = winResults.reduce((s, w) => s + w.windowNotional, 0)
        if (allPrints.length > 0 && totalNotional > 0) {
            const day: DPDay = { date: dk, top10: allPrints.slice(0, 10), totalNotional, topPrint: allPrints[0] }
            results.push(day)
        }
    }

    // Process days serially within a ticker (same as StraddleTownScreener)
    for (const dk of queue) {
        if (aborted) break
        await fetchDay(dk)
    }

    return results
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function POIScanScreener() {
    const [phase, setPhase] = useState<'idle' | 'scanning' | 'done'>('idle')
    const [scanned, setScanned] = useState(0)
    const [totalTickers, setTotalTickers] = useState(0)
    const [results, setResults] = useState<POIResult[]>([])
    const abortCtrlRef = useRef<AbortController | null>(null)
    const partialRef = useRef<POIResult[]>([])

    const mono: React.CSSProperties = { fontFamily: 'JetBrains Mono, monospace' }
    const apiKey = '' || ''

    function buildDayList(): string[] {
        const days: string[] = []
        const cursor = new Date()
        cursor.setUTCHours(0, 0, 0, 0)
        while (days.length < LOOKBACK_DAYS) {
            cursor.setUTCDate(cursor.getUTCDate() - 1)
            const dow = cursor.getUTCDay()
            if (dow === 0 || dow === 6) continue
            days.unshift(cursor.toISOString().split('T')[0])
        }
        return days
    }

    async function fetchSnapshots(tickers: string[]): Promise<Map<string, { price: number; prevClose: number }>> {
        const map = new Map<string, { price: number; prevClose: number }>()
        const BATCH = 100
        for (let i = 0; i < tickers.length; i += BATCH) {
            const batch = tickers.slice(i, i + BATCH)
            try {
                const res = await fetch(
                    `/api/polygon/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${batch.join(',')}&apiKey=${apiKey}`
                )
                if (!res.ok) continue
                const json = await res.json()
                for (const t of (json.tickers ?? [])) {
                    map.set(t.ticker, {
                        price: t.day?.c || t.lastTrade?.p || t.prevDay?.c || 0,
                        prevClose: t.prevDay?.c || 0,
                    })
                }
            } catch { /* continue */ }
        }
        return map
    }

    const run = async () => {
        if (!apiKey) return
        abortCtrlRef.current?.abort()
        const ac = new AbortController()
        abortCtrlRef.current = ac
        partialRef.current = []
        setResults([])
        setScanned(0)
        setPhase('scanning')

        const tickers = [...POI_TICKERS]
        setTotalTickers(tickers.length)
        const days = buildDayList()

        // Fetch all snapshots up front (1 request for all tickers)
        const snapshots = await fetchSnapshots(tickers)

        let done = 0
        const queue = [...tickers]

        const worker = async () => {
            while (queue.length > 0 && !ac.signal.aborted) {
                const sym = queue.shift()!
                try {
                    const dpDays = await scanDPDays(days, sym, apiKey, ac.signal)
                    if (!ac.signal.aborted && dpDays.length > 0) {
                        const topDay = dpDays.reduce((best, d) => d.totalNotional > best.totalNotional ? d : best)
                        const totalNotional45d = dpDays.reduce((s, d) => s + d.totalNotional, 0)
                        const snap = snapshots.get(sym)
                        partialRef.current.push({
                            symbol: sym,
                            currentPrice: snap?.price ?? 0,
                            prevClose: snap?.prevClose ?? 0,
                            topDay,
                            totalNotional45d,
                            globalRank: 0,
                        })
                        // Sort by 45d total notional descending, re-assign ranks
                        partialRef.current.sort((a, b) => b.totalNotional45d - a.totalNotional45d)
                        partialRef.current.forEach((r, i) => { r.globalRank = i })
                        setResults([...partialRef.current])
                    }
                } catch { /* skip failed ticker */ }
                done++
                setScanned(done)
            }
        }

        await Promise.all(Array.from({ length: Math.min(TICKER_CONCURRENCY, tickers.length) }, worker))
        if (!ac.signal.aborted) setPhase('done')
    }

    const stop = () => {
        abortCtrlRef.current?.abort()
        setPhase('done')
    }

    const progress = totalTickers > 0 ? Math.round((scanned / totalTickers) * 100) : 0

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#000', overflow: 'hidden' }}>
            <style>{`
        @keyframes poiSpin  { from { transform: rotate(0deg); }   to { transform: rotate(360deg); } }
        @keyframes poiPulse { 0%,100% { transform: scale(1); opacity:1; } 50% { transform: scale(0.85); opacity:0.6; } }
      `}</style>

            {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
            <div style={{
                flexShrink: 0, padding: '10px 16px',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                background: 'linear-gradient(180deg, #0e0f12 0%, #080a0d 100%)',
                display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                boxShadow: '0 2px 24px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.04)',
            }}>
                {/* Brand */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingRight: 16, borderRight: '1px solid rgba(255,255,255,0.07)', flexShrink: 0, alignSelf: 'stretch' }}>
                    <div style={{ width: 4, height: 30, background: 'linear-gradient(180deg,#00D4FF,#0080FF)', borderRadius: 2, flexShrink: 0, boxShadow: '0 0 10px rgba(0,212,255,0.45)' }} />
                    <div>
                        <div style={{ ...mono, fontWeight: 900, fontSize: 19, color: '#00D4FF', letterSpacing: '3px', lineHeight: 1 }}>DARK POOL POI</div>
                        <div style={{ ...mono, fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '1px', marginTop: 2 }}>45-DAY LOOKBACK · {POI_TICKERS.length} TICKERS</div>
                    </div>
                </div>

                {/* Scan button */}
                {phase === 'idle' && (
                    <button onClick={run} style={{
                        ...mono, fontSize: 14, fontWeight: 900, letterSpacing: 2, padding: '0 22px', height: 45,
                        cursor: 'pointer', borderRadius: 8, flexShrink: 0,
                        background: 'linear-gradient(180deg,#00D4FF 0%,#0080CC 100%)',
                        border: '1px solid rgba(0,180,255,0.6)',
                        boxShadow: '0 4px 0 rgba(0,40,80,0.8), 0 6px 16px rgba(0,180,255,0.25), inset 0 1px 0 rgba(255,255,255,0.25)',
                        color: '#000', display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                        <svg width="12" height="12" viewBox="0 0 11 11"><polygon points="2,1 10,5.5 2,10" fill="currentColor" /></svg>
                        SCAN
                    </button>
                )}

                {/* Scanning state */}
                {phase === 'scanning' && (
                    <>
                        <button onClick={stop} style={{
                            ...mono, fontSize: 14, fontWeight: 900, letterSpacing: 2, padding: '0 22px', height: 45,
                            cursor: 'pointer', borderRadius: 8, flexShrink: 0,
                            background: 'linear-gradient(180deg,#FF2040 0%,#A00018 100%)',
                            border: '1px solid rgba(255,60,80,0.6)',
                            boxShadow: '0 4px 0 rgba(80,0,10,0.8), 0 6px 16px rgba(255,40,60,0.25), inset 0 1px 0 rgba(255,160,160,0.25)',
                            color: '#fff', display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                            <svg width="12" height="12" viewBox="0 0 10 10" style={{ animation: 'poiPulse 1s ease-in-out infinite' }}>
                                <rect width="10" height="10" rx="1.5" fill="currentColor" />
                            </svg>
                            STOP
                        </button>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 110, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
                                <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg,#0080FF,#00D4FF)', transition: 'width 0.3s', borderRadius: 2 }} />
                            </div>
                            <span style={{ ...mono, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{scanned}/{totalTickers} · {progress}%</span>
                        </div>
                    </>
                )}

                {/* Rescan button */}
                {phase === 'done' && (
                    <button onClick={run} style={{
                        ...mono, fontSize: 14, fontWeight: 900, letterSpacing: 2, padding: '0 22px', height: 45,
                        cursor: 'pointer', borderRadius: 8, flexShrink: 0,
                        background: 'linear-gradient(180deg,#FF9A00 0%,#CC6000 100%)',
                        border: '1px solid rgba(255,180,0,0.6)',
                        boxShadow: '0 4px 0 rgba(100,30,0,0.8), 0 6px 16px rgba(255,140,0,0.25), inset 0 1px 0 rgba(255,230,100,0.35)',
                        color: '#000', display: 'flex', alignItems: 'center', gap: 8,
                        transition: 'all 0.1s',
                    }}
                        onMouseDown={e => { e.currentTarget.style.transform = 'translateY(2px)'; e.currentTarget.style.boxShadow = '0 2px 0 rgba(100,30,0,0.8), inset 0 1px 0 rgba(255,230,100,0.2)' }}
                        onMouseUp={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 4px 0 rgba(100,30,0,0.8), 0 6px 16px rgba(255,140,0,0.25), inset 0 1px 0 rgba(255,230,100,0.35)' }}
                        onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 4px 0 rgba(100,30,0,0.8), 0 6px 16px rgba(255,140,0,0.25), inset 0 1px 0 rgba(255,230,100,0.35)' }}
                    >
                        <svg width="14" height="14" viewBox="0 0 13 13" fill="none" style={{ animation: 'poiSpin 2s linear infinite' }}>
                            <path d="M11 6.5A4.5 4.5 0 1 1 9.2 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
                            <polygon points="9.2,0.5 12.5,3.5 6.5,3.5" fill="currentColor" />
                        </svg>
                        RESCAN
                    </button>
                )}

                {/* Result count */}
                {results.length > 0 && (
                    <div style={{ ...mono, fontSize: 11, color: 'rgba(255,255,255,0.3)', marginLeft: 4 }}>
                        {results.length} result{results.length !== 1 ? 's' : ''}
                    </div>
                )}

                {/* Legend */}
                {results.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto', paddingLeft: 16, borderLeft: '1px solid rgba(255,255,255,0.07)' }}>
                        {(['#FFA028', '#41B6F6', '#D0D0D0'] as const).map((color, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <div style={{
                                    width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                                    background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.85) 0%, ${color} 55%, rgba(0,0,0,0.2) 100%)`,
                                    boxShadow: `0 0 6px ${color}60`,
                                }} />
                                <span style={{ ...mono, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{['#1', '#2', '#3'][i]}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Card list ────────────────────────────────────────────────────────── */}
            <div style={{
                flex: 1, overflowY: 'auto', padding: '12px 12px 24px',
                display: 'flex', flexDirection: 'column', gap: 10,
                scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,180,255,0.3) rgba(255,255,255,0.04)',
            }}>

                {/* Empty states */}
                {phase === 'idle' && results.length === 0 && (
                    <div style={{ ...mono, textAlign: 'center', color: 'rgba(255,255,255,0.15)', marginTop: 80, fontSize: 13, letterSpacing: '2px', lineHeight: 2 }}>
                        PRESS SCAN TO FIND<br />DARK POOL POI LEVELS
                    </div>
                )}
                {phase === 'scanning' && results.length === 0 && (
                    <div style={{ ...mono, textAlign: 'center', color: 'rgba(0,212,255,0.4)', marginTop: 80, fontSize: 12, letterSpacing: '2px', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
                        <svg width="22" height="22" viewBox="0 0 11 11" style={{ animation: 'poiSpin 0.8s linear infinite' }} fill="none">
                            <circle cx="5.5" cy="5.5" r="4" stroke="rgba(0,212,255,0.3)" strokeWidth="1.5" />
                            <path d="M5.5 1.5 A4 4 0 0 1 9.5 5.5" stroke="#00D4FF" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                        SCANNING DARK POOL DATA…
                    </div>
                )}

                {/* Result cards */}
                {results.map(r => {
                    const s = rankStyle(r.globalRank)
                    const dayChangePct = r.prevClose > 0 ? ((r.currentPrice - r.prevClose) / r.prevClose) * 100 : null
                    const dayColor = dayChangePct == null ? '#fff' : dayChangePct >= 0 ? '#00FF88' : '#FF4060'

                    return (
                        <div
                            key={r.symbol}
                            style={{
                                background: '#000000',
                                border: `2px solid ${s.border}`,
                                borderTop: `3px solid ${s.top}`,
                                borderRadius: 6,
                                overflow: 'hidden',
                                boxShadow: `0 3px 20px ${s.bg}`,
                                transition: 'border-color 0.15s, background 0.15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#080808' }}
                            onMouseLeave={e => { e.currentTarget.style.background = '#000000' }}
                        >
                            {/* ── Header row ── */}
                            <div style={{
                                background: `linear-gradient(135deg, ${s.bg} 0%, rgba(0,0,0,0.96) 100%)`,
                                borderBottom: `1px solid ${s.border}`,
                                padding: '10px 14px 9px',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                                    {/* Rank badge */}
                                    <span style={{
                                        ...mono, fontSize: 11, fontWeight: 900, letterSpacing: '0.5px',
                                        color: s.top, background: `${s.top}18`, border: `1px solid ${s.top}50`,
                                        borderRadius: 3, padding: '2px 6px', flexShrink: 0,
                                    }}>#{r.globalRank + 1}</span>

                                    {/* Symbol */}
                                    <span style={{ ...mono, fontSize: 22, fontWeight: 900, color: '#FFFFFF', letterSpacing: '1px' }}>
                                        {r.symbol}
                                    </span>

                                    {/* Price */}
                                    {r.currentPrice > 0 && (
                                        <span style={{ ...mono, fontSize: 16, fontWeight: 700, color: '#FFFFFF' }}>
                                            ${fmtPrice(r.currentPrice)}
                                        </span>
                                    )}

                                    {/* Day change */}
                                    {dayChangePct != null && (
                                        <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: dayColor }}>
                                            {dayChangePct >= 0 ? '+' : ''}{dayChangePct.toFixed(2)}%
                                        </span>
                                    )}
                                </div>

                                {/* 45d total notional badge */}
                                <div style={{
                                    ...mono, fontSize: 18, fontWeight: 900,
                                    color: s.label, background: `${s.top}14`,
                                    border: `1px solid ${s.border}`,
                                    borderRadius: 4, padding: '3px 11px', flexShrink: 0,
                                }}>
                                    {fmtNotional(r.totalNotional45d)}
                                </div>
                            </div>

                            {/* ── POI level row ── */}
                            <div style={{
                                background: 'linear-gradient(160deg, rgba(8,14,32,0.98) 0%, rgba(3,6,16,1) 100%)',
                                padding: '10px 14px',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    {/* Bubble sphere */}
                                    <div style={{
                                        width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                                        background: `radial-gradient(circle at 33% 30%, rgba(255,255,255,0.9) 0%, ${s.top} 55%, rgba(0,0,0,0.3) 100%)`,
                                        boxShadow: `0 0 12px ${s.top}80, inset 0 0 4px rgba(255,255,255,0.3)`,
                                    }} />
                                    <div>
                                        <div style={{ ...mono, fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '2px', marginBottom: 3 }}>
                                            TOP POI · {fmtDate(r.topDay.date)}
                                        </div>
                                        <div style={{ ...mono, fontSize: 22, fontWeight: 900, color: '#FFFFFF' }}>
                                            ${fmtPrice(r.topDay.topPrint.price)}
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                                    <div style={{ ...mono, fontSize: 12, fontWeight: 700, color: s.label, letterSpacing: '0.5px' }}>
                                        {fmtNotional(r.topDay.totalNotional)} · top day
                                    </div>
                                    <div style={{ ...mono, fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>
                                        {r.topDay.topPrint.size.toLocaleString()} sh @ ${fmtPrice(r.topDay.topPrint.price)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
