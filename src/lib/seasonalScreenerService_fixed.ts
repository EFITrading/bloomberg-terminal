// Service for screening seasonal opportunities from top stocks
import PolygonService from './polygonService';

interface SeasonalOpportunity {
 symbol: string;
 companyName: string;
 sentiment: 'Bullish' | 'Bearish';
 period: string;
 startDate: string;
 endDate: string;
 averageReturn: number;
 winRate: number;
 years: number;
 daysUntilStart: number;
 isCurrentlyActive: boolean;
}

interface StockListItem {
 symbol: string;
 name: string;
 marketCap?: number;
}

// Top 500 US companies by market capitalization (as of 2024)
// Ordered from largest to smallest market cap for optimal priority processing
const TOP500_BY_MARKET_CAP: StockListItem[] = [
 { symbol: 'AAPL', name: 'Apple Inc.' },
 { symbol: 'MSFT', name: 'Microsoft Corporation' },
 { symbol: 'GOOGL', name: 'Alphabet Inc.' },
 { symbol: 'AMZN', name: 'Amazon.com Inc.' },
 { symbol: 'NVDA', name: 'NVIDIA Corporation' },
 { symbol: 'TSLA', name: 'Tesla Inc.' },
 { symbol: 'META', name: 'Meta Platforms Inc.' },
 { symbol: 'BRK.B', name: 'Berkshire Hathaway Inc.' },
 { symbol: 'UNH', name: 'UnitedHealth Group Inc.' },
 { symbol: 'JNJ', name: 'Johnson & Johnson' },
 { symbol: 'JPM', name: 'JPMorgan Chase & Co.' },
 { symbol: 'V', name: 'Visa Inc.' },
 { symbol: 'PG', name: 'Procter & Gamble Co.' },
 { symbol: 'HD', name: 'Home Depot Inc.' },
 { symbol: 'MA', name: 'Mastercard Inc.' },
 { symbol: 'XOM', name: 'Exxon Mobil Corporation' },
 { symbol: 'BAC', name: 'Bank of America Corp.' },
 { symbol: 'ABBV', name: 'AbbVie Inc.' },
 { symbol: 'WMT', name: 'Walmart Inc.' },
 { symbol: 'LLY', name: 'Eli Lilly and Co.' },
 { symbol: 'KO', name: 'Coca-Cola Co.' },
 { symbol: 'AVGO', name: 'Broadcom Inc.' },
 { symbol: 'PFE', name: 'Pfizer Inc.' },
 { symbol: 'TMO', name: 'Thermo Fisher Scientific Inc.' },
 { symbol: 'COST', name: 'Costco Wholesale Corp.' },
 { symbol: 'DIS', name: 'Walt Disney Co.' },
 { symbol: 'ABT', name: 'Abbott Laboratories' },
 { symbol: 'ACN', name: 'Accenture plc' },
 { symbol: 'NFLX', name: 'Netflix Inc.' },
 { symbol: 'VZ', name: 'Verizon Communications Inc.' },
 { symbol: 'ADBE', name: 'Adobe Inc.' },
 { symbol: 'CMCSA', name: 'Comcast Corporation' },
 { symbol: 'CRM', name: 'Salesforce Inc.' },
 { symbol: 'NKE', name: 'Nike Inc.' },
 { symbol: 'INTC', name: 'Intel Corporation' },
 { symbol: 'T', name: 'AT&T Inc.' },
 { symbol: 'CSCO', name: 'Cisco Systems Inc.' },
 { symbol: 'WFC', name: 'Wells Fargo & Co.' },
 { symbol: 'MCD', name: 'McDonald\'s Corporation' },
 { symbol: 'IBM', name: 'International Business Machines Corp.' },
 { symbol: 'GE', name: 'General Electric Co.' },
 { symbol: 'CVX', name: 'Chevron Corporation' },
 { symbol: 'CAT', name: 'Caterpillar Inc.' },
 { symbol: 'ORCL', name: 'Oracle Corporation' },
 { symbol: 'BA', name: 'Boeing Co.' },
 { symbol: 'AMGN', name: 'Amgen Inc.' },
 { symbol: 'AMD', name: 'Advanced Micro Devices Inc.' },
 { symbol: 'PM', name: 'Philip Morris International Inc.' },
 { symbol: 'UPS', name: 'United Parcel Service Inc.' },
 { symbol: 'HON', name: 'Honeywell International Inc.' },
 { symbol: 'QCOM', name: 'QUALCOMM Inc.' },
 { symbol: 'GS', name: 'Goldman Sachs Group Inc.' },
 { symbol: 'SBUX', name: 'Starbucks Corporation' },
 { symbol: 'LOW', name: 'Lowe\'s Companies Inc.' },
 { symbol: 'MS', name: 'Morgan Stanley' },
 { symbol: 'INTU', name: 'Intuit Inc.' },
 { symbol: 'BLK', name: 'BlackRock Inc.' },
 { symbol: 'AXP', name: 'American Express Co.' },
 { symbol: 'DE', name: 'Deere & Co.' },
 { symbol: 'BKNG', name: 'Booking Holdings Inc.' },
 { symbol: 'MDT', name: 'Medtronic plc' },
 { symbol: 'GILD', name: 'Gilead Sciences Inc.' },
 { symbol: 'ADP', name: 'Automatic Data Processing Inc.' },
 { symbol: 'TJX', name: 'TJX Companies Inc.' },
 { symbol: 'SYK', name: 'Stryker Corporation' },
 { symbol: 'CVS', name: 'CVS Health Corporation' },
 { symbol: 'MDLZ', name: 'Mondelez International Inc.' },
 { symbol: 'ISRG', name: 'Intuitive Surgical Inc.' },
 { symbol: 'NOW', name: 'ServiceNow Inc.' },
 { symbol: 'ZTS', name: 'Zoetis Inc.' },
 { symbol: 'PYPL', name: 'PayPal Holdings Inc.' },
 { symbol: 'TGT', name: 'Target Corporation' },
 { symbol: 'C', name: 'Citigroup Inc.' },
 { symbol: 'REGN', name: 'Regeneron Pharmaceuticals Inc.' },
 { symbol: 'MO', name: 'Altria Group Inc.' },
 { symbol: 'PLD', name: 'Prologis Inc.' },
 { symbol: 'SO', name: 'Southern Co.' },
 { symbol: 'CI', name: 'Cigna Corp.' },
 { symbol: 'SHW', name: 'Sherwin-Williams Co.' },
 { symbol: 'DUK', name: 'Duke Energy Corp.' },
 { symbol: 'BSX', name: 'Boston Scientific Corporation' },
 { symbol: 'AON', name: 'Aon plc' },
 { symbol: 'CME', name: 'CME Group Inc.' },
 { symbol: 'USB', name: 'U.S. Bancorp' },
 { symbol: 'MMM', name: '3M Co.' },
 { symbol: 'CSX', name: 'CSX Corporation' },
 { symbol: 'CL', name: 'Colgate-Palmolive Co.' },
 { symbol: 'FDX', name: 'FedEx Corporation' },
 { symbol: 'EOG', name: 'EOG Resources Inc.' },
 { symbol: 'PNC', name: 'PNC Financial Services Group Inc.' },
 { symbol: 'NSC', name: 'Norfolk Southern Corp.' },
 { symbol: 'SPGI', name: 'S&P Global Inc.' },
 { symbol: 'ITW', name: 'Illinois Tool Works Inc.' },
 { symbol: 'GD', name: 'General Dynamics Corporation' },
 { symbol: 'FCX', name: 'Freeport-McMoRan Inc.' },
 { symbol: 'SPG', name: 'Simon Property Group Inc.' },
 { symbol: 'GM', name: 'General Motors Co.' },
 { symbol: 'EMR', name: 'Emerson Electric Co.' },
 { symbol: 'FORD', name: 'Ford Motor Co.' },
 { symbol: 'MRK', name: 'Merck & Co. Inc.' },
 { symbol: 'SLB', name: 'Schlumberger NV' },
 { symbol: 'WM', name: 'Waste Management Inc.' },
 { symbol: 'ICE', name: 'Intercontinental Exchange Inc.' },
 { symbol: 'TRV', name: 'Travelers Companies Inc.' },
 { symbol: 'APD', name: 'Air Products & Chemicals Inc.' },
 { symbol: 'COP', name: 'ConocoPhillips' },
 { symbol: 'MCK', name: 'McKesson Corporation' },
 { symbol: 'BDX', name: 'Becton Dickinson and Co.' },
 { symbol: 'WBA', name: 'Walgreens Boots Alliance Inc.' },
 { symbol: 'MMC', name: 'Marsh & McLennan Companies Inc.' },
 { symbol: 'KMB', name: 'Kimberly-Clark Corporation' },
 { symbol: 'DG', name: 'Dollar General Corporation' },
 { symbol: 'EW', name: 'Edwards Lifesciences Corporation' },
 { symbol: 'NOC', name: 'Northrop Grumman Corporation' },
 { symbol: 'SRE', name: 'Sempra Energy' },
 { symbol: 'TFC', name: 'Truist Financial Corporation' },
 { symbol: 'CCI', name: 'Crown Castle International Corp.' },
 { symbol: 'LHX', name: 'L3Harris Technologies Inc.' },
 { symbol: 'HUM', name: 'Humana Inc.' },
 { symbol: 'SCHW', name: 'Charles Schwab Corporation' },
 { symbol: 'LRCX', name: 'Lam Research Corporation' },
 { symbol: 'FIS', name: 'Fidelity National Information Services Inc.' },
 { symbol: 'AEP', name: 'American Electric Power Co. Inc.' },
 { symbol: 'KHC', name: 'Kraft Heinz Co.' },
 { symbol: 'EL', name: 'Estee Lauder Companies Inc.' },
 { symbol: 'AMAT', name: 'Applied Materials Inc.' },
 { symbol: 'DXCM', name: 'DexCom Inc.' },
 { symbol: 'PSA', name: 'Public Storage' },
 { symbol: 'WELL', name: 'Welltower Inc.' },
 { symbol: 'AMT', name: 'American Tower Corporation' },
 { symbol: 'ROP', name: 'Roper Technologies Inc.' },
 { symbol: 'KLAC', name: 'KLA Corporation' },
 { symbol: 'DHR', name: 'Danaher Corporation' },
 { symbol: 'CTAS', name: 'Cintas Corporation' },
 { symbol: 'CARR', name: 'Carrier Global Corporation' },
 { symbol: 'ECL', name: 'Ecolab Inc.' },
 { symbol: 'ORLY', name: 'O\'Reilly Automotive Inc.' },
 { symbol: 'MCHP', name: 'Microchip Technology Inc.' },
 { symbol: 'EQIX', name: 'Equinix Inc.' },
 { symbol: 'MCO', name: 'Moody\'s Corporation' },
 { symbol: 'INFO', name: 'IHS Markit Ltd.' },
 { symbol: 'AFL', name: 'AFLAC Inc.' },
 { symbol: 'CNC', name: 'Centene Corporation' },
 { symbol: 'TDG', name: 'TransDigm Group Inc.' },
 { symbol: 'PAYX', name: 'Paychex Inc.' },
 { symbol: 'RSG', name: 'Republic Services Inc.' },
 { symbol: 'TROW', name: 'T. Rowe Price Group Inc.' },
 { symbol: 'ADI', name: 'Analog Devices Inc.' },
 { symbol: 'STZ', name: 'Constellation Brands Inc.' },
 { symbol: 'MSI', name: 'Motorola Solutions Inc.' },
 { symbol: 'FAST', name: 'Fastenal Co.' },
 { symbol: 'ROST', name: 'Ross Stores Inc.' },
 { symbol: 'VRSK', name: 'Verisk Analytics Inc.' },
 { symbol: 'EA', name: 'Electronic Arts Inc.' },
 { symbol: 'FISV', name: 'Fiserv Inc.' },
 { symbol: 'CTVA', name: 'Corteva Inc.' },
 { symbol: 'IDXX', name: 'IDEXX Laboratories Inc.' },
 { symbol: 'DD', name: 'DuPont de Nemours Inc.' },
 { symbol: 'GLW', name: 'Corning Inc.' },
 { symbol: 'IQV', name: 'IQVIA Holdings Inc.' },
 { symbol: 'RMD', name: 'ResMed Inc.' },
 { symbol: 'BK', name: 'Bank of New York Mellon Corp.' },
 { symbol: 'HPQ', name: 'HP Inc.' },
 { symbol: 'GPN', name: 'Global Payments Inc.' },
 { symbol: 'DOW', name: 'Dow Inc.' },
 { symbol: 'WEC', name: 'WEC Energy Group Inc.' },
 { symbol: 'ES', name: 'Eversource Energy' },
 { symbol: 'A', name: 'Agilent Technologies Inc.' },
 { symbol: 'EXC', name: 'Exelon Corporation' },
 { symbol: 'KEYS', name: 'Keysight Technologies Inc.' },
 { symbol: 'ZBH', name: 'Zimmer Biomet Holdings Inc.' },
 { symbol: 'ETN', name: 'Eaton Corporation plc' },
 { symbol: 'XEL', name: 'Xcel Energy Inc.' },
 { symbol: 'YUM', name: 'Yum! Brands Inc.' },
 { symbol: 'ANSS', name: 'ANSYS Inc.' },
 { symbol: 'CTSH', name: 'Cognizant Technology Solutions Corp.' },
 { symbol: 'DLTR', name: 'Dollar Tree Inc.' },
 { symbol: 'WY', name: 'Weyerhaeuser Co.' },
 { symbol: 'CERN', name: 'Cerner Corporation' },
 { symbol: 'MAR', name: 'Marriott International Inc.' },
 { symbol: 'FTNT', name: 'Fortinet Inc.' },
 { symbol: 'ROK', name: 'Rockwell Automation Inc.' },
 { symbol: 'AZO', name: 'AutoZone Inc.' },
 { symbol: 'HLT', name: 'Hilton Worldwide Holdings Inc.' },
 { symbol: 'VRTX', name: 'Vertex Pharmaceuticals Inc.' },
 { symbol: 'PSX', name: 'Phillips 66' },
 { symbol: 'HPE', name: 'Hewlett Packard Enterprise Co.' },
 { symbol: 'TSN', name: 'Tyson Foods Inc.' },
 { symbol: 'PCAR', name: 'PACCAR Inc.' },
 { symbol: 'MSCI', name: 'MSCI Inc.' },
 { symbol: 'VIAC', name: 'ViacomCBS Inc.' },
 { symbol: 'KMX', name: 'CarMax Inc.' },
 { symbol: 'APTV', name: 'Aptiv PLC' },
 { symbol: 'MXIM', name: 'Maxim Integrated Products Inc.' },
 { symbol: 'EFX', name: 'Equifax Inc.' },
 { symbol: 'ARE', name: 'Alexandria Real Estate Equities Inc.' },
 { symbol: 'BIIB', name: 'Biogen Inc.' },
 { symbol: 'STT', name: 'State Street Corporation' },
 { symbol: 'DRE', name: 'Duke Realty Corporation' },
 { symbol: 'ALGN', name: 'Align Technology Inc.' },
 { symbol: 'ZBRA', name: 'Zebra Technologies Corporation' },
 { symbol: 'CPRT', name: 'Copart Inc.' },
 { symbol: 'BF.B', name: 'Brown-Forman Corporation' },
 { symbol: 'COO', name: 'Cooper Companies Inc.' },
 { symbol: 'DFS', name: 'Discover Financial Services' },
 { symbol: 'CDW', name: 'CDW Corporation' },
 { symbol: 'GOOGL', name: 'Alphabet Inc. Class A' },
 { symbol: 'GOOG', name: 'Alphabet Inc. Class C' }
];

