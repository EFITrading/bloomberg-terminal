import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

export async function GET() {
  try {
    // Test with aggregates endpoint (used for seasonal analysis)
    const endDate = '2024-12-31';
    const startDate = '2024-01-01';
    const testUrl = `https://api.polygon.io/v2/aggs/ticker/AAPL/range/1/day/${startDate}/${endDate}?adjusted=true&sort=asc&apikey=${POLYGON_API_KEY}`;
    
    console.log('Testing Polygon Aggregates API with URL:', testUrl);
    
    const response = await fetch(testUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Polygon API Error:', response.status, errorText);
      
      return NextResponse.json({
        error: `API Error: ${response.status} - ${response.statusText}`,
        details: errorText,
        url: testUrl.replace(POLYGON_API_KEY, '[API_KEY_HIDDEN]')
      }, { status: response.status });
    }
    
    const data = await response.json();
    console.log('Polygon API Success:', data);
    
    return NextResponse.json({
      success: true,
      data: data,
      message: 'Polygon API is working correctly'
    });
    
  } catch (error) {
    console.error('Test API Error:', error);
    return NextResponse.json({
      error: 'Connection failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
