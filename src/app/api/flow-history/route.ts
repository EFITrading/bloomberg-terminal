import { NextRequest, NextResponse } from 'next/server';
import { getHistoricalFlow, getFlowStats } from '@/lib/database';

interface TradeData {
 id: number;
 ticker: string;
 underlying_ticker: string;
 strike: number;
 expiry: string;
 type: string;
 trade_size: number;
 premium_per_contract: number;
 total_premium: number;
 flow_type: string;
 trade_type: string;
 above_ask: boolean;
 below_bid: boolean;
 trade_timestamp: Date;
 created_at: Date;
 conditions: string | null;
}

export async function GET(request: NextRequest) {
 try {
 const searchParams = request.nextUrl.searchParams;
 
 // Parse query parameters
 const symbol = searchParams.get('symbol');
 const startDate = searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined;
 const endDate = searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined;
 const minPremium = searchParams.get('minPremium') ? parseInt(searchParams.get('minPremium')!) : undefined;
 const tradeType = searchParams.get('tradeType') || undefined;
 const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 1000;
 const statsOnly = searchParams.get('statsOnly') === 'true';
 const days = searchParams.get('days') ? parseInt(searchParams.get('days')!) : 1;

 console.log(` HISTORICAL FLOW API: ${symbol ? `symbol=${symbol}` : 'all symbols'}, ${startDate ? `from=${startDate.toISOString().split('T')[0]}` : ''}${endDate ? ` to=${endDate.toISOString().split('T')[0]}` : ''}`);

 // Return only statistics if requested
 if (statsOnly) {
 const stats = await getFlowStats(days);
 return NextResponse.json({
 success: true,
 stats,
 period_days: days,
 timestamp: new Date().toISOString()
 });
 }

 // Get historical flow data
 console.log(` DATABASE QUERY: Fetching historical flow with filters:`, { symbol, startDate, endDate, minPremium, tradeType, limit });
 
 const historicalData = await getHistoricalFlow({
 symbol: symbol || undefined,
 startDate,
 endDate,
 minPremium,
 tradeType: tradeType || undefined,
 limit
 });
 
 console.log(` DATABASE RESULT: Retrieved ${historicalData.length} records from database`);

 // Format data for frontend consumption
 const formattedData = historicalData.map((trade: any) => ({
 id: trade.id,
 ticker: trade.ticker,
 underlying_ticker: trade.underlying_ticker,
 strike: trade.strike,
 expiry: trade.expiry,
 type: trade.type,
 trade_size: trade.trade_size,
 premium_per_contract: trade.premium_per_contract,
 total_premium: trade.total_premium,
 flow_type: trade.flow_type || '',
 trade_type: trade.trade_type,
 above_ask: trade.above_ask,
 below_bid: trade.below_bid,
 timestamp: trade.trade_timestamp.getTime(),
 stored_at: trade.created_at.toISOString(),
 conditions: trade.conditions ? JSON.parse(trade.conditions) : [],
 // Add display helpers
 premium_display: `$${(trade.total_premium / 1000).toFixed(0)}K`,
 strike_display: `$${trade.strike}`,
 size_display: `${trade.trade_size} contracts`
 }));

 // Get basic stats for the query
 const queryStats = {
 total_trades: formattedData.length,
 total_premium: formattedData.reduce((sum: number, trade: any) => sum + trade.total_premium, 0),
 avg_premium: formattedData.length > 0 ? formattedData.reduce((sum: number, trade: any) => sum + trade.total_premium, 0) / formattedData.length : 0,
 unique_symbols: [...new Set(formattedData.map((trade: any) => trade.underlying_ticker))].length,
 blocks: formattedData.filter((trade: any) => trade.trade_type === 'block').length,
 sweeps: formattedData.filter((trade: any) => trade.trade_type === 'sweep').length,
 calls: formattedData.filter((trade: any) => trade.type === 'call').length,
 puts: formattedData.filter((trade: any) => trade.type === 'put').length
 };

 console.log(` DATABASE QUERY: Found ${formattedData.length} historical trades (${queryStats.blocks} blocks, ${queryStats.sweeps} sweeps)`);

 return NextResponse.json({
 success: true,
 data: formattedData,
 stats: queryStats,
 filters: {
 symbol,
 startDate: startDate?.toISOString(),
 endDate: endDate?.toISOString(),
 minPremium,
 tradeType,
 limit
 },
 timestamp: new Date().toISOString(),
 message: `Retrieved ${formattedData.length} historical options flow trades from database`
 });

 } catch (error) {
 console.error(' Historical flow API error:', error);
 
 // More detailed error information
 const errorDetails = {
 message: error instanceof Error ? error.message : 'Unknown error',
 stack: error instanceof Error ? error.stack : undefined,
 timestamp: new Date().toISOString()
 };
 
 console.error(' Full error details:', errorDetails);
 
 return NextResponse.json({ 
 success: false, 
 error: 'Failed to fetch historical flow data',
 details: errorDetails.message,
 debug: process.env.NODE_ENV === 'development' ? errorDetails : undefined
 }, { status: 500 });
 }
}