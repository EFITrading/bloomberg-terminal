// ===================================================================
// GOLDMAN SACHS-STYLE UNIFIED CONVICTION SCORER  v2
// ===================================================================
// 5-factor institutional model — 0-100 score:
//
//   1. TREND CONVICTION      (0-25): Structure + persistence + ROC
//   2. VOLUME CONFIRMATION   (0-25): Accumulation/distribution + OBV + surge
//   3. INDUSTRY COHESION     (0-20): Sector breadth + peer relative strength
//   4. ENTRY PRECISION       (0-18): ATR location + range zone + candle quality
//   5. STRUCTURAL INTEGRITY  (0-12): Level confluence + compression + acceleration
//
// Grades: SS+(90-100) · SS(80-89) · S(70-79) · A(60-69) · B(50-59) · C(35-49) · D(<35)
// ===================================================================

// ─── Math helpers ──────────────────────────────────────────────────

function calcMean(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce(function (a, b) { return a + b; }, 0) / arr.length;
}

function calcATR(highs, lows, closes, period) {
    period = period || 14;
    if (closes.length < period + 1) return null;
    var trs = [];
    for (var i = 1; i < closes.length; i++) {
        trs.push(Math.max(
            highs[i] - lows[i],
            Math.abs(highs[i] - closes[i - 1]),
            Math.abs(lows[i] - closes[i - 1])
        ));
    }
    return calcMean(trs.slice(-period));
}

function findSwings(highs, lows, lookback) {
    lookback = lookback || 5;
    var swingHighs = [], swingLows = [];
    for (var i = lookback; i < highs.length - lookback; i++) {
        var isHigh = true, isLow = true;
        for (var j = i - lookback; j <= i + lookback; j++) {
            if (j !== i) {
                if (highs[j] >= highs[i]) isHigh = false;
                if (lows[j] <= lows[i]) isLow = false;
            }
        }
        if (isHigh) swingHighs.push({ index: i, price: highs[i] });
        if (isLow) swingLows.push({ index: i, price: lows[i] });
    }
    return { swingHighs: swingHighs, swingLows: swingLows };
}

// Cluster swings by ATR-relative proximity (fixes the broken % bucket bug)
function clusterLevels(swings, atr) {
    if (!swings || !swings.length || !atr) return [];
    var used = new Array(swings.length).fill(false);
    var clusters = [];
    for (var i = 0; i < swings.length; i++) {
        if (used[i]) continue;
        var cluster = [swings[i]];
        used[i] = true;
        for (var j = i + 1; j < swings.length; j++) {
            if (!used[j] && Math.abs(swings[j].price - swings[i].price) <= atr) {
                cluster.push(swings[j]);
                used[j] = true;
            }
        }
        clusters.push({
            price: calcMean(cluster.map(function (s) { return s.price; })),
            tests: cluster.length,
            lastIndex: Math.max.apply(null, cluster.map(function (s) { return s.index; }))
        });
    }
    return clusters.sort(function (a, b) { return b.tests - a.tests; });
}

// ─── Scoring entry point ───────────────────────────────────────────

