import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  console.log('🧪 OPTIONS FLOW SIMPLE TEST API CALLED');
  
  try {
    const startTime = Date.now();
    
    // Simple test data
    const testData = [
      {
        ticker: 'AAPL251025C00225000',
        underlying_ticker: 'AAPL',
        strike: 225,
        expiry: '2025-10-25',
        type: 'call' as const,
        trade_size: 100,
        premium_per_contract: 5.50,
        total_premium: 55000,
        timestamp: Date.now(),
        exchange: 4,
        conditions: [],
        flow_type: 'bullish' as const,
        trade_type: 'block' as const,
        trade_intention: 'BUY_TO_OPEN' as const,
        unusual_activity: true
      }
    ];
    
    const processingTime = Date.now() - startTime;
    
    return NextResponse.json({
      success: true,
      data: testData,
      summary: {
        total_contracts: testData.length,
        total_premium: testData.reduce((sum, t) => sum + t.total_premium, 0),
        processing_time: processingTime
      },
      timestamp: new Date().toISOString(),
      scanner_type: 'SIMPLE_TEST',
      message: `✅ Simple test completed in ${processingTime}ms`
    });
    
  } catch (error) {
    console.error('❌ Simple test API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Simple test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}