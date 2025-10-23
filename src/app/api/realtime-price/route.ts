import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

export async function GET(request: NextRequest) {
 const searchParams = request.nextUrl.searchParams;
 const symbol = searchParams.get('symbol');

 try {

 if (!symbol) {
 return NextResponse.json(
 { error: 'Missing required parameter: symbol' },
 { status: 400 }
 );
 }

 console.log(` REALTIME: Fetching LIVE price for ${symbol}`);

 // Get TODAY's actual date - September 26, 2025
 const today = new Date();
 const todayStr = today.toISOString().split('T')[0];
 
 console.log(` TODAY (CURRENT): ${todayStr}`);

 // FIRST TRY: GET MOST RECENT CLOSING PRICE (WORKS WHEN MARKET IS CLOSED)
 let url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apikey=${POLYGON_API_KEY}`;
 
 // Create abort controller for timeout
 const controller = new AbortController();
 const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
 
 let response = await fetch(url, { signal: controller.signal });
 clearTimeout(timeoutId);
 let data = await response.json();
 
 console.log(` PREVIOUS CLOSE DATA:`, data);

 if (data.status === 'OK' && data.results && data.results.length > 0) {
 const result = data.results[0];
 const closePrice = result.c; // Closing price
 const volume = result.v; // Volume
 const timestamp = result.t; // Timestamp
 console.log(` MOST RECENT CLOSE: $${closePrice} (Volume: ${volume.toLocaleString()})`);
 
 return NextResponse.json({
 symbol,
 price: closePrice,
 change: 0,
 timestamp: timestamp,
 date: new Date(timestamp).toISOString().split('T')[0],
 source: 'PREVIOUS-CLOSE',
 volume: volume
 });
 }

 // FALLBACK: TRY REAL-TIME LAST TRADE (FOR MARKET HOURS)
 url = `https://api.polygon.io/v2/last/trade/${symbol}?apikey=${POLYGON_API_KEY}`;
 
 const controller2 = new AbortController();
 const timeoutId2 = setTimeout(() => controller2.abort(), 5000);
 
 response = await fetch(url, { signal: controller2.signal });
 clearTimeout(timeoutId2);
 data = await response.json();
 
 console.log(` REAL-TIME LAST TRADE:`, data);

 if (data.status === 'OK' && data.results && data.results.p) {
 const livePrice = data.results.p; // Live trade price
 const timestamp = data.results.t; // Trade timestamp
 console.log(` LIVE TRADE PRICE: $${livePrice} at ${new Date(timestamp / 1000000).toISOString()}`);
 
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
 
 const controller3 = new AbortController();
 const timeoutId3 = setTimeout(() => controller3.abort(), 5000);
 
 response = await fetch(url, { signal: controller3.signal });
 clearTimeout(timeoutId3);
 data = await response.json();
 
 console.log(` REAL-TIME QUOTE:`, data);

 if (data.status === 'OK' && data.results && data.results.P) {
 const livePrice = (data.results.P + data.results.p) / 2; // Mid price
 const timestamp = data.results.T; // Quote timestamp
 console.log(` LIVE QUOTE PRICE: $${livePrice} at ${new Date(timestamp / 1000000).toISOString()}`);
 
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
 console.error(' Realtime price API error:', error);
 
 // Handle specific error types
 let errorMessage = 'Failed to fetch realtime price';
 let statusCode = 500;
 
 if (error instanceof Error) {
 if (error.name === 'AbortError') {
 errorMessage = 'Request timeout - please try again';
 statusCode = 408;
 } else if (error.message.includes('fetch')) {
 errorMessage = 'Network error - unable to connect to data provider';
 statusCode = 503;
 } else if (error.message.includes('API key') || error.message.includes('subscription')) {
 errorMessage = 'Invalid API configuration or subscription level';
 statusCode = 401;
 } else {
 errorMessage = error.message;
 }
 }
 
 return NextResponse.json(
 { 
 error: errorMessage,
 timestamp: new Date().toISOString(),
 symbol: symbol || 'unknown'
 },
 { status: statusCode }
 );
 }
}