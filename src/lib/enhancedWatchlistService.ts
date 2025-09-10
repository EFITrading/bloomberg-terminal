import { WatchlistItem, PerformanceCategory, AISignal } from '../types/watchlist';

interface BulkWatchlistData {
  symbol: string;
  name: string;
  type: string;
  currentPrice: number;
  dailyChange: number;
  dailyChangePercent: number;
  volume: number;
  historicalPrices: { timestamp: number; close: number; volume: number }[];
  timestamp: number;
}

export class EnhancedWatchlistService {
  private static instance: EnhancedWatchlistService;
  private spyCache: Map<string, number[]> = new Map();
  private bulkDataCache: BulkWatchlistData[] = [];
  private cacheTimestamp: number = 0;
  private readonly CACHE_DURATION = 60000; // 1 minute
  
  static getInstance(): EnhancedWatchlistService {
    if (!this.instance) {
      this.instance = new EnhancedWatchlistService();
    }
    return this.instance;
  }

  /**
   * Fetch bulk watchlist data
   */
  async fetchBulkWatchlistData(): Promise<BulkWatchlistData[]> {
    const now = Date.now();
    
    // Return cached data if still fresh
    if (this.bulkDataCache.length > 0 && (now - this.cacheTimestamp) < this.CACHE_DURATION) {
      console.log('📦 Using cached bulk watchlist data');
      return this.bulkDataCache;
    }

    try {
      console.log('🔄 Fetching fresh bulk watchlist data...');
      const response = await fetch('/api/watchlist-bulk');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (result.success && result.data) {
        this.bulkDataCache = result.data;
        this.cacheTimestamp = now;
        console.log(`✅ Bulk data cached: ${result.data.length} symbols`);
        return result.data;
      } else {
        throw new Error(result.error || 'Failed to fetch bulk data');
      }
    } catch (error) {
      console.error('❌ Error fetching bulk data:', error);
      return [];
    }
  }

  /**
   * Get historical prices from bulk data
   */
  getHistoricalPricesFromBulk(symbol: string, days: number): number[] {
    const symbolData = this.bulkDataCache.find(data => data.symbol === symbol);
    if (!symbolData || !symbolData.historicalPrices) return [];
    
    return symbolData.historicalPrices
      .slice(-days)
      .map(item => item.close);
  }

  /**
   * Get SPY prices for benchmark comparison (from bulk data)
   */
  getSPYPricesFromBulk(days: number): number[] {
    return this.getHistoricalPricesFromBulk('SPY', days);
  }

  /**
   * Fetch historical prices for multiple timeframes (legacy fallback)
   */
  async fetchHistoricalPrices(symbol: string, days: number): Promise<number[]> {
    // First try to get from bulk data
    const bulkPrices = this.getHistoricalPricesFromBulk(symbol, days);
    if (bulkPrices.length > 0) {
      return bulkPrices;
    }

    // Fallback to individual API call
    try {
      const response = await fetch(`/api/stock-data?symbol=${symbol}&timeframe=1D&range=${days}D`);
      
      if (!response.ok) return [];
      
      const data = await response.json();
      
      if (data.success && data.data && Array.isArray(data.data)) {
        return data.data.map((item: any) => item.close).slice(-days);
      }
      
      return [];
    } catch (error) {
      console.error(`Error fetching historical data for ${symbol}:`, error);
      return [];
    }
  }

  /**
   * Get SPY prices for benchmark comparison (cached)
   */
  async getSPYPrices(days: number): Promise<number[]> {
    const cacheKey = `spy_${days}`;
    
    if (this.spyCache.has(cacheKey)) {
      return this.spyCache.get(cacheKey)!;
    }
    
    const spyPrices = await this.fetchHistoricalPrices('SPY', days);
    this.spyCache.set(cacheKey, spyPrices);
    
    // Clear cache after 5 minutes
    setTimeout(() => {
      this.spyCache.delete(cacheKey);
    }, 5 * 60 * 1000);
    
    return spyPrices;
  }

  /**
   * Calculate percentage return over period
   */
  calculateReturn(prices: number[]): number {
    if (prices.length < 2) return 0;
    const firstPrice = prices[0];
    const lastPrice = prices[prices.length - 1];
    return ((lastPrice - firstPrice) / firstPrice) * 100;
  }

  /**
   * Calculate outperformance vs SPY
   */
  calculateOutperformance(stockPrices: number[], spyPrices: number[]): number {
    const stockReturn = this.calculateReturn(stockPrices);
    const spyReturn = this.calculateReturn(spyPrices);
    return stockReturn - spyReturn;
  }

