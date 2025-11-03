import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker');
    const weeks = parseInt(searchParams.get('weeks') || '3');
    
    if (!ticker) {
      return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
    }

    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) {
      console.error('❌ POLYGON_API_KEY not configured');
      return NextResponse.json({ 
        success: false, 
        error: 'POLYGON_API_KEY not configured' 
      }, { status: 500 });
    }

    // Helper function to get available strikes around current price
    const getAvailableStrikes = async (ticker: string, currentPrice: number, targetExp: string) => {
      try {
        // Fetch all available contracts for the target expiration
        const contractsRes = await fetch(
          `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&expiration_date=${targetExp}&limit=1000&apiKey=${apiKey}`
        );
        const contractsData = await contractsRes.json();
        
        if (!contractsData.results) return { callStrikes: [], putStrikes: [] };
        
        // Extract unique strike prices
        const allStrikes = [...new Set(contractsData.results.map((contract: any) => contract.strike_price))] as number[];
        allStrikes.sort((a, b) => a - b);
        
        // Find strikes around current price (10 OTM on each side)
        const atmIndex = allStrikes.findIndex(strike => strike >= currentPrice);
        
        const callStrikes = allStrikes.slice(atmIndex, atmIndex + 10); // 10 OTM calls
        const putStrikes = allStrikes.slice(Math.max(0, atmIndex - 10), atmIndex); // 10 OTM puts
        
        console.log(`📊 Available strikes for ${ticker} around $${currentPrice}:`);
        console.log(`   Calls: ${callStrikes.join(', ')}`);
        console.log(`   Puts: ${putStrikes.join(', ')}`);
        
        return { callStrikes, putStrikes };
      } catch (error) {
        console.error('Error fetching available strikes:', error);
        return { callStrikes: [], putStrikes: [] };
      }
    };

    const getNextMonthlyExpiration = () => {
      // Find next 3rd Friday of the month
      const today = new Date();
      let targetMonth = today.getMonth();
      let targetYear = today.getFullYear();
      
      // Check if we've passed this month's 3rd Friday
      const thisMonthThirdFriday = getThirdFriday(targetYear, targetMonth);
      if (today > thisMonthThirdFriday) {
        targetMonth++;
        if (targetMonth > 11) {
          targetMonth = 0;
          targetYear++;
        }
      }
      
      return getThirdFriday(targetYear, targetMonth);
    };

    const getNextQuadWitching = () => {
      // Find next quarterly expiration (March, June, September, December)
      const today = new Date();
      const quadMonths = [2, 5, 8, 11]; // March, June, Sept, Dec (0-indexed)
      let targetYear = today.getFullYear();
      
      // Find next quad month
      let nextQuadMonth = quadMonths.find(month => {
        const quadDate = getThirdFriday(targetYear, month);
        return quadDate > today;
      });
      
      // If no quad month this year, use March next year
      if (!nextQuadMonth) {
        nextQuadMonth = 2; // March
        targetYear++;
      }
      
      return getThirdFriday(targetYear, nextQuadMonth);
    };

    const getThirdFriday = (year: number, month: number) => {
      const firstDay = new Date(year, month, 1);
      const firstFridayDate = 1 + (5 - firstDay.getDay() + 7) % 7;
      const thirdFridayDate = firstFridayDate + 14;
      return new Date(year, month, thirdFridayDate);
    };

    const findClosestExpiration = (expirations: string[], targetDate: Date) => {
      if (!expirations?.length) return null;
      return expirations.reduce((closest, exp) => {
        const expDate = new Date(exp);
        return Math.abs(expDate.getTime() - targetDate.getTime()) <
          Math.abs(new Date(closest).getTime() - targetDate.getTime())
          ? exp
          : closest;
      });
    };

    // Fetch current price
    const priceRes = await fetch(`https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?apiKey=${apiKey}`);
    const priceJson = await priceRes.json();
    
    if (!priceJson.results?.[0]) {
      return NextResponse.json({ error: 'Could not fetch current price' }, { status: 404 });
    }
    
    const currentPrice = priceJson.results[0].c;

    // Instead of fetching all contracts, let's specifically look for our target dates
    const today = new Date().toISOString().split('T')[0];
    
    // Determine target expiration based on term type
    let targetDate: Date;
    let termType: string;
    
    if (weeks === 3) {
      targetDate = getNextMonthlyExpiration();
      termType = 'Monthly';
    } else {
      targetDate = getNextQuadWitching();
      termType = 'Quad Witching';
    }
    
    const targetDateString = targetDate.toISOString().split('T')[0];
    
    console.log(`🎯 Target type: ${termType}, Target date: ${targetDateString}`);
    
    // First, try to get contracts for the exact target date
    const exactDateRes = await fetch(
      `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&expiration_date=${targetDateString}&limit=1000&apiKey=${apiKey}`
    );
    const exactDateJson = await exactDateRes.json();
    
    console.log(`📊 Contracts found for exact date ${targetDateString}:`, exactDateJson.results?.length || 0);
    
    let expirations: string[] = [];
    
    if (exactDateJson.results?.length > 0) {
      // Use the exact target date if contracts exist
      expirations = [targetDateString];
      console.log(`✅ Using exact target date: ${targetDateString}`);
    } else {
      // Fallback: search within a range around the target date
      const startDate = new Date(targetDate);
      startDate.setDate(startDate.getDate() - 7);
      const endDate = new Date(targetDate);
      endDate.setDate(endDate.getDate() + 7);
      
      const rangeRes = await fetch(
        `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&expiration_date.gte=${startDate.toISOString().split('T')[0]}&expiration_date.lte=${endDate.toISOString().split('T')[0]}&limit=1000&apiKey=${apiKey}`
      );
      const rangeJson = await rangeRes.json();
      
      const rangeExpirations = [...new Set(rangeJson.results?.map((r: any) => r.expiration_date))] as string[];
      expirations = rangeExpirations.sort();
      
      console.log(`📅 Available expirations in range:`, expirations);
    }
    
    if (expirations.length === 0) {
      return NextResponse.json({ 
        error: 'No suitable expiration found',
        debug: { targetDate: targetDateString, termType }
      }, { status: 404 });
    }
    
    const targetExp = expirations.length === 1 ? expirations[0] : findClosestExpiration(expirations, targetDate);
    
    console.log(`📅 Total unique expirations found: ${expirations.length}`);
    console.log(`📅 Available expirations:`, expirations);
    console.log(`✅ Selected expiration: ${targetExp}`);
    
    if (!targetExp) {
      return NextResponse.json({ 
        error: 'No suitable expiration found',
        debug: { targetDate: targetDate.toISOString().split('T')[0], availableExpirations: expirations.slice(0, 10) }
      }, { status: 404 });
    }

    // Get available strikes around current price
    const { callStrikes, putStrikes } = await getAvailableStrikes(ticker, currentPrice, targetExp);
    
    if (callStrikes.length === 0 && putStrikes.length === 0) {
      return NextResponse.json({ 
        error: 'No available strikes found around current price',
        debug: { currentPrice, targetExp }
      }, { status: 404 });
    }

    // Fetch IV for options using the working logic
    const fetchOptionsIV = async (strikes: number[], optionType: string) => {
      const ivValues: number[] = [];
      for (const strike of strikes) {
        try {
          // Use the same format that worked in test: O:SPY251103P00675000 (without century)
          const optionTicker = `O:${ticker}${targetExp.replace(/-/g, '').substring(2)}${optionType}${String(strike * 1000).padStart(8, '0')}`;
          
          // Try multiple endpoints like in the working test
          const endpoints = [
            `https://api.polygon.io/v3/snapshot/options/${ticker}/${optionTicker}?apiKey=${apiKey}`,
            `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${optionTicker}?apiKey=${apiKey}`,
            `https://api.polygon.io/v3/reference/options/contracts/${optionTicker}?apiKey=${apiKey}`
          ];
          
          let foundIV = false;
          for (const endpoint of endpoints) {
            try {
              const res = await fetch(endpoint);
              const json = await res.json();
              if (json.results?.implied_volatility && !json.error) {
                ivValues.push(json.results.implied_volatility * 100);
                foundIV = true;
                break;
              }
            } catch (endpointErr) {
              continue;
            }
          }
          
          if (!foundIV) {
            console.log(`⚠️ No IV found for ${optionType} ${strike}`);
          }
          
        } catch (err) {
          console.error(`Error fetching ${optionType} ${strike}`, err);
        }
      }
      return ivValues.length ? ivValues.reduce((a, b) => a + b) / ivValues.length : null;
    };

    // Fetch IV for both calls and puts
    const [callIV, putIV] = await Promise.all([
      fetchOptionsIV(callStrikes, 'C'),
      fetchOptionsIV(putStrikes, 'P'),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        ticker,
        currentPrice,
        callIV,
        putIV,
        expiration: targetExp,
        weeksTarget: weeks,
        callStrikes,
        putStrikes,
        date: new Date().toISOString().split('T')[0]
      }
    });

  } catch (error: any) {
    console.error('❌ IV API Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Failed to fetch IV data' 
    }, { status: 500 });
  }
}