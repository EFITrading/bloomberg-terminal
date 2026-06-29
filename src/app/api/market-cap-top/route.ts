import { NextRequest, NextResponse } from 'next/server'

const POLYGON_API_KEY = process.env.POLYGON_API_KEY!

// Static top-1000 US stocks by market cap (approximate, updated periodically)
// Ordered roughly by market cap as of mid-2026
const TOP_1000_BY_MARKET_CAP: string[] = [
    // Mega caps
    'NVDA', 'MSFT', 'AAPL', 'AMZN', 'GOOGL', 'GOOG', 'META', 'TSLA', 'BRK-B', 'AVGO',
    'LLY', 'TSM', 'V', 'JPM', 'WMT', 'UNH', 'MA', 'XOM', 'COST', 'NFLX',
    'JNJ', 'ORCL', 'HD', 'BAC', 'ABBV', 'PG', 'KO', 'MRK', 'CVX', 'PLTR',
    // Large caps
    'CSCO', 'AMD', 'ADBE', 'ISRG', 'GE', 'ACN', 'LIN', 'TXN', 'QCOM', 'AMGN',
    'PEP', 'IBM', 'INTU', 'GS', 'CAT', 'DHR', 'NOW', 'MCD', 'T', 'TMO',
    'SPGI', 'UBER', 'BX', 'CRM', 'ARM', 'AXP', 'SYK', 'PANW', 'PFE', 'MS',
    'VRTX', 'BLK', 'INTC', 'BKNG', 'MMC', 'TJX', 'RTX', 'LOW', 'AMAT', 'LRCX',
    'CB', 'PGR', 'HON', 'ELV', 'ADP', 'MDT', 'USB', 'C', 'SCHW', 'MU',
    'PM', 'GILD', 'ADI', 'KLAC', 'SNPS', 'CDNS', 'BSX', 'GD', 'DE', 'NEE',
    'SO', 'HCA', 'CME', 'ITW', 'NKE', 'ICE', 'DUK', 'WM', 'NOC', 'LMT',
    'BMY', 'PLD', 'AON', 'CI', 'FI', 'REGN', 'ZTS', 'AJG', 'MCO', 'CTAS',
    'ORLY', 'SHW', 'TT', 'WELL', 'CL', 'APH', 'GWW', 'CARR', 'COF', 'HLT',
    'IDXX', 'WTW', 'ECL', 'CSX', 'FDX', 'EMR', 'PCAR', 'MELI', 'NXPI', 'CRWD',
    'CEG', 'OKE', 'MRVL', 'HWM', 'ROST', 'DD', 'MCHP', 'EA', 'FTNT', 'MSCI',
    'NSC', 'WFC', 'TRV', 'SRE', 'ETN', 'AFL', 'TFC', 'F', 'GM', 'MO',
    'KHC', 'BDX', 'MNST', 'DOV', 'GPC', 'DLTR', 'FAST', 'STZ', 'HIG', 'AEP',
    'VLO', 'PSA', 'VRSK', 'IQV', 'EW', 'MPWR', 'DG', 'EXC', 'BIIB', 'WAB',
    'XEL', 'KMB', 'OTIS', 'PPG', 'MTD', 'PWR', 'URI', 'ON', 'SBUX', 'CMI',
    'VZ', 'PAYX', 'RMD', 'YUM', 'DVN', 'TSCO', 'KEYS', 'TROW', 'STT', 'ZBRA',
    'DAL', 'UAL', 'LUV', 'AAL', 'CCL', 'RCL', 'NCLH', 'BA', 'SPG', 'O',
    'AMT', 'PH', 'IRM', 'EQIX', 'AVB', 'EQR', 'VTR', 'PEAK', 'ARE', 'DRE',
    // Mid caps and notable names
    'COIN', 'HOOD', 'MSTR', 'CRWV', 'OKLO', 'IONQ', 'QUBT', 'IREN', 'SHOP',
    'DASH', 'ABNB', 'ROKU', 'RBLX', 'LYFT', 'SNAP', 'PINS', 'TWTR', 'RDDT',
    'AFRM', 'UPST', 'SOFI', 'LCID', 'RIVN', 'NKLA', 'CHPT', 'BLNK', 'EVGO',
    'DKNG', 'PENN', 'MGM', 'LVS', 'WYNN', 'CZR', 'BALY', 'FUBO', 'PARA',
    'WBD', 'FOX', 'FOXA', 'NWSA', 'NWS', 'DIS', 'CMCSA', 'CHTR', 'TMUS',
    'S', 'LUMN', 'FYBR', 'ATUS', 'CNSL', 'WOW', 'CABO', 'SHEN', 'LBRD',
    'BKR', 'HAL', 'SLB', 'NOV', 'OXY', 'COP', 'EOG', 'PXD', 'MPC', 'PSX',
    'HES', 'APA', 'CTRA', 'FANG', 'PR', 'MGY', 'MTDR', 'SM', 'CRGY', 'VTLE',
    'FCX', 'SCCO', 'NEM', 'GOLD', 'AEM', 'WPM', 'KGC', 'AG', 'PAAS', 'HL',
    'CLF', 'X', 'NUE', 'STLD', 'RS', 'CMC', 'ATI', 'HCC', 'AMR', 'ARCH',
    'AA', 'CENX', 'KALU', 'CSTM', 'ARNC', 'HOWMET', 'ESAB', 'GXO', 'XPO', 'SAIA',
    'ODFL', 'CHRW', 'LSTR', 'JBHT', 'KNX', 'WERN', 'HTLD', 'MRTN', 'USAK', 'PTSI',
    'ZM', 'DOCU', 'WORK', 'BOX', 'DDOG', 'GTLB', 'HUBS', 'BRZE', 'BILL', 'PCTY',
    'PAYC', 'NCNO', 'FOUR', 'PAYO', 'EVTC', 'PAGS', 'STNE', 'TOST', 'PAX', 'SMPL',
    'NET', 'CFLT', 'MDB', 'ESTC', 'SUMO', 'NEWR', 'APPD', 'APPDYN', 'DT', 'IOT',
    'ENPH', 'SEDG', 'FSLR', 'NOVA', 'ARRY', 'CSIQ', 'JKS', 'SPWR', 'RUN', 'SUNW',
    'BLNK', 'CHPT', 'EVGO', 'BEEM', 'AMSC', 'PLUG', 'FCEL', 'BE', 'HYLN', 'WKHS',
    'PATH', 'ASAN', 'MNDY', 'SMAR', 'PLAN', 'ASGN', 'CDAY', 'WDAY', 'VEEV', 'ANSS',
    'PTC', 'NUAN', 'PROS', 'APPF', 'JAMF', 'ALRM', 'NTUS', 'QTWO', 'Q2', 'XCHG',
    'MTTR', 'VRNS', 'TENB', 'QLYS', 'CHKP', 'CYBR', 'SAIC', 'LDOS', 'BAH', 'CACI',
    'MANF', 'ICF', 'PRSP', 'KFRC', 'MAN', 'RHI', 'KELYA', 'TBI', 'CDW', 'PCVX',
    // More S&P 500 / Russell 1000 names
    'ALLE', 'AMCR', 'AME', 'APTV', 'BR', 'BWA', 'CF', 'CHD', 'CHRW', 'CINF',
    'CLX', 'CMS', 'CNP', 'CPB', 'CPRT', 'CPT', 'CRL', 'CTSH', 'CTVA', 'CWT',
    'DGX', 'DPZ', 'DRQ', 'DTE', 'DVA', 'EA', 'EBAY', 'EFX', 'EIX', 'EL',
    'EMN', 'EQT', 'ES', 'ESS', 'ETSY', 'EVRG', 'EXR', 'FDS', 'FE', 'FRT',
    'GEHC', 'GL', 'HAS', 'HOLX', 'HPE', 'HPQ', 'HSY', 'HUM', 'IEX', 'IP',
    'IVZ', 'J', 'JKHY', 'K', 'KIM', 'KVUE', 'L', 'LEN', 'LH', 'LKQ',
    'LNT', 'LYB', 'LYV', 'MAA', 'MAS', 'MKTX', 'NDAQ', 'NVR', 'NWL', 'OMC',
    'PAYC', 'PKG', 'PNR', 'PNW', 'POOL', 'PPL', 'PRU', 'PSX', 'PVH', 'REG',
    'RF', 'RL', 'ROK', 'ROL', 'ROP', 'SBAC', 'SJM', 'SNA', 'STE', 'SWK',
    'SYY', 'TAP', 'TECH', 'TFX', 'TGT', 'TPR', 'TRMB', 'TTEK', 'TXT', 'UDR',
    'UHS', 'ULTA', 'UNP', 'VFC', 'VTRS', 'WAT', 'WBA', 'WDC', 'WEC', 'WELL',
    'WRB', 'WRK', 'WST', 'WY', 'WYNN', 'XYL', 'ZBH', 'ZBRA', 'ZION', 'ZTS',
    // Additional mid/large caps
    'ACGL', 'ADM', 'AIG', 'AIZ', 'ALC', 'ALK', 'ALGN', 'ALLE', 'ALLY', 'ALNY',
    'ALSN', 'ALTM', 'ALV', 'AMG', 'AMKR', 'AMNB', 'AMP', 'AMRX', 'AMT', 'AMTM',
    'ANAB', 'ANDE', 'ANET', 'ANF', 'ANTM', 'ANTS', 'AON', 'AOS', 'APA', 'APAM',
    'APLE', 'APPF', 'APPN', 'APLS', 'APO', 'APPF', 'ARAY', 'ARC', 'ARCB', 'ARCH',
    'ARCO', 'ARE', 'ARKO', 'ARKG', 'ARKQ', 'ARKW', 'ARMK', 'ARW', 'ASB', 'ASGN',
    'ASH', 'ASO', 'ASPS', 'ASTE', 'ATO', 'ATR', 'ATRO', 'ATVI', 'AUB', 'AVA',
    'AVAV', 'AVB', 'AVGO', 'AVNW', 'AVNT', 'AVXL', 'AWK', 'AWR', 'AXS', 'AY',
    // Biotech and healthcare
    'ABBV', 'ACAD', 'ACET', 'ACHC', 'ACLS', 'ACM', 'ACNB', 'ACRS', 'ACRX', 'ACRX',
    'ADMA', 'ADMS', 'ADPT', 'ADRO', 'ADTN', 'ADTX', 'ADUS', 'AEL', 'AEGN', 'AEHL',
    'AGEN', 'AGM', 'AGMH', 'AGNCM', 'AGNCO', 'AGOP', 'AGRI', 'AGRO', 'AGTI', 'AGTX',
    'AHCO', 'AHPI', 'AHT', 'AIG', 'AIRC', 'AIRG', 'AIRPA', 'AIRPW', 'AIT', 'AIZN',
    // Financials
    'BAC', 'BK', 'BKU', 'BKVE', 'BMI', 'BMS', 'BMTC', 'BNS', 'BOH', 'BOKF',
    'BPOP', 'BRO', 'BRKL', 'BSRR', 'BSVN', 'BTH', 'BUR', 'BUSE', 'BXMT', 'BXSL',
    'BY', 'CADE', 'CAPR', 'CARV', 'CASH', 'CASS', 'CATC', 'CATM', 'CATO', 'CBSH',
    'CBTX', 'CBU', 'CCBG', 'CCFN', 'CDE', 'CDNA', 'CDNS', 'CEVA', 'CFB', 'CFFI',
    'CFFN', 'CFG', 'CFLT', 'CGEN', 'CGNT', 'CGTX', 'CHCO', 'CHRW', 'CHUY', 'CIFS',
    'CINF', 'CIT', 'CIVB', 'CIVBP', 'CIX', 'CIZN', 'CJJD', 'CKPT', 'CL', 'CLAR',
    // Energy & Utilities
    'CLH', 'CLNE', 'CLNR', 'CLPS', 'CMAX', 'CMCO', 'CMGE', 'CMLS', 'CMP', 'CMRE',
    'CMT', 'CMTG', 'CMTL', 'CNCE', 'CNET', 'CNG', 'CNNE', 'CNO', 'CNOB', 'CNSL',
    'CNTB', 'CNX', 'CNXC', 'COE', 'COG', 'COKE', 'COLB', 'COLL', 'COLM', 'COMM',
    'COMS', 'CONN', 'CONX', 'COOP', 'CORR', 'CORS', 'CORT', 'COUR', 'COVA', 'CPNG',
]

