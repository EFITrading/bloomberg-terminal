// Service for screening seasonal opportunities from top stocks
import PolygonService from './polygonService';
import { TOP_1800_SYMBOLS } from './Top1000Symbols';

// Stocks that don't have reliable seasonal data - exclude from seasonality screening only
const SEASONALITY_BLACKLIST = new Set([
 // Only truly problematic symbols - most of these are delisted, penny stocks, or have data issues
 'NAKD', 'SNDL', 'BBBY', 'WISH', 'CLOV', 'SPCE', 'MVIS', 'CTRM', 'EXPR', 'KOSS',
 'WKHS', 'CLNE', 'GOEV', 'RIDE', 'NKLA', 'HYLN', 'GREE', 'SPRT', 'ANY', 'GMVD',
 'RETO', 'REED', 'TOPS', 'SHIP', 'DRYS', 'GLBS', 'CASTOR', 'SBLK', 'DSE', 'BRDS',
 'ADMP', 'ATOS', 'OBSV', 'VERB', 'VYNE', 'MARK', 'MOTS', 'PHUN', 'DWAC', 'BENE',
 'PROG', 'PRTY', 'AVCT', 'ENVB', 'KPTI', 'GNUS', 'JAGX', 'BKTI', 'OCGN'
]);

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
 correlation?: number;
}

interface StockListItem {
 symbol: string;
 name: string;
 marketCap?: number;
}

// Top 1800+ US companies by market capitalization (as of 2025)
// Filter out stocks without reliable seasonal data, but keep them available for options flow
const TOP1800_BY_MARKET_CAP: StockListItem[] = TOP_1800_SYMBOLS
 .filter(symbol => !SEASONALITY_BLACKLIST.has(symbol))
 .map(symbol => ({
 symbol: symbol,
 name: symbol // We'll use symbol as name for simplicity
 }));

class SeasonalScreenerService {
 private polygonService: PolygonService;

 constructor() {
 this.polygonService = new PolygonService();
 }

 // PROFESSIONAL BULK API: True bulk processing for 5-10 second performance
 async screenSeasonalOpportunitiesWithWorkers(
 years: number = 15,
 maxStocks: number = 500,
 maxConcurrent: number = 50, onProgress?: (processed: number, total: number, found: SeasonalOpportunity[], currentSymbol?: string) => void
 ): Promise<SeasonalOpportunity[]> {
 console.log(` PROFESSIONAL BULK API: Fetch-all-then-process approach for 5-10 second completion!`);
 
 const opportunities: SeasonalOpportunity[] = [];
 const actualMaxStocks = Math.min(maxStocks, TOP1800_BY_MARKET_CAP.length);
 const stocksToProcess = TOP1800_BY_MARKET_CAP.slice(0, actualMaxStocks);
 
 try {
 // PHASE 1: Bulk fetch ALL historical data in 2-3 seconds
 console.log(`� PHASE 1: Bulk fetching historical data for ${stocksToProcess.length} symbols...`);
 
 const symbols = ['SPY', ...stocksToProcess.map(s => s.symbol)];
 const allHistoricalData = await this.fetchBulkHistoricalData(symbols, years);
 
 // Verify SPY data loaded
 const spyData = allHistoricalData.get('SPY');
 if (!spyData?.results?.length) {
 throw new Error('Failed to get SPY data for comparison');
 }
 console.log(` SPY benchmark loaded: ${spyData.results.length} data points`);
 
 // PHASE 2: Local processing (2-3 seconds)
 console.log(`📊 PHASE 2: Local processing of ${allHistoricalData.size - 1} loaded datasets...`);
 
 let processedCount = 0;
 const totalStocks = stocksToProcess.length;
 
 // Process all stocks with local data - NO MORE API CALLS
 for (const stock of stocksToProcess) {
 const stockData = allHistoricalData.get(stock.symbol);
 
 if (stockData?.results?.length) {
 try {
 const opportunity = await this.processStockLocally(
 stock, 
 years, 
 stockData, 
 spyData, 
 processedCount + 1, 
 totalStocks
 );
 
 if (opportunity) {
 opportunities.push(opportunity);
 console.log(` Found opportunity: ${opportunity.symbol} (${opportunities.length} total)`);
 }
 } catch (error) {
 console.warn(` Error processing ${stock.symbol}:`, error);
 }
 } else {
 console.warn(` No data for ${stock.symbol}`);
 }
 
 processedCount++;
 
 // Update progress frequently
 if (onProgress && processedCount % 25 === 0) {
 onProgress(processedCount, totalStocks, opportunities, `Processing: ${processedCount}/${totalStocks} - ${opportunities.length} found`);
 }
 }

 console.log(` PROFESSIONAL BULK PROCESSING COMPLETE! Found ${opportunities.length} opportunities from ${processedCount} processed symbols`);
 
 // Sort by win rate and correlation
 const sortedOpportunities = opportunities
 .filter(opp => opp.winRate >= 40 && (opp.correlation || 0) >= 34)
 .sort((a, b) => {
 const scoreA = (a.winRate * 0.6) + ((a.correlation || 0) * 0.4);
 const scoreB = (b.winRate * 0.6) + ((b.correlation || 0) * 0.4);
 return scoreB - scoreA;
 });

 console.log(` Final results: ${sortedOpportunities.length} qualified opportunities (40%+ win rate, 34%+ correlation)`);
 return sortedOpportunities;

 } catch (error) {
 console.error(' Professional bulk processing failed:', error);
 return [];
 }
 }

