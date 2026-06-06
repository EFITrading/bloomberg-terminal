import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { gunzip } from 'zlib';
import { promisify } from 'util';

const prisma = new PrismaClient({ datasourceUrl: process.env.POSTGRES_URL });
const gunzipAsync = promisify(gunzip);

export const runtime = 'nodejs';

// GET /api/dex-map?symbol=SPY
//
// Delta Exposure (DEX) map — same structure as GEX map but uses dealer delta instead of gamma.
// Dealer DEX per contract:
//   callDealer = -oi * delta * spot * 100   (dealer sold calls → short delta)
//   putDealer  = -oi * delta * spot * 100   (put delta < 0 → result is positive, dealer long delta from puts)
//   netDealer  = callDealer + putDealer
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol') || 'SPY';
    const mode = searchParams.get('mode') || 'normal'; // 'normal' | '45d'

    try {
        const host = request.nextUrl.host;
        const protocol = request.nextUrl.protocol;
        const baseUrl = `${protocol}//${host}`;

        // ── STEP 1: Fetch options chain (greeks) ────────────────────────────────
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

        const spotPrice: number = optData.currentPrice || 0;
        if (!spotPrice) throw new Error('No spot price returned');

        const rawData: Record<string, { calls: Record<string, any>; puts: Record<string, any> }> = optData.data;

        // Filter for next 45 days only
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

        // ── STEP 2: Load live OI from DB flow ───────────────────────────────────
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
            // DB unavailable — fall back to static OI
        }

        // ── STEP 3: DEX formula ──────────────────────────────────────────────────
        // Dealer is short contracts to market makers/customers.
        //   callDealer = -oi * delta * spot * 100   (dealer short calls = net short delta)
        //   putDealer  = -oi * delta * spot * 100   (put delta < 0 → dealer is net long delta from puts)
        const CONTRACT_MULT = 100;

        const dexByStrikeByExpiry: Record<number, Record<string, { callDealer: number; putDealer: number; netDealer: number }>> = {};

        for (const expDate of validExpirations) {
            const expData = rawData[expDate];
            if (!expData) continue;

            const { calls, puts } = expData;

            if (calls) {
                for (const [strikeStr, opt] of Object.entries(calls)) {
                    const strikeNum = parseFloat(strikeStr);
                    const delta = opt.greeks?.delta || 0;
                    if (!delta) continue;

                    const contractKey = `${tickerUpper}_${strikeNum}_call_${expDate}`;
                    const oi = liveOIMap.has(contractKey) ? liveOIMap.get(contractKey)! : (opt.open_interest || 0);
                    if (oi <= 0) continue;

                    // Dealer sold calls → they are short delta
                    const dealer = -oi * delta * spotPrice * CONTRACT_MULT;

                    if (!dexByStrikeByExpiry[strikeNum]) dexByStrikeByExpiry[strikeNum] = {};
                    if (!dexByStrikeByExpiry[strikeNum][expDate]) {
                        dexByStrikeByExpiry[strikeNum][expDate] = { callDealer: 0, putDealer: 0, netDealer: 0 };
                    }
                    dexByStrikeByExpiry[strikeNum][expDate].callDealer += dealer;
                }
            }

            if (puts) {
                for (const [strikeStr, opt] of Object.entries(puts)) {
                    const strikeNum = parseFloat(strikeStr);
                    const delta = opt.greeks?.delta || 0;
                    if (!delta) continue;

                    const contractKey = `${tickerUpper}_${strikeNum}_put_${expDate}`;
                    const oi = liveOIMap.has(contractKey) ? liveOIMap.get(contractKey)! : (opt.open_interest || 0);
                    if (oi <= 0) continue;

                    // Dealer sold puts → short puts (put delta < 0) → net long delta
                    const dealer = -oi * delta * spotPrice * CONTRACT_MULT;

                    if (!dexByStrikeByExpiry[strikeNum]) dexByStrikeByExpiry[strikeNum] = {};
                    if (!dexByStrikeByExpiry[strikeNum][expDate]) {
                        dexByStrikeByExpiry[strikeNum][expDate] = { callDealer: 0, putDealer: 0, netDealer: 0 };
                    }
                    dexByStrikeByExpiry[strikeNum][expDate].putDealer += dealer;
                }
            }
        }

        // Compute netDealer
        for (const strikeNum of Object.keys(dexByStrikeByExpiry)) {
            for (const expDate of Object.keys(dexByStrikeByExpiry[+strikeNum])) {
                const e = dexByStrikeByExpiry[+strikeNum][expDate];
                e.netDealer = e.callDealer + e.putDealer;
            }
        }

        // Gold = max positive netDEX, Purple = max negative netDEX
        let highestDEX = 0, lowestDEX = 0;
        let goldStrike: number | null = null, goldExpiry: string | null = null;
        let purpleStrike: number | null = null, purpleExpiry: string | null = null;

        for (const [strikeStr, exps] of Object.entries(dexByStrikeByExpiry)) {
            for (const [expDate, entry] of Object.entries(exps)) {
                if (entry.netDealer > highestDEX) { highestDEX = entry.netDealer; goldStrike = parseFloat(strikeStr); goldExpiry = expDate; }
                if (entry.netDealer < lowestDEX) { lowestDEX = entry.netDealer; purpleStrike = parseFloat(strikeStr); purpleExpiry = expDate; }
            }
        }

        // Global max for normalisation
        let maxAbsDEX = 0;
        for (const exps of Object.values(dexByStrikeByExpiry)) {
            for (const e of Object.values(exps)) {
                if (Math.abs(e.netDealer) > maxAbsDEX) maxAbsDEX = Math.abs(e.netDealer);
            }
        }

        // Filter negligible entries (< 0.05% of max)
        const threshold = maxAbsDEX * 0.0005;
        const strikes: { strike: number; expirations: Record<string, { callDealer: number; putDealer: number; netDealer: number }> }[] = [];

        for (const [strikeStr, exps] of Object.entries(dexByStrikeByExpiry)) {
            const strikeNum = parseFloat(strikeStr);
            const filtered: Record<string, { callDealer: number; putDealer: number; netDealer: number }> = {};
            for (const [expDate, entry] of Object.entries(exps)) {
                if (Math.abs(entry.netDealer) >= threshold) filtered[expDate] = entry;
            }
            if (Object.keys(filtered).length > 0) {
                strikes.push({ strike: strikeNum, expirations: filtered });
            }
        }

        // Net $ premium per expiry (same as GEX map)
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
            maxAbsGEX: maxAbsDEX,
            goldStrike,
            goldExpiry,
            purpleStrike,
            purpleExpiry,
            netPremiumByExpiry,
            callPremiumByExpiry,
            putPremiumByExpiry,
        });

    } catch (error) {
        console.error('❌ GET /api/dex-map error:', error);
        return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
    }
}
