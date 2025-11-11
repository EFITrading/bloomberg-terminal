import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type'); // 'gex' or 'otm'

    if (!type || !['gex', 'otm'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid type parameter. Must be "gex" or "otm"' },
        { status: 400 }
      );
    }

    // Get scans from last 15 minutes
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    if (type === 'gex') {
      const cachedScans = await prisma.gexScanCache.findMany({
        where: {
          scan_timestamp: {
            gte: fifteenMinutesAgo
          }
        },
        orderBy: {
          gex_value: 'desc'
        },
        take: 100
      });

      const scannedAt = cachedScans.length > 0 ? cachedScans[0].scan_timestamp : null;

      return NextResponse.json({
        success: true,
        type: 'gex',
        count: cachedScans.length,
        data: cachedScans,
        scannedAt,
        timestamp: new Date().toISOString()
      });
    }

    if (type === 'otm') {
      const cachedScans = await prisma.otmScanCache.findMany({
        where: {
          scan_timestamp: {
            gte: fifteenMinutesAgo
          }
        },
        orderBy: {
          total_otm_premium: 'desc'
        },
        take: 100
      });

      const scannedAt = cachedScans.length > 0 ? cachedScans[0].scan_timestamp : null;

      return NextResponse.json({
        success: true,
        type: 'otm',
        count: cachedScans.length,
        data: cachedScans,
        scannedAt,
        timestamp: new Date().toISOString()
      });
    }

    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Cached scans error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
