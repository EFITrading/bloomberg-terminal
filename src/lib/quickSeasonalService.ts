// Quick seasonal data utility for chatbot
import PolygonService from './polygonService';
import GlobalDataCache from './GlobalDataCache';

const polygonService = new PolygonService();

interface PolygonDataPoint {
 v: number; // volume
 vw: number; // volume weighted average price 
 o: number; // open
 c: number; // close
 h: number; // high
 l: number; // low
 t: number; // timestamp
 n: number; // number of transactions
}

interface DailySeasonalData {
 dayOfYear: number;
 month: number;
 day: number;
 monthName: string;
 avgReturn: number;
 cumulativeReturn: number;
 occurrences: number;
 positiveYears: number;
 winningTrades: number;
 pattern: number;
 yearlyReturns: { [year: number]: number };
}

interface SeasonalPeriod {
 period: string;
 return: number;
 startDate: string;
 endDate: string;
}

export interface QuickSeasonalData {
 symbol: string;
 companyName: string;
 best30DayPeriod: SeasonalPeriod;
 worst30DayPeriod: SeasonalPeriod;
 bestMonths: Array<{ month: string; avgReturn: number }>;
 worstMonths: Array<{ month: string; avgReturn: number }>;
 bestQuarter: { quarter: string; return: number };
 worstQuarter: { quarter: string; return: number };
 yearsOfData: number;
 totalReturn: number;
 winRate: number;
}

class QuickSeasonalService {
 private getDayOfYear(date: Date): number {
 const start = new Date(date.getFullYear(), 0, 0);
 const diff = date.getTime() - start.getTime();
 return Math.floor(diff / (1000 * 60 * 60 * 24));
 }

