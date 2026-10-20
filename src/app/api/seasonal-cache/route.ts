import { NextRequest, NextResponse } from 'next/server'
import { getCachedSeasonalScan, setCachedSeasonalScan } from '@/lib/redis'
import { prisma } from '@/lib/prisma'

// Seasonal screener scan store.
// - `idx:*` keys (S&P 500 / Nasdaq 100 / Dow, per mode + timeframe) live in Postgres. The
//   collector's nightly 10PM PT job overwrites them, so there is only ever one saved scan
//   per key and users load it instead of re-scanning.
// - Any other key (sectors, industries, ...) keeps the short-lived Redis cache.

const isDbKey = (key: string) => key.startsWith('idx:')
const todayPT = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })

export async function GET(req: NextRequest) {
    const key = req.nextUrl.searchParams.get('key')
    if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 })
    if (isDbKey(key)) {
        const row = await prisma.seasonalScan.findUnique({ where: { key } }).catch(() => null)
        return NextResponse.json({ data: row?.data ?? null, scanDate: row?.scanDate ?? null })
    }
    const data = await getCachedSeasonalScan(key)
    return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => null)
    const key = body?.key
    if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 })
    if (isDbKey(key)) {
        const scanDate = todayPT()
        await prisma.seasonalScan.upsert({
            where: { key },
            create: { key, scanDate, data: body.data },
            update: { scanDate, data: body.data },
        })
        return NextResponse.json({ ok: true })
    }
    await setCachedSeasonalScan(key, body.data)
    return NextResponse.json({ ok: true })
}
