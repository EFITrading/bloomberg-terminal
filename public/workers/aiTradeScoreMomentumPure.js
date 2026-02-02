// ===================================================================
// PURE PRICE MOMENTUM SCORING WORKER
// ===================================================================
// Breakout strategy - looking for strength, not pullbacks
//
// SCORING FRAMEWORK (0-10 scale):
//   1. Trend Structure (0-3): Clean HH/HL or LL/LH sequence
//   2. Location Near Highs (0-3): Position near breakout (0-20% = sweet)
//   3. Expansion (0-2): Accelerating after compression
//   4. Level Breakout (0-2): Clean breaks of resistance
// ===================================================================

/**
 * Find swing highs and swing lows using simple lookback
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
            // 1. TREND STRUCTURE (0-3 points) - SAME AS SETUP
            // ==================================================
            let trendScore = 0;
            const { swingHighs, swingLows } = findSwings(highs, lows);

            if (candidate.trend === 'bullish') {
                const recentHighs = swingHighs.slice(-3);
                const recentLows = swingLows.slice(-3);

                if (recentHighs.length >= 2 && recentLows.length >= 2) {
                    const higherHighs = recentHighs[recentHighs.length - 1].price > recentHighs[recentHighs.length - 2].price;
                    const higherLows = recentLows[recentLows.length - 1].price > recentLows[recentLows.length - 2].price;

                    if (higherHighs && higherLows) trendScore = 3;
                    else if (higherHighs || higherLows) trendScore = 2;
                    else trendScore = 1;
                }
            } else {
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
            // 2. LOCATION NEAR HIGHS (0-3 points) - INVERTED
            // ==================================================
            let locationScore = 0;
            const last20 = closes.slice(-20);
            const recentHigh = Math.max(...last20);
            const recentLow = Math.min(...last20);
            const range = recentHigh - recentLow;

            if (range > 0) {
                const distanceFromHigh = (recentHigh - currentPrice) / range;

                // MOMENTUM: Want to be NEAR HIGHS, not pulled back
                // 0-20% from high = breakout zone
                if (distanceFromHigh <= 0.2) locationScore = 3; // Within 20% of high = breakout
                else if (distanceFromHigh <= 0.4) locationScore = 2; // 20-40% = building
                else if (distanceFromHigh <= 0.6) locationScore = 1; // 40-60% = mid-range
                // >60% = too deep = 0
            }

            details.locationNearHighs = locationScore;
            totalScore += locationScore;

            // ==================================================
            // 3. EXPANSION (0-2 points) - WITH FALSE BREAKOUT FILTER
            // ==================================================
            let expansionScore = 0;

            // Last 5 vs prior 5 range
            const last5 = closes.slice(-5);
            const prior5 = closes.slice(-10, -5);

            const last5Range = Math.max(...last5) - Math.min(...last5);
            const prior5Range = Math.max(...prior5) - Math.min(...prior5);

            if (prior5Range > 0) {
                const rangeRatio = last5Range / prior5Range;

                // Check for false breakout: if breakout candle closes < 60% of range
                const latestCandle = prices[prices.length - 1];
                if (typeof latestCandle === 'object' && latestCandle.high && latestCandle.low && latestCandle.close) {
                    const candleRange = latestCandle.high - latestCandle.low;
                    const closePosition = (latestCandle.close - latestCandle.low) / candleRange;

                    // False breakout filter: long upper wick = auction failure
                    if (closePosition < 0.6 && rangeRatio > 1.2) {
                        expansionScore = 0; // Reject false breakout
                        details.falseBreakout = true;
                    } else {
                        // MOMENTUM: Want EXPANSION (accelerating), not compression
                        if (rangeRatio > 1.4) expansionScore = 2; // 40% wider = strong expansion
                        else if (rangeRatio > 1.2) expansionScore = 1; // 20% wider = building momentum
                        details.falseBreakout = false;
                    }
                } else {
                    // Can't check false breakout without OHLC, use simple expansion
                    if (rangeRatio > 1.4) expansionScore = 2;
                    else if (rangeRatio > 1.2) expansionScore = 1;
                }
            }

            details.expansion = expansionScore;
            totalScore += expansionScore;

            // ==================================================
            // 4. LEVEL BREAKOUT (0-2 points) - INVERTED
            // ==================================================
            let breakoutScore = 0;

            // Find the most tested resistance level
            if (candidate.trend === 'bullish' && swingHighs.length >= 2) {
                // Group swing highs within 2% of each other
                const levels = {};
                for (const swing of swingHighs) {
                    const key = Math.round(swing.price / swing.price * 100 / 2) * 2;
                    if (!levels[key]) levels[key] = [];
                    levels[key].push(swing);
                }

                // Find most tested resistance
                let maxTests = 0;
                let resistancePrice = 0;
                for (const level in levels) {
                    if (levels[level].length > maxTests) {
                        maxTests = levels[level].length;
                        resistancePrice = levels[level][0].price;
                    }
                }

                // Check if breaking above resistance
                if (maxTests >= 2 && currentPrice > resistancePrice * 1.01) {
                    breakoutScore = 2; // Clean breakout above multi-test resistance
                } else if (maxTests >= 2 && currentPrice > resistancePrice * 0.99) {
                    breakoutScore = 1; // Near resistance, testing breakout
                }

            } else if (candidate.trend === 'bearish' && swingLows.length >= 2) {
                const levels = {};
                for (const swing of swingLows) {
                    const key = Math.round(swing.price / swing.price * 100 / 2) * 2;
                    if (!levels[key]) levels[key] = [];
                    levels[key].push(swing);
                }

                let maxTests = 0;
                let supportPrice = Infinity;
                for (const level in levels) {
                    if (levels[level].length > maxTests) {
                        maxTests = levels[level].length;
                        supportPrice = levels[level][0].price;
                    }
                }

                // Bearish breakdown below support
                if (maxTests >= 2 && currentPrice < supportPrice * 0.99) {
                    breakoutScore = 2;
                } else if (maxTests >= 2 && currentPrice < supportPrice * 1.01) {
                    breakoutScore = 1;
                }
            }

            details.levelBreakout = breakoutScore;
            totalScore += breakoutScore;

            // ==================================================
            // FINAL SCORE (0-10)
            // ==================================================
            const finalScore = Math.min(10, totalScore);

            return {
                ...candidate,
                score: finalScore * 10, // Scale to 0-100 for compatibility
                details: {
                    ...details,
                    momentumScore: finalScore,
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
