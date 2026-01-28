// Momentum-Volatility Trading Strategy Worker
// Scores trades based on breakout power, volatility expansion, and acceleration

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

// Timeframe-specific configuration for momentum scoring
function getTimeframeConfig(days, availableBars) {
    if (days <= 5) {
        // EMERGING (5 days): Focus on immediate momentum, breakouts, quick moves
        return {
            label: 'Emerging',
            maShort: Math.min(5, availableBars),
            maMedium: Math.min(10, availableBars),
            maLong: Math.min(20, availableBars),
            lookbackSupport: Math.min(10, availableBars),
            lookbackResilience: Math.min(5, availableBars),
            lookbackRetest: Math.min(5, availableBars),
            lookbackVolume: Math.min(10, availableBars),
            lookbackPullback: Math.min(5, availableBars),
            weights: {
                support: 15,      // Less important for very short-term
                resilience: 15,   // Recent strength matters
                retest: 20,       // Quick bounces critical
                volume: 15,       // Seasonality less important short-term
                pullback: 20      // Must be shallow
            },
            thresholds: {
                bounceRate: 0.7,      // Need high success rate
                resilienceRate: 0.6,  // Moderate resilience needed
                retestRate: 0.6,      // Good bounce quality
                accumulation: 1.2,    // Strong accumulation
                maxPullback: 3        // Very shallow pullbacks only
            }
        };
    } else if (days <= 21) {
        // SHORT-TERM (21 days): Swing trade setups, 1-month patterns
        return {
            label: 'Short-Term',
            maShort: Math.min(10, availableBars),
            maMedium: Math.min(20, availableBars),
            maLong: Math.min(50, availableBars),
            lookbackSupport: Math.min(15, availableBars),
            lookbackResilience: Math.min(10, availableBars),
            lookbackRetest: Math.min(10, availableBars),
            lookbackVolume: Math.min(15, availableBars),
            lookbackPullback: Math.min(10, availableBars),
            weights: {
                support: 20,
                resilience: 20,
                retest: 20,
                volume: 20,      // Seasonality moderate importance
                pullback: 15
            },
            thresholds: {
                bounceRate: 0.65,
                resilienceRate: 0.5,
                retestRate: 0.6,
                accumulation: 1.0,
                maxPullback: 8
            }
        };
    } else if (days <= 80) {
        // MEDIUM-TERM (80 days): Trend following, longer patterns
        return {
            label: 'Medium-Term',
            maShort: Math.min(20, availableBars),
            maMedium: Math.min(50, availableBars),
            maLong: Math.min(100, availableBars),
            lookbackSupport: Math.min(20, availableBars),
            lookbackResilience: Math.min(10, availableBars),
            lookbackRetest: Math.min(15, availableBars),
            lookbackVolume: Math.min(20, availableBars),
            lookbackPullback: Math.min(20, availableBars),
            weights: {
                support: 25,    // Support holding most important
                resilience: 20,
                retest: 20,
                volume: 25,     // Seasonality important for quarterly
                pullback: 15
            },
            thresholds: {
                bounceRate: 0.7,
                resilienceRate: 0.5,
                retestRate: 0.5,
                accumulation: 0.9,
                maxPullback: 15
            }
        };
    } else {
        // LONG-TERM (180+ days): Position trades, multi-month trends
        return {
            label: 'Long-Term',
            maShort: Math.min(50, availableBars),
            maMedium: Math.min(100, availableBars),
            maLong: Math.min(200, availableBars),
            lookbackSupport: Math.min(40, availableBars),
            lookbackResilience: Math.min(20, availableBars),
            lookbackRetest: Math.min(30, availableBars),
            lookbackVolume: Math.min(30, availableBars),
            lookbackPullback: Math.min(40, availableBars),
            weights: {
                support: 30,    // Long-term support is critical
                resilience: 25, // Must weather storms
                retest: 15,     // Less critical over long periods
                volume: 30,     // Seasonality MOST important for long-term
                pullback: 15
            },
            thresholds: {
                bounceRate: 0.75,     // Must hold support well
                resilienceRate: 0.6,  // Must show consistent strength
                retestRate: 0.5,      // Moderate retest quality OK
                accumulation: 0.7,    // Lower accumulation threshold
                maxPullback: 25       // Can handle deeper pullbacks
            }
        };
    }
}

// Fetch volume data from Polygon API for missing data
async function fetchVolumeData(symbol, days = 100) {
    try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const start = startDate.toISOString().split('T')[0];
        const end = endDate.toISOString().split('T')[0];

        const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${start}/${end}?apiKey=${POLYGON_API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.results && data.results.length > 0) {
            return data.results.map(bar => bar.v);
        }
        return [];
    } catch (error) {
        return [];
    }
}

