import { NextRequest, NextResponse } from 'next/server';
import PolygonService from '@/lib/polygonService';

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Starting Polygon service debug...');
    
    const polygonService = new PolygonService();
    
    console.log('✅ PolygonService instantiated successfully');
    
    const patterns = await polygonService.getMarketPatterns('SP500', 15);
    
    console.log(`✅ Retrieved ${patterns.length} patterns`);
    
    return NextResponse.json({
      success: true,
      patterns: patterns.slice(0, 3), // Return first 3 for debugging
      totalPatterns: patterns.length,
      message: 'Polygon service is working correctly'
    });
    
  } catch (error) {
    console.error('Debug Polygon API Error:', error);
    return NextResponse.json({
      error: 'Failed to debug Polygon API',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
