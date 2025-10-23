import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

// Top 1000 symbols to screen - comprehensive market coverage
const TOP_SCREENER_SYMBOLS = [
 // Mega Cap Technology (Top 50)
 'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'TSLA', 'META', 'AVGO', 'ORCL',
 'CRM', 'ADBE', 'AMD', 'INTC', 'CSCO', 'NFLX', 'TXN', 'QCOM', 'INTU', 'IBM',
 'MU', 'AMAT', 'LRCX', 'ADI', 'KLAC', 'MRVL', 'SNPS', 'CDNS', 'FTNT', 'PANW',
 'CRWD', 'ZS', 'DDOG', 'NET', 'SNOW', 'PLTR', 'RBLX', 'U', 'DOCN', 'FSLY',
 'TWLO', 'ZM', 'OKTA', 'WORK', 'TEAM', 'ATLASSIAN', 'SHOP', 'SQ', 'PYPL', 'V',
 
 // Financial Services (50)
 'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'USB', 'TFC', 'PNC', 'COF',
 'SCHW', 'BLK', 'SPGI', 'ICE', 'CME', 'MCO', 'MSCI', 'TRV', 'AXP', 'MA',
 'BRK.B', 'BRK.A', 'AIG', 'MET', 'PRU', 'AFL', 'ALL', 'PGR', 'CB', 'AON',
 'MMC', 'WTW', 'BRO', 'AJG', 'RE', 'L', 'RGA', 'MKL', 'Y', 'AFG',
 'CINF', 'PFG', 'FNF', 'NTRS', 'STT', 'BK', 'FITB', 'HBAN', 'RF', 'CFG',
 
 // Healthcare & Pharma (100)
 'UNH', 'JNJ', 'PFE', 'ABBV', 'MRK', 'TMO', 'ABT', 'LLY', 'BMY', 'AMGN',
 'GILD', 'MDT', 'DHR', 'SYK', 'BSX', 'EW', 'ISRG', 'ZBH', 'BAX', 'BDX',
 'ANTM', 'CI', 'CVS', 'HUM', 'CNC', 'MOH', 'EXC', 'BIIB', 'REGN', 'VRTX',
 'ILMN', 'MRNA', 'BNTX', 'PFE', 'NVAX', 'JNJ', 'AZN', 'NVO', 'ROCHE', 'SNY',
 'GSK', 'BMY', 'LLY', 'MRK', 'ABBV', 'GILD', 'AMGN', 'BIIB', 'CELG', 'VRTX',
 'REGN', 'ILMN', 'TMO', 'DHR', 'ABT', 'SYK', 'BSX', 'MDT', 'ZBH', 'BAX',
 'BDX', 'EW', 'ISRG', 'DXCM', 'ALGN', 'IDXX', 'MTD', 'IQV', 'PKI', 'A',
 'WAT', 'TECH', 'QGEN', 'MKTX', 'VEEV', 'ZTS', 'CTLT', 'HOLX', 'WST', 'TFX',
 'XRAY', 'STE', 'PODD', 'TDOC', 'HALO', 'TWST', 'PACB', 'BEAM', 'CRSP', 'EDIT',
 'NTLA', 'BLUE', 'SAGE', 'IONS', 'SRPT', 'RARE', 'FOLD', 'ARWR', 'MDGL', 'INCY',
 
 // Consumer & Retail (100)
 'AMZN', 'TSLA', 'HD', 'WMT', 'PG', 'KO', 'PEP', 'COST', 'NKE', 'MCD',
 'SBUX', 'TGT', 'LOW', 'TJX', 'INTU', 'CRM', 'DIS', 'NFLX', 'CMCSA', 'T',
 'VZ', 'TMUS', 'CHTR', 'EA', 'ATVI', 'TTWO', 'ZNGA', 'PINS', 'TWTR', 'SNAP',
 'UBER', 'LYFT', 'ABNB', 'DASH', 'ETSY', 'EBAY', 'MELI', 'SE', 'BABA', 'JD',
 'PDD', 'TME', 'BILI', 'DOYU', 'HUYA', 'YY', 'MOMO', 'WB', 'SOHU', 'SINA',
 'F', 'GM', 'TSLA', 'NIO', 'XPEV', 'LI', 'RIVN', 'LCID', 'GOEV', 'NKLA',
 'HYLN', 'RIDE', 'WKHS', 'SOLO', 'AYRO', 'BLNK', 'CHPT', 'EVGO', 'PLUG', 'FCEL',
 'BE', 'CLNE', 'GEVO', 'KTOS', 'MVIS', 'VLDR', 'LAZR', 'LIDR', 'OUST', 'AEYE',
 'KMX', 'AN', 'LAD', 'ABG', 'PAG', 'SAH', 'LKQ', 'AAP', 'AZO', 'ORLY',
 'WSM', 'RH', 'BBBY', 'BIG', 'DKS', 'HIBB', 'JWN', 'M', 'KSS', 'GPS',
 
 // Energy & Materials (80)
 'XOM', 'CVX', 'COP', 'EOG', 'SLB', 'PSX', 'VLO', 'MPC', 'KMI', 'WMB',
 'OKE', 'EPD', 'ET', 'MPLX', 'PAA', 'EQT', 'DVN', 'FANG', 'MRO', 'APA',
 'OVV', 'PXD', 'CXO', 'MTDR', 'SM', 'RRC', 'AR', 'CLR', 'WLL', 'MUR',
 'CNX', 'SWN', 'EQT', 'RICE', 'GPOR', 'CTRA', 'MGY', 'CRGY', 'NEXT', 'VNOM',
 'BHP', 'RIO', 'VALE', 'FCX', 'NEM', 'GOLD', 'AEM', 'KGC', 'AU', 'EGO',
 'PAAS', 'CDE', 'HL', 'SSRM', 'AGI', 'WPM', 'FNV', 'RGLD', 'SAND', 'MAG',
 'AA', 'CENX', 'ACH', 'STLD', 'NUE', 'X', 'CLF', 'MT', 'TX', 'SCHN',
 'RS', 'WOR', 'ZEUS', 'MLM', 'VMC', 'NWL', 'APD', 'LIN', 'SHW', 'PPG',
 
 // Industrial & Infrastructure (100)
 'BA', 'CAT', 'DE', 'MMM', 'HON', 'UNP', 'UPS', 'FDX', 'LMT', 'RTX',
 'GE', 'EMR', 'ITW', 'PH', 'CMI', 'ETN', 'JCI', 'IR', 'DOV', 'XYL',
 'FLR', 'JEC', 'PWR', 'PCAR', 'WAB', 'CAJ', 'OSK', 'MTZ', 'ALK', 'CHRW',
 'EXPD', 'JBHT', 'KNX', 'LSTR', 'ODFL', 'SAIA', 'XPO', 'GXO', 'ARCB', 'CVLG',
 'HTLD', 'MRTN', 'SNDR', 'WERN', 'YELL', 'HUBG', 'MATX', 'RAIL', 'NSC', 'CSX',
 'CP', 'CNI', 'KSU', 'GWR', 'GATX', 'FWRD', 'AL', 'APG', 'AIT', 'DCI',
 'GFF', 'MLI', 'MSM', 'RXO', 'SNCY', 'TFII', 'TRN', 'UHAL', 'MRTN', 'BWXT',
 'BWA', 'APTV', 'ADNT', 'AXL', 'CPS', 'DAN', 'DORM', 'FOX', 'FOXA', 'GT',
 'LEA', 'MOG.A', 'MOG.B', 'MTOR', 'SUP', 'SMP', 'THRM', 'VC', 'WOLF', 'XRAY',
 'AIR', 'B', 'BALL', 'CCK', 'CLH', 'CSL', 'DOOR', 'GPC', 'IEX', 'MSA',
 
 // Real Estate & REITs (50)
 'AMT', 'PLD', 'CCI', 'EQIX', 'SPG', 'O', 'WELL', 'DLR', 'PSA', 'EXR',
 'AVB', 'EQR', 'VTR', 'VICI', 'WY', 'SLG', 'BXP', 'ARE', 'HST', 'HOST',
 'REG', 'FRT', 'KIM', 'MAC', 'PEI', 'SKT', 'SPG', 'TCO', 'UDR', 'CPT',
 'ESS', 'MAA', 'AIV', 'NNN', 'STOR', 'ADC', 'CUZ', 'EPR', 'GTY', 'IRT',
 'KRG', 'LXP', 'NHI', 'OHI', 'PEAK', 'PK', 'ROIC', 'SAFE', 'SBRA', 'UE',
 
 // Communications & Media (50)
 'T', 'VZ', 'TMUS', 'CHTR', 'CMCSA', 'DIS', 'NFLX', 'GOOGL', 'META', 'TWTR',
 'SNAP', 'PINS', 'MTCH', 'BMBL', 'ZM', 'DOCU', 'CRM', 'NOW', 'WDAY', 'ADSK',
 'ANSS', 'CDNS', 'SNPS', 'ORCL', 'VMW', 'CTSH', 'ACN', 'IBM', 'EPAM', 'GLOB',
 'LUMN', 'CTL', 'FYBR', 'CABO', 'SHEN', 'COGN', 'VMEO', 'FUBO', 'ROKU', 'PARA',
 'WBD', 'FOX', 'FOXA', 'NWSA', 'NWS', 'NYT', 'GOOG', 'GOOGL', 'AMZN', 'AAPL',
 
 // Utilities & Energy Infrastructure (50)
 'NEE', 'SO', 'DUK', 'AEP', 'EXC', 'XEL', 'WEC', 'ED', 'ETR', 'PPL',
 'FE', 'EIX', 'ES', 'CMS', 'DTE', 'NI', 'LNT', 'EVRG', 'PNW', 'ATO',
 'CNP', 'NJR', 'SJI', 'SR', 'SWX', 'UGI', 'UTL', 'WGL', 'AWK', 'WTRG',
 'CWT', 'MSEX', 'SBS', 'YORW', 'CDZI', 'CWCO', 'GWRS', 'ARTNA', 'AWR', 'CALIF',
 'CTWS', 'HWKN', 'MSEX', 'PCYO', 'SJW', 'WTR', 'BKH', 'MDU', 'NWE', 'OGS',
 
 // Biotechnology & Life Sciences (50)
 'AMGN', 'GILD', 'BIIB', 'REGN', 'VRTX', 'ILMN', 'MRNA', 'BNTX', 'NVAX', 'CRSP',
 'EDIT', 'NTLA', 'BEAM', 'BLUE', 'SAGE', 'IONS', 'SRPT', 'RARE', 'FOLD', 'ARWR',
 'MDGL', 'INCY', 'HALO', 'TWST', 'PACB', 'TDOC', 'VEEV', 'ZTS', 'CTLT', 'HOLX',
 'WST', 'TFX', 'XRAY', 'STE', 'PODD', 'DXCM', 'ALGN', 'IDXX', 'MTD', 'IQV',
 'PKI', 'A', 'WAT', 'TECH', 'QGEN', 'MKTX', 'TMO', 'DHR', 'ABT', 'SYK',
 
 // Emerging & Growth Stocks (200)
 'PLTR', 'SNOW', 'CRWD', 'ZS', 'DDOG', 'NET', 'OKTA', 'TWLO', 'ZM', 'DOCU',
 'U', 'DOCN', 'FSLY', 'WORK', 'TEAM', 'SHOP', 'SQ', 'HOOD', 'SOFI', 'UPST',
 'AFRM', 'LC', 'COIN', 'MSTR', 'TSLA', 'RIVN', 'LCID', 'NIO', 'XPEV', 'LI',
 'GOEV', 'NKLA', 'HYLN', 'RIDE', 'WKHS', 'SOLO', 'AYRO', 'BLNK', 'CHPT', 'EVGO',
 'PLUG', 'FCEL', 'BE', 'CLNE', 'GEVO', 'KTOS', 'MVIS', 'VLDR', 'LAZR', 'LIDR',
 'OUST', 'AEYE', 'GME', 'AMC', 'BBBY', 'BB', 'NOK', 'SNDL', 'TLRY', 'CGC',
 'ACB', 'APHA', 'CRON', 'HEXO', 'OGI', 'WEED', 'KERN', 'VFF', 'GRWG', 'IIPR',
 'SMG', 'HYFM', 'CUTR', 'JUSHF', 'TCNNF', 'GTBIF', 'CRLBF', 'GNLN', 'MSOS', 'YOLO',
 'THCX', 'POTX', 'MJ', 'CNBS', 'TOKE', 'MJUS', 'BUDZ', 'LEAF', 'BUZZ', 'HMMJ',
 'RBLX', 'UNITY', 'APP', 'DT', 'PLAN', 'SMAR', 'BILL', 'S', 'CRM', 'NOW',
 'WDAY', 'ADSK', 'ANSS', 'CDNS', 'SNPS', 'ORCL', 'VMW', 'CTSH', 'ACN', 'IBM',
 'EPAM', 'GLOB', 'TWTR', 'SNAP', 'PINS', 'MTCH', 'BMBL', 'UBER', 'LYFT', 'ABNB',
 'DASH', 'ETSY', 'EBAY', 'MELI', 'SE', 'BABA', 'JD', 'PDD', 'TME', 'BILI',
 'DOYU', 'HUYA', 'YY', 'MOMO', 'WB', 'SOHU', 'SINA', 'NTES', 'BIDU', 'IQ',
 'VIPS', 'WDC', 'STX', 'NTAP', 'PSTG', 'PURE', 'HPE', 'DELL', 'HPQ', 'XEROX',
 'LOGI', 'CRSR', 'HEAR', 'GPRO', 'SONO', 'VUZI', 'KOPN', 'HIMX', 'FEIM', 'PIX',
 'IMMR', 'INVZ', 'OLED', 'KOSS', 'VUZIX', 'WISA', 'CETX', 'DGLY', 'MARK', 'VISL',
 'XELA', 'BBIG', 'PROG', 'ATER', 'CEI', 'GREE', 'SPRT', 'IRNT', 'OPAD', 'TMC',
 'RIDE', 'GOEV', 'NKLA', 'HYLN', 'WKHS', 'SOLO', 'AYRO', 'IDEX', 'ELMS', 'ARVL',
 'PSNY', 'PTRA', 'CHPT', 'BLNK', 'EVGO', 'DCFC', 'WBX', 'STEM', 'RUN', 'SEDG'
];

