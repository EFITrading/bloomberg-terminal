import { NextRequest, NextResponse } from 'next/server'

const POLYGON_API_KEY = process.env.POLYGON_API_KEY!

export const dynamic = 'force-dynamic'

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const { path } = await params
    const polygonPath = path.join('/')

    // Forward all query params except apiKey (we add it server-side)
    const searchParams = new URLSearchParams(request.nextUrl.searchParams)
    searchParams.delete('apiKey')
    searchParams.delete('apikey')
    searchParams.set('apiKey', POLYGON_API_KEY)

    const polygonUrl = `https://api.polygon.io/${polygonPath}?${searchParams.toString()}`

    try {
        const response = await fetch(polygonUrl, {
            headers: { 'User-Agent': 'EFI-Terminal/1.0' },
            signal: AbortSignal.timeout(30_000),
        })

        const contentType = response.headers.get('content-type') || ''

        // Company branding/logo endpoints return binary images, not JSON.
        // Stream them through as-is instead of trying to parse JSON.
        if (!contentType.includes('application/json')) {
            const buffer = await response.arrayBuffer()
            return new NextResponse(buffer, {
                status: response.status,
                headers: {
                    'Content-Type': contentType || 'application/octet-stream',
                    'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
                },
            })
        }

        const data = await response.json()

        return NextResponse.json(data, {
            status: response.status,
            headers: {
                'Cache-Control': 'public, max-age=10, stale-while-revalidate=30',
            },
        })
    } catch (err) {
        return NextResponse.json(
            { error: 'Polygon proxy error', detail: String(err) },
            { status: 502 }
        )
    }
}
