// Momentum-Volatility Trading Strategy Worker
// Scores trades based on breakout power, volatility expansion, and acceleration

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

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

// Main message handler - BATCH PROCESSING
self.onmessage = async function (e) {
    const { candidates, pricesMap } = e.data;

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

    try {
        const scoringPromises = candidates.map(async (candidate, idx) => {
            if (!candidate || !candidate.symbol || !candidate.trend) {
                console.warn(`⚠️ Momentum: Invalid candidate at index ${idx}:`, candidate);
                return { ...candidate, score: 0, details: { error: 'Invalid candidate' }, strategy: 'momentum' };
            }

            const prices = pricesMap[candidate.symbol];
            if (!prices || !Array.isArray(prices) || prices.length < 20) {
                console.warn(`⚠️ Momentum: ${candidate.symbol} insufficient data (${prices?.length || 0} bars)`);
                return { ...candidate, score: 0, details: {}, strategy: 'momentum' };
            }

            return await scoreMomentumCandidate(candidate, prices);
        });

        const scoredCandidates = await Promise.all(scoringPromises);
        const validScores = scoredCandidates.filter(c => c.score > 0);
        console.log(`✅ Momentum Worker: Scored ${scoredCandidates.length} candidates, ${validScores.length} with score > 0`);
        self.postMessage({ success: true, scoredCandidates });
    } catch (error) {
        console.error('Momentum Worker error:', error);
        self.postMessage({ success: false, error: error.message });
    }
};

