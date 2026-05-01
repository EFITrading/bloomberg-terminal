import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { gunzip } from 'zlib';
import { promisify } from 'util';

const gunzipAsync = promisify(gunzip);

export const runtime = 'nodejs';

// Build a day range [start of day UTC, start of next day UTC) from any date string.
// This matches both old records (stored with non-midnight timestamps like 10:29 UTC)
// and new records (normalized to midnight UTC).
function dayRange(dateInput: string): { gte: Date; lt: Date } {
  const d = new Date(dateInput)
  if (isNaN(d.getTime())) throw new Error('Invalid date')
  const dateStr = d.toISOString().split('T')[0] // YYYY-MM-DD
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
    let range: { gte: Date; lt: Date }
    try { range = dayRange(decodeURIComponent(date)) }
    catch { return NextResponse.json({ error: 'Invalid date format' }, { status: 400 }) }

    console.log('[GET flow] date param:', date, '| range:', range.gte.toISOString(), '→', range.lt.toISOString())

    const flow = await prisma.flow.findFirst({
      where: { date: { gte: range.gte, lt: range.lt } },
      orderBy: { createdAt: 'desc' },
    });

    if (!flow) {
      console.warn('[GET flow] Not found for range:', range.gte.toISOString(), '→', range.lt.toISOString())
      return NextResponse.json({ error: 'Flow not found' }, { status: 404 });
    }

    // Decompress the data
    const compressedBuffer = Buffer.from(flow.data, 'base64');
    const decompressed = await gunzipAsync(compressedBuffer);
    const dataString = decompressed.toString('utf8');

    return NextResponse.json({
      date: flow.date,
      data: JSON.parse(dataString),
      size: flow.size,
      createdAt: flow.createdAt,
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
    let range: { gte: Date; lt: Date }
    try { range = dayRange(decodeURIComponent(date)) }
    catch { return NextResponse.json({ error: 'Invalid date format' }, { status: 400 }) }

    console.log('[DELETE flow] date param:', date, '| range:', range.gte.toISOString(), '→', range.lt.toISOString())

    const result = await prisma.flow.deleteMany({
      where: { date: { gte: range.gte, lt: range.lt } },
    });

    console.log('[DELETE flow] Deleted count:', result.count)

    if (result.count === 0) {
      return NextResponse.json({ error: 'Flow not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, deleted: result.count });
  } catch (error) {
    console.error('Error deleting flow:', error);
    return NextResponse.json({ error: 'Failed to delete flow' }, { status: 500 });
  }
}
