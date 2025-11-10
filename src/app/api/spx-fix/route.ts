import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker') || 'SPX';
  const specificExpiration = searchParams.get('expiration');
  const apiKey = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

  console.log(`🆕 SPX FIX ENDPOINT: ${ticker} -> I:SPX ${specificExpiration ? `(expiration: ${specificExpiration})` : '(all expirations)'}`);

  try {
    // Get current SPX price
    let currentPrice: number | null = null;
    try {
      const priceRes = await fetch(`https://api.polygon.io/v2/last/trade/SPX?apikey=${apiKey}`);
      const priceData = await priceRes.json();
      if (priceData.status === 'OK' && priceData.results) {
        currentPrice = priceData.results.p;
        console.log(`💰 SPX Current Price: ${currentPrice}`);
      }
    } catch (error) {
      console.error(`Failed to fetch SPX price:`, error);
    }

    if (specificExpiration) {
      // Single expiration with full pagination
      console.log(`📅 Fetching all contracts for specific expiration: ${specificExpiration}`);
      
      let allContracts: any[] = [];
      let nextUrl: string | null = `https://api.polygon.io/v3/snapshot/options/I:SPX?expiration_date=${specificExpiration}&limit=250&apikey=${apiKey}`;
      
      while (nextUrl && allContracts.length < 5000) {
        console.log(`🔄 Fetching: ${nextUrl}`);
        const response: Response = await fetch(nextUrl);
        const data: any = await response.json();
        
        if (data.status === 'OK' && data.results && data.results.length > 0) {
          allContracts.push(...data.results);
          console.log(`📈 Got ${data.results.length} contracts, total: ${allContracts.length}`);
          
          // Get price from first contract if not found yet
          if (!currentPrice && data.results[0]?.underlying_asset?.value) {
            currentPrice = data.results[0].underlying_asset.value;
            console.log(`💰 SPX Price from underlying: ${currentPrice}`);
          }
          
          nextUrl = data.next_url ? `${data.next_url}&apikey=${apiKey}` : null;
        } else {
          break;
        }
      }

      const calls: Record<string, any> = {};
      const puts: Record<string, any> = {};

      console.log(`🔍 SPX-FIX: Processing ${allContracts.length} contracts for ${specificExpiration}`);

      allContracts.forEach((contract: any) => {
        const strike = contract.details?.strike_price?.toString();
        const contractType = contract.details?.contract_type?.toLowerCase();
        
        if (!strike || !contractType) return;

        const contractData = {
          open_interest: contract.open_interest || 0,
          volume: contract.day?.volume || 0,
          strike_price: contract.details.strike_price,
          expiration_date: specificExpiration,
          implied_volatility: contract.implied_volatility,
          greeks: contract.greeks || {
            delta: 0,
            gamma: 0,
            theta: 0,
            vega: 0
          }
        };

        if (contractType === 'call') {
          calls[strike] = contractData;
        } else if (contractType === 'put') {
          puts[strike] = contractData;
          if (contractData.open_interest > 0) {
            console.log(`✅ SPX-FIX PUT: Strike ${strike} = OI ${contractData.open_interest}, Exp: ${specificExpiration || 'multi'}`);
          }
        }
      });

      console.log(`🎯 SPX-FIX RESPONSE: ${Object.keys(calls).length} calls, ${Object.keys(puts).length} puts`);
      
      return NextResponse.json({
        success: true,
        data: {
          [specificExpiration]: { calls, puts }
        },
        currentPrice: currentPrice
      });
    }

    // Multi-expiration: Get all available expirations first
    console.log(`🔍 Discovering all SPX expiration dates`);
    
    let allExpirations = new Set<string>();
    let nextUrl: string | null = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=SPX&limit=1000&apikey=${apiKey}`;

    while (nextUrl) {
      try {
        const res: Response = await fetch(nextUrl);
        const data: any = await res.json();
        
        if (data.status === 'OK' && data.results && data.results.length > 0) {
          data.results.forEach((contract: any) => {
            if (contract.expiration_date) {
              allExpirations.add(contract.expiration_date);
            }
          });
          
          nextUrl = data.next_url ? `${data.next_url}&apikey=${apiKey}` : null;
          await new Promise(r => setTimeout(r, 100)); // Rate limiting
        } else {
          break;
        }
      } catch (error) {
        console.error(`Error fetching contracts:`, error);
        break;
      }
    }

    const validExpirations = Array.from(allExpirations).sort();
    console.log(`� Found ${validExpirations.length} SPX expirations`);

    // Get snapshot data for each expiration with FULL PAGINATION
    const groupedByExpiration: Record<string, { calls: Record<string, any>; puts: Record<string, any> }> = {};

    for (const expDate of validExpirations) {
      // Use full pagination for each expiration like single expiration does
      let allContracts: any[] = [];
      let nextUrl: string | null = `https://api.polygon.io/v3/snapshot/options/I:SPX?expiration_date=${expDate}&limit=250&apikey=${apiKey}`;
      
      while (nextUrl && allContracts.length < 5000) {
        try {
          const snapRes: Response = await fetch(nextUrl);
          const snapData: any = await snapRes.json();
          
          if (snapData.status === 'OK' && snapData.results && snapData.results.length > 0) {
            allContracts.push(...snapData.results);
            nextUrl = snapData.next_url ? `${snapData.next_url}&apikey=${apiKey}` : null;
          } else {
            break;
          }
        } catch (error) {
          console.error(`Error fetching batch for ${expDate}:`, error);
          break;
        }
      }
      
      try {
        const calls: Record<string, any> = {};
        const puts: Record<string, any> = {};

        if (allContracts.length > 0) {
          allContracts.forEach((contract: any) => {
            const strike = contract.details?.strike_price?.toString();
            const contractType = contract.details?.contract_type?.toLowerCase();
            
            if (!strike || !contractType) return;

            // Get price from first contract if not found yet
            if (!currentPrice && contract.underlying_asset?.value) {
              currentPrice = contract.underlying_asset.value;
              console.log(`💰 SPX Price from ${expDate}: ${currentPrice}`);
            }

            const contractData = {
              open_interest: contract.open_interest || 0,
              volume: contract.day?.volume || 0,
              strike_price: contract.details.strike_price,
              expiration_date: expDate,
              implied_volatility: contract.implied_volatility,
              greeks: contract.greeks || {
                delta: 0,
                gamma: 0,
                theta: 0,
                vega: 0
              }
            };

            if (contractType === 'call') {
              calls[strike] = contractData;
            } else if (contractType === 'put') {
              puts[strike] = contractData;
              if (contractData.open_interest > 0) {
                console.log(`🟣 SPX MULTI-EXP PUT: Strike ${strike} = OI ${contractData.open_interest}, Exp: ${expDate}`);
              }
            }
          });
        }

        if (Object.keys(calls).length > 0 || Object.keys(puts).length > 0) {
          groupedByExpiration[expDate] = { calls, puts };
          console.log(`📊 SPX EXP ${expDate}: ${Object.keys(calls).length} calls, ${Object.keys(puts).length} puts (from ${allContracts.length} total contracts)`);
          
          // Debug specific strikes for Nov 10
          if (expDate === '2025-11-10') {
            console.log(`🎯 NOV 10 PUT DEBUGGING (FIXED PAGINATION):`);
            console.log(`  6700 PUT: ${puts['6700'] ? puts['6700'].open_interest : 'NOT FOUND'}`);
            console.log(`  6750 PUT: ${puts['6750'] ? puts['6750'].open_interest : 'NOT FOUND'}`);
            console.log(`  6850 PUT: ${puts['6850'] ? puts['6850'].open_interest : 'NOT FOUND'}`);
            console.log(`  6900 PUT: ${puts['6900'] ? puts['6900'].open_interest : 'NOT FOUND'}`);
            console.log(`  Total puts with OI > 0: ${Object.values(puts).filter((p: any) => p.open_interest > 0).length}`);
          }
        }

        // Rate limiting
        await new Promise(r => setTimeout(r, 100));
        
      } catch (error) {
        console.error(`Error processing contracts for ${expDate}:`, error);
        continue;
      }
    }

    const finalExpirationDates = Object.keys(groupedByExpiration).sort();
    console.log(`✅ Returning SPX data for ${finalExpirationDates.length} expiration dates`);
    
    // Debug: Summary of put OI by expiration
    finalExpirationDates.forEach(exp => {
      const putCount = Object.keys(groupedByExpiration[exp].puts).length;
      const putsWithOI = Object.values(groupedByExpiration[exp].puts).filter((p: any) => p.open_interest > 0).length;
      if (putsWithOI > 0) {
        console.log(`🎯 ${exp}: ${putsWithOI}/${putCount} puts have OI`);
      }
    });

    return NextResponse.json({
      success: true,
      data: groupedByExpiration,
      currentPrice: currentPrice
    });

  } catch (error) {
    console.error('SPX Fix Error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}