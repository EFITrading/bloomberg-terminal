// RRG Calculation Web Worker
const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
const BASE_URL = 'https://api.polygon.io';

let requestQueue = [];
let isProcessing = false;
let lastRequestTime = 0;
const MIN_DELAY = 100; // 100ms between requests

async function processQueue() {
    if (isProcessing || requestQueue.length === 0) return;

    isProcessing = true;

    while (requestQueue.length > 0) {
        const now = Date.now();
        const timeSinceLastRequest = now - lastRequestTime;

        if (timeSinceLastRequest < MIN_DELAY) {
            await new Promise(resolve => setTimeout(resolve, MIN_DELAY - timeSinceLastRequest));
        }

        const request = requestQueue.shift();
        if (request) {
            lastRequestTime = Date.now();
            await request();
        }
    }

    isProcessing = false;
}

async function makeRequest(endpoint, retries = 2) {
    const url = `${BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}apikey=${POLYGON_API_KEY}`;

    return new Promise((resolve) => {
        const executeRequest = async () => {
            for (let attempt = 0; attempt <= retries; attempt++) {
                try {
                    const response = await fetch(url);
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const data = await response.json();
                    resolve(data);
                    return;
                } catch (error) {
                    if (attempt < retries) {
                        await new Promise(r => setTimeout(r, 150 * Math.pow(2, attempt)));
                    } else {
                        resolve(null);
                    }
                }
            }
        };

        requestQueue.push(executeRequest);
        processQueue();
    });
}

async function getHistoricalPrices(symbol, from, to) {
    const endpoint = `/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}`;
    const response = await makeRequest(endpoint);

    if (!response || !response.results) return [];

    return response.results.map(result => ({
        timestamp: result.t,
        close: result.c
    }));
}

async function getCurrentPrice(symbol) {
    const endpoint = `/v2/aggs/ticker/${symbol}/prev`;
    const response = await makeRequest(endpoint);

    if (!response || !response.results || response.results.length === 0) return null;

    return response.results[0].c;
}

function calculateSMA(prices, period) {
    if (prices.length < period) return [];

    const sma = [];
    for (let i = period - 1; i < prices.length; i++) {
        const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        sma.push(sum / period);
    }
    return sma;
}

async function calculateCustomRRG(symbols, benchmark, weeks, rsPeriod, momentumPeriod) {
    const results = [];
    const lookbackDays = weeks * 7 + Math.max(rsPeriod, momentumPeriod) + 10;
    const to = new Date();
    const from = new Date(to.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

    const toStr = to.toISOString().split('T')[0];
    const fromStr = from.toISOString().split('T')[0];

    for (const symbol of symbols) {
        try {
            const [symbolPrices, benchmarkPrices, currentPrice] = await Promise.all([
                getHistoricalPrices(symbol, fromStr, toStr),
                getHistoricalPrices(benchmark, fromStr, toStr),
                getCurrentPrice(symbol)
            ]);

            if (!symbolPrices.length || !benchmarkPrices.length || !currentPrice) continue;

            const minLength = Math.min(symbolPrices.length, benchmarkPrices.length);
            const alignedSymbolPrices = symbolPrices.slice(-minLength);
            const alignedBenchmarkPrices = benchmarkPrices.slice(-minLength);

            const relativeStrength = alignedSymbolPrices.map((sp, i) =>
                sp.close / alignedBenchmarkPrices[i].close
            );

            const rsRatioValues = calculateSMA(relativeStrength, rsPeriod);
            if (rsRatioValues.length === 0) continue;

            const currentRS = relativeStrength[relativeStrength.length - 1];
            const avgRS = rsRatioValues[rsRatioValues.length - 1];
            const rsRatio = (currentRS / avgRS) * 100;

            const rsMomentumValues = [];
            for (let i = momentumPeriod; i < rsRatioValues.length; i++) {
                const momentum = ((rsRatioValues[i] / rsRatioValues[i - momentumPeriod]) - 1) * 100;
                rsMomentumValues.push(momentum);
            }

            const rsMomentum = rsMomentumValues.length > 0
                ? 100 + rsMomentumValues[rsMomentumValues.length - 1]
                : 100;

            const priceChangePercent = symbolPrices.length >= 2
                ? ((symbolPrices[symbolPrices.length - 1].close - symbolPrices[symbolPrices.length - 2].close) / symbolPrices[symbolPrices.length - 2].close) * 100
                : 0;

            results.push({
                symbol,
                rsRatio,
                rsMomentum,
                currentPrice,
                priceChangePercent
            });
        } catch (error) {
            // Skip failed stocks
        }
    }

    return results;
}

// Listen for messages from main thread
self.onmessage = async function (e) {
    console.log('Worker received message:', e.data.type);
    const { type, data } = e.data;

    if (type === 'CALCULATE_BATCH') {
        const { symbols, benchmark, timeframeOptions, batchIndex } = data;
        console.log(`Worker processing batch ${batchIndex} with ${symbols.length} symbols`);

        try {
            const batchResults = [];

            for (const symbol of symbols) {
                const timeframes = { '4w': 'lagging', '8w': 'lagging', '14w': 'lagging', '26w': 'lagging' };
                let primaryData = null;

                // Process all timeframes for this symbol
                for (const tf of timeframeOptions) {
                    const result = await calculateCustomRRG(
                        [symbol],
                        benchmark,
                        tf.weeks,
                        tf.rsPeriod,
                        tf.momentumPeriod
                    );

                    if (result && result.length > 0) {
                        const data = result[0];
                        const rsRatio = data.rsRatio;
                        const rsMomentum = data.rsMomentum;

                        // Determine quadrant
                        let quadrant = 'lagging';
                        if (rsRatio >= 100 && rsMomentum >= 100) quadrant = 'leading';
                        else if (rsRatio < 100 && rsMomentum >= 100) quadrant = 'improving';
                        else if (rsRatio < 100 && rsMomentum < 100) quadrant = 'lagging';
                        else if (rsRatio >= 100 && rsMomentum < 100) quadrant = 'weakening';

                        timeframes[tf.key] = quadrant;
                        if (!primaryData) primaryData = data;
                    }
                }

                if (primaryData) {
                    // Calculate consistency
                    const quadrantCounts = {};
                    Object.values(timeframes).forEach(q => {
                        quadrantCounts[q] = (quadrantCounts[q] || 0) + 1;
                    });

                    let maxCount = 0;
                    let dominantQuadrant = 'lagging';
                    Object.entries(quadrantCounts).forEach(([quad, count]) => {
                        if (count > maxCount) {
                            maxCount = count;
                            dominantQuadrant = quad;
                        }
                    });

                    batchResults.push({
                        ...primaryData,
                        quadrant: dominantQuadrant,
                        timeframes,
                        consistency: maxCount,
                        dominantQuadrant
                    });
                }
            }

            // Send results back to main thread
            self.postMessage({
                type: 'BATCH_COMPLETE',
                data: { batchIndex, results: batchResults }
            });
        } catch (error) {
            self.postMessage({
                type: 'BATCH_ERROR',
                data: { batchIndex, error: error.message }
            });
        }
    }
};
