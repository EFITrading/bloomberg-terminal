import { NextRequest, NextResponse } from 'next/server';
import { OptionsFlowService, getSmartDateRange } from '@/lib/optionsFlowService';

// Configure runtime for streaming
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Handle preflight CORS requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

interface ProcessedTrade {
  ticker: string;
  underlying_ticker: string;
  strike: number;
  expiry: string;
  type: 'call' | 'put';
  trade_size: number;
  premium_per_contract: number;
  total_premium: number;
  spot_price: number;
  exchange: number;
  exchange_name: string;
  sip_timestamp: number;
  sequence_number?: number;
  conditions: number[];
  trade_timestamp: Date;
  trade_type?: 'SWEEP' | 'BLOCK' | 'MINI' | 'MULTI-LEG';
  window_group?: string;
  related_trades?: string[];
  moneyness: 'ATM' | 'ITM' | 'OTM';
  days_to_expiry: number;
  trading_date?: string; // Format: "YYYY-MM-DD" for multi-day scans
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  let ticker = searchParams.get('ticker');
  const timeframe = (searchParams.get('timeframe') || '1D') as '1D' | '3D' | '1W';

  console.log(`🔥 ROUTE RECEIVED - Ticker: ${ticker} | Timeframe: ${timeframe} | URL: ${request.nextUrl.href}`);

  // Validate ticker parameter - empty ticker causes EventSource connection issues
  if (ticker !== null && ticker.trim() === '') {
    console.warn('⚠️ Empty ticker parameter received, treating as undefined for market-wide scan');
    ticker = null; // Treat empty string as no ticker (market-wide scan)
  }

  const polygonApiKey = process.env.POLYGON_API_KEY;

