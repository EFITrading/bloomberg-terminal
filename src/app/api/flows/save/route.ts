import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { date, data } = await request.json();

    if (!date || !data) {
      return NextResponse.json(
        { error: 'Date and data are required' },
        { status: 400 }
      );
    }

    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format' },
        { status: 400 }
      );
    }

    // Normalize to midnight UTC to ensure consistent querying
    dateObj.setUTCHours(0, 0, 0, 0);

    const dataString = JSON.stringify(data);
    const originalSize = Buffer.byteLength(dataString, 'utf8');

    // Compress data using gzip to reduce size
    const compressed = await gzipAsync(dataString);
    const compressedSize = compressed.length;
    const compressedBase64 = compressed.toString('base64');

    console.log(`💾 Compressing flow: ${(originalSize / 1024 / 1024).toFixed(2)}MB → ${(compressedSize / 1024 / 1024).toFixed(2)}MB (${((compressedSize / originalSize) * 100).toFixed(1)}% of original)`);

    // Upsert the flow data (store compressed)
    const flow = await prisma.flow.upsert({
      where: { date: dateObj.toISOString() },
      update: { data: compressedBase64, size: originalSize },
      create: { date: dateObj.toISOString(), data: compressedBase64, size: originalSize },
      select: { id: true, date: true, size: true } // Only return minimal data
    });

    return NextResponse.json({ success: true, flow });
  } catch (error) {
    console.error('Error saving flow:', error);
    return NextResponse.json(
      { error: 'Failed to save flow' },
      { status: 500 }
    );
  }
}
