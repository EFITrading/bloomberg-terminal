import { NextRequest, NextResponse } from 'next/server';

interface OptionsContract {
  ticker: string;
  underlying_ticker: string;
  strike: number;
  expiry: string;
  type: 'call' | 'put';
  trade_size: number;
  premium_per_contract: number;
  total_premium: number;
  timestamp: number;
  exchange: number;
  conditions: number[];
  flow_type: 'bullish' | 'bearish' | 'neutral';
  trade_type: 'block' | 'sweep' | 'unusual';
  above_ask?: boolean;
  below_bid?: boolean;
  unusual_activity?: boolean;
  sweep_detected?: boolean;
}

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

// Get today's date in YYYY-MM-DD format
function getTodayDate(): string {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

// Get yesterday's date in YYYY-MM-DD format
function getYesterdayDate(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
}

// Determine flow type based on trade characteristics
function analyzeFlowType(trade: any, currentPrice: number): 'bullish' | 'bearish' | 'neutral' {
  const strike = trade.details?.strike_price || 0;
  const isCall = trade.details?.contract_type === 'call';
  const isPut = trade.details?.contract_type === 'put';
  
  // Volume-weighted analysis
  if (isCall) {
    // Calls bought above current price = bullish
    if (strike > currentPrice * 1.02) return 'bullish';
    // ATM calls = bullish
    if (Math.abs(strike - currentPrice) / currentPrice < 0.02) return 'bullish';
    return 'neutral';
  } else if (isPut) {
    // Puts bought below current price = bearish
    if (strike < currentPrice * 0.98) return 'bearish';
    // ATM puts = bearish
    if (Math.abs(strike - currentPrice) / currentPrice < 0.02) return 'bearish';
    return 'neutral';
  }
  
  return 'neutral';
}

// Detect if trade is unusual based on volume and premium
function isUnusualActivity(trade: any): boolean {
  const size = trade.size || 0;
  const price = trade.price || 0;
  const premium = size * price * 100;
  
  // Large size or premium indicates unusual activity
  return size >= 500 || premium >= 100000;
}

// Detect sweep activity (multiple exchanges, rapid fills)
function isSweepActivity(trades: any[]): boolean {
  if (trades.length < 2) return false;
  
  // Check if trades happened across multiple exchanges quickly
  const exchanges = new Set(trades.map(t => t.exchange));
  const timeSpan = Math.max(...trades.map(t => t.timestamp)) - Math.min(...trades.map(t => t.timestamp));
  
  return exchanges.size > 1 && timeSpan < 60000; // Multiple exchanges within 1 minute
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  
  const symbols = searchParams.get('symbols')?.split(',') || [
    'SPY', 'QQQ', 'AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 
    'META', 'NFLX', 'AMD', 'CRM', 'UBER', 'SQ', 'COIN'
  ];
  
  const minPremium = parseInt(searchParams.get('minPremium') || '50000');
  const maxPremium = parseInt(searchParams.get('maxPremium') || '5000000');
  const callsOnly = searchParams.get('callsOnly') === 'true';
  const putsOnly = searchParams.get('putsOnly') === 'true';
  const unusualOnly = searchParams.get('unusualOnly') === 'true';
  const sweepsOnly = searchParams.get('sweepsOnly') === 'true';

  try {
    console.log('🔥 LIVE OPTIONS FLOW - Fetching real trades from today...');
    
    const allTrades: OptionsContract[] = [];
    const today = getTodayDate();
    
    // Process each symbol
    for (const symbol of symbols) {
      try {
        console.log(`📊 Fetching live trades for ${symbol}...`);
        
        // Get current stock price first
        const stockResponse = await fetch(
          `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apikey=${POLYGON_API_KEY}`
        );
        
        let currentPrice = 0;
        if (stockResponse.ok) {
          const stockData = await stockResponse.json();
          currentPrice = stockData.results?.[0]?.c || 0;
        }
        
        // Get options trades for today (this gets ACTUAL TRADES, not snapshots)
        const tradesResponse = await fetch(
          `https://api.polygon.io/v3/trades/O:${symbol}?timestamp.gte=${today}&limit=1000&apikey=${POLYGON_API_KEY}`
        );
        
        if (!tradesResponse.ok) {
          console.log(`❌ Options trades API failed for ${symbol}:`, tradesResponse.status);
          continue;
        }
        
        const tradesData = await tradesResponse.json();
        
        if (!tradesData.results || tradesData.results.length === 0) {
          console.log(`⚠️ No trades found for ${symbol} today`);
          continue;
        }
        
        console.log(`📈 ${symbol}: Found ${tradesData.results.length} option trades today`);
        
        // Group trades by contract ticker to detect sweeps
        const tradeGroups = new Map<string, any[]>();
        
        for (const trade of tradesData.results) {
          const contractTicker = trade.option_ticker || '';
          if (!tradeGroups.has(contractTicker)) {
            tradeGroups.set(contractTicker, []);
          }
          tradeGroups.get(contractTicker)!.push(trade);
        }
        
        // Process each contract's trades
        for (const [contractTicker, contractTrades] of tradeGroups) {
          // Parse contract details from ticker (e.g., AAPL251017C00150000)
          const match = contractTicker.match(/([A-Z]+)(\d{6})([CP])(\d{8})/);
          if (!match) continue;
          
          const [, ticker, dateStr, callPut, strikeStr] = match;
          const strike = parseFloat(strikeStr) / 1000; // Strike is in thousandths
          const contractType = callPut === 'C' ? 'call' : 'put';
          
          // Convert date (YYMMDD to YYYY-MM-DD)
          const year = 2000 + parseInt(dateStr.substring(0, 2));
          const month = dateStr.substring(2, 4);
          const day = dateStr.substring(4, 6);
          const expiry = `${year}-${month}-${day}`;
          
          // Calculate total volume and premium for this contract
          const totalSize = contractTrades.reduce((sum, t) => sum + (t.size || 0), 0);
          const avgPrice = contractTrades.reduce((sum, t) => sum + (t.price || 0), 0) / contractTrades.length;
          const totalPremium = totalSize * avgPrice * 100;
          
          // Apply filters
          if (totalPremium < minPremium || totalPremium > maxPremium) continue;
          if (callsOnly && contractType !== 'call') continue;
          if (putsOnly && contractType !== 'put') continue;
          
          const flowType = analyzeFlowType({ details: { strike_price: strike, contract_type: contractType } }, currentPrice);
          const unusual = isUnusualActivity({ size: totalSize, price: avgPrice });
          const sweep = isSweepActivity(contractTrades);
          
          if (unusualOnly && !unusual) continue;
          if (sweepsOnly && !sweep) continue;
          
          const optionsContract: OptionsContract = {
            ticker: contractTicker,
            underlying_ticker: symbol,
            strike: strike,
            expiry: expiry,
            type: contractType,
            trade_size: totalSize,
            premium_per_contract: avgPrice,
            total_premium: totalPremium,
            timestamp: Math.max(...contractTrades.map(t => t.timestamp)) / 1000000, // Convert to seconds
            exchange: contractTrades[0].exchange || 0,
            conditions: contractTrades[0].conditions || [],
            flow_type: flowType,
            trade_type: sweep ? 'sweep' : (totalPremium >= 100000 ? 'block' : 'unusual'),
            unusual_activity: unusual,
            sweep_detected: sweep
          };
          
          allTrades.push(optionsContract);
        }
        
        console.log(`✅ ${symbol}: Processed ${tradeGroups.size} unique contracts`);
        
      } catch (error) {
        console.error(`Error processing ${symbol}:`, error);
        continue;
      }
    }
    
    // Sort by premium (highest first)
    allTrades.sort((a, b) => b.total_premium - a.total_premium);
    
    // Limit results
    const limitedTrades = allTrades.slice(0, 100);
    
    console.log(`🎯 LIVE FLOW COMPLETE: Found ${limitedTrades.length} trades from today`);
    
    // Calculate summary stats
    const summary = {
      total_contracts: limitedTrades.length,
      total_premium: limitedTrades.reduce((sum, t) => sum + t.total_premium, 0),
      bullish_flow: limitedTrades.filter(t => t.flow_type === 'bullish').length,
      bearish_flow: limitedTrades.filter(t => t.flow_type === 'bearish').length,
      unusual_activity: limitedTrades.filter(t => t.unusual_activity).length,
      sweeps_detected: limitedTrades.filter(t => t.sweep_detected).length
    };
    
    return NextResponse.json({
      success: true,
      data: limitedTrades,
      summary: summary,
      timestamp: new Date().toISOString(),
      scan_date: today,
      message: `Found ${limitedTrades.length} live options trades from ${today}`
    });
    
  } catch (error) {
    console.error('❌ Live options flow API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch live options flow data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}