'use client'

import React, {
    useState,
    useEffect,
    useRef,
    useCallback,
    forwardRef,
    useImperativeHandle,
} from 'react'

const POLYGON_API_KEY = process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''
const STARTING_BALANCE = 25_000
const STORAGE_KEY = 'bss_portfolio_v3'
const POLL_INTERVAL_MS = 30_000

// ─── Types ────────────────────────────────────────────────────────────────────
export interface PortfolioTrade {
    id: string
    symbol: string
    signal: 'BUY' | 'SELL'
    optionDesc: string
    strike: number
    expiration: string
    optionType: 'call' | 'put'
    optionTicker: string
    entryPrice: number
    contractsOpen: number
    stopLossTarget: number
    t1Target: number
    t2Target: number
    t1Filled: boolean
    t1FillPrice: number
    t2Filled: boolean
    t2FillPrice: number
    currentPrice: number
    lastUpdated: number
    addedAt: number
    status: 'OPEN' | 'PARTIAL' | 'CLOSED'
    realizedPnl: number
    notes: string
    autoSellArmed: boolean
    // rich scanner data
    score?: number
    label?: string
    currentStockPrice?: number
    priceChangePct?: number
    dte?: number
    t1Stock?: number
    t2Stock?: number
    stopPremium?: number
    seasonality?: AddTradePayload['seasonality']
}

export interface AddTradePayload {
    symbol: string
    signal: 'BUY' | 'SELL'
    optionDesc: string
    strike: number
    expiration: string
    optionType: 'call' | 'put'
    entryPrice: number
    // rich scanner data
    score?: number
    label?: string
    currentStockPrice?: number
    priceChangePct?: number
    dte?: number
    t1Stock?: number
    t2Stock?: number
    stopPremium?: number
    seasonality?: {
        sweetSpot?: { period: string; totalReturn: number }
        painPoint?: { period: string; totalReturn: number }
        best30Day?: { period: string; return: number }
        inSweetSpot?: boolean
        inPainPoint?: boolean
        seasonallyConfirmed?: boolean
    }
}

export interface PortfolioRef {
    addTrade: (payload: AddTradePayload) => void
}

interface PortfolioAlert {
    id: string
    symbol: string
    type: 'ADDED' | 'T1_HIT' | 'T2_HIT' | 'GAP_FILL' | 'EXPIRY_WARN' | 'STOP_LOSS' | 'CLOSED'
    message: string
    timestamp: number
    read: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function uid(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function buildOptionTicker(
    symbol: string,
    expiration: string,
    type: 'call' | 'put',
    strike: number,
): string {
    const [y, m, d] = expiration.split('-')
    const dateStr = y.slice(2) + m + d
    const typeChar = type === 'call' ? 'C' : 'P'
    const strikeStr = Math.round(strike * 1000).toString().padStart(8, '0')
    return `O:${symbol}${dateStr}${typeChar}${strikeStr}`
}

async function fetchOptionPrice(optionTicker: string, symbol: string): Promise<number | null> {
    try {
        const url = `https://api.polygon.io/v3/snapshot/options/${encodeURIComponent(symbol)}/${encodeURIComponent(optionTicker)}?apiKey=${POLYGON_API_KEY}`
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) return null
        const json = await res.json()
        const r = json.results
        if (!r) return null
        return r.last_quote?.midpoint ?? r.last_trade?.price ?? r.day?.close ?? null
    } catch {
        return null
    }
}

function loadData(): {
    trades: PortfolioTrade[]
    alerts: PortfolioAlert[]
    notes: string
    cashBalance: number
    equityHistory: { ts: number; value: number }[]
} {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) {
            const d = JSON.parse(raw)
            return {
                trades: (d.trades ?? []).map((t: PortfolioTrade) => ({ autoSellArmed: true, ...t })),
                alerts: d.alerts ?? [],
                notes: d.notes ?? '',
                cashBalance: d.cashBalance ?? STARTING_BALANCE,
                equityHistory: d.equityHistory ?? [{ ts: Date.now(), value: STARTING_BALANCE }],
            }
        }
    } catch { }
    return { trades: [], alerts: [], notes: '', cashBalance: STARTING_BALANCE, equityHistory: [{ ts: Date.now(), value: STARTING_BALANCE }] }
}

function fmtTs(ts: number): string {
    return new Date(ts).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

function fmtUsd(val: number, sign = true): string {
    const abs = Math.abs(val).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })
    if (!sign) return `$${abs}`
    return `${val >= 0 ? '+' : '-'}$${abs}`
}

function fmtPct(val: number): string {
    return `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`
}

