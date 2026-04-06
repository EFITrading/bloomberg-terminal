/**
 * Polygon API Explorer — SPY
 * Runs through every major endpoint category and prints sample data + available fields.
 *
 * Usage:  node scripts/polygon-spy-explorer.mjs
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// ---------------------------------------------------------------------------
// Load API key from .env.local
// ---------------------------------------------------------------------------
const __dir = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dir, '..', '.env.local')
let API_KEY = ''
try {
    const raw = readFileSync(envPath, 'utf8')
    const match = raw.match(/POLYGON_API_KEY\s*=\s*["']?([^"'\r\n]+)["']?/)
    if (match) API_KEY = match[1].trim()
} catch {
    // fallback: try process env
    API_KEY = process.env.POLYGON_API_KEY || ''
}

if (!API_KEY) {
    console.error('❌  POLYGON_API_KEY not found. Set it in .env.local or as an env var.')
    process.exit(1)
}

const BASE = 'https://api.polygon.io'
const SYMBOL = 'SPY'
const TODAY = new Date().toISOString().split('T')[0]          // 2026-04-05
const YESTERDAY = new Date(Date.now() - 86400000).toISOString().split('T')[0]
const MONTH_AGO = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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

function printSection(title) {
    console.log('\n' + '═'.repeat(70))
    console.log(`  ${title}`)
    console.log('═'.repeat(70))
}

function printResult({ label, status, url, json }) {
    console.log(`\n▶ ${label}  [HTTP ${status}]`)
    console.log(`  URL: ${url.replace(API_KEY, '***KEY***')}`)

    if (json.status === 'ERROR' || json.error) {
        console.log(`  ⚠  Error:`, json.error || json.message)
        return
    }

    // Print first result + list of available keys
    const firstItem = json.results?.[0] ?? json.result ?? json
    if (firstItem && typeof firstItem === 'object') {
        console.log('  Available fields:', Object.keys(firstItem).join(', '))
        console.log('  Sample:', JSON.stringify(firstItem).slice(0, 400))
    }

    const count = Array.isArray(json.results) ? json.results.length
        : Array.isArray(json.result) ? json.result.length
            : json.resultsCount ?? json.count ?? '?'
    if (count !== '?') console.log(`  Records returned: ${count}`)
}

// ---------------------------------------------------------------------------
// Run all checks
// ---------------------------------------------------------------------------
async function main() {
    console.log(`\nPolygon API Explorer — ${SYMBOL}   (${TODAY})`)
    console.log(`Key prefix: ${API_KEY.slice(0, 6)}...`)

    // ── 1. REFERENCE DATA ─────────────────────────────────────────────────────
    printSection('1. REFERENCE DATA')

    const tickerDetail = await get(`/v3/reference/tickers/${SYMBOL}`, 'Ticker Detail')
    printResult(tickerDetail)

    const splits = await get(`/v3/reference/splits?ticker=${SYMBOL}&limit=5`, 'Stock Splits')
    printResult(splits)

    const dividends = await get(`/v3/reference/dividends?ticker=${SYMBOL}&limit=5`, 'Dividends')
    printResult(dividends)

    const conditions = await get(`/v1/meta/conditions/trades`, 'Trade Conditions Map')
    printResult(conditions)

    // ── 2. AGGREGATES (OHLCV BARS) ─────────────────────────────────────────────
    printSection('2. AGGREGATES — OHLCV Bars')

    const daily = await get(
        `/v2/aggs/ticker/${SYMBOL}/range/1/day/${MONTH_AGO}/${TODAY}?adjusted=true&sort=asc&limit=50`,
        'Daily Bars (1 month)'
    )
    printResult(daily)

    const hourly = await get(
        `/v2/aggs/ticker/${SYMBOL}/range/1/hour/${YESTERDAY}/${TODAY}?adjusted=true&sort=asc&limit=24`,
        'Hourly Bars (yesterday)'
    )
    printResult(hourly)

    const minute5 = await get(
        `/v2/aggs/ticker/${SYMBOL}/range/5/minute/${YESTERDAY}/${TODAY}?adjusted=true&sort=asc&limit=80`,
        '5-Minute Bars (yesterday)'
    )
    printResult(minute5)

    const prevDay = await get(
        `/v2/aggs/ticker/${SYMBOL}/prev?adjusted=true`,
        'Previous Day Bar'
    )
    printResult(prevDay)

    const grouped = await get(
        `/v2/aggs/grouped/locale/us/market/stocks/${YESTERDAY}?adjusted=true`,
        'Grouped Daily — ALL US Stocks (whole market, one day)'
    )
    printResult(grouped)

    // ── 3. SNAPSHOT (REAL-TIME / LATEST) ───────────────────────────────────────
    printSection('3. SNAPSHOTS — Real-time / Latest')

    const snapshot = await get(
        `/v2/snapshot/locale/us/markets/stocks/tickers/${SYMBOL}`,
        'Stock Snapshot (latest quote, day, minute bar)'
    )
    printResult(snapshot)

    const gainers = await get(
        `/v2/snapshot/locale/us/markets/stocks/gainers?include_otc=false`,
        'Market Gainers (top movers)'
    )
    printResult(gainers)

    const losers = await get(
        `/v2/snapshot/locale/us/markets/stocks/losers?include_otc=false`,
        'Market Losers'
    )
    printResult(losers)

    // ── 4. TRADES ──────────────────────────────────────────────────────────────
    printSection('4. TRADES — Tick-level')

    const trades = await get(
        `/v3/trades/${SYMBOL}?limit=5&order=desc`,
        'Last 5 Trades (tick data)'
    )
    printResult(trades)

    const lastTrade = await get(
        `/v2/last/trade/${SYMBOL}`,
        'Last Trade'
    )
    printResult(lastTrade)

    // ── 5. QUOTES (NBBO) ───────────────────────────────────────────────────────
    printSection('5. QUOTES — NBBO Bid/Ask')

    const quotes = await get(
        `/v3/quotes/${SYMBOL}?limit=5&order=desc`,
        'Last 5 Quotes (NBBO)'
    )
    printResult(quotes)

    const lastQuote = await get(
        `/v2/last/nbbo/${SYMBOL}`,
        'Last NBBO Quote'
    )
    printResult(lastQuote)

    // ── 6. OPTIONS ─────────────────────────────────────────────────────────────
    printSection('6. OPTIONS')

    // Find nearest expiry ~2 weeks out
    const exp = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]

    const optContracts = await get(
        `/v3/reference/options/contracts?underlying_ticker=${SYMBOL}&expiration_date.gte=${TODAY}&expiration_date.lte=${exp}&limit=10`,
        'Options Contracts — Reference (next 2 weeks)'
    )
    printResult(optContracts)

    const optSnapshot = await get(
        `/v3/snapshot/options/${SYMBOL}?limit=5`,
        'Options Chain Snapshot (greeks, IV, OI, bid/ask)'
    )
    printResult(optSnapshot)

    // ── 7. TECHNICAL INDICATORS ────────────────────────────────────────────────
    printSection('7. TECHNICAL INDICATORS (built-in)')

    const sma = await get(
        `/v1/indicators/sma/${SYMBOL}?timespan=day&adjusted=true&window=20&series_type=close&limit=5&order=desc`,
        'SMA-20 (daily)'
    )
    printResult(sma)

    const ema = await get(
        `/v1/indicators/ema/${SYMBOL}?timespan=day&adjusted=true&window=20&series_type=close&limit=5&order=desc`,
        'EMA-20 (daily)'
    )
    printResult(ema)

    const macd = await get(
        `/v1/indicators/macd/${SYMBOL}?timespan=day&adjusted=true&short_window=12&long_window=26&signal_window=9&series_type=close&limit=5&order=desc`,
        'MACD (12/26/9, daily)'
    )
    printResult(macd)

    const rsi = await get(
        `/v1/indicators/rsi/${SYMBOL}?timespan=day&adjusted=true&window=14&series_type=close&limit=5&order=desc`,
        'RSI-14 (daily)'
    )
    printResult(rsi)

    // ── 8. NEWS ────────────────────────────────────────────────────────────────
    printSection('8. NEWS')

    const news = await get(
        `/v2/reference/news?ticker=${SYMBOL}&limit=5&order=desc&sort=published_utc`,
        'Latest News Articles'
    )
    printResult(news)

    // ── 9. MARKET STATUS & SCHEDULE ────────────────────────────────────────────
    printSection('9. MARKET STATUS & SCHEDULE')

    const status = await get(`/v1/marketstatus/now`, 'Current Market Status')
    printResult(status)

    const holidays = await get(`/v1/marketstatus/upcoming`, 'Upcoming Market Holidays')
    printResult(holidays)

    // ── 10. FINANCIALS ─────────────────────────────────────────────────────────
    printSection('10. FINANCIALS (experimental — vX)')

    const financials = await get(
        `/vX/reference/financials?ticker=${SYMBOL}&limit=4&sort=period_of_report_date&order=desc`,
        'Income / Balance / Cash Flow Statements'
    )
    printResult(financials)

    // ── SUMMARY ────────────────────────────────────────────────────────────────
    printSection('SUMMARY — Data Categories Available for SPY')
    console.log(`
  Category                    Fields / Notes
  ─────────────────────────── ────────────────────────────────────────────────
  OHLCV Bars                  o, h, l, c, v, vw (VWAP), n (trades), t (ms ts)
                              → available per 1min/5min/15min/1hr/1day/1wk/1mo

  Snapshot (real-time)        day bar + minute bar + prevDay + lastTrade + lastQuote
                              → todaysChangePerc, todaysChange, updated

  Tick Trades                 price, size, exchange, conditions[], trf_timestamp
                              → nanosecond precision timestamps

  NBBO Quotes                 bid, ask, bid_size, ask_size, exchange, conditions[]
                              → nanosecond precision

  Options Reference           strike_price, expiration_date, contract_type (call/put)
                              → exercise_style, shares_per_contract, primary_exchange

  Options Snapshot            greeks (delta/gamma/theta/vega), implied_volatility
                              → open_interest, day(o/h/l/c/v/vw), last_quote(bid/ask)

  Technical Indicators        SMA, EMA, MACD (value/signal/histogram), RSI
                              → server-side calc, any window, any timespan

  News                        title, author, published_utc, article_url, tickers[], 
                              → amp_url, image_url, publisher{name,logo,favicon}

  Dividends                   cash_amount, ex_dividend_date, pay_date, frequency

  Splits                      split_from, split_to, execution_date

  Market Status               market (open/closed/extended), exchanges, currencies
                              → serverTime, afterHours, earlyHours

  Financials (vX)             income_statement, balance_sheet, cash_flow_statement
                              → fiscal_period, fiscal_year, start/end_date
`)

    console.log('Done.\n')
}

main().catch((e) => { console.error(e); process.exit(1) })
