import { Redis } from '@upstash/redis'

// Singleton Upstash Redis client — REST-based, works in Vercel serverless
// Requires env vars: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
// Set these in Vercel dashboard → Settings → Environment Variables

const globalForRedis = globalThis as unknown as { redis: Redis | undefined }

function buildRedis(): Redis | null {
    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN
    if (!url || !token) return null
    return new Redis({ url, token })
}

export const redis: Redis | null = globalForRedis.redis ?? buildRedis()

if (process.env.NODE_ENV !== 'production') {
    globalForRedis.redis = redis ?? undefined
}

// ── Flow cache helpers ────────────────────────────────────────────────────────

const FULL_DAY_TTL = 30 // seconds — slightly less than the 30s browser poll interval

/** Cache key for the full merged trade list for a trading date */
const fullDayKey = (tradingDate: string) => `flow:full:${tradingDate}`

/** Read cached full-day response. Returns null on miss, Redis unavailable, or any error. */
export async function getCachedFullDay(
    tradingDate: string
): Promise<{ trades: unknown[]; tradeCount: number; batchTime: string } | null> {
    if (!redis) return null
    try {
        const raw = await redis.get<string>(fullDayKey(tradingDate))
        if (!raw) return null
        return JSON.parse(raw)
    } catch {
        return null
    }
}

/** Store full-day response in Redis. Silently ignores errors (cache is best-effort). */
export async function setCachedFullDay(
    tradingDate: string,
    payload: { trades: unknown[]; tradeCount: number; batchTime: string }
): Promise<void> {
    if (!redis) return
    try {
        await redis.set(fullDayKey(tradingDate), JSON.stringify(payload), { ex: FULL_DAY_TTL })
    } catch {
        // Non-critical — fall through to Postgres on next request
    }
}

/** Invalidate the full-day cache (called after a new batch is saved). */
export async function invalidateFullDay(tradingDate: string): Promise<void> {
    if (!redis) return
    try {
        await redis.del(fullDayKey(tradingDate))
    } catch {
        // Non-critical
    }
}

// ── SweepSense snapshot cache helpers ──────────────────────────────────────────
// Mirrors the flow-cache pattern above: check Redis before hitting Postgres.
// Snapshots are saved once/day (after close) and never mutated afterward, so a much
// longer TTL is safe here — this just saves a round-trip to Postgres on every
// afterhours page load/poll for the same trading date.

const SWEEPSENSE_TTL = 60 * 60 * 12 // 12 hours — comfortably covers a full afterhours session

/** Cache key for a saved SweepSense snapshot for a trading date */
const sweepSenseKey = (tradingDate: string) => `sweepsense:${tradingDate}`

export interface CachedSweepSenseSnapshot {
    tradingDate: string
    data: unknown
    tradeCount: number
    updatedAt: string
}

/** Read cached SweepSense snapshot. Returns null on miss, Redis unavailable, or any error. */
export async function getCachedSweepSense(
    tradingDate: string
): Promise<CachedSweepSenseSnapshot | null> {
    if (!redis) return null
    try {
        const raw = await redis.get<string>(sweepSenseKey(tradingDate))
        if (!raw) return null
        return JSON.parse(raw)
    } catch {
        return null
    }
}

/** Store a SweepSense snapshot in Redis. Silently ignores errors (cache is best-effort). */
export async function setCachedSweepSense(
    tradingDate: string,
    payload: CachedSweepSenseSnapshot
): Promise<void> {
    if (!redis) return
    try {
        await redis.set(sweepSenseKey(tradingDate), JSON.stringify(payload), { ex: SWEEPSENSE_TTL })
    } catch {
        // Non-critical — fall through to Postgres on next request
    }
}

/** Invalidate the SweepSense cache (called after a new snapshot is saved). */
export async function invalidateSweepSense(tradingDate: string): Promise<void> {
    if (!redis) return
    try {
        await redis.del(sweepSenseKey(tradingDate))
    } catch {
        // Non-critical
    }
}

// ── Seasonal screener scan cache ──────────────────────────────────────────────
// One user's scan (normal / seasoned / leaps, per market+timeframe) gets cached so
// every other user hitting the same combo within the window reuses the result
// instead of re-triggering hundreds of per-symbol Polygon calls. Cached for the rest
// of the current trading day (America/New_York) — first scan of the day "pays" for
// everyone else, and it naturally re-scans fresh the next day.

/** Seconds remaining until midnight America/New_York (min 60s floor as a safety net). */
function secondsUntilMidnightET(): number {
    const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
    const midnight = new Date(nowET)
    midnight.setHours(24, 0, 0, 0)
    return Math.max(60, Math.round((midnight.getTime() - nowET.getTime()) / 1000))
}

/** Today's trading-day date string (America/New_York), used to scope cache keys per-day. */
export function tradingDayKeyET(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) // YYYY-MM-DD
}

const seasonalScanKey = (key: string) => `seasonal-scan:${key}`

/** Read a cached seasonal scan result. Returns null on miss, Redis unavailable, or any error. */
export async function getCachedSeasonalScan(key: string): Promise<unknown | null> {
    if (!redis) return null
    try {
        const raw = await redis.get<string>(seasonalScanKey(key))
        if (!raw) return null
        return JSON.parse(raw)
    } catch {
        return null
    }
}

/** Store a seasonal scan result in Redis until the trading day rolls over. Silently ignores errors. */
export async function setCachedSeasonalScan(key: string, data: unknown): Promise<void> {
    if (!redis) return
    try {
        await redis.set(seasonalScanKey(key), JSON.stringify(data), { ex: secondsUntilMidnightET() })
    } catch {
        // Non-critical — next request just re-scans
    }
}

// ── Scan dedupe lock ───────────────────────────────────────────────────────────
// Prevents a "thundering herd" of concurrent users all triggering the same expensive
// scan simultaneously — the first requester acquires the lock and scans; everyone
// else sees the lock held and polls the cache instead until the first scan finishes.

const scanLockKey = (key: string) => `seasonal-scan-lock:${key}`

/** Attempts to become the one requester allowed to run this scan. Returns true if this
 * caller won the race (must scan, then call releaseScanLock when done); false if someone
 * else already holds the lock (caller should wait/poll the cache instead). */
export async function tryAcquireScanLock(key: string, ttlSeconds = 120): Promise<boolean> {
    if (!redis) return true // no Redis available - just let every caller scan independently
    try {
        const ok = await redis.set(scanLockKey(key), '1', { nx: true, ex: ttlSeconds })
        return ok !== null
    } catch {
        return true
    }
}

/** Releases a scan lock early (call this right after the scan finishes and the cache is written,
 * instead of waiting out the full TTL). */
export async function releaseScanLock(key: string): Promise<void> {
    if (!redis) return
    try {
        await redis.del(scanLockKey(key))
    } catch {
        // Non-critical — lock just expires on its own
    }
}