// ─── Component ────────────────────────────────────────────────────────────────
const BuySellPortfolio = forwardRef<PortfolioRef, { onClose: () => void }>(
    function BuySellPortfolio({ onClose }, ref) {
        const [trades, setTrades] = useState<PortfolioTrade[]>([])
        const [alerts, setAlerts] = useState<PortfolioAlert[]>([])
        const [notes, setNotes] = useState('')
        const [cashBalance, setCashBalance] = useState(STARTING_BALANCE)
        const [equityHistory, setEquityHistory] = useState<{ ts: number; value: number }[]>([{ ts: Date.now(), value: STARTING_BALANCE }])
        const [tab, setTab] = useState<'POSITIONS' | 'ALERTS'>('POSITIONS')
        const [expandedId, setExpandedId] = useState<string | null>(null)
        const [editNoteId, setEditNoteId] = useState<string | null>(null)
        const [noteInput, setNoteInput] = useState('')
        const [polling, setPolling] = useState(false)
        const [dbLoaded, setDbLoaded] = useState(false)

        const tradesRef = useRef(trades)
        tradesRef.current = trades
        const cashRef = useRef(cashBalance)
        cashRef.current = cashBalance

        // ─── Load from DB on mount (fallback to localStorage) ─────────────────────
        useEffect(() => {
            const hydrate = (d: ReturnType<typeof loadData>) => {
                setTrades(d.trades)
                setAlerts(d.alerts)
                setNotes(d.notes)
                setCashBalance(d.cashBalance)
                setEquityHistory(d.equityHistory)
            }
            fetch('/api/portfolio')
                .then((r) => r.json())
                .then((json) => {
                    if (json.data) {
                        const d = json.data
                        hydrate({
                            trades: (d.trades ?? []).map((t: PortfolioTrade) => ({ autoSellArmed: true, ...t })),
                            alerts: d.alerts ?? [],
                            notes: d.notes ?? '',
                            cashBalance: d.cashBalance ?? STARTING_BALANCE,
                            equityHistory: d.equityHistory ?? [{ ts: Date.now(), value: STARTING_BALANCE }],
                        })
                    } else {
                        // No DB record yet — try localStorage
                        hydrate(loadData())
                    }
                })
                .catch(() => {
                    // API unavailable — fall back to localStorage
                    hydrate(loadData())
                })
                .finally(() => setDbLoaded(true))
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [])

        // ─── Persist to localStorage (fast, offline cache) ────────────────────────
        useEffect(() => {
            if (!dbLoaded) return
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify({ trades, alerts, notes, cashBalance, equityHistory }))
            } catch { }
        }, [trades, alerts, notes, cashBalance, equityHistory, dbLoaded])

        // ─── Persist to database (debounced 2 s) ──────────────────────────────────
        const dbSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
        useEffect(() => {
            if (!dbLoaded) return
            if (dbSaveTimer.current) clearTimeout(dbSaveTimer.current)
            dbSaveTimer.current = setTimeout(() => {
                fetch('/api/portfolio', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ trades, alerts, notes, cashBalance, equityHistory }),
                }).catch(() => { /* silently ignore — localStorage still has the data */ })
            }, 2000)
            return () => {
                if (dbSaveTimer.current) clearTimeout(dbSaveTimer.current)
            }
        }, [trades, alerts, notes, cashBalance, equityHistory, dbLoaded])

        // ─── Auto-sell logic ──────────────────────────────────────────────────────
        const processTrade = useCallback(
            (
                trade: PortfolioTrade,
                newPrice: number,
            ): { trade: PortfolioTrade; newAlerts: PortfolioAlert[]; cashDelta: number } => {
                const newAlerts: PortfolioAlert[] = []
                let cashDelta = 0
                const t = { ...trade, currentPrice: newPrice, lastUpdated: Date.now() }

                if (t.status === 'CLOSED') return { trade: t, newAlerts, cashDelta }

                // First poll after adding: just establish current price, arm for future auto-sell
                if (!t.autoSellArmed) {
                    t.autoSellArmed = true
                    return { trade: t, newAlerts, cashDelta }
                }

                // Stop loss: price drops to or below stopLossTarget → sell all contracts
                if (newPrice <= t.stopLossTarget && t.contractsOpen > 0) {
                    const proceeds = newPrice * 100 * t.contractsOpen
                    cashDelta += proceeds
                    t.realizedPnl += (newPrice - t.entryPrice) * 100 * t.contractsOpen
                    t.contractsOpen = 0
                    t.status = 'CLOSED'
                    newAlerts.push({
                        id: uid(),
                        symbol: t.symbol,
                        type: 'STOP_LOSS',
                        message: `${t.symbol} ⚠ STOP LOSS — All ${trade.contractsOpen}x sold @ $${newPrice.toFixed(2)} (${fmtPct((newPrice / t.entryPrice - 1) * 100)}) — CLOSED`,
                        timestamp: Date.now(),
                        read: false,
                    })
                    return { trade: t, newAlerts, cashDelta }
                }

                // Gap: price jumps past T2 without hitting T1 first — sell all contracts
                if (!t.t1Filled && newPrice >= t.t2Target) {
                    cashDelta = newPrice * 100 * t.contractsOpen
                    t.realizedPnl += (newPrice - t.entryPrice) * 100 * t.contractsOpen
                    t.t1Filled = true
                    t.t1FillPrice = newPrice
                    t.t2Filled = true
                    t.t2FillPrice = newPrice
                    t.contractsOpen = 0
                    t.status = 'CLOSED'
                    newAlerts.push({
                        id: uid(),
                        symbol: t.symbol,
                        type: 'GAP_FILL',
                        message: `${t.symbol} ★ GAP FILL — All ${trade.contractsOpen}x sold @ $${newPrice.toFixed(2)} (${fmtPct((newPrice / t.entryPrice - 1) * 100)}) — CLOSED`,
                        timestamp: Date.now(),
                        read: false,
                    })
                    return { trade: t, newAlerts, cashDelta }
                }

                // T1: 80% profit → sell 1 contract
                if (!t.t1Filled && newPrice >= t.t1Target) {
                    const profit1 = (newPrice - t.entryPrice) * 100
                    cashDelta += newPrice * 100
                    t.realizedPnl += profit1
                    t.t1Filled = true
                    t.t1FillPrice = newPrice
                    t.contractsOpen -= 1
                    t.status = t.contractsOpen > 0 ? 'PARTIAL' : 'CLOSED'
                    newAlerts.push({
                        id: uid(),
                        symbol: t.symbol,
                        type: 'T1_HIT',
                        message: `${t.symbol} ✓ T1 HIT — 1x sold @ $${newPrice.toFixed(2)} | Profit: ${fmtUsd(profit1)} (+80% target)`,
                        timestamp: Date.now(),
                        read: false,
                    })
                }

                // T2: 150% profit → sell remaining
                if (t.t1Filled && !t.t2Filled && newPrice >= t.t2Target && t.contractsOpen > 0) {
                    const profit2 = (newPrice - t.entryPrice) * 100 * t.contractsOpen
                    cashDelta += newPrice * 100 * t.contractsOpen
                    t.realizedPnl += profit2
                    t.t2Filled = true
                    t.t2FillPrice = newPrice
                    t.contractsOpen = 0
                    t.status = 'CLOSED'
                    newAlerts.push({
                        id: uid(),
                        symbol: t.symbol,
                        type: 'T2_HIT',
                        message: `${t.symbol} ✓✓ T2 HIT — 1x sold @ $${newPrice.toFixed(2)} | Profit: ${fmtUsd(profit2)} (+150% target)`,
                        timestamp: Date.now(),
                        read: false,
                    })
                    newAlerts.push({
                        id: uid(),
                        symbol: t.symbol,
                        type: 'CLOSED',
                        message: `${t.symbol} POSITION CLOSED — Total realized: ${fmtUsd(t.realizedPnl)}`,
                        timestamp: Date.now(),
                        read: false,
                    })
                }

                return { trade: t, newAlerts, cashDelta }
            },
            [],
        )

        // ─── Polling ──────────────────────────────────────────────────────────────
        useEffect(() => {
            const poll = async () => {
                const openTrades = tradesRef.current.filter((t) => t.status !== 'CLOSED')
                if (openTrades.length === 0) return

                setPolling(true)
                const updates = [...tradesRef.current]
                const newAlerts: PortfolioAlert[] = []
                let cashDelta = 0

                await Promise.all(
                    openTrades.map(async (trade) => {
                        const price = await fetchOptionPrice(trade.optionTicker, trade.symbol)
                        if (!price || price <= 0) return
                        const idx = updates.findIndex((t) => t.id === trade.id)
                        if (idx === -1) return
                        const result = processTrade(updates[idx], price)
                        updates[idx] = result.trade
                        newAlerts.push(...result.newAlerts)
                        cashDelta += result.cashDelta
                    }),
                )

                setTrades([...updates])
                if (cashDelta > 0) setCashBalance((prev) => prev + cashDelta)
                if (newAlerts.length > 0)
                    setAlerts((prev) => [...newAlerts, ...prev].slice(0, 300))
                setPolling(false)
            }

            const id = setInterval(poll, POLL_INTERVAL_MS)
            poll()
            return () => clearInterval(id)
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [])

        // ─── Expose addTrade ──────────────────────────────────────────────────────
        useImperativeHandle(ref, () => ({
            addTrade(payload: AddTradePayload) {
                const optionTicker = buildOptionTicker(
                    payload.symbol,
                    payload.expiration,
                    payload.optionType,
                    payload.strike,
                )
                const cost = payload.entryPrice * 100 * 2
                const trade: PortfolioTrade = {
                    id: uid(),
                    ...payload,
                    optionTicker,
                    contractsOpen: 2,
                    stopLossTarget: payload.entryPrice * 0.5,
                    t1Target: payload.entryPrice * 1.8,
                    t2Target: payload.entryPrice * 2.5,
                    t1Filled: false,
                    t1FillPrice: 0,
                    t2Filled: false,
                    t2FillPrice: 0,
                    currentPrice: payload.entryPrice,
                    lastUpdated: Date.now(),
                    addedAt: Date.now(),
                    status: 'OPEN',
                    realizedPnl: 0,
                    notes: '',
                    autoSellArmed: false,
                }
                setTrades((prev) => [trade, ...prev])
                setCashBalance((prev) => prev - cost)
                setAlerts((prev) => [
                    {
                        id: uid(),
                        symbol: payload.symbol,
                        type: 'ADDED',
                        message: `${payload.symbol} — ${payload.optionDesc} × 2 contracts @ $${payload.entryPrice.toFixed(2)} (cost: ${fmtUsd(cost, false)})`,
                        timestamp: Date.now(),
                        read: false,
                    },
                    ...prev,
                ])
                setTab('POSITIONS')
            },
        }))

        // ─── Computed ─────────────────────────────────────────────────────────────
        const openTrades = trades.filter((t) => t.status !== 'CLOSED')
        const unrealizedPnl = openTrades.reduce(
            (s, t) => s + (t.currentPrice - t.entryPrice) * 100 * t.contractsOpen,
            0,
        )
        const totalRealizedPnl = trades.reduce((s, t) => s + t.realizedPnl, 0)
        const openMarketValue = openTrades.reduce(
            (s, t) => s + t.currentPrice * 100 * t.contractsOpen,
            0,
        )
        const totalAccountValue = cashBalance + openMarketValue
        const totalReturn = ((totalAccountValue - STARTING_BALANCE) / STARTING_BALANCE) * 100
        const unreadCount = alerts.filter((a) => !a.read).length

        // ─── Equity snapshot (throttled to once per minute) ───────────────────────
        const lastSnapshotRef = useRef(0)
        useEffect(() => {
            const now = Date.now()
            if (now - lastSnapshotRef.current < 60_000) return
            lastSnapshotRef.current = now
            setEquityHistory((prev) => {
                const next = [...prev, { ts: now, value: totalAccountValue }].slice(-200)
                return next
            })
        }, [totalAccountValue])

        const deleteTrade = (id: string) => {
            const trade = trades.find((t) => t.id === id)
            if (!trade) return
            if (trade.status !== 'CLOSED') {
                const proceeds = trade.currentPrice * 100 * trade.contractsOpen
                const pnl = (trade.currentPrice - trade.entryPrice) * 100 * trade.contractsOpen
                setCashBalance((prev) => prev + proceeds)
                setAlerts((prev) => [
                    {
                        id: uid(),
                        symbol: trade.symbol,
                        type: 'CLOSED',
                        message: `${trade.symbol} MANUALLY CLOSED @ $${trade.currentPrice.toFixed(2)} | P&L: ${fmtUsd(pnl)} | Proceeds: ${fmtUsd(proceeds, false)}`,
                        timestamp: Date.now(),
                        read: false,
                    },
                    ...prev,
                ])
            }
            setTrades((prev) => prev.filter((t) => t.id !== id))
        }

        const clearClosed = () => setTrades((prev) => prev.filter((t) => t.status !== 'CLOSED'))
        const markAllRead = () => setAlerts((prev) => prev.map((a) => ({ ...a, read: true })))
        const resetPortfolio = () => {
            if (!confirm('Reset entire portfolio? This cannot be undone.')) return
            setTrades([])
            setAlerts([])
            setCashBalance(STARTING_BALANCE)
        }

        // ─── Styles ───────────────────────────────────────────────────────────────
        const mono: React.CSSProperties = {
            fontFamily: '"JetBrains Mono","Courier New",monospace',
        }

        const metricBox = (label: string, value: string, color: string) => (
            <div style={{ padding: '16px 18px', background: 'linear-gradient(180deg,#0c0c0c 0%,#0a0a0a 100%)' }}>
                <div
                    style={{
                        ...mono,
                        fontSize: 11,
                        letterSpacing: 2.5,
                        color: '#00E5FF',
                        marginBottom: 8,
                        textTransform: 'uppercase' as const,
                    }}
                >
                    {label}
                </div>
                <div style={{ ...mono, fontSize: 24, fontWeight: 900, color, letterSpacing: 0.5 }}>{value}</div>
            </div>
        )

        return (
            <div
                style={{
                    position: 'fixed',
                    top: 90,
                    right: 0,
                    bottom: 0,
                    width: 900,
                    background: '#000000',
                    borderLeft: '2px solid rgba(255,255,255,0.12)',
                    display: 'flex',
                    flexDirection: 'column',
                    zIndex: 1000,
                    overflow: 'hidden',
                    fontFamily: '"JetBrains Mono","Courier New",monospace',
                    boxShadow: '-8px 0 40px rgba(0,0,0,0.6)',
                }}
            >
                {!dbLoaded && (
                    <div style={{
                        position: 'absolute', inset: 0, background: 'rgba(10,15,30,0.92)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 10, fontFamily: '"JetBrains Mono","Courier New",monospace',
                        fontSize: 14, letterSpacing: 3, color: '#00E5FF',
                    }}>
                        ◆ LOADING PORTFOLIO...
                    </div>
                )}
                {/* ── Header ── */}
                <div
                    style={{
                        padding: '18px 20px 0',
                        borderBottom: '1px solid rgba(255,255,255,0.08)',
                        background: 'linear-gradient(180deg,#080808 0%,#000000 100%)',
                        flexShrink: 0,
                    }}
                >
                    {/* Title row */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            marginBottom: 16,
                        }}
                    >
                        <div>
                            <div
                                style={{
                                    ...mono,
                                    fontSize: 36,
                                    fontWeight: 900,
                                    letterSpacing: 4,
                                    color: '#fff',
                                    textShadow: '0 2px 16px rgba(255,255,255,0.15)',
                                }}
                            >
                                PORTFOLIO
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {polling && (
                                <div
                                    style={{
                                        ...mono,
                                        fontSize: 11,
                                        color: '#00E5FF',
                                        letterSpacing: 1.5,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        textShadow: '0 0 8px rgba(0,229,255,0.8)',
                                    }}
                                >
                                    <span
                                        style={{
                                            width: 7,
                                            height: 7,
                                            borderRadius: '50%',
                                            background: '#00E5FF',
                                            display: 'inline-block',
                                            boxShadow: '0 0 8px #00E5FF',
                                        }}
                                    />
                                    LIVE
                                </div>
                            )}
                            <button
                                onClick={onClose}
                                style={{
                                    background: 'linear-gradient(135deg,rgba(255,255,255,0.12),rgba(255,255,255,0.05))',
                                    border: '1px solid rgba(255,255,255,0.3)',
                                    color: '#fff',
                                    width: 34,
                                    height: 34,
                                    cursor: 'pointer',
                                    fontSize: 14,
                                    borderRadius: 4,
                                    fontWeight: 700,
                                }}
                            >
                                ✕
                            </button>
                        </div>
                    </div>

                    {/* Account HUD — 3 metrics */}
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr 1fr',
                            gap: 2,
                            marginBottom: 2,
                            background: 'rgba(255,255,255,0.05)',
                            borderRadius: '6px 6px 0 0',
                            overflow: 'hidden',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderBottom: 'none',
                        }}
                    >
                        {metricBox(
                            'ACCOUNT VALUE',
                            fmtUsd(totalAccountValue, false),
                            '#fff',
                        )}
                        {metricBox(
                            'TOTAL RETURN',
                            fmtPct(totalReturn),
                            totalReturn >= 0 ? '#00FF88' : '#FF4060',
                        )}
                        {metricBox(
                            'OPEN P&L',
                            fmtUsd(unrealizedPnl),
                            unrealizedPnl >= 0 ? '#00FF88' : '#FF4060',
                        )}
                    </div>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr 1fr',
                            gap: 2,
                            marginBottom: 16,
                            background: 'rgba(255,255,255,0.05)',
                            borderRadius: '0 0 6px 6px',
                            overflow: 'hidden',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderTop: 'none',
                        }}
                    >
                        {metricBox('CASH', fmtUsd(cashBalance, false), '#fff')}
                        {metricBox(
                            'REALIZED P&L',
                            fmtUsd(totalRealizedPnl),
                            totalRealizedPnl >= 0 ? '#00FF88' : '#FF4060',
                        )}
                        {metricBox('OPEN POSITIONS', `${openTrades.length}`, '#fff')}
                    </div>

                    {/* ── Always-visible Equity Chart ── */}
                    {(() => {
                        const W = 856, H = 90
                        if (equityHistory.length < 2) return (
                            <div style={{ padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', background: '#080808' }}>
                                <div style={{ ...mono, fontSize: 11, letterSpacing: 2, color: 'rgba(94,174,255,0.5)' }}>EQUITY CURVE — AWAITING DATA</div>
                            </div>
                        )
                        const vals = equityHistory.map((p) => p.value)
                        const minV = Math.min(...vals), maxV = Math.max(...vals)
                        const range = maxV - minV || 1
                        const pts = equityHistory.map((p, i) => {
                            const x = (i / (equityHistory.length - 1)) * W
                            const y = H - ((p.value - minV) / range) * (H - 6)
                            return `${x.toFixed(1)},${y.toFixed(1)}`
                        }).join(' ')
                        const firstVal = equityHistory[0].value
                        const lastVal = equityHistory[equityHistory.length - 1].value
                        const chartColor = lastVal >= firstVal ? '#00FF88' : '#FF4060'
                        const gainLoss = lastVal - firstVal
                        return (
                            <div style={{ padding: '8px 20px 0', background: '#080808', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                    <span style={{ ...mono, fontSize: 10, letterSpacing: 2.5, color: '#00E5FF' }}>EQUITY CURVE</span>
                                    <span style={{ ...mono, fontSize: 14, fontWeight: 900, color: chartColor }}>{fmtUsd(gainLoss)}</span>
                                </div>
                                <svg width={W} height={H} style={{ display: 'block' }}>
                                    <defs>
                                        <linearGradient id="eqGrad2" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={chartColor} stopOpacity="0.25" />
                                            <stop offset="100%" stopColor={chartColor} stopOpacity="0.02" />
                                        </linearGradient>
                                    </defs>
                                    <polygon points={`0,${H} ${pts} ${W},${H}`} fill="url(#eqGrad2)" />
                                    <polyline points={pts} fill="none" stroke={chartColor} strokeWidth="1.5" strokeLinejoin="round" />
                                    {(() => {
                                        const last = equityHistory[equityHistory.length - 1]
                                        const x = W, y = H - ((last.value - minV) / range) * (H - 6)
                                        return <circle cx={x} cy={y} r="3" fill={chartColor} />
                                    })()}
                                </svg>
                            </div>
                        )
                    })()}

                    {/* Glossy Tabs */}
                    <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                        {(['POSITIONS', 'ALERTS'] as const).map((t) => {
                            const active = tab === t
                            type TabKey = 'POSITIONS' | 'ALERTS'
                            const tabBg: Record<TabKey, string> = {
                                POSITIONS: '#00E5FF',
                                ALERTS: '#FF4060',
                            }
                            const c = tabBg[t]
                            return (
                                <button
                                    key={t}
                                    onClick={() => setTab(t)}
                                    style={{
                                        ...mono,
                                        fontSize: 13,
                                        fontWeight: 900,
                                        letterSpacing: 3,
                                        padding: '11px 22px',
                                        cursor: 'pointer',
                                        border: 'none',
                                        borderBottom: `3px solid ${active ? c : 'transparent'}`,
                                        background: active
                                            ? `linear-gradient(180deg, ${c}22 0%, ${c}08 100%)`
                                            : 'transparent',
                                        color: active ? c : 'rgba(255,255,255,0.4)',
                                        borderRadius: '4px 4px 0 0',
                                        transition: 'all 0.15s',
                                        textShadow: active ? `0 0 16px ${c}aa` : 'none',
                                        position: 'relative',
                                        flex: 1,
                                        textAlign: 'center',
                                    }}
                                >
                                    {t}
                                    {t === 'ALERTS' && unreadCount > 0 && (
                                        <span
                                            style={{
                                                position: 'absolute',
                                                top: 6,
                                                right: 8,
                                                minWidth: 18,
                                                height: 18,
                                                borderRadius: 9,
                                                background: '#FF2040',
                                                color: '#fff',
                                                fontSize: 10,
                                                fontWeight: 900,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                padding: '0 4px',
                                                boxShadow: '0 0 8px #FF2040',
                                            }}
                                        >
                                            {unreadCount}
                                        </span>
                                    )}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* ── Body ── */}
                <div style={{ flex: 1, overflowY: 'auto', background: '#000000' }}>

                    {/* ━━━ POSITIONS ━━━ */}
                    {tab === 'POSITIONS' && (() => {
                        const openTrades2 = trades.filter(t => t.status === 'OPEN')
                        const partialTrades = trades.filter(t => t.status === 'PARTIAL')
                        const closedTrades = trades.filter(t => t.status === 'CLOSED')

                        const TradeRow = ({ trade }: { trade: PortfolioTrade }) => {
                            const unrealized = (trade.currentPrice - trade.entryPrice) * 100 * trade.contractsOpen
                            const totalPnl = trade.realizedPnl + unrealized
                            const pctChange = ((trade.currentPrice - trade.entryPrice) / trade.entryPrice) * 100
                            const isExpanded = expandedId === trade.id
                            const signalColor = trade.signal === 'BUY' ? '#00FF88' : '#FF4060'
                            const pnlColor = totalPnl >= 0 ? '#00FF88' : '#FF4060'
                            const t1Pct = ((trade.t1Target / trade.entryPrice - 1) * 100).toFixed(0)
                            const t2Pct = ((trade.t2Target / trade.entryPrice - 1) * 100).toFixed(0)

                            return (
                                <div key={trade.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: isExpanded ? '#0c0c0c' : '#080808' }}>
                                    {/* ── Collapsed row ── */}
                                    <div
                                        onClick={() => setExpandedId(isExpanded ? null : trade.id)}
                                        style={{ padding: '16px 20px', cursor: 'pointer' }}
                                    >
                                        {/* Line 1: Symbol + stock price | P&L */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span style={{ ...mono, fontSize: 30, fontWeight: 900, color: '#fff', letterSpacing: 1, lineHeight: 1 }}>{trade.symbol}</span>
                                                    <span style={{ ...mono, fontSize: 11, color: '#ffffff', letterSpacing: 1, marginTop: 3 }}>{fmtTs(trade.addedAt)}</span>
                                                </div>
                                                {/* Stock price + % change right next to ticker */}
                                                {trade.currentStockPrice != null && (
                                                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                                        <span style={{ ...mono, fontSize: 20, fontWeight: 900, color: (trade.priceChangePct ?? 0) >= 0 ? '#00FF88' : '#FF4060', lineHeight: 1.1 }}>
                                                            ${trade.currentStockPrice.toFixed(2)}
                                                        </span>
                                                        <span style={{ ...mono, fontSize: 12, fontWeight: 700, color: (trade.priceChangePct ?? 0) >= 0 ? '#00FF88' : '#FF4060', lineHeight: 1.1 }}>
                                                            {(trade.priceChangePct ?? 0) >= 0 ? '+' : ''}{(trade.priceChangePct ?? 0).toFixed(2)}%
                                                        </span>
                                                    </div>
                                                )}
                                                <span style={{
                                                    ...mono, fontSize: 14, fontWeight: 900, letterSpacing: 2,
                                                    color: signalColor, background: `${signalColor}22`,
                                                    border: `1.5px solid ${signalColor}99`, padding: '3px 10px', borderRadius: 4,
                                                }}>{trade.signal === 'BUY' ? 'CALL ↑' : 'PUT ↓'}</span>
                                                {trade.score != null && (
                                                    <span style={{
                                                        ...mono, fontSize: 14, fontWeight: 900,
                                                        color: trade.score >= 60 ? '#00FF88' : trade.score >= 40 ? '#FF8C00' : '#FF4060',
                                                        background: trade.score >= 60 ? 'rgba(0,255,136,0.1)' : trade.score >= 40 ? 'rgba(255,140,0,0.1)' : 'rgba(255,64,96,0.1)',
                                                        border: `1.5px solid ${trade.score >= 60 ? '#00FF88' : trade.score >= 40 ? '#FF8C00' : '#FF4060'}88`,
                                                        padding: '3px 9px', borderRadius: 4,
                                                    }}>SCR {trade.score.toFixed(0)}</span>
                                                )}
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ ...mono, fontSize: 28, fontWeight: 900, color: pnlColor, letterSpacing: 0.5 }}>{fmtUsd(totalPnl)}</div>
                                                <div style={{ ...mono, fontSize: 14, color: pctChange >= 0 ? '#00FF88' : '#FF4060', marginTop: 2 }}>{fmtPct(pctChange)} on premium</div>
                                            </div>
                                        </div>

                                        {/* Line 2: Stats grid — no DTE, SIZE shows contracts, COST shows total $ */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 5, overflow: 'hidden', marginBottom: 10, border: '1px solid rgba(255,255,255,0.07)' }}>
                                            {[
                                                { label: 'CONTRACT', value: trade.optionDesc },
                                                { label: 'SIZE', value: `${trade.contractsOpen} × $${fmtUsd(trade.entryPrice * 100, false)}` },
                                                { label: 'ENTRY', value: `$${trade.entryPrice.toFixed(2)}` },
                                                { label: 'CURRENT', value: `$${trade.currentPrice.toFixed(2)}` },
                                                { label: 'COST', value: fmtUsd(trade.entryPrice * 200, false) },
                                            ].map(c => (
                                                <div key={c.label} style={{ padding: '10px 14px', background: '#0a0a0a' }}>
                                                    <div style={{ ...mono, fontSize: 20, fontWeight: 900, color: '#FF6600', letterSpacing: 2, marginBottom: 6 }}>{c.label}</div>
                                                    <div style={{ ...mono, fontSize: 16, fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.value}</div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Line 3: Targets bar + Sell button */}
                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                <div style={{
                                                    ...mono, fontSize: 15, fontWeight: 800,
                                                    color: '#FF4060', background: 'transparent',
                                                    border: '1.5px solid #FF4060',
                                                    padding: '6px 14px', borderRadius: 5, letterSpacing: 0.5,
                                                }}>⚠ STOP LOSS <span style={{ fontSize: 18, marginLeft: 4 }}>${trade.stopLossTarget.toFixed(2)}</span></div>
                                                <div style={{
                                                    ...mono, fontSize: 15, fontWeight: 800,
                                                    color: '#00FF88', background: 'transparent',
                                                    border: '1.5px solid #00FF88',
                                                    padding: '6px 14px', borderRadius: 5, letterSpacing: 0.5,
                                                }}>{trade.t1Filled ? '✓' : '▶'} TARGET 1 <span style={{ fontSize: 18, marginLeft: 4 }}>${trade.t1Target.toFixed(2)}</span></div>
                                                <div style={{
                                                    ...mono, fontSize: 15, fontWeight: 800,
                                                    color: '#00FF88', background: 'transparent',
                                                    border: '1.5px solid #00FF88',
                                                    padding: '6px 14px', borderRadius: 5, letterSpacing: 0.5,
                                                }}>{trade.t2Filled ? '✓' : '▶'} TARGET 2 <span style={{ fontSize: 18, marginLeft: 4 }}>${trade.t2Target.toFixed(2)}</span></div>
                                            </div>
                                            <button onClick={() => deleteTrade(trade.id)} style={{ ...mono, fontSize: 13, letterSpacing: 1.5, padding: '7px 18px', background: 'rgba(255,64,96,0.12)', border: '1.5px solid #FF4060', color: '#FF4060', cursor: 'pointer', borderRadius: 5, fontWeight: 700, flexShrink: 0 }}>
                                                {trade.status === 'CLOSED' ? 'REMOVE' : 'CLOSE & REMOVE'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* ── Expanded detail ── */}
                                    {isExpanded && (trade.t1Filled || trade.t2Filled) && (
                                        <div style={{ padding: '12px 20px 16px', background: '#080808', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                                            <div style={{ padding: '10px 14px', background: 'rgba(0,255,136,0.06)', border: '1.5px solid rgba(0,255,136,0.25)', borderRadius: 5 }}>
                                                {trade.t1Filled && <div style={{ ...mono, fontSize: 16, color: '#00FF88', marginBottom: trade.t2Filled ? 6 : 0 }}>✓ TARGET 1 FILLED @ ${trade.t1FillPrice.toFixed(2)} — {fmtUsd((trade.t1FillPrice - trade.entryPrice) * 100)} / contract</div>}
                                                {trade.t2Filled && <div style={{ ...mono, fontSize: 16, color: '#00FF88' }}>✓ TARGET 2 FILLED @ ${trade.t2FillPrice.toFixed(2)} — {fmtUsd((trade.t2FillPrice - trade.entryPrice) * 100)} / contract</div>}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        }

                        const SectionHeader = ({ label, count, color, accent }: { label: string; count: number; color: string; accent: string }) => (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', background: `${accent}0f`, borderBottom: `1px solid ${accent}33`, borderTop: `1px solid ${accent}22` }}>
                                <div style={{ width: 4, height: 20, background: accent, borderRadius: 2, flexShrink: 0, boxShadow: `0 0 8px ${accent}` }} />
                                <span style={{ ...mono, fontSize: 13, fontWeight: 900, letterSpacing: 3, color }}>{label}</span>
                                <span style={{ ...mono, fontSize: 13, fontWeight: 900, color: '#000', background: accent, padding: '2px 10px', borderRadius: 10 }}>{count}</span>
                            </div>
                        )

                        return (
                            <div>
                                {/* Toolbar */}
                                <div style={{ display: 'flex', gap: 8, padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', alignItems: 'center', background: '#000000' }}>
                                    <button onClick={clearClosed} style={{ ...mono, fontSize: 12, letterSpacing: 1.5, padding: '6px 14px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.25)', color: '#ffffff', cursor: 'pointer', borderRadius: 5 }}>CLEAR CLOSED</button>
                                    <button onClick={resetPortfolio} style={{ ...mono, fontSize: 12, letterSpacing: 1.5, padding: '6px 14px', background: 'rgba(255,64,96,0.1)', border: '1px solid #FF4060', color: '#FF4060', cursor: 'pointer', borderRadius: 5 }}>RESET</button>
                                    <span style={{ ...mono, fontSize: 12, color: 'rgba(94,174,255,0.5)', marginLeft: 'auto', letterSpacing: 1 }}>⟳ POLLING: 30s</span>
                                </div>

                                {trades.length === 0 ? (
                                    <div style={{ padding: '80px 20px', textAlign: 'center', ...mono }}>
                                        <div style={{ fontSize: 36, marginBottom: 14, color: 'rgba(255,255,255,0.12)' }}>◆</div>
                                        <div style={{ fontSize: 16, letterSpacing: 3, color: 'rgba(255,255,255,0.5)' }}>NO POSITIONS</div>
                                        <div style={{ fontSize: 13, marginTop: 10, color: 'rgba(94,174,255,0.4)', letterSpacing: 1 }}>Tap ◆ on a scan card to add a trade</div>
                                    </div>
                                ) : (
                                    <>
                                        {/* OPEN */}
                                        {openTrades2.length > 0 && (
                                            <>
                                                <SectionHeader label="OPEN POSITIONS" count={openTrades2.length} color="#00E5FF" accent="#00E5FF" />
                                                {openTrades2.map(t => <TradeRow key={t.id} trade={t} />)}
                                            </>
                                        )}

                                        {/* PARTIAL — T1 filled, riding T2 */}
                                        {partialTrades.length > 0 && (
                                            <>
                                                <SectionHeader label="PARTIAL — T1 FILLED" count={partialTrades.length} color="#FF8C00" accent="#FF8C00" />
                                                {partialTrades.map(t => <TradeRow key={t.id} trade={t} />)}
                                            </>
                                        )}

                                        {/* CLOSED */}
                                        {closedTrades.length > 0 && (
                                            <>
                                                <SectionHeader label="CLOSED POSITIONS" count={closedTrades.length} color="rgba(255,255,255,0.45)" accent="rgba(255,255,255,0.3)" />
                                                {closedTrades.map(t => <TradeRow key={t.id} trade={t} />)}
                                            </>
                                        )}
                                    </>
                                )}
                            </div>
                        )
                    })()}

                    {/* ━━━ ALERTS ━━━ */}
                    {tab === 'ALERTS' && (
                        <div>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '12px 20px',
                                    borderBottom: '1px solid rgba(255,255,255,0.07)',
                                    background: '#080808',
                                }}
                            >
                                <span
                                    style={{
                                        ...mono,
                                        fontSize: 18,
                                        color: '#ffffff',
                                        letterSpacing: 2,
                                        fontWeight: 700,
                                    }}
                                >
                                    {unreadCount} UNREAD
                                </span>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button
                                        onClick={markAllRead}
                                        style={{
                                            ...mono,
                                            fontSize: 13,
                                            letterSpacing: 1.5,
                                            padding: '7px 16px',
                                            background: 'rgba(255,255,255,0.08)',
                                            border: '1px solid rgba(255,255,255,0.3)',
                                            color: '#ffffff',
                                            cursor: 'pointer',
                                            borderRadius: 5,
                                        }}
                                    >
                                        MARK ALL READ
                                    </button>
                                    <button
                                        onClick={() => setAlerts([])}
                                        style={{
                                            ...mono,
                                            fontSize: 13,
                                            letterSpacing: 1.5,
                                            padding: '7px 16px',
                                            background: 'rgba(255,64,96,0.12)',
                                            border: '1px solid #FF4060',
                                            color: '#FF4060',
                                            cursor: 'pointer',
                                            borderRadius: 5,
                                        }}
                                    >
                                        CLEAR
                                    </button>
                                </div>
                            </div>

                            {alerts.length === 0 ? (
                                <div
                                    style={{
                                        padding: '60px 20px',
                                        textAlign: 'center',
                                        ...mono,
                                        fontSize: 14,
                                        color: 'rgba(94,174,255,0.4)',
                                        letterSpacing: 3,
                                    }}
                                >
                                    NO ALERTS
                                </div>
                            ) : (
                                alerts.map((a) => {
                                    const dotColor =
                                        a.type === 'T1_HIT' || a.type === 'T2_HIT' || a.type === 'GAP_FILL'
                                            ? '#00FF88'
                                            : a.type === 'ADDED'
                                                ? '#00E5FF'
                                                : a.type === 'STOP_LOSS'
                                                    ? '#FF4060'
                                                    : a.type === 'CLOSED'
                                                        ? '#FF8C00'
                                                        : '#FF4060'
                                    return (
                                        <div
                                            key={a.id}
                                            onClick={() =>
                                                setAlerts((prev) =>
                                                    prev.map((x) => (x.id === a.id ? { ...x, read: true } : x)),
                                                )
                                            }
                                            style={{
                                                padding: '14px 20px',
                                                borderBottom: '1px solid rgba(255,255,255,0.06)',
                                                cursor: 'pointer',
                                                background: a.read ? 'transparent' : `${dotColor}08`,
                                                borderLeft: a.read ? 'none' : `3px solid ${dotColor}`,
                                                display: 'flex',
                                                gap: 12,
                                                alignItems: 'flex-start',
                                            }}
                                        >
                                            <div
                                                style={{
                                                    width: 8,
                                                    height: 8,
                                                    borderRadius: '50%',
                                                    background: a.read ? 'rgba(255,255,255,0.15)' : dotColor,
                                                    flexShrink: 0,
                                                    marginTop: 5,
                                                    boxShadow: a.read ? 'none' : `0 0 6px ${dotColor}`,
                                                }}
                                            />
                                            <div>
                                                <div
                                                    style={{
                                                        ...mono,
                                                        fontSize: 15,
                                                        color: a.read ? 'rgba(255,255,255,0.3)' : '#ffffff',
                                                        marginBottom: 5,
                                                        lineHeight: 1.5,
                                                    }}
                                                >
                                                    {a.message}
                                                </div>
                                                <div
                                                    style={{
                                                        ...mono,
                                                        fontSize: 12,
                                                        color: a.read ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.5)',
                                                        letterSpacing: 1,
                                                    }}
                                                >
                                                    {fmtTs(a.timestamp)}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    )}
                </div>
            </div>
        )
    },
)

BuySellPortfolio.displayName = 'BuySellPortfolio'
export default BuySellPortfolio