interface GEXData {
 ticker: string;
 attractionLevel: number;
 dealerSweat: number;
 currentPrice: number;
 netGex: number;
 marketCap?: number;
 gexImpactScore?: number;
 // Wall data for Support/Resistance
 largestWall?: {
 strike: number;
 gex: number;
 type: 'call' | 'put';
 pressure: number; // 1-100 based on distance to wall
 cluster?: {
 strikes: number[];
 centralStrike: number;
 totalGEX: number;
 contributions: number[]; // Percentage contributions
 type: 'call' | 'put';
 };
 };
}

// Get market cap data from Polygon
async function getMarketCap(symbol: string): Promise<number> {
 try {
 const response = await fetch(
 `https://api.polygon.io/v3/reference/tickers/${symbol}?apikey=${POLYGON_API_KEY}`,
 { next: { revalidate: 86400 } } // Cache for 24 hours (market cap changes slowly)
 );
 
 if (!response.ok) {
 throw new Error(`Failed to fetch market cap for ${symbol}`);
 }
 
 const data = await response.json();
 const marketCap = data.results?.market_cap;
 
 return marketCap || 0;
 } catch (error) {
 console.error(`Error fetching market cap for ${symbol}:`, error);
 return 0;
 }
}

// Calculate GEX Impact Score: how much the GEX can move the stock relative to market cap
function calculateGEXImpactScore(gexValue: number, marketCap: number): number {
 if (marketCap === 0) return 0;
 
 // Convert GEX from billions to actual value, and market cap is already in dollars
 const gexDollars = Math.abs(gexValue) * 1e9;
 
 // Calculate GEX as percentage of market cap
 const gexToMarketCapRatio = gexDollars / marketCap;
 
 let impactScore: number;
 
 // Different scaling for different market cap tiers
 if (marketCap >= 1e12) { // $1T+ mega-caps (NVDA, AAPL, MSFT, etc.)
 // Realistic scaling based on actual GEX levels: 0.5% = 100 points, 0.25% = 50 points
 impactScore = Math.min(100, (gexToMarketCapRatio * 20000));
 } else if (marketCap >= 500e9) { // $500B-$1T large caps
 // Medium scaling: 1.5% = 100 points, 0.75% = 50 points
 impactScore = Math.min(100, (gexToMarketCapRatio * 6667));
 } else if (marketCap >= 100e9) { // $100B-$500B mid-large caps
 // Standard scaling: 1% = 100 points, 0.5% = 50 points
 impactScore = Math.min(100, (gexToMarketCapRatio * 10000));
 } else { // <$100B smaller caps
 // More sensitive scaling: 0.5% = 100 points, 0.25% = 50 points
 impactScore = Math.min(100, (gexToMarketCapRatio * 20000));
 }
 
 return Math.round(impactScore);
}

