interface RRGCalculationResult {
  symbol: string;
  name: string;
  rsRatio: number;
  rsMomentum: number;
  sector?: string;
  tail: Array<{ rsRatio: number; rsMomentum: number; date: string }>;
  currentPrice?: number;
  priceChange?: number;
  priceChangePercent?: number;
}

interface PriceData {
  date: string;
  close: number;
  timestamp: number;
}

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
const BASE_URL = 'https://api.polygon.io';

// Sector ETFs - exact replicas of StockCharts.com RRG
const SECTOR_ETFS = [
  { symbol: 'XLK', name: 'Technology Select Sector SPDR Fund', sector: 'Technology' },
  { symbol: 'XLF', name: 'Financial Select Sector SPDR Fund', sector: 'Financials' },
  { symbol: 'XLV', name: 'Health Care Select Sector SPDR Fund', sector: 'Health Care' },
  { symbol: 'XLE', name: 'Energy Select Sector SPDR Fund', sector: 'Energy' },
  { symbol: 'XLI', name: 'Industrial Select Sector SPDR Fund', sector: 'Industrials' },
  { symbol: 'XLY', name: 'Consumer Discretionary Select Sector SPDR Fund', sector: 'Consumer Discretionary' },
  { symbol: 'XLP', name: 'Consumer Staples Select Sector SPDR Fund', sector: 'Consumer Staples' },
  { symbol: 'XLB', name: 'Materials Select Sector SPDR Fund', sector: 'Materials' },
  { symbol: 'XLRE', name: 'Real Estate Select Sector SPDR Fund', sector: 'Real Estate' },
  { symbol: 'XLU', name: 'Utilities Select Sector SPDR Fund', sector: 'Utilities' },
  { symbol: 'XLC', name: 'Communication Services Select Sector SPDR Fund', sector: 'Communication Services' }
];

const BENCHMARK_SYMBOL = 'SPY'; // S&P 500 ETF as benchmark

class RRGService {
  private apiKey: string;
  private baseUrl: string;
  private cache: Map<string, { data: any; expiry: number }> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  constructor(apiKey: string = POLYGON_API_KEY) {
    this.apiKey = apiKey;
    this.baseUrl = BASE_URL;
  }

  private getCacheKey(symbol: string, from: string, to: string): string {
    return `${symbol}_${from}_${to}`;
  }

