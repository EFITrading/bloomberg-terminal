// Industry Analysis Service for Market Regimes

// Helper function to calculate trading days (excluding weekends)
function calculateTradingDays(targetTradingDays: number): number {
  // Approximate: 5 trading days per 7 calendar days
  // Add 40% buffer to account for weekends and ensure we get enough data
  const calendarDays = Math.ceil(targetTradingDays * 1.4);
  return Math.max(calendarDays, targetTradingDays + 4); // Ensure minimum buffer
}

// US Market holidays for 2025 (add more years as needed)
const US_MARKET_HOLIDAYS_2025 = [
  '2025-01-01', // New Year's Day
  '2025-01-20', // MLK Day
  '2025-02-17', // Presidents Day
  '2025-04-18', // Good Friday
  '2025-05-26', // Memorial Day
  '2025-06-19', // Juneteenth
  '2025-07-04', // Independence Day
  '2025-09-01', // Labor Day
  '2025-11-27', // Thanksgiving
  '2025-12-25', // Christmas
];

function isMarketOpen(date: Date): boolean {
  const day = date.getDay();
  // 0 = Sunday, 6 = Saturday
  if (day === 0 || day === 6) return false;

  const dateStr = date.toISOString().split('T')[0];
  if (US_MARKET_HOLIDAYS_2025.includes(dateStr)) return false;

  return true;
}

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
  legacy: TimeframeAnalysis;
}

