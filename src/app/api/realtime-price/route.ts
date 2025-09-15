import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbol = searchParams.get('symbol');

    if (!symbol) {
      return NextResponse.json(
        { error: 'Missing required parameter: symbol' },
        { status: 400 }
      );
    }

    console.log(`🔴 REALTIME: Fetching LIVE price for ${symbol}`);

    // Get today's date (September 12, 2025) - FIXED DATE
    const todayStr = '2025-09-12';
    
    console.log(`📅 TODAY (FORCED): ${todayStr}`);

    // USE POLYGON'S REAL-TIME LAST TRADE ENDPOINT FOR LIVE DATA
    let url = `https://api.polygon.io/v2/last/trade/${symbol}?apikey=${POLYGON_API_KEY}`;
    let response = await fetch(url);
    let data = await response.json();
    
    console.log(`📊 REAL-TIME LAST TRADE:`, data);

    if (data.status === 'OK' && data.results && data.results.p) {
      const livePrice = data.results.p; // Live trade price
      const timestamp = data.results.t; // Trade timestamp
      console.log(`✅ LIVE TRADE PRICE: $${livePrice} at ${new Date(timestamp / 1000000).toISOString()}`);
      
      return NextResponse.json({
        symbol,
        price: livePrice,
        change: 0,
        timestamp: timestamp,
        date: todayStr,
        source: 'LIVE-TRADE'
      });
    }

    // FALLBACK TO REAL-TIME QUOTE IF NO TRADE DATA
    url = `https://api.polygon.io/v2/last/nbbo/${symbol}?apikey=${POLYGON_API_KEY}`;
    response = await fetch(url);
    data = await response.json();
    
    console.log(`📊 REAL-TIME QUOTE:`, data);

    if (data.status === 'OK' && data.results && data.results.P) {
      const livePrice = (data.results.P + data.results.p) / 2; // Mid price
      const timestamp = data.results.T; // Quote timestamp
      console.log(`✅ LIVE QUOTE PRICE: $${livePrice} at ${new Date(timestamp / 1000000).toISOString()}`);
      
      return NextResponse.json({
        symbol,
        price: livePrice,
        change: 0,
        timestamp: timestamp,
        date: todayStr,
        source: 'LIVE-QUOTE'
      });
    }

    // NO FALLBACKS - IF NO REAL-TIME DATA, THROW ERROR
    throw new Error(`NO REAL-TIME DATA AVAILABLE FOR ${symbol} - CHECK YOUR POLYGON SUBSCRIPTION`);

  } catch (error) {
    console.error('❌ Realtime price API error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to fetch realtime price',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}