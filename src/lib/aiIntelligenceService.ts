// AI Intelligence Service - Comprehensive Data Access and Analysis
import GlobalDataCache from './GlobalDataCache';
import PolygonService from './polygonService';
import SeasonalScreenerService from './seasonalScreenerService';
import { IndustryAnalysisService } from './industryAnalysisService';
import RRGService from './rrgService';

export interface SeasonalAnalysis {
  symbol: string;
  bestPeriods: Array<{
    period: string;
    startDate: string;
    endDate: string;
    avgReturn: number;
    winRate: number;
    strength: 'Strong' | 'Moderate' | 'Weak';
  }>;
  worstPeriods: Array<{
    period: string;
    startDate: string;
    endDate: string;
    avgReturn: number;
    winRate: number;
  }>;
  currentPeriodStrength: number;
  nextOptimalEntry: string;
  seasonalPattern: string;
  analysis: string;
}

export interface RRGPosition {
  symbol: string;
  quadrant: 'Leading' | 'Weakening' | 'Lagging' | 'Improving';
  rsRatio: number;
  rsMomentum: number;
  trend: string;
  recommendation: string;
  relativeStrength: string;
}

export interface IndustryStrength {
  industry: string;
  strength: number;
  trend: 'Bullish' | 'Bearish' | 'Neutral';
  topPerformers: string[];
  breakoutSignals: boolean;
  momentum: number;
  analysis: string;
}

export interface MarketRegimeAnalysis {
  currentRegime: string;
  strongestIndustries: IndustryStrength[];
  weakestIndustries: IndustryStrength[];
  rotationSignals: string[];
  marketPhase: string;
  recommendation: string;
}

export class AIIntelligenceService {
  private polygonService: PolygonService;
  private seasonalService: SeasonalScreenerService;
  private industryService: IndustryAnalysisService;
  private rrgService: RRGService;
  private cache: GlobalDataCache;

  constructor() {
    this.polygonService = new PolygonService();
    this.seasonalService = new SeasonalScreenerService();
    this.industryService = new IndustryAnalysisService();
    this.rrgService = new RRGService();
    this.cache = GlobalDataCache.getInstance();
  }

