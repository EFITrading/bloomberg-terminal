import { NextRequest, NextResponse } from 'next/server';

// Black-Scholes Gamma calculation
function calculateGamma(S: number, K: number, T: number, IV: number, r: number = 0.05): number {
    if (T <= 0 || IV <= 0) return 0;

    const d1 = (Math.log(S / K) + (r + 0.5 * IV * IV) * T) / (IV * Math.sqrt(T));
    const nPrimeD1 = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * d1 * d1);
    const gamma = nPrimeD1 / (S * IV * Math.sqrt(T));

    return gamma;
}

// Black-Scholes Delta calculation
function calculateDelta(S: number, K: number, T: number, IV: number, r: number = 0.05, isCall: boolean = true): number {
    if (T <= 0 || IV <= 0) return isCall ? 1 : -1;

    const d1 = (Math.log(S / K) + (r + 0.5 * IV * IV) * T) / (IV * Math.sqrt(T));

    const normalCDF = (x: number) => {
        const t = 1 / (1 + 0.2316419 * Math.abs(x));
        const d = 0.3989423 * Math.exp(-x * x / 2);
        const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
        return x > 0 ? 1 - p : p;
    };

    return isCall ? normalCDF(d1) : normalCDF(d1) - 1;
}

// Vanna calculation
function calculateVanna(K: number, S: number, T: number, IV: number): number {
    if (T <= 0 || IV <= 0) return 0;

    const d1 = (Math.log(S / K) + (0.5 * IV * IV * T)) / (IV * Math.sqrt(T));
    const d2 = d1 - IV * Math.sqrt(T);
    const nPrimeD1 = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * d1 * d1);
    const vanna = -nPrimeD1 * d2 / (S * IV * Math.sqrt(T));

    return vanna;
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker') || 'SPY';
    const expiration = searchParams.get('expiration');
    const date = searchParams.get('date'); // YYYY-MM-DD format
    const apiKey = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

    if (!expiration) {
        return NextResponse.json({
            success: false,
            error: 'Expiration date required'
        }, { status: 400 });
    }

    try {
        const targetDate = date || new Date().toISOString().split('T')[0];

        // Step 1: Fetch historical stock prices (5-min bars)
        console.log(`Fetching historical prices for ${ticker} on ${targetDate}...`);
        const pricesUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/5/minute/${targetDate}/${targetDate}?adjusted=true&sort=asc&limit=50000&apikey=${apiKey}`;
        const pricesResponse = await fetch(pricesUrl);
        const pricesData = await pricesResponse.json();

        if (!pricesData.results || pricesData.results.length === 0) {
            return NextResponse.json({
                success: false,
                error: 'No historical price data available for this date'
            }, { status: 404 });
        }

        // Step 2: Fetch current options data (OI, IV)
        console.log(`Fetching options data for ${ticker} expiration ${expiration}...`);
        const optionsUrl = `https://api.polygon.io/v3/snapshot/options/${ticker}?limit=250&apikey=${apiKey}`;

        let allContracts: any[] = [];
        let nextUrl: string | null = optionsUrl;

        while (nextUrl) {
            const response: Response = await fetch(nextUrl);
            const data: any = await response.json();

            if (data.status !== 'OK') break;

            if (data.results && data.results.length > 0) {
                allContracts.push(...data.results);
            }

            nextUrl = data.next_url;
            if (nextUrl && !nextUrl.includes('apikey=')) {
                nextUrl += `&apikey=${apiKey}`;
            }

            if (nextUrl) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

        // Filter by expiration
        const contracts = allContracts.filter(c => c.details?.expiration_date === expiration);

        if (contracts.length === 0) {
            return NextResponse.json({
                success: false,
                error: 'No options contracts found for this expiration'
            }, { status: 404 });
        }

        // Calculate time to expiration
        const expirationDate = new Date(expiration);
        const today = new Date();
        const T = Math.max((expirationDate.getTime() - today.getTime()) / (365 * 24 * 60 * 60 * 1000), 0.001);

        // Step 3: Process each historical price bar
        const historicalData = pricesData.results.map((bar: any) => {
            const spotPrice = bar.c; // Close price
            const timestamp = new Date(bar.t);

            // Calculate GEX for all strikes at this price
            const gexByStrike: { [strike: string]: { netGEX: number; callGEX: number; putGEX: number; callGamma: number; putGamma: number } } = {};

            contracts.forEach((contract: any) => {
                const strike = contract.details?.strike_price;
                const contractType = contract.details?.contract_type?.toLowerCase();
                const oi = contract.open_interest || 0;
                const iv = contract.implied_volatility || 0.3;

                if (!strike || !contractType || oi === 0 || iv === 0) return;

                const isCall = contractType === 'call';

                // Recalculate gamma at this spot price
                const gamma = calculateGamma(spotPrice, strike, T, iv);
                const delta = calculateDelta(spotPrice, strike, T, iv, 0.05, isCall);
                const vanna = calculateVanna(strike, spotPrice, T, iv);

                // Calculate GEX
                const multiplier = isCall ? 1 : -1;
                const gex = multiplier * gamma * oi * (spotPrice * spotPrice) * 100;

                // Calculate Dealer GEX
                const beta = 0.25;
                const rho_S_sigma = -0.7;
                const wT = 1 / Math.sqrt(T);
                const gammaEff = gamma + beta * vanna * rho_S_sigma;
                const liveWeight = Math.abs(delta) * (1 - Math.abs(delta));
                const dealerGex = multiplier * oi * gammaEff * liveWeight * wT * spotPrice * 100;

                if (!gexByStrike[strike]) {
                    gexByStrike[strike] = { netGEX: 0, callGEX: 0, putGEX: 0, callGamma: 0, putGamma: 0 };
                }

                if (isCall) {
                    gexByStrike[strike].callGEX = gex;
                    gexByStrike[strike].callGamma = gamma;
                } else {
                    gexByStrike[strike].putGEX = gex;
                    gexByStrike[strike].putGamma = gamma;
                }

                gexByStrike[strike].netGEX = gexByStrike[strike].callGEX + gexByStrike[strike].putGEX;
            });

            // Calculate total net GEX
            const totalNetGEX = Object.values(gexByStrike).reduce((sum, data) => sum + data.netGEX, 0);

            return {
                timestamp: timestamp.toISOString(),
                price: spotPrice,
                volume: bar.v,
                totalNetGEX,
                gexByStrike
            };
        });

        // Get top 5 strikes by absolute net GEX at current price
        const lastBar = historicalData[historicalData.length - 1];
        const topStrikes = Object.entries(lastBar.gexByStrike)
            .sort((a: any, b: any) => Math.abs(b[1].netGEX) - Math.abs(a[1].netGEX))
            .slice(0, 5)
            .map(([strike]) => parseFloat(strike));

        return NextResponse.json({
            success: true,
            data: {
                ticker,
                expiration,
                date: targetDate,
                bars: historicalData.length,
                topStrikes,
                historicalData
            }
        });

    } catch (error: any) {
        console.error('Error fetching historical GEX:', error);
        return NextResponse.json({
            success: false,
            error: error.message || 'Failed to fetch historical GEX data'
        }, { status: 500 });
    }
}