class SeasonalScreenerService {
 private polygonService: PolygonService;

 constructor() {
 this.polygonService = new PolygonService();
 }

 // Convert date string like "Sep 10" to day of year for current year
 private parseSeasonalDate(dateStr: string): number {
 const currentYear = new Date().getFullYear();
 const date = new Date(`${dateStr}, ${currentYear}`);
 return this.getDayOfYear(date);
 }

 private getDayOfYear(date: Date): number {
 const start = new Date(date.getFullYear(), 0, 0);
 const diff = date.getTime() - start.getTime();
 return Math.floor(diff / (1000 * 60 * 60 * 24));
 }

 // Check if a seasonal opportunity is currently active (within 5-day window)
 private isSeasonalCurrentlyActive(startDate: string): boolean {
 const today = new Date('2025-09-04'); // Current date from context
 const todayDayOfYear = this.getDayOfYear(today);
 
 // Parse the seasonal start date (e.g., "Sep 10" -> day of year)
 const seasonalStartDay = this.parseSeasonalDate(startDate);
 
 // Check if seasonal starts within 5 days (before or after today)
 const daysDifference = seasonalStartDay - todayDayOfYear;
 
 // Show seasonals that start between -3 days and +6 days from today
 // This gives us the 5-day window: 8/27/25 to 9/10/25
 return daysDifference >= -3 && daysDifference <= 6;
 }

