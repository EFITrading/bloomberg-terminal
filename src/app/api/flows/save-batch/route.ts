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

    const batch = await prisma.flowBatch.findUnique({ where: { tradingDate } })
    if (!batch) {
      return NextResponse.json({ trades: [], tradeCount: 0 })
    }

    const compressed = Buffer.from(batch.data, 'base64')
    const decompressed = await gunzipAsync(compressed)
    const trades = JSON.parse(decompressed.toString('utf8'))

    return NextResponse.json({ trades, tradeCount: batch.tradeCount, batchTime: batch.batchTime })
  } catch (error) {
    console.error('[FlowBatch] Error fetching batch:', error)
    return NextResponse.json({ error: 'Failed to fetch flow batch' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { tradingDate, trades } = body

    if (!tradingDate || !Array.isArray(trades) || trades.length === 0) {
      return NextResponse.json({ error: 'tradingDate and trades array are required' }, { status: 400 })
    }

    const dataString = JSON.stringify(trades)
    const originalSize = Buffer.byteLength(dataString, 'utf8')
    const compressed = await gzipAsync(dataString)
    const compressedBase64 = compressed.toString('base64')

    console.log(
      `[FlowBatch] Saving ${trades.length} trades for ${tradingDate} | ` +
      `${(originalSize / 1024).toFixed(1)}KB → ${(compressed.length / 1024).toFixed(1)}KB compressed`
    )

    // delete + create avoids Prisma Accelerate's 5MB response limit on upsert reads
    await prisma.flowBatch.deleteMany({ where: { tradingDate } })
    const batch = await prisma.flowBatch.create({
      data: {
        tradingDate,
        batchTime: new Date(),
        data: compressedBase64,
        tradeCount: trades.length,
      },
      select: { id: true, tradingDate: true, batchTime: true, tradeCount: true },
    })

    console.log(`[FlowBatch] Saved batch ${batch.id} | ${batch.tradeCount} trades @ ${batch.batchTime.toISOString()}`)

    return NextResponse.json({ success: true, batch })
  } catch (error) {
    console.error('[FlowBatch] Error saving batch:', error)
    return NextResponse.json({ error: 'Failed to save flow batch' }, { status: 500 })
  }
}
