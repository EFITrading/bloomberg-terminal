/**
 * API: Get Market Regimes (Cached)
 * Returns pre-computed market regime data from cache
 * Stale-while-revalidate pattern for instant response
 */

import { NextRequest, NextResponse } from 'next/server';
import { kvGet, kvMGet, kvExists } from '@/lib/kv';
import { IndustryAnalysisService } from '@/lib/industryAnalysisService';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  console.log('📊 API: Fetching market regimes from cache...');

  try {
    // Try to get the full snapshot first
    const snapshot = await kvGet<any>('market:regimes:snapshot');

    if (snapshot) {
      const age = Date.now() - snapshot.timestamp;
      const ageMinutes = Math.floor(age / 60000);

      console.log(`✅ Cache HIT: Market regimes (${ageMinutes}m old)`);

      return NextResponse.json({
        success: true,
        cached: true,
        age_ms: age,
        data: {
          life: snapshot.life,
          developing: snapshot.developing,
          momentum: snapshot.momentum,
          legacy: snapshot.legacy,
        },
        timestamp: snapshot.timestamp,
        next_update: snapshot.next_update,
      }, {
        headers: {
          'Cache-Control': 's-maxage=300, stale-while-revalidate=600',
          'CDN-Cache-Control': 'max-age=300',
          'Vercel-CDN-Cache-Control': 'max-age=300',
        },
      });
    }

    // Cache miss - try to get individual regimes
    console.log('⚠️ Cache MISS: Snapshot not found, checking individual regimes...');

    const [life, developing, momentum, legacy] = await kvMGet([
      'market:regime:life',
      'market:regime:developing',
      'market:regime:momentum',
      'market:regime:legacy',
    ]);

    // If we have at least some cached data, return it
    if (life || developing || momentum || legacy) {
      console.log('✅ Partial cache HIT: Returning available regimes');

      return NextResponse.json({
        success: true,
        cached: true,
        partial: true,
        data: {
          life: life || null,
          developing: developing || null,
          momentum: momentum || null,
          legacy: legacy || null,
        },
        timestamp: Date.now(),
      }, {
        headers: {
          'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
        },
      });
    }

    // Complete cache miss - fetch fresh data (fallback)
    console.log('⚠️ Complete cache MISS: Fetching fresh data...');

    const [lifeData, developingData, momentumData, legacyData] = await Promise.allSettled([
      IndustryAnalysisService.analyzeTimeframe(5, 'Life'),
      IndustryAnalysisService.analyzeTimeframe(21, 'Developing'),
      IndustryAnalysisService.analyzeTimeframe(80, 'Momentum'),
      IndustryAnalysisService.analyzeTimeframe(252, 'Legacy'),
    ]);

    const data = {
      life: lifeData.status === 'fulfilled' ? lifeData.value : null,
      developing: developingData.status === 'fulfilled' ? developingData.value : null,
      momentum: momentumData.status === 'fulfilled' ? momentumData.value : null,
      legacy: legacyData.status === 'fulfilled' ? legacyData.value : null,
    };

    const duration = Date.now() - startTime;
    console.log(`✅ Fresh data fetched in ${duration}ms`);

    return NextResponse.json({
      success: true,
      cached: false,
      fresh: true,
      data,
      timestamp: Date.now(),
      fetch_duration_ms: duration,
    }, {
      headers: {
        'Cache-Control': 's-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error: any) {
    console.error('❌ API Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error.message,
        timestamp: Date.now(),
      },
      { status: 500 }
    );
  }
}

// Edge runtime for faster response
export const runtime = 'nodejs';
export const maxDuration = 30;