 // Main screening function with bulk requests and configurable batch size
 async screenSeasonalOpportunities(years: number = 15, maxStocks: number = 100, startOffset: number = 0): Promise<SeasonalOpportunity[]> {
 const opportunities: SeasonalOpportunity[] = [];
 const seenSymbols = new Set<string>(); // Track processed symbols to avoid duplicates
 const actualMaxStocks = Math.min(maxStocks, TOP500_BY_MARKET_CAP.length - startOffset);
 console.log(` Starting bulk seasonal screening of ${actualMaxStocks} companies (positions ${startOffset + 1}-${startOffset + actualMaxStocks}) by market cap...`);

 try {
 // First, get SPY data for comparison (bulk request)
 console.log(` Getting SPY data for ${years} years...`);
 const spyData = await this.polygonService.getBulkHistoricalData('SPY', years);
 
 if (!spyData?.results?.length) {
 throw new Error('Failed to get SPY data for comparison');
 }

 console.log(` SPY data loaded: ${spyData.results.length} data points`);

 const stocksToProcess = TOP500_BY_MARKET_CAP.slice(startOffset, startOffset + actualMaxStocks);
 
 console.log(` Processing ALL ${stocksToProcess.length} companies in PARALLEL - NO LIMITS!`);
 
 // Process everything at once
 const allPromises = stocksToProcess.map(async (stock: StockListItem) => {
 try {
 // Skip if we've already processed this symbol
 if (seenSymbols.has(stock.symbol)) {
 console.log(` Skipping duplicate symbol: ${stock.symbol}`);
 return;
 }
 seenSymbols.add(stock.symbol);
 
 console.log(` Getting bulk data for ${stock.symbol}...`);
 
 // Use bulk historical data request
 const stockData = await this.polygonService.getBulkHistoricalData(stock.symbol, years);
 
 if (!stockData?.results?.length) {
 console.warn(` No bulk data for ${stock.symbol}`);
 return;
 }

 console.log(` ${stock.symbol}: ${stockData.results.length} data points`);
 
 // Process the seasonal analysis
 const analysis = this.processDailySeasonalData(
 stockData.results,
 spyData.results,
 stock.symbol,
 stock.name,
 years
 );
 
 if (analysis) {
 let bestOpportunity: SeasonalOpportunity | null = null;
 
 // Check bullish seasonal (best 30-day period)
 if (analysis.spyComparison?.best30DayPeriod) {
 const bullish = analysis.spyComparison.best30DayPeriod;
 if (this.isSeasonalCurrentlyActive(bullish.startDate)) {
 bestOpportunity = {
 symbol: stock.symbol,
 companyName: stock.name,
 sentiment: 'Bullish',
 period: bullish.period,
 startDate: bullish.startDate,
 endDate: bullish.endDate,
 averageReturn: bullish.return,
 winRate: analysis.statistics.winRate,
 years: analysis.statistics.yearsOfData,
 daysUntilStart: this.parseSeasonalDate(bullish.startDate) - this.getDayOfYear(new Date('2025-09-04')),
 isCurrentlyActive: true
 };
 console.log(` Found BULLISH seasonal for ${stock.symbol}: ${bullish.period} (+${bullish.return.toFixed(2)}%)`);
 }
 }
 
 // Check bearish seasonal (worst 30-day period)
 if (analysis.spyComparison?.worst30DayPeriod) {
 const bearish = analysis.spyComparison.worst30DayPeriod;
 if (this.isSeasonalCurrentlyActive(bearish.startDate)) {
 const bearishOpportunity: SeasonalOpportunity = {
 symbol: stock.symbol,
 companyName: stock.name,
 sentiment: 'Bearish',
 period: bearish.period,
 startDate: bearish.startDate,
 endDate: bearish.endDate,
 averageReturn: bearish.return,
 winRate: 100 - analysis.statistics.winRate, // Inverse for bearish
 years: analysis.statistics.yearsOfData,
 daysUntilStart: this.parseSeasonalDate(bearish.startDate) - this.getDayOfYear(new Date('2025-09-04')),
 isCurrentlyActive: true
 };
 
 // Only use bearish if no bullish found, or if bearish is much stronger
 if (!bestOpportunity || Math.abs(bearish.return) > Math.abs(bestOpportunity.averageReturn) * 1.5) {
 bestOpportunity = bearishOpportunity;
 console.log(` Found BEARISH seasonal for ${stock.symbol}: ${bearish.period} (${bearish.return.toFixed(2)}%)`);
 }
 }
 }
 
 // Only add the best opportunity for this symbol
 if (bestOpportunity) {
 opportunities.push(bestOpportunity);
 }
 }
 } catch (error) {
 console.warn(` Failed to process ${stock.symbol}:`, error);
 }
 });

 // Wait for ALL requests to complete at once - NO BATCHING!
 await Promise.all(allPromises);

 } catch (error) {
 console.error('? Bulk screening failed:', error);
 
 // Try to return partial results if we have any
 if (opportunities.length > 0) {
 console.log(`?? Returning ${opportunities.length} partial results despite error`);
 return opportunities;
 }
 
 // No fallback data - throw the error to be handled by the API layer
 throw error;
 }

 // Remove any remaining duplicates by symbol (safety check)
 const uniqueOpportunities = opportunities.filter((opportunity, index, array) => 
 array.findIndex(o => o.symbol === opportunity.symbol) === index
 );

 // Sort by absolute return (strongest signals first)
 uniqueOpportunities.sort((a, b) => Math.abs(b.averageReturn) - Math.abs(a.averageReturn));
 
 console.log(` Bulk screening complete! Found ${uniqueOpportunities.length} unique seasonal opportunities`);
 console.log(` Bullish opportunities: ${uniqueOpportunities.filter(o => o.sentiment === 'Bullish').length}`);
 console.log(` Bearish opportunities: ${uniqueOpportunities.filter(o => o.sentiment === 'Bearish').length}`);
 
 return uniqueOpportunities;
 }

