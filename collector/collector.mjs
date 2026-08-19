/**
 * Railway Options Flow Collector
 * ─────────────────────────────────────────────────────────────
 * Persistent Node.js WebSocket stream to wss://socket.polygon.io/options
 * Runs market open (9:30 AM ET) → market close (4:00 PM ET)
 * Buffers + enriches trades every 1 second
 * Saves new trades to Postgres (FlowBatch table) every 5 seconds
 */

import WebSocket from 'ws'
import { gzip, gunzip } from 'zlib'
import { promisify } from 'util'
import { PrismaClient } from '@prisma/client'

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

const POLYGON_API_KEY = process.env.POLYGON_API_KEY
if (!POLYGON_API_KEY) { console.error('[FATAL] POLYGON_API_KEY not set'); process.exit(1) }

// SweepSense end-of-day auto-save (headless browser trigger) — see runSweepSenseAutoSave() below.
const APP_URL = process.env.APP_URL
const COLLECTOR_SECRET = process.env.COLLECTOR_SECRET
// Real site login used by the headless browser so it sees the actual logged-in page instead
// of relying on a middleware bypass header. Must match ADMIN_PASSWORD or SITE_PASSWORD on Vercel.
const COLLECTOR_LOGIN_PASSWORD = process.env.COLLECTOR_LOGIN_PASSWORD
// Discord webhook for "Ready 4 Pickup" SweepSense alerts — see runSweepSenseDiscordAlert() below.
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL

// Use direct Postgres connection — bypass Prisma Accelerate proxy which has frequent 502s
// Railway is a persistent process and doesn't need connection pooling
const directUrl = process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_DATABASE_URL
if (!directUrl) { console.error('[FATAL] No Postgres URL set (POSTGRES_URL or POSTGRES_PRISMA_DATABASE_URL)'); process.exit(1) }

// Cap to 2 connections — collector is sequential, never needs more than 1 active
// at a time. Frees up ~8 connections for Vercel lambdas on the shared 25-conn pool.
const collectorUrl = directUrl + (directUrl.includes('?') ? '&' : '?') + 'connection_limit=2&pool_timeout=10'
process.env.POSTGRES_PRISMA_DATABASE_URL = collectorUrl

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

