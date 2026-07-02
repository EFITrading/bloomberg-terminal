import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { gunzip } from 'zlib';
import { promisify } from 'util';

const gunzipAsync = promisify(gunzip);

export const runtime = 'nodejs';

function dayRange(dateInput: string): { gte: Date; lt: Date } {
  const d = new Date(dateInput)
  if (isNaN(d.getTime())) throw new Error('Invalid date')
  const dateStr = d.toISOString().split('T')[0]
  const gte = new Date(`${dateStr}T00:00:00.000Z`)
  const lt = new Date(`${dateStr}T00:00:00.000Z`)
  lt.setUTCDate(lt.getUTCDate() + 1)
  return { gte, lt }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ date: string }> }
) {
  try {
    const { date } = await params;
    const decodedDate = decodeURIComponent(date)

    // Try FlowBatch first (Railway stream data — append-only chunks)
    const tradingDate = decodedDate.split('T')[0] // normalize to YYYY-MM-DD
    const batches = await prisma.flowBatch.findMany({
      where: { tradingDate },
      orderBy: { batchTime: 'asc' },
      select: { data: true, tradeCount: true, batchTime: true },
    })
    if (batches.length > 0) {
      const allTrades: unknown[] = []
      for (const b of batches) {
        const decompressed = await gunzipAsync(Buffer.from(b.data, 'base64'))
        allTrades.push(...JSON.parse(decompressed.toString('utf8')))
      }
      const latest = batches[batches.length - 1]
      return NextResponse.json({ date: latest.batchTime.toISOString(), data: allTrades, size: allTrades.length, createdAt: latest.batchTime, source: 'stream' })
    }

    // Fall back to Flow table (scan saves)
    let range: { gte: Date; lt: Date }
    try { range = dayRange(decodedDate) }
    catch { return NextResponse.json({ error: 'Invalid date format' }, { status: 400 }) }

    const flow = await prisma.flow.findFirst({
      where: { date: { gte: range.gte, lt: range.lt } },
      orderBy: { createdAt: 'desc' },
    });

    if (!flow) {
      return NextResponse.json({ error: 'Flow not found' }, { status: 404 });
    }

    const compressedBuffer = Buffer.from(flow.data, 'base64');
    const decompressed = await gunzipAsync(compressedBuffer);

    return NextResponse.json({
      date: flow.date,
      data: JSON.parse(decompressed.toString('utf8')),
      size: flow.size,
      createdAt: flow.createdAt,
      source: 'scan',
    });
  } catch (error) {
    console.error('Error fetching flow:', error);
    return NextResponse.json({ error: 'Failed to fetch flow' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ date: string }> }
) {
  try {
    const { date } = await params;
    const decodedDate = decodeURIComponent(date)
    const tradingDate = decodedDate.split('T')[0] // normalize to YYYY-MM-DD

    // Delete from FlowBatch (Railway stream data)
    const batchResult = await prisma.flowBatch.deleteMany({ where: { tradingDate } })

    // Also delete from Flow (scan data) if it exists
    let flowResult = { count: 0 }
    try {
      const range = dayRange(decodedDate)
      flowResult = await prisma.flow.deleteMany({ where: { date: { gte: range.gte, lt: range.lt } } })
    } catch { }

    const totalDeleted = batchResult.count + flowResult.count
    if (totalDeleted === 0) {
      return NextResponse.json({ error: 'Flow not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, deleted: totalDeleted })
  } catch (error) {
    console.error('Error deleting flow:', error)
    return NextResponse.json({ error: 'Failed to delete flow' }, { status: 500 })
  }
}
