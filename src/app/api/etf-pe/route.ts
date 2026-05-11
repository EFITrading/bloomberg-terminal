import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

const POLYGON_API_KEY = process.env.POLYGON_API_KEY!

const cache = new Map<string, { data: unknown; timestamp: number }>()
const CACHE_DURATION = 3600000 // 1 hour

// ─── ETF Constituent Lists ────────────────────────────────────────────────────
// Covers top holdings by weight for each ETF. Non-equity / negative-earnings
// constituents are automatically skipped during computation.
const ETF_CONSTITUENTS: Record<string, string[]> = {
    QQQ: [
        'AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'GOOG', 'AVGO', 'TSLA', 'COST',
        'NFLX', 'TMUS', 'CSCO', 'AMD', 'INTU', 'AMGN', 'ISRG', 'PEP', 'BKNG', 'QCOM',
        'ADP', 'TXN', 'HON', 'AMAT', 'PANW', 'SBUX', 'VRTX', 'GILD', 'MDLZ', 'ADI',
        'LRCX', 'REGN', 'MU', 'KLAC', 'CDNS', 'SNPS', 'ORCL', 'MRVL', 'PAYX', 'FTNT',
        'CTAS', 'MNST', 'ODFL', 'FAST', 'DXCM', 'KDP', 'VRSK', 'DLTR', 'EXC', 'MELI',
        'GEHC', 'IDXX', 'CTSH', 'CEG', 'BIIB', 'ANSS', 'WBD',
    ],
    XLK: [
        'AAPL', 'MSFT', 'NVDA', 'AVGO', 'ORCL', 'AMD', 'CSCO', 'ACN', 'INTU', 'ADBE',
        'TXN', 'IBM', 'QCOM', 'PLTR', 'AMAT', 'PANW', 'KLAC', 'SNPS', 'CDNS', 'LRCX',
        'ADI', 'INTC', 'MCHP', 'FTNT', 'NXPI', 'TEL', 'KEYS', 'ANSS', 'WDC', 'MSI',
        'SWKS', 'HPQ', 'HPE', 'ANET', 'GLW',
    ],
    XLF: [
        'BRK.B', 'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'AXP', 'MS', 'BLK',
        'SPGI', 'C', 'CME', 'CB', 'MMC', 'ICE', 'PGR', 'MCO', 'TRV', 'USB',
        'PNC', 'AIG', 'AFL', 'ALL', 'MET', 'PRU', 'HIG', 'COF', 'CINF', 'KEY',
        'CMA', 'RF', 'FITB', 'BK', 'STT', 'NTRS', 'CFG', 'SYF', 'FI', 'FIS',
    ],
    XLE: [
        'XOM', 'CVX', 'COP', 'EOG', 'SLB', 'MPC', 'VLO', 'PSX', 'OXY', 'HAL',
        'DVN', 'HES', 'BKR', 'FANG', 'MRO', 'APA', 'TRGP', 'EQT', 'OKE', 'KMI',
        'WMB',
    ],
    XLV: [
        'LLY', 'UNH', 'ABBV', 'MRK', 'TMO', 'ABT', 'DHR', 'AMGN', 'BSX', 'ISRG',
        'VRTX', 'MDT', 'BMY', 'CVS', 'GILD', 'SYK', 'REGN', 'ELV', 'CNC', 'HCA',
        'ZTS', 'MOH', 'DXCM', 'IDXX', 'HOLX', 'BIIB', 'BDX', 'RMD', 'BAX', 'IQV',
        'A', 'RVTY', 'MTD', 'PODD', 'INCY',
    ],
    XLI: [
        'GE', 'RTX', 'HON', 'UNP', 'UPS', 'CAT', 'ETN', 'DE', 'LMT', 'BA',
        'NOC', 'GD', 'WM', 'CSX', 'ITW', 'EMR', 'FDX', 'NSC', 'PH', 'ROK',
        'PCAR', 'CTAS', 'FAST', 'ODFL', 'JCI', 'TT', 'IR', 'CARR', 'GWW', 'AXON',
        'LDOS', 'TDY', 'TDG', 'HII', 'HUBB', 'WAB', 'NDSN', 'TXT',
    ],
    XLC: [
        'META', 'GOOGL', 'GOOG', 'NFLX', 'T', 'VZ', 'TMUS', 'CMCSA', 'DIS',
        'CHTR', 'EA', 'WBD', 'TTWO', 'OMC', 'IPG', 'FOXA', 'FOX', 'LYV', 'MTCH',
    ],
    XLY: [
        'AMZN', 'TSLA', 'MCD', 'NKE', 'HD', 'BKNG', 'LOW', 'TJX', 'SBUX', 'CMG',
        'ABNB', 'YUM', 'ORLY', 'CCL', 'GM', 'F', 'EBAY', 'DHI', 'LVS', 'WYNN',
        'HLT', 'MAR', 'PHM', 'LEN', 'ROST', 'DPZ', 'DG', 'TGT', 'NCLH', 'APTV',
        'GPC', 'KMX', 'POOL', 'RCL',
    ],
    XLP: [
        'PG', 'COST', 'KO', 'PEP', 'PM', 'MO', 'MDLZ', 'CL', 'WMT', 'KMB',
        'GIS', 'SYY', 'CHD', 'CAG', 'HRL', 'TSN', 'CPB', 'K', 'MKC', 'KR',
        'EL', 'KVUE', 'STZ', 'TAP', 'BG',
    ],
    XLU: [
        'NEE', 'SO', 'DUK', 'SRE', 'AEP', 'EXC', 'D', 'PCG', 'ED', 'XEL',
        'WEC', 'ES', 'ETR', 'CMS', 'AEE', 'NI', 'LNT', 'EVRG', 'PNW',
        'AWK', 'VST', 'CEG', 'NRG',
    ],
    XLRE: [
        'PLD', 'AMT', 'EQIX', 'CCI', 'PSA', 'SPG', 'WELL', 'DLR', 'O', 'AVB',
        'EQR', 'VTR', 'ARE', 'WY', 'MAA', 'EXR', 'SBAC', 'HST', 'KIM', 'REG',
        'INVH', 'ESS', 'CPT', 'UDR', 'FRT',
    ],
    XLB: [
        'LIN', 'APD', 'ECL', 'SHW', 'FCX', 'NEM', 'NUE', 'ALB', 'PPG', 'VMC',
        'MLM', 'DD', 'CE', 'IFF', 'LYB', 'EMN', 'CF', 'MOS', 'AVY', 'PKG', 'FMC',
    ],
    DIA: [
        'UNH', 'GS', 'MSFT', 'HD', 'CAT', 'MCD', 'AMGN', 'V', 'TRV', 'SHW',
        'AXP', 'IBM', 'JPM', 'HON', 'CRM', 'AAPL', 'MMM', 'CVX', 'BA', 'JNJ',
        'NKE', 'PG', 'MRK', 'CSCO', 'WMT', 'DIS', 'DOW', 'INTC', 'KO', 'VZ',
    ],
    VTI: [
        'AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'GOOG', 'AVGO', 'TSLA',
        'BRK.B', 'JPM', 'LLY', 'V', 'UNH', 'XOM', 'MA', 'COST', 'JNJ', 'HD',
        'WMT', 'NFLX', 'PG', 'BAC', 'ABBV', 'CRM', 'CVX', 'KO', 'MRK', 'PEP',
        'AMD', 'ORCL', 'ACN', 'CSCO', 'TMO', 'LIN', 'IBM', 'ADBE', 'INTU', 'GE',
        'AMGN', 'ABT', 'CAT', 'ISRG', 'GS', 'NOW', 'RTX', 'HON', 'TXN', 'MU',
        'SPGI', 'BKNG', 'VRTX', 'DIS', 'AMAT', 'ETN', 'PLD', 'CME', 'SYK', 'DE',
    ],
    IWM: [
        'SMCI', 'INSM', 'CAVA', 'TXRH', 'DUOL', 'FN', 'SAIA', 'HLNE', 'SPSC',
        'SIGI', 'BPOP', 'MGEE', 'SFBS', 'FRME', 'NMRK', 'SBCF', 'HTLF',
        'CVBF', 'UBSI', 'NBTB', 'TOWN', 'HAFC', 'PRGS', 'RBCAA',
        'IBTX', 'WSBC', 'OTTR', 'SKYW', 'SEM', 'HOMB', 'IBCP', 'ENVA',
        'LGND', 'PDCO', 'PAHC', 'AEIS', 'CPRX', 'SHAK', 'MSEX', 'PEBO',
        'FISI', 'RNST', 'FCNCA', 'CATY', 'FFBC', 'GBCI', 'SASR',
        'APOG', 'MGRC', 'HASI', 'PNFP', 'ABCB', 'CPF', 'PSMT', 'NHI', 'GTY',
    ],
}

