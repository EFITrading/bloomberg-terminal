// Quick test: SPY $750 Call, 7/24 expiry - using the same per-underlying options snapshot
// endpoint fetchCurrentOptionPrices now uses (matches ChainPanel's working logic).
import 'dotenv/config'

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || process.env.NEXT_PUBLIC_POLYGON_API_KEY
const underlying = 'SPY'
const expiration_date = '2026-07-24'
const optionTicker = 'O:SPY260724C00750000'

const url = `https://api.polygon.io/v3/snapshot/options/${underlying}?expiration_date=${expiration_date}&limit=250&apikey=${POLYGON_API_KEY}`

const res = await fetch(url)
const data = await res.json()

console.log('status:', res.status)
console.log('results count:', data.results?.length ?? 0)

const match = (data.results ?? []).find((r) => r.details?.ticker === optionTicker)
if (!match) {
    console.log(`No contract found for ${optionTicker}`)
    console.log('sample tickers:', (data.results ?? []).slice(0, 5).map((r) => r.details?.ticker))
} else {
    const bid = match.last_quote?.bid ?? 0
    const ask = match.last_quote?.ask ?? 0
    const mid = (bid + ask) / 2
    console.log('MATCH:', optionTicker)
    console.log('last_quote:', match.last_quote)
    console.log('last_trade:', match.last_trade)
    console.log('day:', match.day)
    console.log('open_interest:', match.open_interest)
    console.log('---')
    console.log('mid:', mid)
    console.log('resolved price:', mid > 0 ? mid : (match.last_trade?.price ?? 0) > 0 ? match.last_trade.price : (match.day?.close ?? 0))
}
