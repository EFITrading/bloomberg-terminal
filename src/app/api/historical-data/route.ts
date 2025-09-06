import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbol = searchParams.get('symbol');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!symbol || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'Missing required parameters: symbol, startDate, endDate' },
        { status: 400 }
      );
    }

    console.log(`📊 Fetching historical data for ${symbol} from ${startDate} to ${endDate}`);

    // Make request to Polygon.io API
    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${startDate}/${endDate}?adjusted=true&sort=asc&apikey=${POLYGON_API_KEY}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache'
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Invalid API key. Please check your Polygon.io API key.');
      } else if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please wait before making more requests.');
      } else if (response.status === 403) {
        throw new Error('Access forbidden. Your API key may not have permission to access this data.');
      } else {
        throw new Error(`Polygon.io API error: ${response.status} ${response.statusText}`);
      }
    }

    const data = await response.json();
    
    if (data.status === 'ERROR') {
      throw new Error(data.error || 'Unknown error from Polygon.io API');
    }

    console.log(`✅ Successfully fetched ${data.resultsCount || 0} data points for ${symbol}`);
    
    return NextResponse.json(data);

  } catch (error) {
    console.error('❌ Historical data API error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to fetch historical data',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
