/**
 * CRON JOB: Refresh Market Regimes
 * Runs every 5 minutes to keep market regime data fresh
 * 
 * Vercel Cron: https://vercel.com/docs/cron-jobs
 */

import { NextRequest, NextResponse } from 'next/server';
import { IndustryAnalysisService } from '@/lib/industryAnalysisService';
import { kvSet } from '@/lib/kv';

// Verify cron secret to prevent unauthorized access
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET || 'dev-secret-change-in-production';
  
  if (authHeader === `Bearer ${cronSecret}`) {
    return true;
  }
  
  console.warn('⚠️ Unauthorized cron attempt');
  return false;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  console.log('🔄 CRON: Starting market regime refresh...');

  // Verify authorization
  if (!verifyCronSecret(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    // Fetch all 4 market regime analyses in parallel
    const [lifeRegime, developingRegime, momentumRegime, legacyRegime] = await Promise.allSettled([
      IndustryAnalysisService.analyzeTimeframe(5, 'Life'), // 5 days
      IndustryAnalysisService.analyzeTimeframe(21, 'Developing'), // 21 days
      IndustryAnalysisService.analyzeTimeframe(80, 'Momentum'), // 80 days
      IndustryAnalysisService.analyzeTimeframe(252, 'Legacy'), // 252 days (1 year)
    ]);

    // Process results and store in cache
    const results: any = {
      timestamp: Date.now(),
      success: true,
      regimes: {},
      errors: [],
    };

    // Life Regime (5 days)
    if (lifeRegime.status === 'fulfilled' && lifeRegime.value) {
      results.regimes.life = lifeRegime.value;
      await kvSet('market:regime:life', lifeRegime.value, 600); // 10 min cache
      console.log('✅ Cached Life Regime (5d)');
    } else {
      results.errors.push('life');
      console.error('❌ Failed to fetch Life Regime:', lifeRegime);
    }

    // Developing Regime (21 days)
    if (developingRegime.status === 'fulfilled' && developingRegime.value) {
      results.regimes.developing = developingRegime.value;
      await kvSet('market:regime:developing', developingRegime.value, 600);
      console.log('✅ Cached Developing Regime (21d)');
    } else {
      results.errors.push('developing');
      console.error('❌ Failed to fetch Developing Regime:', developingRegime);
    }

    // Momentum Regime (80 days)
    if (momentumRegime.status === 'fulfilled' && momentumRegime.value) {
      results.regimes.momentum = momentumRegime.value;
      await kvSet('market:regime:momentum', momentumRegime.value, 600);
      console.log('✅ Cached Momentum Regime (80d)');
    } else {
      results.errors.push('momentum');
      console.error('❌ Failed to fetch Momentum Regime:', momentumRegime);
    }

    // Legacy Regime (252 days)
    if (legacyRegime.status === 'fulfilled' && legacyRegime.value) {
      results.regimes.legacy = legacyRegime.value;
      await kvSet('market:regime:legacy', legacyRegime.value, 600);
      console.log('✅ Cached Legacy Regime (252d)');
    } else {
      results.errors.push('legacy');
      console.error('❌ Failed to fetch Legacy Regime:', legacyRegime);
    }

    // Store combined snapshot
    const snapshot = {
      life: results.regimes.life || null,
      developing: results.regimes.developing || null,
      momentum: results.regimes.momentum || null,
      legacy: results.regimes.legacy || null,
      timestamp: results.timestamp,
      next_update: results.timestamp + 300000, // 5 minutes
    };

    await kvSet('market:regimes:snapshot', snapshot, 600); // 10 min cache

    const duration = Date.now() - startTime;
    console.log(`✅ CRON: Market regimes refreshed in ${duration}ms`);
    console.log(`📊 Success: ${Object.keys(results.regimes).length}/4 regimes`);

    return NextResponse.json({
      success: true,
      duration_ms: duration,
      regimes_updated: Object.keys(results.regimes).length,
      errors: results.errors,
      next_run: new Date(Date.now() + 300000).toISOString(), // 5 minutes
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('❌ CRON: Market regime refresh failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: error.message,
        duration_ms: duration,
      },
      { status: 500 }
    );
  }
}

// Allow manual triggering via POST (for testing)
export async function POST(request: NextRequest) {
  console.log('🔧 MANUAL: Market regime refresh triggered');
  return GET(request);
}

// Edge runtime for faster execution
export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds max
