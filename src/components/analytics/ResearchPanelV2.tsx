'use client';
import { useState, useEffect, useRef } from 'react';

// ─── Config ───────────────────────────────────────────────────────────────────
const TICKERS: string[] = [];
const PATH_LEN = 30;   // measure forward 30 daily bars
const PRE_LEN = 15;   // bars before trigger to show context of the event itself
const MIN_WIN = 60;   // minimum 30-bar win rate to qualify
const MIN_N = 10;   // minimum occurrences
const MAX_BARS = 3780; // cap to last 15 years (252 trading days × 15)
const MIN_BARS = 1260; // require at least 5 years (252 trading days × 5)

// ─── Types ────────────────────────────────────────────────────────────────────
type Bar = { t: number; o: number; h: number; l: number; c: number; v: number };

interface Pattern {
    label: string;
    context: string;  // human-readable description of what was happening at trigger
    n: number;
    avg1: number; w1: number;   // avg % return and win% at +1 bar
    avg7: number; w7: number;   // at +7 bars
    avg13: number; w13: number;  // at +13 bars
    avg30: number; w30: number;   // at +30 bars
    type: 'BUY' | 'SELL';
    edge: number;                 // |w30 − 50|
    avgPath: number[];              // avg cumulative % return at each of bars 0..30
    allPaths: number[][];           // every individual occurrence's 30-bar path
    avgFullPath: number[];          // avg path: PRE_LEN bars before + trigger + PATH_LEN after
    allPathsFull: number[][];       // every individual occurrence's full pre+trigger+post path
    triggerBars: number[];          // bar indices where this pattern triggered (for historical signal)
    isActive: boolean;              // true if current (last) bar matches this condition
}

interface StockDNA {
    wS: number; wM: number; wL: number;   // derived swing windows (per-stock)
    avgUpLeg: number; avgDnLeg: number;  // avg streak leg lengths
    retP5: number; retP95: number;       // daily return tails
    retP1: number; retP99: number;       // once-a-decade daily moves
    strP75: number; strP90: number;      // streak length thresholds
    rSP5: number; rSP95: number;         // short-window extremes
    gapP5: number; gapP95: number;       // gap extremes
    ddP50: number; ddP75: number;        // drawdown reference levels
}

// Composite signal: all qualifying patterns weighted by edge × √n
interface ComboSignal {
    score: number;                   // 0–100 weighted composite win rate (all patterns)
    direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    activeScore: number | null;      // weighted score from currently-active patterns only
    activeDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | null;
    combinedPath: number[];          // PATH_LEN+1 weighted avg projection
    pathLow: number[];               // 25th pct confidence band across all occurrences
    pathHigh: number[];              // 75th pct confidence band
    historicalSignal: number[];                // per-bar composite score (NaN = no trigger that bar)
    historicalDates: number[];                 // timestamps matching historicalSignal
    triggerLabels: Record<number, string[]>;   // bar index → list of pattern labels that fired
    nContributing: number;
    confluenceSignal: ('BUY' | 'SELL' | null)[];  // per-bar: null = no cluster found
    confluenceLabels: Record<number, string[]>;    // bar index → labels that formed the cluster
    confluenceTier: Record<number, 'legendary' | 'rare' | 'common'>; // bar index → which tier triggered
}

interface WyckoffZones {
    accumRange: number[];   // bar indices (in sortedBars) inside an accumulation trading range
    distRange: number[];    // bar indices inside a distribution trading range
    shakeout: number[];     // Wyckoff Spring — shakeout below range low + close recovery
    upthrust: number[];     // Wyckoff UTAD — thrust above range high + close reversal
}

interface StockResult {
    ticker: string;
    lastClose: number;
    todayRet: number;
    ddFromATH: number;   // positive %, how far below all-time high
    bars: number;
    dateRange: string;
    patterns: Pattern[];
    sortedBars: Bar[];    // full bar array for the price chart
    dna: StockDNA;       // per-stock computed thresholds
    combo: ComboSignal;  // weighted composite of all patterns
    wyckoffZones: WyckoffZones;
}