  /**
   * Analyze seasonal patterns for a specific symbol
   */
  async analyzeSeasonalPatterns(symbol: string): Promise<SeasonalAnalysis> {
    try {
      console.log(`🔍 AI analyzing seasonal patterns for ${symbol}...`);
      
      // Get cached seasonal data first
      let seasonalData = this.cache.get(GlobalDataCache.keys.SEASONAL_OPPORTUNITIES);
      
      if (!seasonalData) {
        // Fetch fresh seasonal data
        seasonalData = await this.seasonalService.screenSeasonalOpportunities(15, 20, 0);
        this.cache.set(GlobalDataCache.keys.SEASONAL_OPPORTUNITIES, seasonalData);
      }

      // Find symbol-specific data
      const symbolData = seasonalData?.find((item: any) => 
        item.symbol.toUpperCase() === symbol.toUpperCase()
      );

      if (!symbolData) {
        // Fetch detailed seasonal analysis for this specific symbol
        const endDate = new Date();
        const startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 5); // 5 years of data

        const historicalData = await this.polygonService.getHistoricalData(
          symbol,
          startDate.toISOString().split('T')[0],
          endDate.toISOString().split('T')[0],
          'day',
          1
        );

        if (historicalData?.results) {
          const analysis = this.calculateSeasonalPatterns(historicalData.results, symbol);
          return analysis;
        }
      }

      // Process existing seasonal data
      return this.processSeasonalData(symbolData, symbol);
    } catch (error) {
      console.error(`Error analyzing seasonal patterns for ${symbol}:`, error);
      throw new Error(`Failed to analyze seasonal patterns for ${symbol}`);
    }
  }

  /**
   * Get RRG position and analysis for a symbol
   */
  async analyzeRRGPosition(symbol: string, timeframe: string = '14 weeks'): Promise<RRGPosition> {
    try {
      console.log(`🎯 AI analyzing RRG position for ${symbol}...`);
      
      // Get RRG data from the service
      const rrgData = await this.rrgService.calculateSectorRRG(
        this.getTimeframeWeeks(timeframe),
        14,
        14,
        10
      );

      // Find the symbol in RRG data
      const symbolPosition = rrgData.find(item => 
        item.symbol.toUpperCase() === symbol.toUpperCase()
      );

      if (!symbolPosition) {
        throw new Error(`${symbol} not found in RRG analysis`);
      }

      const quadrant = this.determineQuadrant(symbolPosition.rsRatio, symbolPosition.rsMomentum);
      
      return {
        symbol: symbol.toUpperCase(),
        quadrant,
        rsRatio: symbolPosition.rsRatio,
        rsMomentum: symbolPosition.rsMomentum,
        trend: this.analyzeTrend(symbolPosition),
        recommendation: this.generateRRGRecommendation(quadrant, symbolPosition),
        relativeStrength: this.interpretRelativeStrength(symbolPosition.rsRatio, symbolPosition.rsMomentum)
      };
    } catch (error) {
      console.error(`Error analyzing RRG position for ${symbol}:`, error);
      throw new Error(`Failed to analyze RRG position for ${symbol}`);
    }
  }

  /**
   * Analyze current market regimes and industry strength
   */
  async analyzeMarketRegimes(): Promise<MarketRegimeAnalysis> {
    try {
      console.log('🏛️ AI analyzing market regimes and industry strength...');
      
      // Get market regime data
      const regimeData = await IndustryAnalysisService.getMarketRegimeDataStreaming(
        (stage: string, progress: number) => console.log(`📊 ${stage}: ${progress}%`),
        (timeframe: string, data: any) => console.log(`📈 ${timeframe} data received`)
      );

      // Analyze current market phase
      const currentRegime = this.determineMarketRegime(regimeData);
      
      // Get strongest and weakest industries
      const strongestIndustries = this.identifyStrongestIndustries(regimeData);
      const weakestIndustries = this.identifyWeakestIndustries(regimeData);
      
      // Generate rotation signals
      const rotationSignals = this.generateRotationSignals(regimeData);
      
      return {
        currentRegime: currentRegime.regime,
        strongestIndustries,
        weakestIndustries,
        rotationSignals,
        marketPhase: currentRegime.phase,
        recommendation: this.generateMarketRecommendation(currentRegime, strongestIndustries)
      };
    } catch (error) {
      console.error('Error analyzing market regimes:', error);
      throw new Error('Failed to analyze market regimes');
    }
  }

  /**
   * Process user questions and route to appropriate analysis
   */
  async processIntelligentQuery(query: string): Promise<string> {
    const lowerQuery = query.toLowerCase();
    
    try {
      // Seasonal analysis queries
      if (this.isSeasonalQuery(lowerQuery)) {
        const symbol = this.extractSymbol(query);
        if (symbol) {
          const analysis = await this.analyzeSeasonalPatterns(symbol);
          return this.formatSeasonalResponse(analysis);
        }
      }
      
      // RRG position queries
      if (this.isRRGQuery(lowerQuery)) {
        const symbol = this.extractSymbol(query);
        if (symbol) {
          const position = await this.analyzeRRGPosition(symbol);
          return this.formatRRGResponse(position);
        }
      }
      
      // Market regime and industry strength queries
      if (this.isMarketRegimeQuery(lowerQuery)) {
        const regimes = await this.analyzeMarketRegimes();
        return this.formatMarketRegimeResponse(regimes);
      }
      
      // General market analysis
      if (this.isGeneralMarketQuery(lowerQuery)) {
        const regimes = await this.analyzeMarketRegimes();
        return this.formatGeneralMarketResponse(regimes, query);
      }
      
      return "I can help you analyze seasonal patterns, RRG positions, market regimes, and industry strength. Try asking questions like:\n\n• 'What is the best seasonal period for AAPL?'\n• 'What quadrant is SMH in on the RRG chart?'\n• 'What is the strongest industry right now?'\n• 'Show me market regime analysis'";
      
    } catch (error) {
      console.error('Error processing intelligent query:', error);
      return `Sorry, I encountered an error analyzing that data. Please try again or rephrase your question.`;
    }
  }

  // Helper methods for query detection
  private isSeasonalQuery(query: string): boolean {
    const seasonalKeywords = ['seasonal', 'season', 'best time', 'optimal period', 'bullish period', 'bearish period', 'when to buy', 'when to sell'];
    return seasonalKeywords.some(keyword => query.includes(keyword));
  }

  private isRRGQuery(query: string): boolean {
    const rrgKeywords = ['rrg', 'quadrant', 'relative rotation', 'relative strength', 'momentum', 'leading', 'lagging', 'weakening', 'improving'];
    return rrgKeywords.some(keyword => query.includes(keyword));
  }

  private isMarketRegimeQuery(query: string): boolean {
    const regimeKeywords = ['strongest industry', 'weakest industry', 'market regime', 'sector rotation', 'industry strength', 'breaking out', 'leadership'];
    return regimeKeywords.some(keyword => query.includes(keyword));
  }

  private isGeneralMarketQuery(query: string): boolean {
    const generalKeywords = ['market', 'analysis', 'overview', 'summary', 'current conditions'];
    return generalKeywords.some(keyword => query.includes(keyword));
  }

  private extractSymbol(query: string): string | null {
    // Look for common stock symbol patterns
    const symbolMatch = query.match(/\b([A-Z]{1,5})\b/);
    return symbolMatch ? symbolMatch[1] : null;
  }

  // Helper methods for data processing
  private calculateSeasonalPatterns(historicalData: any[], symbol: string): SeasonalAnalysis {
    // Process historical data to find seasonal patterns
    const monthlyReturns: { [month: string]: number[] } = {};
    
    for (let i = 1; i < historicalData.length; i++) {
      const currentData = historicalData[i];
      const previousData = historicalData[i - 1];
      const date = new Date(currentData.t);
      const monthKey = date.toLocaleString('default', { month: 'long' });
      
      const monthlyReturn = ((currentData.c - previousData.c) / previousData.c) * 100;
      
      if (!monthlyReturns[monthKey]) {
        monthlyReturns[monthKey] = [];
      }
      monthlyReturns[monthKey].push(monthlyReturn);
    }

    // Calculate best and worst periods
    const monthlyAvg = Object.keys(monthlyReturns).map(month => ({
      month,
      avgReturn: monthlyReturns[month].reduce((sum, ret) => sum + ret, 0) / monthlyReturns[month].length,
      winRate: (monthlyReturns[month].filter(ret => ret > 0).length / monthlyReturns[month].length) * 100
    }));

    const sortedByReturn = monthlyAvg.sort((a, b) => b.avgReturn - a.avgReturn);
    
    return {
      symbol,
      bestPeriods: sortedByReturn.slice(0, 3).map(period => ({
        period: period.month,
        startDate: `${period.month} 1st`,
        endDate: `${period.month} 31st`,
        avgReturn: period.avgReturn,
        winRate: period.winRate,
        strength: period.avgReturn > 5 ? 'Strong' : period.avgReturn > 2 ? 'Moderate' : 'Weak'
      })),
      worstPeriods: sortedByReturn.slice(-2).map(period => ({
        period: period.month,
        startDate: `${period.month} 1st`,
        endDate: `${period.month} 31st`,
        avgReturn: period.avgReturn,
        winRate: period.winRate
      })),
      currentPeriodStrength: this.getCurrentPeriodStrength(monthlyAvg),
      nextOptimalEntry: this.getNextOptimalEntry(sortedByReturn),
      seasonalPattern: this.determineSeasonalPattern(sortedByReturn),
      analysis: this.generateSeasonalAnalysis(symbol, sortedByReturn)
    };
  }

  private processSeasonalData(symbolData: any, symbol: string): SeasonalAnalysis {
    // Process existing seasonal data from cache
    return {
      symbol,
      bestPeriods: symbolData.bestPeriods || [],
      worstPeriods: symbolData.worstPeriods || [],
      currentPeriodStrength: symbolData.currentSeasonalStrength || 0,
      nextOptimalEntry: symbolData.nextSeasonalWindow || 'Unknown',
      seasonalPattern: symbolData.seasonalPattern || 'Unknown Pattern',
      analysis: `${symbol} shows ${symbolData.seasonalPattern || 'seasonal'} characteristics with current strength of ${symbolData.currentSeasonalStrength || 0}%`
    };
  }

  private determineQuadrant(rsRatio: number, rsMomentum: number): 'Leading' | 'Weakening' | 'Lagging' | 'Improving' {
    if (rsRatio >= 100 && rsMomentum >= 100) return 'Leading';
    if (rsRatio >= 100 && rsMomentum < 100) return 'Weakening';
    if (rsRatio < 100 && rsMomentum < 100) return 'Lagging';
    return 'Improving';
  }

  private getTimeframeWeeks(timeframe: string): number {
    const timeframeMap: { [key: string]: number } = {
      '4 weeks': 8,
      '8 weeks': 12,
      '14 weeks': 18,
      '26 weeks': 30,
      '52 weeks': 56
    };
    return timeframeMap[timeframe] || 18;
  }

  private analyzeTrend(position: any): string {
    const momentum = position.rsMomentum;
    if (momentum > 110) return 'Strong Uptrend';
    if (momentum > 105) return 'Moderate Uptrend';
    if (momentum > 95) return 'Sideways';
    if (momentum > 90) return 'Moderate Downtrend';
    return 'Strong Downtrend';
  }

  private generateRRGRecommendation(quadrant: string, position: any): string {
    switch (quadrant) {
      case 'Leading':
        return 'Strong position - Consider holding or accumulating on weakness';
      case 'Weakening':
        return 'Caution advised - Monitor for breakdown or rotation';
      case 'Lagging':
        return 'Weak position - Consider reducing exposure';
      case 'Improving':
        return 'Emerging strength - Monitor for momentum acceleration';
      default:
        return 'Monitor position closely';
    }
  }

  private interpretRelativeStrength(rsRatio: number, rsMomentum: number): string {
    if (rsRatio > 110 && rsMomentum > 110) return 'Very Strong';
    if (rsRatio > 105 && rsMomentum > 105) return 'Strong';
    if (rsRatio > 95 && rsMomentum > 95) return 'Neutral';
    if (rsRatio < 90 || rsMomentum < 90) return 'Weak';
    return 'Very Weak';
  }

  // Additional helper methods would be implemented here...
  private determineMarketRegime(regimeData: any) { 
    return { regime: 'Risk-On', phase: 'Expansion' }; 
  }
  
  private identifyStrongestIndustries(regimeData: any): IndustryStrength[] { 
    return []; 
  }
  
  private identifyWeakestIndustries(regimeData: any): IndustryStrength[] { 
    return []; 
  }
  
  private generateRotationSignals(regimeData: any): string[] { 
    return []; 
  }
  
  private generateMarketRecommendation(regime: any, industries: IndustryStrength[]): string { 
    return 'Monitor market conditions'; 
  }

  private getCurrentPeriodStrength(monthlyAvg: any[]): number { 
    return 0; 
  }
  
  private getNextOptimalEntry(sortedByReturn: any[]): string { 
    return 'Unknown'; 
  }
  
  private determineSeasonalPattern(sortedByReturn: any[]): string { 
    return 'Seasonal Pattern'; 
  }
  
  private generateSeasonalAnalysis(symbol: string, sortedByReturn: any[]): string { 
    return `Analysis for ${symbol}`; 
  }

  // Response formatting methods
  private formatSeasonalResponse(analysis: SeasonalAnalysis): string {
    let response = `🗓️ **Seasonal Analysis for ${analysis.symbol}**\n\n`;
    
    response += `**📈 Best Seasonal Periods:**\n`;
    analysis.bestPeriods.forEach(period => {
      response += `• ${period.period}: ${period.avgReturn.toFixed(2)}% avg return (${period.winRate.toFixed(1)}% win rate) - ${period.strength}\n`;
    });
    
    response += `\n**📉 Worst Seasonal Periods:**\n`;
    analysis.worstPeriods.forEach(period => {
      response += `• ${period.period}: ${period.avgReturn.toFixed(2)}% avg return (${period.winRate.toFixed(1)}% win rate)\n`;
    });
    
    response += `\n**Current Period Strength:** ${analysis.currentPeriodStrength}%\n`;
    response += `**Next Optimal Entry:** ${analysis.nextOptimalEntry}\n`;
    response += `**Pattern:** ${analysis.seasonalPattern}\n\n`;
    response += `**Analysis:** ${analysis.analysis}`;
    
    return response;
  }

  private formatRRGResponse(position: RRGPosition): string {
    return `🎯 **RRG Analysis for ${position.symbol}**\n\n` +
           `**Quadrant:** ${position.quadrant}\n` +
           `**Relative Strength Ratio:** ${position.rsRatio.toFixed(2)}\n` +
           `**Momentum:** ${position.rsMomentum.toFixed(2)}\n` +
           `**Trend:** ${position.trend}\n` +
           `**Relative Strength:** ${position.relativeStrength}\n\n` +
           `**Recommendation:** ${position.recommendation}`;
  }

  private formatMarketRegimeResponse(regimes: MarketRegimeAnalysis): string {
    let response = `🏛️ **Market Regime Analysis**\n\n`;
    response += `**Current Regime:** ${regimes.currentRegime}\n`;
    response += `**Market Phase:** ${regimes.marketPhase}\n\n`;
    
    response += `**💪 Strongest Industries:**\n`;
    regimes.strongestIndustries.slice(0, 3).forEach(industry => {
      response += `• ${industry.industry}: ${industry.strength.toFixed(1)}% strength (${industry.trend})\n`;
    });
    
    response += `\n**📉 Weakest Industries:**\n`;
    regimes.weakestIndustries.slice(0, 3).forEach(industry => {
      response += `• ${industry.industry}: ${industry.strength.toFixed(1)}% strength (${industry.trend})\n`;
    });
    
    response += `\n**Recommendation:** ${regimes.recommendation}`;
    
    return response;
  }

  private formatGeneralMarketResponse(regimes: MarketRegimeAnalysis, query: string): string {
    return `📊 **Market Overview**\n\n${this.formatMarketRegimeResponse(regimes)}`;
  }
}

export default AIIntelligenceService;