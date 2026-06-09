import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { gunzip } from 'zlib';
import { promisify } from 'util';

const prisma = new PrismaClient({ datasourceUrl: process.env.POSTGRES_URL });
const gunzipAsync = promisify(gunzip);

export const runtime = 'nodejs';

// Black-Scholes gamma (for historical price recalculation)
function calculateGamma(S: number, K: number, T: number, IV: number, r = 0.0408): number {
    if (T <= 0 || IV <= 0 || S <= 0 || K <= 0) return 0
    const d1 = (Math.log(S / K) + (r + 0.5 * IV * IV) * T) / (IV * Math.sqrt(T))
    const nPrimeD1 = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * d1 * d1)
    return nPrimeD1 / (S * IV * Math.sqrt(T))
}

// Black-Scholes delta (for historical price recalculation)
function calculateDelta(S: number, K: number, T: number, IV: number, r = 0.0408, isCall = true): number {
    if (T <= 0 || IV <= 0 || S <= 0) return isCall ? 1 : -1
    const d1 = (Math.log(S / K) + (r + 0.5 * IV * IV) * T) / (IV * Math.sqrt(T))
    const N = (x: number) => {
        const t = 1 / (1 + 0.2316419 * Math.abs(x))
        const d = 0.3989423 * Math.exp(-0.5 * x * x)
        const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
        return x > 0 ? 1 - p : p
    }
    return isCall ? N(d1) : N(d1) - 1
}

// Exact copy of GexPanel's calculateVanna (line 1802)
function calculateVanna(strike: number, spotPrice: number, T: number, impliedVol: number, riskFreeRate = 0.0408): number {
    if (T <= 0 || impliedVol <= 0 || spotPrice <= 0) return 0
    const sigma = impliedVol, r = riskFreeRate, S = spotPrice, K = strike
    const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T))
    const d2 = d1 - sigma * Math.sqrt(T)
    const nPrime_d1 = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * d1 * d1)
    return -Math.exp(-r * T) * nPrime_d1 * (d2 / sigma)
}