// ─── Core Scanner ─────────────────────────────────────────────────────────────
// Step 1: compute the stock's own distribution for every metric.
// Step 2: derive thresholds from that distribution (percentiles).
// Step 3: build conditions and combinations from those thresholds — unique per stock.
// Zero hardcoded % — every number comes from the stock's own data.
function scanStock(ticker: string, rawBars: Bar[]): StockResult {
    const sorted = rawBars
        .filter(b => b.c > 0 && b.t > 0)
        .sort((a, b) => a.t - b.t)
        .slice(-MAX_BARS); // keep only the most recent MAX_BARS — ancient history (e.g. 1929 Depression) produces nonsensical drawdown percentiles
    const n = sorted.length;

    // ── Pass 1: streak-independent per-bar metrics ──────────────────────────────
    const ret: number[] = new Array(n).fill(0);
    const dd: number[] = new Array(n).fill(0);
    const str: number[] = new Array(n).fill(0);
    const gap: number[] = new Array(n).fill(0);
    const cpos: number[] = new Array(n).fill(0.5);

    let ath = sorted[0].h;
    for (let i = 0; i < n; i++) {
        ath = Math.max(ath, sorted[i].h);
        dd[i] = (1 - sorted[i].c / ath) * 100;
        if (i > 0) {
            ret[i] = (sorted[i].c / sorted[i - 1].c - 1) * 100;
            gap[i] = (sorted[i].o / sorted[i - 1].c - 1) * 100;
            str[i] = ret[i] >= 0
                ? (str[i - 1] > 0 ? str[i - 1] + 1 : 1)
                : (str[i - 1] < 0 ? str[i - 1] - 1 : -1);
        } else {
            str[i] = 1;
        }
        const rng = sorted[i].h - sorted[i].l;
        cpos[i] = rng > 0 ? (sorted[i].c - sorted[i].l) / rng : 0.5;
    }

    // ── Pass 2: measure this stock's actual swing durations ───────────────────
    // Walk the streak array. Every direction change = a completed swing.
    // Compute the average up-leg and average down-leg length FOR THIS STOCK.
    // AMD swings fast, SPY swings slow — this will be different for each.
    const upLens: number[] = [], dnLens: number[] = [];
    for (let i = 1; i < n; i++) {
        if (str[i] > 0 && str[i - 1] < 0) dnLens.push(Math.abs(str[i - 1]));
        if (str[i] < 0 && str[i - 1] > 0) upLens.push(str[i - 1]);
    }
    if (str[n - 1] > 0) upLens.push(str[n - 1]);
    else dnLens.push(Math.abs(str[n - 1]));

    const avgUp = upLens.length ? upLens.reduce((a, b) => a + b, 0) / upLens.length : 3;
    const avgDn = dnLens.length ? dnLens.reduce((a, b) => a + b, 0) / dnLens.length : 3;

    // wS/wM/wL must be meaningfully different timeframes — enforced minimums prevent
    // SPY-style collapse where all three windows end up as 5/6/8 (useless duplicates).
    // wS = short swing (min 5d), wM = medium cycle (min 2× wS, never < 10d),
    // wL = long trend (min 2× wM, never < 20d).
    const wS = Math.max(5, Math.round((avgUp + avgDn) / 2));
    const wM = Math.max(wS * 2, 10, Math.round(avgUp + avgDn));
    const wL = Math.max(wM * 2, 20, Math.round(2 * (avgUp + avgDn)));

    // ── Pass 3: rolling returns at this stock's own derived windows ───────────
    const rS: number[] = new Array(n).fill(0);
    const rM: number[] = new Array(n).fill(0);
    const rL: number[] = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
        if (i >= wS) rS[i] = (sorted[i].c / sorted[i - wS].c - 1) * 100;
        if (i >= wM) rM[i] = (sorted[i].c / sorted[i - wM].c - 1) * 100;
        if (i >= wL) rL[i] = (sorted[i].c / sorted[i - wL].c - 1) * 100;
    }

    // ── Percentile helper ──────────────────────────────────────────────────────
    // Returns the value at percentile p (0-100) in a sorted copy of arr,
    // ignoring leading zeros (warmup bars).
    function pct(arr: number[], p: number, skip = 0): number {
        const vals = arr.slice(skip).filter(v => v !== 0).sort((a, b) => a - b);
        if (vals.length === 0) return 0;
        const idx = Math.max(0, Math.min(vals.length - 1, Math.round((p / 100) * (vals.length - 1))));
        return vals[idx];
    }

    // ── Step 1: Compute this stock's own distribution thresholds ──────────────
    // Daily returns — negative tail and positive tail
    const retP2 = pct(ret, 2, 1);   // extreme crash day threshold
    const retP1 = pct(ret, 1, 1);   // once-a-decade crash day
    const retP5 = pct(ret, 5, 1);   // very bad day
    const retP10 = pct(ret, 10, 1);   // bad day
    const retP25 = pct(ret, 25, 1);   // mild down
    const retP75 = pct(ret, 75, 1);   // mild up
    const retP90 = pct(ret, 90, 1);   // strong up
    const retP95 = pct(ret, 95, 1);   // very strong up
    const retP98 = pct(ret, 98, 1);   // extreme rip
    const retP99 = pct(ret, 99, 1);   // once-a-decade rip day

    // Short rolling returns (wS bars = this stock's avg single swing)
    const rSP2 = pct(rS, 2, wS);
    const rSP1 = pct(rS, 1, wS);
    const rSP5 = pct(rS, 5, wS);
    const rSP10 = pct(rS, 10, wS);
    const rSP90 = pct(rS, 90, wS);
    const rSP95 = pct(rS, 95, wS);
    const rSP98 = pct(rS, 98, wS);
    const rSP99 = pct(rS, 99, wS);

    // Medium rolling returns (wM bars = this stock's avg full cycle)
    const rMP2 = pct(rM, 2, wM);
    const rMP1 = pct(rM, 1, wM);
    const rMP5 = pct(rM, 5, wM);
    const rMP10 = pct(rM, 10, wM);
    const rMP90 = pct(rM, 90, wM);
    const rMP95 = pct(rM, 95, wM);
    const rMP98 = pct(rM, 98, wM);
    const rMP99 = pct(rM, 99, wM);

    // Long rolling returns (wL bars = two full cycles)
    const rLP2 = pct(rL, 2, wL);
    const rLP1 = pct(rL, 1, wL);
    const rLP5 = pct(rL, 5, wL);
    const rLP90 = pct(rL, 90, wL);
    const rLP95 = pct(rL, 95, wL);
    const rLP98 = pct(rL, 98, wL);
    const rLP99 = pct(rL, 99, wL);

    // ATH drawdown distribution
    const ddP25 = pct(dd, 25, 1);   // typical mild pullback level
    const ddP50 = pct(dd, 50, 1);   // median drawdown
    const ddP75 = pct(dd, 75, 1);   // deep drawdown
    const ddP90 = pct(dd, 90, 1);   // historically extreme drawdown
    const ddP95 = pct(dd, 95, 1);
    const ddP98 = pct(dd, 98, 1);   // deepest hole in 10 years

    // Streak length — use absolute values to find what "extended" means for this stock
    const absStr = str.slice(1).map(Math.abs).filter(v => v > 0);
    const strSorted = [...absStr].sort((a, b) => a - b);
    const strP75 = strSorted[Math.floor(strSorted.length * 0.75)] ?? 3;
    const strP90 = strSorted[Math.floor(strSorted.length * 0.90)] ?? 5;

    // Gap distribution (non-zero gaps)
    const gapP5 = pct(gap, 5, 1);   // large gap down
    const gapP10 = pct(gap, 10, 1);
    const gapP90 = pct(gap, 90, 1);
    const gapP95 = pct(gap, 95, 1);   // large gap up
    const gapP1 = pct(gap, 1, 1);    // once-a-decade gap down
    const gapP99 = pct(gap, 99, 1);  // once-a-decade gap up

    // ── Forward stats helper ───────────────────────────────────────────────────
    function fwdStats(indices: number[]): {
        n: number;
        avg1: number; w1: number;
        avg7: number; w7: number;
        avg13: number; w13: number;
        avg30: number; w30: number;
        avgPath: number[];
        allPaths: number[][];
        avgFullPath: number[];
        allPathsFull: number[][];
        triggerBars: number[];
    } | null {
        let s1 = 0, s7 = 0, s13 = 0, s30 = 0, c1 = 0, c7 = 0, c13 = 0, c30 = 0, cnt = 0;
        const ps: number[] = new Array(PATH_LEN + 1).fill(0);
        const allPaths: number[][] = [];
        const allPathsFull: number[][] = [];
        const validIdxs: number[] = [];
        const FULL_LEN = PRE_LEN + PATH_LEN + 1;
        const fullSum: number[] = new Array(FULL_LEN).fill(0);
        for (const i of indices) {
            if (i + PATH_LEN >= n) continue;
            validIdxs.push(i);
            const base = sorted[i].c;
            const v1 = (sorted[i + 1].c / base - 1) * 100;
            const v7 = (sorted[i + 7].c / base - 1) * 100;
            const v13 = (sorted[i + 13].c / base - 1) * 100;
            const v30 = (sorted[i + 30].c / base - 1) * 100;
            s1 += v1; if (v1 > 0) c1++;
            s7 += v7; if (v7 > 0) c7++;
            s13 += v13; if (v13 > 0) c13++;
            s30 += v30; if (v30 > 0) c30++;
            const occPath: number[] = [];
            for (let k = 0; k <= PATH_LEN; k++) {
                const v = (sorted[i + k].c / base - 1) * 100;
                ps[k] += v;
                occPath.push(v);
            }
            allPaths.push(occPath);
            // Full path: PRE_LEN bars before + trigger bar (0%) + PATH_LEN bars after
            // Only collect if we have enough history before this bar
            if (i >= PRE_LEN) {
                const full: number[] = [];
                for (let k = PRE_LEN; k >= 1; k--) full.push((sorted[i - k].c / base - 1) * 100);
                full.push(0); // trigger bar is always 0% (the base)
                for (let k = 1; k <= PATH_LEN; k++) full.push((sorted[i + k].c / base - 1) * 100);
                allPathsFull.push(full);
                for (let k = 0; k < FULL_LEN; k++) fullSum[k] += full[k];
            }
            cnt++;
        }
        if (cnt < MIN_N) return null;
        const nFull = allPathsFull.length;
        return {
            n: cnt,
            avg1: s1 / cnt, w1: (c1 / cnt) * 100,
            avg7: s7 / cnt, w7: (c7 / cnt) * 100,
            avg13: s13 / cnt, w13: (c13 / cnt) * 100,
            avg30: s30 / cnt, w30: (c30 / cnt) * 100,
            avgPath: ps.map(v => v / cnt),
            allPaths,
            avgFullPath: nFull > 0 ? fullSum.map(v => v / nFull) : new Array(FULL_LEN).fill(0),
            allPathsFull,
            triggerBars: validIdxs,
        };
    }

    function toPattern(label: string, st: ReturnType<typeof fwdStats>, isActive: boolean, context = ''): Pattern | null {
        if (!st) return null;
        const isBuy = st.w30 >= MIN_WIN;
        // SELL: equities recover within 30 days in bull markets, so short-window
        // bearish outcomes (w7/w13) are the real signal for topping/distribution setups.
        // 45% win rate over 7 or 13 days = 5-point edge — genuine bearish conviction.
        const isSell = st.w30 <= (100 - MIN_WIN) || st.w7 <= 45 || st.w13 <= 45;
        if (!isBuy && !isSell) return null;
        if (isBuy) return { label, context, ...st, type: 'BUY', edge: st.w30 - 50, isActive };
        // For SELL: edge = strongest bearish signal across any timeframe
        const sellEdge = 50 - Math.min(st.w7, st.w13, st.w30);
        return { label, context, ...st, type: 'SELL', edge: Math.max(0.1, sellEdge), isActive };
    }

    const all: Pattern[] = [];
    const add = (p: Pattern | null) => { if (p) all.push(p); };

    // Current bar snapshot
    const L = n - 1;
    const lRet = ret[L], lDD = dd[L], lStr = str[L];
    const lRS = rS[L], lRM = rM[L], lRL = rL[L];
    const lGap = gap[L], lCPos = cpos[L];

    // Format helper — rounds to 1dp with sign for label generation
    const f = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

    // ── Layer 2: ATH drawdown zones — derived from this stock's own dd distribution ─
    {
        const buckets: [string, number, number][] = [
            [`MID PULLBACK  ${ddP25.toFixed(1)}–${ddP50.toFixed(1)}% below ATH`, ddP25, ddP50],
            [`DEEP PULLBACK  ${ddP50.toFixed(1)}–${ddP75.toFixed(1)}% below ATH`, ddP50, ddP75],
            [`HISTORICAL BEAR ZONE  ${ddP75.toFixed(1)}–${ddP90.toFixed(1)}% below ATH`, ddP75, ddP90],
            [`EXTREME BEAR  ≥${ddP90.toFixed(1)}% below ATH`, ddP90, Infinity],
        ];
        for (const [lbl, lo, hi] of buckets) {
            const idx: number[] = [];
            for (let i = 1; i < n - PATH_LEN; i++) if (dd[i] >= lo && dd[i] < hi) idx.push(i);
            const avgD = idx.length ? idx.reduce((s, i) => s + dd[i], 0) / idx.length : 0;
            add(toPattern(lbl, fwdStats(idx), lDD >= lo && lDD < hi, `${ticker} was avg ${avgD.toFixed(1)}% below its all-time high at trigger`));
        }
    }

    // ── Layer 2b: Fresh ATH Breakout — fires ONCE per event, only after meaningful pullback ──
    // A "fresh" breakout = the FIRST bar that sets a new ATH after a complete pullback cycle.
    // State machine: "atATH" → drop below ATH → "inPullback" → new ATH → ONE event fires.
    // While "atATH" (stock grinding higher day after day) no events fire — no pullback = no cycle.
    // Zero hardcoded % — threshold derived from this stock's own pullback depth distribution.
    {
        // Pass 1: state machine — one event per complete pullback-recovery cycle only
        const allAthCycles: { barIdx: number; peakDD: number }[] = [];
        let cycleATH = sorted[0].h;
        let inPullback = false;
        let peakDDcycle = 0;
        for (let i = 1; i < n - PATH_LEN; i++) {
            const hi = sorted[i].h;
            const curDD = (1 - sorted[i].c / cycleATH) * 100;
            if (!inPullback) {
                if (curDD > 0) {
                    // price has fallen below running ATH — enter pullback state
                    inPullback = true;
                    peakDDcycle = curDD;
                } else if (hi > cycleATH) {
                    cycleATH = hi; // still grinding up, extend ATH, no event
                }
            } else {
                // in pullback — track deepest drawdown
                if (curDD > peakDDcycle) peakDDcycle = curDD;
                if (hi > cycleATH) {
                    // recovered to new ATH — ONE event for this complete cycle
                    allAthCycles.push({ barIdx: i, peakDD: peakDDcycle });
                    cycleATH = hi;
                    inPullback = false;
                    peakDDcycle = 0;
                }
            }
        }

        // Threshold = median (p50) of all cycle pullback depths for this stock
        // p50 instead of p25 so we only capture proper corrections, not micro-dips
        const depths = allAthCycles.map(e => e.peakDD).sort((a, b) => a - b);
        const pullbackMin = depths.length >= 4
            ? depths[Math.floor(depths.length * 0.50)]
            : Math.max(1, Math.abs(retP5));

        const freshEvents = allAthCycles.filter(e => e.peakDD >= pullbackMin);
        const freshIdx = freshEvents.map(e => e.barIdx);
        const avgPullback = freshEvents.length
            ? freshEvents.reduce((s, e) => s + e.peakDD, 0) / freshEvents.length
            : 0;

        // isActive: last bar is a fresh ATH breakout after a meaningful pullback
        let cycleATH2 = sorted[0].h;
        let inPullback2 = false;
        let peakDDlast2 = 0;
        let isActiveFresh = false;
        for (let i = 1; i < n; i++) {
            const hi2 = sorted[i].h;
            const curDD2 = (1 - sorted[i].c / cycleATH2) * 100;
            if (!inPullback2) {
                if (curDD2 > 0) { inPullback2 = true; peakDDlast2 = curDD2; }
                else if (hi2 > cycleATH2) { cycleATH2 = hi2; }
            } else {
                if (curDD2 > peakDDlast2) peakDDlast2 = curDD2;
                if (hi2 > cycleATH2) {
                    if (i === n - 1) isActiveFresh = peakDDlast2 >= pullbackMin;
                    cycleATH2 = hi2;
                    inPullback2 = false;
                    peakDDlast2 = 0;
                }
            }
        }

        add(toPattern(
            `FRESH ATH BREAKOUT  after ≥${pullbackMin.toFixed(1)}% pullback`,
            fwdStats(freshIdx),
            isActiveFresh,
            `${ticker}: broke into new all-time high after avg ${avgPullback.toFixed(1)}% pullback · ${allAthCycles.length} total cycles found, ${freshEvents.length} qualified · threshold = median pullback depth for this stock`,
        ));
    }

    // ── Layer 3: Z-Score Deviation — close vs this stock's own rolling 20d mean/std ─
    // A z-score measures how many standard deviations the current close is above/below
    // its own recent average. This captures "moving more than normal" per-stock, not
    // just raw % returns. Thresholds derived from this stock's own z-score distribution.
    {
        const ZW = 20;
        const zscore: number[] = new Array(n).fill(0);
        for (let i = ZW; i < n; i++) {
            let sum = 0, sum2 = 0;
            for (let k = i - ZW + 1; k <= i; k++) { sum += sorted[k].c; sum2 += sorted[k].c * sorted[k].c; }
            const mean = sum / ZW;
            const std = Math.sqrt(Math.max(0, sum2 / ZW - mean * mean));
            zscore[i] = std > 0 ? (sorted[i].c - mean) / std : 0;
        }
        const zArr = zscore.slice(ZW).sort((a, b) => a - b);
        const zP2 = zArr[Math.floor(zArr.length * 0.02)] ?? -2;
        const zP5 = zArr[Math.floor(zArr.length * 0.05)] ?? -1.6;
        const zP95 = zArr[Math.floor(zArr.length * 0.95)] ?? 1.6;
        const zP98 = zArr[Math.floor(zArr.length * 0.98)] ?? 2;
        const lZ = zscore[L];
        // Extreme deviation above mean (historically stretched)
        const zHigh: number[] = [], zLow: number[] = [], zExHigh: number[] = [], zExLow: number[] = [];
        for (let i = ZW; i < n - PATH_LEN; i++) {
            if (zscore[i] >= zP95 && zscore[i] < zP98) zHigh.push(i);
            if (zscore[i] >= zP98) zExHigh.push(i);
            if (zscore[i] <= zP5 && zscore[i] > zP2) zLow.push(i);
            if (zscore[i] <= zP2) zExLow.push(i);
        }
        const avgZH = zHigh.length ? zHigh.reduce((s, i) => s + zscore[i], 0) / zHigh.length : zP95;
        const avgZEH = zExHigh.length ? zExHigh.reduce((s, i) => s + zscore[i], 0) / zExHigh.length : zP98;
        const avgZL = zLow.length ? zLow.reduce((s, i) => s + zscore[i], 0) / zLow.length : zP5;
        const avgZEL = zExLow.length ? zExLow.reduce((s, i) => s + zscore[i], 0) / zExLow.length : zP2;
        add(toPattern(
            `STRETCHED ABOVE MEAN  z-score ${zP95.toFixed(1)}–${zP98.toFixed(1)}σ (top 5% for this stock)`,
            fwdStats(zHigh), lZ >= zP95 && lZ < zP98,
            `${ticker} close ${avgZH.toFixed(2)}σ above its 20d mean — historically extended, this percentile triggers mean-reversion · ${zHigh.length}× seen`,
        ));
        add(toPattern(
            `EXTREME STRETCH ABOVE MEAN  z-score ≥${zP98.toFixed(1)}σ (top 2% for this stock)`,
            fwdStats(zExHigh), lZ >= zP98,
            `${ticker} close ${avgZEH.toFixed(2)}σ above its 20d mean — rarest extension ever seen for this stock · only ${zExHigh.length}× historically`,
        ));
        add(toPattern(
            `DEPRESSED BELOW MEAN  z-score ${zP2.toFixed(1)}–${zP5.toFixed(1)}σ (bottom 5% for this stock)`,
            fwdStats(zLow), lZ <= zP5 && lZ > zP2,
            `${ticker} close ${avgZL.toFixed(2)}σ below its 20d mean — historically compressed, bottom-5th-percentile zone · ${zLow.length}× seen`,
        ));
        add(toPattern(
            `EXTREME COMPRESSION BELOW MEAN  z-score ≤${zP2.toFixed(1)}σ (bottom 2% for this stock)`,
            fwdStats(zExLow), lZ <= zP2,
            `${ticker} close ${avgZEL.toFixed(2)}σ below its 20d mean — rarest downside extension ever for this stock · only ${zExLow.length}× historically`,
        ));
    }

    // ── Layer 4: Flash Cascade — 3+ CONSECUTIVE days each individually extreme ─
    // Not just "down over N days total" — each single day must itself be in the
    // bottom/top percentile of this stock's daily return distribution.
    // This captures waterfall sell-offs and melt-up thrusts. Very rare by definition.
    {
        const FLASH_LEN = 3;
        const flashCrash: number[] = [], flashRip: number[] = [];
        const flash4Crash: number[] = [], flash4Rip: number[] = [];
        for (let i = FLASH_LEN; i < n - PATH_LEN; i++) {
            let allDn3 = true, allUp3 = true, allDn4 = true, allUp4 = true;
            for (let k = 0; k < FLASH_LEN; k++) {
                if (ret[i - k] > retP10) allDn3 = false;
                if (ret[i - k] < retP90) allUp3 = false;
            }
            if (allDn3) flashCrash.push(i);
            if (allUp3) flashRip.push(i);
            if (i >= 4) {
                for (let k = 0; k < 4; k++) {
                    if (ret[i - k] > retP10) allDn4 = false;
                    if (ret[i - k] < retP90) allUp4 = false;
                }
                if (allDn4) flash4Crash.push(i);
                if (allUp4) flash4Rip.push(i);
            }
        }
        const avgCumCrash3 = flashCrash.length
            ? flashCrash.reduce((s, i) => s + (sorted[i].c / sorted[i - FLASH_LEN].c - 1) * 100, 0) / flashCrash.length : 0;
        const avgCumRip3 = flashRip.length
            ? flashRip.reduce((s, i) => s + (sorted[i].c / sorted[i - FLASH_LEN].c - 1) * 100, 0) / flashRip.length : 0;
        const avgCumCrash4 = flash4Crash.length
            ? flash4Crash.reduce((s, i) => s + (sorted[i].c / sorted[i - 4].c - 1) * 100, 0) / flash4Crash.length : 0;
        const avgCumRip4 = flash4Rip.length
            ? flash4Rip.reduce((s, i) => s + (sorted[i].c / sorted[i - 4].c - 1) * 100, 0) / flash4Rip.length : 0;
        add(toPattern(
            `FLASH SELL CASCADE  3 consecutive extreme-down days`,
            fwdStats(flashCrash),
            L >= FLASH_LEN && [0, 1, 2].every(k => ret[L - k] <= retP10),
            `${ticker}: 3 back-to-back days each in its own bottom-10% return bucket — avg cumulative ${avgCumCrash3.toFixed(1)}% waterfall · ${flashCrash.length}× historically`,
        ));
        add(toPattern(
            `FLASH MELT-UP  3 consecutive extreme-up days`,
            fwdStats(flashRip),
            L >= FLASH_LEN && [0, 1, 2].every(k => ret[L - k] >= retP90),
            `${ticker}: 3 back-to-back days each in its own top-10% return bucket — avg cumulative ${avgCumRip3.toFixed(1)}% thrust · ${flashRip.length}× historically`,
        ));
        add(toPattern(
            `EXTENDED FLASH SELL  4 consecutive extreme-down days`,
            fwdStats(flash4Crash),
            L >= 4 && [0, 1, 2, 3].every(k => ret[L - k] <= retP10),
            `${ticker}: 4 straight days each individually extreme down — avg cumulative ${avgCumCrash4.toFixed(1)}% collapse · ${flash4Crash.length}× historically · capitulation event`,
        ));
        add(toPattern(
            `EXTENDED FLASH MELT-UP  4 consecutive extreme-up days`,
            fwdStats(flash4Rip),
            L >= 4 && [0, 1, 2, 3].every(k => ret[L - k] >= retP90),
            `${ticker}: 4 straight days each individually extreme up — avg cumulative ${avgCumRip4.toFixed(1)}% explosion · ${flash4Rip.length}× historically · exhaustion risk`,
        ));
    }

    // ── Layer 5: ATR Range Compression → Expansion (Coiling & Breakout) ──────
    // True Range = max(high−low, |high−prevClose|, |low−prevClose|).
    // When the 10-day ATR relative to price shrinks to this stock's own historical
    // low percentile for 8+ consecutive days = coiling. First expansion = breakout.
    // This is a completely different dimension from returns — it measures VOLATILITY
    // structure, not direction. Markets coil before explosive moves.
    {
        const TR: number[] = new Array(n).fill(0);
        for (let i = 1; i < n; i++) {
            TR[i] = Math.max(
                sorted[i].h - sorted[i].l,
                Math.abs(sorted[i].h - sorted[i - 1].c),
                Math.abs(sorted[i].l - sorted[i - 1].c),
            );
        }
        const ATR_W = 10, COIL_W = 8;
        const atr10: number[] = new Array(n).fill(0);
        for (let i = ATR_W; i < n; i++) {
            atr10[i] = TR.slice(i - ATR_W + 1, i + 1).reduce((s, v) => s + v, 0) / ATR_W / sorted[i].c * 100; // % of price
        }
        const atrArr = atr10.slice(ATR_W).filter(v => v > 0).sort((a, b) => a - b);
        const atrP15 = atrArr[Math.floor(atrArr.length * 0.15)] ?? atrArr[0];
        const atrP85 = atrArr[Math.floor(atrArr.length * 0.85)] ?? atrArr[atrArr.length - 1];
        const atrP95 = atrArr[Math.floor(atrArr.length * 0.95)] ?? atrArr[atrArr.length - 1];
        // Coiling: ATR held below p15 for COIL_W+ days
        // Expansion break: first bar ATR crosses above p15 after coiling
        // Extreme vol spike: ATR at p95+ (panic environment)
        const coiling: number[] = [], coilBreak: number[] = [];
        const volSpike: number[] = [], volSpikeDn: number[] = [];
        for (let i = ATR_W + COIL_W; i < n - PATH_LEN; i++) {
            let allLow = true;
            for (let k = i - COIL_W; k < i; k++) if (atr10[k] >= atrP15) { allLow = false; break; }
            if (allLow) {
                if (atr10[i] < atrP15) coiling.push(i);       // still coiling
                if (atr10[i] >= atrP15) coilBreak.push(i);    // breakout bar
            }
            if (atr10[i] >= atrP95 && ret[i] >= retP90) volSpike.push(i);   // vol spike up
            if (atr10[i] >= atrP95 && ret[i] <= retP10) volSpikeDn.push(i); // vol spike down
        }
        const lATR = atr10[L];
        let lCoiling = true;
        for (let k = Math.max(0, L - COIL_W); k < L; k++) if (atr10[k] >= atrP15) { lCoiling = false; break; }
        let lPriorCoiling = true;
        for (let k = Math.max(0, L - 1 - COIL_W); k < L - 1; k++) if (atr10[k] >= atrP15) { lPriorCoiling = false; break; }
        const avgCoilATR = coiling.length ? coiling.reduce((s, i) => s + atr10[i], 0) / coiling.length : atrP15 * 0.7;
        const avgBrkATR = coilBreak.length ? coilBreak.reduce((s, i) => s + atr10[i], 0) / coilBreak.length : atrP15;
        const avgSpikeUpATR = volSpike.length ? volSpike.reduce((s, i) => s + atr10[i], 0) / volSpike.length : atrP95;
        const avgSpikeDnATR = volSpikeDn.length ? volSpikeDn.reduce((s, i) => s + atr10[i], 0) / volSpikeDn.length : atrP95;
        add(toPattern(
            `RANGE COMPRESSION COIL  ATR below ${atrP15.toFixed(2)}% for ${COIL_W}+ days`,
            fwdStats(coiling),
            lCoiling && lATR < atrP15,
            `${ticker} in a ${COIL_W}-bar range compression — daily ATR avg ${avgCoilATR.toFixed(2)}% of price (p15 threshold: ${atrP15.toFixed(2)}%) · coiled spring, historically precedes explosive directional move · ${coiling.length}× seen`,
        ));
        add(toPattern(
            `RANGE EXPANSION BREAK  first ATR expansion after ${COIL_W}-day compression`,
            fwdStats(coilBreak),
            lPriorCoiling && lATR >= atrP15 && L > 0 && atr10[L - 1] < atrP15,
            `${ticker}'s daily range just expanded above its compression threshold (${atrP15.toFixed(2)}%) after ${COIL_W}+ quiet days — avg ATR at break ${avgBrkATR.toFixed(2)}% · directional move starting · ${coilBreak.length}× historically`,
        ));
        add(toPattern(
            `PANIC VOL SPIKE + UP  ATR ≥${atrP95.toFixed(2)}% (top 5%) with extreme up day`,
            fwdStats(volSpike),
            lATR >= atrP95 && lRet >= retP90,
            `${ticker}: intraday range at its top-5% ever (avg ${avgSpikeUpATR.toFixed(2)}% of price) with a big up close — vol explosion on a rip, historically reversals follow · ${volSpike.length}× seen`,
        ));
        add(toPattern(
            `PANIC VOL SPIKE + DOWN  ATR ≥${atrP95.toFixed(2)}% (top 5%) with extreme down day`,
            fwdStats(volSpikeDn),
            lATR >= atrP95 && lRet <= retP10,
            `${ticker}: intraday range at its top-5% ever (avg ${avgSpikeDnATR.toFixed(2)}% of price) with a big down close — vol explosion on a flush, historically precedes capitulation or reversal · ${volSpikeDn.length}× seen`,
        ));
    }

    // ── Layer 6: Volume Climax — vol extremes at price extremes ──────────────
    // Volume climax = top-5% volume on an extreme return day.
    // This is a structural event, not just "big move" — it signals institutional
    // participation (panic selling / panic buying). Completely different dimension from price.
    {
        const vols = sorted.slice(1).map(b => b.v).filter(v => v > 0).sort((a, b) => a - b);
        const vP95 = vols[Math.floor(vols.length * 0.95)] ?? vols[vols.length - 1];
        const vP5 = vols[Math.floor(vols.length * 0.05)] ?? vols[0];
        const lVol = sorted[L].v;
        const volClimaxUp: number[] = [], volClimaxDn: number[] = [];
        const volDryUp: number[] = [], volDryDn: number[] = [];
        for (let i = 1; i < n - PATH_LEN; i++) {
            if (sorted[i].v >= vP95 && ret[i] >= retP90) volClimaxUp.push(i);    // huge volume + huge up = buying climax
            if (sorted[i].v >= vP95 && ret[i] <= retP10) volClimaxDn.push(i);    // huge volume + huge down = selling climax
            if (sorted[i].v <= vP5 && dd[i] < ddP25) volDryUp.push(i);           // near ATH on almost no volume = distribution
            if (sorted[i].v <= vP5 && ret[i] <= retP25) volDryDn.push(i);        // small down day on tiny volume = no conviction selling
        }
        const avgVCU = volClimaxUp.length ? volClimaxUp.reduce((s, i) => s + sorted[i].v, 0) / volClimaxUp.length / vP95 : 1;
        const avgVCD = volClimaxDn.length ? volClimaxDn.reduce((s, i) => s + sorted[i].v, 0) / volClimaxDn.length / vP95 : 1;
        const avgVDU = volDryUp.length ? volDryUp.reduce((s, i) => s + sorted[i].v, 0) / volDryUp.length / vP95 : 0;
        const avgVDD = volDryDn.length ? volDryDn.reduce((s, i) => s + sorted[i].v, 0) / volDryDn.length / vP95 : 0;
        add(toPattern(
            `BUYING CLIMAX  top-5% volume + extreme up close`,
            fwdStats(volClimaxUp),
            lVol >= vP95 && lRet >= retP90,
            `${ticker}: top-5% volume (avg ${(avgVCU * 100).toFixed(0)}% of climax threshold) on an extreme up day — institutional buying climax · historically often precedes short-term exhaustion · ${volClimaxUp.length}× seen`,
        ));
        add(toPattern(
            `SELLING CLIMAX  top-5% volume + extreme down close`,
            fwdStats(volClimaxDn),
            lVol >= vP95 && lRet <= retP10,
            `${ticker}: top-5% volume (avg ${(avgVCD * 100).toFixed(0)}% of climax threshold) on an extreme down day — institutional selling climax · historically often marks capitulation lows · ${volClimaxDn.length}× seen`,
        ));
        add(toPattern(
            `NEAR ATH ON VOLUME DRY-UP  bottom-5% volume near all-time high`,
            fwdStats(volDryUp),
            lVol <= vP5 && lDD < ddP25,
            `${ticker} near its all-time high on its quietest volume (bottom 5% historically, avg ${(avgVDU * 100).toFixed(0)}% of climax level) — distribution pattern, buyers absent at highs · ${volDryUp.length}× seen`,
        ));
        add(toPattern(
            `FADE ON NO VOLUME  small down day on bottom-5% volume`,
            fwdStats(volDryDn),
            lVol <= vP5 && lRet <= retP25,
            `${ticker} declining on its quietest volume (bottom 5% historically) — no conviction behind the selling · ${volDryDn.length}× seen`,
        ));
    }

    // ── Layer 7: Gap extremes — thresholds from this stock's gap distribution ──
    {
        const buckets: [string, number, number][] = [
            [`EXTREME GAP DOWN  ≤${f(gapP5)} at open`, -Infinity, gapP5],
            [`LARGE GAP DOWN  ${f(gapP5)} to ${f(gapP10)} at open`, gapP5, gapP10],
            [`LARGE GAP UP  ${f(gapP90)} to ${f(gapP95)} at open`, gapP90, gapP95],
            [`EXTREME GAP UP  ≥${f(gapP95)} at open`, gapP95, Infinity],
        ];
        for (const [lbl, lo, hi] of buckets) {
            const idx: number[] = [];
            for (let i = 1; i < n - PATH_LEN; i++) if (gap[i] > lo && gap[i] <= hi) idx.push(i);
            const avgG = idx.length ? idx.reduce((s, i) => s + gap[i], 0) / idx.length : 0;
            add(toPattern(lbl, fwdStats(idx), lGap > lo && lGap <= hi, `${ticker}: avg opening gap at trigger was ${avgG >= 0 ? '+' : ''}${avgG.toFixed(2)}% vs prior close`));
        }
    }

    // ── Layer 8: Intraday structure at gap extremes ────────────────────────────
    // Gapped down hard (≤p5) then closed above prior close → failed breakdown
    {
        const failedGapDn: number[] = [], failedGapUp: number[] = [];
        for (let i = 1; i < n - PATH_LEN; i++) {
            if (gap[i] <= gapP5 && sorted[i].c > sorted[i - 1].c) failedGapDn.push(i);
            if (gap[i] >= gapP95 && sorted[i].c < sorted[i - 1].c) failedGapUp.push(i);
        }
        const avgFdnGap = failedGapDn.length ? failedGapDn.reduce((s, i) => s + gap[i], 0) / failedGapDn.length : 0;
        const avgFupGap = failedGapUp.length ? failedGapUp.reduce((s, i) => s + gap[i], 0) / failedGapUp.length : 0;
        add(toPattern(`GAP DOWN REVERSAL  opened ≤${f(gapP5)}, closed above prior close`, fwdStats(failedGapDn), lGap <= gapP5 && lRet > 0,
            `${ticker} gapped down avg ${avgFdnGap.toFixed(2)}% at open but buyers stepped in — closed above prior close`));
        add(toPattern(`GAP UP REVERSAL  opened ≥${f(gapP95)}, closed below prior close`, fwdStats(failedGapUp), lGap >= gapP95 && lRet < 0,
            `${ticker} gapped up avg +${avgFupGap.toFixed(2)}% at open but sellers took over — closed below prior close`));
    }

    // ── Layer 9: Reversal candle structure ────────────────────────────────────
    // First up day after extended down streak (p75 streak length)
    // First down day after extended up streak (p75)
    {
        const strT = Math.max(5, Math.round(strP75));
        const firstUp: number[] = [], firstDn: number[] = [];
        for (let i = 1; i < n - PATH_LEN; i++) {
            // str[i-1] was a long down streak and today is the first up
            if (str[i - 1] <= -strT && ret[i] > 0) firstUp.push(i);
            if (str[i - 1] >= strT && ret[i] < 0) firstDn.push(i);
        }
        const avgPriorDn = firstUp.length ? firstUp.reduce((s, i) => s + Math.abs(str[i - 1]), 0) / firstUp.length : strT;
        const avgBounce = firstUp.length ? firstUp.reduce((s, i) => s + ret[i], 0) / firstUp.length : 0;
        const avgPriorUp = firstDn.length ? firstDn.reduce((s, i) => s + str[i - 1], 0) / firstDn.length : strT;
        const avgSell = firstDn.length ? firstDn.reduce((s, i) => s + ret[i], 0) / firstDn.length : 0;
        add(toPattern(`FIRST BOUNCE after ${strT}+ day losing streak`, fwdStats(firstUp), str[L - 1] <= -strT && lRet > 0,
            `${ticker} had been falling for avg ${avgPriorDn.toFixed(1)} days straight — this was the first bounce day, avg ${avgBounce >= 0 ? '+' : ''}${avgBounce.toFixed(2)}%`));
        add(toPattern(`FIRST RED DAY after ${strT}+ day winning streak`, fwdStats(firstDn), str[L - 1] >= strT && lRet < 0,
            `${ticker} had been rising for avg ${avgPriorUp.toFixed(1)} days straight — this was the first red day, avg ${avgSell.toFixed(2)}%`));
    }

    // ── Layer 10: Combinations — 2D cross of percentile buckets ──────────────
    // Each combo is unique to the stock because both axes use that stock's own thresholds

    // A) Extreme single-day crash × drawdown zone (where were we when it crashed?)
    {
        const zones: [string, number, number][] = [
            [`near all-time high (within ${ddP25.toFixed(1)}%)`, 0, ddP25],
            [`mid drawdown (${ddP25.toFixed(1)}–${ddP75.toFixed(1)}% below ATH)`, ddP25, ddP75],
            [`deep bear (≥${ddP75.toFixed(1)}% below ATH)`, ddP75, Infinity],
        ];
        for (const [zLbl, dLo, dHi] of zones) {
            const idx: number[] = [];
            for (let i = 1; i < n - PATH_LEN; i++)
                if (ret[i] <= retP5 && dd[i] >= dLo && dd[i] < dHi) idx.push(i);
            add(toPattern(`SEVERE CRASH DAY  ≤${f(retP5)} · ${zLbl}`, fwdStats(idx), lRet <= retP5 && lDD >= dLo && lDD < dHi));
        }
    }

    // H) Short-swing panic immediately followed by next-day bounce/continuation
    {
        const bounceAfterPanic: number[] = [], continuationAfterPanic: number[] = [];
        for (let i = wS + 1; i < n - PATH_LEN; i++) {
            if (rS[i - 1] <= rSP5) {
                if (ret[i] > 0) bounceAfterPanic.push(i);
                else continuationAfterPanic.push(i);
            }
        }
        add(toPattern(`BOUNCE DAY after ${wS}-day panic  ${wS}d ≤${f(rSP5)}`, fwdStats(bounceAfterPanic), lRS <= rSP5 && lRet > 0));
        add(toPattern(`FLUSH DAY after ${wS}-day panic  ${wS}d ≤${f(rSP5)}`, fwdStats(continuationAfterPanic), lRS <= rSP5 && lRet < 0));
    }

    // I) Extreme bear drawdown × short-swing panic — the deepest recoverable hole
    {
        const idx: number[] = [];
        for (let i = wS; i < n - PATH_LEN; i++)
            if (dd[i] >= ddP90 && rS[i] <= rSP5) idx.push(i);
        add(toPattern(`EXTREME BEAR ≥${ddP90.toFixed(1)}% below ATH + ${wS}-day panic ≤${f(rSP5)}`, fwdStats(idx), lDD >= ddP90 && lRS <= rSP5));
    }

    // J) Full-cycle crash velocity — how fast did the stock get here
    //    Same endpoint drawdown but arrived via fast crash vs slow grind
    {
        const fastCrash: number[] = [], slowGrind: number[] = [];
        for (let i = wM; i < n - PATH_LEN; i++) {
            if (dd[i] >= ddP75) {
                if (rM[i] <= rMP5) fastCrash.push(i);   // arrived fast
                if (rM[i] >= rMP90) slowGrind.push(i);   // deep in hole but cycle return OK (came from deeper)
            }
        }
        add(toPattern(`DEEP BEAR ≥${ddP75.toFixed(1)}% below ATH — fast arrival ≤${f(rMP5)} in ${wM}d`, fwdStats(fastCrash), lDD >= ddP75 && lRM <= rMP5));
        add(toPattern(`DEEP BEAR ≥${ddP75.toFixed(1)}% below ATH — already bouncing ≥${f(rMP90)} in ${wM}d`, fwdStats(slowGrind), lDD >= ddP75 && lRM >= rMP90));
    }

    // K) Extreme gap down that reversed (close > open) at different dd zones
    {
        const reverseGapDn: number[] = [];
        for (let i = 1; i < n - PATH_LEN; i++) {
            if (gap[i] <= gapP10 && sorted[i].c > sorted[i].o) reverseGapDn.push(i);
        }
        add(toPattern(`GAP DOWN RECOVERY  opened ≤${f(gapP10)}, closed above open`, fwdStats(reverseGapDn), lGap <= gapP10 && sorted[L].c > sorted[L].o));
    }

    // ── RARE EVENT LAYERS — stock-specific multi-condition events ────────────
    // These combine 2-3 conditions simultaneously so each has ~10-30 occurrences.
    // Every threshold comes from THIS stock's own distribution — no hardcoding.

    // R2: Full cascade — all three timeframes (daily + short-swing + medium-cycle) extreme simultaneously
    // This is the "everything is broken at once" event. Very rare by definition.
    {
        const full_dn: number[] = [], full_up: number[] = [];
        for (let i = wM; i < n - PATH_LEN; i++) {
            if (ret[i] <= retP5 && rS[i] <= rSP5 && rM[i] <= rMP10) full_dn.push(i);
            if (ret[i] >= retP95 && rS[i] >= rSP95 && rM[i] >= rMP90) full_up.push(i);
        }
        const avgRet_dn = full_dn.length ? full_dn.reduce((s, i) => s + ret[i], 0) / full_dn.length : 0;
        const avgRS_dn = full_dn.length ? full_dn.reduce((s, i) => s + rS[i], 0) / full_dn.length : 0;
        const avgRM_dn = full_dn.length ? full_dn.reduce((s, i) => s + rM[i], 0) / full_dn.length : 0;
        const avgRet_up = full_up.length ? full_up.reduce((s, i) => s + ret[i], 0) / full_up.length : 0;
        const avgRS_up = full_up.length ? full_up.reduce((s, i) => s + rS[i], 0) / full_up.length : 0;
        const avgRM_up = full_up.length ? full_up.reduce((s, i) => s + rM[i], 0) / full_up.length : 0;
        add(toPattern(
            `FULL CRASH CASCADE (daily p5 + ${wS}d p5 + ${wM}d p10 all hit)`,
            fwdStats(full_dn),
            lRet <= retP5 && lRS <= rSP5 && lRM <= rMP10,
            `${ticker}: all timeframes extreme — day avg ${f(avgRet_dn)}, ${wS}d avg ${f(avgRS_dn)}, ${wM}d avg ${f(avgRM_dn)} · rarest compound selloff for this stock`,
        ));
        add(toPattern(
            `FULL RIP CASCADE (daily p95 + ${wS}d p95 + ${wM}d p90 all hit)`,
            fwdStats(full_up),
            lRet >= retP95 && lRS >= rSP95 && lRM >= rMP90,
            `${ticker}: all timeframes extreme up — day avg ${f(avgRet_up)}, ${wS}d avg ${f(avgRS_up)}, ${wM}d avg ${f(avgRM_up)} · rarest compound rip for this stock`,
        ));
    }

    // R3: Deepest drawdown hole + biggest single up/down day
    // The stock is in its worst-ever drawdown zone AND has a massive day.
    // Captures crisis bounces and final capitulation legs.
    {
        const deep_bounce: number[] = [], deep_flush: number[] = [];
        for (let i = 1; i < n - PATH_LEN; i++) {
            if (dd[i] >= ddP90 && ret[i] >= retP95) deep_bounce.push(i);
            if (dd[i] >= ddP90 && ret[i] <= retP2) deep_flush.push(i);
        }
        const avgDD_b = deep_bounce.length ? deep_bounce.reduce((s, i) => s + dd[i], 0) / deep_bounce.length : 0;
        const avgR_b = deep_bounce.length ? deep_bounce.reduce((s, i) => s + ret[i], 0) / deep_bounce.length : 0;
        const avgDD_f = deep_flush.length ? deep_flush.reduce((s, i) => s + dd[i], 0) / deep_flush.length : 0;
        const avgR_f = deep_flush.length ? deep_flush.reduce((s, i) => s + ret[i], 0) / deep_flush.length : 0;
        add(toPattern(
            `DEEP BEAR MASSIVE BOUNCE  ≥${ddP90.toFixed(1)}% below ATH + day ≥${f(retP95)}`,
            fwdStats(deep_bounce),
            lDD >= ddP90 && lRet >= retP95,
            `${ticker} was avg ${avgDD_b.toFixed(1)}% below ATH and exploded avg ${f(avgR_b)} — panic low bounce, rare for this stock`,
        ));
        add(toPattern(
            `DEEP BEAR FINAL FLUSH  ≥${ddP90.toFixed(1)}% below ATH + day ≤${f(retP2)}`,
            fwdStats(deep_flush),
            lDD >= ddP90 && lRet <= retP2,
            `${ticker} was already avg ${avgDD_f.toFixed(1)}% below ATH then crashed avg ${f(avgR_f)} — capitulation flush, rare for this stock`,
        ));
    }

    // R5: Long-cycle parabolic exhaustion — stock ripped for two full cycles (wL)
    //     but the short-swing (wS) has now collapsed into panic territory.
    //     This is "great 3-month run, but last week fell apart" — rare reversal signal.
    {
        const exhaust_dn: number[] = [], exhaust_up: number[] = [];
        for (let i = wL; i < n - PATH_LEN; i++) {
            if (rL[i] >= rLP95 && rS[i] <= rSP5) exhaust_dn.push(i);  // top of long run, short-term cracking
            if (rL[i] <= rLP5 && rS[i] >= rSP95) exhaust_up.push(i);  // bottom of long crash, short-term bouncing
        }
        const avgRL_d = exhaust_dn.length ? exhaust_dn.reduce((s, i) => s + rL[i], 0) / exhaust_dn.length : 0;
        const avgRS_d = exhaust_dn.length ? exhaust_dn.reduce((s, i) => s + rS[i], 0) / exhaust_dn.length : 0;
        const avgRL_u = exhaust_up.length ? exhaust_up.reduce((s, i) => s + rL[i], 0) / exhaust_up.length : 0;
        const avgRS_u = exhaust_up.length ? exhaust_up.reduce((s, i) => s + rS[i], 0) / exhaust_up.length : 0;
        add(toPattern(
            `BULL EXHAUSTION  ${wL}d up ≥${f(rLP95)} but ${wS}d cracking ≤${f(rSP5)}`,
            fwdStats(exhaust_dn),
            lRL >= rLP95 && lRS <= rSP5,
            `${ticker}: long-run avg ${f(avgRL_d)} (still rich) but short-swing avg ${f(avgRS_d)} (cracking) — rare topping structure for this stock`,
        ));
        add(toPattern(
            `BEAR EXHAUSTION  ${wL}d down ≤${f(rLP5)} but ${wS}d snapping back ≥${f(rSP95)}`,
            fwdStats(exhaust_up),
            lRL <= rLP5 && lRS >= rSP95,
            `${ticker}: long-run avg ${f(avgRL_u)} (still wrecked) but short-swing avg ${f(avgRS_u)} (snapping back) — rare basing structure for this stock`,
        ));
    }

    // R6: Conviction gap day — gap AND close both confirm direction at extreme levels
    // Gapped up p99 AND closed at p99 daily return AND close in top 10% of day range.
    // Gapped down p1  AND closed at p1  daily return AND close in bottom 10% of day range.
    {
        const conviction_up: number[] = [], conviction_dn: number[] = [];
        for (let i = 1; i < n - PATH_LEN; i++) {
            if (gap[i] >= gapP95 && ret[i] >= retP95 && cpos[i] > 0.80) conviction_up.push(i);
            if (gap[i] <= gapP5 && ret[i] <= retP5 && cpos[i] < 0.20) conviction_dn.push(i);
        }
        const avgG_u = conviction_up.length ? conviction_up.reduce((s, i) => s + gap[i], 0) / conviction_up.length : 0;
        const avgR_u = conviction_up.length ? conviction_up.reduce((s, i) => s + ret[i], 0) / conviction_up.length : 0;
        const avgG_d = conviction_dn.length ? conviction_dn.reduce((s, i) => s + gap[i], 0) / conviction_dn.length : 0;
        const avgR_d = conviction_dn.length ? conviction_dn.reduce((s, i) => s + ret[i], 0) / conviction_dn.length : 0;
        add(toPattern(
            `CONVICTION UP DAY  gapped ≥${f(gapP95)}, closed strong near high`,
            fwdStats(conviction_up),
            lGap >= gapP95 && lRet >= retP95 && lCPos > 0.80,
            `${ticker}: gapped up avg ${f(avgG_u)}, closed avg ${f(avgR_u)} near the high — full bull conviction · rare for this stock`,
        ));
        add(toPattern(
            `CONVICTION DOWN DAY  gapped ≤${f(gapP5)}, closed weak near low`,
            fwdStats(conviction_dn),
            lGap <= gapP5 && lRet <= retP5 && lCPos < 0.20,
            `${ticker}: gapped down avg ${f(avgG_d)}, closed avg ${f(avgR_d)} near the low — full bear conviction · rare for this stock`,
        ));
    }

    // R7: Post-worst-week first green day
    // The medium-cycle (wM) return hit its bottom 1% — then today is the FIRST positive close.
    // Captures the exact turning bar at historically extreme multi-week lows.
    {
        const first_green_after_crash: number[] = [], first_red_after_rip: number[] = [];
        for (let i = wM + 1; i < n - PATH_LEN; i++) {
            if (rM[i - 1] <= rMP2 && ret[i] > 0) first_green_after_crash.push(i);
            if (rM[i - 1] >= rMP98 && ret[i] < 0) first_red_after_rip.push(i);
        }
        const avgPriorRM_g = first_green_after_crash.length
            ? first_green_after_crash.reduce((s, i) => s + rM[i - 1], 0) / first_green_after_crash.length : 0;
        const avgBounce_g = first_green_after_crash.length
            ? first_green_after_crash.reduce((s, i) => s + ret[i], 0) / first_green_after_crash.length : 0;
        const avgPriorRM_r = first_red_after_rip.length
            ? first_red_after_rip.reduce((s, i) => s + rM[i - 1], 0) / first_red_after_rip.length : 0;
        const avgSell_r = first_red_after_rip.length
            ? first_red_after_rip.reduce((s, i) => s + ret[i], 0) / first_red_after_rip.length : 0;
        add(toPattern(
            `FIRST GREEN DAY after ${wM}-day crash  prior ${wM}d was ≤${f(rMP2)}`,
            fwdStats(first_green_after_crash),
            rM[L - 1] <= rMP2 && lRet > 0,
            `${ticker}: prior ${wM}d return was avg ${f(avgPriorRM_g)} (p2 level) — this was the first bounce day, avg ${f(avgBounce_g)} · rare relief signal`,
        ));
        add(toPattern(
            `FIRST RED DAY after ${wM}-day rip  prior ${wM}d was ≥${f(rMP98)}`,
            fwdStats(first_red_after_rip),
            rM[L - 1] >= rMP98 && lRet < 0,
            `${ticker}: prior ${wM}d return was avg ${f(avgPriorRM_r)} (p98 level) — this was the first crack day, avg ${f(avgSell_r)} · rare exhaustion signal`,
        ));
    }

    // R10: Deepest-ever drawdown day — dd≥p98 AND any additional extreme
    //      The absolute worst bear market zones for this specific stock.
    {
        const ath_crater_up: number[] = [], ath_crater_dn: number[] = [];
        for (let i = 1; i < n - PATH_LEN; i++) {
            if (dd[i] >= ddP98 && ret[i] > 0) ath_crater_up.push(i);  // deep crater but closed green
            if (dd[i] >= ddP98 && ret[i] <= retP10) ath_crater_dn.push(i);  // crater and still selling
        }
        const avgDD_cu = ath_crater_up.length ? ath_crater_up.reduce((s, i) => s + dd[i], 0) / ath_crater_up.length : 0;
        const avgR_cu = ath_crater_up.length ? ath_crater_up.reduce((s, i) => s + ret[i], 0) / ath_crater_up.length : 0;
        const avgDD_cd = ath_crater_dn.length ? ath_crater_dn.reduce((s, i) => s + dd[i], 0) / ath_crater_dn.length : 0;
        const avgR_cd = ath_crater_dn.length ? ath_crater_dn.reduce((s, i) => s + ret[i], 0) / ath_crater_dn.length : 0;
        add(toPattern(
            `DEEPEST BEAR ZONE — GREEN CLOSE  ≥${ddP98.toFixed(1)}% below ATH`,
            fwdStats(ath_crater_up),
            lDD >= ddP98 && lRet > 0,
            `${ticker} was avg ${avgDD_cu.toFixed(1)}% below its ATH (top 2% worst) but closed up avg ${f(avgR_cu)} — rarest recovery day for this stock`,
        ));
        add(toPattern(
            `DEEPEST BEAR ZONE — STILL SELLING  ≥${ddP98.toFixed(1)}% below ATH + ≤${f(retP10)}`,
            fwdStats(ath_crater_dn),
            lDD >= ddP98 && lRet <= retP10,
            `${ticker} was avg ${avgDD_cd.toFixed(1)}% below ATH (top 2% worst drawdown) and still dropped avg ${f(avgR_cd)} — historically extreme capitulation for this stock`,
        ));
    }

    // Wyckoff zone indices collected from Layer 11 (filled below, exported in return)
    const wyckoffZonesOut: WyckoffZones = { accumRange: [], distRange: [], shakeout: [], upthrust: [] };

    // ── Layer 11: Wyckoff Trading Range — Accumulation & Distribution ─────────
    // Major trend reversals are preceded by a Trading Range where smart money
    // builds (accumulation at lows) or unloads (distribution at highs) positions.
    // Signal: price chops sideways at an extreme, volume confirms smart money intent.
    {
        // ── WYCKOFF STRUCTURE-BASED DETECTION ─────────────────────────────────
        // No percentage thresholds. Everything is derived from the market's own structure:
        //   • Swing pivots   — N-bar highs/lows define trend direction
        //   • Volume climax  — spike above rolling average marks SC (Selling Climax) / BC (Buying Climax)
        //   • Trend structure— confirmed by comparing consecutive swing pivot levels
        //   • Range boundaries — set by the Automatic Rally/Reaction after the climax bar
        //   • Exit            — price clears range boundary by 0.5 ATR (breakout) OR
        //                       collapses 2 ATR past the climax bar (range failed)

        const SWING_N = 7;   // bars each side required to confirm a swing pivot
        const VOL_W = 20;  // lookback for average volume (climax = > 1.5× this)
        const ATR_W = 14;  // ATR smoothing period
        const AR_LOOK = 20;  // bars after climax to scan for the Automatic Rally/Reaction high/low
        const INNER_RNG_W = 20;  // rolling window for Spring / UTAD support/resistance
        const MIN_RANGE_BARS = 15;// minimum bar count for a range to be counted (~3 trading weeks)

        // ATR (Wilder's smoothed)
        const atr11: number[] = new Array(n).fill(0);
        for (let i = 1; i < n; i++) {
            const tr = Math.max(
                sorted[i].h - sorted[i].l,
                Math.abs(sorted[i].h - sorted[i - 1].c),
                Math.abs(sorted[i].l - sorted[i - 1].c)
            );
            atr11[i] = i < ATR_W ? tr : (atr11[i - 1] * (ATR_W - 1) + tr) / ATR_W;
        }

        // Rolling volume average
        const volMA11: number[] = new Array(n).fill(0);
        for (let i = VOL_W; i < n; i++) {
            let s = 0;
            for (let k = i - VOL_W; k < i; k++) s += sorted[k].v;
            volMA11[i] = s / VOL_W;
        }

        // Swing pivot flags (SWING_N bars each side, no ties)
        const isSwingLow11: boolean[] = new Array(n).fill(false);
        const isSwingHigh11: boolean[] = new Array(n).fill(false);
        for (let i = SWING_N; i < n - SWING_N; i++) {
            let lo = true, hi = true;
            for (let k = i - SWING_N; k <= i + SWING_N; k++) {
                if (k === i) continue;
                if (sorted[k].l <= sorted[i].l) lo = false;
                if (sorted[k].h >= sorted[i].h) hi = false;
            }
            isSwingLow11[i] = lo;
            isSwingHigh11[i] = hi;
        }

        const startIdx11 = SWING_N * 2 + AR_LOOK + VOL_W;

        const accumRange: number[] = [];
        const distRange: number[] = [];

        // ── ACCUMULATION: structure-based ─────────────────────────────────────
        // Entry trigger = Selling Climax:
        //   - Bar is a confirmed swing low (SWING_N bars each side)
        //   - Volume spikes above 1.5× VOL_W average (climactic selling)
        //   - The 2 most-recent prior swing highs are descending (confirms prior downtrend)
        // Range high = highest intraday high reached in the AR_LOOK bars after SC (Automatic Rally)
        // Exit (markup confirmed)  = close > range high by 0.5 ATR
        // Exit (range invalidated) = close > 2 ATR below SC low (structure broke down)
        {
            let state: 'idle' | 'ranging' = 'idle';
            let scLow = 0, rangeHigh = 0, rangeStart = -1;
            for (let i = startIdx11; i < n; i++) {
                if (state === 'idle') {
                    if (isSwingLow11[i] && volMA11[i] > 0 && sorted[i].v > volMA11[i] * 1.5) {
                        // Collect 2 most-recent swing highs before this bar
                        const prevHi: number[] = [];
                        for (let k = i - 1; k >= startIdx11 - SWING_N && prevHi.length < 2; k--) {
                            if (isSwingHigh11[k]) prevHi.push(k);
                        }
                        // Downtrend structure: the closer swing high is lower than the earlier one
                        if (prevHi.length >= 2 && sorted[prevHi[0]].h < sorted[prevHi[1]].h) {
                            state = 'ranging';
                            scLow = sorted[i].l;
                            rangeStart = i;
                            // Automatic Rally high = highest high in next AR_LOOK bars
                            let arHigh = sorted[i].h;
                            for (let k = i + 1; k < Math.min(i + AR_LOOK, n); k++) {
                                if (sorted[k].h > arHigh) arHigh = sorted[k].h;
                            }
                            rangeHigh = arHigh;
                        }
                    }
                } else {
                    if (sorted[i].c > rangeHigh + atr11[i] * 0.5) {
                        // Markup: close breaks above AR high
                        const len = i - rangeStart;
                        if (len >= MIN_RANGE_BARS) for (let k = rangeStart; k < i; k++) accumRange.push(k);
                        state = 'idle'; rangeStart = -1;
                    } else if (sorted[i].c < scLow - atr11[i] * 2) {
                        // Range failed: price collapsed below SC low — not an accumulation
                        state = 'idle'; rangeStart = -1;
                    }
                }
            }
            if (state === 'ranging' && rangeStart >= 0) {
                const len = (n - PATH_LEN) - rangeStart;
                if (len >= MIN_RANGE_BARS) for (let k = rangeStart; k < n - PATH_LEN; k++) accumRange.push(k);
            }
        }

        // ── DISTRIBUTION: structure-based ─────────────────────────────────────
        // Entry trigger = Buying Climax:
        //   - Bar is a confirmed swing high (SWING_N bars each side)
        //   - Volume spikes above 1.5× VOL_W average (climactic buying)
        //   - The 2 most-recent prior swing lows are ascending (confirms prior uptrend)
        // Range low = lowest intraday low reached in the AR_LOOK bars after BC (Automatic Reaction)
        // Exit (markdown confirmed)  = close < range low by 0.5 ATR
        // Exit (range invalidated)   = close > 2 ATR above BC high (new uptrend resumes)
        {
            let state: 'idle' | 'ranging' = 'idle';
            let bcHigh = 0, rangeLow = 0, rangeStart = -1;
            for (let i = startIdx11; i < n; i++) {
                if (state === 'idle') {
                    if (isSwingHigh11[i] && volMA11[i] > 0 && sorted[i].v > volMA11[i] * 1.5) {
                        // Collect 2 most-recent swing lows before this bar
                        const prevLo: number[] = [];
                        for (let k = i - 1; k >= startIdx11 - SWING_N && prevLo.length < 2; k--) {
                            if (isSwingLow11[k]) prevLo.push(k);
                        }
                        // Uptrend structure: the closer swing low is higher than the earlier one
                        if (prevLo.length >= 2 && sorted[prevLo[0]].l > sorted[prevLo[1]].l) {
                            state = 'ranging';
                            bcHigh = sorted[i].h;
                            rangeStart = i;
                            // Automatic Reaction low = lowest low in next AR_LOOK bars
                            let arLow = sorted[i].l;
                            for (let k = i + 1; k < Math.min(i + AR_LOOK, n); k++) {
                                if (sorted[k].l < arLow) arLow = sorted[k].l;
                            }
                            rangeLow = arLow;
                        }
                    }
                } else {
                    if (sorted[i].c < rangeLow - atr11[i] * 0.5) {
                        // Markdown: close breaks below AR low
                        const len = i - rangeStart;
                        if (len >= MIN_RANGE_BARS) for (let k = rangeStart; k < i; k++) distRange.push(k);
                        state = 'idle'; rangeStart = -1;
                    } else if (sorted[i].c > bcHigh + atr11[i] * 2) {
                        // Range failed: price blew past BC high — uptrend resumed, not distribution
                        state = 'idle'; rangeStart = -1;
                    }
                }
            }
            if (state === 'ranging' && rangeStart >= 0) {
                const len = (n - PATH_LEN) - rangeStart;
                if (len >= MIN_RANGE_BARS) for (let k = rangeStart; k < n - PATH_LEN; k++) distRange.push(k);
            }
        }

        const accumSet = new Set(accumRange);
        const distSet = new Set(distRange);

        // ── SPRING — within accumulation range ───────────────────────────────
        // Intraday poke below the rolling structural low (20d intraday lows), close recovers
        // above it — weak hands flushed, smart money absorbed supply
        const accumShakeout: number[] = [];
        for (let i = startIdx11 + 1; i < n - PATH_LEN; i++) {
            if (!accumSet.has(i)) continue;
            let structLow = Infinity;
            for (let k = Math.max(0, i - INNER_RNG_W); k < i; k++) {
                if (sorted[k].l < structLow) structLow = sorted[k].l;
            }
            if (sorted[i].l < structLow && sorted[i].c >= structLow) accumShakeout.push(i);
        }

        // ── UPTHRUST (UTAD) — within distribution range ───────────────────────
        // Intraday poke above the rolling structural high (20d intraday highs), close reverses
        // back below it — buyers trapped, smart money distributing into strength
        const distUpthrust: number[] = [];
        for (let i = startIdx11 + 1; i < n - PATH_LEN; i++) {
            if (!distSet.has(i)) continue;
            let structHigh = -Infinity;
            for (let k = Math.max(0, i - INNER_RNG_W); k < i; k++) {
                if (sorted[k].h > structHigh) structHigh = sorted[k].h;
            }
            if (sorted[i].h > structHigh && sorted[i].c <= structHigh) distUpthrust.push(i);
        }

        // Active-bar checks
        const lAccum = accumSet.has(L);
        const lDist = distSet.has(L);
        let loHL = Infinity, hiHL = -Infinity;
        for (let k = Math.max(0, L - INNER_RNG_W); k < L; k++) {
            if (sorted[k].l < loHL) loHL = sorted[k].l;
            if (sorted[k].h > hiHL) hiHL = sorted[k].h;
        }
        const lAccumShake = lAccum && sorted[L].l < loHL && sorted[L].c >= loHL;
        const lDistUT = lDist && sorted[L].h > hiHL && sorted[L].c <= hiHL;

        const accumDays = accumRange.length;
        const distDays = distRange.length;

        // ── Expose zone indices for chart overlays ───────────────────────────
        wyckoffZonesOut.accumRange = accumRange;
        wyckoffZonesOut.distRange = distRange;
        wyckoffZonesOut.shakeout = accumShakeout;
        wyckoffZonesOut.upthrust = distUpthrust;

        add(toPattern(
            `WYCKOFF ACCUMULATION RANGE  Selling Climax (swing low + vol spike) → Automatic Rally → range`,
            fwdStats(accumRange), lAccum,
            `${ticker} formed a Wyckoff accumulation structure: a climactic selling bar (swing low with elevated volume) after descending swing highs terminated the downtrend; the Automatic Rally set range resistance; price then oscillated in that structural range for ${accumDays} bars — smart money absorbing supply before markup · ${accumRange.length}× historically`,
        ));
        add(toPattern(
            `WYCKOFF DISTRIBUTION RANGE  Buying Climax (swing high + vol spike) → Automatic Reaction → range`,
            fwdStats(distRange), lDist,
            `${ticker} formed a Wyckoff distribution structure: a climactic buying bar (swing high with elevated volume) after ascending swing lows terminated the uptrend; the Automatic Reaction set range support; price then oscillated in that structural range for ${distDays} bars — smart money distributing supply before markdown · ${distRange.length}× historically`,
        ));
        add(toPattern(
            `WYCKOFF SPRING  within accumulation range · structural low pierced intraday + close reclaimed`,
            fwdStats(accumShakeout), lAccumShake,
            `${ticker} inside an accumulation range — intraday dip below the 20d structural low flushed weak hands, buyers absorbed all selling, close recovered above support · classic Spring / shakeout before markup · ${accumShakeout.length}× historically`,
        ));
        add(toPattern(
            `WYCKOFF UPTHRUST (UTAD)  within distribution range · structural high pierced intraday + close reversed`,
            fwdStats(distUpthrust), lDistUT,
            `${ticker} inside a distribution range — intraday break above 20d structural high trapped buyers, sellers pushed close back below resistance · Upthrust After Distribution (UTAD) — final buyer trap before markdown · ${distUpthrust.length}× historically`,
        ));
    }

    // ── Layer N1/N2: 52-Week Breakouts, Failures, and Range Position ──────────
    // 252 trading days ≈ 1 calendar year. All thresholds from this stock's own data.
    // Breakout/breakdown: FIRST close above/below rolling 252-bar close extremes.
    // Range position: where today's close sits in the trailing 252-day price range.
    {
        const W52 = 252;
        if (n > W52 + PATH_LEN + 2) {
            // Rolling 252-bar close-based high and low (prior W52 bars, not including current)
            const roll52Hi: number[] = new Array(n).fill(0);
            const roll52Lo: number[] = new Array(n).fill(Infinity);
            for (let i = W52; i < n; i++) {
                let hi = -Infinity, lo = Infinity;
                for (let k = i - W52; k < i; k++) {
                    if (sorted[k].c > hi) hi = sorted[k].c;
                    if (sorted[k].c < lo) lo = sorted[k].c;
                }
                roll52Hi[i] = hi;
                roll52Lo[i] = lo;
            }
            // Range position at each bar: (close − 52wk low) / (52wk high − 52wk low)
            const rangePos52: number[] = new Array(n).fill(0.5);
            for (let i = W52; i < n; i++) {
                const span = roll52Hi[i] - roll52Lo[i];
                rangePos52[i] = span > 0 ? (sorted[i].c - roll52Lo[i]) / span : 0.5;
            }
            // Range position percentile thresholds from THIS stock's history
            const rpArr = rangePos52.slice(W52).sort((a, b) => a - b);
            const rp10 = rpArr[Math.floor(rpArr.length * 0.10)] ?? 0.10;
            const rp90 = rpArr[Math.floor(rpArr.length * 0.90)] ?? 0.90;
            // Classify each bar
            const new52Hi: number[] = [], new52Lo: number[] = [];
            const fail52Hi: number[] = [];
            const nearLow52: number[] = [], nearHigh52: number[] = [];
            const break52NearATH: number[] = [], break52DeepDD: number[] = [];
            for (let i = W52 + 1; i < n - PATH_LEN; i++) {
                const crossHi = sorted[i].c > roll52Hi[i] && sorted[i - 1].c <= roll52Hi[i - 1];
                const crossLo = sorted[i].c < roll52Lo[i] && sorted[i - 1].c >= roll52Lo[i - 1];
                if (crossHi) {
                    new52Hi.push(i);
                    if (dd[i] < ddP25) break52NearATH.push(i);
                    if (dd[i] >= ddP50) break52DeepDD.push(i); // new 52wk high while still in drawdown — bear recovery signal
                }
                if (crossLo) new52Lo.push(i);
                // Failed 52-week high: FIRST day stock's intraday high tags the 252d high but close fails below it
                if (sorted[i].h >= roll52Hi[i] && sorted[i].c < roll52Hi[i] && sorted[i - 1].h < roll52Hi[i - 1]) fail52Hi.push(i);
                if (rangePos52[i] <= rp10) nearLow52.push(i);
                if (rangePos52[i] >= rp90) nearHigh52.push(i);
            }
            // isActive checks for last bar
            const lRH52 = roll52Hi[n - 1], lRL52 = roll52Lo[n - 1];
            const prevRH52 = roll52Hi[n - 2], prevRL52 = roll52Lo[n - 2];
            const lRP52 = rangePos52[L];
            const avg52HiRet = new52Hi.length ? new52Hi.reduce((s, i) => s + ret[i], 0) / new52Hi.length : 0;
            const avg52LoRet = new52Lo.length ? new52Lo.reduce((s, i) => s + ret[i], 0) / new52Lo.length : 0;
            const avgRPLow52 = nearLow52.length ? nearLow52.reduce((s, i) => s + rangePos52[i], 0) / nearLow52.length : rp10 / 2;
            const avgRPHigh52 = nearHigh52.length ? nearHigh52.reduce((s, i) => s + rangePos52[i], 0) / nearHigh52.length : (1 + rp90) / 2;
            const avgDD_b52ATH = break52NearATH.length ? break52NearATH.reduce((s, i) => s + dd[i], 0) / break52NearATH.length : 0;
            const avgDD_b52Deep = break52DeepDD.length ? break52DeepDD.reduce((s, i) => s + dd[i], 0) / break52DeepDD.length : 0;
            add(toPattern(
                `FRESH 52-WEEK HIGH BREAKOUT`,
                fwdStats(new52Hi),
                sorted[L].c > lRH52 && sorted[L - 1].c <= prevRH52,
                `${ticker} closed above its rolling 252-day high for the first time — avg day ${avg52HiRet >= 0 ? '+' : ''}${avg52HiRet.toFixed(2)}% · ${new52Hi.length}× in history`,
            ));
            add(toPattern(
                `FRESH 52-WEEK LOW BREAKDOWN`,
                fwdStats(new52Lo),
                sorted[L].c < lRL52 && sorted[L - 1].c >= prevRL52,
                `${ticker} closed below its rolling 252-day low for the first time — avg day ${avg52LoRet >= 0 ? '+' : ''}${avg52LoRet.toFixed(2)}% · ${new52Lo.length}× in history`,
            ));
            add(toPattern(
                `FAILED 52-WEEK HIGH ATTEMPT`,
                fwdStats(fail52Hi),
                sorted[L].h >= lRH52 && sorted[L].c < lRH52 && sorted[L - 1].h < prevRH52,
                `${ticker} tagged its 252-day high intraday but closed below it — first-time rejection at resistance · ${fail52Hi.length}× historically`,
            ));
            add(toPattern(
                `NEAR 52-WEEK LOW  bottom ${(rp10 * 100).toFixed(0)}% of yearly range`,
                fwdStats(nearLow52),
                lRP52 <= rp10,
                `${ticker} close ranked in bottom ${(rp10 * 100).toFixed(0)}% of its rolling 52-week range — avg range pos ${(avgRPLow52 * 100).toFixed(0)}% · historically compressed · ${nearLow52.length}× seen`,
            ));
            add(toPattern(
                `NEAR 52-WEEK HIGH  top ${((1 - rp90) * 100).toFixed(0)}% of yearly range`,
                fwdStats(nearHigh52),
                lRP52 >= rp90,
                `${ticker} close ranked in top ${((1 - rp90) * 100).toFixed(0)}% of its rolling 52-week range — avg range pos ${(avgRPHigh52 * 100).toFixed(0)}% · historically extended · ${nearHigh52.length}× seen`,
            ));
            add(toPattern(
                `52-WEEK BREAKOUT near all-time high  (within ${ddP25.toFixed(1)}% of ATH)`,
                fwdStats(break52NearATH),
                sorted[L].c > lRH52 && sorted[L - 1].c <= prevRH52 && lDD < ddP25,
                `${ticker} set fresh 52-week high within ${ddP25.toFixed(1)}% of ATH — avg ${avgDD_b52ATH.toFixed(1)}% from ATH at trigger · momentum continuation · ${break52NearATH.length}× historically`,
            ));
            add(toPattern(
                `52-WEEK BREAKOUT in bear recovery  (≥${ddP50.toFixed(1)}% below ATH)`,
                fwdStats(break52DeepDD),
                sorted[L].c > lRH52 && sorted[L - 1].c <= prevRH52 && lDD >= ddP50,
                `${ticker} set a fresh 52-week high while still ≥${ddP50.toFixed(1)}% below ATH — avg ${avgDD_b52Deep.toFixed(1)}% from ATH at trigger · early recovery / relative strength signal · ${break52DeepDD.length}× historically`,
            ));
        }
    }

    // ── Layer N3: Historical Volatility (HV20) — contraction and expansion ────
    // HV20 = annualized 20-day rolling std dev of daily log returns × √252.
    // Extended low-vol periods (vol squeeze) historically precede large directional moves.
    // Expansion breaks, extreme vol regimes, and regime exits all measured per-stock.
    // Every threshold derived from THIS stock's own HV distribution — zero hardcoding.
    {
        const HV_WIN = 20;   // 20-day HV window (industry standard)
        const CONT_WIN = 15; // 15 consecutive quiet bars = meaningful contraction
        const hv20: number[] = new Array(n).fill(0);
        for (let i = HV_WIN; i < n; i++) {
            let sumLR = 0, sumLR2 = 0;
            for (let k = i - HV_WIN + 1; k <= i; k++) {
                const lr = Math.log(sorted[k].c / sorted[k - 1].c);
                sumLR += lr; sumLR2 += lr * lr;
            }
            const meanLR = sumLR / HV_WIN;
            const variance = sumLR2 / HV_WIN - meanLR * meanLR;
            hv20[i] = Math.sqrt(Math.max(0, variance) * 252) * 100; // annualized %
        }
        // Distribution thresholds from THIS stock's HV history
        const hvArr = hv20.slice(HV_WIN).filter(v => v > 0).sort((a, b) => a - b);
        const hvP25 = hvArr[Math.floor(hvArr.length * 0.25)] ?? 15;
        const hvP75 = hvArr[Math.floor(hvArr.length * 0.75)] ?? 35;
        const hvP90 = hvArr[Math.floor(hvArr.length * 0.90)] ?? 50;
        // Classify bars
        const hvSqueeze: number[] = [];   // inside the contraction
        const hvBreakout: number[] = [];  // first bar breaking above p25 after CONT_WIN squeeze
        const hvExtreme: number[] = [];   // at p90+ of this stock's HV — panic/euphoria regime
        const hvHighExit: number[] = [];  // first bar dropping below p75 after CONT_WIN elevated
        for (let i = HV_WIN + CONT_WIN; i < n - PATH_LEN; i++) {
            let allLow = true, allHigh = true;
            for (let k = i - CONT_WIN; k < i; k++) {
                if (hv20[k] >= hvP25) allLow = false;
                if (hv20[k] <= hvP75) allHigh = false;
            }
            if (allLow && hv20[i] < hvP25) hvSqueeze.push(i);
            if (allLow && hv20[i] >= hvP25 && hv20[i - 1] < hvP25) hvBreakout.push(i);
            if (allHigh && hv20[i] < hvP75 && hv20[i - 1] >= hvP75) hvHighExit.push(i);
            if (hv20[i] >= hvP90) hvExtreme.push(i);
        }
        const lHV = hv20[L];
        let lHvAllLow = true;
        for (let k = Math.max(0, L - CONT_WIN); k < L; k++) if (hv20[k] >= hvP25) { lHvAllLow = false; break; }
        let lHvPriorAllLow = true;
        for (let k = Math.max(0, L - 1 - CONT_WIN); k < L - 1; k++) if (hv20[k] >= hvP25) { lHvPriorAllLow = false; break; }
        const lIsHvBreakout = lHvPriorAllLow && L > 0 && lHV >= hvP25 && hv20[L - 1] < hvP25;
        let lHvAllHigh = true;
        for (let k = Math.max(0, L - CONT_WIN); k < L; k++) if (hv20[k] <= hvP75) { lHvAllHigh = false; break; }
        const lIsHvHighExit = lHvAllHigh && L > 0 && lHV < hvP75 && hv20[L - 1] >= hvP75;
        const avgSqHV = hvSqueeze.length ? hvSqueeze.reduce((s, i) => s + hv20[i], 0) / hvSqueeze.length : hvP25 * 0.7;
        const avgBrkHV = hvBreakout.length ? hvBreakout.reduce((s, i) => s + hv20[i], 0) / hvBreakout.length : hvP25;
        const avgExtHV = hvExtreme.length ? hvExtreme.reduce((s, i) => s + hv20[i], 0) / hvExtreme.length : hvP90;
        const avgExitHV = hvHighExit.length ? hvHighExit.reduce((s, i) => s + hv20[i], 0) / hvHighExit.length : hvP75;
        add(toPattern(
            `VOL SQUEEZE  HV20 below ${hvP25.toFixed(0)}% for ${CONT_WIN}+ days`,
            fwdStats(hvSqueeze),
            lHvAllLow && lHV < hvP25,
            `${ticker} in a ${CONT_WIN}-bar volatility contraction — HV20 avg ${avgSqHV.toFixed(0)}% vs this stock's p25=${hvP25.toFixed(0)}% — coiled spring, historically precedes a large move · ${hvSqueeze.length}× seen`,
        ));
        add(toPattern(
            `VOL EXPANSION BREAK  HV20 emerging from ${CONT_WIN}-bar squeeze`,
            fwdStats(hvBreakout),
            lIsHvBreakout,
            `${ticker}'s HV20 just crossed above its quiet threshold (${hvP25.toFixed(0)}%) after ${CONT_WIN}+ days of contraction — avg HV at breakout ${avgBrkHV.toFixed(0)}% · directional move launching · ${hvBreakout.length}× historically`,
        ));
        add(toPattern(
            `EXTREME HISTORICAL VOL  HV20 ≥${hvP90.toFixed(0)}% (top 10% for this stock)`,
            fwdStats(hvExtreme),
            lHV >= hvP90,
            `${ticker} in its top-10% highest-ever volatility regime — HV20 avg ${avgExtHV.toFixed(0)}% (p90 for this stock) · panic / euphoria environment · often precedes mean-reversion · ${hvExtreme.length}× seen`,
        ));
        add(toPattern(
            `HIGH-VOL REGIME ENDING  HV20 retreating after ${CONT_WIN}+ elevated days`,
            fwdStats(hvHighExit),
            lIsHvHighExit,
            `${ticker}'s volatility dropping back below p75 (${hvP75.toFixed(0)}%) after ${CONT_WIN}+ elevated bars — regime normalizing · avg HV at exit ${avgExitHV.toFixed(0)}% · ${hvHighExit.length}× historically`,
        ));
    }

    all.sort((a, b) => b.edge - a.edge);

    const lastBar = sorted[n - 1];
    const prevBar = sorted[n - 2];
    return {
        ticker,
        lastClose: lastBar.c,
        todayRet: prevBar ? (lastBar.c / prevBar.c - 1) * 100 : 0,
        ddFromATH: dd[n - 1],
        bars: n,
        dateRange: `${new Date(sorted[0].t).getFullYear()}-${new Date(sorted[n - 1].t).getFullYear()}`,
        patterns: all,
        sortedBars: sorted,
        dna: { wS, wM, wL, avgUpLeg: avgUp, avgDnLeg: avgDn, retP5, retP95, retP1, retP99, strP75, strP90, rSP5, rSP95, gapP5, gapP95, ddP50, ddP75 },
        combo: computeComboSignal(all, sorted),
        wyckoffZones: wyckoffZonesOut,
    };
}

