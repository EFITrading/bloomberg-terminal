// Ultra-fast data batching service for Polygon API optimization
import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

interface BatchRequest {
  tickers: string[];
  timeframe?: string;
  period?: string;
}

interface BatchedPolygonRequest {
  symbols: string[];
  endpoint: string;
  params: Record<string, string>;
}

// SMART BATCHING: Group multiple tickers into optimal Polygon requests
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body: BatchRequest = await request.json();
    const { tickers, timeframe = '1d', period = '1y' } = body;

    if (!tickers?.length || tickers.length > 50) {
      return NextResponse.json({
        success: false,
        error: 'Invalid tickers array (1-50 symbols)'
      }, { status: 400 });
    }

    console.log(`🔥 SMART BATCH: ${tickers.length} tickers - optimizing requests...`);

    // Calculate date ranges
    const { startDate, endDate } = calculateDateRange(period);
    
    // Group tickers into optimized batches
    const batches = createOptimalBatches(tickers, timeframe, startDate, endDate);
    
    console.log(`⚡ Created ${batches.length} optimized batches from ${tickers.length} tickers`);

    // Execute all batches in parallel
    const batchResults = await Promise.all(
      batches.map((batch, index) => executeBatch(batch, index))
    );

    // Merge results from all batches
    const mergedResults = mergeBatchResults(batchResults, tickers);
    
    const totalTime = Date.now() - startTime;
    const apiCallsSaved = tickers.length - batches.length;
    
    console.log(`✅ BATCH COMPLETE: ${totalTime}ms, saved ${apiCallsSaved} API calls`);

    return NextResponse.json({
      success: true,
      data: mergedResults,
      meta: {
        originalRequests: tickers.length,
        optimizedRequests: batches.length,
        apiCallsSaved,
        totalTime,
        efficiency: `${Math.round((apiCallsSaved / tickers.length) * 100)}% reduction`,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Smart batch error:', error);
    return NextResponse.json({
      success: false,
      error: 'Batch processing failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Create optimal batches based on Polygon API limits and ticker characteristics
function createOptimalBatches(
  tickers: string[], 
  timeframe: string, 
  startDate: string, 
  endDate: string
): BatchedPolygonRequest[] {
  const batches: BatchedPolygonRequest[] = [];
  
  // Polygon allows multiple tickers in some endpoints
  const OPTIMAL_BATCH_SIZE = 8; // Sweet spot for Polygon API performance
  
  // Group tickers into chunks
  for (let i = 0; i < tickers.length; i += OPTIMAL_BATCH_SIZE) {
    const tickerBatch = tickers.slice(i, i + OPTIMAL_BATCH_SIZE);
    
    // Create batched historical data request
    const { multiplier, timespan } = parseTimeframe(timeframe);
    
    batches.push({
      symbols: tickerBatch,
      endpoint: 'grouped-daily',
      params: {
        adjusted: 'true',
        sort: 'asc',
        limit: '50000',
        from: startDate,
        to: endDate,
        multiplier: multiplier.toString(),
        timespan
      }
    });
  }
  
  return batches;
}

// Execute a single batch request
async function executeBatch(batch: BatchedPolygonRequest, batchIndex: number): Promise<any> {
  const startTime = Date.now();
  
  try {
    // Use Polygon's grouped daily endpoint for maximum efficiency
    const tickersParam = batch.symbols.join(',');
    const url = `https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${batch.params.from}?adjusted=${batch.params.adjusted}&apikey=${POLYGON_API_KEY}`;
    
    console.log(`🚀 Batch ${batchIndex + 1}: ${batch.symbols.length} symbols`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'EFITrading-Batch/1.0'
      },
      signal: AbortSignal.timeout(15000) // 15s timeout for batches
    });

    if (!response.ok) {
      throw new Error(`Batch ${batchIndex + 1} failed: HTTP ${response.status}`);
    }

    const data = await response.json();
    const batchTime = Date.now() - startTime;
    
    console.log(`✅ Batch ${batchIndex + 1}: ${data.resultsCount || 0} results in ${batchTime}ms`);
    
    return {
      batchIndex,
      symbols: batch.symbols,
      data,
      timing: batchTime,
      success: true
    };

  } catch (error) {
    const batchTime = Date.now() - startTime;
    console.error(`❌ Batch ${batchIndex + 1} failed in ${batchTime}ms:`, error);
    
    return {
      batchIndex,
      symbols: batch.symbols,
      error: error instanceof Error ? error.message : 'Unknown error',
      timing: batchTime,
      success: false
    };
  }
}

// Merge results from all batches back into per-ticker format
function mergeBatchResults(batchResults: any[], originalTickers: string[]) {
  const tickerData: Record<string, any> = {};
  
  // Initialize all tickers
  originalTickers.forEach(ticker => {
    tickerData[ticker] = {
      symbol: ticker,
      data: null,
      error: null,
      source: 'batch'
    };
  });
  
  // Process successful batches
  batchResults.forEach(batch => {
    if (batch.success && batch.data?.results) {
      // Polygon grouped endpoint returns results with ticker property
      batch.data.results.forEach((result: any) => {
        if (result.T && tickerData[result.T]) { // T is ticker symbol in Polygon response
          tickerData[result.T].data = {
            symbol: result.T,
            open: result.o,
            high: result.h,
            low: result.l,
            close: result.c,
            volume: result.v,
            timestamp: result.t,
            date: new Date(result.t).toISOString().split('T')[0]
          };
        }
      });
    } else if (!batch.success) {
      // Mark failed symbols
      batch.symbols.forEach((symbol: string) => {
        if (tickerData[symbol]) {
          tickerData[symbol].error = batch.error;
        }
      });
    }
  });
  
  return tickerData;
}

// Alternative: Multi-ticker options batch (for options data)
export async function fetchBatchedOptionsData(tickers: string[]): Promise<Record<string, any>> {
  const batchSize = 5; // Options data is heavier, smaller batches
  const results: Record<string, any> = {};
  
  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (ticker) => {
      try {
        const url = `https://api.polygon.io/v3/snapshot/options/${ticker}?limit=250&apikey=${POLYGON_API_KEY}`;
        const response = await fetch(url, {
          signal: AbortSignal.timeout(10000)
        });
        
        if (response.ok) {
          const data = await response.json();
          results[ticker] = data;
        } else {
          results[ticker] = { error: `HTTP ${response.status}` };
        }
      } catch (error) {
        results[ticker] = { error: error instanceof Error ? error.message : 'Unknown error' };
      }
    });
    
    await Promise.all(batchPromises);
    
    // Rate limiting between batches
    if (i + batchSize < tickers.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  return results;
}

// Helper functions
function calculateDateRange(period: string) {
  const end = new Date();
  const start = new Date();
  
  switch (period) {
    case '1d': start.setDate(end.getDate() - 1); break;
    case '5d': start.setDate(end.getDate() - 5); break;
    case '1m': start.setMonth(end.getMonth() - 1); break;
    case '3m': start.setMonth(end.getMonth() - 3); break;
    case '1y': start.setFullYear(end.getFullYear() - 1); break;
    case '5y': start.setFullYear(end.getFullYear() - 5); break;
    default: start.setFullYear(end.getFullYear() - 1);
  }

  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0]
  };
}

function parseTimeframe(timeframe: string) {
  const mapping: Record<string, { multiplier: number; timespan: string }> = {
    '1m': { multiplier: 1, timespan: 'minute' },
    '5m': { multiplier: 5, timespan: 'minute' },
    '15m': { multiplier: 15, timespan: 'minute' },
    '1h': { multiplier: 1, timespan: 'hour' },
    '1d': { multiplier: 1, timespan: 'day' },
    '1w': { multiplier: 1, timespan: 'week' }
  };
  
  return mapping[timeframe] || mapping['1d'];
}