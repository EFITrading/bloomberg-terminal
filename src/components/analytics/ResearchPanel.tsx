'use client';
import { useState, useEffect, useRef } from 'react';

// ─── Config ───────────────────────────────────────────────────────────────────
const TICKERS = ['SPY', 'AAPL', 'AMD'];

// Forward windows: 1 bar, 7 bars, 30 bars — unit is always the TF's own bar
// 1H → 1h later, 7h later, 30h later
// 1D → 1d later, 7d later, 30d later
// 1W → 1w later, 7w later, 30w later
const TF_CONFIG = {
  '1H': { f1: 1, f2: 7, f3: 30, l1: '+1H', l2: '+7H', l3: '+30H', label: '1H HOURLY' },
  '1D': { f1: 1, f2: 7, f3: 30, l1: '+1D', l2: '+7D', l3: '+30D', label: '1D DAILY' },
  '1W': { f1: 1, f2: 7, f3: 30, l1: '+1W', l2: '+7W', l3: '+30W', label: '1W WEEKLY' },
} as const;
type TF = keyof typeof TF_CONFIG;

// ─── Types ────────────────────────────────────────────────────────────────────
type Bar = { t: number; o: number; h: number; l: number; c: number; v: number };
type Bias = 'BUY' | 'SELL' | 'NEUTRAL';

// Only patterns with w3 >= 55 (BUY) or w3 <= 45 (SELL) survive filtering
interface PatternStat {
  label: string;
  desc: string;
  n: number;   // occurrences with full 30-bar forward data
  fwdAvg1: number;   // avg % return at +1 bar
  w1: number;   // win% at +1 bar
  fwdAvg2: number;   // avg % return at +7 bars
  w2: number;
  fwdAvg3: number;   // avg % return at +30 bars
  w3: number;
  avgPath: number[]; // avg % return at bars 0,1,2,...,30 after trigger (length 31)
  type: 'BUY' | 'SELL';
  edge: number;   // |w3 - 50|, higher = stronger
}


interface TFResult {
  tf: TF;
  bars: number;
  dateRange: string;
  sortedBars: Bar[];
  patterns: PatternStat[];   // ALL qualifying patterns (≥55% OR ≤45%)
  activeSignals: PatternStat[];   // patterns firing on the CURRENT (last) bar
  perBarBias: Bias[];          // one entry per sortedBars index
  currentStreak: number;
  currentStreakDir: 'UP' | 'DN';
  autocorr: number;
}

interface TickerAnalysis {
  ticker: string;
  lastClose: number;
  currentDD: number;
  todayReturn: number;
  tfs: Partial<Record<TF, TFResult>>;
}

// ─── Pattern Scanner ──────────────────────────────────────────────────────────
const PATH_LEN = 30; // bars to track forward

