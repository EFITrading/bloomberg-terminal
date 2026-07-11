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

    // Optional server-side ticker filter — caller passes ?tickers=NVDA or ?tickers=NVDA,AAPL
    // When present, trades are filtered BEFORE building the response (35x+ smaller payload for single-ticker)
    // When absent, all trades are returned (ALL scan)
    const tickersParam = request.nextUrl.searchParams.get('tickers')
    const tickerSet = tickersParam
      ? new Set(tickersParam.split(',').map(t => t.trim().toUpperCase()).filter(Boolean))
      : null

    // Fetch ALL FlowBatch rows for the date in one query, then gunzip all in parallel.
    // Falls back to 2 parallel half-queries if Prisma Accelerate rejects the large response.
    const tradingDate = decodedDate.split('T')[0]

    async function fetchAndDecompress(rows: { id: string; data: string; batchTime: Date }[]): Promise<unknown[]> {
      const bufs = await Promise.all(rows.map(b => gunzipAsync(Buffer.from(b.data, 'base64'))))
      const trades: unknown[] = []
      for (const buf of bufs) {
        const batch: unknown[] = JSON.parse(buf.toString('utf8'))
        for (const item of batch) {
          if (!tickerSet || tickerSet.has((item as any)?.underlying_ticker?.toUpperCase() ?? '')) {
            trades.push(item)
          }
        }
      }
      return trades
    }

    let allRows: { id: string; data: string; batchTime: Date }[] = []
    try {
      allRows = await prisma.flowBatch.findMany({
        where: { tradingDate },
        orderBy: { batchTime: 'asc' },
        select: { id: true, data: true, batchTime: true },
      })
    } catch (singleQueryErr) {
      // Single query too large for Prisma Accelerate — split into 2 parallel half-queries
      console.warn('[/api/flows] single query failed, falling back to 2-part split:', singleQueryErr)

      // Get total count first (tiny query), then fetch two halves in parallel by offset
      const total = await prisma.flowBatch.count({ where: { tradingDate } })
      const half = Math.ceil(total / 2)

      const [firstHalf, secondHalf] = await Promise.all([
        prisma.flowBatch.findMany({
          where: { tradingDate },
          orderBy: { batchTime: 'asc' },
          take: half,
          select: { id: true, data: true, batchTime: true },
        }),
        prisma.flowBatch.findMany({
          where: { tradingDate },
          orderBy: { batchTime: 'asc' },
          skip: half,
          select: { id: true, data: true, batchTime: true },
        }),
      ])
      allRows = [...firstHalf, ...secondHalf]
    }

    if (allRows.length > 0) {
      const allTrades = await fetchAndDecompress(allRows)
      const latestBatchTime = allRows[allRows.length - 1].batchTime
      return NextResponse.json({ date: latestBatchTime.toISOString(), data: allTrades, size: allTrades.length, createdAt: latestBatchTime, source: 'stream' })
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
    const flowData: unknown[] = JSON.parse(decompressed.toString('utf8'))
    const filteredFlowData = tickerSet
      ? flowData.filter(t => tickerSet.has((t as any)?.underlying_ticker?.toUpperCase() ?? ''))
      : flowData

    return NextResponse.json({
      date: flow.date,
      data: filteredFlowData,
      size: filteredFlowData.length,
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
