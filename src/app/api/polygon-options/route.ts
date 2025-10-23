import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
 try {
 const searchParams = request.nextUrl.searchParams;
 const ticker = searchParams.get('ticker');
 
 if (!ticker) {
 return NextResponse.json({ 
 success: false, 
 error: 'Ticker parameter is required' 
 }, { status: 400 });
 }

 const polygonApiKey = process.env.POLYGON_API_KEY;
 
 if (!polygonApiKey) {
 console.error(' POLYGON_API_KEY not configured');
 return NextResponse.json({
 success: false,
 error: 'POLYGON_API_KEY not configured',
 ticker,
 source: 'config_error'
 }, { status: 500 });
 }

 // Use Polygon's options snapshot endpoint for options data
 const polygonUrl = `https://api.polygon.io/v3/snapshot/options/${ticker}?apikey=${polygonApiKey}`;
 
 console.log(` Fetching options data for ${ticker} from Polygon snapshot API`);
 
 const response = await fetch(polygonUrl);

 if (!response.ok) {
 console.error(`Polygon API error: ${response.status} ${response.statusText}`);
 throw new Error(`Polygon API error: ${response.status} ${response.statusText}`);
 }

 const data = await response.json();
 console.log(` Polygon response for ${ticker}:`, JSON.stringify(data, null, 2));
 
 // Return the full options snapshot data
 return NextResponse.json({
 success: true,
 data: data.results || [],
 ticker,
 source: 'polygon',
 timestamp: new Date().toISOString()
 });

 } catch (error) {
 console.error(' Polygon Options API error:', error);
 
 // Return error response
 return NextResponse.json({
 success: false,
 error: error instanceof Error ? error.message : 'Unknown error',
 ticker: request.nextUrl.searchParams.get('ticker') || 'UNKNOWN',
 source: 'error'
 }, { status: 500 });
 }
}