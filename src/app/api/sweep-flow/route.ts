import { NextRequest, NextResponse } from 'next/server';
import { OptionsFlowService } from '../../../lib/optionsFlowService';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker');
    
    console.log(`🔍 Scanning for ${ticker} sweeps...`);

    const apiKey = process.env.POLYGON_API_KEY || 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
    const optionsFlowService = new OptionsFlowService(apiKey);
    
    const sweepTrades = await optionsFlowService.fetchLiveOptionsFlowUltraFast(ticker || undefined);
    
    console.log(`🌊 Found ${sweepTrades.length} sweep trades for ${ticker}`);

    // Format response to match your requirements:
    // Symbol, Type, Strike, Size, Stock Price, Premium, Trade Type, Time
    const formattedTrades = sweepTrades.map(trade => ({
      symbol: trade.underlying_ticker,
      type: trade.type === 'call' ? 'Call' : 'Put',
      strike: `$${trade.strike}`,
      size: `${trade.trade_size.toLocaleString()} @ $${trade.premium_per_contract}`,
      stockPrice: `$${trade.spot_price}`,
      premium: `$${trade.total_premium.toLocaleString()}`,
      tradeType: trade.trade_type || 'Sweep',
      timestamp: trade.trade_timestamp.toLocaleTimeString(),
      exchanges: trade.window_group || 'Multiple Exchanges',
      expiration: trade.expiry
    }));

    return NextResponse.json({
      success: true,
      ticker,
      totalTrades: formattedTrades.length,
      totalPremium: sweepTrades.reduce((sum, t) => sum + t.total_premium, 0),
      trades: formattedTrades
    });

  } catch (error) {
    console.error('Sweep detection error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      trades: []
    }, { status: 500 });
  }
}