import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contracts } = body;
    
    if (!contracts || !Array.isArray(contracts)) {
      return NextResponse.json({ 
        success: false, 
        error: 'Contracts array is required' 
      }, { status: 400 });
    }

    const polygonApiKey = process.env.POLYGON_API_KEY || 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
    
    if (!polygonApiKey) {
      console.error('❌ POLYGON_API_KEY not configured');
      return NextResponse.json({
        success: false,
        error: 'POLYGON_API_KEY not configured'
      }, { status: 500 });
    }

    console.log(`🚀 BULK Vol/OI: Processing ${contracts.length} contracts`);
    
    // Group contracts by ticker for efficient batching
    const contractsByTicker: Record<string, any[]> = {};
    contracts.forEach((contract: any) => {
      const ticker = contract.underlying_ticker;
      if (!contractsByTicker[ticker]) {
        contractsByTicker[ticker] = [];
      }
      contractsByTicker[ticker].push(contract);
    });

    const results: Record<string, any> = {};
    
    // Process each ticker in parallel for maximum speed
    const tickerPromises = Object.entries(contractsByTicker).map(async ([ticker, tickerContracts]) => {
      try {
        console.log(`📊 Fetching ${ticker} options snapshot...`);
        
        // Use the efficient options snapshot endpoint - gets ALL options for ticker at once
        const polygonUrl = `https://api.polygon.io/v3/snapshot/options/${ticker}?limit=1000&apikey=${polygonApiKey}`;
        
        const response = await fetch(polygonUrl);
        
        if (!response.ok) {
          console.error(`❌ ${ticker} API error: ${response.status}`);
          // Mark all this ticker's contracts as failed
          tickerContracts.forEach(contract => {
            const key = `${contract.underlying_ticker}-${contract.strike}-${contract.expiry}-${contract.type}`;
            results[key] = { volume: -1, open_interest: -1 };
          });
          return;
        }

        const data = await response.json();
        
        if (data.status !== 'OK' || !data.results) {
          console.error(`❌ ${ticker} invalid response:`, data.status);
          tickerContracts.forEach(contract => {
            const key = `${contract.underlying_ticker}-${contract.strike}-${contract.expiry}-${contract.type}`;
            results[key] = { volume: -1, open_interest: -1 };
          });
          return;
        }

        console.log(`✅ ${ticker}: Got ${data.results.length} option contracts from snapshot`);
        
        // Create lookup map for fast matching
        const optionsMap: Record<string, any> = {};
        data.results.forEach((option: any) => {
          if (!option.details) return;
          
          const strike = option.details.strike_price;
          const expiry = option.details.expiration_date;
          const type = option.details.contract_type?.toLowerCase();
          
          if (strike && expiry && type) {
            const optionKey = `${strike}-${expiry}-${type}`;
            optionsMap[optionKey] = {
              volume: option.day?.volume || 0,
              open_interest: option.open_interest || 0
            };
          }
        });

        // Match our contracts to the fetched data
        tickerContracts.forEach(contract => {
          const contractKey = `${contract.underlying_ticker}-${contract.strike}-${contract.expiry}-${contract.type}`;
          const lookupKey = `${contract.strike}-${contract.expiry}-${contract.type}`;
          
          const matchedOption = optionsMap[lookupKey];
          if (matchedOption) {
            results[contractKey] = {
              volume: matchedOption.volume,
              open_interest: matchedOption.open_interest
            };
          } else {
            // Not found in snapshot - likely low volume contract
            results[contractKey] = { volume: 0, open_interest: 0 };
          }
        });

        console.log(`✅ ${ticker}: Matched ${tickerContracts.length} contracts`);
        
      } catch (error) {
        console.error(`❌ Error processing ${ticker}:`, error);
        // Mark all this ticker's contracts as failed
        tickerContracts.forEach(contract => {
          const key = `${contract.underlying_ticker}-${contract.strike}-${contract.expiry}-${contract.type}`;
          results[key] = { volume: -1, open_interest: -1 };
        });
      }
    });

    // Wait for all tickers to complete
    await Promise.all(tickerPromises);
    
    console.log(`🎉 BULK Vol/OI: Completed ${Object.keys(results).length} results`);

    return NextResponse.json({
      success: true,
      data: results,
      processed: contracts.length,
      found: Object.keys(results).length
    });

  } catch (error) {
    console.error('❌ Bulk Vol/OI error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch bulk Vol/OI data'
    }, { status: 500 });
  }
}