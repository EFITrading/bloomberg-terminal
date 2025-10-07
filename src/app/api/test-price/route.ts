export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol') || 'NFLX';
  
  try {
    console.log(`🔍 Testing price fetch for ${symbol}...`);
    
    const response = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apikey=kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf`
    );
    
    if (!response.ok) {
      return Response.json({ 
        error: `HTTP ${response.status}`, 
        symbol 
      }, { status: response.status });
    }
    
    const data = await response.json();
    console.log(`📊 Raw data for ${symbol}:`, data);
    
    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const price = data.results[0].c;
      console.log(`✅ ${symbol}: $${price}`);
      
      return Response.json({
        symbol,
        price,
        data: data.results[0],
        success: true
      });
    } else {
      return Response.json({
        symbol,
        error: 'No data found',
        raw_response: data,
        success: false
      });
    }
  } catch (error) {
    console.error(`❌ Error fetching ${symbol}:`, error);
    return Response.json({ 
      symbol,
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false 
    }, { status: 500 });
  }
}