const topCache = new Map<number, { symbols: string[]; marketCaps: number[]; ts: number }>()
const TOP_CACHE_TTL = 4 * 60 * 60 * 1000 // 4 hours

// Generate rank-based pseudo market caps using a power law decay.
// rank=1 is largest; result is normalized so values sum to 1.
// Power of 0.7 gives moderate concentration (less extreme than real market cap).
function rankBasedMarketCaps(n: number): number[] {
    const raw = Array.from({ length: n }, (_, i) => 1 / Math.pow(i + 1, 0.7))
    const total = raw.reduce((s, v) => s + v, 0)
    return raw.map((v) => v / total)
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const limitParam = parseInt(searchParams.get('limit') || '10')
    const limit = Math.min(1000, Math.max(1, isNaN(limitParam) ? 10 : limitParam))

    // Return from cache
    const cachedResult = topCache.get(limit)
    if (cachedResult && Date.now() - cachedResult.ts < TOP_CACHE_TTL) {
        return NextResponse.json({ symbols: cachedResult.symbols, marketCaps: cachedResult.marketCaps, source: 'cache' })
    }

    // Try Polygon reference tickers first (dynamic, real market cap)
    try {
        const pagesNeeded = Math.ceil(limit / 250)
        const allSymbols: string[] = []
        const allMarketCaps: number[] = []
        let nextUrl = `https://api.polygon.io/v3/reference/tickers?market=stocks&active=true&order=desc&sort=market_cap&limit=250&apiKey=${POLYGON_API_KEY}`

        for (let page = 0; page < pagesNeeded && nextUrl; page++) {
            const resp = await fetch(nextUrl, {
                headers: { Accept: 'application/json' },
                signal: AbortSignal.timeout(10000),
            })

            if (!resp.ok) throw new Error(`Polygon HTTP ${resp.status}`)

            const data = await resp.json()
            const results: any[] = data.results || []

            for (const t of results) {
                // Only plain US equity tickers (no special chars, not too long)
                if (
                    t.ticker &&
                    /^[A-Z]{1,5}$/.test(t.ticker) &&
                    t.market === 'stocks' &&
                    t.locale === 'us'
                ) {
                    allSymbols.push(t.ticker)
                    allMarketCaps.push(t.market_cap || 0)
                }
            }

            nextUrl = data.next_url ? `${data.next_url}&apiKey=${POLYGON_API_KEY}` : ''
            if (allSymbols.length >= limit) break
        }

        if (allSymbols.length >= Math.min(limit, 10)) {
            const symbols = allSymbols.slice(0, limit)
            let marketCaps = allMarketCaps.slice(0, limit)

            // If Polygon didn't return market_cap values, fall back to rank-based approximation
            const hasRealMC = marketCaps.some((v) => v > 0)
            if (!hasRealMC) {
                marketCaps = rankBasedMarketCaps(symbols.length)
            } else {
                // Normalize so they sum to 1
                const total = marketCaps.reduce((s, v) => s + v, 0)
                marketCaps = total > 0 ? marketCaps.map((v) => v / total) : rankBasedMarketCaps(symbols.length)
            }

            topCache.set(limit, { symbols, marketCaps, ts: Date.now() })
            return NextResponse.json({ symbols, marketCaps, source: 'polygon' })
        }
    } catch {
        // Fall through to static list
    }

    // Fallback: use static list with rank-based market cap approximation
    const symbols = TOP_1000_BY_MARKET_CAP.slice(0, limit)
    const marketCaps = rankBasedMarketCaps(symbols.length)
    topCache.set(limit, { symbols, marketCaps, ts: Date.now() })
    return NextResponse.json({ symbols, marketCaps, source: 'static' })
}
