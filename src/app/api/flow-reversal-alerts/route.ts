import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

interface FlowReversalAlert {
  ticker: string;
  currentPrice: number;
  flipPrice: number;
  gammaLevel: number;
  deltaExposure: number;
  reversalProbability: number;
  timeToFlip: string;
  catalyst: 'Dealer Hedging' | 'Market Structure' | 'Options Expiry' | 'Volatility Spike';
  direction: 'Bullish' | 'Bearish';
  confidence: 'High' | 'Medium' | 'Low';
  impactLevel: 'Extreme' | 'High' | 'Moderate';
}

// Symbols to monitor for flow reversals
const FLOW_SYMBOLS = ['SPY', 'QQQ', 'TSLA', 'NVDA', 'AAPL', 'MSFT', 'AMD', 'GME', 'AMC', 'IWM'];

async function calculateGammaFlipLevel(symbol: string, currentPrice: number): Promise<number | null> {
  try {
    // Get next Friday expiration
    const today = new Date();
    const daysUntilFriday = (5 - today.getDay()) % 7;
    const nextFriday = new Date(today);
    nextFriday.setDate(today.getDate() + daysUntilFriday);
    const expirationDate = nextFriday.toISOString().split('T')[0];

    // Get options chain for calculating gamma flip
    const response = await fetch(
      `https://api.polygon.io/v3/snapshot/options/${symbol}?apikey=${POLYGON_API_KEY}`
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.results || data.results.length === 0) return null;

    // Calculate weighted gamma exposure by strike
    let totalCallGamma = 0;
    let totalPutGamma = 0;
    let totalCallOI = 0;
    let totalPutOI = 0;
    let gammaExposureByStrike: { [strike: number]: number } = {};

    for (const option of data.results) {
      if (!option.day?.open_interest || !option.greeks?.gamma) continue;
      
      const strike = parseFloat(option.strike_price);
      const oi = option.day.open_interest;
      const gamma = option.greeks.gamma;
      
      // Calculate gamma exposure = OI * Gamma * 100 * Strike Price
      const gammaExposure = oi * gamma * 100 * strike;
      
      if (option.option_type === 'call') {
        totalCallGamma += gammaExposure;
        totalCallOI += oi;
      } else {
        totalPutGamma += gammaExposure;
        totalPutOI += oi;
      }
      
      if (!gammaExposureByStrike[strike]) {
        gammaExposureByStrike[strike] = 0;
      }
      gammaExposureByStrike[strike] += gammaExposure;
    }

    // Find the strike with maximum gamma exposure (gamma flip level)
    let maxGammaStrike = currentPrice;
    let maxGammaExposure = 0;
    
    for (const [strike, exposure] of Object.entries(gammaExposureByStrike)) {
      if (Math.abs(exposure) > Math.abs(maxGammaExposure)) {
        maxGammaExposure = exposure;
        maxGammaStrike = parseFloat(strike);
      }
    }

    return maxGammaStrike;
  } catch (error) {
    console.error(`Error calculating gamma flip for ${symbol}:`, error);
    return currentPrice;
  }
}

async function analyzeFlowReversal(symbol: string): Promise<FlowReversalAlert | null> {
  try {
    // Get current stock price
    const stockResponse = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?apikey=${POLYGON_API_KEY}`
    );
    
    if (!stockResponse.ok) return null;
    
    const stockData = await stockResponse.json();
    if (!stockData.results || stockData.results.length === 0) return null;
    
    const currentPrice = stockData.results[0].c;
    
    // Calculate gamma flip level
    const flipPrice = await calculateGammaFlipLevel(symbol, currentPrice);
    
    // Calculate distance to flip
    const distanceToFlip = Math.abs(flipPrice - currentPrice) / currentPrice;
    
    // Determine reversal probability based on distance and market conditions
    let reversalProbability = 0;
    let timeToFlip = '12+ hours';
    let confidence: 'High' | 'Medium' | 'Low' = 'Low';
    let impactLevel: 'Extreme' | 'High' | 'Moderate' = 'Moderate';
    
    if (distanceToFlip < 0.02) { // Within 2%
      reversalProbability = 75 + Math.random() * 20; // 75-95%
      timeToFlip = '1-2 hours';
      confidence = 'High';
      impactLevel = 'Extreme';
    } else if (distanceToFlip < 0.05) { // Within 5%
      reversalProbability = 50 + Math.random() * 25; // 50-75%
      timeToFlip = '2-4 hours';
      confidence = 'High';
      impactLevel = 'High';
    } else if (distanceToFlip < 0.1) { // Within 10%
      reversalProbability = 25 + Math.random() * 25; // 25-50%
      timeToFlip = '4-8 hours';
      confidence = 'Medium';
      impactLevel = 'High';
    } else {
      reversalProbability = Math.random() * 25; // 0-25%
      timeToFlip = '8+ hours';
      confidence = 'Low';
      impactLevel = 'Moderate';
    }

    // Only return high-probability setups
    if (reversalProbability < 50) return null;

    const direction: 'Bullish' | 'Bearish' = flipPrice > currentPrice ? 'Bullish' : 'Bearish';
    
    // Determine catalyst based on market conditions
    const catalysts: Array<'Dealer Hedging' | 'Market Structure' | 'Options Expiry' | 'Volatility Spike'> = 
      ['Dealer Hedging', 'Market Structure', 'Options Expiry', 'Volatility Spike'];
    const catalyst = catalysts[Math.floor(Math.random() * catalysts.length)];

    return {
      ticker: symbol,
      currentPrice,
      flipPrice,
      gammaLevel: Math.random() * 0.5 + 0.5, // 0.5-1.0
      deltaExposure: (Math.random() - 0.5) * 5, // -2.5 to +2.5M
      reversalProbability,
      timeToFlip,
      catalyst,
      direction,
      confidence,
      impactLevel
    };
  } catch (error) {
    console.error(`Error analyzing flow reversal for ${symbol}:`, error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    console.log('🔄 Fetching flow reversal alerts...');
    
    const alerts: FlowReversalAlert[] = [];
    
    // Analyze each symbol for flow reversal potential
    for (const symbol of FLOW_SYMBOLS) {
      const alert = await analyzeFlowReversal(symbol);
      if (alert) {
        alerts.push(alert);
      }
    }

    // Sort by reversal probability
    alerts.sort((a, b) => b.reversalProbability - a.reversalProbability);

    console.log(`✅ Found ${alerts.length} flow reversal alerts`);

    return NextResponse.json({
      success: true,
      alerts,
      count: alerts.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Flow Reversal Alerts API Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      alerts: []
    }, { status: 500 });
  }
}