// Known ETF tickers (superset — includes SPY handled by /api/spx-pe)
export const KNOWN_ETFS = new Set([
    'SPY', 'QQQ', 'IWM', 'DIA', 'VTI',
    'XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLC', 'XLY', 'XLP', 'XLU', 'XLRE', 'XLB',
    'GLD', 'SLV', 'TLT', 'HYG', 'LQD', 'EEM', 'EFA', 'VNQ', 'ARKK', 'SMH', 'SOXX',
    'XBI', 'IBB', 'KWEB', 'FXI', 'EWZ', 'VXX', 'UVXY',
])

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
    let end = quarters.length
    while (end > 0 && quarters[end - 1].date > targetDate) end--
    if (end < 4) return null
    const last4 = quarters.slice(end - 4, end)
    const ttmNI = last4.reduce((s, q) => s + q.netIncome, 0)
    const shares = last4[last4.length - 1].shares
    return { ttmNI, shares }
}

async function batchFetch<T>(
    items: string[],
    fn: (t: string) => Promise<T>,
    batchSize = 15
): Promise<T[]> {
    const results: T[] = []
    for (let i = 0; i < items.length; i += batchSize) {
        const chunk = items.slice(i, i + batchSize)
        const chunkResults = await Promise.all(chunk.map(fn))
        results.push(...chunkResults)
    }
    return results
}