// Fetch 10-year seasonality data
async function fetchSeasonalityData(symbol) {
    try {
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
        const url = `${baseUrl}/api/seasonal-data?symbol=${symbol}&years=10`;

        const response = await fetch(url);
        if (!response.ok) return null;

        const data = await response.json();
        return data;
    } catch (error) {
        return null;
    }
}

function getDayOfYear(date) {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date - start;
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
}

function parseDayOfYear(dateStr) {
    const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
    const parts = dateStr.split(' ');
    if (parts.length !== 2) return 1;

    const month = months[parts[0]];
    const day = parseInt(parts[1]);

    if (month === undefined || isNaN(day)) return 1;

    const date = new Date(2024, month, day);
    return getDayOfYear(date);
}

function formatDayOfYear(dayOfYear) {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const year = 2024; // Leap year for consistent calculations
    const date = new Date(year, 0);
    date.setDate(dayOfYear);

    const month = monthNames[date.getMonth()];
    const day = date.getDate();

    return `${month} ${day}`;
}

function isInPeriod(currentDay, startDay, endDay) {
    if (startDay <= endDay) {
        return currentDay >= startDay && currentDay <= endDay;
    } else {
        return currentDay >= startDay || currentDay <= endDay;
    }
}

function findSweetSpot(dailyData) {
    let bestSweetSpot = { startDay: 1, endDay: 50, totalReturn: -999999 };

    const dayLookup = {};
    dailyData.forEach(day => {
        dayLookup[day.dayOfYear] = day;
    });

    for (let windowSize = 50; windowSize <= 90; windowSize++) {
        for (let startDay = 1; startDay <= 365 - windowSize; startDay++) {
            const endDay = startDay + windowSize - 1;
            let cumulativeReturn = 0;
            let validDays = 0;

            for (let day = startDay; day <= endDay; day++) {
                if (dayLookup[day]) {
                    cumulativeReturn += dayLookup[day].avgReturn;
                    validDays++;
                }
            }

            if (validDays >= Math.floor(windowSize * 0.8)) {
                if (cumulativeReturn > bestSweetSpot.totalReturn) {
                    bestSweetSpot = { startDay, endDay, totalReturn: cumulativeReturn };
                }
            }
        }
    }

    return bestSweetSpot;
}

function findPainPoint(dailyData) {
    let worstPainPoint = { startDay: 1, endDay: 50, totalReturn: 999999 };

    const dayLookup = {};
    dailyData.forEach(day => {
        dayLookup[day.dayOfYear] = day;
    });

    for (let windowSize = 50; windowSize <= 90; windowSize++) {
        for (let startDay = 1; startDay <= 365 - windowSize; startDay++) {
            const endDay = startDay + windowSize - 1;
            let cumulativeReturn = 0;
            let validDays = 0;

            for (let day = startDay; day <= endDay; day++) {
                if (dayLookup[day]) {
                    cumulativeReturn += dayLookup[day].avgReturn;
                    validDays++;
                }
            }

            if (validDays >= Math.floor(windowSize * 0.8)) {
                if (cumulativeReturn < worstPainPoint.totalReturn) {
                    worstPainPoint = { startDay, endDay, totalReturn: cumulativeReturn };
                }
            }
        }
    }

    return worstPainPoint;
}

// Main message handler - BATCH PROCESSING
self.onmessage = async function (e) {
    const { candidates, pricesMap, timeframe } = e.data;

    if (!candidates || !Array.isArray(candidates)) {
        console.error('Momentum Worker: Invalid candidates array');
        self.postMessage({ success: false, error: 'Invalid candidates array' });
        return;
    }

    if (!pricesMap || typeof pricesMap !== 'object') {
        console.error('Momentum Worker: Invalid pricesMap object');
        self.postMessage({ success: false, error: 'Invalid pricesMap object' });
        return;
    }

    // Map timeframe to actual days for context
    const timeframeMap = {
        'life': { days: 5, label: 'Emerging' },
        'developing': { days: 21, label: 'Short-Term' },
        'momentum': { days: 80, label: 'Medium-Term' },
        'legacy': { days: 180, label: 'Long-Term' }
    };
    const timeframeInfo = timeframeMap[timeframe?.toLowerCase()] || { days: 80, label: 'Medium-Term' };

    try {
        const scoringPromises = candidates.map(async (candidate, idx) => {
            if (!candidate || !candidate.symbol || !candidate.trend) {
                return { ...candidate, score: 0, details: { error: 'Invalid candidate' }, strategy: 'momentum' };
            }

            const prices = pricesMap[candidate.symbol];
            if (!prices || !Array.isArray(prices) || prices.length < 20) {
                return { ...candidate, score: 0, details: {}, strategy: 'momentum' };
            }

            return await scoreMomentumCandidate(candidate, prices, timeframeInfo);
        });

        const scoredCandidates = await Promise.all(scoringPromises);
        const validScores = scoredCandidates.filter(c => c.score > 0);
        self.postMessage({ success: true, scoredCandidates });
    } catch (error) {
        console.error('Momentum Worker error:', error);
        self.postMessage({ success: false, error: error.message });
    }
};