// Get options data using the same method as the working GEX endpoint
async function getOptionsData(symbol: string, baseUrl: string): Promise<any> {
 try {
 const response = await fetch(`${baseUrl}/api/options-chain?ticker=${symbol}`);
 
 if (!response.ok) {
 throw new Error(`Failed to fetch options chain for ${symbol}`);
 }
 
 const result = await response.json();
 
 if (!result.success) {
 throw new Error(`Options chain API error for ${symbol}`);
 }
 
 return result;
 } catch (error) {
 console.error(`Error fetching options data for ${symbol}:`, error);
 return null;
 }
}

// Helper function to classify and filter expiration dates based on actual available data
function filterExpirationsByType(expirationDates: string[], filter: string): string[] {
 const today = new Date();
 
 // Parse and sort expiration dates
 const validDates = expirationDates
 .map(dateStr => ({ dateStr, date: new Date(dateStr) }))
 .filter(item => item.date >= today) // Only future expirations
 .sort((a, b) => a.date.getTime() - b.date.getTime());

 if (validDates.length === 0) {
 return [];
 }

 console.log(` ${filter} filter: Analyzing ${validDates.length} available future expirations`);

 switch (filter) {
 case 'Week':
 // Weekly options: Find ONLY the next weekly expiry (usually the closest Friday)
 const nextWeekly = validDates[0]; // First available expiration (closest)
 
 console.log(` Week: Using only next weekly expiry: ${nextWeekly.dateStr}`);
 return [nextWeekly.dateStr];
 
 case 'Month':
 // Monthly options: Find the monthly expiry (3rd Friday pattern) and include all weeklies up to it
 const monthlyExpiry = validDates.find(item => {
 const dayOfMonth = item.date.getDate();
 const dayOfWeek = item.date.getDay();
 // Monthly expiry is typically 3rd Friday (day 15-21, Friday = 5)
 return dayOfWeek === 5 && dayOfMonth >= 15 && dayOfMonth <= 21;
 });
 
 if (monthlyExpiry) {
 // Include all expirations up to and including the monthly expiry
 const monthlyExpirations = validDates.filter(item => item.date <= monthlyExpiry.date);
 console.log(` Month: Found monthly expiry ${monthlyExpiry.dateStr}, including ${monthlyExpirations.length} expirations up to it: ${monthlyExpirations.map(d => d.dateStr).join(', ')}`);
 return monthlyExpirations.map(d => d.dateStr);
 } else {
 // Fallback: use expirations within 35 days
 const monthOut = new Date(today.getTime() + 35 * 24 * 60 * 60 * 1000);
 const fallbackMonthly = validDates.filter(item => item.date <= monthOut);
 console.log(` Month: No clear monthly expiry found, using ${fallbackMonthly.length} expirations within 35 days`);
 return fallbackMonthly.map(d => d.dateStr);
 }
 
 case 'Quad':
 // Quadruple witching: Find the next quarterly expiration and include all expirations up to it
 const quarterlyMonths = [2, 5, 8, 11]; // Mar, Jun, Sep, Dec (0-indexed)
 
 const quarterlyExpiry = validDates.find(item => {
 const month = item.date.getMonth();
 const dayOfMonth = item.date.getDate();
 const dayOfWeek = item.date.getDay();
 // Quarterly expiry: 3rd Friday of Mar/Jun/Sep/Dec
 return quarterlyMonths.includes(month) && dayOfWeek === 5 && dayOfMonth >= 15 && dayOfMonth <= 21;
 });
 
 if (quarterlyExpiry) {
 // Include ALL expirations (weeklies + monthlies) up to the quarterly expiry
 const quadExpirations = validDates.filter(item => item.date <= quarterlyExpiry.date);
 console.log(` Quad: Found quarterly expiry ${quarterlyExpiry.dateStr}, including ${quadExpirations.length} expirations up to it: ${quadExpirations.map(d => d.dateStr).join(', ')}`);
 return quadExpirations.map(d => d.dateStr);
 }
 
 // Fallback: if no clear quarterly, use next 90 days
 const quarterOut = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
 const fallbackQuarterly = validDates.filter(item => item.date <= quarterOut);
 console.log(` Quad: No clear quarterly expiry found, using ${fallbackQuarterly.length} expirations within 90 days`);
 return fallbackQuarterly.map(d => d.dateStr);
 
 default: // 'Default'
 // Default: 45 days out
 const fortyFiveDaysOut = new Date(today.getTime() + 45 * 24 * 60 * 60 * 1000);
 const defaultExpirations = validDates.filter(item => item.date <= fortyFiveDaysOut);
 console.log(` Default: Found ${defaultExpirations.length} expirations within 45 days`);
 return defaultExpirations.map(d => d.dateStr);
 }
}

