import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.POLYGON_API_KEY;
    
    // Test if we can make a simple API call
    const testUrl = `https://api.polygon.io/v2/aggs/ticker/SPY/prev?adjusted=true&apikey=${apiKey}`;
    
    const response = await fetch(testUrl);
    const data = await response.json();
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      hasApiKey: !!apiKey,
      apiKeyLength: apiKey?.length || 0,
      apiKeyStart: apiKey?.substring(0, 8) + '...' || 'undefined',
      testApiCall: {
        status: response.status,
        data: data,
        url: testUrl.replace(apiKey || '', 'HIDDEN_API_KEY')
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