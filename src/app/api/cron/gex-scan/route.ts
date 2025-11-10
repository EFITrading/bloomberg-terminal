import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

// Authorization header for Vercel Cron
const CRON_SECRET = process.env.CRON_SECRET || 'your-secret-key';

// Top 1000 symbols for scanning
const TOP_1000_SYMBOLS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK/B', 'V', 'JNJ',
  'WMT', 'JPM', 'MA', 'PG', 'UNH', 'HD', 'DIS', 'BAC', 'XOM', 'ORCL',
  // ... Add remaining symbols from TOP_SCREENER_SYMBOLS in gex-screener/route.ts
];

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

    // Check if market is open (9:30 AM - 4:00 PM ET, Monday-Friday)
    const now = new Date();
    const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const hour = etTime.getHours();
    const minute = etTime.getMinutes();
    const day = etTime.getDay();
    
    const isMarketHours = 
      day >= 1 && day <= 5 && // Monday-Friday
      ((hour === 9 && minute >= 30) || (hour > 9 && hour < 16));

    if (!isMarketHours) {
      return NextResponse.json({ 
        message: 'Market is closed', 
        timestamp: etTime.toISOString() 
      }, { status: 200 });
    }

    console.log('🔄 Starting GEX scan cron job...');
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
        if (!optionsData.results || optionsData.results.length === 0) continue;

        // Calculate GEX
        let callGEX = 0;
        let putGEX = 0;
        
        for (const option of optionsData.results) {
          const details = option.details;
          const greeks = option.greeks;
          
          if (!details || !greeks || !greeks.gamma) continue;
          
          const openInterest = details.open_interest || 0;
          const strikePrice = details.strike_price || 0;
          const gamma = greeks.gamma;
          
          // GEX = Gamma × Open Interest × Strike Price × 100
          const gex = gamma * openInterest * strikePrice * 100;
          
          if (details.contract_type === 'call') {
            callGEX += gex;
          } else if (details.contract_type === 'put') {
            putGEX += gex;
          }
        }

        const netGEX = callGEX - putGEX;

        // Get spot price
        let spotPrice: number | undefined;
        try {
          const quoteUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apikey=${POLYGON_API_KEY}`;
          const quoteRes = await fetch(quoteUrl, { next: { revalidate: 60 } });
          if (quoteRes.ok) {
            const quoteData = await quoteRes.json();
            spotPrice = quoteData?.ticker?.lastTrade?.p;
          }
        } catch (e) {
          console.error(`Quote fetch error for ${ticker}:`, e);
        }

        results.push({
          ticker,
          gexValue: netGEX,
          callGEX,
          putGEX,
          spotPrice,
        });

      } catch (error) {
        console.error(`Error scanning ${ticker}:`, error);
      }
    }

    // Store results in database (clear old data first)
    await prisma.gexScanCache.deleteMany({
      where: {
        scan_timestamp: {
          lt: new Date(Date.now() - 15 * 60 * 1000) // Delete scans older than 15 minutes
        }
      }
    });

    // Insert new scan results
    await prisma.gexScanCache.createMany({
      data: results.map(r => ({
        ticker: r.ticker,
        gex_value: r.gexValue,
        call_gex: r.callGEX,
        put_gex: r.putGEX,
        spot_price: r.spotPrice,
        scan_timestamp: new Date(),
      }))
    });

    const duration = Date.now() - startTime;
    console.log(`✅ GEX scan completed: ${results.length} symbols in ${duration}ms`);

    return NextResponse.json({
      success: true,
      scanned: results.length,
      duration,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('GEX cron error:', error);
    return NextResponse.json({ 
      error: 'Scan failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
