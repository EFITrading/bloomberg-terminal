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

  // Enhanced headers for better EventSource compatibility
  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET',
    'Access-Control-Allow-Headers': 'Cache-Control',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
    'Transfer-Encoding': 'chunked',
    'Content-Encoding': 'none' // Prevent compression that can delay SSE
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

      // Send IMMEDIATE connection comment to establish the stream
      // This ensures Vercel/edge doesn't buffer the response
      try {
        controller.enqueue(encoder.encode(': connected\n\n'));
      } catch (error) {
        console.error('Failed to send initial comment:', error);
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
      streamState.heartbeatInterval = setInterval(() => {
        if (streamState.isActive) {
          try {
            sendData({
              type: 'heartbeat',
              timestamp: new Date().toISOString()
            });
          } catch (error) {
            console.error('Heartbeat failed:', error);
            streamState.isActive = false;
          }
        }
      }, 15000); // Every 15 seconds

      try {
        const scanStartTime = Date.now();
        const scanType = ticker || 'MARKET-WIDE';
        console.log(`🚀 STREAMING OPTIONS FLOW: Starting ${scanType} scan at ${new Date().toISOString()}`);
        console.log(`📊 Ticker parameter: "${ticker}" (null=${ticker === null}, undefined=${ticker === undefined})`);

        // Send initial status with connection confirmation
        sendData({
          type: 'status',
          message: `Connection established, starting ${scanType} options flow scan...`,
          timestamp: new Date().toISOString(),
          connectionId: Math.random().toString(36).substring(7),
          scanType: scanType,
          scanStartTime: scanStartTime
        });

        // Initialize the options flow service with streaming callback
        const optionsFlowService = new OptionsFlowService(polygonApiKey);

        // Create a streaming callback - send status updates to keep connection alive
        const streamingCallback = (trades: any[], status: string, progress?: any) => {
          // Always send status updates to prevent EventSource timeout
          if (!streamState.isActive) return; // Check if stream is still active

          // Send status updates regardless of trades (keeps connection alive during scan)
          sendData({
            type: 'status',
            message: status,
            progress: progress,
            timestamp: new Date().toISOString()
          });
        };

        console.log('📊 Starting parallel flow scan...');

        let finalTrades: any[];
        let totalDuration = '0';

        if (timeframe === '1D') {
          // Single day: Use existing fast path
          const { getSmartDateRange } = require('../../../lib/optionsFlowService');
          const { startTimestamp, endTimestamp, currentDate, isLive } = await getSmartDateRange();

          const scanPromise = optionsFlowService.fetchLiveOptionsFlowUltraFast(
            ticker || undefined,
            streamingCallback,
            { startTimestamp, endTimestamp, currentDate, isLive }
          );

          // No timeout - let it complete naturally
          finalTrades = await scanPromise;

          const scanEndTime = Date.now();
          const scanDuration = ((scanEndTime - scanStartTime) / 1000).toFixed(2);
          console.log(`✅ Scan complete: ${finalTrades.length} trades found in ${scanDuration}s`);

          // Send status update before starting enrichment to keep connection alive
          sendData({
            type: 'status',
            message: `✅ Scan complete: ${finalTrades.length} trades - starting enrichment...`,
            timestamp: new Date().toISOString()
          });

          // 🚀 ENRICH TRADES IN PARALLEL ON BACKEND - Fastest approach!
          const enrichStartTime = Date.now();
          console.log(`🚀 ENRICHING ${finalTrades.length} trades in parallel on backend...`);
          finalTrades = await optionsFlowService.enrichTradesWithVolOIParallel(
            finalTrades,
            (current, total, message) => {
              const elapsed = ((Date.now() - scanStartTime) / 1000).toFixed(1);
              // Send progress to keep EventSource alive during enrichment
              sendData({
                type: 'status',
                message: `${message} (${elapsed}s elapsed)`,
                progress: { current, total },
                timestamp: new Date().toISOString(),
                elapsedTime: elapsed
              });
            }
          );
          const enrichEndTime = Date.now();
          const enrichDuration = ((enrichEndTime - enrichStartTime) / 1000).toFixed(2);
          const totalDuration = ((enrichEndTime - scanStartTime) / 1000).toFixed(2);
          console.log(`✅ ENRICHMENT COMPLETE: ${finalTrades.length} trades enriched in ${enrichDuration}s (total: ${totalDuration}s)`);
        } else {
          // Multi-day: Use new multi-day flow method (already enriched)
          const multiDayStartTime = Date.now();
          console.log(`🔥 Multi-Day Scan: ${timeframe} for ${ticker || 'MARKET-WIDE'}`);
          const scanPromise = optionsFlowService.fetchMultiDayFlow(
            ticker || undefined,
            timeframe,
            streamingCallback
          );

          // No timeout - let it complete naturally
          finalTrades = await scanPromise;
          const multiDayEndTime = Date.now();
          totalDuration = ((multiDayEndTime - scanStartTime) / 1000).toFixed(2);
          console.log(`✅ Multi-Day Scan Complete: ${finalTrades.length} trades found in ${totalDuration}s`);
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

        // ✅ SEND ALL TRADES IN ONE BATCH (already enriched by backend)
        sendData({
          type: 'complete',
          trades: finalTrades,
          summary: {
            ...summary,
            processing_time_s: totalDuration
          },
          market_info: {
            status: 'LIVE',
            is_live: true,
            data_date: new Date().toISOString().split('T')[0],
            market_open: true
          },
          timestamp: new Date().toISOString()
        });

        console.log(`✅ STREAMING COMPLETE: ${finalTrades.length} trades processed in ${totalDuration}s`);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : '';
        console.error('❌ STREAMING ERROR:', errorMessage);
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
        streamState.isActive = false;
        if (streamState.heartbeatInterval) {
          clearInterval(streamState.heartbeatInterval);
          streamState.heartbeatInterval = null;
        }

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