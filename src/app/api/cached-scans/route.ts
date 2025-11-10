import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // 'gex' or 'otm'

    if (type === 'gex') {
      // Fetch latest GEX scan results
      const results = await prisma.gexScanCache.findMany({
        where: {
          scan_timestamp: {
            gte: new Date(Date.now() - 15 * 60 * 1000) // Only last 15 minutes
          }
        },
        orderBy: {
          scan_timestamp: 'desc'
        },
        take: 1000
      });

      return NextResponse.json({
        success: true,
        type: 'gex',
        count: results.length,
        data: results.map(r => ({
          ticker: r.ticker,
          gexValue: r.gex_value,
          callGEX: r.call_gex,
          putGEX: r.put_gex,
          spotPrice: r.spot_price,
          marketCap: r.market_cap,
          timestamp: r.scan_timestamp
        })),
        scannedAt: results.length > 0 ? results[0].scan_timestamp : null,
        timestamp: new Date().toISOString()
      });

    } else if (type === 'otm') {
      // Fetch latest OTM scan results
      const results = await prisma.otmScanCache.findMany({
        where: {
          scan_timestamp: {
            gte: new Date(Date.now() - 15 * 60 * 1000) // Only last 15 minutes
          }
        },
        orderBy: {
          scan_timestamp: 'desc'
        },
        take: 1000
      });

      return NextResponse.json({
        success: true,
        type: 'otm',
        count: results.length,
        data: results.map(r => ({
          ticker: r.ticker,
          totalOTMPremium: r.total_otm_premium,
          callPremium: r.call_premium,
          putPremium: r.put_premium,
          spotPrice: r.spot_price,
          bullishRatio: r.bullish_ratio,
          timestamp: r.scan_timestamp
        })),
        scannedAt: results.length > 0 ? results[0].scan_timestamp : null,
        timestamp: new Date().toISOString()
      });

    } else {
      return NextResponse.json({ 
        error: 'Invalid type parameter. Use ?type=gex or ?type=otm' 
      }, { status: 400 });
    }

  } catch (error) {
    console.error('Cached scans fetch error:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch cached scans',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