function scanTF(rawBars: Bar[], tf: TF): TFResult {
  const sorted = rawBars.filter(b => b.c > 0 && b.t > 0).sort((a, b) => a.t - b.t);
  const n = sorted.length;
  const { f1, f2, f3 } = TF_CONFIG[tf];

  // Compute forward stats for a list of bar indices where a pattern fired.
  // Returns null if fewer than 5 usable occurrences.
  function fwdStats(indices: number[]) {
    let s1 = 0, s2 = 0, s3 = 0, win1 = 0, win2 = 0, win3 = 0, cnt = 0;
    const pathSums = new Array(PATH_LEN + 1).fill(0) as number[];

    for (const i of indices) {
      if (i + PATH_LEN >= n) continue; // need full 30-bar window
      const base = sorted[i].c;
      const r1 = (sorted[i + f1].c / base - 1) * 100;
      const r2 = (sorted[i + f2].c / base - 1) * 100;
      const r3 = (sorted[i + f3].c / base - 1) * 100;
      s1 += r1; if (r1 > 0) win1++;
      s2 += r2; if (r2 > 0) win2++;
      s3 += r3; if (r3 > 0) win3++;
      for (let k = 0; k <= PATH_LEN; k++) {
        pathSums[k] += (sorted[i + k].c / base - 1) * 100;
      }
      cnt++;
    }
    if (cnt < 5) return null;
    return {
      n: cnt,
      fwdAvg1: s1 / cnt, w1: (win1 / cnt) * 100,
      fwdAvg2: s2 / cnt, w2: (win2 / cnt) * 100,
      fwdAvg3: s3 / cnt, w3: (win3 / cnt) * 100,
      avgPath: pathSums.map(s => s / cnt),
    };
  }

  // Only keep if win rate at 30 bars is ≥55% (BUY) or ≤45% (SELL)
  function toPattern(label: string, desc: string, st: ReturnType<typeof fwdStats>): PatternStat | null {
    if (!st) return null;
    const isBuy = st.w3 >= 55;
    const isSell = st.w3 <= 45;
    if (!isBuy && !isSell) return null;
    return { label, desc, ...st, type: isBuy ? 'BUY' : 'SELL', edge: Math.abs(st.w3 - 50) };
  }

  const all: PatternStat[] = [];
  const add = (p: PatternStat | null) => { if (p) all.push(p); };

  // ── Pattern 1: Consecutive streaks (2–9) ─────────────────────────────────
  for (let len = 2; len <= 9; len++) {
    const upIdx: number[] = [], dnIdx: number[] = [];
    for (let i = len; i < n - PATH_LEN; i++) {
      let up = true, dn = true;
      for (let j = 0; j < len; j++) {
        if (sorted[i - j].c <= sorted[i - j - 1].c) up = false;
        if (sorted[i - j].c >= sorted[i - j - 1].c) dn = false;
      }
      if (up) upIdx.push(i);
      if (dn) dnIdx.push(i);
    }
    add(toPattern(`${len}× UP STREAK`, `${len} consecutive up closes`, fwdStats(upIdx)));
    add(toPattern(`${len}× DOWN STREAK`, `${len} consecutive down closes`, fwdStats(dnIdx)));
  }

  // ── Pattern 2: Return magnitude buckets ──────────────────────────────────
  const magBuckets: { label: string; desc: string; min: number; max: number }[] = [
    { label: 'CRASH BAR (<-5%)', desc: 'Closed down >5%', min: -Infinity, max: -5 },
    { label: 'BIG DOWN (-5 to -3%)', desc: 'Closed down 3–5%', min: -5, max: -3 },
    { label: 'MOD DOWN (-3 to -2%)', desc: 'Closed down 2–3%', min: -3, max: -2 },
    { label: 'SM DOWN (-2 to -1%)', desc: 'Closed down 1–2%', min: -2, max: -1 },
    { label: 'SM UP (+1 to +2%)', desc: 'Closed up 1–2%', min: 1, max: 2 },
    { label: 'MOD UP (+2 to +3%)', desc: 'Closed up 2–3%', min: 2, max: 3 },
    { label: 'BIG UP (+3 to +5%)', desc: 'Closed up 3–5%', min: 3, max: 5 },
    { label: 'RIP BAR (>+5%)', desc: 'Closed up >5%', min: 5, max: Infinity },
  ];
  for (const { label, desc, min, max } of magBuckets) {
    const idx: number[] = [];
    for (let i = 1; i < n - PATH_LEN; i++) {
      const r = (sorted[i].c / sorted[i - 1].c - 1) * 100;
      if (r > min && r <= max) idx.push(i);
    }
    add(toPattern(label, desc, fwdStats(idx)));
  }

  // ── Pattern 3: Drawdown from rolling ATH (1D / 1W only — meaningful) ─────
  if (tf !== '1H') {
    const ddBuckets = [
      { label: 'NEAR ATH (0-5%)', min: 0, max: 5 },
      { label: 'PULLBACK (5-10%)', min: 5, max: 10 },
      { label: 'CORRECTION (10-20%)', min: 10, max: 20 },
      { label: 'BEAR ZONE (20-40%)', min: 20, max: 40 },
      { label: 'CRASH ZONE (>40%)', min: 40, max: Infinity },
    ];
    let ath = sorted[0].h;
    const ddPct: number[] = [0];
    for (let i = 1; i < n; i++) {
      ath = Math.max(ath, sorted[i].h);
      ddPct.push(Math.abs((sorted[i].c - ath) / ath * 100));
    }
    for (const { label, min, max } of ddBuckets) {
      const idx = ddPct.reduce<number[]>((a, dd, i) => {
        if (dd >= min && dd < max && i + PATH_LEN < n) a.push(i);
        return a;
      }, []);
      add(toPattern(label, `${min}–${max === Infinity ? `>${min}` : max}% below ATH`, fwdStats(idx)));
    }
  }

  // ── Pattern 4: Gap open ──────────────────────────────────────────────────
  const gapBuckets: { label: string; desc: string; min: number; max: number }[] = [
    { label: 'GAP DOWN (<-2%)', desc: 'Opened >2% below prior close', min: -Infinity, max: -2 },
    { label: 'SM GAP DOWN (-2/-0.5%)', desc: 'Opened 0.5–2% below', min: -2, max: -0.5 },
    { label: 'SM GAP UP (+0.5/+2%)', desc: 'Opened 0.5–2% above', min: 0.5, max: 2 },
    { label: 'GAP UP (>+2%)', desc: 'Opened >2% above prior close', min: 2, max: Infinity },
  ];
  for (const { label, desc, min, max } of gapBuckets) {
    const idx: number[] = [];
    for (let i = 1; i < n - PATH_LEN; i++) {
      const g = (sorted[i].o / sorted[i - 1].c - 1) * 100;
      if (g > min && g <= max) idx.push(i);
    }
    add(toPattern(label, desc, fwdStats(idx)));
  }

  // ── Pattern 5: Inside / Outside bar ─────────────────────────────────────
  const insIdx: number[] = [], outIdx: number[] = [];
  for (let i = 1; i < n - PATH_LEN; i++) {
    if (sorted[i].h < sorted[i - 1].h && sorted[i].l > sorted[i - 1].l) insIdx.push(i);
    if (sorted[i].h > sorted[i - 1].h && sorted[i].l < sorted[i - 1].l) outIdx.push(i);
  }
  add(toPattern('INSIDE BAR', 'Range inside prior bar (compression)', fwdStats(insIdx)));
  add(toPattern('OUTSIDE BAR', 'Range engulfs prior bar H and L', fwdStats(outIdx)));

  // ── Pattern 6: Volume spike ──────────────────────────────────────────────
  const vsUp: number[] = [], vsDn: number[] = [];
  for (let i = 20; i < n - PATH_LEN; i++) {
    let avg = 0;
    for (let j = i - 20; j < i; j++) avg += sorted[j].v;
    avg /= 20;
    if (sorted[i].v <= avg * 2) continue;
    if (sorted[i].c > sorted[i - 1].c) vsUp.push(i);
    else vsDn.push(i);
  }
  add(toPattern('VOL SPIKE UP', '2× avg volume bar closed up', fwdStats(vsUp)));
  add(toPattern('VOL SPIKE DOWN', '2× avg volume bar closed down', fwdStats(vsDn)));

  // ── Pattern 7: Range compression / expansion ─────────────────────────────
  const narrow: number[] = [], wideUp: number[] = [], wideDn: number[] = [];
  for (let i = 20; i < n - PATH_LEN; i++) {
    let avgR = 0;
    for (let j = i - 20; j < i; j++) avgR += (sorted[j].h - sorted[j].l) / sorted[j].l;
    avgR /= 20;
    const barR = (sorted[i].h - sorted[i].l) / sorted[i].l;
    if (barR < avgR * 0.4) narrow.push(i);
    else if (barR > avgR * 2) {
      if (sorted[i].c > sorted[i - 1].c) wideUp.push(i);
      else wideDn.push(i);
    }
  }
  add(toPattern('NARROW RANGE', 'Range <40% of 20-bar avg (coiling)', fwdStats(narrow)));
  add(toPattern('WIDE RANGE UP', 'Range >2× avg, closed up', fwdStats(wideUp)));
  add(toPattern('WIDE RANGE DOWN', 'Range >2× avg, closed down', fwdStats(wideDn)));

  // ── Pattern 8: Candlestick structure + distribution (bearish-weighted) ────

  // 8a. Upper wick rejection — long upper wick (>65% of range), small body (<35%)
  //     Price pushed up hard, sellers slammed it back down. Classic reversal signal.
  const uwrIdx: number[] = [];
  for (let i = 1; i < n - PATH_LEN; i++) {
    const range = sorted[i].h - sorted[i].l;
    if (range === 0 || range / sorted[i].l < 0.003) continue;
    const upperWick = (sorted[i].h - sorted[i].c) / range;
    const bodyPct = Math.abs(sorted[i].c - sorted[i].o) / range;
    if (upperWick > 0.65 && bodyPct < 0.35) uwrIdx.push(i);
  }
  add(toPattern('UPPER WICK REJECTION', 'Upper wick >65% of range — price rejected higher', fwdStats(uwrIdx)));

  // 8b. Bearish engulfing — prev bar was bullish, current opens above prev close,
  //     closes below prev open. Sellers fully overwhelmed prior buyers.
  const beIdx: number[] = [];
  for (let i = 1; i < n - PATH_LEN; i++) {
    const pb = sorted[i - 1], cb = sorted[i];
    if (pb.c > pb.o && cb.o >= pb.c && cb.c < pb.o) beIdx.push(i);
  }
  add(toPattern('BEARISH ENGULFING', 'Bearish candle body fully engulfs prior bullish candle', fwdStats(beIdx)));

  // 8c. Gap-up-and-fade (bull trap) — bar opens above prior close (>0.5% gap up)
  //     but closes BELOW the prior close. Traps buyers who chased the gap.
  const gufIdx: number[] = [];
  for (let i = 1; i < n - PATH_LEN; i++) {
    const gapPct = (sorted[i].o / sorted[i - 1].c - 1) * 100;
    if (gapPct > 0.5 && sorted[i].c < sorted[i - 1].c) gufIdx.push(i);
  }
  add(toPattern('GAP UP & FADE', 'Gapped up >0.5% then closed below prior close (bull trap)', fwdStats(gufIdx)));

  // 8d. Distribution bar — high volume (>1.5× 20-bar avg) with close in lower
  //     30% of the bar's range. Big money selling into a move.
  {
    const distIdx: number[] = [];
    for (let i = 20; i < n - PATH_LEN; i++) {
      let avV = 0;
      for (let j = i - 20; j < i; j++) avV += sorted[j].v;
      avV /= 20;
      const range = sorted[i].h - sorted[i].l;
      if (range === 0 || range / sorted[i].l < 0.003) continue;
      const closePct = (sorted[i].c - sorted[i].l) / range;
      if (sorted[i].v > avV * 1.5 && closePct < 0.30) distIdx.push(i);
    }
    add(toPattern('DISTRIBUTION BAR', 'High volume (1.5×) + close in bottom 30% of bar range', fwdStats(distIdx)));
  }

  // 8e. Lower high / lower low — bar makes both a lower high AND a lower low
  //     vs the previous bar AND closes down. Structural downtrend confirmation.
  const lhllIdx: number[] = [];
  for (let i = 1; i < n - PATH_LEN; i++) {
    if (sorted[i].h < sorted[i - 1].h && sorted[i].l < sorted[i - 1].l && sorted[i].c < sorted[i - 1].c) lhllIdx.push(i);
  }
  add(toPattern('LOWER HIGH/LOW', 'Lower high, lower low, lower close (downtrend structure bar)', fwdStats(lhllIdx)));

  // 8f. Overbought reversal — close >3% above 20-bar SMA and bar closes red.
  //     Exhaustion after an extended move.
  {
    const sma20tmp: number[] = new Array(n).fill(0);
    let s20 = 0;
    for (let i = 0; i < Math.min(20, n); i++) s20 += sorted[i].c;
    for (let i = 20; i < n; i++) {
      s20 += sorted[i].c - sorted[i - 20].c;
      sma20tmp[i] = s20 / 20;
    }
    const obRevIdx: number[] = [];
    for (let i = 20; i < n - PATH_LEN; i++) {
      if (sma20tmp[i] <= 0) continue;
      const ext = (sorted[i].c / sma20tmp[i] - 1) * 100;
      if (ext > 3 && sorted[i].c < sorted[i - 1].c) obRevIdx.push(i);
    }
    add(toPattern('OVERBOUGHT REVERSAL', 'Close >3% above 20-SMA + bar closes red (exhaustion)', fwdStats(obRevIdx)));
  }

  // Sort surviving patterns by edge (strongest first)
  all.sort((a, b) => b.edge - a.edge);

  // ── Current state ─────────────────────────────────────────────────────────
  const last = sorted[n - 1];
  const prev = sorted[n - 2];

  let streak = 1;
  const streakDir: 'UP' | 'DN' = last.c >= prev.c ? 'UP' : 'DN';
  for (let i = n - 2; i >= 1; i--) {
    const isUp = sorted[i].c > sorted[i - 1].c;
    if ((streakDir === 'UP' && isUp) || (streakDir === 'DN' && !isUp)) streak++;
    else break;
  }

  // Lag-1 autocorrelation
  const rets = sorted.slice(1).map((b, i) => b.c / sorted[i].c - 1);
  const acN = rets.length - 1;
  let sx = 0, sy = 0, sxy = 0, sx2 = 0, sy2 = 0;
  for (let i = 0; i < acN; i++) {
    sx += rets[i]; sy += rets[i + 1];
    sxy += rets[i] * rets[i + 1];
    sx2 += rets[i] ** 2; sy2 += rets[i + 1] ** 2;
  }
  const denom = Math.sqrt((sx2 - sx * sx / acN) * (sy2 - sy * sy / acN));
  const autocorr = denom === 0 ? 0 : (sxy - sx * sy / acN) / denom;

  // Active signals: patterns that match the CURRENT last bar's conditions
  const patMap = new Map<string, PatternStat>(all.map(p => [p.label, p]));
  const active: PatternStat[] = [];
  const tryActive = (lbl: string) => { const p = patMap.get(lbl); if (p) active.push(p); };

  if (streak >= 2) tryActive(`${Math.min(streak, 9)}× ${streakDir === 'UP' ? 'UP' : 'DOWN'} STREAK`);
  const lastRet = (last.c / prev.c - 1) * 100;
  if (lastRet < -5) tryActive('CRASH BAR (<-5%)');
  else if (lastRet < -3) tryActive('BIG DOWN (-5 to -3%)');
  else if (lastRet < -2) tryActive('MOD DOWN (-3 to -2%)');
  else if (lastRet > 5) tryActive('RIP BAR (>+5%)');
  else if (lastRet > 3) tryActive('BIG UP (+3 to +5%)');
  else if (lastRet > 2) tryActive('MOD UP (+2 to +3%)');
  if (last.h < prev.h && last.l > prev.l) tryActive('INSIDE BAR');
  if (last.h > prev.h && last.l < prev.l) tryActive('OUTSIDE BAR');
  if (tf !== '1H') {
    let maxH = 0;
    for (const b of sorted) maxH = Math.max(maxH, b.h);
    const dd = Math.abs((last.c / maxH - 1) * 100);
    const lbl = dd < 5 ? 'NEAR ATH (0-5%)' : dd < 10 ? 'PULLBACK (5-10%)' : dd < 20 ? 'CORRECTION (10-20%)' : dd < 40 ? 'BEAR ZONE (20-40%)' : 'CRASH ZONE (>40%)';
    tryActive(lbl);
  }
  // 8a. Upper wick rejection
  {
    const lRange = last.h - last.l;
    if (lRange > 0 && lRange / last.l > 0.003) {
      const uw = (last.h - last.c) / lRange;
      const bp = Math.abs(last.c - last.o) / lRange;
      if (uw > 0.65 && bp < 0.35) tryActive('UPPER WICK REJECTION');
    }
  }
  // 8b. Bearish engulfing
  if (prev.c > prev.o && last.o >= prev.c && last.c < prev.o) tryActive('BEARISH ENGULFING');
  // 8c. Gap-up-and-fade
  {
    const gapPct = (last.o / prev.c - 1) * 100;
    if (gapPct > 0.5 && last.c < prev.c) tryActive('GAP UP & FADE');
  }
  // 8d. Distribution bar
  {
    const lRange = last.h - last.l;
    if (lRange > 0 && lRange / last.l > 0.003) {
      let avV = 0; for (const b of sorted.slice(-20)) avV += b.v; avV /= 20;
      const closePct = (last.c - last.l) / lRange;
      if (last.v > avV * 1.5 && closePct < 0.30) tryActive('DISTRIBUTION BAR');
    }
  }
  // 8e. Lower high / lower low
  if (last.h < prev.h && last.l < prev.l && last.c < prev.c) tryActive('LOWER HIGH/LOW');
  // 8f. Overbought reversal
  {
    let _s20 = 0; const _w = Math.min(20, n); for (let _i = n - _w; _i < n; _i++) _s20 += sorted[_i].c; const lastSma = _s20 / _w;
    if (lastSma > 0 && (last.c / lastSma - 1) * 100 > 3 && last.c < prev.c) tryActive('OVERBOUGHT REVERSAL');
  }

  // ── Per-bar historical bias (backtest across ALL bars) ────────────────────
  // Precompute rolling ATH
  const athArr: number[] = new Array(n);
  athArr[0] = sorted[0].h;
  for (let i = 1; i < n; i++) athArr[i] = Math.max(athArr[i - 1], sorted[i].h);

  // Precompute 20-bar avg volume (sliding window)
  const avgVol: number[] = new Array(n).fill(0);
  {
    let vs = 0;
    for (let i = 0; i < Math.min(20, n); i++) vs += sorted[i].v;
    for (let i = 20; i < n; i++) { vs += sorted[i].v - sorted[i - 20].v; avgVol[i] = vs / 20; }
  }

  const perBarBias: Bias[] = new Array(n).fill('NEUTRAL') as Bias[];
  let pbStreak = 1;
  let pbDir: 'UP' | 'DN' = n > 1 && sorted[1].c >= sorted[0].c ? 'UP' : 'DN';

  // precompute avg range for narrow/wide check
  const avgRange: number[] = new Array(n).fill(0);
  {
    let rs = 0; for (let i = 0; i < Math.min(20, n); i++) rs += (sorted[i].h - sorted[i].l) / sorted[i].l;
    for (let i = 20; i < n; i++) { rs += (sorted[i].h - sorted[i].l) / sorted[i].l - (sorted[i - 20].h - sorted[i - 20].l) / sorted[i - 20].l; avgRange[i] = rs / 20; }
  }

  // precompute 20-bar SMA of close (for overbought reversal per-bar check)
  const sma20Arr: number[] = new Array(n).fill(0);
  {
    let s20 = 0;
    for (let i = 0; i < Math.min(20, n); i++) s20 += sorted[i].c;
    for (let i = 20; i < n; i++) { s20 += sorted[i].c - sorted[i - 20].c; sma20Arr[i] = s20 / 20; }
  }

  for (let i = 1; i < n; i++) {
    const isUp = sorted[i].c >= sorted[i - 1].c;
    const dir: 'UP' | 'DN' = isUp ? 'UP' : 'DN';
    if (dir === pbDir) pbStreak++;
    else { pbStreak = 1; pbDir = dir; }

    const cands: PatternStat[] = [];
    const tc = (lbl: string) => { const p = patMap.get(lbl); if (p) cands.push(p); };

    tc(`${Math.min(pbStreak, 9)}× ${pbDir === 'UP' ? 'UP' : 'DOWN'} STREAK`);
    const br = (sorted[i].c / sorted[i - 1].c - 1) * 100;
    if (br < -5) tc('CRASH BAR (<-5%)');
    else if (br < -3) tc('BIG DOWN (-5 to -3%)');
    else if (br < -2) tc('MOD DOWN (-3 to -2%)');
    else if (br < -1) tc('SM DOWN (-2 to -1%)');
    else if (br > 5) tc('RIP BAR (>+5%)');
    else if (br > 3) tc('BIG UP (+3 to +5%)');
    else if (br > 2) tc('MOD UP (+2 to +3%)');
    else if (br > 1) tc('SM UP (+1 to +2%)');

    if (tf !== '1H') {
      const dd = Math.abs((sorted[i].c / athArr[i] - 1) * 100);
      const lbl = dd < 5 ? 'NEAR ATH (0-5%)' : dd < 10 ? 'PULLBACK (5-10%)' : dd < 20 ? 'CORRECTION (10-20%)' : dd < 40 ? 'BEAR ZONE (20-40%)' : 'CRASH ZONE (>40%)';
      tc(lbl);
    }
    if (i >= 20 && sorted[i].v > avgVol[i] * 2) tc(isUp ? 'VOL SPIKE UP' : 'VOL SPIKE DOWN');
    if (sorted[i].h < sorted[i - 1].h && sorted[i].l > sorted[i - 1].l) tc('INSIDE BAR');
    if (sorted[i].h > sorted[i - 1].h && sorted[i].l < sorted[i - 1].l) tc('OUTSIDE BAR');
    // Gap open
    const gap = (sorted[i].o / sorted[i - 1].c - 1) * 100;
    if (gap < -2) tc('GAP DOWN (<-2%)');
    else if (gap < -0.5) tc('SM GAP DOWN (-2/-0.5%)');
    else if (gap > 2) tc('GAP UP (>+2%)');
    else if (gap > 0.5) tc('SM GAP UP (+0.5/+2%)');
    // Narrow / wide range
    if (i >= 20 && avgRange[i] > 0) {
      const barR = (sorted[i].h - sorted[i].l) / sorted[i].l;
      if (barR < avgRange[i] * 0.4) tc('NARROW RANGE');
      else if (barR > avgRange[i] * 2) tc(isUp ? 'WIDE RANGE UP' : 'WIDE RANGE DOWN');
    }
    // 8a. Upper wick rejection
    {
      const range = sorted[i].h - sorted[i].l;
      if (range > 0 && range / sorted[i].l > 0.003) {
        const uw = (sorted[i].h - sorted[i].c) / range;
        const bp = Math.abs(sorted[i].c - sorted[i].o) / range;
        if (uw > 0.65 && bp < 0.35) tc('UPPER WICK REJECTION');
      }
    }
    // 8b. Bearish engulfing
    {
      const pb = sorted[i - 1];
      if (pb.c > pb.o && sorted[i].o >= pb.c && sorted[i].c < pb.o) tc('BEARISH ENGULFING');
    }
    // 8c. Gap-up-and-fade
    {
      const gapPct = (sorted[i].o / sorted[i - 1].c - 1) * 100;
      if (gapPct > 0.5 && sorted[i].c < sorted[i - 1].c) tc('GAP UP & FADE');
    }
    // 8d. Distribution bar
    if (i >= 20) {
      const range = sorted[i].h - sorted[i].l;
      if (range > 0 && range / sorted[i].l > 0.003) {
        const closePct = (sorted[i].c - sorted[i].l) / range;
        if (sorted[i].v > avgVol[i] * 1.5 && closePct < 0.30) tc('DISTRIBUTION BAR');
      }
    }
    // 8e. Lower high / lower low
    if (sorted[i].h < sorted[i - 1].h && sorted[i].l < sorted[i - 1].l && sorted[i].c < sorted[i - 1].c) tc('LOWER HIGH/LOW');
    // 8f. Overbought reversal
    if (i >= 20 && sma20Arr[i] > 0) {
      const ext = (sorted[i].c / sma20Arr[i] - 1) * 100;
      if (ext > 3 && sorted[i].c < sorted[i - 1].c) tc('OVERBOUGHT REVERSAL');
    }

    if (cands.length > 0) {
      const top = cands.reduce((best, p) => p.edge > best.edge ? p : best);
      perBarBias[i] = top.type;
    }
  }

  return {
    tf, bars: n,
    dateRange: `${new Date(sorted[0].t).getFullYear()}–${new Date(sorted[n - 1].t).getFullYear()}`,
    sortedBars: sorted,
    patterns: all,
    activeSignals: active,
    perBarBias,
    currentStreak: streak,
    currentStreakDir: streakDir,
    autocorr,
  };
}

