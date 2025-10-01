import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    console.log('🧪 Testing options flow API...');
    
    // Return mock data to test the frontend
    const mockData = [
      {
        ticker: 'SPY',
        underlying_ticker: 'SPY',
        strike: 580,
        expiry: '2025-10-04',
        type: 'call',
        trade_size: 100,
        premium_per_contract: 2.50,
        total_premium: 25000,
        timestamp: Date.now() * 1000000,
        exchange: 1,
        conditions: [201],
        flow_type: 'bullish',
        trade_type: 'block',
        above_ask: true,
        unusual_activity: true
      },
      {
        ticker: 'QQQ',
        underlying_ticker: 'QQQ',
        strike: 500,
        expiry: '2025-10-11',
        type: 'put',
        trade_size: 500,
        premium_per_contract: 3.75,
        total_premium: 187500,
        timestamp: Date.now() * 1000000,
        exchange: 2,
        conditions: [201],
        flow_type: 'bearish',
        trade_type: 'sweep',
        below_bid: true,
        sweep_detected: true
      }
    ];

    const summary = {
      total_contracts: mockData.length,
      total_premium: mockData.reduce((sum, t) => sum + t.total_premium, 0),
      bullish_flow: mockData.filter(t => t.flow_type === 'bullish').length,
      bearish_flow: mockData.filter(t => t.flow_type === 'bearish').length,
      block_trades: mockData.filter(t => t.trade_type === 'block').length,
      sweep_trades: mockData.filter(t => t.trade_type === 'sweep').length,
      unusual_activity: mockData.filter(t => t.unusual_activity).length
    };

    console.log('✅ Mock data generated successfully');

    return NextResponse.json({
      success: true,
      contracts: mockData,
      summary: summary,
      timestamp: new Date().toISOString(),
      message: 'Mock options flow data for testing'
    });

  } catch (error) {
    console.error('❌ Test API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Test API failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}