// Instant symbol preloader API - called when user searches for new ticker
import { NextRequest, NextResponse } from 'next/server';
import preloaderService from '../../../lib/DataPreloaderService';

export async function POST(request: NextRequest) {
  try {
    const { symbol } = await request.json();
    
    if (!symbol || typeof symbol !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Symbol is required' },
        { status: 400 }
      );
    }

    const upperSymbol = symbol.toUpperCase().trim();
    console.log(`⚡ Instant preload request for: ${upperSymbol}`);

    // Start instant preload (non-blocking)
    const success = await preloaderService.instantPreload(upperSymbol);

    return NextResponse.json({
      success: true,
      symbol: upperSymbol,
      preloaded: success,
      message: success 
        ? `${upperSymbol} preloaded instantly` 
        : `${upperSymbol} preload started (may take a moment)`
    });
    
  } catch (error) {
    console.error('❌ Instant preload API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

// Get current cache status for a symbol
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    
    if (!symbol) {
      return NextResponse.json(
        { success: false, error: 'Symbol parameter is required' },
        { status: 400 }
      );
    }

    const upperSymbol = symbol.toUpperCase().trim();
    const stats = preloaderService.getStats();
    
    // Check if symbol is likely cached (rough estimation)
    const isTopStock = upperSymbol.length <= 4; // Rough heuristic
    
    return NextResponse.json({
      success: true,
      symbol: upperSymbol,
      estimated_cached: isTopStock,
      cache_stats: stats
    });
    
  } catch (error) {
    console.error('❌ Cache status API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}