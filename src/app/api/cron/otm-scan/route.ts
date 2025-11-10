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
  // ... Add remaining symbols from TOP_SCREENER_SYMBOLS
];

interface OTMResult {
  ticker: string;
  totalOTMPremium: number;
  callPremium: number;
  putPremium: number;
  spotPrice?: number;
  bullishRatio?: number;
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

    console.log('🔄 Starting OTM Premium scan cron job...');
    const startTime = Date.now();
    const results: OTMResult[] = [];

    // Scan top symbols (limit to prevent timeout)
    const symbolsToScan = TOP_1000_SYMBOLS.slice(0, 100);
    
    for (const ticker of symbolsToScan) {
      try {
        // Get spot price first
        const quoteUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apikey=${POLYGON_API_KEY}`;
        const quoteRes = await fetch(quoteUrl, { next: { revalidate: 60 } });
        
        if (!quoteRes.ok) continue;
        
        const quoteData = await quoteRes.json();
        const spotPrice = quoteData?.ticker?.lastTrade?.p;
        
        if (!spotPrice) continue;

        // Fetch options data
        const optionsUrl = `https://api.polygon.io/v3/snapshot/options/${ticker}?apikey=${POLYGON_API_KEY}`;
        const optionsRes = await fetch(optionsUrl, { next: { revalidate: 60 } });
        
        if (!optionsRes.ok) continue;
        
        const optionsData = await optionsRes.json();
        if (!optionsData.results || optionsData.results.length === 0) continue;

        // Calculate OTM premiums
        let callPremium = 0;
        let putPremium = 0;
        
        for (const option of optionsData.results) {
          const details = option.details;
          const lastQuote = option.last_quote;
          
          if (!details || !lastQuote) continue;
          
          const strikePrice = details.strike_price || 0;
          const openInterest = details.open_interest || 0;
          const bid = lastQuote.bid || 0;
          const ask = lastQuote.ask || 0;
          const midPrice = (bid + ask) / 2;
          
          // Check if OTM
          const isCall = details.contract_type === 'call';
          const isPut = details.contract_type === 'put';
          const isOTM = (isCall && strikePrice > spotPrice) || (isPut && strikePrice < spotPrice);
          
          if (!isOTM) continue;
          
          // Calculate premium: mid price × open interest × 100
          const premium = midPrice * openInterest * 100;
          
          if (isCall) {
            callPremium += premium;
          } else if (isPut) {
            putPremium += premium;
          }
        }

        const totalPremium = callPremium + putPremium;
        const bullishRatio = totalPremium > 0 ? callPremium / totalPremium : 0.5;

        if (totalPremium > 0) {
          results.push({
            ticker,
            totalOTMPremium: totalPremium,
            callPremium,
            putPremium,
            spotPrice,
            bullishRatio,
          });
        }

      } catch (error) {
        console.error(`Error scanning ${ticker}:`, error);
      }
    }

    // Store results in database (clear old data first)
    await prisma.otmScanCache.deleteMany({
      where: {
        scan_timestamp: {
          lt: new Date(Date.now() - 15 * 60 * 1000) // Delete scans older than 15 minutes
        }
      }
    });

    // Insert new scan results
    await prisma.otmScanCache.createMany({
      data: results.map(r => ({
        ticker: r.ticker,
        total_otm_premium: r.totalOTMPremium,
        call_premium: r.callPremium,
        put_premium: r.putPremium,
        spot_price: r.spotPrice,
        bullish_ratio: r.bullishRatio,
        scan_timestamp: new Date(),
      }))
    });

    const duration = Date.now() - startTime;
    console.log(`✅ OTM scan completed: ${results.length} symbols in ${duration}ms`);

    return NextResponse.json({
      success: true,
      scanned: results.length,
      duration,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('OTM cron error:', error);
    return NextResponse.json({ 
      error: 'Scan failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