// Industry ETFs with their major holdings - NO DUPLICATES
// Consolidated from 55 to 25 industries by combining similar sectors
export const INDUSTRY_ETFS: IndustryETF[] = [
  // 1. Semiconductors & Quantum
  {
    symbol: 'SMH',
    name: 'Semiconductors & Quantum',
    category: 'Technology',
    holdings: ['TSM', 'NVDA', 'AVGO', 'AMD', 'QCOM', 'MU', 'INTC', 'AMAT', 'ADI', 'MRVL', 'IONQ', 'QUBT', 'QBTS', 'RGTI', 'ARQQ', 'QSI', 'QTUM']
  },

  // 2. Enterprise Software & Cybersecurity
  {
    symbol: 'IGV',
    name: 'Enterprise Software & Security',
    category: 'Technology',
    holdings: ['MSFT', 'CRM', 'ORCL', 'ADBE', 'NOW', 'INTU', 'WDAY', 'PLTR', 'DDOG', 'TEAM', 'GTLB', 'PANW', 'CRWD', 'FTNT', 'ZS', 'OKTA', 'CHKP', 'GEN', 'CYBR', 'S', 'RPD']
  },

  // 3. Cloud Infrastructure & Data Centers
  {
    symbol: 'SKYY',
    name: 'Cloud & Data Centers',
    category: 'Technology',
    holdings: ['AMZN', 'GOOGL', 'NET', 'SNOW', 'CFLT', 'MDB', 'ESTC', 'DBX', 'BOX', 'FIVN', 'EQIX', 'DLR', 'CCI', 'SBAC', 'AMT', 'CONE', 'CWEN', 'QTS', 'FSLY', 'ANET']
  },

  // 4. Internet, E-Commerce & Fintech
  {
    symbol: 'FDN',
    name: 'Internet & Fintech',
    category: 'Technology',
    holdings: ['META', 'NFLX', 'UBER', 'SHOP', 'SPOT', 'EBAY', 'PYPL', 'SQ', 'DASH', 'ABNB', 'COIN', 'ROKU', 'ZM', 'HOOD', 'PATH', 'RBLX', 'U', 'MARA', 'RIOT', 'AFRM', 'UPST']
  },

  // 5. Tech Hardware & Robotics
  {
    symbol: 'VGT',
    name: 'Hardware & Robotics',
    category: 'Technology',
    holdings: ['AAPL', 'CSCO', 'IBM', 'HPQ', 'DELL', 'WDC', 'STX', 'NTAP', 'PSTG', 'SMCI', 'ARM', 'HPE', 'ISRG', 'ROK', 'EMR', 'ADSK', 'TER', 'KLAC', 'LRCX', 'ASML', 'ABB', 'SYM', 'ZBRA', 'CGNX']
  },

  // 6. Innovation & Electric Vehicles
  {
    symbol: 'ARKK',
    name: 'Innovation & EV',
    category: 'Innovation',
    holdings: ['TSLA', 'RIVN', 'LCID', 'F', 'GM', 'XPEV', 'LI', 'APTV', 'BWA']
  },

  // 7. Oil & Gas (Combined Traditional Energy)
  {
    symbol: 'XOP',
    name: 'Oil & Gas',
    category: 'Energy',
    holdings: ['XOM', 'CVX', 'COP', 'EOG', 'PSX', 'VLO', 'MPC', 'OXY', 'WMB', 'KMI', 'EQT', 'APA', 'DVN', 'FANG', 'MRO', 'CNX', 'OVV', 'CLR', 'CHRD', 'HES', 'SLB', 'HAL', 'BKR', 'FTI', 'NOV', 'HP', 'PTEN', 'OII', 'WHD', 'LBRT', 'AR', 'KNTK', 'SWN', 'RRC', 'COG', 'CTRA', 'NEXT', 'CPG', 'STNG', 'TRMD']
  },

  // 8. Renewable Energy
  {
    symbol: 'TAN',
    name: 'Renewable Energy',
    category: 'Clean Energy',
    holdings: ['FSLR', 'ENPH', 'JKS', 'DQ', 'CSIQ', 'RUN', 'ARRY', 'SEDG', 'BE', 'NEE', 'EIX', 'GPRE', 'ORA', 'ITRI']
  },

  // 9. Nuclear Energy
  {
    symbol: 'URA',
    name: 'Nuclear Energy',
    category: 'Nuclear',
    holdings: ['CCJ', 'KAP', 'NXE', 'UEC', 'UUUU', 'LEU', 'LTBR', 'SMR', 'BWXT', 'OKLO']
  },

  // 10. Precious Metals (Gold & Silver)
  {
    symbol: 'GDX',
    name: 'Precious Metals',
    category: 'Materials',
    holdings: ['NEM', 'GOLD', 'AEM', 'WPM', 'KGC', 'FNV', 'AU', 'HMY', 'RGLD', 'IAG', 'AG', 'PAAS', 'CDE', 'HL', 'FSM', 'EXK', 'SILV', 'SVM', 'USAS', 'MAG']
  },

  // 11. Strategic Metals (Lithium, Rare Earth, Battery Tech)
  {
    symbol: 'LIT',
    name: 'Strategic Metals & Battery',
    category: 'Materials',
    holdings: ['ALB', 'SQM', 'LAC', 'LTHM', 'PLL', 'SGML', 'LPI', 'MP', 'PIL']
  },

  // 12. Industrial Metals (Steel, Copper, Mining)
  {
    symbol: 'SLX',
    name: 'Industrial Metals',
    category: 'Materials',
    holdings: ['NUE', 'STLD', 'CLF', 'X', 'RS', 'CMC', 'ATI', 'ZEUS', 'WOR', 'TX', 'FCX', 'SCCO', 'VALE', 'TECK', 'FM', 'HBM', 'IVN', 'ERO', 'ARLP', 'AA', 'APD', 'LIN', 'SHW', 'ECL', 'DD', 'DOW', 'PPG', 'CTVA', 'EMN']
  },

  // 13. Life Sciences (Biotech & Pharma)
  {
    symbol: 'XBI',
    name: 'Life Sciences',
    category: 'Healthcare',
    holdings: ['MRNA', 'VRTX', 'REGN', 'ILMN', 'BMRN', 'ALNY', 'TECH', 'SRPT', 'RARE', 'JNJ', 'PFE', 'ABBV', 'MRK', 'BMY', 'LLY', 'GILD', 'AMGN', 'BIIB', 'ZTS']
  },

  // 14. Healthcare Services (Devices & Providers)
  {
    symbol: 'IHI',
    name: 'Healthcare Services',
    category: 'Healthcare',
    holdings: ['TMO', 'ABT', 'DHR', 'MDT', 'SYK', 'BDX', 'BSX', 'EW', 'DXCM', 'ALGN', 'UNH', 'CI', 'CVS', 'HUM', 'CNC', 'MOH', 'ELV', 'HCA', 'UHS']
  },

  // 15. Banking (Regional & Capital Markets)
  {
    symbol: 'KRE',
    name: 'Banking',
    category: 'Financial',
    holdings: ['JPM', 'BAC', 'WFC', 'C', 'GS', 'MS', 'BLK', 'SPGI', 'MCO', 'CME', 'USB', 'PNC', 'TFC', 'COF', 'MTB', 'FITB', 'HBAN', 'RF', 'KEY', 'CFG']
  },

  // 16. Financial Services (Insurance, Payments, Brokerages)
  {
    symbol: 'KIE',
    name: 'Financial Services',
    category: 'Financial',
    holdings: ['BRK.B', 'PGR', 'TRV', 'AIG', 'MET', 'PRU', 'ALL', 'CB', 'AFL', 'L', 'V', 'MA', 'AXP', 'FIS', 'FISV', 'ADP', 'PAYX', 'BR', 'TW', 'SOFI', 'IBKR', 'SCHW', 'NDAQ', 'ICE', 'MKTX', 'VIRT', 'LPLA', 'RJF', 'SF']
  },

  // 17. Real Estate & Construction
  {
    symbol: 'VNQ',
    name: 'Real Estate & Construction',
    category: 'Real Estate',
    holdings: ['PLD', 'PSA', 'WY', 'O', 'EXR', 'AVB', 'EQR', 'WELL', 'ARE', 'LEN', 'NVR', 'DHI', 'PHM', 'KBH', 'TOL', 'TPG', 'BZH', 'MTH', 'GRBK', 'HD', 'LOW', 'BLD', 'FND', 'BLDR', 'MAS', 'OC', 'VMC', 'MLM']
  },

  // 18. Aerospace & Aviation
  {
    symbol: 'ITA',
    name: 'Aerospace & Aviation',
    category: 'Aerospace',
    holdings: ['BA', 'RTX', 'LMT', 'NOC', 'GD', 'LHX', 'TXT', 'HWM', 'CW', 'TDG', 'DAL', 'UAL', 'AAL', 'LUV', 'ALK', 'JBLU', 'SAVE', 'HA', 'MESA', 'SKYW']
  },

  // 19. Transportation & Logistics
  {
    symbol: 'IYT',
    name: 'Transportation & Logistics',
    category: 'Transportation',
    holdings: ['UPS', 'FDX', 'UNP', 'CSX', 'NSC', 'KSU', 'CHRW', 'EXPD', 'JBHT', 'R']
  },

  // 20. Consumer Discretionary (Retail & Services)
  {
    symbol: 'XRT',
    name: 'Consumer Discretionary',
    category: 'Consumer',
    holdings: ['TJX', 'TGT', 'COST', 'WMT', 'DG', 'DLTR', 'BBY', 'ROST', 'GPS', 'ANF', 'MCD', 'SBUX', 'NKE', 'BKNG', 'CMG', 'YUM', 'DPZ', 'QSR', 'WEN', 'JACK']
  },

  // 21. Consumer Staples & Agriculture
  {
    symbol: 'VDC',
    name: 'Consumer Staples',
    category: 'Consumer',
    holdings: ['PG', 'KO', 'PEP', 'MDLZ', 'CL', 'KMB', 'GIS', 'HSY', 'K', 'CPB', 'ADM', 'BG', 'CF', 'DE', 'FMC', 'MOS', 'NTR', 'TSN', 'CAG', 'DAR']
  },

  // 22. Industrials & Utilities
  {
    symbol: 'VIS',
    name: 'Industrials & Utilities',
    category: 'Industrial',
    holdings: ['HON', 'CAT', 'GE', 'MMM', 'ITW', 'ETN', 'PH', 'CMI', 'FTV', 'AME', 'SO', 'DUK', 'AEP', 'SRE', 'D', 'PEG', 'EXC', 'XEL', 'ED', 'ES']
  },

  // 23. Digital Media & Entertainment
  {
    symbol: 'VOX',
    name: 'Digital Media',
    category: 'Communication',
    holdings: ['GOOG', 'DIS', 'VZ', 'T', 'CMCSA', 'TMUS', 'CHTR', 'ATVI', 'EA', 'TTWO', 'SNAP', 'TWTR', 'PINS', 'MTCH', 'IAC', 'Z', 'ZG', 'YELP', 'TRIP', 'NTES', 'SE', 'BILI', 'WB', 'SLGG', 'MGM', 'PENN', 'DKNG', 'CHDN', 'CZR', 'RSI', 'LVS', 'WYNN', 'BYD']
  },

  // 24. International Markets
  {
    symbol: 'EEM',
    name: 'International Markets',
    category: 'International',
    holdings: ['BABA', 'PDD', 'JD', 'BIDU', 'IBN', 'HDB', 'INFY', 'SNP', 'TME', 'VIPS', 'TAL', 'EDU', 'YY', 'MOMO', 'ATHM']
  },

  // 25. Infrastructure & Resources
  {
    symbol: 'IGF',
    name: 'Infrastructure & Resources',
    category: 'Infrastructure',
    holdings: ['EPD', 'PAGP', 'OKE', 'MMP', 'PAA', 'CEQP', 'GEL', 'ENLC', 'DCP', 'WM', 'RSG', 'WCN', 'CWST', 'CLH', 'SRCL', 'MEG', 'HASI', 'NVRI', 'PESI', 'PCH', 'RYN', 'CUT', 'RYAM', 'UFS', 'STOR', 'TREE', 'WOOD', 'TIPT']
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

    // Calculate actual calendar days needed to get the requested number of trading days
    const calendarDays = calculateTradingDays(days);

    try {
      const response = await fetch(`${this.baseUrl}/bulk-historical-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ symbols, days: calendarDays }), // Use calendar days for API
        signal: AbortSignal.timeout(120000) // 2 minute timeout for bulk fetch
      });

      if (response.ok) {
        const bulkResult = await response.json();
        if (bulkResult.success) {
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
    // Calculate actual calendar days needed to get the requested number of trading days
    const calendarDays = calculateTradingDays(days);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - calendarDays);
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
        return 0;
      }

      // Need at least 2 data points to calculate change
      if (etfData.results.length < 2 || spyData.results.length < 2) {
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

    // Exclude problematic symbols
    const excludedSymbols = new Set([
      'LYNAS', 'PIL', 'UCORE', 'ARAFQ', 'GWMGF', 'FM', 'CMMC', 'X', 'KAP', 'MRO',
      'CLR', 'HES', 'SWN', 'COG', 'NOVA', 'BLUE', 'TWTR', 'RELIANCE', 'ONEOK', 'MMP',
      'CEOP', 'ENLC', 'SAVE', 'HA', 'MESA', 'GPS'
    ]);

    // Analyze each holding using cached data
    for (const holding of etf.holdings) {
      if (excludedSymbols.has(holding)) continue;
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

    // Sort by performance and filter out any remaining excluded symbols
    holdingPerformances.sort((a, b) => b.relativePerformance - a.relativePerformance);
    const filtered = holdingPerformances.filter(h => !excludedSymbols.has(h.symbol));

    return {
      topPerformers: filtered.slice(0, 5), // Top 5 performers
      worstPerformers: filtered.slice(-5).reverse() // Bottom 5 performers
    };
  }

  // Analyze industry performance for a specific timeframe using bulk data
  static async analyzeTimeframe(days: number, timeframeName: string): Promise<TimeframeAnalysis> {
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
    // Collect all unique symbols (ETFs + holdings + SPY)
    const allSymbols = new Set<string>();
    allSymbols.add('SPY'); // Always include SPY for relative performance

    for (const etf of INDUSTRY_ETFS) {
      allSymbols.add(etf.symbol);
      for (const holding of etf.holdings) {
        allSymbols.add(holding);
      }
    }

    // Bulk fetch all historical data
    const historicalDataMap = await this.batchFetchHistoricalData(Array.from(allSymbols), days);

    const spyData = historicalDataMap.get('SPY');

    if (!spyData) {
      console.error('Failed to fetch SPY data');
      return {
        timeframe: timeframeName,
        days,
        industries: []
      };
    }

    const industries: IndustryPerformance[] = [];

    // Analyze each ETF using bulk data
    for (const etf of INDUSTRY_ETFS) {
      try {
        const etfData = historicalDataMap.get(etf.symbol);
        if (!etfData) {
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
        console.error(`Error analyzing ${etf.symbol}:`, error);
      }
    }

    // Sort by relative performance
    industries.sort((a, b) => b.relativePerformance - a.relativePerformance);

    return {
      timeframe: timeframeName,
      days,
      industries
    };
  }

  static async getMarketRegimeDataWithProgress(
    progressCallback?: (stage: string, progress: number) => void
  ): Promise<MarketRegimeData> {

    if (progressCallback) progressCallback('Initializing parallel analysis...', 10);

    // Track actual progress with Promise.allSettled to monitor completion
    const completedTasks = { count: 0, total: 4 };

    const trackablePromises = [
      this.analyzeTimeframe(5, 'Life').then(result => {
        completedTasks.count++;
        if (progressCallback) {
          const progress = 25 + (completedTasks.count / completedTasks.total) * 70;
          progressCallback(`Completed ${completedTasks.count}/${completedTasks.total} timeframes...`, progress);
        }
        return result;
      }),
      this.analyzeTimeframe(21, 'Developing').then(result => {
        completedTasks.count++;
        if (progressCallback) {
          const progress = 25 + (completedTasks.count / completedTasks.total) * 70;
          progressCallback(`Completed ${completedTasks.count}/${completedTasks.total} timeframes...`, progress);
        }
        return result;
      }),
      this.analyzeTimeframe(80, 'Momentum').then(result => {
        completedTasks.count++;
        if (progressCallback) {
          const progress = 25 + (completedTasks.count / completedTasks.total) * 70;
          progressCallback(`Completed ${completedTasks.count}/${completedTasks.total} timeframes...`, progress);
        }
        return result;
      }),
      this.analyzeTimeframe(180, 'Legacy').then(result => {
        completedTasks.count++;
        if (progressCallback) {
          const progress = 25 + (completedTasks.count / completedTasks.total) * 70;
          progressCallback(`Completed ${completedTasks.count}/${completedTasks.total} timeframes...`, progress);
        }
        return result;
      })
    ];

    try {
      const [life, developing, momentum, legacy] = await Promise.all(trackablePromises);

      if (progressCallback) progressCallback('Finalizing results...', 100);

      return { life, developing, momentum, legacy };
    } catch (error) {
      throw error;
    }
  }

  // STREAMING VERSION: Get market regime analysis with streaming results as they complete
  static async getMarketRegimeDataStreaming(
    progressCallback?: (stage: string, progress: number) => void,
    streamCallback?: (timeframe: string, data: TimeframeAnalysis) => void
  ): Promise<MarketRegimeData> {

    if (progressCallback) progressCallback('Initializing streaming analysis...', 5);

    // Initialize service and check API connection
    try {
      await this.initializeService();
    } catch (error) {
      console.error('Failed to initialize Market Regime Service:', error);
    }

    if (progressCallback) progressCallback('API connection verified, starting analysis...', 10);

    // Initialize empty result object
    const result: Partial<MarketRegimeData> = {};

    // Analysis configurations - use more calendar days to ensure sufficient trading days
    const timeframes = [
      { days: 5, name: 'life' as keyof MarketRegimeData, label: 'Life' },
      { days: 21, name: 'developing' as keyof MarketRegimeData, label: 'Developing' },
      { days: 80, name: 'momentum' as keyof MarketRegimeData, label: 'Momentum' },
      { days: 180, name: 'legacy' as keyof MarketRegimeData, label: 'Legacy' }
    ];

    // Execute analyses sequentially to prevent resource exhaustion
    const completedAnalyses: any[] = [];

    for (const { days, name, label } of timeframes) {
      try {
        if (progressCallback) progressCallback(`Analyzing ${label} timeframe (${days}d)...`, 20 + (timeframes.findIndex(t => t.name === name) * 20));

        const data = await this.analyzeTimeframe(days, label);
        result[name] = data;

        // Stream the result immediately when ready
        if (streamCallback) {
          streamCallback(label, data);
        }

        if (progressCallback) progressCallback(`${label} timeframe complete`, 30 + (timeframes.findIndex(t => t.name === name) * 20));

        completedAnalyses.push(data);
      } catch (error) {
        console.error(`Error analyzing ${label} timeframe:`, error);

        // Don't throw - instead create empty timeframe data and continue
        const emptyData: TimeframeAnalysis = {
          timeframe: label,
          days,
          industries: []
        };
        result[name] = emptyData;

        if (streamCallback) {
          streamCallback(label, emptyData);
        }

        completedAnalyses.push(emptyData);
      }
    }

    try {
      // All analyses are now complete
      if (progressCallback) progressCallback('All timeframes complete', 100);

      return result as MarketRegimeData;
    } catch (error) {
      console.error('Error in streaming market regime analysis:', error);

      // Return partial results even if there were errors
      return result as MarketRegimeData;
    }
  }

  // Get complete market regime analysis (original method for backwards compatibility)
  static async getMarketRegimeData(): Promise<MarketRegimeData> {
    return this.getMarketRegimeDataWithProgress();
  }
}