// ── Trade classifier (group-based, mirrors browser classifyLiveBatch) ────────
// Applied to each 1-second batch so sweep detection works across fills.
function classifyBatch(trades) {
    // Step 1: MULTI-LEG — same underlying within 100ms, 2-4 legs ≥100 contracts each,
    //         different strikes/types/expiries, combined premium ≥$25k
    const mlGroups = new Map()
    for (const t of trades) {
        const bucket = Math.floor(new Date(t.trade_timestamp).getTime() / 100) * 100
        const key = `${t.underlying_ticker}_${bucket}`
        if (!mlGroups.has(key)) mlGroups.set(key, [])
        mlGroups.get(key).push(t)
    }
    const multiLegIds = new Set()
    for (const [, group] of mlGroups) {
        if (group.length < 2 || group.length > 4) continue
        const strikes = new Set(group.map(t => t.strike))
        const types = new Set(group.map(t => t.type))
        const expiries = new Set(group.map(t => t.expiry))
        const hasMultiStructure = strikes.size >= 2 || types.size >= 2 || expiries.size >= 2
        const allBig = group.every(t => t.trade_size >= 100)
        const totalPrem = group.reduce((s, t) => s + t.total_premium, 0)
        if (hasMultiStructure && allBig && totalPrem >= 25000) {
            for (const t of group) multiLegIds.add(`${t.ticker}_${t.trade_timestamp}`)
        }
    }

    // Step 2: SWEEP — same contract within a 3-second window across 2+ different exchanges
    const sweepGroups = new Map()
    for (const t of trades) {
        if (multiLegIds.has(`${t.ticker}_${t.trade_timestamp}`)) continue
        const win = Math.floor(new Date(t.trade_timestamp).getTime() / 3000) * 3000
        const key = `${t.underlying_ticker}_${t.strike}_${t.type}_${t.expiry}_${win}`
        if (!sweepGroups.has(key)) sweepGroups.set(key, [])
        sweepGroups.get(key).push(t)
    }
    const consumedIds = new Set()
    const swept = []
    for (const [, group] of sweepGroups) {
        const exchanges = new Set(group.map(t => t.exchange_id))
        if (exchanges.size < 2) continue  // single exchange — not a sweep
        for (const t of group) consumedIds.add(`${t.ticker}_${t.trade_timestamp}`)
        const totalSize = group.reduce((s, t) => s + t.trade_size, 0)
        const totalPrem = group.reduce((s, t) => s + t.total_premium, 0)
        const weightedPrice = totalSize > 0 ? totalPrem / (totalSize * 100) : group[0].premium_per_contract
        swept.push({
            ...group[0],
            trade_size: totalSize,
            premium_per_contract: weightedPrice,
            total_premium: totalPrem,
            trade_type: 'SWEEP',
            exchange_name: `MULTI-EXCHANGE (${group.length} fills, ${exchanges.size} exchanges)`,
        })
    }

    // Step 3: BLOCK (≥250 contracts, single exchange) or MINI (everything else)
    const result = [...swept]
    for (const t of trades) {
        const id = `${t.ticker}_${t.trade_timestamp}`
        if (consumedIds.has(id)) continue
        if (multiLegIds.has(id)) result.push({ ...t, trade_type: 'MULTI-LEG' })
        else if (t.trade_size >= 250) result.push({ ...t, trade_type: 'BLOCK' })
        else result.push({ ...t, trade_type: 'MINI' })
    }
    return result
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
        const spot = c.spot_price
        let moneyness = t.moneyness
        if (spot > 0) {
            const ATM_BAND = 0.005
            const pct = (t.strike - spot) / spot
            if (t.type === 'call') {
                moneyness = pct <= -ATM_BAND ? 'ITM' : pct >= ATM_BAND ? 'OTM' : 'ATM'
            } else {
                moneyness = pct >= ATM_BAND ? 'ITM' : pct <= -ATM_BAND ? 'OTM' : 'ATM'
            }
        }
        return { ...t, volume: c.volume, open_interest: c.open_interest, iv: c.iv, spot_price: c.spot_price, fill_style: fill_type, moneyness }
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
        switch (trade.fill_style) {
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


// Append-only saves — each 30s window is a small separate record.
// No read-before-write, so no string length issues regardless of daily volume.
async function saveToDB(tradingDate) {
    if (pendingTrades.length === 0) return
    const newTrades = [...pendingTrades]
    let lastErr
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const compressed = await gzipAsync(JSON.stringify(newTrades))
            const base64 = compressed.toString('base64')
            await prisma.flowBatch.create({
                data: { tradingDate, batchTime: new Date(), data: base64, tradeCount: newTrades.length },
                select: { id: true },
            })
            pendingTrades.splice(0, newTrades.length)
            console.log(`[SAVE] ✓ +${newTrades.length} trades for ${tradingDate} | ${(compressed.length / 1024).toFixed(1)}KB`)
            return
        } catch (err) {
            lastErr = err
            console.warn(`[SAVE] Attempt ${attempt}/3 failed: ${err.message}`)
            if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 2000))
        }
    }
    console.error('[SAVE] All retries failed — trades kept in pendingTrades for next cycle:', lastErr.message)
}

// ── Main stream ───────────────────────────────────────────────────────────────
let ws = null
let reconnectTimer = null
let flushTimer = null
let saveTimer = null
let discordAlertTimer = null
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
                    if (totalPremium < 50000) continue  // drop sub-$50k — only save significant flow
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
                        trade_type: 'MINI',  // placeholder — classifyBatch overrides in flush
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
    if (discordAlertTimer) { clearInterval(discordAlertTimer); discordAlertTimer = null }

    // Final save
    const tradingDate = getTradingDate()
    saveToDB(tradingDate).then(() => {
        console.log('[STREAM] Final save complete. Waiting for next market open ...')
        scheduleNextOpen()
    })

    // Trigger the SweepSense end-of-day snapshot ~1 minute after close — matches the
    // window OptionsFlowTable.tsx's own save effect gates on (1:01-1:59 PM PST). Runs
    // once per day; harmless/idempotent if it overlaps a manual browser tab doing the
    // same save (DB upsert just overwrites).
    setTimeout(runSweepSenseAutoSave, 60 * 1000)
}

