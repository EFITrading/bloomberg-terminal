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
 
 console.log(` ${expirationDates.length} expirations found, spot: $${spotPrice}`);

 // Combine all strikes from all expirations
 const gexByStrike: GEXByStrike = {};
 let totalCallGEX = 0;
 let totalPutGEX = 0;

 for (const expDate of expirationDates.slice(0, 6)) {
 const expResponse = await fetch(`${baseUrl}/api/options-chain?ticker=${symbol}&expiration=${expDate}`);
 const expResult = await expResponse.json();
 
 if (expResult.success && expResult.data[expDate]) {
 const { calls, puts } = expResult.data[expDate];
 
 // Process calls
 if (calls) {
 Object.entries(calls).forEach(([strike, data]) => {
 const optionData = data as OptionData;
 const strikeNum = parseFloat(strike);
 if (strikeNum < 620 || strikeNum > 690) return;
 
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
 const optionData = data as OptionData;
 const strikeNum = parseFloat(strike);
 if (strikeNum < 620 || strikeNum > 690) return;
 
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
 const strikeNum = parseFloat(strike);
 const data = gexByStrike[strikeNum];
 if (data) {
 data.netGEX = data.callGEX + data.putGEX;
 }
 });

 const totalNetGEX = totalCallGEX + totalPutGEX;
 
 // Find significant levels
 const levels = Object.entries(gexByStrike)
 .map(([strike, data]) => ({ strike: parseFloat(strike), ...data }))
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

 console.log(` RESULTS: ${Object.keys(gexByStrike).length} strikes, CallGEX=${totalCallGEX.toFixed(0)}, PutGEX=${totalPutGEX.toFixed(0)}, NetGEX=${totalNetGEX.toFixed(0)}`);

 return NextResponse.json({
 success: true,
 symbol,
 spotPrice,
 gexData: {
 totalCallGEX,
 totalPutGEX,
 totalNetGEX,
 zeroGammaLevel,
 callWalls: callWalls.map(w => ({ strike: w.strike, gex: w.callGEX })),
 putWalls: putWalls.map(w => ({ strike: w.strike, gex: Math.abs(w.putGEX) })),
 gexByStrike
 },
 debug: {
 expirationDates,
 strikesWithGEX: Object.keys(gexByStrike).length
 }
 });

 } catch (error) {
 console.error(' GEX error:', error);
 const errorMessage = error instanceof Error ? error.message : 'Unknown error';
 return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
 }
}