// Calculate GEX levels for a single symbol using the same logic as working GEX endpoint
async function calculateSymbolGEX(symbol: string, baseUrl: string, expirationFilter: string = 'Default'): Promise<GEXData | null> {
 try {
 const [optionsData, marketCap] = await Promise.all([
 getOptionsData(symbol, baseUrl),
 getMarketCap(symbol)
 ]);
 
 if (!optionsData || !optionsData.data) {
 return null;
 }

 const currentPrice = optionsData.currentPrice;
 const expirationDates = Object.keys(optionsData.data).sort();
 
 // Filter expirations based on the actual available data
 console.log(` ${symbol}: Available expirations: ${expirationDates.slice(0, 5).join(', ')}${expirationDates.length > 5 ? '...' : ''}`);
 
 const validExpirations = filterExpirationsByType(expirationDates, expirationFilter);

 console.log(` ${symbol}: Selected ${validExpirations.length} expirations for ${expirationFilter} filter: ${validExpirations.join(', ')}`);

 if (validExpirations.length === 0) {
 return null;
 }

 // Calculate GEX by strike using the same method as working GEX endpoint
 const gexByStrike: { [strike: number]: { callGEX: number; putGEX: number; netGEX: number } } = {};
 let totalNetGex = 0;

 for (const expDate of validExpirations) {
 const { calls, puts } = optionsData.data[expDate];
 
 // Process calls
 if (calls) {
 Object.entries(calls).forEach(([strike, data]: [string, any]) => {
 const strikeNum = parseFloat(strike);
 const oi = data.open_interest || 0;
 const gamma = data.greeks?.gamma || 0;
 
 if (oi > 0 && gamma) {
 const gex = gamma * oi * (currentPrice * currentPrice) * 100;
 
 if (!gexByStrike[strikeNum]) {
 gexByStrike[strikeNum] = { callGEX: 0, putGEX: 0, netGEX: 0 };
 }
 gexByStrike[strikeNum].callGEX += gex;
 totalNetGex += gex;
 }
 });
 }
 
 // Process puts
 if (puts) {
 Object.entries(puts).forEach(([strike, data]: [string, any]) => {
 const strikeNum = parseFloat(strike);
 const oi = data.open_interest || 0;
 const gamma = data.greeks?.gamma || 0;
 
 if (oi > 0 && gamma) {
 const gex = -gamma * oi * (currentPrice * currentPrice) * 100; // Negative for puts
 
 if (!gexByStrike[strikeNum]) {
 gexByStrike[strikeNum] = { callGEX: 0, putGEX: 0, netGEX: 0 };
 }
 gexByStrike[strikeNum].putGEX += gex;
 totalNetGex += gex;
 }
 });
 }
 }

 // Calculate net GEX for each strike
 Object.keys(gexByStrike).forEach(strike => {
 const strikeNum = parseFloat(strike);
 gexByStrike[strikeNum].netGEX = gexByStrike[strikeNum].callGEX + gexByStrike[strikeNum].putGEX;
 });

 // Find attraction level (strike with highest absolute net GEX)
 let maxAbsGex = 0;
 let attractionLevel = currentPrice;
 let dealerSweat = 0;

 Object.keys(gexByStrike).forEach(strike => {
 const strikeNum = parseFloat(strike);
 const netGex = gexByStrike[strikeNum].netGEX;
 const absGex = Math.abs(netGex);
 
 if (absGex > maxAbsGex) {
 maxAbsGex = absGex;
 attractionLevel = strikeNum;
 dealerSweat = netGex / 1e9; // Convert to billions
 }
 });

 // Find clustered GEX zones (2-4 strikes with highest combined GEX, no single strike >60%)
 const levels = Object.entries(gexByStrike)
 .map(([strike, data]) => ({ strike: parseFloat(strike), ...data }))
 .sort((a, b) => a.strike - b.strike); // Sort by strike price for adjacency

 // Function to find the best GEX cluster for a given type (call or put)
 function findBestGEXCluster(strikeData: any[], gexType: 'callGEX' | 'putGEX') {
 const validStrikes = strikeData.filter(s => 
 gexType === 'callGEX' ? s.callGEX > 0 : s.putGEX < 0
 );
 
 if (validStrikes.length < 2) return null;

 let bestCluster = null;
 let maxClusterGEX = 0;

 // Try clusters of size 2, 3, and 4
 for (let clusterSize = 2; clusterSize <= Math.min(4, validStrikes.length); clusterSize++) {
 const minContribution = clusterSize === 2 ? 0.27 : clusterSize === 3 ? 0.27 : 0.20; // 27% for 2-3 strikes, 20% for 4 strikes
 
 // Try all possible consecutive clusters of this size
 for (let i = 0; i <= validStrikes.length - clusterSize; i++) {
 const cluster = validStrikes.slice(i, i + clusterSize);
 
 // Calculate total GEX for this cluster
 const clusterGEXValues = cluster.map(s => 
 gexType === 'callGEX' ? s.callGEX : Math.abs(s.putGEX)
 );
 const totalClusterGEX = clusterGEXValues.reduce((sum, gex) => sum + gex, 0);
 
 // Check distribution constraints
 const contributions = clusterGEXValues.map(gex => gex / totalClusterGEX);
 const maxContribution = Math.max(...contributions);
 const minContributionFound = Math.min(...contributions);
 
 // Validate constraints: no single strike >60%, no strike <minimum%
 if (maxContribution <= 0.60 && minContributionFound >= minContribution) {
 if (totalClusterGEX > maxClusterGEX) {
 maxClusterGEX = totalClusterGEX;
 
 // Find the central strike (weighted average by GEX)
 const weightedSum = cluster.reduce((sum, s, idx) => 
 sum + (s.strike * clusterGEXValues[idx]), 0
 );
 const centralStrike = weightedSum / totalClusterGEX;
 
 bestCluster = {
 strikes: cluster.map(s => s.strike),
 centralStrike: Math.round(centralStrike * 100) / 100, // Round to nearest cent
 totalGEX: totalClusterGEX,
 contributions: contributions.map(c => Math.round(c * 100)), // Convert to percentages
 type: gexType === 'callGEX' ? 'call' as const : 'put' as const
 };
 }
 }
 }
 }
 
 return bestCluster;
 }

 // Find best call and put clusters
 const bestCallCluster = findBestGEXCluster(levels, 'callGEX');
 const bestPutCluster = findBestGEXCluster(levels, 'putGEX');
 
 // Choose the largest cluster overall
 let largestWall = null;
 
 if (bestCallCluster && bestPutCluster) {
 if (bestCallCluster.totalGEX > bestPutCluster.totalGEX) {
 largestWall = {
 strike: bestCallCluster.centralStrike,
 gex: bestCallCluster.totalGEX / 1e9, // Convert to billions
 type: 'call' as const,
 cluster: bestCallCluster
 };
 } else {
 largestWall = {
 strike: bestPutCluster.centralStrike,
 gex: bestPutCluster.totalGEX / 1e9, // Convert to billions 
 type: 'put' as const,
 cluster: bestPutCluster
 };
 }
 } else if (bestCallCluster) {
 largestWall = {
 strike: bestCallCluster.centralStrike,
 gex: bestCallCluster.totalGEX / 1e9,
 type: 'call' as const,
 cluster: bestCallCluster
 };
 } else if (bestPutCluster) {
 largestWall = {
 strike: bestPutCluster.centralStrike,
 gex: bestPutCluster.totalGEX / 1e9,
 type: 'put' as const,
 cluster: bestPutCluster
 };
 }

 // Calculate pressure (distance to wall) - closer to wall = higher pressure
 let wallWithPressure = null;
 if (largestWall) {
 const distanceToWall = Math.abs(currentPrice - largestWall.strike);
 const priceRange = currentPrice * 0.2; // 20% of current price as max range
 const pressureScore = Math.max(1, Math.min(100, 100 - (distanceToWall / priceRange * 100)));
 
 wallWithPressure = {
 ...largestWall,
 pressure: Math.round(pressureScore)
 };
 }

 const netGexBillions = totalNetGex / 1e9;
 const gexImpactScore = calculateGEXImpactScore(dealerSweat, marketCap);

 return {
 ticker: symbol,
 attractionLevel,
 dealerSweat,
 currentPrice,
 netGex: netGexBillions,
 marketCap,
 gexImpactScore,
 largestWall: wallWithPressure || undefined
 };

 } catch (error) {
 console.error(`Error calculating GEX for ${symbol}:`, error);
 return null;
 }
}

