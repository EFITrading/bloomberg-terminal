import { NextRequest, NextResponse } from 'next/server';
import SeasonalScreenerService from '@/lib/seasonalScreenerService_fixed';
import { createErrorResponse, displayError } from '@/lib/errorHandling';

// Rate limiting store
const rateLimiter = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(ip: string): boolean {
 const now = Date.now();
 const windowMs = 60000; // 1 minute
 const maxRequests = 15; // 15 requests per minute for seasonal data
 
 if (!rateLimiter.has(ip)) {
 rateLimiter.set(ip, { count: 1, resetTime: now + windowMs });
 return true;
 }
 
 const limit = rateLimiter.get(ip)!;
 if (now > limit.resetTime) {
 rateLimiter.set(ip, { count: 1, resetTime: now + windowMs });
 return true;
 }
 
 if (limit.count >= maxRequests) {
 return false;
 }
 
 limit.count++;
 return true;
}

function isDateWithinRange(dateStr: string, daysRange: number = 2): boolean {
 try {
 const today = new Date();
 const targetDate = new Date(dateStr);
 
 // Set both dates to same year for seasonal comparison
 targetDate.setFullYear(today.getFullYear());
 
 const diffTime = Math.abs(targetDate.getTime() - today.getTime());
 const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
 
 return diffDays <= daysRange;
 } catch {
 return false;
 }
}

function formatSeasonalPeriod(startDate: string, endDate: string): string {
 try {
 const start = new Date(startDate);
 const end = new Date(endDate);
 
 const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
 const startDay = start.getDate();
 const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
 const endDay = end.getDate();
 
 return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
 } catch {
 return 'Unknown period';
 }
}

export async function GET(request: NextRequest) {
 try {
 // Rate limiting
 const clientIP = request.headers.get('x-forwarded-for') || 
 request.headers.get('x-real-ip') || 
 'unknown';
 
 if (!checkRateLimit(clientIP)) {
 return NextResponse.json(
 { error: 'Too many requests' },
 { status: 429 }
 );
 }

 const { searchParams } = new URL(request.url);
 const symbol = searchParams.get('symbol')?.toUpperCase();
 const sentiment = searchParams.get('sentiment')?.toLowerCase(); // 'bullish', 'bearish', or null for both
 const years = parseInt(searchParams.get('years') || '15'); // FULL years - unlimited API
 const activeOnly = searchParams.get('active') === 'true'; // Filter for patterns starting soon
 const batchSize = parseInt(searchParams.get('batchSize') || '200'); // FULL batch size - unlimited API

 console.log(` Fetching seasonal patterns: symbol=${symbol}, sentiment=${sentiment}, activeOnly=${activeOnly}`);

 const screeningService = new SeasonalScreenerService();
 
 // Get seasonal opportunities
 const opportunities = await screeningService.screenSeasonalOpportunities(years, batchSize);
 
 let filteredOpportunities = opportunities;

 // Filter by symbol if specified
 if (symbol) {
 filteredOpportunities = filteredOpportunities.filter(opp => 
 opp.symbol.toUpperCase() === symbol
 );
 }

 // Filter by sentiment if specified
 if (sentiment) {
 filteredOpportunities = filteredOpportunities.filter(opp => 
 opp.sentiment.toLowerCase() === sentiment
 );
 }

 // Filter for active patterns (starting within 2 days) if requested
 if (activeOnly) {
 filteredOpportunities = filteredOpportunities.filter(opp => 
 isDateWithinRange(opp.startDate, 2)
 );
 }

 // Sort by average return (best opportunities first)
 filteredOpportunities.sort((a, b) => Math.abs(b.averageReturn) - Math.abs(a.averageReturn));

 // Format the response data
 const formattedData = filteredOpportunities.map(opp => ({
 symbol: opp.symbol,
 companyName: opp.companyName,
 sentiment: opp.sentiment,
 startDate: opp.startDate,
 endDate: opp.endDate,
 period: formatSeasonalPeriod(opp.startDate, opp.endDate),
 averageReturn: opp.averageReturn,
 winRate: opp.winRate,
 years: opp.years,
 confidence: opp.winRate > 70 ? 'High' : opp.winRate > 60 ? 'Medium' : 'Low',
 isActive: isDateWithinRange(opp.startDate, 2),
 daysUntilStart: Math.ceil((new Date(opp.startDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)),
 description: `${opp.sentiment} seasonal pattern with ${opp.averageReturn >= 0 ? '+' : ''}${opp.averageReturn.toFixed(1)}% average return over ${opp.years} years`,
 riskLevel: Math.abs(opp.averageReturn) > 15 ? 'High' : Math.abs(opp.averageReturn) > 8 ? 'Medium' : 'Low'
 }));

 // Create summary statistics
 const summary = {
 total: formattedData.length,
 bullish: formattedData.filter(p => p.sentiment.toLowerCase() === 'bullish').length,
 bearish: formattedData.filter(p => p.sentiment.toLowerCase() === 'bearish').length,
 active: formattedData.filter(p => p.isActive).length,
 highConfidence: formattedData.filter(p => p.confidence === 'High').length,
 averageReturn: formattedData.length > 0 ? 
 (formattedData.reduce((sum, p) => sum + p.averageReturn, 0) / formattedData.length).toFixed(2) : 0,
 bestOpportunity: formattedData.length > 0 ? formattedData[0] : null
 };

 // If specific symbol requested, return detailed info
 if (symbol && formattedData.length > 0) {
 const symbolData = formattedData[0];
 return NextResponse.json({
 symbol,
 data: symbolData,
 allPatterns: formattedData,
 summary: {
 patternsFound: formattedData.length,
 bullishPatterns: formattedData.filter(p => p.sentiment.toLowerCase() === 'bullish').length,
 bearishPatterns: formattedData.filter(p => p.sentiment.toLowerCase() === 'bearish').length,
 activePatterns: formattedData.filter(p => p.isActive).length
 },
 parameters: {
 years,
 sentiment,
 activeOnly,
 batchSize
 },
 lastUpdated: new Date().toISOString()
 });
 }

 // Return all filtered data
 return NextResponse.json({
 data: formattedData.slice(0, 20), // Limit to top 20 for performance
 summary,
 filters: {
 symbol,
 sentiment,
 activeOnly,
 years,
 batchSize
 },
 lastUpdated: new Date().toISOString(),
 message: formattedData.length === 0 ? 'No seasonal patterns found with the specified criteria' : 
 `Found ${formattedData.length} seasonal patterns`
 });

 } catch (error) {
 // Display user-friendly error
 displayError(error instanceof Error ? error : new Error(String(error)), 'Seasonal Patterns API');
 
 // Create user-friendly error response
 const errorResponse = createErrorResponse(
 error instanceof Error ? error : new Error(String(error)), 
 'Seasonal Patterns API'
 );

 // Return proper error response without fallback data
 return NextResponse.json(errorResponse, { 
 status: errorResponse.severity === 'error' ? 500 : 503
 });
 }
}
