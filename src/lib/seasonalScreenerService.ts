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
}

interface StockListItem {
 symbol: string;
 name: string;
 marketCap?: number;
}

// Top 1800+ US companies by market capitalization (as of 2025)
// Filter out stocks without reliable seasonal data, but keep them available for options flow
const TOP1800_BY_MARKET_CAP: StockListItem[] = TOP_1800_SYMBOLS
 .map(symbol => ({
 symbol: symbol,
 name: symbol
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
 // Filter out stocks without enough historical data
 const yearsOfData = this.calculateYearsOfData(stockData.results);
 if (yearsOfData < 15) {
 console.warn(` ${stock.symbol} only has ${yearsOfData} years of data, skipping (need 15+)`);
 processedCount++;
 continue;
 }
 
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
 
 // Sort by average return (no filtering)
 const sortedOpportunities = opportunities
 .sort((a, b) => Math.abs(b.averageReturn) - Math.abs(a.averageReturn));

 console.log(` Final results: ${sortedOpportunities.length} seasonal opportunities (sorted by return)`);
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
 await new Promise(resolve => setTimeout(resolve, 100));
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

 if (!seasonalData || !seasonalData.statistics) {
 return null;
 }
 
 const bestPeriod = seasonalData.spyComparison?.best30DayPeriod;
 const worstPeriod = seasonalData.spyComparison?.worst30DayPeriod;
 
 if (!bestPeriod || !worstPeriod) {
 return null;
 }
 
 const bestIsActive = this.isSeasonalCurrentlyActive(bestPeriod.startDate);
 const worstIsActive = this.isSeasonalCurrentlyActive(worstPeriod.startDate);
 
 if (!bestIsActive && !worstIsActive) {
 return null;
 }
 
 // Return BOTH if both are active, prioritizing based on magnitude
 if (bestIsActive && worstIsActive) {
 const shouldReturnBullish = Math.abs(bestPeriod.return) >= Math.abs(worstPeriod.return);
 
 if (shouldReturnBullish) {
 return {
 symbol: stock.symbol,
 companyName: stock.name,
 sentiment: 'Bullish',
 period: bestPeriod.period,
 startDate: bestPeriod.startDate,
 endDate: bestPeriod.endDate,
 averageReturn: bestPeriod.return,
 winRate: seasonalData.statistics.winRate,
 years: seasonalData.statistics.yearsOfData,
 daysUntilStart: this.parseSeasonalDate(bestPeriod.startDate) - this.getDayOfYear(new Date()),
 isCurrentlyActive: true
 };
 } else {
 const bearishWinRate = 100 - seasonalData.statistics.winRate;
 return {
 symbol: stock.symbol,
 companyName: stock.name,
 sentiment: 'Bearish',
 period: worstPeriod.period,
 startDate: worstPeriod.startDate,
 endDate: worstPeriod.endDate,
 averageReturn: worstPeriod.return,
 winRate: bearishWinRate,
 years: seasonalData.statistics.yearsOfData,
 daysUntilStart: this.parseSeasonalDate(worstPeriod.startDate) - this.getDayOfYear(new Date()),
 isCurrentlyActive: true
 };
 }
 }
 
 // Only one is active - return that one
 if (bestIsActive) {
 return {
 symbol: stock.symbol,
 companyName: stock.name,
 sentiment: 'Bullish',
 period: bestPeriod.period,
 startDate: bestPeriod.startDate,
 endDate: bestPeriod.endDate,
 averageReturn: bestPeriod.return,
 winRate: seasonalData.statistics.winRate,
 years: seasonalData.statistics.yearsOfData,
 daysUntilStart: this.parseSeasonalDate(bestPeriod.startDate) - this.getDayOfYear(new Date()),
 isCurrentlyActive: true
 };
 } else {
 const bearishWinRate = 100 - seasonalData.statistics.winRate;
 return {
 symbol: stock.symbol,
 companyName: stock.name,
 sentiment: 'Bearish',
 period: worstPeriod.period,
 startDate: worstPeriod.startDate,
 endDate: worstPeriod.endDate,
 averageReturn: worstPeriod.return,
 winRate: bearishWinRate,
 years: seasonalData.statistics.yearsOfData,
 daysUntilStart: this.parseSeasonalDate(worstPeriod.startDate) - this.getDayOfYear(new Date()),
 isCurrentlyActive: true
 };
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
 isCurrentlyActive: true
 };
 

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
 isCurrentlyActive: true
 };
 

 return opportunity;
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
 isCurrentlyActive: true
 };
 
 batchOpportunities.push(opportunity);

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
 isCurrentlyActive: true
 };
 
 batchOpportunities.push(opportunity);

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
 
 // Show seasonals that start in 30 days AND keep showing for 30 days after start
 return daysDifference >= 1 && daysDifference <= 30 || // Upcoming (1-30 days)
 daysDifference >= -30 && daysDifference <= 0; // Recently started (0-30 days ago)
 }

 // Find all 30-day windows throughout the year
 private findAll30DayWindows(dailyData: any[]): any[] {
 const windows: any[] = [];
 const windowSize = 30;

 // Slide through the year to find all 30-day windows
 for (let startDay = 1; startDay <= 365 - windowSize; startDay++) {
 const endDay = startDay + windowSize - 1;
 const windowData = dailyData.filter((d: any) => d.dayOfYear >= startDay && d.dayOfYear <= endDay);
 
 if (windowData.length >= 25) { // Ensure we have enough data points
 const windowReturn = windowData.reduce((sum: number, d: any) => sum + d.avgReturn, 0);
 const avgWindowReturn = windowReturn / windowData.length;
 
 const startDataPoint = dailyData.find((d: any) => d.dayOfYear === startDay);
 const endDataPoint = dailyData.find((d: any) => d.dayOfYear === endDay);
 
 if (startDataPoint && endDataPoint) {
 windows.push({
 startDay,
 endDay,
 avgReturn: avgWindowReturn,
 period: `${startDataPoint.monthName} ${startDataPoint.day} - ${endDataPoint.monthName} ${endDataPoint.day}`,
 startDate: `${startDataPoint.monthName} ${startDataPoint.day}`,
 endDate: `${endDataPoint.monthName} ${endDataPoint.day}`
 });
 }
 }
 }

 return windows;
 }

 // Calculate actual years of data available
 private calculateYearsOfData(data: any[]): number {
 if (!data || data.length === 0) return 0;
 
 // Count unique years in the data
 const uniqueYears = new Set<number>();
 data.forEach((d: any) => {
 const date = new Date(d.t);
 uniqueYears.add(date.getFullYear());
 });
 
 return uniqueYears.size;
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
 const finalReturn = spyReturn - stockReturn; // INVERTED from chart to match displayed periods
 
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
 dailyData,
 statistics: {
 winRate,
 yearsOfData: years
 },
 spyComparison: {
 best30DayPeriod: {
 period: bestPeriod.period,
 return: bestPeriod.avgReturn * 30,
 startDate: bestPeriod.startDate,
 endDate: bestPeriod.endDate
 },
 worst30DayPeriod: {
 period: worstPeriod.period,
 return: worstPeriod.avgReturn * 30,
 startDate: worstPeriod.startDate,
 endDate: worstPeriod.endDate
 }
 }
 };
 }

}

export default SeasonalScreenerService;
export type { SeasonalOpportunity };
