import { NextRequest, NextResponse } from 'next/server';

// Batch proxy for Polygon /v3/quotes — accepts many contract+timestamp pairs at once.
// Server fans out Polygon calls with controlled concurrency to avoid rate limiting.
//
// POST /api/options-quotes-batch
// Body: { trades: [{ contract: string, timestamp_ns: number, id: string }] }
// Returns: { results: { id: string, bid: number | null, ask: number | null }[] }

const API_KEY = process.env.POLYGON_API_KEY || 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

async function runWithConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
    const results: T[] = new Array(tasks.length);
    let index = 0;
    async function worker() {
        while (index < tasks.length) {
            const i = index++;
            results[i] = await tasks[i]();
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
    return results;
}

async function fetchQuote(contract: string, timestampNs: number | string): Promise<{ bid: number | null; ask: number | null }> {
    const url = `https://api.polygon.io/v3/quotes/${encodeURIComponent(contract)}?timestamp.lte=${timestampNs}&order=desc&limit=1&apikey=${API_KEY}`;
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return { bid: null, ask: null };
        const data = await res.json();
        if (data.results && data.results.length > 0) {
            const bid = data.results[0].bid_price ?? null;
            const ask = data.results[0].ask_price ?? null;
            return { bid, ask };
        }
        return { bid: null, ask: null };
    } catch {
        return { bid: null, ask: null };
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const trades: { contract: string; timestamp_ns: number | string; id: string }[] = body.trades;

        if (!Array.isArray(trades) || trades.length === 0) {
            return NextResponse.json({ error: 'trades array required' }, { status: 400 });
        }

        // Cap at 50 concurrent Polygon calls to avoid rate limiting
        const results = await runWithConcurrency(
            trades.map((t) => async () => {
                const { bid, ask } = await fetchQuote(t.contract, t.timestamp_ns);
                return { id: t.id, bid, ask };
            }),
            50
        );

        return NextResponse.json({ results });
    } catch (err) {
        return NextResponse.json({ error: 'Batch fetch failed' }, { status: 500 });
    }
}
