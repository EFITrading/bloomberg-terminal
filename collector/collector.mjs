/**
 * Railway Options Flow Collector
 * ─────────────────────────────────────────────────────────────
 * Persistent Node.js WebSocket stream to wss://socket.polygon.io/options
 * Runs market open (9:30 AM ET) → market close (4:00 PM ET)
 * Buffers + enriches trades every 1 second
 * Upserts cumulative trades to Postgres (FlowBatch table) every 5 minutes
 */

import WebSocket from 'ws'
import { gzip, gunzip } from 'zlib'
import { promisify } from 'util'
import { PrismaClient } from '@prisma/client'

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

const POLYGON_API_KEY = process.env.POLYGON_API_KEY
if (!POLYGON_API_KEY) { console.error('[FATAL] POLYGON_API_KEY not set'); process.exit(1) }

// Use direct Postgres connection — bypass Prisma Accelerate proxy which has frequent 502s
// Railway is a persistent process and doesn't need connection pooling
const directUrl = process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_DATABASE_URL
if (!directUrl) { console.error('[FATAL] No Postgres URL set (POSTGRES_URL or POSTGRES_PRISMA_DATABASE_URL)'); process.exit(1) }
process.env.POSTGRES_PRISMA_DATABASE_URL = directUrl

const prisma = new PrismaClient()

// ── Market hours ──────────────────────────────────────────────────────────────
const US_MARKET_HOLIDAYS = new Set([
    '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
    '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
    '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31',
    '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
])

function getTradingDate() {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isMarketOpen() {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
    const day = now.getDay()
    if (day === 0 || day === 6) return false
    const tradingDate = getTradingDate()
    if (US_MARKET_HOLIDAYS.has(tradingDate)) return false
    const h = now.getHours(), m = now.getMinutes()
    const mins = h * 60 + m
    return mins >= 9 * 60 + 30 && mins < 16 * 60
}

function msUntilMarketOpen() {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
    const open = new Date(now)
    open.setHours(9, 30, 0, 0)
    if (now >= open) return 0
    return open.getTime() - now.getTime()
}

function msUntilMarketClose() {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
    const close = new Date(now)
    close.setHours(16, 0, 0, 0)
    return Math.max(0, close.getTime() - now.getTime())
}

// ── OCC ticker parser ─────────────────────────────────────────────────────────
function parseOCCTicker(sym) {
    if (!sym || !sym.startsWith('O:') || sym.length < 17) return null
    const suffix = sym.slice(-15)
    const underlying = sym.slice(2, sym.length - 15)
    if (!underlying) return null
    const yymmdd = suffix.slice(0, 6)
    const cp = suffix[6]
    const strikeStr = suffix.slice(7)
    if (!/^\d{6}$/.test(yymmdd) || (cp !== 'C' && cp !== 'P') || !/^\d{8}$/.test(strikeStr)) return null
    const expiry = `20${yymmdd.slice(0, 2)}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`
    const strike = parseInt(strikeStr, 10) / 1000
    return { underlying, expiry, type: cp === 'C' ? 'call' : 'put', strike }
}

// ── Trade classifier ──────────────────────────────────────────────────────────
function classifyTrade(size, conditions) {
    if (conditions.includes(41)) return 'MULTI-LEG'
    if (size >= 250) return 'BLOCK'
    if (size < 10) return 'MINI'
    return 'SWEEP'
}

// ── Index underlying map ──────────────────────────────────────────────────────
const INDEX_MAP = {
    SPXW: 'I:SPX', SPX: 'I:SPX',
    NDXP: 'I:NDX', NDX: 'I:NDX',
    RUTW: 'I:RUT', RUT: 'I:RUT',
    VIX: 'I:VIX', VIXW: 'I:VIX',
}

// ── Enrichment ────────────────────────────────────────────────────────────────
async function enrichBatch(trades) {
    const BATCH_SIZE = 50
    const cache = new Map()

    // Collect unique contracts
    const unique = new Map()
    for (const t of trades) {
        const key = t.ticker
        if (!unique.has(key)) unique.set(key, INDEX_MAP[t.underlying] ?? t.underlying)
    }

    const entries = Array.from(unique.entries())
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        const slice = entries.slice(i, i + BATCH_SIZE)
        await Promise.all(slice.map(async ([ticker, underlying]) => {
            try {
                const url = `https://api.polygon.io/v3/snapshot/options/${underlying}/${ticker}?apikey=${POLYGON_API_KEY}`
                const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
                if (!res.ok) { cache.set(ticker, null); return }
                const data = await res.json()
                if (data.results) {
                    const r = data.results
                    cache.set(ticker, {
                        volume: r.day?.volume || 0,
                        open_interest: r.open_interest || 0,
                        bid: r.last_quote?.bid || 0,
                        ask: r.last_quote?.ask || 0,
                        iv: r.implied_volatility || 0,
                        spot_price: r.underlying_asset?.price || 0,
                    })
                } else {
                    cache.set(ticker, null)
                }
            } catch {
                cache.set(ticker, null)
            }
        }))
    }

    return trades.map(t => {
        const c = cache.get(t.ticker)
        if (!c) return t
        const mid = (c.bid + c.ask) / 2
        let fill_type = 'N/A'
        const fill = t.premium_per_contract
        if (c.bid > 0 && c.ask > 0) {
            if (fill >= c.ask + 0.01) fill_type = 'AA'
            else if (fill <= c.bid - 0.01) fill_type = 'BB'
            else if (fill === c.ask) fill_type = 'A'
            else if (fill === c.bid) fill_type = 'B'
            else fill_type = fill >= mid ? 'A' : 'B'
        }
        return { ...t, volume: c.volume, open_interest: c.open_interest, iv: c.iv, spot_price: c.spot_price, fill_type }
    })
}