// ─── Combo Signal Engine ─────────────────────────────────────────────────────
// Combines all qualifying patterns into one weighted composite signal.
// Weight per pattern = edge × √n  (higher conviction + more historical data = more influence)
function computeComboSignal(patterns: Pattern[], sortedBars: Bar[]): ComboSignal {
    const n = sortedBars.length;
    let totalW = 0, weightedScore = 0;
    let activeTotalW = 0, activeWeightedScore = 0;
    const pathSums = new Array(PATH_LEN + 1).fill(0);
    let pathW = 0;
    const sigSum = new Array(n).fill(0);
    const sigW = new Array(n).fill(0);
    const triggerLabels: Record<number, string[]> = {};

    for (const p of patterns) {
        const w = p.edge * Math.sqrt(p.n);
        totalW += w;
        // w30 = % of occurrences where price was higher at +30 bars
        // BUY patterns: w30 is HIGH (bullish confirmation)
        // SELL patterns: w30 is LOW (bearish, since most times price was DOWN)
        // The composite score is the weighted average of w30 — above 55 = net bullish, below 45 = net bearish
        weightedScore += p.w30 * w;
        if (p.isActive) {
            activeTotalW += w;
            activeWeightedScore += p.w30 * w;
        }
        // Projection: weighted avg of per-pattern avgPaths
        pathW += w;
        for (let k = 0; k <= PATH_LEN; k++) pathSums[k] += (p.avgPath[k] ?? 0) * w;
        // Historical signal: each trigger bar accumulates this pattern's w30 vote
        for (const i of p.triggerBars) {
            if (i >= 0 && i < n) {
                sigSum[i] += p.w30 * w;
                sigW[i] += w;
                if (!triggerLabels[i]) triggerLabels[i] = [];
                triggerLabels[i].push(p.label);
            }
        }
    }

    const score = totalW > 0 ? weightedScore / totalW : 50;
    const activeScore = activeTotalW > 0 ? activeWeightedScore / activeTotalW : null;
    const direction = score >= 55 ? 'BULLISH' : score <= 45 ? 'BEARISH' : 'NEUTRAL';
    const activeDirection = activeScore === null ? null
        : activeScore >= 55 ? 'BULLISH' : activeScore <= 45 ? 'BEARISH' : 'NEUTRAL';

    const combinedPath = pathW > 0 ? pathSums.map((v: number) => v / pathW) : new Array(PATH_LEN + 1).fill(0);

    // Confidence band: 25th–75th pct across all individual occurrences of all patterns
    const allIndividualPaths: number[][] = [];
    for (const p of patterns) allIndividualPaths.push(...p.allPaths);
    const pathLow = new Array(PATH_LEN + 1).fill(0);
    const pathHigh = new Array(PATH_LEN + 1).fill(0);
    for (let k = 0; k <= PATH_LEN; k++) {
        const vals = allIndividualPaths.map(p => p[k] ?? 0).sort((a, b) => a - b);
        if (vals.length > 0) {
            pathLow[k] = vals[Math.floor(vals.length * 0.25)];
            pathHigh[k] = vals[Math.floor(vals.length * 0.75)];
        }
    }

    // Historical signal: one score per bar (NaN = no patterns triggered that bar)
    const historicalSignal = sigSum.map((s: number, i: number) => sigW[i] > 0 ? s / sigW[i] : NaN);
    const historicalDates = sortedBars.map(b => b.t);

    // ── Confluence Signal ─────────────────────────────────────────────────────
    // Only fires when 3+ same-direction patterns triggered on the same bar AND
    // their avg7 returns are tightly clustered (within 25% of this stock's own
    // full avg7 spread — fully data-driven, zero hardcoded %)
    const barPatterns: Map<number, Pattern[]> = new Map();
    for (const p of patterns) {
        for (const i of p.triggerBars) {
            if (i >= 0 && i < n) {
                if (!barPatterns.has(i)) barPatterns.set(i, []);
                barPatterns.get(i)!.push(p);
            }
        }
    }

    // Derive tightness threshold from this stock's own avg7 distribution
    const allAvg7 = [...patterns.map(p => p.avg7)].sort((a, b) => a - b);
    const p5i = Math.floor(allAvg7.length * 0.05);
    const p95i = Math.min(allAvg7.length - 1, Math.floor(allAvg7.length * 0.95));
    const globalRange = allAvg7.length >= 4 ? allAvg7[p95i] - allAvg7[p5i] : 2;
    const tightThreshold = Math.max(0.5, globalRange * 0.25); // cluster spread ≤ 25% of full range

    const confluenceSignal: ('BUY' | 'SELL' | null)[] = new Array(n).fill(null);
    const confluenceLabels: Record<number, string[]> = {};
    const confluenceTier: Record<number, 'legendary' | 'rare' | 'common'> = {};

    for (const [barIdx, bps] of barPatterns.entries()) {
        for (const dir of ['BUY', 'SELL'] as const) {
            const group = bps.filter(p => p.type === dir);
            if (group.length === 0) continue;

            const legendary = group.filter(p => p.n <= 19);
            const rare = group.filter(p => p.n >= 20 && p.n <= 50);
            const common = group.filter(p => p.n >= 51 && p.n <= 200);

            let firedLabels: string[] | null = null;
            let firedTier: 'legendary' | 'rare' | 'common' = 'common';

            // ── Rule 1: 1 legendary alone fires immediately ─────────────────
            if (legendary.length >= 1) {
                firedLabels = legendary.map(p => p.label);
                firedTier = 'legendary';
            }

            // ── Rule 2: 3+ rare, same direction, tight avg7 ─────────────────
            if (!firedLabels && rare.length >= 3) {
                const sorted7 = [...rare].sort((a, b) => a.avg7 - b.avg7);
                let best: Pattern[] = [];
                for (let s = 0; s <= sorted7.length - 3; s++) {
                    for (let e = sorted7.length - 1; e >= s + 2; e--) {
                        if (sorted7[e].avg7 - sorted7[s].avg7 <= tightThreshold) {
                            const cluster = sorted7.slice(s, e + 1);
                            if (cluster.length > best.length) best = cluster;
                            break;
                        }
                    }
                }
                if (best.length >= 3) { firedLabels = best.map(p => p.label); firedTier = 'rare'; }
            }

            // ── Rule 3: 5+ common, same direction, tight avg7 ───────────────
            if (!firedLabels && common.length >= 5) {
                const sorted7 = [...common].sort((a, b) => a.avg7 - b.avg7);
                let best: Pattern[] = [];
                for (let s = 0; s <= sorted7.length - 5; s++) {
                    for (let e = sorted7.length - 1; e >= s + 4; e--) {
                        if (sorted7[e].avg7 - sorted7[s].avg7 <= tightThreshold) {
                            const cluster = sorted7.slice(s, e + 1);
                            if (cluster.length > best.length) best = cluster;
                            break;
                        }
                    }
                }
                if (best.length >= 5) { firedLabels = best.map(p => p.label); firedTier = 'common'; }
            }

            if (firedLabels) {
                confluenceSignal[barIdx] = dir;
                confluenceLabels[barIdx] = firedLabels;
                confluenceTier[barIdx] = firedTier;
                break;
            }
        }
    }

    return {
        score, direction, activeScore, activeDirection,
        combinedPath, pathLow, pathHigh,
        historicalSignal, historicalDates,
        triggerLabels,
        nContributing: patterns.length,
        confluenceSignal,
        confluenceLabels,
        confluenceTier,
    };
}

