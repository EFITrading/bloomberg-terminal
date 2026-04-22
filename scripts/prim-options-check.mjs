// Fetch PRIM options: available expiries + ATM pricing
// Run: node scripts/prim-options-check.mjs

const API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf'
const SYMBOL = 'PRIM'

async function get(url) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`)
    return res.json()
}

// 1. Get current price
async function getCurrentPrice() {
    const url = `https://api.polygon.io/v2/last/trade/${SYMBOL}?apiKey=${API_KEY}`
    const data = await get(url)
    return data?.results?.p ?? null
}

// 2. Get all available expiry dates (next 8 weeks)
async function getExpiries(spotPrice) {
    const url = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${SYMBOL}&contract_type=call&strike_price_gte=${(spotPrice * 0.9).toFixed(2)}&strike_price_lte=${(spotPrice * 1.1).toFixed(2)}&limit=250&apiKey=${API_KEY}`
    const data = await get(url)
    const contracts = data?.results ?? []
    const expiries = [...new Set(contracts.map(c => c.expiration_date))].sort()
    return { expiries, contracts }
}

// 3. Get ATM quote for a specific expiry
async function getATMQuote(spotPrice, expiry) {
    // Find closest strike to spot for call and put
    const callUrl = `https://api.polygon.io/v3/snapshot/options/${SYMBOL}?expiration_date=${expiry}&contract_type=call&strike_price_gte=${(spotPrice * 0.97).toFixed(2)}&strike_price_lte=${(spotPrice * 1.03).toFixed(2)}&limit=10&apiKey=${API_KEY}`
    const putUrl = `https://api.polygon.io/v3/snapshot/options/${SYMBOL}?expiration_date=${expiry}&contract_type=put&strike_price_gte=${(spotPrice * 0.97).toFixed(2)}&strike_price_lte=${(spotPrice * 1.03).toFixed(2)}&limit=10&apiKey=${API_KEY}`

    const [callData, putData] = await Promise.all([get(callUrl), get(putUrl)])

    const calls = (callData?.results ?? []).filter(c => c.day?.last_updated || c.last_quote?.last_updated)
    const puts = (putData?.results ?? []).filter(c => c.day?.last_updated || c.last_quote?.last_updated)

    // Pick strike closest to spot
    const closest = (arr) => arr.sort((a, b) =>
        Math.abs(a.details.strike_price - spotPrice) - Math.abs(b.details.strike_price - spotPrice)
    )[0]

    const bestCall = closest(callData?.results ?? [])
    const bestPut = closest(putData?.results ?? [])

    return { bestCall, bestPut }
}

async function main() {
    console.log(`\n=== PRIM Options Check — ${new Date().toLocaleDateString()} ===\n`)

    // Step 1: spot price
    let spot
    try {
        spot = await getCurrentPrice()
        if (!spot) {
            // fallback to previous close
            const d = new Date(); d.setDate(d.getDate() - 1)
            const ds = d.toISOString().split('T')[0]
            const agg = await get(`https://api.polygon.io/v2/aggs/ticker/${SYMBOL}/range/1/day/${ds}/${ds}?adjusted=true&sort=asc&limit=1&apiKey=${API_KEY}`)
            spot = agg?.results?.[0]?.c ?? null
        }
    } catch (e) {
        console.error('Error fetching price:', e.message)
        return
    }
    if (!spot) { console.log('Could not determine spot price'); return }
    console.log(`Spot price: $${spot.toFixed(2)}\n`)

    // Step 2: expiries
    let expiries, contracts
    try {
        ; ({ expiries, contracts } = await getExpiries(spot))
    } catch (e) {
        console.error('Error fetching contracts:', e.message)
        return
    }

    if (!expiries.length) {
        console.log('No options contracts found for PRIM. It may not have listed options.')
        console.log('(Polygon Max plan is required for options data)')
        return
    }

    console.log(`Available expiries (${expiries.length} total):`)
    expiries.forEach(e => console.log(`  ${e}`))

    // Step 3: ATM quotes for the first 4 expiries
    const toCheck = expiries.slice(0, 4)
    console.log(`\nATM Pricing (nearest strike to $${spot.toFixed(2)}):`)
    console.log('─'.repeat(70))

    for (const expiry of toCheck) {
        try {
            const { bestCall, bestPut } = await getATMQuote(spot, expiry)

            const fmt = (leg, type) => {
                if (!leg) return `  ${type}: no data`
                const k = leg.details?.strike_price
                const iv = leg.implied_volatility != null ? `IV=${(leg.implied_volatility * 100).toFixed(1)}%` : ''
                const bid = leg.last_quote?.bid ?? leg.day?.open ?? '?'
                const ask = leg.last_quote?.ask ?? leg.day?.close ?? '?'
                const last = leg.day?.close ?? leg.last_trade?.price ?? '?'
                const dte = leg.details?.expiration_date
                    ? Math.ceil((new Date(leg.details.expiration_date) - new Date()) / 86400000)
                    : '?'
                return `  ${type} K=$${k} | bid=${bid} ask=${ask} last=${last} ${iv} DTE=${dte}`
            }

            const today = new Date()
            const expD = new Date(expiry)
            const dte = Math.ceil((expD - today) / 86400000)
            const callK = bestCall?.details?.strike_price ?? '?'
            const putK = bestPut?.details?.strike_price ?? '?'

            console.log(`\nExpiry: ${expiry} (DTE ~${dte})`)
            console.log(fmt(bestCall, 'CALL'))
            console.log(fmt(bestPut, 'PUT'))

            // Straddle cost
            const callAsk = bestCall?.last_quote?.ask ?? bestCall?.day?.close
            const putAsk = bestPut?.last_quote?.ask ?? bestPut?.day?.close
            if (callAsk && putAsk && callK === putK) {
                const straddleCost = (callAsk + putAsk) * 100
                const bePct = ((callAsk + putAsk) / spot * 100).toFixed(2)
                console.log(`  → ATM Straddle: $${straddleCost.toFixed(0)} total | BE ±${bePct}%`)
            }
        } catch (e) {
            console.log(`  Error for ${expiry}: ${e.message}`)
        }
    }
    console.log('\n' + '─'.repeat(70))
}

main().catch(console.error)
