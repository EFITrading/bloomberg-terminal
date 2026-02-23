import { NextRequest, NextResponse } from 'next/server';

// Proxy for Polygon /v3/quotes/{optionTicker} to avoid browser CORS restrictions.
// Returns the last bid/ask quote at or before the given nanosecond timestamp.
// Usage: GET /api/options-quotes?contract=O:SPY260223P00680000&timestamp_ns=1740000000000000000
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const contract = searchParams.get('contract');
    const timestampNs = searchParams.get('timestamp_ns');

    if (!contract || !timestampNs) {
        return NextResponse.json({ error: 'contract and timestamp_ns are required' }, { status: 400 });
    }

    const apiKey = process.env.POLYGON_API_KEY || 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
    const url = `https://api.polygon.io/v3/quotes/${encodeURIComponent(contract)}?timestamp.lte=${timestampNs}&order=desc&limit=1&apikey=${apiKey}`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (err) {
        return NextResponse.json({ error: 'Failed to fetch from Polygon' }, { status: 500 });
    }
}