// GET /api/gex-map?symbol=SPY
//
// EXACT same logic as GexPanel's fetchOptionsData():
//   1. Fetch greeks from /api/options-chain (same endpoint GexPanel uses)
//   2. Load today's saved flow from DB to build liveOIMap (same as GexPanel lines 2109-2172)
//   3. Replace open_interest with liveOI where available (GexPanel lines 3557-3560)
//   4. Apply Dealer formula (GexPanel lines 3651-3661)
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol') || 'SPY';
    const mode = searchParams.get('mode') || 'normal'; // 'normal' | '45d'
    const priceParam = searchParams.get('price')
    const historicalPrice = priceParam ? parseFloat(priceParam) : null

    try {
        const host = request.nextUrl.host;
        const protocol = request.nextUrl.protocol;
        const baseUrl = `${protocol}//${host}`;

        // ── STEP 1: Fetch options chain (greeks) — same as GexPanel fetchOptionsData() ───
        const tickerUpper = symbol.toUpperCase();
        const apiEndpoint =
            tickerUpper === 'SPX'
                ? `${baseUrl}/api/spx-fix?ticker=${symbol}`
                : tickerUpper === 'VIX'
                    ? `${baseUrl}/api/vix-fix?ticker=${symbol}`
                    : `${baseUrl}/api/options-chain?ticker=${symbol}`;

        const optRes = await fetch(apiEndpoint);
        const optData = await optRes.json();

        if (!optData.success || !optData.data) {
            throw new Error(optData.error || 'Failed to fetch options chain');
        }

        const spotPrice: number = (historicalPrice && historicalPrice > 0) ? historicalPrice : (optData.currentPrice || 0);
        if (!spotPrice) throw new Error('No spot price returned');

        const rawData: Record<string, { calls: Record<string, any>; puts: Record<string, any> }> = optData.data;

        // Filter for next 45 days only (same as GexPanel range)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const fortyFiveDaysOut = new Date(today.getTime() + 45 * 24 * 60 * 60 * 1000);

        const validExpirations = Object.keys(rawData)
            .filter(date => {
                const d = new Date(date + 'T12:00:00');
                return d >= today && d <= fortyFiveDaysOut;
            })
            .sort();

        if (validExpirations.length === 0) {
            return NextResponse.json({ success: false, error: 'No expirations within 45 days' }, { status: 404 });
        }

        // ── STEP 2: Load live OI from DB flow — EXACT same as GexPanel lines 2109-2172 ────
        const liveOIMap = new Map<string, number>();
        try {
            const datesRes = await fetch(`${baseUrl}/api/flows/dates`);
            if (datesRes.ok) {
                const dates: { date: string }[] = await datesRes.json();
                if (dates.length > 0) {
                    const latestDay = new Date(dates[0].date).toISOString().split('T')[0];
                    const tradingDateStr = today.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
                    if (latestDay === tradingDateStr) {
                        const d = new Date(dates[0].date);
                        const dateStr = d.toISOString().split('T')[0];
                        const gte = new Date(`${dateStr}T00:00:00.000Z`);
                        const lt = new Date(`${dateStr}T00:00:00.000Z`);
                        lt.setUTCDate(lt.getUTCDate() + 1);
                        const flowRecord = await prisma.flow.findFirst({
                            where: { date: { gte, lt } },
                            orderBy: { createdAt: 'desc' },
                        });
                        if (flowRecord) {
                            const compressed = Buffer.from(flowRecord.data, 'base64');
                            const decompressed = await gunzipAsync(compressed);
                            const allTrades: any[] = JSON.parse(decompressed.toString('utf8'));
                            const trades = allTrades.filter(
                                (t) => t.underlying_ticker?.toUpperCase() === tickerUpper
                            );
                            // Build liveOIMap — EXACT logic from GexPanel lines 2129-2168
                            const contractDayGroups = new Map<string, any[]>();
                            for (const trade of trades) {
                                const day = new Date(trade.trade_timestamp).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
                                const key = `${trade.underlying_ticker}_${trade.strike}_${trade.type}_${trade.expiry}_${day}`;
                                if (!contractDayGroups.has(key)) contractDayGroups.set(key, []);
                                contractDayGroups.get(key)!.push(trade);
                            }
                            const latestDayPerContract = new Map<string, string>();
                            for (const key of contractDayGroups.keys()) {
                                const contractKey = key.split('_').slice(0, -1).join('_');
                                const day = key.split('_').slice(-1)[0];
                                const existing = latestDayPerContract.get(contractKey);
                                if (!existing || day > existing) latestDayPerContract.set(contractKey, day);
                            }
                            for (const [key, contractTrades] of contractDayGroups) {
                                const contractKey = key.split('_').slice(0, -1).join('_');
                                const day = key.split('_').slice(-1)[0];
                                if (latestDayPerContract.get(contractKey) !== day) continue;
                                const sorted = [...contractTrades].sort(
                                    (a, b) => new Date(a.trade_timestamp).getTime() - new Date(b.trade_timestamp).getTime()
                                );
                                const baseOI = sorted[0].open_interest ?? 0;
                                let liveOI = baseOI;
                                const seen = new Set<string>();
                                for (const trade of sorted) {
                                    const tradeId = `${trade.ticker}_${trade.trade_timestamp}_${trade.trade_size}_${trade.premium_per_contract}`;
                                    if (seen.has(tradeId)) continue;
                                    seen.add(tradeId);
                                    const contracts = trade.trade_size ?? 0;
                                    switch (trade.fill_style) {
                                        case 'A': case 'AA': case 'BB': liveOI += contracts; break;
                                        case 'B': liveOI += contracts > baseOI ? contracts : -contracts; break;
                                    }
                                }
                                liveOIMap.set(contractKey, Math.max(0, liveOI));
                            }
                        }
                    }
                }
            }
        } catch {
            // DB unavailable — silently fall back to static OI from options chain
        }

        // ── STEP 3: Dealer formula — EXACT same as GexPanel lines 3651-3661 ───────────
        //    contractKey: `${ticker}_${strike}_call/put_${expDate}` (GexPanel line 3555)
        const BETA = 0.25;
        const RHO_S_SIGMA = -0.7;
        const CONTRACT_MULT = 100;
        const calcToday = new Date(); // no zeroing — matches GexPanel exactly

        const gexByStrikeByExpiry: Record<number, Record<string, { callDealer: number; putDealer: number; netDealer: number; callOI: number; putOI: number; callGamma: number; callDelta: number; callVanna: number; putGamma: number; putDelta: number; putVanna: number }>> = {};

        for (const expDate of validExpirations) {
            const expData = rawData[expDate];
            if (!expData) continue;

            const expirationDate = new Date(expDate + 'T00:00:00Z'); // UTC midnight — matches GexPanel allDealerCalculatedData line 4109
            const T = Math.max(
                (expirationDate.getTime() - calcToday.getTime()) / (365 * 24 * 60 * 60 * 1000),
                0.001
            );
            const wT = 1 / Math.sqrt(T);

            const { calls, puts } = expData;

            if (calls) {
                for (const [strikeStr, opt] of Object.entries(calls)) {
                    const strikeNum = parseFloat(strikeStr);
                    const iv = opt.implied_volatility || 0.3;
                    // When historical price provided, recalculate greeks from Black-Scholes at that price
                    const gamma = historicalPrice
                        ? calculateGamma(spotPrice, strikeNum, T, iv)
                        : (opt.greeks?.gamma || 0);
                    const delta = historicalPrice
                        ? calculateDelta(spotPrice, strikeNum, T, iv, 0.0408, true)
                        : (opt.greeks?.delta || 0);
                    let vanna = historicalPrice
                        ? calculateVanna(strikeNum, spotPrice, T, iv)
                        : (opt.greeks?.vanna || 0);
                    if (!gamma) continue;
                    // Calculate vanna when missing — EXACT same as GexPanel lines 3580-3588
                    if (vanna === 0 && gamma !== 0) {
                        vanna = calculateVanna(strikeNum, spotPrice, T, iv);
                    }
                    // Live OI override — same contractKey format as GexPanel (line 3555)
                    const contractKey = `${tickerUpper}_${strikeNum}_call_${expDate}`;
                    const oi = liveOIMap.has(contractKey) ? liveOIMap.get(contractKey)! : (opt.open_interest || 0);
                    if (oi <= 0) continue;

                    const gammaEff = gamma + BETA * vanna * RHO_S_SIGMA;
                    const liveWeight = Math.abs(delta) * (1 - Math.abs(delta));
                    const dealer = oi * gammaEff * liveWeight * wT * spotPrice * CONTRACT_MULT;

                    if (!gexByStrikeByExpiry[strikeNum]) gexByStrikeByExpiry[strikeNum] = {};
                    if (!gexByStrikeByExpiry[strikeNum][expDate]) {
                        gexByStrikeByExpiry[strikeNum][expDate] = { callDealer: 0, putDealer: 0, netDealer: 0, callOI: 0, putOI: 0, callGamma: gamma, callDelta: delta, callVanna: vanna, putGamma: 0, putDelta: 0, putVanna: 0 };
                    }
                    gexByStrikeByExpiry[strikeNum][expDate].callDealer += dealer;
                    gexByStrikeByExpiry[strikeNum][expDate].callOI = oi;
                    gexByStrikeByExpiry[strikeNum][expDate].callGamma = gamma;
                    gexByStrikeByExpiry[strikeNum][expDate].callDelta = delta;
                    gexByStrikeByExpiry[strikeNum][expDate].callVanna = vanna;
                }
            }

            if (puts) {
                for (const [strikeStr, opt] of Object.entries(puts)) {
                    const strikeNum = parseFloat(strikeStr);
                    const iv = opt.implied_volatility || 0.3;
                    const gamma = historicalPrice
                        ? calculateGamma(spotPrice, strikeNum, T, iv)
                        : (opt.greeks?.gamma || 0);
                    const delta = historicalPrice
                        ? calculateDelta(spotPrice, strikeNum, T, iv, 0.0408, false)
                        : (opt.greeks?.delta || 0);
                    let vanna = historicalPrice
                        ? calculateVanna(strikeNum, spotPrice, T, iv)
                        : (opt.greeks?.vanna || 0);
                    if (!gamma) continue;
                    if (vanna === 0 && gamma !== 0) {
                        vanna = calculateVanna(strikeNum, spotPrice, T, iv);
                    }
                    const contractKey = `${tickerUpper}_${strikeNum}_put_${expDate}`;
                    const oi = liveOIMap.has(contractKey) ? liveOIMap.get(contractKey)! : (opt.open_interest || 0);
                    if (oi <= 0) continue;

                    const gammaEff = gamma + BETA * vanna * RHO_S_SIGMA;
                    const liveWeight = Math.abs(delta) * (1 - Math.abs(delta));
                    const dealer = -oi * gammaEff * liveWeight * wT * spotPrice * CONTRACT_MULT;

                    if (!gexByStrikeByExpiry[strikeNum]) gexByStrikeByExpiry[strikeNum] = {};
                    if (!gexByStrikeByExpiry[strikeNum][expDate]) {
                        gexByStrikeByExpiry[strikeNum][expDate] = { callDealer: 0, putDealer: 0, netDealer: 0, callOI: 0, putOI: 0, callGamma: 0, callDelta: 0, callVanna: 0, putGamma: gamma, putDelta: delta, putVanna: vanna };
                    }
                    gexByStrikeByExpiry[strikeNum][expDate].putDealer += dealer;
                    gexByStrikeByExpiry[strikeNum][expDate].putOI = oi;
                    gexByStrikeByExpiry[strikeNum][expDate].putGamma = gamma;
                    gexByStrikeByExpiry[strikeNum][expDate].putDelta = delta;
                    gexByStrikeByExpiry[strikeNum][expDate].putVanna = vanna;
                }
            }
        }

        // Compute netDealer for every entry
        for (const strikeNum of Object.keys(gexByStrikeByExpiry)) {
            for (const expDate of Object.keys(gexByStrikeByExpiry[+strikeNum])) {
                const e = gexByStrikeByExpiry[+strikeNum][expDate];
                e.netDealer = e.callDealer + e.putDealer;
            }
        }

        // ── Single global gold / purple — the ONE (strike, expiry) cell with the
        //    highest positive netDealer and the ONE with the most negative netDealer.
        let highestGEX = 0;
        let lowestGEX = 0;
        let goldStrike: number | null = null;
        let goldExpiry: string | null = null;
        let purpleStrike: number | null = null;
        let purpleExpiry: string | null = null;

        for (const [strikeStr, exps] of Object.entries(gexByStrikeByExpiry)) {
            for (const [expDate, entry] of Object.entries(exps)) {
                if (entry.netDealer > highestGEX) { highestGEX = entry.netDealer; goldStrike = parseFloat(strikeStr); goldExpiry = expDate; }
                if (entry.netDealer < lowestGEX) { lowestGEX = entry.netDealer; purpleStrike = parseFloat(strikeStr); purpleExpiry = expDate; }
            }
        }

        // Global max for normalisation
        let maxAbsGEX = 0;
        for (const exps of Object.values(gexByStrikeByExpiry)) {
            for (const e of Object.values(exps)) {
                if (Math.abs(e.netDealer) > maxAbsGEX) maxAbsGEX = Math.abs(e.netDealer);
            }
        }

        // Filter negligible entries (< 0.05% of max)
        const threshold = maxAbsGEX * 0.0005;
        const strikes: { strike: number; expirations: Record<string, { callDealer: number; putDealer: number; netDealer: number }> }[] = [];

        for (const [strikeStr, exps] of Object.entries(gexByStrikeByExpiry)) {
            const strikeNum = parseFloat(strikeStr);
            const filtered: Record<string, { callDealer: number; putDealer: number; netDealer: number }> = {};
            for (const [expDate, entry] of Object.entries(exps)) {
                if (Math.abs(entry.netDealer) >= threshold) filtered[expDate] = entry;
            }
            if (Object.keys(filtered).length > 0) {
                strikes.push({ strike: strikeNum, expirations: filtered });
            }
        }

        // ── Net $ premium per expiry: sum(callOI * callMid * 100) and sum(putOI * putMid * 100) ─
        const netPremiumByExpiry: Record<string, number> = {};
        const callPremiumByExpiry: Record<string, number> = {};
        const putPremiumByExpiry: Record<string, number> = {};
        for (const expDate of validExpirations) {
            const expData = rawData[expDate];
            if (!expData) continue;
            let callTotal = 0, putTotal = 0;
            if (expData.calls) {
                for (const opt of Object.values(expData.calls) as any[]) {
                    const oi = opt.open_interest || 0;
                    const mid = opt.mid_price || ((opt.bid || 0) + (opt.ask || 0)) / 2 || opt.last || 0;
                    callTotal += oi * mid * 100;
                }
            }
            if (expData.puts) {
                for (const opt of Object.values(expData.puts) as any[]) {
                    const oi = opt.open_interest || 0;
                    const mid = opt.mid_price || ((opt.bid || 0) + (opt.ask || 0)) / 2 || opt.last || 0;
                    putTotal += oi * mid * 100;
                }
            }
            callPremiumByExpiry[expDate] = callTotal;
            putPremiumByExpiry[expDate] = putTotal;
            netPremiumByExpiry[expDate] = callTotal - putTotal;
        }

        // ── 45D aggregation mode: collapse all expiries into one synthetic column ──
        if (mode === '45d') {
            const syntheticExpiry = fortyFiveDaysOut.toISOString().split('T')[0];
            const agg45Strikes: { strike: number; expirations: Record<string, { callDealer: number; putDealer: number; netDealer: number }> }[] = [];
            let agg45Gold = -Infinity, agg45Purple = Infinity;
            let agg45GoldStrike: number | null = null, agg45PurpleStrike: number | null = null;
            let agg45MaxAbs = 0;
            let agg45CallPremium = 0, agg45PutPremium = 0;
            for (const s of strikes) {
                let sumCall = 0, sumPut = 0;
                for (const e of Object.values(s.expirations)) { sumCall += e.callDealer; sumPut += e.putDealer; }
                const net = sumCall + sumPut;
                if (net === 0) continue;
                agg45Strikes.push({ strike: s.strike, expirations: { [syntheticExpiry]: { callDealer: sumCall, putDealer: sumPut, netDealer: net } } });
                if (net > agg45Gold) { agg45Gold = net; agg45GoldStrike = s.strike; }
                if (net < agg45Purple) { agg45Purple = net; agg45PurpleStrike = s.strike; }
                if (Math.abs(net) > agg45MaxAbs) agg45MaxAbs = Math.abs(net);
            }
            for (const expDate of validExpirations) {
                agg45CallPremium += callPremiumByExpiry[expDate] || 0;
                agg45PutPremium += putPremiumByExpiry[expDate] || 0;
            }
            return NextResponse.json({
                success: true,
                symbol,
                spotPrice,
                expirations: [syntheticExpiry],
                strikes: agg45Strikes,
                maxAbsGEX: agg45MaxAbs,
                goldStrike: agg45GoldStrike,
                goldExpiry: agg45Gold > 0 ? syntheticExpiry : null,
                purpleStrike: agg45PurpleStrike,
                purpleExpiry: agg45Purple < 0 ? syntheticExpiry : null,
                netPremiumByExpiry: { [syntheticExpiry]: agg45CallPremium - agg45PutPremium },
                callPremiumByExpiry: { [syntheticExpiry]: agg45CallPremium },
                putPremiumByExpiry: { [syntheticExpiry]: agg45PutPremium },
            });
        }

        return NextResponse.json({
            success: true,
            symbol,
            spotPrice,
            expirations: validExpirations,
            strikes,
            maxAbsGEX,
            goldStrike,
            goldExpiry,
            purpleStrike,
            purpleExpiry,
            netPremiumByExpiry,
            callPremiumByExpiry,
            putPremiumByExpiry,
        });

    } catch (error) {
        console.error('❌ GET /api/gex-map error:', error);
        return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
    }
}