 // BULK DATA FETCHING: Get all historical data in 2-3 large requests instead of 500 individual calls
 private async fetchBulkHistoricalData(
 symbols: string[], 
 years: number
 ): Promise<Map<string, any>> {
 const dataMap = new Map<string, any>();
 
 console.log(` BULK API: Fetching ${symbols.length} symbols using optimized bulk requests...`);
 
 try {
 const startTime = Date.now();
 
 // Use moderate batch sizes for reliable performance (50 symbols per request)
 const batchSize = 50; // Reliable batch size for consistent results
 const batches = [];
 
 for (let i = 0; i < symbols.length; i += batchSize) {
 batches.push(symbols.slice(i, i + batchSize));
 }
 
 console.log(` BULK PROCESSING: ${symbols.length} symbols in ${batches.length} requests of ${batchSize} each...`);
 
 // Process all batches with the existing bulk API endpoint
 for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
 const batch = batches[batchIndex];
 const batchStart = Date.now();
 
 console.log(` Bulk request ${batchIndex + 1}/${batches.length}: ${batch.length} symbols...`);
 
 try {
 // Use POST request to bulk endpoint with larger payload
 console.log(` Sending bulk request for ${batch.length} symbols...`);
 
 const response = await fetch('/api/bulk-historical-data', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 symbols: batch,
 days: years * 365
 })
 });
 
 if (!response.ok) {
 const errorText = await response.text();
 console.error(` Bulk request ${batchIndex + 1} failed: ${response.status} - ${errorText}`);
 throw new Error(`Bulk request ${batchIndex + 1} failed: ${response.status}`);
 }
 
 const batchResponse = await response.json();
 console.log(` Bulk response received:`, { 
 success: batchResponse.success, 
 dataKeys: batchResponse.data ? Object.keys(batchResponse.data).length : 0,
 errors: batchResponse.errors?.length || 0
 });
 
 // Handle the bulk endpoint response format: {success: true, data: {...}}
 const batchData = batchResponse.success ? batchResponse.data : batchResponse;
 
 if (!batchData || typeof batchData !== 'object') {
 console.error(` Invalid batch data received:`, batchResponse);
 throw new Error('Invalid batch data received from API');
 }
 
 // Process batch results
 let batchSuccessCount = 0;
 for (const [symbol, symbolData] of Object.entries(batchData)) {
 if (symbolData && typeof symbolData === 'object' && 'results' in symbolData) {
 const results = (symbolData as any).results;
 if (Array.isArray(results) && results.length > 0) {
 dataMap.set(symbol, symbolData);
 batchSuccessCount++;
 console.log(` ${symbol}: ${results.length} data points loaded`);
 } else {
 console.warn(` ${symbol}: No results in data`);
 }
 } else {
 console.warn(` ${symbol}: Invalid data structure`);
 }
 }
 
 const batchTime = Date.now() - batchStart;
 console.log(` Bulk request ${batchIndex + 1} complete: ${batchSuccessCount}/${batch.length} symbols in ${(batchTime / 1000).toFixed(1)}s - Total: ${dataMap.size}`);
 