// ── Live OI accumulator ───────────────────────────────────────────────────────
// Mirrors applyLiveOIIncremental from the browser — runs server-side so liveOI
// is persisted into each saved trade record.
const liveOIMap = new Map() // contractKey → running liveOI

function applyLiveOI(trades) {
    if (trades.length === 0) return trades
    const sorted = [...trades].sort((a, b) => new Date(a.trade_timestamp) - new Date(b.trade_timestamp))
    const result = []
    for (const trade of sorted) {
        const key = `${trade.underlying_ticker}_${trade.strike}_${trade.type}_${trade.expiry}`
        const contracts = trade.trade_size ?? 0
        const baseOI = trade.open_interest ?? 0
        const currentOI = liveOIMap.has(key) ? liveOIMap.get(key) : baseOI
        let liveOI = currentOI
        switch (trade.fill_type) {
            case 'A': case 'AA': case 'BB':
                liveOI += contracts
                break
            case 'B':
                liveOI = contracts > baseOI
                    ? liveOI + contracts
                    : Math.max(0, liveOI - contracts)
                break
        }
        liveOI = Math.max(0, liveOI)
        liveOIMap.set(key, liveOI)
        result.push({
            ...trade,
            base_open_interest: trade.base_open_interest ?? trade.open_interest,
            open_interest: liveOI,
        })
    }
    return result
}


// Incremental save — only pendingTrades (last 30s) is held in memory.
// On each save: load existing day blob from DB, decompress, append new trades, recompress, upsert.
// This keeps the in-process array tiny (~50-100 items) regardless of how many trades accumulate.
async function saveToDB(tradingDate) {
    if (pendingTrades.length === 0) return
    const newTrades = [...pendingTrades]   // snapshot — don't clear until save succeeds

    let lastErr
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            // Load existing day's trades from DB (may be large — only in memory during merge)
            let existingTrades = []
            const existing = await prisma.flowBatch.findUnique({ where: { tradingDate }, select: { data: true } })
            if (existing) {
                const buf = Buffer.from(existing.data, 'base64')
                const decompressed = await gunzipAsync(buf)
                existingTrades = JSON.parse(decompressed.toString())
            }

            const combined = existingTrades.concat(newTrades)
            const compressed = await gzipAsync(JSON.stringify(combined))
            const base64 = compressed.toString('base64')
            const payload = { tradingDate, batchTime: new Date(), data: base64, tradeCount: combined.length }

            await prisma.flowBatch.upsert({
                where: { tradingDate },
                create: payload,
                update: payload,
                select: { id: true },
            })

            // Clear only after confirmed success
            pendingTrades.splice(0, newTrades.length)
            console.log(`[SAVE] ✓ ${combined.length} trades for ${tradingDate} (+${newTrades.length} new) | ${(compressed.length / 1024).toFixed(1)}KB`)
            return
        } catch (err) {
            lastErr = err
            console.warn(`[SAVE] Attempt ${attempt}/3 failed: ${err.message}`)
            if (attempt < 3) await new Promise(r => setTimeout(r, 2000))
        }
    }
    console.error('[SAVE] All retries failed — trades kept in pendingTrades for next cycle:', lastErr.message)
}

// ── Main stream ───────────────────────────────────────────────────────────────
let ws = null
let reconnectTimer = null
let flushTimer = null
let saveTimer = null
let rawBuffer = []          // incoming WS messages, flushed every 1s
let pendingTrades = []      // enriched trades since last DB save — cleared after each successful save
let intentionalStop = false // set before ws.terminate() so close handler doesn't reconnect
let collecting = false      // true while a trading session is active — prevents duplicate startCollecting calls

