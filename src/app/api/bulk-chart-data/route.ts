import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

interface BulkRequest {
 symbols: string[];
 timeframe: string;
 optimized?: boolean;
}

interface ChartDataPoint {
 timestamp: number;
 open: number;
 high: number;
 low: number;
 close: number;
 date: string;
 time: string;
}

export async function POST(request: NextRequest) {
 try {
 const body: BulkRequest = await request.json();
 const { symbols, timeframe, optimized = true } = body;

 if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
 return NextResponse.json({
 success: false,
 error: 'Invalid symbols array'
 }, { status: 400 });
 }

 if (symbols.length > 10) {
 return NextResponse.json({
 success: false,
 error: 'Maximum 10 symbols per batch request'
 }, { status: 400 });
 }

 console.log(` BULK FETCH: ${symbols.join(', ')} (${timeframe})`);

 // Calculate optimized date range
 const now = new Date();
 const endDate = now.toISOString().split('T')[0];
 
 const daysBack = getOptimizedDaysBack(timeframe, optimized);
 const startDate = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000))
 .toISOString().split('T')[0];

 console.log(` Date range: ${startDate} to ${endDate} (${daysBack} days)`);

 // Process symbols in parallel with smart batching
 const batchSize = 3; // Process 3 symbols at a time to avoid rate limits
 const results: Record<string, ChartDataPoint[]> = {};
 const errors: Record<string, string> = {};

 for (let i = 0; i < symbols.length; i += batchSize) {
 const batch = symbols.slice(i, i + batchSize);
 
 const batchPromises = batch.map(async (symbol) => {
 try {
 const data = await fetchSymbolData(symbol, timeframe, startDate, endDate);
 results[symbol] = data;
 console.log(` ${symbol}: ${data.length} data points`);
 } catch (error) {
 const errorMessage = error instanceof Error ? error.message : 'Unknown error';
 errors[symbol] = errorMessage;
 console.error(` ${symbol}: ${errorMessage}`);
 }
 });

 await Promise.allSettled(batchPromises);
 
 // Rate limiting between batches
 if (i + batchSize < symbols.length) {
 await new Promise(resolve => setTimeout(resolve, 100));
 }
 }

 const successCount = Object.keys(results).length;
 const errorCount = Object.keys(errors).length;

 console.log(` BULK COMPLETE: ${successCount} success, ${errorCount} errors`);

 return NextResponse.json({
 success: true,
 data: results,
 errors: errorCount > 0 ? errors : undefined,
 meta: {
 requestedSymbols: symbols.length,
 successfulSymbols: successCount,
 failedSymbols: errorCount,
 timeframe,
 dateRange: { startDate, endDate }
 }
 });

 } catch (error) {
 console.error(' Bulk chart data error:', error);
 return NextResponse.json({
 success: false,
 error: 'Failed to process bulk request',
 details: error instanceof Error ? error.message : 'Unknown error'
 }, { status: 500 });
 }
}

// Fetch data for a single symbol
async function fetchSymbolData(
 symbol: string, 
 timeframe: string, 
 startDate: string, 
 endDate: string
): Promise<ChartDataPoint[]> {
 
 // Convert timeframe to Polygon API format
 const { multiplier, timespan } = parseTimeframe(timeframe);
 
 const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${startDate}/${endDate}?adjusted=true&sort=asc&limit=50000&apikey=${POLYGON_API_KEY}`;
 
 console.log(` Fetching ${symbol} from Polygon...`);
 
 const response = await fetch(url);
 
 if (!response.ok) {
 const errorText = await response.text();
 throw new Error(`Polygon API error ${response.status}: ${errorText}`);
 }
 
 const data = await response.json();
 
 if (!data.results || data.results.length === 0) {
 throw new Error(`No data available for ${symbol}`);
 }
 
 // Transform to chart format efficiently
 return data.results.map((bar: any) => ({
 timestamp: bar.t,
 open: bar.o,
 high: bar.h,
 low: bar.l,
 close: bar.c,
 date: new Date(bar.t).toISOString().split('T')[0],
 time: new Date(bar.t).toLocaleTimeString('en-US', { 
 hour: '2-digit', 
 minute: '2-digit', 
 hour12: false 
 })
 }));
}

// Parse timeframe string into Polygon API parameters
function parseTimeframe(timeframe: string): { multiplier: number; timespan: string } {
 const timeframeMap = {
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

 const result = timeframeMap[timeframe as keyof typeof timeframeMap];
 if (!result) {
 throw new Error(`Unsupported timeframe: ${timeframe}`);
 }
 
 return result;
}

// Get optimized lookback period for fast loading
function getOptimizedDaysBack(timeframe: string, optimized: boolean): number {
 if (!optimized) {
 // Full data ranges for comprehensive analysis
 const fullRanges = {
 '1m': 5,
 '5m': 30,
 '15m': 90,
 '30m': 180,
 '1h': 365,
 '4h': 730,
 '1d': 2555,
 '1w': 1095,
 '1mo': 1825
 };
 return fullRanges[timeframe as keyof typeof fullRanges] || 365;
 }

 const optimizedRanges = {
 '1m': 2, // 2 days for 1min
 '5m': 5, // 5 days for 5min
 '15m': 14, // 2 weeks for 15min
 '30m': 30, // 1 month for 30min
 '1h': 60, // 2 months for 1hour
 '4h': 180, // 6 months for 4hour
 '1d': 730, // 2 years for daily (reduced from 7 years for speed)
 '1w': 365, // 1 year for weekly
 '1mo': 730 // 2 years for monthly
 };
 
 return optimizedRanges[timeframe as keyof typeof optimizedRanges] || 60;
}