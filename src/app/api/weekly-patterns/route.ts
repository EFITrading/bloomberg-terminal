import { NextRequest, NextResponse } from 'next/server';
import { getWeeklyPatterns } from '@/lib/polygonService';

export async function GET(request: NextRequest) {
 try {
 const searchParams = request.nextUrl.searchParams;
 const symbol = searchParams.get('symbol');

 if (!symbol) {
 return NextResponse.json(
 { success: false, error: 'Symbol parameter is required' },
 { status: 400 }
 );
 }

 const patterns = await getWeeklyPatterns(symbol);
 
 if (patterns.length === 0) {
 return NextResponse.json({
 success: false,
 error: 'No patterns found for symbol'
 });
 }
 
 const pattern = patterns[0];
 
 // Transform the data to match the component's expected structure
 const transformedPattern = {
 symbol: pattern.symbol,
 name: pattern.companyName,
 type: 'SECTOR' as const,
 currentWeek: {
 dateRange: 'Current Week',
 pattern: pattern.pattern === 'bullish' ? 'Bullish' as const : 
 pattern.pattern === 'bearish' ? 'Bearish' as const : 'Neutral' as const,
 strength: pattern.avgReturn,
 confidence: parseInt(pattern.confidence.replace('%', ''))
 },
 nextWeek: {
 dateRange: 'Next Week', 
 pattern: 'Neutral' as const,
 strength: 0,
 confidence: 50
 },
 week3: {
 dateRange: 'Week 3',
 pattern: 'Neutral' as const,
 strength: 0,
 confidence: 50 
 },
 week4: {
 dateRange: 'Week 4',
 pattern: 'Neutral' as const,
 strength: 0,
 confidence: 50
 },
 reliability: parseInt(pattern.confidence.replace('%', ''))
 };
 
 return NextResponse.json({
 success: true,
 data: transformedPattern
 });

 } catch (error) {
 console.error('Weekly patterns API error:', error);
 return NextResponse.json(
 { success: false, error: 'Failed to fetch weekly patterns' },
 { status: 500 }
 );
 }
}