  if (!polygonApiKey) {
    return new Response('POLYGON_API_KEY not configured', {
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/plain'
      }
    });
  }

  // Enhanced headers for better EventSource compatibility + Vercel edge
  const headers = {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET',
    'Access-Control-Allow-Headers': 'Cache-Control',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
    'X-Content-Type-Options': 'nosniff', // Prevent content sniffing delays
    'Transfer-Encoding': 'chunked'
    // Note: Removed 'Content-Encoding' to let Vercel handle compression
  };

  // Create shared state for the stream
  let streamState = {
    isActive: true,
    heartbeatInterval: null as NodeJS.Timeout | null
  };

  // Create a readable stream for Server-Sent Events with enhanced error handling
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      
      // Track process crashes to debug stream disconnections
      const processErrorHandler = (error: Error) => {
        console.error(`🚨 PROCESS ERROR DETECTED:`, error.message);
        console.error(`   Stack:`, error.stack);
        console.error(`   This may cause the stream to close unexpectedly`);
      };
      
      const processWarningHandler = (warning: Error) => {
        console.warn(`⚠️ PROCESS WARNING:`, warning.message);
      };
      
      // Attach process monitors
      process.on('uncaughtException', processErrorHandler);
      process.on('unhandledRejection', processWarningHandler as any);
      process.on('warning', processWarningHandler);
      
      // Cleanup function to remove monitors
      const cleanupProcessMonitors = () => {
        process.off('uncaughtException', processErrorHandler);
        process.off('unhandledRejection', processWarningHandler as any);
        process.off('warning', processWarningHandler);
      };

      // CRITICAL: Send MULTIPLE small chunks IMMEDIATELY to force Vercel edge to flush
      // This prevents buffering that causes "initial connection" failures
      try {
        // Send padding + comment to force immediate flush (Vercel edge workaround)
        const padding = ': ' + 'x'.repeat(2048) + '\n\n'; // 2KB padding to trigger flush
        controller.enqueue(encoder.encode(padding));
        controller.enqueue(encoder.encode(': stream-established\n\n'));
        controller.enqueue(encoder.encode(': vercel-edge-bypass\n\n'));
      } catch (error) {
        console.error('Failed to send initial padding:', error);
      }

      // Enhanced data sending with error handling
      const sendData = (data: any) => {
        if (!streamState.isActive) return;

        try {
          const message = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        } catch (error) {
          console.error('Error sending stream data:', error);
          streamState.isActive = false;
        }
      };

      // Send IMMEDIATE connection acknowledgment to keep stream alive
      try {
        sendData({
          type: 'connected',
          message: 'Stream connected successfully',
          timestamp: new Date().toISOString(),
          connectionId: Math.random().toString(36).substring(7)
        });
      } catch (error) {
        console.error('Failed to send initial connection message:', error);
        controller.close();
        return;
      }

      // Send heartbeat to keep connection alive
      let heartbeatCount = 0;
      streamState.heartbeatInterval = setInterval(() => {
        if (streamState.isActive) {
          try {
            heartbeatCount++;
            sendData({
              type: 'heartbeat',
              timestamp: new Date().toISOString(),
              heartbeatNumber: heartbeatCount,
              streamHealth: 'active'
            });
            console.log(`💓 Heartbeat #${heartbeatCount} sent - stream health: active`);
          } catch (error) {
            console.error(`❌ Heartbeat #${heartbeatCount} failed:`, error);
            console.error(`   This indicates the stream controller may be closed`);
            streamState.isActive = false;
          }
        } else {
          console.log(`⚠️ Heartbeat #${heartbeatCount} skipped - stream marked inactive`);
        }
      }, 15000); // Every 15 seconds

      try {
        // ⏱️ START TIMING
        const TIMER_START = Date.now();
        console.log(`⏱️ TIMER START: ${new Date(TIMER_START).toISOString()}`);
        
        const scanType = ticker || 'MARKET-WIDE';
        console.log(`🚀 STREAMING OPTIONS FLOW: Starting ${scanType} scan`);
        console.log(`📊 Ticker parameter: "${ticker}" (null=${ticker === null}, undefined=${ticker === undefined})`);

        // Send initial status with connection confirmation
        sendData({
          type: 'status',
          message: `Connection established, starting ${scanType} options flow scan...`,
          timestamp: new Date().toISOString(),
          connectionId: Math.random().toString(36).substring(7),
          scanType: scanType,
          timerStart: TIMER_START
        });
        
        console.log(`✅ Initial status sent - stream is active and ready`);

        // Initialize the options flow service with streaming callback
        const optionsFlowService = new OptionsFlowService(polygonApiKey);

        // Create a streaming callback - ONLY send status, not progressive trades
        const streamingCallback = (trades: any[], status: string, progress?: any) => {
          // ❌ DISABLED: Don't send progressive updates
          // Only send status messages to show scan progress
          if (!streamState.isActive) return; // Check if stream is still active

          if (trades.length === 0) {
            sendData({
              type: 'status',
              message: status,
              progress: progress,
              timestamp: new Date().toISOString()
            });
          }
        };

        console.log('📊 Starting parallel flow scan...');

        let finalTrades: any[];

        if (timeframe === '1D') {
          // Single day: Use existing fast path
          const { getSmartDateRange } = require('../../../lib/optionsFlowService');
          const { startTimestamp, endTimestamp, currentDate, isLive } = await getSmartDateRange();

          // ⏱️ SCAN PHASE START
          const scanStartTime = Date.now();
          console.log(`⏱️ SCAN PHASE START [+${((scanStartTime - TIMER_START) / 1000).toFixed(2)}s]: Fetching options flow...`);
          
          // Monitor memory before scan
          const memBefore = process.memoryUsage();
          console.log(`📊 Memory before scan: ${(memBefore.heapUsed / 1024 / 1024).toFixed(2)}MB / ${(memBefore.heapTotal / 1024 / 1024).toFixed(2)}MB`);

          const scanPromise = optionsFlowService.fetchLiveOptionsFlowUltraFast(
            ticker || undefined,
            streamingCallback,
            { startTimestamp, endTimestamp, currentDate, isLive }
          );

          // No timeout - let it complete naturally, but wrap in try-catch
          try {
            finalTrades = await scanPromise;
            
            // Monitor memory after scan
            const memAfter = process.memoryUsage();
            console.log(`📊 Memory after scan: ${(memAfter.heapUsed / 1024 / 1024).toFixed(2)}MB / ${(memAfter.heapTotal / 1024 / 1024).toFixed(2)}MB`);
            console.log(`📊 Memory delta: +${((memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024).toFixed(2)}MB`);

            const scanEndTime = Date.now();
            const scanDuration = ((scanEndTime - scanStartTime) / 1000).toFixed(2);
            const totalElapsed = ((scanEndTime - TIMER_START) / 1000).toFixed(2);
            console.log(`⏱️ SCAN COMPLETE [+${totalElapsed}s] (scan: ${scanDuration}s): ${finalTrades.length} trades found`);
          } catch (scanError) {
            const scanErrorTime = Date.now();
            const errorElapsed = ((scanErrorTime - TIMER_START) / 1000).toFixed(2);
            console.error(`⏱️ ❌ SCAN ERROR at [+${errorElapsed}s]:`, scanError instanceof Error ? scanError.message : String(scanError));
            console.error(`   Stack:`, scanError instanceof Error ? scanError.stack : 'N/A');
            throw scanError; // Re-throw to be caught by outer catch
          }

          // 🚀 ENRICH TRADES IN PARALLEL ON BACKEND - Fastest approach!
          const enrichStartTime = Date.now();
          console.log(`⏱️ ENRICHMENT START [+${((enrichStartTime - TIMER_START) / 1000).toFixed(2)}s]: Enriching ${finalTrades.length} trades...`);
          
          try {
            finalTrades = await optionsFlowService.enrichTradesWithVolOIParallel(finalTrades);
            const enrichEndTime = Date.now();
            const enrichDuration = ((enrichEndTime - enrichStartTime) / 1000).toFixed(2);
            const totalElapsed2 = ((enrichEndTime - TIMER_START) / 1000).toFixed(2);
            console.log(`⏱️ ENRICHMENT COMPLETE [+${totalElapsed2}s] (enrich: ${enrichDuration}s): ${finalTrades.length} trades enriched`);
          } catch (enrichError) {
            const enrichErrorTime = Date.now();
            const errorElapsed = ((enrichErrorTime - TIMER_START) / 1000).toFixed(2);
            console.error(`⏱️ ❌ ENRICHMENT ERROR at [+${errorElapsed}s]:`, enrichError instanceof Error ? enrichError.message : String(enrichError));
            console.error(`   Stack:`, enrichError instanceof Error ? enrichError.stack : 'N/A');
            console.log(`⚠️ Continuing with ${finalTrades.length} un-enriched trades due to enrichment failure`);
            // Don't throw - continue with un-enriched trades
          }
        } else {
          // Multi-day: Use new multi-day flow method (already enriched)
          const multiDayStartTime = Date.now();
          console.log(`⏱️ MULTI-DAY SCAN START [+${((multiDayStartTime - TIMER_START) / 1000).toFixed(2)}s]: ${timeframe} for ${ticker || 'MARKET-WIDE'}`);
          const scanPromise = optionsFlowService.fetchMultiDayFlow(
            ticker || undefined,
            timeframe,
            streamingCallback
          );

          // No timeout - let it complete naturally
          finalTrades = await scanPromise;
          const multiDayEndTime = Date.now();
          const multiDayDuration = ((multiDayEndTime - multiDayStartTime) / 1000).toFixed(2);
          const totalElapsed = ((multiDayEndTime - TIMER_START) / 1000).toFixed(2);
          console.log(`⏱️ MULTI-DAY SCAN COMPLETE [+${totalElapsed}s] (scan: ${multiDayDuration}s): ${finalTrades.length} trades found`);
        }

        // DEBUG: Check if trades are enriched
        if (finalTrades.length > 0) {
          const sampleTrade = finalTrades[0];
          console.log(`🔍 Sample trade enrichment check:`, {
            ticker: sampleTrade.ticker,
            has_volume: 'volume' in sampleTrade,
            volume: sampleTrade.volume,
            has_open_interest: 'open_interest' in sampleTrade,
            open_interest: sampleTrade.open_interest,
            has_fill_style: 'fill_style' in sampleTrade,
            fill_style: sampleTrade.fill_style
          });
        }

        // Send final summary with ALL ENRICHED TRADES AT ONCE
        const summary = {
          total_trades: finalTrades.length,
          total_premium: finalTrades.reduce((sum: number, t: ProcessedTrade) => sum + t.total_premium, 0),
          unique_symbols: new Set(finalTrades.map((t: ProcessedTrade) => t.underlying_ticker)).size,
          trade_types: {
            BLOCK: finalTrades.filter((t: ProcessedTrade) => t.trade_type === 'BLOCK').length,
            SWEEP: finalTrades.filter((t: ProcessedTrade) => t.trade_type === 'SWEEP').length,
            'MULTI-LEG': finalTrades.filter((t: ProcessedTrade) => t.trade_type === 'MULTI-LEG').length,
            MINI: finalTrades.filter((t: ProcessedTrade) => t.trade_type === 'MINI').length,
          },
          call_put_ratio: {
            calls: finalTrades.filter((t: ProcessedTrade) => t.type === 'call').length,
            puts: finalTrades.filter((t: ProcessedTrade) => t.type === 'put').length,
          },
          processing_time_ms: 0
        };

        // ⏱️ FINAL TIMING
        const TIMER_END = Date.now();
        const TOTAL_DURATION = ((TIMER_END - TIMER_START) / 1000).toFixed(2);
        console.log(`⏱️ TIMER END: ${new Date(TIMER_END).toISOString()}`);
        console.log(`⏱️ ⚡ TOTAL DURATION: ${TOTAL_DURATION} seconds (${(TOTAL_DURATION / 60).toFixed(2)} minutes)`);
        console.log(`⏱️ 📊 Vercel Limit: 300s (${((TOTAL_DURATION / 300) * 100).toFixed(1)}% used)`);
        
        // ✅ SEND ALL TRADES IN ONE BATCH (already enriched by backend)
        console.log(`📤 Preparing to send ${finalTrades.length} trades to client...`);
        const sendStartTime = Date.now();
        
        try {
          sendData({
            type: 'complete',
            trades: finalTrades,
            summary: summary,
            market_info: {
              status: 'LIVE',
              is_live: true,
              data_date: new Date().toISOString().split('T')[0],
              market_open: true
            },
            timestamp: new Date().toISOString(),
            performance: {
              totalDuration: TOTAL_DURATION,
              percentOfLimit: ((TOTAL_DURATION / 300) * 100).toFixed(1),
              vercelLimit: 300
            }
          });
          
          const sendEndTime = Date.now();
          const sendDuration = ((sendEndTime - sendStartTime) / 1000).toFixed(2);
          console.log(`✅ STREAMING COMPLETE: ${finalTrades.length} trades sent in ${sendDuration}s (total: ${TOTAL_DURATION}s)`);
        } catch (sendError) {
          console.error(`❌ CRITICAL: Failed to send complete event:`, sendError instanceof Error ? sendError.message : String(sendError));
          console.error(`   This will cause the client to see a disconnection`);
          console.error(`   Attempting to send error message instead...`);
          
          try {
            sendData({
              type: 'error',
              error: `Failed to send complete data: ${sendError instanceof Error ? sendError.message : 'Unknown error'}`,
              errorType: 'SEND_FAILURE',
              timestamp: new Date().toISOString(),
              retryable: true
            });
          } catch (errorSendError) {
            console.error(`❌ CRITICAL: Even error message failed to send:`, errorSendError);
          }
        }

      } catch (error) {
        const ERROR_TIME = Date.now();
        const errorElapsed = ((ERROR_TIME - TIMER_START) / 1000).toFixed(2);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : '';
        console.error(`⏱️ ❌ ERROR at [+${errorElapsed}s]: ${errorMessage}`);
        console.error('Stack trace:', errorStack);

        // Send detailed error information
        if (streamState.isActive) {
          sendData({
            type: 'error',
            error: errorMessage,
            errorType: error instanceof Error ? error.name : 'UnknownError',
            timestamp: new Date().toISOString(),
            retryable: !errorMessage.includes('API key') && !errorMessage.includes('403'),
            details: process.env.NODE_ENV === 'development' ? errorStack : undefined
          });
        }
      } finally {
        // Cleanup resources
        console.log(`🧹 Cleaning up stream resources...`);
        
        streamState.isActive = false;
        if (streamState.heartbeatInterval) {
          clearInterval(streamState.heartbeatInterval);
          streamState.heartbeatInterval = null;
        }
        
        // Remove process monitors
        cleanupProcessMonitors();

        // Send final close message
        try {
          sendData({
            type: 'close',
            message: 'Stream connection closing',
            timestamp: new Date().toISOString()
          });
        } catch (closeError) {
          console.error('Error sending close message:', closeError);
        } finally {
          controller.close();
          console.log(`✅ Stream controller closed`);
        }
      }
    },

    // Handle client disconnection
    cancel() {
      console.log('Client disconnected from options flow stream');
      streamState.isActive = false;
      if (streamState.heartbeatInterval) {
        clearInterval(streamState.heartbeatInterval);
        streamState.heartbeatInterval = null;
      }
    }
  });

  return new Response(stream, { headers });
}