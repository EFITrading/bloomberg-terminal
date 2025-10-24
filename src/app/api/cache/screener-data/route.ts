import { NextRequest, NextResponse } from 'next/server';
import { screenerCache } from '@/lib/screenerCache';

/**
 * Cache API - Returns pre-computed screener data
 * GET /api/cache/screener-data?type=seasonal-opportunities
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const screenerId = searchParams.get('screenerId'); // Support both type and screenerId
  const all = searchParams.get('all') === 'true';

  if (all) {
    // Return all cached screener data
    const allData: Record<string, any> = {};
    const cacheEntries: Record<string, any> = {};
    
    for (const [key, value] of screenerCache.entries()) {
      if (value.expiresAt > Date.now()) {
        allData[key] = value.data;
        cacheEntries[key] = {
          lastUpdated: new Date(value.timestamp).toISOString(),
          expiresAt: new Date(value.expiresAt).toISOString(),
          isStale: value.expiresAt < Date.now()
        };
      }
    }

    return NextResponse.json({
      success: true,
      data: allData,
      cache: cacheEntries,
      totalEntries: screenerCache.size
    });
  }

  const cacheKey = screenerId || type; // Support both parameters
  
  if (!cacheKey) {
    return NextResponse.json({ 
      error: 'Missing type or screenerId parameter',
      availableTypes: [
        'seasonal-opportunities',
        'premium-screener', 
        'gex-screener',
        'market-sentiment',
        'sector-analysis',
        'watchlist-data',
        'options-flow-scan',
        'spy-algoflow' // SPY AlgoFlow data
      ]
    }, { status: 400 });
  }

  const cachedData = screenerCache.get(cacheKey);
  
  if (!cachedData) {
    return NextResponse.json({ 
      error: `No cached data for key: ${cacheKey}`,
      message: 'Background screener may not have run yet. Try again in a few minutes.'
    }, { status: 404 });
  }

  // Check if data is stale
  const isStale = cachedData.expiresAt < Date.now();
  
  // Special handling for SPY AlgoFlow data
  if (cacheKey === 'spy-algoflow') {
    return NextResponse.json({
      success: true,
      screenerId: cacheKey,
      data: cachedData.data,
      fromCache: true,
      cacheAge: Math.floor((Date.now() - cachedData.timestamp) / 1000 / 60), // Age in minutes
      metadata: {
        lastUpdated: new Date(cachedData.timestamp).toISOString(),
        expiresAt: new Date(cachedData.expiresAt).toISOString(),
        isStale,
        age: Date.now() - cachedData.timestamp
      }
    });
  }
  
  return NextResponse.json({
    success: true,
    type: cacheKey,
    data: cachedData.data,
    metadata: {
      lastUpdated: new Date(cachedData.timestamp).toISOString(),
      expiresAt: new Date(cachedData.expiresAt).toISOString(),
      isStale,
      age: Date.now() - cachedData.timestamp
    }
  });
}

/**
 * Cache Status API - Returns cache statistics
 * GET /api/cache/screener-data/status
 */
export async function POST(request: NextRequest) {
  const cacheStats = {
    totalEntries: screenerCache.size,
    entries: [] as any[]
  };

  for (const [key, value] of screenerCache.entries()) {
    cacheStats.entries.push({
      type: key,
      lastUpdated: new Date(value.timestamp).toISOString(),
      expiresAt: new Date(value.expiresAt).toISOString(),
      isStale: value.expiresAt < Date.now(),
      age: Date.now() - value.timestamp,
      dataSize: JSON.stringify(value.data).length
    });
  }

  return NextResponse.json({
    success: true,
    cache: cacheStats
  });
}