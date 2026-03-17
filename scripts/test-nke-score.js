// ─────────────────────────────────────────────────────────────────
// NKE LIVE SCORING TEST — runs the full v3 institutional model
// against real Polygon data and prints a detailed factor breakdown
// ─────────────────────────────────────────────────────────────────

const https = require('https');

const POLYGON_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
const SYMBOL = 'NKE';
const TREND = 'bullish';  // test as bullish candidate

// ── helpers (mirrors worker exactly) ─────────────────────────────

function mean(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr) {
    if (arr.length < 2) return 0;
    const m = mean(arr);
    return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

function ema(vals, period) {
    if (vals.length < period) return null;
    const k = 2 / (period + 1);
    let e = mean(vals.slice(0, period));
    for (let i = period; i < vals.length; i++) e = vals[i] * k + e * (1 - k);
    return e;
}

function linReg(y) {
    const n = y.length;
    if (n < 3) return { slope: 0, r2: 0 };
    let sx = 0, sy = 0, sxy = 0, sx2 = 0;
    for (let i = 0; i < n; i++) { sx += i; sy += y[i]; sxy += i * y[i]; sx2 += i * i; }
    const d = n * sx2 - sx * sx;
    if (d === 0) return { slope: 0, r2: 0 };
    const slope = (n * sxy - sx * sy) / d;
    const ic = (sy - slope * sx) / n;
    const ym = sy / n;
    let st = 0, sr = 0;
    for (let i = 0; i < n; i++) { st += (y[i] - ym) ** 2; sr += (y[i] - (slope * i + ic)) ** 2; }
    return { slope, r2: st > 0 ? Math.max(0, 1 - sr / st) : 0 };
}

function atr14(highs, lows, closes) {
    const trs = [];
    for (let i = 1; i < closes.length; i++)
        trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
    const sl = trs.slice(-14);
    return sl.reduce((a, b) => a + b, 0) / sl.length;
}

function logRet(closes) {
    const r = [];
    for (let i = 1; i < closes.length; i++) if (closes[i - 1] > 0) r.push(Math.log(closes[i] / closes[i - 1]));
    return r;
}

// ── fetch from Polygon ────────────────────────────────────────────

function fetchPolygon(symbol) {
    const end = new Date();
    const start = new Date(end.getTime() - 300 * 24 * 60 * 60 * 1000); // 300 days back
    const s = start.toISOString().split('T')[0];
    const e = end.toISOString().split('T')[0];
    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${s}/${e}?adjusted=true&sort=asc&limit=300&apiKey=${POLYGON_KEY}`;

    return new Promise((resolve, reject) => {
        https.get(url, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (!json.results || json.results.length === 0) return reject(new Error('No data: ' + JSON.stringify(json)));
                    resolve(json.results.map(b => ({
                        timestamp: b.t,
                        open: b.o,
                        high: b.h,
                        low: b.l,
                        close: b.c,
                        volume: b.v,
                    })));
                } catch (err) { reject(err); }
            });
        }).on('error', reject);
    });
}

// ── scoring ───────────────────────────────────────────────────────

function score(prices, trend) {
    const bull = trend === 'bullish';
    const closes = prices.map(p => p.close);
    const highs = prices.map(p => p.high);
    const lows = prices.map(p => p.low);
    const vols = prices.map(p => p.volume || 0);
    const n = closes.length;
    const cur = closes[n - 1];
    const atr = atr14(highs, lows, closes);

    let total = 0;
    const det = {};

    // ── FACTOR 1: TREND QUALITY (0-25) ───────────────────────────────
    // 1a. R² on log(price) last 20 bars
    const logP = closes.slice(-20).map(v => Math.log(v));
    const reg = linReg(logP);
    const sok = bull ? reg.slope > 0 : reg.slope < 0;
    let r2sc = reg.r2 >= 0.90 ? 12 : reg.r2 >= 0.78 ? 9 : reg.r2 >= 0.60 ? 5 : reg.r2 >= 0.45 ? 2 : 0;
    if (!sok) r2sc = Math.floor(r2sc * 0.2);
    det.r2 = +reg.r2.toFixed(4);
    det.slopeOk = sok;
    det.r2Score = r2sc;
    total += r2sc;

    // 1b. EMA 8/21/50 alignment
    const e8 = ema(closes, 8);
    const e21 = ema(closes, 21);
    const e50 = n >= 50 ? ema(closes, 50) : null;
    let masc = 0;
    if (e8 && e21) {
        const a8_21 = bull ? e8 > e21 : e8 < e21;
        const pxOk = bull ? cur > e8 : cur < e8;
        if (a8_21 && pxOk) masc += 4; else if (a8_21 || pxOk) masc += 2;
        if (e50 !== null) { if (bull ? e21 > e50 : e21 < e50) masc += 4; }
        else masc += 2;
    }
    det.ema8 = +e8.toFixed(2);
    det.ema21 = +e21.toFixed(2);
    det.ema50 = e50 ? +e50.toFixed(2) : null;
    det.maScore = masc;
    total += masc;

    // 1c. Max intra-trend counter-move last 20 bars
    const base20 = closes.slice(-20);
    let maxCtr = 0;
    if (bull) {
        let pk = base20[0];
        for (let i = 1; i < base20.length; i++) {
            if (base20[i] > pk) pk = base20[i];
            else { const dd = (pk - base20[i]) / pk; if (dd > maxCtr) maxCtr = dd; }
        }
    } else {
        let tr = base20[0];
        for (let i = 1; i < base20.length; i++) {
            if (base20[i] < tr) tr = base20[i];
            else { const rl = (base20[i] - tr) / Math.max(tr, 1e-8); if (rl > maxCtr) maxCtr = rl; }
        }
    }
    const ddsc = maxCtr < 0.03 ? 5 : maxCtr < 0.06 ? 3 : maxCtr < 0.12 ? 1 : 0;
    det.maxCounterMove = +(maxCtr * 100).toFixed(2) + '%';
    det.ddScore = ddsc;
    total += ddsc;

    // ── FACTOR 2: INSTITUTIONAL FLOW (0-25) ──────────────────────────
    const hasVol = vols.some(v => v > 0);
    let flowTotal = 0;

    if (hasVol) {
        const nzV = vols.slice(-20).filter(v => v > 0);
        const avgV = mean(nzV);

        // 2a. VSA close-position pressure
        let buyP = 0, sellP = 0;
        const vsaN = Math.min(20, n - 1);
        for (let i = n - vsaN; i < n; i++) {
            const br = highs[i] - lows[i];
            if (br <= 0) continue;
            const cp = (closes[i] - lows[i]) / br;
            const rv = vols[i] / avgV;
            if (cp >= 0.60) buyP += rv;
            if (cp <= 0.40) sellP += rv;
        }
        const totP = buyP + sellP || 1;
        const vsaR = bull ? buyP / totP : sellP / totP;
        const vsasc = vsaR >= 0.72 ? 10 : vsaR >= 0.62 ? 7 : vsaR >= 0.52 ? 4 : vsaR >= 0.42 ? 1 : 0;
        det.vsaRatio = +vsaR.toFixed(3);
        det.vsaScore = vsasc;
        flowTotal += vsasc;

        // 2b. Wyckoff No-Supply — low-volume pullbacks
        let pbs = 0, lowVpb = 0;
        for (let i = n - 10; i < n; i++) {
            const against = bull ? closes[i] < closes[Math.max(0, i - 1)] : closes[i] > closes[Math.max(0, i - 1)];
            if (against) { pbs++; if (vols[i] < avgV * 0.75) lowVpb++; }
        }
        let pbsc;
        if (pbs === 0) { pbsc = 5; det.pullbackNote = 'No pullbacks (straight run)'; }
        else { const r = lowVpb / pbs; pbsc = r >= 0.80 ? 8 : r >= 0.60 ? 5 : r >= 0.40 ? 2 : 0; det.pullbackQuality = +(r * 100).toFixed(0) + '% low-vol'; }
        det.pbScore = pbsc;
        flowTotal += pbsc;

        // 2c. OBV regression
        let obv = 0; const obvA = [];
        for (let i = 1; i < n; i++) {
            const v = vols[i] || 0;
            if (closes[i] > closes[i - 1]) obv += v; else if (closes[i] < closes[i - 1]) obv -= v;
            obvA.push(obv);
        }
        let obvsc = 0;
        if (obvA.length >= 10) {
            const oReg = linReg(obvA.slice(-20));
            const oOk = bull ? oReg.slope > 0 : oReg.slope < 0;
            obvsc = (oReg.r2 >= 0.80 && oOk) ? 7 : (oReg.r2 >= 0.60 && oOk) ? 5 : (oReg.r2 >= 0.35 && oOk) ? 3 : oOk ? 1 : 0;
            det.obvR2 = +oReg.r2.toFixed(3);
            det.obvSlope = oOk ? 'aligned' : 'DIVERGING';
        }
        det.obvScore = obvsc;
        flowTotal += obvsc;
    } else {
        flowTotal = 10;
    }
    det.flowTotal = flowTotal;
    total += flowTotal;

    // ── FACTOR 3: RISK-ADJUSTED ALPHA (0-20, solo stock so rank = N/A) ──
    // For standalone test: compute stock's own Sharpe vs a neutral baseline
    const ret20 = (closes[n - 1] - closes[n - 21]) / closes[n - 21];
    const lR20 = logRet(closes.slice(-21));
    const rvol = stdDev(lR20);
    const sharpe = rvol > 0 ? ret20 / (rvol * Math.sqrt(20)) : 0;
    const ret5f = (closes[n - 1] - closes[n - 6]) / closes[n - 6];
    const lR5 = logRet(closes.slice(-6));
    const rvol5 = stdDev(lR5);
    const sh5 = rvol5 > 0 ? ret5f / (rvol5 * Math.sqrt(5)) : 0;

    // Solo rank is approximated: Sharpe > 1 = strong, > 0.5 = good, > 0 = ok
    const approxRank = sharpe > 2 ? 0.90 : sharpe > 1.5 ? 0.80 : sharpe > 1 ? 0.70 : sharpe > 0.5 ? 0.55 : sharpe > 0 ? 0.40 : 0.20;
    const baseAlpha = approxRank >= 0.85 ? 10 : approxRank >= 0.70 ? 8 : approxRank >= 0.50 ? 5 : approxRank >= 0.30 ? 2 : 0;
    const freshApprox = sh5 > 2 ? 0.90 : sh5 > 1 ? 0.70 : sh5 > 0.3 ? 0.50 : sh5 > 0 ? 0.35 : 0.20;
    const rankDelta = freshApprox - approxRank;
    let freshBonus;
    if (rankDelta >= 0.30 && freshApprox >= 0.70) freshBonus = 8;
    else if (rankDelta >= 0.20 && freshApprox >= 0.55) freshBonus = 5;
    else if (rankDelta >= 0.10) freshBonus = 2;
    else if (rankDelta <= -0.25) freshBonus = -3;
    else if (rankDelta <= -0.15) freshBonus = -1;
    else freshBonus = 0;
    // Old move penalty
    const retOld = closes.length >= 42 ? (closes[n - 21] - closes[n - 42]) / Math.max(closes[n - 42], 1e-8) : 0;
    const oldMove = bull ? retOld : -retOld;
    const extP = oldMove >= 0.80 ? -4 : oldMove >= 0.50 ? -2 : oldMove >= 0.30 ? -1 : 0;
    const alphasc = Math.max(0, baseAlpha + freshBonus + extP);

    det.sharpe20 = +sharpe.toFixed(2);
    det.sharpe5 = +sh5.toFixed(2);
    det.ret20pct = +(ret20 * 100).toFixed(2) + '%';
    det.ret5pct = +(ret5f * 100).toFixed(2) + '%';
    det.retOldPct = +(retOld * 100).toFixed(2) + '%';
    det.freshBonus = freshBonus;
    det.extPenalty = extP;
    det.alphaScore = alphasc;
    total += alphasc;
    det.alphaNote = '(Solo test — approx rank; real score uses cross-sectional ranking vs peers)';

    // ── FACTOR 4: INDUSTRY LEADERSHIP (0-20, solo = partial) ─────────
    // Solo stock has no sector peers — award neutral 5
    det.sectorNote = 'Solo test — no peers. Neutral 5/20 awarded.';
    const cohsc = 5;
    det.cohesionTotal = cohsc;
    total += cohsc;

    // ── FACTOR 5: STRUCTURAL CATALYSTS (0-20) ────────────────────────
    // 5a. EMA spread
    let spsc = 0;
    if (e8 && e21 && atr > 0) { const ed = (e8 - e21) / atr, edd = bull ? ed : -ed; spsc = edd > 1.0 ? 3 : edd > 0.5 ? 2 : edd > 0.0 ? 1 : 0; }
    det.emaSpreadATR = e8 && e21 && atr > 0 ? +((e8 - e21) / atr).toFixed(3) : null;
    det.emaSpread = spsc;
    total += spsc;

    // 5b. Compression
    const h5p = highs.slice(-5), l5p = lows.slice(-5);
    const h10p = highs.slice(-15, -5), l10p = lows.slice(-15, -5);
    const r5 = Math.max(...h5p) - Math.min(...l5p), r10 = Math.max(...h10p) - Math.min(...l10p);
    const comp = r10 > 0 ? r5 / r10 : 1;
    const cpsc = comp < 0.55 ? 2 : comp < 0.75 ? 1 : 0;
    det.compressionRatio = +comp.toFixed(3);
    det.compression = cpsc;
    total += cpsc;

    // 5c. 52-week high/low proximity
    const allH = Math.max(...highs), allL = Math.min(...lows), hiRange = allH - allL;
    let wkHighSc = 0;
    if (hiRange > 0) {
        if (bull) {
            const pct = (allH - cur) / hiRange;
            wkHighSc = pct <= 0.01 ? 7 : pct <= 0.05 ? 5 : pct <= 0.10 ? 3 : pct <= 0.20 ? 1 : 0;
            det['52wkHigh'] = +allH.toFixed(2);
            det['pctFrom52wkH'] = +(pct * 100).toFixed(2) + '%';
        } else {
            const pct = (cur - allL) / hiRange;
            wkHighSc = pct <= 0.01 ? 7 : pct <= 0.05 ? 5 : pct <= 0.10 ? 3 : pct <= 0.20 ? 1 : 0;
            det['52wkLow'] = +allL.toFixed(2);
            det['pctFrom52wkL'] = +(pct * 100).toFixed(2) + '%';
        }
    }
    det.wk52score = wkHighSc;
    total += wkHighSc;

    // 5d. Prior trend break
    let trendBreakSc = 0;
    if (n >= 40) {
        const priorH = Math.max(...highs.slice(-40, -20)), priorL = Math.min(...lows.slice(-40, -20));
        const midH = Math.max(...highs.slice(-20, -5)), midL = Math.min(...lows.slice(-20, -5));
        if (bull) {
            const wasDown = priorH > midH * 1.02;
            const broke = cur > midH;
            trendBreakSc = (wasDown && broke) ? 5 : wasDown ? 2 : 0;
            det.priorTrend = wasDown ? 'DOWNTREND (lower highs confirmed)' : 'Uptrend/flat — no reversal bonus';
            det.brokeAbove = broke ? 'YES — price above mid-block high' : 'NO — not yet broken';
        } else {
            const wasUp = priorL < midL * 0.98;
            const broke2 = cur < midL;
            trendBreakSc = (wasUp && broke2) ? 5 : wasUp ? 2 : 0;
            det.priorTrend = wasUp ? 'UPTREND (higher lows confirmed)' : 'Downtrend/flat';
            det.brokeBelow = broke2 ? 'YES' : 'NO';
        }
    }
    det.trendBreakScore = trendBreakSc;
    total += trendBreakSc;

    // 5e. RS acceleration (solo approx)
    let rsAccSc = 0;
    const delta = freshApprox - approxRank;
    if (delta >= 0.35 && freshApprox >= 0.65) rsAccSc = 3;
    else if (delta >= 0.20 && freshApprox >= 0.50) rsAccSc = 2;
    else if (delta >= 0.10) rsAccSc = 1;
    det.rsAccelScore = rsAccSc;
    total += rsAccSc;

    const fs = Math.min(100, Math.max(0, Math.round(total)));
    const grade = fs >= 90 ? 'SS+' : fs >= 80 ? 'SS' : fs >= 70 ? 'S' : fs >= 60 ? 'A' : fs >= 50 ? 'B' : fs >= 35 ? 'C' : 'D';

    return {
        score: fs, grade,
        factors: {
            trendQuality: r2sc + masc + ddsc,
            institutionalFlow: flowTotal,
            riskAdjAlpha: alphasc,
            industryLeadership: cohsc,
            catalysts: spsc + cpsc + wkHighSc + trendBreakSc + rsAccSc
        },
        details: det
    };
}

// ── run ───────────────────────────────────────────────────────────

(async () => {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  NKE — INSTITUTIONAL CONVICTION SCORE (v3)`);
    console.log(`  Trend tested: ${TREND.toUpperCase()}`);
    console.log(`${'═'.repeat(60)}\n`);

    let prices;
    try {
        process.stdout.write('  Fetching Polygon daily data...');
        prices = await fetchPolygon(SYMBOL);
        console.log(` ${prices.length} bars fetched (${new Date(prices[0].timestamp).toISOString().slice(0, 10)} → ${new Date(prices[prices.length - 1].timestamp).toISOString().slice(0, 10)})\n`);
    } catch (err) {
        console.error('\n  ERROR fetching data:', err.message);
        process.exit(1);
    }

    const result = score(prices, TREND);

    // ── Print results ─────────────────────────────────────────────
    const bar = (score, max) => {
        const filled = Math.round((score / max) * 20);
        return '█'.repeat(filled) + '░'.repeat(20 - filled) + ` ${score}/${max}`;
    };

    console.log(`  FINAL SCORE:  ${result.score} / 100  [${result.grade}]`);
    console.log(`  WOULD SHOW?   ${result.score >= 70 ? '✅ YES (≥70)' : '❌ NO — filtered out (<70)'}\n`);
    console.log(`  FACTOR BREAKDOWN`);
    console.log(`  ${'─'.repeat(50)}`);
    console.log(`  Trend Quality       ${bar(result.factors.trendQuality, 25)}`);
    console.log(`  Institutional Flow  ${bar(result.factors.institutionalFlow, 25)}`);
    console.log(`  Risk-Adj Alpha      ${bar(result.factors.riskAdjAlpha, 20)}`);
    console.log(`  Industry Leadership ${bar(result.factors.industryLeadership, 20)}`);
    console.log(`  Catalysts           ${bar(result.factors.catalysts, 20)}\n`);

    const d = result.details;
    console.log(`  FACTOR 1 — TREND QUALITY (${result.factors.trendQuality}/25)`);
    console.log(`    R² on log-price (20 bars): ${d.r2}  → ${d.r2Score}/12  slope: ${d.slopeOk ? '✅ aligned' : '❌ wrong direction'}`);
    console.log(`    EMA 8: ${d.ema8}  EMA 21: ${d.ema21}  EMA 50: ${d.ema50 ?? 'N/A'}  → ${d.maScore}/8`);
    console.log(`    Max counter-move last 20 bars: ${d.maxCounterMove}  → ${d.ddScore}/5\n`);

    console.log(`  FACTOR 2 — INSTITUTIONAL FLOW (${result.factors.institutionalFlow}/25)`);
    console.log(`    VSA close-pressure ratio: ${d.vsaRatio}  → ${d.vsaScore}/10`);
    if (d.pullbackQuality) console.log(`    Wyckoff low-vol pullbacks: ${d.pullbackQuality}  → ${d.pbScore}/8`);
    else console.log(`    Wyckoff: ${d.pullbackNote}  → ${d.pbScore}/8`);
    console.log(`    OBV R²: ${d.obvR2}  direction: ${d.obvSlope}  → ${d.obvScore}/7\n`);

    console.log(`  FACTOR 3 — RISK-ADJUSTED ALPHA (${result.factors.riskAdjAlpha}/20)  ${d.alphaNote}`);
    console.log(`    20-bar Sharpe: ${d.sharpe20}   5-bar Sharpe: ${d.sharpe5}`);
    console.log(`    20-bar return: ${d.ret20pct}   5-bar return: ${d.ret5pct}   prior-window: ${d.retOldPct}`);
    console.log(`    Fresh bonus: ${d.freshBonus >= 0 ? '+' : ''}${d.freshBonus}   Extension penalty: ${d.extPenalty}   Final: ${d.alphaScore}/20\n`);

    console.log(`  FACTOR 4 — INDUSTRY LEADERSHIP (${result.factors.industryLeadership}/20)`);
    console.log(`    ${d.sectorNote}\n`);

    console.log(`  FACTOR 5 — STRUCTURAL CATALYSTS (${result.factors.catalysts}/20)`);
    console.log(`    EMA spread (ATR units): ${d.emaSpreadATR}  → ${d.emaSpread}/3`);
    console.log(`    Compression ratio: ${d.compressionRatio}  → ${d.compression}/2`);
    if (d['52wkHigh']) {
        console.log(`    52-wk high: $${d['52wkHigh']}   distance: ${d['pctFrom52wkH']}  → ${d.wk52score}/7`);
    } else {
        console.log(`    52-wk low: $${d['52wkLow']}   distance: ${d['pctFrom52wkL']}  → ${d.wk52score}/7`);
    }
    console.log(`    Prior trend: ${d.priorTrend}`);
    console.log(`    Broke above: ${d.brokeAbove || d.brokeBelow || 'N/A'}  → ${d.trendBreakScore}/5`);
    console.log(`    RS acceleration: → ${d.rsAccelScore}/3\n`);

    console.log(`${'═'.repeat(60)}\n`);
})();