 // Mock data method removed - no fallback data

 // Fallback method with smaller batches
 async screenSeasonalOpportunitiesBatched(years: number = 15): Promise<SeasonalOpportunity[]> {
 const opportunities: SeasonalOpportunity[] = [];
 console.log(` Starting seasonal screening of ${TOP500_BY_MARKET_CAP.length} top market cap companies...`);

 // Process stocks in smaller batches
 const batchSize = 10;
 for (let i = 0; i < TOP500_BY_MARKET_CAP.length; i += batchSize) {
 const batch = TOP500_BY_MARKET_CAP.slice(i, i + batchSize);
 
 console.log(` Processing batch ${Math.floor(i/batchSize) + 1}: ${batch.map((s: StockListItem) => s.symbol).join(', ')}`);
 
 const batchPromises = batch.map(async (stock: StockListItem) => {
 try {
 console.log(` Analyzing ${stock.symbol} (${stock.name})...`);
 
 // Use the existing seasonal analysis logic
 const analysis = await this.analyzeStockSeasonality(stock.symbol, stock.name, years);
 
 if (analysis) {
 // Check bullish seasonal (best 30-day period)
 if (analysis.spyComparison?.best30DayPeriod) {
 const bullish = analysis.spyComparison.best30DayPeriod;
 if (this.isSeasonalCurrentlyActive(bullish.startDate)) {
 opportunities.push({
 symbol: stock.symbol,
 companyName: stock.name,
 sentiment: 'Bullish',
 period: bullish.period,
 startDate: bullish.startDate,
 endDate: bullish.endDate,
 averageReturn: bullish.return,
 winRate: analysis.statistics.winRate,
 years: analysis.statistics.yearsOfData,
 daysUntilStart: this.parseSeasonalDate(bullish.startDate) - this.getDayOfYear(new Date('2025-09-04')),
 isCurrentlyActive: true
 });
 console.log(` Found BULLISH seasonal for ${stock.symbol}: ${bullish.period} (+${bullish.return.toFixed(2)}%)`);
 }
 }
 
 // Check bearish seasonal (worst 30-day period)
 if (analysis.spyComparison?.worst30DayPeriod) {
 const bearish = analysis.spyComparison.worst30DayPeriod;
 if (this.isSeasonalCurrentlyActive(bearish.startDate)) {
 opportunities.push({
 symbol: stock.symbol,
 companyName: stock.name,
 sentiment: 'Bearish',
 period: bearish.period,
 startDate: bearish.startDate,
 endDate: bearish.endDate,
 averageReturn: bearish.return,
 winRate: 100 - analysis.statistics.winRate, // Inverse for bearish
 years: analysis.statistics.yearsOfData,
 daysUntilStart: this.parseSeasonalDate(bearish.startDate) - this.getDayOfYear(new Date('2025-09-04')),
 isCurrentlyActive: true
 });
 console.log(` Found BEARISH seasonal for ${stock.symbol}: ${bearish.period} (${bearish.return.toFixed(2)}%)`);
 }
 }
 }
 } catch (error) {
 console.warn(` Failed to analyze ${stock.symbol}:`, error);
 }
 });

 await Promise.all(batchPromises);
 
 // Add delay between batches to respect rate limits
 if (i + batchSize < TOP500_BY_MARKET_CAP.length) {
 console.log(' Waiting 2 seconds before next batch...');
 await new Promise(resolve => setTimeout(resolve, 2000));
 }
 }

 // Sort by absolute return (strongest signals first)
 opportunities.sort((a, b) => Math.abs(b.averageReturn) - Math.abs(a.averageReturn));
 
 console.log(` Batched screening complete! Found ${opportunities.length} active seasonal opportunities`);
 
 return opportunities;
 }

