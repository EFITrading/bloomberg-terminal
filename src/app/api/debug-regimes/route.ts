import { NextRequest, NextResponse } from 'next/server';
import { IndustryAnalysisService } from '@/lib/industryAnalysisService';

export async function GET(request: NextRequest) {
 
 try {
 // Test the market regime service directly
 const regimeData = await IndustryAnalysisService.getMarketRegimeDataStreaming();
 
 console.log(' DEBUG ENDPOINT: Market regime data received:', {
 hasData: !!regimeData,
 dataKeys: regimeData ? Object.keys(regimeData) : [],
 totalRegimes: regimeData ? Object.keys(regimeData).length : 0
 });

 return NextResponse.json({
 success: true,
 message: 'Market Regimes Debug Test',
 timestamp: new Date().toISOString(),
 data: regimeData,
 debug: {
 hasData: !!regimeData,
 dataKeys: regimeData ? Object.keys(regimeData) : [],
 totalRegimes: regimeData ? Object.keys(regimeData).length : 0,
 sampleRegime: regimeData ? Object.values(regimeData)[0] : null
 }
 });

 } catch (error) {
 
 return NextResponse.json({
 success: false,
 error: error instanceof Error ? error.message : 'Unknown error',
 timestamp: new Date().toISOString(),
 stack: error instanceof Error ? error.stack : undefined
 }, { status: 500 });
 }
}