import { NextRequest, NextResponse } from 'next/server'

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const ticker = searchParams.get('ticker')?.toUpperCase()
    const date = searchParams.get('date')
    const multiplier = searchParams.get('multiplier') || '5'
    const timespan = searchParams.get('timespan') || 'minute'

    if (!ticker || !date) {
        return NextResponse.json({ error: 'ticker and date are required' }, { status: 400 })
    }

    const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${date}/${date}?adjusted=true&sort=asc&limit=5000&apikey=${POLYGON_API_KEY}`

    try {
        const res = await fetch(url, { next: { revalidate: 60 } })
        const data = await res.json()

        if (!res.ok) {
            return NextResponse.json(
                { error: `Polygon error: ${data.error || data.message || res.status}` },
                { status: res.status }
            )
        }

        return NextResponse.json(data)
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Failed to fetch' }, { status: 500 })
    }
}