// ─── Price Chart ─────────────────────────────────────────────────────────────
// Clean daily candlestick with zoom (wheel) and drag+inertia pan.
function PriceChart({ bars }: { bars: Bar[] }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const visRef = useRef(Math.min(bars.length, 252));
    const offRef = useRef(Math.max(0, bars.length - visRef.current));
    const drawRef = useRef<() => void>(() => { });
    const inertiaRef = useRef<number | null>(null);
    const dragRef = useRef({ active: false, startX: 0, startOff: 0, lastX: 0, lastT: 0, vel: 0 });
    const mouseXRef = useRef<number | null>(null);

    useEffect(() => {
        visRef.current = Math.min(bars.length, 252);
        offRef.current = Math.max(0, bars.length - visRef.current);
    }, [bars]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || bars.length === 0) return;

        drawRef.current = () => {
            const dpr = window.devicePixelRatio || 1;
            const W = canvas.offsetWidth;
            const H = canvas.offsetHeight;
            if (W === 0 || H === 0) return;
            const nW = Math.round(W * dpr), nH = Math.round(H * dpr);
            if (canvas.width !== nW || canvas.height !== nH) {
                canvas.width = nW; canvas.height = nH;
                canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
            }
            const ctx = canvas.getContext('2d')!;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            const vis = Math.max(10, Math.min(bars.length, visRef.current));
            const offset = Math.max(0, Math.min(bars.length - vis, Math.round(offRef.current)));
            const slice = bars.slice(offset, offset + vis);

            const PL = 8, PR = 110, PT = 12, PB = 52;
            const cW = W - PL - PR;
            const cH = H - PT - PB;

            const highs = slice.map(b => b.h);
            const lows = slice.map(b => b.l);
            const minP = Math.min(...lows) * 0.9988;
            const maxP = Math.max(...highs) * 1.0012;
            const pToY = (p: number) => PT + cH - ((p - minP) / (maxP - minP)) * cH;

            const spacing = cW / Math.max(vis, 1);
            const candleW = Math.max(1, spacing * 0.72);

            // Background
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, W, H);

            // Grid
            ctx.strokeStyle = 'rgba(255,255,255,0.04)';
            ctx.lineWidth = 1;
            for (let k = 0; k <= 6; k++) {
                const y = PT + (cH / 6) * k;
                ctx.beginPath(); ctx.moveTo(PL, y); ctx.lineTo(W - PR, y); ctx.stroke();
            }

            // Candles
            slice.forEach((bar, idx) => {
                const isGreen = bar.c >= bar.o;
                const bodyCol = isGreen ? '#00ff00' : '#ff0000';
                const wickCol = isGreen ? '#00ff00' : '#ff0000';
                const x = PL + idx * spacing;
                const wickX = Math.floor(x + spacing / 2);
                const bX = Math.floor(x + (spacing - candleW) / 2);
                const bW = Math.max(1, Math.floor(candleW));
                const openY = pToY(bar.o), closeY = pToY(bar.c);
                const highY = pToY(bar.h), lowY = pToY(bar.l);
                const bodyY = Math.min(openY, closeY);
                const bodyH = Math.max(1, Math.abs(closeY - openY));

                ctx.strokeStyle = wickCol; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(wickX, Math.floor(highY)); ctx.lineTo(wickX, Math.floor(lowY)); ctx.stroke();
                ctx.fillStyle = bodyCol;
                ctx.fillRect(bX, Math.floor(bodyY), bW, Math.ceil(bodyH));
            });

            // X-axis labels
            ctx.fillStyle = '#ffffff'; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center';
            const labelEvery = Math.max(1, Math.floor(vis / 6));
            slice.forEach((bar, idx) => {
                if (idx % labelEvery !== 0) return;
                const d = new Date(bar.t);
                const lbl = `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${String(d.getUTCFullYear()).slice(2)}`;
                ctx.fillText(lbl, PL + idx * spacing + spacing / 2, H - 10);
            });

            // Y-axis labels
            ctx.fillStyle = '#ffffff'; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'left';
            for (let k = 0; k <= 6; k++) {
                const v = minP + ((maxP - minP) / 6) * (6 - k);
                const y = PT + (cH / 6) * k;
                ctx.fillText(`$${v.toFixed(v > 1000 ? 0 : v > 100 ? 1 : 2)}`, W - PR + 4, y + 6);
            }

            // Baseline
            ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(PL, PT + cH); ctx.lineTo(W - PR, PT + cH); ctx.stroke();
        };

        drawRef.current();
    }, [bars]);

    // Wheel zoom — centred on mouse cursor
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || bars.length === 0) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 0.85 : 1.18;
            const oldVis = visRef.current;
            const newVis = Math.max(20, Math.min(bars.length, Math.round(oldVis * factor)));
            // Figure out which bar fraction the cursor is over
            const PL = 8, PR = 110;
            const cW = canvas.offsetWidth - PL - PR;
            const mx = mouseXRef.current ?? (canvas.offsetWidth - PR); // default: right edge
            const frac = Math.max(0, Math.min(1, (mx - PL) / cW));    // 0 = left, 1 = right
            // Keep the bar under the cursor fixed: globalBarUnderMouse = offset + frac*oldVis
            const globalBarUnderMouse = offRef.current + frac * oldVis;
            offRef.current = Math.max(0, Math.min(bars.length - newVis, Math.round(globalBarUnderMouse - frac * newVis)));
            visRef.current = newVis;
            drawRef.current();
        };
        const onMouseMove = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            mouseXRef.current = e.clientX - rect.left;
        };
        const onMouseLeave = () => { mouseXRef.current = null; };
        canvas.addEventListener('wheel', onWheel, { passive: false });
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mouseleave', onMouseLeave);
        return () => {
            canvas.removeEventListener('wheel', onWheel);
            canvas.removeEventListener('mousemove', onMouseMove);
            canvas.removeEventListener('mouseleave', onMouseLeave);
        };
    }, [bars.length]);

    // Drag + inertia
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || bars.length === 0) return;
        const onDown = (e: MouseEvent) => {
            if (inertiaRef.current !== null) { cancelAnimationFrame(inertiaRef.current); inertiaRef.current = null; }
            dragRef.current = { active: true, startX: e.clientX, startOff: offRef.current, lastX: e.clientX, lastT: performance.now(), vel: 0 };
            canvas.style.cursor = 'grabbing';
        };
        const onMove = (e: MouseEvent) => {
            if (!dragRef.current.active) return;
            const barPx = (canvas.offsetWidth - 80) / Math.max(visRef.current, 1);
            const now = performance.now(), dt = now - dragRef.current.lastT;
            if (dt > 0) dragRef.current.vel = dragRef.current.vel * 0.6 + ((e.clientX - dragRef.current.lastX) / barPx / dt) * 0.4;
            dragRef.current.lastX = e.clientX; dragRef.current.lastT = now;
            offRef.current = Math.max(0, Math.min(bars.length - visRef.current, dragRef.current.startOff - (e.clientX - dragRef.current.startX) / barPx));
            drawRef.current();
        };
        const onUp = () => {
            if (!dragRef.current.active) return;
            dragRef.current.active = false;
            canvas.style.cursor = 'crosshair';
            let vel = dragRef.current.vel;
            if (Math.abs(vel) < 0.004) return;
            const animate = () => {
                vel *= 0.88;
                if (Math.abs(vel) < 0.001) { inertiaRef.current = null; return; }
                offRef.current = Math.max(0, Math.min(bars.length - visRef.current, offRef.current - vel * 16));
                drawRef.current();
                inertiaRef.current = requestAnimationFrame(animate);
            };
            inertiaRef.current = requestAnimationFrame(animate);
        };
        canvas.addEventListener('mousedown', onDown);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            canvas.removeEventListener('mousedown', onDown);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [bars.length]);

    return (
        <div style={{ width: '100%', height: '360px', background: '#000000' }}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }} />
        </div>
    );
}

