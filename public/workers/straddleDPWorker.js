// Straddle Town — Phase 3 Dark Pool Scan Worker
// Receives ONE symbol at a time from the main thread's worker pool.
// When done, posts back dpDays so the main thread can do POI clustering + trade building.
// sessionStorage is NOT accessible in workers — main thread handles the cache.

const DARK_POOL_EXCHANGES = new Set([4, 6, 16, 201, 202, 203])
const LIT_BLOCK_MIN_NOTIONAL = 250_000

async function fetchWithRetry(url, maxAttempts = 4) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const ac = new AbortController()
        const timer = setTimeout(() => ac.abort(), 10000)
        try {
            const res = await fetch(url, { signal: ac.signal })
            clearTimeout(timer)
            if (res.ok) return res
            if (res.status === 429) {
                await new Promise(r => setTimeout(r, 2000 * (attempt + 1) + Math.random() * 500))
                continue
            }
            await res.text().catch(() => { })
            return null
        } catch {
            clearTimeout(timer)
            if (attempt < maxAttempts - 1) {
                const delay = Math.min(300 * Math.pow(2, attempt) + Math.random() * 200, 3000)
                await new Promise(r => setTimeout(r, delay))
            }
        }
    }
    return null
}

async function fetchWindowStreaming(url) {
    const res = await fetchWithRetry(url)
    if (!res) return { prints: [], windowNotional: 0 }
    let json
    try { json = await res.json() } catch { return { prints: [], windowNotional: 0 } }

    let top = []
    let windowNotional = 0
    for (const t of (json.results || [])) {
        const notional = t.size * t.price
        const isDarkPool = DARK_POOL_EXCHANGES.has(t.exchange)
        if (isDarkPool || notional >= LIT_BLOCK_MIN_NOTIONAL) {
            windowNotional += notional
            top.push({ price: t.price, size: t.size, ts: Math.floor(t.sip_timestamp / 1_000_000) })
        }
    }
    if (top.length > 50) {
        top = top.sort((a, b) => b.size * b.price - a.size * a.price).slice(0, 50)
    }
    return { prints: top, windowNotional }
}

// Scan up to DAY_CONCURRENCY days simultaneously.
// Windows within each day remain sequential (avoids connection resets).
const DAY_CONCURRENCY = 4

async function scanDay(dateKey, symbol, apiKey, wid) {
    const dayStartMs = new Date(dateKey).getTime()
    const d = new Date(dateKey + 'T12:00:00Z')
    const yr = d.getUTCFullYear()
    const marchSun = new Date(Date.UTC(yr, 2, 8))
    while (marchSun.getUTCDay() !== 0) marchSun.setUTCDate(marchSun.getUTCDate() + 1)
    const novSun = new Date(Date.UTC(yr, 10, 1))
    while (novSun.getUTCDay() !== 0) novSun.setUTCDate(novSun.getUTCDate() + 1)
    const isEDT = d >= marchSun && d < novSun
    const etOffsetMs = isEDT ? 4 * 3600_000 : 5 * 3600_000
    const rthStartNs = (dayStartMs + 9 * 3600_000 + 30 * 60_000 + etOffsetMs) * 1_000_000
    const rthEndNs = (dayStartMs + 16 * 3600_000 + 15 * 60_000 + etOffsetMs) * 1_000_000
    const WIN = 3
    const winNs = (rthEndNs - rthStartNs) / WIN

    try {
        const winResults = []
        for (let i = 0; i < WIN; i++) {
            const s = rthStartNs + i * winNs
            const e = rthStartNs + (i + 1) * winNs
            const url = `https://api.polygon.io/v3/trades/${symbol}?timestamp.gte=${s}&timestamp.lte=${e}&limit=10000&order=asc&apiKey=${apiKey}`
            winResults.push(await fetchWindowStreaming(url))
        }
        const allPrints = winResults.flatMap(w => w.prints).sort((a, b) => b.size * b.price - a.size * a.price)
        const totalNotional = winResults.reduce((s, w) => s + w.windowNotional, 0)
        if (allPrints.length > 0) {
            const top10 = allPrints.slice(0, 10)
            return { date: dateKey, top10, totalNotional, topPrint: top10[0] }
        }
    } catch { /* skip failed day */ }
    return null
}

async function scanDPDates(dates, symbol, apiKey, wid) {
    self.postMessage({ type: 'log', msg: `[DP-W${wid}] ${symbol}: scanning ${dates.length} days (concurrency=${DAY_CONCURRENCY})` })
    const t0 = Date.now()

    const dpDays = []
    let done = 0
    const queue = [...dates]

    const dayWorker = async () => {
        while (queue.length > 0) {
            const dateKey = queue.shift()
            const result = await scanDay(dateKey, symbol, apiKey, wid)
            done++
            if (result) dpDays.push(result)
            self.postMessage({ type: 'progress', symbol })
            if (done % 15 === 0 || done === dates.length) {
                self.postMessage({ type: 'log', msg: `[DP-W${wid}] ${symbol}: ${done}/${dates.length} days done (${dpDays.length} w/ prints)` })
            }
        }
    }

    await Promise.all(Array.from({ length: Math.min(DAY_CONCURRENCY, dates.length) }, dayWorker))

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
    self.postMessage({ type: 'log', msg: `[DP-W${wid}] ${symbol}: complete — ${dpDays.length} dp days in ${elapsed}s` })
    return dpDays
}

self.onmessage = async function (e) {
    const { symbol, dates, apiKey, workerId } = e.data
    const wid = workerId ?? '?'
    try {
        const dpDays = await scanDPDates(dates, symbol, apiKey, wid)
        self.postMessage({ type: 'done', symbol, dpDays })
    } catch {
        self.postMessage({ type: 'log', msg: `[DP-W${wid}] ${symbol}: threw, returning empty` })
        self.postMessage({ type: 'done', symbol, dpDays: [] })
    }
}
