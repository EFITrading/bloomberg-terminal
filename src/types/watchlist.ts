export type PerformanceCategory = 
  | 'KING'        // 21D outperforming SPY - glowing green
  | 'LEADING'     // 13D outperforming SPY - bright green  
  | 'STRONG'      // 5D outperforming SPY - lime green
  | 'IMPROVING'   // 1D outperforming SPY - blue
  | 'NEUTRAL'     // SPY or no clear trend - gray
  | 'LAGGING'     // 1D underperforming SPY - yellow
  | 'WEAK'        // 5D underperforming SPY - orange
  | 'BLEEDING'    // 13D underperforming SPY - bright red
  | 'FALLEN';     // 21D underperforming SPY - glowing red

export type AISignal = 
  | 'STRONG_BUY'
  | 'BUY'
  | 'NEUTRAL'
  | 'SELL'
  | 'STRONG_SELL';

export type Seasonality = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface WatchlistItem {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  performance: PerformanceCategory;
  signal: AISignal;
  timestamp: number;
  rrgMomentum: number;
  rrgStrength: number;
  seasonality: Seasonality;
  
  // Additional fields for enhanced analysis
  relativeStrength?: number;
  momentum?: number;
  outperformance1D?: number;
  outperformance5D?: number;
  outperformance13D?: number;
  outperformance21D?: number;
}

export interface PerformanceThresholds {
  timeframe: number;
  category: PerformanceCategory;
  color: string;
  description: string;
}

export interface AISignalFactors {
  performanceScore: number;
  relativeStrengthScore: number;
  momentumScore: number;
  seasonalityScore: number;
  currentMomentumScore: number;
  totalScore: number;
  signal: AISignal;
}
