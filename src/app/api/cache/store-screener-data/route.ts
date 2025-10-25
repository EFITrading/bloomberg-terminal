import { NextRequest, NextResponse } from 'next/server';
import { screenerCache } from '@/lib/screenerCache';

/**
 * Store screener data in cache
 * POST /api/cache/store-screener-data
 */
export async function POST(request: NextRequest) {
  try {
    const { type, data, ttl = 10 * 60 * 1000 } = await request.json(); // Default 10 minutes TTL
    
    if (!type || !data) {
      return NextResponse.json({ 
        error: 'Missing type or data parameter' 
      }, { status: 400 });
    }
    
    // Store in cache
    const now = Date.now();
    screenerCache.set(type, {
      data,
      timestamp: now,
      expiresAt: now + ttl
    });
    
    console.log(`✅ Cached screener data for ${type} (TTL: ${ttl}ms)`);
    
    return NextResponse.json({
      success: true,
      message: `Data cached for ${type}`,
      type,
      ttl,
      expiresAt: new Date(now + ttl).toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error storing cache data:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}