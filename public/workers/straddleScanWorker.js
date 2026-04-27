// Straddle Town — Phase 2 OHLCV + Contraction Scan Worker
// Each worker receives a chunk of symbols, fetches OHLCV, detects contractions,
// and posts hits back to the main thread. No shared state with other workers.

const MIN_AVG_HV = 1.5
const CONTRACTION_THRESHOLD = 40
const SCAN_TRADING_DAYS = 2

function calcEMA(vals, p) {
    if (vals.length < p) return 0
    const k = 2 / (p + 1)
    let e = vals.slice(0, p).reduce((s, v) => s + v, 0) / p
    for (let i = p; i < vals.length; i++) e = (vals[i] - e) * k + e
    return e
}

function calcATR(bars, p = 14) {
    if (bars.length < p + 1) return 0
    const trs = []
    for (let i = 1; i < bars.length; i++) {
        const h = bars[i].high, l = bars[i].low, pc = bars[i - 1].close
        trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)))
    }
    return trs.slice(-p).reduce((s, t) => s + t, 0) / p
}

function ttmSqueeze(bars, p = 20) {
    if (bars.length < p) return false
    const cl = bars.slice(-p).map(b => b.close)
    const sma = cl.reduce((s, c) => s + c, 0) / p
    const std = Math.sqrt(cl.reduce((s, c) => s + (c - sma) ** 2, 0) / p)
    const ema = calcEMA(cl, p)
    const atr = calcATR(bars, p)
    return sma + 2 * std < ema + 1.5 * atr && sma - 2 * std > ema - 1.5 * atr
}

function calcHV4D(bars, lookback = 120) {
    if (bars.length < lookback) return 0
    const rb = bars.slice(-lookback)
    const moves = []
    for (let i = 4; i < rb.length; i++) {
        const h = Math.max(...rb.slice(i - 4, i + 1).map(b => b.high))
        const l = Math.min(...rb.slice(i - 4, i + 1).map(b => b.low))
        moves.push(((h - l) / l) * 100)
    }
    return moves.length ? moves.reduce((s, m) => s + m, 0) / moves.length : 0
}

function detectContraction(bars) {
    if (bars.length < 120) return { qualifies: false, compressionPct: 0 }
    const lb = bars.slice(-4)
    if (lb.length < 4) return { qualifies: false, compressionPct: 0 }
    const avgHV = calcHV4D(bars)
    if (!avgHV || avgHV < MIN_AVG_HV) return { qualifies: false, compressionPct: 0 }
    const high = Math.max(...lb.map(b => b.high))
    const low = Math.min(...lb.map(b => b.low))
    const currentRange = high - low
    const rangePercent = (currentRange / low) * 100
    const compressionPct = ((avgHV - rangePercent) / avgHV) * 100
    const netMove = Math.abs(lb[lb.length - 1].close - lb[0].close)
    const notTrending = currentRange > 0 ? netMove / currentRange < 0.8 : false
    const curBar = lb[lb.length - 1]
    const avgBarRange = lb.reduce((s, b) => s + (b.high - b.low), 0) / lb.length
    const curBarTight = avgBarRange > 0 && curBar.high - curBar.low <= avgBarRange * 2.0
    const qualifies = compressionPct > CONTRACTION_THRESHOLD && notTrending && curBarTight
    return { qualifies, compressionPct }
}

function scanHistory(allBars) {
    const events = []
    let inC = false, peakC = 0, lastIdx = -1
    const emit = () => {
        if (!inC || lastIdx < 0) return
        events.push({
            date: allBars[lastIdx].date,
            price: allBars[lastIdx].close,
            compressionPct: peakC,
            squeezeOn: ttmSqueeze(allBars.slice(0, lastIdx + 1)),
        })
        inC = false; peakC = 0; lastIdx = -1
    }
    for (let i = 120; i < allBars.length; i++) {
        const r = detectContraction(allBars.slice(0, i + 1))
        if (r.qualifies) {
            if (!inC) { inC = true; peakC = r.compressionPct }
            else if (r.compressionPct > peakC) peakC = r.compressionPct
            lastIdx = i
        } else {
            if (inC) emit()
        }
    }
    if (inC) emit()
    return events
}

async function fetchOHLCV(symbol, apiKey, calDays, limit) {
    const toDate = new Date().toISOString().split('T')[0]
    const from = new Date()
    from.setDate(from.getDate() - calDays)
    const fromDate = from.toISOString().split('T')[0]
    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fromDate}/${toDate}?adjusted=true&sort=asc&limit=${limit}&apiKey=${apiKey}`

    for (let attempt = 0; attempt < 3; attempt++) {
        const ac = new AbortController()
        const timer = setTimeout(() => ac.abort(), 15000)
        try {
            const res = await fetch(url, { signal: ac.signal })
            clearTimeout(timer)
            if (!res.ok) return null
            const json = await res.json()
            if (!json.results?.length) return null
            return json.results.map(r => ({
                date: new Date(r.t).toISOString().split('T')[0],
                open: r.o, high: r.h, low: r.l, close: r.c, volume: r.v, t: r.t,
            }))
        } catch {
            clearTimeout(timer)
            if (attempt < 2) {
                await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt) + Math.random() * 200))
            }
        }
    }
    return null
}

// Process up to CONCURRENCY symbols simultaneously within this worker
const INTERNAL_CONCURRENCY = 6

async function processSymbol(sym, apiKey, calDays, ohlcvLimit, scanMode, wid) {
    const bars = await fetchOHLCV(sym, apiKey, calDays, ohlcvLimit)

    if (!bars || bars.length < 120) {
        self.postMessage({ type: 'progress' })
        return
    }

    const allEvts = scanHistory(bars)
    const lastNDates = new Set(bars.slice(-SCAN_TRADING_DAYS).map(b => b.date))
    const recentEvts = allEvts.filter(e => lastNDates.has(e.date))

    self.postMessage({ type: 'progress' })

    const strongRecentEvts = recentEvts.filter(e => e.compressionPct > CONTRACTION_THRESHOLD)
    if (scanMode === 'poi' || strongRecentEvts.length > 0) {
        self.postMessage({ type: 'log', msg: `[SCAN-W${wid}] HIT ${sym} | bars=${bars.length} compression=${strongRecentEvts[0]?.compressionPct?.toFixed(1) ?? 'poi'}%` })
        self.postMessage({
            type: 'hit',
            symbol: sym,
            bars,
            allEvents: allEvts,
            recentEvents: scanMode === 'poi' ? [] : strongRecentEvts,
        })
    }
}

self.onmessage = async function (e) {
    const { symbols, apiKey, calDays, ohlcvLimit, scanMode, workerId } = e.data
    const wid = workerId ?? '?'

    self.postMessage({ type: 'log', msg: `[SCAN-W${wid}] start — ${symbols.length} symbols, concurrency=${INTERNAL_CONCURRENCY}` })
    const t0 = Date.now()

    // Run INTERNAL_CONCURRENCY symbols at once — like runWithConcurrency but inside the worker
    const queue = [...symbols]
    let hits = 0
    const worker = async () => {
        while (queue.length > 0) {
            const sym = queue.shift()
            await processSymbol(sym, apiKey, calDays, ohlcvLimit, scanMode, wid)
        }
    }
    await Promise.all(Array.from({ length: Math.min(INTERNAL_CONCURRENCY, symbols.length) }, worker))

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
    self.postMessage({ type: 'log', msg: `[SCAN-W${wid}] done — ${symbols.length} symbols in ${elapsed}s` })
    self.postMessage({ type: 'done' })
}