  /**
   * Determine performance category based on SPY benchmarking (improved with bulk data)
   */
  async calculatePerformanceCategory(symbol: string): Promise<PerformanceCategory> {
    // SPY is always NEUTRAL
    if (symbol === 'SPY') {
      return 'NEUTRAL';
    }

    try {
      // Ensure we have bulk data
      await this.fetchBulkWatchlistData();
      
      // Get historical prices for different timeframes from bulk data
      const stock1D = this.getHistoricalPricesFromBulk(symbol, 2); // Need 2 days for 1D calc
      const stock5D = this.getHistoricalPricesFromBulk(symbol, 6); // Need 6 days for 5D calc
      const stock13D = this.getHistoricalPricesFromBulk(symbol, 14); // Need 14 days for 13D calc
      const stock21D = this.getHistoricalPricesFromBulk(symbol, 22); // Need 22 days for 21D calc
      
      const spy1D = this.getSPYPricesFromBulk(2);
      const spy5D = this.getSPYPricesFromBulk(6);
      const spy13D = this.getSPYPricesFromBulk(14);
      const spy21D = this.getSPYPricesFromBulk(22);

      // Check if we have sufficient data
      if (stock1D.length < 2 || spy1D.length < 2) {
        console.warn(`⚠️ Insufficient 1D data for ${symbol}`);
        return 'NEUTRAL';
      }

      // Calculate outperformance for each timeframe
      const outperformance1D = this.calculateOutperformance(stock1D, spy1D);
      const outperformance5D = stock5D.length >= 2 && spy5D.length >= 2 ? 
        this.calculateOutperformance(stock5D, spy5D) : 0;
      const outperformance13D = stock13D.length >= 2 && spy13D.length >= 2 ? 
        this.calculateOutperformance(stock13D, spy13D) : 0;
      const outperformance21D = stock21D.length >= 2 && spy21D.length >= 2 ? 
        this.calculateOutperformance(stock21D, spy21D) : 0;

      console.log(`📊 ${symbol} Outperformance vs SPY:`, {
        '1D': `${outperformance1D.toFixed(2)}%`,
        '5D': stock5D.length >= 2 ? `${outperformance5D.toFixed(2)}%` : 'N/A',
        '13D': stock13D.length >= 2 ? `${outperformance13D.toFixed(2)}%` : 'N/A',
        '21D': stock21D.length >= 2 ? `${outperformance21D.toFixed(2)}%` : 'N/A'
      });

      // Apply hierarchy: longer timeframes take precedence for positive performance
      if (stock21D.length >= 2 && outperformance21D > 0.5) return 'KING';
      if (stock13D.length >= 2 && outperformance13D > 0.3) return 'LEADING';
      if (stock5D.length >= 2 && outperformance5D > 0.2) return 'STRONG';
      if (outperformance1D > 0.1) return 'IMPROVING';

      // For underperformance, also use hierarchy
      if (stock21D.length >= 2 && outperformance21D < -0.5) return 'FALLEN';
      if (stock13D.length >= 2 && outperformance13D < -0.3) return 'BLEEDING';
      if (stock5D.length >= 2 && outperformance5D < -0.2) return 'WEAK';
      if (outperformance1D < -0.1) return 'LAGGING';

      return 'NEUTRAL';
    } catch (error) {
      console.error(`Error calculating performance for ${symbol}:`, error);
      return 'NEUTRAL';
    }
  }

  /**
   * Calculate relative strength score for AI signal
   */
  calculateRelativeStrength(stockPrices: number[], spyPrices: number[]): number {
    if (stockPrices.length < 2 || spyPrices.length < 2) return 0;
    
    const stockReturn = this.calculateReturn(stockPrices);
    const spyReturn = this.calculateReturn(spyPrices);
    
    return stockReturn - spyReturn;
  }

  /**
   * Calculate momentum (rate of change of relative strength)
   */
  calculateMomentum(stockPrices: number[], spyPrices: number[]): number {
    if (stockPrices.length < 10) return 0;
    
    // Compare recent 5 days vs previous 5 days
    const recentStock = stockPrices.slice(-5);
    const previousStock = stockPrices.slice(-10, -5);
    const recentSpy = spyPrices.slice(-5);
    const previousSpy = spyPrices.slice(-10, -5);
    
    const recentRS = this.calculateRelativeStrength(recentStock, recentSpy);
    const previousRS = this.calculateRelativeStrength(previousStock, previousSpy);
    
    return recentRS - previousRS;
  }

