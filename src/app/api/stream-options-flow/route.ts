import { NextRequest, NextResponse } from 'next/server';
import { OptionsFlowService, getSmartDateRange } from '@/lib/optionsFlowService';

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
  trade_type?: 'SWEEP' | 'BLOCK' | 'MULTI-LEG' | 'MINI';
  window_group?: string;
  related_trades?: string[];
  moneyness: 'ATM' | 'ITM' | 'OTM';
  days_to_expiry: number;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const ticker = searchParams.get('ticker');
  
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
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET',
    'Access-Control-Allow-Headers': 'Cache-Control',
    'X-Accel-Buffering': 'no' // Disable nginx buffering
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

      // Send heartbeat to keep connection alive
      streamState.heartbeatInterval = setInterval(() => {
        if (streamState.isActive) {
          sendData({
            type: 'heartbeat',
            timestamp: new Date().toISOString()
          });
        }
      }, 30000); // Every 30 seconds

      try {
        console.log(`🚀 STREAMING OPTIONS FLOW: Starting ${ticker || 'MARKET-WIDE'} scan`);
        
        // Send initial status with connection confirmation
        sendData({
          type: 'status',
          message: 'Connection established, starting options flow scan...',
          timestamp: new Date().toISOString(),
          connectionId: Math.random().toString(36).substring(7)
        });

        // Initialize the options flow service with streaming callback
        const optionsFlowService = new OptionsFlowService(polygonApiKey);
        
        // Create a streaming callback that sends trades as they're processed
        const streamingCallback = (trades: any[], status: string, progress?: any) => {
          sendData({
            type: 'trades',
            trades: trades,
            status: status,
            progress: progress,
            timestamp: new Date().toISOString()
          });
        };

        // Start ultra-fast parallel flow scan
        const finalTrades = await optionsFlowService.fetchLiveOptionsFlowUltraFast(
          ticker || undefined,
          streamingCallback
        );

        // Send final summary
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
          timestamp: new Date().toISOString()
        });

        console.log(`✅ STREAMING COMPLETE: ${finalTrades.length} trades processed`);
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Streaming error:', errorMessage);
        
        // Send detailed error information
        if (streamState.isActive) {
          sendData({
            type: 'error',
            error: errorMessage,
            errorType: error instanceof Error ? error.name : 'UnknownError',
            timestamp: new Date().toISOString(),
            retryable: !errorMessage.includes('API key') && !errorMessage.includes('403')
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