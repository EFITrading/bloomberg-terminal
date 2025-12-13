/**
 * IV-based Relative Rotation Graph (RRG) Service
 * 
 * This service calculates RRG metrics using Implied Volatility (IV) instead of Relative Strength (RS).
 * It follows the same JdK RS-Ratio and RS-Momentum methodology but applied to IV data.
 * 
 * Formula:
 * - IV Ratio = (Security IV / Benchmark IV) * 100
 * - IV-Ratio Normalized = (Current IV Ratio / SMA(IV Ratio, period)) * 100
 * - IV-Momentum = ((Current Normalized IV - Past Normalized IV) / Past Normalized IV) * 100 + 100
 * 
 * SpotGamma Reference: IV percentile and IV rank calculations for historical context
 */

interface IVRRGCalculationResult {
  symbol: string;
  name: string;
  ivRatio: number; // Normalized IV ratio (like RS-Ratio)
  ivMomentum: number; // Rate of change of IV ratio (like RS-Momentum)
  sector?: string;
  tail: Array<{ ivRatio: number; ivMomentum: number; date: string }>;
  currentIV?: number;
  ivRank?: number;
  ivPercentile?: number;
}

interface IVData {
  date: string;
  callIV: number;
  putIV: number;
  avgIV: number; // Average of call and put IV
  timestamp: number;
}

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

class IVRRGService {
  private apiKey: string;
  private cache: Map<string, { data: any; expiry: number }> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  constructor(apiKey: string = POLYGON_API_KEY) {
    this.apiKey = apiKey;
  }

