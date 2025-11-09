import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

interface HVDataPoint {
  date: string;
  hv: number;
  price: number;
}

async function calculateHistoricalVolatilityTimeSeries(symbol: string, days: number = 30): Promise<HVDataPoint[] | null> {
  try {
    // Get 10 years of historical price data for the chart
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(endDate.getFullYear() - 10); // 10 years of data
    
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
      
      // Calculate returns for this window
      const returns: number[] = [];
      for (let j = 1; j < windowData.length; j++) {
        const prevClose = windowData[j - 1].c;
        const currentClose = windowData[j].c;
        const dailyReturn = Math.log(currentClose / prevClose);
        returns.push(dailyReturn);
      }
      
      if (returns.length < days - 1) continue;
      
      // Calculate HV for this window
      const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
      const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / (returns.length - 1);
      const hv = Math.sqrt(variance * 252) * 100; // Annualized
      
      const date = new Date(data.results[i].t);
      hvTimeSeries.push({
        date: date.toISOString().split('T')[0],
        hv: parseFloat(hv.toFixed(2)),
        price: data.results[i].c
      });
    }
    
    return hvTimeSeries;
  } catch (error) {
    console.error(`Error calculating historical volatility time series for ${symbol}:`, error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker')?.toUpperCase();
    const days = parseInt(searchParams.get('days') || '30');

    if (!ticker) {
      return NextResponse.json(
        { success: false, error: 'Ticker is required' },
        { status: 400 }
      );
    }

    // Validate days parameter
    if (![10, 20, 30, 60].includes(days)) {
      return NextResponse.json(
        { success: false, error: 'Days must be 10, 20, 30, or 60' },
        { status: 400 }
      );
    }

    console.log(`📊 Calculating ${days}-day Historical Volatility for ${ticker}`);

    const hvTimeSeries = await calculateHistoricalVolatilityTimeSeries(ticker, days);
    
    if (!hvTimeSeries || hvTimeSeries.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Failed to calculate historical volatility' },
        { status: 500 }
      );
    }

    const latestHV = hvTimeSeries[hvTimeSeries.length - 1].hv;
    console.log(`✅ ${ticker} ${days}-day HV: ${latestHV.toFixed(2)}% (${hvTimeSeries.length} data points)`);

    return NextResponse.json({
      success: true,
      data: hvTimeSeries,
      ticker,
      period: days,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Historical Volatility API Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