// Logs into the real site via POST /api/auth and returns the Set-Cookie values so a puppeteer
// page can be seeded with them via page.setCookie() - same session a real user gets, no
// middleware/AuthGuard bypass hacks needed.
async function loginCookies() {
    if (!COLLECTOR_LOGIN_PASSWORD) { console.warn('[Auth] COLLECTOR_LOGIN_PASSWORD not set — headless page will be unauthenticated'); return [] }
    const res = await fetch(`${APP_URL}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: COLLECTOR_LOGIN_PASSWORD }),
    })
    if (!res.ok) { console.warn(`[Auth] Login failed: ${res.status}`); return [] }
    const setCookie = res.headers.get('set-cookie') || ''
    const domain = new URL(APP_URL).hostname
    // Node's fetch folds multiple Set-Cookie headers into one string joined by ', ' in some
    // runtimes - split on the pattern that separates distinct cookie definitions.
    return setCookie.split(/,(?=\s*[\w-]+=)/).map((part) => {
        const [nameValue] = part.split(';')
        const [name, ...rest] = nameValue.split('=')
        return { name: name.trim(), value: rest.join('=').trim(), domain, path: '/' }
    }).filter((c) => c.name && c.value)
}

// ── SweepSense auto-save (headless browser) ───────────────────────────────────
// The SweepSense grading pipeline lives entirely in the browser (OptionsFlowTable.tsx)
// and depends on many other client-only functions/caches — re-implementing that math
// here would risk silently drifting from the real grading logic. Instead, this opens
// the REAL page in headless Chromium so the exact same, already-tested client code
// runs and saves itself via its own existing effect (which POSTs to /api/sweepsense/save
// once the scan settles). This function's only job is making sure a browser visits
// that page once, right after close, every trading day.
async function runSweepSenseAutoSave() {
    if (!APP_URL) { console.warn('[SweepSense] APP_URL not set — skipping auto-save trigger'); return }
    console.log('[SweepSense] Launching headless browser to trigger end-of-day save...')
    let browser
    try {
        const puppeteer = (await import('puppeteer')).default
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
        const page = await browser.newPage()
        const cookies = await loginCookies()
        if (cookies.length > 0) await page.setCookie(...cookies)
        await page.goto(`${APP_URL}/options-flow`, { waitUntil: 'domcontentloaded', timeout: 60_000 })

        try {
            const response = await page.waitForResponse(
                (res) => res.url().includes('/api/sweepsense/save') && res.request().method() === 'POST',
                { timeout: 4 * 60 * 1000 }
            )
            console.log(`[SweepSense] Save request observed: ${response.status()}`)
        } catch {
            console.log('[SweepSense] No save request observed within the wait window.')
        }
    } catch (err) {
        console.error('[SweepSense] Auto-save trigger failed:', err.message)
    } finally {
        if (browser) await browser.close().catch(() => { })
    }
}

// ── SweepSense Discord card rendering (static self-built HTML, no live-page screenshot) ────
// Everything needed is already in the scraped `data-flow-payload` JSON (see
// flowAlertPayload in FlowTrackingPanel.tsx). Rather than screenshotting the REAL, constantly
// reflowing app card (the old approach - fragile: wrong-ticker / cropped captures), this builds
// a small isolated static HTML page from that JSON and screenshots THAT instead. Since nothing
// on this page ever changes after it's set, there's no reflow race to land a bad capture in.
const fmtMoney = (n) => {
    if (n === null || n === undefined || !isFinite(n)) return 'N/A'
    const abs = Math.abs(n)
    if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
    if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
    return `$${n.toFixed(2)}`
}
const fmtPrice = (n) => (n === null || n === undefined || !isFinite(n)) ? 'N/A' : `$${n.toFixed(2)}`
const fmtPct = (n) => (n === null || n === undefined || !isFinite(n)) ? 'N/A' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Icons kept as tiny inline SVGs (not emoji) - headless Chromium on Railway has no color
// emoji font installed, so emoji would render as empty boxes.
const ICON_CROSSHAIR = '<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="8" fill="none" stroke="#22d3ee" stroke-width="2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="#22d3ee" stroke-width="2"/></svg>'
const ICON_TARGET = '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 16l6-6 4 4 6-8" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 6h6v6" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const ICON_SHIELD = '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5z" fill="none" stroke="#ef4444" stroke-width="2" stroke-linejoin="round"/></svg>'
const ICON_SPAM = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 10v4h4l5 4V6l-5 4H3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M16 9c1 1 1 5 0 6M19 7c2 2 2 8 0 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
const ICON_STRUCT = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 20h18M5 20V10h4v10M15 20V10h4v10M9 10V6h6v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>'
const ICON_GAMMA = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M13 2 4 14h6l-1 8 9-12h-6z" fill="currentColor"/></svg>'

function buildSweepSenseCardHtml(c) {
    const isCall = String(c.optionType || '').toLowerCase().startsWith('c')
    const cpColor = isCall ? '#22c55e' : '#ef4444'
    const termColor = c.term === 'LONG TERM' ? '#22d3ee' : '#f59e0b'
    const expiryShort = c.expiry ? (() => { const [y, m, d] = c.expiry.split('-'); return `${m}/${d}/${y.slice(2)}` })() : 'N/A'
    // Same fill-style coloring convention as the live table (FlowTrackingPanel.tsx):
    // A/AA (bought at ask) green, B/BB (sold at bid) red, anything else purple.
    const fillColor = (c.fillStyle === 'A' || c.fillStyle === 'AA') ? '#22c55e' : (c.fillStyle === 'B' || c.fillStyle === 'BB') ? '#ef4444' : '#c084fc'
    const priceMoveColor = (c.currentStockPrice !== null && c.currentStockPrice !== undefined && c.entrySpot !== null && c.entrySpot !== undefined)
        ? (c.currentStockPrice >= c.entrySpot ? '#22c55e' : '#ef4444') : '#e5e7eb'
    // Same glossy pill badges as the live table's getTradeTypeColor() (OptionsFlowTable.tsx).
    const tradeTypeColor = c.tradeType === 'BLOCK' ? '#00e5ff' : c.tradeType === 'MULTI-LEG' ? '#d8b4fe' : '#FFD700'

    // Activity flags now carry real trade detail (call/put split, strike(s), expiry, size, premium)
    // stamped by FlowTrackingPanel.tsx's activityDetail, instead of just a plain label string.
    const fmtActivityDetail = (d) => {
        if (!d || !d.count) return ''
        const dominant = d.calls >= d.puts ? 'CALL' : 'PUT'
        const mixed = d.calls > 0 && d.puts > 0
        const typeText = mixed ? `${d.calls}x CALL / ${d.puts}x PUT` : `${d.count}x ${dominant}${d.count > 1 ? 'S' : ''}`
        const strikeText = d.strikes.length === 1 ? fmtPrice(d.strikes[0]) : `${fmtPrice(d.strikes[0])}\u2013${fmtPrice(d.strikes[d.strikes.length - 1])}`
        const expiryText = d.expiries.length === 1
            ? (() => { const [y, m, day] = d.expiries[0].split('-'); return `${m}/${day}/${y.slice(2)}` })()
            : `${d.expiries.length} expiries`
        return `${typeText}  \u00b7  ${strikeText}  \u00b7  ${expiryText}  \u00b7  ${d.totalSize.toLocaleString()} ctrs  \u00b7  ${fmtMoney(d.totalPremium)}`
    }
    const activityRows = [
        c.activityDetail?.spam ? { icon: ICON_SPAM, color: '#f59e0b', title: c.activityDetail.spam.label, detail: fmtActivityDetail(c.activityDetail.spam) } : null,
        c.activityDetail?.gamma ? { icon: ICON_GAMMA, color: '#ec4899', title: c.activityDetail.gamma.label, detail: fmtActivityDetail(c.activityDetail.gamma) } : null,
        c.activityDetail?.structural ? { icon: ICON_STRUCT, color: '#a855f7', title: c.activityDetail.structural.label, detail: fmtActivityDetail(c.activityDetail.structural) } : null,
    ].filter(Boolean)

    const row = (icon, label, labelColor, strike, opt, pct, pctColor, barColor) => `
        <div class="row" style="background:linear-gradient(to right, rgba(0,0,0,0) 0%, ${barColor}22 55%, ${barColor}4d 100%); border-right:3px solid ${barColor};">
            <div class="row-icon">${icon}</div>
            <div class="row-label" style="color:${labelColor}">${esc(label)}</div>
            <div class="row-val" style="color:${barColor}">${esc(fmtPrice(strike))}</div>
            <div class="row-sep">/</div>
            <div class="row-val" style="color:${barColor}">${esc(fmtPrice(opt))}</div>
            <div class="row-pct" style="color:${pctColor}">${esc(fmtPct(pct))}</div>
        </div>`

    const rows = []
    if (c.target1 !== null && c.target1 !== undefined) rows.push(row(ICON_TARGET, 'PROFIT TARGET #1:', '#22c55e', c.target1, c.target1Opt, c.target1Pct, '#22c55e', '#22c55e'))
    if (c.target2 !== null && c.target2 !== undefined) rows.push(row(ICON_TARGET, 'PROFIT TARGET #2:', '#22c55e', c.target2, c.target2Opt, c.target2Pct, '#22c55e', '#22c55e'))
    if (c.stop !== null && c.stop !== undefined) rows.push(row(ICON_SHIELD, 'STOP LOSS:', '#ef4444', c.stop, c.stopOpt, c.stopPct, '#ef4444', '#ef4444'))

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        @font-face { font-family: 'Sys'; src: local('Arial'); }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: transparent; font-family: Arial, Helvetica, sans-serif; }
        #card {
            position: relative; width: 980px; padding: 34px 38px; border-radius: 26px;
            background-color: #000;
            background-image: linear-gradient(180deg, #1c1c1c 0%, #000000 12%, #000000 88%, #141414 100%);
            border: 1px solid rgba(255,255,255,0.14);
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 1px rgba(255,255,255,0.03), 0 0 40px 4px rgba(34,197,94,0.18), 0 0 40px 4px rgba(239,68,68,0.14);
        }
        #card::before {
            content: ''; position: absolute; top: 0; left: 0; right: 0; height: 46%;
            border-radius: 26px 26px 0 0; pointer-events: none;
            background: linear-gradient(180deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.02) 60%, rgba(255,255,255,0) 100%);
        }
        .header { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
        .header-left { display: flex; align-items: baseline; gap: 14px; }
        .ticker { font-size: 46px; font-weight: 900; letter-spacing: 1px; color: #ff7a1a; text-shadow: 0 1px 0 #ffb066, 0 2px 0 #ff8c2e, 0 3px 0 #e56a00, 0 4px 0 #b85500, 0 5px 6px rgba(0,0,0,0.6); }
        .direction { display: flex; align-items: center; gap: 6px; font-size: 20px; font-weight: 900; letter-spacing: 1px; }
        .direction .tri { width: 0; height: 0; }
        .header-right { display: flex; align-items: center; gap: 26px; }
        .stat { display: flex; flex-direction: column; align-items: center; gap: 3px; }
        .stat-label { font-size: 13px; font-weight: 900; color: #fff; letter-spacing: 1px; }
        .stat-val { font-size: 18px; font-weight: 900; }
        .term { font-size: 30px; font-weight: 900; letter-spacing: 1px; }
        .contract { display: flex; align-items: center; gap: 14px; margin-top: 14px; flex-wrap: wrap; }
        .contract .cp { font-size: 24px; font-weight: 900; }
        .fill-group { display: flex; align-items: center; gap: 2px; }
        .fill-group .size { font-size: 24px; font-weight: 900; color: #22d3ee; }
        .fill-group .at { font-size: 22px; font-weight: 900; color: #fff; }
        .fill-group .fill-price { font-size: 24px; font-weight: 900; color: #eab308; }
        .fill-group .fill-badge { font-size: 15px; font-weight: 900; color: #fff; padding: 2px 8px; border-radius: 5px; letter-spacing: 0.5px; margin-left: 4px; }
        .contract .exp { font-size: 22px; font-weight: 700; color: #fff; }
        .contract .tt { font-size: 18px; font-weight: 900; letter-spacing: 0.05em; padding: 6px 16px; border-radius: 9999px; background-color: #000; background-image: linear-gradient(180deg, #1e1e1e 0%, #000000 50%, #111111 100%); box-shadow: inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.8); }
        .contract .pct { font-size: 24px; font-weight: 900; }
        .spot-group { display: flex; align-items: center; gap: 6px; }
        .spot-group .spot { font-size: 22px; font-weight: 700; color: #fff; }
        .spot-group .arrow { color: #fff; font-size: 20px; }
        .divider { height: 1px; background: rgba(255,255,255,0.15); margin: 22px 0; }
        .plan { display: flex; align-items: flex-start; gap: 14px; }
        .plan-icon { width: 44px; height: 44px; border-radius: 9999px; border: 2px solid #22d3ee; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .plan-label { font-size: 22px; font-weight: 900; color: #22d3ee; letter-spacing: 1px; }
        .plan-text { font-size: 22px; font-weight: 500; color: #e5e7eb; margin-top: 2px; }
        .rows { display: flex; flex-direction: column; gap: 14px; margin-top: 22px; }
        .row { display: flex; align-items: center; gap: 16px; padding: 16px 22px; border-radius: 14px; background-color: #050505; }
        .row-icon { width: 40px; height: 40px; border-radius: 9999px; background: #0a0a0a; border: 2px solid currentColor; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .row-label { font-size: 22px; font-weight: 900; letter-spacing: 0.5px; width: 280px; flex-shrink: 0; }
        .row-val { font-size: 26px; font-weight: 800; }
        .row-sep { color: #555; font-size: 22px; }
        .row-pct { font-size: 26px; font-weight: 900; margin-left: auto; }
        .activity { margin-top: 22px; display: flex; flex-direction: column; gap: 10px; }
        .activity-title { font-size: 15px; font-weight: 900; color: #9ca3af; letter-spacing: 1.5px; margin-bottom: 2px; }
        .activity-row { display: flex; align-items: center; gap: 14px; padding: 12px 18px; border-radius: 12px; background-color: #0a0a0a; border: 1px solid rgba(255,255,255,0.08); }
        .activity-icon { width: 34px; height: 34px; border-radius: 9999px; background: #000; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 2px solid currentColor; }
        .activity-text { display: flex; flex-direction: column; gap: 2px; }
        .activity-name { font-size: 18px; font-weight: 900; letter-spacing: 0.3px; }
        .activity-detail { font-size: 16px; font-weight: 700; color: #d1d5db; }
    </style></head><body>
        <div id="card">
            <div class="header">
                <div class="header-left">
                    <span class="ticker">${esc(c.ticker)}</span>
                    ${c.direction ? `<span class="direction" style="color:${c.direction === 'BULLISH' ? '#00e676' : '#ff1744'}"><span class="tri" style="border-left:9px solid transparent;border-right:9px solid transparent;${c.direction === 'BULLISH' ? 'border-bottom:15px solid currentColor;' : 'border-top:15px solid currentColor;'}"></span>${esc(c.direction)}</span>` : ''}
                </div>
                <div class="header-right">
                    ${c.takenTime ? `<div class="stat"><div class="stat-label">TAKEN</div><div class="stat-val" style="color:#22d3ee">${esc(c.takenTime)}</div></div>` : ''}
                    ${c.qualifiedTime ? `<div class="stat"><div class="stat-label">QUALIFIED</div><div class="stat-val" style="color:#22c55e">${esc(c.qualifiedTime)}</div></div>` : ''}
                    ${c.earnings ? `<div class="stat"><div class="stat-label">EARNINGS</div><div class="stat-val" style="color:#f59e0b">${esc(c.earnings)}</div></div>` : ''}
                    <span class="term" style="color:${termColor}">${esc(c.term || 'N/A')}</span>
                </div>
            </div>
            <div class="contract">
                <span class="cp" style="color:${cpColor}">${esc(fmtPrice(c.strike))} ${isCall ? 'Call' : 'Put'}</span>
                <div class="fill-group">
                    <span class="size">${esc(c.tradeSize ?? 'N/A')}</span><span class="at">@</span><span class="fill-price">$${esc(typeof c.premiumPerContract === 'number' ? c.premiumPerContract.toFixed(2) : 'N/A')}</span>
                    ${c.fillStyle ? `<span class="fill-badge" style="background:${fillColor}">${esc(c.fillStyle)}</span>` : ''}
                </div>
                <span class="exp">${esc(expiryShort)}</span>
                <div class="spot-group">
                    ${c.entrySpot !== null && c.entrySpot !== undefined ? `<span class="spot">${esc(fmtPrice(c.entrySpot))}</span>` : ''}
                    ${c.currentStockPrice !== null && c.currentStockPrice !== undefined ? `<span class="arrow">&gt;</span><span class="spot" style="color:${priceMoveColor}">${esc(fmtPrice(c.currentStockPrice))}</span>` : ''}
                </div>
                <span class="tt" style="color:${tradeTypeColor};border:1px solid ${tradeTypeColor}99">${esc(c.tradeType || '')}</span>
            </div>
            <div class="divider"></div>
            ${c.planText ? `<div class="plan">
                <div class="plan-icon">${ICON_CROSSHAIR}</div>
                <div>
                    <div class="plan-label">ENTRY PLAN:</div>
                    <div class="plan-text">${esc(c.planText)}</div>
                </div>
            </div>` : ''}
            <div class="rows">${rows.join('')}</div>
            ${activityRows.length ? `<div class="activity">
                <div class="activity-title">ACTIVITY</div>
                ${activityRows.map((r) => `
                <div class="activity-row" style="color:${r.color}">
                    <div class="activity-icon">${r.icon}</div>
                    <div class="activity-text">
                        <div class="activity-name">${esc(r.title)}</div>
                        ${r.detail ? `<div class="activity-detail">${esc(r.detail)}</div>` : ''}
                    </div>
                </div>`).join('')}
            </div>` : ''}
        </div>
    </body></html>`
}

// ── SweepSense "Ready 4 Pickup" Discord alerts (headless browser scrape) ──────────────────
// Same headless-browser trick as runSweepSenseAutoSave(): the SweepSense grading/plan/gauge
// math lives entirely client-side, so this opens the REAL page and reads the `data-flow-payload`
// JSON each card already stamps itself with (see FlowTrackingPanel.tsx) instead of reimplementing
// any of that logic here. Only trades not already alerted today (DiscordAlertedFlow table) get posted.
let discordAlertRunning = false
async function runSweepSenseDiscordAlert() {
    if (discordAlertRunning) { console.log('[Discord] Previous scan still running — skipping this tick.'); return }
    if (!APP_URL) return
    if (!DISCORD_WEBHOOK_URL) { console.warn('[Discord] DISCORD_WEBHOOK_URL not set — skipping alert scan'); return }
    discordAlertRunning = true
    const tradingDate = getTradingDate()
    let browser
    try {
        const puppeteer = (await import('puppeteer')).default
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
        const page = await browser.newPage()
        await page.setViewport({ width: 1600, height: 1200, deviceScaleFactor: 2 })
        const cookies = await loginCookies()
        if (cookies.length > 0) await page.setCookie(...cookies)
        await page.goto(`${APP_URL}/options-flow`, { waitUntil: 'networkidle0', timeout: 60_000 })
        console.log(`[Discord] Loaded page: ${page.url()}`)
        const found = await page.waitForSelector('[data-flow-payload]', { timeout: 4 * 60 * 1000 }).catch(() => null)
        if (!found) console.log('[Discord] No [data-flow-payload] elements appeared within the wait window.')

        const cards = await page.evaluate(() =>
            Array.from(document.querySelectorAll('[data-flow-payload]')).map((el) => {
                try { return JSON.parse(el.getAttribute('data-flow-payload')) } catch { return null }
            }).filter(Boolean)
        )
        console.log(`[Discord] Scraped ${cards.length} total SweepSense card(s).`)
        const ready = cards.filter((c) => c.ready)
        if (ready.length === 0) { console.log('[Discord] No Ready-4-Pickup trades this scan.'); return }


        const already = await prisma.discordAlertedFlow.findMany({
            where: { tradingDate, flowId: { in: ready.map((c) => c.flowId) } },
            select: { flowId: true },
        })
        const alreadySet = new Set(already.map((a) => a.flowId))
        const newOnes = ready.filter((c) => !alreadySet.has(c.flowId))
        if (newOnes.length === 0) { console.log('[Discord] All Ready-4-Pickup trades already alerted.'); return }

        let postedCount = 0
        // A dedicated, static page per card - never touches the live/scraped `page` above -
        // so there's no reflow race to land a bad capture in like the old live-scrape approach.
        const renderPage = await browser.newPage()
        await renderPage.setViewport({ width: 1100, height: 800, deviceScaleFactor: 2 })
        for (const c of newOnes) {
            try {
                await renderPage.setContent(buildSweepSenseCardHtml(c), { waitUntil: 'load' })
                const cardHandle = await renderPage.$('#card')
                if (!cardHandle) { console.error(`[Discord] Card render failed for ${c.ticker} — skipping.`); continue }
                const png = await cardHandle.screenshot({ type: 'png' })

                const form = new FormData()
                form.append('payload_json', JSON.stringify({
                    content: `@here **${c.ticker} - Ready for Pickup**`,
                    allowed_mentions: { parse: ['everyone'] },
                    attachments: [{ id: 0, filename: 'sweepsense-card.png' }],
                }))
                form.append('files[0]', new Blob([png], { type: 'image/png' }), 'sweepsense-card.png')
                const res = await fetch(DISCORD_WEBHOOK_URL, { method: 'POST', body: form })
                if (!res.ok) { console.error(`[Discord] Post failed for ${c.ticker}: ${res.status}`); continue }
            } catch (err) {
                console.error(`[Discord] Post failed for ${c.ticker} (${c.flowId}):`, err.message)
                continue
            }
            postedCount++
            await prisma.discordAlertedFlow.upsert({
                where: { flowId_tradingDate: { flowId: c.flowId, tradingDate } },
                update: {},
                create: { flowId: c.flowId, tradingDate },
            }).catch(() => { })
        }
        console.log(`[Discord] Posted ${postedCount}/${newOnes.length} Ready-4-Pickup alert(s).`)
    } catch (err) {
        console.error('[Discord] Alert scan failed:', err.message)
    } finally {
        if (browser) await browser.close().catch(() => { })
        discordAlertRunning = false
    }
}

function startCollecting() {
    if (collecting) return
    collecting = true
    pendingTrades = []
    rawBuffer = []
    liveOIMap.clear()

    // Only delete today's records if they are stale (last save >10 min ago).
    // A mid-day restart (crash/redeploy) must NOT wipe live data — resume instead.
    const tradingDate = getTradingDate()
    prisma.flowBatch.findFirst({ where: { tradingDate }, orderBy: { batchTime: 'desc' }, select: { batchTime: true, id: true } })
        .then(last => {
            if (!last) {
                console.log(`[INIT] No existing records for ${tradingDate} — fresh start`)
                return
            }
            const ageMs = Date.now() - new Date(last.batchTime).getTime()
            if (ageMs > 10 * 60 * 1000) {
                // Last save was >10 minutes ago — collector was dead, safe to clear stale data
                return prisma.flowBatch.deleteMany({ where: { tradingDate } })
                    .then(r => console.log(`[INIT] Cleared ${r.count} stale records (last save ${Math.round(ageMs / 60000)}min ago)`))
            } else {
                // Recent data exists — mid-day restart, resume without wiping
                console.log(`[INIT] Resuming mid-day — last save ${Math.round(ageMs / 1000)}s ago, keeping existing records`)
            }
        })
        .catch(err => console.warn('[INIT] Stale check failed:', err.message))

    startStream()

    // 1-second flush: group-classify + enrich + apply live OI + push to pendingTrades
    flushTimer = setInterval(async () => {
        if (rawBuffer.length === 0) return
        const batch = rawBuffer.splice(0)
        try {
            const classified = classifyBatch(batch)  // group-based, same logic as browser
            const enriched = await enrichBatch(classified)
            const withOI = applyLiveOI(enriched)
            const filtered = withOI.filter(t => t.trade_type !== 'MINI' && t.total_premium >= 10000)
            pendingTrades.push(...filtered)
            console.log(`[FLUSH] +${withOI.length} enriched | ${withOI.length - filtered.length} dropped (MINI/<$10k) | pending: ${pendingTrades.length}`)
        } catch (err) {
            console.error('[FLUSH] Enrich error:', err.message)
            pendingTrades.push(...batch)
        }
    }, 1000)

    // Save every 5 seconds — smaller chunks (~665 trades, ~44KB) stay under Prisma Accelerate 5MB limit
    saveTimer = setInterval(() => {
        saveToDB(getTradingDate())
    }, 5 * 1000)

    // Auto-stop at market close
    const msToClose = msUntilMarketClose()
    console.log(`[STREAM] Market closes in ${(msToClose / 1000 / 60).toFixed(1)} minutes`)
    setTimeout(stopStream, msToClose)

    // "Ready 4 Pickup" Discord alerts — every 5 minutes while the market's open
    discordAlertTimer = setInterval(runSweepSenseDiscordAlert, 5 * 60 * 1000)
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
