// Web Worker for heavy computational tasks
import { PolygonAPIWorker } from './PolygonAPIWorker';

interface WorkerMessage {
  type: 'BATCH_HISTORICAL' | 'CALCULATE_PATTERNS' | 'PROCESS_OPTIONS_FLOW';
  payload: any;
  id: string;
}

interface WorkerResponse {
  type: 'SUCCESS' | 'ERROR' | 'PROGRESS';
  payload: any;
  id: string;
}

class MarketDataProcessor {
  private worker: PolygonAPIWorker;

  constructor(apiKey: string) {
    this.worker = new PolygonAPIWorker(apiKey);
  }

  /**
   * Process historical data in batches
   */
  async processBatchHistorical(symbols: string[], years: number = 15): Promise<any> { // Default to 15 years for unlimited API
    try {
      // Use worker for efficient batching
      const results = await this.worker.batchHistoricalData(symbols, '1/day', years);
      
      // Process results in parallel
      const processedData = await this.processHistoricalDataParallel(results);
      
      return {
        success: true,
        data: processedData,
        count: Object.keys(processedData).length
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        data: {}
      };
    }
  }

  /**
   * Process historical data in parallel using Web Workers concept
   */
  private async processHistoricalDataParallel(rawData: {[symbol: string]: any}): Promise<any> {
    const symbols = Object.keys(rawData);
    const batchSize = 10; // Process 10 symbols at a time
    const results: any = {};

    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (symbol) => {
        const data = rawData[symbol];
        if (!data || !data.results || data.results.length === 0) {
          return { symbol, processed: null };
        }

        try {
          // Calculate performance metrics
          const processed = this.calculatePerformanceMetrics(data.results, symbol);
          return { symbol, processed };
        } catch (error) {
          console.error(`❌ Error processing ${symbol}:`, error);
          return { symbol, processed: null };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      
      // Aggregate results
      batchResults.forEach(({ symbol, processed }) => {
        if (processed) {
          results[symbol] = processed;
        }
      });

      // Progress update
      if (symbols.length > 20) {
        const progress = Math.round(((i + batchSize) / symbols.length) * 100);
        console.log(`📊 Processing progress: ${progress}%`);
      }
    }

    return results;
  }

  /**
   * Calculate performance metrics for a symbol
   */
  private calculatePerformanceMetrics(priceData: any[], symbol: string): any {
    if (!priceData || priceData.length < 2) return null;

    const latest = priceData[priceData.length - 1];
    const currentPrice = latest.c;

    // Calculate various timeframe returns
    const dataLength = priceData.length;
    const price1DayAgo = dataLength >= 2 ? priceData[dataLength - 2]?.c : currentPrice;
    const price5DaysAgo = dataLength >= 6 ? priceData[dataLength - 6]?.c : (dataLength >= 2 ? priceData[0]?.c : currentPrice);
    const price13DaysAgo = dataLength >= 14 ? priceData[dataLength - 14]?.c : (dataLength >= 2 ? priceData[0]?.c : currentPrice);
    const price21DaysAgo = dataLength >= 22 ? priceData[dataLength - 22]?.c : (dataLength >= 2 ? priceData[0]?.c : currentPrice);

    const change1d = price1DayAgo ? ((currentPrice - price1DayAgo) / price1DayAgo) * 100 : 0;
    const change5d = price5DaysAgo ? ((currentPrice - price5DaysAgo) / price5DaysAgo) * 100 : 0;
    const change13d = price13DaysAgo ? ((currentPrice - price13DaysAgo) / price13DaysAgo) * 100 : 0;
    const change21d = price21DaysAgo ? ((currentPrice - price21DaysAgo) / price21DaysAgo) * 100 : 0;

    // Calculate volatility (standard deviation of returns)
    const returns = [];
    for (let i = 1; i < Math.min(priceData.length, 21); i++) {
      const dailyReturn = ((priceData[i].c - priceData[i-1].c) / priceData[i-1].c) * 100;
      returns.push(dailyReturn);
    }
    
    const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance);

    return {
      symbol,
      price: currentPrice,
      change1d: Math.round(change1d * 100) / 100,
      change5d: Math.round(change5d * 100) / 100,
      change13d: Math.round(change13d * 100) / 100,
      change21d: Math.round(change21d * 100) / 100,
      volatility: Math.round(volatility * 100) / 100,
      volume: latest.v || 0,
      dataPoints: priceData.length,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Calculate seasonal patterns from historical data
   */
  async calculateSeasonalPatterns(symbols: string[], years: number = 5): Promise<any> {
    try {
      const historicalData = await this.worker.batchHistoricalData(symbols, '1/day', years);
      
      const patterns = await Promise.all(
        Object.entries(historicalData).map(async ([symbol, data]) => {
          if (!data || !data.results) return null;
          
          return this.analyzeSeasonalPattern(data.results, symbol);
        })
      );

      return patterns.filter(p => p !== null);
    } catch (error) {
      console.error('❌ Error calculating seasonal patterns:', error);
      return [];
    }
  }

  /**
   * Analyze seasonal patterns for a single symbol
   */
  private analyzeSeasonalPattern(priceData: any[], symbol: string): any {
    if (!priceData || priceData.length < 252) return null; // Need at least 1 year

    // Group data by month to find seasonal patterns
    const monthlyReturns: { [month: number]: number[] } = {};
    
    for (let i = 1; i < priceData.length; i++) {
      const currentBar = priceData[i];
      const previousBar = priceData[i - 1];
      
      if (!currentBar || !previousBar) continue;
      
      const date = new Date(currentBar.t);
      const month = date.getMonth() + 1; // 1-12
      const monthlyReturn = ((currentBar.c - previousBar.c) / previousBar.c) * 100;
      
      if (!monthlyReturns[month]) monthlyReturns[month] = [];
      monthlyReturns[month].push(monthlyReturn);
    }

    // Find the strongest seasonal pattern
    let bestMonth = 1;
    let bestAvgReturn = 0;
    let bestWinRate = 0;

    for (const month in monthlyReturns) {
      const returns = monthlyReturns[parseInt(month)];
      if (returns.length < 3) continue; // Need at least 3 years of data
      
      const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
      const winRate = (returns.filter(ret => ret > 0).length / returns.length) * 100;
      
      if (Math.abs(avgReturn) > Math.abs(bestAvgReturn)) {
        bestMonth = parseInt(month);
        bestAvgReturn = avgReturn;
        bestWinRate = winRate;
      }
    }

    const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const patternType = bestAvgReturn > 0 ? 'Bullish' : 'Bearish';
    const monthName = monthNames[bestMonth];

    return {
      symbol,
      companyName: `${symbol} Inc.`,
      sector: 'Market',
      pattern: `${monthName} ${patternType} Pattern`,
      period: `${monthName} 1 - ${monthName} 31`,
      startDate: `${monthName} 1`,
      endDate: `${monthName} 31`,
      avgReturn: Math.round(bestAvgReturn * 100) / 100,
      winRate: Math.round(bestWinRate),
      years: Math.floor(priceData.length / 252),
      confidence: bestWinRate > 70 ? 'High' : bestWinRate > 50 ? 'Medium' : 'Low',
      category: patternType,
      description: `Historical ${monthName} ${patternType.toLowerCase()} pattern based on ${Math.floor(priceData.length / 252)} years of data`,
      riskLevel: Math.abs(bestAvgReturn) > 5 ? 'High' : Math.abs(bestAvgReturn) > 2 ? 'Medium' : 'Low',
      currentPrice: priceData[priceData.length - 1]?.c || 0,
      priceChange: 0,
      priceChangePercent: 0
    };
  }

  /**
   * Get worker status
   */
  getWorkerStatus() {
    return this.worker.getQueueStatus();
  }
}

export { MarketDataProcessor };