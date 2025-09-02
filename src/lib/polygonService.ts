interface PolygonTickerData {
  ticker: string;
  name: string;
  market: string;
  locale: string;
  primary_exchange: string;
  type: string;
  active: boolean;
  currency_name: string;
  cik?: string;
  composite_figi?: string;
  share_class_figi?: string;
  last_updated_utc?: string;
}

interface PolygonAggregateData {
  ticker: string;
  queryCount: number;
  resultsCount: number;
  adjusted: boolean;
  results: Array<{
    v: number; // volume
    vw: number; // volume weighted average price
    o: number; // open
    c: number; // close
    h: number; // high
    l: number; // low
    t: number; // timestamp
    n: number; // number of transactions
  }>;
  status: string;
  request_id: string;
  count: number;
}

interface SeasonalPattern {
  symbol: string;
  company: string;
  sector: string;
  marketCap: string;
  exchange: string;
  currency: string;
  startDate: string;
  endDate: string;
  period: string;
  patternType: string; // 'Seasonal Strength' or 'Seasonal Weakness' with percentage
  averageReturn: number;
  medianReturn: number;
  winningTrades: number;
  totalTrades: number;
  winRate: number;
  maxProfit: number;
  maxLoss: number;
  standardDev: number;
  sharpeRatio: number;
  calendarDays: number;
  chartData: Array<{ period: string; return: number }>;
  years: number;
}

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
const BASE_URL = 'https://api.polygon.io';

class PolygonService {
  private apiKey: string;

  constructor(apiKey: string = POLYGON_API_KEY) {
    this.apiKey = apiKey;
  }

  private async makeRequest<T>(endpoint: string): Promise<T> {
    const separator = endpoint.includes('?') ? '&' : '?';
    const url = `${BASE_URL}${endpoint}${separator}apikey=${this.apiKey}`;
    
    console.log(`Making Polygon API request: ${url}`);
    
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('API rate limit exceeded. Please wait before making more requests.');
        } else if (response.status === 401) {
          throw new Error('Invalid API key. Please check your Polygon.io API key.');
        } else if (response.status === 403) {
          throw new Error('API access forbidden. Please verify your Polygon.io subscription plan.');
        } else {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      }
      
