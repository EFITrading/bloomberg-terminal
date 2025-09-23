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
  trade_type?: 'block' | 'sweep' | 'unusual' | 'whale';
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

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  
  const filters: FlowFilters = {
    minPremium: parseInt(searchParams.get('minPremium') || '1000'),
    maxPremium: parseInt(searchParams.get('maxPremium') || '5000000'),
    minVolume: parseInt(searchParams.get('minVolume') || '1'),
    underlyingSymbols: searchParams.get('symbols')?.split(',') || ['SPY', 'QQQ', 'AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL', 'AMZN'],
    callsOnly: searchParams.get('callsOnly') === 'true',
    putsOnly: searchParams.get('putsOnly') === 'true',
    unusualOnly: searchParams.get('unusualOnly') === 'true',
    sweepsOnly: searchParams.get('sweepsOnly') === 'true'
  };

  try {
    console.log('🔍 Options Flow API called with filters:', filters);
    const flowData: OptionsContract[] = [];
    
    // Process each underlying symbol
    for (const symbol of filters.underlyingSymbols) {
      try {
        console.log(`📊 Processing ${symbol}...`);
        // Get current stock price for ITM/OTM calculation
        const stockResponse = await fetch(
          `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apikey=${POLYGON_API_KEY}`
        );
        
        if (!stockResponse.ok) {
          console.log(`❌ Stock price API failed for ${symbol}:`, stockResponse.status);
          continue;
        }
        
        const stockData = await stockResponse.json();
        const currentPrice = stockData.results?.[0]?.c || 0;
        console.log(`💰 ${symbol} current price:`, currentPrice);
        
        // Get options snapshots
        const optionsResponse = await fetch(
          `https://api.polygon.io/v3/snapshot/options/${symbol}?limit=250&apikey=${POLYGON_API_KEY}`
        );
        
        if (!optionsResponse.ok) {
          const errorText = await optionsResponse.text();
          console.log(`❌ Options API failed for ${symbol}:`, optionsResponse.status);
          console.log(`❌ Error details:`, errorText);
          console.log(`❌ Failed URL:`, `https://api.polygon.io/v3/snapshot/options/${symbol}?limit=1000&apikey=${POLYGON_API_KEY}`);
          continue;
        }
        
        const optionsData = await optionsResponse.json();
        console.log(`📈 ${symbol} options contracts received:`, optionsData.results?.length || 0);
        
        if (optionsData.results) {
          let contractsProcessed = 0;
          let contractsWithVolume = 0;
          let contractsPassingFilters = 0;
          
          for (const contract of optionsData.results) {
            contractsProcessed++;
            const details = contract.details;
            const dayData = contract.day;
            const lastTrade = contract.last_trade;
            const lastQuote = contract.last_quote;
            
            // Skip contracts without volume
            if (!dayData?.volume || dayData.volume < filters.minVolume) continue;
            contractsWithVolume++;
            
            // Calculate premium
            const price = lastTrade?.price || dayData?.vwap || dayData?.close || 0;
            const premium = price * dayData.volume * 100; // Options multiplier
            
            // Apply premium filters
            if (premium < filters.minPremium || premium > filters.maxPremium) continue;

            // DEBUG: Log contract details to see what dates we're getting  
            const strike = details?.strike_price || 0;
            let percentOTM = 0;
            
            if (details?.contract_type === 'call') {
              // For calls: % OTM = (strike - current_price) / current_price
              percentOTM = (strike - currentPrice) / currentPrice;
            } else if (details?.contract_type === 'put') {
              // For puts: % OTM = (current_price - strike) / current_price  
              percentOTM = (currentPrice - strike) / currentPrice;
            }
            
            // Skip contracts more than 10% out of the money
            if (percentOTM > 0.10) {
              continue;
            }

            // Apply call/put filters
            if (filters.callsOnly && details?.contract_type !== 'call') continue;
            if (filters.putsOnly && details?.contract_type !== 'put') continue;            // Calculate volume/OI ratio for unusual activity
            const volumeOIRatio = dayData.open_interest ? dayData.volume / dayData.open_interest : null;
            const isUnusual = volumeOIRatio !== null && volumeOIRatio > 2.0;
            
            // Apply unusual activity filter
            if (filters.unusualOnly && !isUnusual) continue;
            
            // Detect potential sweeps (trade at ask for calls, bid for puts)
            let sweepDetected = false;
            if (lastTrade && lastQuote) {
              const midpoint = (lastQuote.bid + lastQuote.ask) / 2;
              const tradePrice = lastTrade.price;
              
              if (details?.contract_type === 'call' && tradePrice >= (lastQuote.ask * 0.95)) {
                sweepDetected = true;
              } else if (details?.contract_type === 'put' && tradePrice <= (lastQuote.bid * 1.05)) {
                sweepDetected = true;
              }
            }
            
            // Apply sweep filter
            if (filters.sweepsOnly && !sweepDetected) continue;
            
            // Determine flow sentiment
            let flowType: 'bullish' | 'bearish' | 'neutral' = 'neutral';
            if (details?.contract_type === 'call') {
              if (details.strike_price > currentPrice * 1.02) {
                flowType = 'bullish'; // OTM call buying
              } else {
                flowType = 'neutral'; // ITM call could be hedging
              }
            } else if (details?.contract_type === 'put') {
              if (details.strike_price < currentPrice * 0.98) {
                flowType = 'bearish'; // OTM put buying
              } else {
                flowType = 'neutral'; // ITM put could be protective
              }
            }
            
            flowData.push({
              ticker: contract.underlying_asset?.ticker || symbol, // Use underlying asset ticker or fallback to symbol
              underlying_ticker: contract.underlying_asset?.ticker || symbol,
              strike: details?.strike_price || 0,
              expiry: details?.expiration_date || '',
              type: details?.contract_type as 'call' | 'put',
              volume: dayData.volume,
              premium: Math.round(premium),
              vwap: dayData.vwap,
              iv: contract.implied_volatility,
              oi: dayData.open_interest,
              volume_oi_ratio: volumeOIRatio || undefined,
              last_trade: lastTrade ? {
                price: lastTrade.price,
                size: lastTrade.size,
                exchange: lastTrade.exchange
              } : undefined,
              last_quote: lastQuote ? {
                bid: lastQuote.bid,
                ask: lastQuote.ask,
                bid_size: lastQuote.bid_size,
                ask_size: lastQuote.ask_size
              } : undefined,
              flow_type: flowType,
              unusual_activity: isUnusual,
              sweep_detected: sweepDetected
            });
            contractsPassingFilters++;
          }
          
          console.log(`📊 ${symbol} summary:`, {
            total: contractsProcessed,
            withVolume: contractsWithVolume,
            passingFilters: contractsPassingFilters
          });
        }
      } catch (error) {
        console.error(`Error processing ${symbol}:`, error);
        continue;
      }
    }
    
    // Sort by premium (highest first)
    flowData.sort((a, b) => (b.premium || 0) - (a.premium || 0));
    
    // Limit to top 100 results
    const limitedData = flowData.slice(0, 100);
    
    console.log(`🎯 Final results: ${limitedData.length} contracts found`);
    if (limitedData.length > 0) {
      console.log('💎 Top contract:', limitedData[0]);
    }
    
    return NextResponse.json({
      success: true,
      data: limitedData,
      summary: {
        total_contracts: limitedData.length,
        total_premium: limitedData.reduce((sum, contract) => sum + (contract.premium || 0), 0),
        bullish_flow: limitedData.filter(c => c.flow_type === 'bullish').length,
        bearish_flow: limitedData.filter(c => c.flow_type === 'bearish').length,
        unusual_activity: limitedData.filter(c => c.unusual_activity).length,
        sweeps_detected: limitedData.filter(c => c.sweep_detected).length
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Options flow API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch options flow data',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}