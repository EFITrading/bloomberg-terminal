import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { TOP_1000_SYMBOLS } from '@/lib/Top1000Symbols';

const prisma = new PrismaClient();
const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

// Authorization header for Vercel Cron
const CRON_SECRET = process.env.CRON_SECRET || 'your-secret-key';

interface GEXResult {
  ticker: string;
  gexValue: number;
  callGEX: number;
  putGEX: number;
  spotPrice?: number;
  marketCap?: number;
}

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🔄 Starting GEX scan cron job (24/7 mode)...');
    const startTime = Date.now();
    const results: GEXResult[] = [];

    // Scan top symbols (limit to prevent timeout)
    const symbolsToScan = TOP_1000_SYMBOLS.slice(0, 100);
    
    for (const ticker of symbolsToScan) {
      try {
        // Fetch options data from Polygon
        const optionsUrl = `https://api.polygon.io/v3/snapshot/options/${ticker}?apikey=${POLYGON_API_KEY}`;
        const optionsRes = await fetch(optionsUrl, { next: { revalidate: 60 } });
        
        if (!optionsRes.ok) continue;
        
        const optionsData = await optionsRes.json();
        if (!optionsData.results?.length) continue;

        // Get spot price
        const spotPrice = optionsData.results[0]?.underlying_asset?.price || 0;
        if (!spotPrice) continue;

        // Calculate GEX
        let callGEX = 0;
        let putGEX = 0;

        for (const option of optionsData.results) {
          const strike = option.details?.strike_price || 0;
          const gamma = option.greeks?.gamma || 0;
          const openInterest = option.open_interest || 0;
          const volume = option.day?.volume || 0;

          if (!strike || !gamma) continue;

          const gexContribution = gamma * openInterest * 100 * spotPrice * spotPrice / 1e9;

          if (option.details?.contract_type === 'call') {
            callGEX += gexContribution;
          } else if (option.details?.contract_type === 'put') {
            putGEX += gexContribution;
          }
        }

        const netGEX = callGEX - putGEX;

        if (Math.abs(netGEX) > 0) {
          results.push({
            ticker,
            gexValue: netGEX,
            callGEX,
            putGEX,
            spotPrice,
            marketCap: 0
          });
        }
      } catch (error) {
        console.error(`Error scanning ${ticker}:`, error);
        continue;
      }
    }

    // Delete old scans (older than 15 minutes)
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    await prisma.gexScanCache.deleteMany({
      where: {
        scan_timestamp: {
          lt: fifteenMinutesAgo
        }
      }
    });

    // Insert new results
    if (results.length > 0) {
      await prisma.gexScanCache.createMany({
        data: results.map(r => ({
          ticker: r.ticker,
          gex_value: r.gexValue,
          call_gex: r.callGEX,
          put_gex: r.putGEX,
          spot_price: r.spotPrice || 0,
          market_cap: r.marketCap || 0,
          scan_timestamp: new Date()
        }))
      });
    }

    const duration = Date.now() - startTime;
    console.log(`✅ GEX scan complete: ${results.length} symbols scanned in ${duration}ms`);

    return NextResponse.json({
      success: true,
      scanned: results.length,
      duration,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('GEX scan error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