// Score a single candidate using momentum-volatility strategy
async function scoreMomentumCandidate(candidate, prices) {
    const { symbol, trend, relativePerformance } = candidate;
    const closes = prices.map(p => p.close);
    const highs = prices.map(p => p.high);
    const lows = prices.map(p => p.low);
    const volumes = prices.map(p => p.volume || 0);

    console.log(`🚀 Momentum: ${symbol} (${trend}) - Price: $${closes[closes.length - 1].toFixed(2)}, Bars: ${closes.length}`);

    // Fetch volume data if more than 50% are zeros
    let validVolumes = volumes;
    const zeroCount = volumes.filter(v => v === 0).length;
    if (zeroCount > volumes.length * 0.5) {
        console.log(`📊 ${symbol}: Fetching volume from API (${zeroCount}/${volumes.length} zeros)`);
        const fetchedVolumes = await fetchVolumeData(symbol, prices.length);
        if (fetchedVolumes.length > 0) {
            validVolumes = fetchedVolumes.slice(-prices.length);
            console.log(`✅ ${symbol}: Got ${fetchedVolumes.length} volume bars from API`);
        }
    }

    // Calculate moving averages for support analysis
    const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const ma50 = closes.length >= 50 ? closes.slice(-50).reduce((a, b) => a + b, 0) / 50 : ma20;
    const currentPrice = closes[closes.length - 1];

    // 1. SUPPORT HOLDING STRENGTH (25 points)
    let supportStrength = 0;

    // Check how well it respects MA20/MA50 on pullbacks
    let touchCount = 0;
    let bounceCount = 0;
    for (let i = closes.length - 20; i < closes.length - 1; i++) {
        if (i < 0) continue;
        const localMA20 = closes.slice(Math.max(0, i - 19), i + 1).reduce((a, b) => a + b, 0) / Math.min(20, i + 1);
        const distanceToMA = (closes[i] - localMA20) / localMA20 * 100;

        // Touched MA20 (within 2%)
        if (Math.abs(distanceToMA) < 2) {
            touchCount++;
            // Bounced back up next day
            if (i < closes.length - 1 && closes[i + 1] > closes[i]) {
                bounceCount++;
            }
        }
    }

    if (touchCount > 0) {
        const bounceRate = bounceCount / touchCount;
        if (bounceRate > 0.8) supportStrength += 15; // 80%+ bounce rate = strong support
        else if (bounceRate > 0.6) supportStrength += 10;
        else if (bounceRate > 0.4) supportStrength += 5;
    }

    // Current position relative to MA20
    const aboveMA20 = (currentPrice - ma20) / ma20 * 100;
    if (trend === 'bullish' && aboveMA20 > 0 && aboveMA20 < 5) supportStrength += 10; // Above but not extended
    else if (trend === 'bearish' && aboveMA20 < 0 && aboveMA20 > -5) supportStrength += 10;

    // 2. RED DAY RESILIENCE (20 points)
    let resilience = 0;

    // Count red days and check if stock outperformed on those days
    let redDays = 0;
    let outperformOnRed = 0;
    for (let i = closes.length - 10; i < closes.length; i++) {
        if (i < 1) continue;
        const dailyChange = (closes[i] - closes[i - 1]) / closes[i - 1] * 100;

        // Assume market had a red day if this is trending (simplified - ideally use SPY data)
        if (dailyChange < 0) {
            redDays++;
            // Check if it lost less than average or held better
            const avgLoss = closes.slice(Math.max(0, i - 10), i).map((c, idx, arr) =>
                idx > 0 ? (c - arr[idx - 1]) / arr[idx - 1] * 100 : 0
            ).filter(x => x < 0).reduce((a, b) => a + b, 0) / Math.max(1, closes.slice(Math.max(0, i - 10), i).filter((c, idx, arr) => idx > 0 && c < arr[idx - 1]).length);

            if (dailyChange > avgLoss || dailyChange > -1) { // Lost less than avg or less than 1%
                outperformOnRed++;
            }
        }
    }

    if (redDays > 0) {
        const resilienceRate = outperformOnRed / redDays;
        if (resilienceRate > 0.7) resilience += 20; // 70%+ resilience = diamond hands
        else if (resilienceRate > 0.5) resilience += 12;
        else if (resilienceRate > 0.3) resilience += 6;
    }

    // 3. RETEST QUALITY (20 points)
    let retestQuality = 0;

    // Find recent pullbacks and check bounce quality
    let pullbackCount = 0;
    let cleanBounces = 0;

    for (let i = closes.length - 15; i < closes.length - 2; i++) {
        if (i < 2) continue;

        // Detect pullback: 2+ consecutive down days followed by up day
        if (closes[i] < closes[i - 1] && closes[i - 1] < closes[i - 2] && closes[i + 1] > closes[i]) {
            pullbackCount++;

            // Clean bounce = next day recovers >50% of pullback
            const pullbackSize = closes[i - 2] - closes[i];
            const bounceSize = closes[i + 1] - closes[i];

            if (bounceSize > pullbackSize * 0.5) {
                cleanBounces++;
            }
        }
    }

    if (pullbackCount > 0) {
        const cleanRate = cleanBounces / pullbackCount;
        if (cleanRate > 0.7) retestQuality += 20; // 70%+ clean bounces
        else if (cleanRate > 0.5) retestQuality += 12;
        else if (cleanRate > 0.3) retestQuality += 6;
    } else if (pullbackCount === 0 && trend === 'bullish') {
        // No pullbacks = one-way move (good for momentum)
        retestQuality += 15;
    }

    // 4. VOLUME BEHAVIOR (20 points)
    let volumeBehavior = 0;

    // Check if volume increases on up days and decreases on down days (accumulation pattern)
    let upDaysHighVol = 0;
    let downDaysLowVol = 0;
    let totalUpDays = 0;
    let totalDownDays = 0;

    const avgVolume = validVolumes.slice(-20).reduce((a, b) => a + b, 0) / 20;

    for (let i = closes.length - 10; i < closes.length; i++) {
        if (i < 1) continue;

        const priceChange = closes[i] - closes[i - 1];
        const volRatio = validVolumes[i] / avgVolume;

        if (priceChange > 0) {
            totalUpDays++;
            if (volRatio > 1.1) upDaysHighVol++; // Volume 10%+ above average on up day
        } else if (priceChange < 0) {
            totalDownDays++;
            if (volRatio < 0.9) downDaysLowVol++; // Volume 10%+ below average on down day
        }
    }

    const accumulation = (totalUpDays > 0 ? upDaysHighVol / totalUpDays : 0) +
        (totalDownDays > 0 ? downDaysLowVol / totalDownDays : 0);

    if (accumulation > 1.4) volumeBehavior += 20; // Strong accumulation pattern
    else if (accumulation > 1.0) volumeBehavior += 12;
    else if (accumulation > 0.7) volumeBehavior += 6;

    // 5. PULLBACK DEPTH (15 points)
    let pullbackDepth = 0;

    // Find highest high in last 20 days and check current pullback
    const recentHigh = Math.max(...closes.slice(-20));
    const pullbackPct = (recentHigh - currentPrice) / recentHigh * 100;

    if (trend === 'bullish') {
        // Bullish: Shallow pullbacks are good (10-20%)
        if (pullbackPct < 5) pullbackDepth += 15; // Very shallow, strong
        else if (pullbackPct < 10) pullbackDepth += 10;
        else if (pullbackPct < 15) pullbackDepth += 6; // Healthy pullback
        else if (pullbackPct < 20) pullbackDepth += 3;
        // >20% = too deep, no points
    } else {
        // Bearish: Looking for stocks holding near lows
        const recentLow = Math.min(...closes.slice(-20));
        const bounceFromLow = (currentPrice - recentLow) / recentLow * 100;

        if (bounceFromLow < 5) pullbackDepth += 15;
        else if (bounceFromLow < 10) pullbackDepth += 10;
        else if (bounceFromLow < 15) pullbackDepth += 6;
    }

    const totalScore = Math.min(100, supportStrength + resilience + retestQuality + volumeBehavior + pullbackDepth);

    console.log(`📈 ${symbol} Momentum Score: ${totalScore.toFixed(1)} | Support:${supportStrength.toFixed(0)} Resilience:${resilience.toFixed(0)} Retest:${retestQuality.toFixed(0)} Volume:${volumeBehavior.toFixed(0)} Pullback:${pullbackDepth.toFixed(0)}`);

    return {
        ...candidate,
        score: totalScore,
        details: {
            supportStrength: Math.round(supportStrength),
            resilience: Math.round(resilience),
            retestQuality: Math.round(retestQuality),
            volumeBehavior: Math.round(volumeBehavior),
            pullbackDepth: Math.round(pullbackDepth)
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