// Process symbols in parallel batches with proper concurrency control
async function processBatchParallel(symbols: string[], baseUrl: string, expirationFilter: string = 'Default', maxConcurrency: number = 10): Promise<GEXData[]> {
 const results: GEXData[] = [];
 
 // Process in chunks of maxConcurrency
 for (let i = 0; i < symbols.length; i += maxConcurrency) {
 const batch = symbols.slice(i, i + maxConcurrency);
 const batchPromises = batch.map(symbol => calculateSymbolGEX(symbol, baseUrl, expirationFilter));
 
 const batchResults = await Promise.allSettled(batchPromises);
 
 const validResults = batchResults
 .filter((result): result is PromiseFulfilledResult<GEXData> => 
 result.status === 'fulfilled' && result.value !== null
 )
 .map(result => result.value);
 
 results.push(...validResults);
 
 // Small delay between batches to avoid overwhelming APIs
 if (i + maxConcurrency < symbols.length) {
 await new Promise(resolve => setTimeout(resolve, 50));
 }
 }
 
 return results;
}

// Legacy function for backward compatibility
async function processBatch(symbols: string[], baseUrl: string, expirationFilter: string = 'Default'): Promise<GEXData[]> {
 return processBatchParallel(symbols, baseUrl, expirationFilter, 5);
}

