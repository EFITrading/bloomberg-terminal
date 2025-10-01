/**
 * Gamma Exposure (GEX) Service
 * Calculates and provides gamma exposure levels for options market analysis
 */

import { polygonService } from './polygonService';

export interface GEXDataPoint {
  price: number;
  totalGamma: number;
  callGamma: number;
  putGamma: number;
  netGamma: number;
  volume: number;
  timestamp: number;
}

export interface GEXLevels {
  positiveGamma: number[];
  negativeGamma: number[];
  maxGamma: GEXDataPoint;
  minGamma: GEXDataPoint;
  zeroGamma: number | null;
  flipPoint: number | null;
}

export interface GEXAnalysis {
  symbol: string;
  currentPrice: number;
  levels: GEXLevels;
  dataPoints: GEXDataPoint[];
  marketRegime: 'positive_gamma' | 'negative_gamma' | 'mixed';
  lastUpdated: number;
}

class GEXService {
  private cache = new Map<string, { data: GEXAnalysis; expires: number }>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private readonly API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
  
  /**
   * Calculate gamma exposure for a given symbol
   */
  async calculateGEX(symbol: string): Promise<GEXAnalysis> {
    const cacheKey = `gex_${symbol}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() < cached.expires) {
      return cached.data;
    }

    try {
      console.log(`🔄 Calculating GEX for ${symbol}...`);
      
      // Get current stock price
      const currentPrice = await this.getCurrentPrice(symbol);
      
      // Get options chain data
      const optionsData = await this.getOptionsChain(symbol);
      
      // Calculate gamma exposure levels
      const gexData = this.calculateGammaExposure(optionsData, currentPrice);
      
      // Determine market regime
      const marketRegime = this.determineMarketRegime(gexData, currentPrice);
      
      const analysis: GEXAnalysis = {
        symbol,
        currentPrice,
        levels: this.calculateGEXLevels(gexData),
        dataPoints: gexData,
        marketRegime,
        lastUpdated: Date.now()
      };
      
      // Cache the result
      this.cache.set(cacheKey, {
        data: analysis,
        expires: Date.now() + this.CACHE_DURATION
      });
      
      console.log(`✅ GEX calculated for ${symbol}: ${gexData.length} data points`);
      return analysis;
      
    } catch (error) {
      console.error(`❌ Error calculating GEX for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Get current stock price using polygon API
   */
  private async getCurrentPrice(symbol: string): Promise<number> {
    try {
      const response = await fetch(
        `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?apikey=${this.API_KEY}`
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch current price: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.results?.[0]?.c || 0;
    } catch (error) {
      console.error('Error fetching current price:', error);
      // Fallback to a reasonable default for demo purposes
      return symbol === 'SPY' ? 450 : 100;
    }
  }

  /**
   * Get options chain data (simulated for now - would use real options API)
   */
  private async getOptionsChain(symbol: string): Promise<any[]> {
    // For now, we'll simulate options chain data
    // In production, this would fetch real options data from Polygon or another provider
    
    const currentPrice = await this.getCurrentPrice(symbol);
    const strikes = this.generateStrikePrices(currentPrice);
    
    return strikes.map(strike => ({
      strike,
      call: {
        gamma: this.calculateGammaForStrike(strike, currentPrice, 'call'),
        openInterest: Math.floor(Math.random() * 10000) + 1000,
        volume: Math.floor(Math.random() * 5000),
        impliedVol: 0.15 + Math.random() * 0.3
      },
      put: {
        gamma: this.calculateGammaForStrike(strike, currentPrice, 'put'),
        openInterest: Math.floor(Math.random() * 10000) + 1000,
        volume: Math.floor(Math.random() * 5000),
        impliedVol: 0.15 + Math.random() * 0.3
      }
    }));
  }

  /**
   * Generate strike prices around current price
   */
  private generateStrikePrices(currentPrice: number): number[] {
    const strikes: number[] = [];
    const range = currentPrice * 0.2; // 20% range
    const increment = currentPrice * 0.005; // 0.5% increments
    
    for (let strike = currentPrice - range; strike <= currentPrice + range; strike += increment) {
      strikes.push(Math.round(strike * 100) / 100);
    }
    
    return strikes.sort((a, b) => a - b);
  }

  /**
   * Calculate gamma for a specific strike price
   */
  private calculateGammaForStrike(strike: number, currentPrice: number, optionType: 'call' | 'put'): number {
    // Simplified gamma calculation using Black-Scholes approximation
    const moneyness = strike / currentPrice;
    const timeToExpiry = 0.1; // Assume ~36 days
    const volatility = 0.2; // 20% volatility assumption
    const riskFreeRate = 0.05; // 5% risk-free rate
    
    // Distance from ATM affects gamma (gamma is highest ATM)
    const distanceFromATM = Math.abs(moneyness - 1);
    const gammaMultiplier = Math.exp(-Math.pow(distanceFromATM / 0.1, 2));
    
    // Base gamma calculation (simplified)
    const d1 = (Math.log(currentPrice/strike) + (riskFreeRate + 0.5 * volatility * volatility) * timeToExpiry) / 
               (volatility * Math.sqrt(timeToExpiry));
    
    const gamma = (Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI)) / 
                  (currentPrice * volatility * Math.sqrt(timeToExpiry));
    
    return gamma * gammaMultiplier * 100; // Scale for display
  }

  /**
   * Calculate gamma exposure from options data
   */
  private calculateGammaExposure(optionsData: any[], currentPrice: number): GEXDataPoint[] {
    return optionsData.map(option => {
      const strike = option.strike;
      
      // Calculate gamma exposure = gamma × open interest × 100 × spot price
      const callGammaExposure = option.call.gamma * option.call.openInterest * 100 * currentPrice;
      const putGammaExposure = -option.put.gamma * option.put.openInterest * 100 * currentPrice; // Puts are negative
      
      const totalVolume = option.call.volume + option.put.volume;
      
      return {
        price: strike,
        callGamma: callGammaExposure,
        putGamma: putGammaExposure,
        totalGamma: callGammaExposure + putGammaExposure,
        netGamma: callGammaExposure + putGammaExposure,
        volume: totalVolume,
        timestamp: Date.now()
      };
    });
  }

  /**
   * Calculate key GEX levels
   */
  private calculateGEXLevels(data: GEXDataPoint[]): GEXLevels {
    const positiveGamma = data.filter(d => d.netGamma > 0).map(d => d.price);
    const negativeGamma = data.filter(d => d.netGamma < 0).map(d => d.price);
    
    const maxGamma = data.reduce((max, current) => 
      current.totalGamma > max.totalGamma ? current : max
    );
    
    const minGamma = data.reduce((min, current) => 
      current.totalGamma < min.totalGamma ? current : min
    );
    
    // Find zero gamma crossing point
    let zeroGamma: number | null = null;
    let flipPoint: number | null = null;
    
    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const curr = data[i];
      
      // Find where gamma crosses zero
      if ((prev.netGamma > 0 && curr.netGamma < 0) || (prev.netGamma < 0 && curr.netGamma > 0)) {
        zeroGamma = (prev.price + curr.price) / 2;
        flipPoint = zeroGamma;
        break;
      }
    }
    
    return {
      positiveGamma,
      negativeGamma,
      maxGamma,
      minGamma,
      zeroGamma,
      flipPoint
    };
  }

  /**
   * Determine current market regime based on GEX
   */
  private determineMarketRegime(data: GEXDataPoint[], currentPrice: number): 'positive_gamma' | 'negative_gamma' | 'mixed' {
    // Find the data point closest to current price
    const currentGEX = data.reduce((closest, point) => 
      Math.abs(point.price - currentPrice) < Math.abs(closest.price - currentPrice) ? point : closest
    );
    
    if (currentGEX.netGamma > 1000000) { // Large positive gamma
      return 'positive_gamma';
    } else if (currentGEX.netGamma < -1000000) { // Large negative gamma
      return 'negative_gamma';
    } else {
      return 'mixed';
    }
  }

  /**
   * Get GEX explanation for current regime
   */
  getGEXExplanation(analysis: GEXAnalysis): string {
    switch (analysis.marketRegime) {
      case 'positive_gamma':
        return 'Market makers are long gamma - expect lower volatility and mean reversion';
      case 'negative_gamma':
        return 'Market makers are short gamma - expect higher volatility and momentum moves';
      case 'mixed':
        return 'Mixed gamma environment - market direction uncertain';
      default:
        return 'Unable to determine market regime';
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

export const gexService = new GEXService();