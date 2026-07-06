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
        const since = request.nextUrl.searchParams.get('since') // ISO timestamp for incremental polls

        // Incremental poll — only fetch chunks newer than `since` (tiny, ~6 chunks per 30s poll)
        if (since) {
            const newChunks = await prisma.flowBatch.findMany({
                where: { tradingDate, batchTime: { gt: new Date(since) } },
                orderBy: { batchTime: 'asc' },
                select: { id: true, data: true, batchTime: true },
            })
            const trades: unknown[] = []
            for (const chunk of newChunks) {
                const decompressed = await gunzipAsync(Buffer.from(chunk.data, 'base64'))
                trades.push(...JSON.parse(decompressed.toString('utf8')))
            }
            const latestTime = newChunks.length > 0 ? newChunks[newChunks.length - 1].batchTime : new Date(since)
            return NextResponse.json({ trades, tradeCount: trades.length, batchTime: latestTime, incremental: true })
        }

        // Initial full-day load — parallel pages of 40 chunks (~104KB each → ~4.1MB < 5MB Accelerate limit)
        const PAGE_SIZE = 40
        const total = await prisma.flowBatch.count({ where: { tradingDate } })
        if (total === 0) return NextResponse.json({ trades: [], tradeCount: 0 })

        const pageCount = Math.ceil(total / PAGE_SIZE)
        const allTrades: unknown[] = new Array(total * 50) // pre-alloc rough estimate
        allTrades.length = 0
        let latestBatchTime: Date | undefined

        // Fetch 10 pages in parallel, loop until done
        for (let i = 0; i < pageCount; i += 10) {
            const batch = await Promise.all(
                Array.from({ length: Math.min(10, pageCount - i) }, (_, j) =>
                    prisma.flowBatch.findMany({
                        where: { tradingDate },
                        orderBy: { batchTime: 'asc' },
                        skip: (i + j) * PAGE_SIZE,
                        take: PAGE_SIZE,
                        select: { data: true, batchTime: true },
                    })
                )
            )
            for (const page of batch) {
                for (const chunk of page) {
                    const decompressed = await gunzipAsync(Buffer.from(chunk.data, 'base64'))
                    allTrades.push(...JSON.parse(decompressed.toString('utf8')))
                    latestBatchTime = chunk.batchTime
                }
            }
        }

        return NextResponse.json({ trades: allTrades, tradeCount: allTrades.length, batchTime: latestBatchTime })
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