export async function GET(request: NextRequest) {
 try {
 const { searchParams } = new URL(request.url);
 const limit = Math.min(parseInt(searchParams.get('limit') || '1000'), 1000);
 const streaming = searchParams.get('stream') === 'true';
 const expirationFilter = searchParams.get('expirationFilter') || 'Default';
 
 // If not streaming, use optimized parallel batch processing
 if (!streaming) {
 // Get base URL for internal API calls
 const host = request.nextUrl.host;
 const protocol = request.nextUrl.protocol;
 const baseUrl = `${protocol}//${host}`;
 
 // Process all 1000 symbols with higher concurrency for non-streaming
 const symbolsToProcess = TOP_SCREENER_SYMBOLS.slice(0, Math.min(limit, 1000));
 console.log(` Processing ${symbolsToProcess.length} symbols in parallel batches for ${expirationFilter} filter`);
 
 const startTime = Date.now();
 const allResults = await processBatchParallel(symbolsToProcess, baseUrl, expirationFilter, 15); // Higher concurrency
 const processingTime = Date.now() - startTime;
 
 console.log(` Processed ${symbolsToProcess.length} symbols in ${processingTime}ms (${Math.round(symbolsToProcess.length / (processingTime / 1000))} symbols/sec)`);

 // Sort by GEX Impact Score (highest impact relative to market cap first)
 const sortedResults = allResults
 .filter(result => result.dealerSweat !== 0)
 .sort((a, b) => (b.gexImpactScore || 0) - (a.gexImpactScore || 0));

 return NextResponse.json({
 success: true,
 data: sortedResults,
 timestamp: new Date().toISOString(),
 count: sortedResults.length,
 processingTimeMs: processingTime,
 symbolsProcessed: symbolsToProcess.length,
 expirationFilter
 });
 }

 // Streaming response for real-time updates
 const encoder = new TextEncoder();
 const stream = new ReadableStream({
 async start(controller) {
 try {
 // Get base URL for internal API calls
 const host = request.nextUrl.host;
 const protocol = request.nextUrl.protocol;
 const baseUrl = `${protocol}//${host}`;
 
 const symbolsToProcess = TOP_SCREENER_SYMBOLS.slice(0, Math.min(limit, 1000));
 const allResults: GEXData[] = [];
 
 // Send initial message
 controller.enqueue(encoder.encode(`data: ${JSON.stringify({
 type: 'start',
 total: symbolsToProcess.length,
 timestamp: new Date().toISOString()
 })}\n\n`));
 
 // Process symbols one by one for real-time updates
 for (let i = 0; i < symbolsToProcess.length; i++) {
 const symbol = symbolsToProcess[i];
 
 try {
 const result = await calculateSymbolGEX(symbol, baseUrl, expirationFilter);
 
 if (result && result.dealerSweat !== 0) {
 allResults.push(result);
 
 // Send individual result
 controller.enqueue(encoder.encode(`data: ${JSON.stringify({
 type: 'result',
 data: result,
 progress: i + 1,
 total: symbolsToProcess.length,
 timestamp: new Date().toISOString()
 })}\n\n`));
 }
 } catch (error) {
 console.error(`Error processing ${symbol}:`, error);
 }
 
 // Small delay to avoid overwhelming - reduced for faster processing
 if (i < symbolsToProcess.length - 1) {
 await new Promise(resolve => setTimeout(resolve, 25));
 }
 }
 
 // Send final sorted results by GEX Impact Score
 const sortedResults = allResults
 .sort((a, b) => (b.gexImpactScore || 0) - (a.gexImpactScore || 0));
 
 controller.enqueue(encoder.encode(`data: ${JSON.stringify({
 type: 'complete',
 data: sortedResults,
 count: sortedResults.length,
 timestamp: new Date().toISOString()
 })}\n\n`));
 
 controller.close();
 } catch (error) {
 controller.enqueue(encoder.encode(`data: ${JSON.stringify({
 type: 'error',
 error: error instanceof Error ? error.message : 'Unknown error',
 timestamp: new Date().toISOString()
 })}\n\n`));
 controller.close();
 }
 }
 });

 return new Response(stream, {
 headers: {
 'Content-Type': 'text/event-stream',
 'Cache-Control': 'no-cache',
 'Connection': 'keep-alive'
 }
 });

 } catch (error) {
 console.error('GEX Screener API Error:', error);
 return NextResponse.json(
 { 
 success: false, 
 error: 'Failed to fetch GEX screener data',
 timestamp: new Date().toISOString()
 },
 { status: 500 }
 );
 }
}

