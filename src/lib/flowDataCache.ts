'use client'
/**
 * flowDataCache — module-level singleton
 *
 * One DB read, shared across ALL components (OptionsFlow, AlgoFlow, Flow Matrix).
 * Whoever loads first populates the cache; everyone else reads from memory instantly.
 * Concurrent requests for the same date are deduplicated via pending-promise map.
 */

type FlowTrade = any

type DateEntry = { date: string; tradeCount?: number | null; source?: string }

// ── Caches ────────────────────────────────────────────────────────────────────
const tradeCache = new Map<string, FlowTrade[]>()
let datesListCache: DateEntry[] | null = null
let datesListPending: Promise<DateEntry[]> | null = null

/** Deduplicates concurrent fetches for the same date key */
const tradePending = new Map<string, Promise<FlowTrade[]>>()

// ── Dates list ────────────────────────────────────────────────────────────────
export async function getDatesList(): Promise<DateEntry[]> {
    if (datesListCache) return datesListCache
    if (datesListPending) return datesListPending

    datesListPending = fetch('/api/flows/dates')
        .then(r => r.ok ? r.json() : [])
        .then((data: DateEntry[]) => {
            datesListCache = Array.isArray(data) ? data : []
            datesListPending = null
            return datesListCache
        })
        .catch(() => {
            datesListPending = null
            return [] as DateEntry[]
        })

    return datesListPending
}

export function invalidateDatesList() {
    datesListCache = null
}

// ── Per-date trades ───────────────────────────────────────────────────────────
export function getCachedTrades(dateKey: string): FlowTrade[] | null {
    const k = dateKey.includes('T') ? dateKey.split('T')[0] : dateKey
    return tradeCache.has(k) ? tradeCache.get(k)! : null
}

export function setCachedTrades(dateKey: string, trades: FlowTrade[]) {
    const k = dateKey.includes('T') ? dateKey.split('T')[0] : dateKey
    tradeCache.set(k, trades)
}

/**
 * Load trades for one date. Checks cache → deduplicates concurrent fetches → fetches DB.
 * @param tickersQS optional query string like `?tickers=AAPL,NVDA`
 */
export async function loadDateTrades(dateKey: string, tickersQS = ''): Promise<FlowTrade[]> {
    const normalizedKey = dateKey.includes('T') ? dateKey.split('T')[0] : dateKey

    if (tradeCache.has(normalizedKey)) return tradeCache.get(normalizedKey)!

    const pendingKey = `${normalizedKey}${tickersQS}`
    if (tradePending.has(pendingKey)) return tradePending.get(pendingKey)!

    const promise = fetch(`/api/flows/${encodeURIComponent(dateKey)}${tickersQS}`)
        .then(r => r.ok ? r.json() : null)
        .then(json => {
            const trades: FlowTrade[] = Array.isArray(json?.data) ? json.data : []
            if (!tickersQS) tradeCache.set(normalizedKey, trades)
            tradePending.delete(pendingKey)
            return trades
        })
        .catch(() => {
            tradePending.delete(pendingKey)
            return [] as FlowTrade[]
        })

    tradePending.set(pendingKey, promise)
    return promise
}

/**
 * Load trades across multiple dates. Returns merged flat array.
 */
export async function loadMultiDateTrades(dateKeys: string[], tickersQS = ''): Promise<FlowTrade[]> {
    const results = await Promise.all(dateKeys.map(d => loadDateTrades(d, tickersQS)))
    const out: FlowTrade[] = []
    for (const arr of results) for (const t of arr) out.push(t)
    return out
}

// ── Utility ───────────────────────────────────────────────────────────────────
export function clearFlowCache() {
    tradeCache.clear()
    datesListCache = null
    datesListPending = null
    tradePending.clear()
}

export function getFlowCacheStats() {
    return {
        datesLoaded: datesListCache?.length ?? 0,
        datesInCache: tradeCache.size,
        totalCachedTrades: Array.from(tradeCache.values()).reduce((s, a) => s + a.length, 0),
    }
}

// cache-bust: 11:52:06
