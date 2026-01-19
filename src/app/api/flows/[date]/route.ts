import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { gunzip } from 'zlib';
import { promisify } from 'util';

const gunzipAsync = promisify(gunzip);

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ date: string }> }
) {
  try {
    const { date } = await params;
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format' },
        { status: 400 }
      );
    }

    // Normalize to midnight UTC to match saved dates
    dateObj.setUTCHours(0, 0, 0, 0);

    const flow = await prisma.flow.findUnique({
      where: { date: dateObj.toISOString() },
    });

    if (!flow) {
      return NextResponse.json(
        { error: 'Flow not found' },
        { status: 404 }
      );
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
    return NextResponse.json(
      { error: 'Failed to fetch flow' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ date: string }> }
) {
  try {
    const { date } = await params;
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format' },
        { status: 400 }
      );
    }

    // Normalize to midnight UTC to match saved dates
    dateObj.setUTCHours(0, 0, 0, 0);

    await prisma.flow.delete({
      where: { date: dateObj.toISOString() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting flow:', error);
    return NextResponse.json(
      { error: 'Failed to delete flow' },
      { status: 500 }
    );
  }
}
