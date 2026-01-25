// AI Trade Scoring Worker - Setup Quality Focused System
// Scores stocks based on ENTRY QUALITY, not just big moves

// Helper function to fetch volume data directly from Polygon
async function fetchVolumeData(symbol, days = 30) {
    try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - days);

        const formatDate = (d) => d.toISOString().split('T')[0];
        const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${formatDate(startDate)}/${formatDate(endDate)}?adjusted=true&sort=desc&apiKey=kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.results && data.results.length > 0) {
            // Extract volumes (data comes in DESC order - newest first)
            return data.results.reverse().map(bar => bar.v || 0);
        }
        return [];
    } catch (error) {
        console.error(`Failed to fetch volume for ${symbol}:`, error);
        return [];
    }
}

self.onmessage = async function (e) {
    const { candidates, pricesMap } = e.data;

    if (!candidates || !Array.isArray(candidates)) {
        console.error('Worker: Invalid candidates array');
        self.postMessage({ success: false, error: 'Invalid candidates array' });
        return;
    }

    if (!pricesMap || typeof pricesMap !== 'object') {
        console.error('Worker: Invalid pricesMap object');
        self.postMessage({ success: false, error: 'Invalid pricesMap object' });
        return;
    }

    try {
        const scoringPromises = candidates.map(async (candidate, idx) => {
            if (!candidate || !candidate.symbol || !candidate.trend) {
                return { ...candidate, score: 0, details: { error: 'Invalid candidate' } };
            }

            const prices = pricesMap[candidate.symbol];
            if (!prices || !Array.isArray(prices) || prices.length < 10) {
                return { ...candidate, score: 0, details: { error: 'Insufficient data', dataPoints: prices?.length || 0 } };
            }

            const closes = prices.map(p => {
                const close = typeof p === 'object' ? p.close : p;
                return typeof close === 'number' && !isNaN(close) && close > 0 ? close : null;
            }).filter(c => c !== null);

            const highs = prices.map(p => {
                const high = typeof p === 'object' ? p.high : p;
                return typeof high === 'number' && !isNaN(high) && high > 0 ? high : null;
            }).filter(h => h !== null);

            const lows = prices.map(p => {
                const low = typeof p === 'object' ? p.low : p;
                return typeof low === 'number' && !isNaN(low) && low > 0 ? low : null;
            }).filter(l => l !== null);

            let volumes = prices.map(p => {
                if (typeof p === 'object' && p.volume) {
                    const vol = parseFloat(p.volume);
                    return !isNaN(vol) && vol >= 0 ? vol : 0;
                }
                return 0;
            });

            // If volumes are mostly zero or missing, fetch directly from API
            const validVolumes = volumes.filter(v => v > 0);
            if (validVolumes.length < volumes.length * 0.5) {
                const fetchedVolumes = await fetchVolumeData(candidate.symbol, closes.length);
                if (fetchedVolumes && fetchedVolumes.length > 0) {
                    volumes = fetchedVolumes.slice(-closes.length); // Match closes length
                }
            }

            if (closes.length < 10) {
                return { ...candidate, score: 0, details: { error: 'No valid data', rawCount: prices.length } };
            }

            const scores = {};
            let totalScore = 0;
            const currentPrice = closes[closes.length - 1];

            // Calculate Moving Averages
            const ma10 = closes.length >= 10 ? closes.slice(-10).reduce((a, b) => a + b, 0) / 10 : currentPrice;
            const ma20 = closes.length >= 20 ? closes.slice(-20).reduce((a, b) => a + b, 0) / 20 : currentPrice;
            const ma50 = closes.length >= 50 ? closes.slice(-50).reduce((a, b) => a + b, 0) / 50 : currentPrice;

            // Calculate ATR for volatility context
            const atrPeriod = Math.min(14, Math.floor(closes.length / 2));
            let atr = 0;
            if (highs.length >= atrPeriod && lows.length >= atrPeriod) {
                const trs = [];
                for (let i = 1; i < atrPeriod; i++) {
                    const tr = Math.max(
                        highs[highs.length - i] - lows[lows.length - i],
                        Math.abs(highs[highs.length - i] - closes[closes.length - i - 1]),
                        Math.abs(lows[lows.length - i] - closes[closes.length - i - 1])
                    );
                    trs.push(tr);
                }
                atr = trs.reduce((a, b) => a + b, 0) / trs.length;
            }

            // ========================================
            // 1. SETUP QUALITY (25 points)
            // ========================================
            try {
                let setupScore = 0;

                // A) Pullback to Support (not overextended) - 10 pts
                const recentHigh = Math.max(...closes.slice(-10));
                const recentLow = Math.min(...closes.slice(-10));
                const range = recentHigh - recentLow;

                if (candidate.trend === 'bullish') {
                    // Want to be in lower 40% of recent range (pullback opportunity)
                    const positionInRange = range > 0 ? (currentPrice - recentLow) / range : 0.5;
                    if (positionInRange >= 0.2 && positionInRange <= 0.5) setupScore += 10; // Sweet spot
                    else if (positionInRange < 0.2) setupScore += 7; // Too low, risky
                    else if (positionInRange <= 0.7) setupScore += 5; // Mid range
                    // Above 0.7 = extended, no points
                } else {
                    // Bearish: want to be in upper 40% (rally to resistance)
                    const positionInRange = range > 0 ? (currentPrice - recentLow) / range : 0.5;
                    if (positionInRange >= 0.5 && positionInRange <= 0.8) setupScore += 10;
                    else if (positionInRange > 0.8) setupScore += 7;
                    else if (positionInRange >= 0.3) setupScore += 5;
                }

                // B) Near Key Moving Averages - 8 pts
                const distanceToMA10 = Math.abs(currentPrice - ma10) / currentPrice;
                const distanceToMA20 = Math.abs(currentPrice - ma20) / currentPrice;

                if (distanceToMA10 < 0.02) setupScore += 4; // Within 2% of MA10
                else if (distanceToMA10 < 0.05) setupScore += 2; // Within 5%

                if (distanceToMA20 < 0.03) setupScore += 4; // Within 3% of MA20
                else if (distanceToMA20 < 0.07) setupScore += 2;

                // C) Consolidation Pattern (low recent volatility) - 4 pts
                const last5Closes = closes.slice(-5);
                const last5High = Math.max(...last5Closes);
                const last5Low = Math.min(...last5Closes);
                const consolidation = last5High > 0 ? (last5High - last5Low) / last5High : 1;

                if (consolidation < 0.03) setupScore += 4; // Tight 3% range
                else if (consolidation < 0.05) setupScore += 2; // 5% range

                // D) Not Overextended from 52-week context - 3 pts
                const fiftyTwoWeekHigh = Math.max(...closes);
                const fiftyTwoWeekLow = Math.min(...closes);
                const distanceFromHigh = (fiftyTwoWeekHigh - currentPrice) / fiftyTwoWeekHigh;
                const distanceFromLow = (currentPrice - fiftyTwoWeekLow) / currentPrice;

                if (candidate.trend === 'bullish' && distanceFromHigh > 0.05 && distanceFromHigh < 0.30) setupScore += 3;
                if (candidate.trend === 'bearish' && distanceFromLow > 0.05 && distanceFromLow < 0.30) setupScore += 3;

                scores.setupQuality = Math.min(setupScore, 25);
                totalScore += scores.setupQuality;
            } catch (err) {
                scores.setupQuality = 0;
            }

            // ========================================
            // 2. RISK/REWARD RATIO (20 points)
            // ========================================
            try {
                let rrScore = 0;

                // A) Identify Recent Swing Low/High for Stop - 8 pts
                const lookback = Math.min(20, closes.length - 1);
                let swingLow = currentPrice;
                let swingHigh = currentPrice;

                for (let i = 1; i <= lookback; i++) {
                    const idx = lows.length - i;
                    if (idx >= 0 && lows[idx] < swingLow) swingLow = lows[idx];
                }
                for (let i = 1; i <= lookback; i++) {
                    const idx = highs.length - i;
                    if (idx >= 0 && highs[idx] > swingHigh) swingHigh = highs[idx];
                }

                const stopDistance = candidate.trend === 'bullish'
                    ? (currentPrice - swingLow) / currentPrice
                    : (swingHigh - currentPrice) / currentPrice;

                // Prefer stops 2-5% away (not too tight, not too wide)
                if (stopDistance >= 0.02 && stopDistance <= 0.05) rrScore += 8;
                else if (stopDistance < 0.02) rrScore += 3; // Too tight
                else if (stopDistance <= 0.08) rrScore += 5; // Acceptable

                // B) Calculate R:R to resistance/support - 8 pts
                const targetDistance = candidate.trend === 'bullish'
                    ? (swingHigh - currentPrice) / currentPrice
                    : (currentPrice - swingLow) / currentPrice;

                const rrRatio = stopDistance > 0 ? targetDistance / stopDistance : 0;

                if (rrRatio >= 3.0) rrScore += 8; // 3:1 or better
                else if (rrRatio >= 2.0) rrScore += 6; // 2:1
                else if (rrRatio >= 1.5) rrScore += 3; // 1.5:1

                // C) Not in "No Man's Land" (middle of range) - 4 pts
                const rangePosition = swingHigh > swingLow ? (currentPrice - swingLow) / (swingHigh - swingLow) : 0.5;
                if (rangePosition < 0.3 || rangePosition > 0.7) rrScore += 4; // Near boundaries
                else if (rangePosition < 0.4 || rangePosition > 0.6) rrScore += 2;

                scores.riskReward = Math.min(rrScore, 20);
                totalScore += scores.riskReward;
            } catch (err) {
                scores.riskReward = 0;
            }

            // ========================================
            // 3. VOLUME/BREADTH (15 points)
            // ========================================
            try {
                let volumeScore = 0;
                const validVolumes = volumes.filter(v => v > 0);

                if (validVolumes.length >= 10) {
                    const avgVolume = validVolumes.reduce((a, b) => a + b, 0) / validVolumes.length;
                    const recentAvgVol = validVolumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
                    const priorAvgVol = validVolumes.slice(-15, -5).reduce((a, b) => a + b, 0) / 10;

                    // A) Volume increasing on directional moves - 6 pts
                    const volumeIncrease = priorAvgVol > 0 ? (recentAvgVol - priorAvgVol) / priorAvgVol : 0;
                    if (volumeIncrease > 0.3) volumeScore += 6; // 30%+ increase
                    else if (volumeIncrease > 0.15) volumeScore += 4;
                    else if (volumeIncrease > 0) volumeScore += 2;

                    // B) Volume pattern matches trend - 5 pts
                    const last3Vol = validVolumes.slice(-3).reduce((a, b) => a + b, 0) / 3;
                    const last3Returns = [];
                    for (let i = closes.length - 3; i < closes.length - 1; i++) {
                        if (i > 0) last3Returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
                    }
                    const avgReturn = last3Returns.reduce((a, b) => a + b, 0) / last3Returns.length;
                    const trendMatches = (candidate.trend === 'bullish' && avgReturn > 0) ||
                        (candidate.trend === 'bearish' && avgReturn < 0);

                    if (trendMatches && last3Vol > avgVolume * 1.2) volumeScore += 5;
                    else if (trendMatches) volumeScore += 3;

                    // C) Sector Relative Strength - 4 pts
                    const relPerf = candidate.relativePerformance || 0;
                    if (Math.abs(relPerf) > 5) volumeScore += 4; // Strong relative performance
                    else if (Math.abs(relPerf) > 2) volumeScore += 2;
                }

                scores.volumeBreadth = Math.min(volumeScore, 15);
                totalScore += scores.volumeBreadth;
            } catch (err) {
                scores.volumeBreadth = 0;
            }

            // ========================================
            // 4. MOMENTUM HEALTH (20 points)
            // ========================================
            try {
                let momentumScore = 0;

                // A) RSI in healthy range 40-60 (not overbought/oversold) - 7 pts
                const rsiPeriod = Math.min(14, Math.floor(closes.length / 2));
                if (closes.length >= rsiPeriod + 1) {
                    const gains = [];
                    const losses = [];
                    for (let i = closes.length - rsiPeriod; i < closes.length; i++) {
                        const change = closes[i] - closes[i - 1];
                        gains.push(change > 0 ? change : 0);
                        losses.push(change < 0 ? Math.abs(change) : 0);
                    }
                    const avgGain = gains.reduce((a, b) => a + b, 0) / gains.length;
                    const avgLoss = losses.reduce((a, b) => a + b, 0) / losses.length;
                    const rs = avgLoss > 0 ? avgGain / avgLoss : 100;
                    const rsi = 100 - (100 / (1 + rs));

                    // Sweet spot: RSI 40-60 (room to run)
                    if (rsi >= 45 && rsi <= 60) momentumScore += 7;
                    else if (rsi >= 40 && rsi <= 65) momentumScore += 5;
                    else if (rsi >= 35 && rsi <= 70) momentumScore += 3;
                    // Oversold (<30) or Overbought (>70) = bad for new entries
                }

                // B) MA Alignment - 6 pts
                if (candidate.trend === 'bullish') {
                    if (ma10 > ma20 && ma20 > ma50) momentumScore += 6; // Perfect bull alignment
                    else if (ma10 > ma20) momentumScore += 3;
                } else {
                    if (ma10 < ma20 && ma20 < ma50) momentumScore += 6; // Perfect bear alignment  
                    else if (ma10 < ma20) momentumScore += 3;
                }

                // C) Higher Lows (bull) / Lower Highs (bear) - 4 pts
                if (closes.length >= 15) {
                    const thirds = Math.floor(closes.length / 3);
                    const firstThird = closes.slice(0, thirds);
                    const middleThird = closes.slice(thirds, thirds * 2);
                    const lastThird = closes.slice(thirds * 2);

                    const low1 = Math.min(...firstThird);
                    const low2 = Math.min(...middleThird);
                    const low3 = Math.min(...lastThird);

                    const high1 = Math.max(...firstThird);
                    const high2 = Math.max(...middleThird);
                    const high3 = Math.max(...lastThird);

                    if (candidate.trend === 'bullish' && low3 > low2 && low2 > low1) momentumScore += 4;
                    if (candidate.trend === 'bearish' && high3 < high2 && high2 < high1) momentumScore += 4;
                }

                // D) Not Parabolic (check acceleration) - 3 pts
                if (closes.length >= 10) {
                    const first5Avg = closes.slice(-10, -5).reduce((a, b) => a + b, 0) / 5;
                    const last5Avg = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
                    const acceleration = first5Avg > 0 ? Math.abs((last5Avg - first5Avg) / first5Avg) : 0;

                    if (acceleration < 0.10) momentumScore += 3; // Healthy <10% acceleration
                    else if (acceleration < 0.15) momentumScore += 1;
                    // Parabolic (>15%) = 0 points, too risky
                }

                scores.momentumHealth = Math.min(momentumScore, 20);
                totalScore += scores.momentumHealth;
            } catch (err) {
                scores.momentumHealth = 0;
            }

            // ========================================
            // 5. TREND STRENGTH (20 points)
            // ========================================
            try {
                let trendScore = 0;

                // A) Clear trend direction - 8 pts
                const trendSlope = closes.length >= 20
                    ? (closes[closes.length - 1] - closes[closes.length - 20]) / closes[closes.length - 20]
                    : (closes[closes.length - 1] - closes[0]) / closes[0];

                const trendMatches = (candidate.trend === 'bullish' && trendSlope > 0) ||
                    (candidate.trend === 'bearish' && trendSlope < 0);

                if (trendMatches && Math.abs(trendSlope) > 0.10) trendScore += 8; // Strong 10%+ trend
                else if (trendMatches && Math.abs(trendSlope) > 0.05) trendScore += 5;
                else if (trendMatches) trendScore += 3;

                // B) Consistent swing structure - 7 pts
                let swingCount = 0;
                let consistentSwings = 0;
                for (let i = 5; i < closes.length - 5; i += 5) {
                    const prior = closes[i - 5];
                    const current = closes[i];
                    const next = closes[Math.min(i + 5, closes.length - 1)];

                    if (candidate.trend === 'bullish' && current > prior && next > current) consistentSwings++;
                    if (candidate.trend === 'bearish' && current < prior && next < current) consistentSwings++;
                    swingCount++;
                }
                const swingConsistency = swingCount > 0 ? consistentSwings / swingCount : 0;
                trendScore += Math.floor(swingConsistency * 7);

                // C) ADX-like trending measure - 5 pts
                if (atr > 0 && closes.length >= 14) {
                    const dmPlus = [];
                    const dmMinus = [];
                    for (let i = 1; i < Math.min(14, highs.length); i++) {
                        const idx = highs.length - i;
                        const upMove = highs[idx] - highs[idx - 1];
                        const downMove = lows[idx - 1] - lows[idx];
                        dmPlus.push(upMove > downMove && upMove > 0 ? upMove : 0);
                        dmMinus.push(downMove > upMove && downMove > 0 ? downMove : 0);
                    }
                    const avgDmPlus = dmPlus.reduce((a, b) => a + b, 0) / dmPlus.length;
                    const avgDmMinus = dmMinus.reduce((a, b) => a + b, 0) / dmMinus.length;
                    const diPlus = (avgDmPlus / atr) * 100;
                    const diMinus = (avgDmMinus / atr) * 100;
                    const dx = Math.abs(diPlus - diMinus) / (diPlus + diMinus) * 100;

                    if (dx > 25) trendScore += 5; // Strong trend
                    else if (dx > 15) trendScore += 3;
                }

                scores.trendStrength = Math.min(trendScore, 20);
                totalScore += scores.trendStrength;
            } catch (err) {
                scores.trendStrength = 0;
            }

            // ========================================
            // FINAL SCORING & RETURN
            // ========================================
            totalScore = Math.max(0, Math.min(totalScore, 100));

            // Calculate additional metadata
            const totalReturn = (currentPrice - closes[0]) / closes[0];
            const returns = [];
            for (let i = 1; i < closes.length; i++) {
                const ret = (closes[i] - closes[i - 1]) / closes[i - 1];
                returns.push(ret);
            }
            const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
            const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
            const stdDev = Math.sqrt(variance);

            return {
                ...candidate,
                score: Math.round(totalScore),
                details: {
                    setupQuality: Math.round((scores.setupQuality || 0) * 10) / 10,
                    riskReward: Math.round((scores.riskReward || 0) * 10) / 10,
                    volumeBreadth: Math.round((scores.volumeBreadth || 0) * 10) / 10,
                    momentumHealth: Math.round((scores.momentumHealth || 0) * 10) / 10,
                    trendStrength: Math.round((scores.trendStrength || 0) * 10) / 10,
                    dataPoints: closes.length,
                    totalReturn: Math.round(totalReturn * 10000) / 100,
                    volatility: Math.round(stdDev * 10000) / 100,
                    avgDailyReturn: Math.round(meanReturn * 10000) / 100,
                    currentPrice: Math.round(currentPrice * 100) / 100,
                    ma10: Math.round(ma10 * 100) / 100,
                    ma20: Math.round(ma20 * 100) / 100,
                    ma50: Math.round(ma50 * 100) / 100,
                    atr: Math.round(atr * 100) / 100,
                    calculatedAt: Date.now(),
                    workerVersion: '3.0-setup-quality'
                }
            };
        });

        // Wait for all candidates to be scored (with async volume fetching)
        const scoredCandidates = await Promise.all(scoringPromises);

        const validScores = scoredCandidates.filter(c => c.score > 0);
        const avgScore = validScores.length > 0 ? validScores.reduce((sum, c) => sum + c.score, 0) / validScores.length : 0;

        self.postMessage({
            success: true,
            scoredCandidates,
            stats: {
                total: candidates.length,
                scored: validScores.length,
                avgScore: Math.round(avgScore * 10) / 10,
                timestamp: Date.now()
            }
        });
    } catch (error) {
        console.error('❌ Worker fatal error:', error);
        self.postMessage({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
};
