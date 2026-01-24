import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker') || searchParams.get('symbol') || 'SPY';
    const specificExpiration = searchParams.get('expiration');
    const apiKey = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

    try {
        // Get current stock price - handle SPX/VIX differently (use snapshot)
        let currentPrice = null;
        try {
            if (ticker === 'SPX' || ticker === 'VIX') {
                // For indices, get price from options snapshot
                const snapshotRes = await fetch(`https://api.polygon.io/v3/snapshot/options/I:${ticker}?limit=1&apikey=${apiKey}`);
                const snapshotData = await snapshotRes.json();
                if (snapshotData.status === 'OK' && snapshotData.results?.[0]?.underlying_asset) {
                    currentPrice = snapshotData.results[0].underlying_asset.value;
                }
            } else {
                // For regular stocks, use last trade
                const priceRes = await fetch(`https://api.polygon.io/v2/last/trade/${ticker}?apikey=${apiKey}`);
                const priceData = await priceRes.json();
                if (priceData.status === 'OK' && priceData.results) {
                    currentPrice = priceData.results.p || priceData.results.P;
                }
            }
        } catch (error) {
            console.error(`Failed to fetch current price for ${ticker}:`, error);
        }

        // If specific expiration requested, get only that expiration
        if (specificExpiration) {
            let allContracts: any[] = [];
            let nextUrl: string | null = `https://api.polygon.io/v3/snapshot/options/${ticker}?expiration_date=${specificExpiration}&limit=250&apikey=${apiKey}`;

            while (nextUrl) {
                const response: Response = await fetch(nextUrl);
                const data: any = await response.json();

                if (data.status !== 'OK') {
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

            // Process all contracts
            const calls: Record<string, any> = {};
            const puts: Record<string, any> = {};

            allContracts.forEach((contract: any) => {
                const strike = contract.details?.strike_price?.toString();
                const contractType = contract.details?.contract_type?.toLowerCase();

                if (!strike || !contractType) return;

                const contractData = {
                    open_interest: contract.open_interest || 0,
                    strike_price: contract.details.strike_price,
                    expiration_date: specificExpiration,
                    implied_volatility: contract.implied_volatility,
                    last_price: contract.last_quote?.last?.price || contract.day?.close || 0,
                    bid: contract.last_quote?.bid || 0,
                    ask: contract.last_quote?.ask || 0,
                    greeks: {
                        delta: contract.greeks?.delta,
                        gamma: contract.greeks?.gamma,
                        theta: contract.greeks?.theta,
                        vega: contract.greeks?.vega
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
                currentPrice,
                debug: {
                    totalContracts: allContracts.length,
                    callStrikes: Object.keys(calls).length,
                    putStrikes: Object.keys(puts).length,
                    requests: 'paginated'
                }
            });
        }

        // If no specific expiration, discover all available expirations
        let allExpirations = new Set<string>();
        let nextUrl: string | null = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&limit=1000&apikey=${apiKey}`;

        // Discover expirations using contracts API with pagination
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

                    // Check for next page
                    nextUrl = data.next_url ? `${data.next_url}&apikey=${apiKey}` : null;

                    // Rate limiting between requests
                    if (nextUrl) {
                        await new Promise(r => setTimeout(r, 100));
                    }
                } else {
                    break;
                }
            } catch (error) {
                break;
            }
        }

        const validExpirations = Array.from(allExpirations).sort();

        // Get snapshot data for each expiration
        const groupedByExpiration: Record<string, { calls: Record<string, any>; puts: Record<string, any> }> = {};

        for (const expDate of validExpirations) {
            try {
                // FETCH ALL PAGES for this expiration, not just first page
                let allContracts: any[] = [];
                let snapNextUrl: string | null = `https://api.polygon.io/v3/snapshot/options/${ticker}?expiration_date=${expDate}&limit=250&apikey=${apiKey}`;

                while (snapNextUrl) {
                    const snapRes = await fetch(snapNextUrl);
                    const snapData = await snapRes.json();

                    if (snapData.status === 'OK' && snapData.results && snapData.results.length > 0) {
                        allContracts.push(...snapData.results);
                    } else {
                        break;
                    }

                    snapNextUrl = snapData.next_url;
                    if (snapNextUrl && !snapNextUrl.includes(apiKey)) {
                        snapNextUrl += `&apikey=${apiKey}`;
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
                        strike_price: contract.details.strike_price,
                        expiration_date: expDate,
                        implied_volatility: contract.implied_volatility,
                        last_price: contract.last_quote?.last?.price || contract.day?.close || 0,
                        bid: contract.last_quote?.bid || 0,
                        ask: contract.last_quote?.ask || 0,
                        greeks: {
                            delta: contract.greeks?.delta,
                            gamma: contract.greeks?.gamma,
                            theta: contract.greeks?.theta,
                            vega: contract.greeks?.vega
                        }
                    };

                    if (contractType === 'call') {
                        calls[strike] = contractData;
                    } else if (contractType === 'put') {
                        puts[strike] = contractData;
                    }
                });

                groupedByExpiration[expDate] = { calls, puts };

            } catch (error) {
                groupedByExpiration[expDate] = { calls: {}, puts: {} };
            }

            await new Promise(r => setTimeout(r, 25));
        }

        const finalExpirationDates = Object.keys(groupedByExpiration).sort();

        return NextResponse.json({
            success: true,
            data: groupedByExpiration,
            currentPrice,
            debug: {
                expirationDatesFound: finalExpirationDates.length,
                earliestDate: finalExpirationDates[0],
                latestDate: finalExpirationDates[finalExpirationDates.length - 1]
            }
        });

    } catch (error) {
        console.error('Error fetching options data:', error);
        return NextResponse.json({
            success: false,
            error: 'Failed to fetch options data',
            data: {},
            currentPrice: null
        }, { status: 500 });
    }
}
