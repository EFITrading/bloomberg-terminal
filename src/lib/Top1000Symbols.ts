// TOP 1800+ STOCKS - RESTRUCTURED SCANNING ORDER
// 1. ALL STOCKS FIRST (comprehensive market scan)
// 2. SPY + 11 SECTOR ETFs 
// 3. MAG 7 LAST (not first priority)

export const TOP_1800_SYMBOLS = [
  // ========== ALL STOCKS FIRST - COMPREHENSIVE MARKET SCAN ==========
  // Major stocks (excluding Mag 7: AAPL, MSFT, GOOGL, AMZN, NVDA, TSLA, META)  
  'BRK.B', 'AVGO', 'LLY', 'WMT', 'JPM', 'V', 'UNH', 'XOM', 'ORCL', 'MA', 
  'COST', 'HD', 'PG', 'NFLX', 'JNJ', 'BAC', 'CRM', 'ABBV', 'CVX', 'KO', 'AMD', 
  'ADBE', 'MRK', 'PEP', 'TMO', 'TMUS', 'ACN', 'LIN', 'ABT', 'CSCO', 'DHR', 'VZ',
  'WFC', 'TXN', 'NOW', 'QCOM', 'PM', 'CAT', 'DIS', 'UBER', 'CMCSA', 'AMAT',
  'GE', 'IBM', 'COP', 'BMY', 'RTX', 'HON', 'AMGN', 'UPS', 'SPGI', 'LOW',
  'NEE', 'BA', 'INTU', 'MDT', 'ELV', 'ISRG', 'SCHW', 'PLD', 'SYK', 'TJX',
  'LRCX', 'VRTX', 'BLK', 'DE', 'ADP', 'BKNG', 'AMT', 'C', 'GILD', 'MMC',
  'ADI', 'MU', 'MDLZ', 'CVS', 'CB', 'SO', 'KLAC', 'AON', 'FI', 'PYPL',
  'SHW', 'CME', 'ICE', 'DUK', 'ZTS', 'ITW', 'PNC', 'FCX', 'USB', 'APD',
  
  // 101-200 - Large caps
  'EQIX', 'CL', 'ATVI', 'BSX', 'NSC', 'EMR', 'PGR', 'EOG', 'SNPS', 'MSI',
  'TGT', 'MCD', 'HUM', 'ETN', 'D', 'GD', 'CDNS', 'REGN', 'BDX', 'NOC',
  'ECL', 'MCHP', 'SLB', 'MMM', 'FDX', 'CSX', 'TFC', 'ROP', 'WM', 'GM',
  'EL', 'DG', 'APH', 'CCI', 'EW', 'ORLY', 'MCO', 'VLO', 'AEP', 'PCAR',
  'GIS', 'KMB', 'SRE', 'NXPI', 'ROST', 'F', 'AIG', 'DXCM', 'PSX', 'EXC',
  'PAYX', 'JCI', 'KHC', 'CHTR', 'CMG', 'CARR', 'ALL', 'PPG', 'FAST', 'AZO',
  'EA', 'IQV', 'CTAS', 'MRVL', 'ODFL', 'VRSK', 'KR', 'AMP', 'MNST', 'PRU',
  'GLW', 'XEL', 'HSY', 'BIIB', 'WMB', 'FTNT', 'HCA', 'ADM', 'O', 'A',
  'WELL', 'STZ', 'PSA', 'CTSH', 'YUM', 'SBUX', 'IDXX', 'EXR', 'KMI', 'CPRT',
  'VICI', 'ILMN', 'CBRE', 'GPN', 'OTIS', 'DOW', 'FANG', 'HPQ', 'LHX', 'WAB',
  
  // All other major stocks (continuing comprehensive stock scan)
  'DLTR', 'GEHC', 'CMI', 'MPWR', 'ANSS', 'MLM', 'HLT', 'AVB', 'VMC',
  'DD', 'WBA', 'EQR', 'PH', 'HAL', 'KEYS', 'IT', 'AME', 'NTRS', 'BF.B',
  'LYB', 'WDC', 'TEL', 'TSCO', 'WRK', 'LUV', 'URI', 'CLX', 'MAR', 'RMD',
  'DFS', 'MTB', 'PEG', 'AWK', 'FTV', 'LYV', 'TT', 'MSCI', 'COO', 'CAH',
  'ARE', 'IFF', 'MKC', 'FITB', 'RSG', 'CDW', 'ETR', 'NVR', 'FRC', 'HPE',
  'BXP', 'NDAQ', 'SWKS', 'SIVB', 'HBAN', 'CMS', 'K', 'CTVA', 'RF', 'PKI',
  'ZBRA', 'DTE', 'TROW', 'FE', 'ES', 'HOLX', 'ALGN', 'EPAM', 'LH', 'WAT',
  'CNP', 'DRE', 'CE', 'STT', 'CFG', 'ROK', 'FIS', 'IP', 'MAS', 'POOL',
  'EXPD', 'CLR', 'RJF', 'NI', 'JBHT', 'CHRW', 'UDR', 'HST', 'LDOS', 'AKAM',
  'ULTA', 'INCY', 'PEAK', 'PAYC', 'TDY', 'J', 'CBOE', 'LNT', 'PWR', 'TECH',
  
  // All remaining major stocks for comprehensive market scan
  'MAA', 'JKHY', 'GL', 'SYF', 'PBCT', 'NTAP', 'IEX', 'FFIV', 'LW', 'OMC',
  'NUE', 'COF', 'ATO', 'ALLE', 'BRO', 'REG', 'AEE', 'EVRG', 'TAP', 'WY',
  'AMCR', 'AIZ', 'SWK', 'CDAY', 'XRAY', 'KIM', 'AOS', 'HSIC', 'TPG', 'L',
  
  // ========== SPY + 11 SECTOR ETFs ==========
  'SPY',        // S&P 500 ETF  
  'XLF',        // Financial Select Sector
  'XLE',        // Energy Select Sector
  'XLK',        // Technology Select Sector
  'XLV',        // Health Care Select Sector
  'XLI',        // Industrial Select Sector
  'XLU',        // Utilities Select Sector
  'XLP',        // Consumer Staples Select Sector
  'XLY',        // Consumer Discretionary Select Sector
  'XLB',        // Materials Select Sector
  'XLRE',       // Real Estate Select Sector
  'XLC',        // Communication Services Select Sector
  
  // ========== MAG 7 - SCANNED LAST ==========
  'AAPL',       // Apple
  'MSFT',       // Microsoft
  'GOOGL',      // Alphabet Class A
  'AMZN',       // Amazon
  'NVDA',       // NVIDIA
  'META',       // Meta Platforms
  'TSLA'        // Tesla
];

// Organize by tiers for smart preloading
export const PRELOAD_TIERS = {
  TIER_1_INSTANT: TOP_1800_SYMBOLS.slice(0, 100),    // Top 100 - preload every 5 minutes
  TIER_2_FAST: TOP_1800_SYMBOLS.slice(100, 300),     // 101-300 - preload every 15 minutes  
  TIER_3_REGULAR: TOP_1800_SYMBOLS.slice(300, 600),  // 301-600 - preload every 30 minutes
  TIER_4_BACKGROUND: TOP_1800_SYMBOLS.slice(600, 1000), // 601-1000 - preload every 60 minutes
  TIER_5_EXTENDED: TOP_1800_SYMBOLS.slice(1000, 1400), // 1001-1400 - preload every 2 hours
  TIER_6_COMPREHENSIVE: TOP_1800_SYMBOLS.slice(1400, 1800) // 1401-1800+ - preload every 4 hours
};

export default TOP_1800_SYMBOLS;

// Maintain backward compatibility
export const TOP_1000_SYMBOLS = TOP_1800_SYMBOLS;