import { NextRequest, NextResponse } from 'next/server';
import { OptionsFlowService } from '@/lib/optionsFlowService';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const ticker = searchParams.get('ticker');
    const saveToDb = searchParams.get('saveToDb') === 'true';
    
    const polygonApiKey = process.env.POLYGON_API_KEY;
    
    if (!polygonApiKey) {
      console.error('❌ POLYGON_API_KEY not configured');
      return NextResponse.json({
        success: false,
        error: 'POLYGON_API_KEY not configured',
        source: 'config_error'
      }, { status: 500 });
    }

    console.log(`🚀 LIVE OPTIONS FLOW API: Starting ${ticker || 'MARKET-WIDE SWEEP SCAN'}`);
    const startTime = Date.now();
    
    // Initialize the options flow service
    const optionsFlowService = new OptionsFlowService(polygonApiKey);
    
    // Process the options flow - will scan market-wide if no ticker specified
    const processedTrades = await optionsFlowService.fetchLiveOptionsFlow(ticker || undefined);
    
    const processingTime = Date.now() - startTime;
    
    // Save to database if requested
    if (saveToDb && processedTrades.length > 0) {
      try {
        const { saveOptionsFlow } = await import('@/lib/database');
        await saveOptionsFlow(processedTrades.map(trade => ({
          ticker: trade.ticker,
          underlying_ticker: trade.underlying_ticker,
          strike: trade.strike,
          expiry: trade.expiry,
          type: trade.type,
          trade_size: trade.trade_size,
          premium_per_contract: trade.premium_per_contract,
          total_premium: trade.total_premium,
          flow_type: null, // Will be determined by analysis
          trade_type: trade.trade_type,
          above_ask: false, // Would need bid/ask data
          below_bid: false,
          exchange: trade.exchange,
          conditions: trade.conditions,
          timestamp: trade.trade_timestamp.getTime(),
          spot_price: trade.spot_price,
          sip_timestamp: trade.sip_timestamp,
          sequence_number: trade.sequence_number,
          window_group: trade.window_group,
          related_trades: trade.related_trades,
          moneyness: trade.moneyness,
          days_to_expiry: trade.days_to_expiry,
          exchange_name: trade.exchange_name
        })));
        
        console.log(`💾 Saved ${processedTrades.length} trades to database`);
      } catch (error) {
        console.error('❌ Database save error:', error);
      }
    }

    // Calculate summary statistics
    const summary = {
      total_trades: processedTrades.length,
      total_premium: processedTrades.reduce((sum, trade) => sum + trade.total_premium, 0),
      unique_symbols: new Set(processedTrades.map(t => t.underlying_ticker)).size,
      trade_types: {
        BLOCK: processedTrades.filter(t => t.trade_type === 'BLOCK').length,
        SWEEP: processedTrades.filter(t => t.trade_type === 'SWEEP').length,
        'MULTI-LEG': processedTrades.filter(t => t.trade_type === 'MULTI-LEG').length,
        SPLIT: processedTrades.filter(t => t.trade_type === 'SPLIT').length
      },
      call_put_ratio: {
        calls: processedTrades.filter(t => t.type === 'call').length,
        puts: processedTrades.filter(t => t.type === 'put').length
      },
      processing_time_ms: processingTime
    };

    console.log(`✅ OPTIONS FLOW SCAN COMPLETE:`, summary);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ticker,
      trades: processedTrades,
      summary,
      saved_to_db: saveToDb
    });

  } catch (error) {
    console.error('❌ Live options flow API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch live options flow',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { trades } = body;
    
    if (!trades || !Array.isArray(trades)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid trades data'
      }, { status: 400 });
    }

    // Save trades to database
    const { saveOptionsFlow } = await import('@/lib/database');
    const saved = await saveOptionsFlow(trades);
    
    console.log(`💾 SAVED ${saved.count} trades to database via POST`);

    return NextResponse.json({
      success: true,
      saved_count: saved.count,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Save trades API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to save trades',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}