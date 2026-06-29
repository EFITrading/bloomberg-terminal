import { NextResponse } from 'next/server'

import prisma from '@/lib/prisma'

export const runtime = 'nodejs'

export async function GET() {
  try {
    // Merge dates from both Flow (scan saves) and FlowBatch (Railway stream saves)
    const [flows, batches] = await Promise.all([
      prisma.flow.findMany({
        select: { id: true, date: true, size: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.flowBatch.findMany({
        select: { id: true, tradingDate: true, tradeCount: true, batchTime: true },
        orderBy: { batchTime: 'desc' },
      }),
    ])

    // Build a unified date list — FlowBatch takes priority for same date
    const dateMap = new Map<string, { date: string; createdAt: Date; tradeCount: number | null; source: string }>()

    for (const f of flows) {
      const day = new Date(f.date).toISOString().split('T')[0]
      dateMap.set(day, { date: f.date.toISOString(), createdAt: f.createdAt, tradeCount: f.size < 100000 ? f.size : null, source: 'scan' })
    }

    // FlowBatch overrides Flow for same day (stream data is more complete)
    for (const b of batches) {
      dateMap.set(b.tradingDate, { date: new Date(b.tradingDate).toISOString(), createdAt: b.batchTime, tradeCount: b.tradeCount, source: 'stream' })
    }

    const result = Array.from(dateMap.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map(r => ({ date: r.date, createdAt: r.createdAt, tradeCount: r.tradeCount, source: r.source }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('[/api/flows/dates] ERROR:', error)
    return NextResponse.json({ error: 'Failed to fetch flow dates', detail: String(error) }, { status: 500 })
  }
}
