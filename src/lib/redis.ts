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
