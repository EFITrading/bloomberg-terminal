import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

interface VolArbitrage {
  ticker: string;
  currentPrice: number;
  impliedVol: number;
  realizedVol: number;
  volSpread: number;
  spreadPercent: number;
  opportunity: 'Buy Vol' | 'Sell Vol' | 'Fair Value';
  confidence: 'High' | 'Medium' | 'Low';
  timeframe: string;
  expectedReversion: number;
  riskReward: number;
}

// High-volume symbols for vol arbitrage
const VOL_SYMBOLS = ['SPY', 'QQQ', 'TSLA', 'NVDA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'IWM'];

async function calculateRealizedVolatility(symbol: string, days: number = 30): Promise<number | null> {
  try {
    // Get historical price data for realized vol calculation
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);
    
    const response = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${startDate.toISOString().split('T')[0]}/${endDate.toISOString().split('T')[0]}?apikey=${POLYGON_API_KEY}`
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.results || data.results.length < 20) return null; // Need minimum 20 days for reliable calculation
    
    // Calculate daily returns
    const returns: number[] = [];
    for (let i = 1; i < data.results.length; i++) {
      const prevClose = data.results[i - 1].c;
      const currentClose = data.results[i].c;
      const dailyReturn = Math.log(currentClose / prevClose);
      returns.push(dailyReturn);
    }
    
    if (returns.length < 5) return 0;
    
    // Calculate realized volatility
    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / (returns.length - 1);
    const realizedVol = Math.sqrt(variance * 252) * 100; // Annualized
    
    return realizedVol;
  } catch (error) {
    console.error(`Error calculating realized vol for ${symbol}:`, error);
    return 0;
  }
}

async function calculateImpliedVolatility(symbol: string): Promise<number> {
  try {
    // Get ATM options for IV calculation
    const stockResponse = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?apikey=${POLYGON_API_KEY}`
    );
    
    if (!stockResponse.ok) return 0;
    
    const stockData = await stockResponse.json();
    if (!stockData.results || stockData.results.length === 0) return 0;
    
    const currentPrice = stockData.results[0].c;
    
    // Get options chain
    const optionsResponse = await fetch(
      `https://api.polygon.io/v3/snapshot/options/${symbol}?apikey=${POLYGON_API_KEY}`
    );
    
    if (!optionsResponse.ok) return 0;
    
    const optionsData = await optionsResponse.json();
    if (!optionsData.results || optionsData.results.length === 0) return 0;
    
    // Find ATM options and calculate average IV
    let totalIV = 0;
    let count = 0;
    
    for (const option of optionsData.results) {
      if (!option.implied_volatility) continue;
      
      const strike = parseFloat(option.strike_price);
      const distanceFromATM = Math.abs(strike - currentPrice) / currentPrice;
      
      // Only use near-ATM options (within 5%)
      if (distanceFromATM <= 0.05) {
        totalIV += option.implied_volatility * 100; // Convert to percentage
        count++;
      }
    }
    
    return count > 0 ? totalIV / count : 0;
  } catch (error) {
    console.error(`Error calculating implied vol for ${symbol}:`, error);
    return 0;
  }
}

async function analyzeVolArbitrage(symbol: string): Promise<VolArbitrage | null> {
  try {
    // Get current stock price
    const stockResponse = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?apikey=${POLYGON_API_KEY}`
    );
    
    if (!stockResponse.ok) return null;
    
    const stockData = await stockResponse.json();
    if (!stockData.results || stockData.results.length === 0) return null;
    
    const currentPrice = stockData.results[0].c;
    
    // Calculate realized and implied volatility
    const [realizedVol, impliedVol] = await Promise.all([
      calculateRealizedVolatility(symbol, 30),
      calculateImpliedVolatility(symbol)
    ]);
    
    if (realizedVol === 0 || impliedVol === 0) return null;
    
    // Calculate vol spread
    const volSpread = impliedVol - realizedVol;
    const spreadPercent = (volSpread / realizedVol) * 100;
    
    // Determine opportunity and confidence
    let opportunity: 'Buy Vol' | 'Sell Vol' | 'Fair Value' = 'Fair Value';
    let confidence: 'High' | 'Medium' | 'Low' = 'Low';
    let expectedReversion = Math.abs(volSpread) * 0.5; // Conservative reversion estimate
    let riskReward = 1.0;
    
    if (Math.abs(spreadPercent) > 30) {
      confidence = 'High';
      expectedReversion = Math.abs(volSpread) * 0.7;
      riskReward = 2.5;
    } else if (Math.abs(spreadPercent) > 15) {
      confidence = 'Medium';
      expectedReversion = Math.abs(volSpread) * 0.6;
      riskReward = 1.8;
    }
    
    if (volSpread > 5) { // IV significantly higher than RV
      opportunity = 'Sell Vol';
    } else if (volSpread < -5) { // RV significantly higher than IV
      opportunity = 'Buy Vol';
    }
    
    // Only return significant opportunities
    if (Math.abs(spreadPercent) < 10) return null;
    
    // Determine timeframe based on vol levels
    let timeframe = '30 days';
    if (impliedVol > 50) {
      timeframe = '14 days';
    } else if (impliedVol > 30) {
      timeframe = '21 days';
    }
    
    return {
      ticker: symbol,
      currentPrice,
      impliedVol,
      realizedVol,
      volSpread,
      spreadPercent,
      opportunity,
      confidence,
      timeframe,
      expectedReversion,
      riskReward
    };

  } catch (error) {
    console.error(`Error analyzing vol arbitrage for ${symbol}:`, error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    console.log('🔄 Scanning for volatility arbitrage opportunities...');
    
    const volArbitrageData: VolArbitrage[] = [];
    
    // Analyze each symbol for vol arbitrage
    for (const symbol of VOL_SYMBOLS) {
      const analysis = await analyzeVolArbitrage(symbol);
      if (analysis) {
        volArbitrageData.push(analysis);
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Sort by confidence and spread magnitude
    volArbitrageData.sort((a, b) => {
      const confidenceScore = { 'High': 3, 'Medium': 2, 'Low': 1 };
      const aScore = confidenceScore[a.confidence] * Math.abs(a.spreadPercent);
      const bScore = confidenceScore[b.confidence] * Math.abs(b.spreadPercent);
      return bScore - aScore;
    });

    console.log(`✅ Found ${volArbitrageData.length} volatility arbitrage opportunities`);

    return NextResponse.json({
      success: true,
      data: volArbitrageData,
      count: volArbitrageData.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Volatility Arbitrage API Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: []
    }, { status: 500 });
  }
}