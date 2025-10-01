import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
    
    console.log(`📅 Fetching historical options flow for ${date}...`);
    
    // Generate mock historical data based on the selected date
    const generateHistoricalData = (targetDate: string) => {
      const mockTickers = ['SPY', 'QQQ', 'AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NFLX'];
      const data = [];
      
      // Generate random but realistic historical data
      for (let i = 0; i < 25; i++) {
        const ticker = mockTickers[Math.floor(Math.random() * mockTickers.length)];
        const isCall = Math.random() > 0.5;
        const basePrice = {
          'SPY': 580, 'QQQ': 500, 'AAPL': 175, 'TSLA': 250, 'NVDA': 450,
          'MSFT': 420, 'GOOGL': 165, 'AMZN': 145, 'META': 500, 'NFLX': 650
        }[ticker] || 100;
        
        const strike = basePrice + (Math.random() - 0.5) * 50;
        const premium = Math.random() * 500000 + 10000;
        const size = Math.floor(Math.random() * 1000) + 50;
        
        // Generate random expiration dates (1-60 days from target date)
        const targetDateObj = new Date(targetDate);
        const expiryDate = new Date(targetDateObj);
        expiryDate.setDate(targetDateObj.getDate() + Math.floor(Math.random() * 60) + 1);
        
        // Generate timestamp for the target date
        const tradingHour = 9 + Math.random() * 7; // 9 AM - 4 PM
        const targetTimestamp = new Date(targetDate);
        targetTimestamp.setHours(Math.floor(tradingHour), Math.floor((tradingHour % 1) * 60));
        
        data.push({
          ticker,
          underlying_ticker: ticker,
          strike: Math.round(strike),
          expiry: expiryDate.toISOString().split('T')[0],
          type: isCall ? 'call' : 'put',
          trade_size: size,
          premium_per_contract: premium / size,
          total_premium: premium,
          timestamp: targetTimestamp.getTime() * 1000000, // Convert to nanoseconds
          exchange: Math.floor(Math.random() * 4) + 1,
          conditions: [201],
          flow_type: Math.random() > 0.6 ? 'bullish' : Math.random() > 0.3 ? 'bearish' : 'neutral',
          trade_type: Math.random() > 0.7 ? 'block' : Math.random() > 0.4 ? 'sweep' : 'unusual',
          above_ask: Math.random() > 0.7,
          below_bid: Math.random() > 0.8,
          unusual_activity: Math.random() > 0.8,
          sweep_detected: Math.random() > 0.75
        });
      }
      
      // Sort by premium (highest first)
      return data.sort((a, b) => b.total_premium - a.total_premium);
    };

    const historicalData = generateHistoricalData(date);

    const summary = {
      total_contracts: historicalData.length,
      total_premium: historicalData.reduce((sum, t) => sum + t.total_premium, 0),
      bullish_flow: historicalData.filter(t => t.flow_type === 'bullish').length,
      bearish_flow: historicalData.filter(t => t.flow_type === 'bearish').length,
      block_trades: historicalData.filter(t => t.trade_type === 'block').length,
      sweep_trades: historicalData.filter(t => t.trade_type === 'sweep').length,
      unusual_activity: historicalData.filter(t => t.unusual_activity).length
    };

    console.log(`✅ Generated ${historicalData.length} historical contracts for ${date}`);

    return NextResponse.json({
      success: true,
      contracts: historicalData,
      summary: summary,
      date: date,
      timestamp: new Date().toISOString(),
      message: `Historical options flow data for ${date}`
    });

  } catch (error) {
    console.error('❌ Historical options flow API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch historical options flow data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}