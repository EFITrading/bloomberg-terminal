import { NextRequest, NextResponse } from 'next/server'

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf'

export async function GET(request: NextRequest) {
    try {
        const query = request.nextUrl.searchParams.get('q')

        if (!query || query.trim().length === 0) {
            return NextResponse.json({ results: [] })
        }

        const url = `https://api.polygon.io/v3/reference/tickers?search=${encodeURIComponent(query)}&active=true&market=stocks&order=desc&limit=10&sort=relevance&apikey=${POLYGON_API_KEY}`

        const response = await fetch(url, {
            headers: { Accept: 'application/json' },
        })

        if (!response.ok) {
            throw new Error(`Polygon API error: ${response.status}`)
        }

        const data = await response.json()

        const results = (data.results || []).map((t: any) => ({
            ticker: t.ticker,
            name: t.name,
        }))

        return NextResponse.json({ results })
    } catch (error) {
        return NextResponse.json({ results: [], error: error instanceof Error ? error.message : 'Search failed' })
    }
}
