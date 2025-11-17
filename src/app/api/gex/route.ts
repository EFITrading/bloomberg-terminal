import { NextRequest, NextResponse } from 'next/server';

interface OptionData {
 open_interest?: number;
 greeks?: {
 gamma?: number;
 };
}

interface GEXByStrike {
 [strike: number]: {
 callGEX: number;
 putGEX: number;
 netGEX: number;
 };
}

interface LiveOIEntry {
 ticker: string;
 strike: number;
 type: string;
 expiry: string;
 liveOI: number;
}

// POST endpoint for GEX calculation with live OI
export async function POST(request: NextRequest) {
 try {
 const body = await request.json();
 const { symbol, liveOI } = body;
 
 if (!symbol || !liveOI || !Array.isArray(liveOI)) {
 return NextResponse.json({ 
 success: false, 
 error: 'Invalid request: symbol and liveOI array required' 
 }, { status: 400 });
 }
 
    console.log(`🔥 POST /api/gex: Computing GEX with ${liveOI.length} live OI entries for ${symbol}`);
    
    // Create live OI map for quick lookups
    const liveOIMap = new Map<string, number>();
    liveOI.forEach((entry: LiveOIEntry) => {
      const key = `${entry.ticker}_${entry.strike}_${entry.type}_${entry.expiry}`;
      liveOIMap.set(key, entry.liveOI);
    });
    
    // Log sample of what we received
    console.log(`📊 Sample live OI entries received:`, liveOI.slice(0, 3));
    console.log(`📊 Sample keys in liveOIMap:`, Array.from(liveOIMap.keys()).slice(0, 3));
    
    // Debug: Log expiration format we'll be checking against
    console.log(`🔍 Note: API will check keys with expiration format from options chain`); // Get all expiration dates
 const host = request.nextUrl.host;
 const protocol = request.nextUrl.protocol;
 const baseUrl = `${protocol}//${host}`;
 const allExpResponse = await fetch(`${baseUrl}/api/options-chain?ticker=${symbol}`);
 const allExpResult = await allExpResponse.json();
 
 if (!allExpResult.success) {
 throw new Error('Failed to get expiration dates');
 }
 
 const expirationDates = Object.keys(allExpResult.data).sort();
 const spotPrice = allExpResult.currentPrice;
 
 // Filter for next 45 days only
 const today = new Date();
 const fortyFiveDaysOut = new Date(today.getTime() + 45 * 24 * 60 * 60 * 1000);
 
 const validExpirations = expirationDates.filter(date => {
 const expDate = new Date(date);
 return expDate <= fortyFiveDaysOut && expDate >= today;
 });
 
 console.log(` ${expirationDates.length} total expirations, ${validExpirations.length} within 45 days`);
 console.log(` Using LIVE OI instead of snapshot OI for ${liveOIMap.size} contracts`);
 
 // BULK PARALLEL PROCESSING
 const gexByStrike: any = {};
 let totalCallGEX = 0;
 let totalPutGEX = 0;
 let liveOIUsedCount = 0;
 
 const startTime = Date.now();
 const allRequests = validExpirations.map(expDate => 
 fetch(`${baseUrl}/api/options-chain?ticker=${symbol}&expiration=${expDate}`)
 .then(response => response.json())
 .then(result => ({ expDate, result }))
 .catch(error => ({ expDate, error }))
 );
 
 const allResults = await Promise.all(allRequests);
 console.log(` Fetched ${validExpirations.length} expirations in ${Date.now() - startTime}ms`);
 
 for (const requestResult of allResults) {
 if ('error' in requestResult) {
 console.warn(` Failed to fetch ${requestResult.expDate}:`, requestResult.error);
 continue;
 }
 
 const { expDate, result } = requestResult;
 if (result.success && result.data[expDate]) {
 const { calls, puts } = result.data[expDate];
 
 // Debug: Log first expDate to see format
 if (liveOIUsedCount === 0 && calls && Object.keys(calls).length > 0) {
 const firstStrike = Object.keys(calls)[0];
 const exampleKey = `${symbol}_${firstStrike}_C_${expDate}`;
 console.log(`🔍 First expDate: "${expDate}"`);
 console.log(`🔍 Example key: "${exampleKey}"`);
 console.log(`🔍 In liveOIMap? ${liveOIMap.has(exampleKey)}`);
 }
 
 // Process calls
 if (calls) {
 Object.entries(calls).forEach(([strike, data]) => {
 const optionData = data as OptionData;
 const strikeNum = parseFloat(strike);
                const contractKey = `${symbol}_${strike}_C_${expDate}`;
                
                // Use LIVE OI if available, otherwise use snapshot OI
                const oi = liveOIMap.has(contractKey) 
                  ? liveOIMap.get(contractKey)! 
                  : (optionData.open_interest || 0);
                
                if (liveOIMap.has(contractKey)) {
                  liveOIUsedCount++;
                  console.log(`✅ Using live OI for ${contractKey}: ${oi} (snapshot was ${optionData.open_interest})`);
                } const gamma = optionData.greeks?.gamma || 0;
 
 if (oi > 0 && gamma) {
 const gex = gamma * oi * (spotPrice * spotPrice) * 100;
 
 if (!gexByStrike[strikeNum]) {
 gexByStrike[strikeNum] = { callGEX: 0, putGEX: 0, netGEX: 0 };
 }
 gexByStrike[strikeNum].callGEX += gex;
 totalCallGEX += gex;
 }
 });
 }
 
 // Process puts
 if (puts) {
 Object.entries(puts).forEach(([strike, data]) => {
 const strikeNum = parseFloat(strike);
 const optionData = data as any;
 const contractKey = `${symbol}_${strike}_P_${expDate}`;
 
 // Use LIVE OI if available, otherwise use snapshot OI
 const oi = liveOIMap.has(contractKey) 
 ? liveOIMap.get(contractKey)! 
 : (optionData.open_interest || 0);
 
 if (liveOIMap.has(contractKey)) {
 liveOIUsedCount++;
 }
 
 const gamma = optionData.greeks?.gamma || 0;
 
 if (oi > 0 && gamma) {
 const gex = -gamma * oi * (spotPrice * spotPrice) * 100;
 
 if (!gexByStrike[strikeNum]) {
 gexByStrike[strikeNum] = { callGEX: 0, putGEX: 0, netGEX: 0 };
 }
 gexByStrike[strikeNum].putGEX += gex;
 totalPutGEX += gex;
 }
 });
 }
 }
 }
 
 console.log(` 🔥 Used live OI for ${liveOIUsedCount} out of ${liveOIMap.size} contracts provided`);
 
 // Calculate net GEX for each strike
 Object.keys(gexByStrike).forEach(strike => {
 const data = gexByStrike[strike];
 data.netGEX = data.callGEX + data.putGEX;
 });
 
 const totalNetGEX = totalCallGEX + totalPutGEX;
 
 // Find significant levels
 const levels = Object.entries(gexByStrike)
 .map(([strike, data]) => ({ strike: parseFloat(strike), ...(data as any) }))
 .sort((a, b) => Math.abs(b.netGEX) - Math.abs(a.netGEX));
 
 const callWalls = levels.filter(l => l.callGEX > 0).slice(0, 5);
 const putWalls = levels.filter(l => l.putGEX < 0).slice(0, 5);
 
 // Find zero gamma level
 let zeroGammaLevel = spotPrice;
 for (let i = 0; i < levels.length - 1; i++) {
 const curr = levels[i];
 const next = levels[i + 1];
 if ((curr.netGEX > 0 && next.netGEX < 0) || (curr.netGEX < 0 && next.netGEX > 0)) {
 zeroGammaLevel = (curr.strike + next.strike) / 2;
 break;
 }
 }
 
 // Find GEX flip level
 let gexFlipLevel = spotPrice;
 let maxAbsGEX = 0;
 
 Object.entries(gexByStrike).forEach(([strikeStr, data]) => {
 const strike = parseFloat(strikeStr);
 const gexData = data as { callGEX: number; putGEX: number; netGEX: number };
 const absNetGEX = Math.abs(gexData.netGEX);
 
 if (absNetGEX > maxAbsGEX) {
 maxAbsGEX = absNetGEX;
 gexFlipLevel = strike;
 }
 });
 
 const isPositiveGamma = totalNetGEX > 0;
 const gammaEnvironment = isPositiveGamma ? 'POSITIVE' : 'NEGATIVE';
 
 console.log(` ✅ LIVE GEX RESULTS: CallGEX=${totalCallGEX.toFixed(0)}, PutGEX=${totalPutGEX.toFixed(0)}, NetGEX=${totalNetGEX.toFixed(0)}`);
 console.log(` ${gammaEnvironment} gamma | Flip: $${gexFlipLevel.toFixed(2)} | Zero: $${zeroGammaLevel.toFixed(2)}`);
 
 return NextResponse.json({
 success: true,
 symbol,
 spotPrice,
 gexData: {
 totalCallGEX,
 totalPutGEX,
 totalNetGEX,
 zeroGammaLevel,
 gexFlipLevel,
 isPositiveGamma,
 gammaEnvironment,
 callWalls: callWalls.map(w => ({ strike: w.strike, gex: w.callGEX })),
 putWalls: putWalls.map(w => ({ strike: w.strike, gex: Math.abs(w.putGEX) })),
 gexByStrike
 },
 liveOIStats: {
 provided: liveOIMap.size,
 used: liveOIUsedCount,
 expirations: validExpirations.length
 }
 });
 
 } catch (error) {
 console.error('❌ POST /api/gex error:', error);
 return NextResponse.json({ 
 success: false, 
 error: (error as Error).message 
 }, { status: 500 });
 }
}

