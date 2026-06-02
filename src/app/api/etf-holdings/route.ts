import { NextRequest, NextResponse } from 'next/server'

// Static ETF holdings data — top holdings by weight order for major ETFs
// Updated periodically to reflect current weights
const ETF_HOLDINGS: Record<string, string[]> = {
    // S&P 500
    SPY: [
        'NVDA', 'MSFT', 'AAPL', 'AMZN', 'META', 'GOOGL', 'GOOG', 'TSLA', 'AVGO', 'BRK-B',
        'JPM', 'LLY', 'V', 'UNH', 'XOM', 'WMT', 'MA', 'COST', 'JNJ', 'ORCL',
        'HD', 'BAC', 'ABBV', 'PG', 'KO', 'MRK', 'CVX', 'NFLX', 'CSCO', 'AMD',
        'ADBE', 'ISRG', 'GE', 'ACN', 'LIN', 'TXN', 'QCOM', 'AMGN', 'PEP', 'IBM',
        'INTU', 'GS', 'CAT', 'DHR', 'NOW', 'MCD', 'T', 'TMO', 'SPGI', 'UBER',
        'BX', 'CRM', 'AXP', 'SYK', 'PANW', 'PFE', 'MS', 'VRTX', 'BLK', 'INTC',
        'BKNG', 'MMC', 'TJX', 'RTX', 'LOW', 'AMAT', 'LRCX', 'CB', 'PGR', 'HON',
        'ELV', 'ADP', 'MDT', 'USB', 'C', 'SCHW', 'MU', 'PM', 'GILD', 'ADI',
        'KLAC', 'SNPS', 'CDNS', 'BSX', 'GD', 'DE', 'NEE', 'SO', 'HCA', 'CME',
        'ITW', 'NKE', 'ICE', 'DUK', 'WM', 'NOC', 'LMT', 'BMY', 'PLD', 'AON',
    ],
    // NASDAQ-100
    QQQ: [
        'NVDA', 'MSFT', 'AAPL', 'AMZN', 'META', 'GOOGL', 'GOOG', 'TSLA', 'AVGO', 'COST',
        'NFLX', 'AMD', 'ADBE', 'CSCO', 'QCOM', 'INTU', 'ISRG', 'ADP', 'BKNG', 'SNPS',
        'CDNS', 'VRTX', 'MU', 'LRCX', 'PANW', 'MELI', 'KLAC', 'ASML', 'ABNB', 'DDOG',
        'CRWD', 'TTD', 'DASH', 'TEAM', 'IDXX', 'FTNT', 'REGN', 'GILD', 'ADI', 'BIIB',
        'SBUX', 'PYPL', 'ILMN', 'MRNA', 'EA', 'KDP', 'PAYX', 'GEHC', 'LULU', 'ON',
        'MCHP', 'INTC', 'ODFL', 'FAST', 'NXPI', 'PCAR', 'MAR', 'CMCSA', 'PDD', 'ZS',
        'CTAS', 'ROST', 'MNST', 'WDAY', 'CTSH', 'DLTR', 'EBAY', 'ARM', 'AMAT', 'ANSS',
        'ORLY', 'CHTR', 'CDW', 'VRSK', 'CPRT', 'TTWO', 'AMGN', 'NVAX', 'EXPE', 'SIRI',
    ],
    // Dow Jones 30
    DIA: [
        'GS', 'UNH', 'MSFT', 'HD', 'CAT', 'SHW', 'AMGN', 'MCD', 'AXP', 'V',
        'JNJ', 'IBM', 'TRV', 'JPM', 'MMM', 'BA', 'WMT', 'CSCO', 'CVX', 'MRK',
        'CRM', 'HON', 'DIS', 'KO', 'AAPL', 'INTC', 'NKE', 'DOW', 'VZ', 'PG',
    ],
    // Russell 2000 (small caps - representative sample)
    IWM: [
        'SMAR', 'INSM', 'PRVA', 'MMSI', 'ENSG', 'MGNI', 'HIMS', 'LGND', 'CALX', 'AGIO',
        'PRCT', 'PTCT', 'HALO', 'OMCL', 'RVMD', 'DNLI', 'ACAD', 'NOVT', 'ITCI', 'KROS',
        'PCVX', 'KRYS', 'ALKT', 'IRTC', 'TGTX', 'FORM', 'CSWI', 'GKOS', 'CRNX', 'RMBS',
        'POWI', 'MGRC', 'HASI', 'TREX', 'GRBK', 'PRDO', 'WRBY', 'HAYW', 'NARI', 'VCEL',
        'IIPR', 'HSTM', 'COLL', 'UDMY', 'STEP', 'CRVL', 'OGS', 'FCFS', 'NSP', 'RDNT',
    ],
    // ARK Innovation
    ARKK: [
        'TSLA', 'ROKU', 'SPOT', 'COIN', 'HOOD', 'SQ', 'CRSP', 'PACB', 'RXRX', 'IOVA',
        'VEEV', 'TWOU', 'VCNX', 'BEAM', 'NTLA', 'UNH', 'PATH', 'EXAS', 'NFLX', 'ACMR',
        'CMPS', 'PRTA', 'FATE', 'NVTA', 'TNDM', 'AMRS', 'ARBK', 'TDC', 'RGEN', 'CDNA',
    ],
    // Technology Select
    XLK: [
        'NVDA', 'MSFT', 'AAPL', 'AVGO', 'ORCL', 'AMD', 'ADBE', 'CSCO', 'QCOM', 'TXN',
        'ACN', 'IBM', 'INTU', 'AMAT', 'LRCX', 'NOW', 'KLAC', 'PANW', 'ADI', 'MU',
        'HPE', 'CDNS', 'SNPS', 'KEYS', 'MPWR', 'MCHP', 'NTAP', 'STX', 'WDC', 'SWKS',
        'QRVO', 'AKAM', 'CTSH', 'CDW', 'FFIV', 'GEN', 'ZBRA', 'JNPR', 'VRSN', 'IT',
    ],
    // Consumer Discretionary Select
    XLY: [
        'AMZN', 'TSLA', 'HD', 'MCD', 'LOW', 'BKNG', 'NKE', 'SBUX', 'TJX', 'CMG',
        'ORLY', 'ABNB', 'ROST', 'LULU', 'DHI', 'PHM', 'LEN', 'GM', 'F', 'EBAY',
        'APTV', 'RL', 'TPR', 'PVH', 'HAS', 'MAT', 'MGM', 'LVS', 'WYNN', 'CZR',
        'DKNG', 'DRI', 'HLT', 'MAR', 'H', 'IHG', 'EXPE', 'TRIP', 'LYFT', 'UBER',
    ],
    // Communication Services
    XLC: [
        'META', 'GOOGL', 'GOOG', 'NFLX', 'CMCSA', 'DIS', 'T', 'VZ', 'TMUS', 'CHTR',
        'ATVI', 'EA', 'TTWO', 'PARA', 'WBD', 'FOX', 'FOXA', 'IPG', 'OMC', 'LYV',
        'MTCH', 'ZM', 'SNAP', 'PINS', 'RBLX', 'RDDT', 'NWSA', 'NWS', 'SIRI', 'LUMN',
    ],
    // Energy Select
    XLE: [
        'XOM', 'CVX', 'COP', 'EOG', 'SLB', 'MPC', 'PXD', 'PSX', 'VLO', 'OXY',
        'HAL', 'DVN', 'HES', 'BKR', 'FANG', 'MRO', 'APA', 'EQT', 'CTRA', 'OVV',
        'TPL', 'NOV', 'PBF', 'PAA', 'KMI', 'WMB', 'OKE', 'ET', 'EPD', 'ENB',
    ],
    // Industrials Select
    XLI: [
        'GE', 'CAT', 'RTX', 'HON', 'LMT', 'UPS', 'NOC', 'GD', 'BA', 'DE',
        'EMR', 'ETN', 'ITW', 'PH', 'ROK', 'FDX', 'CSX', 'NSC', 'UNP', 'WAB',
        'PWR', 'URI', 'MAS', 'SNA', 'DOV', 'AME', 'XYL', 'IEX', 'FAST', 'PCAR',
        'WM', 'RSG', 'CTAS', 'VRSK', 'CMI', 'CARR', 'OTIS', 'TT', 'JCI', 'IR',
    ],
    // Materials Select
    XLB: [
        'LIN', 'APD', 'ECL', 'SHW', 'FCX', 'NEM', 'CTVA', 'DD', 'PPG', 'NUE',
        'ALB', 'CF', 'MOS', 'FMC', 'CE', 'EMN', 'LYB', 'RPM', 'AVY', 'IP',
        'PKG', 'SEE', 'SON', 'WRK', 'AMCR', 'BALL', 'BMS', 'GPK', 'OI', 'TRU',
    ],
    // Financials Select
    XLF: [
        'BRK-B', 'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'BX', 'BLK',
        'SCHW', 'C', 'AXP', 'USB', 'CB', 'PGR', 'TFC', 'COF', 'MCO', 'SPGI',
        'ICE', 'CME', 'AON', 'MMC', 'WTW', 'AFL', 'TRV', 'MET', 'PRU', 'AIG',
        'HIG', 'LNC', 'GL', 'UNM', 'RGA', 'AIZ', 'FNF', 'FG', 'SFG', 'PFG',
    ],
    // Utilities Select
    XLU: [
        'NEE', 'SO', 'DUK', 'AEP', 'PCG', 'EXC', 'XEL', 'D', 'ED', 'ETR',
        'ES', 'PEG', 'WEC', 'EIX', 'AWK', 'AES', 'DTE', 'CMS', 'LNT', 'PPL',
        'SRE', 'NRG', 'CNP', 'EVRG', 'PNW', 'NI', 'OGE', 'SWX', 'POR', 'AVA',
    ],
    // Consumer Staples Select
    XLP: [
        'PG', 'KO', 'PEP', 'COST', 'WMT', 'PM', 'MO', 'MDLZ', 'CL', 'KMB',
        'GIS', 'HSY', 'K', 'CPB', 'CAG', 'HRL', 'SJM', 'MKC', 'CLX', 'CHD',
        'DG', 'DLTR', 'KR', 'ACI', 'SFM', 'GO', 'CASY', 'WMK', 'PFGC', 'CHEF',
    ],
    // Real Estate Select
    XLRE: [
        'PLD', 'AMT', 'EQIX', 'SPG', 'PSA', 'O', 'VICI', 'WELL', 'AVB', 'EQR',
        'VTR', 'PEAK', 'ARE', 'EXR', 'WY', 'IRM', 'DLR', 'CCI', 'SBAC', 'AMH',
        'MAA', 'UDR', 'CPT', 'ESS', 'ELS', 'SUI', 'UE', 'BRX', 'KIM', 'FRT',
    ],
    // Healthcare Select
    XLV: [
        'LLY', 'UNH', 'JNJ', 'ABBV', 'MRK', 'TMO', 'ABT', 'DHR', 'ISRG', 'BSX',
        'ELV', 'HCA', 'SYK', 'MDT', 'PFE', 'VRTX', 'AMGN', 'REGN', 'GILD', 'BMY',
        'CVS', 'ZTS', 'BIIB', 'IDXX', 'IQV', 'BDX', 'DGX', 'LH', 'RMD', 'EW',
        'HOLX', 'PODD', 'DXCM', 'SGEN', 'ILMN', 'MRNA', 'BNTX', 'NVAX', 'EXAS', 'MASI',
    ],
    // Semiconductors
    SMH: [
        'NVDA', 'TSM', 'AVGO', 'AMD', 'TXN', 'ASML', 'LRCX', 'AMAT', 'MU', 'KLAC',
        'SNPS', 'ADI', 'CDNS', 'MPWR', 'ONTO', 'MCHP', 'MRVL', 'WOLF', 'SWKS', 'QCOM',
        'QRVO', 'CRUS', 'FORM', 'ENTG', 'ACLS', 'COHU', 'RMBS', 'SMTC', 'DIOD', 'SLAB',
        'MTSI', 'AMBA', 'POWI', 'MXIM', 'NXPI', 'INTC', 'AMKR', 'KLIC', 'BESI', 'AEHR',
    ],
    // Oil & Gas Exploration
    XOP: [
        'COP', 'EOG', 'OXY', 'FANG', 'DVN', 'MRO', 'APA', 'HES', 'CTRA', 'OVV',
        'PR', 'MGY', 'MTDR', 'SM', 'CRGY', 'VTLE', 'BATL', 'CHRD', 'TALO', 'CPE',
    ],
    // Oil Services
    OIH: [
        'SLB', 'HAL', 'BKR', 'NOV', 'FTI', 'WTTR', 'NGAS', 'RES', 'OII', 'DNOW',
        'LBRT', 'PUMP', 'PARR', 'USWS', 'NINE', 'KLXE', 'PTEN', 'HP', 'NBR', 'AROC',
    ],
    // Metals & Mining
    XME: [
        'FCX', 'NEM', 'GOLD', 'NUE', 'STLD', 'AA', 'X', 'CLF', 'RS', 'CMC',
        'ATI', 'AMR', 'ARCH', 'HCC', 'CENX', 'KALU', 'CSTM', 'MP', 'UUUU', 'NRP',
    ],
    // Gold Miners
    GDX: [
        'NEM', 'GOLD', 'AEM', 'WPM', 'KGC', 'AGI', 'FNV', 'RGLD', 'HL', 'PAAS',
        'AG', 'EGO', 'CG', 'OR', 'EDV', 'DPM', 'MAG', 'SSRM', 'PVG', 'BTG',
    ],
    // Airlines
    JETS: [
        'DAL', 'UAL', 'LUV', 'AAL', 'JBLU', 'ALK', 'SAVE', 'HA', 'SKYW', 'MESA',
        'BA', 'EADSY', 'CAE', 'JOBY', 'ACHR', 'LILM', 'EVEX', 'AAR', 'ATSG', 'AAWW',
    ],
    // Clean Energy
    PBW: [
        'ENPH', 'FSLR', 'SEDG', 'BE', 'RUN', 'NOVA', 'ARRY', 'CSIQ', 'JKS', 'SPWR',
        'PLUG', 'FCEL', 'BLDP', 'STEM', 'GRIP', 'EVGO', 'CHPT', 'BLNK', 'TAN', 'ICLN',
    ],
    // Regional Banks
    KRE: [
        'FHN', 'RF', 'KEY', 'ZION', 'CMA', 'FNB', 'HBAN', 'MTB', 'WTFC', 'BOKF',
        'BPOP', 'SNV', 'FIBK', 'ASB', 'PACW', 'TCBI', 'WBS', 'IBOC', 'EWBC', 'CVBF',
        'HTLF', 'BANR', 'FCF', 'UMBF', 'CBTX', 'NBT', 'CFFI', 'CCBG', 'CTBI', 'OFG',
    ],
    // Insurance
    KIE: [
        'BRK-B', 'PGR', 'CB', 'TRV', 'HIG', 'AFL', 'MET', 'PRU', 'AIG', 'AIZ',
        'GL', 'UNM', 'RGA', 'FNF', 'PFG', 'LNC', 'CNO', 'ERIE', 'KMPR', 'SIGI',
    ],
    // Internet
    FDN: [
        'AMZN', 'META', 'GOOGL', 'GOOG', 'NFLX', 'EBAY', 'SNAP', 'PINS', 'LYFT', 'DASH',
        'ABNB', 'EXPE', 'TRIP', 'YELP', 'ETSY', 'CHWY', 'W', 'PRTS', 'GRUB', 'JMIA',
    ],
    // Software
    IGV: [
        'MSFT', 'ORCL', 'CRM', 'ADBE', 'INTU', 'NOW', 'PANW', 'WDAY', 'SNPS', 'CDNS',
        'FTNT', 'ZS', 'CRWD', 'DDOG', 'TEAM', 'HUBS', 'BILL', 'PCTY', 'PAYC', 'MDB',
        'NET', 'CFLT', 'ESTC', 'GTLB', 'PATH', 'ASAN', 'MNDY', 'SMAR', 'DT', 'IOT',
    ],
    // Retail
    XRT: [
        'TJX', 'HD', 'LOW', 'COST', 'TGT', 'WMT', 'AMZN', 'ROST', 'ORLY', 'DG',
        'DLTR', 'ULTA', 'ANF', 'AEO', 'GPS', 'URBN', 'FL', 'DSW', 'BOOT', 'BOOT',
        'BURL', 'FIVE', 'OLLI', 'BIG', 'BGFV', 'ACO', 'PRTY', 'EXPR', 'CHICO', 'CATO',
    ],
    // Homebuilders
    ITB: [
        'DHI', 'LEN', 'PHM', 'TOL', 'NVR', 'MDC', 'MHO', 'GRBK', 'BZH', 'LGIH',
        'SKY', 'CVCO', 'UCP', 'TMHC', 'STRS', 'KBHK', 'CCS', 'ASGN', 'FPRX', 'SSD',
    ],
    XHB: [
        'DHI', 'LEN', 'PHM', 'TOL', 'NVR', 'HD', 'LOW', 'WHR', 'MAS', 'AWI',
        'FBHS', 'TREX', 'LGIH', 'MDC', 'MHO', 'GRBK', 'BZH', 'SKY', 'CVCO', 'UCP',
    ],
    // Biotech
    IBB: [
        'AMGN', 'GILD', 'REGN', 'VRTX', 'BIIB', 'ALNY', 'SGEN', 'MRNA', 'ILMN', 'EXAS',
        'HALO', 'PCVX', 'KRYS', 'RVMD', 'DNLI', 'ACAD', 'NOVT', 'ITCI', 'KROS', 'CRNX',
        'BMRN', 'IONS', 'FOLD', 'ARWR', 'PTCT', 'PRCT', 'BLUE', 'FATE', 'CRSP', 'BEAM',
        'NTLA', 'EDIT', 'PGEN', 'IOVA', 'TGTX', 'AGEN', 'LGND', 'SRRK', 'KMDA', 'CLDX',
    ],
    XBI: [
        'MRNA', 'BIIB', 'REGN', 'VRTX', 'ALNY', 'RVMD', 'CRNX', 'PCVX', 'DNLI', 'KROS',
        'KRYS', 'ACAD', 'NOVT', 'ITCI', 'TGTX', 'HALO', 'PRCT', 'PTCT', 'BMRN', 'IONS',
        'ARWR', 'FOLD', 'BLUE', 'FATE', 'CRSP', 'BEAM', 'NTLA', 'EDIT', 'CLDX', 'SRRK',
    ],
    // Solar
    TAN: [
        'ENPH', 'FSLR', 'SEDG', 'RUN', 'NOVA', 'ARRY', 'CSIQ', 'JKS', 'SPWR', 'MAXN',
        'SHLS', 'POWI', 'SUNW', 'STEM', 'NEP', 'CWEN', 'AY', 'TERP', 'BEP', 'CLNR',
    ],
}

// Cache the results
const holdingsCache = new Map<string, { symbols: string[]; ts: number }>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const etf = (searchParams.get('etf') || '').toUpperCase().trim()
    const limitParam = parseInt(searchParams.get('limit') || '10')
    const limit = Math.min(1000, Math.max(1, isNaN(limitParam) ? 10 : limitParam))

    if (!etf) {
        return NextResponse.json({ error: 'Missing etf parameter' }, { status: 400 })
    }

    const cacheKey = `${etf}-${limit}`
    const cached = holdingsCache.get(cacheKey)
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
        return NextResponse.json({ symbols: cached.symbols, etf, source: 'cache' })
    }

    const holdings = ETF_HOLDINGS[etf]
    if (!holdings) {
        // Return a helpful error listing supported ETFs
        return NextResponse.json(
            {
                error: `ETF "${etf}" holdings not available. Supported ETFs: ${Object.keys(ETF_HOLDINGS).join(', ')}`,
                supported: Object.keys(ETF_HOLDINGS),
            },
            { status: 404 }
        )
    }

    const symbols = holdings.slice(0, limit)
    holdingsCache.set(cacheKey, { symbols, ts: Date.now() })

    return NextResponse.json({ symbols, etf, count: symbols.length, source: 'static' })
}
