'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'

// ── Constants ─────────────────────────────────────────────────────────────────
export const SP_STORAGE_KEY = 'straddle_portfolio_v1'
export const SP_ADD_EVENT = 'straddle-portfolio-add'
const POLL_MS = 30_000
const SP_ACCOUNT_KEY = 'straddle_account_v1'
const DEFAULT_BALANCE = 25_000

// ── Types ─────────────────────────────────────────────────────────────────────
export interface StraddleLeg {
    strike: number
    entryPrice: number
    contracts: number
    t1Stock: number
    t2Stock: number
    t1Prem: number
    t2Prem: number
    stopPrice: number
    status: 'OPEN' | 'CLOSED'
    closedPrice: number | null
    closedAt: number | null
}

export interface StraddlePosition {
    id: string
    symbol: string
    tier: 'high-pressure' | 'pivotal'
    addedAt: number
    stockPriceAtEntry: number
    expiration: string
    call: StraddleLeg
    put: StraddleLeg
    status: 'OPEN' | 'PARTIAL' | 'CLOSED'
}

// ── Storage helpers ───────────────────────────────────────────────────────────
function spLoad(): StraddlePosition[] {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem(SP_STORAGE_KEY) ?? '[]') } catch { return [] }
}
function spSave(positions: StraddlePosition[]): void {
    try { localStorage.setItem(SP_STORAGE_KEY, JSON.stringify(positions)) } catch { /* quota */ }
}
function uid(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function spAddPosition(pos: Omit<StraddlePosition, 'id'>): void {
    const positions = spLoad()
    const newPos: StraddlePosition = { ...pos, id: uid() }
    spSave([newPos, ...positions])
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SP_ADD_EVENT))
}

