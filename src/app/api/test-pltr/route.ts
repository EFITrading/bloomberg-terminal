import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const apiKey = process.env.POLYGON_API_KEY;
  
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not found' }, { status: 500 });
  }

  try {
    // PLTR $200 Calls expiring 11/21/25 on October 28th, 2025
    const optionTicker = 'O:PLTR251121C00200000';
    const date = '2025-10-28';
    
    console.log(`🔍 Testing PLTR $200 Call for ${date}: ${optionTicker}`);
    
    // Try historical aggregates endpoint
    const aggUrl = `https://api.polygon.io/v2/aggs/ticker/${optionTicker}/range/1/day/${date}/${date}?apiKey=${apiKey}`;
    console.log(`📡 Agg URL: ${aggUrl}`);
    
    const aggResponse = await fetch(aggUrl);
    const aggData = await aggResponse.json();
    
    console.log(`📊 Agg Response:`, JSON.stringify(aggData, null, 2));
    
    // Try snapshot endpoint for current IV (if it exists)
    const snapshotUrl = `https://api.polygon.io/v3/snapshot/options/PLTR/${optionTicker}?apiKey=${apiKey}`;
    console.log(`📡 Snapshot URL: ${snapshotUrl}`);
    
    const snapshotResponse = await fetch(snapshotUrl);
    const snapshotData = await snapshotResponse.json();
    
    console.log(`📊 Snapshot Response:`, JSON.stringify(snapshotData, null, 2));
    
    // Try quotes endpoint for the specific date
    const quotesUrl = `https://api.polygon.io/v3/quotes/${optionTicker}?timestamp.gte=${new Date(date).getTime() * 1000000}&timestamp.lt=${(new Date(date).getTime() + 86400000) * 1000000}&order=desc&limit=10&apiKey=${apiKey}`;
    console.log(`📡 Quotes URL: ${quotesUrl}`);
    
    const quotesResponse = await fetch(quotesUrl);
    const quotesData = await quotesResponse.json();
    
    console.log(`📊 Quotes Response:`, JSON.stringify(quotesData, null, 2));
    
    // Extract the key information
    let historicalPrice = null;
    let currentIV = null;
    let historicalQuotes = null;
    
    if (aggData.results && aggData.results.length > 0) {
      const result = aggData.results[0];
      historicalPrice = {
        open: result.o,
        high: result.h,
        low: result.l,
        close: result.c,
        volume: result.v
      };
      console.log(`💰 PLTR $200C 10/28/25 Price: Open=${result.o}, High=${result.h}, Low=${result.l}, Close=${result.c}, Volume=${result.v}`);
    }
    
    if (snapshotData.results && snapshotData.results.implied_volatility) {
      currentIV = (snapshotData.results.implied_volatility * 100).toFixed(2) + '%';
      console.log(`📊 PLTR $200C Current IV: ${currentIV}`);
    }
    
    if (quotesData.results && quotesData.results.length > 0) {
      historicalQuotes = quotesData.results.slice(0, 3);
      console.log(`📈 PLTR $200C 10/28/25 Quotes: ${quotesData.results.length} quotes available`);
    }
    
    return NextResponse.json({
      success: true,
      answer: `PLTR $200 Calls (11/21/25 expiry) on October 28th, 2025:`,
      historicalPrice,
      currentIV,
      historicalQuotes,
      note: "Historical IV requires complex Black-Scholes calculation from option prices. Current IV shown if available."
    });
    
  } catch (error: any) {
    console.error('❌ PLTR Test Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Failed to fetch PLTR data' 
    }, { status: 500 });
  }
}