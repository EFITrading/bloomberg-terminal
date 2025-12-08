import { NextRequest, NextResponse } from 'next/server';

// Cache for dealer premium data
const dealerCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 120000; // 2 minutes

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker') || searchParams.get('symbol') || 'SPY';
  const specificExpiration = searchParams.get('expiration');
  const apiKey = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

  try {
    // Check cache first
    const cacheKey = `${ticker}_${specificExpiration || 'all'}`;
    const cached = dealerCache.get(cacheKey);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < CACHE_TTL) {
      console.log(`⚡ DEALER CACHE HIT: ${ticker} (${Math.round((now - cached.timestamp) / 1000)}s old)`);
      return NextResponse.json(cached.data);
    }

    console.log(`🔥 DEALER CACHE MISS: Fetching fresh data for ${ticker}${specificExpiration ? ` expiration ${specificExpiration}` : ''}`);

    // Get current stock price
    let currentPrice = null;
    try {
      const priceRes = await fetch(`https://api.polygon.io/v2/last/trade/${ticker}?apikey=${apiKey}`);
      const priceData = await priceRes.json();
      if (priceData.status === 'OK' && priceData.results) {
        currentPrice = priceData.results.p;
      }
    } catch (error) {
      console.error(`Failed to fetch current price for ${ticker}:`, error);
    }

    // If specific expiration requested, get only that expiration
    if (specificExpiration) {
      console.log(`📅 Fetching dealer data for specific expiration: ${specificExpiration}`);
      
      let allContracts: any[] = [];
      let nextUrl: string | null = `https://api.polygon.io/v3/snapshot/options/${ticker}?expiration_date=${specificExpiration}&limit=250&apiKey=${apiKey}`;
      
      while (nextUrl && allContracts.length < 5000) {
        const response: Response = await fetch(nextUrl);
        const data: any = await response.json();
        
        if (data.status !== 'OK') {
          console.error(`❌ API Error: ${data.status} - ${data.error}`);
          break;
        }
        
        if (data.results && data.results.length > 0) {
          allContracts.push(...data.results);
        }
        
        nextUrl = data.next_url || null;
        if (nextUrl && !nextUrl.includes(apiKey)) {
          nextUrl += `&apikey=${apiKey}`;
        }
      }

      if (allContracts.length === 0) {
        return NextResponse.json({
          success: false,
          error: `No options data found for ${ticker} expiration ${specificExpiration}`,
          data: {},
          currentPrice
        });
      }

      // Process contracts with premium calculations
      const calls: Record<string, any> = {};
      const puts: Record<string, any> = {};

      allContracts.forEach((contract: any) => {
        const strike = contract.details?.strike_price;
        const type = contract.details?.contract_type;
        
        if (!strike || !type) return;

        const strikeKey = strike.toString();
        const last_quote = contract.last_quote || {};
        const day = contract.day || {};
        const greeks = contract.greeks || {};

        const optionData = {
          strike_price: strike,
          bid: last_quote.bid || 0,
          ask: last_quote.ask || 0,
          last: day.last_price || 0,
          open_interest: contract.open_interest || 0,
          volume: day.volume || 0,
          implied_volatility: contract.implied_volatility || 0,
          delta: greeks.delta || 0,
          gamma: greeks.gamma || 0,
          theta: greeks.theta || 0,
          vega: greeks.vega || 0,
          greeks: {
            delta: greeks.delta || 0,
            gamma: greeks.gamma || 0,
            theta: greeks.theta || 0,
            vega: greeks.vega || 0
          },
          // Calculate premium
          mid_price: ((last_quote.bid || 0) + (last_quote.ask || 0)) / 2,
          premium: ((contract.open_interest || 0) * (((last_quote.bid || 0) + (last_quote.ask || 0)) / 2) * 100)
        };

        if (type === 'call') {
          calls[strikeKey] = optionData;
        } else if (type === 'put') {
          puts[strikeKey] = optionData;
        }
      });

      const result = {
        success: true,
        data: {
          [specificExpiration]: {
            calls,
            puts,
            underlying_price: currentPrice
          }
        },
        currentPrice
      };

      // Cache the result
      dealerCache.set(cacheKey, { data: result, timestamp: now });

      return NextResponse.json(result);
    }

    // Get all available expirations
    console.log(`📅 Fetching all expirations for ${ticker}`);
    
    let allContracts: any[] = [];
    let nextUrl: string | null = `https://api.polygon.io/v3/snapshot/options/${ticker}?limit=250&apiKey=${apiKey}`;
    
    while (nextUrl && allContracts.length < 10000) {
      const response: Response = await fetch(nextUrl);
      const data: any = await response.json();
      
      if (data.status !== 'OK') break;
      
      if (data.results && data.results.length > 0) {
        allContracts.push(...data.results);
      }
      
      nextUrl = data.next_url || null;
      if (nextUrl && !nextUrl.includes(apiKey)) {
        nextUrl += `&apikey=${apiKey}`;
      }
    }

    // Group by expiration
    const expirationMap: Record<string, any> = {};

    allContracts.forEach((contract: any) => {
      const expiration = contract.details?.expiration_date;
      const strike = contract.details?.strike_price;
      const type = contract.details?.contract_type;
      
      if (!expiration || !strike || !type) return;

      if (!expirationMap[expiration]) {
        expirationMap[expiration] = {
          calls: {},
          puts: {},
          underlying_price: currentPrice
        };
      }

      const strikeKey = strike.toString();
      const last_quote = contract.last_quote || {};
      const day = contract.day || {};
      const greeks = contract.greeks || {};

      const optionData = {
        strike_price: strike,
        bid: last_quote.bid || 0,
        ask: last_quote.ask || 0,
        last: day.last_price || 0,
        open_interest: contract.open_interest || 0,
        volume: day.volume || 0,
        implied_volatility: contract.implied_volatility || 0,
        delta: greeks.delta || 0,
        gamma: greeks.gamma || 0,
        theta: greeks.theta || 0,
        vega: greeks.vega || 0,
        greeks: {
          delta: greeks.delta || 0,
          gamma: greeks.gamma || 0,
          theta: greeks.theta || 0,
          vega: greeks.vega || 0
        },
        mid_price: ((last_quote.bid || 0) + (last_quote.ask || 0)) / 2,
        premium: ((contract.open_interest || 0) * (((last_quote.bid || 0) + (last_quote.ask || 0)) / 2) * 100)
      };

      if (type === 'call') {
        expirationMap[expiration].calls[strikeKey] = optionData;
      } else if (type === 'put') {
        expirationMap[expiration].puts[strikeKey] = optionData;
      }
    });

    const result = {
      success: true,
      data: expirationMap,
      currentPrice
    };

    // Cache the result
    dealerCache.set(cacheKey, { data: result, timestamp: now });

    return NextResponse.json(result);

  } catch (error) {
    console.error('Dealer Options Premium API Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      data: {},
      currentPrice: null
    }, { status: 500 });
  }
}
