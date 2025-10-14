import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.POLYGON_API_KEY;
    
    // Test what date we're actually using
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    // Test a specific SPY options contract with today's date
    const testUrl = `https://api.polygon.io/v3/trades/O:SPY251014C00570000?timestamp.gte=${today}&apikey=${apiKey}`;
    
    const response = await fetch(testUrl);
    const data = await response.json();
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      hasApiKey: !!apiKey,
      apiKeyLength: apiKey?.length || 0,
      apiKeyStart: apiKey?.substring(0, 8) + '...' || 'undefined',
      dateUsed: today,
      testOptionsCall: {
        status: response.status,
        data: data,
        url: testUrl.replace(apiKey || '', 'HIDDEN_KEY')
      }
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      hasApiKey: !!process.env.POLYGON_API_KEY,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}