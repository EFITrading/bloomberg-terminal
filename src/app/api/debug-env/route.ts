import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.POLYGON_API_KEY;
    
    // Test different timestamp formats
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const todayStart = new Date(today + 'T00:00:00.000Z').getTime(); // Milliseconds
    const todayNanos = todayStart * 1000000; // Nanoseconds (what Polygon usually wants)
    
    // Test multiple contract formats and timestamp formats
    const tests = [
      // Test 1: Date format with timestamp.gte
      {
        name: "Date format (YYYY-MM-DD)",
        url: `https://api.polygon.io/v3/trades/O:SPY251014P00660000?timestamp.gte=${today}&apikey=${apiKey}`
      },
      // Test 2: Nanoseconds format 
      {
        name: "Nanoseconds format",
        url: `https://api.polygon.io/v3/trades/O:SPY251014P00660000?timestamp.gte=${todayNanos}&apikey=${apiKey}`
      },
      // Test 3: Milliseconds format
      {
        name: "Milliseconds format", 
        url: `https://api.polygon.io/v3/trades/O:SPY251014P00660000?timestamp.gte=${todayStart}&apikey=${apiKey}`
      },
      // Test 4: Check if contract exists first
      {
        name: "Contract check",
        url: `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=SPY&contract_type=put&strike_price=660&expiration_date=2025-10-14&apikey=${apiKey}`
      }
    ];
    
    const results = [];
    
    for (const test of tests) {
      try {
        const response = await fetch(test.url);
        const data = await response.json();
        results.push({
          testName: test.name,
          status: response.status,
          hasResults: !!(data.results && data.results.length > 0),
          resultCount: data.results?.length || 0,
          data: data,
          url: test.url.replace(apiKey || '', 'HIDDEN_KEY')
        });
      } catch (error: any) {
        results.push({
          testName: test.name,
          error: error.message,
          url: test.url.replace(apiKey || '', 'HIDDEN_KEY')
        });
      }
    }
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      hasApiKey: !!apiKey,
      dateUsed: today,
      todayNanos: todayNanos,
      todayMillis: todayStart,
      tests: results
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      hasApiKey: !!process.env.POLYGON_API_KEY,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}