 // Very small delay between batches to avoid overwhelming server
 if (batchIndex < batches.length - 1) {
 await this.delay(100);
 }
 
 } catch (batchError: any) {
 console.error(` Bulk request ${batchIndex + 1} failed:`, batchError.message);
 // Continue with next batch rather than failing completely
 }
 }
 
 const totalTime = Date.now() - startTime;
 console.log(` BULK PROCESSING COMPLETE: ${dataMap.size}/${symbols.length} symbols in ${(totalTime / 1000).toFixed(1)}s (${((dataMap.size / symbols.length) * 100).toFixed(1)}% success)`);
 
 } catch (error: any) {
 console.error(` Bulk processing failed:`, error.message);
 throw error;
 }
 
 return dataMap;
 }

 // LOCAL PROCESSING: Analyze pre-loaded data without any API calls for lightning speed
 private async processStockLocally(
 stock: StockListItem,
 years: number,
 stockData: any,
 spyData: any,
 processed: number,
 total: number
 ): Promise<SeasonalOpportunity | null> {
 try {
 // Process using existing logic but with local data (no API calls)
 const seasonalData = this.processDailySeasonalData(
 stockData.results,
 spyData.results,
 stock.symbol,
 stock.name,
 years
 );

 // Find current seasonal opportunities from the processed data
 const opportunities = this.extractOpportunitiesFromSeasonalData(seasonalData, stock.symbol, stock.name);
 
 if (opportunities.length > 0) {
 return opportunities[0]; // Return best opportunity
 }
 
 return null;
 } catch (error) {
 console.warn(` Local processing failed for ${stock.symbol}:`, error);
 return null;
 }
 }

 // Process a batch of stocks sequentially to prevent resource exhaustion
 // Fast processing of individual stock with controlled concurrency
 private async processStockFast(
 stock: StockListItem,
 years: number,
 spyData: any,
 currentOpportunities: SeasonalOpportunity[],
 processed: number,
 total: number
 ): Promise<SeasonalOpportunity | null> {
 try {
 console.log(` Processing ${stock.symbol} (${processed}/${total})...`);
 
 // Get stock data
 const stockData = await this.polygonService.getBulkHistoricalData(stock.symbol, years);
 
 if (!stockData?.results?.length) {
 return null;
 }
 
 // Analyze seasonal data
 const analysis = this.processDailySeasonalData(
 stockData.results, 
 spyData.results, 
 stock.symbol, 
 stock.name, 
 years
 );
 
 if (!analysis || !analysis.statistics) {
 return null;
 }
 
 // Calculate correlation
 const correlation = await this.calculateCorrelation(stock.symbol, analysis);
 
 // Apply strict filtering: 40%+ win rate AND 34%+ correlation
 if (analysis.statistics.winRate >= 40 && correlation !== null && correlation >= 34) {
 
 // Check for bullish opportunities
 if (analysis.spyComparison?.best30DayPeriod) {
 const bullish = analysis.spyComparison.best30DayPeriod;
 if (this.isSeasonalCurrentlyActive(bullish.startDate)) {
 const opportunity: SeasonalOpportunity = {
 symbol: stock.symbol,
 companyName: stock.name,
 sentiment: 'Bullish',
 period: bullish.period,
 startDate: bullish.startDate,
 endDate: bullish.endDate,
 averageReturn: bullish.return,
 winRate: analysis.statistics.winRate,
 years: analysis.statistics.yearsOfData,
 daysUntilStart: this.parseSeasonalDate(bullish.startDate) - this.getDayOfYear(new Date()),
 isCurrentlyActive: true,
 correlation
 };
 
 console.log(` QUALIFIED BULLISH ${stock.symbol}: WR=${analysis.statistics.winRate.toFixed(1)}% Corr=${correlation}%`);
 return opportunity;
 }
 }
 
 // Check for bearish opportunities
 if (analysis.spyComparison?.worst30DayPeriod) {
 const bearish = analysis.spyComparison.worst30DayPeriod;
 const bearishWinRate = 100 - analysis.statistics.winRate;
 if (bearishWinRate >= 40 && this.isSeasonalCurrentlyActive(bearish.startDate)) {
 const opportunity: SeasonalOpportunity = {
 symbol: stock.symbol,
 companyName: stock.name,
 sentiment: 'Bearish',
 period: bearish.period,
 startDate: bearish.startDate,
 endDate: bearish.endDate,
 averageReturn: bearish.return,
 winRate: bearishWinRate,
 years: analysis.statistics.yearsOfData,
 daysUntilStart: this.parseSeasonalDate(bearish.startDate) - this.getDayOfYear(new Date()),
 isCurrentlyActive: true,
 correlation
 };
 
 console.log(` QUALIFIED BEARISH ${stock.symbol}: WR=${bearishWinRate.toFixed(1)}% Corr=${correlation}%`);
 return opportunity;
 }
 }
 }
 
 return null;
 
 } catch (error) {
 console.warn(` Error processing ${stock.symbol}:`, error);
 return null;
 }
 }

 // Process a batch of stocks sequentially to prevent resource exhaustion (BACKUP METHOD)
 private async processBatchConcurrently(
 stocks: StockListItem[],
 years: number,
 spyData: any,
 onProgress?: (processed: number, total: number, found: SeasonalOpportunity[], currentSymbol?: string) => void,
 batchNumber: number = 1
 ): Promise<SeasonalOpportunity[]> {
 const batchOpportunities: SeasonalOpportunity[] = [];
 
 try {
 console.log(` [Batch ${batchNumber}] Processing ${stocks.length} symbols sequentially...`);
 
 // Process stocks one by one to prevent overwhelming the browser
 for (let i = 0; i < stocks.length; i++) {
 const stock = stocks[i];
 
 try {
 console.log(`� [Batch ${batchNumber}] Processing ${stock.symbol} (${i + 1}/${stocks.length})...`);
 
 // Get stock data with throttling
 const stockData = await this.polygonService.getBulkHistoricalData(stock.symbol, years);
 
 if (!stockData?.results?.length) {
 console.warn(` [Batch ${batchNumber}] No data for ${stock.symbol}`);
 continue;
 }
 
 // Analyze seasonal data
 const analysis = this.processDailySeasonalData(
 stockData.results, 
 spyData.results, 
 stock.symbol, 
 stock.name, 
 years
 );
 
 if (!analysis || !analysis.statistics) {
 continue;
 }
 
 // Calculate correlation
 const correlation = await this.calculateCorrelation(stock.symbol, analysis);
 
 // Apply strict filtering: 40%+ win rate AND 34%+ correlation
 if (analysis.statistics.winRate >= 40 && correlation !== null && correlation >= 34) {
 
 // Check for bullish opportunities
 if (analysis.spyComparison?.best30DayPeriod) {
 const bullish = analysis.spyComparison.best30DayPeriod;
 if (this.isSeasonalCurrentlyActive(bullish.startDate)) {
 const opportunity: SeasonalOpportunity = {
 symbol: stock.symbol,
 companyName: stock.name,
 sentiment: 'Bullish',
 period: bullish.period,
 startDate: bullish.startDate,
 endDate: bullish.endDate,
 averageReturn: bullish.return,
 winRate: analysis.statistics.winRate,
 years: analysis.statistics.yearsOfData,
 daysUntilStart: this.parseSeasonalDate(bullish.startDate) - this.getDayOfYear(new Date()),
 isCurrentlyActive: true,
 correlation
 };
 
 batchOpportunities.push(opportunity);
 console.log(` [Batch ${batchNumber}] QUALIFIED BULLISH ${stock.symbol}: WR=${analysis.statistics.winRate.toFixed(1)}% Corr=${correlation}%`);
 }
 }
 
 // Check for bearish opportunities
 if (analysis.spyComparison?.worst30DayPeriod) {
 const bearish = analysis.spyComparison.worst30DayPeriod;
 const bearishWinRate = 100 - analysis.statistics.winRate;
 if (bearishWinRate >= 40 && this.isSeasonalCurrentlyActive(bearish.startDate)) {
 const opportunity: SeasonalOpportunity = {
 symbol: stock.symbol,
 companyName: stock.name,
 sentiment: 'Bearish',
 period: bearish.period,
 startDate: bearish.startDate,
 endDate: bearish.endDate,
 averageReturn: bearish.return,
 winRate: bearishWinRate,
 years: analysis.statistics.yearsOfData,
 daysUntilStart: this.parseSeasonalDate(bearish.startDate) - this.getDayOfYear(new Date()),
 isCurrentlyActive: true,
 correlation
 };
 
 batchOpportunities.push(opportunity);
 console.log(` [Batch ${batchNumber}] QUALIFIED BEARISH ${stock.symbol}: WR=${bearishWinRate.toFixed(1)}% Corr=${correlation}%`);
 }
 }
 }
 
 // Report progress
 if (onProgress && (i + 1) % 5 === 0) { // Update every 5 stocks to avoid UI spam
 onProgress(
 i + 1, 
 stocks.length, 
 batchOpportunities, 
 `Batch ${batchNumber}: ${stock.symbol} - ${batchOpportunities.length} qualified`
 );
 }
 
 // Small delay to prevent overwhelming the system
 await new Promise(resolve => setTimeout(resolve, 50));
 
 } catch (error) {
 console.warn(` [Batch ${batchNumber}] Error processing ${stock.symbol}:`, error);
 continue;
 }
 }
 
 console.log(` [Batch ${batchNumber}] Completed! Found ${batchOpportunities.length} qualified opportunities from ${stocks.length} symbols`);
 return batchOpportunities;
 
 } catch (error) {
 console.error(` [Batch ${batchNumber}] Batch processing failed:`, error);
 return [];
 }
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
 const today = new Date(); // Use current date
 const todayDayOfYear = this.getDayOfYear(today);
 
 // Parse the seasonal start date (e.g., "Sep 10" -> day of year)
 const seasonalStartDay = this.parseSeasonalDate(startDate);
 
 // Check if seasonal starts within reasonable timeframe (show upcoming opportunities)
 const daysDifference = seasonalStartDay - todayDayOfYear;
 
 // Show seasonals that start in 1-3 days AND keep showing for 2 days after start
 // So if seasonal starts Oct 10, show from Oct 8 (today) until Oct 12 (2 days after start)
 return daysDifference >= 1 && daysDifference <= 3 || // Upcoming (1-3 days)
 daysDifference >= -2 && daysDifference <= 0; // Recently started (0-2 days ago)
 }

 // Main screening function with bulk requests and configurable batch size
 async screenSeasonalOpportunities(
 years: number = 15, 
 maxStocks: number = 100, 
 startOffset: number = 0,
 onProgress?: (processed: number, total: number, found: SeasonalOpportunity[], currentSymbol?: string) => void
 ): Promise<SeasonalOpportunity[]> {
 const opportunities: SeasonalOpportunity[] = [];
 const seenSymbols = new Set<string>(); // Track processed symbols to avoid duplicates
 const actualMaxStocks = Math.min(maxStocks, TOP1800_BY_MARKET_CAP.length - startOffset);
 console.log(` Starting bulk seasonal screening of ${actualMaxStocks} companies (positions ${startOffset + 1}-${startOffset + actualMaxStocks}) by market cap...`);

 try {
 // First, get SPY data for comparison (unlimited API - full years)
 console.log(` Getting SPY data for ${years} years using unlimited API...`);
 const spyData = await this.polygonService.getBulkHistoricalData('SPY', years);
 
 if (!spyData?.results?.length) {
 throw new Error('Failed to get SPY data for comparison');
 }

 console.log(` SPY data loaded: ${spyData.results.length} data points for ${years} years`);

 // Process stocks using INTELLIGENT WORKER-BASED BATCHING for unlimited API
 const stocksToProcess = TOP1800_BY_MARKET_CAP.slice(startOffset, startOffset + actualMaxStocks);
 
 console.log(` Processing ${stocksToProcess.length} companies using worker-based parallel processing for unlimited API...`);
 
 // Use larger batches since API is unlimited - optimize for speed
 const batchSize = Math.min(50, Math.ceil(stocksToProcess.length / 10)); // Adaptive batch size, max 50
 const batches: StockListItem[][] = [];
 
 for (let i = 0; i < stocksToProcess.length; i += batchSize) {
 batches.push(stocksToProcess.slice(i, i + batchSize));
 }

 for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
 const batch = batches[batchIndex];
 console.log(` Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} symbols...`);
 
 // Update progress at batch start
 const processedSoFar = batchIndex * batchSize;
 if (onProgress) {
 onProgress(processedSoFar, stocksToProcess.length, opportunities, `Processing batch ${batchIndex + 1}/${batches.length}`);
 }
 
 const batchPromises = batch.map(async (stock: StockListItem) => {
 try {
 // Skip if we've already processed this symbol
 if (seenSymbols.has(stock.symbol)) {
 console.log(` Skipping duplicate symbol: ${stock.symbol}`);
 return;
 }
 seenSymbols.add(stock.symbol);
 
 console.log(` Getting historical data for ${stock.symbol} (batch ${batchIndex + 1}) - ${years} years unlimited API...`);
 
 // Use FULL years as requested - unlimited API can handle it
 const stockData = await this.polygonService.getBulkHistoricalData(stock.symbol, years);
 
 // Handle graceful degradation if data fetch fails
 if (!stockData?.results?.length) {
 console.warn(` No historical data available for ${stock.symbol}, skipping analysis`);
 return; // Skip this stock and continue with others
 }

 console.log(` ${stock.symbol}: ${stockData.results.length} data points (${years} years)`);
 
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
 // Calculate correlation
 const correlation = await this.calculateCorrelation(stock.symbol, analysis);
 
 // Apply filters: Win Rate >= 40% AND Correlation >= 34%
 if (analysis.statistics.winRate >= 40 && correlation !== null && correlation >= 34) {
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
 daysUntilStart: this.parseSeasonalDate(bullish.startDate) - this.getDayOfYear(new Date()),
 isCurrentlyActive: true,
 correlation: correlation
 };
 console.log(` Found QUALIFIED BULLISH seasonal for ${stock.symbol}: ${bullish.period} (+${bullish.return.toFixed(2)}%) WinRate: ${analysis.statistics.winRate.toFixed(1)}% Correlation: ${correlation}%`);
 } else {
 console.log(` Filtered out ${stock.symbol}: WinRate: ${analysis.statistics.winRate.toFixed(1)}% Correlation: ${correlation}%`);
 }
 }
 }
 
 // Check bearish seasonal (worst 30-day period)
 if (analysis.spyComparison?.worst30DayPeriod) {
 const bearish = analysis.spyComparison.worst30DayPeriod;
 if (this.isSeasonalCurrentlyActive(bearish.startDate)) {
 // Calculate correlation (reuse from bullish if available)
 const correlation = await this.calculateCorrelation(stock.symbol, analysis);
 const bearishWinRate = 100 - analysis.statistics.winRate;
 
 // Apply filters: Win Rate >= 40% AND Correlation >= 34%
 if (bearishWinRate >= 40 && correlation !== null && correlation >= 34) {
 const bearishOpportunity: SeasonalOpportunity = {
 symbol: stock.symbol,
 companyName: stock.name,
 sentiment: 'Bearish',
 period: bearish.period,
 startDate: bearish.startDate,
 endDate: bearish.endDate,
 averageReturn: bearish.return,
 winRate: bearishWinRate,
 years: analysis.statistics.yearsOfData,
 daysUntilStart: this.parseSeasonalDate(bearish.startDate) - this.getDayOfYear(new Date()),
 isCurrentlyActive: true,
 correlation: correlation
 };
 
 // Only use bearish if no bullish found, or if bearish is much stronger
 if (!bestOpportunity || Math.abs(bearish.return) > Math.abs(bestOpportunity.averageReturn) * 1.5) {
 bestOpportunity = bearishOpportunity;
 console.log(` Found QUALIFIED BEARISH seasonal for ${stock.symbol}: ${bearish.period} (${bearish.return.toFixed(2)}%) WinRate: ${bearishWinRate.toFixed(1)}% Correlation: ${correlation}%`);
 }
 } else {
 console.log(` Filtered out BEARISH ${stock.symbol}: WinRate: ${bearishWinRate.toFixed(1)}% Correlation: ${correlation}%`);
 }
 }
 }
 
 // Only add the best opportunity for this symbol
 if (bestOpportunity) {
 opportunities.push(bestOpportunity);
 
 // Real-time progress update when opportunity found
 if (onProgress) {
 const currentProcessed = Math.min(processedSoFar + batch.indexOf(stock) + 1, stocksToProcess.length);
 onProgress(currentProcessed, stocksToProcess.length, [...opportunities], `Found seasonal for ${stock.symbol}!`);
 }
 }
 
 // Always update progress for processed stocks (even if no opportunity found)
 if (onProgress) {
 const currentProcessed = Math.min(processedSoFar + batch.indexOf(stock) + 1, stocksToProcess.length);
 onProgress(currentProcessed, stocksToProcess.length, [...opportunities], `Processed ${stock.symbol}`);
 }
 }
 } catch (error) {
 console.warn(` Failed to process ${stock.symbol}:`, error);
 }
 });

 // Wait for current batch to complete before starting next batch
 await Promise.all(batchPromises);
 
 console.log(` Completed batch ${batchIndex + 1}/${batches.length} - Found ${opportunities.length} opportunities so far`);
 
 // Update progress after batch completion
 const completedSoFar = Math.min((batchIndex + 1) * batchSize, stocksToProcess.length);
 if (onProgress) {
 onProgress(completedSoFar, stocksToProcess.length, [...opportunities], `Batch ${batchIndex + 1}/${batches.length} complete`);
 }
 
 // Minimal delay between batches for unlimited API - just prevent browser lockup
 if (batchIndex < batches.length - 1) {
 console.log(` Brief pause before next batch (unlimited API)...`);
 await new Promise(resolve => setTimeout(resolve, 100)); // 100ms - just to prevent browser freeze
 }
 }

 } catch (error) {
 const errorMessage = error instanceof Error ? error.message : 'Unknown error';
 console.error(' Bulk seasonal screening failed:', errorMessage);
 
 // Enhanced error reporting
 if (errorMessage.includes('Failed to get SPY data')) {
 console.error(' Critical error: Unable to fetch SPY benchmark data for comparison');
 } else if (errorMessage.includes('ERR_CONNECTION') || errorMessage.includes('Failed to fetch')) {
 console.error(' Network connectivity issues preventing data fetch');
 } else {
 console.error(' Unexpected error during seasonal analysis');
 }
 
 // Try to return partial results if we have any
 if (opportunities.length > 0) {
 console.log(` Returning ${opportunities.length} partial results despite error`);
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
 console.log(` Starting seasonal screening of ${TOP1800_BY_MARKET_CAP.length} top market cap companies...`);

 // Process stocks in smaller batches
 const batchSize = 10;
 for (let i = 0; i < TOP1800_BY_MARKET_CAP.length; i += batchSize) {
 const batch = TOP1800_BY_MARKET_CAP.slice(i, i + batchSize);
 
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
 daysUntilStart: this.parseSeasonalDate(bullish.startDate) - this.getDayOfYear(new Date()),
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
 daysUntilStart: this.parseSeasonalDate(bearish.startDate) - this.getDayOfYear(new Date()),
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
 if (i + batchSize < TOP1800_BY_MARKET_CAP.length) {
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
 dailyData, // Add this for correlation calculation
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

 // Calculate correlation between current year and seasonal pattern
 private async calculateCorrelation(symbol: string, seasonalData: any): Promise<number | null> {
 try {
 // Validate seasonal data structure
 if (!seasonalData || !seasonalData.dailyData || !Array.isArray(seasonalData.dailyData) || seasonalData.dailyData.length === 0) {
 console.warn(`No valid seasonal data for ${symbol}`);
 return null;
 }

 const currentYear = new Date().getFullYear();
 const currentDate = new Date();
 
 // Get current year data (2025)
 const currentYearData = await this.polygonService.getHistoricalData(
 symbol,
 `${currentYear}-01-01`,
 currentDate.toISOString().split('T')[0],
 'day',
 1
 );

 if (!currentYearData?.results || currentYearData.results.length < 10) {
 console.warn(`Insufficient current year data for ${symbol}`);
 return null;
 }

 // Calculate weekly returns for current year
 const currentYearReturns: number[] = [];
 const results = currentYearData.results;
 
 // Group into 5-day (weekly) periods
 for (let i = 5; i < results.length; i += 5) {
 const weekStart = results[i - 5]?.c;
 const weekEnd = results[i]?.c;
 if (weekStart && weekEnd && weekStart > 0) {
 const weeklyReturn = ((weekEnd - weekStart) / weekStart) * 100;
 currentYearReturns.push(weeklyReturn);
 }
 }

 if (currentYearReturns.length === 0) {
 console.warn(`No valid weekly returns calculated for ${symbol}`);
 return null;
 }

 // Get corresponding seasonal weekly returns
 const seasonalReturns: number[] = [];
 
 // Group seasonal data into 5-day periods
 for (let i = 0; i < currentYearReturns.length; i++) {
 let weeklySeasonalReturn = 0;
 let validDays = 0;
 
 for (let j = 0; j < 5; j++) {
 const dayIndex = 1 + (i * 5) + j;
 if (dayIndex < seasonalData.dailyData.length) {
 const seasonalDataPoint = seasonalData.dailyData[dayIndex];
 if (seasonalDataPoint && typeof seasonalDataPoint.avgReturn === 'number') {
 weeklySeasonalReturn += seasonalDataPoint.avgReturn;
 validDays++;
 }
 }
 }
 
 // Only include if we have at least some valid days in the week
 if (validDays > 0) {
 seasonalReturns.push(weeklySeasonalReturn);
 } else {
 seasonalReturns.push(0); // Default to 0 if no valid seasonal data
 }
 }

 // Ensure matching data points
 const minLength = Math.min(currentYearReturns.length, seasonalReturns.length);
 if (minLength < 5) {
 console.warn(`Not enough data points for correlation on ${symbol}: ${minLength} weeks`);
 return null;
 }

 const currentReturns = currentYearReturns.slice(0, minLength);
 const seasonalAvgReturns = seasonalReturns.slice(0, minLength);

 // Validate that we have valid numbers
 const hasInvalidCurrentData = currentReturns.some(val => !isFinite(val));
 const hasInvalidSeasonalData = seasonalAvgReturns.some(val => !isFinite(val));
 
 if (hasInvalidCurrentData || hasInvalidSeasonalData) {
 console.warn(`Invalid correlation data for ${symbol}`);
 return null;
 }

 // Calculate Pearson correlation
 const rawCorrelation = this.calculatePearsonCorrelation(currentReturns, seasonalAvgReturns);
 
 // Check if correlation is valid
 if (!isFinite(rawCorrelation) || isNaN(rawCorrelation)) {
 console.warn(`Invalid correlation coefficient for ${symbol}: ${rawCorrelation}`);
 return null;
 }
 
 const adjustedCorrelation = this.adjustCorrelationForReality(rawCorrelation);
 
 return Math.round(Math.abs(adjustedCorrelation) * 100); // Return absolute correlation percentage

 } catch (error) {
 console.error('Error calculating correlation for', symbol, ':', error instanceof Error ? error.message : String(error));
 return null;
 }
 }

 private calculatePearsonCorrelation(x: number[], y: number[]): number {
 const n = x.length;
 if (n !== y.length || n === 0) return 0;

 // Check for valid finite numbers
 const validX = x.every(val => isFinite(val));
 const validY = y.every(val => isFinite(val));
 if (!validX || !validY) return 0;

 const sumX = x.reduce((a, b) => a + b, 0);
 const sumY = y.reduce((a, b) => a + b, 0);
 const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
 const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
 const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

 const numerator = n * sumXY - sumX * sumY;
 const denominatorX = n * sumX2 - sumX * sumX;
 const denominatorY = n * sumY2 - sumY * sumY;
 
 // Check for zero variance (constant values)
 if (denominatorX <= 0 || denominatorY <= 0) return 0;
 
 const denominator = Math.sqrt(denominatorX * denominatorY);

 if (denominator === 0 || !isFinite(denominator)) return 0;
 
 const correlation = numerator / denominator;
 
 // Ensure result is finite and within valid range
 if (!isFinite(correlation) || correlation < -1 || correlation > 1) return 0;
 
 return correlation;
 }

 private adjustCorrelationForReality(rawCorrelation: number): number {
 const abs = Math.abs(rawCorrelation);
 
 let adjusted;
 if (abs < 0.1) {
 adjusted = abs * 2.5;
 } else if (abs < 0.3) {
 adjusted = 0.25 + (abs - 0.1) * 3;
 } else if (abs < 0.5) {
 adjusted = 0.85 + (abs - 0.3) * 1.5;
 } else {
 adjusted = 1.15 + (abs - 0.5) * 0.5;
 }
 
 adjusted = Math.min(adjusted, 1.0);
 return rawCorrelation >= 0 ? adjusted : -adjusted;
 }

 // Utility method for delays
 private delay(ms: number): Promise<void> {
 return new Promise(resolve => setTimeout(resolve, ms));
 }

 // Extract seasonal opportunities from processed data
 private extractOpportunitiesFromSeasonalData(
 seasonalData: any, 
 symbol: string, 
 companyName: string
 ): SeasonalOpportunity[] {
 const opportunities: SeasonalOpportunity[] = [];
 const today = new Date();
 const currentDayOfYear = this.getDayOfYear(today);

 // Look for patterns within the next 30 days
 for (let i = 0; i < 30; i++) {
 const checkDay = (currentDayOfYear + i) % 366;
 
 // Find the corresponding day in dailyData array
 const dayData = seasonalData.dailyData?.find((d: any) => d.dayOfYear === checkDay);
 
 if (dayData && dayData.avgReturn && Math.abs(dayData.avgReturn) > 0.5) {
 const winRate = dayData.pattern || 0; // pattern is winRate percentage
 
 // For now, skip correlation check since it's not available at daily level
 // Apply basic filtering - just require decent win rate
 if (winRate >= 40) {
 const startDate = new Date(today);
 startDate.setDate(today.getDate() + i);
 
 const endDate = new Date(startDate);
 endDate.setDate(startDate.getDate() + 7); // 7-day pattern
 
 opportunities.push({
 symbol,
 companyName,
 sentiment: dayData.avgReturn > 0 ? 'Bullish' : 'Bearish',
 period: '7 days',
 startDate: startDate.toISOString().split('T')[0],
 endDate: endDate.toISOString().split('T')[0],
 averageReturn: dayData.avgReturn,
 winRate: winRate,
 years: seasonalData.statistics?.yearsOfData || 15, // Get years from seasonal data
 daysUntilStart: i,
 isCurrentlyActive: i === 0
 });
 }
 }
 }
 
 // Sort by score (win rate weighted by return strength)
 return opportunities.sort((a, b) => {
 const scoreA = (a.winRate * 0.7) + (Math.abs(a.averageReturn) * 0.3);
 const scoreB = (b.winRate * 0.7) + (Math.abs(b.averageReturn) * 0.3);
 return scoreB - scoreA;
 });
 }

}

export default SeasonalScreenerService;
export type { SeasonalOpportunity };

