/**
 * Live risk-free rate — fetched from US Treasury via /api/risk-free-rate
 * Cached in memory for 6 hours. Falls back to last good value if fetch fails.
 */

let _cachedRate: number | null = null
let _fetchedAt = 0
const TTL = 6 * 60 * 60 * 1000 // 6 hours

export async function getRiskFreeRate(): Promise<number | null> {
    const now = Date.now()
    if (_cachedRate !== null && now - _fetchedAt < TTL) return _cachedRate

    try {
        const res = await fetch('/api/risk-free-rate')
        if (!res.ok) return _cachedRate
        const json = await res.json()
        if (typeof json.rate === 'number' && json.rate > 0) {
            _cachedRate = json.rate
            _fetchedAt = now
        }
        return _cachedRate
    } catch {
        return _cachedRate
    }
}

/** Sync getter — returns last fetched value or null if never fetched. */
export function getCachedRiskFreeRate(): number | null {
    return _cachedRate
}
