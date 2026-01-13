import { NextResponse } from 'next/server';
import RRGService from '@/lib/rrgService';

// Global cache for benchmark data across requests
const benchmarkCache = new Map<string, { data: any; expiry: number }>();
const BENCHMARK_CACHE_DURATION = 60 * 1000; // 1 minute

const getBenchmarkData = async (rrgService: any, benchmark: string, fromDate: string, toDate: string) => {
    const cacheKey = `${benchmark}_${fromDate}_${toDate}`;
    const cached = benchmarkCache.get(cacheKey);

    if (cached && cached.expiry > Date.now()) {
        return cached.data;
    }

    const data = await rrgService.getHistoricalPrices(benchmark, fromDate, toDate);
    benchmarkCache.set(cacheKey, { data, expiry: Date.now() + BENCHMARK_CACHE_DURATION });
    return data;
};

export const maxDuration = 300; // 5 minutes max
export const dynamic = 'force-dynamic';

interface TimeframeConfig {
    label: string;
    weeks: number;
    rsPeriod: number;
    momentumPeriod: number;
    key: string;
}

const TIMEFRAMES: TimeframeConfig[] = [
    { label: '4 weeks', weeks: 4, rsPeriod: 4, momentumPeriod: 4, key: '4w' },
    { label: '8 weeks', weeks: 8, rsPeriod: 8, momentumPeriod: 8, key: '8w' },
    { label: '14 weeks', weeks: 14, rsPeriod: 14, momentumPeriod: 14, key: '14w' },
    { label: '26 weeks', weeks: 26, rsPeriod: 26, momentumPeriod: 26, key: '26w' }
];

const getQuadrant = (rsRatio: number, rsMomentum: number): 'leading' | 'lagging' | 'weakening' | 'improving' => {
    if (rsRatio >= 100 && rsMomentum >= 100) return 'leading';
    if (rsRatio >= 100 && rsMomentum < 100) return 'weakening';
    if (rsRatio < 100 && rsMomentum < 100) return 'lagging';
    return 'improving';
};

export async function POST(request: Request) {
    try {
        const { symbols, benchmark = 'SPY', batchIndex, totalBatches } = await request.json();

        if (!symbols || !Array.isArray(symbols)) {
            return NextResponse.json({ error: 'Invalid symbols array' }, { status: 400 });
        }

        console.log(`[API] Processing batch ${batchIndex + 1}/${totalBatches}: ${symbols.length} stocks`);

        const rrgService = new RRGService();
        const results: any[] = [];

        // Process all 4 timeframes in parallel for this batch
        const timeframeData = await Promise.all(
            TIMEFRAMES.map(async (tf) => {
                try {
                    const tfResults = await rrgService['calculateCustomRRG'](
                        symbols,
                        benchmark,
                        tf.weeks,
                        tf.rsPeriod,
                        tf.momentumPeriod,
                        5
                    );
                    return { tf, results: tfResults };
                } catch (err) {
                    console.error(`[API] Failed to fetch ${tf.label}:`, err);
                    return { tf, results: [] };
                }
            })
        );

        // Process results for each stock
        for (const symbol of symbols) {
            try {
                const timeframes: any = { '4w': 'lagging', '8w': 'lagging', '14w': 'lagging', '26w': 'lagging' };
                let primaryData: any = null;

                // Extract data for this symbol from each timeframe
                timeframeData.forEach(({ tf, results: tfResults }) => {
                    const stockData = tfResults.find(r => r.symbol === symbol);
                    if (stockData) {
                        const quadrant = getQuadrant(stockData.rsRatio, stockData.rsMomentum);
                        timeframes[tf.key] = quadrant;
                        if (!primaryData) primaryData = stockData;
                    }
                });

                if (!primaryData) continue;

                // Calculate consistency
                const quadrantCounts: Record<string, number> = {};
                Object.values(timeframes).forEach((q: any) => {
                    quadrantCounts[q] = (quadrantCounts[q] || 0) + 1;
                });

                let maxCount = 0;
                let dominantQuadrant: any = 'lagging';
                Object.entries(quadrantCounts).forEach(([quad, count]) => {
                    if (count > maxCount) {
                        maxCount = count;
                        dominantQuadrant = quad;
                    }
                });

                results.push({
                    ...primaryData,
                    quadrant: dominantQuadrant,
                    timeframes,
                    consistency: maxCount,
                    dominantQuadrant
                });
            } catch (err) {
                console.error(`[API] Error processing ${symbol}:`, err);
            }
        }

        console.log(`[API] ✓ Batch ${batchIndex + 1}/${totalBatches} complete - ${results.length} stocks`);

        return NextResponse.json({
            success: true,
            results,
            batchIndex,
            totalBatches
        });

    } catch (error) {
        console.error('[API] RRG scan error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to process RRG scan' },
            { status: 500 }
        );
    }
}
