import { NextRequest, NextResponse } from 'next/server';
import { OptionsFlowService, getSmartDateRange, isMarketOpen } from '@/lib/optionsFlowService';
import { createErrorResponse, displayError } from '@/lib/errorHandling';

// CORS headers
const corsHeaders = {
 'Access-Control-Allow-Origin': '*',
 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
 'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Handle preflight CORS requests
export async function OPTIONS() {
 return new NextResponse(null, {
 status: 200,
 headers: corsHeaders,
 });
}

export async function GET(request: NextRequest) {
 try {
 const searchParams = request.nextUrl.searchParams;
 const ticker = searchParams.get('ticker') || searchParams.get('symbol'); // Support both parameter names
 const saveToDb = searchParams.get('saveToDb') === 'true';
 
 // Pagination parameters
 const page = parseInt(searchParams.get('page') || '1');
 const limit = parseInt(searchParams.get('limit') || '50');
 const offset = (page - 1) * limit;
 
 // Get smart date range for market hours handling
 const { currentDate, isLive, startTimestamp, endTimestamp } = getSmartDateRange();
 const marketStatus = isLive ? 'LIVE_MARKET' : 'HISTORICAL_SESSION';
 
 const polygonApiKey = process.env.POLYGON_API_KEY;
 
 if (!polygonApiKey) {
 console.error(' POLYGON_API_KEY not configured');
 return NextResponse.json({
 success: false,
 error: 'POLYGON_API_KEY not configured',
 source: 'config_error'
 }, { 
 status: 500,
 headers: corsHeaders
 });
 }

 console.log(` OPTIONS FLOW API: Starting ${ticker || 'MARKET-WIDE'} scan (Page ${page})`);
 const startTime = Date.now();
 
 // Initialize the options flow service
 const optionsFlowService = new OptionsFlowService(polygonApiKey);
 
 const processedTrades = await optionsFlowService.fetchLiveOptionsFlowUltraFast(ticker || undefined);
 
 const processingTime = Date.now() - startTime;
 
 // Apply pagination to results
 const totalTrades = processedTrades.length;
 const paginatedTrades = processedTrades.slice(offset, offset + limit);
 const totalPages = Math.ceil(totalTrades / limit);
 const hasMore = page < totalPages;

 // Save to database if requested
 if (saveToDb && processedTrades.length > 0) {
 try {
 const { saveOptionsFlow } = await import('@/lib/database');
 await saveOptionsFlow(processedTrades.map(trade => ({
 ticker: trade.ticker,
 underlying_ticker: trade.underlying_ticker,
 strike: trade.strike,
 expiry: trade.expiry,
 type: trade.type,
 trade_size: trade.trade_size,
 premium_per_contract: trade.premium_per_contract,
 total_premium: trade.total_premium,
 flow_type: null, // Will be determined by analysis
 trade_type: trade.trade_type,
 above_ask: false, // Would need bid/ask data
 below_bid: false,
 exchange: trade.exchange,
 conditions: trade.conditions,
 timestamp: trade.trade_timestamp.getTime(),
 spot_price: trade.spot_price,
 sip_timestamp: trade.sip_timestamp,
 sequence_number: trade.sequence_number,
 window_group: trade.window_group,
 related_trades: trade.related_trades,
 moneyness: trade.moneyness,
 days_to_expiry: trade.days_to_expiry,
 exchange_name: trade.exchange_name
 })));
 
 console.log(` Saved ${processedTrades.length} trades to database`);
 } catch (error) {
 console.error(' Database save error:', error);
 }
 }

 // Calculate summary statistics
 const summary = {
 total_trades: totalTrades,
 total_premium: processedTrades.reduce((sum, trade) => sum + trade.total_premium, 0),
 unique_symbols: new Set(processedTrades.map(t => t.underlying_ticker)).size,
 trade_types: {
 SWEEP: processedTrades.filter(t => t.trade_type === 'SWEEP').length,
 BLOCK: processedTrades.filter(t => t.trade_type === 'BLOCK').length,
 MINI: processedTrades.filter(t => t.trade_type === 'MINI').length,
 'MULTI-LEG': processedTrades.filter(t => t.trade_type === 'MULTI-LEG').length
 },
 call_put_ratio: {
 calls: processedTrades.filter(t => t.type === 'call').length,
 puts: processedTrades.filter(t => t.type === 'put').length
 },
 processing_time_ms: processingTime
 };

 console.log(` OPTIONS FLOW SCAN COMPLETE:`, summary);
 console.log(` Pagination: Page ${page}/${totalPages}, showing ${paginatedTrades.length} of ${totalTrades} trades`);

 return NextResponse.json({
 success: true,
 timestamp: new Date().toISOString(),
 ticker,
 data: paginatedTrades, // Use 'data' for consistency with frontend expectations
 pagination: {
 page,
 limit,
 total: totalTrades,
 totalPages,
 hasMore,
 showing: paginatedTrades.length
 },
 summary,
 saved_to_db: saveToDb,
 market_info: {
 status: marketStatus,
 is_live: isLive,
 data_date: currentDate,
 market_open: isMarketOpen(),
 scan_period: {
 start: new Date(startTimestamp).toLocaleString('en-US', {timeZone: 'America/New_York'}),
 end: new Date(endTimestamp).toLocaleString('en-US', {timeZone: 'America/New_York'}),
 start_timestamp: startTimestamp,
 end_timestamp: endTimestamp,
 timezone: 'America/New_York'
 }
 }
 }, {
 headers: corsHeaders
 });

 } catch (error) {
 // Display user-friendly error
 displayError(error instanceof Error ? error : new Error(String(error)), 'Options Flow API');
 
 // Create user-friendly error response
 const errorResponse = createErrorResponse(
 error instanceof Error ? error : new Error(String(error)), 
 'Options Flow API'
 );

 // Return proper error response without fallback data
 return NextResponse.json(errorResponse, { 
 status: errorResponse.severity === 'error' ? 500 : 503,
 headers: corsHeaders
 });
 }
}

export async function POST(request: NextRequest) {
 try {
 const body = await request.json();
 const { trades } = body;
 
 if (!trades || !Array.isArray(trades)) {
 return NextResponse.json({
 success: false,
 error: 'Invalid trades data'
 }, { 
 status: 400,
 headers: corsHeaders
 });
 }

 // Save trades to database
 const { saveOptionsFlow } = await import('@/lib/database');
 const saved = await saveOptionsFlow(trades);
 
 console.log(` SAVED ${saved.count} trades to database via POST`);

 return NextResponse.json({
 success: true,
 saved_count: saved.count,
 timestamp: new Date().toISOString()
 }, {
 headers: corsHeaders
 });

 } catch (error) {
 console.error(' Save trades API error:', error);
 return NextResponse.json({
 success: false,
 error: 'Failed to save trades',
 details: error instanceof Error ? error.message : 'Unknown error'
 }, { 
 status: 500,
 headers: corsHeaders
 });
 }
}