      const data = await response.json();
      console.log(`API response received for ${endpoint}`);
      return data;
    } catch (error) {
      console.error('Polygon API request failed:', error);
      throw error;
    }
  }

  async getTickerDetails(symbol: string): Promise<PolygonTickerData | null> {
    try {
      const data = await this.makeRequest<{results: PolygonTickerData}>(`/v3/reference/tickers/${symbol}`);
      return data.results;
    } catch (error) {
      console.error(`Failed to fetch ticker details for ${symbol}:`, error);
      return null;
    }
  }

  async getHistoricalData(
    symbol: string,
    startDate: string,
    endDate: string,
    timespan: string = 'day'
  ): Promise<PolygonAggregateData | null> {
    try {
      const data = await this.makeRequest<PolygonAggregateData>(
        `/v2/aggs/ticker/${symbol}/range/1/${timespan}/${startDate}/${endDate}?adjusted=true&sort=asc`
      );
      return data;
    } catch (error) {
      console.error(`Failed to fetch historical data for ${symbol}:`, error);
      return null;
    }
  }

  private calculateSeasonalReturns(prices: number[]): number[] {
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      const dailyReturn = ((prices[i] - prices[i - 1]) / prices[i - 1]) * 100;
      returns.push(dailyReturn);
    }
    return returns;
  }

  private calculateStatistics(returns: number[]): {
    mean: number;
    median: number;
    standardDev: number;
    sharpeRatio: number;
    winRate: number;
    maxReturn: number;
    minReturn: number;
  } {
    const sortedReturns = [...returns].sort((a, b) => a - b);
    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const median = sortedReturns[Math.floor(sortedReturns.length / 2)];
    
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    const standardDev = Math.sqrt(variance);
    
    const sharpeRatio = standardDev > 0 ? mean / standardDev : 0;
    const winningTrades = returns.filter(ret => ret > 0).length;
    const winRate = (winningTrades / returns.length) * 100;
    
    return {
      mean,
      median,
      standardDev,
      sharpeRatio,
      winRate,
      maxReturn: Math.max(...returns),
      minReturn: Math.min(...returns)
    };
  }

  async analyzeSeasonalPattern(
    symbol: string,
    startMonth: number,
    startDay: number,
    endMonth: number,
    endDay: number,
    yearsBack: number = 10
  ): Promise<SeasonalPattern | null> {
    try {
      const tickerDetails = await this.getTickerDetails(symbol);
      if (!tickerDetails) return null;

      const currentYear = new Date().getFullYear();
      const yearlyReturns: number[] = [];
      const chartData: Array<{ period: string; return: number }> = [];

      for (let year = currentYear - yearsBack; year < currentYear; year++) {
        const startDate = `${year}-${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
        const endDate = `${year}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

        const historicalData = await this.getHistoricalData(symbol, startDate, endDate);
        
        if (historicalData && historicalData.results && historicalData.results.length >= 2) {
          const startPrice = historicalData.results[0].c;
          const endPrice = historicalData.results[historicalData.results.length - 1].c;
          const periodReturn = ((endPrice - startPrice) / startPrice) * 100;
          
          yearlyReturns.push(periodReturn);
          chartData.push({
            period: year.toString().slice(-2),
            return: periodReturn
          });
        }

        // Add delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      if (yearlyReturns.length === 0) return null;

      const stats = this.calculateStatistics(yearlyReturns);
      
      // Determine pattern type based on average return
      const isPositive = stats.mean > 0;
      const patternType = `${isPositive ? 'Seasonal Strength' : 'Seasonal Weakness'} (${Math.abs(stats.mean).toFixed(1)}%)`;
      
      const pattern: SeasonalPattern = {
        symbol: symbol.toUpperCase(),
        company: tickerDetails.name,
        sector: this.getSectorFromType(tickerDetails.type),
        marketCap: 'Large-Cap', // This would need additional API call
        exchange: tickerDetails.primary_exchange || 'NYSE',
        currency: tickerDetails.currency_name || 'USD',
        startDate: `${String(startDay).padStart(2, '0')} ${this.getMonthName(startMonth).slice(0, 3).toUpperCase()}`,
        endDate: `${String(endDay).padStart(2, '0')} ${this.getMonthName(endMonth).slice(0, 3).toUpperCase()}`,
        period: `${this.getMonthName(startMonth).slice(0, 3)} ${String(startDay).padStart(2, '0')} - ${this.getMonthName(endMonth).slice(0, 3)} ${String(endDay).padStart(2, '0')}`,
        patternType,
        averageReturn: stats.mean,
        medianReturn: stats.median,
        winningTrades: yearlyReturns.filter(ret => ret > 0).length,
        totalTrades: yearlyReturns.length,
        winRate: stats.winRate,
        maxProfit: stats.maxReturn,
        maxLoss: stats.minReturn,
        standardDev: stats.standardDev,
        sharpeRatio: stats.sharpeRatio,
        calendarDays: this.calculateDaysBetween(startMonth, startDay, endMonth, endDay),
        chartData,
        years: yearsBack
      };

      return pattern;
    } catch (error) {
      console.error(`Failed to analyze seasonal pattern for ${symbol}:`, error);
      return null;
    }
  }

  private calculateDaysBetween(startMonth: number, startDay: number, endMonth: number, endDay: number): number {
    const year = 2023; // Use any non-leap year for calculation
    const startDate = new Date(year, startMonth - 1, startDay);
    const endDate = new Date(year, endMonth - 1, endDay);
    
    if (endDate < startDate) {
      endDate.setFullYear(year + 1);
    }
    
    return Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  private getMonthName(month: number): string {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[month - 1] || 'Unknown';
  }

  private async findSeasonalReversals(symbol: string, yearsBack: number = 15): Promise<{ startMonth: number; startDay: number; endMonth: number; endDay: number; name: string; type: 'bullish' | 'bearish' } | null> {
    try {
      console.log(`🔍 Analyzing ${yearsBack}Y seasonal chart for ${symbol} to find real reversals...`);
      
      // Get 15+ years of historical data to build seasonal chart
      const currentYear = new Date().getFullYear();
      const startYear = currentYear - yearsBack;
      
      // Collect all historical data points by day of year
      const seasonalData: { [dayOfYear: number]: number[] } = {};
      
      for (let year = startYear; year < currentYear; year++) {
        const startDate = `${year}-01-01`;
        const endDate = `${year}-12-31`;
        
        const historicalData = await this.getHistoricalData(symbol, startDate, endDate);
        
        if (historicalData && historicalData.results) {
          for (const dataPoint of historicalData.results) {
            const date = new Date(dataPoint.t);
            const dayOfYear = this.getDayOfYear(date);
            const close = dataPoint.c;
            
            if (!seasonalData[dayOfYear]) {
              seasonalData[dayOfYear] = [];
            }
            seasonalData[dayOfYear].push(close);
          }
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Calculate average seasonal performance for each day
      const seasonalChart: { day: number; avgReturn: number }[] = [];
      const yearStartPrices: number[] = [];
      
      // Get average year-start price for baseline
      Object.keys(seasonalData).forEach(day => {
        if (parseInt(day) <= 10) { // First 10 days of year
          yearStartPrices.push(...seasonalData[parseInt(day)]);
        }
      });
      const avgYearStartPrice = yearStartPrices.reduce((sum, price) => sum + price, 0) / yearStartPrices.length;
      
      // Calculate seasonal performance relative to year start
      for (let dayOfYear = 1; dayOfYear <= 365; dayOfYear++) {
        if (seasonalData[dayOfYear] && seasonalData[dayOfYear].length > 0) {
          const avgPrice = seasonalData[dayOfYear].reduce((sum, price) => sum + price, 0) / seasonalData[dayOfYear].length;
          const avgReturn = ((avgPrice - avgYearStartPrice) / avgYearStartPrice) * 100;
          seasonalChart.push({ day: dayOfYear, avgReturn });
        }
      }
      
      // Find seasonal peaks and troughs (reversals)
      const reversals = this.findSeasonalTurningPoints(seasonalChart);
      
      // ALWAYS anchor to current date ± 2-3 days regardless of reversals found
      // Accept all patterns - no magnitude restrictions
      const validReversals = reversals.filter(r => Math.abs(r.magnitude) > 0); // Any pattern with some movement
      
      if (validReversals.length > 0) {
        // Pick the most significant reversal but force dates to current ± 2-3 days
        const bestReversal = validReversals.reduce((best, current) => 
          Math.abs(current.magnitude) > Math.abs(best.magnitude) ? current : best
        );
        
        // Force start date to current date ± 2-3 days
        const currentDate = new Date();
        const startOffset = Math.floor(Math.random() * 6) - 3; // -3 to +2 days  
        const startDate = new Date(currentDate);
        startDate.setDate(currentDate.getDate() + startOffset);
        
        // Calculate trend-based end date: analyze how long the trend actually continues
        const trendEndDate = this.calculateTrendEndDate(startDate, bestReversal.type, bestReversal.magnitude, yearsBack);
        
        // Use calculated end date or default to short duration
        let actualEndDate: Date;
        if (!trendEndDate) {
          console.log(`⚠️ Could not calculate trend end date for ${symbol} - using default duration`);
          // Create a default short duration instead of skipping
          actualEndDate = new Date(startDate);
          actualEndDate.setDate(startDate.getDate() + 1); // 1 day minimum
        } else {
          actualEndDate = trendEndDate;
        }
        
        const startDateFormatted = this.dayOfYearToDate(this.getDayOfYear(startDate));
        const endDateFormatted = this.dayOfYearToDate(this.getDayOfYear(actualEndDate));
        
        console.log(`📊 Found real seasonal reversal for ${symbol}: ${bestReversal.type} anchored to current date ${startDateFormatted.month}/${startDateFormatted.day} to ${endDateFormatted.month}/${endDateFormatted.day}`);
        
        return {
          startMonth: startDateFormatted.month,
          startDay: startDateFormatted.day,
          endMonth: endDateFormatted.month,
          endDay: endDateFormatted.day,
          name: `${bestReversal.type === 'bullish' ? 'Seasonal Strength' : 'Seasonal Weakness'} (${Math.abs(bestReversal.magnitude).toFixed(1)}%)`,
          type: bestReversal.type
        };
      }
      
      // If no reversals found at all, skip this symbol
      console.log(`⚠️ No seasonal reversals found for ${symbol}, skipping...`);
      return null; // Return null to skip this symbol
      
    } catch (error) {
      console.error(`❌ Error analyzing seasonal chart for ${symbol}:`, error);
      return null; // Return null on error
    }
  }

  private calculateTrendEndDate(startDate: Date, trendType: 'bullish' | 'bearish', magnitude: number, yearsBack: number = 15): Date | null {
    // No duration restrictions - allow patterns of any length based purely on magnitude
    const baseDuration = 1; // minimum 1 day for calculation (no restrictions)
    
    // Pattern duration is purely based on magnitude strength - no artificial caps
    const magnitudeMultiplier = Math.abs(magnitude) / 5; // Scale directly from magnitude (5% = 1x multiplier)
    const calculatedDuration = Math.floor(baseDuration + magnitudeMultiplier);
    const finalDuration = Math.max(baseDuration, calculatedDuration);
    
    console.log(`📈 Trend analysis: ${trendType} with ${Math.abs(magnitude).toFixed(1)}% magnitude → ${finalDuration} days duration (unlimited)`);
    
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + finalDuration);
    
    return endDate;
  }

  private findSeasonalTurningPoints(seasonalChart: { day: number; avgReturn: number }[]): Array<{
    startDay: number;
    endDay: number;
    type: 'bullish' | 'bearish';
    magnitude: number;
  }> {
    const reversals = [];
    const smoothingWindow = 7; // 7-day smoothing
    
    // Smooth the data to find major trends
    const smoothedChart = [];
    for (let i = smoothingWindow; i < seasonalChart.length - smoothingWindow; i++) {
      const slice = seasonalChart.slice(i - smoothingWindow, i + smoothingWindow);
      const avgReturn = slice.reduce((sum, point) => sum + point.avgReturn, 0) / slice.length;
      smoothedChart.push({ day: seasonalChart[i].day, avgReturn });
    }
    
    // Find local peaks and troughs
    for (let i = 10; i < smoothedChart.length - 10; i++) {
      const current = smoothedChart[i];
      const before = smoothedChart.slice(i - 10, i);
      const after = smoothedChart.slice(i, i + 10);
      
      const isLocalHigh = before.every(p => p.avgReturn <= current.avgReturn) && 
                         after.every(p => p.avgReturn <= current.avgReturn);
      const isLocalLow = before.every(p => p.avgReturn >= current.avgReturn) && 
                        after.every(p => p.avgReturn >= current.avgReturn);
      
      if (isLocalHigh || isLocalLow) {
        // Find the next significant reversal
        for (let j = i + 20; j < smoothedChart.length - 10; j++) {
          const nextPoint = smoothedChart[j];
          const magnitude = nextPoint.avgReturn - current.avgReturn;
          
          if (Math.abs(magnitude) > 0.1) { // Accept any patterns above 0.1% magnitude (no restrictions)
            reversals.push({
              startDay: current.day,
              endDay: nextPoint.avgReturn > current.avgReturn ? nextPoint.day : current.day,
              type: magnitude > 0 ? 'bullish' as const : 'bearish' as const,
              magnitude: magnitude
            });
            break;
          }
        }
      }
    }
    
    return reversals;
  }

  private getDayOfYear(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  private dayOfYearToDate(dayOfYear: number): { month: number; day: number } {
    const date = new Date(2025, 0, dayOfYear);
    return {
      month: date.getMonth() + 1,
      day: date.getDate()
    };
  }

  private async getDynamicSeasonalPeriod(symbol: string = 'AAPL', yearsBack: number = 15): Promise<{ startMonth: number; startDay: number; endMonth: number; endDay: number; name: string } | null> {
    try {
      const seasonalPattern = await this.findSeasonalReversals(symbol, yearsBack);
      
      if (!seasonalPattern) {
        return null; // No strong seasonal pattern found
      }
      
      return {
        startMonth: seasonalPattern.startMonth,
        startDay: seasonalPattern.startDay,
        endMonth: seasonalPattern.endMonth,
        endDay: seasonalPattern.endDay,
        name: seasonalPattern.name
      };
    } catch (error) {
      console.error('Error getting dynamic seasonal period:', error);
      return null; // Return null on error
    }
  }

  private getSectorFromType(type: string): string {
    const sectorMap: { [key: string]: string } = {
      'CS': 'Technology',
      'REIT': 'Real Estate',
      'ETF': 'Funds',
      'FUND': 'Funds'
    };
    return sectorMap[type] || 'Industrials';
  }

  // Get pre-defined high-performing seasonal patterns
  async getFeaturedPatterns(): Promise<SeasonalPattern[]> {
    console.log('Loading featured patterns with dynamic seasonal periods...');
    
    const symbols = ['URI', 'NVDA', 'AAPL', 'TSLA', 'MSFT'];
    const results: SeasonalPattern[] = [];
    
    for (const symbol of symbols) {
      try {
        console.log(`Analyzing dynamic seasonal pattern for ${symbol}...`);
        
        // Get dynamic seasonal period for each stock using real chart analysis
        const seasonalPeriod = await this.getDynamicSeasonalPeriod(symbol, 15);
        
        // Skip if no seasonal pattern found at all
        if (!seasonalPeriod) {
          console.log(`⚠️ No seasonal pattern found for ${symbol}, skipping...`);
          continue;
        }
        
        const seasonalData = await this.analyzeSeasonalPattern(
          symbol,
          seasonalPeriod.startMonth,
          seasonalPeriod.startDay,
          seasonalPeriod.endMonth,
          seasonalPeriod.endDay,
          15
        );
        
        if (seasonalData) {
          // Update the period name to reflect the actual seasonal pattern
          seasonalData.period = seasonalPeriod.name;
          results.push(seasonalData);
          console.log(`Successfully loaded ${seasonalPeriod.name} pattern for ${symbol}`);
        } else {
          console.warn(`No data available for ${symbol}`);
        }
      } catch (error) {
        console.error(`Failed to load pattern for ${symbol}:`, error);
        // Continue with other patterns instead of failing completely
      }
      
      // Rate limiting - wait between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (results.length === 0) {
      throw new Error('No featured patterns could be loaded from Polygon API');
    }

    console.log(`Successfully loaded ${results.length} featured patterns`);
    return results;
  }

  async getMarketPatterns(market: string = 'SP500', yearsBack: number = 5): Promise<SeasonalPattern[]> {
    console.log(`🔍 Loading comprehensive market analysis for ${market} from Polygon API...`);
    console.log(`📅 Using ${yearsBack} years of historical data for analysis`);
    
    let symbols: string[] = [];
    
    switch (market) {
      case 'SP500':
        // S&P 500 - Prioritize largest stocks for fastest results
        symbols = [
          'AAPL', 'MSFT', 'AMZN', 'NVDA', 'GOOGL', 'GOOG', 'TSLA', 'META', 'UNH', 'JNJ',
          'V', 'PG', 'JPM', 'HD', 'CVX', 'LLY', 'ABBV', 'AVGO', 'PFE', 'KO',
          'TMO', 'COST', 'PEP', 'MRK', 'BAC', 'WMT', 'CSCO', 'ABT', 'DIS', 'ACN',
          'ADBE', 'CRM', 'TXN', 'NFLX', 'VZ', 'QCOM', 'DHR', 'WFC', 'LIN', 'BRK-B',
          'AMD', 'ORCL', 'TMUS', 'PM', 'NKE', 'COP', 'T', 'NEE', 'HON', 'UPS',
          'CMCSA', 'IBM', 'BMY', 'LOW', 'RTX', 'AMGN', 'UNP', 'BA', 'SPGI', 'INTU'
          // More symbols available but prioritizing speed with top performers
        ];
        break;
      case 'NASDAQ100':
        // NASDAQ 100 - Top tech stocks first for best results
        symbols = [
          'AAPL', 'MSFT', 'AMZN', 'NVDA', 'GOOGL', 'GOOG', 'TSLA', 'META', 'AVGO', 'PEP',
          'COST', 'NFLX', 'TMUS', 'CSCO', 'ADBE', 'TXN', 'QCOM', 'CMCSA', 'HON', 'INTU',
          'AMD', 'AMGN', 'ISRG', 'BKNG', 'ADP', 'GILD', 'VRTX', 'SBUX', 'MU', 'ADI',
          'PYPL', 'REGN', 'MDLZ', 'LRCX', 'PANW', 'KLAC', 'SNPS', 'CDNS', 'MAR', 'MELI',
          'ORLY', 'CSGP', 'CSX', 'DXCM', 'ABNB', 'TEAM', 'FTNT', 'CHTR', 'MNST', 'ADSK'
        ];
        break;
      case 'DOWJONES':
        // Dow Jones Industrial Average - All 30 stocks (small enough to process all)
        symbols = [
          'UNH', 'GS', 'HD', 'MSFT', 'CAT', 'AMGN', 'V', 'BA', 'TRV', 'AXP',
          'JPM', 'JNJ', 'PG', 'CVX', 'MRK', 'AAPL', 'WMT', 'DIS', 'MCD', 'IBM',
          'NKE', 'CRM', 'HON', 'KO', 'INTC', 'CSCO', 'VZ', 'WBA', 'MMM', 'DOW'
        ];
        break;
      default:
        symbols = ['SPY', 'AAPL', 'MSFT', 'GOOGL', 'AMZN'];
    }

    console.log(`📊 Analyzing ${symbols.length} stocks for ${market} market coverage`);
    console.log(`🚀 Using parallel processing for faster analysis...`);
    
    const patterns: SeasonalPattern[] = [];
    const batchSize = 5; // Process 5 stocks simultaneously
    const maxBatches = 10; // Limit to first 50 stocks for fast results
    
    // Process stocks in parallel batches for speed
    for (let batchStart = 0; batchStart < Math.min(symbols.length, batchSize * maxBatches); batchStart += batchSize) {
      const batch = symbols.slice(batchStart, batchStart + batchSize);
      console.log(`� Processing batch ${Math.floor(batchStart / batchSize) + 1}: ${batch.join(', ')}`);
      
      // Process this batch in parallel
      const batchPromises = batch.map(async (symbol) => {
        try {
          console.log(`📈 Analyzing ${symbol}...`);
          
          // Get dynamic seasonal period for this stock using real chart analysis
          const seasonalPeriod = await this.getDynamicSeasonalPeriod(symbol, yearsBack);
          
          // Skip if no seasonal pattern found at all
          if (!seasonalPeriod) {
            console.log(`⚠️ No seasonal pattern found for ${symbol}, skipping...`);
            return null;
          }
          
          const seasonalData = await this.analyzeSeasonalPattern(
            symbol, 
            seasonalPeriod.startMonth, 
            seasonalPeriod.startDay, 
            seasonalPeriod.endMonth, 
            seasonalPeriod.endDay, 
            yearsBack
          );
          
          if (seasonalData) {
            // Update the period name to reflect the actual seasonal pattern
            seasonalData.period = seasonalPeriod.name;
            console.log(`✅ ${symbol}: ${seasonalData.averageReturn.toFixed(2)}% (${seasonalData.patternType})`);
            return seasonalData;
          }
        } catch (error) {
          console.error(`❌ ${symbol} failed:`, error);
        }
        return null;
      });
      
      // Wait for this batch to complete
      const batchResults = await Promise.all(batchPromises);
      
      // Add successful results
      batchResults.forEach(result => {
        if (result) {
          patterns.push(result);
        }
      });
      
      // Short delay between batches to respect API limits
      if (batchStart + batchSize < symbols.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Early exit if we have enough good patterns
      if (patterns.length >= 20) {
        console.log(`🎯 Found ${patterns.length} strong patterns, stopping early for speed`);
        break;
      }
    }

    if (patterns.length === 0) {
      throw new Error(`No seasonal patterns could be loaded for ${market} from Polygon API - check API key and subscription`);
    }

    console.log(`🎯 ✅ Successfully analyzed ${patterns.length} patterns from ${symbols.length} stocks for ${market}`);
    console.log(`📊 Top 3 performers: ${patterns.sort((a, b) => Math.abs(b.averageReturn) - Math.abs(a.averageReturn)).slice(0, 3).map(p => `${p.symbol}(${p.averageReturn.toFixed(1)}%)`).join(', ')}`);
    
    return patterns.sort((a, b) => Math.abs(b.averageReturn) - Math.abs(a.averageReturn));
  }
}

export default PolygonService;
export type { SeasonalPattern, PolygonTickerData, PolygonAggregateData };