// ===================================================================
// PURE PRICE STRUCTURE SCORING WORKER
// ===================================================================
// No indicators, no volume, no seasonality - just clean price action
//
// SCORING FRAMEWORK (0-10 scale):
//   1. Trend Structure (0-3): Clean HH/HL or LL/LH sequence
//   2. Location in Range (0-3): Position in pullback (20-40% = sweet)
//   3. Compression (0-2): Coiling after expansion
//   4. Level Respect (0-2): Multiple bounces at key levels
// ===================================================================

/**
 * Find swing highs and swing lows using simple lookback
 * A swing high is higher than N bars before and after
 * A swing low is lower than N bars before and after
 */
function findSwings(highs, lows, lookback = 5) {
    const swingHighs = [];
    const swingLows = [];

    for (let i = lookback; i < highs.length - lookback; i++) {
        // Swing high: higher than surrounding bars
        let isSwingHigh = true;
        for (let j = i - lookback; j <= i + lookback; j++) {
            if (j !== i && highs[j] >= highs[i]) {
                isSwingHigh = false;
                break;
            }
        }
        if (isSwingHigh) swingHighs.push({ index: i, price: highs[i] });

        // Swing low: lower than surrounding bars
        let isSwingLow = true;
        for (let j = i - lookback; j <= i + lookback; j++) {
            if (j !== i && lows[j] <= lows[i]) {
                isSwingLow = false;
                break;
            }
        }
        if (isSwingLow) swingLows.push({ index: i, price: lows[i] });
    }

    return { swingHighs, swingLows };
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
        const scoringPromises = candidates.map(async (candidate) => {
            if (!candidate || !candidate.symbol || !candidate.trend) {
                return { ...candidate, score: 0, details: { error: 'Invalid candidate' } };
            }

            const prices = pricesMap[candidate.symbol];
            if (!prices || !Array.isArray(prices) || prices.length < 20) {
                return { ...candidate, score: 0, details: { error: 'Insufficient data' } };
            }

            const closes = prices.map(p => (typeof p === 'object' ? p.close : p)).filter(c => c !== null && c > 0);
            const highs = prices.map(p => (typeof p === 'object' ? p.high : p)).filter(h => h !== null && h > 0);
            const lows = prices.map(p => (typeof p === 'object' ? p.low : p)).filter(l => l !== null && l > 0);

            if (closes.length < 20) {
                return { ...candidate, score: 0, details: { error: 'No valid data' } };
            }

            const currentPrice = closes[closes.length - 1];
            let totalScore = 0;
            const details = {};

            // ==================================================
            // 1. TREND STRUCTURE (0-3 points)
            // ==================================================
            let trendScore = 0;
            const { swingHighs, swingLows } = findSwings(highs, lows);

            if (candidate.trend === 'bullish') {
                // Check for clean HH/HL sequence
                const recentHighs = swingHighs.slice(-3);
                const recentLows = swingLows.slice(-3);

                if (recentHighs.length >= 2 && recentLows.length >= 2) {
                    const higherHighs = recentHighs[recentHighs.length - 1].price > recentHighs[recentHighs.length - 2].price;
                    const higherLows = recentLows[recentLows.length - 1].price > recentLows[recentLows.length - 2].price;

                    if (higherHighs && higherLows) trendScore = 3; // Clean trend
                    else if (higherHighs || higherLows) trendScore = 2; // Sloppy but trending
                    else trendScore = 1; // Range with bias
                }
            } else {
                // Bearish: lower lows, lower highs
                const recentHighs = swingHighs.slice(-3);
                const recentLows = swingLows.slice(-3);

                if (recentHighs.length >= 2 && recentLows.length >= 2) {
                    const lowerHighs = recentHighs[recentHighs.length - 1].price < recentHighs[recentHighs.length - 2].price;
                    const lowerLows = recentLows[recentLows.length - 1].price < recentLows[recentLows.length - 2].price;

                    if (lowerHighs && lowerLows) trendScore = 3;
                    else if (lowerHighs || lowerLows) trendScore = 2;
                    else trendScore = 1;
                }
            }

            details.trendStructure = trendScore;
            totalScore += trendScore;

            // ==================================================
            // 2. LOCATION IN RANGE (0-3 points)
            // ==================================================
            let locationScore = 0;

            // Find last impulse high (not all-time high)
            const last30 = closes.slice(-30);
            const impulseHigh = Math.max(...last30);
            const impulseLow = Math.min(...last30);
            const impulseRange = impulseHigh - impulseLow;

            if (impulseRange > 0) {
                const pullbackDepth = (impulseHigh - currentPrice) / impulseRange;

                // Visual thirds: 20-40% = sweet spot
                if (pullbackDepth >= 0.2 && pullbackDepth <= 0.4) locationScore = 3;
                else if (pullbackDepth >= 0.4 && pullbackDepth <= 0.6) locationScore = 2;
                else if (pullbackDepth >= 0.6 && pullbackDepth <= 0.8) locationScore = 1;
                // <20% = chasing, >80% = bottom fishing = 0
            }

            details.locationInRange = locationScore;
            totalScore += locationScore;

            // ==================================================
            // 3. COMPRESSION VS EXPANSION (0-2 points)
            // ==================================================
            let compressionScore = 0;

            // Last 5 vs prior 5 range
            const last5 = closes.slice(-5);
            const prior5 = closes.slice(-10, -5);

            const last5Range = Math.max(...last5) - Math.min(...last5);
            const prior5Range = Math.max(...prior5) - Math.min(...prior5);

            if (prior5Range > 0) {
                const rangeRatio = last5Range / prior5Range;

                // Contracting after expansion = coiled = good
                if (rangeRatio < 0.6) compressionScore = 2;
                else if (rangeRatio < 0.8) compressionScore = 1;
                // Expanding or staying wide = 0
            }

            details.compression = compressionScore;
            totalScore += compressionScore;

            // ==================================================
            // 4. LEVEL RESPECT (0-2 points)
            // ==================================================
            let levelScore = 0;

            // Find the most tested level (swing low for bullish, swing high for bearish)
            if (candidate.trend === 'bullish' && swingLows.length >= 2) {
                // Group swing lows within 2% of each other
                const levels = {};
                for (const swing of swingLows) {
                    const key = Math.round(swing.price / swing.price * 100 / 2) * 2; // 2% buckets
                    if (!levels[key]) levels[key] = [];
                    levels[key].push(swing);
                }

                // Find most tested level
                let maxTests = 0;
                for (const level in levels) {
                    if (levels[level].length > maxTests) maxTests = levels[level].length;
                }

                if (maxTests >= 3) levelScore = 2; // 3+ bounces = institutional level
                else if (maxTests >= 2) levelScore = 1;

            } else if (candidate.trend === 'bearish' && swingHighs.length >= 2) {
                const levels = {};
                for (const swing of swingHighs) {
                    const key = Math.round(swing.price / swing.price * 100 / 2) * 2;
                    if (!levels[key]) levels[key] = [];
                    levels[key].push(swing);
                }

                let maxTests = 0;
                for (const level in levels) {
                    if (levels[level].length > maxTests) maxTests = levels[level].length;
                }

                if (maxTests >= 3) levelScore = 2;
                else if (maxTests >= 2) levelScore = 1;
            }

            details.levelRespect = levelScore;
            totalScore += levelScore;

            // ==================================================
            // FINAL SCORE (0-10)
            // ==================================================
            const finalScore = Math.min(10, totalScore);

            return {
                ...candidate,
                score: finalScore * 10, // Scale to 0-100 for compatibility
                details: {
                    ...details,
                    structureScore: finalScore,
                    currentPrice: Math.round(currentPrice * 100) / 100,
                    dataPoints: closes.length
                }
            };
        });

        const scoredCandidates = await Promise.all(scoringPromises);

        self.postMessage({
            success: true,
            scoredCandidates,
            stats: {
                total: candidates.length,
                scored: scoredCandidates.filter(c => c.score > 0).length
            }
        });
    } catch (error) {
        self.postMessage({
            success: false,
            error: error.message
        });
    }
};
