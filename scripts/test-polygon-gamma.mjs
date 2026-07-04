/**
 * TEST: Polygon /v3/snapshot/options returns real greeks including gamma
 * Fetches a near-ATM SPY contract and prints gamma + all greeks
 * Usage: node scripts/test-polygon-gamma.mjs
 */

const API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf'
const UNDERLYING = 'SPY'

async function run() {
    console.log(`\n=== POLYGON GAMMA TEST — ${UNDERLYING} ===\n`)

    // Step 1: Get current SPY price
    const priceUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${UNDERLYING}?apikey=${API_KEY}`
    const priceRes = await fetch(priceUrl)
    const priceData = await priceRes.json()
    const spot = priceData.ticker?.lastTrade?.p ?? priceData.ticker?.prevDay?.c ?? 0
    console.log(`Spot price: $${spot}`)

    // Step 2: Get nearest expiry options (limit=10 to test quickly)
    const today = new Date()
    // Find next Friday (weekly expiry)
    const daysToFriday = (5 - today.getDay() + 7) % 7 || 7
    const nextFriday = new Date(today)
    nextFriday.setDate(today.getDate() + daysToFriday)
    const expiry = nextFriday.toISOString().split('T')[0]

    console.log(`Testing expiry: ${expiry}`)

    // Try without expiry filter first — fetch near-ATM strikes around SPY $744
    const snapUrl = `https://api.polygon.io/v3/snapshot/options/${UNDERLYING}?strike_price.gte=720&strike_price.lte=770&limit=20&apikey=${API_KEY}`
    console.log(`URL: ${snapUrl}\n`)

    const snapRes = await fetch(snapUrl)
    const snapData = await snapRes.json()

    if (!snapData.results || snapData.results.length === 0) {
        console.error('❌ No results — try a different expiry date or check API key')
        console.log(JSON.stringify(snapData, null, 2))
        return
    }

    console.log(`✅ Got ${snapData.results.length} contracts\n`)

    // Find near-ATM contract
    const atm = snapData.results.find(c =>
        c.details?.contract_type === 'call' &&
        Math.abs((c.details?.strike_price ?? 0) - spot) < 10
    ) ?? snapData.results[0]

    console.log('RAW first contract:', JSON.stringify(atm, null, 2))
    console.log(`\nSample contract: ${atm.details?.ticker}`)
    console.log(`  Strike: $${atm.details?.strike_price}`)
    console.log(`  Type: ${atm.details?.contract_type}`)
    console.log(`  Expiry: ${atm.details?.expiration_date}`)
    console.log(`  IV: ${((atm.implied_volatility ?? 0) * 100).toFixed(2)}%`)
    console.log('')
    console.log('  GREEKS:')

    const g = atm.greeks
    if (!g) {
        console.error('❌ No greeks field on this contract!')
        console.log('  Raw contract greeks field:', atm.greeks)
        console.log('  Available keys:', Object.keys(atm))
    } else {
        console.log(`  ✅ delta:  ${g.delta}`)
        console.log(`  ✅ gamma:  ${g.gamma}`)
        console.log(`  ✅ theta:  ${g.theta}`)
        console.log(`  ✅ vega:   ${g.vega}`)
        console.log('')
        console.log('PROOF: Polygon returns real gamma per contract ✓')
        console.log(`\nFor a $${spot} SPY call at strike $${atm.details?.strike_price}, gamma = ${g.gamma}`)
        console.log(`This means for every $1 move in SPY, delta changes by ${g.gamma}`)
    }

    // Step 3: Show all 10 contracts' gamma to prove we can map trades to their gamma
    console.log('\n--- ALL SAMPLE CONTRACTS ---')
    console.log('Ticker'.padEnd(30), 'Type'.padEnd(6), 'Strike'.padEnd(10), 'Gamma'.padEnd(12), 'Delta')
    for (const c of snapData.results) {
        const ticker = c.details?.ticker ?? 'N/A'
        const type = c.details?.contract_type ?? '?'
        const strike = c.details?.strike_price ?? 0
        const gamma = c.greeks?.gamma ?? 'N/A'
        const delta = c.greeks?.delta ?? 'N/A'
        console.log(
            ticker.padEnd(30),
            type.padEnd(6),
            `$${strike}`.padEnd(10),
            String(gamma).padEnd(12),
            String(delta)
        )
    }
}

run().catch(e => { console.error(e); process.exit(1) })
