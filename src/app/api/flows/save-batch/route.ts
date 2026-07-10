import { promisify } from 'util'
import { gunzip, gzip } from 'zlib'

import { PrismaClient } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

export const runtime = 'nodejs'

// Use the direct DB URL (bypasses Prisma Accelerate's 5MB response limit)
// The `data` column is a blob — it must never go through the Accelerate proxy
// Singleton pattern (mirrors src/lib/prisma.ts) — reuses the instance across hot reloads
// to prevent connection exhaustion under concurrent 30s polls.
const globalForDirect = globalThis as unknown as { directPrisma: PrismaClient | undefined }

const directPrisma =
    globalForDirect.directPrisma ??
    new PrismaClient({
        datasources: { db: { url: process.env.POSTGRES_URL } },
        log: ['error'],
    })

if (process.env.NODE_ENV !== 'production') {
    globalForDirect.directPrisma = directPrisma
}

export async function GET(request: NextRequest) {
    try {
        const tradingDate = request.nextUrl.searchParams.get('date')
        if (!tradingDate) {
            return NextResponse.json({ error: 'date param required' }, { status: 400 })
        }
        const since = request.nextUrl.searchParams.get('since') // ISO timestamp for incremental polls

        // Incremental poll — only fetch chunks newer than `since` (tiny, ~6 chunks per 30s poll)
        if (since) {
            const newChunks = await directPrisma.flowBatch.findMany({
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

        // Initial full-day load — direct connection has no 5MB limit, use large pages for speed
        const PAGE_SIZE = 40
        const total = await directPrisma.flowBatch.count({ where: { tradingDate } })
        if (total === 0) return NextResponse.json({ trades: [], tradeCount: 0 })

        const pageCount = Math.ceil(total / PAGE_SIZE)
        const allTrades: unknown[] = new Array(total * 50) // pre-alloc rough estimate
        allTrades.length = 0
        let latestBatchTime: Date | undefined

        // Fetch 10 pages in parallel, loop until done
        for (let i = 0; i < pageCount; i += 10) {
            const batch = await Promise.all(
                Array.from({ length: Math.min(10, pageCount - i) }, (_, j) =>
                    directPrisma.flowBatch.findMany({
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

        // Split into sub-chunks of 50 trades each so each DB row stays small (~10-20KB compressed)
        // This prevents any single row from ever approaching Accelerate's 5MB limit
        const CHUNK_SIZE = 50
        const now = new Date()
        const batches: { tradingDate: string; batchTime: Date; data: string; tradeCount: number }[] = []
        for (let i = 0; i < trades.length; i += CHUNK_SIZE) {
            const slice = trades.slice(i, i + CHUNK_SIZE)
            const compressed = await gzipAsync(JSON.stringify(slice))
            batches.push({
                tradingDate,
                batchTime: new Date(now.getTime() + i), // ensure unique ordering
                data: compressed.toString('base64'),
                tradeCount: slice.length,
            })
        }

        await directPrisma.flowBatch.createMany({ data: batches })

        return NextResponse.json({ success: true, chunks: batches.length, tradeCount: trades.length })
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.error('[FlowBatch POST] Error:', msg)
        return NextResponse.json({ error: 'Failed to save flow batch', detail: msg }, { status: 500 })
    }
}
