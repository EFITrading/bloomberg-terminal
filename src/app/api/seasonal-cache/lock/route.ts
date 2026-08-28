import { NextRequest, NextResponse } from 'next/server'
import { tryAcquireScanLock, releaseScanLock } from '@/lib/redis'

// Dedupe lock for expensive seasonal scans - the first concurrent requester for a given
// key gets `acquired: true` and must run the scan; everyone else gets `acquired: false`
// and should poll /api/seasonal-cache for the result instead of re-scanning.

export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => null)
    const key = body?.key
    if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 })
    const acquired = await tryAcquireScanLock(key)
    return NextResponse.json({ acquired })
}

export async function DELETE(req: NextRequest) {
    const key = req.nextUrl.searchParams.get('key')
    if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 })
    await releaseScanLock(key)
    return NextResponse.json({ ok: true })
}