self.onmessage = async function (e) {
    var data = e.data;
    var candidates = data.candidates;
    var pricesMap = data.pricesMap;
    var allCandidates = data.allCandidates || candidates; // full list for cohesion

    if (!candidates || !Array.isArray(candidates)) {
        self.postMessage({ success: false, error: 'Invalid candidates array' });
        return;
    }
    if (!pricesMap || typeof pricesMap !== 'object') {
        self.postMessage({ success: false, error: 'Invalid pricesMap object' });
        return;
    }

    try {
        // Pre-build industry maps from ALL candidates for cohesion scoring
        // industryMap[industrySymbol] = { total, aligned } counts
        var industryMap = {};
        for (var ci = 0; ci < allCandidates.length; ci++) {
            var c = allCandidates[ci];
            if (!c || !c.industrySymbol) continue;
            var key = c.industrySymbol;
            if (!industryMap[key]) {
                industryMap[key] = { total: 0, bullish: 0, bearish: 0, relPerfs: [] };
            }
            industryMap[key].total++;
            if (c.trend === 'bullish') industryMap[key].bullish++;
            else industryMap[key].bearish++;
            if (typeof c.relativePerformance === 'number') {
                industryMap[key].relPerfs.push({ symbol: c.symbol, perf: c.relativePerformance });
            }
        }

        var scoringPromises = candidates.map(async function (candidate) {
            if (!candidate || !candidate.symbol || !candidate.trend) {
                return Object.assign({}, candidate, { score: 0, grade: 'D', details: { error: 'Invalid candidate' } });
            }

            var prices = pricesMap[candidate.symbol];
            if (!prices || !Array.isArray(prices) || prices.length < 20) {
                return Object.assign({}, candidate, { score: 0, grade: 'D', details: { error: 'Insufficient data' } });
            }

            var closes = [];
            var highs = [];
            var lows = [];
            var volumes = [];

            for (var pi = 0; pi < prices.length; pi++) {
                var p = prices[pi];
                var c_val = typeof p === 'object' ? p.close : p;
                var h_val = typeof p === 'object' ? (p.high || p.close) : p;
                var l_val = typeof p === 'object' ? (p.low || p.close) : p;
                var v_val = typeof p === 'object' ? (p.volume || 0) : 0;
                if (c_val > 0) closes.push(c_val);
                if (h_val > 0) highs.push(h_val);
                if (l_val > 0) lows.push(l_val);
                volumes.push(v_val);
            }

            if (closes.length < 20) {
                return Object.assign({}, candidate, { score: 0, grade: 'D', details: { error: 'No valid close data' } });
            }

            var n = closes.length;
            var curPrice = closes[n - 1];
            var isBullish = candidate.trend === 'bullish';
            var details = {};
            var total = 0;
            var atr = calcATR(highs, lows, closes, 14) || (curPrice * 0.015);
            var swings = findSwings(highs, lows, 5);
            var swingHighs = swings.swingHighs;
            var swingLows = swings.swingLows;

            // ==========================================================
            // FACTOR 1 — TREND CONVICTION (0-25)
            // ==========================================================

            // 1a. Swing structure — HH/HL for bulls, LL/LH for bears (0-10)
            var swingScore = 0;
            var rH = swingHighs.slice(-3);
            var rL = swingLows.slice(-3);
            if (rH.length >= 2 && rL.length >= 2) {
                var lastH = rH[rH.length - 1].price;
                var prevH = rH[rH.length - 2].price;
                var lastL = rL[rL.length - 1].price;
                var prevL = rL[rL.length - 2].price;
                var hiH = lastH > prevH;
                var hiL = lastL > prevL;
                var loH = lastH < prevH;
                var loL = lastL < prevL;
                if (isBullish) {
                    if (hiH && hiL) swingScore = 10;
                    else if (hiH || hiL) swingScore = 6;
                    else swingScore = 2;
                } else {
                    if (loH && loL) swingScore = 10;
                    else if (loH || loL) swingScore = 6;
                    else swingScore = 2;
                }
            }
            details.swingStructure = swingScore;
            total += swingScore;

            // 1b. Trend persistence: % of last 20 closes above/below 20-bar SMA (0-8)
            var last20 = closes.slice(-20);
            var mean20 = calcMean(last20);
            var onSide = last20.filter(function (v) { return isBullish ? v > mean20 : v < mean20; }).length;
            var persistPct = onSide / 20;
            var persistScore = persistPct > 0.75 ? 8 : persistPct > 0.60 ? 5 : persistPct > 0.45 ? 2 : 0;
            details.trendPersistence = persistScore;
            total += persistScore;

            // 1c. 10-bar ROC in trade direction (0-7)
            var roc10 = n >= 11 ? ((closes[n - 1] - closes[n - 11]) / closes[n - 11]) * 100 : 0;
            var dirROC = isBullish ? roc10 : -roc10;
            var rocScore = dirROC > 4 ? 7 : dirROC > 2 ? 5 : dirROC > 0.5 ? 3 : 0;
            details.roc10 = Math.round(roc10 * 100) / 100;
            details.rocScore = rocScore;
            total += rocScore;

            // ==========================================================
            // FACTOR 2 — VOLUME CONFIRMATION (0-25)
            // Key institutional signal: are large players accumulating?
            // ==========================================================

            var hasVolume = volumes.some(function (v) { return v > 0; });
            var volScore = 0;
            details.hasVolume = hasVolume;

            if (hasVolume) {
                // 2a. Volume trend: 5-bar avg vs 20-bar avg (0-7)
                // Healthy buying/selling when recent volume > 20-bar norm
                var vol20 = volumes.slice(-20);
                var vol5 = volumes.slice(-5);
                var avgVol20 = calcMean(vol20.filter(function (v) { return v > 0; }));
                var avgVol5 = calcMean(vol5.filter(function (v) { return v > 0; }));
                var volRatio = avgVol20 > 0 ? avgVol5 / avgVol20 : 1;
                var volTrendScore = volRatio > 1.5 ? 7 : volRatio > 1.2 ? 5 : volRatio > 0.9 ? 3 : 1;
                details.volRatio = Math.round(volRatio * 100) / 100;
                details.volTrendScore = volTrendScore;
                total += volTrendScore;
                volScore += volTrendScore;

                // 2b. Accumulation/Distribution: up-volume vs down-volume last 10 bars (0-10)
                // Goldman Sachs-style: price + volume must CONFIRM direction
                var adScore = 0;
                var upVol = 0, downVol = 0, neutralVol = 0;
                var lookback10 = Math.min(10, closes.length - 1);
                for (var vi = closes.length - lookback10; vi < closes.length; vi++) {
                    var barVol = volumes[vi] || 0;
                    var prevClose = closes[vi - 1] || closes[vi];
                    if (closes[vi] > prevClose) upVol += barVol;
                    else if (closes[vi] < prevClose) downVol += barVol;
                    else neutralVol += barVol;
                }
                var totalVol = upVol + downVol + neutralVol || 1;
                var adRatio = isBullish ? upVol / totalVol : downVol / totalVol;  // 0-1 scale

                // 0.6+ = clear institutional direction, 0.5 = balanced, <0.4 = divergence
                if (adRatio >= 0.65) adScore = 10; // Strong institutional flow
                else if (adRatio >= 0.55) adScore = 7;  // Decent accumulation
                else if (adRatio >= 0.45) adScore = 4;  // Neutral — give partial credit
                else if (adRatio >= 0.35) adScore = 1;  // Slight divergence
                // < 0.35 = clear divergence = 0

                details.adRatio = Math.round(adRatio * 100) / 100;
                details.adScore = adScore;
                total += adScore;
                volScore += adScore;

                // 2c. On-Balance Volume slope (0-8)
                // OBV rising with price = institutional confirmation
                var obv = 0;
                var obvSeries = [0];
                for (var oi = 1; oi < closes.length; oi++) {
                    var v = volumes[oi] || 0;
                    if (closes[oi] > closes[oi - 1]) obv += v;
                    else if (closes[oi] < closes[oi - 1]) obv -= v;
                    obvSeries.push(obv);
                }
                // OBV slope: compare last 5 vs prior 5
                var obvRecent = calcMean(obvSeries.slice(-5));
                var obvPrior = calcMean(obvSeries.slice(-10, -5));
                var obvSlope = obvPrior !== 0 ? ((obvRecent - obvPrior) / Math.abs(obvPrior)) : 0;
                var obvDirected = isBullish ? obvSlope : -obvSlope;
                var obvScore = obvDirected > 0.05 ? 8 : obvDirected > 0.01 ? 5 : obvDirected > -0.01 ? 2 : 0;
                details.obvSlope = Math.round(obvSlope * 1000) / 1000;
                details.obvScore = obvScore;
                total += obvScore;
                volScore += obvScore;
            } else {
                // No volume data — award neutral partial credit so stock is not unfairly penalized
                total += 8;
                volScore = 8;
            }
            details.volumeTotal = volScore;

            // ==========================================================
            // FACTOR 3 — INDUSTRY COHESION (0-20)
            // When all stocks in a sector move together = institutional rotation
            // ==========================================================

            var cohesionScore = 0;
            var indKey = candidate.industrySymbol;
            var indData = indKey ? industryMap[indKey] : null;

            if (indData && indData.total >= 2) {
                // 3a. Sector breadth: % of peers trending same direction (0-12)
                var aligned = isBullish ? indData.bullish : indData.bearish;
                var breadthPct = aligned / indData.total;

                var breadthScore;
                if (breadthPct >= 0.90) breadthScore = 12; // 90%+ peers aligned = institutional rotation
                else if (breadthPct >= 0.75) breadthScore = 9;  // Strong consensus
                else if (breadthPct >= 0.60) breadthScore = 6;  // Majority on-side
                else if (breadthPct >= 0.50) breadthScore = 3;  // Narrow majority
                else breadthScore = 0;  // Divergence = red flag

                details.industryBreadth = Math.round(breadthPct * 100);
                details.breadthScore = breadthScore;
                cohesionScore += breadthScore;

                // 3b. Relative performance rank within industry (0-8)
                // Top quartile stock in its industry = institutional selection signal
                var relPerfs = indData.relPerfs;
                if (relPerfs.length >= 2 && typeof candidate.relativePerformance === 'number') {
                    var sorted = relPerfs.slice().sort(function (a, b) {
                        return isBullish ? b.perf - a.perf : a.perf - b.perf;
                    });
                    var rank = sorted.findIndex(function (r) { return r.symbol === candidate.symbol; });
                    if (rank === -1) rank = sorted.length; // not found = last
                    var pctRank = (sorted.length - 1) > 0 ? 1 - (rank / (sorted.length - 1)) : 1;
                    var rankScore = pctRank >= 0.75 ? 8 : pctRank >= 0.50 ? 5 : pctRank >= 0.25 ? 2 : 0;
                    details.industryRank = rank + 1;
                    details.rankScore = rankScore;
                    cohesionScore += rankScore;
                } else {
                    // Can't rank, give neutral
                    cohesionScore += 3;
                }
            } else if (indData && indData.total === 1) {
                // Only one stock in industry — no cohesion signal, award partial
                cohesionScore = 5;
                details.industryBreadth = 100;
                details.breadthScore = 5;
            } else {
                cohesionScore = 5;
            }
            details.cohesionTotal = cohesionScore;
            total += cohesionScore;

            // ==========================================================
            // FACTOR 4 — ENTRY PRECISION (0-18)
            // How well timed is the entry relative to structure?
            // ==========================================================

            // 4a. ATR-normalized distance from 20-bar mean (0-8)
            var distFromMean = Math.abs(curPrice - mean20);
            var atrDist = distFromMean / atr;
            var atrScore = atrDist <= 0.3 ? 6 : atrDist <= 1.2 ? 8 : atrDist <= 2.0 ? 3 : 0;
            details.atrDist = Math.round(atrDist * 100) / 100;
            details.atrScore = atrScore;
            total += atrScore;

            // 4b. Position in 30-bar impulse range (0-7)
            var last30Closes = closes.slice(-30);
            var rangeHigh = Math.max.apply(null, last30Closes);
            var rangeLow = Math.min.apply(null, last30Closes);
            var rangeSpan = rangeHigh - rangeLow;
            var rangeScore = 0;
            if (rangeSpan > 0) {
                var pctFromHigh = (rangeHigh - curPrice) / rangeSpan;
                var pctFromLow = (curPrice - rangeLow) / rangeSpan;
                if (isBullish) {
                    // Sweet spot: 20-45% from high (healthy pullback)
                    if (pctFromHigh >= 0.20 && pctFromHigh <= 0.45) rangeScore = 7;
                    else if (pctFromHigh < 0.20) rangeScore = 5; // Near breakout
                    else if (pctFromHigh > 0.45 && pctFromHigh <= 0.65) rangeScore = 3;
                } else {
                    // Bear sweet spot: 0-25% from low (near breakdown)
                    if (pctFromLow >= 0.0 && pctFromLow <= 0.25) rangeScore = 7;
                    else if (pctFromLow > 0.25 && pctFromLow <= 0.45) rangeScore = 5;
                    else if (pctFromLow > 0.45 && pctFromLow <= 0.65) rangeScore = 3;
                }
            }
            details.rangeScore = rangeScore;
            total += rangeScore;

            // 4c. Candle quality: auction theory close position (0-3)
            var latestBar = prices[prices.length - 1];
            var candleScore = 0;
            if (typeof latestBar === 'object' && latestBar.high && latestBar.low && latestBar.close) {
                var cRange = latestBar.high - latestBar.low;
                if (cRange > 0) {
                    var closePos = (latestBar.close - latestBar.low) / cRange;
                    var uwRatio = (latestBar.high - latestBar.close) / cRange;
                    var lwRatio = (latestBar.close - latestBar.low) / cRange;

                    // False breakout: long wick against trade direction
                    var last5H = highs.slice(-5);
                    var last5L = lows.slice(-5);
                    var prior10H = highs.slice(-15, -5);
                    var prior10L = lows.slice(-15, -5);
                    var last5TR = (Math.max.apply(null, last5H) - Math.min.apply(null, last5L)) / 5;
                    var prior10TR = (Math.max.apply(null, prior10H) - Math.min.apply(null, prior10L)) / 10;
                    var isExpanding = last5TR > prior10TR * 1.1;
                    var falseBreak = isBullish ? (uwRatio > 0.55 && isExpanding) : (lwRatio > 0.55 && isExpanding);

                    if (!falseBreak) {
                        var goodClose = isBullish ? closePos >= 0.65 : closePos <= 0.35;
                        candleScore = goodClose ? 3 : 1;
                    }
                    details.falseBreakout = falseBreak;
                }
            }
            details.candleScore = candleScore;
            total += candleScore;

            // ==========================================================
            // FACTOR 5 — STRUCTURAL INTEGRITY (0-12)
            // Compression, level confluence, momentum acceleration
            // ==========================================================

            // 5a. Volatility compression: recent vs prior range (0-5)
            var last5H2 = highs.slice(-5);
            var last5L2 = lows.slice(-5);
            var prior10H2 = highs.slice(-15, -5);
            var prior10L2 = lows.slice(-15, -5);
            var last5ATR2 = (Math.max.apply(null, last5H2) - Math.min.apply(null, last5L2)) / 5;
            var prior10ATR2 = (Math.max.apply(null, prior10H2) - Math.min.apply(null, prior10L2)) / 10;
            var compRatio = prior10ATR2 > 0 ? last5ATR2 / prior10ATR2 : 1;
            var compScore = compRatio < 0.80 ? 5 : compRatio < 1.00 ? 3 : compRatio < 1.20 ? 1 : 0;
            details.compressionRatio = Math.round(compRatio * 100) / 100;
            details.compressionScore = compScore;
            total += compScore;

            // 5b. Level confluence: multi-test support/resistance within 3 ATR (0-4)
            var relevantSwings = isBullish ? swingLows : swingHighs;
            var clusters = clusterLevels(relevantSwings, atr);
            var nearClusters = clusters.filter(function (cl) {
                return Math.abs(cl.price - curPrice) <= atr * 5;
            });
            var bestCluster = nearClusters.length > 0
                ? nearClusters.reduce(function (a, b) { return b.tests > a.tests ? b : a; })
                : null;
            var zoneScore = 0;
            if (bestCluster) {
                var proxDist = Math.abs(curPrice - bestCluster.price) / atr;
                if (bestCluster.tests >= 2) {
                    zoneScore = proxDist <= 1.0 ? 4 : proxDist <= 2.5 ? 3 : 1;
                } else {
                    zoneScore = proxDist <= 1.5 ? 2 : proxDist <= 3.0 ? 1 : 0;
                }
            }
            details.levelTests = bestCluster ? bestCluster.tests : 0;
            details.zoneScore = zoneScore;
            total += zoneScore;

            // 5c. Momentum acceleration: recent 5-bar ROC vs prior 5-bar ROC (0-3)
            var accelScore = 0;
            if (n >= 15) {
                var roc5r = ((closes[n - 1] - closes[n - 6]) / closes[n - 6]) * 100;
                var roc5p = ((closes[n - 6] - closes[n - 11]) / closes[n - 11]) * 100;
                var accel = isBullish ? roc5r - roc5p : -(roc5r - roc5p);
                accelScore = accel > 0 ? 3 : accel > -1.0 ? 1 : 0;
            }
            details.accelScore = accelScore;
            total += accelScore;

            // ==========================================================
            // FINAL CONVICTION SCORE & GRADE
            // ==========================================================
            var finalScore = Math.min(100, Math.max(0, Math.round(total)));

            var grade = 'D';
            if (finalScore >= 90) grade = 'SS+';
            else if (finalScore >= 80) grade = 'SS';
            else if (finalScore >= 70) grade = 'S';
            else if (finalScore >= 60) grade = 'A';
            else if (finalScore >= 50) grade = 'B';
            else if (finalScore >= 35) grade = 'C';

            return Object.assign({}, candidate, {
                score: finalScore,
                grade: grade,
                details: Object.assign({}, details, {
                    atr: Math.round(atr * 100) / 100,
                    currentPrice: Math.round(curPrice * 100) / 100,
                    dataPoints: closes.length,
                    factors: {
                        trendConviction: swingScore + persistScore + rocScore,
                        volumeConfirmation: volScore,
                        industryCohesion: cohesionScore,
                        entryPrecision: atrScore + rangeScore + candleScore,
                        structural: compScore + zoneScore + accelScore
                    }
                })
            });
        });

        var scoredCandidates = await Promise.all(scoringPromises);

        self.postMessage({
            success: true,
            scoredCandidates: scoredCandidates,
            stats: {
                total: candidates.length,
                qualified: scoredCandidates.filter(function (c) { return c.score >= 35; }).length,
                avgScore: Math.round(calcMean(scoredCandidates.map(function (c) { return c.score; })))
            }
        });
    } catch (err) {
        self.postMessage({ success: false, error: err.message });
    }
};


