import { NextRequest, NextResponse } from 'next/server';
import RRGService from '@/lib/rrgService';

// Rate limiting store
const rateLimiter = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  const maxRequests = 20; // 20 requests per minute for data endpoints
  
  if (!rateLimiter.has(ip)) {
    rateLimiter.set(ip, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  const limit = rateLimiter.get(ip)!;
  if (now > limit.resetTime) {
    rateLimiter.set(ip, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (limit.count >= maxRequests) {
    return false;
  }
  
  limit.count++;
  return true;
}

export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const clientIP = request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    'unknown';
    
    if (!checkRateLimit(clientIP)) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol')?.toUpperCase();
    const timeframe = searchParams.get('timeframe') || '14 weeks';
    const benchmark = searchParams.get('benchmark') || 'SPY';
    const mode = searchParams.get('mode') || 'sectors'; // 'sectors' or 'holdings'

    const rrgService = new RRGService();

    // Map timeframe to RRG parameters
    const timeframeMap: Record<string, { weeks: number; rsPeriod: number; momentumPeriod: number }> = {
      '4 weeks': { weeks: 8, rsPeriod: 4, momentumPeriod: 4 },
      '8 weeks': { weeks: 12, rsPeriod: 8, momentumPeriod: 8 },
      '14 weeks': { weeks: 18, rsPeriod: 14, momentumPeriod: 14 },
      '26 weeks': { weeks: 30, rsPeriod: 26, momentumPeriod: 26 },
      '52 weeks': { weeks: 56, rsPeriod: 52, momentumPeriod: 52 }
    };

    const params = timeframeMap[timeframe] || timeframeMap['14 weeks'];

    let rrgData;

    if (mode === 'sectors') {
      // Get sector RRG data
      rrgData = await rrgService.calculateSectorRRG(
        params.weeks,
        params.rsPeriod,
        params.momentumPeriod,
        10
      );
    } else if (mode === 'holdings' && symbol) {
      // Get holdings data for specific sector ETF
      const sectorETFs: Record<string, string[]> = {
        'XLK': ['AAPL', 'MSFT', 'NVDA', 'AVGO', 'CRM', 'ORCL', 'ADBE', 'ACN', 'CSCO', 'AMD'],
        'XLF': ['BRK-B', 'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'SPGI', 'AXP'],
        'XLV': ['UNH', 'JNJ', 'PFE', 'ABBV', 'MRK', 'TMO', 'ABT', 'DHR', 'BMY', 'ELV'],
        'XLI': ['CAT', 'RTX', 'HON', 'UPS', 'LMT', 'BA', 'UNP', 'ADP', 'DE', 'MMM'],
        'XLY': ['AMZN', 'TSLA', 'HD', 'MCD', 'BKNG', 'NKE', 'LOW', 'SBUX', 'TJX', 'ORLY'],
        'XLP': ['PG', 'KO', 'PEP', 'WMT', 'COST', 'MDLZ', 'CL', 'KMB', 'GIS', 'K'],
        'XLE': ['XOM', 'CVX', 'COP', 'EOG', 'SLB', 'PSX', 'VLO', 'MPC', 'OXY', 'BKR'],
        'XLU': ['NEE', 'SO', 'DUK', 'CEG', 'SRE', 'AEP', 'VST', 'D', 'PCG', 'PEG'],
        'XLRE': ['PLD', 'AMT', 'CCI', 'EQIX', 'PSA', 'WELL', 'DLR', 'O', 'SBAC', 'EQR'],
        'XLB': ['LIN', 'SHW', 'APD', 'FCX', 'ECL', 'CTVA', 'VMC', 'MLM', 'NUE', 'DD'],
        'XLC': ['GOOGL', 'GOOG', 'META', 'NFLX', 'DIS', 'CMCSA', 'VZ', 'T', 'TMUS', 'CHTR']
      };

      const holdings = sectorETFs[symbol];
      if (holdings) {
        rrgData = await rrgService.calculateCustomRRG(
          holdings,
          symbol,
          params.weeks,
          params.rsPeriod,
          params.momentumPeriod,
          10
        );
      } else {
        return NextResponse.json(
          { error: `Holdings not found for ${symbol}` },
          { status: 404 }
        );
      }
    } else {
      return NextResponse.json(
        { error: 'Invalid parameters. Specify mode=sectors or mode=holdings&symbol=XLK' },
        { status: 400 }
      );
    }

    // Determine quadrants for each symbol
    const quadrantData = rrgData.map(item => {
      let quadrant = '';
      if (item.rsRatio >= 100 && item.rsMomentum >= 100) {
        quadrant = 'Leading';
      } else if (item.rsRatio >= 100 && item.rsMomentum < 100) {
        quadrant = 'Weakening';
      } else if (item.rsRatio < 100 && item.rsMomentum < 100) {
        quadrant = 'Lagging';
      } else {
        quadrant = 'Improving';
      }

      return {
        ...item,
        quadrant,
        timeframe,
        benchmark,
        lastUpdated: new Date().toISOString()
      };
    });

    // If specific symbol requested, filter for it
    if (symbol && mode === 'sectors') {
      const symbolData = quadrantData.find(item => item.symbol === symbol);
      if (symbolData) {
        return NextResponse.json({
          symbol,
          data: symbolData,
          timeframe,
          benchmark,
          quadrants: {
            leading: quadrantData.filter(d => d.quadrant === 'Leading').length,
            weakening: quadrantData.filter(d => d.quadrant === 'Weakening').length,
            lagging: quadrantData.filter(d => d.quadrant === 'Lagging').length,
            improving: quadrantData.filter(d => d.quadrant === 'Improving').length
          }
        });
      } else {
        return NextResponse.json(
          { error: `Symbol ${symbol} not found in RRG data` },
          { status: 404 }
        );
      }
    }

    // Return all data with summary
    return NextResponse.json({
      data: quadrantData,
      summary: {
        total: quadrantData.length,
        leading: quadrantData.filter(d => d.quadrant === 'Leading').length,
        weakening: quadrantData.filter(d => d.quadrant === 'Weakening').length,
        lagging: quadrantData.filter(d => d.quadrant === 'Lagging').length,
        improving: quadrantData.filter(d => d.quadrant === 'Improving').length
      },
      parameters: {
        timeframe,
        benchmark,
        mode,
        requestedSymbol: symbol
      },
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('RRG API Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch RRG data' },
      { status: 500 }
    );
  }
}
