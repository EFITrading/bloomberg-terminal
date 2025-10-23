import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

interface BulkTickerRequest {
 symbols: string[];
 dataTypes: ('historical' | 'options' | 'seasonal' | 'flow' | 'gex' | 'details' | 'quotes')[];
 timeframe?: string;
 period?: string; // '1d', '5d', '1m', '3m', '1y', '5y'
 maxParallel?: number; // Max parallel requests per symbol
}

interface TickerDataResponse {
 symbol: string;
 historical?: any;
 options?: any;
 seasonal?: any;
 flow?: any;
 gex?: any;
 details?: any;
 quotes?: any;
 errors?: string[];
 fetchTime: number;
}

export async function POST(request: NextRequest) {
 const startTime = Date.now();
 
 try {
 const body: BulkTickerRequest = await request.json();
 const { 
 symbols, 
 dataTypes, 
 timeframe = '1d', 
 period = '1y',
 maxParallel = 6 
 } = body;

 if (!symbols?.length || !dataTypes?.length) {
 return NextResponse.json({
 success: false,
 error: 'Missing symbols or dataTypes'
 }, { status: 400 });
 }

 console.log(` BULK REQUEST: ${symbols.length} symbols × ${dataTypes.length} data types`);
 console.log(` Symbols: ${symbols.join(', ')}`);
 console.log(` Data types: ${dataTypes.join(', ')}`);

 // Calculate optimized date ranges
 const dateRanges = calculateDateRanges(period);
 
 // Process all symbols in parallel
 const results: TickerDataResponse[] = await Promise.all(
 symbols.map(symbol => fetchAllDataForSymbol(
 symbol, 
 dataTypes, 
 timeframe, 
 dateRanges, 
 maxParallel
 ))
 );

 const totalTime = Date.now() - startTime;
 const successCount = results.filter(r => !r.errors?.length).length;
 
 console.log(` BULK COMPLETE: ${successCount}/${symbols.length} symbols in ${totalTime}ms`);

 return NextResponse.json({
 success: true,
 data: results,
 meta: {
 totalSymbols: symbols.length,
 successfulSymbols: successCount,
 dataTypes: dataTypes,
 totalTime,
 averageTimePerSymbol: Math.round(totalTime / symbols.length),
 timestamp: new Date().toISOString()
 }
 });

 } catch (error) {
 console.error(' Bulk ticker data error:', error);
 return NextResponse.json({
 success: false,
 error: 'Internal server error',
 details: error instanceof Error ? error.message : 'Unknown error'
 }, { status: 500 });
 }
}

// Fetch ALL data types for a single symbol in parallel
async function fetchAllDataForSymbol(
 symbol: string,
 dataTypes: string[],
 timeframe: string,
 dateRanges: any,
 maxParallel: number
): Promise<TickerDataResponse> {
 const result: TickerDataResponse = {
 symbol,
 errors: [],
 fetchTime: 0
 };

 const startTime = Date.now();

 // Create parallel fetch functions
 const fetchTasks = [];

 if (dataTypes.includes('historical')) {
 fetchTasks.push(
 fetchHistoricalData(symbol, dateRanges.historical.start, dateRanges.historical.end, timeframe)
 .then(data => result.historical = data)
 .catch(err => result.errors?.push(`Historical: ${err.message}`))
 );
 }

 if (dataTypes.includes('options')) {
 fetchTasks.push(
 fetchOptionsData(symbol)
 .then(data => result.options = data)
 .catch(err => result.errors?.push(`Options: ${err.message}`))
 );
 }

 if (dataTypes.includes('seasonal')) {
 fetchTasks.push(
 fetchSeasonalData(symbol, dateRanges.seasonal.start, dateRanges.seasonal.end)
 .then(data => result.seasonal = data)
 .catch(err => result.errors?.push(`Seasonal: ${err.message}`))
 );
 }

 if (dataTypes.includes('flow')) {
 fetchTasks.push(
 fetchFlowData(symbol)
 .then(data => result.flow = data)
 .catch(err => result.errors?.push(`Flow: ${err.message}`))
 );
 }

 if (dataTypes.includes('gex')) {
 fetchTasks.push(
 fetchGEXData(symbol)
 .then(data => result.gex = data)
 .catch(err => result.errors?.push(`GEX: ${err.message}`))
 );
 }

 if (dataTypes.includes('details')) {
 fetchTasks.push(
 fetchTickerDetails(symbol)
 .then(data => result.details = data)
 .catch(err => result.errors?.push(`Details: ${err.message}`))
 );
 }

 if (dataTypes.includes('quotes')) {
 fetchTasks.push(
 fetchRealtimeQuotes(symbol)
 .then(data => result.quotes = data)
 .catch(err => result.errors?.push(`Quotes: ${err.message}`))
 );
 }

 // Execute all fetches in parallel with controlled concurrency
 await executeWithConcurrencyLimit(fetchTasks, maxParallel);

 result.fetchTime = Date.now() - startTime;
 
 console.log(` ${symbol}: ${fetchTasks.length} data types in ${result.fetchTime}ms`);
 
 return result;
}

// Execute promises with concurrency limit
async function executeWithConcurrencyLimit(tasks: Promise<any>[], limit: number) {
 const results = [];
 for (let i = 0; i < tasks.length; i += limit) {
 const batch = tasks.slice(i, i + limit);
 const batchResults = await Promise.allSettled(batch);
 results.push(...batchResults);
 }
 return results;
}