// ─── Projection Chart ─────────────────────────────────────────────────────────
// Draws the average 30-bar forward price path for one pattern on a canvas.
function PatternChart({ pattern }: { pattern: Pattern }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isBuy = pattern.type === 'BUY';
    const lineColor = isBuy ? '#00ff88' : '#ff3333';
    const [r, g, b] = isBuy ? [0, 255, 136] : [255, 51, 51];

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        function draw() {
            if (!canvas) return;
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            const W = Math.floor(rect.width);
            const H = Math.floor(rect.height);
            if (W < 4 || H < 4) return;

            // Set physical pixel size — this is what makes it crispy
            canvas.width = Math.round(W * dpr);
            canvas.height = Math.round(H * dpr);

            const ctx = canvas.getContext('2d', { alpha: false })!;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.imageSmoothingEnabled = false;

            const path = pattern.avgPath;
            const PL = 52, PR = 38, PT = 22, PB = 36;
            const cW = W - PL - PR;
            const cH = H - PT - PB;

            const rawMin = Math.min(0, ...path);
            const rawMax = Math.max(0, ...path);
            const pad = Math.max(Math.abs(rawMax - rawMin) * 0.18, 0.2);
            const minV = rawMin - pad;
            const maxV = rawMax + pad;
            const vR = maxV - minV || 1;

            const xOf = (i: number) => PL + (i / Math.max(path.length - 1, 1)) * cW;
            const yOf = (v: number) => PT + cH - ((v - minV) / vR) * cH;
            const y0 = yOf(0);

            // Solid black background
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, W, H);

            // Subtle grid lines
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.lineWidth = 1;
            for (let k = 0; k <= 4; k++) {
                const y = PT + (cH / 4) * k;
                ctx.beginPath(); ctx.moveTo(PL, y); ctx.lineTo(W - PR, y); ctx.stroke();
            }

            // Zero line — bright white dashed
            ctx.strokeStyle = 'rgba(255,255,255,0.35)';
            ctx.setLineDash([5, 4]);
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(PL, y0); ctx.lineTo(W - PR, y0); ctx.stroke();
            ctx.setLineDash([]);

            // Vertical lines at key bars
            ctx.strokeStyle = 'rgba(255,255,255,0.07)';
            ctx.lineWidth = 1;
            for (const bar of [1, 7, 15, 30]) {
                if (bar >= path.length) continue;
                const px = xOf(bar);
                ctx.beginPath(); ctx.moveTo(px, PT); ctx.lineTo(px, PT + cH); ctx.stroke();
            }

            // Filled area under curve
            ctx.beginPath();
            ctx.moveTo(xOf(0), y0);
            for (let i = 0; i < path.length; i++) ctx.lineTo(xOf(i), yOf(path[i]));
            ctx.lineTo(xOf(path.length - 1), y0);
            ctx.closePath();
            const grad = ctx.createLinearGradient(0, PT, 0, PT + cH);
            grad.addColorStop(0, `rgba(${r},${g},${b},0.32)`);
            grad.addColorStop(1, `rgba(${r},${g},${b},0.03)`);
            ctx.fillStyle = grad;
            ctx.fill();

            // Main path line — crisp, 2px
            ctx.beginPath();
            ctx.moveTo(xOf(0), yOf(path[0]));
            for (let i = 1; i < path.length; i++) ctx.lineTo(xOf(i), yOf(path[i]));
            ctx.strokeStyle = lineColor;
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';
            ctx.stroke();

            // Annotated dots at +1, +7, +30
            for (const bar of [1, 7, 30]) {
                if (bar >= path.length) continue;
                const px = xOf(bar);
                const py = yOf(path[bar]);
                const val = path[bar];
                const dc = val >= 0 ? '#00ff88' : '#ff3333';

                ctx.beginPath();
                ctx.arc(px, py, 5, 0, Math.PI * 2);
                ctx.fillStyle = dc;
                ctx.fill();
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1.5;
                ctx.stroke();

                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 14px monospace';
                ctx.textAlign = 'center';
                ctx.fillText(
                    `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`,
                    px,
                    val >= 0 ? py - 13 : py + 22,
                );
            }

            // X-axis labels — crispy white
            ctx.fillStyle = '#ffffff';
            ctx.font = '13px monospace';
            ctx.textAlign = 'center';
            for (const bar of [0, 1, 7, 15, 30]) {
                if (bar >= path.length) continue;
                ctx.fillText(`+${bar}d`, xOf(bar), PT + cH + 20);
            }

            // Y-axis labels — crispy white
            ctx.textAlign = 'right';
            ctx.fillStyle = '#ffffff';
            ctx.font = '13px monospace';
            for (let k = 0; k <= 4; k++) {
                const v = minV + (vR / 4) * (4 - k);
                ctx.fillText(
                    `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`,
                    PL - 5,
                    PT + (cH / 4) * k + 4,
                );
            }
        }

        draw();
        const ro = new ResizeObserver(draw);
        ro.observe(canvas);
        return () => ro.disconnect();
    }, [pattern, isBuy, lineColor, r, g, b]);

    return <canvas ref={canvasRef} style={{ width: '100%', height: '220px', display: 'block' }} />;
}

