import { NextRequest, NextResponse } from 'next/server';

interface OptionsContract {
  ticker: string;
  underlying_ticker: string;
  strike: number;
  expiry: string;
  type: 'call' | 'put';
  trade_size: number; // Individual trade size, not daily volume
  premium_per_contract: number; // Price per contract
  total_premium: number; // Total dollar value of this trade
  timestamp: number;
  exchange: number;
  conditions: number[];
  flow_type?: 'bullish' | 'bearish' | 'neutral';
  trade_type?: 'block' | 'sweep'; // Simplified: block (>$80K single fill) or sweep (multi-exchange)
  above_ask?: boolean;
  below_bid?: boolean;
}

interface FlowFilters {
  minPremium: number;
  maxPremium: number;
  minVolume: number;
  underlyingSymbols: string[];
  callsOnly: boolean;
  putsOnly: boolean;
  unusualOnly: boolean;
  sweepsOnly: boolean;
}

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

// BlackBoxStocks-style trade consolidation function
function consolidateTrades(trades: OptionsContract[]): OptionsContract[] {
  console.log('🔄 Consolidating fragmented trades BlackBoxStocks-style...');
  
  // Group trades by contract identifier and price point
  const tradeGroups = new Map<string, OptionsContract[]>();
  
  trades.forEach(trade => {
    // Create unique key for grouping: ticker + strike + type + price + time window
    const timeWindow = Math.floor(trade.timestamp / (30 * 1000000000)); // 30-second windows
    const groupKey = `${trade.ticker}-${trade.premium_per_contract.toFixed(2)}-${timeWindow}`;
    
    if (!tradeGroups.has(groupKey)) {
      tradeGroups.set(groupKey, []);
    }
    tradeGroups.get(groupKey)!.push(trade);
  });
  
  const consolidatedTrades: OptionsContract[] = [];
  
  tradeGroups.forEach((groupTrades) => {
    if (groupTrades.length === 1) {
      // Single trade - check if it's a block (>$80K)
      const trade = groupTrades[0];
      if (trade.total_premium >= 80000) {
        trade.trade_type = 'block'; // Single fill block order >$80K
      } else {
        trade.trade_type = 'sweep'; // Smaller individual trade
      }
      consolidatedTrades.push(trade);
    } else {
      // Multiple trades in same time window - consolidate into single "sweep"
      const consolidatedTrade = groupTrades[0]; // Use first as template
      consolidatedTrade.trade_size = groupTrades.reduce((sum, t) => sum + t.trade_size, 0);
      consolidatedTrade.total_premium = groupTrades.reduce((sum, t) => sum + t.total_premium, 0);
      consolidatedTrade.trade_type = 'sweep'; // Multi-fill = sweep
      
      console.log(`🔗 Consolidated ${groupTrades.length} trades into sweep: ${consolidatedTrade.underlying_ticker} ${consolidatedTrade.type} $${consolidatedTrade.strike} = $${(consolidatedTrade.total_premium/1000).toFixed(0)}K`);
      
      consolidatedTrades.push(consolidatedTrade);
    }
  });
  
  // Sort by premium descending
  return consolidatedTrades.sort((a, b) => b.total_premium - a.total_premium);
}

