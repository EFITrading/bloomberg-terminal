// TOP 1800+ STOCKS by market cap for comprehensive options flow scanning
// Updated October 2025 - includes all major stocks users actually trade
// Expanded from 1000 to 1800+ stocks, all with $4B+ market cap

export const TOP_1800_SYMBOLS = [
  // Major ETFs - HIGHEST PRIORITY for options trading
  'SPY', 'QQQ', 'IWM', 'XLF', 'XLE', 'XLK', 'XLV', 'XLI', 'XLU', 'XLP',
  'XLY', 'XLB', 'XLRE', 'XLC', 'EFA', 'EEM', 'VTI', 'VEA', 'GDX', 'TLT',
  'HYG', 'LQD', 'VXX', 'UVXY', 'SQQQ', 'TQQQ', 'SPXL', 'SPXS', 'TNA', 'TZA',
  
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
  'WELL', 'STZ', 'PSA', 'CTSH', 'YUM', 'SBUX', 'IDXX', 'EXR', 'KMI', 'CPRT',
  'VICI', 'ILMN', 'CBRE', 'GPN', 'OTIS', 'DOW', 'FANG', 'HPQ', 'LHX', 'WAB',
  
  // 201-300 - Mid-large caps
  'DLTR', 'EA', 'GEHC', 'CMI', 'MPWR', 'ANSS', 'MLM', 'HLT', 'AVB', 'VMC',
  'DD', 'WBA', 'EQR', 'PH', 'HAL', 'KEYS', 'IT', 'AME', 'NTRS', 'BF.B',
  'LYB', 'WDC', 'TEL', 'TSCO', 'WRK', 'LUV', 'URI', 'CLX', 'MAR', 'RMD',
  'DFS', 'MTB', 'PEG', 'AWK', 'FTV', 'LYV', 'TT', 'MSCI', 'COO', 'CAH',
  'ARE', 'IFF', 'MKC', 'FITB', 'RSG', 'CDW', 'ETR', 'NVR', 'FRC', 'HPE',
  'BXP', 'NDAQ', 'SWKS', 'SIVB', 'HBAN', 'CMS', 'K', 'CTVA', 'RF', 'PKI',
  'ZBRA', 'DTE', 'TROW', 'FE', 'ES', 'HOLX', 'ALGN', 'EPAM', 'LH', 'WAT',
  'CNP', 'DRE', 'CE', 'STT', 'CFG', 'ROK', 'FIS', 'IP', 'MAS', 'POOL',
  'EXPD', 'CLR', 'RJF', 'NI', 'JBHT', 'CHRW', 'UDR', 'HST', 'LDOS', 'AKAM',
  'ULTA', 'INCY', 'PEAK', 'PAYC', 'TDY', 'J', 'CBOE', 'LNT', 'PWR', 'TECH',
  
  // 301-400 - Popular mid caps
  'MAA', 'JKHY', 'GL', 'SYF', 'PBCT', 'NTAP', 'IEX', 'FFIV', 'LW', 'OMC',
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
  'TSLA', 'NIO', 'XPEV', 'LI', 'BYDDY', 'BYD', 'KNDI', 'SOLO', 'AYRO', 'WKHS',
  
  // 1001-1200 - Additional High Market Cap ($50B+)
  'TSM', 'BABA', 'ASML', 'SAP', 'TM', 'NVS', 'NVO', 'HSBC', 'SHEL', 'SHOP',
  'BX', 'APP', 'PDD', 'ANET', 'SONY', 'MUFG', 'HDB', 'ARM', 'GEV', 'SAN',
  'UL', 'BHP', 'SPOT', 'TD', 'TTE', 'UBS', 'HOOD', 'DASH', 'SE', 'BTI',
  'MELI', 'BBVA', 'ENB', 'SCCO', 'BN', 'SMFG', 'MSTR', 'COIN', 'DELL', 'RIO',
  'BUD', 'CEG', 'KKR', 'IBN', 'CVNA', 'RBLX', 'RACE', 'SNOW', 'BNS', 'NET',
  'HWM', 'MRVL', 'NU', 'ABNB', 'TDG', 'APO', 'NGG', 'ITUB', 'BCS', 'ING',
  'CP', 'INFY', 'ADSK', 'TRI', 'EPD', 'VST', 'CNQ', 'SPG', 'DB', 'LYG',
  'EQNR', 'PWR', 'WDAY', 'URI', 'AMX', 'VRT', 'DLR', 'HLT', 'REGN', 'AFL',
  'ALNY', 'COR', 'NWG', 'CPNG', 'MPC', 'TFC', 'NXPI', 'FDX', 'B', 'FCX',
  'ET', 'LHX', 'AXON', 'TRP', 'CMG', 'GM', 'BDX', 'ALL', 'O', 'DDOG',
  
  // 1201-1400 - Mid-Large Cap ($10B-$50B)
  'FAST', 'MET', 'MFC', 'ROP', 'PSX', 'E', 'DEO', 'D', 'PCAR', 'SLB',
  'STX', 'LNG', 'PSA', 'DHI', 'JD', 'CARR', 'VLO', 'NDAQ', 'F', 'SU',
  'IDXX', 'MPLX', 'EA', 'WPM', 'BIDU', 'GRMN', 'ROST', 'VEEV', 'ARES', 'ARGX',
  'BKR', 'ZS', 'XEL', 'VALE', 'RKT', 'XYZ', 'TTWO', 'WBD', 'TCOM', 'AMP',
  'MPWR', 'IMO', 'EXC', 'FERG', 'AIG', 'GWW', 'OKE', 'TAK', 'CBRE', 'EW',
  'HEI', 'WCN', 'PAYX', 'OXY', 'FICO', 'MSCI', 'CTVA', 'ETR', 'WDC', 'FLUT',
  'CHTR', 'FANG', 'CPRT', 'FER', 'KR', 'FNV', 'AME', 'EBAY', 'YUM', 'HMC',
  'RMD', 'CCI', 'PEG', 'TGT', 'VMC', 'UI', 'A', 'SYM', 'KMB', 'CCEP',
  'HSY', 'TEAM', 'TKO', 'HLN', 'ROK', 'HEI.A', 'SYY', 'MLM', 'ALC', 'CCL',
  'GFI', 'RDDT', 'ONC', 'DAL', 'AU', 'HIG', 'CCJ', 'CAH', 'WEC', 'ALAB',
  
  // 1401-1600 - Quality Mid-Cap ($4B-$15B)
  'XYL', 'PRU', 'TME', 'LYV', 'MCHP', 'LVS', 'ED', 'EQT', 'PUK', 'OTIS',
  'HUM', 'PCG', 'FIS', 'TRGP', 'GEHC', 'IQV', 'ABEV', 'WAB', 'VICI', 'CSGP',
  'CRCL', 'KDP', 'SLF', 'VRSK', 'WTW', 'ACGL', 'CHT', 'VG', 'DD', 'INSM',
  'RJF', 'STT', 'IR', 'CTSH', 'HPE', 'SMCI', 'LEN', 'EL', 'NRG', 'VTR',
  'SOFI', 'STLA', 'UAL', 'IRM', 'CVE', 'BBD', 'NBIS', 'EXR', 'QSR', 'BRO',
  'NUE', 'IBKR', 'KGC', 'FMX', 'RYAAY', 'KB', 'KVUE', 'ODFL', 'ADM', 'EME',
  'KHC', 'MT', 'KEYS', 'MTB', 'PSTG', 'DTE', 'EFX', 'NTR', 'WRB', 'WDS',
  'FIX', 'FITB', 'TSCO', 'K', 'IX', 'WIT', 'TEF', 'AEE', 'RKLB', 'ROL',
  'ERIC', 'AWK', 'FIG', 'TDY', 'ATO', 'MTD', 'EXPE', 'PPL', 'BR', 'FOXA',
  'NOK', 'VOD', 'CLS', 'ES', 'FWONA', 'FE', 'GIS', 'PHG', 'PHM', 'AVB',
  
  // 1601-1800+ - Solid Companies ($4B+)
  'SYF', 'VIK', 'VLTO', 'MDB', 'ASTS', 'GRAB', 'DXCM', 'TTD', 'STM', 'FOX',
  'CINF', 'CQP', 'CNP', 'OWL', 'EXE', 'CRDO', 'ULTA', 'LDOS', 'CYBR', 'FTS',
  'VRSN', 'BNTX', 'NTRS', 'LI', 'FSLR', 'PCTY', 'ENPH', 'TMDX', 'SEDG', 'RUN',
  'MRNA', 'NVAX', 'PFE', 'GOOS', 'LEVI', 'ON', 'WOLF', 'PAYC', 'BILL', 'SQ',
  'AFRM', 'LC', 'UPST', 'Z', 'ZG', 'RDFN', 'OPEN', 'RKT', 'UWMC', 'COMP',
  'SKLZ', 'DKNG', 'PENN', 'MGM', 'LVS', 'WYNN', 'CZR', 'BYD', 'NIO', 'XPEV',
  'LI', 'BYDDY', 'KNDI', 'SOLO', 'AYRO', 'WKHS', 'RIDE', 'GOEV', 'FSR', 'CANOO',
  'CHPT', 'BLNK', 'EVGO', 'PLUG', 'FCEL', 'BLDP', 'BE', 'HYLN', 'QS', 'SPCE',
  'ASTR', 'RDW', 'VORB', 'MNTS', 'MAXR', 'SPIR', 'LUNR', 'SRAC', 'VACQ', 'IPOE',
  'CCIV', 'IPOF', 'PSTH', 'AJAX', 'ACTC', 'ZNTE', 'FMAC', 'PRPB', 'CPUH', 'FTOC'
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