 private analyze30DayPatterns(dailyData: DailySeasonalData[]) {
 const windowSize = 30;
 let bestPeriod = { startDay: 1, endDay: 30, avgReturn: -999, period: '', startDate: '', endDate: '' };
 let worstPeriod = { startDay: 1, endDay: 30, avgReturn: 999, period: '', startDate: '', endDate: '' };

 // Create a lookup map for faster access
 const dayLookup: { [dayOfYear: number]: DailySeasonalData } = {};
 dailyData.forEach(day => {
 dayLookup[day.dayOfYear] = day;
 });

 // Slide through the year to find 30-day windows - much more efficiently
 for (let startDay = 1; startDay <= 365 - windowSize; startDay++) {
 const endDay = startDay + windowSize - 1;
 
 let windowReturn = 0;
 let validDays = 0;
 
 // Calculate window return efficiently
 for (let day = startDay; day <= endDay; day++) {
 if (dayLookup[day]) {
 windowReturn += dayLookup[day].avgReturn;
 validDays++;
 }
 }
 
 if (validDays >= 20) { // Ensure we have enough data points (reduced from 25 for performance)
 const avgWindowReturn = windowReturn / validDays;
 
 // Check for best period
 if (avgWindowReturn > bestPeriod.avgReturn) {
 const startDataPoint = dayLookup[startDay];
 const endDataPoint = dayLookup[endDay];
 
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
 const startDataPoint = dayLookup[startDay];
 const endDataPoint = dayLookup[endDay];
 
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
 }

 async getQuickSeasonalData(symbol: string, yearsBack: number = 15): Promise<QuickSeasonalData | null> {
 try {
 console.log(` QuickSeasonalService: Starting FAST analysis for ${symbol} with ${yearsBack} years`);
 const cache = GlobalDataCache.getInstance();
 
 // Reduce years for performance (5 years is usually enough for seasonal patterns)
 const yearsToFetch = Math.min(yearsBack, 5);
 const endDate = new Date();
 const startDate = new Date();
 startDate.setFullYear(endDate.getFullYear() - yearsToFetch);

 const startDateStr = startDate.toISOString().split('T')[0];
 const endDateStr = endDate.toISOString().split('T')[0];
 
 console.log(` FAST processing: ${startDateStr} to ${endDateStr} (${yearsToFetch} years for speed)`);

 // Check cache first
 const cachedHistorical = cache.get(GlobalDataCache.keys.HISTORICAL_DATA(symbol, startDateStr, endDateStr));
 const cachedTicker = cache.get(GlobalDataCache.keys.TICKER_DETAILS(symbol));
 
 let historicalResponse, spyResponse, tickerDetails;
 
 if (cachedHistorical && cachedTicker) {
 console.log(` Using cached data for ${symbol} - instant seasonal analysis!`);
 historicalResponse = cachedHistorical;
 tickerDetails = cachedTicker;
 
 if (symbol.toUpperCase() !== 'SPY') {
 const cachedSPY = cache.get(GlobalDataCache.keys.HISTORICAL_DATA('SPY', startDateStr, endDateStr));
 if (cachedSPY) {
 spyResponse = cachedSPY;
 } else {
 console.log(` Fetching SPY benchmark data...`);
 spyResponse = await polygonService.getHistoricalData('SPY', startDateStr, endDateStr);
 if (spyResponse) {
 cache.set(GlobalDataCache.keys.HISTORICAL_DATA('SPY', startDateStr, endDateStr), spyResponse);
 }
 }
 }
 } else {
 console.log(` Fetching FAST seasonal data for ${symbol}...`);
 
 // Skip SPY for speed - just get the main stock data
 historicalResponse = await polygonService.getHistoricalData(symbol, startDateStr, endDateStr);
 spyResponse = null; // Skip SPY processing for speed
 
 console.log(` Historical data results: ${symbol}=${historicalResponse?.resultsCount || 0} points (SPY skipped for speed)`);
 
 tickerDetails = await polygonService.getTickerDetails(symbol);
 console.log(` Ticker details: ${tickerDetails ? `${tickerDetails.name} (${tickerDetails.ticker})` : 'not found'}`);
 
 // Cache the results
 if (historicalResponse) {
 cache.set(GlobalDataCache.keys.HISTORICAL_DATA(symbol, startDateStr, endDateStr), historicalResponse);
 }
 if (tickerDetails) {
 cache.set(GlobalDataCache.keys.TICKER_DETAILS(symbol), tickerDetails);
 }
 }

 if (!historicalResponse || !historicalResponse.results || historicalResponse.results.length === 0) {
 console.error(` No historical data for ${symbol}: response=${!!historicalResponse}, results=${historicalResponse?.results?.length || 0}`);
 return null;
 }
 
 console.log(` Processing ${historicalResponse.results.length} data points for seasonal analysis...`);

 // Process into daily seasonal format
 const seasonalData = this.processDailySeasonalData(
 historicalResponse.results, 
 spyResponse?.results || null,
 symbol,
 tickerDetails?.name || symbol,
 yearsToFetch
 );
 
 if (seasonalData) {
 console.log(` Seasonal analysis complete for ${symbol}: ${seasonalData.yearsOfData} years, win rate ${seasonalData.winRate.toFixed(1)}%`);
 } else {
 console.error(` Seasonal processing failed for ${symbol}`);
 }

 return seasonalData;

 } catch (error) {
 console.error(` QuickSeasonalService error for ${symbol}:`, error);
 return null;
 }
 }

 private processDailySeasonalData(
 data: PolygonDataPoint[],
 spyData: PolygonDataPoint[] | null,
 symbol: string, 
 companyName: string,
 years: number
 ): QuickSeasonalData {
 
 console.log(` FAST processing ${data.length} data points for ${symbol}...`);
 
 // Simple monthly grouping for speed
 const monthlyReturns: { [month: number]: number[] } = {};
 const yearlyReturns: { [year: number]: number } = {};
 
 // Process data into simple monthly returns (much faster)
 for (let i = 1; i < data.length; i++) {
 const currentItem = data[i];
 const previousItem = data[i - 1];
 const date = new Date(currentItem.t);
 const month = date.getMonth() + 1; // 1-12
 const year = date.getFullYear();
 
 // Calculate simple stock return (no SPY comparison for speed)
 const stockReturn = ((currentItem.c - previousItem.c) / previousItem.c) * 100;
 
 if (!monthlyReturns[month]) {
 monthlyReturns[month] = [];
 }
 monthlyReturns[month].push(stockReturn);
 
 if (!yearlyReturns[year]) {
 yearlyReturns[year] = 0;
 }
 yearlyReturns[year] += stockReturn;
 }

 // Calculate simple monthly averages
 const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
 const monthlyAverages = Object.keys(monthlyReturns).map(month => {
 const monthNum = parseInt(month);
 const returns = monthlyReturns[monthNum];
 const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
 
 return {
 month: monthNames[monthNum - 1],
 avgReturn: avgReturn
 };
 });

 const sortedMonthsByPerformance = [...monthlyAverages].sort((a, b) => b.avgReturn - a.avgReturn);
 const bestMonths = sortedMonthsByPerformance.slice(0, 3);
 const worstMonths = sortedMonthsByPerformance.slice(-3).reverse();

 // Simple quarterly data
 const quarterlyData = [
 { 
 quarter: 'Q1', 
 return: monthlyAverages.slice(0, 3).reduce((sum, month) => sum + month.avgReturn, 0) / 3
 },
 { 
 quarter: 'Q2', 
 return: monthlyAverages.slice(3, 6).reduce((sum, month) => sum + month.avgReturn, 0) / 3
 },
 { 
 quarter: 'Q3', 
 return: monthlyAverages.slice(6, 9).reduce((sum, month) => sum + month.avgReturn, 0) / 3
 },
 { 
 quarter: 'Q4', 
 return: monthlyAverages.slice(9, 12).reduce((sum, month) => sum + month.avgReturn, 0) / 3
 }
 ];

 const sortedQuarters = [...quarterlyData].sort((a, b) => b.return - a.return);
 const bestQuarter = sortedQuarters[0];
 const worstQuarter = sortedQuarters[sortedQuarters.length - 1];

 // Simple best/worst periods (skip complex 30-day analysis for speed)
 const best30DayPeriod = {
 period: `${bestMonths[0]?.month || 'Jan'} - Best Month`,
 return: (bestMonths[0]?.avgReturn || 0) * 30,
 startDate: bestMonths[0]?.month || 'Jan',
 endDate: bestMonths[0]?.month || 'Jan'
 };
 
 const worst30DayPeriod = {
 period: `${worstMonths[0]?.month || 'Dec'} - Worst Month`,
 return: (worstMonths[0]?.avgReturn || 0) * 30,
 startDate: worstMonths[0]?.month || 'Dec',
 endDate: worstMonths[0]?.month || 'Dec'
 };

 // Calculate overall statistics
 const allReturns = Object.values(yearlyReturns);
 const winningYears = allReturns.filter(ret => ret > 0).length;
 const totalTrades = allReturns.length;
 const winRate = totalTrades > 0 ? (winningYears / totalTrades) * 100 : 0;
 const totalReturn = allReturns.reduce((sum, ret) => sum + ret, 0);

 console.log(` FAST seasonal analysis complete for ${symbol}: ${years} years, win rate ${winRate.toFixed(1)}%`);

 return {
 symbol,
 companyName,
 best30DayPeriod,
 worst30DayPeriod,
 bestMonths,
 worstMonths,
 bestQuarter,
 worstQuarter,
 yearsOfData: years,
 totalReturn,
 winRate
 };
 }
}

export default new QuickSeasonalService();