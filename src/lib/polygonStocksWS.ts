/**
 * Singleton WebSocket service for wss://socket.polygon.io/stocks
 *
 * ALL components share ONE connection. Polygon closes extra connections
 * with "max_connections" when multiple WebSocket instances are opened.
 * This service manages one persistent connection and routes AM.* / A.*
 * messages to whichever components have subscribed.
 */

const API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf'
const WS_URL = 'wss://socket.polygon.io/stocks'
const CHUNK = 25

export interface PolygonAMMsg { ev: 'AM'; sym: string; c: number; op: number;[k: string]: unknown }
export interface PolygonAMsg { ev: 'A'; sym: string; c: number; o: number; h: number; l: number; v: number; s: number;[k: string]: unknown }

interface Sub {
    amSymbols: Set<string>
    onAM?: (msg: PolygonAMMsg) => void
    aSymbol?: string
    onA?: (msg: PolygonAMsg) => void
}

class PolygonStocksWSService {
    private static _inst: PolygonStocksWSService | null = null

    static getInstance(): PolygonStocksWSService {
        if (!this._inst) this._inst = new PolygonStocksWSService()
        return this._inst
    }

    private ws: WebSocket | null = null
    private authenticated = false
    private stopped = false
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null
    private subs = new Map<string, Sub>()
    private sentAM = new Set<string>()
    private sentA = new Set<string>()

    private constructor() {
        setTimeout(() => this.connect(), 0)
    }

    private connect() {
        if (this.stopped) return
        const ws = new WebSocket(WS_URL)
        this.ws = ws

        ws.onopen = () => {
            ws.send(JSON.stringify({ action: 'auth', params: API_KEY }))
        }

        ws.onmessage = (evt: MessageEvent) => {
            let msgs: any[]
            try { msgs = JSON.parse(evt.data) } catch { return }

            for (const msg of msgs) {
                if (msg.ev === 'status') {
                    if (msg.status === 'auth_success') {
                        this.authenticated = true
                        this.flushAll()
                    } else if (msg.status === 'max_connections') {
                        // Another tab/window already holds the connection limit — stop retrying
                        console.error('[PolygonWS] max_connections: close other tabs or browser windows and reload.')
                        this.stopped = true
                        ws.close()
                    }
                }

                if (msg.ev === 'AM') {
                    for (const sub of this.subs.values()) {
                        if (sub.onAM && sub.amSymbols.has(msg.sym)) sub.onAM(msg as PolygonAMMsg)
                    }
                }

                if (msg.ev === 'A') {
                    for (const sub of this.subs.values()) {
                        if (sub.onA && sub.aSymbol === msg.sym) sub.onA(msg as PolygonAMsg)
                    }
                }
            }
        }

        ws.onerror = () => { /* handled by onclose */ }

        ws.onclose = () => {
            this.authenticated = false
            this.sentAM.clear()
            this.sentA.clear()
            if (!this.stopped) {
                console.warn('[PolygonWS] Closed — reconnecting in 5s')
                this.reconnectTimer = setTimeout(() => this.connect(), 5000)
            }
        }
    }

    /** Send all pending subscriptions after (re)auth */
    private flushAll() {
        const newAM: string[] = []
        const newA: string[] = []
        for (const sub of this.subs.values()) {
            for (const s of sub.amSymbols) if (!this.sentAM.has(s)) newAM.push(s)
            if (sub.aSymbol && !this.sentA.has(sub.aSymbol)) newA.push(sub.aSymbol)
        }
        this.sendChunked(newAM.map(s => `AM.${s}`))
        this.sendChunked(newA.map(s => `A.${s}`))
        for (const s of newAM) this.sentAM.add(s)
        for (const s of newA) this.sentA.add(s)
    }

    private sendChunked(channels: string[]) {
        if (!channels.length) return
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
        for (let i = 0; i < channels.length; i += CHUNK) {
            const batch = channels.slice(i, i + CHUNK).join(',')
            this.ws.send(JSON.stringify({ action: 'subscribe', params: batch }))
        }
    }

    /**
     * Subscribe to AM.* and/or A.* events.
     * Returns an unsubscribe function — call it in your useEffect cleanup.
     */
    subscribe(id: string, config: {
        amSymbols?: string[]
        onAM?: (msg: PolygonAMMsg) => void
        aSymbol?: string
        onA?: (msg: PolygonAMsg) => void
    }): () => void {
        const sub: Sub = {
            amSymbols: new Set(config.amSymbols ?? []),
            onAM: config.onAM,
            aSymbol: config.aSymbol,
            onA: config.onA,
        }
        this.subs.set(id, sub)

        // If already connected + authenticated, send new channels immediately
        if (this.authenticated && this.ws?.readyState === WebSocket.OPEN) {
            const newAM = (config.amSymbols ?? []).filter(s => !this.sentAM.has(s))
            const newA = config.aSymbol && !this.sentA.has(config.aSymbol) ? [config.aSymbol] : []
            this.sendChunked(newAM.map(s => `AM.${s}`))
            this.sendChunked(newA.map(s => `A.${s}`))
            for (const s of newAM) this.sentAM.add(s)
            for (const s of newA) this.sentA.add(s)
        }

        return () => { this.subs.delete(id) }
    }
}

// SSR guard — only instantiate in the browser
export const polygonStocksWS: PolygonStocksWSService | null =
    typeof window !== 'undefined' ? PolygonStocksWSService.getInstance() : null
