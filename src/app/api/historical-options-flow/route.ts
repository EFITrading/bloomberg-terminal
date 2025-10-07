import { NextRequest, NextResponse } from 'next/server';
import { getHistoricalFlow } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get('date');
    const ticker = searchParams.get('ticker');
    const minPremium = searchParams.get('minPremium');
    const tradeType = searchParams.get('tradeType');
    const limit = searchParams.get('limit');
    
    if (!date) {
      return NextResponse.json({
        success: false,
        error: 'Date parameter is required for historical data'
      }, { status: 400 });
    }

    console.log(`🕒 HISTORICAL OPTIONS FLOW API: Fetching data for ${date}${ticker ? ` (${ticker})` : ''}`);
    const startTime = Date.now();

    // Parse the date and create start/end of day
    const selectedDate = new Date(date + 'T00:00:00.000Z');
    const startDate = new Date(selectedDate);
    const endDate = new Date(selectedDate);
    endDate.setUTCHours(23, 59, 59, 999); // End of day

    // Build filters object
    const filters: any = {
      startDate,
      endDate,
      limit: limit ? parseInt(limit) : 1000
    };

    if (ticker && ticker !== 'ALL') {
      filters.symbol = ticker;
    }

    if (minPremium) {
      filters.minPremium = parseFloat(minPremium);
    }

    if (tradeType && tradeType !== 'ALL') {
      filters.tradeType = tradeType;
    }

    // Fetch historical data
    const historicalTrades = await getHistoricalFlow(filters);
    
    const processingTime = Date.now() - startTime;

    // Calculate summary statistics
    const totalTrades = historicalTrades.length;
    const totalPremium = historicalTrades.reduce((sum, trade) => sum + (trade.total_premium || 0), 0);
    const uniqueSymbols = new Set(historicalTrades.map(trade => trade.underlying_ticker)).size;

    // Count trade types
    const tradeTypes = historicalTrades.reduce((acc, trade) => {
      const type = trade.trade_type || 'UNKNOWN';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Count call/put ratio
    const callPutRatio = historicalTrades.reduce((acc, trade) => {
      if (trade.type === 'call') acc.calls++;
      else if (trade.type === 'put') acc.puts++;
      return acc;
    }, { calls: 0, puts: 0 });

    const summary = {
      total_trades: totalTrades,
      total_premium: totalPremium,
      unique_symbols: uniqueSymbols,
      trade_types: {
        BLOCK: tradeTypes.BLOCK || 0,
        SWEEP: tradeTypes.SWEEP || 0,
        'MULTI-LEG': tradeTypes['MULTI-LEG'] || 0,
        SPLIT: tradeTypes.SPLIT || 0
      },
      call_put_ratio: callPutRatio,
      processing_time_ms: processingTime
    };

    // Transform data to match expected format
    const formattedTrades = historicalTrades.map(trade => ({
      ticker: trade.ticker,
      underlying_ticker: trade.underlying_ticker,
      strike: trade.strike,
      expiry: trade.expiry,
      type: trade.type as 'call' | 'put',
      trade_size: trade.trade_size,
      premium_per_contract: trade.premium_per_contract,
      total_premium: trade.total_premium,
      spot_price: trade.spot_price || 0,
      exchange_name: trade.exchange_name || 'UNKNOWN',
      trade_type: (trade.trade_type as 'SWEEP' | 'BLOCK' | 'MULTI-LEG' | 'SPLIT') || 'SWEEP',
      trade_timestamp: trade.trade_timestamp.toISOString(),
      moneyness: (trade.moneyness as 'ATM' | 'ITM' | 'OTM') || 'OTM',
      days_to_expiry: trade.days_to_expiry || 0
    }));

    const marketInfo = {
      status: 'HISTORICAL' as 'LIVE' | 'LAST_TRADING_DAY',
      is_live: false,
      data_date: date,
      market_open: false
    };

    console.log(`✅ Historical data loaded: ${totalTrades} trades, $${totalPremium.toLocaleString()} total premium (${processingTime}ms)`);

    return NextResponse.json({
      success: true,
      trades: formattedTrades,
      summary,
      market_info: marketInfo,
      source: 'historical_database',
      date_requested: date,
      total_processing_time_ms: processingTime
    });

  } catch (error) {
    console.error('❌ Error fetching historical options flow:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch historical data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}