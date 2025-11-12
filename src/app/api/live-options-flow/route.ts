import { NextRequest, NextResponse } from 'next/server';
import { OptionsFlowService, getSmartDateRange, isMarketOpen } from '@/lib/optionsFlowService';

// Configure runtime for long-running operations
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Handle preflight CORS requests
export async function OPTIONS() {
 return new NextResponse(null, {
 status: 200,
 headers: {
 'Access-Control-Allow-Origin': '*',
 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
 'Access-Control-Allow-Headers': 'Content-Type, Authorization',
 },
 });
}

export async function GET(request: NextRequest) {
 try {
 const searchParams = request.nextUrl.searchParams;
 const ticker = searchParams.get('ticker');
 const saveToDb = searchParams.get('saveToDb') === 'true';
 
 // Pagination parameters
 const page = parseInt(searchParams.get('page') || '1');
 const limit = parseInt(searchParams.get('limit') || '50');
 const offset = (page - 1) * limit;
 
 // Get smart date range for market hours handling
 const { currentDate, isLive } = getSmartDateRange();
 const marketStatus = isLive ? 'LIVE' : 'LAST_TRADING_DAY';
 
 const polygonApiKey = process.env.POLYGON_API_KEY;
 
 if (!polygonApiKey) {
 console.error(' POLYGON_API_KEY not configured');
 return NextResponse.json({
 success: false,
 error: 'POLYGON_API_KEY not configured',
 source: 'config_error'
 }, { status: 500 });
 }

 console.log(` LIVE OPTIONS FLOW API: Starting ${ticker || 'MARKET-WIDE SWEEP SCAN'}`);
 const startTime = Date.now();
 
 // Initialize the options flow service
 const optionsFlowService = new OptionsFlowService(polygonApiKey);
 
 // Add timeout protection to prevent hanging
 const fetchPromise = optionsFlowService.fetchLiveOptionsFlowUltraFast(ticker || undefined);
 const timeoutPromise = new Promise<never>((_, reject) => 
   setTimeout(() => reject(new Error('Request timeout after 4 minutes')), 240000)
 );
 
 const processedTrades = await Promise.race([fetchPromise, timeoutPromise]);
 
 const processingTime = Date.now() - startTime;
 
 // Database saving removed - no longer storing data in Prisma
 if (saveToDb && processedTrades.length > 0) {
   console.log('⚠️ Database saving disabled - saveToDb flag ignored');
 }

 // Calculate summary statistics
 const summary = {
 total_trades: processedTrades.length,
 total_premium: processedTrades.reduce((sum, trade) => sum + trade.total_premium, 0),
 unique_symbols: new Set(processedTrades.map(t => t.underlying_ticker)).size,
 trade_types: {
 BLOCK: processedTrades.filter(t => t.trade_type === 'BLOCK').length,
 SWEEP: processedTrades.filter(t => t.trade_type === 'SWEEP').length,
 'MULTI-LEG': processedTrades.filter(t => t.trade_type === 'MULTI-LEG').length,
 MINI: processedTrades.filter(t => t.trade_type === 'MINI').length
 },
 call_put_ratio: {
 calls: processedTrades.filter(t => t.type === 'call').length,
 puts: processedTrades.filter(t => t.type === 'put').length
 },
 processing_time_ms: processingTime
 };

 // Apply pagination to results
 const totalTrades = processedTrades.length;
 const paginatedTrades = processedTrades.slice(offset, offset + limit);
 const totalPages = Math.ceil(totalTrades / limit);
 const hasMore = page < totalPages;

 console.log(` OPTIONS FLOW SCAN COMPLETE:`, summary);
 console.log(` Pagination: Page ${page}/${totalPages}, showing ${paginatedTrades.length} of ${totalTrades} trades`);

 return NextResponse.json({
 success: true,
 timestamp: new Date().toISOString(),
 ticker,
 trades: paginatedTrades, // Use 'trades' for frontend compatibility
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
 market_open: isMarketOpen()
 }
 });

 } catch (error) {
 console.error(' Live options flow API error:', error);
 
 const errorMessage = error instanceof Error ? error.message : 'Unknown error';
 const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('Timeout');
 
 return NextResponse.json({
 success: false,
 error: isTimeout ? 'Request timed out - try a specific ticker instead of ALL' : 'Failed to fetch live options flow',
 details: errorMessage,
 suggestion: isTimeout ? 'Try filtering by a specific ticker (e.g., SPY, AAPL) to reduce processing time' : undefined
 }, { status: isTimeout ? 504 : 500 });
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
 }, { status: 400 });
 }

 // Database saving removed - POST endpoint disabled
 console.log('⚠️ Database saving disabled - trades not saved');

 return NextResponse.json({
 success: false,
 error: 'Database storage has been disabled',
 message: 'POST endpoint is no longer available'
 }, { status: 501 });

 } catch (error) {
 console.error(' Save trades API error:', error);
 return NextResponse.json({
 success: false,
 error: 'Failed to save trades',
 details: error instanceof Error ? error.message : 'Unknown error'
 }, { status: 500 });
 }
}