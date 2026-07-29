import { promisify } from 'util'
import { gunzip, gzip } from 'zlib'

import { NextRequest, NextResponse } from 'next/server'

import prisma from '@/lib/prisma'
import { setCachedSweepSense } from '@/lib/redis'

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

export const runtime = 'nodejs'

// Saves the FINAL, settled SweepSense scan result ({ trades, stats, bubbles }) for a single
// trading day. Meant to be called exactly ONCE, ~1 minute after market close — never during
// market hours (unlike FlowBatch's continuous 30s saves). Upserted by tradingDate so re-calls
// for the same day simply overwrite the prior snapshot instead of creating duplicates.
export async function POST(request: NextRequest) {
    try {
        let tradingDate: string
        let data: unknown

        const contentType = request.headers.get('Content-Type') || ''
        if (contentType.includes('application/octet-stream')) {
            const compressedBuffer = await request.arrayBuffer()
            const decompressed = await gunzipAsync(Buffer.from(compressedBuffer))
            const parsed = JSON.parse(decompressed.toString('utf8'))
            tradingDate = parsed.tradingDate
            data = parsed.data
        } else {
            const body = await request.json()
            tradingDate = body.tradingDate
            data = body.data
        }

        if (!tradingDate || !data) {
            return NextResponse.json({ error: 'tradingDate and data are required' }, { status: 400 })
        }

        const tradeCount = Array.isArray((data as any)?.trades) ? (data as any).trades.length : 0

        const dataString = JSON.stringify(data)
        const compressed = await gzipAsync(dataString)
        const compressedBase64 = compressed.toString('base64')

        const snapshot = await prisma.sweepSenseSnapshot.upsert({
            where: { tradingDate },
            update: { data: compressedBase64, tradeCount },
            create: { tradingDate, data: compressedBase64, tradeCount },
            select: { id: true, tradingDate: true, tradeCount: true, updatedAt: true },
        })

        // Populate the cache directly with the freshly-saved snapshot so the very next
        // load (e.g. this same session, or another tab) hits Redis instead of Postgres.
        setCachedSweepSense(tradingDate, {
            tradingDate,
            data,
            tradeCount: snapshot.tradeCount,
            updatedAt: snapshot.updatedAt.toISOString(),
        }).catch(() => { })

        return NextResponse.json({ success: true, snapshot })
    } catch (error) {
        console.error('[SweepSense API][SAVE] Error saving SweepSense snapshot:', error)
        return NextResponse.json({ error: 'Failed to save SweepSense snapshot' }, { status: 500 })
    }
}
