import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

// PROFESSIONAL-GRADE CACHING FOR LARGE DATASETS - optimized for multi-year data
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 600000; // 10 minutes for large historical datasets

// CACHE MANAGEMENT for optimal memory usage
const MAX_CACHE_SIZE = 200; // Maximum number of cached requests
const cleanupCache = () => {
  if (cache.size > MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) {
      cache.delete(oldestKey);
      console.log(`🧹 Cache cleanup: removed oldest entry (${cache.size}/${MAX_CACHE_SIZE})`);
    }
  }
};

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbol = searchParams.get('symbol');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const timeframe = searchParams.get('timeframe') || '1d';

    if (!symbol || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'Missing required parameters: symbol, startDate, endDate' },
        { status: 400 }
      );
    }

    // CACHE KEY for ultra-fast repeated requests
    const cacheKey = `${symbol}-${startDate}-${endDate}-${timeframe}`;
    const now = Date.now();
    
    // Clean up cache if needed
    cleanupCache();
    
    // Check cache first for INSTANT response
    if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey)!;
      if (now - cached.timestamp < CACHE_DURATION) {
        console.log(`⚡ CACHE HIT: ${symbol} ${timeframe} (${cache.size} cached items)`);
        return NextResponse.json(cached.data);
      } else {
        cache.delete(cacheKey); // Remove expired cache
      }
    }

    console.log(`📊 PROFESSIONAL API: Fetching ${timeframe} data for ${symbol} from ${startDate} to ${endDate}`);

    // Map timeframes to Polygon.io format
    const timeframeMap: { [key: string]: { multiplier: number; timespan: string } } = {
      '1m': { multiplier: 1, timespan: 'minute' },
      '5m': { multiplier: 5, timespan: 'minute' },
      '15m': { multiplier: 15, timespan: 'minute' },
      '30m': { multiplier: 30, timespan: 'minute' },
      '1h': { multiplier: 1, timespan: 'hour' },
      '4h': { multiplier: 4, timespan: 'hour' },
      '1d': { multiplier: 1, timespan: 'day' },
      '1w': { multiplier: 1, timespan: 'week' },
      '1mo': { multiplier: 1, timespan: 'month' }
    };

    const timeframeConfig = timeframeMap[timeframe] || { multiplier: 1, timespan: 'day' };

    // Make request to Polygon.io API with PROFESSIONAL-GRADE settings
    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/${timeframeConfig.multiplier}/${timeframeConfig.timespan}/${startDate}/${endDate}?adjusted=true&sort=asc&limit=50000&apikey=${POLYGON_API_KEY}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'User-Agent': 'Bloomberg-Terminal/1.0'
      },
      // PROFESSIONAL TIMEOUT - Allow more time for large datasets
      signal: AbortSignal.timeout(15000), // 15 second timeout for large data
    });

    if (!response.ok) {
      console.error(`❌ Polygon API Error for ${symbol}: ${response.status} ${response.statusText}`);
      if (response.status === 401) {
        throw new Error('Invalid API key. Please check your Polygon.io API key.');
      } else if (response.status === 429) {
        // Return cached data if available during rate limiting
        const anyCachedData = Array.from(cache.values()).find(cached => 
          cached.data && cached.data.results && cached.data.results.length > 0
        );
        if (anyCachedData) {
          console.log(`⚠️ Rate limited, returning cached data for ${symbol}`);
          return NextResponse.json(anyCachedData.data);
        }
        throw new Error('Rate limit exceeded. Please wait before making more requests.');
      } else if (response.status === 403) {
        throw new Error('Access forbidden. Your API key may not have permission to access this data.');
      } else {
        throw new Error(`Polygon.io API error: ${response.status} ${response.statusText}`);
      }
    }

    const data = await response.json();
    
    if (data.status === 'ERROR') {
      throw new Error(data.error || 'Unknown error from Polygon.io API');
    }

    // Validate that we have actual data
    if (!data.results || !Array.isArray(data.results) || data.results.length === 0) {
      console.warn(`⚠️ No data returned for ${symbol} in timeframe ${timeframe}`);
      // Return a minimal valid response to prevent errors
      return NextResponse.json({
        ticker: symbol,
        queryCount: 0,
        resultsCount: 0,
        adjusted: true,
        results: [],
        status: 'OK',
        message: `No data available for ${symbol} in the requested timeframe`
      });
    }

    console.log(`⚡ ULTRA-FAST: ${data.resultsCount || 0} data points for ${symbol} in ${timeframe}`);
    
    // CACHE THE RESULT for next request
    cache.set(cacheKey, { data, timestamp: now });
    
    // Clean old cache entries (keep cache size manageable)
    if (cache.size > 1000) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey) cache.delete(oldestKey);
    }
    
    return NextResponse.json(data);

  } catch (error) {
    console.error('❌ Historical data API error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to fetch historical data',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