// Individual data fetchers - optimized for speed
async function fetchHistoricalData(symbol: string, startDate: string, endDate: string, timeframe: string) {
 const { multiplier, timespan } = parseTimeframe(timeframe);
 const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${startDate}/${endDate}?adjusted=true&sort=desc&limit=50000&apikey=${POLYGON_API_KEY}`;
 
 const response = await fetch(url, {
 headers: { 'Accept': 'application/json' },
 signal: AbortSignal.timeout(10000) // 10s timeout
 });
 
 if (!response.ok) throw new Error(`HTTP ${response.status}`);
 return await response.json();
}

async function fetchOptionsData(symbol: string) {
 // Get next few expiration dates
 const expirations = getNextExpirations(3); // Next 3 expirations
 
 const optionsPromises = expirations.map(exp => 
 fetch(`https://api.polygon.io/v3/snapshot/options/${symbol}?expiration_date=${exp}&limit=250&apikey=${POLYGON_API_KEY}`, {
 signal: AbortSignal.timeout(8000)
 }).then(r => r.ok ? r.json() : null)
 );
 
 const results = await Promise.all(optionsPromises);
 return results.filter(Boolean);
}

async function fetchSeasonalData(symbol: string, startDate: string, endDate: string) {
 // Fetch historical data for seasonal analysis
 const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${startDate}/${endDate}?adjusted=true&sort=asc&limit=50000&apikey=${POLYGON_API_KEY}`;
 
 const response = await fetch(url, {
 signal: AbortSignal.timeout(12000) // Longer timeout for large datasets
 });
 
 if (!response.ok) throw new Error(`HTTP ${response.status}`);
 const data = await response.json();
 
 // Process seasonal patterns here
 return processSeasonalPatterns(data, symbol);
}

async function fetchFlowData(symbol: string) {
 // Implement options flow fetching
 const url = `https://api.polygon.io/v3/snapshot/options/${symbol}?apikey=${POLYGON_API_KEY}`;
 
 const response = await fetch(url, {
 signal: AbortSignal.timeout(8000)
 });
 
 if (!response.ok) throw new Error(`HTTP ${response.status}`);
 return await response.json();
}

async function fetchGEXData(symbol: string) {
 // Implement GEX calculation
 // This would combine options data with mathematical calculations
 const optionsData = await fetchOptionsData(symbol);
 return calculateGEX(optionsData, symbol);
}

async function fetchTickerDetails(symbol: string) {
 const url = `https://api.polygon.io/v3/reference/tickers/${symbol}?apikey=${POLYGON_API_KEY}`;
 
 const response = await fetch(url, {
 signal: AbortSignal.timeout(5000)
 });
 
 if (!response.ok) throw new Error(`HTTP ${response.status}`);
 return await response.json();
}

async function fetchRealtimeQuotes(symbol: string) {
 const url = `https://api.polygon.io/v2/last/trade/${symbol}?apikey=${POLYGON_API_KEY}`;
 
 const response = await fetch(url, {
 signal: AbortSignal.timeout(5000)
 });
 
 if (!response.ok) throw new Error(`HTTP ${response.status}`);
 return await response.json();
}

// Helper functions
function calculateDateRanges(period: string) {
 const end = new Date();
 const start = new Date();
 
 switch (period) {
 case '1d': start.setDate(end.getDate() - 1); break;
 case '5d': start.setDate(end.getDate() - 5); break;
 case '1m': start.setMonth(end.getMonth() - 1); break;
 case '3m': start.setMonth(end.getMonth() - 3); break;
 case '1y': start.setFullYear(end.getFullYear() - 1); break;
 case '5y': start.setFullYear(end.getFullYear() - 5); break;
 default: start.setFullYear(end.getFullYear() - 1);
 }

 const endStr = end.toISOString().split('T')[0];
 const startStr = start.toISOString().split('T')[0];
 
 // Different ranges for different data types
 const seasonalStart = new Date();
 seasonalStart.setFullYear(end.getFullYear() - 5); // Always 5 years for seasonal
 const seasonalStartStr = seasonalStart.toISOString().split('T')[0];

 return {
 historical: { start: startStr, end: endStr },
 seasonal: { start: seasonalStartStr, end: endStr }
 };
}

function parseTimeframe(timeframe: string) {
 const mapping: Record<string, { multiplier: number; timespan: string }> = {
 '1m': { multiplier: 1, timespan: 'minute' },
 '5m': { multiplier: 5, timespan: 'minute' },
 '15m': { multiplier: 15, timespan: 'minute' },
 '1h': { multiplier: 1, timespan: 'hour' },
 '1d': { multiplier: 1, timespan: 'day' },
 '1w': { multiplier: 1, timespan: 'week' }
 };
 
 return mapping[timeframe] || mapping['1d'];
}

function getNextExpirations(count: number): string[] {
 const expirations = [];
 const today = new Date();
 
 for (let i = 0; i < count * 4; i++) { // Check next month
 const date = new Date(today);
 date.setDate(today.getDate() + i);
 
 // Only Fridays (typical expiration day)
 if (date.getDay() === 5) {
 expirations.push(date.toISOString().split('T')[0]);
 if (expirations.length >= count) break;
 }
 }
 
 return expirations;
}

function processSeasonalPatterns(data: any, symbol: string) {
 // Implement your seasonal analysis logic here
 return {
 symbol,
 patterns: [],
 processed: true,
 dataPoints: data.results?.length || 0
 };
}

function calculateGEX(optionsData: any, symbol: string) {
 // Implement your GEX calculation logic here
 return {
 symbol,
 gex: 0,
 calculated: true
 };
}