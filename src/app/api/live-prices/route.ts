import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbols = searchParams.get('symbols'); // Comma-separated list
    
    if (!symbols) {
      return NextResponse.json({ 
        success: false, 
        error: 'Symbols parameter is required' 
      }, { status: 400 });
    }

    const polygonApiKey = process.env.POLYGON_API_KEY;
    
    if (!polygonApiKey) {
      console.error('❌ POLYGON_API_KEY not configured');
      return NextResponse.json({
        success: false,
        error: 'POLYGON_API_KEY not configured',
        source: 'config_error'
      }, { status: 500 });
    }

    const symbolList = symbols.split(',').map(s => s.trim().toUpperCase());
    const prices: { [symbol: string]: number } = {};
    
    // Fetch current prices for all symbols
    for (const symbol of symbolList) {
      try {
        const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apikey=${polygonApiKey}`;
        const response = await fetch(url);
        
        if (response.ok) {
          const data = await response.json();
          if (data.results && data.results.length > 0) {
            prices[symbol] = data.results[0].c; // Close price
          }
        }
      } catch (error) {
        console.error(`Error fetching price for ${symbol}:`, error);
      }
    }

    console.log(`📈 LIVE PRICES: Fetched prices for ${Object.keys(prices).length}/${symbolList.length} symbols`);

    return NextResponse.json({
      success: true,
      prices,
      timestamp: new Date().toISOString(),
      count: Object.keys(prices).length
    });

  } catch (error) {
    console.error('❌ Live prices API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch live prices',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}