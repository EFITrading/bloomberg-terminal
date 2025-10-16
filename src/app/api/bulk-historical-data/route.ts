import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

// Smart caching for bulk requests
const bulkCache = new Map<string, { data: any; timestamp: number }>();
const BULK_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

// Bulk fetch multiple symbols in parallel with intelligent batching
export async function POST(request: NextRequest) {
  try {
    const { symbols, days } = await request.json();
    
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json({ error: 'Invalid symbols array' }, { status: 400 });
    }

    // Check cache first
    const cacheKey = `${symbols.sort().join(',')}-${days || 30}`;
    const cached = bulkCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < BULK_CACHE_DURATION) {
      console.log(`⚡ BULK CACHE HIT: ${symbols.length} symbols`);
      return NextResponse.json(cached.data);
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - (days || 30));
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    console.log(`🚀 BULK FETCH: Processing ${symbols.length} symbols from ${startDateStr} to ${endDateStr}`);

    // OPTIMIZED: Higher concurrency for professional-grade performance  
    const MAX_CONCURRENT = 50; // Unlimited API can handle massive concurrency
    const results = new Map<string, any>();
    const errors: string[] = [];

    // Process symbols in larger batches for better throughput
    for (let i = 0; i < symbols.length; i += MAX_CONCURRENT) {
      const batch = symbols.slice(i, i + MAX_CONCURRENT);
      console.log(`� Processing batch ${Math.floor(i/MAX_CONCURRENT) + 1}/${Math.ceil(symbols.length/MAX_CONCURRENT)} (${batch.length} symbols)`);
      
      const batchPromises = batch.map(async (symbol: string) => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // Shorter timeout for faster failure detection
          
          const response = await fetch(
            `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${startDateStr}/${endDateStr}?adjusted=true&sort=desc&limit=50000&apikey=${POLYGON_API_KEY}`,
            {
              signal: controller.signal,
              headers: {
                'Accept': 'application/json',
              }
            }
          );
          
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            if (response.status === 404) {
              console.warn(`⚠️ No data found for ${symbol}`);
              return { symbol, data: { results: [], status: 'OK', message: 'No data available' } };
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const data = await response.json();
          return { symbol, data };
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`❌ Error fetching ${symbol}:`, errorMessage);
          errors.push(`${symbol}: ${errorMessage}`);
          return { symbol, data: { results: [], status: 'ERROR', message: errorMessage } };
        }
      });

      // Wait for this batch to complete before starting the next
      const batchResults = await Promise.all(batchPromises);
      
      // Store results
      for (const { symbol, data } of batchResults) {
        results.set(symbol, data);
      }
      
      // Small delay between batches to be respectful to the API
      if (i + MAX_CONCURRENT < symbols.length) {
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
      }
    }

    console.log(`✅ BULK FETCH COMPLETE: ${results.size} symbols processed, ${errors.length} errors`);

    const responseData = {
      success: true,
      data: Object.fromEntries(results),
      errors,
      stats: {
        requested: symbols.length,
        successful: results.size,
        failed: errors.length
      }
    };

    // Cache successful results
    if (results.size > 0) {
      bulkCache.set(cacheKey, {
        data: responseData,
        timestamp: Date.now()
      });
      console.log(`💾 BULK CACHED: ${symbols.length} symbols for 10 minutes`);
    }

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('❌ Bulk fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error during bulk fetch' },
      { status: 500 }
    );
  }
}