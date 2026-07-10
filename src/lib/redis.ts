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
