import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

const bulkCache = new Map<string, { data: any; timestamp: number }>();
const BULK_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

export async function POST(request: NextRequest) {
    let parsedSymbols: string[] = [];

    try {
        const body = await request.json();
        const { symbols, days } = body;

        if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
            return NextResponse.json({ error: 'Invalid symbols array' }, { status: 400 });
        }

        parsedSymbols = symbols;

        const cacheKey = `${[...symbols].sort().join(',')}-${days || 30}`;
        const cached = bulkCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < BULK_CACHE_DURATION) {
            return NextResponse.json(cached.data);
        }

        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - (days || 30));
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];

        const results = new Map<string, any>();
        const errors: string[] = [];
        const MAX_CONCURRENT = 50;

        for (let i = 0; i < symbols.length; i += MAX_CONCURRENT) {
            const batch = symbols.slice(i, i + MAX_CONCURRENT);

            const batchResults = await Promise.all(
                batch.map(async (symbol: string) => {
                    try {
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 15000);

                        const response = await fetch(
                            `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${startDateStr}/${endDateStr}?adjusted=true&sort=desc&limit=50000&apikey=${POLYGON_API_KEY}`,
                            { signal: controller.signal, headers: { Accept: 'application/json' } }
                        );
                        clearTimeout(timeoutId);

                        if (!response.ok) {
                            if (response.status === 404) {
                                return { symbol, data: { results: [], status: 'OK', message: 'No data available' } };
                            }
                            throw new Error(`HTTP ${response.status}`);
                        }

                        const data = await response.json();
                        return { symbol, data };
                    } catch (err) {
                        const msg = err instanceof Error ? err.message : 'Unknown error';
                        errors.push(`${symbol}: ${msg}`);
                        return { symbol, data: { results: [], status: 'ERROR', message: msg } };
                    }
                })
            );

            for (const { symbol, data } of batchResults) {
                results.set(symbol, data);
            }
        }

        const responseData = {
            success: true,
            data: Object.fromEntries(results),
            errors,
            stats: { requested: symbols.length, successful: results.size, failed: errors.length },
        };

        if (results.size > 0) {
            bulkCache.set(cacheKey, { data: responseData, timestamp: Date.now() });
        }

        return NextResponse.json(responseData);

    } catch (error) {
        return NextResponse.json({
            success: true,
            data: {},
            errors: [error instanceof Error ? error.message : 'Unknown error'],
            stats: { requested: parsedSymbols.length, successful: 0, failed: parsedSymbols.length },
        });
    }
}