/**
 * Find swing highs/lows with configurable lookback
 */
function findSwings(highs, lows, lookback) {
    lookback = lookback || 5;
    const swingHighs = [];
    const swingLows = [];

    for (let i = lookback; i < highs.length - lookback; i++) {
        let isHigh = true, isLow = true;
        for (let j = i - lookback; j <= i + lookback; j++) {
            if (j !== i) {
                if (highs[j] >= highs[i]) isHigh = false;
                if (lows[j] <= lows[i]) isLow = false;
            }
        }
        if (isHigh) swingHighs.push({ index: i, price: highs[i] });
        if (isLow) swingLows.push({ index: i, price: lows[i] });
    }
    return { swingHighs, swingLows };
}

/**
 * True Range-based ATR (14-period default)
 */
function calcATR(highs, lows, closes, period) {
    period = period || 14;
    if (closes.length < period + 1) return null;

    const trs = [];
    for (let i = 1; i < closes.length; i++) {
        const tr = Math.max(
            highs[i] - lows[i],
            Math.abs(highs[i] - closes[i - 1]),
            Math.abs(lows[i] - closes[i - 1])
        );
        trs.push(tr);
    }
    const recent = trs.slice(-period);
    return recent.reduce(function (a, b) { return a + b; }, 0) / recent.length;
}

function calcMean(arr) {
    return arr.reduce(function (a, b) { return a + b; }, 0) / arr.length;
}

/**
 * Cluster swing prices into zones using ATR-based buckets.
 * Fixes the broken Math.round(price/price * 100/2) * 2 = always 100 bug.
 */
function clusterLevels(swings, atr) {
    if (!swings || !swings.length || !atr) return [];

    const clusters = [];
    const used = new Array(swings.length).fill(false);

    for (let i = 0; i < swings.length; i++) {
        if (used[i]) continue;
        const cluster = [swings[i]];
        used[i] = true;

        for (let j = i + 1; j < swings.length; j++) {
            if (used[j]) continue;
            if (Math.abs(swings[j].price - swings[i].price) <= atr) {
                cluster.push(swings[j]);
                used[j] = true;
            }
        }

        clusters.push({
            price: calcMean(cluster.map(function (s) { return s.price; })),
            tests: cluster.length,
            lastIndex: Math.max.apply(null, cluster.map(function (s) { return s.index; }))
        });
    }

    return clusters.sort(function (a, b) { return b.tests - a.tests; });
}

