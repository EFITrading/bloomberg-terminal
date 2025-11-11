// Industry Analysis Service for Market Regimes
export interface IndustryETF {
 symbol: string;
 name: string;
 category: string;
 holdings: string[];
}

export interface IndustryPerformance {
 symbol: string;
 name: string;
 category: string;
 relativePerformance: number;
 trend: 'bullish' | 'bearish';
 topPerformers: HoldingPerformance[];
 worstPerformers: HoldingPerformance[];
}

export interface HoldingPerformance {
 symbol: string;
 relativePerformance: number;
 trend: 'outperforming' | 'underperforming';
}

export interface TimeframeAnalysis {
 timeframe: string;
 days: number;
 industries: IndustryPerformance[];
}

export interface MarketRegimeData {
 life: TimeframeAnalysis;
 developing: TimeframeAnalysis;
 momentum: TimeframeAnalysis;
}

// Industry ETFs with their major holdings - Comprehensive 100+ Industries List
export const INDUSTRY_ETFS: IndustryETF[] = [
 // Technology & Software
 {
 symbol: 'SMH',
 name: 'Semiconductors',
 category: 'Technology',
 holdings: ['TSM', 'NVDA', 'AVGO', 'AMD', 'QCOM', 'MU', 'INTC', 'AMAT', 'ADI', 'MRVL']
 },
 {
 symbol: 'IGV',
 name: 'Software',
 category: 'Technology',
 holdings: ['MSFT', 'AAPL', 'NVDA', 'CRM', 'ORCL', 'ADBE', 'NOW', 'INTU', 'PANW', 'WDAY']
 },
 {
 symbol: 'SKYY',
 name: 'Cloud Computing',
 category: 'Technology',
 holdings: ['MSFT', 'AMZN', 'GOOGL', 'ORCL', 'CRM', 'NOW', 'WDAY', 'ZS', 'NET', 'DDOG']
 },
 {
 symbol: 'CLOU',
 name: 'Cloud Computing',
 category: 'Technology',
 holdings: ['MSFT', 'AMZN', 'GOOGL', 'CRM', 'NOW', 'WDAY', 'ZS', 'OKTA', 'TWLO', 'DBX']
 },
 {
 symbol: 'WCLD',
 name: 'Cloud Computing',
 category: 'Technology',
 holdings: ['MSFT', 'AMZN', 'GOOGL', 'CRM', 'NOW', 'WDAY', 'ZS', 'OKTA', 'TWLO', 'DOCU']
 },
 {
 symbol: 'XSW',
 name: 'Software & Services',
 category: 'Technology',
 holdings: ['MSFT', 'AAPL', 'GOOGL', 'CRM', 'ORCL', 'ADBE', 'NOW', 'INTU', 'IBM', 'ACN']
 },
 {
 symbol: 'VGT',
 name: 'Technology',
 category: 'Technology',
 holdings: ['AAPL', 'MSFT', 'NVDA', 'AVGO', 'CRM', 'ORCL', 'AMD', 'ADBE', 'NFLX', 'CSCO']
 },
 {
 symbol: 'FDN',
 name: 'Internet Companies',
 category: 'Technology',
 holdings: ['AMZN', 'META', 'GOOGL', 'NFLX', 'UBER', 'CRM', 'SHOP', 'SPOT', 'EBAY', 'PYPL']
 },

 // Cybersecurity
 {
 symbol: 'CIBR',
 name: 'Cybersecurity',
 category: 'Security',
 holdings: ['CSCO', 'PANW', 'CRWD', 'FTNT', 'ZS', 'OKTA', 'CHKP', 'GEN', 'CYBR', 'S']
 },
 {
 symbol: 'HACK',
 name: 'Cybersecurity',
 category: 'Security',
 holdings: ['CSCO', 'PANW', 'CRWD', 'FTNT', 'ZS', 'OKTA', 'CHKP', 'GEN', 'CYBR', 'RPD']
 },
 {
 symbol: 'BUG',
 name: 'Cybersecurity',
 category: 'Security',
 holdings: ['CRWD', 'ZS', 'OKTA', 'PANW', 'FTNT', 'NET', 'S', 'CYBR', 'VRNS', 'TENB']
 },

 // AI & Robotics
 {
 symbol: 'BOTZ',
 name: 'Automation & Robotics',
 category: 'AI/Robotics',
 holdings: ['NVDA', 'TSLA', 'ABB', 'FANUC', 'ISRG', 'ROK', 'EMR', 'HON', 'ASML', 'ADSK']
 },
 {
 symbol: 'ROBO',
 name: 'Robotics & AI',
 category: 'AI/Robotics',
 holdings: ['NVDA', 'ISRG', 'ABB', 'FANUC', 'ROK', 'EMR', 'HON', 'ASML', 'ADSK', 'TER']
 },
 {
 symbol: 'ARKK',
 name: 'Innovation',
 category: 'Innovation',
 holdings: ['TSLA', 'ROKU', 'COIN', 'SHOP', 'ZM', 'SQ', 'HOOD', 'PATH', 'GBTC', 'RBLX']
 },
 {
 symbol: 'ARKW',
 name: 'Next Generation Internet',
 category: 'Innovation',
 holdings: ['TSLA', 'COIN', 'ROKU', 'SHOP', 'ZOOM', 'SQ', 'TWLO', 'PATH', 'RBLX', 'U']
 },

 // Energy & Clean Energy
 {
 symbol: 'TAN',
 name: 'Solar Energy',
 category: 'Clean Energy',
 holdings: ['FSLR', 'ENPH', 'JKS', 'DQ', 'CSIQ', 'SPWR', 'RUN', 'ARRY', 'SEDG', 'SOL']
 },
 {
 symbol: 'PBW',
 name: 'Clean Energy',
 category: 'Clean Energy',
 holdings: ['ENPH', 'FSLR', 'PLUG', 'BE', 'RUN', 'SEDG', 'NOVA', 'CSIQ', 'JKS', 'SPWR']
 },
 {
 symbol: 'ICLN',
 name: 'Clean Energy',
 category: 'Clean Energy',
 holdings: ['ENPH', 'FSLR', 'PLUG', 'ORSTED', 'NEE', 'EIX', 'IBERDROLA', 'RUN', 'BE', 'SEDG']
 },
 {
 symbol: 'ACES',
 name: 'Clean Energy',
 category: 'Clean Energy',
 holdings: ['TSLA', 'ENPH', 'FSLR', 'PLUG', 'BE', 'RUN', 'SEDG', 'NOVA', 'ALB', 'MP']
 },
 {
 symbol: 'FAN',
 name: 'Wind Energy',
 category: 'Clean Energy',
 holdings: ['VESTAS', 'ORSTED', 'GE', 'SIEMENS GAMESA', 'NORDEX', 'EDP RENOVAVEIS', 'XINJIANG GOLDWIND', 'MING YANG', 'SUZLON', 'SENVION']
 },
 {
 symbol: 'CTEC',
 name: 'Sustainable Tech',
 category: 'Clean Energy',
 holdings: ['TSLA', 'ENPH', 'FSLR', 'PLUG', 'BE', 'ALB', 'MP', 'LAC', 'SQM', 'NOVA']
 },
 {
 symbol: 'XOP',
 name: 'Oil & Gas Exploration',
 category: 'Energy',
 holdings: ['EQT', 'APA', 'DVN', 'FANG', 'MRO', 'CNX', 'OVV', 'CLR', 'CHRD', 'HES']
 },
 {
 symbol: 'OIH',
 name: 'Oil Services',
 category: 'Energy',
 holdings: ['SLB', 'HAL', 'BKR', 'FTI', 'NOV', 'HP', 'PTEN', 'OII', 'WHD', 'LBRT']
 },
 {
 symbol: 'FCG',
 name: 'Natural Gas',
 category: 'Energy',
 holdings: ['EQT', 'AR', 'CNX', 'KNTK', 'SWN', 'RRC', 'COG', 'CTRA', 'MRO', 'DVN']
 },
 {
 symbol: 'UNG',
 name: 'Natural Gas',
 category: 'Energy',
 holdings: ['Natural Gas Futures', 'NG1', 'NG2', 'NG3', 'NG4', 'NG5', 'NG6', 'NG7', 'NG8', 'NG9']
 },
 {
 symbol: 'VDE',
 name: 'Energy',
 category: 'Energy',
 holdings: ['XOM', 'CVX', 'COP', 'EOG', 'SLB', 'PSX', 'VLO', 'MPC', 'OXY', 'KMI']
 },
 {
 symbol: 'AMLP',
 name: 'Master Limited Partnerships',
 category: 'Energy',
 holdings: ['EPD', 'ET', 'KMI', 'MPLX', 'WMB', 'ONEOK', 'ENB', 'TRP', 'TC', 'PAGP']
 },
 {
 symbol: 'EMLP',
 name: 'Energy Infrastructure',
 category: 'Energy',
 holdings: ['EPD', 'ET', 'KMI', 'MPLX', 'WMB', 'ONEOK', 'ENB', 'TRP', 'TC', 'PAGP']
 },

 // Nuclear & Uranium
 {
 symbol: 'URA',
 name: 'Uranium & Nuclear Energy',
 category: 'Nuclear',
 holdings: ['CCJ', 'KAP', 'NXE', 'UEC', 'DNN', 'UUUU', 'URG', 'LEU', 'LTBR', 'SMR']
 },
 {
 symbol: 'NLR',
 name: 'Nuclear Energy',
 category: 'Nuclear',
 holdings: ['NEE', 'DUK', 'SO', 'EXC', 'CCJ', 'BWX', 'BWXT', 'SMR', 'GE', 'WEC']
 },

 // Materials & Mining
 {
 symbol: 'GDX',
 name: 'Gold Miners',
 category: 'Materials',
 holdings: ['NEM', 'GOLD', 'AEM', 'WPM', 'KGC', 'FNV', 'AU', 'HMY', 'RGLD', 'IAG']
 },
 {
 symbol: 'XME',
 name: 'Mining & Metals',
 category: 'Materials',
 holdings: ['FCX', 'NEM', 'VALE', 'SCCO', 'GOLD', 'AA', 'X', 'CLF', 'STLD', 'NUE']
 },
 {
 symbol: 'SIL',
 name: 'Silver Mining',
 category: 'Materials',
 holdings: ['AG', 'PAAS', 'CDE', 'HL', 'FSM', 'EXK', 'SILV', 'SVM', 'USAS', 'WPM']
 },
 {
 symbol: 'SLX',
 name: 'Steel',
 category: 'Materials',
 holdings: ['NUE', 'STLD', 'CLF', 'X', 'MT', 'VALE', 'PKX', 'RS', 'SID', 'GGB']
 },
 {
 symbol: 'LIT',
 name: 'Lithium & Battery Tech',
 category: 'Materials',
 holdings: ['ALB', 'SQM', 'LAC', 'LTHM', 'PLL', 'SGML', 'MP', 'LPI', 'AREC', 'NOVONIX']
 },
 {
 symbol: 'COPX',
 name: 'Copper Miners',
 category: 'Materials',
 holdings: ['FCX', 'SCCO', 'VALE', 'AA', 'TECK', 'FM', 'HBM', 'CMMC', 'IVN', 'ERO']
 },
 {
 symbol: 'REMX',
 name: 'Rare Earth Metals',
 category: 'Materials',
 holdings: ['MP', 'LYNAS', 'ILUKA', 'ALKANE', 'NORTHERN', 'CHINA RARE EARTH', 'RISING NONFERROUS', 'ARAFURA', 'HASTINGS', 'PEAK RARE EARTHS']
 },
 {
 symbol: 'VAW',
 name: 'Materials',
 category: 'Materials',
 holdings: ['LIN', 'SHW', 'APD', 'ECL', 'FCX', 'NEM', 'CTVA', 'DOW', 'DD', 'NUE']
 },

 // Biotechnology & Healthcare
 {
 symbol: 'XBI',
 name: 'Biotechnology',
 category: 'Healthcare',
 holdings: ['GILD', 'AMGN', 'BIIB', 'MRNA', 'VRTX', 'REGN', 'ILMN', 'BMRN', 'ALNY', 'TECH']
 },
 {
 symbol: 'IBB',
 name: 'Biotechnology',
 category: 'Healthcare',
 holdings: ['GILD', 'AMGN', 'BIIB', 'MRNA', 'VRTX', 'REGN', 'ILMN', 'BMRN', 'ALNY', 'INCY']
 },
 {
 symbol: 'IHI',
 name: 'Medical Devices',
 category: 'Healthcare',
 holdings: ['UNH', 'JNJ', 'ABBV', 'PFE', 'TMO', 'ABT', 'DHR', 'BMY', 'AMGN', 'MDT']
 },
 {
 symbol: 'IHF',
 name: 'Healthcare Providers',
 category: 'Healthcare',
 holdings: ['UNH', 'ANTM', 'CI', 'CVS', 'HUM', 'CNC', 'MOH', 'ELV', 'HCA', 'UHS']
 },
 {
 symbol: 'PPH',
 name: 'Pharmaceuticals',
 category: 'Healthcare',
 holdings: ['JNJ', 'PFE', 'ABBV', 'MRK', 'BMY', 'LLY', 'GILD', 'AMGN', 'BIIB', 'CELG']
 },
 {
 symbol: 'XPH',
 name: 'Pharmaceuticals',
 category: 'Healthcare',
 holdings: ['JNJ', 'PFE', 'ABBV', 'MRK', 'BMY', 'LLY', 'GILD', 'AMGN', 'BIIB', 'REGN']
 },
 {
 symbol: 'BIB',
 name: 'Leveraged Biotechnology',
 category: 'Healthcare',
 holdings: ['GILD', 'AMGN', 'BIIB', 'MRNA', 'VRTX', 'REGN', 'ILMN', 'BMRN', 'ALNY', 'INCY']
 },
 {
 symbol: 'BBC',
 name: 'Biotech Clinical Trials',
 category: 'Healthcare',
 holdings: ['MRNA', 'NVAX', 'VRTX', 'REGN', 'ILMN', 'BMRN', 'ALNY', 'TECH', 'SRPT', 'BLUE']
 },
 {
 symbol: 'PBE',
 name: 'Healthcare Innovations',
 category: 'Healthcare',
 holdings: ['UNH', 'JNJ', 'PFE', 'ABBV', 'MRK', 'TMO', 'ABT', 'DHR', 'BMY', 'AMGN']
 },
 {
 symbol: 'IYH',
 name: 'Healthcare Services',
 category: 'Healthcare',
 holdings: ['UNH', 'JNJ', 'PFE', 'ABBV', 'MRK', 'TMO', 'ABT', 'DHR', 'BMY', 'AMGN']
 },
 {
 symbol: 'AGNG',
 name: 'Aging Demographics',
 category: 'Healthcare',
 holdings: ['UNH', 'JNJ', 'PFE', 'ABBV', 'MRK', 'TMO', 'ABT', 'DHR', 'BMY', 'AMGN']
 },

 // Financial Services
 {
 symbol: 'KRE',
 name: 'Regional Banks',
 category: 'Financial',
 holdings: ['WFC', 'USB', 'PNC', 'TFC', 'COF', 'MTB', 'FITB', 'HBAN', 'RF', 'KEY']
 },
 {
 symbol: 'KIE',
 name: 'Insurance',
 category: 'Financial',
 holdings: ['BRK.B', 'PGR', 'TRV', 'AIG', 'MET', 'PRU', 'ALL', 'CB', 'AFL', 'L']
 },
 {
 symbol: 'IAI',
 name: 'Broker-Dealers',
 category: 'Financial',
 holdings: ['MS', 'GS', 'SCHW', 'BLK', 'SPGI', 'MCO', 'ICE', 'CME', 'NDAQ', 'CBOE']
 },
 {
 symbol: 'IAK',
 name: 'Insurance Providers',
 category: 'Financial',
 holdings: ['BRK.B', 'PGR', 'TRV', 'AIG', 'MET', 'PRU', 'ALL', 'CB', 'AFL', 'L']
 },
 {
 symbol: 'KCE',
 name: 'Capital Markets',
 category: 'Financial',
 holdings: ['BRK.B', 'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'USB', 'PNC', 'TFC']
 },
 {
 symbol: 'KBWP',
 name: 'Property & Real Estate',
 category: 'Financial',
 holdings: ['PLD', 'AMT', 'CCI', 'EQIX', 'PSA', 'WY', 'DLR', 'O', 'SBAC', 'EXR']
 },
 {
 symbol: 'FXO',
 name: 'Financials AlphaDEX',
 category: 'Financial',
 holdings: ['BRK.B', 'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'AXP', 'SPGI']
 },
 {
 symbol: 'IXG',
 name: 'Global Financial Services',
 category: 'Financial',
 holdings: ['BRK.B', 'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'AXP', 'SPGI']
 },
 {
 symbol: 'IYG',
 name: 'Financial Services',
 category: 'Financial',
 holdings: ['BRK.B', 'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'AXP', 'SPGI']
 },
 {
 symbol: 'VFH',
 name: 'Financials',
 category: 'Financial',
 holdings: ['BRK.B', 'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'AXP', 'SPGI']
 },

 // Real Estate
 {
 symbol: 'VNQ',
 name: 'Real Estate',
 category: 'Real Estate',
 holdings: ['PLD', 'AMT', 'CCI', 'EQIX', 'PSA', 'WY', 'DLR', 'O', 'SBAC', 'EXR']
 },
 {
 symbol: 'IYR',
 name: 'Real Estate',
 category: 'Real Estate',
 holdings: ['PLD', 'AMT', 'CCI', 'EQIX', 'PSA', 'WY', 'DLR', 'O', 'SBAC', 'EXR']
 },
 {
 symbol: 'REZ',
 name: 'Residential Real Estate',
 category: 'Real Estate',
 holdings: ['AMH', 'EXR', 'AVB', 'EQR', 'UDR', 'ESS', 'MAA', 'CPT', 'AIV', 'BRG']
 },
 {
 symbol: 'MORT',
 name: 'Mortgage REITs',
 category: 'Real Estate',
 holdings: ['AGNC', 'NLY', 'STWD', 'BXMT', 'TWO', 'CIM', 'NRZ', 'MFA', 'PMT', 'NYMT']
 },

 // Construction & Homebuilding
 {
 symbol: 'ITB',
 name: 'Home Construction',
 category: 'Construction',
 holdings: ['LEN', 'NVR', 'DHI', 'PHM', 'KBH', 'TOL', 'TPG', 'BZH', 'MTH', 'GRBK']
 },
 {
 symbol: 'XHB',
 name: 'Homebuilders',
 category: 'Construction',
 holdings: ['HD', 'LOW', 'LEN', 'DHI', 'PHM', 'AMZN', 'SHW', 'BLD', 'FND', 'BLDR']
 },
 {
 symbol: 'PKB',
 name: 'Building & Construction',
 category: 'Construction',
 holdings: ['CAT', 'DE', 'HD', 'LOW', 'LEN', 'DHI', 'PHM', 'SHW', 'BLD', 'VMC']
 },

 // Aerospace & Defense
 {
 symbol: 'ITA',
 name: 'Aerospace & Defense',
 category: 'Aerospace',
 holdings: ['BA', 'RTX', 'LMT', 'NOC', 'GD', 'LHX', 'TXT', 'HWM', 'CW', 'TDG']
 },
 {
 symbol: 'XAR',
 name: 'Aerospace & Defense',
 category: 'Aerospace',
 holdings: ['BA', 'RTX', 'LMT', 'NOC', 'GD', 'LHX', 'TXT', 'HWM', 'CW', 'TDG']
 },

 // Transportation
 {
 symbol: 'IYT',
 name: 'Transportation',
 category: 'Transportation',
 holdings: ['UPS', 'FDX', 'UAL', 'DAL', 'LUV', 'UNP', 'CSX', 'NSC', 'KSU', 'CHRW']
 },
 {
 symbol: 'JETS',
 name: 'Airlines',
 category: 'Transportation',
 holdings: ['DAL', 'UAL', 'AAL', 'LUV', 'ALK', 'JBLU', 'SAVE', 'HA', 'MESA', 'SKYW']
 },
 {
 symbol: 'BDRY',
 name: 'Dry Bulk Shipping',
 category: 'Transportation',
 holdings: ['VALE', 'BHP', 'RIO', 'STLD', 'NUE', 'CLF', 'X', 'SID', 'GGB', 'PKX']
 },
 {
 symbol: 'BOAT',
 name: 'Maritime Companies',
 category: 'Transportation',
 holdings: ['AP', 'MATX', 'KEX', 'SBLK', 'NMM', 'ESEA', 'SB', 'GOGL', 'CPLP', 'GLOP']
 },

 // Retail & Consumer
 {
 symbol: 'XRT',
 name: 'Retail',
 category: 'Consumer',
 holdings: ['AMZN', 'HD', 'LOW', 'TJX', 'TGT', 'COST', 'WMT', 'DG', 'DLTR', 'BBY']
 },
 {
 symbol: 'IYC',
 name: 'Consumer Services',
 category: 'Consumer',
 holdings: ['AMZN', 'HD', 'MCD', 'SBUX', 'NKE', 'LOW', 'TJX', 'BKNG', 'CMG', 'YUM']
 },
 {
 symbol: 'IYK',
 name: 'Consumer Goods',
 category: 'Consumer',
 holdings: ['PG', 'KO', 'PEP', 'WMT', 'COST', 'MDLZ', 'CL', 'KMB', 'GIS', 'HSY']
 },
 {
 symbol: 'VCR',
 name: 'Consumer Discretionary',
 category: 'Consumer',
 holdings: ['AMZN', 'TSLA', 'HD', 'MCD', 'NKE', 'LOW', 'SBUX', 'TJX', 'BKNG', 'CMG']
 },
 {
 symbol: 'VDC',
 name: 'Consumer Staples',
 category: 'Consumer',
 holdings: ['PG', 'KO', 'PEP', 'WMT', 'COST', 'MDLZ', 'CL', 'KMB', 'GIS', 'HSY']
 },
 {
 symbol: 'CARZ',
 name: 'Automobiles',
 category: 'Consumer',
 holdings: ['TSLA', 'GM', 'F', 'RACE', 'HMC', 'TM', 'BMW', 'DAI', 'VOW3', 'STLA']
 },

 // Food & Agriculture
 {
 symbol: 'PBJ',
 name: 'Food & Beverage',
 category: 'Consumer',
 holdings: ['KO', 'PEP', 'MDLZ', 'GIS', 'K', 'HSY', 'SJM', 'CPB', 'CAG', 'TSN']
 },
 {
 symbol: 'FTXG',
 name: 'Food & Beverage',
 category: 'Consumer',
 holdings: ['KO', 'PEP', 'MDLZ', 'GIS', 'K', 'HSY', 'SJM', 'CPB', 'CAG', 'TSN']
 },
 {
 symbol: 'MOO',
 name: 'Agribusiness',
 category: 'Agriculture',
 holdings: ['ADM', 'BG', 'CF', 'DE', 'FMC', 'MOS', 'NTR', 'TSN', 'CTVA', 'DAR']
 },

 // Industrials
 {
 symbol: 'VIS',
 name: 'Industrials',
 category: 'Industrial',
 holdings: ['BA', 'UNP', 'HON', 'UPS', 'RTX', 'LMT', 'CAT', 'DE', 'GE', 'MMM']
 },

 // Natural Resources & Forestry
 {
 symbol: 'WOOD',
 name: 'Timber & Forestry',
 category: 'Natural Resources',
 holdings: ['WY', 'PCH', 'RYN', 'CUT', 'RYAM', 'UFS', 'STOR', 'TREE', 'PLL', 'LSF']
 },
 {
 symbol: 'CUT',
 name: 'Timber & Forestry',
 category: 'Natural Resources',
 holdings: ['WY', 'PCH', 'RYN', 'UPM', 'STORA', 'SMDS', 'BILF', 'CANF', 'WFG', 'IFP']
 },
 {
 symbol: 'IGE',
 name: 'Natural Resources',
 category: 'Natural Resources',
 holdings: ['XOM', 'CVX', 'COP', 'EOG', 'FCX', 'NEM', 'SLB', 'PSX', 'VLO', 'MPC']
 },
 {
 symbol: 'HAP',
 name: 'Commodities Producers',
 category: 'Natural Resources',
 holdings: ['XOM', 'CVX', 'COP', 'EOG', 'FCX', 'NEM', 'VALE', 'SLB', 'PSX', 'VLO']
 },

 // Utilities
 {
 symbol: 'VPU',
 name: 'Utilities',
 category: 'Utilities',
 holdings: ['NEE', 'SO', 'DUK', 'AEP', 'SRE', 'D', 'PEG', 'EXC', 'XEL', 'ED']
 },

 // Communications & Media
 {
 symbol: 'VOX',
 name: 'Communication Services',
 category: 'Communication',
 holdings: ['META', 'GOOGL', 'GOOG', 'NFLX', 'DIS', 'VZ', 'T', 'CMCSA', 'TMUS', 'CHTR']
 },

 // Social Media & Gaming
 {
 symbol: 'SOCL',
 name: 'Social Media',
 category: 'Social',
 holdings: ['META', 'GOOGL', 'SNAP', 'TWTR', 'PINS', 'MTCH', 'BMBL', 'IAC', 'Z', 'ZG']
 },
 {
 symbol: 'ESPO',
 name: 'Video Gaming and eSports',
 category: 'Gaming',
 holdings: ['NVDA', 'ATVI', 'EA', 'TTWO', 'RBLX', 'AMD', 'NTES', 'SE', 'BILI', 'HUYA']
 },
 {
 symbol: 'NERD',
 name: 'Video Games & eSports',
 category: 'Gaming',
 holdings: ['NVDA', 'ATVI', 'EA', 'TTWO', 'RBLX', 'AMD', 'NTES', 'SE', 'BILI', 'HUYA']
 },
 {
 symbol: 'HERO',
 name: 'Esports & Gaming',
 category: 'Gaming',
 holdings: ['NVDA', 'ATVI', 'EA', 'TTWO', 'RBLX', 'AMD', 'NTES', 'SE', 'BILI', 'HUYA']
 },

 // International & Emerging Markets
 {
 symbol: 'EEM',
 name: 'Emerging Markets',
 category: 'International',
 holdings: ['TSM', 'TCEHY', 'ASML', 'BABA', 'TM', 'Samsung', 'INFY', 'HDB', 'IBN', 'PDD']
 },
 {
 symbol: 'KWEB',
 name: 'China Internet',
 category: 'International',
 holdings: ['BABA', 'TCEHY', 'PDD', 'JD', 'NTES', 'BIDU', 'TME', 'BILI', 'IQ', 'VIPS']
 },
 {
 symbol: 'PXH',
 name: 'Emerging Markets',
 category: 'International',
 holdings: ['TSM', 'TCEHY', 'ASML', 'BABA', 'TM', 'Samsung', 'INFY', 'HDB', 'IBN', 'PDD']
 },

 // Infrastructure
 {
 symbol: 'IGF',
 name: 'Global Infrastructure',
 category: 'Infrastructure',
 holdings: ['NEE', 'AMT', 'CCI', 'EQIX', 'UNP', 'CSX', 'NSC', 'EPD', 'KMI', 'TC']
 },
 {
 symbol: 'GII',
 name: 'Global Infrastructure',
 category: 'Infrastructure',
 holdings: ['NEE', 'AMT', 'CCI', 'EQIX', 'UNP', 'CSX', 'NSC', 'EPD', 'KMI', 'TC']
 },
 {
 symbol: 'GRID',
 name: 'Smart Grid Infrastructure',
 category: 'Infrastructure',
 holdings: ['NEE', 'SO', 'DUK', 'AEP', 'SRE', 'D', 'PEG', 'EXC', 'XEL', 'ED']
 },

 // Specialty & Miscellaneous
 {
 symbol: 'BUZZ',
 name: 'Social Sentiment',
 category: 'Specialty',
 holdings: ['AAPL', 'TSLA', 'AMZN', 'GOOGL', 'META', 'MSFT', 'NVDA', 'NFLX', 'AMD', 'CRM']
 },
 {
 symbol: 'BETZ',
 name: 'Sports Betting & iGaming',
 category: 'Specialty',
 holdings: ['DIS', 'MGM', 'PENN', 'DKNG', 'CHDN', 'CZR', 'RSI', 'FUBO', 'LVS', 'WYNN']
 },
 {
 symbol: 'EVX',
 name: 'Environmental Services',
 category: 'Specialty',
 holdings: ['WM', 'RSG', 'WCN', 'CWST', 'CLH', 'SRCL', 'MEG', 'HASI', 'NVRI', 'PESI']
 },
 {
 symbol: 'LCTD',
 name: 'Low Carbon Transition',
 category: 'Specialty',
 holdings: ['TSLA', 'ENPH', 'FSLR', 'PLUG', 'BE', 'NEE', 'XEL', 'AEP', 'SO', 'DUK']
 }
];

export class IndustryAnalysisService {
 private static baseUrl = '/api'; // Make this mutable to handle port changes
 // ULTRA-OPTIMIZED for Professional Polygon.io Plan ($199/month - UNLIMITED requests)
 private static readonly BATCH_SIZE = 50; // Increased batch size for unlimited plan
 private static readonly MAX_CONCURRENT_BATCHES = 10; // More concurrent batches for speed
 private static readonly CACHE_DURATION = 10 * 60 * 1000; // 10 minutes cache for efficiency
 private static readonly REQUEST_DELAY = 50; // Minimal delay for professional unlimited plan
 
 // Initialize service with connection check
 private static async initializeService(): Promise<void> {
 try {
 // Test connection to API
 const response = await fetch(`${this.baseUrl}/health`, { 
 method: 'GET',
 signal: AbortSignal.timeout(3000) // 3 second timeout
 });
 
 if (response.ok) {
 console.log(' API connection verified');
 } else {
 console.warn(' API health check failed, but continuing with default URL');
 }
 } catch (error) {
 console.warn(' Could not connect to API, ensure development server is running');
 }
 }
 
 // Enhanced configuration for different API tiers
 private static readonly API_TIER_CONFIGS = {
 free: { batchSize: 2, maxConcurrent: 1, delay: 12000 }, // 5 req/min
 basic: { batchSize: 20, maxConcurrent: 4, delay: 50 }, // 100 req/min 
 pro: { batchSize: 50, maxConcurrent: 15, delay: 5 }, // 1000 req/min - ACTIVE CONFIG
 enterprise: { batchSize: 100, maxConcurrent: 25, delay: 2 } // 10000+ req/min
 };
 
 private static historicalDataCache = new Map<string, any>();
 private static cacheExpiry = new Map<string, number>();

 static async batchFetchHistoricalData(
 symbols: string[],
 days: number
 ): Promise<Map<string, any>> {
 
 try {
 const response = await fetch(`${this.baseUrl}/bulk-historical-data`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({ symbols, days }),
 signal: AbortSignal.timeout(120000) // 2 minute timeout for bulk fetch
 });

 if (response.ok) {
 const bulkResult = await response.json();
 if (bulkResult.success) {
 console.log(` BULK FETCH SUCCESS: ${bulkResult.stats.successful}/${bulkResult.stats.requested} symbols loaded`);
 const dataMap = new Map<string, any>();
 for (const [symbol, data] of Object.entries(bulkResult.data)) {
 dataMap.set(symbol, data);
 }
 return dataMap;
 }
 }
 
 console.log(` Bulk endpoint failed, falling back to individual requests`);
 } catch (error) {
 console.log(` Bulk endpoint error, falling back to individual requests:`, error);
 }

 // Fallback to individual requests if bulk fails
 return this.legacyBatchFetchHistoricalData(symbols, days);
 }

 // Legacy batch fetch method as fallback
 private static async legacyBatchFetchHistoricalData(
 symbols: string[],
 days: number
 ): Promise<Map<string, any>> {
 const endDate = new Date();
 const startDate = new Date();
 startDate.setDate(endDate.getDate() - days);
 const dateKey = `${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}`;
 
 const dataMap = new Map<string, any>();
 const uncachedSymbols: string[] = [];
 const now = Date.now();

 // Check cache with expiry
 for (const symbol of symbols) {
 const cacheKey = `${symbol}_${dateKey}`;
 const expiry = this.cacheExpiry.get(cacheKey);
 
 if (this.historicalDataCache.has(cacheKey) && expiry && now < expiry) {
 dataMap.set(symbol, this.historicalDataCache.get(cacheKey));
 } else {
 uncachedSymbols.push(symbol);
 // Clean expired cache entries
 if (expiry && now >= expiry) {
 this.historicalDataCache.delete(cacheKey);
 this.cacheExpiry.delete(cacheKey);
 }
 }
 }

 if (uncachedSymbols.length === 0) {
 return dataMap;
 }

 console.log(` Fetching ${uncachedSymbols.length} uncached symbols in batches...`);

 // Create batches
 const batches: string[][] = [];
 for (let i = 0; i < uncachedSymbols.length; i += this.BATCH_SIZE) {
 batches.push(uncachedSymbols.slice(i, i + this.BATCH_SIZE));
 }

 // Process batches concurrently
 const batchPromises: Promise<void>[] = [];
 
 for (let i = 0; i < batches.length; i += this.MAX_CONCURRENT_BATCHES) {
 const concurrentBatches = batches.slice(i, i + this.MAX_CONCURRENT_BATCHES);
 
 const concurrentPromise = Promise.all(
 concurrentBatches.map(async (batch, batchIndex) => {
 const actualBatchIndex = i + batchIndex;
 console.log(` Processing batch ${actualBatchIndex + 1}/${batches.length} (${batch.length} symbols)`);
 
 const batchPromises = batch.map(async (symbol, index) => {
 // Add staggered delay to prevent overwhelming the server
 if (index > 0) {
 await new Promise(resolve => setTimeout(resolve, index * 50)); // 50ms delay between requests
 }
 
 try {
 // Add timeout and retry logic for better reliability
 const controller = new AbortController();
 const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
 
 const response = await fetch(
 `${this.baseUrl}/historical-data?symbol=${symbol}&startDate=${startDate.toISOString().split('T')[0]}&endDate=${endDate.toISOString().split('T')[0]}`,
 {
 signal: controller.signal,
 headers: {
 'Accept': 'application/json',
 'Content-Type': 'application/json',
 }
 }
 );
 
 clearTimeout(timeoutId);
 
 if (!response.ok) {
 if (response.status === 404) {
 console.warn(` No data found for ${symbol}`);
 return { symbol, data: { results: [], status: 'OK', message: 'No data available' } };
 }
 throw new Error(`HTTP ${response.status}: ${response.statusText}`);
 }
 
 const data = await response.json();
 
 // Cache with expiry
 const cacheKey = `${symbol}_${dateKey}`;
 this.historicalDataCache.set(cacheKey, data);
 this.cacheExpiry.set(cacheKey, now + this.CACHE_DURATION);
 
 return { symbol, data };
 } catch (error) {
 const errorMessage = error instanceof Error ? error.message : 'Unknown error';
 
 if (error instanceof Error && error.name === 'AbortError') {
 console.error(`⏱ Timeout fetching data for ${symbol}`);
 } else if (errorMessage.includes('Failed to fetch') || errorMessage.includes('CONNECTION_REFUSED')) {
 console.error(` Connection error for ${symbol}: Server may not be running on expected port`);
 } else {
 console.error(` Error fetching data for ${symbol}:`, error);
 }
 
 // Return empty data instead of null to prevent cascading errors
 return { symbol, data: { results: [], status: 'ERROR', message: errorMessage } };
 }
 });

 const batchResults = await Promise.all(batchPromises);
 
 for (const { symbol, data } of batchResults) {
 if (data) {
 dataMap.set(symbol, data);
 }
 }
 })
 ).then(() => {
 // Minimal delay optimized for Professional Plan
 return new Promise<void>(resolve => setTimeout(resolve, this.REQUEST_DELAY));
 }); batchPromises.push(concurrentPromise);
 }

 await Promise.all(batchPromises);
 console.log(` Completed fetching ${uncachedSymbols.length} symbols`);

 return dataMap;
 }

 // Calculate relative performance using cached data
 static calculateRelativePerformanceFromData(
 etfData: any,
 spyData: any
 ): number {
 try {
 if (!etfData?.results || !spyData?.results || etfData.results.length === 0 || spyData.results.length === 0) {
 console.warn(' Missing data for relative performance calculation');
 return 0;
 }

 // Fix: Data comes in DESC order (newest first)
 // So [0] = most recent, [length-1] = oldest
 const etfNewestPrice = etfData.results[0].c; // Most recent
 const etfOldestPrice = etfData.results[etfData.results.length - 1].c; // Oldest
 const etfChange = ((etfNewestPrice - etfOldestPrice) / etfOldestPrice) * 100;

 const spyNewestPrice = spyData.results[0].c; // Most recent 
 const spyOldestPrice = spyData.results[spyData.results.length - 1].c; // Oldest
 const spyChange = ((spyNewestPrice - spyOldestPrice) / spyOldestPrice) * 100;

 const relativePerf = etfChange - spyChange;
 
 console.log(` ${etfData.ticker}: ETF change ${etfChange.toFixed(2)}%, SPY change ${spyChange.toFixed(2)}%, Relative: ${relativePerf.toFixed(2)}%`);
 
 // Return relative performance (ETF vs SPY)
 return relativePerf;
 } catch (error) {
 console.error('Error calculating relative performance from data:', error);
 return 0;
 }
 }

 // Calculate holding performance relative to its ETF using cached data
 static calculateHoldingPerformanceFromData(
 holdingData: any,
 etfData: any
 ): number {
 try {
 if (!holdingData?.results || !etfData?.results || holdingData.results.length === 0 || etfData.results.length === 0) {
 return 0;
 }

 // Fix: Data comes in DESC order (newest first)
 const holdingNewestPrice = holdingData.results[0].c; // Most recent
 const holdingOldestPrice = holdingData.results[holdingData.results.length - 1].c; // Oldest
 const holdingChange = ((holdingNewestPrice - holdingOldestPrice) / holdingOldestPrice) * 100;

 const etfNewestPrice = etfData.results[0].c; // Most recent
 const etfOldestPrice = etfData.results[etfData.results.length - 1].c; // Oldest
 const etfChange = ((etfNewestPrice - etfOldestPrice) / etfOldestPrice) * 100;

 // Return relative performance (Holding vs ETF)
 return holdingChange - etfChange;
 } catch (error) {
 console.error('Error calculating holding performance from data:', error);
 return 0;
 }
 }

 // Analyze all holdings for an ETF using bulk data
 static async analyzeETFHoldings(
 etf: IndustryETF,
 days: number,
 historicalDataMap: Map<string, any>
 ): Promise<{ topPerformers: HoldingPerformance[], worstPerformers: HoldingPerformance[] }> {
 const holdingPerformances: HoldingPerformance[] = [];
 const etfData = historicalDataMap.get(etf.symbol);

 if (!etfData) {
 return { topPerformers: [], worstPerformers: [] };
 }

 // Analyze each holding using cached data
 for (const holding of etf.holdings) {
 const holdingData = historicalDataMap.get(holding);
 if (holdingData) {
 const relativePerformance = this.calculateHoldingPerformanceFromData(holdingData, etfData);
 holdingPerformances.push({
 symbol: holding,
 relativePerformance,
 trend: relativePerformance > 0 ? 'outperforming' : 'underperforming'
 });
 }
 }

 // Sort by performance
 holdingPerformances.sort((a, b) => b.relativePerformance - a.relativePerformance);

 return {
 topPerformers: holdingPerformances.slice(0, 5), // Top 5 performers
 worstPerformers: holdingPerformances.slice(-5).reverse() // Bottom 5 performers
 };
 }

 // Analyze industry performance for a specific timeframe using bulk data
 static async analyzeTimeframe(days: number, timeframeName: string): Promise<TimeframeAnalysis> {
 console.log(` DETAILED ANALYSIS: Starting ${timeframeName} timeframe (${days} days)...`);
 
 // Add timeout to prevent infinite hanging - increased for full dataset
 const timeoutPromise = new Promise<TimeframeAnalysis>((_, reject) => {
 setTimeout(() => {
 reject(new Error(`${timeframeName} analysis timeout - taking too long`));
 }, 60000); // 60 second timeout per timeframe for full dataset
 });

 const analysisPromise = this.performTimeframeAnalysis(days, timeframeName);
 
 try {
 return await Promise.race([analysisPromise, timeoutPromise]);
 } catch (error) {
 console.error(` ${timeframeName} analysis failed:`, error);
 // Return empty analysis instead of hanging
 return {
 timeframe: timeframeName,
 days,
 industries: []
 };
 }
 }

 // Separate the actual analysis logic to enable timeout handling
 private static async performTimeframeAnalysis(days: number, timeframeName: string): Promise<TimeframeAnalysis> {
 // Collect all unique symbols (ETFs + holdings + SPY) - FULL DATASET
 const allSymbols = new Set<string>();
 allSymbols.add('SPY'); // Always include SPY for relative performance
 
 for (const etf of INDUSTRY_ETFS) {
 allSymbols.add(etf.symbol);
 for (const holding of etf.holdings) {
 allSymbols.add(holding);
 }
 }

 console.log(` MARKET REGIMES: Fetching data for ${allSymbols.size} symbols for ${timeframeName}...`);
 console.log(` First 10 symbols: ${Array.from(allSymbols).slice(0, 10).join(', ')}...`);
 
 // Bulk fetch all historical data
 console.log(`⏱ ${timeframeName}: Starting batch fetch...`);
 const historicalDataMap = await this.batchFetchHistoricalData(Array.from(allSymbols), days);
 console.log(` MARKET REGIMES: Retrieved data for ${historicalDataMap.size} symbols out of ${allSymbols.size} requested`);
 
 const spyData = historicalDataMap.get('SPY');
 
 if (!spyData) {
 console.error(' Failed to fetch SPY data');
 return {
 timeframe: timeframeName,
 days,
 industries: []
 };
 }

 console.log(` SPY data received: ${spyData.results?.length || 0} data points`);
 if (spyData.results && spyData.results.length > 0) {
 console.log(` SPY price range: $${spyData.results[spyData.results.length - 1].c} → $${spyData.results[0].c}`);
 }

 const industries: IndustryPerformance[] = [];

 // Analyze each ETF using bulk data
 for (const etf of INDUSTRY_ETFS) {
 try {
 const etfData = historicalDataMap.get(etf.symbol);
 if (!etfData) {
 console.warn(` No data available for ${etf.symbol}`);
 continue;
 }

 const relativePerformance = this.calculateRelativePerformanceFromData(etfData, spyData);
 const { topPerformers, worstPerformers } = await this.analyzeETFHoldings(etf, days, historicalDataMap);

 industries.push({
 symbol: etf.symbol,
 name: etf.name,
 category: etf.category,
 relativePerformance,
 trend: relativePerformance > 0 ? 'bullish' : 'bearish',
 topPerformers,
 worstPerformers
 });
 } catch (error) {
 console.error(` Error analyzing ${etf.symbol}:`, error);
 }
 }

 // Sort by relative performance
 industries.sort((a, b) => b.relativePerformance - a.relativePerformance);

 console.log(` MARKET REGIMES SUCCESS: ${timeframeName} analysis complete: ${industries.length} industries analyzed`);
 
 // Log top 3 bullish and bearish industries for verification
 const bullish = industries.filter(i => i.trend === 'bullish').slice(0, 3);
 const bearish = industries.filter(i => i.trend === 'bearish').slice(0, 3);
 
 console.log(` Top 3 Bullish (${timeframeName}):`, bullish.map(i => `${i.symbol} (+${i.relativePerformance.toFixed(2)}%)`));
 console.log(` Top 3 Bearish (${timeframeName}):`, bearish.map(i => `${i.symbol} (${i.relativePerformance.toFixed(2)}%)`));
 
 return {
 timeframe: timeframeName,
 days,
 industries
 };
 }

 static async getMarketRegimeDataWithProgress(
 progressCallback?: (stage: string, progress: number) => void
 ): Promise<MarketRegimeData> {
 console.log('� Starting MAXIMUM SPEED Market Regime Analysis...');
 
 if (progressCallback) progressCallback('Initializing parallel analysis...', 10);

 console.log(' Running all timeframes in parallel for maximum speed...');
 
 // Track actual progress with Promise.allSettled to monitor completion
 const completedTasks = { count: 0, total: 3 };
 
 const trackablePromises = [
 this.analyzeTimeframe(4, 'Life').then(result => {
 completedTasks.count++;
 if (progressCallback) {
 const progress = 25 + (completedTasks.count / completedTasks.total) * 70;
 progressCallback(`Completed ${completedTasks.count}/${completedTasks.total} timeframes...`, progress);
 }
 return result;
 }),
 this.analyzeTimeframe(16, 'Developing').then(result => {
 completedTasks.count++;
 if (progressCallback) {
 const progress = 25 + (completedTasks.count / completedTasks.total) * 70;
 progressCallback(`Completed ${completedTasks.count}/${completedTasks.total} timeframes...`, progress);
 }
 return result;
 }),
 this.analyzeTimeframe(23, 'Momentum').then(result => {
 completedTasks.count++;
 if (progressCallback) {
 const progress = 25 + (completedTasks.count / completedTasks.total) * 70;
 progressCallback(`Completed ${completedTasks.count}/${completedTasks.total} timeframes...`, progress);
 }
 return result;
 })
 ];

 try {
 const [life, developing, momentum] = await Promise.all(trackablePromises);
 
 if (progressCallback) progressCallback('Finalizing results...', 100);
 
 console.log(' MAXIMUM SPEED Market Regime Analysis Complete - All timeframes processed in parallel!');
 
 return { life, developing, momentum };
 } catch (error) {
 throw error;
 }
 }

 // STREAMING VERSION: Get market regime analysis with streaming results as they complete
 static async getMarketRegimeDataStreaming(
 progressCallback?: (stage: string, progress: number) => void,
 streamCallback?: (timeframe: string, data: TimeframeAnalysis) => void
 ): Promise<MarketRegimeData> {
 console.log('� STARTING MARKET REGIME ANALYSIS - INDUSTRY SERVICE INVOKED');
 
 if (progressCallback) progressCallback('Initializing streaming analysis...', 5);
 
 // Initialize service and check API connection
 try {
 await this.initializeService();
 console.log(' Market Regime Service initialized successfully');
 } catch (error) {
 console.error(' Failed to initialize Market Regime Service:', error);
 }
 
 if (progressCallback) progressCallback('API connection verified, starting analysis...', 10);

 // Initialize empty result object
 const result: Partial<MarketRegimeData> = {};
 
 // Analysis configurations
 const timeframes = [
 { days: 4, name: 'life' as keyof MarketRegimeData, label: 'Life' },
 { days: 16, name: 'developing' as keyof MarketRegimeData, label: 'Developing' },
 { days: 23, name: 'momentum' as keyof MarketRegimeData, label: 'Momentum' }
 ];

 // Execute analyses sequentially to prevent resource exhaustion
 // instead of parallel execution which overwhelms the browser
 const completedAnalyses: any[] = [];
 
 for (const { days, name, label } of timeframes) {
 try {
 console.log(` STARTING ${label.toUpperCase()} TIMEFRAME ANALYSIS (${days} days)`);
 if (progressCallback) progressCallback(`Analyzing ${label} timeframe (${days}d)...`, 20 + (timeframes.findIndex(t => t.name === name) * 20));
 
 const data = await this.analyzeTimeframe(days, label);
 result[name] = data;
 
 console.log(` ${label} analysis complete - found ${data.industries.length} industries`);
 
 // Stream the result immediately when ready
 if (streamCallback) {
 console.log(` Streaming ${label} results to UI...`);
 streamCallback(label, data);
 }
 
 if (progressCallback) progressCallback(`${label} timeframe complete`, 30 + (timeframes.findIndex(t => t.name === name) * 20));
 
 console.log(` ${label} timeframe analysis complete - streaming result`);
 completedAnalyses.push(data);
 } catch (error) {
 console.error(` CRITICAL ERROR analyzing ${label} timeframe:`, error);
 
 // Don't throw - instead create empty timeframe data and continue
 const emptyData: TimeframeAnalysis = {
 timeframe: label,
 days,
 industries: []
 };
 result[name] = emptyData;
 
 if (streamCallback) {
 console.log(` Streaming empty ${label} results due to error...`);
 streamCallback(label, emptyData);
 }
 
 console.log(` ${label} timeframe failed - using empty data and continuing`);
 completedAnalyses.push(emptyData);
 }
 }

 try {
 // All analyses are now complete (sequential execution)
 if (progressCallback) progressCallback('All timeframes complete', 100);
 
 console.log(' STREAMING Market Regime Analysis Complete - All results streamed!');
 
 return result as MarketRegimeData;
 } catch (error) {
 console.error(' Error in streaming market regime analysis:', error);
 
 // Return partial results even if there were errors
 console.log(' Returning partial market regime data due to errors');
 return result as MarketRegimeData;
 }
 }

 // Get complete market regime analysis (original method for backwards compatibility)
 static async getMarketRegimeData(): Promise<MarketRegimeData> {
 return this.getMarketRegimeDataWithProgress();
 }
}
