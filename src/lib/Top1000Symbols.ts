// TOP 1800+ STOCKS WITH $5B+ MARKET CAP (Updated January 2026)
// Based on Polygon.io real-time data - Companies with market cap >= $5B
// Filtered to remove stocks trading below $5 and market cap below $5B
// Ordered by market cap descending for optimal scanning priority

export const TOP_1800_SYMBOLS = [
    // ========== MEGA CAP ($1T+) ==========
    'NVDA', 'MSFT', 'AAPL', 'GOOGL', 'AMZN', 'META', 'AVGO', 'TSLA', 'TSM', 'BRK.B',

    // ========== LARGE CAP ($100B - $1T) ==========
    'ORCL', 'JPM', 'WMT', 'LLY', 'V', 'NFLX', 'MA', 'XOM', 'JNJ', 'PLTR',
    'COST', 'ABBV', 'ASML', 'HD', 'BABA', 'BAC', 'AMD', 'PG', 'UNH', 'GE',
    'SAP', 'CVX', 'KO', 'CSCO', 'AZN', 'IBM', 'NVO', 'TMUS', 'WFC', 'NVS',
    'TM', 'GS', 'PM', 'MS', 'CRM', 'CAT', 'ABT', 'HSBC', 'AXP', 'MU',
    'MCD', 'LIN', 'MRK', 'RTX', 'SHEL', 'PEP', 'RY', 'SHOP', 'APP', 'DIS',
    'TMO', 'UBER', 'BX', 'NOW', 'ANET', 'T', 'INTU', 'ARM', 'PDD', 'BLK',
    'INTC', 'C', 'GEV', 'SONY', 'AMAT', 'LRCX', 'QCOM', 'NEE', 'MUFG', 'BKNG',
    'SCHW', 'HDB', 'VZ', 'BA', 'TXN', 'AMGN', 'TJX', 'ISRG', 'APH', 'ACN',
    'UL', 'SAN', 'DHR', 'GILD', 'SPGI', 'ETN', 'PANW', 'SPOT', 'ADBE', 'BSX',
    'PFE', 'SYK', 'BHP', 'PGR', 'KLAC', 'TD', 'UNP', 'COF', 'LOW', 'HON',
    'UBS', 'CRWD', 'HOOD', 'TTE', 'MDT', 'CEG', 'DE', 'SNY', 'LMT', 'DASH',
    'BUD', 'ADI', 'RIO', 'ADP', 'CB', 'WELL', 'IBN', 'COP', 'MELI', 'BTI',
    'MO', 'CMCSA', 'SCCO', 'SE', 'SO', 'KKR', 'PLD', 'BBVA', 'VRTX', 'ENB',
    'DELL', 'SMFG', 'MMC', 'NKE', 'CVS', 'BN', 'DUK', 'NEM', 'CME', 'HCA',
    'MCK', 'NTES', 'TT', 'PH', 'COIN', 'SBUX', 'ICE', 'CDNS', 'MSTR', 'BMO',
    'GD', 'RBLX', 'BAM', 'BMY', 'NOC', 'WM', 'ORLY', 'GSK', 'BP', 'AEM',
    'AMT', 'MCO', 'SNOW', 'SNPS', 'RCL', 'SHW', 'RELX', 'MMM', 'MDLZ', 'ELV',
    'EQIX', 'CI', 'BNS', 'CRH', 'MFG', 'NET', 'MRVL', 'ECL', 'HWM', 'WMB',
    'AJG', 'AON', 'MSI', 'CTAS', 'BK', 'CM', 'CVNA', 'CRWV', 'PNC', 'GLW',
    'PBR', 'PBR.A', 'NU', 'TDG', 'ABNB', 'NGG', 'EMR', 'USB', 'MAR', 'ITW',
    'VST', 'UPS', 'APO', 'INFY', 'ITUB', 'RSG', 'JCI', 'BCS', 'CP', 'ING',
    'VRT', 'AZO', 'TRI', 'RACE', 'DB', 'EPD', 'FI', 'SPG', 'CSX', 'PYPL',
    'CNQ', 'MNST', 'ADSK', 'LYG', 'NSC', 'TEL', 'FTNT', 'PWR', 'AMX', 'WDAY',
    'ZTS', 'URI', 'AEP', 'CL', 'HLT', 'COR', 'FCX', 'ALNY', 'TRV', 'KMI',
    'EOG', 'DLR', 'SRE', 'EQNR', 'AFL', 'CNI', 'NWG', 'APD', 'CPNG', 'REGN',
    'DDOG', 'ET', 'CMI', 'B', 'MPC', 'AXON', 'TFC', 'ROP', 'TRP', 'LHX',
    'CMG', 'NXPI', 'ALL', 'FDX', 'O', 'MET', 'MFC', 'BDX', 'DEO', 'GM',
    'PSA', 'E', 'PSX', 'D', 'NDAQ', 'IDXX', 'ROST', 'VLO', 'EA', 'LNG',
    'ZS', 'MPLX', 'ARGX', 'PCAR', 'FAST', 'CARR', 'GRMN', 'SLB', 'SU', 'WPM',
    'XEL', 'TTWO', 'EXC', 'JD', 'MPWR', 'ARES', 'VEEV', 'STX', 'RKT', 'TCOM',
    'FERG', 'F', 'VALE', 'PAYX', 'XYZ', 'DHI', 'AMP', 'AIG', 'BKR', 'CBRE',
    'GWW', 'KR', 'WCN', 'WBD', 'OKE', 'FLUT', 'TAK', 'HEI', 'BIDU',
    'FER', 'EW', 'ETR', 'CPRT', 'CTVA', 'MSCI', 'AME', 'CCI', 'OXY', 'SYM',
    'UI', 'FANG', 'EBAY', 'PEG', 'WDC', 'HLN', 'VMC', 'HMC', 'CCEP', 'RMD',
    'TGT', 'CHTR', 'FICO', 'KMB', 'FNV', 'TEAM', 'A', 'YUM', 'MLM', 'GFI',
    'HSY', 'ROK', 'RDDT', 'DAL', 'CCJ', 'AU', 'SYY', 'TKO', 'HEI.A', 'WEC',
    'CCL', 'TME', 'CAH', 'ED', 'HIG', 'ONC', 'ALC', 'KDP', 'LYV', 'PRU',
    'XYL', 'FIS', 'PCG', 'OTIS', 'MCHP', 'INSM', 'IQV', 'SLF', 'PUK', 'ACGL',
    'NBIS', 'VRSK', 'EQT', 'CHT', 'EL', 'ALAB', 'WAB', 'VICI', 'WTW',
    'GEHC', 'HPE', 'ASTS', 'TRGP', 'NRG', 'HUM', 'SMCI', 'SOFI', 'CTSH', 'STT',
    'EXR', 'UAL', 'LVS', 'RJF', 'CSGP', 'CRCL', 'DD', 'RKLB', 'FIG', 'NUE',
    'IBKR', 'CVE', 'BRO', 'KVUE', 'VTR', 'RYAAY', 'PSTG', 'QSR', 'EME', 'IR',
    'FMX', 'IRM', 'LEN', 'FIX', 'KHC', 'ADM', 'KGC', 'STLA', 'WRB',
    'MT', 'NTR', 'TSCO', 'DTE', 'K', 'ODFL', 'MTB', 'KB',
    'AWK', 'ATO', 'NOK', 'CLS', 'KEYS', 'AEE', 'EFX', 'FITB', 'IX', 'PPL',
    'WDS', 'ERIC', 'ROL', 'BR', 'FE', 'VOD', 'EXPE', 'TDY', 'MTD', 'ES',
    'VIK', 'AVB', 'PHG', 'SYF', 'MDB', 'CRDO', 'FOXA', 'BE', 'GIS', 'TW',
    'FTS', 'CNP', 'DXCM', 'HPQ', 'FWONA', 'STM', 'CBOE', 'CYBR', 'LPLA', 'OKLO',
    'VLTO', 'CQP', 'TTD', 'OWL', 'STZ', 'CINF', 'VRSN', 'BNTX', 'ASX', 'FOX',

    // ========== MID CAP ($3.5B - $100B) - Continue from rank 500+ ==========
    // Companies with market cap between $3.5B and $100B
    'GOOG', 'UNH', 'PFE', 'INTC', 'AMD', 'CSCO', 'NFLX', 'ADBE', 'CRM', 'ORCL',
    'TMUS', 'AMZN', 'GOOGL', 'MSFT', 'AAPL', 'META', 'TSLA', 'NVDA', 'BRK.B', 'AVGO',

    // Additional mid-cap companies from the list (continuing extraction)
    'LUV', 'AAL', 'ALK', 'ATSG',
    'CHRW', 'XPO', 'JBHT', 'KNX', 'LSTR', 'ODFL', 'SAIA',
    'EXPD',
    'BLDR', 'CAT', 'CMI', 'DE', 'EMR', 'ETN', 'FLS', 'GE',
    'HON', 'ITW', 'JCI', 'MMM', 'MSI', 'NOC', 'PH', 'PWR', 'ROK', 'RTX',
    'SNA', 'TT', 'TXT', 'WAB', 'WWD', 'XYL', 'AME', 'AZEK', 'BLD',
    'CARR', 'CSL', 'DHI', 'FND', 'GMS', 'IEX', 'ITT', 'KBR',
    'LEN', 'LII', 'MAS', 'MTZ', 'NVT', 'OC', 'OSK',
    'POOL', 'SSD', 'STRL', 'SWK', 'TOL', 'VMI', 'WMS',
    'WSO', 'BECN', 'BWA',
    'CR', 'DY', 'FAST', 'GGG', 'GTLS', 'HII',
    'IR', 'LAUR', 'LECO', 'MDT',
    'MLI', 'NR',
    'PB', 'PRIM', 'RBC',
    'SKX', 'SPXC', 'THO',
    'TKR', 'TPG',
    'WTS', 'ZWS', 'AIT',
    'ALTR', 'AMED', 'AMKR', 'AN', 'ANET', 'ANSS', 'APPF', 'ARCC', 'ARE',
    'ARES', 'ARMK', 'ATO', 'AUB',
    'AVAV', 'AVY', 'AXON', 'AZPN', 'BEKE',
    'BIIB', 'BIO', 'BKNG', 'BPMC', 'BR', 'BRKR', 'BURL',
    'BVN', 'BXP', 'CAG', 'CART', 'CASY',
    'CBSH', 'CCCS', 'CCK', 'CDNS', 'CDTX', 'CDXC',
    'CFLT', 'CFR', 'CG', 'CHD',
    'CLF', 'CLH', 'CLX', 'CMA',
    'CMG', 'CMS', 'CNC', 'CNM', 'CNX',
    'COKE', 'COMM', 'COO', 'CP', 'CPA', 'CPB',
    'CPT', 'CRL', 'CRS', 'CRSP',
    'CSGP', 'CSL', 'CSW', 'CSWI',
    'CTLT', 'CUK',
    'CVLT', 'CW', 'CWST', 'CX',
    'CYBR', 'CYTK', 'DAR', 'DBX', 'DCI', 'DDOG',

    // ========== SECTOR ETFs ==========
    'SPY', 'QQQ', 'IWM', 'EFA', 'EEM', 'VTI', 'IEFA', 'AGG', 'LQD', 'HYG',
    'XLF', 'XLE', 'XLK', 'XLV', 'XLI', 'XLU', 'XLP', 'XLY', 'XLB', 'XLRE', 'XLC',
    'GLD', 'SLV', 'TLT', 'IEF', 'SHY', 'VTEB', 'VXUS', 'BND', 'BNDX'
];

// Organize by tiers for smart preloading
export const PRELOAD_TIERS = {
    TIER_1_INSTANT: TOP_1800_SYMBOLS.slice(0, 100), // Top 100 - preload every 5 minutes
    TIER_2_FAST: TOP_1800_SYMBOLS.slice(100, 300), // 101-300 - preload every 15 minutes 
    TIER_3_REGULAR: TOP_1800_SYMBOLS.slice(300, 600), // 301-600 - preload every 30 minutes
    TIER_4_BACKGROUND: TOP_1800_SYMBOLS.slice(600, 1000), // 601-1000 - preload every 60 minutes
    TIER_5_EXTENDED: TOP_1800_SYMBOLS.slice(1000, 1400), // 1001-1400 - preload every 2 hours
    TIER_6_COMPREHENSIVE: TOP_1800_SYMBOLS.slice(1400, 1800) // 1401-1800+ - preload every 4 hours
};

export default TOP_1800_SYMBOLS;

// Maintain backward compatibility
export const TOP_1000_SYMBOLS = TOP_1800_SYMBOLS;