// ── Format helpers ────────────────────────────────────────────────────────────
function fmtUsd(v: number): string {
    return `${v >= 0 ? '+' : '−'}$${Math.abs(v).toFixed(2)}`
}
function fmtPct(v: number): string {
    return `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`
}
function fmtExpiry(expiry: string): string {
    const [y, m, d] = expiry.split('-')
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${months[+m - 1]} ${+d}, ${y}`
}
function fmtTs(ts: number): string {
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── Polygon option ticker builder ─────────────────────────────────────────────
function optionTicker(symbol: string, expiration: string, type: 'C' | 'P', strike: number): string {
    const [year, month, day] = expiration.split('-')
    const yy = year.slice(-2)
    const strikePad = Math.round(strike * 1000).toString().padStart(8, '0')
    return `O:${symbol}${yy}${month}${day}${type}${strikePad}`
}

// ── Portfolio Component ───────────────────────────────────────────────────────
export default function StraddlePortfolio({ onClose }: { onClose?: () => void }) {
    const mono: React.CSSProperties = { fontFamily: 'JetBrains Mono, monospace' }
    const API_KEY = process.env.NEXT_PUBLIC_POLYGON_API_KEY ?? ''

    const [positions, setPositions] = useState<StraddlePosition[]>([])
    const [tab, setTab] = useState<'ACCOUNT' | 'OPEN' | 'CLOSED'>('ACCOUNT')
    const [optPrices, setOptPrices] = useState<Record<string, number>>({})
    const [stockPrices, setStockPrices] = useState<Record<string, number>>({})
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const [startBalance, setStartBalance] = useState<number>(() => {
        if (typeof window === 'undefined') return DEFAULT_BALANCE
        try { const v = localStorage.getItem(SP_ACCOUNT_KEY); return v ? parseFloat(v) : DEFAULT_BALANCE } catch { return DEFAULT_BALANCE }
    })
    const [editBalance, setEditBalance] = useState(false)
    const [balanceInput, setBalanceInput] = useState('')

    // ── Load ────────────────────────────────────────────────────────────────────
    useEffect(() => {
        setPositions(spLoad())
        const sync = () => setPositions(spLoad())
        window.addEventListener(SP_ADD_EVENT, sync)
        window.addEventListener('storage', sync)
        return () => { window.removeEventListener(SP_ADD_EVENT, sync); window.removeEventListener('storage', sync) }
    }, [])

    // ── Persist ─────────────────────────────────────────────────────────────────
    useEffect(() => { spSave(positions) }, [positions])

    // ── Price polling ────────────────────────────────────────────────────────────
    const poll = useCallback(async () => {
        const open = positions.filter(p => p.status !== 'CLOSED')
        if (!open.length || !API_KEY) return
        for (const sym of [...new Set(open.map(p => p.symbol))]) {
            try {
                const r = await fetch(`https://api.polygon.io/v2/aggs/ticker/${sym}/prev?apiKey=${API_KEY}`)
                const d = await r.json()
                const price: number | undefined = d?.results?.[0]?.c
                if (price) setStockPrices(prev => ({ ...prev, [sym]: price }))
            } catch { /* ignore */ }
        }
        for (const pos of open) {
            for (const [legKey, type] of [['call', 'C'], ['put', 'P']] as const) {
                const leg = pos[legKey] as StraddleLeg
                if (leg.status === 'CLOSED') continue
                const ticker = optionTicker(pos.symbol, pos.expiration, type, leg.strike)
                try {
                    const r = await fetch(
                        `https://api.polygon.io/v3/snapshot/options/${pos.symbol}/${encodeURIComponent(ticker)}?apiKey=${API_KEY}`
                    )
                    const d = await r.json()
                    const price: number | null = d?.results?.day?.close ?? d?.results?.last_quote?.midpoint ?? null
                    if (price !== null) setOptPrices(prev => ({ ...prev, [ticker]: price }))
                } catch { /* ignore */ }
            }
        }
    }, [positions, API_KEY])

    useEffect(() => {
        poll()
        pollRef.current = setInterval(poll, POLL_MS)
        return () => { if (pollRef.current) clearInterval(pollRef.current) }
    }, [poll])

    // ── Derived ──────────────────────────────────────────────────────────────────
    const legPnl = (pos: StraddlePosition, legKey: 'call' | 'put'): number => {
        const leg = pos[legKey] as StraddleLeg
        const ticker = optionTicker(pos.symbol, pos.expiration, legKey === 'call' ? 'C' : 'P', leg.strike)
        const cur = leg.status === 'CLOSED' ? (leg.closedPrice ?? leg.entryPrice) : (optPrices[ticker] ?? leg.entryPrice)
        return (cur - leg.entryPrice) * 100 * leg.contracts
    }
    const posPnl = (pos: StraddlePosition) => legPnl(pos, 'call') + legPnl(pos, 'put')

    const open = positions.filter(p => p.status !== 'CLOSED')
    const closed = positions.filter(p => p.status === 'CLOSED')
    const openPnl = open.reduce((s, p) => s + posPnl(p), 0)
    const realPnl = closed.reduce((s, p) => s + posPnl(p), 0)
    const totalPnl = openPnl + realPnl
    const wins = closed.filter(p => posPnl(p) > 0).length
    const winRate = closed.length > 0 ? Math.round((wins / closed.length) * 100) : null

    // ── Actions ──────────────────────────────────────────────────────────────────
    const closeLeg = (id: string, legKey: 'call' | 'put') =>
        setPositions(prev => prev.map(p => {
            if (p.id !== id) return p
            const leg = p[legKey] as StraddleLeg
            const ticker = optionTicker(p.symbol, p.expiration, legKey === 'call' ? 'C' : 'P', leg.strike)
            const closePrice = optPrices[ticker] ?? leg.entryPrice
            const updated = { ...p, [legKey]: { ...leg, status: 'CLOSED' as const, closedPrice: closePrice, closedAt: Date.now() } }
            const bothClosed = updated.call.status === 'CLOSED' && updated.put.status === 'CLOSED'
            return { ...updated, status: bothClosed ? 'CLOSED' : 'PARTIAL' }
        }))

    const closeAll = (id: string) =>
        setPositions(prev => prev.map(p => {
            if (p.id !== id) return p
            const callTk = optionTicker(p.symbol, p.expiration, 'C', p.call.strike)
            const putTk = optionTicker(p.symbol, p.expiration, 'P', p.put.strike)
            const now = Date.now()
            return {
                ...p, status: 'CLOSED',
                call: { ...p.call, status: 'CLOSED', closedPrice: optPrices[callTk] ?? p.call.entryPrice, closedAt: now },
                put: { ...p.put, status: 'CLOSED', closedPrice: optPrices[putTk] ?? p.put.entryPrice, closedAt: now },
            }
        }))

    const remove = (id: string) => setPositions(prev => prev.filter(p => p.id !== id))

    const saveBalance = useCallback((val: number) => {
        setStartBalance(val)
        try { localStorage.setItem(SP_ACCOUNT_KEY, String(val)) } catch { }
        setEditBalance(false)
    }, [])

    const losses = closed.length - wins
    const winPnls = closed.filter(p => posPnl(p) > 0).map(p => posPnl(p))
    const lossPnls = closed.filter(p => posPnl(p) <= 0).map(p => posPnl(p))
    const avgWin = winPnls.length > 0 ? winPnls.reduce((a, b) => a + b, 0) / winPnls.length : 0
    const avgLoss = lossPnls.length > 0 ? Math.abs(lossPnls.reduce((a, b) => a + b, 0) / lossPnls.length) : 0
    const profitFactor = losses > 0 && avgLoss > 0 ? (avgWin * wins) / (avgLoss * losses) : wins > 0 ? 999 : 0
    const bestTrade = closed.length > 0 ? Math.max(...closed.map(p => posPnl(p))) : 0
    const worstTrade = closed.length > 0 ? Math.min(...closed.map(p => posPnl(p))) : 0
    const equityPoints = (() => {
        const pts = closed.map(p => ({
            time: Math.max(p.call.closedAt ?? p.addedAt, p.put.closedAt ?? p.addedAt),
            pnl: posPnl(p),
        })).sort((a, b) => a.time - b.time)
        let cum = 0
        return pts.map(pt => { cum += pt.pnl; return { time: pt.time, value: startBalance + cum, pnl: cum } })
    })()
    let ddPeak = startBalance, maxDD = 0
    for (const pt of equityPoints) {
        if (pt.value > ddPeak) ddPeak = pt.value
        const dd = ddPeak > 0 ? (ddPeak - pt.value) / ddPeak * 100 : 0
        if (dd > maxDD) maxDD = dd
    }

    const shown = tab === 'OPEN' ? open : (tab === 'CLOSED' ? closed : [])

    // ── Stat pill ────────────────────────────────────────────────────────────────
    const Stat = ({ label, value, color }: { label: string; value: string; color: string }) => (
        <div style={{ textAlign: 'center', minWidth: 90 }}>
            <div style={{ ...mono, fontSize: 13, color: '#FFFFFF', letterSpacing: '1.2px', marginBottom: 3 }}>{label}</div>
            <div style={{ ...mono, fontSize: 22, fontWeight: 900, color }}>{value}</div>
        </div>
    )

    return (
        <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={e => { if (e.target === e.currentTarget) onClose?.() }}
        >
            <div style={{
                width: 'min(1160px, 96vw)', maxHeight: '88vh',
                background: 'linear-gradient(180deg, #08131f 0%, #040c16 100%)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderTop: '2px solid #FF9A00',
                borderRadius: 12,
                display: 'flex', flexDirection: 'column',
                boxShadow: '0 32px 100px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,154,0,0.08)',
                overflow: 'hidden',
            }}>

                {/* ── Header ─────────────────────────────────────────────────────────── */}
                <div style={{ display: 'flex', alignItems: 'center', padding: '18px 26px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, gap: 20 }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                <polygon points="10,2 18,8 15,18 5,18 2,8" fill="rgba(255,154,0,0.15)" stroke="#FF9A00" strokeWidth="1.5" />
                                <circle cx="10" cy="11" r="3" fill="#FF9A00" opacity="0.8" />
                            </svg>
                            <div style={{ ...mono, fontSize: 25, fontWeight: 900, color: '#FFFFFF', letterSpacing: '2.5px' }}>STRADDLE PORTFOLIO</div>
                        </div>
                        <div style={{ ...mono, fontSize: 13, color: '#FFFFFF', letterSpacing: '1.5px', marginTop: 3, paddingLeft: 30 }}>
                            DEALER &amp; TRADER POSITIONING TRACKER
                        </div>
                    </div>

                    {/* Stat bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 1, marginLeft: 'auto' }}>
                        <Stat label="OPEN P&L" value={fmtUsd(openPnl)} color={openPnl >= 0 ? '#00FF88' : '#FF3050'} />
                        <div style={{ width: 1, height: 40, background: 'rgba(255,255,255,0.07)', margin: '0 14px' }} />
                        <Stat label="REALIZED" value={fmtUsd(realPnl)} color={realPnl >= 0 ? '#00FF88' : '#FF3050'} />
                        <div style={{ width: 1, height: 40, background: 'rgba(255,255,255,0.07)', margin: '0 14px' }} />
                        <Stat label="TOTAL P&L" value={fmtUsd(totalPnl)} color={totalPnl >= 0 ? '#00FF88' : '#FF3050'} />
                        {winRate !== null && <>
                            <div style={{ width: 1, height: 40, background: 'rgba(255,255,255,0.07)', margin: '0 14px' }} />
                            <Stat label="WIN RATE" value={`${winRate}%`} color={winRate >= 55 ? '#00FF88' : winRate >= 40 ? '#FF9A00' : '#FF3050'} />
                        </>}
                        <div style={{ width: 1, height: 40, background: 'rgba(255,255,255,0.07)', margin: '0 14px' }} />
                        <button
                            onClick={onClose}
                            style={{ ...mono, fontSize: 23, color: '#FFFFFF', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 4 }}
                        >✕</button>
                    </div>
                </div>

                {/* ── Tabs ────────────────────────────────────────────────────────────── */}
                <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                    {(['ACCOUNT', 'OPEN', 'CLOSED'] as const).map(t => (
                        <button key={t} onClick={() => setTab(t)} style={{
                            ...mono, fontSize: 16, fontWeight: 800, letterSpacing: '1.5px',
                            padding: '12px 26px', cursor: 'pointer', border: 'none', background: 'none', outline: 'none',
                            color: tab === t ? '#FF9A00' : '#FFFFFF',
                            borderBottom: tab === t ? '2px solid #FF9A00' : '2px solid transparent',
                            transition: 'all 0.12s',
                        }}>
                            {t}{t === 'OPEN' ? ` (${open.length})` : t === 'CLOSED' ? ` (${closed.length})` : ''}
                        </button>
                    ))}
                    <div style={{ flex: 1 }} />
                    <div style={{ ...mono, fontSize: 13, color: '#FFFFFF', letterSpacing: '1px', alignSelf: 'center', paddingRight: 20 }}>
                        PRICES UPDATE EVERY 30s
                    </div>
                </div>

                {/* ── Content ─────────────────────────────────────────────────────────── */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {tab === 'ACCOUNT' ? (
                        <AccountView
                            mono={mono} startBalance={startBalance} editBalance={editBalance}
                            balanceInput={balanceInput} setEditBalance={setEditBalance}
                            setBalanceInput={setBalanceInput} saveBalance={saveBalance}
                            equityPoints={equityPoints} openCount={open.length} closedCount={closed.length}
                            wins={wins} losses={losses} winRate={winRate}
                            avgWin={avgWin} avgLoss={avgLoss} profitFactor={profitFactor}
                            bestTrade={bestTrade} worstTrade={worstTrade} maxDD={maxDD}
                            openPnl={openPnl} realPnl={realPnl} totalPnl={totalPnl}
                        />
                    ) : shown.length === 0 ? (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '60px 0' }}>
                            <div style={{ fontSize: 55, opacity: 0.18 }}>◈</div>
                            <div style={{ ...mono, fontSize: 17, color: '#FFFFFF', letterSpacing: '2.5px' }}>NO {tab} POSITIONS</div>
                            {tab === 'OPEN' && (
                                <div style={{ ...mono, fontSize: 14, color: '#FFFFFF', letterSpacing: '1px', textAlign: 'center', maxWidth: 320, lineHeight: 1.7 }}>
                                    Click <span style={{ color: '#FF9A00' }}>+ ADD TO PORTFOLIO</span> on any active Straddle Town setup
                                </div>
                            )}
                        </div>
                    ) : (
                        shown.map(pos => (
                            <PositionCard
                                key={pos.id}
                                pos={pos}
                                optPrices={optPrices}
                                stockPrice={stockPrices[pos.symbol] ?? null}
                                onCloseLeg={closeLeg}
                                onCloseAll={closeAll}
                                onRemove={remove}
                                mono={mono}
                            />
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}

// ── Position Card ─────────────────────────────────────────────────────────────
function PositionCard({
    pos, optPrices, stockPrice, onCloseLeg, onCloseAll, onRemove, mono,
}: {
    pos: StraddlePosition
    optPrices: Record<string, number>
    stockPrice: number | null
    onCloseLeg: (id: string, leg: 'call' | 'put') => void
    onCloseAll: (id: string) => void
    onRemove: (id: string) => void
    mono: React.CSSProperties
}) {
    const tierColor = pos.tier === 'high-pressure' ? '#FFD700' : '#41B6F6'
    const tierLabel = pos.tier === 'high-pressure' ? 'HIGH PRESSURE' : 'PIVOTAL'

    const callTk = optionTicker(pos.symbol, pos.expiration, 'C', pos.call.strike)
    const putTk = optionTicker(pos.symbol, pos.expiration, 'P', pos.put.strike)

    const callCur = pos.call.status === 'CLOSED' ? (pos.call.closedPrice ?? pos.call.entryPrice) : (optPrices[callTk] ?? null)
    const putCur = pos.put.status === 'CLOSED' ? (pos.put.closedPrice ?? pos.put.entryPrice) : (optPrices[putTk] ?? null)

    const callPnlDollar = callCur !== null ? (callCur - pos.call.entryPrice) * 100 * pos.call.contracts : null
    const putPnlDollar = putCur !== null ? (putCur - pos.put.entryPrice) * 100 * pos.put.contracts : null
    const callPnlPct = callCur !== null && pos.call.entryPrice > 0 ? ((callCur - pos.call.entryPrice) / pos.call.entryPrice) * 100 : null
    const putPnlPct = putCur !== null && pos.put.entryPrice > 0 ? ((putCur - pos.put.entryPrice) / pos.put.entryPrice) * 100 : null
    const totalPnl = (callPnlDollar ?? 0) + (putPnlDollar ?? 0)
    const hasPnl = callPnlDollar !== null || putPnlDollar !== null

    const stockNow = stockPrice ?? pos.stockPriceAtEntry
    const callT1Hit = stockNow >= pos.call.t1Stock
    const callT2Hit = stockNow >= pos.call.t2Stock
    const putT1Hit = stockNow <= pos.put.t1Stock
    const putT2Hit = stockNow <= pos.put.t2Stock

    const statusColors: Record<string, string> = { OPEN: '#00FF88', PARTIAL: '#FF9A00', CLOSED: '#666' }
    const statusColor = statusColors[pos.status]

    return (
        <div style={{
            background: 'linear-gradient(180deg, rgba(10,20,34,0.95) 0%, rgba(4,10,20,0.98) 100%)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderLeft: `3px solid ${tierColor}`,
            borderRadius: 8, overflow: 'hidden',
        }}>

            {/* Card header */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px',
                background: `linear-gradient(90deg, ${tierColor}0a 0%, transparent 60%)`,
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                flexWrap: 'wrap',
            }}>
                <span style={{ ...mono, fontSize: 13, fontWeight: 900, color: tierColor, background: `${tierColor}18`, border: `1px solid ${tierColor}38`, borderRadius: 3, padding: '2px 7px', letterSpacing: '0.8px' }}>
                    {tierLabel}
                </span>
                <span style={{ ...mono, fontSize: 27, fontWeight: 900, color: '#FFFFFF', letterSpacing: '1px' }}>{pos.symbol}</span>
                <span style={{ ...mono, fontSize: 16, color: '#FFFFFF' }}>{fmtExpiry(pos.expiration)}</span>
                <span style={{ ...mono, fontSize: 14, color: '#FFFFFF' }}>
                    Entry ${pos.stockPriceAtEntry.toFixed(2)}
                    {stockPrice && <> → <span style={{ color: '#FFFFFF' }}>${stockPrice.toFixed(2)}</span></>}
                </span>
                <span style={{ ...mono, fontSize: 13, fontWeight: 900, color: statusColor, background: `${statusColor}12`, border: `1px solid ${statusColor}35`, borderRadius: 3, padding: '2px 7px' }}>
                    {pos.status}
                </span>
                {hasPnl && (
                    <span style={{ ...mono, fontSize: 22, fontWeight: 900, color: totalPnl >= 0 ? '#00FF88' : '#FF3050', marginLeft: 'auto' }}>
                        {fmtUsd(totalPnl)}
                    </span>
                )}
                <span style={{ ...mono, fontSize: 13, color: '#FFFFFF' }}>{fmtTs(pos.addedAt)}</span>
            </div>

            {/* Legs */}
            <div style={{ display: 'flex', gap: 8, padding: '12px 14px' }}>
                <Leg type="CALLS" leg={pos.call} ticker={callTk} cur={callCur} pnlD={callPnlDollar} pnlPct={callPnlPct} t1Hit={callT1Hit} t2Hit={callT2Hit} mono={mono} />
                <Leg type="PUTS" leg={pos.put} ticker={putTk} cur={putCur} pnlD={putPnlDollar} pnlPct={putPnlPct} t1Hit={putT1Hit} t2Hit={putT2Hit} mono={mono} />
            </div>

            {/* Action footer */}
            <div style={{ display: 'flex', gap: 7, padding: '8px 14px 12px', borderTop: '1px solid rgba(255,255,255,0.04)', flexWrap: 'wrap' }}>
                {pos.call.status === 'OPEN' && (
                    <ActionBtn label="CLOSE CALL" color="#00FF88" bg="rgba(0,255,136,0.08)" border="rgba(0,255,136,0.22)" onClick={() => onCloseLeg(pos.id, 'call')} mono={mono} />
                )}
                {pos.put.status === 'OPEN' && (
                    <ActionBtn label="CLOSE PUT" color="#FF3050" bg="rgba(255,48,80,0.08)" border="rgba(255,48,80,0.22)" onClick={() => onCloseLeg(pos.id, 'put')} mono={mono} />
                )}
                {pos.call.status === 'OPEN' && pos.put.status === 'OPEN' && (
                    <ActionBtn label="CLOSE ALL" color="#FF9A00" bg="rgba(255,154,0,0.10)" border="rgba(255,154,0,0.28)" onClick={() => onCloseAll(pos.id)} mono={mono} />
                )}
                <div style={{ flex: 1 }} />
                <ActionBtn label="✕ REMOVE" color="#FFFFFF" bg="transparent" border="rgba(255,255,255,0.25)" onClick={() => onRemove(pos.id)} mono={mono} />
            </div>
        </div>
    )
}

function Leg({
    type, leg, ticker: _ticker, cur, pnlD, pnlPct, t1Hit, t2Hit, mono,
}: {
    type: 'CALLS' | 'PUTS'
    leg: StraddleLeg
    ticker: string
    cur: number | null
    pnlD: number | null
    pnlPct: number | null
    t1Hit: boolean
    t2Hit: boolean
    mono: React.CSSProperties
}) {
    const accent = type === 'CALLS' ? '#00FF88' : '#FF3050'
    const bg = type === 'CALLS' ? 'rgba(0,255,136,0.04)' : 'rgba(255,48,80,0.04)'

    return (
        <div style={{ flex: 1, background: bg, border: `1px solid ${accent}18`, borderRadius: 7, padding: '12px 14px' }}>

            {/* Leg title row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ ...mono, fontSize: 18, fontWeight: 900, color: accent, letterSpacing: '0.5px' }}>
                    ${leg.strike} {type}
                </span>
                {leg.status === 'CLOSED' && (
                    <span style={{ ...mono, fontSize: 13, color: '#AAAAAA', background: '#111', border: '1px solid #444', borderRadius: 3, padding: '1px 5px' }}>CLOSED</span>
                )}
                {pnlD !== null && (
                    <span style={{ ...mono, fontSize: 18, fontWeight: 900, color: pnlD >= 0 ? '#00FF88' : '#FF3050', marginLeft: 'auto' }}>
                        {fmtUsd(pnlD)}
                    </span>
                )}
            </div>

            {/* Price grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                    <div style={{ ...mono, fontSize: 12, color: '#FFFFFF', letterSpacing: '1.2px', marginBottom: 3 }}>ENTRY</div>
                    <div style={{ ...mono, fontSize: 21, fontWeight: 800, color: '#FFFFFF' }}>${leg.entryPrice.toFixed(2)}</div>
                    <div style={{ ...mono, fontSize: 13, color: '#FFFFFF' }}>{leg.contracts} contract{leg.contracts > 1 ? 's' : ''}</div>
                </div>
                <div>
                    <div style={{ ...mono, fontSize: 12, color: '#FFFFFF', letterSpacing: '1.2px', marginBottom: 3 }}>NOW</div>
                    <div style={{ ...mono, fontSize: 21, fontWeight: 800, color: cur !== null ? accent : '#FFFFFF' }}>
                        {cur !== null ? `$${cur.toFixed(2)}` : '—'}
                    </div>
                    {pnlPct !== null && (
                        <div style={{ ...mono, fontSize: 13, fontWeight: 700, color: pnlPct >= 0 ? '#00FF88' : '#FF3050' }}>
                            {fmtPct(pnlPct)}
                        </div>
                    )}
                </div>
            </div>

            {/* Target badges */}
            <div style={{ display: 'flex', gap: 5 }}>
                {[
                    { label: `T1 $${leg.t1Stock.toFixed(2)}`, hit: t1Hit },
                    { label: `T2 $${leg.t2Stock.toFixed(2)}`, hit: t2Hit },
                ].map(({ label, hit }) => (
                    <div key={label} style={{
                        ...mono, fontSize: 13, fontWeight: 700,
                        padding: '3px 8px', borderRadius: 4,
                        background: hit ? `${accent}1a` : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${hit ? accent + '50' : 'rgba(255,255,255,0.08)'}`,
                        color: hit ? accent : '#FFFFFF',
                    }}>
                        {hit ? '✓ ' : ''}{label}
                    </div>
                ))}
            </div>
        </div>
    )
}

function ActionBtn({
    label, color, bg, border, onClick, mono,
}: {
    label: string
    color: string
    bg: string
    border: string
    onClick: () => void
    mono: React.CSSProperties
}) {
    return (
        <button onClick={onClick} style={{
            ...mono, fontSize: 14, fontWeight: 800, letterSpacing: '0.8px',
            padding: '6px 14px', cursor: 'pointer', borderRadius: 4,
            background: bg, color, border: `1px solid ${border}`, outline: 'none',
            transition: 'opacity 0.1s',
        }}>
            {label}
        </button>
    )
}

// ── Equity Chart ────────────────────────────────────────────────────────────────────────────────
function EquityChart({ points, startBalance }: {
    points: { time: number; value: number; pnl: number }[]
    startBalance: number
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null)

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        const DPR = window.devicePixelRatio || 1
        const cssW = canvas.offsetWidth
        const cssH = canvas.offsetHeight
        canvas.width = cssW * DPR
        canvas.height = cssH * DPR
        ctx.scale(DPR, DPR)

        const pad = { top: 24, right: 130, bottom: 52, left: 86 }
        const cW = cssW - pad.left - pad.right
        const cH = cssH - pad.top - pad.bottom

        ctx.clearRect(0, 0, cssW, cssH)

        const startPt = { time: points.length > 0 ? points[0].time - 3_600_000 : Date.now() - 86_400_000, value: startBalance, pnl: 0 }
        const endPt = { time: Date.now(), value: (points[points.length - 1]?.value ?? startBalance), pnl: (points[points.length - 1]?.pnl ?? 0) }
        const allPts = [startPt, ...points, endPt]

        const minV = Math.min(...allPts.map(p => p.value)) * 0.992
        const maxV = Math.max(...allPts.map(p => p.value)) * 1.008
        const minT = allPts[0].time
        const maxT = allPts[allPts.length - 1].time
        // Always show at least 7 days so the X-axis has meaningful spread
        const MIN_SPAN = 7 * 86_400_000
        const displayMax = maxT
        const displayMin = Math.min(minT, maxT - MIN_SPAN)

        const xS = (t: number) => pad.left + ((t - displayMin) / ((displayMax - displayMin) || 1)) * cW
        const yS = (v: number) => pad.top + cH - ((v - minV) / ((maxV - minV) || 1)) * cH

        // grid
        ctx.strokeStyle = 'rgba(255,255,255,0.055)'
        ctx.lineWidth = 1
        for (let i = 0; i <= 5; i++) {
            const y = pad.top + (cH / 5) * i
            ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cW, y); ctx.stroke()
        }

        // zero line
        const zy = yS(startBalance)
        ctx.strokeStyle = 'rgba(255,255,255,0.22)'
        ctx.lineWidth = 1
        ctx.setLineDash([5, 5])
        ctx.beginPath(); ctx.moveTo(pad.left, zy); ctx.lineTo(pad.left + cW, zy); ctx.stroke()
        ctx.setLineDash([])

        const lastPnl = allPts[allPts.length - 1].pnl
        const lineColor = lastPnl >= 0 ? '#00FF88' : '#FF3050'

        // fill
        const fillGrad = ctx.createLinearGradient(0, pad.top, 0, pad.top + cH)
        fillGrad.addColorStop(0, lastPnl >= 0 ? 'rgba(0,255,136,0.25)' : 'rgba(255,48,80,0.25)')
        fillGrad.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.beginPath()
        ctx.moveTo(xS(allPts[0].time), zy)
        for (const p of allPts) ctx.lineTo(xS(p.time), yS(p.value))
        ctx.lineTo(xS(allPts[allPts.length - 1].time), zy)
        ctx.closePath()
        ctx.fillStyle = fillGrad
        ctx.fill()

        // line
        ctx.beginPath()
        ctx.moveTo(xS(allPts[0].time), yS(allPts[0].value))
        for (const p of allPts) ctx.lineTo(xS(p.time), yS(p.value))
        ctx.strokeStyle = lineColor
        ctx.lineWidth = 2.5
        ctx.stroke()

        // trade dots
        for (const p of points) {
            ctx.beginPath(); ctx.arc(xS(p.time), yS(p.value), 5, 0, Math.PI * 2)
            ctx.fillStyle = p.pnl >= 0 ? '#00FF88' : '#FF3050'; ctx.fill()
            ctx.strokeStyle = '#040c16'; ctx.lineWidth = 2; ctx.stroke()
        }

        // Y labels
        ctx.fillStyle = '#FFFFFF'
        ctx.font = 'bold 14px JetBrains Mono, monospace'
        ctx.textAlign = 'right'
        for (let i = 0; i <= 5; i++) {
            const v = minV + ((maxV - minV) / 5) * (5 - i)
            ctx.fillText(`$${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(0)}`, pad.left - 10, pad.top + (cH / 5) * i + 5)
        }

        // X axis line
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'
        ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(pad.left, pad.top + cH); ctx.lineTo(pad.left + cW, pad.top + cH); ctx.stroke()

        // X labels — 6 evenly spaced across displayMin→displayMax, skip if too close
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        ctx.fillStyle = '#FFFFFF'
        ctx.font = '13px JetBrains Mono, monospace'
        ctx.textAlign = 'center'
        let lastLabelX = -999
        for (let i = 0; i <= 6; i++) {
            const t = displayMin + ((displayMax - displayMin) / 6) * i
            const x = xS(t)
            if (x - lastLabelX < 72) continue
            lastLabelX = x
            const d = new Date(t)
            const lbl = `${months[d.getMonth()]} ${d.getDate()}`
            ctx.strokeStyle = 'rgba(255,255,255,0.1)'
            ctx.lineWidth = 1
            ctx.beginPath(); ctx.moveTo(x, pad.top + cH); ctx.lineTo(x, pad.top + cH + 5); ctx.stroke()
            ctx.fillText(lbl, x, pad.top + cH + 20)
        }

        // end value label
        const last = allPts[allPts.length - 1]
        ctx.fillStyle = lineColor
        ctx.font = 'bold 15px JetBrains Mono, monospace'
        ctx.textAlign = 'left'
        ctx.fillText(`$${last.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, xS(last.time) + 10, yS(last.value) + 5)

        // P&L label
        ctx.fillStyle = last.pnl >= 0 ? '#00FF88' : '#FF3050'
        ctx.font = '12px JetBrains Mono, monospace'
        ctx.fillText(`${last.pnl >= 0 ? '+' : ''}$${last.pnl.toFixed(0)}`, xS(last.time) + 10, yS(last.value) + 22)
    }, [points, startBalance])

    return <canvas ref={canvasRef} style={{ width: '100%', height: 240, display: 'block', borderRadius: 4 }} />
}

// ── Account View ───────────────────────────────────────────────────────────────────────────────
function AccountView({ mono, startBalance, editBalance, balanceInput, setEditBalance, setBalanceInput, saveBalance, equityPoints, openCount, closedCount, wins, losses, winRate, avgWin, avgLoss, profitFactor, bestTrade, worstTrade, maxDD, openPnl, realPnl, totalPnl }: {
    mono: React.CSSProperties
    startBalance: number
    editBalance: boolean
    balanceInput: string
    setEditBalance: (v: boolean) => void
    setBalanceInput: (v: string) => void
    saveBalance: (v: number) => void
    equityPoints: { time: number; value: number; pnl: number }[]
    openCount: number
    closedCount: number
    wins: number
    losses: number
    winRate: number | null
    avgWin: number
    avgLoss: number
    profitFactor: number
    bestTrade: number
    worstTrade: number
    maxDD: number
    openPnl: number
    realPnl: number
    totalPnl: number
}) {
    const netValue = startBalance + totalPnl
    const netPct = startBalance > 0 ? (totalPnl / startBalance) * 100 : 0

    const stats = [
        { label: 'OPEN POSITIONS', value: String(openCount), color: '#FF9A00' },
        { label: 'CLOSED TRADES', value: String(closedCount), color: '#FFFFFF' },
        { label: 'WINS', value: String(wins), color: '#00FF88' },
        { label: 'LOSSES', value: String(losses), color: '#FF3050' },
        { label: 'WIN RATE', value: winRate !== null ? `${winRate}%` : '—', color: winRate !== null ? (winRate >= 55 ? '#00FF88' : winRate >= 40 ? '#FF9A00' : '#FF3050') : '#FFFFFF' },
        { label: 'PROFIT FACTOR', value: avgLoss > 0 ? profitFactor.toFixed(2) : wins > 0 ? '∞' : '—', color: profitFactor >= 1.5 ? '#00FF88' : profitFactor >= 1 ? '#FF9A00' : '#FF3050' },
        { label: 'AVG WIN', value: avgWin > 0 ? `+$${avgWin.toFixed(0)}` : '—', color: '#00FF88' },
        { label: 'AVG LOSS', value: avgLoss > 0 ? `-$${avgLoss.toFixed(0)}` : '—', color: '#FF3050' },
        { label: 'BEST TRADE', value: bestTrade !== 0 ? fmtUsd(bestTrade) : '—', color: '#00FF88' },
        { label: 'WORST TRADE', value: worstTrade !== 0 ? fmtUsd(worstTrade) : '—', color: '#FF3050' },
        { label: 'MAX DRAWDOWN', value: maxDD > 0 ? `-${maxDD.toFixed(1)}%` : '—', color: maxDD > 10 ? '#FF3050' : maxDD > 5 ? '#FF9A00' : '#00FF88' },
        { label: 'OPEN P&L', value: fmtUsd(openPnl), color: openPnl >= 0 ? '#00FF88' : '#FF3050' },
        { label: 'REALIZED P&L', value: fmtUsd(realPnl), color: realPnl >= 0 ? '#00FF88' : '#FF3050' },
        { label: 'TOTAL P&L', value: fmtUsd(totalPnl), color: totalPnl >= 0 ? '#00FF88' : '#FF3050' },
    ]

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Net value banner */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(255,154,0,0.08) 0%, rgba(4,12,22,0.95) 60%)',
                border: '1px solid rgba(255,154,0,0.25)', borderLeft: '4px solid #FF9A00',
                borderRadius: 10, padding: '22px 28px',
                display: 'flex', alignItems: 'flex-end', gap: 40, flexWrap: 'wrap',
            }}>
                <div>
                    <div style={{ ...mono, fontSize: 12, color: '#FFFFFF', letterSpacing: '2.5px', marginBottom: 6 }}>NET ACCOUNT VALUE</div>
                    <div style={{ ...mono, fontSize: 54, fontWeight: 900, color: netValue >= startBalance ? '#00FF88' : '#FF3050', lineHeight: 1, letterSpacing: '-1px' }}>
                        ${netValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div style={{ ...mono, fontSize: 15, marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ color: totalPnl >= 0 ? '#00FF88' : '#FF3050', fontWeight: 700 }}>{fmtUsd(totalPnl)}</span>
                        <span style={{ color: totalPnl >= 0 ? '#00FF88' : '#FF3050' }}>({netPct >= 0 ? '+' : ''}{netPct.toFixed(2)}%)</span>
                        <span style={{ color: '#FFFFFF' }}>all time</span>
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 4 }}>
                    <div style={{ ...mono, fontSize: 12, color: '#FFFFFF', letterSpacing: '1.5px' }}>STARTING BALANCE</div>
                    {editBalance ? (
                        <form onSubmit={e => { e.preventDefault(); const v = parseFloat(balanceInput); if (!isNaN(v) && v > 0) saveBalance(v) }} style={{ display: 'flex', gap: 8 }}>
                            <input
                                autoFocus value={balanceInput} onChange={e => setBalanceInput(e.target.value)}
                                onBlur={() => { const v = parseFloat(balanceInput); if (!isNaN(v) && v > 0) saveBalance(v); else setEditBalance(false) }}
                                style={{ ...mono, fontSize: 18, fontWeight: 700, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,154,0,0.6)', borderRadius: 6, padding: '5px 14px', color: '#FFFFFF', outline: 'none', width: 160 }}
                            />
                            <button type="submit" style={{ ...mono, fontSize: 13, fontWeight: 800, background: 'rgba(255,154,0,0.15)', border: '1px solid rgba(255,154,0,0.4)', color: '#FF9A00', borderRadius: 6, padding: '5px 14px', cursor: 'pointer' }}>SAVE</button>
                        </form>
                    ) : (
                        <button onClick={() => { setEditBalance(true); setBalanceInput(String(startBalance)) }} style={{
                            ...mono, fontSize: 22, fontWeight: 900, color: '#FF9A00', background: 'none', border: 'none',
                            cursor: 'pointer', padding: 0, textAlign: 'left', letterSpacing: '0.5px',
                        }}>
                            ${startBalance.toLocaleString()}
                            <span style={{ ...mono, fontSize: 12, color: '#FFFFFF', marginLeft: 10, fontWeight: 400 }}>✎ edit</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
                {stats.map(({ label, value, color }) => (
                    <div key={label} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '12px 14px' }}>
                        <div style={{ ...mono, fontSize: 12, fontWeight: 700, color: '#FFFFFF', letterSpacing: '1.2px', marginBottom: 6 }}>{label}</div>
                        <div style={{ ...mono, fontSize: 20, fontWeight: 900, color }}>{value}</div>
                    </div>
                ))}
            </div>

            {/* Equity curve */}
            <div style={{ background: 'rgba(255,255,255,0.018)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '18px 20px 12px' }}>
                <div style={{ ...mono, fontSize: 12, color: '#FFFFFF', letterSpacing: '2.5px', marginBottom: 12 }}>EQUITY CURVE</div>
                {equityPoints.length === 0 ? (
                    <div style={{ ...mono, fontSize: 14, color: '#FFFFFF', textAlign: 'center', padding: '40px 0', opacity: 0.5 }}>
                        Close your first position to build the equity curve
                    </div>
                ) : (
                    <EquityChart points={equityPoints} startBalance={startBalance} />
                )}
            </div>
        </div>
    )
}
