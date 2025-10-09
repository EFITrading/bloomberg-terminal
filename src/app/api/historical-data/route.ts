import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

// Type definitions for Polygon API
interface PolygonDataItem {
  t: number; // timestamp
  o: number; // open
  h: number; // high
  l: number; // low
  c: number; // close
  v: number; // volume
  vw?: number; // volume weighted average price
  n?: number; // number of transactions
}

interface PolygonApiResponse {
  ticker: string;
  queryCount: number;
  resultsCount: number;
  adjusted: boolean;
  results: PolygonDataItem[];
  status: string;
  message?: string;
}

// PROFESSIONAL-GRADE CACHING FOR LARGE DATASETS - optimized for multi-year data
const cache = new Map<string, { data: PolygonApiResponse; timestamp: number }>();
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

// Smart data point limits based on timeframe to prioritize recent data
function getMaxDataPointsForTimeframe(timeframe: string): number {
  // OPTIMIZED for FAST LOADING - prioritize speed over historical depth
  switch (timeframe) {
    case '1m':
      return 500;   // ~8 hours of minute data
    case '5m':
      return 1000;  // ~3.5 days of 5-minute data (reduced from 2000)
    case '15m':
      return 800;   // ~8 days of 15-minute data (reduced from 1500)
    case '30m':
      return 600;   // ~12 days of 30-minute data (reduced from 1000)
    case '1h':
      return 500;   // ~20 days of hourly data (reduced from 800)
    case '4h':
      return 400;   // ~66 days of 4-hour data (reduced from 600)
    case '1d':
      return 2500;  // ~7 years of daily data (reduced from 7124 for MUCH faster loading)
    case '1w':
      return 500;   // ~9.5 years of weekly data (reduced from 1000)
    case '1M':
      return 120;   // ~10 years of monthly data (reduced from 234)
    default:
      return 500;   // Default limit (reduced from 1000)
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbol = searchParams.get('symbol');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const timeframe = searchParams.get('timeframe') || '1d';
  const nocache = searchParams.get('nocache') === 'true';
  const force = searchParams.get('force');

  try {

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
    
    // Skip cache if nocache is requested or if forcing current data
    const skipCache = nocache || force === 'current';
    
    // Check cache first for INSTANT response (unless skipping cache)
    if (!skipCache && cache.has(cacheKey)) {
      const cached = cache.get(cacheKey)!;
      if (now - cached.timestamp < CACHE_DURATION) {
        console.log(`⚡ CACHE HIT: ${symbol} ${timeframe} (${cache.size} cached items)`);
        return NextResponse.json(cached.data);
      } else {
        cache.delete(cacheKey); // Remove expired cache
      }
    }

    if (skipCache) {
      console.log(`🔥 CACHE BYPASS: Forcing fresh data for ${symbol} ${timeframe} up to ${endDate}`);
    }

    console.log(`📊 PROFESSIONAL API: Fetching ${timeframe} data for ${symbol} from ${startDate} to ${endDate}${skipCache ? ' (FRESH DATA)' : ''}`);

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
    // Request in DESCENDING order to get latest data first, then limit
    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/${timeframeConfig.multiplier}/${timeframeConfig.timespan}/${startDate}/${endDate}?adjusted=true&sort=desc&limit=50000&apikey=${POLYGON_API_KEY}`;
    
    console.log(`🔗 Polygon API URL (DESC order for latest first): ${url}`);
    
    // Create abort controller for timeout (more compatible than AbortSignal.timeout)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'User-Agent': 'Bloomberg-Terminal/1.0'
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

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

    // CRITICAL FIX: Since we requested DESC order, data is newest-first
    // Apply intelligent limits based on timeframe to prioritize recent data
    let limitedResults = data.results;
    const maxDataPoints = getMaxDataPointsForTimeframe(timeframe);
    
    if (limitedResults.length > maxDataPoints) {
      // Take the first N results (which are the newest due to DESC order)
      limitedResults = limitedResults.slice(0, maxDataPoints);
      console.log(`📊 Limited to ${maxDataPoints} most recent data points for ${timeframe}`);
    }
    
    // Reverse back to ascending order (oldest to newest) for chart display
    limitedResults.reverse();
    
    console.log(`⚡ ULTRA-FAST: ${limitedResults.length} data points for ${symbol} in ${timeframe} (showing latest data)`);
    
    // Log the actual data range received
    if (limitedResults.length > 0) {
      const firstPoint = new Date(limitedResults[0].t).toISOString().split('T')[0];
      const lastPoint = new Date(limitedResults[limitedResults.length - 1].t).toISOString().split('T')[0];
      console.log(`📅 Data range received: ${firstPoint} to ${lastPoint} (should end around Sep 12, 2025)`);
    }

    // Create response with limited, properly ordered data
    const finalResponse = {
      ...data,
      results: limitedResults,
      resultsCount: limitedResults.length
    };
    
    // CACHE THE RESULT for next request (unless we're forcing fresh data)
    if (!skipCache) {
      cache.set(cacheKey, { data: finalResponse, timestamp: now });
    }
    
    // Clean old cache entries (keep cache size manageable)
    if (cache.size > 1000) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey) cache.delete(oldestKey);
    }
    
    return NextResponse.json(finalResponse);

  } catch (error) {
    console.error('❌ Historical data API error:', error);
    
    // Handle specific error types
    let errorMessage = 'Failed to fetch historical data';
    let statusCode = 500;
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        errorMessage = 'Request timeout - please try again';
        statusCode = 408;
      } else if (error.message.includes('fetch')) {
        errorMessage = 'Network error - unable to connect to data provider';
        statusCode = 503;
      } else if (error.message.includes('API key')) {
        errorMessage = 'Invalid API configuration';
        statusCode = 401;
      } else {
        errorMessage = error.message;
      }
    }
    
    return NextResponse.json(
      { 
        error: errorMessage,
        timestamp: new Date().toISOString(),
        symbol: symbol || 'unknown'
      },
      { status: statusCode }
    );
  }
}