// Original GET endpoint for backward compatibility
export async function GET(request: NextRequest) {
 const { searchParams } = new URL(request.url);
 const symbol = searchParams.get('symbol') || 'SPY';

 try {
 console.log(` GEX: Getting ALL expiration data for ${symbol} like analysis suite`);

 // Get all expiration dates - use current request host
 const host = request.nextUrl.host;
 const protocol = request.nextUrl.protocol;
 const baseUrl = `${protocol}//${host}`;
 const allExpResponse = await fetch(`${baseUrl}/api/options-chain?ticker=${symbol}`);
 const allExpResult = await allExpResponse.json();

 if (!allExpResult.success) {
 throw new Error('Failed to get expiration dates');
 }

 const expirationDates = Object.keys(allExpResult.data).sort();
 const spotPrice = allExpResult.currentPrice;
 
 // Filter for next 45 days only
 const today = new Date();
 const fortyFiveDaysOut = new Date(today.getTime() + 45 * 24 * 60 * 60 * 1000);
 
 const validExpirations = expirationDates.filter(date => {
 const expDate = new Date(date);
 return expDate <= fortyFiveDaysOut && expDate >= today;
 });
 
 console.log(` ${expirationDates.length} total expirations found, ${validExpirations.length} within next 45 days, spot: $${spotPrice}`);
 console.log(` 45-day expirations: ${validExpirations.join(', ')}`);

 // Use ALL available strikes - no range restrictions for comprehensive GEX analysis
 console.log(` Scanning ALL strikes for ${symbol} - no range restrictions (spot: $${spotPrice})`);

 // BULK PARALLEL PROCESSING - Combine all strikes from next 45 days expirations
 const gexByStrike: any = {};
 let totalCallGEX = 0;
 let totalPutGEX = 0;

 console.log(` Starting BULK parallel requests for ${validExpirations.length} expirations...`);
 const startTime = Date.now();
 
 const allRequests = validExpirations.map(expDate => 
 fetch(`${baseUrl}/api/options-chain?ticker=${symbol}&expiration=${expDate}`)
 .then(response => response.json())
 .then(result => ({ expDate, result }))
 .catch(error => ({ expDate, error }))
 );
 
 // Execute all requests in parallel - NO WAITING
 const allResults = await Promise.all(allRequests);
 
 console.log(` BULK requests completed in ${Date.now() - startTime}ms for ${validExpirations.length} expirations`);
 
 for (const requestResult of allResults) {
 if ('error' in requestResult) {
 console.warn(` Failed to fetch ${requestResult.expDate}:`, requestResult.error);
 continue;
 }
 
 const { expDate, result } = requestResult;
 if (result.success && result.data[expDate]) {
 const { calls, puts } = result.data[expDate];
 
 // Process calls
 if (calls) {
 Object.entries(calls).forEach(([strike, data]) => {
 const optionData = data as OptionData;
 const strikeNum = parseFloat(strike);
 // Process all strikes - no filtering
 
 const oi = optionData.open_interest || 0;
 const gamma = optionData.greeks?.gamma || 0;
 
 if (oi > 0 && gamma) {
 const gex = gamma * oi * (spotPrice * spotPrice) * 100;
 
 if (!gexByStrike[strikeNum]) {
 gexByStrike[strikeNum] = { callGEX: 0, putGEX: 0, netGEX: 0 };
 }
 gexByStrike[strikeNum].callGEX += gex;
 totalCallGEX += gex;
 
 console.log(` ${strike}: +${gex.toFixed(0)} call GEX`);
 }
 });
 }
 
 // Process puts
 if (puts) {
 Object.entries(puts).forEach(([strike, data]) => {
 const strikeNum = parseFloat(strike);
 // Process all strikes - no filtering
 
 const optionData = data as any;
 const oi = optionData.open_interest || 0;
 const gamma = optionData.greeks?.gamma || 0;
 
 if (oi > 0 && gamma) {
 const gex = -gamma * oi * (spotPrice * spotPrice) * 100;
 
 if (!gexByStrike[strikeNum]) {
 gexByStrike[strikeNum] = { callGEX: 0, putGEX: 0, netGEX: 0 };
 }
 gexByStrike[strikeNum].putGEX += gex;
 totalPutGEX += gex;
 
 console.log(` ${strike}: +${gex.toFixed(0)} put GEX`);
 }
 });
 }
 }
 }

 // Calculate net GEX for each strike
 Object.keys(gexByStrike).forEach(strike => {
 const data = gexByStrike[strike];
 data.netGEX = data.callGEX + data.putGEX;
 });

 const totalNetGEX = totalCallGEX + totalPutGEX;
 
 // Find significant levels
 const levels = Object.entries(gexByStrike)
 .map(([strike, data]) => ({ strike: parseFloat(strike), ...(data as any) }))
 .sort((a, b) => Math.abs(b.netGEX) - Math.abs(a.netGEX));
 
 const callWalls = levels.filter(l => l.callGEX > 0).slice(0, 5);
 const putWalls = levels.filter(l => l.putGEX < 0).slice(0, 5);
 
 // Find zero gamma level (where net GEX crosses zero)
 let zeroGammaLevel = spotPrice;
 for (let i = 0; i < levels.length - 1; i++) {
 const curr = levels[i];
 const next = levels[i + 1];
 if ((curr.netGEX > 0 && next.netGEX < 0) || (curr.netGEX < 0 && next.netGEX > 0)) {
 zeroGammaLevel = (curr.strike + next.strike) / 2;
 break;
 }
 }

 // Find GEX flip level using ALL strikes from 45-day expiration window
 // This is the strike with the largest absolute net GEX across the complete options chain
 let gexFlipLevel = spotPrice;
 let maxAbsGEX = 0;
 let flipLevelGEX = 0;
 
 // Analyze ALL strikes from gexByStrike (complete 45-day data)
 Object.entries(gexByStrike).forEach(([strikeStr, data]) => {
 const strike = parseFloat(strikeStr);
 const gexData = data as { callGEX: number; putGEX: number; netGEX: number };
 const absNetGEX = Math.abs(gexData.netGEX);
 
 if (absNetGEX > maxAbsGEX) {
 maxAbsGEX = absNetGEX;
 gexFlipLevel = strike;
 flipLevelGEX = gexData.netGEX;
 }
 });
 
 // Also consider cumulative GEX profile approach for better flip detection
 // Sort all strikes and find where the most significant GEX concentration occurs
 const allStrikesData = Object.entries(gexByStrike)
 .map(([strike, data]) => {
 const gexData = data as { callGEX: number; putGEX: number; netGEX: number };
 return { 
 strike: parseFloat(strike), 
 netGEX: gexData.netGEX,
 callGEX: gexData.callGEX,
 putGEX: gexData.putGEX
 };
 })
 .sort((a, b) => a.strike - b.strike);
 
 // Find the strike where dealer hedging pressure is most concentrated
 // This is often where we see the largest imbalance that drives price action
 let maxGEXImbalance = 0;
 let imbalanceFlipLevel = spotPrice;
 
 for (const strikeData of allStrikesData) {
 // Calculate GEX imbalance (how much call vs put GEX)
 const gexImbalance = Math.abs(strikeData.callGEX + strikeData.putGEX);
 if (gexImbalance > maxGEXImbalance) {
 maxGEXImbalance = gexImbalance;
 imbalanceFlipLevel = strikeData.strike;
 }
 }
 
 console.log(` GEX Flip Analysis: Max absolute GEX at $${gexFlipLevel} (${flipLevelGEX.toFixed(0)}), Max imbalance at $${imbalanceFlipLevel}`);
 
 // Use the flip level with the highest absolute GEX concentration
 // This represents where dealers have the most significant hedging obligations

 // Determine if we're in positive or negative gamma environment
 const isPositiveGamma = totalNetGEX > 0;
 const gammaEnvironment = isPositiveGamma ? 'POSITIVE' : 'NEGATIVE';

 console.log(` RESULTS: ${Object.keys(gexByStrike).length} strikes, CallGEX=${totalCallGEX.toFixed(0)}, PutGEX=${totalPutGEX.toFixed(0)}, NetGEX=${totalNetGEX.toFixed(0)}`);
 console.log(` GEX Environment: ${gammaEnvironment} | Flip Level: $${gexFlipLevel.toFixed(2)} | Zero Gamma: $${zeroGammaLevel.toFixed(2)}`);

 return NextResponse.json({
 success: true,
 symbol,
 spotPrice,
 gexData: {
 totalCallGEX,
 totalPutGEX,
 totalNetGEX,
 zeroGammaLevel,
 gexFlipLevel,
 isPositiveGamma,
 gammaEnvironment,
 callWalls: callWalls.map(w => ({ strike: w.strike, gex: w.callGEX })),
 putWalls: putWalls.map(w => ({ strike: w.strike, gex: Math.abs(w.putGEX) })),
 gexByStrike
 },
 debug: {
 allExpirationDates: expirationDates,
 validExpirations45Days: validExpirations,
 expirationsUsed: validExpirations.length,
 strikesWithGEX: Object.keys(gexByStrike).length,
 dateRange: `${today.toISOString().split('T')[0]} to ${fortyFiveDaysOut.toISOString().split('T')[0]}`
 }
 });

 } catch (error) {
 console.error(' GEX error:', error);
 return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
 }
}