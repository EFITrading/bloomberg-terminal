/**
 * Singleton WebSocket service for wss://socket.polygon.io/stocks
 *
 * ALL components share ONE connection. Polygon closes extra connections
 * with "max_connections" when multiple WebSocket instances are opened.
 * This service manages one persistent connection and routes AM.* / A.*
 * messages to whichever components have subscribed.
 *
 * Market hours (PST / America/Los_Angeles):
 *   Connect  : 6:29:50 AM PST (10s before open)
 *   Disconnect: 1:00:01 PM PST (1s after close)
 *   Weekends : never connect
 */

const API_KEY = '' || ''
const WS_URL = 'wss://socket.polygon.io/stocks'
const CHUNK = 25

// ── Market schedule helpers (PST) ─────────────────────────────────────────────

/** Current time in PST/PDT */
function nowPST(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
}

/** True if we should be connected right now */
function isMarketHours(): boolean {
  const pst = nowPST()
  const dow = pst.getDay()
  if (dow === 0 || dow === 6) return false
  const mins = pst.getHours() * 60 + pst.getMinutes()
  const secs = pst.getSeconds()
  // 6:29:50 AM = 389 mins + 50s  →  13:00:01 PM = 780 mins + 1s
  const openSecs = 6 * 3600 + 29 * 60 + 50
  const closeSecs = 13 * 3600 + 0 * 60 + 1
  const nowSecs = mins * 60 + secs
  return nowSecs >= openSecs && nowSecs < closeSecs
}

/** Ms until the next connect window (6:29:50 AM PST, next weekday) */
function msUntilNextOpen(): number {
  const pst = nowPST()
  // Build a candidate "today at 6:29:50 AM PST"
  const candidate = new Date(pst)
  candidate.setHours(6, 29, 50, 0)
  // If that time already passed today, move to tomorrow
  if (candidate <= pst) candidate.setDate(candidate.getDate() + 1)
  // Skip weekends
  while (candidate.getDay() === 0 || candidate.getDay() === 6) {
    candidate.setDate(candidate.getDate() + 1)
  }
  // Convert PST wall-clock back to UTC ms — candidate.getTime() is already correct
  // because setHours() uses local timezone (PST), so no extra offset needed
  return candidate.getTime() - Date.now()
}

/** Ms until disconnect (1:00:01 PM PST today) */
function msUntilClose(): number {
  const pst = nowPST()
  const close = new Date(pst)
  close.setHours(13, 0, 1, 0)
  return Math.max(0, close.getTime() - Date.now())
}

export interface PolygonAMMsg {
  ev: 'AM'
  sym: string
  c: number
  op: number
  [k: string]: unknown
}
export interface PolygonAMsg {
  ev: 'A'
  sym: string
  c: number
  o: number
  h: number
  l: number
  v: number
  s: number
  [k: string]: unknown
}

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
  private stopped = false          // permanent stop (max_connections)
  private scheduleTimer: ReturnType<typeof setTimeout> | null = null
  private closeTimer: ReturnType<typeof setTimeout> | null = null
  private subs = new Map<string, Sub>()
  private sentAM = new Set<string>()
  private sentA = new Set<string>()

  private constructor() {
    setTimeout(() => this.schedule(), 0)
  }

  /** Decide: connect now (market hours) or sleep until next open */
  private schedule() {
    if (this.stopped) return
    if (isMarketHours()) {
      console.log('[PolygonWS] Market hours — connecting')
      this.connect()
    } else {
      const wait = msUntilNextOpen()
      const pst = nowPST()
      console.log(
        `[PolygonWS] Outside market hours (PST ${pst.getHours()}:${String(pst.getMinutes()).padStart(2, '0')} dow=${pst.getDay()}) ` +
        `— next open in ${Math.round(wait / 60000)}min`
      )
      // Clamp to minimum 5 minutes — prevents infinite tight-loop if calculation is off
      const safeWait = Math.max(5 * 60 * 1000, wait)
      this.scheduleTimer = setTimeout(() => this.schedule(), safeWait)
    }
  }

  private connect() {
    if (this.stopped) return
    const ws = new WebSocket(WS_URL)
    this.ws = ws

    // Auto-disconnect exactly 1s after market close (1:00:01 PM PST)
    const closeIn = msUntilClose()
    if (closeIn > 0) {
      this.closeTimer = setTimeout(() => {
        console.log('[PolygonWS] Market closed — disconnecting')
        ws.close()
        this.schedule()
      }, closeIn)
    }

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
            console.warn('[PolygonWS] max_connections: close other tabs or browser windows and reload.')
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
      if (this.closeTimer) { clearTimeout(this.closeTimer); this.closeTimer = null }
      if (this.stopped) return
      // Only reconnect during market hours — otherwise sleep until next open
      if (isMarketHours()) {
        console.warn('[PolygonWS] Dropped during market hours — reconnecting in 5s')
        this.scheduleTimer = setTimeout(() => this.connect(), 5000)
      } else {
        this.schedule()
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
    this.sendChunked(newAM.map((s) => `AM.${s}`))
    this.sendChunked(newA.map((s) => `A.${s}`))
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
  subscribe(
    id: string,
    config: {
      amSymbols?: string[]
      onAM?: (msg: PolygonAMMsg) => void
      aSymbol?: string
      onA?: (msg: PolygonAMsg) => void
    }
  ): () => void {
    const sub: Sub = {
      amSymbols: new Set(config.amSymbols ?? []),
      onAM: config.onAM,
      aSymbol: config.aSymbol,
      onA: config.onA,
    }
    this.subs.set(id, sub)

    // If already connected + authenticated, send new channels immediately
    if (this.authenticated && this.ws?.readyState === WebSocket.OPEN) {
      const newAM = (config.amSymbols ?? []).filter((s) => !this.sentAM.has(s))
      const newA = config.aSymbol && !this.sentA.has(config.aSymbol) ? [config.aSymbol] : []
      this.sendChunked(newAM.map((s) => `AM.${s}`))
      this.sendChunked(newA.map((s) => `A.${s}`))
      for (const s of newAM) this.sentAM.add(s)
      for (const s of newA) this.sentA.add(s)
    }

    return () => {
      this.subs.delete(id)
    }
  }
}

// SSR guard — only instantiate in the browser
export const polygonStocksWS: PolygonStocksWSService | null =
  typeof window !== 'undefined' ? PolygonStocksWSService.getInstance() : null
