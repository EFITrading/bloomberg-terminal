import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

// Top 1000 symbols (using a subset for demo - you can expand this)
const TOP_1000_SYMBOLS = [
  'SPY', 'QQQ', 'IWM', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA',
  'BRK.B', 'V', 'JPM', 'JNJ', 'WMT', 'MA', 'PG', 'UNH', 'HD', 'DIS',
  'BAC', 'XOM', 'ABBV', 'PFE', 'KO', 'COST', 'AVGO', 'PEP', 'TMO', 'MRK',
  'CSCO', 'ABT', 'ACN', 'LLY', 'ADBE', 'NKE', 'CRM', 'NFLX', 'AMD', 'TXN',
  'QCOM', 'ORCL', 'CVX', 'DHR', 'NEE', 'UNP', 'INTC', 'BMY', 'PM', 'RTX'
];

interface HVDataPoint {
  date: string;
  hv: number;
}

interface HVResult {
  ticker: string;
  currentHV: number;
  periodLow: number;
  periodHigh: number;
  avgHV: number;
  percentileRank: number;
  daysFromLow: number;
  price: number;
  hvData: HVDataPoint[];
}

async function calculateHistoricalVolatility(symbol: string, days: number, lookbackDate: string): Promise<HVResult | null> {
  try {
    const endDate = new Date();
    const startDate = new Date(lookbackDate);
    
    const response = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${startDate.toISOString().split('T')[0]}/${endDate.toISOString().split('T')[0]}?adjusted=true&sort=asc&limit=50000&apiKey=${POLYGON_API_KEY}`
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.results || data.results.length < days + 20) return null;
    
    const hvTimeSeries: HVDataPoint[] = [];
    
    // Calculate rolling HV for each day
    for (let i = days; i < data.results.length; i++) {
      const windowData = data.results.slice(i - days, i);
      
      const returns: number[] = [];
      for (let j = 1; j < windowData.length; j++) {
        const prevClose = windowData[j - 1].c;
        const currentClose = windowData[j].c;
        const dailyReturn = Math.log(currentClose / prevClose);
        returns.push(dailyReturn);
      }
      
      if (returns.length < days - 1) continue;
      
      const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
      const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / (returns.length - 1);
      const hv = Math.sqrt(variance * 252) * 100;
      
      const date = new Date(data.results[i].t);
      hvTimeSeries.push({
        date: date.toISOString().split('T')[0],
        hv: parseFloat(hv.toFixed(2))
      });
    }
    
    if (hvTimeSeries.length === 0) return null;
    
    const currentHV = hvTimeSeries[hvTimeSeries.length - 1].hv;
    const hvValues = hvTimeSeries.map(d => d.hv);
    const periodLow = Math.min(...hvValues);
    const periodHigh = Math.max(...hvValues);
    const avgHV = hvValues.reduce((sum, v) => sum + v, 0) / hvValues.length;
    
    // Calculate percentile rank (what % of values are below current)
    const belowCurrent = hvValues.filter(v => v < currentHV).length;
    const percentileRank = (belowCurrent / hvValues.length) * 100;
    
    // Days since low
    const lowIndex = hvValues.indexOf(periodLow);
    const daysFromLow = hvValues.length - 1 - lowIndex;
    
    const currentPrice = data.results[data.results.length - 1].c;
    
    return {
      ticker: symbol,
      currentHV,
      periodLow,
      periodHigh,
      avgHV,
      percentileRank,
      daysFromLow,
      price: currentPrice,
      hvData: hvTimeSeries.slice(-252) // Last year for mini chart
    };
    
  } catch (error) {
    console.error(`Error calculating HV for ${symbol}:`, error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = parseInt(searchParams.get('period') || '30');
    const lookback = searchParams.get('lookback') || '1Y';
    const customDate = searchParams.get('customDate');

    if (![10, 20, 30, 60].includes(period)) {
      return NextResponse.json(
        { success: false, error: 'Period must be 10, 20, 30, or 60' },
        { status: 400 }
      );
    }

    console.log(`🔍 Running HV Screener: ${period}D, Lookback: ${lookback}`);

    // Calculate lookback start date
    let lookbackDate = new Date();
    if (lookback === '1Y') {
      lookbackDate.setFullYear(lookbackDate.getFullYear() - 1);
    } else if (lookback === 'ALL') {
      lookbackDate.setFullYear(lookbackDate.getFullYear() - 10);
    } else if (lookback === 'CUSTOM' && customDate) {
      lookbackDate = new Date(customDate);
    }

    const lookbackDateStr = lookbackDate.toISOString().split('T')[0];

    // Scan stocks in batches
    const results: HVResult[] = [];
    const batchSize = 10;
    
    for (let i = 0; i < Math.min(TOP_1000_SYMBOLS.length, 50); i += batchSize) {
      const batch = TOP_1000_SYMBOLS.slice(i, i + batchSize);
      const batchPromises = batch.map(symbol => 
        calculateHistoricalVolatility(symbol, period, lookbackDateStr)
      );
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter((r): r is HVResult => r !== null));
      
      console.log(`✅ Processed batch ${Math.floor(i / batchSize) + 1}: ${results.length} valid results so far`);
    }

    // Filter for stocks near HV lows (below 25th percentile)
    const filteredResults = results
      .filter(r => {
        // Must be in bottom 25th percentile
        if (r.percentileRank >= 25) return false;
        
        // Current HV must be within 1.5% of the period low
        const distanceFromLow = r.currentHV - r.periodLow;
        if (distanceFromLow > 1.5) return false;
        
        return true;
      })
      .sort((a, b) => {
        // Sort by distance from low (closer = better)
        const distA = a.currentHV - a.periodLow;
        const distB = b.currentHV - b.periodLow;
        return distA - distB;
      });

    console.log(`✅ Found ${filteredResults.length} stocks near HV lows`);

    return NextResponse.json({
      success: true,
      data: filteredResults,
      scanned: results.length,
      period,
      lookback,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('HV Screener API Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
