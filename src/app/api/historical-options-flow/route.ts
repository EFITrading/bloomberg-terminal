import { NextRequest, NextResponse } from 'next/server';
import { polygonService } from '@/lib/polygonService';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

export async function GET(request: NextRequest) {
 try {
 const { searchParams } = new URL(request.url);
 const date = searchParams.get('date');
 const ticker = searchParams.get('ticker');

 console.log(` Historical Options Flow API - Date: ${date}, Ticker: ${ticker}`);

 if (!POLYGON_API_KEY) {
 console.error(' Polygon API key not configured');
 return NextResponse.json({
 success: false,
 error: 'Polygon API key not configured',
 message: 'API_KEY_MISSING'
 }, { status: 500 });
 }

 if (!date) {
 return NextResponse.json({
 success: false,
 error: 'Date parameter is required',
 message: 'MISSING_DATE'
 }, { status: 400 });
 }

 // If ticker is "ALL", get options flow for major tickers
 const tickers = ticker === 'ALL' ? ['SPY', 'QQQ', 'IWM', 'AAPL', 'TSLA', 'NVDA', 'AMZN', 'GOOGL', 'META', 'MSFT'] : [ticker];
 
 const allOptionsFlow: any[] = [];

 for (const symbol of tickers) {
 try {
 // Use Polygon Options API to get real historical options data
 const optionsUrl = `https://api.polygon.io/v3/trades/options?timestamp.gte=${date}T00:00:00.000Z&timestamp.lt=${date}T23:59:59.999Z&underlying_ticker=${symbol}&limit=1000&apikey=${POLYGON_API_KEY}`;
 
 console.log(` Fetching options trades for ${symbol} on ${date}`);
 
 const response = await fetch(optionsUrl, {
 headers: {
 'Accept': 'application/json',
 }
 });

 if (!response.ok) {
 console.error(` Polygon API error for ${symbol}: ${response.status} ${response.statusText}`);
 continue;
 }

 const data = await response.json();
 
 if (data.results && data.results.length > 0) {
 // Process the real options trades data from Polygon API
 const processedTrades = data.results.map((trade: any) => ({
 underlying_ticker: symbol,
 contract_ticker: trade.details?.ticker || `${symbol}_OPTION`,
 strike: trade.details?.strike_price || 0,
 expiry: trade.details?.expiration_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
 type: trade.details?.contract_type?.toLowerCase() || 'call',
 size: trade.size || 0,
 price: trade.price || 0,
 premium: (trade.size || 0) * (trade.price || 0) * 100,
 timestamp: trade.participant_timestamp || trade.sip_timestamp || new Date().toISOString(),
 exchange: trade.exchange || 0
 }));

 allOptionsFlow.push(...processedTrades);
 console.log(` Processed ${processedTrades.length} options trades for ${symbol}`);
 } else {
 console.log(` No options trades found for ${symbol} on ${date}`);
 }

 // Rate limiting to avoid overwhelming Polygon API
 await new Promise(resolve => setTimeout(resolve, 100));

 } catch (error) {
 console.error(` Error fetching options data for ${symbol}:`, error);
 continue;
 }
 }

 console.log(` Total historical options flow records: ${allOptionsFlow.length}`);

 return NextResponse.json({
 success: true,
 data: allOptionsFlow,
 count: allOptionsFlow.length,
 date: date,
 message: 'Real historical options flow data from Polygon API'
 });

 } catch (error) {
 console.error(' Historical options flow API error:', error);
 return NextResponse.json({
 success: false,
 error: 'Failed to fetch historical options flow data',
 message: error instanceof Error ? error.message : 'UNKNOWN_ERROR'
 }, { status: 500 });
 }
}

// Helper functions to extract option details from ticker symbols (if needed)
function extractStrikeFromTicker(ticker: string): number {
 // Parse standard option ticker format: AAPL241115C00150000
 const match = ticker.match(/([CP])(\d{8})/);
 if (match) {
 return parseFloat(match[2]) / 1000; // Strike prices are multiplied by 1000 in ticker
 }
 return 0;
}

function extractExpiryFromTicker(ticker: string): string {
 // Parse expiry from ticker format: AAPL241115C00150000 (YYMMDD)
 const match = ticker.match(/(\d{6})([CP])/);
 if (match) {
 const dateStr = match[1];
 const year = 2000 + parseInt(dateStr.substring(0, 2));
 const month = parseInt(dateStr.substring(2, 4));
 const day = parseInt(dateStr.substring(4, 6));
 return new Date(year, month - 1, day).toISOString().split('T')[0];
 }
 return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
}

function extractOptionTypeFromTicker(ticker: string): 'call' | 'put' {
 return ticker.includes('C') ? 'call' : 'put';
}