// ─── Mini Sparkline ───────────────────────────────────────────────────────────
function MiniSparkline({ pattern }: { pattern: Pattern }) {
    const ref = useRef<HTMLCanvasElement>(null);
    const isBuy = pattern.type === 'BUY';
    const lc = isBuy ? '#00ff88' : '#ff3333';
    const [r, g, b] = isBuy ? [0, 255, 136] : [255, 51, 51];

    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;

        function draw() {
            if (!canvas) return;
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            const W = Math.floor(rect.width);
            const H = Math.floor(rect.height);
            if (W < 4 || H < 4) return;

            canvas.width = Math.round(W * dpr);
            canvas.height = Math.round(H * dpr);

            const ctx = canvas.getContext('2d', { alpha: false })!;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.imageSmoothingEnabled = true;

            const path = pattern.avgPath.slice(0, 16); // show bar 0 → +15d
            const PL = 10, PR = 10, PT = 24, PB = 14;
            const cW = W - PL - PR;
            const cH = H - PT - PB;

            const rawMin = Math.min(0, ...path);
            const rawMax = Math.max(0, ...path);
            const pad = Math.max(Math.abs(rawMax - rawMin) * 0.30, 0.20);
            const minV = rawMin - pad;
            const maxV = rawMax + pad;
            const vR = maxV - minV || 1;

            const xOf = (i: number) => PL + (i / Math.max(path.length - 1, 1)) * cW;
            const yOf = (v: number) => PT + cH - ((v - minV) / vR) * cH;
            const y0 = yOf(0);

            // ── Background ──────────────────────────────────────────────────
            ctx.fillStyle = '#050508';
            ctx.fillRect(0, 0, W, H);

            // Subtle horizontal grid lines
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.lineWidth = 1;
            for (let k = 1; k <= 3; k++) {
                const gy = PT + (cH / 4) * k;
                ctx.beginPath(); ctx.moveTo(PL, gy); ctx.lineTo(W - PR, gy); ctx.stroke();
            }

            // Zero line
            ctx.strokeStyle = 'rgba(255,255,255,0.30)';
            ctx.setLineDash([4, 4]);
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(PL, y0); ctx.lineTo(W - PR, y0); ctx.stroke();
            ctx.setLineDash([]);

            // Vertical tick lines at marker bars
            const BARS = [1, 7, 13] as const;
            for (const bar of BARS) {
                if (bar >= path.length) continue;
                const px = xOf(bar);
                ctx.strokeStyle = 'rgba(255,255,255,0.08)';
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(px, PT); ctx.lineTo(px, PT + cH); ctx.stroke();
            }

            // ── Area fill ───────────────────────────────────────────────────
            ctx.beginPath();
            ctx.moveTo(xOf(0), y0);
            for (let i = 0; i < path.length; i++) ctx.lineTo(xOf(i), yOf(path[i]));
            ctx.lineTo(xOf(path.length - 1), y0);
            ctx.closePath();
            const grad = ctx.createLinearGradient(0, PT, 0, PT + cH);
            grad.addColorStop(0, `rgba(${r},${g},${b},0.35)`);
            grad.addColorStop(0.6, `rgba(${r},${g},${b},0.08)`);
            grad.addColorStop(1, `rgba(${r},${g},${b},0.01)`);
            ctx.fillStyle = grad;
            ctx.fill();

            // ── Path line ───────────────────────────────────────────────────
            ctx.beginPath();
            ctx.moveTo(xOf(0), yOf(path[0]));
            for (let i = 1; i < path.length; i++) ctx.lineTo(xOf(i), yOf(path[i]));
            ctx.strokeStyle = lc;
            ctx.lineWidth = 2.5;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.stroke();

            // ── Marker dots + return labels ──────────────────────────────────
            for (const bar of BARS) {
                if (bar >= path.length) continue;
                const px = xOf(bar);
                const py = yOf(path[bar]);
                const val = path[bar];
                const dc = val >= 0 ? '#00ff88' : '#ff3333';
                const inLowerHalf = py > PT + cH * 0.52;

                // Glow ring
                ctx.beginPath();
                ctx.arc(px, py, 7, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${r},${g},${b},0.18)`;
                ctx.fill();

                // Dot
                ctx.beginPath();
                ctx.arc(px, py, 4.5, 0, Math.PI * 2);
                ctx.fillStyle = dc;
                ctx.fill();
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1.5;
                ctx.stroke();

                // Return label with drop shadow
                const label = `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`;
                const labelY = inLowerHalf ? py - 14 : py + 20;
                ctx.font = 'bold 13px monospace';
                ctx.textAlign = 'center';
                // shadow
                ctx.fillStyle = 'rgba(0,0,0,0.9)';
                ctx.fillText(label, px + 1, labelY + 1);
                // text
                ctx.fillStyle = '#ffffff';
                ctx.fillText(label, px, labelY);
            }

            // ── n× badge — top-left corner ───────────────────────────────────
            const occTxt = `${pattern.n}×`;
            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'left';
            const occW = ctx.measureText(occTxt).width;
            const bx = PL, by = 5, bh = 16, bpad = 5;
            ctx.fillStyle = 'rgba(0,0,0,0.75)';
            ctx.beginPath();
            ctx.roundRect(bx, by, occW + bpad * 2, bh, 3);
            ctx.fill();
            ctx.fillStyle = '#ffd700';
            ctx.fillText(occTxt, bx + bpad, by + bh - 3);
        }

        draw();
        const ro = new ResizeObserver(draw);
        ro.observe(canvas);
        return () => ro.disconnect();
    }, [pattern, isBuy, lc, r, g, b]);

    // Stats bar below the chart (HTML — crisp, controllable layout)
    const BARS = [
        { bar: 1, avg: pattern.avg1, wr: pattern.w1 },
        { bar: 7, avg: pattern.avg7, wr: pattern.w7 },
        { bar: 13, avg: pattern.avg13, wr: pattern.w13 },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', borderRadius: '4px', overflow: 'hidden', background: '#050508' }}>
            {/* Chart */}
            <canvas ref={ref} style={{ width: '100%', height: '200px', display: 'block' }} />

            {/* Stats strip */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                borderTop: '1px solid rgba(255,255,255,0.08)',
                background: '#090909',
            }}>
                {BARS.map(({ bar, avg, wr }, idx) => {
                    const wrColor = wr >= 60 ? '#00ff88' : wr <= 40 ? '#ff3333' : '#aaaaaa';
                    const avgColor = avg >= 0 ? '#00ff88' : '#ff3333';
                    return (
                        <div key={bar} style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            padding: '6px 4px 5px',
                            borderLeft: idx > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                        }}>
                            {/* Day label */}
                            <span style={{
                                color: '#ff6600',
                                fontSize: 10,
                                fontFamily: 'monospace',
                                fontWeight: 700,
                                letterSpacing: '0.5px',
                                marginBottom: 2,
                            }}>+{bar}d</span>
                            {/* Avg return */}
                            <span style={{
                                color: avgColor,
                                fontSize: 13,
                                fontFamily: 'monospace',
                                fontWeight: 700,
                                lineHeight: 1,
                                marginBottom: 2,
                            }}>{avg >= 0 ? '+' : ''}{avg.toFixed(1)}%</span>
                            {/* Win rate */}
                            <span style={{
                                color: wrColor,
                                fontSize: 12,
                                fontFamily: 'monospace',
                                fontWeight: 900,
                                letterSpacing: '0.5px',
                                lineHeight: 1,
                            }}>{Math.round(wr)}%W</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Occurrence Chart ─────────────────────────────────────────────────────────
// Shows 15 bars BEFORE the event + the event bar + 30 bars AFTER.
// Each occurrence is a faint line. Average path is bold on top.
// A vertical gold line marks the exact event bar. Left region = setup. Right = outcome.
function OccurrenceChart({ pattern }: { pattern: Pattern }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isBuy = pattern.type === 'BUY';
    const avgColor = isBuy ? '#00ff88' : '#ff3333';

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        function draw() {
            if (!canvas) return;
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            const W = Math.floor(rect.width);
            const H = Math.floor(rect.height);
            if (W < 4 || H < 4) return;

            canvas.width = Math.round(W * dpr);
            canvas.height = Math.round(H * dpr);
            const ctx = canvas.getContext('2d', { alpha: false })!;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.imageSmoothingEnabled = false;

            const paths = pattern.allPathsFull;
            const avgPath = pattern.avgFullPath;
            const FULL_LEN = PRE_LEN + PATH_LEN + 1;
            const N = Math.min(avgPath.length, FULL_LEN);
            const triggerIdx = PRE_LEN; // index in path where event bar sits

            if (paths.length === 0 || N === 0) {
                ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
                ctx.fillStyle = '#555'; ctx.font = '13px monospace'; ctx.textAlign = 'center';
                ctx.fillText('No full-path data available', W / 2, H / 2);
                return;
            }

            const PL = 52, PR = 38, PT = 28, PB = 36;
            const cW = W - PL - PR;
            const cH = H - PT - PB;

            // Global min/max across all individual paths
            let globalMin = 0, globalMax = 0;
            for (const p of paths) {
                for (const v of p) {
                    if (v < globalMin) globalMin = v;
                    if (v > globalMax) globalMax = v;
                }
            }
            const pad = Math.max(Math.abs(globalMax - globalMin) * 0.12, 0.3);
            const minV = globalMin - pad;
            const maxV = globalMax + pad;
            const vR = maxV - minV || 1;

            const xOf = (i: number) => PL + (i / Math.max(N - 1, 1)) * cW;
            const yOf = (v: number) => PT + cH - ((v - minV) / vR) * cH;
            const y0 = yOf(0);
            const triggerX = xOf(triggerIdx);

            // ── Background ────────────────────────────────────────────────────
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, W, H);

            // ── Pre-event region — slightly lighter to show "setup" area ──────
            ctx.fillStyle = 'rgba(255,255,255,0.025)';
            ctx.fillRect(PL, PT, triggerX - PL, cH);

            // ── Grid ──────────────────────────────────────────────────────────
            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.lineWidth = 1;
            for (let k = 0; k <= 5; k++) {
                const y = PT + (cH / 5) * k;
                ctx.beginPath(); ctx.moveTo(PL, y); ctx.lineTo(W - PR, y); ctx.stroke();
            }

            // ── Zero line (= trigger close) ───────────────────────────────────
            ctx.strokeStyle = 'rgba(255,255,255,0.22)';
            ctx.setLineDash([5, 4]);
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(PL, y0); ctx.lineTo(W - PR, y0); ctx.stroke();
            ctx.setLineDash([]);

            // ── Post-event key-bar guides ─────────────────────────────────────
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.lineWidth = 1;
            for (const daysAfter of [1, 7, 15, 30]) {
                const idx = triggerIdx + daysAfter;
                if (idx >= N) continue;
                ctx.beginPath(); ctx.moveTo(xOf(idx), PT); ctx.lineTo(xOf(idx), PT + cH); ctx.stroke();
            }

            // ── Individual occurrence paths ───────────────────────────────────
            const MAX_LINES = 300;
            const step = paths.length > MAX_LINES ? Math.ceil(paths.length / MAX_LINES) : 1;
            ctx.lineWidth = 0.9;
            ctx.lineJoin = 'round';
            for (let pi = 0; pi < paths.length; pi += step) {
                const p = paths[pi];
                const endVal = p[p.length - 1];
                ctx.strokeStyle = endVal >= 0 ? 'rgba(0,255,136,0.15)' : 'rgba(255,51,51,0.15)';
                ctx.beginPath();
                ctx.moveTo(xOf(0), yOf(p[0]));
                for (let k = 1; k < p.length; k++) ctx.lineTo(xOf(k), yOf(p[k]));
                ctx.stroke();
            }

            // ── Average path — bold, drawn last ──────────────────────────────
            ctx.beginPath();
            ctx.moveTo(xOf(0), yOf(avgPath[0]));
            for (let k = 1; k < N; k++) ctx.lineTo(xOf(k), yOf(avgPath[k]));
            ctx.strokeStyle = avgColor;
            ctx.lineWidth = 2.5;
            ctx.lineJoin = 'round';
            ctx.stroke();

            // ── EVENT vertical line — bright gold ────────────────────────────
            ctx.strokeStyle = 'rgba(255,200,0,0.70)';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(triggerX, PT); ctx.lineTo(triggerX, PT + cH); ctx.stroke();

            // ── Gold dot on avg path at event bar ────────────────────────────
            ctx.beginPath();
            ctx.arc(triggerX, y0, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffd700';
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // ── Dots + value labels on avg at +1d, +7d, +30d ────────────────
            for (const daysAfter of [1, 7, 30]) {
                const idx = triggerIdx + daysAfter;
                if (idx >= N) continue;
                const px = xOf(idx);
                const py = yOf(avgPath[idx]);
                const val = avgPath[idx];
                const dc = val >= 0 ? '#00ff88' : '#ff3333';

                ctx.beginPath();
                ctx.arc(px, py, 5, 0, Math.PI * 2);
                ctx.fillStyle = dc;
                ctx.fill();
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1.5;
                ctx.stroke();

                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 13px monospace';
                ctx.textAlign = 'center';
                ctx.fillText(
                    `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`,
                    px,
                    val >= 0 ? py - 13 : py + 22,
                );
            }

            // ── X-axis labels ─────────────────────────────────────────────────
            ctx.textAlign = 'center';
            // Pre-event
            for (const daysBefore of [PRE_LEN, 10, 5]) {
                const idx = triggerIdx - daysBefore;
                if (idx < 0) continue;
                ctx.fillStyle = 'rgba(255,255,255,0.45)';
                ctx.font = '12px monospace';
                ctx.fillText(`-${daysBefore}d`, xOf(idx), PT + cH + 20);
            }
            // Event bar label
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 13px monospace';
            ctx.fillText('EVENT', triggerX, PT + cH + 20);
            // Post-event
            ctx.font = '13px monospace';
            for (const daysAfter of [1, 7, 15, 30]) {
                const idx = triggerIdx + daysAfter;
                if (idx >= N) continue;
                ctx.fillStyle = '#ffffff';
                ctx.fillText(`+${daysAfter}d`, xOf(idx), PT + cH + 20);
            }

            // ── Y-axis labels ─────────────────────────────────────────────────
            ctx.textAlign = 'right';
            ctx.fillStyle = '#ffffff';
            ctx.font = '13px monospace';
            for (let k = 0; k <= 5; k++) {
                const v = minV + (vR / 5) * (5 - k);
                ctx.fillText(
                    `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`,
                    PL - 5,
                    PT + (cH / 5) * k + 4,
                );
            }

            // ── Legend ────────────────────────────────────────────────────────
            const shown = Math.ceil(paths.length / step);
            ctx.fillStyle = 'rgba(255,255,255,0.40)';
            ctx.font = '11px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(
                `${shown} occurrences  ·  left = setup  ·  ● = event close  ·  right = outcome  ·  bold = avg`,
                PL + 4, PT - 8,
            );
        }

        draw();
        const ro = new ResizeObserver(draw);
        ro.observe(canvas);
        return () => ro.disconnect();
    }, [pattern, isBuy, avgColor]);

    return <canvas ref={canvasRef} style={{ width: '100%', height: '480px', display: 'block' }} />;
}

// ─── Combo Projection Chart ──────────────────────────────────────────────────
// Weighted average forward path across all qualifying patterns, with 25–75th pct band.
function ComboProjChart({ combo }: { combo: ComboSignal }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { combinedPath: path, pathLow, pathHigh, direction } = combo;
    const isBull = direction === 'BULLISH';
    const isNeu = direction === 'NEUTRAL';
    const lineColor = isBull ? '#00ff88' : isNeu ? '#ffdd00' : '#ff3333';
    const [r, g, b] = isBull ? [0, 255, 136] : isNeu ? [255, 221, 0] : [255, 51, 51];

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        function draw() {
            if (!canvas) return;
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            const W = Math.floor(rect.width), H = Math.floor(rect.height);
            if (W < 4 || H < 4) return;
            canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
            const ctx = canvas.getContext('2d', { alpha: false })!;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = false;

            const PL = 8, PR = 68, PT = 22, PB = 36;
            const cW = W - PL - PR, cH = H - PT - PB;
            const rawMin = Math.min(...pathLow, 0);
            const rawMax = Math.max(...pathHigh, 0);
            const pad = Math.max(Math.abs(rawMax - rawMin) * 0.15, 0.3);
            const minV = rawMin - pad, maxV = rawMax + pad, vR = maxV - minV || 1;
            const xOf = (i: number) => PL + (i / Math.max(path.length - 1, 1)) * cW;
            const yOf = (v: number) => PT + cH - ((v - minV) / vR) * cH;
            const y0 = yOf(0);

            ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);

            // Grid
            ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
            for (let k = 0; k <= 4; k++) {
                const y = PT + (cH / 4) * k;
                ctx.beginPath(); ctx.moveTo(PL, y); ctx.lineTo(W - PR, y); ctx.stroke();
            }
            // Key bar guides
            for (const bar of [1, 7, 15, 30]) {
                if (bar >= path.length) continue;
                ctx.beginPath(); ctx.moveTo(xOf(bar), PT); ctx.lineTo(xOf(bar), PT + cH); ctx.stroke();
            }
            // Zero line
            ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(PL, y0); ctx.lineTo(W - PR, y0); ctx.stroke(); ctx.setLineDash([]);

            // Confidence band fill
            ctx.beginPath();
            ctx.moveTo(xOf(0), yOf(pathHigh[0]));
            for (let i = 1; i < path.length; i++) ctx.lineTo(xOf(i), yOf(pathHigh[i]));
            for (let i = path.length - 1; i >= 0; i--) ctx.lineTo(xOf(i), yOf(pathLow[i]));
            ctx.closePath();
            ctx.fillStyle = `rgba(${r},${g},${b},0.10)`; ctx.fill();

            // Band outlines
            ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
            for (const arr of [pathHigh, pathLow]) {
                ctx.beginPath(); ctx.moveTo(xOf(0), yOf(arr[0]));
                for (let i = 1; i < path.length; i++) ctx.lineTo(xOf(i), yOf(arr[i]));
                ctx.strokeStyle = `rgba(${r},${g},${b},0.30)`; ctx.stroke();
            }
            ctx.setLineDash([]);

            // Fill under combined path
            ctx.beginPath(); ctx.moveTo(xOf(0), y0);
            for (let i = 0; i < path.length; i++) ctx.lineTo(xOf(i), yOf(path[i]));
            ctx.lineTo(xOf(path.length - 1), y0); ctx.closePath();
            const grad = ctx.createLinearGradient(0, PT, 0, PT + cH);
            grad.addColorStop(0, `rgba(${r},${g},${b},0.38)`);
            grad.addColorStop(1, `rgba(${r},${g},${b},0.04)`);
            ctx.fillStyle = grad; ctx.fill();

            // Main line
            ctx.beginPath(); ctx.moveTo(xOf(0), yOf(path[0]));
            for (let i = 1; i < path.length; i++) ctx.lineTo(xOf(i), yOf(path[i]));
            ctx.strokeStyle = lineColor; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();

            // Annotated dots at +1, +7, +30
            for (const bar of [1, 7, 30]) {
                if (bar >= path.length) continue;
                const px = xOf(bar), py = yOf(path[bar]), val = path[bar];
                const dc = val >= 0 ? '#00ff88' : '#ff3333';
                ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2);
                ctx.fillStyle = dc; ctx.fill();
                ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();
                ctx.fillStyle = '#fff'; ctx.font = 'bold 18px monospace'; ctx.textAlign = 'center';
                ctx.fillText(`${val >= 0 ? '+' : ''}${val.toFixed(1)}%`, px, val >= 0 ? py - 13 : py + 22);
            }

            // X-axis labels
            ctx.fillStyle = '#fff'; ctx.font = '16px monospace'; ctx.textAlign = 'center';
            for (const bar of [0, 1, 7, 15, 30]) {
                if (bar >= path.length) continue;
                ctx.fillText(`+${bar}d`, xOf(bar), PT + cH + 20);
            }
            // Band label
            ctx.fillStyle = `rgba(${r},${g},${b},0.70)`; ctx.font = '14px monospace'; ctx.textAlign = 'left';
            ctx.fillText('shaded band = 25th–75th pct of all occurrences', PL + 4, PT - 8);

            // Y-axis labels — RIGHT side
            ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = '16px monospace';
            for (let k = 0; k <= 4; k++) {
                const v = minV + (vR / 4) * (4 - k);
                ctx.fillText(`${v >= 0 ? '+' : ''}${v.toFixed(1)}%`, W - PR + 6, PT + (cH / 4) * k + 4);
            }
        }
        draw();
        const ro = new ResizeObserver(draw); ro.observe(canvas);
        return () => ro.disconnect();
    }, [combo, lineColor, r, g, b, path, pathLow, pathHigh]);

    return <canvas ref={canvasRef} style={{ width: '100%', height: '600px', display: 'block' }} />;
}

// ─── Combo History Chart ──────────────────────────────────────────────────────
// Price candlestick chart with BUY / SELL / NEUTRAL markers. Zoom (wheel) + drag.
function ComboHistChart({ combo, bars, wyckoffZones }: { combo: ComboSignal; bars: Bar[]; wyckoffZones: WyckoffZones }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const visRef = useRef(Math.min(bars.length, 504));
    const offRef = useRef(Math.max(0, bars.length - visRef.current));
    const drawRef = useRef<() => void>(() => { });
    const inertiaRef = useRef<number | null>(null);
    const dragRef = useRef({ active: false, startX: 0, startOff: 0, lastX: 0, lastT: 0, vel: 0 });
    // cached layout for hit-testing in hover handler
    const layoutRef = useRef({ offset: 0, vis: 0, spacing: 0, PL: 8, W: 0 });
    const mouseXRef = useRef<number | null>(null);
    const projLenRef = useRef(31); // tracks projPath.length so drag/zoom clamps can extend into future
    const [tooltip, setTooltip] = useState<{ x: number; y: number; barIdx: number; date: string; kind: string; labels: string[] } | null>(null);

    useEffect(() => {
        visRef.current = Math.min(bars.length, 504);
        offRef.current = Math.max(0, bars.length - visRef.current);
    }, [bars]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || bars.length === 0) return;

        drawRef.current = () => {
            if (!canvas) return;
            const dpr = window.devicePixelRatio || 1;
            const W = canvas.offsetWidth, H = canvas.offsetHeight;
            if (W === 0 || H === 0) return;
            const nW = Math.round(W * dpr), nH = Math.round(H * dpr);
            if (canvas.width !== nW || canvas.height !== nH) {
                canvas.width = nW; canvas.height = nH;
                canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
            }
            const ctx = canvas.getContext('2d')!;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            const sig = combo.historicalSignal;
            const n = bars.length;

            // Projection data — computed before offset so projLen can extend the clamp
            const lastClose = bars[n - 1]?.c ?? 1;
            const projPath = combo.combinedPath;
            const projLowArr = combo.pathLow;
            const projHighArr = combo.pathHigh;
            const projLen = projPath.length; // typically 31 (steps 0..30d)
            projLenRef.current = projLen;
            const projPrices = projPath.map((pct: number) => lastClose * (1 + pct / 100));
            const projLowPrices = projLowArr.map((pct: number) => lastClose * (1 + pct / 100));
            const projHighPrices = projHighArr.map((pct: number) => lastClose * (1 + pct / 100));

            const vis = Math.max(10, Math.min(n, visRef.current));
            // Allow offset to push past n-vis so dragging left reveals projection gradually
            const offset = Math.max(0, Math.min(n - vis + projLen - 1, Math.round(offRef.current)));
            // futureSlots = how many projection steps are currently visible on the right
            const futureSlots = Math.max(0, Math.min(projLen - 1, offset + vis - n));
            const realBarCount = vis - futureSlots; // always >= 1
            const slice = bars.slice(offset, offset + realBarCount);
            const SHOW = vis; // total visible slots (real + future)

            const PL = 8, PR = 62, PT = 28, PB = 28;
            const cW = W - PL - PR, cH = H - PT - PB;

            // Single uniform spacing covers all slots (real + future)
            const spacing = cW / Math.max(SHOW, 1);
            const candleW = Math.max(1, spacing * 0.65);
            const xOf = (i: number) => PL + (i + 0.5) * spacing;
            // Projection: k=0 at last candle centre, k=1 one slot right, etc.
            const lastCandleX = xOf(realBarCount - 1);
            const xProj = (k: number) => lastCandleX + k * spacing;
            const yOf = (v: number) => PT + cH - ((v - minP) / vR) * cH;

            // Price range: candles + only the currently-visible projection steps
            let minP = Infinity, maxP = -Infinity;
            for (const b of slice) { if (b.l < minP) minP = b.l; if (b.h > maxP) maxP = b.h; }
            if (futureSlots > 0) {
                for (let k = 0; k <= Math.min(futureSlots, 13) && k < projLen; k++) {
                    const p = projPrices[k], lo = projLowPrices[k], hi = projHighPrices[k];
                    if (p < minP) minP = p; if (p > maxP) maxP = p;
                    if (lo < minP) minP = lo; if (hi > maxP) maxP = hi;
                }
            }
            const priceRange = maxP - minP || 1;
            const markerMargin = priceRange * 0.10;
            minP -= markerMargin * 1.4; maxP += markerMargin * 0.5;
            const vR = maxP - minP || 1;

            ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, W, H);

            layoutRef.current = { offset, vis, spacing, PL, W };

            // ── Confluence shading — green/red fill, tier-colored outline (gold/purple/blue) ──
            for (let i = 0; i < SHOW; i++) {
                const barIdx = offset + i;
                if (barIdx >= n) continue;
                const conf = combo.confluenceSignal[barIdx];
                if (conf === null) continue;
                const bar = slice[i];
                const x0 = Math.floor(xOf(i) - spacing * 0.5);
                const bW = Math.ceil(spacing);
                const tier = combo.confluenceTier[barIdx] ?? 'common';

                const glowColor = tier === 'legendary' ? '#ffd700'
                    : tier === 'rare' ? '#bf5fff'
                        : '#3a6bcc';

                let shadeTop: number, shadeH: number;
                if (conf === 'BUY') {
                    shadeTop = Math.floor(yOf(bar.l));
                    shadeH = PT + cH - shadeTop;
                    ctx.fillStyle = '#00ff88';
                } else {
                    shadeTop = PT;
                    shadeH = Math.ceil(yOf(bar.h)) - PT;
                    ctx.fillStyle = '#ff3333';
                }
                ctx.fillRect(x0, shadeTop, bW, shadeH);

                // Tier-colored outline around the shaded region
                ctx.save();
                ctx.strokeStyle = glowColor;
                ctx.lineWidth = tier === 'legendary' ? 1.5 : 1;
                ctx.globalAlpha = tier === 'legendary' ? 0.85 : tier === 'rare' ? 0.65 : 0.45;
                ctx.strokeRect(x0 + 0.5, shadeTop + 0.5, bW - 1, shadeH - 1);
                ctx.restore();
            }

            // ── Grid ──────────────────────────────────────────────────────────
            ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
            for (let k = 0; k <= 5; k++) {
                const y = PT + (cH / 5) * k;
                ctx.beginPath(); ctx.moveTo(PL, y); ctx.lineTo(W - PR, y); ctx.stroke();
            }

            // ── Candles ───────────────────────────────────────────────────────
            slice.forEach((bar, idx) => {
                const isGreen = bar.c >= bar.o;
                const bodyCol = isGreen ? '#00ff00' : '#ff0000';
                const x = xOf(idx);
                const bX = Math.floor(x - candleW / 2);
                const bW = Math.max(1, Math.floor(candleW));
                const openY = yOf(bar.o), closeY = yOf(bar.c);
                const highY = yOf(bar.h), lowY = yOf(bar.l);
                const bodyY = Math.min(openY, closeY);
                const bodyH = Math.max(1, Math.abs(closeY - openY));
                ctx.strokeStyle = bodyCol; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(Math.floor(x), Math.floor(highY));
                ctx.lineTo(Math.floor(x), Math.floor(lowY)); ctx.stroke();
                ctx.fillStyle = bodyCol;
                ctx.fillRect(bX, Math.floor(bodyY), bW, Math.ceil(bodyH));
            });

            // ── Wyckoff zone overlays ──────────────────────────────────────────
            // Drawn after candles so they appear on top of the price bars.
            // Accumulation ranges: semi-transparent cyan box + "ACCUM" label
            // Distribution ranges: semi-transparent orange box + "DIST" label
            // Shakeout (Spring): green triangle below the candle low
            // Upthrust (UTAD): red triangle above the candle high
            const wyckoffSets = [
                { indices: wyckoffZones.accumRange, fill: 'rgba(0,220,255,0.07)', stroke: 'rgba(0,220,255,0.55)', label: 'ACCUM', labelCol: '#00dcff', above: false },
                { indices: wyckoffZones.distRange, fill: 'rgba(255,140,0,0.07)', stroke: 'rgba(255,140,0,0.55)', label: 'DIST', labelCol: '#ff8c00', above: true },
            ];
            for (const { indices, fill, stroke, label, labelCol, above } of wyckoffSets) {
                if (indices.length === 0) continue;
                // Group into consecutive runs so each run gets one labeled box
                const runs: number[][] = [];
                let cur: number[] = [];
                const sorted11 = [...indices].sort((a, b) => a - b);
                for (const gi of sorted11) {
                    if (cur.length === 0 || gi === cur[cur.length - 1] + 1) {
                        cur.push(gi);
                    } else {
                        runs.push(cur);
                        cur = [gi];
                    }
                }
                if (cur.length) runs.push(cur);

                for (const run of runs) {
                    const si0 = run[0] - offset;
                    const si1 = run[run.length - 1] - offset;
                    // Skip if entirely outside visible window
                    if (si1 < 0 || si0 >= realBarCount) continue;
                    const clampSi0 = Math.max(0, si0);
                    const clampSi1 = Math.min(realBarCount - 1, si1);
                    // Price range of bars in this run that are visible
                    let runHi = -Infinity, runLo = Infinity;
                    for (let si = clampSi0; si <= clampSi1; si++) {
                        const b = slice[si];
                        if (b.h > runHi) runHi = b.h;
                        if (b.l < runLo) runLo = b.l;
                    }
                    if (runHi === -Infinity) continue;
                    const x0box = Math.floor(xOf(clampSi0) - spacing * 0.5);
                    const x1box = Math.ceil(xOf(clampSi1) + spacing * 0.5);
                    const y0box = Math.floor(yOf(runHi)) - 2;
                    const y1box = Math.ceil(yOf(runLo)) + 2;
                    const boxW = x1box - x0box;
                    const boxH = y1box - y0box;
                    // Fill
                    ctx.fillStyle = fill;
                    ctx.fillRect(x0box, y0box, boxW, boxH);
                    // Border
                    ctx.save();
                    ctx.strokeStyle = stroke;
                    ctx.lineWidth = 1.5;
                    ctx.setLineDash([4, 3]);
                    ctx.strokeRect(x0box + 0.5, y0box + 0.5, boxW - 1, boxH - 1);
                    ctx.setLineDash([]);
                    ctx.restore();
                    // Label pill
                    ctx.font = 'bold 10px monospace';
                    const tw = ctx.measureText(label).width;
                    const pillX = x0box + 4;
                    const pillY = above ? y0box - 15 : y1box + 1;
                    ctx.fillStyle = fill.replace('0.07', '0.75');
                    ctx.fillRect(pillX - 2, pillY, tw + 8, 13);
                    ctx.fillStyle = labelCol;
                    ctx.textAlign = 'left';
                    ctx.fillText(label, pillX + 2, pillY + 10);
                }
            }

            // Shakeout (Spring) markers: green up-triangle below candle low
            for (const gi of wyckoffZones.shakeout) {
                const si = gi - offset;
                if (si < 0 || si >= realBarCount) continue;
                const bar = slice[si];
                const cx = xOf(si);
                const tipY = Math.ceil(yOf(bar.l)) + 14;
                const sz = Math.max(4, Math.min(7, spacing * 0.35));
                ctx.save();
                ctx.fillStyle = '#00ff88';
                ctx.strokeStyle = '#003322';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(cx, tipY - sz * 1.6);   // tip pointing up
                ctx.lineTo(cx - sz, tipY);
                ctx.lineTo(cx + sz, tipY);
                ctx.closePath();
                ctx.fill(); ctx.stroke();
                ctx.fillStyle = '#00ff88';
                ctx.font = 'bold 9px monospace';
                ctx.textAlign = 'center';
                ctx.fillText('SPRING', cx, tipY + 11);
                ctx.restore();
            }

            // Upthrust (UTAD) markers: red down-triangle above candle high
            for (const gi of wyckoffZones.upthrust) {
                const si = gi - offset;
                if (si < 0 || si >= realBarCount) continue;
                const bar = slice[si];
                const cx = xOf(si);
                const tipY = Math.floor(yOf(bar.h)) - 14;
                const sz = Math.max(4, Math.min(7, spacing * 0.35));
                ctx.save();
                ctx.fillStyle = '#ff6600';
                ctx.strokeStyle = '#330d00';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(cx, tipY + sz * 1.6);   // tip pointing down
                ctx.lineTo(cx - sz, tipY);
                ctx.lineTo(cx + sz, tipY);
                ctx.closePath();
                ctx.fill(); ctx.stroke();
                ctx.fillStyle = '#ff6600';
                ctx.font = 'bold 9px monospace';
                ctx.textAlign = 'center';
                ctx.fillText('UT', cx, tipY - 3);
                ctx.restore();
            }

            // ── Projection section — gradually revealed as user drags left past last bar ──
            const PROJ_MAX = 13; // only show up to +13d
            if (futureSlots > 0) {
                const drawUpTo = Math.min(futureSlots, PROJ_MAX); // cap at +13d
                const projDir = combo.direction;
                const isProjBull = projDir === 'BULLISH';
                const isProjNeu = projDir === 'NEUTRAL';
                const projColor = isProjBull ? '#00ff88' : isProjNeu ? '#ffdd00' : '#ff3333';
                const projRGB = isProjBull ? '0,255,136' : isProjNeu ? '255,221,0' : '255,51,51';
                // Separator sits between last real candle and first future slot
                const sepX = Math.round(PL + realBarCount * spacing);

                ctx.strokeStyle = 'rgba(255,255,255,0.30)'; ctx.lineWidth = 1;
                ctx.setLineDash([4, 3]);
                ctx.beginPath(); ctx.moveTo(sepX, PT - 4); ctx.lineTo(sepX, PT + cH); ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
                ctx.fillText('TODAY', sepX, PT - 8);

                // Confidence band fill — only visible steps
                ctx.beginPath();
                ctx.moveTo(xProj(0), yOf(projHighPrices[0]));
                for (let k = 1; k <= drawUpTo && k < projLen; k++) ctx.lineTo(xProj(k), yOf(projHighPrices[k]));
                for (let k = Math.min(drawUpTo, projLen - 1); k >= 0; k--) ctx.lineTo(xProj(k), yOf(projLowPrices[k]));
                ctx.closePath();
                ctx.fillStyle = `rgba(${projRGB},0.10)`; ctx.fill();

                // Band outlines — only visible steps
                ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
                for (const prices of [projHighPrices, projLowPrices]) {
                    ctx.beginPath(); ctx.moveTo(xProj(0), yOf(prices[0]));
                    for (let k = 1; k <= drawUpTo && k < projLen; k++) ctx.lineTo(xProj(k), yOf(prices[k]));
                    ctx.strokeStyle = `rgba(${projRGB},0.30)`; ctx.stroke();
                }
                ctx.setLineDash([]);

                // Fill under projection line — only visible steps
                const y0proj = yOf(lastClose);
                ctx.beginPath(); ctx.moveTo(xProj(0), y0proj);
                for (let k = 0; k <= drawUpTo && k < projLen; k++) ctx.lineTo(xProj(k), yOf(projPrices[k]));
                const endK = Math.min(drawUpTo, projLen - 1);
                ctx.lineTo(xProj(endK), y0proj); ctx.closePath();
                const projGrad = ctx.createLinearGradient(0, PT, 0, PT + cH);
                projGrad.addColorStop(0, `rgba(${projRGB},0.32)`);
                projGrad.addColorStop(1, `rgba(${projRGB},0.03)`);
                ctx.fillStyle = projGrad; ctx.fill();

                // Projection line — only visible steps
                ctx.beginPath(); ctx.moveTo(xProj(0), yOf(projPrices[0]));
                for (let k = 1; k <= drawUpTo && k < projLen; k++) ctx.lineTo(xProj(k), yOf(projPrices[k]));
                ctx.strokeStyle = projColor; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();

                // Dots + % labels — only for milestone bars fully revealed
                for (const bar of [1, 7, 13]) {
                    if (bar > drawUpTo || bar >= projLen) continue;
                    const px = xProj(bar), py = yOf(projPrices[bar]), val = projPath[bar];
                    const dc = val >= 0 ? '#00ff88' : '#ff3333';
                    ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2);
                    ctx.fillStyle = dc; ctx.fill();
                    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();
                    ctx.fillStyle = '#fff'; ctx.font = 'bold 15px monospace'; ctx.textAlign = 'center';
                    ctx.fillText(`${val >= 0 ? '+' : ''}${val.toFixed(1)}%`, px, val >= 0 ? py - 12 : py + 22);
                }

                // Projection x-labels — only for visible milestones
                ctx.font = '13px monospace'; ctx.fillStyle = projColor;
                for (const bar of [1, 7, 13]) {
                    if (bar > drawUpTo || bar >= projLen) continue;
                    const px = xProj(bar);
                    if (px < W - PR) ctx.fillText(`+${bar}d`, px, H - 6);
                }
            }

            // ── Y-axis labels ─────────────────────────────────────────────────
            ctx.textAlign = 'left'; ctx.font = 'bold 16px monospace';
            for (let k = 0; k <= 5; k++) {
                const v = minP + (vR / 5) * (5 - k);
                const y = PT + (cH / 5) * k;
                ctx.fillStyle = '#ffffff';
                ctx.fillText(`$${v.toFixed(v > 100 ? 0 : 2)}`, W - PR + 6, y + 4);
            }

            // ── X-axis date labels (candles) ─────────────────────────────────
            ctx.textAlign = 'center'; ctx.font = '16px monospace';
            ctx.fillStyle = '#ffffff';
            const labelEvery = Math.max(1, Math.floor(SHOW / 6));
            for (let i = 0; i < SHOW; i += labelEvery) {
                const barIdx = offset + i;
                if (barIdx >= n) continue;
                const d = new Date(bars[barIdx].t);
                ctx.fillText(`${d.getUTCMonth() + 1}/${d.getUTCFullYear().toString().slice(2)}`, xOf(i), H - 6);
            }

            // ── Legend ────────────────────────────────────────────────────────
            ctx.textAlign = 'left'; ctx.font = 'bold 11px monospace';
            const leg: Array<{ label: string; color: string; bg: string }> = [
                { label: ' CONFLUENCE BUY ', color: '#00ff88', bg: 'rgba(0,255,136,0.18)' },
                { label: ' CONFLUENCE SELL ', color: '#ff3333', bg: 'rgba(255,51,51,0.18)' },
            ];
            let lx = PL + 6;
            for (const { label, color, bg } of leg) {
                const tw = ctx.measureText(label).width;
                ctx.fillStyle = bg;
                ctx.fillRect(Math.floor(lx) - 1, PT - 22, Math.ceil(tw) + 2, 16);
                ctx.fillStyle = color;
                ctx.fillText(label, lx, PT - 10);
                lx += tw + 12;
            }
            // zoom hint
            ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.textAlign = 'right'; ctx.font = '10px monospace';
            ctx.fillText('scroll to zoom · drag to pan', W - PR - 4, PT - 9);
        };

        drawRef.current();
        const ro = new ResizeObserver(drawRef.current); ro.observe(canvas);
        return () => ro.disconnect();
    }, [combo, bars, wyckoffZones]);

    // ── Wheel zoom — centred on mouse cursor ─────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || bars.length === 0) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 0.82 : 1.22;
            const oldVis = visRef.current;
            const newVis = Math.max(20, Math.min(bars.length, Math.round(oldVis * factor)));
            const PL = 8, PR = 70;
            const cW = canvas.offsetWidth - PL - PR;
            const mx = mouseXRef.current ?? (canvas.offsetWidth - PR);
            const frac = Math.max(0, Math.min(1, (mx - PL) / cW));
            const globalBarUnderMouse = offRef.current + frac * oldVis;
            offRef.current = Math.max(0, Math.min(bars.length - newVis + 13, Math.round(globalBarUnderMouse - frac * newVis)));
            visRef.current = newVis;
            drawRef.current();
        };
        const onMouseMove = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            mouseXRef.current = e.clientX - rect.left;
        };
        const onMouseLeave = () => { mouseXRef.current = null; };
        canvas.addEventListener('wheel', onWheel, { passive: false });
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mouseleave', onMouseLeave);
        return () => {
            canvas.removeEventListener('wheel', onWheel);
            canvas.removeEventListener('mousemove', onMouseMove);
            canvas.removeEventListener('mouseleave', onMouseLeave);
        };
    }, [bars.length]);

    // ── Drag + inertia ────────────────────────────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || bars.length === 0) return;
        const onDown = (e: MouseEvent) => {
            if (inertiaRef.current !== null) { cancelAnimationFrame(inertiaRef.current); inertiaRef.current = null; }
            dragRef.current = { active: true, startX: e.clientX, startOff: offRef.current, lastX: e.clientX, lastT: performance.now(), vel: 0 };
            canvas.style.cursor = 'grabbing';
        };
        const onMove = (e: MouseEvent) => {
            if (!dragRef.current.active) return;
            const barPx = (canvas.offsetWidth - 70) / Math.max(visRef.current, 1);
            const now = performance.now(), dt = now - dragRef.current.lastT;
            if (dt > 0) dragRef.current.vel = dragRef.current.vel * 0.6 + ((e.clientX - dragRef.current.lastX) / barPx / dt) * 0.4;
            dragRef.current.lastX = e.clientX; dragRef.current.lastT = now;
            offRef.current = Math.max(0, Math.min(bars.length - visRef.current + 13, dragRef.current.startOff - (e.clientX - dragRef.current.startX) / barPx));
            drawRef.current();
        };
        const onUp = () => {
            if (!dragRef.current.active) return;
            dragRef.current.active = false;
            canvas.style.cursor = 'crosshair';
            let vel = dragRef.current.vel;
            if (Math.abs(vel) < 0.004) return;
            const animate = () => {
                vel *= 0.88;
                if (Math.abs(vel) < 0.001) { inertiaRef.current = null; return; }
                offRef.current = Math.max(0, Math.min(bars.length - visRef.current + 13, offRef.current - vel * 16));
                drawRef.current();
                inertiaRef.current = requestAnimationFrame(animate);
            };
            inertiaRef.current = requestAnimationFrame(animate);
        };
        canvas.addEventListener('mousedown', onDown);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            canvas.removeEventListener('mousedown', onDown);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [bars.length]);

    // ── Hover tooltip ─────────────────────────────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || bars.length === 0) return;
        const onHover = (e: MouseEvent) => {
            if (dragRef.current.active) { setTooltip(null); return; }
            const rect = canvas.getBoundingClientRect();
            const { offset, vis, spacing, PL, W } = layoutRef.current;
            const mouseX = e.clientX - rect.left;
            if (mouseX < PL || mouseX > layoutRef.current.W) { setTooltip(null); return; }
            const i = Math.floor((mouseX - PL) / spacing);
            const barIdx = offset + i;
            const conf = combo.confluenceSignal[barIdx];
            if (barIdx < 0 || barIdx >= bars.length || conf === null || conf === undefined) { setTooltip(null); return; }
            const kind = conf;
            const labels = combo.confluenceLabels[barIdx] ?? [];
            const d = new Date(bars[barIdx].t);
            const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
            const tipX = Math.min(e.clientX - rect.left + 10, W - 180);
            const tipY = Math.max(4, e.clientY - rect.top - 10);
            setTooltip({ x: tipX, y: tipY, barIdx, date, kind, labels });
        };
        const onLeave = () => setTooltip(null);
        canvas.addEventListener('mousemove', onHover);
        canvas.addEventListener('mouseleave', onLeave);
        return () => {
            canvas.removeEventListener('mousemove', onHover);
            canvas.removeEventListener('mouseleave', onLeave);
        };
    }, [bars, combo]);

    const tipColor = tooltip?.kind === 'BUY' ? '#00ff88' : tooltip?.kind === 'SELL' ? '#ff3333' : '#aaaaaa';

    return (
        <div style={{ position: 'relative', width: '100%', height: '600px' }}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '600px', display: 'block', cursor: 'crosshair' }} />
            {tooltip && (
                <div style={{
                    position: 'absolute', left: tooltip.x, top: tooltip.y,
                    background: 'rgba(10,11,15,0.96)', border: `1px solid ${tipColor}`,
                    borderRadius: 6, padding: '8px 12px', pointerEvents: 'none',
                    zIndex: 20, minWidth: 160, maxWidth: 240,
                    boxShadow: `0 0 12px ${tipColor}33`,
                }}>
                    <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, fontFamily: 'monospace', marginBottom: 4 }}>{tooltip.date}</div>
                    <div style={{ color: tipColor, fontWeight: 700, fontSize: 13, fontFamily: 'monospace', marginBottom: 6 }}>{tooltip.kind}</div>
                    {tooltip.labels.map((lbl, k) => (
                        <div key={k} style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, fontFamily: 'monospace', lineHeight: '1.5', paddingLeft: 6, borderLeft: `2px solid ${tipColor}55` }}>{lbl}</div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Combo Panel ─────────────────────────────────────────────────────────────
// Top-of-card composite signal: direction badge, scores, and tabbed charts.
function ComboPanel({ combo, bars, wyckoffZones }: { combo: ComboSignal; bars: Bar[]; wyckoffZones: WyckoffZones }) {
    const mono: React.CSSProperties = { fontFamily: "'JetBrains Mono','Consolas',monospace" };
    const dirColor = combo.direction === 'BULLISH' ? '#00ff88' : combo.direction === 'BEARISH' ? '#ff3333' : '#ff6600';
    const activeDirColor = combo.activeDirection === 'BULLISH' ? '#00ff88'
        : combo.activeDirection === 'BEARISH' ? '#ff3333'
            : combo.activeDirection ? '#ff6600' : '#ffffff';

    const proj30 = combo.combinedPath[30] ?? 0;
    const proj7 = combo.combinedPath[7] ?? 0;
    const proj1 = combo.combinedPath[1] ?? 0;

    return (
        <div style={{
            background: '#0a0a0a',
            border: '1px solid rgba(255,255,255,0.10)',
            borderLeft: `3px solid ${dirColor}`,
            borderRadius: '6px',
            marginBottom: '18px',
            overflow: 'hidden',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', flexWrap: 'wrap', gap: 8,
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                background: '#0f0f0f',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                        background: dirColor, color: '#000', fontSize: 15, fontWeight: 900,
                        padding: '5px 14px', borderRadius: 3, letterSpacing: '2.5px', ...mono,
                    }}>
                        {combo.direction}
                    </div>
                    <div>
                        <div style={{ color: '#ffffff', fontSize: 11, fontWeight: 700, letterSpacing: '2px', ...mono }}>
                            COMPOSITE SIGNAL — {combo.nContributing} PATTERNS · WEIGHTED BY EDGE × √N
                        </div>
                        <div style={{ color: '#00cfff', fontSize: 10, fontWeight: 600, marginTop: 2, letterSpacing: '1px', ...mono }}>
                            all qualifying patterns combined · score = weighted avg 30d win rate
                        </div>
                    </div>
                </div>

                {/* Score pills + projected returns */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{
                        background: '#111', border: `1px solid ${dirColor}`,
                        borderRadius: 4, padding: '4px 10px', ...mono,
                    }}>
                        <span style={{ color: '#ffffff', fontSize: 10, fontWeight: 700 }}>ALL  </span>
                        <span style={{ color: dirColor, fontSize: 14, fontWeight: 900 }}>{combo.score.toFixed(1)}%W</span>
                    </div>
                    {combo.activeScore !== null ? (
                        <div style={{
                            background: '#111', border: `1px solid ${activeDirColor}`,
                            borderRadius: 4, padding: '4px 10px', ...mono,
                        }}>
                            <span style={{ color: '#ffffff', fontSize: 10, fontWeight: 700 }}>ACTIVE  </span>
                            <span style={{ color: activeDirColor, fontSize: 14, fontWeight: 900 }}>{combo.activeScore.toFixed(1)}%W</span>
                        </div>
                    ) : (
                        <div style={{
                            background: '#111', border: '1px solid rgba(255,255,255,0.20)',
                            borderRadius: 4, padding: '4px 10px', ...mono,
                        }}>
                            <span style={{ color: '#ffffff', fontSize: 10, fontWeight: 700 }}>NO ACTIVE TRIGGERS</span>
                        </div>
                    )}
                    {/* Projected move chips */}
                    {([['1d', proj1], ['7d', proj7], ['30d', proj30]] as [string, number][]).map(([label, val]) => (
                        <div key={label} style={{
                            background: '#111', border: `1px solid ${val >= 0 ? '#00ff88' : '#ff3333'}`,
                            borderRadius: 4, padding: '4px 8px', ...mono,
                        }}>
                            <span style={{ color: '#00cfff', fontSize: 10, fontWeight: 700 }}>{label}  </span>
                            <span style={{ color: val >= 0 ? '#00ff88' : '#ff3333', fontSize: 13, fontWeight: 900 }}>
                                {val >= 0 ? '+' : ''}{val.toFixed(1)}%
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Chart area */}
            <div style={{ background: '#000' }}>
                <ComboHistChart combo={combo} bars={bars} wyckoffZones={wyckoffZones} />
            </div>
        </div>
    );
}

// ─── Rarity tier helper ───────────────────────────────────────────────────────
function rarityTier(n: number): { tier: 'legendary' | 'rare' | 'common'; accentColor: string; bgColor: string; tierLabel: string } {
    if (n <= 19) return {
        tier: 'legendary',
        accentColor: '#ffd700',          // gold accent
        bgColor: 'rgba(255,215,0,0.06)',
        tierLabel: 'LEGENDARY',
    };
    if (n <= 50) return {
        tier: 'rare',
        accentColor: '#bf5fff',          // purple accent
        bgColor: 'rgba(191,95,255,0.07)',
        tierLabel: 'RARE',
    };
    // 51-200
    return {
        tier: 'common',
        accentColor: '#3a6bcc',          // navy blue accent
        bgColor: 'rgba(58,107,204,0.07)',
        tierLabel: 'COMMON',
    };
}

// ─── Pattern Row ──────────────────────────────────────────────────────────────
function PatternRow({
    p,
    expanded,
    onToggle,
}: {
    p: Pattern;
    expanded: boolean;
    onToggle: () => void;
}) {
    const sc = p.type === 'BUY' ? '#00ff88' : '#ff3333';
    const { accentColor, bgColor, tierLabel } = rarityTier(p.n);
    const [chartMode, setChartMode] = useState<'avg' | 'all'>('avg');

    return (
        <div style={{
            background: p.isActive
                ? `linear-gradient(135deg, ${accentColor}18 0%, #070709 100%)`
                : `linear-gradient(135deg, ${bgColor} 0%, #060608 100%)`,
            border: `1px solid ${p.isActive ? accentColor + '55' : accentColor + '28'}`,
            borderLeft: `3px solid ${accentColor}`,
            borderRadius: '6px',
            marginBottom: '5px',
            overflow: 'hidden',
        }}>
            {/* Header row: badge + label */}
            <div
                onClick={onToggle}
                style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '10px 12px 8px',
                    cursor: 'pointer',
                }}
            >
                {/* BUY / SELL badge + tier label */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', flexShrink: 0, marginTop: '2px' }}>
                    <span style={{
                        background: sc,
                        color: '#000',
                        fontSize: '14px',
                        fontWeight: 900,
                        padding: '3px 8px',
                        borderRadius: '3px',
                        letterSpacing: '0.5px',
                        whiteSpace: 'nowrap',
                    }}>
                        {p.type}
                    </span>
                    <span style={{
                        color: accentColor,
                        fontSize: '9px',
                        fontWeight: 900,
                        fontFamily: 'monospace',
                        letterSpacing: '1px',
                        opacity: 0.85,
                    }}>
                        {tierLabel}
                    </span>
                </div>

                {/* Label + context */}
                <div style={{ minWidth: 0 }}>
                    <div style={{
                        color: accentColor,
                        fontSize: '13px',
                        fontWeight: p.isActive ? 700 : 500,
                        fontFamily: 'monospace',
                        lineHeight: 1.3,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    }}>
                        {p.label}
                        {p.isActive && (
                            <span style={{ color: sc, fontSize: '12px', marginLeft: '6px', fontWeight: 900 }}>
                                ● NOW
                            </span>
                        )}
                    </div>
                    {p.context && (
                        <div style={{
                            color: '#ffffff',
                            fontSize: '11px',
                            marginTop: '3px',
                            fontFamily: 'monospace',
                            lineHeight: 1.4,
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                        }}>
                            {p.context}
                        </div>
                    )}
                </div>
            </div>

            {/* Sparkline — full width below header */}
            <div style={{ padding: '0 8px 8px' }}>
                <MiniSparkline pattern={p} />
            </div>

            {/* Expanded charts */}
            {expanded && (
                <div style={{ borderTop: `1px solid ${sc}22` }}>
                    {/* Tab bar */}
                    <div style={{
                        display: 'flex',
                        gap: '2px',
                        padding: '8px 12px 0',
                        background: '#000',
                    }}>
                        {(['avg', 'all'] as const).map(mode => {
                            const isActive = chartMode === mode;
                            const label = mode === 'avg' ? 'AVG PATH' : `ALL ${p.n} OCCURRENCES`;
                            return (
                                <button
                                    key={mode}
                                    onClick={(e) => { e.stopPropagation(); setChartMode(mode); }}
                                    style={{
                                        background: isActive ? sc : 'transparent',
                                        color: isActive ? '#000' : sc,
                                        border: `1px solid ${sc}`,
                                        borderBottom: 'none',
                                        borderRadius: '4px 4px 0 0',
                                        padding: '5px 16px',
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        fontFamily: 'monospace',
                                        letterSpacing: '0.5px',
                                        cursor: 'pointer',
                                    }}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                    {/* Chart area */}
                    <div style={{ background: '#000' }}>
                        {chartMode === 'avg'
                            ? <PatternChart pattern={p} />
                            : <OccurrenceChart pattern={p} />
                        }
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Stock Card ───────────────────────────────────────────────────────────────
function StockCard({ ticker }: { ticker: string }) {
    const [result, setResult] = useState<StockResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [showAll, setShowAll] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);

        fetch('/api/mtf-historical-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Only request 1D bars — no 1H, no 1W
            body: JSON.stringify({ symbols: [ticker], timeframes: ['1D'] }),
        })
            .then(r => r.json())
            .then(json => {
                if (cancelled) return;
                const daily: Bar[] = json?.data?.[ticker]?.['1D'] ?? [];
                if (daily.length < MIN_BARS) {
                    setError(`Not enough daily bar data (got ${daily.length} bars, need at least ${MIN_BARS} — check POLYGON_API_KEY)`);
                    setLoading(false);
                    return;
                }
                setResult(scanStock(ticker, daily));
                setLoading(false);
            })
            .catch(err => {
                if (!cancelled) { setError(String(err)); setLoading(false); }
            });

        return () => { cancelled = true; };
    }, [ticker]);

    const toggle = (lbl: string) =>
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(lbl)) next.delete(lbl); else next.add(lbl);
            return next;
        });

    const mono: React.CSSProperties = { fontFamily: "'JetBrains Mono', 'Consolas', monospace" };

    const cardBase: React.CSSProperties = {
        background: '#080808',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '6px',
        marginBottom: '24px',
        boxShadow: '0 2px 16px rgba(0,0,0,0.7)',
    };

    if (loading) return (
        <div style={{ ...cardBase, borderTop: '3px solid rgba(255,255,255,0.12)', padding: '32px', textAlign: 'center' }}>
            <div style={{ color: '#00ff88', fontSize: 11, letterSpacing: '4px', marginBottom: 8, ...mono }}>SCANNING</div>
            <div style={{ color: '#ffffff', fontSize: 20, fontWeight: 900, letterSpacing: '3px', ...mono }}>{ticker}</div>
            <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, marginTop: 8, ...mono }}>ANALYZING 10-YEAR DAILY HISTORY...</div>
        </div>
    );

    if (error) return (
        <div style={{ ...cardBase, borderTop: '3px solid rgba(255,51,51,0.60)', padding: '20px' }}>
            <div style={{ color: '#ff3333', fontSize: 13, ...mono }}>
                <span style={{ fontWeight: 900 }}>{ticker} ERROR: </span>{error}
            </div>
        </div>
    );

    if (!result) return null;

    // Rarity tiers — filter out common noise (>200 occurrences)
    const qualifiedPatterns = result.patterns.filter(p => p.n <= 200);
    const activePatterns = qualifiedPatterns.filter(p => p.isActive);
    const displayAll = showAll ? qualifiedPatterns : qualifiedPatterns.slice(0, 12);
    const retColor = result.todayRet >= 0 ? '#00ff88' : '#ff3333';
    const ddAbs = result.ddFromATH;
    const ddColor = ddAbs < 5 ? '#00ff88' : ddAbs < 20 ? '#ff8c00' : '#ff3333';

    return (
        <div style={{ ...cardBase, borderTop: `3px solid ${activePatterns.length > 0 ? '#ff8c00' : 'rgba(255,255,255,0.12)'}` }}>

            {/* ── Card Header ──────────────────────────────────────────────── */}
            <div style={{
                padding: '16px 20px 14px',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
                background: '#0c0c0c',
                position: 'sticky',
                top: 0,
                zIndex: 10,
                borderRadius: '6px 6px 0 0',
            }}>
                {/* Row 1: Ticker + price + badges */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                    {/* Left: ticker / price / ret */}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                        <span style={{ color: '#ffffff', fontSize: 28, fontWeight: 900, letterSpacing: '3px', lineHeight: 1, ...mono }}>{ticker}</span>
                        <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 20, fontWeight: 700, letterSpacing: '1px', ...mono }}>
                            ${result.lastClose.toFixed(2)}
                        </span>
                        <span style={{
                            color: retColor,
                            fontSize: 13, fontWeight: 700, letterSpacing: '1px',
                            background: result.todayRet >= 0 ? 'rgba(0,255,136,0.08)' : 'rgba(255,51,51,0.08)',
                            border: `1px solid ${result.todayRet >= 0 ? 'rgba(0,255,136,0.20)' : 'rgba(255,51,51,0.20)'}`,
                            borderRadius: 3,
                            padding: '2px 7px',
                            ...mono,
                        }}>
                            {result.todayRet >= 0 ? '+' : ''}{result.todayRet.toFixed(2)}%
                        </span>
                    </div>

                    {/* Right: badges */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        {activePatterns.length > 0 && (
                            <div style={{
                                background: '#ff8c00',
                                borderRadius: 3,
                                padding: '4px 10px',
                                color: '#000',
                                fontSize: 11, fontWeight: 900, letterSpacing: '1.5px',
                                ...mono,
                            }}>
                                {activePatterns.length} ACTIVE NOW
                            </div>
                        )}
                        <div style={{
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: 3,
                            padding: '4px 10px',
                            color: 'rgba(255,255,255,0.55)',
                            fontSize: 11, fontWeight: 700, letterSpacing: '1px',
                            ...mono,
                        }}>
                            {result.patterns.length} PATTERNS
                        </div>
                    </div>
                </div>

                {/* Row 2: Meta stats — horizontal strip */}
                <div style={{
                    display: 'flex',
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    background: '#080808',
                    borderRadius: 4,
                    overflow: 'hidden',
                    marginBottom: 12,
                }}>
                    {[
                        { label: 'DAILY BARS', value: result.bars.toLocaleString(), vc: '#ffffff' },
                        { label: 'BELOW ATH', value: `${ddAbs.toFixed(1)}%`, vc: ddColor },
                        { label: 'DATE RANGE', value: result.dateRange, vc: '#ffffff' },
                    ].map((cell, i) => (
                        <div key={cell.label} style={{
                            flex: 1,
                            padding: '9px 14px',
                            borderRight: i < 2 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                        }}>
                            <div style={{ color: '#ff6600', fontSize: 14, letterSpacing: '2px', marginBottom: 4, fontWeight: 700, ...mono }}>{cell.label}</div>
                            <div style={{ color: cell.vc, fontSize: 14, fontWeight: 900, letterSpacing: '1px', ...mono }}>{cell.value}</div>
                        </div>
                    ))}
                </div>

                {/* Row 3: DNA chips */}
                {(() => {
                    const d = result.dna;
                    const f1 = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
                    const groups: Array<{ label: string; value: string; vc?: string }[]> = [
                        [
                            { label: 'UP LEG AVG', value: `${d.avgUpLeg.toFixed(1)}d` },
                            { label: 'DN LEG AVG', value: `${d.avgDnLeg.toFixed(1)}d` },
                            { label: 'SWING WIN', value: `${d.wS}d` },
                            { label: 'CYCLE WIN', value: `${d.wM}d` },
                        ],
                        [
                            { label: 'STREAK p75', value: `${d.strP75}d` },
                            { label: 'STREAK p90', value: `${d.strP90}d` },
                        ],
                        [
                            { label: 'RET p5', value: f1(d.retP5), vc: '#ff4444' },
                            { label: 'RET p95', value: f1(d.retP95), vc: '#00ff88' },
                            { label: 'GAP p5', value: f1(d.gapP5), vc: '#ff4444' },
                            { label: 'GAP p95', value: f1(d.gapP95), vc: '#00ff88' },
                            { label: 'DD p50', value: f1(d.ddP50), vc: '#ff8c00' },
                            { label: 'DD p75', value: f1(d.ddP75), vc: '#ff4444' },
                        ],
                    ];
                    return (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                            {groups.flatMap((g, gi) => [
                                ...g.map(item => (
                                    <div key={item.label} style={{
                                        background: '#111',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        borderRadius: 4,
                                        padding: '5px 10px',
                                        minWidth: 0,
                                    }}>
                                        <div style={{ color: '#ff6600', fontSize: 14, letterSpacing: '1.5px', marginBottom: 2, fontWeight: 700, ...mono }}>{item.label}</div>
                                        <div style={{ color: item.vc ?? '#ffffff', fontSize: 12, fontWeight: 900, ...mono }}>{item.value}</div>
                                    </div>
                                )),
                                gi < groups.length - 1
                                    ? <div key={`sep-${gi}`} style={{ width: 1, background: 'rgba(255,255,255,0.07)', alignSelf: 'stretch', margin: '0 2px' }} />
                                    : null,
                            ])}
                        </div>
                    );
                })()}
            </div>

            <div style={{ padding: '14px 18px' }}>

                {/* ── Composite signal panel ─────────────────────────────────── */}
                <ComboPanel combo={result.combo} bars={result.sortedBars} wyckoffZones={result.wyckoffZones} />

                {/* ── Active signals ─────────────────────────────────────────── */}
                {activePatterns.length > 0 && (
                    <div style={{ marginBottom: '18px' }}>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            marginBottom: 10,
                            borderBottom: '1px solid rgba(255,140,0,0.15)',
                            paddingBottom: 6,
                        }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff8c00', display: 'inline-block', flexShrink: 0 }} />
                            <span style={{ color: '#ff8c00', fontSize: 11, fontWeight: 900, letterSpacing: '2.5px', ...mono }}>
                                ACTIVE NOW
                            </span>
                            <span style={{ color: 'rgba(255,255,255,0.20)', fontSize: 11, ...mono }}>CONDITIONS MATCHING TODAY'S CLOSE</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                            {activePatterns.map(p => (
                                <PatternRow
                                    key={p.label}
                                    p={p}
                                    expanded={expanded.has(p.label)}
                                    onToggle={() => toggle(p.label)}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* ── All qualifying patterns ──────────────────────────────── */}
                <div>
                    <div style={{
                        display: 'flex', alignItems: 'baseline', gap: 12,
                        marginBottom: 10,
                        borderBottom: '1px solid rgba(212,170,0,0.20)',
                        paddingBottom: 8,
                    }}>
                        <span style={{
                            fontSize: 15,
                            fontWeight: 900,
                            letterSpacing: '2.5px',
                            fontFamily: 'monospace',
                            background: 'linear-gradient(180deg, #ffe066 0%, #ffbb00 38%, #cc8800 72%, #fff0a0 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                            filter: 'drop-shadow(0px 1px 0px #7a5200) drop-shadow(0px 2px 3px rgba(0,0,0,0.85))',
                            textShadow: 'none',
                        }}>
                            ALL QUALIFYING PATTERNS
                        </span>
                        <span style={{
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: '1.5px',
                            fontFamily: 'monospace',
                            background: 'linear-gradient(180deg, #e8c84a 0%, #b8860b 60%, #e8c84a 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                            filter: 'drop-shadow(0px 1px 1px rgba(0,0,0,0.70))',
                        }}>SORTED BY WIN RATE EDGE</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                        {displayAll.map(p => (
                            <PatternRow
                                key={p.label}
                                p={p}
                                expanded={expanded.has(p.label)}
                                onToggle={() => toggle(p.label)}
                            />
                        ))}
                    </div>

                    {qualifiedPatterns.length > 12 && (
                        <button
                            onClick={() => setShowAll(v => !v)}
                            style={{
                                width: '100%',
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.10)',
                                borderRadius: '5px',
                                color: 'rgba(255,255,255,0.35)',
                                cursor: 'pointer',
                                padding: '9px',
                                fontSize: '12px',
                                fontWeight: 700,
                                letterSpacing: '1.5px',
                                marginTop: '6px',
                                ...mono,
                            }}
                        >
                            {showAll ? '↑ SHOW LESS' : `↓ SHOW ALL ${qualifiedPatterns.length} PATTERNS`}
                        </button>
                    )}
                </div>

            </div>


        </div>
    );
}

