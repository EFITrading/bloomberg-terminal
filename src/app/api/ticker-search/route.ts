import { NextRequest, NextResponse } from 'next/server';
import { TICKER_DATABASE } from '@/lib/tickerDatabase';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query');

    if (!query || query.length < 1) {
      return NextResponse.json({
        success: false,
        results: []
      });
    }

    const upperQuery = query.toUpperCase();

    // Search local database - INSTANT results
    let results = TICKER_DATABASE
      .filter((ticker) => ticker.ticker.startsWith(upperQuery))
      .map((ticker) => ({
        ticker: ticker.ticker,
        name: ticker.name,
        market: 'stocks',
        type: ticker.type,
        primary_exchange: '',
        active: true
      }));

    // Sort results: exact match first, then by length (shorter first), then alphabetically
    results.sort((a, b) => {
      const aUpper = a.ticker;
      const bUpper = b.ticker;

      // Exact match comes first
      if (aUpper === upperQuery) return -1;
      if (bUpper === upperQuery) return 1;

      // Then sort by length (shorter tickers first)
      if (a.ticker.length !== b.ticker.length) {
        return a.ticker.length - b.ticker.length;
      }

      // Finally, alphabetically
      return a.ticker.localeCompare(b.ticker);
    });

    // Limit to 15 results
    results = results.slice(0, 15);

    return NextResponse.json({
      success: true,
      results,
      count: results.length
    });

  } catch (error) {
    console.error('❌ Ticker search error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      results: []
    }, { status: 500 });
  }
}
