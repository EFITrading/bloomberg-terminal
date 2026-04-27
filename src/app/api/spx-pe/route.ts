import { NextResponse } from 'next/server'

export const maxDuration = 60 // Vercel max for Pro plan

const POLYGON_API_KEY = process.env.POLYGON_API_KEY!

const cache = new Map<string, { data: unknown; timestamp: number }>()
const CACHE_DURATION = 3600000 // 1 hour — expensive to compute

// Full S&P 500 constituent list (503 tickers — includes dual-share classes like GOOGL/GOOG)
const CONSTITUENTS = [
    'MMM', 'AOS', 'ABT', 'ABBV', 'ACN', 'ADBE', 'AMD', 'AES', 'AFL', 'A', 'APD', 'ABNB', 'AKAM', 'ALB', 'ARE',
    'ALGN', 'ALLE', 'LNT', 'ALL', 'GOOGL', 'GOOG', 'MO', 'AMZN', 'AMCR', 'AEE', 'AAL', 'AEP', 'AXP', 'AIG',
    'AMT', 'AWK', 'AMP', 'AME', 'AMGN', 'APH', 'ADI', 'ANSS', 'AON', 'APA', 'AAPL', 'AMAT', 'APTV', 'ACGL',
    'ADM', 'ANET', 'AJG', 'AIZ', 'T', 'ATO', 'ADSK', 'AZO', 'AVB', 'AVY', 'AXON', 'BKR', 'BALL', 'BAC',
    'BK', 'BBWI', 'BAX', 'BDX', 'BRK.B', 'BBY', 'TECH', 'BIIB', 'BLK', 'BX', 'BK', 'BA', 'BKNG', 'BWA',
    'BSX', 'BMY', 'AVGO', 'BR', 'BRO', 'BF.B', 'BLDR', 'BG', 'CDNS', 'CZR', 'CPT', 'CPB', 'COF', 'CAH',
    'KMX', 'CCL', 'CARR', 'CTLT', 'CAT', 'CBOE', 'CBRE', 'CDW', 'CE', 'COR', 'CNC', 'CNX', 'CDAY', 'CF',
    'CRL', 'SCHW', 'CHTR', 'CVX', 'CMG', 'CB', 'CHD', 'CI', 'CINF', 'CTAS', 'CSCO', 'C', 'CFG', 'CLX',
    'CME', 'CMS', 'KO', 'CTSH', 'CL', 'CMCSA', 'CMA', 'CAG', 'COP', 'ED', 'STZ', 'CEG', 'COO', 'CPRT',
    'GLW', 'CPAY', 'CTVA', 'CSGP', 'COST', 'CTRA', 'CCI', 'CSX', 'CMI', 'CVS', 'DHI', 'DHR', 'DRI', 'DVA',
    'DAY', 'DECK', 'DE', 'DAL', 'DVN', 'DXCM', 'FANG', 'DLR', 'DFS', 'DG', 'DLTR', 'D', 'DPZ', 'DOV',
    'DOW', 'DHI', 'DTE', 'DUK', 'DD', 'EMN', 'ETN', 'EBAY', 'ECL', 'EIX', 'EW', 'EA', 'ELV', 'EMR', 'ENPH',
    'ETR', 'EOG', 'EPAM', 'EQT', 'EFX', 'EQIX', 'EQR', 'ESS', 'EL', 'ETSY', 'EG', 'EVRG', 'ES', 'EXC',
    'EXPE', 'EXPD', 'EXR', 'XOM', 'FFIV', 'FDS', 'FICO', 'FAST', 'FRT', 'FDX', 'FIS', 'FITB', 'FSLR',
    'FE', 'FI', 'FMC', 'F', 'FTNT', 'FTV', 'FOXA', 'FOX', 'BEN', 'FCX', 'GRMN', 'IT', 'GE', 'GEHC', 'GEV',
    'GEN', 'GNRC', 'GD', 'GIS', 'GM', 'GPC', 'GILD', 'GS', 'HAL', 'HIG', 'HAS', 'HCA', 'DOC', 'HSIC',
    'HSY', 'HES', 'HPE', 'HLT', 'HOLX', 'HD', 'HON', 'HRL', 'HST', 'HWM', 'HPQ', 'HUBB', 'HUM', 'HBAN',
    'HII', 'IBM', 'IEX', 'IDXX', 'ITW', 'INCY', 'IR', 'PODD', 'INTC', 'ICE', 'IFF', 'IP', 'IPG', 'INTU',
    'ISRG', 'IVZ', 'INVH', 'IQV', 'IRM', 'JBAL', 'JKHY', 'J', 'JBL', 'JNPR', 'JCI', 'JPM', 'JNPR',
    'K', 'KVUE', 'KDP', 'KEY', 'KEYS', 'KMB', 'KIM', 'KMI', 'KLAC', 'KHC', 'KR', 'LHX', 'LH', 'LRCX',
    'LW', 'LVS', 'LDOS', 'LEN', 'LII', 'LLY', 'LIN', 'LYV', 'LKQ', 'LMT', 'L', 'LOW', 'LULU', 'LYB',
    'MTB', 'MRO', 'MPC', 'MKTX', 'MAR', 'MMC', 'MLM', 'MAS', 'MA', 'MTCH', 'MKC', 'MCD', 'MCK', 'MDT',
    'MET', 'META', 'MTD', 'MGM', 'MCHP', 'MU', 'MSFT', 'MAA', 'MRNA', 'MHK', 'MOH', 'TAP', 'MDLZ', 'MPWR',
    'MNST', 'MCO', 'MS', 'MOS', 'MSI', 'MSCI', 'NDAQ', 'NTAP', 'NFLX', 'NEM', 'NWSA', 'NWS', 'NEE', 'NKE',
    'NI', 'NDSN', 'NSC', 'NTRS', 'NOC', 'NCLH', 'NRG', 'NUE', 'NVDA', 'NVR', 'NXPI', 'ORLY', 'OXY',
    'ODFL', 'OMC', 'ON', 'OKE', 'ORCL', 'OTIS', 'PCAR', 'PKG', 'PLTR', 'PH', 'PAYX', 'PAYC', 'PYPL',
    'PNR', 'PEP', 'PFE', 'PCG', 'PM', 'PSX', 'PNW', 'PXD', 'PNC', 'POOL', 'PPG', 'PPL', 'PFG', 'PG',
    'PGR', 'PRU', 'PLD', 'PRU', 'PEG', 'PTC', 'PSA', 'PHM', 'QRVO', 'PWR', 'QCOM', 'DGX', 'RL', 'RJF',
    'RTX', 'O', 'REG', 'REGN', 'RF', 'RSG', 'RMD', 'RVTY', 'RHI', 'ROK', 'ROL', 'ROP', 'ROST', 'RCL',
    'SPGI', 'CRM', 'SBAC', 'SLB', 'STX', 'SRE', 'NOW', 'SHW', 'SPG', 'SWKS', 'SJM', 'SNA', 'SO', 'LUV',
    'SWK', 'SBUX', 'STT', 'STLD', 'STE', 'SYK', 'SYF', 'SNPS', 'SYY', 'TMUS', 'TROW', 'TTWO', 'TPR',
    'TRGP', 'TGT', 'TEL', 'TDY', 'TFX', 'TER', 'TSLA', 'TXN', 'TXT', 'TMO', 'TJX', 'TSCO', 'TT', 'TDG',
    'TRV', 'TRMB', 'TFC', 'TYL', 'TSN', 'USB', 'UBER', 'UDR', 'ULTA', 'UNP', 'UAL', 'UPS', 'URI', 'UNH',
    'UHS', 'VLO', 'VTR', 'VRSN', 'VRSK', 'VZ', 'VRTX', 'VIAV', 'V', 'VST', 'VFC', 'VLTO', 'VNO', 'VMC',
    'WRB', 'GWW', 'WAB', 'WBA', 'WMT', 'WBD', 'WDAY', 'WEC', 'WFC', 'WELL', 'WST', 'WDC', 'WY', 'WHR',
    'WMB', 'WTW', 'WYNN', 'XEL', 'XYL', 'YUM', 'ZBRA', 'ZBH', 'ZTS',
]

