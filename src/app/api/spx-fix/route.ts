import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker') || 'SPX';
  const specificExpiration = searchParams.get('expiration');
  const apiKey = process.env.POLYGON_API_KEY;

  try {
    // Get current SPX price
    let currentPrice: number | null = null;
    try {
      const priceRes = await fetch(`https://api.polygon.io/v2/last/trade/SPX?apikey=${apiKey}`);
      const priceData = await priceRes.json();
      if (priceData.status === 'OK' && priceData.results) {
        currentPrice = priceData.results.p;
      }
    } catch (error) {
    }

    if (specificExpiration) {
      let allContracts: any[] = [];
      let nextUrl: string | null = `https://api.polygon.io/v3/snapshot/options/I:SPX?expiration_date=${specificExpiration}&limit=250&apikey=${apiKey}`;     
      
      while (nextUrl && allContracts.length < 5000) {
        const response: Response = await fetch(nextUrl);
        const data: any = await response.json();
        
        if (data.status === 'OK' && data.results && data.results.length > 0) {
          allContracts.push(...data.results);

          if (!currentPrice && data.results[0]?.underlying_asset?.value) {
            currentPrice = data.results[0].underlying_asset.value;
          }

          nextUrl = data.next_url ? `${data.next_url}&apikey=${apiKey}` : null;
        } else {
          break;
        }
      }

      const calls: Record<string, any> = {};
      const puts: Record<string, any> = {};

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
        }
      });
      
      return NextResponse.json({
        success: true,
        data: {
          [specificExpiration]: { calls, puts }
        },
        currentPrice: currentPrice
      });
    }

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
          await new Promise(r => setTimeout(r, 100));
        } else {
          break;
        }
      } catch (error) {
        break;
      }
    }

    const validExpirations = Array.from(allExpirations).sort();
    const groupedByExpiration: Record<string, { calls: Record<string, any>; puts: Record<string, any> }> = {};

    for (const expDate of validExpirations) {
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

            if (currentPrice === null && contract.underlying_asset?.value) {
              currentPrice = contract.underlying_asset.value;
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
            }
          });
        }

        if (Object.keys(calls).length > 0 || Object.keys(puts).length > 0) {
          groupedByExpiration[expDate] = { calls, puts };
        }

        await new Promise(r => setTimeout(r, 100));
        
      } catch (error) {
        continue;
      }
    }

    const finalExpirationDates = Object.keys(groupedByExpiration).sort();

    return NextResponse.json({
      success: true,
      data: groupedByExpiration,
      currentPrice: currentPrice
    });

  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}