 // Process stock data from bulk response
 private async processBulkStockData(stockData: any[], spyData: any[], symbol: string, companyName: string, years: number) {
 try {
 if (!stockData?.length || !spyData?.length) {
 return null;
 }

 // Use the same processDailySeasonalData logic
 return this.processDailySeasonalData(
 stockData,
 spyData,
 symbol,
 companyName,
 years
 );
 } catch (error) {
 console.error(`Error processing bulk data for ${symbol}:`, error);
 return null;
 }
 }

 // Reuse the existing seasonal analysis logic
 private async analyzeStockSeasonality(symbol: string, companyName: string, years: number) {
 try {
 // Calculate date range
 const endDate = new Date();
 const startDate = new Date();
 startDate.setFullYear(endDate.getFullYear() - years);

 // Fetch historical data for stock and SPY
 const [historicalResponse, spyResponse] = await Promise.all([
 this.polygonService.getHistoricalData(
 symbol,
 startDate.toISOString().split('T')[0],
 endDate.toISOString().split('T')[0]
 ),
 this.polygonService.getHistoricalData(
 'SPY',
 startDate.toISOString().split('T')[0],
 endDate.toISOString().split('T')[0]
 )
 ]);

 if (!historicalResponse?.results?.length || !spyResponse?.results?.length) {
 return null;
 }

 // Use the same processDailySeasonalData logic from SeasonalityChart
 return this.processDailySeasonalData(
 historicalResponse.results,
 spyResponse.results,
 symbol,
 companyName,
 years
 );
 } catch (error) {
 console.error(`Error analyzing ${symbol}:`, error);
 return null;
 }
 }

