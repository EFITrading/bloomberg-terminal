import { NextRequest, NextResponse } from 'next/server'
import { getCachedSeasonalScan, setCachedSeasonalScan } from '@/lib/redis'

// Shared cache for seasonal screener scans (normal/seasoned/leaps) — a few hours max,
// so many users hitting the same market+mode don't each trigger a full re-scan.

export async function GET(req: NextRequest) {
    const key = req.nextUrl.searchParams.get('key')
    if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 })
    const data = await getCachedSeasonalScan(key)
    return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => null)
    const key = body?.key
    if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 })
    await setCachedSeasonalScan(key, body.data)
    return NextResponse.json({ ok: true })
}