export async function GET(req: NextRequest) {
    const ticker = req.nextUrl.searchParams.get('ticker')?.toUpperCase()
    if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 })

    // SPY uses the more complete /api/spx-pe route — proxy it here
    if (ticker === 'SPY') {
        const spxRes = await fetch(`${req.nextUrl.origin}/api/spx-pe`, {
            headers: { 'User-Agent': 'internal' },
        }).catch(() => null)
        if (spxRes?.ok) {
            const data = await spxRes.json()
            return NextResponse.json(data)
        }
        // Fall through to constituent method if spx-pe fails
    }

    const constituents = ETF_CONSTITUENTS[ticker]
    if (!constituents) {
        return NextResponse.json(
            { error: `ETF "${ticker}" not supported. Supported: ${Object.keys(ETF_CONSTITUENTS).join(', ')}` },
            { status: 400 }
        )
    }

    const cacheKey = `etf-pe-v1-${ticker}`
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return NextResponse.json(cached.data)
    }

    try {
        const endDate = new Date().toISOString().split('T')[0]
        // 2 years of history — enough for avg high/low bands in the chart
        const startDate = new Date(Date.now() - 2 * 365.25 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0]

        // ── Step 1: Quarterly financials (8 quarters each) ─────────────────────
        const finResults = await batchFetch(
            constituents,
            (sym) =>
                fetch(
                    `https://api.polygon.io/vX/reference/financials?ticker=${encodeURIComponent(sym)}&timeframe=quarterly&limit=8&sort=period_of_report_date&order=asc&apiKey=${POLYGON_API_KEY}`
                )
                    .then((r) => (r.ok ? r.json() : { results: [] }))
                    .then((json) => {
                        const quarters: FinancialQuarter[] = []
                        for (const item of json.results ?? []) {
                            const ni = item?.financials?.income_statement?.net_income_loss?.value
                            const shares =
                                item?.financials?.income_statement?.diluted_average_shares?.value ??
                                item?.financials?.income_statement?.basic_average_shares?.value
                            if (typeof ni === 'number' && typeof shares === 'number' && shares > 0 && item.end_date) {
                                quarters.push({ date: item.end_date, netIncome: ni, shares })
                            }
                        }
                        return { ticker: sym, quarters }
                    })
                    .catch(() => ({ ticker: sym, quarters: [] as FinancialQuarter[] })),
            15
        )

        const allFinancials: Record<string, FinancialQuarter[]> = {}
        for (const { ticker: sym, quarters } of finResults) {
            if (quarters.length >= 4) allFinancials[sym] = quarters
        }
        const validTickers = Object.keys(allFinancials)

        if (validTickers.length === 0) {
            return NextResponse.json({ error: 'No financial data found for constituents', history: [], avg5y: null, avg10y: null, current: null })
        }

        // ── Step 2: 2-year daily price history for each valid constituent ───────
        const priceResults = await batchFetch(
            validTickers,
            (sym) =>
                fetch(
                    `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(sym)}/range/1/day/${startDate}/${endDate}?adjusted=true&sort=asc&limit=10000&apikey=${POLYGON_API_KEY}`
                )
                    .then((r) => (r.ok ? r.json() : { results: [] }))
                    .then((json) => ({
                        ticker: sym,
                        bars: ((json.results ?? []) as { t: number; c: number }[]).map((b) => ({
                            date: new Date(b.t).toISOString().split('T')[0],
                            close: b.c,
                        })) as PriceBar[],
                    }))
                    .catch(() => ({ ticker: sym, bars: [] as PriceBar[] })),
            15
        )

        const allPrices: Record<string, PriceBar[]> = {}
        for (const { ticker: sym, bars } of priceResults) allPrices[sym] = bars

        // ── Step 3: Fetch the ETF's own price history for date alignment ────────
        const etfPriceRes = await fetch(
            `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${startDate}/${endDate}?adjusted=true&sort=asc&limit=10000&apikey=${POLYGON_API_KEY}`
        )
        const etfPriceJson = etfPriceRes.ok ? await etfPriceRes.json() : { results: [] }
        const etfBars: PriceBar[] = ((etfPriceJson.results ?? []) as { t: number; c: number }[]).map((b) => ({
            date: new Date(b.t).toISOString().split('T')[0],
            close: b.c,
        }))

        if (etfBars.length === 0) {
            return NextResponse.json({ error: `No price data for ${ticker}`, history: [], avg5y: null, avg10y: null, current: null })
        }

        // ── Step 4: Build daily aggregate P/E series ─────────────────────────────
        // Aggregate P/E = Σ(price_i × shares_i) / Σ(TTM net income_i)
        // This is the Bloomberg / FactSet "index-level" P/E — most accurate for cap-weighted ETFs.
        // Excludes constituents with negative TTM earnings (standard index convention).
        const history: { date: string; pe: number }[] = []

        for (const bar of etfBars) {
            let totalMarketCap = 0
            let totalNetIncome = 0

            for (const sym of validTickers) {
                const prices = allPrices[sym]
                if (!prices?.length) continue
                const price = binarySearchPrice(prices, bar.date)
                if (!price) continue

                const fin = getTTMData(allFinancials[sym], bar.date)
                if (!fin || fin.ttmNI <= 0) continue

                totalMarketCap += price * fin.shares
                totalNetIncome += fin.ttmNI
            }

            if (totalNetIncome <= 0 || totalMarketCap <= 0) continue
            const pe = totalMarketCap / totalNetIncome
            if (pe > 0 && pe < 300) {
                history.push({ date: bar.date, pe: Math.round(pe * 10) / 10 })
            }
        }

        if (history.length === 0) {
            return NextResponse.json({ error: 'Could not compute P/E history', history: [], avg5y: null, avg10y: null, current: null })
        }

        // ── Step 5: Compute current / averages ─────────────────────────────────
        const now = Date.now()
        const y5ago = new Date(now - 5 * 365.25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        const y10ago = new Date(now - 10 * 365.25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        const last5y = history.filter((h) => h.date >= y5ago)
        const last10y = history.filter((h) => h.date >= y10ago)

        const avg = (arr: { pe: number }[]) =>
            arr.length ? Math.round((arr.reduce((s, h) => s + h.pe, 0) / arr.length) * 10) / 10 : null

        const current = history[history.length - 1]?.pe ?? null
        const avg5y = avg(last5y)
        const avg10y = avg(last10y)

        const result = { history, avg5y, avg10y, current, constituents: validTickers.length }
        cache.set(cacheKey, { data: result, timestamp: Date.now() })
        return NextResponse.json(result)
    } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 500 })
    }
}
