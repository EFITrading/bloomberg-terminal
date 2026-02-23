import { NextRequest, NextResponse } from 'next/server';

// Server-side proxy for Polygon single-contract option snapshot.
// Avoids CORS failures that occur when the browser calls api.polygon.io directly.
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const underlying = searchParams.get('underlying');
    const contract = searchParams.get('contract');

    if (!underlying || !contract) {
        return NextResponse.json({ error: 'underlying and contract are required' }, { status: 400 });
    }

    const apiKey = process.env.POLYGON_API_KEY || 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

    try {
        const url = `https://api.polygon.io/v3/snapshot/options/${encodeURIComponent(underlying)}/${encodeURIComponent(contract)}?apikey=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch snapshot' }, { status: 500 });
    }
}
