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
  annualizedReturn: number;
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
    const url = `${BASE_URL}${endpoint}&apikey=${this.apiKey}`;
    
    console.log(`Making Polygon API request: ${endpoint}`);
    
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
      const data = await this.makeRequest<{results: PolygonTickerData}>(`/v3/reference/tickers/${symbol}?`);
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
        `/v2/aggs/ticker/${symbol}/range/1/${timespan}/${startDate}/${endDate}?adjusted=true&sort=asc&`
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
      const annualizedReturn = (stats.mean * (365 / this.calculateDaysBetween(startMonth, startDay, endMonth, endDay)));
      
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
        annualizedReturn,
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
    console.log('Loading featured patterns from Polygon API...');
    
    const patterns = [
      { symbol: 'URI', startMonth: 8, startDay: 12, endMonth: 9, endDay: 18 },
      { symbol: 'NVDA', startMonth: 8, startDay: 12, endMonth: 9, endDay: 19 },
      { symbol: 'AAPL', startMonth: 8, startDay: 12, endMonth: 9, endDay: 15 }
    ];

    const results: SeasonalPattern[] = [];
    
    for (const pattern of patterns) {
      try {
        console.log(`Analyzing seasonal pattern for ${pattern.symbol}...`);
        const seasonalData = await this.analyzeSeasonalPattern(
          pattern.symbol,
          pattern.startMonth,
          pattern.startDay,
          pattern.endMonth,
          pattern.endDay,
          15
        );
        
        if (seasonalData) {
          results.push(seasonalData);
          console.log(`Successfully loaded pattern for ${pattern.symbol}`);
        } else {
          console.warn(`No data available for ${pattern.symbol}`);
        }
      } catch (error) {
        console.error(`Failed to load pattern for ${pattern.symbol}:`, error);
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

  async getMarketPatterns(market: string = 'SP500'): Promise<SeasonalPattern[]> {
    console.log(`Loading market patterns for ${market} from Polygon API...`);
    
    let symbols: string[] = [];
    
    switch (market) {
      case 'SP500':
        symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA'];
        break;
      case 'NASDAQ100':
        symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA'];
        break;
      case 'DOWJONES':
        symbols = ['AAPL', 'MSFT', 'UNH', 'GS', 'HD'];
        break;
      default:
        symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA'];
    }

    const patterns: SeasonalPattern[] = [];

    for (const symbol of symbols) {
      try {
        console.log(`Analyzing seasonal pattern for ${symbol} in ${market}...`);
        const seasonalData = await this.analyzeSeasonalPattern(symbol, 8, 12, 9, 18, 10);
        if (seasonalData) {
          patterns.push(seasonalData);
          console.log(`Successfully loaded pattern for ${symbol}`);
        } else {
          console.warn(`No seasonal data available for ${symbol}`);
        }
      } catch (error) {
        console.error(`Failed to analyze ${symbol}:`, error);
        // Continue with other symbols instead of failing completely
      }
      
      // Rate limiting - wait between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (patterns.length === 0) {
      throw new Error(`No seasonal patterns could be loaded for ${market} from Polygon API`);
    }

    console.log(`Successfully loaded ${patterns.length} patterns for ${market}`);
    return patterns.sort((a, b) => b.annualizedReturn - a.annualizedReturn);
  }
}

export default PolygonService;
export type { SeasonalPattern, PolygonTickerData, PolygonAggregateData };