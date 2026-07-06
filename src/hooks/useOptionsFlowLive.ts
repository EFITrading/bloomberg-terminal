'use client'

/**
 * useOptionsFlowLive
 * Polygon WebSocket live options trade streaming for market hours.
 * Same logic as options-flow/page.tsx — shared so the sidebar FlowPanel
 * gets the same live stream instead of only having the SSE historical scan.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { polygonOptionsWS, parseOCCTicker } from '@/lib/polygonOptionsWS'
import type { PolygonOptionsTradeMsg } from '@/lib/polygonOptionsWS'

const POLYGON_API_KEY = '' || ''

const US_MARKET_HOLIDAYS_SET = new Set([
    '2025-01-01', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26',
    '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25',
    '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
    '2026-06-19',
    '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
])

export const isFlowMarketOpen = (): boolean => {
    const nowPST = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
    const dow = nowPST.getDay()
    const hour = nowPST.getHours()
    const minute = nowPST.getMinutes()
    const todayDS = `${nowPST.getFullYear()}-${String(nowPST.getMonth() + 1).padStart(2, '0')}-${String(nowPST.getDate()).padStart(2, '0')}`
    if (US_MARKET_HOLIDAYS_SET.has(todayDS)) return false
    return dow >= 1 && dow <= 5 && (hour > 6 || (hour === 6 && minute >= 30)) && hour < 13
}

type FillStyle = 'A' | 'B' | 'AA' | 'BB' | 'N/A'

export interface FlowLiveTrade {
    ticker: string
    underlying_ticker: string
    strike: number
    expiry: string
    type: 'call' | 'put'
    trade_size: number
    premium_per_contract: number
    total_premium: number
    spot_price: number
    exchange_name: string
    exchange_id?: number
    trade_type: 'SWEEP' | 'BLOCK' | 'MINI' | 'MULTI-LEG'
    trade_timestamp: string
    moneyness: 'ATM' | 'ITM' | 'OTM'
    days_to_expiry: number
    fill_style?: FillStyle
    volume?: number
    open_interest?: number
    base_open_interest?: number
    [key: string]: unknown
}


function classifyFlowLiveBatch(trades: FlowLiveTrade[]): FlowLiveTrade[] {
    if (trades.length === 0) return trades
    // Multi-leg: same underlying within 100ms, mixed strikes/types/expiries, all ≥100 contracts, ≥$25k
    const mlGroups = new Map<string, FlowLiveTrade[]>()
    for (const t of trades) {
        const bucket = Math.floor(new Date(t.trade_timestamp).getTime() / 100) * 100
        const key = `${t.underlying_ticker}_${bucket}`
        if (!mlGroups.has(key)) mlGroups.set(key, [])
        mlGroups.get(key)!.push(t)
    }
    const multiLegIds = new Set<string>()
    for (const [, group] of mlGroups) {
        if (group.length < 2 || group.length > 4) continue
        const hasMultiStructure = new Set(group.map(t => t.strike)).size >= 2 || new Set(group.map(t => t.type)).size >= 2 || new Set(group.map(t => t.expiry)).size >= 2
        if (hasMultiStructure && group.every(t => t.trade_size >= 100) && group.reduce((s, t) => s + t.total_premium, 0) >= 25000) {
            for (const t of group) multiLegIds.add(`${t.ticker}_${t.trade_timestamp}`)
        }
    }
    // Sweep: same contract within 3s across 2+ exchanges
    const sweepGroups = new Map<string, FlowLiveTrade[]>()
    for (const t of trades) {
        if (multiLegIds.has(`${t.ticker}_${t.trade_timestamp}`)) continue
        const win = Math.floor(new Date(t.trade_timestamp).getTime() / 3000) * 3000
        const key = `${t.underlying_ticker}_${t.strike}_${t.type}_${t.expiry}_${win}`
        if (!sweepGroups.has(key)) sweepGroups.set(key, [])
        sweepGroups.get(key)!.push(t)
    }
    const consumedIds = new Set<string>()
    const swept: FlowLiveTrade[] = []
    for (const [, group] of sweepGroups) {
        const exchanges = new Set(group.map(t => t.exchange_name))
        if (exchanges.size < 2) continue
        for (const t of group) consumedIds.add(`${t.ticker}_${t.trade_timestamp}`)
        const totalSize = group.reduce((s, t) => s + t.trade_size, 0)
        const totalPrem = group.reduce((s, t) => s + t.total_premium, 0)
        swept.push({ ...group[0], trade_size: totalSize, premium_per_contract: totalSize > 0 ? totalPrem / (totalSize * 100) : group[0].premium_per_contract, total_premium: totalPrem, trade_type: 'SWEEP', exchange_name: `MULTI-EXCHANGE (${group.length} fills, ${exchanges.size} exchanges)` })
    }
    const result: FlowLiveTrade[] = [...swept]
    for (const t of trades) {
        const id = `${t.ticker}_${t.trade_timestamp}`
        if (consumedIds.has(id)) continue
        if (multiLegIds.has(id)) result.push({ ...t, trade_type: 'MULTI-LEG' })
        else if (t.trade_size >= 250) result.push({ ...t, trade_type: 'BLOCK' })
        else result.push({ ...t, trade_type: 'MINI' })
    }
    return result
}

const enrichFlowTradeCombined = async (trades: FlowLiveTrade[]): Promise<FlowLiveTrade[]> => {
    if (trades.length === 0) return trades
    const getOptionTicker = (trade: FlowLiveTrade) => {
        const expiry = trade.expiry.replace(/-/g, '').slice(2)
        const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0')
        return `O:${trade.underlying_ticker.replace(/\./g, '')}${expiry}${trade.type === 'call' ? 'C' : 'P'}${strikeFormatted}`
    }
    // Vol/OI via Polygon snapshot
    const uniqueTickerMap = new Map<string, string>()
    for (const trade of trades) {
        const optTicker = getOptionTicker(trade)
        if (!uniqueTickerMap.has(optTicker)) uniqueTickerMap.set(optTicker, trade.underlying_ticker)
    }
    const cache = new Map<string, { volume: number; open_interest: number } | null>()
    const batches: [string, string][][] = []
    const entries = Array.from(uniqueTickerMap.entries())
    for (let i = 0; i < entries.length; i += 75) batches.push(entries.slice(i, i + 75))
    for (const batch of batches) {
        await Promise.all(batch.map(async ([optTicker, underlying]) => {
            try {
                const res = await fetch(`/api/polygon/v3/snapshot/options/${underlying}/${optTicker}?apikey=${POLYGON_API_KEY}`, { signal: AbortSignal.timeout(5000) } as RequestInit)
                if (!res.ok) { cache.set(optTicker, null); return }
                const data = await res.json()
                cache.set(optTicker, data.results ? { volume: data.results.day?.volume || 0, open_interest: data.results.open_interest || 0 } : null)
            } catch { cache.set(optTicker, null) }
        }))
    }
    // Fill style via batch quotes endpoint
    const uniqueQuotes = new Map<string, { contract: string; timestamp_ns: number }>()
    for (const trade of trades) {
        const timestampNs = new Date(trade.trade_timestamp).getTime() * 1_000_000
        const key = `${trade.ticker}:${Math.floor(timestampNs / 1_000_000_000)}`
        if (!uniqueQuotes.has(key)) uniqueQuotes.set(key, { contract: trade.ticker, timestamp_ns: timestampNs })
    }
    const quoteResultMap = new Map<string, { bid: number; ask: number } | null>()
    try {
        const res = await fetch('/api/options-quotes-batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trades: Array.from(uniqueQuotes.entries()).map(([id, v]) => ({ id, ...v })) }) })
        const data = await res.json()
        for (const r of data.results as { id: string; bid: number | null; ask: number | null }[]) {
            quoteResultMap.set(r.id, r.bid && r.ask && r.bid > 0 && r.ask > 0 ? { bid: r.bid, ask: r.ask } : null)
        }
    } catch { /* N/A */ }

    return trades.map((trade) => {
        const cached = cache.get(getOptionTicker(trade))
        const timestampNs = new Date(trade.trade_timestamp).getTime() * 1_000_000
        const quote = quoteResultMap.get(`${trade.ticker}:${Math.floor(timestampNs / 1_000_000_000)}`) ?? null
        let fill_style: FillStyle = 'N/A'
        if (quote) {
            const fill = trade.premium_per_contract
            const mid = (quote.bid + quote.ask) / 2
            if (fill >= quote.ask + 0.01) fill_style = 'AA'
            else if (fill <= quote.bid - 0.01) fill_style = 'BB'
            else if (fill === quote.ask) fill_style = 'A'
            else if (fill === quote.bid) fill_style = 'B'
            else fill_style = fill >= mid ? 'A' : 'B'
        }
        return { ...trade, volume: cached?.volume ?? 0, open_interest: cached?.open_interest ?? 0, fill_style }
    })
}