 // Copy of the processDailySeasonalData method from SeasonalityChart
 private processDailySeasonalData(data: any[], spyData: any[], symbol: string, companyName: string, years: number) {
 // Group data by day of year
 const dailyGroups: { [dayOfYear: number]: { date: Date; return: number; year: number }[] } = {};
 const yearlyReturns: { [year: number]: number } = {};
 
 // Create SPY lookup map for faster access
 const spyLookup: { [timestamp: number]: any } = {};
 spyData.forEach(item => {
 spyLookup[item.t] = item;
 });
 
 // Process historical data into daily returns
 for (let i = 1; i < data.length; i++) {
 const currentItem = data[i];
 const previousItem = data[i - 1];
 const date = new Date(currentItem.t);
 const year = date.getFullYear();
 const dayOfYear = this.getDayOfYear(date);
 
 // Calculate stock return
 const stockReturn = ((currentItem.c - previousItem.c) / previousItem.c) * 100;
 
 // Calculate relative performance vs SPY
 const currentSpy = spyLookup[currentItem.t];
 const previousSpy = spyLookup[previousItem.t];
 
 if (!currentSpy || !previousSpy) continue;
 
 const spyReturn = ((currentSpy.c - previousSpy.c) / previousSpy.c) * 100;
 const finalReturn = stockReturn - spyReturn; // Relative to SPY
 
 if (!dailyGroups[dayOfYear]) {
 dailyGroups[dayOfYear] = [];
 }
 
 dailyGroups[dayOfYear].push({
 date,
 return: finalReturn,
 year
 });
 
 if (!yearlyReturns[year]) {
 yearlyReturns[year] = 0;
 }
 yearlyReturns[year] += finalReturn;
 }

 // Calculate daily seasonal data
 const dailyData: any[] = [];
 
 // Process each day of year (1-365)
 for (let dayOfYear = 1; dayOfYear <= 365; dayOfYear++) {
 const dayData = dailyGroups[dayOfYear] || [];
 
 if (dayData.length === 0) continue;
 
 const returns = dayData.map(d => d.return);
 const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
 const positiveReturns = returns.filter(ret => ret > 0).length;
 
 // Get representative date for this day of year
 const representativeDate = new Date(2024, 0, dayOfYear); // Use 2024 as base year
 
 dailyData.push({
 dayOfYear,
 month: representativeDate.getMonth() + 1,
 day: representativeDate.getDate(),
 monthName: representativeDate.toLocaleDateString('en-US', { month: 'short' }),
 avgReturn,
 occurrences: dayData.length,
 positiveYears: positiveReturns,
 pattern: (positiveReturns / dayData.length) * 100
 });
 }

 // Calculate overall statistics
 const allReturns = Object.values(yearlyReturns);
 const winningYears = allReturns.filter(ret => ret > 0).length;
 const totalTrades = allReturns.length;
 const winRate = (winningYears / totalTrades) * 100;

 // Analyze 30-day seasonal patterns
 const analyze30DayPatterns = (dailyData: any[]) => {
 const windowSize = 30;
 let bestPeriod = { startDay: 1, endDay: 30, avgReturn: -999, period: '', startDate: '', endDate: '' };
 let worstPeriod = { startDay: 1, endDay: 30, avgReturn: 999, period: '', startDate: '', endDate: '' };

 // Slide through the year to find 30-day windows
 for (let startDay = 1; startDay <= 365 - windowSize; startDay++) {
 const endDay = startDay + windowSize - 1;
 const windowData = dailyData.filter(d => d.dayOfYear >= startDay && d.dayOfYear <= endDay);
 
 if (windowData.length >= 25) { // Ensure we have enough data points
 const windowReturn = windowData.reduce((sum, d) => sum + d.avgReturn, 0);
 const avgWindowReturn = windowReturn / windowData.length;
 
 // Check for best period
 if (avgWindowReturn > bestPeriod.avgReturn) {
 const startDataPoint = dailyData.find(d => d.dayOfYear === startDay);
 const endDataPoint = dailyData.find(d => d.dayOfYear === endDay);
 
 if (startDataPoint && endDataPoint) {
 bestPeriod = {
 startDay,
 endDay,
 avgReturn: avgWindowReturn,
 period: `${startDataPoint.monthName} ${startDataPoint.day} - ${endDataPoint.monthName} ${endDataPoint.day}`,
 startDate: `${startDataPoint.monthName} ${startDataPoint.day}`,
 endDate: `${endDataPoint.monthName} ${endDataPoint.day}`
 };
 }
 }
 
 // Check for worst period
 if (avgWindowReturn < worstPeriod.avgReturn) {
 const startDataPoint = dailyData.find(d => d.dayOfYear === startDay);
 const endDataPoint = dailyData.find(d => d.dayOfYear === endDay);
 
 if (startDataPoint && endDataPoint) {
 worstPeriod = {
 startDay,
 endDay,
 avgReturn: avgWindowReturn,
 period: `${startDataPoint.monthName} ${startDataPoint.day} - ${endDataPoint.monthName} ${endDataPoint.day}`,
 startDate: `${startDataPoint.monthName} ${startDataPoint.day}`,
 endDate: `${endDataPoint.monthName} ${endDataPoint.day}`
 };
 }
 }
 }
 }

 return { bestPeriod, worstPeriod };
 };

 const { bestPeriod, worstPeriod } = analyze30DayPatterns(dailyData);

 return {
 symbol,
 companyName,
 statistics: {
 winRate,
 yearsOfData: years
 },
 spyComparison: {
 best30DayPeriod: {
 period: bestPeriod.period,
 return: bestPeriod.avgReturn * 30, // Convert daily average to 30-day period return
 startDate: bestPeriod.startDate,
 endDate: bestPeriod.endDate
 },
 worst30DayPeriod: {
 period: worstPeriod.period,
 return: worstPeriod.avgReturn * 30, // Convert daily average to 30-day period return
 startDate: worstPeriod.startDate,
 endDate: worstPeriod.endDate
 }
 }
 };
 }
}

export default SeasonalScreenerService;
export type { SeasonalOpportunity };

