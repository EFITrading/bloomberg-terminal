import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const polygonApiKey = process.env.POLYGON_API_KEY;
    
    if (!polygonApiKey) {
      return NextResponse.json({
        success: false,
        error: 'POLYGON_API_KEY not configured'
      }, { status: 500 });
    }

    // Test with current time minus 1 hour to get recent data
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const timestampNanos = oneHourAgo.getTime() * 1000000;
    
    const url = `https://api.polygon.io/v3/trades/options?timestamp.gte=${timestampNanos}&limit=10&order=desc&sort=timestamp&apikey=${polygonApiKey}`;
    
    console.log(`🧪 TESTING POLYGON API: ${url.replace(polygonApiKey, 'API_KEY_HIDDEN')}`);
    console.log(`📅 Timestamp: ${oneHourAgo.toISOString()}`);
    
    const response = await fetch(url);
    const data = await response.json();
    
    console.log(`📊 Raw API Response:`, JSON.stringify(data, null, 2));
    
    return NextResponse.json({
      success: true,
      api_response: data,
      url_used: url.replace(polygonApiKey, 'API_KEY_HIDDEN'),
      timestamp_used: oneHourAgo.toISOString(),
      timestamp_nanos: timestampNanos
    });

  } catch (error) {
    console.error('❌ Test API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}