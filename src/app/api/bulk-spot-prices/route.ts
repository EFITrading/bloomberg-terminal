import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { trades } = body;
    
    if (!trades || !Array.isArray(trades)) {
      return NextResponse.json({ 
        success: false, 
        error: 'Trades array is required' 
      }, { status: 400 });
    }

    const polygonApiKey = process.env.POLYGON_API_KEY || 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
    
    if (!polygonApiKey) {
      console.error('❌ POLYGON_API_KEY not configured');
      return NextResponse.json({
        success: false,
        error: 'POLYGON_API_KEY not configured'
      }, { status: 500 });
    }

    console.log(`📈 REAL HISTORICAL + CURRENT PRICES: Processing ${trades.length} trades`);
    
    const results: Record<string, {historical: number, current: number}> = {};
    
    // Get unique tickers first for current prices
    const uniqueTickers = Array.from(new Set(trades.map((trade: any) => trade.underlying_ticker)));
    
    // Fetch current prices for all tickers
    const currentPrices: Record<string, number> = {};
    const currentPricePromises = uniqueTickers.map(async (ticker: string) => {
      try {
        const polygonUrl = `https://api.polygon.io/v2/last/trade/${ticker}?apikey=${polygonApiKey}`;
        const response = await fetch(polygonUrl);
        
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'OK' && data.results) {
            currentPrices[ticker] = data.results.p;
            console.log(`✅ Current ${ticker}: $${data.results.p}`);
          }
        }
      } catch (error) {
        console.error(`❌ Error fetching current price for ${ticker}:`, error);
        currentPrices[ticker] = -1;
      }
    });
    
    await Promise.all(currentPricePromises);
    
    // Now fetch historical prices for each trade
    const tradePromises = trades.slice(0, 50).map(async (trade: any) => { // Limit to 50 for API rate limits
      try {
        const ticker = trade.underlying_ticker;
        const timestamp = trade.timestamp * 1000; // Convert to milliseconds
        const tradeDate = new Date(timestamp);
        const dateStr = tradeDate.toISOString().split('T')[0]; // YYYY-MM-DD format
        
        console.log(`📊 Fetching historical price for ${ticker} on ${dateStr}...`);
        
        // Use Polygon's daily bars endpoint for historical price
        const historicalUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${dateStr}/${dateStr}?adjusted=true&sort=asc&limit=1&apikey=${polygonApiKey}`;
        
        const response = await fetch(historicalUrl);
        
        if (!response.ok) {
          console.error(`❌ ${ticker} historical API error: ${response.status}`);
          return;
        }

        const data = await response.json();
        
        if (data.status !== 'OK' || !data.results || data.results.length === 0) {
          console.error(`❌ ${ticker} no historical data for ${dateStr}`);
          return;
        }

        const historicalPrice = data.results[0].c; // Close price
        const currentPrice = currentPrices[ticker] || -1;
        
        const tradeKey = `${trade.underlying_ticker}-${trade.strike}-${trade.expiry}-${trade.type}`;
        results[tradeKey] = {
          historical: historicalPrice,
          current: currentPrice
        };
        
        console.log(`✅ ${ticker} ${dateStr}: Historical $${historicalPrice} → Current $${currentPrice}`);
        
      } catch (error) {
        console.error(`❌ Error processing trade:`, error);
      }
    });

    // Wait for all trades to complete
    await Promise.all(tradePromises);
    
    console.log(`🎉 REAL PRICES: Completed ${Object.keys(results).length} trade price pairs`);

    return NextResponse.json({
      success: true,
      data: results,
      processed: trades.length,
      found: Object.keys(results).length
    });

  } catch (error) {
    console.error('❌ Bulk historical + current prices error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch real price data'
    }, { status: 500 });
  }
}