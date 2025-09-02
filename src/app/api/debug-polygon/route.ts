import { NextResponse } from 'next/server';
import PolygonService from '@/lib/polygonService';

export async function GET() {
  try {
    console.log('🔍 Testing SP500 seasonal analysis...');
    
    const polygonService = new PolygonService();
    
    // Test the exact same call that's failing
    console.log('📊 Testing getMarketPatterns for SP500 with 5 years...');
    const patterns = await polygonService.getMarketPatterns('SP500', 5);
    
    console.log(`✅ Success! Found ${patterns.length} patterns`);
    
    return NextResponse.json({
      success: true,
      patternsFound: patterns.length,
      samplePatterns: patterns.slice(0, 3).map(p => ({
        symbol: p.symbol,
        return: p.averageReturn,
        period: p.period
      }))
    });
    
  } catch (error) {
    console.error('❌ SP500 Analysis Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}
