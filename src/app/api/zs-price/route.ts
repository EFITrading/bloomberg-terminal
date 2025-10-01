import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

export async function GET(request: NextRequest) {
  console.log('📊 FETCHING ZS (ZSCALER) STOCK PRICE...');
  
  try {
    // Get ZS stock quote
    const stockUrl = `https://api.polygon.io/v2/aggs/ticker/ZS/prev?adjusted=true&apikey=${POLYGON_API_KEY}`;
    console.log(`📡 Stock API Call: ${stockUrl}`);
    
    const stockResponse = await fetch(stockUrl);
    
    if (!stockResponse.ok) {
      throw new Error(`Stock API failed: ${stockResponse.status}`);
    }
    
    const stockData = await stockResponse.json();
    console.log('📈 Stock Data:', JSON.stringify(stockData, null, 2));
    
    // Also get real-time quote if available
    const quoteUrl = `https://api.polygon.io/v1/last_quote/stocks/ZS?apikey=${POLYGON_API_KEY}`;
    console.log(`💰 Quote API Call: ${quoteUrl}`);
    
    const quoteResponse = await fetch(quoteUrl);
    const quoteData = quoteResponse.ok ? await quoteResponse.json() : null;
    
    if (quoteData) {
      console.log('💰 Quote Data:', JSON.stringify(quoteData, null, 2));
    }
    
    // Parse the data
    const result = stockData.results?.[0];
    
    if (!result) {
      return NextResponse.json({
        success: false,
        message: 'No ZS stock data found',
        raw_response: stockData
      });
    }
    
    return NextResponse.json({
      success: true,
      symbol: 'ZS',
      company: 'Zscaler Inc.',
      data: {
        // Previous day data
        open: result.o,
        high: result.h,
        low: result.l,
        close: result.c,
        volume: result.v,
        vwap: result.vw,
        date: new Date(result.t).toISOString().split('T')[0],
        
        // Real-time quote (if available)
        bid: quoteData?.results?.bid || null,
        ask: quoteData?.results?.ask || null,
        bid_size: quoteData?.results?.bidsize || null,
        ask_size: quoteData?.results?.asksize || null,
        last_trade_price: quoteData?.results?.last?.price || result.c,
        last_trade_time: quoteData?.results?.last?.timestamp ? 
          new Date(quoteData.results.last.timestamp / 1000000).toISOString() : null
      },
      formatted: {
        current_price: `$${(quoteData?.results?.last?.price || result.c).toFixed(2)}`,
        daily_change: result.c - result.o,
        daily_change_percent: (((result.c - result.o) / result.o) * 100).toFixed(2) + '%',
        daily_range: `$${result.l.toFixed(2)} - $${result.h.toFixed(2)}`,
        volume: result.v.toLocaleString()
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ ZS Price Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch ZS price',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}