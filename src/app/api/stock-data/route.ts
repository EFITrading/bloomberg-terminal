import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

interface PolygonBar {
 v: number; // volume
 vw: number; // volume weighted average price
 o: number; // open
 c: number; // close
 h: number; // high
 l: number; // low
 t: number; // timestamp
 n: number; // number of transactions
}

interface PolygonAggregateResponse {
 ticker: string;
 queryCount: number;
 resultsCount: number;
 adjusted: boolean;
 results: PolygonBar[];
 status: string;
 request_id: string;
 count: number;
}

interface PolygonQuote {
 P: number; // bid price
 p: number; // ask price
 S: number; // bid size
 s: number; // ask size
 t: number; // timestamp
}

interface ChartDataPoint {
 timestamp: number;
 open: number;
 high: number;
 low: number;
 close: number;
 volume: number;
 date: string;
 time: string;
}

export async function GET(request: NextRequest) {
 try {
 const { searchParams } = new URL(request.url);
 const symbol = searchParams.get('symbol') || 'AAPL';
 const timeframe = searchParams.get('timeframe') || '1h';
 const lookbackDays = parseInt(searchParams.get('lookbackDays') || '365');
 
 console.log(` Fetching data for ${symbol}, timeframe: ${timeframe}, lookbackDays: ${lookbackDays}`);
 
 // USE CURRENT LIVE DATES ONLY - NO HARDCODED OLD DATES
 const endDate = new Date();
 const startDate = new Date();
 
 // Set proper lookback without artificial 1-year limit
 // Respect the 20-year limit for weekly/monthly data
 const maxLookbackDays = Math.min(lookbackDays, 7300); // 20 years maximum
 startDate.setDate(endDate.getDate() - maxLookbackDays);
 
 console.log(` LIVE Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]} (${maxLookbackDays} days)`);
 
 // Convert timeframe to Polygon API format
 let multiplier = 1;
 let timespan = 'minute';
 
 switch (timeframe) {
 case '1m':
 multiplier = 1;
 timespan = 'minute';
 break;
 case '5m':
 multiplier = 5;
 timespan = 'minute';
 break;
 case '15m':
 multiplier = 15;
 timespan = 'minute';
 break;
 case '30m':
 multiplier = 30;
 timespan = 'minute';
 break;
 case '1h':
 multiplier = 1;
 timespan = 'hour';
 break;
 case '4h':
 multiplier = 4;
 timespan = 'hour';
 break;
 case '1d': // Added lowercase 'd' for daily
 case '1D':
 multiplier = 1;
 timespan = 'day';
 break;
 case '1w': // Added lowercase 'w' for weekly 
 case '1W':
 multiplier = 1;
 timespan = 'week';
 break;
 case '1mo': // Added month timeframe support
 case '1M':
 multiplier = 1;
 timespan = 'month';
 break;
 default:
 multiplier = 1;
 timespan = 'hour';
 }
 
 const startDateStr = startDate.toISOString().split('T')[0];
 const endDateStr = endDate.toISOString().split('T')[0];
 
 // Fetch historical data with explicit recent date range
 // Use sort=desc to get MOST RECENT data first, avoiding limit cutoff issues
 const aggregatesUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${startDateStr}/${endDateStr}?adjusted=true&sort=desc&limit=50000&apikey=${POLYGON_API_KEY}`;
 
 console.log(' Fetching aggregates from:', aggregatesUrl.replace(POLYGON_API_KEY, '[API_KEY]'));
 
 const aggregatesResponse = await fetch(aggregatesUrl);
 
 if (!aggregatesResponse.ok) {
 const errorText = await aggregatesResponse.text();
 console.error(' Polygon Aggregates API Error:', aggregatesResponse.status, errorText);
 
 return NextResponse.json({
 error: 'Failed to fetch live data from Polygon',
 status: aggregatesResponse.status,
 details: errorText
 }, { status: aggregatesResponse.status });
 }
 
 const aggregatesData: PolygonAggregateResponse = await aggregatesResponse.json();
 
 if (!aggregatesData.results || aggregatesData.results.length === 0) {
 console.error(` NO LIVE DATA for ${symbol} - timeframe: ${timeframe}, period: ${startDateStr} to ${endDateStr}`);
 
 return NextResponse.json({
 error: 'No live data available from Polygon',
 symbol,
 timeframe,
 lookbackDays,
 details: 'No current trading data found. API returned empty results.'
 }, { status: 404 });
 }
 
 // Convert to chart format
 const chartData: ChartDataPoint[] = aggregatesData.results.map((bar: PolygonBar) => {
 const date = new Date(bar.t);
 return {
 timestamp: bar.t,
 open: bar.o,
 high: bar.h,
 low: bar.l,
 close: bar.c,
 volume: bar.v,
 date: date.toISOString().split('T')[0],
 time: date.toLocaleTimeString()
 };
 }).reverse(); // Reverse since we got desc data but chart needs asc order

 // Debug: Show latest data points for this timeframe
 if (chartData.length > 0) {
 const latest = chartData[chartData.length - 1];
 const previous = chartData.length > 1 ? chartData[chartData.length - 2] : null;
 console.log(` ${symbol} ${timeframe.toUpperCase()} - Latest bar: $${latest.close.toFixed(2)} (${latest.date} ${latest.time})`);
 if (previous) {
 console.log(` ${symbol} ${timeframe.toUpperCase()} - Previous bar: $${previous.close.toFixed(2)} (${previous.date} ${previous.time})`);
 }
 }

 // Get latest prices
 const prices = chartData.map(d => d.close);
 let currentPrice = prices[prices.length - 1]; // Default to last available price from chart data

 // Get latest quote for real-time price (only use if markets are open)
 let latestQuote = null;
 let useLatestQuote = false;
 
 try {
 const quoteUrl = `https://api.polygon.io/v2/last/trade/${symbol}?apikey=${POLYGON_API_KEY}`;
 const quoteResponse = await fetch(quoteUrl);
 
 if (quoteResponse.ok) {
 const quoteData = await quoteResponse.json();
 if (quoteData.results?.p) {
 latestQuote = {
 price: quoteData.results.p,
 timestamp: quoteData.results.t || Date.now(),
 volume: quoteData.results.s || 0
 };
 
 // Check if the quote is recent (within last 30 minutes of trading)
 const quoteTime = new Date(quoteData.results.t);
 const now = new Date();
 const timeDiff = now.getTime() - quoteTime.getTime();
 const minutesDiff = timeDiff / (1000 * 60);
 
 // Only use latest quote if it's recent (markets likely open)
 if (minutesDiff < 30) {
 currentPrice = quoteData.results.p;
 useLatestQuote = true;
 console.log(` Using LIVE quote for ${symbol}: $${currentPrice.toFixed(2)} (${minutesDiff.toFixed(1)} mins old)`);
 } else {
 console.log(` Markets closed - using last chart price for ${symbol}: $${currentPrice.toFixed(2)} (quote ${minutesDiff.toFixed(1)} mins old)`);
 }
 }
 }
 } catch (error) {
 console.warn('Failed to fetch latest quote:', error);
 }

 // Simple live price calculation - no weekend/market closed fallbacks
 let priceChange = 0;
 let priceChangePercent = 0;

 // Calculate change based on last candle's close vs previous candle
 if (chartData.length >= 2) {
 const previousPrice = chartData[chartData.length - 2].close;
 priceChange = currentPrice - previousPrice;
 priceChangePercent = ((priceChange / previousPrice) * 100);
 console.log(`� ${symbol} LIVE Price: $${currentPrice.toFixed(2)}, Change: ${priceChangePercent.toFixed(2)}% vs prev candle: $${previousPrice.toFixed(2)}`);
 } else if (chartData.length === 1) {
 // Single candle - compare current price to candle's open
 const openPrice = chartData[0].open;
 priceChange = currentPrice - openPrice;
 priceChangePercent = ((priceChange / openPrice) * 100);
 console.log(` ${symbol} LIVE Price: $${currentPrice.toFixed(2)}, Change: ${priceChangePercent.toFixed(2)}% vs open: $${openPrice.toFixed(2)}`);
 }
 
 const high24h = Math.max(...chartData.slice(-24).map(d => d.high));
 const low24h = Math.min(...chartData.slice(-24).map(d => d.low));
 const volume24h = chartData.slice(-24).reduce((sum, d) => sum + d.volume, 0);
 
 const response = {
 symbol,
 timeframe,
 lookbackDays,
 data: chartData,
 meta: {
 count: chartData.length,
 currentPrice,
 priceChange,
 priceChangePercent,
 high24h,
 low24h,
 volume24h,
 latestQuote,
 dataRange: {
 start: startDateStr,
 end: endDateStr
 },
 lastUpdated: new Date().toISOString()
 }
 };
 
 console.log(`Successfully fetched ${chartData.length} data points for ${symbol}`);
 
 return NextResponse.json(response);
 
 } catch (error) {
 console.error('Stock Data API Error:', error);
 return NextResponse.json({
 error: 'Failed to fetch stock data',
 details: error instanceof Error ? error.message : 'Unknown error'
 }, { status: 500 });
 }
}