// Score a single candidate using momentum-volatility strategy
async function scoreMomentumCandidate(candidate, prices, timeframeInfo) {
    const { symbol, trend, relativePerformance } = candidate;
    const closes = prices.map(p => p.close);
    const highs = prices.map(p => p.high);
    const lows = prices.map(p => p.low);
    const volumes = prices.map(p => p.volume || 0);

    // Timeframe-specific lookback periods and weights
    const timeframeConfig = getTimeframeConfig(timeframeInfo.days, closes.length);

    // Fetch volume data if more than 50% are zeros
    let validVolumes = volumes;
    const zeroCount = volumes.filter(v => v === 0).length;
    if (zeroCount > volumes.length * 0.5) {
        const fetchedVolumes = await fetchVolumeData(symbol, prices.length);
        if (fetchedVolumes.length > 0) {
            validVolumes = fetchedVolumes.slice(-prices.length);
        }
    }

    // Calculate moving averages using timeframe-specific periods
    const maShort = closes.slice(-timeframeConfig.maShort).reduce((a, b) => a + b, 0) / timeframeConfig.maShort;
    const maMedium = closes.length >= timeframeConfig.maMedium
        ? closes.slice(-timeframeConfig.maMedium).reduce((a, b) => a + b, 0) / timeframeConfig.maMedium
        : maShort;
    const maLong = closes.length >= timeframeConfig.maLong
        ? closes.slice(-timeframeConfig.maLong).reduce((a, b) => a + b, 0) / timeframeConfig.maLong
        : maMedium;
    const currentPrice = closes[closes.length - 1];

    // 1. SUPPORT HOLDING STRENGTH (weighted by timeframe) - INSTITUTIONAL LOGIC
    let supportStrength = 0;

    const supportLookback = Math.min(timeframeConfig.lookbackSupport, closes.length - 1);

    // A) ORDER FLOW ABSORPTION (40% of support weight)
    // Measures how aggressively buyers step in on selloffs
    let absorptionScore = 0;
    let selloffCount = 0;
    let strongAbsorptionCount = 0;

    for (let i = closes.length - supportLookback; i < closes.length; i++) {
        if (i < 2) continue;

        // Identify selloff: 2+ consecutive down bars
        if (closes[i] < closes[i - 1] && closes[i - 1] < closes[i - 2]) {
            selloffCount++;

            // Check volume pattern: Front-loaded volume = absorption
            const selloffVol1 = validVolumes[i - 1] || 0;
            const selloffVol2 = validVolumes[i] || 0;
            const avgVol = validVolumes.slice(Math.max(0, i - 10), i).reduce((a, b) => a + b, 0) / 10;

            // Volume front-loaded (first day has more volume)
            const frontLoaded = selloffVol1 > selloffVol2 && selloffVol1 > avgVol * 1.2;

            // Price efficiency: Large volume with small price move = absorption
            const priceMove = Math.abs((closes[i] - closes[i - 2]) / closes[i - 2]);
            const volumeSpike = (selloffVol1 + selloffVol2) / 2 > avgVol * 1.5;
            const efficientAbsorption = volumeSpike && priceMove < 0.03; // <3% move despite volume

            // Reversal speed: Quick snapback = strong buying
            let quickReversal = false;
            if (i < closes.length - 2) {
                const barsToRecover = closes.slice(i, Math.min(i + 5, closes.length)).findIndex(c => c > closes[i - 2]);
                if (barsToRecover >= 0 && barsToRecover <= 2) {
                    quickReversal = true; // Recovered in 1-2 bars
                }
            }

            // Score this selloff
            if ((frontLoaded || efficientAbsorption) && quickReversal) {
                strongAbsorptionCount++;
            } else if (frontLoaded || efficientAbsorption || quickReversal) {
                strongAbsorptionCount += 0.5;
            }
        }
    }

    if (selloffCount > 0) {
        const absorptionRate = strongAbsorptionCount / selloffCount;
        if (absorptionRate > 0.7) absorptionScore = timeframeConfig.weights.support * 0.40;
        else if (absorptionRate > 0.5) absorptionScore = timeframeConfig.weights.support * 0.30;
        else if (absorptionRate > 0.3) absorptionScore = timeframeConfig.weights.support * 0.20;
        else absorptionScore = timeframeConfig.weights.support * 0.10;
    }

    supportStrength += absorptionScore;

    // B) CLOSE POSITION STRENGTH (35% of support weight)
    // Where does price close relative to daily range - shows control
    let closePositionScore = 0;
    let validBars = 0;
    let strongCloses = 0;
    let redDayStrongCloses = 0;
    let redDayCount = 0;

    for (let i = closes.length - supportLookback; i < closes.length; i++) {
        if (i < 1) continue;

        const high = highs[i];
        const low = lows[i];
        const close = closes[i];
        const range = high - low;

        if (range > 0) {
            validBars++;
            const closePosition = (close - low) / range; // 0 = closed at low, 1 = closed at high

            // For bullish: want to close in upper 70% of range
            // For bearish: want to close in lower 30% of range
            if (trend === 'bullish' && closePosition > 0.70) {
                strongCloses++;
            } else if (trend === 'bearish' && closePosition < 0.30) {
                strongCloses++;
            }

            // Extra credit: Strong closes on red days (shows buying despite selling)
            const isRedDay = close < closes[i - 1];
            if (isRedDay) {
                redDayCount++;
                if ((trend === 'bullish' && closePosition > 0.60) ||
                    (trend === 'bearish' && closePosition < 0.40)) {
                    redDayStrongCloses++;
                }
            }
        }
    }

    if (validBars > 0) {
        const closeStrength = strongCloses / validBars;
        const redDayStrength = redDayCount > 0 ? redDayStrongCloses / redDayCount : 0;

        // Combine overall close strength + red day strength
        const combinedStrength = (closeStrength * 0.6) + (redDayStrength * 0.4);

        if (combinedStrength > 0.7) closePositionScore = timeframeConfig.weights.support * 0.35;
        else if (combinedStrength > 0.5) closePositionScore = timeframeConfig.weights.support * 0.25;
        else if (combinedStrength > 0.3) closePositionScore = timeframeConfig.weights.support * 0.15;
        else closePositionScore = timeframeConfig.weights.support * 0.05;
    }

    supportStrength += closePositionScore;

    // C) MOMENTUM DECAY RATE (25% of support weight)
    // How well does momentum hold during pullbacks - leading indicator
    let momentumDecayScore = 0;

    if (closes.length >= 20) {
        // Calculate ROC (Rate of Change) momentum over time
        const rocPeriod = Math.min(10, Math.floor(closes.length / 3));
        const rocValues = [];

        for (let i = rocPeriod; i < closes.length; i++) {
            const roc = (closes[i] - closes[i - rocPeriod]) / closes[i - rocPeriod] * 100;
            rocValues.push(roc);
        }

        // Find pullback periods (price declining but check if momentum holds)
        let pullbackMomentumHolds = 0;
        let pullbackCount = 0;

        for (let i = 3; i < rocValues.length - 1; i++) {
            // Identify pullback: price lower than 3 bars ago
            const priceChange = (closes[i + rocPeriod] - closes[i + rocPeriod - 3]) / closes[i + rocPeriod - 3];

            if (priceChange < 0) { // Pullback detected
                pullbackCount++;

                // Check if momentum decayed slowly (held elevated)
                const momentumChange = rocValues[i] - rocValues[i - 3];
                const avgMomentum = rocValues.slice(Math.max(0, i - 10), i).reduce((a, b) => a + b, 0) / 10;

                // Momentum held if it didn't decay much or stayed above baseline
                if (momentumChange > -2 || rocValues[i] > avgMomentum * 0.5) {
                    pullbackMomentumHolds++;
                }
            }
        }

        // Check reacceleration: After pullback, does momentum snap back quickly?
        let reaccelerationCount = 0;
        let reaccelerationOps = 0;

        for (let i = 5; i < rocValues.length - 2; i++) {
            // After momentum dipped, did it reaccelerate within 2 bars?
            if (rocValues[i] < rocValues[i - 3] && rocValues[i] < 0) {
                reaccelerationOps++;
                const nextMomentum = Math.max(rocValues[i + 1], rocValues[i + 2] || 0);
                if (nextMomentum > rocValues[i] * 1.5 || nextMomentum > 0) {
                    reaccelerationCount++;
                }
            }
        }

        // Score based on momentum holding + reacceleration
        const holdRate = pullbackCount > 0 ? pullbackMomentumHolds / pullbackCount : 0.5;
        const reaccelRate = reaccelerationOps > 0 ? reaccelerationCount / reaccelerationOps : 0.5;
        const combinedMomentum = (holdRate * 0.6) + (reaccelRate * 0.4);

        if (combinedMomentum > 0.7) momentumDecayScore = timeframeConfig.weights.support * 0.25;
        else if (combinedMomentum > 0.5) momentumDecayScore = timeframeConfig.weights.support * 0.18;
        else if (combinedMomentum > 0.3) momentumDecayScore = timeframeConfig.weights.support * 0.10;
        else momentumDecayScore = timeframeConfig.weights.support * 0.05;
    }

    supportStrength += momentumDecayScore;

    // 2. RESILIENCE - "THE ONE" INDICATORS (weighted by timeframe)
    let resilience = 0;

    const resilienceLookback = Math.min(timeframeConfig.lookbackResilience, closes.length);

    // A) LIQUIDITY VACUUM BEHAVIOR (40% of resilience weight)
    // Tracks unfilled gaps - when stock leaves prices behind forever
    let vacuumScore = 0;
    let gapCount = 0;
    let unfilledGapCount = 0;
    let gapContinuationPower = 0;

    for (let i = closes.length - resilienceLookback; i < closes.length - 1; i++) {
        if (i < 1) continue;

        // Identify gaps >1.5%
        const gapSize = Math.abs((closes[i] - closes[i - 1]) / closes[i - 1]) * 100;

        if (gapSize > 1.5) {
            gapCount++;
            const gapDirection = closes[i] > closes[i - 1] ? 'up' : 'down';
            const gapLevel = closes[i - 1]; // Where gap started

            // Check if gap ever filled in next 10 bars (or until end)
            let gapFilled = false;
            const checkBars = Math.min(10, closes.length - i - 1);

            for (let j = 1; j <= checkBars; j++) {
                if (gapDirection === 'up' && lows[i + j] <= gapLevel) {
                    gapFilled = true;
                    break;
                } else if (gapDirection === 'down' && highs[i + j] >= gapLevel) {
                    gapFilled = true;
                    break;
                }
            }

            if (!gapFilled) {
                unfilledGapCount++;

                // Measure continuation power (price keeps going after gap)
                const priceAfterGap = closes[Math.min(i + 3, closes.length - 1)];
                const continuation = Math.abs((priceAfterGap - closes[i]) / closes[i]) * 100;
                gapContinuationPower += continuation;
            }
        }
    }

    if (gapCount > 0) {
        const unfilledRate = unfilledGapCount / gapCount;
        const avgContinuation = unfilledGapCount > 0 ? gapContinuationPower / unfilledGapCount : 0;

        // Score based on unfilled gaps + continuation
        const vacuumStrength = (unfilledRate * 0.6) + Math.min(avgContinuation / 5, 0.4); // Cap continuation at 5%

        if (vacuumStrength > 0.8) vacuumScore = timeframeConfig.weights.resilience * 0.40;
        else if (vacuumStrength > 0.6) vacuumScore = timeframeConfig.weights.resilience * 0.30;
        else if (vacuumStrength > 0.4) vacuumScore = timeframeConfig.weights.resilience * 0.20;
        else if (vacuumStrength > 0.2) vacuumScore = timeframeConfig.weights.resilience * 0.10;
    }

    resilience += vacuumScore;

    // B) CONSECUTIVE HIGHER LOW STREAK (35% of resilience weight)
    // Perfect staircase structure - each low higher than prior
    let higherLowScore = 0;

    // Find swing lows (local minimums)
    const swingLows = [];
    for (let i = 2; i < closes.length - 2; i++) {
        // Swing low if low is lower than 2 bars before and after
        if (lows[i] < lows[i - 1] && lows[i] < lows[i - 2] &&
            lows[i] < lows[i + 1] && lows[i] < lows[i + 2]) {
            swingLows.push({ index: i, low: lows[i] });
        }
    }

    // Calculate longest consecutive higher low streak
    let currentStreak = 1;
    let maxStreak = 1;

    for (let i = 1; i < swingLows.length; i++) {
        if (swingLows[i].low > swingLows[i - 1].low) {
            currentStreak++;
            maxStreak = Math.max(maxStreak, currentStreak);
        } else {
            currentStreak = 1;
        }
    }

    // Also check if current structure is holding (most recent lows)
    let recentStructureIntact = true;
    if (swingLows.length >= 3) {
        const lastThree = swingLows.slice(-3);
        if (!(lastThree[2].low > lastThree[1].low && lastThree[1].low > lastThree[0].low)) {
            recentStructureIntact = false;
        }
    }

    // Score based on streak length + recent structure
    const streakScore = Math.min(maxStreak / 12, 1.0); // 12+ streak = max score
    const structureBonus = recentStructureIntact ? 0.2 : 0;
    const combinedStructure = (streakScore * 0.8) + structureBonus;

    if (trend === 'bullish') {
        if (combinedStructure > 0.8) higherLowScore = timeframeConfig.weights.resilience * 0.35;
        else if (combinedStructure > 0.6) higherLowScore = timeframeConfig.weights.resilience * 0.25;
        else if (combinedStructure > 0.4) higherLowScore = timeframeConfig.weights.resilience * 0.15;
        else if (combinedStructure > 0.2) higherLowScore = timeframeConfig.weights.resilience * 0.08;
    } else {
        // For bearish, look for lower highs instead
        const swingHighs = [];
        for (let i = 2; i < closes.length - 2; i++) {
            if (highs[i] > highs[i - 1] && highs[i] > highs[i - 2] &&
                highs[i] > highs[i + 1] && highs[i] > highs[i + 2]) {
                swingHighs.push({ index: i, high: highs[i] });
            }
        }

        let lowerHighStreak = 1;
        let maxLowerHighStreak = 1;
        for (let i = 1; i < swingHighs.length; i++) {
            if (swingHighs[i].high < swingHighs[i - 1].high) {
                lowerHighStreak++;
                maxLowerHighStreak = Math.max(maxLowerHighStreak, lowerHighStreak);
            } else {
                lowerHighStreak = 1;
            }
        }

        const bearStreakScore = Math.min(maxLowerHighStreak / 12, 1.0);
        if (bearStreakScore > 0.8) higherLowScore = timeframeConfig.weights.resilience * 0.35;
        else if (bearStreakScore > 0.6) higherLowScore = timeframeConfig.weights.resilience * 0.25;
        else if (bearStreakScore > 0.4) higherLowScore = timeframeConfig.weights.resilience * 0.15;
    }

    resilience += higherLowScore;

    // C) RELATIVE VOLUME DIVERGENCE (25% of resilience weight)
    // Volume asymmetry - up days vs down days
    let volumeDivergenceScore = 0;

    let upDayVolumes = [];
    let downDayVolumes = [];

    for (let i = closes.length - resilienceLookback; i < closes.length; i++) {
        if (i < 1) continue;

        const priceChange = closes[i] - closes[i - 1];
        const vol = validVolumes[i];

        if (vol > 0) {
            if (priceChange > 0) {
                upDayVolumes.push(vol);
            } else if (priceChange < 0) {
                downDayVolumes.push(vol);
            }
        }
    }

    if (upDayVolumes.length > 0 && downDayVolumes.length > 0) {
        const avgUpVol = upDayVolumes.reduce((a, b) => a + b, 0) / upDayVolumes.length;
        const avgDownVol = downDayVolumes.reduce((a, b) => a + b, 0) / downDayVolumes.length;

        // Calculate volume skew
        const volumeSkew = trend === 'bullish'
            ? avgUpVol / avgDownVol  // For bullish: want high volume on up days
            : avgDownVol / avgUpVol; // For bearish: want high volume on down days

        // Elite stocks show massive asymmetry
        if (volumeSkew > 2.5) volumeDivergenceScore = timeframeConfig.weights.resilience * 0.25;
        else if (volumeSkew > 2.0) volumeDivergenceScore = timeframeConfig.weights.resilience * 0.20;
        else if (volumeSkew > 1.5) volumeDivergenceScore = timeframeConfig.weights.resilience * 0.15;
        else if (volumeSkew > 1.3) volumeDivergenceScore = timeframeConfig.weights.resilience * 0.10;
        else if (volumeSkew > 1.1) volumeDivergenceScore = timeframeConfig.weights.resilience * 0.05;
    }

    resilience += volumeDivergenceScore;

    // 3. RETEST QUALITY (weighted by timeframe) - BREAKOUT & HOLD STRENGTH
    let retestQuality = 0;

    const retestLookback = Math.min(timeframeConfig.lookbackRetest, closes.length - 2);

    // Calculate 52-week high/low (or max available data)
    const fiftyTwoWeekHigh = Math.max(...closes);
    const fiftyTwoWeekLow = Math.min(...closes);

    // A) PROXIMITY TO HIGHS/LOWS (40% of retest score)
    if (trend === 'bullish') {
        const distanceFromHigh = (fiftyTwoWeekHigh - currentPrice) / fiftyTwoWeekHigh * 100;

        // At or near 52-week high = STRONGEST
        if (distanceFromHigh < 1) retestQuality += timeframeConfig.weights.retest * 0.40; // Within 1% of highs
        else if (distanceFromHigh < 3) retestQuality += timeframeConfig.weights.retest * 0.30; // Within 3%
        else if (distanceFromHigh < 5) retestQuality += timeframeConfig.weights.retest * 0.20; // Within 5%
        else if (distanceFromHigh < 10) retestQuality += timeframeConfig.weights.retest * 0.10; // Within 10%
        // More than 10% from highs = poor retest
    } else {
        // Bearish: want to be at or near 52-week lows
        const distanceFromLow = (currentPrice - fiftyTwoWeekLow) / fiftyTwoWeekLow * 100;

        if (distanceFromLow < 1) retestQuality += timeframeConfig.weights.retest * 0.40;
        else if (distanceFromLow < 3) retestQuality += timeframeConfig.weights.retest * 0.30;
        else if (distanceFromLow < 5) retestQuality += timeframeConfig.weights.retest * 0.20;
        else if (distanceFromLow < 10) retestQuality += timeframeConfig.weights.retest * 0.10;
    }

    // B) BREAKOUT & HOLD PATTERN (30% of retest score)
    // Look for stocks making new highs and HOLDING them (not giving back gains)
    let breakoutCount = 0;
    let holdCount = 0;

    for (let i = closes.length - retestLookback; i < closes.length - 1; i++) {
        if (i < retestLookback) continue;

        // Check if this day made a new high/low relative to prior period
        const priorPeriod = closes.slice(Math.max(0, i - retestLookback), i);
        const priorHigh = Math.max(...priorPeriod);
        const priorLow = Math.min(...priorPeriod);

        if (trend === 'bullish' && closes[i] > priorHigh) {
            // Made a new high - did it HOLD it?
            breakoutCount++;

            // Check next few days - did price stay above 90% of the breakout level?
            const holdPeriod = Math.min(3, closes.length - i - 1);
            let held = true;
            for (let j = 1; j <= holdPeriod; j++) {
                if (closes[i + j] < closes[i] * 0.90) { // Gave back more than 10%
                    held = false;
                    break;
                }
            }
            if (held) holdCount++;
        } else if (trend === 'bearish' && closes[i] < priorLow) {
            // Made a new low - did it HOLD it?
            breakoutCount++;

            const holdPeriod = Math.min(3, closes.length - i - 1);
            let held = true;
            for (let j = 1; j <= holdPeriod; j++) {
                if (closes[i + j] > closes[i] * 1.10) { // Bounced back more than 10%
                    held = false;
                    break;
                }
            }
            if (held) holdCount++;
        }
    }

    if (breakoutCount > 0) {
        const holdRate = holdCount / breakoutCount;
        if (holdRate > 0.7) retestQuality += timeframeConfig.weights.retest * 0.30; // 70%+ hold rate
        else if (holdRate > 0.5) retestQuality += timeframeConfig.weights.retest * 0.20;
        else if (holdRate > 0.3) retestQuality += timeframeConfig.weights.retest * 0.10;
    }

    // C) PROGRESSIVE HIGHS/LOWS (30% of retest score)
    // Divide timeframe into thirds and check for progression
    if (closes.length >= 9) {
        const third = Math.floor(closes.length / 3);
        const firstThird = closes.slice(0, third);
        const middleThird = closes.slice(third, third * 2);
        const lastThird = closes.slice(third * 2);

        const high1 = Math.max(...firstThird);
        const high2 = Math.max(...middleThird);
        const high3 = Math.max(...lastThird);

        const low1 = Math.min(...firstThird);
        const low2 = Math.min(...middleThird);
        const low3 = Math.min(...lastThird);

        if (trend === 'bullish') {
            // Want progressive higher highs
            if (high3 > high2 && high2 > high1) {
                retestQuality += timeframeConfig.weights.retest * 0.30; // Perfect progression
            } else if (high3 > high2 || high2 > high1) {
                retestQuality += timeframeConfig.weights.retest * 0.15; // Some progression
            }
        } else {
            // Want progressive lower lows
            if (low3 < low2 && low2 < low1) {
                retestQuality += timeframeConfig.weights.retest * 0.30;
            } else if (low3 < low2 || low2 < low1) {
                retestQuality += timeframeConfig.weights.retest * 0.15;
            }
        }
    }

    // 4. RELATIVE STRENGTH ALIGNMENT (weighted by timeframe)
    let relativeStrength = 0;

    try {
        // Calculate relative performance over 3 timeframes: 5d (week), 13d, 21d (monthly)
        const timeframes = [
            { days: 5, name: 'week' },
            { days: 13, name: '13d' },
            { days: 21, name: 'monthly' }
        ];

        let alignedTimeframes = 0;

        for (const tf of timeframes) {
            if (closes.length >= tf.days + 1) {
                const startPrice = closes[closes.length - tf.days - 1];
                const endPrice = closes[closes.length - 1];
                const stockReturn = ((endPrice - startPrice) / startPrice) * 100;

                // Simplified: positive return = outperforming, negative = underperforming
                const isOutperforming = stockReturn > 0;
                const isUnderperforming = stockReturn < 0;

                if (trend === 'bullish' && isOutperforming) {
                    alignedTimeframes++;
                } else if (trend === 'bearish' && isUnderperforming) {
                    alignedTimeframes++;
                }
            }
        }

        // Award full points only if ALL 3 timeframes are aligned
        if (alignedTimeframes === 3) {
            relativeStrength = timeframeConfig.weights.volume;
        }
    } catch (error) {
        console.error(`Relative strength error for ${symbol}:`, error.message);
        relativeStrength = 0;
    }

    // 5. PULLBACK DEPTH (weighted by timeframe)
    let pullbackDepth = 0;

    // Find highest high/lowest low in timeframe-specific lookback
    const pullbackLookback = Math.min(timeframeConfig.lookbackPullback, closes.length);
    const recentHigh = Math.max(...closes.slice(-pullbackLookback));
    const pullbackPct = (recentHigh - currentPrice) / recentHigh * 100;

    if (trend === 'bullish') {
        // Bullish: Shallow pullbacks are good (timeframe-dependent max)
        if (pullbackPct < timeframeConfig.thresholds.maxPullback * 0.3) pullbackDepth += timeframeConfig.weights.pullback;
        else if (pullbackPct < timeframeConfig.thresholds.maxPullback * 0.5) pullbackDepth += timeframeConfig.weights.pullback * 0.67;
        else if (pullbackPct < timeframeConfig.thresholds.maxPullback * 0.7) pullbackDepth += timeframeConfig.weights.pullback * 0.4;
        else if (pullbackPct < timeframeConfig.thresholds.maxPullback) pullbackDepth += timeframeConfig.weights.pullback * 0.2;
        // Deeper than max = no points
    } else {
        // Bearish: Looking for stocks holding near lows
        const recentLow = Math.min(...closes.slice(-pullbackLookback));
        const bounceFromLow = (currentPrice - recentLow) / recentLow * 100;

        if (bounceFromLow < timeframeConfig.thresholds.maxPullback * 0.3) pullbackDepth += timeframeConfig.weights.pullback;
        else if (bounceFromLow < timeframeConfig.thresholds.maxPullback * 0.5) pullbackDepth += timeframeConfig.weights.pullback * 0.67;
        else if (bounceFromLow < timeframeConfig.thresholds.maxPullback * 0.7) pullbackDepth += timeframeConfig.weights.pullback * 0.4;
    }

    const totalScore = Math.min(100, supportStrength + resilience + retestQuality + relativeStrength + pullbackDepth);

    return {
        ...candidate,
        score: totalScore,
        details: {
            supportStrength: Math.round(supportStrength),
            resilience: Math.round(resilience),
            retestQuality: Math.round(retestQuality),
            relativeStrength: Math.round(relativeStrength),
            pullbackDepth: Math.round(pullbackDepth),
            currentPrice: currentPrice
        },
        strategy: 'momentum'
    };
}

