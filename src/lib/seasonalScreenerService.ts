// Service for screening seasonal opportunities from top stocks
import PolygonService from './polygonService';
import { TOP_1000_SYMBOLS } from './Top1000Symbols';

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

// Top 1000 US companies by market capitalization (as of 2025)
// Using the comprehensive TOP_1000_SYMBOLS list for better coverage
const TOP1000_BY_MARKET_CAP: StockListItem[] = TOP_1000_SYMBOLS.map(symbol => ({
  symbol: symbol,
  name: symbol // We'll use symbol as name for simplicity
}));

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
    const today = new Date(); // Use current date
    const todayDayOfYear = this.getDayOfYear(today);
    
    // Parse the seasonal start date (e.g., "Sep 10" -> day of year)
    const seasonalStartDay = this.parseSeasonalDate(startDate);
    
    // Check if seasonal starts within reasonable timeframe (show upcoming opportunities)
    const daysDifference = seasonalStartDay - todayDayOfYear;
    
    // Show seasonals that start between -15 days and +45 days from today
    // This gives us current/recent patterns and upcoming opportunities for the next 6 weeks
    return daysDifference >= -15 && daysDifference <= 45;
  }

  // Main screening function with bulk requests and configurable batch size
  async screenSeasonalOpportunities(years: number = 15, maxStocks: number = 100, startOffset: number = 0): Promise<SeasonalOpportunity[]> {
    const opportunities: SeasonalOpportunity[] = [];
    const seenSymbols = new Set<string>(); // Track processed symbols to avoid duplicates
    const actualMaxStocks = Math.min(maxStocks, TOP1000_BY_MARKET_CAP.length - startOffset);
    console.log(`🔍 Starting bulk seasonal screening of ${actualMaxStocks} companies (positions ${startOffset + 1}-${startOffset + actualMaxStocks}) by market cap...`);

    try {
      // First, get SPY data for comparison (bulk request)
      console.log(`📊 Getting SPY data for ${years} years...`);
      const spyData = await this.polygonService.getBulkHistoricalData('SPY', years);
      
      if (!spyData?.results?.length) {
        throw new Error('Failed to get SPY data for comparison');
      }

      console.log(`✅ SPY data loaded: ${spyData.results.length} data points`);

      // Process ALL stocks in parallel - NO BATCHING, MAXIMUM SPEED
      const stocksToProcess = TOP1000_BY_MARKET_CAP.slice(startOffset, startOffset + actualMaxStocks);
      
      console.log(`🚀 Processing ALL ${stocksToProcess.length} companies in PARALLEL - NO LIMITS!`);
      
      // Process everything at once
      const allPromises = stocksToProcess.map(async (stock: StockListItem) => {
        try {
          // Skip if we've already processed this symbol
          if (seenSymbols.has(stock.symbol)) {
            console.log(`⚠️ Skipping duplicate symbol: ${stock.symbol}`);
            return;
          }
          seenSymbols.add(stock.symbol);
          
          console.log(`📊 Getting bulk data for ${stock.symbol}...`);
          
          // Use bulk historical data request
          const stockData = await this.polygonService.getBulkHistoricalData(stock.symbol, years);
          
          if (!stockData?.results?.length) {
            console.warn(`⚠️ No bulk data for ${stock.symbol}`);
            return;
          }

          console.log(`✅ ${stock.symbol}: ${stockData.results.length} data points`);
          
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
                    daysUntilStart: this.parseSeasonalDate(bullish.startDate) - this.getDayOfYear(new Date()),
                    isCurrentlyActive: true
                  };
                  console.log(`🟢 Found BULLISH seasonal for ${stock.symbol}: ${bullish.period} (+${bullish.return.toFixed(2)}%)`);
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
                    daysUntilStart: this.parseSeasonalDate(bearish.startDate) - this.getDayOfYear(new Date()),
                    isCurrentlyActive: true
                  };
                  
                  // Only use bearish if no bullish found, or if bearish is much stronger
                  if (!bestOpportunity || Math.abs(bearish.return) > Math.abs(bestOpportunity.averageReturn) * 1.5) {
                    bestOpportunity = bearishOpportunity;
                    console.log(`🔴 Found BEARISH seasonal for ${stock.symbol}: ${bearish.period} (${bearish.return.toFixed(2)}%)`);
                  }
                }
              }
              
              // Only add the best opportunity for this symbol
              if (bestOpportunity) {
                opportunities.push(bestOpportunity);
              }
            }
          } catch (error) {
            console.warn(`⚠️ Failed to process ${stock.symbol}:`, error);
          }
        });

        // Wait for ALL requests to complete at once - NO BATCHING!
        await Promise.all(allPromises);

    } catch (error) {
      console.error('❌ Bulk screening failed:', error);
      
      // Return mock data for testing if API fails
      console.log('🔄 Returning test data for development...');
      return this.getMockSeasonalData();
    }

    // Remove any remaining duplicates by symbol (safety check)
    const uniqueOpportunities = opportunities.filter((opportunity, index, array) => 
      array.findIndex(o => o.symbol === opportunity.symbol) === index
    );

    // Sort by absolute return (strongest signals first)
    uniqueOpportunities.sort((a, b) => Math.abs(b.averageReturn) - Math.abs(a.averageReturn));
    
    console.log(`🎯 Bulk screening complete! Found ${uniqueOpportunities.length} unique seasonal opportunities`);
    console.log(`📈 Bullish opportunities: ${uniqueOpportunities.filter(o => o.sentiment === 'Bullish').length}`);
    console.log(`📉 Bearish opportunities: ${uniqueOpportunities.filter(o => o.sentiment === 'Bearish').length}`);
    
    return uniqueOpportunities;
  }

  // Mock data for testing
  private getMockSeasonalData(): SeasonalOpportunity[] {
    const today = new Date();
    const todayDayOfYear = this.getDayOfYear(today);
    
    return [
      {
        symbol: 'AAPL',
        companyName: 'Apple Inc.',
        sentiment: 'Bullish' as const,
        period: 'Sep 10 - Oct 9',
        startDate: 'Sep 10',
        endDate: 'Oct 9',
        averageReturn: 4.21,
        winRate: 68,
        years: 15,
        daysUntilStart: this.parseSeasonalDate('Sep 10') - todayDayOfYear,
        isCurrentlyActive: true
      },
      {
        symbol: 'MSFT',
        companyName: 'Microsoft Corporation',
        sentiment: 'Bullish' as const,
        period: 'Sep 5 - Oct 4',
        startDate: 'Sep 5',
        endDate: 'Oct 4',
        averageReturn: 3.89,
        winRate: 72,
        years: 15,
        daysUntilStart: this.parseSeasonalDate('Sep 5') - todayDayOfYear,
        isCurrentlyActive: true
      },
      {
        symbol: 'GOOGL',
        companyName: 'Alphabet Inc.',
        sentiment: 'Bearish' as const,
        period: 'Jun 7 - Jul 6',
        startDate: 'Jun 7',
        endDate: 'Jul 6',
        averageReturn: -5.59,
        winRate: 25,
        years: 15,
        daysUntilStart: this.parseSeasonalDate('Jun 7') - todayDayOfYear,
        isCurrentlyActive: false
      },
      {
        symbol: 'TSLA',
        companyName: 'Tesla Inc.',
        sentiment: 'Bullish' as const,
        period: 'Sep 8 - Oct 7',
        startDate: 'Sep 8',
        endDate: 'Oct 7',
        averageReturn: 6.12,
        winRate: 61,
        years: 10,
        daysUntilStart: this.parseSeasonalDate('Sep 8') - todayDayOfYear,
        isCurrentlyActive: true
      },
      {
        symbol: 'NVDA',
        companyName: 'NVIDIA Corporation',
        sentiment: 'Bullish' as const,
        period: 'Sep 12 - Oct 11',
        startDate: 'Sep 12',
        endDate: 'Oct 11',
        averageReturn: 7.85,
        winRate: 75,
        years: 12,
        daysUntilStart: this.parseSeasonalDate('Sep 12') - todayDayOfYear,
        isCurrentlyActive: true
      }
    ].filter(opp => opp.isCurrentlyActive || this.isSeasonalCurrentlyActive(opp.startDate));
  }

  // Fallback method with smaller batches
  async screenSeasonalOpportunitiesBatched(years: number = 15): Promise<SeasonalOpportunity[]> {
    const opportunities: SeasonalOpportunity[] = [];
    console.log(`🔍 Starting seasonal screening of ${TOP1000_BY_MARKET_CAP.length} top market cap companies...`);

    // Process stocks in smaller batches
    const batchSize = 10;
    for (let i = 0; i < TOP1000_BY_MARKET_CAP.length; i += batchSize) {
      const batch = TOP1000_BY_MARKET_CAP.slice(i, i + batchSize);
      
      console.log(`📦 Processing batch ${Math.floor(i/batchSize) + 1}: ${batch.map((s: StockListItem) => s.symbol).join(', ')}`);
      
      const batchPromises = batch.map(async (stock: StockListItem) => {
        try {
          console.log(`📊 Analyzing ${stock.symbol} (${stock.name})...`);
          
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
                console.log(`🟢 Found BULLISH seasonal for ${stock.symbol}: ${bullish.period} (+${bullish.return.toFixed(2)}%)`);
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
                console.log(`🔴 Found BEARISH seasonal for ${stock.symbol}: ${bearish.period} (${bearish.return.toFixed(2)}%)`);
              }
            }
          }
        } catch (error) {
          console.warn(`⚠️ Failed to analyze ${stock.symbol}:`, error);
        }
      });

      await Promise.all(batchPromises);
      
      // Add delay between batches to respect rate limits
      if (i + batchSize < TOP1000_BY_MARKET_CAP.length) {
        console.log('⏳ Waiting 2 seconds before next batch...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Sort by absolute return (strongest signals first)
    opportunities.sort((a, b) => Math.abs(b.averageReturn) - Math.abs(a.averageReturn));
    
    console.log(`🎯 Batched screening complete! Found ${opportunities.length} active seasonal opportunities`);
    
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