self.onmessage = async function (e) {
    const { candidates, pricesMap } = e.data;

    if (!candidates || !Array.isArray(candidates)) {
        self.postMessage({ success: false, error: 'Invalid candidates array' });
        return;
    }
    if (!pricesMap || typeof pricesMap !== 'object') {
        self.postMessage({ success: false, error: 'Invalid pricesMap object' });
        return;
    }

    try {
        const scoringPromises = candidates.map(async function (candidate) {
            if (!candidate || !candidate.symbol || !candidate.trend) {
                return { ...candidate, score: 0, grade: 'D', details: { error: 'Invalid candidate' } };
            }

            const prices = pricesMap[candidate.symbol];
            if (!prices || !Array.isArray(prices) || prices.length < 20) {
                return { ...candidate, score: 0, grade: 'D', details: { error: 'Insufficient data' } };
            }

            const closes = prices.map(function (p) { return typeof p === 'object' ? p.close : p; }).filter(function (c) { return c > 0; });
            const highs = prices.map(function (p) { return typeof p === 'object' ? (p.high || p.close) : p; }).filter(function (h) { return h > 0; });
            const lows = prices.map(function (p) { return typeof p === 'object' ? (p.low || p.close) : p; }).filter(function (l) { return l > 0; });

            if (closes.length < 20) {
                return { ...candidate, score: 0, grade: 'D', details: { error: 'Insufficient close data' } };
            }

            const n = closes.length;
            const currentPrice = closes[n - 1];
            const isBullish = candidate.trend === 'bullish';
            const details = {};
            let total = 0;

            // ── Core derived values ────────────────────────────────────
            const atr = calcATR(highs, lows, closes, 14) || (currentPrice * 0.015);
            const { swingHighs, swingLows } = findSwings(highs, lows, 5);

            // ═══════════════════════════════════════════════════════════
            // FACTOR 1 — TREND CONVICTION (0–30)
            // ═══════════════════════════════════════════════════════════

            // 1a. Swing structure quality (0–12)
            let swingScore = 0;
            const recentHighs = swingHighs.slice(-3);
            const recentLows = swingLows.slice(-3);

            if (recentHighs.length >= 2 && recentLows.length >= 2) {
                const lastH = recentHighs[recentHighs.length - 1].price;
                const prevH = recentHighs[recentHighs.length - 2].price;
                const lastL = recentLows[recentLows.length - 1].price;
                const prevL = recentLows[recentLows.length - 2].price;
                const higherH = lastH > prevH;
                const higherL = lastL > prevL;
                const lowerH = lastH < prevH;
                const lowerL = lastL < prevL;

                if (isBullish) {
                    if (higherH && higherL) swingScore = 12; // Perfect HH/HL
                    else if (higherH || higherL) swingScore = 7;  // Partial structure
                    else swingScore = 3;  // Range with bias
                } else {
                    if (lowerH && lowerL) swingScore = 12; // Perfect LL/LH
                    else if (lowerH || lowerL) swingScore = 7;
                    else swingScore = 3;
                }
            }
            details.swingStructure = swingScore;
            total += swingScore;

            // 1b. Trend persistence (0–10)
            // % of last 20 bars trading on the correct side of the 20-bar mean
            const last20Closes = closes.slice(-20);
            const mean20 = calcMean(last20Closes);
            const onSideCount = last20Closes.filter(function (c) {
                return isBullish ? c > mean20 : c < mean20;
            }).length;
            const persistPct = onSideCount / 20;
            let persistScore = 0;
            if (persistPct > 0.70) persistScore = 10;
            else if (persistPct > 0.55) persistScore = 6;
            else if (persistPct > 0.45) persistScore = 2;
            details.trendPersistence = persistScore;
            total += persistScore;

            // 1c. Rate-of-Change momentum (0–8)
            const roc10 = n >= 11
                ? ((closes[n - 1] - closes[n - 11]) / closes[n - 11]) * 100
                : 0;
            const directedROC = isBullish ? roc10 : -roc10;
            let rocScore = 0;
            if (directedROC > 3) rocScore = 8;
            else if (directedROC > 1) rocScore = 5;
            else if (directedROC >= 0) rocScore = 2;
            details.roc10 = Math.round(roc10 * 100) / 100;
            details.rocScore = rocScore;
            total += rocScore;

            // ═══════════════════════════════════════════════════════════
            // FACTOR 2 — ENTRY PRECISION (0–25)
            // ═══════════════════════════════════════════════════════════

            // 2a. ATR-normalized distance from 20-bar mean (0–13)
            // Ideal entry: 0.3–1.2 ATR from mean = sweet zone
            const distFromMean = Math.abs(currentPrice - mean20);
            const atrDist = distFromMean / atr;
            let atrScore = 0;
            if (atrDist <= 0.3) atrScore = 8;  // At mean — slightly early
            else if (atrDist <= 1.2) atrScore = 13; // Golden zone
            else if (atrDist <= 2.0) atrScore = 4;  // Deep pullback / extension
            // > 2.0 ATR = overextended = 0
            details.atrDist = Math.round(atrDist * 100) / 100;
            details.atrScore = atrScore;
            total += atrScore;

            // 2b. Range position: where in the 30-bar impulse range (0–12)
            const last30Closes = closes.slice(-30);
            const rangeHigh = Math.max.apply(null, last30Closes);
            const rangeLow = Math.min.apply(null, last30Closes);
            const rangeSpan = rangeHigh - rangeLow;
            let rangeScore = 0;

            if (rangeSpan > 0) {
                const pctFromHigh = (rangeHigh - currentPrice) / rangeSpan; // 0=at high, 1=at low
                if (isBullish) {
                    if (pctFromHigh >= 0.20 && pctFromHigh <= 0.45) rangeScore = 12; // Optimal pullback
                    else if (pctFromHigh < 0.20) rangeScore = 8;  // Near/at breakout
                    else if (pctFromHigh <= 0.65) rangeScore = 5;  // Deeper pullback
                } else {
                    const pctFromLow = (currentPrice - rangeLow) / rangeSpan;        // 0=at low, 1=at high
                    if (pctFromLow >= 0.00 && pctFromLow <= 0.25) rangeScore = 12; // Optimal bear entry
                    else if (pctFromLow > 0.25 && pctFromLow <= 0.45) rangeScore = 8;
                    else if (pctFromLow > 0.45 && pctFromLow <= 0.65) rangeScore = 5;
                }
            }
            details.rangeScore = rangeScore;
            total += rangeScore;

            // ═══════════════════════════════════════════════════════════
            // FACTOR 3 — VOLATILITY STRUCTURE (0–20)
            // ═══════════════════════════════════════════════════════════

            // 3a. ATR compression: recent 5-bar vs prior 10-bar (0–10)
            const last5H = highs.slice(-5);
            const last5L = lows.slice(-5);
            const prior10H = highs.slice(-15, -5);
            const prior10L = lows.slice(-15, -5);
            const last5ATR = (Math.max.apply(null, last5H) - Math.min.apply(null, last5L)) / 5;
            const prior10ATR = (Math.max.apply(null, prior10H) - Math.min.apply(null, prior10L)) / 10;
            let compressionScore = 0;

            if (prior10ATR > 0) {
                const ratio = last5ATR / prior10ATR;
                if (ratio < 0.65) compressionScore = 10; // Strong compression = coiled spring
                else if (ratio < 0.80) compressionScore = 6;
                else if (ratio < 1.00) compressionScore = 2;
                // > 1.0 = expanding range = 0
            }
            details.compressionScore = compressionScore;
            total += compressionScore;

            // 3b. Candle quality via auction theory (0–10)
            // Strong close in the direction of the trade = institutional acceptance
            const latestCandle = prices[prices.length - 1];
            let candleScore = 0;

            if (typeof latestCandle === 'object' && latestCandle.high && latestCandle.low && latestCandle.close) {
                const cRange = latestCandle.high - latestCandle.low;
                if (cRange > 0) {
                    const closePos = (latestCandle.close - latestCandle.low) / cRange; // 0=low, 1=high
                    const upperWickRatio = (latestCandle.high - latestCandle.close) / cRange;
                    const lowerWickRatio = (latestCandle.close - latestCandle.low) / cRange;

                    // False breakout: upper wick > 55% AND recent expansion (auction failure)
                    const expanding = last5ATR > prior10ATR * 1.1;
                    const falseBreakout = upperWickRatio > 0.55 && expanding;

                    if (falseBreakout) {
                        candleScore = 0;
                        details.falseBreakout = true;
                    } else {
                        // Strong directional close: bullish wants top 70%, bearish wants bottom 30%
                        const goodClose = isBullish ? closePos >= 0.70 : closePos <= 0.30;
                        if (goodClose) candleScore += 6;
                        // Clean auction with minimal rejection wick
                        const cleanClose = isBullish ? upperWickRatio < 0.25 : lowerWickRatio < 0.25;
                        if (cleanClose) candleScore += 4;
                        details.falseBreakout = false;
                    }
                }
            }
            details.candleScore = candleScore;
            total += candleScore;

            // ═══════════════════════════════════════════════════════════
            // FACTOR 4 — INSTITUTIONAL ZONES (0–15)
            // ═══════════════════════════════════════════════════════════
            // Support clusters for bulls, resistance clusters for bears
            const relevantSwings = isBullish ? swingLows : swingHighs;
            const clusters = clusterLevels(relevantSwings, atr);

            // Narrow search to zones within 3 ATR of current price
            const nearClusters = clusters.filter(function (c) {
                return Math.abs(c.price - currentPrice) <= atr * 3;
            });
            const bestCluster = nearClusters.length > 0
                ? nearClusters.reduce(function (a, b) { return b.tests > a.tests ? b : a; })
                : null;

            let zoneTestScore = 0;
            let zoneProximityScore = 0;

            if (bestCluster) {
                // Test count: 3+ = institutional zone
                if (bestCluster.tests >= 3) zoneTestScore = 10;
                else if (bestCluster.tests >= 2) zoneTestScore = 6;
                else zoneTestScore = 2;

                // Proximity: within 0.5 ATR = perfect
                const proxDist = Math.abs(currentPrice - bestCluster.price) / atr;
                if (proxDist <= 0.5) zoneProximityScore = 5;
                else if (proxDist <= 1.0) zoneProximityScore = 3;
            }

            details.zoneTests = bestCluster ? bestCluster.tests : 0;
            details.zoneTestScore = zoneTestScore;
            details.zoneProximityScore = zoneProximityScore;
            total += zoneTestScore + zoneProximityScore;

            // ═══════════════════════════════════════════════════════════
            // FACTOR 5 — BREAKOUT QUALITY (0–10)
            // ═══════════════════════════════════════════════════════════

            // 5a. Level breakout conviction (0–6)
            // Breakout above multi-test resistance = institutional accumulation
            let breakoutScore = 0;
            const resistSwings = isBullish ? swingHighs : swingLows;
            const resistClusters = clusterLevels(resistSwings, atr);
            const testedResist = resistClusters.filter(function (c) { return c.tests >= 2; });

            if (testedResist.length > 0) {
                const keyLevel = testedResist.reduce(function (a, b) {
                    return Math.abs(a.price - currentPrice) < Math.abs(b.price - currentPrice) ? a : b;
                });

                if (isBullish) {
                    if (currentPrice > keyLevel.price * 1.01) breakoutScore = 6; // Clean breakout
                    else if (currentPrice > keyLevel.price * 0.99) breakoutScore = 3; // Probing resistance
                } else {
                    if (currentPrice < keyLevel.price * 0.99) breakoutScore = 6; // Clean breakdown
                    else if (currentPrice < keyLevel.price * 1.01) breakoutScore = 3; // Probing support
                }
            }
            details.breakoutScore = breakoutScore;
            total += breakoutScore;

            // 5b. Momentum acceleration (0–4)
            // Recent 5-bar ROC vs prior 5-bar ROC — is momentum building or fading?
            let accelScore = 0;
            if (n >= 15) {
                const roc5recent = ((closes[n - 1] - closes[n - 6]) / closes[n - 6]) * 100;
                const roc5prior = ((closes[n - 6] - closes[n - 11]) / closes[n - 11]) * 100;
                const accel = isBullish ? roc5recent - roc5prior : -(roc5recent - roc5prior);

                if (accel > 0.5) accelScore = 4; // Accelerating
                else if (accel > -0.5) accelScore = 2; // Steady
                // Decelerating = 0
            }
            details.accelScore = accelScore;
            total += accelScore;

            // ═══════════════════════════════════════════════════════════
            // FINAL CONVICTION SCORE (0–100)
            // ═══════════════════════════════════════════════════════════
            const finalScore = Math.min(100, Math.max(0, Math.round(total)));

            // Institutional-grade letter grades
            let grade = 'D';
            if (finalScore >= 90) grade = 'SS+';
            else if (finalScore >= 80) grade = 'SS';
            else if (finalScore >= 70) grade = 'S';
            else if (finalScore >= 60) grade = 'A';
            else if (finalScore >= 50) grade = 'B';
            else if (finalScore >= 35) grade = 'C';

            return {
                ...candidate,
                score: finalScore,
                grade,
                details: {
                    ...details,
                    atr: Math.round(atr * 100) / 100,
                    currentPrice: Math.round(currentPrice * 100) / 100,
                    dataPoints: closes.length,
                    factors: {
                        trendConviction: swingScore + persistScore + rocScore,
                        entryPrecision: atrScore + rangeScore,
                        volatilityStructure: compressionScore + candleScore,
                        institutionalZones: zoneTestScore + zoneProximityScore,
                        breakoutQuality: breakoutScore + accelScore
                    }
                }
            };
        });

        const scoredCandidates = await Promise.all(scoringPromises);
        const validCount = scoredCandidates.filter(function (c) { return c.score >= 35; }).length;
        const avgScore = scoredCandidates.length > 0
            ? Math.round(scoredCandidates.reduce(function (a, c) { return a + c.score; }, 0) / scoredCandidates.length)
            : 0;

        self.postMessage({
            success: true,
            scoredCandidates,
            stats: {
                total: candidates.length,
                qualified: validCount,
                avgScore
            }
        });
    } catch (error) {
        self.postMessage({ success: false, error: error.message });
    }
};

