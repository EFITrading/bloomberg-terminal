import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
 const { searchParams } = new URL(request.url);
 const ticker = searchParams.get('ticker') || 'SPY';
 const days = parseInt(searchParams.get('days') || '250');
 
 try {
 const apiKey = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
 
 console.log(`Fetching REAL implied volatility for ${ticker}...`);
 
 // Get current options snapshot with real IV data
 const optionsUrl = `https://api.polygon.io/v3/snapshot/options/${ticker}?limit=250&apikey=${apiKey}`;
 
 console.log(`Fetching: ${optionsUrl}`);
 
 const response = await fetch(optionsUrl);
 if (!response.ok) {
 throw new Error(`Options API failed: ${response.status} ${response.statusText}`);
 }
 
 const data = await response.json();
 console.log(`API Response:`, data);
 
 if (!data.results || data.results.length === 0) {
 throw new Error(`No options found for ${ticker}`);
 }
 
 // Extract real implied volatility from options
 const optionsWithIV = data.results.filter((opt: any) => 
 opt.implied_volatility && 
 opt.implied_volatility > 0.01 && 
 opt.implied_volatility < 5.0
 );
 
 if (optionsWithIV.length === 0) {
 throw new Error(`No valid IV data found in ${data.results.length} options for ${ticker}`);
 }
 
 // Calculate average current IV
 const avgIV = optionsWithIV.reduce((sum: number, opt: any) => sum + opt.implied_volatility, 0) / optionsWithIV.length;
 const currentIVPercent = avgIV * 100;
 
 console.log(`Found ${optionsWithIV.length} options with IV for ${ticker}`);
 console.log(`Current average IV: ${currentIVPercent.toFixed(2)}%`);
 console.log(`Sample IVs: ${optionsWithIV.slice(0, 5).map((opt: any) => (opt.implied_volatility * 100).toFixed(1) + '%').join(', ')}`);
 
 // Return current IV data
 const today = new Date();
 const historicalData = [{
 date: today.toISOString().split('T')[0],
 iv30: Number(currentIVPercent.toFixed(2)),
 timestamp: today.getTime()
 }];

 return NextResponse.json({
 success: true,
 data: historicalData,
 metadata: {
 ticker,
 currentRealIV: currentIVPercent,
 optionsAnalyzed: data.results.length,
 validIVOptions: optionsWithIV.length,
 dataPoints: historicalData.length,
 note: `Real ${ticker} current implied volatility from ${optionsWithIV.length} options contracts - no historical data generated`
 }
 });
 
 } catch (error) {
 console.error(`Error getting IV for ${ticker}:`, error);
 return NextResponse.json({
 success: false,
 error: error instanceof Error ? error.message : 'Unknown error',
 data: []
 }, { status: 500 });
 }
}
