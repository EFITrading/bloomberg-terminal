// LEAP Grade Test Script — SBUX
// Tests the exact same logic as calculateLeapGrade in OptionsFlowTable.tsx
// Run: node scripts/test-leap-sbux.mjs

import * as dotenv from 'dotenv'
import { readFileSync } from 'fs'

// Load env
try { dotenv.config({ path: '.env.local' }) } catch { }
const API_KEY = process.env.NEXT_PUBLIC_POLYGON_API_KEY
if (!API_KEY) { console.error('Missing NEXT_PUBLIC_POLYGON_API_KEY in .env.local'); process.exit(1) }

const TICKER = 'SBUX'

// ─── helpers ────────────────────────────────────────────────────────────────
const pctChange = (arr, n) => {
    if (arr.length < n + 1) return null
    return ((arr.at(-1).c - arr[arr.length - 1 - n].c) / arr[arr.length - 1 - n].c) * 100
}

const fetchAggs = async (ticker, from, to) => {
    const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc&apiKey=${API_KEY}`
    const r = await fetch(url)
    const d = await r.json()
    return d.results || []
}

// ─── 1. fetch recent flow data for SBUX from Polygon options ───────────────
console.log(`\n📡 Fetching recent SBUX options flow from Polygon...\n`)

const today = new Date()
const todayStr = today.toISOString().split('T')[0]
const from30 = new Date(today); from30.setDate(from30.getDate() - 3)
const fromStr = from30.toISOString().split('T')[0]

// Fetch recent SBUX option trades via snapshot
const snapshotUrl = `https://api.polygon.io/v3/snapshot/options/${TICKER}?limit=10&apiKey=${API_KEY}`
const snapRes = await fetch(snapshotUrl)
const snapData = await snapRes.json()
const options = snapData.results || []

if (options.length === 0) {
    console.error('No snapshot results for SBUX options')
    process.exit(1)
}

// ─── 2. Relative Strength (5D/13D/21D vs SPY) ────────────────────────────
const startDate = new Date(today); startDate.setDate(startDate.getDate() - 38)
const startStr = startDate.toISOString().split('T')[0]

console.log(`📊 Fetching price history (${startStr} → ${todayStr})...`)
const [spyBars, sbuxBars] = await Promise.all([
    fetchAggs('SPY', startStr, todayStr),
    fetchAggs(TICKER, startStr, todayStr),
])

const spy5d = pctChange(spyBars, Math.min(5, spyBars.length - 1))
const spy13d = pctChange(spyBars, Math.min(13, spyBars.length - 1))
const spy21d = pctChange(spyBars, Math.min(21, spyBars.length - 1))
const stk5d = pctChange(sbuxBars, Math.min(5, sbuxBars.length - 1))
const stk13d = pctChange(sbuxBars, Math.min(13, sbuxBars.length - 1))
const stk21d = pctChange(sbuxBars, Math.min(21, sbuxBars.length - 1))

const rs5d = stk5d - spy5d
const rs13d = stk13d - spy13d
const rs21d = stk21d - spy21d
const weightedRS = rs5d * 0.3 + rs13d * 0.4 + rs21d * 0.3

console.log(`\n  SPY:  5D=${spy5d?.toFixed(2)}%  13D=${spy13d?.toFixed(2)}%  21D=${spy21d?.toFixed(2)}%`)
console.log(`  SBUX: 5D=${stk5d?.toFixed(2)}%  13D=${stk13d?.toFixed(2)}%  21D=${stk21d?.toFixed(2)}%`)
console.log(`  RS:   5D=${rs5d.toFixed(2)}  13D=${rs13d.toFixed(2)}  21D=${rs21d.toFixed(2)}  Weighted=${weightedRS.toFixed(2)}`)

// ─── 3. Score a sample trade for each option in snapshot ──────────────────
console.log(`\n${'─'.repeat(80)}`)
console.log(`LEAP GRADE TEST — ${TICKER} options`)
console.log(`${'─'.repeat(80)}\n`)

const currentStockPrice = sbuxBars.at(-1)?.c
console.log(`Current SBUX stock price: $${currentStockPrice?.toFixed(2)}\n`)

for (const opt of options.slice(0, 5)) {
    const d = opt.details || {}
    const strike = d.strike_price
    const expiry = d.expiration_date          // "YYYY-MM-DD"
    const type = d.contract_type            // "call" or "put"
    const daysToExpiry = Math.round((new Date(expiry) - today) / 86400000)

    // Get current option price from snapshot bid/ask
    const bid = opt.last_quote?.bid ?? 0
    const ask = opt.last_quote?.ask ?? 0
    const currentPrice = (bid + ask) / 2

    // Simulate entry price = current price (no historical entry, just to show score)
    const entryPrice = currentPrice

    // Fill style — assume ask-side (bullish) for test
    const fill = 'A'
    const isCall = type === 'call'
    const isBullish = (isCall && (fill === 'A' || fill === 'AA')) || (!isCall && fill === 'B')
    const isBearish = (!isCall && (fill === 'A' || fill === 'AA')) || (isCall && fill === 'BB')

    const scores = { contractPrice: 0, relativeStrength: 0, volumeOI: 0, stockReaction: 0 }

    // 1. Contract P&L — entry = current so pct = 0 → 0 pts (flat)
    const pct = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0
    if (pct <= -40) scores.contractPrice = -7.5
    else if (pct <= -20) scores.contractPrice = 7.5
    else if (pct <= -15) scores.contractPrice = 15
    else if (pct <= -10) scores.contractPrice = 8
    else if (pct <= 10) scores.contractPrice = 0
    else if (pct <= 20) scores.contractPrice = 3
    else scores.contractPrice = 5

    // 2. Relative Strength (30 pts max)
    const aligned = (isBullish && weightedRS > 0) || (isBearish && weightedRS < 0)
    const magnitude = Math.abs(weightedRS)
    if (aligned) {
        if (magnitude >= 3) scores.relativeStrength = 30
        else if (magnitude >= 1.5) scores.relativeStrength = 20
        else scores.relativeStrength = 10
    }

    // 3. Vol / OI (15 pts max)
    const vol = opt.day?.volume ?? 0
    const oi = opt.open_interest ?? 0
    if (oi > 0) {
        const ratio = vol / oi
        if (ratio >= 1.5) scores.volumeOI = 15
        else if (ratio >= 1.0) scores.volumeOI = 7.5
        else if (ratio >= 0.5) scores.volumeOI = 5
    }

    // 4. Stock Reaction (15 pts max) — no historical entry, skip
    scores.stockReaction = 0  // would need historical spot at trade time

    const total = scores.contractPrice + scores.relativeStrength + scores.volumeOI + scores.stockReaction

    let grade = 'F'
    if (total >= 64) grade = 'A+'
    else if (total >= 60) grade = 'A'
    else if (total >= 56) grade = 'A-'
    else if (total >= 53) grade = 'B+'
    else if (total >= 49) grade = 'B'
    else if (total >= 45) grade = 'B-'
    else if (total >= 41) grade = 'C+'
    else if (total >= 38) grade = 'C'
    else if (total >= 34) grade = 'C-'
    else if (total >= 30) grade = 'D+'
    else if (total >= 26) grade = 'D'
    else if (total >= 22) grade = 'D-'

    const moneyness = currentStockPrice
        ? strike > currentStockPrice * 1.02 && isCall ? 'OTM'
            : strike < currentStockPrice * 0.98 && !isCall ? 'OTM'
                : 'ATM/ITM'
        : '?'

    console.log(`${type.toUpperCase().padEnd(4)} $${strike} exp ${expiry} (${daysToExpiry}d) [${moneyness}]`)
    console.log(`  Bid/Ask: $${bid}/$${ask}  Mid: $${currentPrice.toFixed(2)}`)
    console.log(`  Vol: ${vol}  OI: ${oi}  Vol/OI: ${oi > 0 ? (vol / oi).toFixed(2) : 'N/A'}`)
    console.log(`  Scores → Contract P&L: ${scores.contractPrice}/15  RS: ${scores.relativeStrength}/30  Vol/OI: ${scores.volumeOI}/15  Stock Rxn: ${scores.stockReaction}/15`)
    console.log(`  ⭐ TOTAL: ${total}/75  →  Grade: ${grade}\n`)
}