  /**
   * Fetch historical IV data for a symbol using the same API as your charts
   * This calls the /api/calculate-historical-iv endpoint
   */
  private async getHistoricalIV(symbol: string, days: number): Promise<IVData[]> {
    try {
      console.log(`📊 Fetching ${days} days of historical IV for ${symbol}`);
      
      const response = await fetch(`/api/calculate-historical-iv?ticker=${symbol}&days=${days}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // Check if API call was successful
      if (!data.success || !data.data || !data.data.history || data.data.history.length === 0) {
        console.warn(`⚠️ No IV data for ${symbol} - API returned:`, data);
        return [];
      }

      // Transform API response to our format
      const ivData: IVData[] = data.data.history.map((point: any) => {
        // IV values from API are in percentage format (e.g., 45.2 means 45.2%)
        // We need them as decimals for ratio calculations (e.g., 0.452)
        const callIV = (point.callIV || 0) / 100;
        const putIV = (point.putIV || 0) / 100;
        const netIV = point.netIV ? point.netIV / 100 : (callIV + putIV) / 2;
        
        return {
          date: point.date,
          callIV: callIV,
          putIV: putIV,
          avgIV: netIV,
          timestamp: new Date(point.date).getTime()
        };
      });

      console.log(`✅ Fetched ${ivData.length} IV data points for ${symbol}. Sample avgIV:`, ivData[ivData.length - 1]?.avgIV.toFixed(4));
      return ivData;
    } catch (error) {
      console.error(`❌ Error fetching IV for ${symbol}:`, error);
      return [];
    }
  }

  /**
   * Calculate IV Ratio (analogous to Relative Strength)
   * Formula: (Security IV / Benchmark IV) * 100
   */
  private calculateIVRatio(
    securityIVData: IVData[],
    benchmarkIVData: IVData[]
  ): Array<{ date: string; ivRatio: number }> {
    const ivRatioData: Array<{ date: string; ivRatio: number }> = [];
    
    // Align dates between security and benchmark
    const benchmarkMap = new Map(benchmarkIVData.map(p => [p.date, p.avgIV]));
    
    for (const secIV of securityIVData) {
      const benchIV = benchmarkMap.get(secIV.date);
      if (benchIV && benchIV > 0 && secIV.avgIV > 0) {
        const ivRatio = secIV.avgIV / benchIV; // Raw ratio, not percentage
        ivRatioData.push({
          date: secIV.date,
          ivRatio
        });
      }
    }

    return ivRatioData;
  }

  /**
   * Calculate JdK-style IV-Ratio normalization
   * Formula: (Current IV Ratio / SMA(IV Ratio, period)) * 100
   */
  private calculateNormalizedIVRatio(
    ivRatioData: Array<{ date: string; ivRatio: number }>,
    period: number = 14
  ): Array<{ date: string; ivRatio: number; normalizedIV: number }> {
    const result: Array<{ date: string; ivRatio: number; normalizedIV: number }> = [];
    
    for (let i = period - 1; i < ivRatioData.length; i++) {
      const window = ivRatioData.slice(i - period + 1, i + 1);
      const sma = window.reduce((sum, item) => sum + item.ivRatio, 0) / period;
      
      if (sma > 0) {
        const normalizedIV = (ivRatioData[i].ivRatio / sma) * 100;
        
        result.push({
          date: ivRatioData[i].date,
          ivRatio: ivRatioData[i].ivRatio,
          normalizedIV
        });
      }
    }

    return result;
  }

  /**
   * Calculate IV-Momentum (rate of change of normalized IV)
   * Formula: ((Current Normalized IV - Past Normalized IV) / Past Normalized IV) * 100 + 100
   */
  private calculateIVMomentum(
    normalizedIVData: Array<{ date: string; normalizedIV: number }>,
    momentumPeriod: number = 14
  ): Array<{ date: string; normalizedIV: number; ivMomentum: number }> {
    const result: Array<{ date: string; normalizedIV: number; ivMomentum: number }> = [];
    
    for (let i = momentumPeriod; i < normalizedIVData.length; i++) {
      const currentIV = normalizedIVData[i].normalizedIV;
      const pastIV = normalizedIVData[i - momentumPeriod].normalizedIV;
      
      if (pastIV > 0) {
        const ivMomentum = ((currentIV - pastIV) / pastIV) * 100 + 100; // Center around 100
        
        result.push({
          date: normalizedIVData[i].date,
          normalizedIV: currentIV,
          ivMomentum
        });
      }
    }

    return result;
  }

  /**
   * Calculate IV Rank and IV Percentile (SpotGamma methodology)
   * IV Rank = (Current IV - Min IV) / (Max IV - Min IV) * 100
   * IV Percentile = Percentage of days where IV was below current IV
   */
  private calculateIVMetrics(ivData: IVData[]): { ivRank: number; ivPercentile: number } {
    if (ivData.length === 0) {
      return { ivRank: 0, ivPercentile: 0 };
    }

    const ivValues = ivData.map(d => d.avgIV);
    const currentIV = ivValues[ivValues.length - 1];
    const minIV = Math.min(...ivValues);
    const maxIV = Math.max(...ivValues);

    // IV Rank
    const ivRank = maxIV > minIV ? ((currentIV - minIV) / (maxIV - minIV)) * 100 : 50;

    // IV Percentile
    const belowCurrent = ivValues.filter(iv => iv < currentIV).length;
    const ivPercentile = (belowCurrent / ivValues.length) * 100;

    return { ivRank, ivPercentile };
  }

  /**
   * Calculate IV-based RRG for a list of symbols
   * This is the main method that replaces calculateSectorRRG but uses IV instead of price
   */
  public async calculateIVBasedRRG(
    symbols: string[],
    benchmark: string,
    lookbackDays: number = 365, // 1 year of IV data
    ivRatioPeriod: number = 14,
    momentumPeriod: number = 14,
    tailLength: number = 10
  ): Promise<IVRRGCalculationResult[]> {
    console.log('📊 Starting IV-based RRG calculation');
    console.log(`  Symbols: ${symbols.join(', ')}`);
    console.log(`  Benchmark: ${benchmark}`);
    console.log(`  Lookback: ${lookbackDays} days`);

    try {
      // Fetch benchmark IV data first
      console.log(`📊 Fetching benchmark IV for ${benchmark}...`);
      const benchmarkIVData = await this.getHistoricalIV(benchmark, lookbackDays);
      
      if (benchmarkIVData.length === 0) {
        console.error(`❌ No IV data available for benchmark ${benchmark}`);
        console.error(`   This could be due to:`);
        console.error(`   1. POLYGON_API_KEY not set in environment variables`);
        console.error(`   2. ${benchmark} options data not available through Polygon API`);
        console.error(`   3. Insufficient historical data available`);
        throw new Error(
          `Unable to fetch IV data for benchmark ${benchmark}. ` +
          `Please check: (1) POLYGON_API_KEY is configured, ` +
          `(2) ${benchmark} has options data available, ` +
          `(3) API has sufficient historical data access.`
        );
      }

      console.log(`✅ Benchmark has ${benchmarkIVData.length} IV data points`);

      const results: IVRRGCalculationResult[] = [];

      // Process each symbol
      for (const symbol of symbols) {
        console.log(`📊 Processing ${symbol}...`);
        
        try {
          // Get historical IV
          const symbolIVData = await this.getHistoricalIV(symbol, lookbackDays);
          
          if (symbolIVData.length === 0) {
            console.warn(`⚠️ No IV data for ${symbol}`);
            continue;
          }

          // Calculate IV ratio (like Relative Strength)
          const ivRatioData = this.calculateIVRatio(symbolIVData, benchmarkIVData);
          
          if (ivRatioData.length < ivRatioPeriod + momentumPeriod) {
            console.warn(`⚠️ Insufficient data for ${symbol}`);
            continue;
          }

          // Apply JdK normalization
          const normalizedIV = this.calculateNormalizedIVRatio(ivRatioData, ivRatioPeriod);
          
          // Calculate IV-Momentum
          const ivMomentumData = this.calculateIVMomentum(normalizedIV, momentumPeriod);
          
          if (ivMomentumData.length === 0) {
            console.warn(`⚠️ No momentum data for ${symbol}`);
            continue;
          }

          // Get current position (latest data point)
          const latest = ivMomentumData[ivMomentumData.length - 1];
          
          console.log(`📊 ${symbol}: ivMomentumData has ${ivMomentumData.length} points, requesting ${tailLength} tail points`);
          
          // Create tail (last N points for visualization)
          // Use Math.min to ensure we don't request more tail points than available
          const availableTailPoints = Math.max(0, ivMomentumData.length - 1);
          const actualTailLength = Math.min(tailLength, availableTailPoints);
          
          const tail = ivMomentumData
            .slice(-actualTailLength - 1, -1) // Exclude the current point
            .map(point => ({
              ivRatio: point.normalizedIV,
              ivMomentum: point.ivMomentum,
              date: point.date
            }));
          
          console.log(`📊 ${symbol}: Created tail with ${tail.length} points (requested: ${actualTailLength})`);

          // Calculate IV metrics (rank and percentile)
          const ivMetrics = this.calculateIVMetrics(symbolIVData);

          results.push({
            symbol: symbol,
            name: symbol, // Could be enhanced with company name lookup
            ivRatio: latest.normalizedIV,
            ivMomentum: latest.ivMomentum,
            tail,
            currentIV: (symbolIVData[symbolIVData.length - 1]?.avgIV || 0) * 100, // Convert back to percentage for display
            ivRank: ivMetrics.ivRank,
            ivPercentile: ivMetrics.ivPercentile
          });

          console.log(`✅ ${symbol}: IV-Ratio=${latest.normalizedIV.toFixed(2)}, IV-Momentum=${latest.ivMomentum.toFixed(2)}`);

        } catch (error) {
          console.error(`❌ Error processing ${symbol}:`, error);
        }
      }

      console.log(`✅ IV-based RRG calculation complete: ${results.length} symbols processed`);
      return results;

    } catch (error) {
      console.error('❌ IV-based RRG calculation failed:', error);
      return [];
    }
  }

  /**
   * Calculate IV-based RRG for sector ETFs
   */
  public async calculateSectorIVRRG(
    lookbackDays: number = 365,
    ivRatioPeriod: number = 14,
    momentumPeriod: number = 14,
    tailLength: number = 10
  ): Promise<IVRRGCalculationResult[]> {
    // Default symbols
    const symbols = ['AAPL', 'TSLA'];
    return this.calculateIVBasedRRG(
      symbols,
      'SPY',
      lookbackDays,
      ivRatioPeriod,
      momentumPeriod,
      tailLength
    );
  }
}

export default IVRRGService;
export type { IVRRGCalculationResult, IVData };
