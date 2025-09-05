import { NextRequest, NextResponse } from 'next/server';
import PolygonService from '@/lib/polygonService';

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

export async function GET(request: NextRequest) {
  try {
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);
    const endDate = new Date();
    
    const testUrl = `https://api.polygon.io/v2/aggs/ticker/AAPL/range/1/day/${startDate.toISOString().split('T')[0]}/${endDate.toISOString().split('T')[0]}?adjusted=true&sort=asc&apikey=${POLYGON_API_KEY}`;
    
    console.log('Testing Polygon Aggregates API with URL:', testUrl);
    
    const response = await fetch(testUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Polygon API Error:', response.status, errorText);
      
      return NextResponse.json({
        error: 'Polygon API request failed',
        status: response.status,
        details: errorText,
        url: testUrl.replace(POLYGON_API_KEY, '[API_KEY_HIDDEN]')
      }, { status: response.status });
    }
    
    const data = await response.json();
    console.log('Polygon API Success:', data);
    
    return NextResponse.json({
      success: true,
      dataPoints: data.results?.length || 0,
      message: 'Polygon API is working correctly'
    });
    
  } catch (error) {
    console.error('Test Polygon API Error:', error);
    return NextResponse.json({
      error: 'Failed to test Polygon API',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
