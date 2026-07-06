/**
 * Singleton WebSocket service for wss://socket.polygon.io/options
 *
 * Streams real-time options trade events (ev:"T") during market hours.
 * All subscribers share ONE connection — Polygon closes duplicates.
 */

const API_KEY = '' || ''
const WS_URL = 'wss://socket.polygon.io/options'

export interface PolygonOptionsTradeMsg {
    ev: 'T'
    sym: string   // OCC ticker: O:AAPL230616C00150000
    x: number     // Exchange ID
    p: number     // Price per contract (per share × 100 = total per contract)
    s: number     // Size in contracts
    c: number[]   // Condition codes
    t: number     // SIP timestamp (ms)
    ot?: number   // Exchange timestamp (ns)
}

type TradeHandler = (trades: PolygonOptionsTradeMsg[]) => void

export const OPTIONS_EXCHANGE_MAP: Record<number, string> = {
    1: 'NYSE ARCA',
    2: 'NASDAQBX',
    3: 'CBOE',
    4: 'MIAX',
    5: 'CBOE EDGX',
    6: 'ISE GEMINI',
    7: 'MIAX EMERALD',
    8: 'ISE',
    9: 'NYSE ARCA',
    10: 'PHLX',
    12: 'BOX',
    13: 'MEMX',
    14: 'C2',
    15: 'NASDAQ',
    16: 'CBOE C2',
    17: 'MIAX PEARL',
    100: 'OTC',
}

/** Parse an OCC options ticker symbol into components.
 *  Format: O:{UNDERLYING}{YY}{MM}{DD}{C|P}{8-digit strike * 1000}
 *  e.g.  O:AAPL230616C00150000 → AAPL, 2023-06-16, call, 150.00
 */
export function parseOCCTicker(sym: string): {
    underlying: string
    expiry: string
    type: 'call' | 'put'
    strike: number
} | null {
    if (!sym || !sym.startsWith('O:') || sym.length < 17) return null
    // Fixed-length suffix: 6 (date) + 1 (C/P) + 8 (strike) = 15 chars
    const suffix = sym.slice(-15)
    const underlying = sym.slice(2, sym.length - 15)
    if (!underlying) return null
    const yymmdd = suffix.slice(0, 6)
    const cp = suffix[6]
    const strikeStr = suffix.slice(7)
    if (!/^\d{6}$/.test(yymmdd) || (cp !== 'C' && cp !== 'P') || !/^\d{8}$/.test(strikeStr)) return null
    const yy = yymmdd.slice(0, 2)
    const mm = yymmdd.slice(2, 4)
    const dd = yymmdd.slice(4, 6)
    const expiry = `20${yy}-${mm}-${dd}`
    const strike = parseInt(strikeStr, 10) / 1000
    const type: 'call' | 'put' = cp === 'C' ? 'call' : 'put'
    return { underlying, expiry, type, strike }
}

/** Classify trade type from size + condition codes.
 *  This is a best-effort approximation for live stream trades.
 *  The full scan-mode uses cross-exchange SWEEP detection.
 */
export function classifyLiveTradeType(
    size: number,
    conditions: number[]
): 'SWEEP' | 'BLOCK' | 'MINI' | 'MULTI-LEG' {
    // Condition 41 = Multi Leg Auto-Electronic Trade
    if (conditions.includes(41)) return 'MULTI-LEG'
    if (size >= 250) return 'BLOCK'
    if (size < 10) return 'MINI'
    return 'SWEEP'
}

class PolygonOptionsWSService {
    private ws: WebSocket | null = null
    private handlers: Set<TradeHandler> = new Set()
    private subscribed = false
    private connecting = false
    private dead = false
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null

    getExchangeName(id: number): string {
        return OPTIONS_EXCHANGE_MAP[id] ?? `EXCH-${id}`
    }

    /** Register a handler. Returns an unsubscribe function. */
    addHandler(fn: TradeHandler): () => void {
        this.handlers.add(fn)
        if (!this.ws && !this.connecting) this._connect()
        return () => {
            this.handlers.delete(fn)
            if (this.handlers.size === 0) this.disconnect()
        }
    }

    isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN
    }

    private _connect() {
        if (this.connecting || this.ws) return
        if (typeof WebSocket === 'undefined') return // SSR guard
        this.connecting = true
        this.dead = false

        const ws = new WebSocket(WS_URL)
        this.ws = ws

        ws.onopen = () => {
            ws.send(JSON.stringify({ action: 'auth', params: API_KEY }))
        }

        ws.onmessage = (e: MessageEvent) => {
            try {
                const msgs: any[] = JSON.parse(e.data)
                const trades: PolygonOptionsTradeMsg[] = []
                for (const msg of msgs) {
                    if (msg.ev === 'status' && msg.status === 'auth_success') {
                        this.connecting = false
                        this._subscribe()
                    } else if (msg.ev === 'T') {
                        trades.push(msg as PolygonOptionsTradeMsg)
                    }
                }
                if (trades.length > 0) {
                    for (const h of this.handlers) h(trades)
                }
            } catch { /* ignore parse errors */ }
        }

        ws.onerror = () => {
            this.connecting = false
            this.ws = null
            this.subscribed = false
            this._scheduleReconnect()
        }

        ws.onclose = () => {
            this.ws = null
            this.subscribed = false
            this.connecting = false
            this._scheduleReconnect()
        }
    }

    private _subscribe() {
        if (!this.ws || this.subscribed || this.ws.readyState !== WebSocket.OPEN) return
        this.subscribed = true
        this.ws.send(JSON.stringify({ action: 'subscribe', params: 'T.*' }))
    }

    private _scheduleReconnect() {
        if (this.dead || this.handlers.size === 0) return
        if (this.reconnectTimer) return
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null
            if (!this.dead && this.handlers.size > 0) this._connect()
        }, 3000)
    }

    disconnect() {
        this.dead = true
        this.subscribed = false
        this.connecting = false
        if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
        if (this.ws) { try { this.ws.close() } catch { /* ignore */ }; this.ws = null }
    }
}

export const polygonOptionsWS = new PolygonOptionsWSService()
