import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker');

    if (!ticker) {
      return NextResponse.json(
        { success: false, error: 'Ticker parameter is required' },
        { status: 400 }
      );
    }

    // Polygon.io API key
    const apiKey = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
    
    // First, get the current stock price
    let currentPrice = 150; // fallback
    try {
      const priceResponse = await fetch(
        `https://api.polygon.io/v2/last/trade/${ticker}?apikey=${apiKey}`
      );
      const priceData = await priceResponse.json();
      
      if (priceData.status === 'OK' && priceData.results && priceData.results.p) {
        currentPrice = priceData.results.p;
      } else {
        // Fallback to previous day's close
        const fallbackResponse = await fetch(
          `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?apikey=${apiKey}`
        );
        const fallbackData = await fallbackResponse.json();
        if (fallbackData.results && fallbackData.results.length > 0) {
          currentPrice = fallbackData.results[0].c;
        }
      }
    } catch (error) {
      console.error('Error fetching current price:', error);
    }

    // Get available options contracts for the ticker
    const optionsResponse = await fetch(
      `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&limit=1000&apikey=${apiKey}`
    );
    
    if (!optionsResponse.ok) {
      throw new Error(`Options API error: ${optionsResponse.status}`);
    }

    const optionsData = await optionsResponse.json();
    
    if (!optionsData.results || optionsData.results.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No options contracts found for this ticker',
        ticker: ticker,
        currentPrice: currentPrice
      });
    }

    // Group contracts by expiration date
    const expirationGroups: { [key: string]: any[] } = {};
    
    optionsData.results.forEach((contract: any) => {
      const expDate = contract.expiration_date;
      if (!expirationGroups[expDate]) {
        expirationGroups[expDate] = [];
      }
      expirationGroups[expDate].push(contract);
    });

    // Process each expiration date and fetch real options data
    const processedData: any = {};
    
    // Limit to first 6 expiration dates to avoid API rate limits
    const expirationDates = Object.keys(expirationGroups)
      .sort()
      .slice(0, 6);

    for (const expDate of expirationDates) {
      const contracts = expirationGroups[expDate];
      const calls: any = {};
      const puts: any = {};

      // Process contracts in batches to get open interest and pricing data
      for (let i = 0; i < Math.min(contracts.length, 50); i += 10) {
        const batch = contracts.slice(i, i + 10);
        
        try {
          // Get options data for this batch
          for (const contract of batch) {
            const optionTicker = contract.ticker;
            
            // Fetch the latest options quote
            const quoteResponse = await fetch(
              `https://api.polygon.io/v2/last/trade/${optionTicker}?apikey=${apiKey}`
            );
            
            let optionData = {
              strike: contract.strike_price,
              open_interest: 0,
              volume: 0,
              bid: 0,
              ask: 0,
              last: 0,
              change: 0,
              change_percent: 0
            };

            if (quoteResponse.ok) {
              const quoteData = await quoteResponse.json();
              if (quoteData.status === 'OK' && quoteData.results) {
                optionData.last = quoteData.results.p || 0;
                optionData.volume = quoteData.results.s || 0;
              }
            }

            // Try to get more detailed options data
            try {
              const detailResponse = await fetch(
                `https://api.polygon.io/v3/snapshot/options/${ticker}/${optionTicker}?apikey=${apiKey}`
              );
              
              if (detailResponse.ok) {
                const detailData = await detailResponse.json();
                if (detailData.results) {
                  const details = detailData.results;
                  optionData.open_interest = details.open_interest || 0;
                  optionData.volume = details.day?.volume || optionData.volume;
                  optionData.bid = details.last_quote?.ask || 0;
                  optionData.ask = details.last_quote?.bid || 0;
                  optionData.last = details.last_trade?.price || optionData.last;
                  optionData.change = details.day?.change || 0;
                  optionData.change_percent = details.day?.change_percent || 0;
                }
              }
            } catch (detailError) {
              console.warn('Could not fetch detailed options data:', detailError);
            }

            // Categorize as call or put
            if (contract.contract_type === 'call') {
              calls[contract.strike_price.toString()] = optionData;
            } else if (contract.contract_type === 'put') {
              puts[contract.strike_price.toString()] = optionData;
            }
          }
          
          // Small delay to respect API rate limits
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (batchError) {
          console.error('Error processing batch:', batchError);
        }
      }

      processedData[expDate] = {
        calls,
        puts,
        underlying_price: currentPrice,
        expiration_date: expDate
      };
    }

    return NextResponse.json({
      success: true,
      data: processedData,
      ticker: ticker,
      currentPrice: currentPrice,
      timestamp: new Date().toISOString(),
      note: "Real Polygon.io options chain data"
    });

  } catch (error) {
    console.error('Options chain API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch options chain data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}