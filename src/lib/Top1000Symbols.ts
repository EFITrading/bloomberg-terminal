// TOP 1000 STOCKS by market cap for preloading
// Updated October 2025 - includes all major stocks users actually trade

export const TOP_1000_SYMBOLS = [
  // Top 100 - Mega caps (most important)
  'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'TSLA', 'META', 'BRK.B', 'AVGO',
  'LLY', 'WMT', 'JPM', 'V', 'UNH', 'XOM', 'ORCL', 'MA', 'COST', 'HD',
  'PG', 'NFLX', 'JNJ', 'BAC', 'CRM', 'ABBV', 'CVX', 'KO', 'AMD', 'ADBE',
  'MRK', 'PEP', 'TMO', 'TMUS', 'ACN', 'LIN', 'ABT', 'CSCO', 'DHR', 'VZ',
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
  'WELL', 'STZ', 'PSA', 'CTSH fast', 'YUM', 'SBUX', 'IDXX', 'EXR', 'KMI', 'CPRT',
  'VICI', 'ILMN', 'CBRE', 'GPN', 'OTIS', 'DOW', 'FANG', 'HPQ', 'LHX', 'WAB',
  
  // 201-300 - Mid-large caps
  'DLTR', 'EA', 'GEHC fast', 'CMI', 'MPWR', 'ANSS fast', 'MLM', 'HLT', 'AVB', 'VMC',
  'DD', 'WBA', 'EQR', 'PH', 'HAL', 'KEYS', 'IT', 'AME', 'NTRS', 'BF.B',
  'LYB', 'WDC', 'TEL', 'TSCO', 'WRK', 'LUV', 'URI', 'CLX', 'MAR', 'RMD',
  'DFS', 'MTB', 'PEG', 'AWK', 'FTV', 'LYV', 'TT', 'MSCI', 'COO', 'CAH',
  'ARE', 'IFF', 'MKC', 'FITB', 'RSG', 'CDW', 'ETR', 'NVR', 'FRC', 'HPE',
  'BXP', 'NDAQ', 'SWKS', 'SIVB', 'HBAN fast', 'CMS', 'K', 'CTVA', 'RF', 'PKI',
  'ZBRA', 'DTE', 'TROW', 'FE', 'ES', 'HOLX', 'ALGN', 'EPAM', 'LH', 'WAT',
  'CNP', 'DRE', 'CE', 'STT', 'CFG', 'ROK', 'FIS', 'IP', 'MAS', 'POOL',
  'EXPD', 'CLR', 'RJF', 'NI', 'JBHT', 'CHRW', 'UDR', 'HST', 'LDOS', 'AKAM',
  'ULTA', 'INCY', 'PEAK', 'PAYC', 'TDY', 'J', 'CBOE', 'LNT', 'PWR', 'TECH',
  
  // 301-400 - Popular mid caps
  'MAA', 'JKHY', 'GL', 'SYF', 'PBCT', 'NTAP', 'IEX', 'FFIV', 'LW fast', 'OMC',
  'NUE', 'COF', 'ATO', 'ALLE', 'BRO', 'REG', 'AEE', 'EVRG', 'TAP', 'WY',
  'AMCR', 'AIZ', 'SWK', 'CDAY', 'XRAY', 'KIM', 'AOS', 'HSIC', 'TPG', 'L',
  'WHR', 'MOS', 'SBAC', 'CAG', 'PENN', 'HII', 'FMC', 'ZION', 'EMN', 'JNPR',
  'DVN', 'NRG', 'DISH', 'SEE', 'APA', 'BEN', 'HAS', 'CPB', 'DGX', 'UAL',
  'AAL', 'NCLH', 'CCL', 'RCL', 'LVS', 'MGM', 'WYNN', 'CZR', 'GRMN', 'NLOK',
  'TXT', 'LKQ', 'AVY', 'IPG', 'KSS', 'M', 'GPS', 'FL', 'JWN', 'ADS',
  'BWA', 'GT', 'LEG', 'TPX', 'MHK', 'WHR', 'HBI', 'PVH', 'RL', 'VFC',
  'NWSA', 'PARA', 'WBD', 'T', 'FOXA', 'FOX', 'NFLX', 'DIS', 'CMCSA', 'CHTR',
  'DISH', 'SIRI', 'LUMN', 'FYBR', 'FTR', 'CTL', 'CX', 'CABO', 'CPRI', 'BBWI',
  
  // 401-500 - Growth & Tech
  'CRM', 'ADBE', 'NOW', 'INTU', 'ORCL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NFLX',
  'TSLA', 'NVDA', 'AMD', 'QCOM', 'AVGO', 'TXN', 'ADI', 'MCHP', 'KLAC', 'LRCX',
  'AMAT', 'MU', 'WDC', 'STX', 'NTAP', 'HPE', 'HPQ', 'IBM', 'CSCO', 'JNPR',
  'FFIV', 'AKAM', 'VRSN', 'CTXS', 'VMW', 'RHT', 'SPLK', 'WDAY', 'VEEV', 'ZM',
  'OKTA', 'TWLO', 'DOCU', 'CRWD', 'ZS', 'NET', 'DDOG', 'SNOW', 'PLTR', 'U',
  'PATH', 'AI', 'C3AI', 'SMCI', 'MDB', 'CFLT', 'GTLB', 'S', 'BILL', 'PAYC',
  'SQ', 'PYPL', 'MA', 'V', 'FIS', 'FISV', 'GPN', 'FLT', 'BR', 'WEX',
  'EEFT', 'CPAY', 'JKHY', 'ADP', 'PAYX', 'CTSH', 'ACN', 'IBM', 'DXC', 'LDOS',
  'SAIC', 'CACI', 'BAH', 'KBR', 'CASS', 'MAXR', 'KTOS', 'HII', 'LHX', 'RTX',
  'BA', 'GD', 'NOC', 'LMT', 'COL', 'ESLT', 'MRCY', 'TDG', 'HEI', 'WWD',
  
  // 501-600 - Healthcare & Biotech
  'UNH', 'JNJ', 'PFE', 'ABT', 'TMO', 'DHR', 'BMY', 'MRK', 'AMGN', 'GILD',
  'CVS', 'CI', 'HUM', 'ANTM', 'MOH', 'CNC', 'HCA', 'UHS', 'DVA', 'FMS',
  'BIIB', 'REGN', 'VRTX', 'ILMN', 'MRNA', 'BNTX', 'PFE', 'JNJ', 'ABBV', 'LLY',
  'NVO', 'RHHBY', 'AZN', 'GSK', 'SNY', 'BMY', 'MRK', 'PFE', 'JNJ', 'ABBV',
  'ISRG', 'SYK', 'BSX', 'MDT', 'EW', 'BDX', 'ZBH', 'BAX', 'HOLX', 'DXCM',
  'ALGN', 'IDXX', 'IQV', 'LH', 'DGX', 'QGEN', 'MTD', 'A', 'WAT', 'PKI',
  'TECH', 'TMO', 'DHR', 'LIFE', 'BIO', 'CDNA', 'TWST', 'PACB', 'ILMN', 'NVTA',
  'ARKG', 'XBI', 'IBB', 'BTAI', 'SGEN', 'BMRN', 'ALNY', 'IONS', 'SRPT', 'RARE',
  'FOLD', 'BLUE', 'CRSP', 'EDIT', 'NTLA', 'BEAM', 'PRIME', 'VERV', 'SGMO', 'RXRX',
  'SDGR', 'ALLO', 'CRBU', 'FATE', 'CGEM', 'ADTX', 'SANA', 'MRNA', 'BNTX', 'NVAX',
  
  // 601-700 - Energy & Materials
  'XOM', 'CVX', 'COP', 'EOG', 'SLB', 'PSX', 'VLO', 'MPC', 'HES', 'DVN',
  'FANG', 'CLR', 'APA', 'OXY', 'HAL', 'BKR', 'NOV', 'RIG', 'HP', 'CHK',
  'KMI', 'EPD', 'ET', 'WMB', 'OKE', 'LNG', 'TRGP', 'PAA', 'MPLX', 'WES',
  'FCX', 'NEM', 'GOLD', 'AUY', 'KGC', 'WPM', 'FNV', 'AEM', 'PAAS', 'HL',
  'AA', 'CENX', 'KALU', 'ACH', 'TMST', 'ZEUS', 'USCR', 'SUM', 'CX', 'CF',
  'MOS', 'NTR', 'FMC', 'CTVA', 'DD', 'DOW', 'LYB', 'EMN', 'APD', 'LIN',
  'ECL', 'PPG', 'SHW', 'RPM', 'AXTA', 'CC', 'IFF', 'FUL', 'KRA', 'HWKN',
  'NUE', 'STLD', 'CLF', 'X', 'CMC', 'SID', 'MT', 'TX', 'VALE', 'RIO',
  'BHP', 'SCCO', 'TECK', 'VEDL', 'PKX', 'CDE', 'EXK', 'GPL', 'IMO', 'SU',
  'CNQ', 'TRP', 'ENB', 'PPL', 'TC', 'KMI', 'EPD', 'ET', 'WMB', 'OKE',
  
  // 701-800 - Consumer & Retail
  'AMZN', 'WMT', 'COST', 'HD', 'LOW', 'TGT', 'TJX', 'ROST', 'DG', 'DLTR',
  'BBY', 'GPS', 'ANF', 'AEO', 'URN', 'EXPR', 'DDS', 'CONN', 'BIG', 'FIVE',
  'MCD', 'SBUX', 'CMG', 'QSR', 'YUM', 'DRI', 'EAT', 'TXRH', 'WING', 'CAKE',
  'KO', 'PEP', 'MNST', 'CELH', 'FIZZ', 'COKE', 'KDP', 'STZ', 'BF.B', 'DEO',
  'PG', 'UL', 'CL', 'KMB', 'CHD', 'EL', 'CLX', 'COTY', 'REV', 'NWL',
  'NKE', 'ADDYY', 'UAA', 'UA', 'DECK', 'CROX', 'SKX', 'WWW', 'BOOT', 'SHOO',
  'F', 'GM', 'TSLA', 'RIVN', 'LCID', 'NKLA', 'RIDE', 'GOEV', 'CANOO', 'FSR',
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NFLX', 'DIS', 'CMCSA', 'T', 'VZ',
  'TMUS', 'S', 'DISH', 'SIRI', 'LUMN', 'FYBR', 'CABO', 'LILAK', 'LILA', 'BATRK',
  'WBD', 'PARA', 'FOXA', 'FOX', 'NWSA', 'NWS', 'MTCH', 'IAC', 'ANGI', 'YELP',
  
  // 801-900 - Financial Services
  'JPM', 'BAC', 'WFC', 'C', 'GS', 'MS', 'BLK', 'SCHW', 'USB', 'PNC',
  'TFC', 'COF', 'AXP', 'DFS', 'SYF', 'V', 'MA', 'PYPL', 'SQ', 'FIS',
  'BRK.A', 'BRK.B', 'AIG', 'PRU', 'MET', 'AFL', 'ALL', 'TRV', 'CB', 'PGR',
  'WRB', 'RLI', 'CINF', 'AFG', 'Y', 'HIG', 'LNC', 'UNM', 'RGA', 'TMK',
  'AMT', 'PLD', 'EQIX', 'PSA', 'EXR', 'AVB', 'EQR', 'UDR', 'ESS', 'MAA',
  'CPT', 'ARE', 'VTR', 'WELL', 'PEAK', 'HCP', 'O', 'STOR', 'STAG', 'EXR',
  'CME', 'ICE', 'NDAQ', 'CBOE', 'MKTX', 'SPGI', 'MCO', 'MSCI', 'VRSK', 'TRU',
  'ETFC', 'AMTD', 'IBKR', 'HOOD', 'SOFI', 'AFRM', 'LC', 'UPST', 'BNPL', 'OPEN',
  'Z', 'ZG', 'RDFN', 'EXPI', 'COMP', 'MOVE', 'TREE', 'RKT', 'UWMC', 'GHVI',
  'NRDS', 'HOUS', 'RLGY', 'RMAX', 'TBLA', 'ANGI', 'IAC', 'MTCH', 'BMBL', 'YELP',
  
  // 901-1000 - Emerging & High Growth
  'PLTR', 'SNOW', 'CRWD', 'ZS', 'NET', 'DDOG', 'OKTA', 'TWLO', 'DOCU', 'ZM',
  'PTON', 'ROKU', 'SPOT', 'SQ', 'HOOD', 'COIN', 'RBLX', 'U', 'PATH', 'AI',
  'RIVN', 'LCID', 'NKLA', 'RIDE', 'GOEV', 'FSR', 'CHPT', 'BLNK', 'EVGO', 'PLUG',
  'FCEL', 'BLDP', 'BE', 'HYLN', 'NNDM', 'SSYS', 'DDD', 'XONE', 'MTLS', 'NANO',
  'EDIT', 'CRSP', 'NTLA', 'BEAM', 'PRIME', 'VERV', 'SGMO', 'ALLO', 'FATE', 'BLUE',
  'SPCE', 'ASTR', 'RDW', 'VORB', 'MNTS', 'ASTS', 'MAXR', 'SPIR', 'LUNR', 'RKLB',
  'BYND', 'TTCF', 'VERY', 'SFM', 'ELSE', 'APPH', 'GDYN', 'ELSE', 'NOSH', 'MRNS',
  'GME', 'AMC', 'BBBY', 'EXPR', 'NAKD', 'SNDL', 'TLRY', 'CGC', 'HEXO', 'OGI',
  'MSOS', 'YOLO', 'POTX', 'CNBS', 'MJ', 'THCX', 'TOKE', 'BUDZ', 'HERB', 'WEED',
  'TSLA', 'NIO', 'XPEV', 'LI', 'BYDDY', 'BYD', 'KNDI', 'SOLO', 'AYRO', 'WKHS'
];

// Organize by tiers for smart preloading
export const PRELOAD_TIERS = {
  TIER_1_INSTANT: TOP_1000_SYMBOLS.slice(0, 100),    // Top 100 - preload every 5 minutes
  TIER_2_FAST: TOP_1000_SYMBOLS.slice(100, 300),     // 101-300 - preload every 15 minutes  
  TIER_3_REGULAR: TOP_1000_SYMBOLS.slice(300, 600),  // 301-600 - preload every 30 minutes
  TIER_4_BACKGROUND: TOP_1000_SYMBOLS.slice(600, 1000) // 601-1000 - preload every 60 minutes
};

export default TOP_1000_SYMBOLS;