  /**
   * Calculate seasonality factor based on historical patterns
   */
  getSeasonalityFactor(symbol: string): number {
    const now = new Date();
    const month = now.getMonth() + 1; // 1-12
    
    // Enhanced seasonality patterns based on historical data
    const seasonalityMap: Record<string, Record<number, number>> = {
      // Technology - strong in Q4, weak in summer
      'QQQ': { 1: 0.5, 2: 0.2, 3: 0.3, 4: 0.4, 5: -0.2, 6: -0.3, 7: -0.1, 8: -0.2, 9: 0.1, 10: 0.4, 11: 0.6, 12: 0.5 },
      'XLK': { 1: 0.5, 2: 0.2, 3: 0.3, 4: 0.4, 5: -0.2, 6: -0.3, 7: -0.1, 8: -0.2, 9: 0.1, 10: 0.4, 11: 0.6, 12: 0.5 },
      
      // Financial - strong when rates rising
      'XLF': { 1: 0.3, 2: 0.1, 3: 0.2, 4: 0.1, 5: 0.0, 6: -0.1, 7: 0.1, 8: 0.0, 9: -0.1, 10: 0.2, 11: 0.3, 12: 0.2 },
      
      // Energy - seasonal demand patterns
      'XLE': { 1: 0.1, 2: 0.0, 3: 0.2, 4: 0.3, 5: 0.4, 6: 0.3, 7: 0.2, 8: 0.1, 9: 0.0, 10: -0.1, 11: 0.1, 12: 0.2 },
      
      // Consumer Discretionary - strong in Q4 (holiday shopping)
      'XLY': { 1: -0.1, 2: 0.0, 3: 0.1, 4: 0.1, 5: 0.0, 6: -0.1, 7: 0.0, 8: 0.1, 9: 0.2, 10: 0.4, 11: 0.6, 12: 0.3 },
      
      // Utilities - defensive, strong when volatility high
      'XLU': { 1: 0.2, 2: 0.1, 3: 0.0, 4: -0.1, 5: 0.1, 6: 0.2, 7: 0.3, 8: 0.2, 9: 0.1, 10: 0.0, 11: 0.1, 12: 0.2 },
      
      // Gold - safe haven, strong in uncertain times
      'GLD': { 1: 0.3, 2: 0.2, 3: 0.1, 4: 0.0, 5: -0.1, 6: -0.2, 7: 0.0, 8: 0.2, 9: 0.3, 10: 0.1, 11: 0.0, 12: 0.2 }
    };
    
    return seasonalityMap[symbol]?.[month] || 0;
  }

  /**
   * Generate intelligent AI signal based on multiple factors
   */
  async generateAISignal(
    symbol: string,
    performance: PerformanceCategory,
    currentChangePercent: number
  ): Promise<AISignal> {
    try {
      // Ensure we have bulk data
      await this.fetchBulkWatchlistData();
      
      // Get price data for technical analysis from bulk data
      const stock21D = this.getHistoricalPricesFromBulk(symbol, 21);
      const spy21D = this.getSPYPricesFromBulk(21);

      let score = 0;
      
      // 1. Performance Category Weight (40%)
      const performanceScores: Record<PerformanceCategory, number> = {
        'KING': 8,
        'LEADING': 6,
        'STRONG': 4,
        'IMPROVING': 2,
        'NEUTRAL': 0,
        'LAGGING': -2,
        'WEAK': -4,
        'BLEEDING': -6,
        'FALLEN': -8
      };
      score += performanceScores[performance];

      // 2. Relative Strength vs SPY (25%)
      if (stock21D.length > 0 && spy21D.length > 0) {
        const relativeStrength = this.calculateRelativeStrength(stock21D, spy21D);
        if (relativeStrength > 10) score += 5;
        else if (relativeStrength > 5) score += 3;
        else if (relativeStrength > 0) score += 1;
        else if (relativeStrength > -5) score -= 1;
        else if (relativeStrength > -10) score -= 3;
        else score -= 5;
      }

      // 3. Momentum (20%)
      if (stock21D.length > 10 && spy21D.length > 10) {
        const momentum = this.calculateMomentum(stock21D, spy21D);
        if (momentum > 5) score += 4;
        else if (momentum > 2) score += 2;
        else if (momentum > -2) score += 0;
        else if (momentum > -5) score -= 2;
        else score -= 4;
      }

      // 4. Seasonality Factor (10%)
      const seasonality = this.getSeasonalityFactor(symbol);
      score += seasonality * 2; // Scale to fit scoring system

      // 5. Current Momentum (5%)
      if (currentChangePercent > 2) score += 1;
      else if (currentChangePercent < -2) score -= 1;

      console.log(`🤖 AI Signal for ${symbol}: Score=${score}, Performance=${performance}`);

      // Convert score to signal
      if (score > 6) return 'STRONG_BUY';
      if (score > 2) return 'BUY';
      if (score > -2) return 'NEUTRAL';
      if (score > -6) return 'SELL';
      return 'STRONG_SELL';

    } catch (error) {
      console.error(`Error generating AI signal for ${symbol}:`, error);
      return 'NEUTRAL';
    }
  }

  /**
   * Get performance category colors
   */
  getPerformanceColor(category: PerformanceCategory): string {
    const colorMap: Record<PerformanceCategory, string> = {
      'KING': '#00ff00', // Glowing green
      'LEADING': '#32ff32', // Bright green
      'STRONG': '#7fff00', // Lime green
      'IMPROVING': '#4169e1', // Blue
      'NEUTRAL': '#808080', // Gray
      'LAGGING': '#ffff00', // Yellow
      'WEAK': '#ff8c00', // Orange
      'BLEEDING': '#ff0000', // Bright red
      'FALLEN': '#8b0000' // Glowing red (dark red)
    };
    return colorMap[category];
  }

  /**
   * Get AI signal colors
   */
  getSignalColor(signal: AISignal): string {
    const colorMap: Record<AISignal, string> = {
      'STRONG_BUY': '#00ff00',
      'BUY': '#32cd32',
      'NEUTRAL': '#808080',
      'SELL': '#ff6347',
      'STRONG_SELL': '#ff0000'
    };
    return colorMap[signal];
  }
}
