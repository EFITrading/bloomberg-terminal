import { promisify } from 'util'
import { gunzip } from 'zlib'

import { NextRequest, NextResponse } from 'next/server'

import prisma from '@/lib/prisma'
import { getCachedSweepSense, setCachedSweepSense } from '@/lib/redis'

const gunzipAsync = promisify(gunzip)

export const runtime = 'nodejs'

// Loads the saved end-of-day SweepSense snapshot for a given trading date.
// Returns 404 if none was saved yet for that day (e.g. before market close,
// or the very first afterhours load before the save trigger has fired).
export async function GET(request: NextRequest) {
    try {
        const tradingDate = request.nextUrl.searchParams.get('date')
        if (!tradingDate) {
            return NextResponse.json({ error: 'date query param is required' }, { status: 400 })
        }

        // Check Redis first — snapshot is immutable once saved, so a cache hit here
        // skips Postgres entirely for every subsequent afterhours load/poll of the same day.
        const cached = await getCachedSweepSense(tradingDate)
        if (cached) {
            return NextResponse.json({ ...cached, fromCache: true })
        }

        const snapshot = await prisma.sweepSenseSnapshot.findUnique({ where: { tradingDate } })
        if (!snapshot) {
            return NextResponse.json({ error: 'SweepSense snapshot not found' }, { status: 404 })
        }

        const compressedBuffer = Buffer.from(snapshot.data, 'base64')
        const decompressed = await gunzipAsync(compressedBuffer)
        const data = JSON.parse(decompressed.toString('utf8'))

        const payload = {
            tradingDate: snapshot.tradingDate,
            data,
            tradeCount: snapshot.tradeCount,
            updatedAt: snapshot.updatedAt.toISOString(),
        }

        // Populate cache for subsequent polls — fire-and-forget, don't block the response
        setCachedSweepSense(tradingDate, payload).catch(() => { })

        return NextResponse.json(payload)
    } catch (error) {
        console.error('[SweepSense API][LOAD] Error loading SweepSense snapshot:', error)
        return NextResponse.json({ error: 'Failed to load SweepSense snapshot' }, { status: 500 })
    }
}
