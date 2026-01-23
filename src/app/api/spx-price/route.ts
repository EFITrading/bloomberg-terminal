import { NextResponse } from 'next/server';

export async function GET() {
    const apiKey = process.env.POLYGON_API_KEY;

    try {
        const response = await fetch(`https://api.polygon.io/v2/last/trade/I:SPX?apikey=${apiKey}`);
        const data = await response.json();

        if (data.status === 'OK' && data.results?.p) {
            return NextResponse.json({
                success: true,
                price: data.results.p
            });
        }

        return NextResponse.json({
            success: false,
            error: 'Failed to fetch SPX price'
        }, { status: 500 });

    } catch (error) {
        console.error('SPX price fetch error:', error);
        return NextResponse.json({
            success: false,
            error: 'Internal server error'
        }, { status: 500 });
    }
}