function buildAnalysis(ticker: string, mtfData: Record<TF, Bar[]>): TickerAnalysis {
  const daily = mtfData['1D'].filter(b => b.c > 0).sort((a, b) => a.t - b.t);
  const last = daily[daily.length - 1];
  const prev = daily[daily.length - 2];
  const todayReturn = prev ? (last.c / prev.c - 1) * 100 : 0;
  let maxH = 0;
  for (const b of daily) maxH = Math.max(maxH, b.h);

  const tfs: Partial<Record<TF, TFResult>> = {};
  for (const tf of ['1H', '1D', '1W'] as TF[]) {
    const bars = mtfData[tf];
    if (bars && bars.length >= 60) {
      tfs[tf] = scanTF(bars, tf);
    } else {

    }
  }
  return { ticker, lastClose: last.c, currentDD: (last.c / maxH - 1) * 100, todayReturn, tfs };
}

// ─── Historical Price Chart — Candlestick with zoom/drag ─────────────────────
function PriceChart({ bars, perBarBias, tf }: { bars: Bar[]; perBarBias: Bias[]; tf: TF }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visibleRef = useRef(Math.min(bars.length, 200));
  const offsetRef = useRef(Math.max(0, bars.length - Math.min(bars.length, 200)));
  const drawRef = useRef<() => void>(() => { });
  const inertiaRef = useRef<number | null>(null);
  const dragRef = useRef({ active: false, startX: 0, startOffset: 0, lastX: 0, lastTime: 0, velocity: 0 });

  // Reset zoom/offset when ticker changes (bars reference changes entirely)
  useEffect(() => {
    visibleRef.current = Math.min(bars.length, 200);
    offsetRef.current = Math.max(0, bars.length - visibleRef.current);
  }, [bars]);

  // ── Draw ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || bars.length === 0) return;

    drawRef.current = () => {
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      if (W === 0 || H === 0) return;

      const needW = Math.round(W * dpr);
      const needH = Math.round(H * dpr);
      if (canvas.width !== needW || canvas.height !== needH) {
        canvas.width = needW;
        canvas.height = needH;
        canvas.style.width = `${W}px`;
        canvas.style.height = `${H}px`;
      }

      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      (ctx as any).imageSmoothingEnabled = false;

      const vis = Math.max(10, Math.min(bars.length, visibleRef.current));
      const offset = Math.max(0, Math.min(bars.length - vis, Math.round(offsetRef.current)));
      const display = bars.slice(offset, offset + vis);
      const bOffset = offset;

      const PL = 8, PR = 82, PT = 14, PB = 46;
      const cW = W - PL - PR;
      const cH = H - PT - PB;

      // Price range from full OHLC
      const highs = display.map(b => b.h);
      const lows = display.map(b => b.l);
      const minP = Math.min(...lows) * 0.9985;
      const maxP = Math.max(...highs) * 1.0015;
      const pToY = (p: number) => PT + cH - ((p - minP) / (maxP - minP)) * cH;

      const spacing = cW / Math.max(vis, 1);
      const candleW = Math.max(1, spacing * 0.72);

      // ── Background ──────────────────────────────────────────────────────
      ctx.fillStyle = '#040406';
      ctx.fillRect(0, 0, W, H);

      // ── Grid ────────────────────────────────────────────────────────────
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1;
      const gridLines = 6;
      for (let k = 0; k <= gridLines; k++) {
        const y = PT + (cH / gridLines) * k;
        ctx.beginPath(); ctx.moveTo(PL, y); ctx.lineTo(W - PR, y); ctx.stroke();
      }

      // ── Pre/After-hours tinting (1H only — matches EFI chart style) ─────
      if (tf === '1H') {
        display.forEach((bar, idx) => {
          const d = new Date(bar.t);
          const mo = d.getUTCMonth() + 1;
          const etOff = (mo > 3 && mo < 11) ? -4 : -5;
          const etMins = ((d.getUTCHours() + etOff + 24) % 24) * 60 + d.getUTCMinutes();
          const isExtended = etMins < 570 || etMins >= 960;
          if (!isExtended) return;
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
          ctx.fillRect(PL + idx * spacing, PT, spacing, cH);
        });
      }

      // ── Bias column shading — only BELOW the bar low (under the candle) ─
      let shadedBuy = 0, shadedSell = 0, shadedNeutral = 0;
      display.forEach((bar, idx) => {
        const bias = perBarBias[bOffset + idx];
        if (!bias || bias === 'NEUTRAL') { shadedNeutral++; return; }
        const lowY = Math.floor(pToY(bar.l));
        const shadeH = PT + cH - lowY;
        if (shadeH <= 0) return;
        ctx.fillStyle = bias === 'BUY' ? 'rgba(0,255,136,0.10)' : 'rgba(255,51,51,0.10)';
        ctx.fillRect(Math.floor(PL + idx * spacing), lowY, Math.ceil(spacing), shadeH);
        if (bias === 'BUY') shadedBuy++; else shadedSell++;
      });
      // ── Candles ─────────────────────────────────────────────────────────
      display.forEach((bar, idx) => {
        const isGreen = bar.c >= bar.o;
        const bodyColor = isGreen ? '#00e87a' : '#ff3333';
        const wickColor = isGreen ? '#00bb60' : '#cc2222';
        const borColor = isGreen ? '#00cc66' : '#cc1111';

        const x = PL + idx * spacing;
        const wickX = Math.floor(x + spacing / 2);
        const bX = Math.floor(x + (spacing - candleW) / 2);
        const bW = Math.max(1, Math.floor(candleW));
        const openY = pToY(bar.o);
        const closeY = pToY(bar.c);
        const highY = pToY(bar.h);
        const lowY = pToY(bar.l);
        const bodyY = Math.min(openY, closeY);
        const bodyH = Math.max(1, Math.abs(closeY - openY));

        // Wick
        ctx.strokeStyle = wickColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(wickX, Math.floor(highY));
        ctx.lineTo(wickX, Math.floor(lowY));
        ctx.stroke();

        // Body
        ctx.fillStyle = bodyColor;
        ctx.fillRect(bX, Math.floor(bodyY), bW, Math.ceil(bodyH));
        ctx.strokeStyle = borColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(bX, Math.floor(bodyY), bW, Math.ceil(bodyH));
      });

      // ── X-axis labels ───────────────────────────────────────────────────
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px "Courier New", monospace';
      ctx.textAlign = 'center';
      const labelEvery = Math.max(1, Math.floor(vis / 5));
      display.forEach((bar, idx) => {
        if (idx % labelEvery !== 0) return;
        const x = PL + idx * spacing + spacing / 2;
        const d = new Date(bar.t);
        let label: string;
        if (tf === '1H') {
          // Convert to ET using DST-aware offset
          const mo = d.getUTCMonth() + 1;
          const etOff = (mo > 3 && mo < 11) ? -4 : -5;
          const etDate = new Date(bar.t + etOff * 3600000);
          const etM = etDate.getUTCMonth() + 1;
          const etD = etDate.getUTCDate();
          const etH = etDate.getUTCHours();
          const etMin = etDate.getUTCMinutes();
          label = `${etM}/${etD} ${etH}:${String(etMin).padStart(2, '0')}`;
        } else if (tf === '1D') {
          // Daily bars: polygon timestamps are midnight UTC, use UTC date
          label = `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${String(d.getUTCFullYear()).slice(2)}`;
        } else {
          label = `${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
        }
        ctx.fillText(label, x, H - 18);
      });

      // ── Y-axis labels ───────────────────────────────────────────────────
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'left';
      for (let k = 0; k <= gridLines; k++) {
        const v = minP + ((maxP - minP) / gridLines) * (gridLines - k);
        const y = PT + (cH / gridLines) * k;
        ctx.fillText(`$${v.toFixed(v > 1000 ? 0 : v > 100 ? 1 : 2)}`, W - PR + 5, y + 4);
      }

      // ── X-axis baseline ─────────────────────────────────────────────────
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PL, PT + cH);
      ctx.lineTo(W - PR, PT + cH);
      ctx.stroke();
    };

    drawRef.current();
  }, [bars, perBarBias, tf]);

  // ── Wheel zoom ────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || bars.length === 0) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomIn = e.deltaY < 0;
      const factor = zoomIn ? 0.85 : 1.18;
      const newVis = Math.max(10, Math.min(bars.length, Math.round(visibleRef.current * factor)));
      // Zoom centered on right edge (latest bar) for natural feel
      const rightEdge = offsetRef.current + visibleRef.current;
      offsetRef.current = Math.max(0, Math.min(bars.length - newVis, rightEdge - newVis));
      visibleRef.current = newVis;
      drawRef.current();
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [bars.length]);

  // ── Drag pan + inertia ────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || bars.length === 0) return;

    const onDown = (e: MouseEvent) => {
      if (inertiaRef.current !== null) { cancelAnimationFrame(inertiaRef.current); inertiaRef.current = null; }
      dragRef.current = { active: true, startX: e.clientX, startOffset: offsetRef.current, lastX: e.clientX, lastTime: performance.now(), velocity: 0 };
      canvas.style.cursor = 'grabbing';
    };

    const onMove = (e: MouseEvent) => {
      if (!dragRef.current.active) return;
      const W = canvas.offsetWidth;
      const barPx = (W - 80) / Math.max(visibleRef.current, 1);
      const now = performance.now();
      const dt = now - dragRef.current.lastTime;
      if (dt > 0) {
        const rawVel = (e.clientX - dragRef.current.lastX) / barPx / dt;
        dragRef.current.velocity = dragRef.current.velocity * 0.6 + rawVel * 0.4;
      }
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastTime = now;
      const dragBars = (e.clientX - dragRef.current.startX) / barPx;
      offsetRef.current = Math.max(0, Math.min(bars.length - visibleRef.current, dragRef.current.startOffset - dragBars));
      drawRef.current();
    };

    const onUp = () => {
      if (!dragRef.current.active) return;
      dragRef.current.active = false;
      canvas.style.cursor = 'crosshair';
      let vel = dragRef.current.velocity;
      if (Math.abs(vel) < 0.004) return;
      const animate = () => {
        vel *= 0.88;
        if (Math.abs(vel) < 0.0008) { inertiaRef.current = null; return; }
        offsetRef.current = Math.max(0, Math.min(bars.length - visibleRef.current, offsetRef.current - vel * 16));
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
    <div style={{ width: '100%', height: '400px', position: 'relative', background: '#040406' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }} />
    </div>
  );
}

// ─── Projection Chart ─────────────────────────────────────────────────────────
// One per pattern. X axis = bars 0..30. Y axis = avg % return.
// Shows the composite average price path across ALL historical occurrences of that pattern.
function ProjectionChart({ pattern, tf }: { pattern: PatternStat; tf: TF }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isBuy = pattern.type === 'BUY';
  const lineColor = isBuy ? '#00ff88' : '#ff3333';
  const cfg = TF_CONFIG[tf];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    const path = pattern.avgPath; // length 31: index 0=entry, 30=exit
    const PL = 44, PR = 10, PT = 10, PB = 30;
    const cW = W - PL - PR;
    const cH = H - PT - PB;

    // Scale: include 0 always in range
    const rawMin = Math.min(0, ...path);
    const rawMax = Math.max(0, ...path);
    const pad = Math.max(Math.abs(rawMax - rawMin) * 0.15, 0.1);
    const minV = rawMin - pad;
    const maxV = rawMax + pad;
    const range = maxV - minV;

    const xOf = (i: number) => PL + (i / (path.length - 1)) * cW;
    const yOf = (v: number) => PT + cH - ((v - minV) / range) * cH;
    const y0 = yOf(0);

    // Background
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
    for (let k = 0; k <= 4; k++) {
      const y = PT + (cH / 4) * k;
      ctx.beginPath(); ctx.moveTo(PL, y); ctx.lineTo(W - PR, y); ctx.stroke();
    }

    // Zero line (white dashed)
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(PL, y0); ctx.lineTo(W - PR, y0); ctx.stroke();
    ctx.setLineDash([]);

    // Shaded area under/above the avg path vs 0
    ctx.beginPath();
    ctx.moveTo(xOf(0), y0);
    for (let i = 0; i < path.length; i++) ctx.lineTo(xOf(i), yOf(path[i]));
    ctx.lineTo(xOf(path.length - 1), y0);
    ctx.closePath();
    const [r, g, b_] = isBuy ? [0, 255, 136] : [255, 51, 51];
    const areaGr = ctx.createLinearGradient(0, PT, 0, PT + cH);
    areaGr.addColorStop(0, `rgba(${r},${g},${b_},0.35)`);
    areaGr.addColorStop(1, `rgba(${r},${g},${b_},0.03)`);
    ctx.fillStyle = areaGr; ctx.fill();

    // Avg path line
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(path[0]));
    for (let i = 1; i < path.length; i++) ctx.lineTo(xOf(i), yOf(path[i]));
    ctx.strokeStyle = lineColor; ctx.lineWidth = 2; ctx.stroke();

    // Key bar markers: +1, +7, +30
    const keyBars = [1, 7, 30].filter(b => b < path.length);
    for (const bar of keyBars) {
      const px = xOf(bar), py = yOf(path[bar]);
      const val = path[bar];
      const dc = val >= 0 ? '#00ff88' : '#ff3333';

      // Vertical tick
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, PT); ctx.lineTo(px, PT + cH); ctx.stroke();

      // Dot
      ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fillStyle = dc; ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();

      // Value label (above dot if positive, below if negative)
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
      const lY = val >= 0 ? py - 10 : py + 18;
      ctx.fillText(`${val >= 0 ? '+' : ''}${val.toFixed(1)}%`, px, lY);
    }

    // X-axis tick labels (0, 7, 30)
    const unit = tf === '1H' ? 'h' : tf === '1D' ? 'd' : 'w';
    ctx.fillStyle = '#bbb'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
    for (const bar of [0, 7, 30]) {
      if (bar >= path.length) continue;
      ctx.fillText(`${bar}${unit}`, xOf(bar), PT + cH + 18);
    }

    // Y-axis labels (left, % return)
    ctx.textAlign = 'right'; ctx.fillStyle = '#bbb'; ctx.font = '12px monospace';
    for (let k = 0; k <= 4; k++) {
      const v = minV + (range / 4) * k;
      ctx.fillText(`${v >= 0 ? '+' : ''}${v.toFixed(1)}%`, PL - 3, yOf(v) + 3);
    }
  }, [pattern, tf, isBuy, lineColor]);

  return (
    <div style={{ background: '#000', border: `1px solid ${lineColor}33`, borderRadius: '6px', overflow: 'hidden' }}>
      {/* Header row */}
      <div style={{ padding: '7px 10px 3px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #0f0f0f' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ background: lineColor, color: '#000', fontSize: '13px', fontWeight: 900, padding: '2px 7px', borderRadius: '2px' }}>{pattern.type}</span>
          <span style={{ color: '#fff', fontSize: '14px', fontWeight: 700 }}>{pattern.label}</span>
        </div>
        <span style={{ color: '#fff', fontSize: '13px' }}>{pattern.n} occurrences</span>
      </div>
      {/* Canvas */}
      <canvas ref={canvasRef} style={{ width: '100%', height: '140px', display: 'block' }} />
      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderTop: '1px solid #0f0f0f' }}>
        {([
          [cfg.l1, pattern.fwdAvg1, pattern.w1],
          [cfg.l2, pattern.fwdAvg2, pattern.w2],
          [cfg.l3, pattern.fwdAvg3, pattern.w3],
        ] as [string, number, number][]).map(([lbl, avg, win], ki) => (
          <div key={ki} style={{ padding: '6px 8px', textAlign: 'center', borderRight: ki < 2 ? '1px solid #0f0f0f' : 'none' }}>
            <div style={{ color: '#ff8c00', fontSize: '13px', marginBottom: '2px', fontWeight: 700 }}>{lbl}</div>
            <div style={{ color: avg >= 0 ? '#00ff88' : '#ff3333', fontSize: '15px', fontWeight: 800 }}>{avg >= 0 ? '+' : ''}{avg.toFixed(2)}%</div>
            <div style={{ color: win >= 55 ? '#00ff88' : win <= 45 ? '#ff3333' : '#ff8c00', fontSize: '13px' }}>{win.toFixed(0)}% win</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Ticker Card ──────────────────────────────────────────────────────────────
function TickerCard({ ticker }: { ticker: string }) {
  const [analysis, setAnalysis] = useState<TickerAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTF, setActiveTF] = useState<TF>('1D');
  const [showProj, setShowProj] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    fetch('/api/mtf-historical-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols: [ticker] }),
    })
      .then(r => r.json())
      .then(json => {
        if (cancelled) return;
        const raw = json?.data?.[ticker];
        if (!raw) { setError(`Polygon returned no data (full response: ${JSON.stringify(json).slice(0, 200)})`); setLoading(false); return; }
        const mtfData: Record<TF, Bar[]> = { '1H': raw['1H'] ?? [], '1D': raw['1D'] ?? [], '1W': raw['1W'] ?? [] };
        if (mtfData['1D'].length === 0) { setError('1D bar array is empty — check POLYGON_API_KEY and mtf-historical-data route'); setLoading(false); return; }
        setAnalysis(buildAnalysis(ticker, mtfData));
        setLoading(false);
      })
      .catch(err => { if (!cancelled) { setError(`Fetch threw: ${String(err)}`); setLoading(false); } });
    return () => { cancelled = true; };
  }, [ticker]);

  const cardBase: React.CSSProperties = {
    background: 'linear-gradient(160deg, #161618 0%, #0c0c0e 50%, #060608 100%)',
    boxShadow: '0 12px 40px rgba(0,0,0,0.85), 0 2px 8px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.5)',
    borderRadius: '12px',
    overflow: 'hidden',
  };

  if (loading) return (
    <div style={{ ...cardBase, border: '1px solid #2a2a2e', padding: '28px', textAlign: 'center', minHeight: '180px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
      <div style={{ color: '#fff', fontSize: '20px', fontWeight: 900 }}>{ticker}</div>
      <div style={{ color: '#ff8c00', fontSize: '14px', letterSpacing: '3px' }}>FETCHING 1H · 1D · 1W FROM POLYGON...</div>
      <div style={{ color: '#fff', fontSize: '14px' }}>Running pattern scan · filters to ≥55% win rate only</div>
    </div>
  );
  if (error) return (
    <div style={{ ...cardBase, border: '1px solid #ff333344', padding: '20px' }}>
      <div style={{ color: '#ff3333', fontWeight: 700, marginBottom: '8px' }}>{ticker} — FETCH ERROR</div>
      <div style={{ color: '#ff6666', fontSize: '14px', fontFamily: 'monospace', lineHeight: 1.6 }}>{error}</div>
    </div>
  );
  if (!analysis) return null;

  const { lastClose, currentDD, todayReturn, tfs } = analysis;
  const tfResult = tfs[activeTF];
  const topActive = tfResult?.activeSignals[0] ?? null;
  const biasType = topActive?.type ?? 'NEUTRAL';
  const biasColor = biasType === 'BUY' ? '#00ff88' : biasType === 'SELL' ? '#ff3333' : '#ff8c00';
  const ddAbs = Math.abs(currentDD);

  return (
    <div style={{ ...cardBase, border: `1px solid ${biasColor}44`, borderTop: `3px solid ${biasColor}` }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ padding: '14px 18px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ color: '#fff', fontSize: '22px', fontWeight: 900, letterSpacing: '2px' }}>{ticker}</span>
            {topActive && (
              <span style={{ background: biasColor, color: '#000', fontSize: '13px', fontWeight: 900, padding: '2px 8px', borderRadius: '3px' }}>
                {activeTF} · {biasType}
              </span>
            )}
            <span style={{ color: todayReturn >= 0 ? '#00ff88' : '#ff3333', fontSize: '12px', fontWeight: 700 }}>
              {todayReturn >= 0 ? '+' : ''}{todayReturn.toFixed(2)}% today
            </span>
          </div>
          <div style={{ color: '#fff', fontSize: '13px', marginTop: '3px' }}>
            ${lastClose.toFixed(2)} · {tfs['1D']?.dateRange}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: ddAbs < 5 ? '#00ff88' : ddAbs < 20 ? '#ff8c00' : '#ff3333', fontSize: '12px', fontWeight: 700 }}>
            {currentDD.toFixed(1)}% from ATH
          </div>
          {tfResult && (
            <>
              <div style={{ color: tfResult.currentStreakDir === 'UP' ? '#00ff88' : '#ff3333', fontSize: '14px', marginTop: '2px', fontWeight: 700 }}>
                {tfResult.currentStreak}× {tfResult.currentStreakDir} streak ({activeTF})
              </div>
              <div style={{ color: '#fff', fontSize: '12px', marginTop: '2px' }}>
                autocorr {tfResult.autocorr.toFixed(3)} {tfResult.autocorr < -0.05 ? '· mean-rev' : tfResult.autocorr > 0.05 ? '· trending' : '· random'}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── TF selector ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '8px', padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {(['1H', '1D', '1W'] as TF[]).map(tf => {
          const r = tfs[tf];
          const isAct = activeTF === tf;
          const TF_COLORS: Record<TF, { base: string; glow: string }> = {
            '1H': { base: isAct ? 'linear-gradient(145deg,#ff9500 0%,#c85000 100%)' : 'linear-gradient(145deg,#1f1200 0%,#120900 100%)', glow: '#ff8c0066' },
            '1D': { base: isAct ? 'linear-gradient(145deg,#1e6ab0 0%,#0c2f5a 100%)' : 'linear-gradient(145deg,#090f1a 0%,#050810 100%)', glow: '#1e6ab066' },
            '1W': { base: isAct ? 'linear-gradient(145deg,#0d7a4e 0%,#05351f 100%)' : 'linear-gradient(145deg,#050f09 0%,#030906 100%)', glow: '#0d7a4e66' },
          };
          const tc = TF_COLORS[tf];
          const sigType = r?.activeSignals[0]?.type;
          const sigColor = sigType === 'BUY' ? '#00ff88' : sigType === 'SELL' ? '#ff3333' : '#fff';
          return (
            <button key={tf} onClick={() => setActiveTF(tf)}
              style={{
                flex: 1, border: `1px solid ${isAct ? tc.glow : 'rgba(255,255,255,0.08)'}`,
                borderRadius: '8px', cursor: 'pointer', padding: '10px 8px',
                background: tc.base,
                boxShadow: isAct ? `0 4px 16px ${tc.glow}, inset 0 1px 0 rgba(255,255,255,0.18)` : 'inset 0 1px 0 rgba(255,255,255,0.05)',
                transition: 'all 0.15s ease',
              }}>
              <div style={{ color: '#fff', fontSize: '14px', fontWeight: 900, letterSpacing: '1px' }}>{TF_CONFIG[tf].label}</div>
              <div style={{ color: isAct ? sigColor : '#fff', fontSize: '12px', marginTop: '3px', fontWeight: 600 }}>
                {r ? `${r.patterns.length} patterns ≥55%` : 'no data'}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Historical chart — shaded from actual backtest of ≥60% patterns ── */}
      {tfResult
        ? <PriceChart bars={tfResult.sortedBars} perBarBias={tfResult.perBarBias} tf={activeTF} />
        : <div style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff8c00', fontSize: '16px', fontWeight: 700 }}>No {activeTF} data</div>
      }

      {/* ── Active signals (firing on current/last bar) ─────────────────── */}
      {tfResult && tfResult.activeSignals.length > 0 && (
        <div style={{ padding: '12px 18px', borderTop: '1px solid #111' }}>
          <div style={{ color: '#ff8c00', fontSize: '13px', fontWeight: 800, letterSpacing: '2px', marginBottom: '8px' }}>
            {TF_CONFIG[activeTF].label} — ACTIVE SIGNALS NOW
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {tfResult.activeSignals.map((sig, i) => {
              const sc = sig.type === 'BUY' ? '#00ff88' : '#ff3333';
              const cfg = TF_CONFIG[activeTF];
              return (
                <div style={{ background: 'linear-gradient(135deg, #111114 0%, #0a0a0c 100%)', border: `1px solid ${sc}44`, borderLeft: `3px solid ${sc}`, borderRadius: '6px', padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span style={{ background: sc, color: '#000', fontSize: '13px', fontWeight: 900, padding: '2px 7px', borderRadius: '2px' }}>{sig.type}</span>
                      <span style={{ color: '#fff', fontSize: '14px', fontWeight: 700 }}>{sig.label}</span>
                    </div>
                    <span style={{ color: '#fff', fontSize: '13px', fontWeight: 600 }}>{sig.n} hits</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px' }}>
                    {([
                      [cfg.l1, sig.fwdAvg1, sig.w1],
                      [cfg.l2, sig.fwdAvg2, sig.w2],
                      [cfg.l3, sig.fwdAvg3, sig.w3],
                    ] as [string, number, number][]).map(([lbl, avg, win]) => (
                      <div key={lbl} style={{ background: 'linear-gradient(145deg, #111116 0%, #07070a 100%)', padding: '8px 6px', borderRadius: '5px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.07)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }}>
                        <div style={{ color: '#ff8c00', fontSize: '13px', marginBottom: '2px', fontWeight: 700 }}>{lbl}</div>
                        <div style={{ color: avg >= 0 ? '#00ff88' : '#ff3333', fontSize: '16px', fontWeight: 900 }}>{avg >= 0 ? '+' : ''}{avg.toFixed(2)}%</div>
                        <div style={{ color: win >= 55 ? '#00ff88' : '#ff3333', fontSize: '13px' }}>{win.toFixed(0)}% win</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Projection charts (one per qualifying pattern) ─────────────── */}
      {tfResult && tfResult.patterns.length > 0 && (
        <div style={{ borderTop: '1px solid #111' }}>
          <button onClick={() => setShowProj(v => !v)}
            style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '10px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#ff8c00', fontSize: '13px', fontWeight: 800, letterSpacing: '2px' }}>
              {TF_CONFIG[activeTF].label} PATTERN PROJECTIONS — {tfResult.patterns.length} EVENTS ≥55% HIT RATE
            </span>
            <span style={{ color: '#fff', fontSize: '13px' }}>{showProj ? '▲ HIDE' : '▼ EXPAND'}</span>
          </button>
          {showProj && (
            <div style={{ padding: '0 18px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
              {tfResult.patterns.map(p => (
                <ProjectionChart key={`${activeTF}-${p.label}`} pattern={p} tf={activeTF} />
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────
export default function ResearchPanel() {
  return (
    <div style={{ background: '#000', minHeight: '100vh', color: '#fff', fontFamily: "'JetBrains Mono', monospace", padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '10px' }}>
        <div style={{ color: '#00ff88', fontSize: '13px', letterSpacing: '4px', fontWeight: 900 }}>◈ MTF PRICE ACTION RESEARCH</div>
        <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg,#1a1a1a,transparent)' }} />
        <div style={{ color: '#fff', fontSize: '14px' }}>1H · 1D · 1W · POLYGON · ≥55% WIN RATE ONLY</div>
      </div>
      <div style={{ color: '#fff', fontSize: '14px', marginBottom: '24px', lineHeight: 1.7 }}>
        Each stock scanned independently on real Polygon 1H / 1D / 1W bars.
        Patterns measured at +1 bar, +7 bars, +30 bars per TF.
        Only patterns with ≥55% win rate shown. Chart green/red shading = historical backtest of those patterns.
        Click &quot;PATTERN PROJECTIONS&quot; to see the average composite path per event.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(600px, 1fr))', gap: '24px' }}>
        {TICKERS.map(t => <TickerCard key={t} ticker={t} />)}
      </div>
    </div>
  );
}