  private getFromCache<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }
    if (cached) {
      this.cache.delete(key);
    }
    return null;
  }

  private setCache<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      expiry: Date.now() + this.CACHE_DURATION
    });
  }

  private async makeRequest<T>(endpoint: string): Promise<T | null> {
    const url = `${this.baseUrl}${endpoint}${endpoint.includes('?') ? '&' : '?'}apikey=${this.apiKey}`;
    
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      return null;
    }
  }

  private async getHistoricalPrices(symbol: string, from: string, to: string): Promise<PriceData[]> {
    const cacheKey = this.getCacheKey(symbol, from, to);
    const cached = this.getFromCache<PriceData[]>(cacheKey);
    if (cached) return cached;

    const endpoint = `/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}`;
    const response = await this.makeRequest<any>(endpoint);

    if (!response || !response.results) {
      console.warn(`No data for ${symbol}`);
      return [];
    }

    const priceData: PriceData[] = response.results.map((result: any) => ({
      date: new Date(result.t).toISOString().split('T')[0],
      close: result.c,
      timestamp: result.t
    }));

    this.setCache(cacheKey, priceData);
    return priceData;
  }

  private calculateRelativeStrength(securityPrices: PriceData[], benchmarkPrices: PriceData[]): Array<{ date: string; rsRatio: number }> {
    const rsData: Array<{ date: string; rsRatio: number }> = [];
    
    // Align dates between security and benchmark
    const benchmarkMap = new Map(benchmarkPrices.map(p => [p.date, p.close]));
    
    for (const secPrice of securityPrices) {
      const benchPrice = benchmarkMap.get(secPrice.date);
      if (benchPrice) {
        const rsRatio = (secPrice.close / benchPrice) * 100;
        rsData.push({
          date: secPrice.date,
          rsRatio
        });
      }
    }

    return rsData;
  }

  private calculateJdKRSRatio(rsData: Array<{ date: string; rsRatio: number }>, period: number = 14): Array<{ date: string; rsRatio: number; normalizedRS: number }> {
    const result: Array<{ date: string; rsRatio: number; normalizedRS: number }> = [];
    
    for (let i = period - 1; i < rsData.length; i++) {
      const window = rsData.slice(i - period + 1, i + 1);
      const sma = window.reduce((sum, item) => sum + item.rsRatio, 0) / period;
      const normalizedRS = (rsData[i].rsRatio / sma) * 100;
      
      result.push({
        date: rsData[i].date,
        rsRatio: rsData[i].rsRatio,
        normalizedRS
      });
    }

    return result;
  }

  private calculateRSMomentum(normalizedRSData: Array<{ date: string; normalizedRS: number }>, momentumPeriod: number = 14): Array<{ date: string; normalizedRS: number; rsMomentum: number }> {
    const result: Array<{ date: string; normalizedRS: number; rsMomentum: number }> = [];
    
    for (let i = momentumPeriod; i < normalizedRSData.length; i++) {
      const currentRS = normalizedRSData[i].normalizedRS;
      const pastRS = normalizedRSData[i - momentumPeriod].normalizedRS;
      const rsMomentum = ((currentRS - pastRS) / pastRS) * 100 + 100; // Add 100 to center around 100
      
      result.push({
        date: normalizedRSData[i].date,
        normalizedRS: currentRS,
        rsMomentum
      });
    }

    return result;
  }

  private async getCurrentPrice(symbol: string): Promise<{ price: number; change: number; changePercent: number } | null> {
    const endpoint = `/v2/aggs/ticker/${symbol}/prev`;
    const response = await this.makeRequest<any>(endpoint);

    if (!response || !response.results || response.results.length === 0) {
      return null;
    }

    const result = response.results[0];
    const price = result.c;
    const change = result.c - result.o;
    const changePercent = (change / result.o) * 100;

    return { price, change, changePercent };
  }

  public async calculateSectorRRG(
    lookbackWeeks: number = 52, // 1 year of data
    rsPeriod: number = 14,
    momentumPeriod: number = 14,
    tailLength: number = 10
  ): Promise<RRGCalculationResult[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (lookbackWeeks * 7));

    const fromDate = startDate.toISOString().split('T')[0];
    const toDate = endDate.toISOString().split('T')[0];

    console.log('🔄 Fetching RRG data...');
    console.log(`📅 Date range: ${fromDate} to ${toDate}`);

    try {
      // Fetch benchmark data first
      console.log(`📊 Fetching benchmark data for ${BENCHMARK_SYMBOL}...`);
      const benchmarkPrices = await this.getHistoricalPrices(BENCHMARK_SYMBOL, fromDate, toDate);
      
      if (benchmarkPrices.length === 0) {
        throw new Error('No benchmark data available');
      }

      const results: RRGCalculationResult[] = [];

      // Process each sector ETF
      for (const etf of SECTOR_ETFS) {
        console.log(`📈 Processing ${etf.symbol} - ${etf.name}...`);
        
        try {
          // Get historical prices
          const sectorPrices = await this.getHistoricalPrices(etf.symbol, fromDate, toDate);
          
          if (sectorPrices.length === 0) {
            console.warn(`⚠️  No price data for ${etf.symbol}`);
            continue;
          }

          // Calculate relative strength
          const rsData = this.calculateRelativeStrength(sectorPrices, benchmarkPrices);
          
          if (rsData.length < rsPeriod + momentumPeriod) {
            console.warn(`⚠️  Insufficient data for ${etf.symbol}`);
            continue;
          }

          // Apply JdK RS-Ratio normalization
          const normalizedRS = this.calculateJdKRSRatio(rsData, rsPeriod);
          
          // Calculate RS-Momentum
          const rsMomentumData = this.calculateRSMomentum(normalizedRS, momentumPeriod);
          
          if (rsMomentumData.length === 0) {
            console.warn(`⚠️  No momentum data for ${etf.symbol}`);
            continue;
          }

          // Get current position (latest data point)
          const latest = rsMomentumData[rsMomentumData.length - 1];
          
          // Create tail (last N points for visualization)
          const tail = rsMomentumData
            .slice(-tailLength - 1, -1) // Exclude the current point
            .map(point => ({
              rsRatio: point.normalizedRS,
              rsMomentum: point.rsMomentum,
              date: point.date
            }));

          // Get current price data
          const currentPriceData = await this.getCurrentPrice(etf.symbol);

          results.push({
            symbol: etf.symbol,
            name: etf.name,
            rsRatio: latest.normalizedRS,
            rsMomentum: latest.rsMomentum,
            sector: etf.sector,
            tail,
            currentPrice: currentPriceData?.price,
            priceChange: currentPriceData?.change,
            priceChangePercent: currentPriceData?.changePercent
          });

          console.log(`✅ ${etf.symbol}: RS-Ratio=${latest.normalizedRS.toFixed(2)}, RS-Momentum=${latest.rsMomentum.toFixed(2)}`);

          // Add small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error) {
          console.error(`❌ Error processing ${etf.symbol}:`, error);
          continue;
        }
      }

      console.log(`🎯 RRG calculation complete. ${results.length}/${SECTOR_ETFS.length} sectors processed.`);
      return results;

    } catch (error) {
      console.error('❌ RRG calculation failed:', error);
      throw error;
    }
  }

  public async calculateCustomRRG(
    symbols: string[],
    benchmark: string = 'SPY',
    lookbackWeeks: number = 52,
    rsPeriod: number = 14,
    momentumPeriod: number = 14,
    tailLength: number = 10
  ): Promise<RRGCalculationResult[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (lookbackWeeks * 7));

    const fromDate = startDate.toISOString().split('T')[0];
    const toDate = endDate.toISOString().split('T')[0];

    // Fetch benchmark data
    const benchmarkPrices = await this.getHistoricalPrices(benchmark, fromDate, toDate);
    
    if (benchmarkPrices.length === 0) {
      throw new Error(`No benchmark data available for ${benchmark}`);
    }

    const results: RRGCalculationResult[] = [];

    for (const symbol of symbols) {
      try {
        const symbolPrices = await this.getHistoricalPrices(symbol, fromDate, toDate);
        
        if (symbolPrices.length === 0) continue;

        const rsData = this.calculateRelativeStrength(symbolPrices, benchmarkPrices);
        const normalizedRS = this.calculateJdKRSRatio(rsData, rsPeriod);
        const rsMomentumData = this.calculateRSMomentum(normalizedRS, momentumPeriod);
        
        if (rsMomentumData.length === 0) continue;

        const latest = rsMomentumData[rsMomentumData.length - 1];
        const tail = rsMomentumData
          .slice(-tailLength - 1, -1)
          .map(point => ({
            rsRatio: point.normalizedRS,
            rsMomentum: point.rsMomentum,
            date: point.date
          }));

        const currentPriceData = await this.getCurrentPrice(symbol);

        results.push({
          symbol,
          name: symbol, // Would need to fetch company name separately
          rsRatio: latest.normalizedRS,
          rsMomentum: latest.rsMomentum,
          tail,
          currentPrice: currentPriceData?.price,
          priceChange: currentPriceData?.change,
          priceChangePercent: currentPriceData?.changePercent
        });

        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`Error processing ${symbol}:`, error);
        continue;
      }
    }

    return results;
  }
}

export default RRGService;
export type { RRGCalculationResult };