function startStream() {
    if (ws) { ws.terminate(); ws = null }
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }

    console.log('[WS] Connecting to wss://socket.polygon.io/options ...')
    ws = new WebSocket('wss://socket.polygon.io/options')

    ws.on('open', () => {
        console.log('[WS] Connected — authenticating ...')
        ws.send(JSON.stringify({ action: 'auth', params: POLYGON_API_KEY }))
    })

    ws.on('message', (data) => {
        try {
            const msgs = JSON.parse(data.toString())
            for (const msg of msgs) {
                if (msg.ev === 'status' && msg.status === 'auth_success') {
                    console.log('[WS] Authenticated — subscribing to T.*')
                    ws.send(JSON.stringify({ action: 'subscribe', params: 'T.*' }))
                } else if (msg.ev === 'T') {
                    const parsed = parseOCCTicker(msg.sym)
                    if (!parsed) continue
                    const totalPremium = msg.p * msg.s * 100
                    if (totalPremium < 1000) continue  // drop sub-$1k
                    rawBuffer.push({
                        ticker: msg.sym,
                        underlying: parsed.underlying,
                        underlying_ticker: parsed.underlying,
                        expiry: parsed.expiry,
                        type: parsed.type,
                        strike: parsed.strike,
                        trade_size: msg.s,
                        premium_per_contract: msg.p,
                        total_premium: totalPremium,
                        spot_price: 0,
                        exchange_id: msg.x,
                        trade_type: classifyTrade(msg.s, msg.c || []),
                        trade_timestamp: new Date(msg.t).toISOString(),
                        days_to_expiry: Math.max(0, Math.round((new Date(parsed.expiry) - Date.now()) / 86_400_000)),
                    })
                }
            }
        } catch { }
    })

    ws.on('error', (err) => {
        console.error('[WS] Error:', err.message)
    })

    ws.on('close', () => {
        ws = null
        if (intentionalStop) {
            intentionalStop = false
            return  // stopped on purpose — don't reconnect
        }
        console.log('[WS] Disconnected — reconnecting in 5s ...')
        if (isMarketOpen()) {
            reconnectTimer = setTimeout(startStream, 5000)
        }
    })
}

function stopStream() {
    if (!collecting) return  // already stopped — ignore duplicate calls
    collecting = false
    console.log('[STREAM] Market closed — stopping')
    intentionalStop = true
    if (ws) { ws.terminate(); ws = null }
    if (flushTimer) { clearInterval(flushTimer); flushTimer = null }
    if (saveTimer) { clearInterval(saveTimer); saveTimer = null }
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }

    // Final save
    const tradingDate = getTradingDate()
    saveToDB(tradingDate).then(() => {
        console.log('[STREAM] Final save complete. Waiting for next market open ...')
        scheduleNextOpen()
    })
}

function startCollecting() {
    if (collecting) return  // already running — ignore duplicate scheduler calls
    collecting = true
    // Reset daily state
    pendingTrades = []
    rawBuffer = []
    liveOIMap.clear()

    startStream()

    // 1-second flush: classify + enrich + apply live OI + push to allTrades
    flushTimer = setInterval(async () => {
        if (rawBuffer.length === 0) return
        const batch = rawBuffer.splice(0)
        try {
            const enriched = await enrichBatch(batch)
            const withOI = applyLiveOI(enriched)
            pendingTrades.push(...withOI)
            console.log(`[FLUSH] +${withOI.length} enriched | pending: ${pendingTrades.length}`)
        } catch (err) {
            console.error('[FLUSH] Enrich error:', err.message)
            pendingTrades.push(...batch)
        }
    }, 1000)

    // Save every 30 seconds so browser polls stay fresh
    saveTimer = setInterval(() => {
        saveToDB(getTradingDate())
    }, 30 * 1000)

    // Auto-stop at market close
    const msToClose = msUntilMarketClose()
    console.log(`[STREAM] Market closes in ${(msToClose / 1000 / 60).toFixed(1)} minutes`)
    setTimeout(stopStream, msToClose)
}

function scheduleNextOpen() {
    const tradingDate = getTradingDate()
    const day = new Date().getDay()
    const isHoliday = US_MARKET_HOLIDAYS.has(tradingDate)

    if (day === 0 || day === 6 || isHoliday) {
        // Weekend or holiday — check again in 1 hour
        console.log('[SCHEDULER] Weekend/holiday — checking again in 1 hour')
        setTimeout(scheduleNextOpen, 60 * 60 * 1000)
        return
    }

    const wait = msUntilMarketOpen()
    if (wait <= 0) {
        if (!isMarketOpen()) {
            // Past close already — schedule for tomorrow
            console.log('[SCHEDULER] Market already closed — checking again in 1 hour')
            setTimeout(scheduleNextOpen, 60 * 60 * 1000)
            return
        }
        console.log('[SCHEDULER] Market is open — starting now')
        startCollecting()
    } else {
        console.log(`[SCHEDULER] Market opens in ${(wait / 1000 / 60).toFixed(1)} minutes`)
        setTimeout(startCollecting, wait)
    }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
console.log('[BOOT] EFI Options Flow Collector starting ...')
scheduleNextOpen()