export async function POST(request: NextRequest) {
 try {
 const body = await request.json();
 const { symbols } = body;
 
 if (!symbols || !Array.isArray(symbols)) {
 return NextResponse.json({
 error: 'Invalid request: symbols array required'
 }, { status: 400 });
 }
 
 // Fetch multiple symbols at once
 const promises = symbols.map(async (symbol: string) => {
 try {
 const quoteUrl = `https://api.polygon.io/v2/last/trade/${symbol}?apikey=${POLYGON_API_KEY}`;
 const response = await fetch(quoteUrl);
 
 if (response.ok) {
 const data = await response.json();
 return {
 symbol,
 price: data.results?.p || 0,
 timestamp: data.results?.t || Date.now(),
 volume: data.results?.s || 0
 };
 }
 return { symbol, error: 'Failed to fetch' };
 } catch (error) {
 return { symbol, error: error instanceof Error ? error.message : 'Unknown error' };
 }
 });
 
 const results = await Promise.all(promises);
 
 return NextResponse.json({
 quotes: results,
 timestamp: Date.now()
 });
 
 } catch (error) {
 console.error('Batch Stock Data API Error:', error);
 return NextResponse.json({
 error: 'Failed to fetch batch stock data',
 details: error instanceof Error ? error.message : 'Unknown error'
 }, { status: 500 });
 }
}