// Calculate Average True Range
function calculateATR(highs, lows, closes, period = 14) {
    const tr = [];
    for (let i = 1; i < highs.length; i++) {
        const high = highs[i];
        const low = lows[i];
        const prevClose = closes[i - 1];
        tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
    }

    const atr = [];
    let sum = tr.slice(0, period).reduce((a, b) => a + b, 0);
    atr.push(sum / period);

    for (let i = period; i < tr.length; i++) {
        atr.push((atr[atr.length - 1] * (period - 1) + tr[i]) / period);
    }

    return atr;
}

// Calculate Bollinger Bands
function calculateBollingerBands(prices, period = 20, stdDev = 2) {
    const sma = [];
    const upper = [];
    const lower = [];

    for (let i = period - 1; i < prices.length; i++) {
        const slice = prices.slice(i - period + 1, i + 1);
        const mean = slice.reduce((a, b) => a + b, 0) / period;
        const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
        const std = Math.sqrt(variance);

        sma.push(mean);
        upper.push(mean + std * stdDev);
        lower.push(mean - std * stdDev);
    }

    return { sma, upper, lower };
}

// Calculate ADX (Average Directional Index)
function calculateADX(highs, lows, closes, period = 14) {
    const plusDM = [];
    const minusDM = [];

    for (let i = 1; i < highs.length; i++) {
        const highDiff = highs[i] - highs[i - 1];
        const lowDiff = lows[i - 1] - lows[i];

        plusDM.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0);
        minusDM.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0);
    }

    const atr = calculateATR(highs, lows, closes, period);
    const plusDI = [];
    const minusDI = [];

    for (let i = 0; i < atr.length; i++) {
        plusDI.push((plusDM[i] / atr[i]) * 100);
        minusDI.push((minusDM[i] / atr[i]) * 100);
    }

    const dx = [];
    for (let i = 0; i < plusDI.length; i++) {
        const diff = Math.abs(plusDI[i] - minusDI[i]);
        const sum = plusDI[i] + minusDI[i];
        dx.push(sum === 0 ? 0 : (diff / sum) * 100);
    }

    const adx = [];
    let adxSum = dx.slice(0, period).reduce((a, b) => a + b, 0);
    adx.push(adxSum / period);

    for (let i = period; i < dx.length; i++) {
        adx.push((adx[adx.length - 1] * (period - 1) + dx[i]) / period);
    }

    return adx;
}
