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

  console.log(`[ROUTE] ROUTE RECEIVED - Ticker: ${ticker} | Timeframe: ${timeframe} | URL: ${request.nextUrl.href}`);

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
        const scanType = ticker || 'MARKET-WIDE';
        console.log(`[STREAM] STREAMING OPTIONS FLOW: Starting ${scanType} scan`);
        console.log(`[INFO] Ticker parameter: "${ticker}" (null=${ticker === null}, undefined=${ticker === undefined})`);

        // Send initial status with connection confirmation
        sendData({
          type: 'status',
          message: `Connection established, starting ${scanType} options flow scan...`,
          timestamp: new Date().toISOString(),
          connectionId: Math.random().toString(36).substring(7),
          scanType: scanType
        });

        // Initialize the options flow service with streaming callback
        const optionsFlowService = new OptionsFlowService(polygonApiKey);

        // Create a streaming callback - ONLY send status, not progressive trades
        const streamingCallback = (trades: any[], status: string, progress?: any) => {
          // [DISABLED] Don't send progressive updates
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

        console.log('[INFO] Starting parallel flow scan...');

        let finalTrades: any[] = [];

        if (timeframe === '1D') {
          // Sequential per-ticker: scan → enrich → stream immediately for each ticker
          const { getSmartDateRange } = require('../../../lib/optionsFlowService');
          const { startTimestamp, endTimestamp, currentDate, isLive } = await getSmartDateRange();
          sendData({ type: 'status', message: `[SERVER] Date range set: ${currentDate}, isLive: ${isLive}. Starting sequential scan...` });

          const tickersToScan = ticker
            ? ticker.split(',').map((t: string) => t.trim().toUpperCase()).filter(Boolean)
            : [];

          for (const t of tickersToScan) {
            if (!streamState.isActive) break;

            sendData({ type: 'status', message: `[SERVER] Scanning ${t}...` });

            let tickerTrades = await optionsFlowService.fetchLiveOptionsFlowUltraFast(
              t,
              streamingCallback,
              { startTimestamp, endTimestamp, currentDate, isLive }
            );

            sendData({ type: 'status', message: `[SERVER] ${t} scan done: ${tickerTrades.length} trades. Streaming raw trades to browser...` });

            // Stream this ticker's trades immediately - client displays them right away
            sendData({
              type: 'ticker_complete',
              ticker: t,
              trades: tickerTrades,
              count: tickerTrades.length,
              timestamp: new Date().toISOString()
            });

            finalTrades.push(...tickerTrades);
            sendData({ type: 'status', message: `[SERVER] ${t} done. Running total: ${finalTrades.length} trades.` });

            // Wait 500ms between tickers - lets OS reclaim file descriptors from
            // the previous worker's HTTP connections (prevents EMFILE on ticker 3+)
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } else {
          // Multi-day: Use new multi-day flow method (already enriched)
          console.log(`[MULTIDAY] Multi-Day Scan: ${timeframe} for ${ticker || 'MARKET-WIDE'}`);
          const scanPromise = optionsFlowService.fetchMultiDayFlow(
            ticker || undefined,
            timeframe,
            streamingCallback
          );

          // No timeout - let it complete naturally
          finalTrades = await scanPromise;
          console.log(`[OK] Multi-Day Scan Complete: ${finalTrades.length} trades found`);
        }

        // Send final summary only - trades were already streamed per ticker
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

        // Complete event: just summary, trades already streamed per ticker
        sendData({
          type: 'complete',
          trades: [],
          summary: summary,
          market_info: {
            status: 'LIVE',
            is_live: true,
            data_date: new Date().toISOString().split('T')[0],
            market_open: true
          },
          timestamp: new Date().toISOString()
        });

        console.log(`[OK] STREAMING COMPLETE: ${finalTrades.length} trades processed`);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : '';
        console.error('[ERROR] STREAMING ERROR:', errorMessage);
        console.error('Stack trace:', errorStack);

        // Always try to send error event, even if streamState.isActive was cleared
        // (e.g. a failed heartbeat enqueue sets isActive=false before we get here)
        try {
          const errorPayload = JSON.stringify({
            type: 'error',
            error: errorMessage,
            errorType: error instanceof Error ? error.name : 'UnknownError',
            timestamp: new Date().toISOString(),
            retryable: !errorMessage.includes('API key') && !errorMessage.includes('403'),
            details: process.env.NODE_ENV === 'development' ? errorStack : undefined
          });
          controller.enqueue(encoder.encode(`data: ${errorPayload}\n\n`));
        } catch (sendErr) {
          console.error('[ERROR] Could not send error event to client:', sendErr);
        }
      } finally {
        // Cleanup resources
        streamState.isActive = false;
        if (streamState.heartbeatInterval) {
          clearInterval(streamState.heartbeatInterval);
          streamState.heartbeatInterval = null;
        }

        // Send final close message (always attempt, regardless of isActive)
        try {
          const closePayload = JSON.stringify({
            type: 'close',
            message: 'Stream connection closing',
            timestamp: new Date().toISOString()
          });
          controller.enqueue(encoder.encode(`data: ${closePayload}\n\n`));
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
