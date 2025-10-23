import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
 const { searchParams } = new URL(request.url);
 const ticker = searchParams.get('ticker') || searchParams.get('symbol') || 'SPY';
 const specificExpiration = searchParams.get('expiration');
 const apiKey = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

 try {
 console.log(` FRESH API: Fetching options data for ${ticker}${specificExpiration ? ` expiration ${specificExpiration}` : ''}`);

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
 console.log(` Fetching data for specific expiration: ${specificExpiration}`);
 
 // Use a higher limit and make multiple requests if needed
 let allContracts: any[] = [];
 let nextUrl: string | null = `https://api.polygon.io/v3/snapshot/options/${ticker}?expiration_date=${specificExpiration}&limit=250&apikey=${apiKey}`;
 
 while (nextUrl && allContracts.length < 5000) { // Safety limit
 console.log(` Fetching: ${nextUrl}`);
 const response: Response = await fetch(nextUrl);
 const data: any = await response.json();
 
 if (data.status !== 'OK') {
 console.error(` API Error: ${data.status} - ${data.error}`);
 break;
 }
 
 if (data.results && data.results.length > 0) {
 allContracts.push(...data.results);
 console.log(` Got ${data.results.length} contracts, total: ${allContracts.length}`);
 }
 
 // Check for pagination
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

 console.log(` Processed ${Object.keys(calls).length} calls and ${Object.keys(puts).length} puts for ${specificExpiration}`);

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
 console.log(` Discovering all expiration dates for ${ticker}`);
 
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
 console.error(`Error fetching contracts:`, error);
 break;
 }
 }

 // Allow any expiration dates available (no day-of-week filtering)
 const validExpirations = Array.from(allExpirations)
 .sort();

 console.log(` Found ${validExpirations.length} available expirations`);

 // Get snapshot data for each expiration
 const groupedByExpiration: Record<string, { calls: Record<string, any>; puts: Record<string, any> }> = {};

 for (const expDate of validExpirations) {
 const snapUrl = `https://api.polygon.io/v3/snapshot/options/${ticker}?expiration_date=${expDate}&limit=250&apikey=${apiKey}`;
 
 try {
 const snapRes = await fetch(snapUrl);
 const snapData = await snapRes.json();
 
 const calls: Record<string, any> = {};
 const puts: Record<string, any> = {};

 if (snapData.status === 'OK' && snapData.results) {
 snapData.results.forEach((contract: any) => {
 const strike = contract.details?.strike_price?.toString();
 const contractType = contract.details?.contract_type?.toLowerCase();
 
 if (!strike || !contractType) return;

 const contractData = {
 open_interest: contract.open_interest || 0,
 strike_price: contract.details.strike_price,
 expiration_date: expDate,
 implied_volatility: contract.implied_volatility,
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
 }

 groupedByExpiration[expDate] = { calls, puts };
 
 } catch (error) {
 console.error(`Error fetching snapshot for ${expDate}:`, error);
 groupedByExpiration[expDate] = { calls: {}, puts: {} };
 }
 
 // Rate limiting
 await new Promise(r => setTimeout(r, 25));
 }

 const finalExpirationDates = Object.keys(groupedByExpiration).sort();
 console.log(` Returning data for ${finalExpirationDates.length} expiration dates`);

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