import { NextResponse } from 'next/server';
import { IndustryAnalysisService } from '../../../lib/industryAnalysisService';

export async function GET() {
  try {
    console.log('🔄 SIMPLE TEST: Testing just a single timeframe...');
    
    // Test a single timeframe analysis
    const result = await IndustryAnalysisService.analyzeTimeframe(4, 'Life');
    
    console.log('✅ Single timeframe test completed successfully');
    console.log('📊 Result:', result);
    
    return NextResponse.json({
      success: true,
      timeframe: result.timeframe,
      industriesCount: result.industries.length,
      topBullish: result.industries.filter(i => i.trend === 'bullish').slice(0, 3),
      topBearish: result.industries.filter(i => i.trend === 'bearish').slice(0, 3),
      message: 'Single timeframe analysis working'
    });
  } catch (error) {
    console.error('❌ Single timeframe test failed:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      message: 'Single timeframe analysis failed'
    }, { status: 500 });
  }
}