// ===================================================================
// INSTITUTIONAL MULTI-FACTOR CONVICTION MODEL  v3  (ACTIVE HANDLER)
// ===================================================================
//   1. TREND QUALITY         (0-25): Lin-reg R², EMA 8/21/50 stack, max intra-trend drawdown
//   2. INSTITUTIONAL FLOW    (0-25): VSA close-position pressure, Wyckoff No-Supply, OBV regression
//   3. RISK-ADJUSTED ALPHA   (0-20): Cross-sectional Sharpe rank vs all peers (same trend group)
//   4. INDUSTRY LEADERSHIP   (0-20): Sector breadth % + within-sector Sharpe rank
//   5. SETUP QUALITY         (0-10): EMA divergence (ATR-normalized), compression, breakout
//
// Grades: SS+(90) · SS(80) · S(70) · A(60) · B(50) · C(35) · D(<35)
// ===================================================================

function v3LinReg(y) {
    var n = y.length;
    if (n < 3) return { slope: 0, r2: 0 };
    var sx = 0, sy = 0, sxy = 0, sx2 = 0;
    for (var i = 0; i < n; i++) { sx += i; sy += y[i]; sxy += i * y[i]; sx2 += i * i; }
    var d = n * sx2 - sx * sx;
    if (d === 0) return { slope: 0, r2: 0 };
    var slope = (n * sxy - sx * sy) / d;
    var ic = (sy - slope * sx) / n;
    var ym = sy / n;
    var st = 0, sr = 0;
    for (var j = 0; j < n; j++) { st += Math.pow(y[j] - ym, 2); sr += Math.pow(y[j] - (slope * j + ic), 2); }
    return { slope: slope, r2: st > 0 ? Math.max(0, 1 - sr / st) : 0 };
}

function v3StdDev(arr) {
    if (!arr || arr.length < 2) return 0;
    var m = arr.reduce(function (a, b) { return a + b; }, 0) / arr.length;
    return Math.sqrt(arr.reduce(function (s, v) { return s + Math.pow(v - m, 2); }, 0) / (arr.length - 1));
}

function v3EMA(vals, period) {
    if (!vals || vals.length < period) return null;
    var k = 2 / (period + 1);
    var ema = vals.slice(0, period).reduce(function (a, b) { return a + b; }, 0) / period;
    for (var i = period; i < vals.length; i++) ema = vals[i] * k + ema * (1 - k);
    return ema;
}

function v3LogRet(closes) {
    var r = [];
    for (var i = 1; i < closes.length; i++) if (closes[i - 1] > 0) r.push(Math.log(closes[i] / closes[i - 1]));
    return r;
}

