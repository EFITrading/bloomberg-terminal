import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

export async function POST(request: NextRequest) {
 try {
 const { symbols, timeframe = '1d', startDate, endDate } = await request.json();

 if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
 return NextResponse.json(
 { error: 'Missing symbols array' },
 { status: 400 }
 );
 }

 console.log(` BATCH API: Loading ${symbols.length} symbols in parallel for ${timeframe}`);

 // Map timeframes to Polygon.io format
 const timeframeMap: { [key: string]: { multiplier: number; timespan: string } } = {
 '1m': { multiplier: 1, timespan: 'minute' },
 '5m': { multiplier: 5, timespan: 'minute' },
 '15m': { multiplier: 15, timespan: 'minute' },
 '30m': { multiplier: 30, timespan: 'minute' },
 '1h': { multiplier: 1, timespan: 'hour' },
 '4h': { multiplier: 4, timespan: 'hour' },
 '1d': { multiplier: 1, timespan: 'day' },
 '1w': { multiplier: 1, timespan: 'week' },
 '1mo': { multiplier: 1, timespan: 'month' }
 };

 const timeframeConfig = timeframeMap[timeframe] || { multiplier: 1, timespan: 'day' };

 // Create parallel requests for ALL symbols - MAXIMIZE YOUR UNLIMITED API!
 const batchPromises = symbols.map(async (symbol: string) => {
 try {
 const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/${timeframeConfig.multiplier}/${timeframeConfig.timespan}/${startDate}/${endDate}?adjusted=true&sort=asc&apikey=${POLYGON_API_KEY}`;
 
 const response = await fetch(url, {
 method: 'GET',
 headers: {
 'Accept': 'application/json',
 'Connection': 'keep-alive',
 'User-Agent': 'EFITrading/1.0'
 },
 signal: AbortSignal.timeout(5000),
 });

 if (response.ok) {
 const data = await response.json();
 return { symbol, data, success: true };
 } else {
 return { symbol, error: `HTTP ${response.status}`, success: false };
 }
 } catch (error) {
 return { symbol, error: error instanceof Error ? error.message : 'Unknown error', success: false };
 }
 });

 // Execute ALL requests in parallel - UNLIMITED API POWER!
 const results = await Promise.allSettled(batchPromises);
 
 const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
 console.log(` BATCH COMPLETE: ${successCount}/${symbols.length} symbols loaded successfully`);

 const batchResults = results.map(result => {
 if (result.status === 'fulfilled') {
 return result.value;
 } else {
 return { symbol: 'unknown', error: result.reason, success: false };
 }
 });

 return NextResponse.json({
 results: batchResults,
 totalSymbols: symbols.length,
 successCount,
 timeframe,
 startDate,
 endDate
 });

 } catch (error) {
 console.error(' Batch API error:', error);
 return NextResponse.json(
 { 
 error: error instanceof Error ? error.message : 'Failed to process batch request',
 timestamp: new Date().toISOString()
 },
 { status: 500 }
 );
 }
}