export async function GET(request: NextRequest) {
  console.log('🚀 OPTIONS FLOW API CALLED - Starting FAST OTM-only parallel processing...');
  
  const searchParams = request.nextUrl.searchParams;
  
  const filters: FlowFilters = {
    minPremium: parseInt(searchParams.get('minPremium') || '50000'), // $50K minimum for faster scans
    maxPremium: parseInt(searchParams.get('maxPremium') || '5000000'),
    minVolume: parseInt(searchParams.get('minVolume') || '50'), // Minimum 50 contracts
    underlyingSymbols: [], // Will be populated dynamically
    callsOnly: searchParams.get('callsOnly') === 'true',
    putsOnly: searchParams.get('putsOnly') === 'true',
    unusualOnly: searchParams.get('unusualOnly') === 'true',
    sweepsOnly: searchParams.get('sweepsOnly') === 'true'
  };

  try {
    console.log('⚡ ULTRA-FAST PARALLEL OTM SCAN - Processing all tickers simultaneously...');
    
    const flowData: OptionsContract[] = [];
    const today = new Date().toISOString().split('T')[0]; // 2025-09-23
    
    // Focus on major stocks where institutional activity is most likely
    const majorStocks = [
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META', 'BRK.B', 'UNH', 'JPM',
      'V', 'PG', 'MA', 'HD', 'JNJ', 'XOM', 'BAC', 'LLY', 'WMT', 'ABBV', 'COST', 'TMO',
      'PFE', 'DIS', 'ABT', 'NFLX', 'ACN', 'VZ', 'ADBE', 'CMCSA', 'INTC', 'NKE', 'CRM',
      'WDC', 'AMD', 'QCOM', 'SBUX', 'LOW', 'GS', 'MS', 'INTU'
    ];
    
    // **PARALLEL PROCESSING - Process all stocks simultaneously instead of sequentially**
    const stockPromises = majorStocks.slice(0, 20).map(async (symbol) => { // Limit to 20 for speed
      try {
        // Get current stock price first to filter OTM only
        const quoteResponse = await fetch(
          `https://api.polygon.io/v2/last/trade/${symbol}?apikey=${POLYGON_API_KEY}`
        );
        
        if (!quoteResponse.ok) return [];
        
        const quoteData = await quoteResponse.json();
        const currentPrice = quoteData.results?.p || 0;
        
        if (currentPrice === 0) return [];
        
        // Get active options contracts for this underlying
        const contractsResponse = await fetch(
          `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${symbol}&active=true&limit=150&apikey=${POLYGON_API_KEY}`
        );
        
        if (!contractsResponse.ok) return [];
        
        const contractsData = await contractsResponse.json();
        if (!contractsData.results || contractsData.results.length === 0) return [];
        
        console.log(`📊 ${symbol} @ $${currentPrice.toFixed(2)} - Scanning ${contractsData.results.length} contracts for OTM blocks...`);
        
        const symbolFlowData: OptionsContract[] = [];
        
        // **PARALLEL CONTRACT PROCESSING - Process contracts in batches**
        const otmContracts = contractsData.results.filter(contract => {
          const strike = contract.strike_price || 0;
          const contractType = contract.contract_type?.toLowerCase() as 'call' | 'put';
          
          // **OTM FILTERING - Only process Out-of-The-Money contracts**
          return (contractType === 'call' && strike > currentPrice) || 
                 (contractType === 'put' && strike < currentPrice);
        });
        
        console.log(`🎯 ${symbol}: Found ${otmContracts.length} OTM contracts out of ${contractsData.results.length} total`);
        
        // Process OTM contracts in parallel batches
        const batchSize = 8; // Process 8 contracts at once for speed
        const contractBatches = [];
        
        for (let i = 0; i < otmContracts.length && i < 40; i += batchSize) { // Limit to 40 per symbol
          const batch = otmContracts.slice(i, i + batchSize);
          contractBatches.push(batch);
        }
        
        for (const batch of contractBatches) {
          const batchPromises = batch.map(async (contract) => {
            const ticker = contract.ticker;
            if (!ticker) return [];
            
            const strike = contract.strike_price || 0;
            const contractType = contract.contract_type?.toLowerCase() as 'call' | 'put';
            
            try {
              // Get recent trades for this OTM contract
              const tradesResponse = await fetch(
                `https://api.polygon.io/v3/trades/${ticker}?timestamp.gte=${today}&limit=15&apikey=${POLYGON_API_KEY}`
              );
              
              if (!tradesResponse.ok) return [];
              
              const tradesData = await tradesResponse.json();
              if (!tradesData.results || tradesData.results.length === 0) return [];
              
              // Process trades for this OTM contract
              const contractTrades = tradesData.results.map(trade => {
                const tradeSize = trade.size;
                const pricePerContract = trade.price;
                const totalPremium = tradeSize * pricePerContract * 100;
                
                // **BLACKBOXSTOCKS FILTERING - High value trades only**
                const isLargeBlock = (
                  (pricePerContract >= 15 && tradeSize >= 100) || // $150K+ on expensive options
                  (pricePerContract >= 8 && tradeSize >= 200) ||  // $160K+ on medium options
                  (pricePerContract >= 3 && tradeSize >= 500) ||  // $150K+ on cheaper options
                  totalPremium >= 80000 // Any $80K+ trade
                );
                
                if (!isLargeBlock || totalPremium < filters.minPremium) return null;
                
                // Apply option type filters
                if (filters.callsOnly && contractType !== 'call') return null;
                if (filters.putsOnly && contractType !== 'put') return null;
                
                const tradeType: 'block' | 'sweep' = totalPremium >= 80000 ? 'block' : 'sweep';
                const flowType: 'bullish' | 'bearish' | 'neutral' = 'neutral';
                
                if (filters.sweepsOnly && tradeType !== 'sweep') return null;
                
                return {
                  ticker: ticker,
                  underlying_ticker: symbol,
                  strike: strike,
                  expiry: contract.expiration_date || '',
                  type: contractType,
                  trade_size: tradeSize,
                  premium_per_contract: pricePerContract,
                  total_premium: totalPremium,
                  timestamp: trade.timestamp || Date.now(),
                  exchange: trade.exchange || 0,
                  conditions: trade.conditions || [],
                  flow_type: flowType,
                  trade_type: tradeType,
                  above_ask: false,
                  below_bid: false
                } as OptionsContract;
              }).filter(Boolean);
              
              return contractTrades;
              
            } catch {
              return [];
            }
          });
          
          const batchResults = await Promise.all(batchPromises);
          batchResults.forEach(contractTrades => {
            contractTrades.forEach(trade => {
              if (trade) {
                symbolFlowData.push(trade);
                console.log(`💰 OTM ${trade.trade_type.toUpperCase()}: ${symbol} ${trade.type} $${trade.strike} | ${trade.trade_size} contracts @ $${trade.premium_per_contract} = $${(trade.total_premium/1000).toFixed(0)}K`);
              }
            });
          });
          
          // Stop if we have enough for this symbol
          if (symbolFlowData.length >= 15) break;
        }
        
        return symbolFlowData;
        
      } catch (error) {
        console.error(`❌ Error processing ${symbol}:`, error);
        return [];
      }
    });
    
    // **AWAIT ALL PARALLEL PROCESSING**
    console.log('⏳ Waiting for all parallel OTM scans to complete...');
    const allResults = await Promise.all(stockPromises);
    
    // Flatten results
    allResults.forEach(symbolResults => {
      symbolResults.forEach(trade => flowData.push(trade));
    });
    
    console.log(`✅ ULTRA-FAST SCAN COMPLETE: Found ${flowData.length} OTM institutional trades`);
    
    // Apply BlackBoxStocks consolidation
    const consolidatedData = consolidateTrades(flowData);
    
    console.log(`🎯 Returning ${consolidatedData.length} consolidated OTM-only block/sweep trades`);
    
    return NextResponse.json({
      success: true,
      data: consolidatedData.slice(0, 100), // Limit results
      total: consolidatedData.length,
      timestamp: new Date().toISOString(),
      scan_type: 'parallel_otm_ultra_fast',
      scan_speed: 'OPTIMIZED',
      filters_applied: 'OTM_ONLY',
      message: `⚡ FAST SCAN: Found ${consolidatedData.length} OTM institutional options trades`
    });
    
  } catch (error) {
    console.error('❌ Options flow API error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch options flow data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}