interface FinancialQuarter { date: string; netIncome: number; shares: number }
interface PriceBar { date: string; close: number }

function binarySearchPrice(prices: PriceBar[], targetDate: string): number | null {
    let lo = 0, hi = prices.length - 1, best: number | null = null
    while (lo <= hi) {
        const mid = (lo + hi) >> 1
        if (prices[mid].date <= targetDate) { best = prices[mid].close; lo = mid + 1 }
        else hi = mid - 1
    }
    return best
}

function getTTMData(
    quarters: FinancialQuarter[],
    targetDate: string
): { ttmNI: number; shares: number } | null {
    // quarters are sorted ascending — find the last 4 available before targetDate
    let end = quarters.length
    while (end > 0 && quarters[end - 1].date > targetDate) end--
    if (end < 4) return null
    const last4 = quarters.slice(end - 4, end)
    const ttmNI = last4.reduce((s, q) => s + q.netIncome, 0)
    const shares = last4[last4.length - 1].shares
    return { ttmNI, shares }
}

export async function GET() {
    const cacheKey = 'spx-pe-v1'
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return NextResponse.json(cached.data)
    }

    try {
        const endDate = new Date().toISOString().split('T')[0]

        // Helper: run promises in batches to avoid rate-limiting 500 simultaneous calls
        async function batchFetch<T>(items: string[], fn: (t: string) => Promise<T>, batchSize = 20): Promise<T[]> {
            const results: T[] = []
            for (let i = 0; i < items.length; i += batchSize) {
                const chunk = items.slice(i, i + batchSize)
                const chunkResults = await Promise.all(chunk.map(fn))
                results.push(...chunkResults)
            }
            return results
        }

        // ── Step 1: Fetch quarterly financials in batches of 20 ──────────────────
        const finResults = await batchFetch(CONSTITUENTS, ticker =>
            fetch(
                `https://api.polygon.io/vX/reference/financials?ticker=${ticker}&timeframe=quarterly&limit=40&sort=period_of_report_date&order=asc&apiKey=${POLYGON_API_KEY}`
            )
                .then(r => r.ok ? r.json() : { results: [] })
                .then(json => ({ ticker, data: json.results ?? [] }))
                .catch(() => ({ ticker, data: [] }))
        )

        const allFinancials: Record<string, FinancialQuarter[]> = {}
        for (const { ticker, data } of finResults) {
            const quarters: FinancialQuarter[] = []
            for (const item of data) {
                const ni = item?.financials?.income_statement?.net_income_loss?.value
                const shares =
                    item?.financials?.income_statement?.diluted_average_shares?.value ??
                    item?.financials?.income_statement?.basic_average_shares?.value
                if (typeof ni === 'number' && typeof shares === 'number' && shares > 0 && item.end_date) {
                    quarters.push({ date: item.end_date, netIncome: ni, shares })
                }
            }
            if (quarters.length >= 4) allFinancials[ticker] = quarters
        }

        const validTickers = Object.keys(allFinancials)

        // ── Step 2: Fetch price histories in batches of 20 ───────────────────────
        const priceResults = await batchFetch([...validTickers, 'SPY'], ticker =>
            fetch(
                `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/2010-01-01/${endDate}?adjusted=true&sort=asc&limit=50000&apikey=${POLYGON_API_KEY}`
            )
                .then(r => r.ok ? r.json() : { results: [] })
                .then(json => ({
                    ticker,
                    bars: (json.results ?? []).map((b: { t: number; c: number }) => ({
                        date: new Date(b.t).toISOString().split('T')[0],
                        close: b.c,
                    })) as PriceBar[],
                }))
                .catch(() => ({ ticker, bars: [] as PriceBar[] }))
        )

        const allPrices: Record<string, PriceBar[]> = {}
        for (const { ticker, bars } of priceResults) allPrices[ticker] = bars

        const spyBars = allPrices['SPY'] ?? []
        if (spyBars.length === 0) {
            return NextResponse.json({ error: 'No SPY price data', history: [], avg5y: null, avg10y: null })
        }

        // ── Step 3: For each SPY bar compute weighted P/E ─────────────────────────
        // P/E = TotalMarketCap / TotalEarnings
        // TotalMarketCap_i = price_i × shares_i  (shares from most recent reported quarter)
        // TotalEarnings_i  = TTM net income (sum of last 4 quarters)
        const history: { date: string; pe: number }[] = []

        for (const bar of spyBars) {
            let totalMarketCap = 0
            let totalNetIncome = 0

            for (const ticker of validTickers) {
                const prices = allPrices[ticker]
                if (!prices?.length) continue
                const price = binarySearchPrice(prices, bar.date)
                if (!price) continue

                const fin = getTTMData(allFinancials[ticker], bar.date)
                if (!fin || fin.ttmNI <= 0) continue

                totalMarketCap += price * fin.shares
                totalNetIncome += fin.ttmNI
            }

            if (totalNetIncome <= 0 || totalMarketCap <= 0) continue
            const pe = totalMarketCap / totalNetIncome
            if (pe > 0 && pe < 150) {
                history.push({ date: bar.date, pe: Math.round(pe * 10) / 10 })
            }
        }

        if (history.length === 0) {
            return NextResponse.json({ error: 'Could not compute P/E history', history: [], avg5y: null, avg10y: null })
        }

        // ── Step 4: Compute averages ──────────────────────────────────────────────
        const now = Date.now()
        const y5ago = new Date(now - 5 * 365.25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        const y10ago = new Date(now - 10 * 365.25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        const last5y = history.filter(h => h.date >= y5ago)
        const last10y = history.filter(h => h.date >= y10ago)
        const avg5y = last5y.length ? Math.round((last5y.reduce((s, h) => s + h.pe, 0) / last5y.length) * 10) / 10 : null
        const avg10y = last10y.length ? Math.round((last10y.reduce((s, h) => s + h.pe, 0) / last10y.length) * 10) / 10 : null
        const current = history[history.length - 1]?.pe ?? null

        const result = { history, avg5y, avg10y, current, constituents: validTickers.length }
        cache.set(cacheKey, { data: result, timestamp: Date.now() })
        return NextResponse.json(result)
    } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 500 })
    }
}
