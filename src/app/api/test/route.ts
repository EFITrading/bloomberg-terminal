import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const test = searchParams.get('test') || 'connectivity';
    
    console.log(`🔍 API Test: ${test}`);
    
    const result: any = {
      timestamp: new Date().toISOString(),
      server: 'Next.js',
      port: process.env.PORT || '3000',
      host: request.headers.get('host') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      test: test,
      status: 'OK'
    };
    
    if (test === 'historical-data') {
      // Test historical data endpoint internally
      try {
        const testUrl = new URL('/api/historical-data', request.url);
        testUrl.searchParams.set('symbol', 'SPY');
        testUrl.searchParams.set('startDate', '2025-10-01');
        testUrl.searchParams.set('endDate', '2025-10-08');
        
        const response = await fetch(testUrl.toString(), {
          headers: {
            'host': request.headers.get('host') || 'localhost:3000'
          }
        });
        
        result.test = 'historical-data';
        result.status = response.ok ? 'OK' : 'FAILED';
        result.historicalDataStatus = response.status;
        
        if (!response.ok) {
          const errorData = await response.json();
          result.error = errorData.error;
        }
      } catch (error) {
        result.status = 'FAILED';
        result.error = error instanceof Error ? error.message : 'Unknown error';
      }
    }
    
    if (test === 'realtime-price') {
      // Test realtime price endpoint internally
      try {
        const testUrl = new URL('/api/realtime-price', request.url);
        testUrl.searchParams.set('symbol', 'SPY');
        
        const response = await fetch(testUrl.toString(), {
          headers: {
            'host': request.headers.get('host') || 'localhost:3000'
          }
        });
        
        result.test = 'realtime-price';
        result.status = response.ok ? 'OK' : 'FAILED';
        result.realtimePriceStatus = response.status;
        
        if (!response.ok) {
          const errorData = await response.json();
          result.error = errorData.error;
        }
      } catch (error) {
        result.status = 'FAILED';
        result.error = error instanceof Error ? error.message : 'Unknown error';
      }
    }
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('❌ API Test error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to run API test',
        timestamp: new Date().toISOString(),
        status: 'FAILED'
      },
      { status: 500 }
    );
  }
}