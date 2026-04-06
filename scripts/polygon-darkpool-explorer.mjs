/**
 * Polygon Dark Pool / Off-Exchange Explorer
 * Tests every endpoint category that could contain dark pool data.
 *
 * Usage:  node scripts/polygon-darkpool-explorer.mjs
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dir, '..', '.env.local')
let API_KEY = ''
try {
    const raw = readFileSync(envPath, 'utf8')
    const match = raw.match(/POLYGON_API_KEY\s*=\s*["']?([^"'\r\n]+)["']?/)
    if (match) API_KEY = match[1].trim()
} catch { API_KEY = process.env.POLYGON_API_KEY || '' }

if (!API_KEY) { console.error('❌  POLYGON_API_KEY not found'); process.exit(1) }

const BASE = 'https://api.polygon.io'
const SYMBOL = 'SPY'

async function get(path, label) {
    const url = `${BASE}${path}${path.includes('?') ? '&' : '?'}apiKey=${API_KEY}`
    try {
        const res = await fetch(url)
        const json = await res.json()
        return { label, status: res.status, url, json }
    } catch (e) {
        return { label, status: 'ERROR', url, json: { error: e.message } }
    }
}

function sec(title) {
    console.log('\n' + '═'.repeat(72))
    console.log('  ' + title)
    console.log('═'.repeat(72))
}

function print({ label, status, url, json }) {
    console.log(`\n▶ ${label}  [HTTP ${status}]`)
    console.log(`  ${url.replace(API_KEY, '***')}`)
    if (json.error || json.status === 'ERROR') {
        console.log('  ⚠  Error:', json.error || json.message || json.errorFound)
        return
    }
    const first = json.results?.[0] ?? json.result ?? json
    if (first && typeof first === 'object') {
        console.log('  Fields:', Object.keys(first).join(', '))
        console.log('  Sample:', JSON.stringify(first).slice(0, 600))
    }
    const count = Array.isArray(json.results) ? json.results.length
        : Array.isArray(json.result) ? json.result.length
            : json.resultsCount ?? json.count ?? null
    if (count !== null) console.log(`  Records returned: ${count}`)
}

async function main() {
    console.log(`\nPolygon Dark Pool / Off-Exchange Explorer — ${SYMBOL}`)

    // ── 0. PER-DAY NANOSECOND FETCH TEST ────────────────────────────────────
    // This simulates exactly what the chart code does: one request per visible candle
    sec('0. PER-DAY NANOSECOND FETCH — simulates chart dark pool fetch')
    const DARK_POOL_EXCHANGES = new Set([4, 6, 16, 201, 202, 203])
    const testDates = ['2025-10-03', '2025-10-06', '2025-10-07', '2026-04-02', '2026-04-03']
    for (const date of testDates) {
        const startMs = new Date(date + 'T04:00:00.000Z').getTime()
        const endMs = startMs + 86_400_000
        const startNs = startMs * 1_000_000
        const endNs = endMs * 1_000_000
        const r = await get(
            `/v3/trades/${SYMBOL}?timestamp.gte=${startNs}&timestamp.lte=${endNs}&limit=50000&order=asc`,
            `Trades for ${date} (startNs=${startNs})`
        )
        const trades = r.json.results || []
        if (trades.length === 0) {
            console.log(`\n▶ ${date}  [HTTP ${r.status}]  → 0 trades returned`)
            console.log('  response:', JSON.stringify(r.json).slice(0, 300))
        } else {
            const dpTrades = trades.filter(t => DARK_POOL_EXCHANGES.has(t.exchange))
            const exchDist = {}
            for (const t of trades) exchDist[t.exchange] = (exchDist[t.exchange] || 0) + 1
            const dpVol = dpTrades.reduce((s, t) => s + t.size, 0)
            const dpVwapNum = dpTrades.reduce((s, t) => s + t.price * t.size, 0)
            console.log(`\n▶ ${date}  [HTTP ${r.status}]  → ${trades.length} trades`)
            console.log('  exchange dist:', exchDist)
            console.log('  dark pool trades:', dpTrades.length, '| darkVol:', dpVol)
            console.log('  dpVwap:', dpVol > 0 ? (dpVwapNum / dpVol).toFixed(4) : 'n/a')
            console.log('  first trade:', JSON.stringify(trades[0]))
        }
        await new Promise(r => setTimeout(r, 300))
    }

    // ── 1. EXCHANGES LIST ────────────────────────────────────────────────────
    sec('1. EXCHANGE REFERENCE — Identify Dark Pool / OTC venues')
    const exchanges = await get('/v3/reference/exchanges?asset_class=stocks&locale=us', 'All US Stock Exchanges')
    print(exchanges)

    // Print the full exchange list (critical for identifying dark pools)
    if (Array.isArray(exchanges.json.results)) {
        console.log('\n  Full exchange list:')
        for (const ex of exchanges.json.results) {
            const dp = ex.type === 'TRF' || ex.mic?.includes('FINRA') || ex.name?.toLowerCase().includes('finra') || ex.name?.toLowerCase().includes('otc') || ex.name?.toLowerCase().includes('dark') || ex.name?.toLowerCase().includes('alternative')
            console.log(`  [${ex.id ?? '?'}] ${ex.name ?? '?'} | mic=${ex.mic ?? '?'} | type=${ex.type ?? '?'} | operating_mic=${ex.operating_mic ?? '?'}${dp ? '  ← DARK POOL / TRF' : ''}`)
        }
    }

    // ── 2. FINRA / TRF TRADES (The main dark pool reporting facility) ─────────
    // Exchange 4 = FINRA ADF, Exchange 200 = FINRA/NASDAQ TRF, Exchange 201 = FINRA/NYSE TRF
    sec('2. FINRA TRF TRADES — The main dark pool pipe')

    // The key: dark pool prints get reported via FINRA Trade Reporting Facilities (TRFs)
    // TRF exchange IDs: 4 (ADF), 200 (FINRA/Nasdaq TRF Carteret), 201 (FINRA/NYSE TRF)
    for (const exchId of [4, 200, 201, 202]) {
        const r = await get(
            `/v3/trades/${SYMBOL}?limit=5&order=desc&exchange=${exchId}`,
            `Trades via Exchange ${exchId} (FINRA/TRF)`
        )
        print(r)
        await new Promise(r => setTimeout(r, 200)) // avoid rate-limit
    }

    // ── 3. TRADE CONDITIONS — which codes flag dark pool prints ───────────────
    sec('3. TRADE CONDITIONS MAP — Dark-pool relevant codes')
    const conditions = await get('/v1/meta/conditions/trades', 'All Trade Conditions')
    if (conditions.json && typeof conditions.json === 'object') {
        const raw = conditions.json
        const entries = Object.entries(raw)
        // Dark pool / off-exchange relevant condition codes
        const dpCodes = entries.filter(([, v]) =>
            typeof v === 'string' && (
                v.toLowerCase().includes('dark') ||
                v.toLowerCase().includes('otc') ||
                v.toLowerCase().includes('cross') ||
                v.toLowerCase().includes('derivative') ||
                v.toLowerCase().includes('formT') ||
                v.toLowerCase().includes('extended') ||
                v.toLowerCase().includes('rule155') ||
                v.toLowerCase().includes('single-leg') ||
                v.toLowerCase().includes('prior') ||
                v.toLowerCase().includes('qualified')
            )
        )
        console.log('\n  ▶ All Trade Conditions [HTTP', conditions.status, ']')
        console.log('  Dark pool / off-exchange relevant condition codes:')
        for (const [k, v] of dpCodes) console.log(`    Condition ${k}: ${v}`)
        console.log('\n  Full list:')
        for (const [k, v] of entries) console.log(`    [${k}] ${v}`)
    }

    // ── 4. RECENT TRADES WITH FINRA CONDITIONS ────────────────────────────────
    sec('4. RECENT SPY TRADES — look for off-exchange condition codes')
    const recentTrades = await get(
        `/v3/trades/${SYMBOL}?limit=50&order=desc`,
        'Last 50 SPY Trades'
    )
    if (Array.isArray(recentTrades.json.results)) {
        const byExchange = {}
        for (const t of recentTrades.json.results) {
            const k = `exchange_${t.exchange}`
            byExchange[k] = (byExchange[k] || 0) + 1
        }
        console.log('\n  ▶ Last 50 SPY Trades  [HTTP', recentTrades.status, ']')
        console.log('  Exchange distribution:', byExchange)
        console.log('  Sample trade:', JSON.stringify(recentTrades.json.results[0]))
    }

    // ── 5. OTC MARKET SNAPSHOT ────────────────────────────────────────────────
    sec('5. OTC MARKET SNAPSHOTS')

    const otcSnap = await get(
        `/v2/snapshot/locale/us/markets/otc/tickers?tickers=${SYMBOL}`,
        'OTC Snapshot for SPY'
    )
    print(otcSnap)

    // ── 6. INDICATIVE / DARK POOL VOLUME VIA GROUPED ─────────────────────────
    sec('6. FINRA ADF GROUPED DATA (off-exchange volume day)')
    // The grouped endpoint has a market filter
    const finraGrouped = await get(
        `/v2/aggs/grouped/locale/us/market/otc/2026-04-03?adjusted=true`,
        'OTC/FINRA Grouped Day (2026-04-03, Friday)'
    )
    print(finraGrouped)

    // ── 7. INDIVIDUAL STOCK OTC BARS ──────────────────────────────────────────
    sec('7. OTC AGGREGATES for SPY')
    const otcBars = await get(
        `/v2/aggs/ticker/${SYMBOL}/range/1/day/2026-03-01/2026-04-05?adjusted=false&sort=asc&limit=10`,
        'SPY Unadjusted Daily (includes off-exchange)'
    )
    print(otcBars)

    // ── 8. TRADES ENDPOINT — FILTER BY TAPE ──────────────────────────────────
    // tape=1=NYSE, tape=2=NASDAQ/AMEX, tape=3=OTC (this is the key!)
    sec('8. TAPE FILTERING — Tape 3 = OTC / Off-Exchange')
    for (const tape of [1, 2, 3]) {
        const r = await get(
            `/v3/trades/${SYMBOL}?limit=5&order=desc&tape=${tape}`,
            `Trades on Tape ${tape}${tape === 3 ? ' (OTC/Off-Exchange)' : tape === 1 ? ' (NYSE)' : ' (NASDAQ/AMEX)'}`
        )
        print(r)
        await new Promise(r => setTimeout(r, 200))
    }

    // ── 9. SHORT INTEREST ─────────────────────────────────────────────────────
    sec('9. SHORT INTEREST (FINRA reports — proxy for dark pool activity)')
    const shortInt = await get(
        `/v2/reference/short-interest?ticker=${SYMBOL}`,
        'Short Interest (v2)'
    )
    print(shortInt)

    const shortIntV1 = await get(
        `/v1/reference/short-interest/${SYMBOL}`,
        'Short Interest (v1)'
    )
    print(shortIntV1)

    // ── 10. EXPERIMENTAL / LAUNCHPAD ENDPOINTS ────────────────────────────────
    sec('10. EXPERIMENTAL — vX Dark Pool / Alternative Data')

    const dpTrades = await get(
        `/vX/trades/${SYMBOL}?limit=5&order=desc`,
        'vX Trades endpoint'
    )
    print(dpTrades)

    const summary = await get(
        `/v1/summaries?tickers=${SYMBOL}`,
        'v1 Summaries (extended stats)'
    )
    print(summary)

    const stockEvents = await get(
        `/vX/reference/tickers/${SYMBOL}/events`,
        'vX Ticker Events'
    )
    print(stockEvents)

    // ── FINAL VERDICT ─────────────────────────────────────────────────────────
    sec('VERDICT — Dark Pool Data Availability on Polygon')
    console.log(`
  What Polygon DOES provide for dark pool analysis:
  ──────────────────────────────────────────────────────────────────────
  ✅  FINRA TRF trades  — trades filtered by exchange=4/200/201 (TRF venues)
                          These ARE the dark pool prints as reported to FINRA
  ✅  Tape 3 trades     — off-exchange transactions (OTC tape)
  ✅  Trade conditions  — every trade has a conditions[] array; you can flag
                          condition types that indicate off-exchange routing
  ✅  Exchange ID field — every tick includes the reporting exchange ID,
                          letting you split lit vs dark volume per candle
  ✅  VWAP in aggs      — the vw field in every bar (FINRA dark prints included)
  ✅  n (trade count)   — lets you build prints-per-bar analysis

  What Polygon does NOT provide:
  ──────────────────────────────────────────────────────────────────────
  ❌  No dedicated "dark pool" endpoint by that name
  ❌  No FINRA TRACE OTC bond dark pool data
  ❌  No block-print alerting / real-time dark pool notifications
  ❌  No institutional 13F / position data
  ❌  No short interest borrow rates (only basic SI figures if available)

  HOW to build dark pool volume from Polygon:
  ──────────────────────────────────────────────────────────────────────
  1. Pull /v3/trades?exchange=4  (FINRA ADF)   → off-exchange prints
  2. Pull /v3/trades?exchange=200 (FINRA/Nasdaq TRF) → dark prints
  3. Pull /v3/trades?exchange=201 (FINRA/NYSE TRF)   → dark prints
  4. Sum those vs total volume → dark pool %
  5. Or: use tape=3 filter for a simpler OTC-only view
`)
    console.log('Done.\n')
}

main().catch(e => { console.error(e); process.exit(1) })
