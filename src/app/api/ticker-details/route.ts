import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

export async function GET(request: NextRequest) {
 try {
 const searchParams = request.nextUrl.searchParams;
 const symbol = searchParams.get('symbol');

 if (!symbol) {
 return NextResponse.json(
 { error: 'Missing required parameter: symbol' },
 { status: 400 }
 );
 }

 console.log(` Fetching ticker details for ${symbol}`);

 // Make request to Polygon.io API
 const url = `https://api.polygon.io/v3/reference/tickers/${symbol}?apikey=${POLYGON_API_KEY}`;
 
 const response = await fetch(url, {
 method: 'GET',
 headers: {
 'Accept': 'application/json',
 'Connection': 'keep-alive',
 'Cache-Control': 'no-cache'
 },
 });

 if (!response.ok) {
 if (response.status === 401) {
 throw new Error('Invalid API key. Please check your Polygon.io API key.');
 } else if (response.status === 429) {
 throw new Error('Rate limit exceeded. Please wait before making more requests.');
 } else if (response.status === 403) {
 throw new Error('Access forbidden. Your API key may not have permission to access this data.');
 } else if (response.status === 404) {
 throw new Error(`Ticker ${symbol} not found.`);
 } else {
 throw new Error(`Polygon.io API error: ${response.status} ${response.statusText}`);
 }
 }

 const data = await response.json();
 
 if (data.status === 'ERROR') {
 throw new Error(data.error || 'Unknown error from Polygon.io API');
 }

 console.log(` Successfully fetched ticker details for ${symbol}`);
 
 return NextResponse.json(data);

 } catch (error) {
 console.error(' Ticker details API error:', error);
 return NextResponse.json(
 { 
 error: error instanceof Error ? error.message : 'Failed to fetch ticker details',
 timestamp: new Date().toISOString()
 },
 { status: 500 }
 );
 }
}