// ─── Main Export ──────────────────────────────────────────────────────────────
export default function ResearchPanelV2() {
    const [tickers, setTickers] = useState<string[]>(TICKERS);
    const [input, setInput] = useState('');

    const addTicker = () => {
        const t = input.trim().toUpperCase();
        if (!t) return;
        if (!tickers.includes(t)) setTickers(prev => [...prev, t]);
        setInput('');
    };

    const removeTicker = (t: string) => setTickers(prev => prev.filter(x => x !== t));

    const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') addTicker();
    };

    const mono: React.CSSProperties = { fontFamily: "'JetBrains Mono', 'Consolas', monospace" };

    return (
        <div style={{ background: '#000', height: '100%', display: 'flex', flexDirection: 'column', color: '#fff', ...mono }}>

            {/* ── Top Banner ─────────────────────────────────────────────────── */}
            <div style={{
                background: 'linear-gradient(180deg, #0a0a0a 0%, #050505 100%)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                boxShadow: '0 1px 40px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.04)',
                padding: '0 32px',
                flexShrink: 0,
            }}>
                {/* ── Row 1: Brand bar ── */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    padding: '18px 0 16px',
                    flexWrap: 'wrap', gap: 12,
                }}>
                    {/* Left: title + sub */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        {/* Accent bar */}
                        <div style={{
                            width: 3, height: 38, flexShrink: 0,
                            background: 'linear-gradient(180deg, #00ff88 0%, #ff8c00 100%)',
                            borderRadius: 2,
                            boxShadow: '0 0 12px rgba(0,255,136,0.5)',
                        }} />
                        <div>
                            <div style={{
                                fontSize: 20, fontWeight: 900, letterSpacing: '4px',
                                color: '#ffffff',
                                textShadow: '0 0 20px rgba(255,255,255,0.15)',
                                lineHeight: 1.1,
                                ...mono,
                            }}>
                                PRICE ACTION <span style={{ color: '#00ff88', textShadow: '0 0 16px rgba(0,255,136,0.6)' }}>RESEARCH</span>
                            </div>
                            <div style={{
                                marginTop: 5,
                                display: 'flex', alignItems: 'center', gap: 8,
                            }}>
                                {[
                                    { text: 'DAILY BARS', color: 'rgba(255,255,255,0.35)' },
                                    { text: 'POLYGON', color: 'rgba(255,255,255,0.35)' },
                                    { text: `≥${MIN_WIN}% WIN RATE`, color: '#00ff88' },
                                    { text: 'PER-STOCK THRESHOLDS', color: '#ff8c00' },
                                ].map((item, i, arr) => (
                                    <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.5px', color: item.color, ...mono }}>
                                            {item.text}
                                        </span>
                                        {i < arr.length - 1 && <span style={{ color: 'rgba(255,255,255,0.12)', fontSize: 10 }}>·</span>}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right: stat badges */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                            background: 'rgba(0,255,136,0.08)',
                            border: '1px solid rgba(0,255,136,0.25)',
                            borderRadius: 4,
                            padding: '6px 14px',
                            fontSize: 11, fontWeight: 900, letterSpacing: '2px',
                            color: '#00ff88',
                            textShadow: '0 0 10px rgba(0,255,136,0.4)',
                            boxShadow: '0 0 12px rgba(0,255,136,0.08), inset 0 1px 0 rgba(0,255,136,0.1)',
                            ...mono,
                        }}>
                            {tickers.length} TICKER{tickers.length !== 1 ? 'S' : ''} LOADED
                        </div>
                        <div style={{
                            background: 'rgba(255,140,0,0.08)',
                            border: '1px solid rgba(255,140,0,0.25)',
                            borderRadius: 4,
                            padding: '6px 14px',
                            fontSize: 11, fontWeight: 900, letterSpacing: '2px',
                            color: '#ff8c00',
                            textShadow: '0 0 10px rgba(255,140,0,0.4)',
                            boxShadow: '0 0 12px rgba(255,140,0,0.08), inset 0 1px 0 rgba(255,140,0,0.1)',
                            ...mono,
                        }}>
                            MIN {MIN_N} OCC
                        </div>
                    </div>
                </div>

                {/* ── Row 2: Controls ── */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '14px 0',
                    flexWrap: 'wrap',
                }}>
                    {/* Search input */}
                    <div style={{ position: 'relative', flex: '0 0 240px' }}>
                        <span style={{
                            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                            color: 'rgba(0,255,136,0.5)', fontSize: 15, pointerEvents: 'none',
                        }}>⌕</span>
                        <input
                            value={input}
                            onChange={e => setInput(e.target.value.toUpperCase())}
                            onKeyDown={handleKey}
                            placeholder="TICKER SYMBOL..."
                            maxLength={6}
                            spellCheck={false}
                            style={{
                                width: '100%',
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.10)',
                                borderRadius: 5,
                                color: '#ffffff',
                                fontSize: 13, fontWeight: 700, letterSpacing: '2px',
                                padding: '9px 12px 9px 34px',
                                outline: 'none',
                                boxSizing: 'border-box',
                                boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.6)',
                                transition: 'border-color 0.15s',
                                ...mono,
                            }}
                        />
                    </div>

                    {/* Add button */}
                    <button
                        onClick={addTicker}
                        style={{
                            background: 'linear-gradient(135deg, rgba(0,255,136,0.15), rgba(0,200,100,0.08))',
                            border: '1px solid rgba(0,255,136,0.40)',
                            borderRadius: 5,
                            color: '#00ff88',
                            fontSize: 12, fontWeight: 900, letterSpacing: '2.5px',
                            padding: '9px 22px',
                            cursor: 'pointer',
                            textShadow: '0 0 8px rgba(0,255,136,0.5)',
                            boxShadow: '0 0 14px rgba(0,255,136,0.10)',
                            ...mono,
                        }}
                    >
                        + ADD
                    </button>

                    {/* Divider */}
                    <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />

                    {/* Active ticker chips */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {tickers.map(t => (
                            <div key={t} style={{
                                display: 'flex', alignItems: 'center', gap: 7,
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid rgba(255,255,255,0.10)',
                                borderRadius: 4,
                                padding: '5px 10px 5px 12px',
                                fontSize: 12, fontWeight: 900, letterSpacing: '1.5px',
                                color: '#ffffff',
                                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
                                ...mono,
                            }}>
                                {t}
                                <span
                                    onClick={() => removeTicker(t)}
                                    style={{
                                        color: 'rgba(255,80,80,0.6)', cursor: 'pointer',
                                        fontSize: 16, lineHeight: 1, fontWeight: 400,
                                    }}
                                >×</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Ticker Grid ────────────────────────────────────────────────── */}
            <div style={{ padding: '0 28px', flex: 1, overflowY: 'auto' }}>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '20px',
                    alignItems: 'start',
                    paddingTop: '24px',
                    paddingBottom: '24px',
                }}>
                    {tickers.map(t => <StockCard key={t} ticker={t} />)}
                </div>
            </div>
        </div>
    );
}