export async function POST(request: NextRequest) {
 try {
 const body = await request.json();
 const { symbols } = body;
 
 if (!symbols || !Array.isArray(symbols)) {
 return NextResponse.json(
 { success: false, error: 'Invalid symbols array' },
 { status: 400 }
 );
 }

 // Get base URL for internal API calls
 const host = request.nextUrl.host;
 const protocol = request.nextUrl.protocol;
 const baseUrl = `${protocol}//${host}`;

 const batchSize = 5;
 const batches = [];
 
 for (let i = 0; i < symbols.length; i += batchSize) {
 batches.push(symbols.slice(i, i + batchSize));
 }

 const allResults: GEXData[] = [];
 
 for (let i = 0; i < batches.length; i++) {
 const batchResults = await processBatch(batches[i], baseUrl);
 allResults.push(...batchResults);
 
 if (i < batches.length - 1) {
 await new Promise(resolve => setTimeout(resolve, 200));
 }
 }

 const sortedResults = allResults
 .filter(result => result.dealerSweat !== 0)
 .sort((a, b) => Math.abs(b.dealerSweat) - Math.abs(a.dealerSweat));

 return NextResponse.json({
 success: true,
 data: sortedResults,
 timestamp: new Date().toISOString(),
 count: sortedResults.length
 });

 } catch (error) {
 console.error('GEX Screener POST API Error:', error);
 return NextResponse.json(
 { 
 success: false, 
 error: 'Failed to process custom symbols',
 timestamp: new Date().toISOString()
 },
 { status: 500 }
 );
 }
}