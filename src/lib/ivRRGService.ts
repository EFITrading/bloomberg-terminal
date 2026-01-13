/**
 * IV-based Relative Rotation Graph (RRG) Service
 * 
 * This service calculates RRG metrics using Implied Volatility (IV) instead of stock prices.
 * It uses the SAME JdK RS-Ratio and RS-Momentum methodology as the regular RRG, but applies it to IV data.
 * 
 * Formula (identical to regular RRG, but with IV data):
 * 1. IV Ratio = Security IV / Benchmark IV (raw ratio)
 * 2. IV Trend = EMA(IV Ratio, ivPeriod) 
 * 3. IV-Ratio (normalized) = 100 + (IV Trend - SMA(IV Trend, longPeriod)) / StdDev(IV Trend, longPeriod)
 * 4. IV-Momentum = 100 + (IV-Ratio - SMA(IV-Ratio, momentumPeriod)) / StdDev(IV-Ratio, momentumPeriod)
 * 
 * This ensures consistent behavior between regular RRG (price-based) and IV RRG (volatility-based)
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
   * Calculate EMA (Exponential Moving Average)
   */
  private calculateEMA(values: number[], period: number): number[] {
    const ema: number[] = [];
    const k = 2 / (period + 1); // EMA smoothing factor

    // First EMA value is SMA of first 'period' values
    let sum = 0;
    for (let i = 0; i < period && i < values.length; i++) {
      sum += values[i];
    }
    ema[period - 1] = sum / period;

    // Calculate EMA for remaining values
    for (let i = period; i < values.length; i++) {
      ema[i] = values[i] * k + ema[i - 1] * (1 - k);
    }

    return ema;
  }

  /**
   * Calculate SMA (Simple Moving Average)
   */
  private calculateSMA(values: number[], period: number): number[] {
    const sma: number[] = [];
    for (let i = period - 1; i < values.length; i++) {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += values[i - j];
      }
      sma[i] = sum / period;
    }
    return sma;
  }

  /**
   * Calculate Standard Deviation
   */
  private calculateStdDev(values: number[], period: number): number[] {
    const stdDev: number[] = [];
    for (let i = period - 1; i < values.length; i++) {
      let sum = 0;
      let sumSq = 0;
      for (let j = 0; j < period; j++) {
        const val = values[i - j];
        sum += val;
        sumSq += val * val;
      }
      const mean = sum / period;
      const variance = (sumSq / period) - (mean * mean);
      stdDev[i] = Math.sqrt(Math.max(0, variance));
    }
    return stdDev;
  }

  /**
   * Calculate JdK-style IV-Ratio normalization using proper JdK RS-Ratio formula
   * Formula: 100 + (EMA(IV_Ratio) - SMA(EMA(IV_Ratio))) / StdDev(EMA(IV_Ratio))
   * This matches the exact same calculation as the regular RRG but uses IV data
   */
  private calculateNormalizedIVRatio(
    ivRatioData: Array<{ date: string; ivRatio: number }>,
    ivPeriod: number = 14,
    longPeriod: number = 26
  ): Array<{ date: string; ivRatio: number; normalizedIV: number }> {
    const result: Array<{ date: string; ivRatio: number; normalizedIV: number }> = [];

    // Step 1: Calculate EMA of IV Ratio (IV_trend) with period n
    const ivValues = ivRatioData.map(d => d.ivRatio);
    const ivTrend = this.calculateEMA(ivValues, ivPeriod);

    // Step 2: Get valid IV_trend values
    const ivTrendValues: number[] = [];
    const ivTrendStartIndex = ivPeriod - 1;
    for (let i = ivTrendStartIndex; i < ivTrend.length; i++) {
      if (ivTrend[i] !== undefined) {
        ivTrendValues.push(ivTrend[i]);
      }
    }

    // Step 3: Calculate SMA and StdDev of IV_trend with period L (longPeriod)
    const ivTrendSMA = this.calculateSMA(ivTrendValues, longPeriod);
    const ivTrendStdDev = this.calculateStdDev(ivTrendValues, longPeriod);

    // Step 4: Calculate IV-Ratio = 100 + (IV_trend - SMA) / StdDev (z-score normalization)
    const finalStartIndex = ivTrendStartIndex + longPeriod - 1;
    for (let i = finalStartIndex; i < ivRatioData.length; i++) {
      const trendIndex = i - ivTrendStartIndex;
      if (ivTrend[i] !== undefined && ivTrendSMA[trendIndex] !== undefined && ivTrendStdDev[trendIndex] !== undefined) {
        const stdDev = ivTrendStdDev[trendIndex];
        const zScore = stdDev > 0 ? (ivTrend[i] - ivTrendSMA[trendIndex]) / stdDev : 0;
        const normalizedIV = 100 + zScore;
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
   * Calculate IV-Momentum using proper JdK RS-Momentum formula
   * Formula: 100 + (IV-Ratio - SMA(IV-Ratio)) / StdDev(IV-Ratio)
   * This matches the exact same calculation as the regular RRG but uses IV data
   */
  private calculateIVMomentum(
    normalizedIVData: Array<{ date: string; normalizedIV: number }>,
    momentumPeriod: number = 14
  ): Array<{ date: string; normalizedIV: number; ivMomentum: number }> {
    const result: Array<{ date: string; normalizedIV: number; ivMomentum: number }> = [];

    // Calculate SMA and StdDev of IV-Ratio with period M
    const ivRatioValues = normalizedIVData.map(d => d.normalizedIV);
    const ivRatioSMA = this.calculateSMA(ivRatioValues, momentumPeriod);
    const ivRatioStdDev = this.calculateStdDev(ivRatioValues, momentumPeriod);

    // Calculate IV-Momentum = 100 + (IV-Ratio - SMA) / StdDev (z-score normalization)
    for (let i = momentumPeriod - 1; i < normalizedIVData.length; i++) {
      if (ivRatioSMA[i] !== undefined && ivRatioStdDev[i] !== undefined) {
        const stdDev = ivRatioStdDev[i];
        const zScore = stdDev > 0 ? (normalizedIVData[i].normalizedIV - ivRatioSMA[i]) / stdDev : 0;
        const ivMomentum = 100 + zScore;
        result.push({
          date: normalizedIVData[i].date,
          normalizedIV: normalizedIVData[i].normalizedIV,
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
      // Handle self-benchmark mode
      const isSelfBenchmark = benchmark === 'SELF';
      let benchmarkIVData: IVData[] = [];

      if (!isSelfBenchmark) {
        // Fetch benchmark IV data first
        console.log(`📊 Fetching benchmark IV for ${benchmark}...`);
        benchmarkIVData = await this.getHistoricalIV(benchmark, lookbackDays);

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
      } else {
        console.log(`📊 Using SELF-BENCHMARK mode - each ticker compared to its own historical average`);
      }

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
          let ivRatioData: Array<{ date: string; ivRatio: number }>;

          if (isSelfBenchmark) {
            // Self-benchmark: Each ticker compared to its OWN historical average
            // This means AAPL compared to AAPL's average, TSLA to TSLA's average, etc.
            const avgIV = symbolIVData.reduce((sum, d) => sum + d.avgIV, 0) / symbolIVData.length;

            // Create ratio of current IV / average IV for this specific ticker
            ivRatioData = symbolIVData.map(d => ({
              date: d.date,
              ivRatio: (d.avgIV / avgIV) * 100 // Current IV vs own average
            }));

            console.log(`📊 ${symbol}: Self-benchmark - comparing to own avg IV = ${(avgIV * 100).toFixed(2)}%`);
          } else {
            // Normal benchmark: Compare ticker's IV to benchmark (e.g., SPY)
            ivRatioData = this.calculateIVRatio(symbolIVData, benchmarkIVData);
          }

          if (ivRatioData.length < ivRatioPeriod + momentumPeriod) {
            console.warn(`⚠️ Insufficient data for ${symbol}`);
            continue;
          }

          // Apply JdK normalization with proper longPeriod
          const longPeriod = Math.max(26, ivRatioPeriod * 2);
          const normalizedIV = this.calculateNormalizedIVRatio(ivRatioData, ivRatioPeriod, longPeriod);

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