interface UseOptionsFlowLiveOptions {
    /** Called with a state-updater function on each 1-second flush */
    onData: (updater: (prev: FlowLiveTrade[]) => FlowLiveTrade[]) => void
    onLiveCount?: (count: number) => void
    /** If set, only trades for this underlying ticker are buffered */
    symbol?: string
    /** When true, only start streaming when the user manually enables it — never auto-start on market open */
    requireManual?: boolean
}

export function useOptionsFlowLive({ onData, onLiveCount, symbol, requireManual = false }: UseOptionsFlowLiveOptions) {
    const symbolRef = useRef(symbol?.toUpperCase() ?? '')
    useEffect(() => { symbolRef.current = symbol?.toUpperCase() ?? '' }, [symbol])
    const [isLiveMode, setIsLiveMode] = useState(false)
    const [liveConnected, setLiveConnected] = useState(false)
    const [liveTradeCount, setLiveTradeCount] = useState(0)
    const [manualLiveMode, setManualLiveMode] = useState(false)
    const liveConnectedRef = useRef(false)
    const liveTradeBufferRef = useRef<FlowLiveTrade[]>([])
    const liveFlushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const liveTradeCountRef = useRef(0)
    const onDataRef = useRef(onData)
    const onLiveCountRef = useRef(onLiveCount)
    useEffect(() => { onDataRef.current = onData }, [onData])
    useEffect(() => { onLiveCountRef.current = onLiveCount }, [onLiveCount])

    const convertLiveTrade = useCallback((msg: PolygonOptionsTradeMsg): FlowLiveTrade | null => {
        const parsed = parseOCCTicker(msg.sym)
        if (!parsed) return null
        const { underlying, expiry, type, strike } = parsed
        return {
            ticker: msg.sym,
            underlying_ticker: underlying,
            strike,
            expiry,
            type,
            trade_size: msg.s,
            premium_per_contract: msg.p,
            total_premium: msg.p * msg.s * 100,
            spot_price: 0,
            exchange_name: polygonOptionsWS.getExchangeName(msg.x),
            exchange_id: msg.x,
            trade_type: 'MINI',
            trade_timestamp: new Date(msg.t).toISOString(),
            moneyness: 'OTM',
            days_to_expiry: Math.max(0, Math.round((new Date(expiry).getTime() - Date.now()) / 86_400_000)),
        }
    }, [])

    const handleLiveTrades = useCallback((msgs: PolygonOptionsTradeMsg[]) => {
        if (!liveConnectedRef.current) {
            liveConnectedRef.current = true
            setLiveConnected(true)
        }
        for (const msg of msgs) {
            const trade = convertLiveTrade(msg)
            if (!trade) continue
            // Filter to symbol if specified
            if (symbolRef.current && trade.underlying_ticker !== symbolRef.current) continue
            liveTradeBufferRef.current.push(trade)
        }
    }, [convertLiveTrade])

    useEffect(() => {
        const nowPST = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
        const todayDS = `${nowPST.getFullYear()}-${String(nowPST.getMonth() + 1).padStart(2, '0')}-${String(nowPST.getDate()).padStart(2, '0')}`
        const shouldGoLive = requireManual
            ? manualLiveMode
            : (isFlowMarketOpen() && !US_MARKET_HOLIDAYS_SET.has(todayDS)) || manualLiveMode

        if (!shouldGoLive) {
            setIsLiveMode(false)
            setLiveConnected(false)
            return
        }

        setIsLiveMode(true)
        setLiveConnected(false)
        liveConnectedRef.current = false
        liveTradeCountRef.current = 0
        setLiveTradeCount(0)
        onLiveCountRef.current?.(0)

        // Poll Railway DB every 30 seconds instead of opening a WebSocket
        // (Railway holds the single Polygon WS connection)
        const pollDB = async () => {
            try {
                const res = await fetch(`/api/flows/save-batch?date=${todayDS}`)
                const result = await res.json()
                if (!result.trades || result.trades.length === 0) return
                const trades: FlowLiveTrade[] = result.trades
                const filtered = symbolRef.current
                    ? trades.filter(t => t.underlying_ticker?.toUpperCase() === symbolRef.current)
                    : trades
                if (!liveConnectedRef.current) {
                    liveConnectedRef.current = true
                    setLiveConnected(true)
                }
                const newCount = filtered.length
                liveTradeCountRef.current = newCount
                setLiveTradeCount(newCount)
                onLiveCountRef.current?.(newCount)
                onDataRef.current(() => filtered)
            } catch { /* ignore network errors */ }
        }

        pollDB()
        liveFlushTimerRef.current = setInterval(pollDB, 30 * 1000)

        return () => {
            if (liveFlushTimerRef.current !== null) {
                clearInterval(liveFlushTimerRef.current)
                liveFlushTimerRef.current = null
            }
        }
    }, [handleLiveTrades, manualLiveMode])

    return { isLiveMode, liveConnected, liveTradeCount, manualLiveMode, setManualLiveMode }
}
