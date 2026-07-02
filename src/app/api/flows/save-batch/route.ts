import { promisify } from 'util'
import { gunzip, gzip } from 'zlib'

import { NextRequest, NextResponse } from 'next/server'

import prisma from '@/lib/prisma'

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
    try {
        const tradingDate = request.nextUrl.searchParams.get('date')
        if (!tradingDate) {
            return NextResponse.json({ error: 'date param required' }, { status: 400 })
        }

        // Fetch all chunks in pages of 20 — each page ~1MB, well under Prisma Accelerate 5MB limit
        const allTrades: unknown[] = []
        let cursor: string | undefined
        let latestBatchTime: Date | undefined

        while (true) {
            const page = await prisma.flowBatch.findMany({
                where: { tradingDate },
                orderBy: { batchTime: 'asc' },
                take: 20,
                ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
                select: { id: true, data: true, batchTime: true },
            })
            if (page.length === 0) break
            for (const batch of page) {
                const decompressed = await gunzipAsync(Buffer.from(batch.data, 'base64'))
                allTrades.push(...JSON.parse(decompressed.toString('utf8')))
            }
            cursor = page[page.length - 1].id
            latestBatchTime = page[page.length - 1].batchTime
            if (page.length < 20) break
        }

        if (allTrades.length === 0) {
            return NextResponse.json({ trades: [], tradeCount: 0 })
        }

        return NextResponse.json({
            trades: allTrades,
            tradeCount: allTrades.length,
            batchTime: latestBatchTime,
        })
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.error('[FlowBatch GET] Error:', msg)
        return NextResponse.json({ error: 'Failed to fetch flow batch', detail: msg }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { tradingDate, trades } = body

        if (!tradingDate || !Array.isArray(trades) || trades.length === 0) {
            return NextResponse.json({ error: 'tradingDate and trades array are required' }, { status: 400 })
        }

        const compressed = await gzipAsync(JSON.stringify(trades))
        const compressedBase64 = compressed.toString('base64')

        // Append-only — each call creates a new small chunk record
        const batch = await prisma.flowBatch.create({
            data: { tradingDate, batchTime: new Date(), data: compressedBase64, tradeCount: trades.length },
            select: { id: true, tradingDate: true, batchTime: true, tradeCount: true },
        })

        return NextResponse.json({ success: true, batch })
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.error('[FlowBatch POST] Error:', msg)
        return NextResponse.json({ error: 'Failed to save flow batch', detail: msg }, { status: 500 })
    }
}
