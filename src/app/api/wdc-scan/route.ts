import { NextRequest, NextResponse } from 'next/server';

interface WDCTrade {
  ticker: string;
  underlying_ticker: string;
  strike: number;
  expiry: string;
  type: 'call' | 'put';
  trade_size: number;
  premium_per_contract: number;
  total_premium: number;
  timestamp: number;
  time_formatted: string;
  exchange: number;
  conditions: number[];
  trade_type: 'block' | 'sweep' | 'unusual' | 'whale' | 'regular';
}

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Scanning WDC options for today\'s trades...');
    
    const allWDCTrades: WDCTrade[] = [];
    const today = new Date().toISOString().split('T')[0]; // 2025-09-23
    
    // First, get all active WDC options contracts
    console.log('📊 Fetching all WDC options contracts...');
    
    let nextUrl: string | null = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=WDC&active=true&limit=1000&apikey=${POLYGON_API_KEY}`;
    
    while (nextUrl) {
      try {
        const contractsResponse: Response = await fetch(nextUrl);
        if (!contractsResponse.ok) {
          console.log(`❌ Failed to fetch WDC contracts: ${contractsResponse.status}`);
          break;
        }
        
        const contractsData: any = await contractsResponse.json();
        if (!contractsData.results || contractsData.results.length === 0) break;
        
        console.log(`📈 Processing ${contractsData.results.length} WDC contracts...`);
        
        // Process each WDC contract to find today's trades
        for (const contract of contractsData.results) {
          const ticker = contract.ticker;
          if (!ticker || !ticker.includes('WDC')) continue;
          
          try {
            // Get ALL trades for this contract today (no size limits)
            const tradesResponse = await fetch(
              `https://api.polygon.io/v3/trades/${ticker}?timestamp.gte=${today}&limit=50&order=desc&apikey=${POLYGON_API_KEY}`
            );
            
            if (!tradesResponse.ok) continue;
            
            const tradesData = await tradesResponse.json();
            if (!tradesData.results || tradesData.results.length === 0) continue;
            
            console.log(`💰 Found ${tradesData.results.length} trades for ${ticker}`);
            
            // Process ALL trades (not just large blocks)
            for (const trade of tradesData.results) {
              const tradeSize = trade.size;
              const pricePerContract = trade.price;
              const totalPremium = tradeSize * pricePerContract * 100; // Options multiplier
              
              // Classify trade type based on size and premium
              let tradeType: 'block' | 'sweep' | 'unusual' | 'whale' | 'regular' = 'regular';
              
              if (totalPremium >= 1000000) tradeType = 'whale';
              else if (totalPremium >= 500000) tradeType = 'unusual';
              else if (totalPremium >= 100000) tradeType = 'block';
              else if (tradeSize >= 100) tradeType = 'sweep';
              
              // Format timestamp to readable time
              const tradeTime = new Date(trade.sip_timestamp / 1000000);
              const timeFormatted = tradeTime.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZone: 'America/New_York'
              });
              
              const wdcTrade: WDCTrade = {
                ticker: ticker,
                underlying_ticker: 'WDC',
                strike: contract.strike_price || 0,
                expiry: contract.expiration_date || '',
                type: contract.contract_type?.toLowerCase() as 'call' | 'put',
                trade_size: tradeSize,
                premium_per_contract: pricePerContract,
                total_premium: totalPremium,
                timestamp: trade.sip_timestamp,
                time_formatted: timeFormatted,
                exchange: trade.exchange,
                conditions: trade.conditions || [],
                trade_type: tradeType
              };
              
              allWDCTrades.push(wdcTrade);
            }
            
            // Small delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 50));
            
          } catch (error) {
            console.log(`⚠️ Error fetching trades for ${ticker}:`, error);
            continue;
          }
        }
        
        // Check for next page
        nextUrl = contractsData.next_url ? `${contractsData.next_url}&apikey=${POLYGON_API_KEY}` : null;
        
      } catch (error) {
        console.log('❌ Error fetching contracts:', error);
        break;
      }
    }
    
    // Sort trades by total premium (largest first)
    allWDCTrades.sort((a, b) => b.total_premium - a.total_premium);
    
    console.log(`✅ Found ${allWDCTrades.length} total WDC trades today`);
    
    // Group by trade type for summary
    const summary = {
      total_trades: allWDCTrades.length,
      whale_trades: allWDCTrades.filter(t => t.trade_type === 'whale').length,
      unusual_trades: allWDCTrades.filter(t => t.trade_type === 'unusual').length,
      block_trades: allWDCTrades.filter(t => t.trade_type === 'block').length,
      sweep_trades: allWDCTrades.filter(t => t.trade_type === 'sweep').length,
      regular_trades: allWDCTrades.filter(t => t.trade_type === 'regular').length,
      total_premium_all: allWDCTrades.reduce((sum, t) => sum + t.total_premium, 0),
      calls_vs_puts: {
        calls: allWDCTrades.filter(t => t.type === 'call').length,
        puts: allWDCTrades.filter(t => t.type === 'put').length
      }
    };
    
    return NextResponse.json({
      success: true,
      symbol: 'WDC',
      date: today,
      summary: summary,
      trades: allWDCTrades,
      message: `Found ${allWDCTrades.length} WDC options trades for ${today}`
    });
    
  } catch (error) {
    console.error('❌ WDC Scan Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to scan WDC options',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}