// Shared helper for the seasonal-scan dedupe pattern: only the first concurrent caller
// for a given cache key actually runs the (expensive) scan; every other caller polls the
// cache instead of re-scanning, until the first scan finishes and writes the result.

/** Try to become the one caller allowed to scan for `key`. Returns true if this caller
 * should run the scan (and must call releaseScanLock when done); false if another caller
 * already holds the lock. */
export async function acquireScanLock(key: string): Promise<boolean> {
  try {
    const res = await fetch('/api/seasonal-cache/lock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    })
    const { acquired } = await res.json()
    return acquired !== false
  } catch {
    return true // lock endpoint unavailable - fall back to scanning independently
  }
}

/** Releases a scan lock early (right after the scan finishes and the cache is written). */
export function releaseScanLock(key: string): void {
  fetch(`/api/seasonal-cache/lock?key=${encodeURIComponent(key)}`, { method: 'DELETE' }).catch(() => {})
}

/** Polls /api/seasonal-cache for `key` until data appears or `maxWaitMs` elapses (another
 * caller is running the scan). Returns the cached data, or null on timeout. */
export async function waitForScanCache<T>(
  key: string,
  maxWaitMs = 90000,
  pollMs = 2000
): Promise<T | null> {
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollMs))
    try {
      const res = await fetch(`/api/seasonal-cache?key=${encodeURIComponent(key)}`)
      const { data } = await res.json()
      if (data && (!Array.isArray(data) || data.length > 0)) return data as T
    } catch {
      // ignore and keep polling
    }
  }
  return null
}