self.onmessage = async function (e) {
    var data = e.data;
    var candidates = data.candidates;
    var pricesMap = data.pricesMap;
    var allCandidates = data.allCandidates || candidates;

    if (!candidates || !Array.isArray(candidates)) { self.postMessage({ success: false, error: 'Invalid candidates' }); return; }
    if (!pricesMap || typeof pricesMap !== 'object') { self.postMessage({ success: false, error: 'Invalid pricesMap' }); return; }

    try {
        // ── Pass 1: Cross-sectional momentum — HISTORICAL and FRESH ────
        // Two Sharpe rankings:
        //   (a) 20-bar Sharpe  = sustained momentum (old system)
        //   (b) 5-bar Sharpe   = EMERGING momentum (new strength signal)
        // We want stocks whose RECENT rank >> HISTORICAL rank: inflection leaders.
        // Stocks whose historical rank >> recent rank = fading old moves = discount.
        var csMap = {};
        for (var ci = 0; ci < allCandidates.length; ci++) {
            var ac = allCandidates[ci];
            if (!ac || !ac.symbol) continue;
            var px = pricesMap[ac.symbol];
            if (!px || px.length < 22) continue;
            var cl = [];
            for (var p0 = 0; p0 < px.length; p0++) {
                var cv0 = typeof px[p0] === 'object' ? px[p0].close : px[p0];
                if (cv0 > 0) cl.push(cv0);
            }
            if (cl.length < 22) continue;
            // 20-bar: sustained momentum
            var ret20 = (cl[cl.length - 1] - cl[cl.length - 21]) / cl[cl.length - 21];
            var logR = v3LogRet(cl.slice(-21));
            var rvol = v3StdDev(logR);
            // 5-bar: RECENT / FRESH momentum
            var ret5f = (cl[cl.length - 1] - cl[cl.length - 6]) / Math.max(cl[cl.length - 6], 1e-8);
            var logR5 = v3LogRet(cl.slice(-6));
            var rvol5 = v3StdDev(logR5);
            // Prior-window return: bars [-41..-21] — how much of the move is OLD
            var retOld = cl.length >= 42
                ? (cl[cl.length - 21] - cl[cl.length - 42]) / Math.max(cl[cl.length - 42], 1e-8)
                : 0;
            csMap[ac.symbol] = {
                sharpe: rvol > 0 ? ret20 / (rvol * Math.sqrt(20)) : 0,
                sharpe5: rvol5 > 0 ? ret5f / (rvol5 * Math.sqrt(5)) : 0,
                ret20: ret20,
                ret5: ret5f,
                retOld: retOld,
                trend: ac.trend
            };
        }

        // Historical rank (20-bar Sharpe)
        var bullList = Object.keys(csMap).filter(function (s) { return csMap[s].trend === 'bullish'; })
            .sort(function (a, b) { return csMap[b].sharpe - csMap[a].sharpe; });
        var bearList = Object.keys(csMap).filter(function (s) { return csMap[s].trend === 'bearish'; })
            .sort(function (a, b) { return csMap[a].sharpe - csMap[b].sharpe; });

        // Fresh rank (5-bar Sharpe) — finds stocks JUST starting to lead
        var freshBullList = Object.keys(csMap).filter(function (s) { return csMap[s].trend === 'bullish'; })
            .sort(function (a, b) { return csMap[b].sharpe5 - csMap[a].sharpe5; });
        var freshBearList = Object.keys(csMap).filter(function (s) { return csMap[s].trend === 'bearish'; })
            .sort(function (a, b) { return csMap[a].sharpe5 - csMap[b].sharpe5; });

        var getPctRank = function (sym, isBull) {
            var list = isBull ? bullList : bearList;
            if (!list.length) return 0.5;
            var idx = list.indexOf(sym);
            return idx === -1 ? 0 : list.length > 1 ? 1 - idx / (list.length - 1) : 1;
        };
        var getFreshRank = function (sym, isBull) {
            var list = isBull ? freshBullList : freshBearList;
            if (!list.length) return 0.5;
            var idx = list.indexOf(sym);
            return idx === -1 ? 0 : list.length > 1 ? 1 - idx / (list.length - 1) : 1;
        };

        // ── Pass 2: Industry maps ────────────────────────────────────────
        var indMap = {};
        for (var ci2 = 0; ci2 < allCandidates.length; ci2++) {
            var ac2 = allCandidates[ci2];
            if (!ac2 || !ac2.industrySymbol) continue;
            var ik = ac2.industrySymbol;
            if (!indMap[ik]) indMap[ik] = { total: 0, bullish: 0, bearish: 0, members: [] };
            indMap[ik].total++;
            if (ac2.trend === 'bullish') indMap[ik].bullish++; else indMap[ik].bearish++;
            if (csMap[ac2.symbol]) indMap[ik].members.push({ symbol: ac2.symbol, trend: ac2.trend, sharpe: csMap[ac2.symbol].sharpe });
        }

        // ── Pass 3: Score each candidate ────────────────────────────────
        var scored = await Promise.all(candidates.map(async function (cand) {
            if (!cand || !cand.symbol || !cand.trend) return Object.assign({}, cand, { score: 0, grade: 'D' });
            var prices = pricesMap[cand.symbol];
            if (!prices || prices.length < 20) return Object.assign({}, cand, { score: 0, grade: 'D' });

            var closes = [], highs = [], lows = [], vols = [];
            for (var pi = 0; pi < prices.length; pi++) {
                var p = prices[pi];
                var c = typeof p === 'object' ? p.close : p;
                var h = typeof p === 'object' ? (p.high || p.close) : p;
                var lv = typeof p === 'object' ? (p.low || p.close) : p;
                var v = typeof p === 'object' ? (p.volume || 0) : 0;
                if (c > 0) { closes.push(c); highs.push(h); lows.push(lv); vols.push(v); }
            }
            if (closes.length < 20) return Object.assign({}, cand, { score: 0, grade: 'D' });

            var n = closes.length;
            var cur = closes[n - 1];
            var bull = cand.trend === 'bullish';
            var det = {};
            var total = 0;

            var atr = (function () {
                var trs = [];
                for (var i = 1; i < n; i++)
                    trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
                var sl = trs.slice(-14);
                return sl.length ? sl.reduce(function (a, b) { return a + b; }, 0) / sl.length : cur * 0.015;
            })();

            // ── FACTOR 1: TREND QUALITY (0-25) ─────────────────────────
            // Is price trending CLEANLY? R² measures efficiency of the trend,
            // not just direction. Choppy = low R² = no institutional conviction.

            // 1a. OLS linear regression R² on log(price) — last 20 bars (0-12)
            var logP = closes.slice(-20).map(function (v) { return Math.log(v); });
            var reg = v3LinReg(logP);
            var sok = bull ? reg.slope > 0 : reg.slope < 0;
            var r2sc = reg.r2 >= 0.90 ? 12 : reg.r2 >= 0.78 ? 9 : reg.r2 >= 0.60 ? 5 : reg.r2 >= 0.45 ? 2 : 0;
            if (!sok) r2sc = Math.floor(r2sc * 0.2);  // Penalize wrong-slope R²
            det.r2 = Math.round(reg.r2 * 1000) / 1000;
            det.r2Score = r2sc;
            total += r2sc;

            // 1b. EMA 8 / 21 / 50 stack alignment (0-8)
            // Every institutional algo runs MA alignment checks.
            // Full 3-MA stack = every time frame agrees = no counter-trend pressure.
            var e8 = v3EMA(closes, 8);
            var e21 = v3EMA(closes, 21);
            var e50 = n >= 50 ? v3EMA(closes, 50) : null;
            var masc = 0;
            if (e8 !== null && e21 !== null) {
                var a8_21 = bull ? e8 > e21 : e8 < e21;
                var pxOk = bull ? cur > e8 : cur < e8;
                if (a8_21 && pxOk) masc += 4; else if (a8_21 || pxOk) masc += 2;
                if (e50 !== null) { if (bull ? e21 > e50 : e21 < e50) masc += 4; }
                else masc += 2;
            }
            det.maScore = masc;
            total += masc;

            // 1c. Max intra-trend counter-move last 20 bars (0-5)
            // Institutions hold clean trends. <3% drawdown during uptrend = conviction.
            var base20 = closes.slice(-20), maxCtr = 0;
            if (bull) {
                var pk = base20[0];
                for (var di = 1; di < base20.length; di++) {
                    if (base20[di] > pk) pk = base20[di];
                    else { var dd = (pk - base20[di]) / pk; if (dd > maxCtr) maxCtr = dd; }
                }
            } else {
                var tr0 = base20[0];
                for (var di2 = 1; di2 < base20.length; di2++) {
                    if (base20[di2] < tr0) tr0 = base20[di2];
                    else { var rl = (base20[di2] - tr0) / Math.max(tr0, 1e-8); if (rl > maxCtr) maxCtr = rl; }
                }
            }
            var ddsc = maxCtr < 0.03 ? 5 : maxCtr < 0.06 ? 3 : maxCtr < 0.12 ? 1 : 0;
            det.maxCounterMove = Math.round(maxCtr * 1000) / 1000;
            det.ddScore = ddsc;
            total += ddsc;

            // ── FACTOR 2: INSTITUTIONAL FLOW (0-25) ─────────────────────
            // Volume Spread Analysis: WHERE bars close relative to their range,
            // weighted by volume. Institutions can't hide — only large buy orders
            // push closes to the TOP of high-volume bars.

            var hasVol = vols.some(function (v) { return v > 0; });
            var flowTotal = 0;

            if (hasVol) {
                var nzVols = vols.slice(-20).filter(function (v) { return v > 0; });
                var avgV20 = nzVols.length ? nzVols.reduce(function (a, b) { return a + b; }, 0) / nzVols.length : 1;

                // 2a. VSA — volume-weighted close-position pressure (0-10)
                var buyP = 0, sellP = 0, vsaN = Math.min(20, n - 1);
                for (var vi = n - vsaN; vi < n; vi++) {
                    var br = highs[vi] - lows[vi];
                    if (br <= 0) continue;
                    var cp = (closes[vi] - lows[vi]) / br;
                    var rv = vols[vi] / avgV20;
                    if (cp >= 0.60) buyP += rv;
                    if (cp <= 0.40) sellP += rv;
                }
                var totP = buyP + sellP || 1;
                var vsaR = bull ? buyP / totP : sellP / totP;
                var vsasc = vsaR >= 0.72 ? 10 : vsaR >= 0.62 ? 7 : vsaR >= 0.52 ? 4 : vsaR >= 0.42 ? 1 : 0;
                det.vsaRatio = Math.round(vsaR * 100) / 100;
                det.vsaScore = vsasc;
                flowTotal += vsasc;

                // 2b. Wyckoff No-Supply / No-Demand (0-8)
                // Counter-trend bars on BELOW-average volume = no real supply entering.
                // If sellers aren't showing up on pullbacks, institutions are absorbing.
                var pbs = 0, lowVpb = 0;
                for (var pb2 = n - 10; pb2 < n; pb2++) {
                    var against = bull ? closes[pb2] < closes[Math.max(0, pb2 - 1)] : closes[pb2] > closes[Math.max(0, pb2 - 1)];
                    if (against) { pbs++; if (vols[pb2] < avgV20 * 0.75) lowVpb++; }
                }
                var pbsc;
                if (pbs === 0) { pbsc = 5; }
                else { var pbr = lowVpb / pbs; pbsc = pbr >= 0.80 ? 8 : pbr >= 0.60 ? 5 : pbr >= 0.40 ? 2 : 0; }
                det.pullbackQuality = pbs > 0 ? Math.round((lowVpb / pbs) * 100) : 100;
                det.pbScore = pbsc;
                flowTotal += pbsc;

                // 2c. OBV linear regression R² (0-7)
                // OBV trending cleanly with price = SUSTAINED accumulation, not noise spikes.
                var obv0 = 0, obvA = [];
                for (var oi = 1; oi < n; oi++) {
                    var vv2 = vols[oi] || 0;
                    if (closes[oi] > closes[oi - 1]) obv0 += vv2; else if (closes[oi] < closes[oi - 1]) obv0 -= vv2;
                    obvA.push(obv0);
                }
                var obvsc = 0;
                if (obvA.length >= 10) {
                    var oReg = v3LinReg(obvA.slice(-20));
                    var oOk = bull ? oReg.slope > 0 : oReg.slope < 0;
                    obvsc = (oReg.r2 >= 0.80 && oOk) ? 7 : (oReg.r2 >= 0.60 && oOk) ? 5 : (oReg.r2 >= 0.35 && oOk) ? 3 : oOk ? 1 : 0;
                    det.obvR2 = Math.round(oReg.r2 * 1000) / 1000;
                } else { obvsc = 3; }
                det.obvScore = obvsc;
                flowTotal += obvsc;
            } else {
                flowTotal = 10;
            }
            det.flowTotal = flowTotal;
            total += flowTotal;

            // ── FACTOR 3: RISK-ADJUSTED ALPHA — NEW STRENGTH BIAS (0-20) ──
            // Core methodology: rank by 20-bar Sharpe BUT heavily reward stocks
            // whose FRESH 5-bar rank >> historical rank (inflection = new leaders).
            // Penalize stocks where most of the move is ALREADY done (old strength).
            var pctR = getPctRank(cand.symbol, bull);   // Historical rank
            var freshR = getFreshRank(cand.symbol, bull);  // Recent 5-bar rank
            var csD = csMap[cand.symbol];

            // Base score from historical rank (0-10)
            var baseAlpha = pctR >= 0.85 ? 10 : pctR >= 0.70 ? 8 : pctR >= 0.50 ? 5 : pctR >= 0.30 ? 2 : 0;

            // Fresh strength bonus: recent rank outpacing historical rank = NEW leader (0-8)
            // This is the inflection point — was lagging, now leading = prime entry
            var rankDelta = freshR - pctR;  // Positive = accelerating, negative = fading
            var freshBonus;
            if (rankDelta >= 0.30 && freshR >= 0.70) freshBonus = 8; // Big inflection, top fresh rank
            else if (rankDelta >= 0.20 && freshR >= 0.55) freshBonus = 5; // Clear acceleration
            else if (rankDelta >= 0.10) freshBonus = 2; // Mild improvement
            else if (rankDelta <= -0.25) freshBonus = -3; // Fading — was great, going stale
            else if (rankDelta <= -0.15) freshBonus = -1; // Mild deceleration
            else freshBonus = 0;

            // Old-move overextension penalty: stock already ran HUGE in prior window
            // If retOld > 0.40 (40%+ in bars -41..-21) the big move is OLD, not fresh (0 or -3)
            var extPenalty = 0;
            if (csD) {
                var oldMove = bull ? csD.retOld : -csD.retOld;  // Old window return in trade direction
                if (oldMove >= 0.80) extPenalty = -4; // 80%+ already done — very extended
                else if (oldMove >= 0.50) extPenalty = -2; // 50%+ done
                else if (oldMove >= 0.30) extPenalty = -1; // Moderate extension
            }

            var alphasc = Math.max(0, baseAlpha + freshBonus + extPenalty);
            det.sharpe = csD ? Math.round(csD.sharpe * 100) / 100 : null;
            det.sharpe5 = csD ? Math.round(csD.sharpe5 * 100) / 100 : null;
            det.pctRank = Math.round(pctR * 100);
            det.freshRank = Math.round(freshR * 100);
            det.rankDelta = Math.round(rankDelta * 100);
            det.extPenalty = extPenalty;
            det.alphaScore = alphasc;
            total += alphasc;

            // ── FACTOR 4: INDUSTRY LEADERSHIP (0-20) ────────────────────
            // Institutional rotation is a SECTOR event. Best stock in a rotating
            // sector = prime institutional selection. Best stock in a broken sector = trap.
            var indD = cand.industrySymbol ? indMap[cand.industrySymbol] : null;
            var cohsc = 0;
            if (indD && indD.total >= 2) {
                var al = bull ? indD.bullish : indD.bearish;
                var brPct = al / indD.total;
                var brsc = brPct >= 0.85 ? 10 : brPct >= 0.70 ? 7 : brPct >= 0.55 ? 4 : brPct >= 0.45 ? 1 : 0;
                det.industryBreadth = Math.round(brPct * 100);
                det.breadthScore = brsc;
                cohsc += brsc;
                var peers = indD.members.filter(function (m) { return m.trend === cand.trend; });
                if (peers.length >= 2) {
                    peers.sort(function (a, b) { return bull ? b.sharpe - a.sharpe : a.sharpe - b.sharpe; });
                    var pidx = peers.findIndex(function (m) { return m.symbol === cand.symbol; });
                    if (pidx === -1) pidx = peers.length;
                    var ppct = peers.length > 1 ? 1 - pidx / (peers.length - 1) : 1;
                    var peersc = ppct >= 0.80 ? 10 : ppct >= 0.60 ? 7 : ppct >= 0.40 ? 4 : 1;
                    det.sectorRank = pidx + 1;
                    det.peerScore = peersc;
                    cohsc += peersc;
                } else { cohsc += 4; }
            } else { cohsc = 5; }
            det.cohesionTotal = cohsc;
            total += cohsc;

            // ── FACTOR 5: STRUCTURAL CATALYSTS (0-20) ───────────────────
            // The signals that separate GOOD trades from GREAT trades.
            // 52-week extremes, prior trend breaks, and RS acceleration are
            // the three highest-conviction institutional entry triggers.

            // 5a. EMA 8 vs 21 spread in ATR units — trend acceleration (0-3)
            var spsc = 0;
            if (e8 !== null && e21 !== null && atr > 0) {
                var ed = (e8 - e21) / atr, edd = bull ? ed : -ed;
                spsc = edd > 1.0 ? 3 : edd > 0.5 ? 2 : edd > 0.0 ? 1 : 0;
            }
            det.emaSpread = spsc;
            total += spsc;

            // 5b. Compression coil: 5-bar range vs prior 10-bar range (0-2)
            var h5p = highs.slice(-5), l5p = lows.slice(-5);
            var h10p = highs.slice(-15, -5), l10p = lows.slice(-15, -5);
            var r5 = Math.max.apply(null, h5p) - Math.min.apply(null, l5p);
            var r10 = Math.max.apply(null, h10p) - Math.min.apply(null, l10p);
            var comp = r10 > 0 ? r5 / r10 : 1;
            var cpsc = comp < 0.55 ? 2 : comp < 0.75 ? 1 : 0;
            det.compression = cpsc;
            total += cpsc;

            // 5c. 52-WEEK HIGH / LOW PROXIMITY (0-7)
            // Stocks breaking or near 52-week highs are in INSTITUTIONAL DEMAND.
            // New 52-week highs are the single best momentum predictor in academic
            // literature (Jegadeesh-Titman, George-Hwang). Same logic inverted for bears.
            var allH = Math.max.apply(null, highs);   // Highest bar high in all data
            var allL = Math.min.apply(null, lows);    // Lowest bar low in all data
            var hiRange = allH - allL;
            var wkHighSc = 0;
            if (hiRange > 0) {
                if (bull) {
                    var pctFromAllHigh = (allH - cur) / hiRange;
                    // At or above 52-week high = 7pts. Near = partial.
                    if (pctFromAllHigh <= 0.01) wkHighSc = 7;  // Breaking / at 52wk high
                    else if (pctFromAllHigh <= 0.05) wkHighSc = 5;  // Within 5% of 52wk high
                    else if (pctFromAllHigh <= 0.10) wkHighSc = 3;  // Within 10%
                    else if (pctFromAllHigh <= 0.20) wkHighSc = 1;  // Upper half of range
                } else {
                    var pctFromAllLow = (cur - allL) / hiRange;
                    if (pctFromAllLow <= 0.01) wkHighSc = 7;  // Breaking / at 52wk low
                    else if (pctFromAllLow <= 0.05) wkHighSc = 5;
                    else if (pctFromAllLow <= 0.10) wkHighSc = 3;
                    else if (pctFromAllLow <= 0.20) wkHighSc = 1;
                }
            }
            det.wk52score = wkHighSc;
            det.allTimeHigh = Math.round(allH * 100) / 100;
            det.allTimeLow = Math.round(allL * 100) / 100;
            total += wkHighSc;

            // 5d. PRIOR TREND BREAK (0-5)
            // Breaking a DOWNTREND for bulls (or uptrend for bears) is a regime
            // change signal — institutions rotate INTO stocks exiting a downtrend.
            // Logic: look at the prior 40–15 bars for trend structure. If prior
            // structure was AGAINST the current trade direction and price has now
            // broken above/below it = trend reversal = maximum conviction entry.
            var trendBreakSc = 0;
            if (n >= 40) {
                // Prior structure window: bars [-40 to -20] vs recent window [-20 to -5]
                var priorH = Math.max.apply(null, highs.slice(-40, -20));
                var priorL = Math.min.apply(null, lows.slice(-40, -20));
                var midH = Math.max.apply(null, highs.slice(-20, -5));
                var midL = Math.min.apply(null, lows.slice(-20, -5));
                if (bull) {
                    // Prior downtrend = prior block HIGH > mid block HIGH (making lower highs)
                    var wasDowntrend = priorH > midH * 1.02;
                    // Breakout above the mid-block high = trend break
                    var brokeTrend = cur > midH;
                    if (wasDowntrend && brokeTrend) trendBreakSc = 5; // Full reversal signal
                    else if (wasDowntrend) trendBreakSc = 2; // Downtrend but not broken yet
                    else trendBreakSc = 0; // Already uptrending (not a reversal)
                } else {
                    // Prior uptrend = prior block LOW < mid block LOW (making higher lows)
                    var wasUptrend = priorL < midL * 0.98;
                    var brokeTrend2 = cur < midL;
                    if (wasUptrend && brokeTrend2) trendBreakSc = 5;
                    else if (wasUptrend) trendBreakSc = 2;
                    else trendBreakSc = 0;
                }
            } else if (n >= 20) {
                // Shorter history fallback: check if prior 10-bar high was above recent 5-bar high
                var shortPriorH2 = Math.max.apply(null, highs.slice(-20, -10));
                var shortRecH = Math.max.apply(null, highs.slice(-10, -1));
                var shortPriorL2 = Math.min.apply(null, lows.slice(-20, -10));
                var shortRecL = Math.min.apply(null, lows.slice(-10, -1));
                if (bull && shortPriorH2 > shortRecH * 1.02 && cur > shortRecH) trendBreakSc = 3;
                else if (!bull && shortPriorL2 < shortRecL * 0.98 && cur < shortRecL) trendBreakSc = 3;
            }
            det.trendBreakScore = trendBreakSc;
            total += trendBreakSc;

            // 5e. RELATIVE STRENGTH ACCELERATION (0-3)
            // RS inflection confirmation: same rankDelta signal computed in Factor 3
            // but checked against fresh vs historical rank directly.
            // A stock jumping from bottom 40% to top 30% in ONE week = NEW money entering.
            var rsAccSc = 0;
            if (csD) {
                var freshRk = getFreshRank(cand.symbol, bull);
                var histRk = getPctRank(cand.symbol, bull);
                var delta = freshRk - histRk;
                // New leader: was average/below, now rocketing in fresh rank
                if (delta >= 0.35 && freshRk >= 0.65) rsAccSc = 3; // Major inflection = institutions piling in NOW
                else if (delta >= 0.20 && freshRk >= 0.50) rsAccSc = 2; // Clear new-money signal
                else if (delta >= 0.10) rsAccSc = 1; // Emerging
                // No bonus for stocks already at top with no acceleration (they had their run)
            }
            det.rsAccelScore = rsAccSc;
            total += rsAccSc;

            var fs = Math.min(100, Math.max(0, Math.round(total)));
            var grade = fs >= 90 ? 'SS+' : fs >= 80 ? 'SS' : fs >= 70 ? 'S' : fs >= 60 ? 'A' : fs >= 50 ? 'B' : fs >= 35 ? 'C' : 'D';

            return Object.assign({}, cand, {
                score: fs, grade: grade,
                details: Object.assign({}, det, {
                    atr: Math.round(atr * 100) / 100, currentPrice: Math.round(cur * 100) / 100, dataPoints: closes.length,
                    factors: {
                        trendQuality: r2sc + masc + ddsc,
                        institutionalFlow: flowTotal,
                        riskAdjAlpha: alphasc,
                        industryLeadership: cohsc,
                        catalysts: spsc + cpsc + wkHighSc + trendBreakSc + rsAccSc
                    }
                })
            });
        }));

        self.postMessage({
            success: true,
            scoredCandidates: scored,
            stats: {
                total: candidates.length,
                qualified: scored.filter(function (c) { return c.score >= 35; }).length,
                avgScore: Math.round(scored.reduce(function (a, c) { return a + c.score; }, 0) / Math.max(scored.length, 1))
            }
        });
    } catch (err) {
        self.postMessage({ success: false, error: err.message });
    }
};
