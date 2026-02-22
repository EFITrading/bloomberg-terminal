import { NextRequest, NextResponse } from 'next/server';
import { OptionsFlowService, getSmartDateRange } from '@/lib/optionsFlowService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const tickerParam = searchParams.get('ticker') || 'MSFT,AAPL,NVDA,TSLA';
  const tickers = tickerParam.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);

  const polygonApiKey = process.env.POLYGON_API_KEY;
  if (!polygonApiKey) {
    return new Response('POLYGON_API_KEY not configured', { status: 500 });
  }

  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no',
    'Transfer-Encoding': 'chunked',
    'Content-Encoding': 'none',
  };

  let streamActive = true;
  let heartbeatInterval: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (data: object) => {
        if (!streamActive) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          streamActive = false;
        }
      };

      // Establish connection
      controller.enqueue(encoder.encode(': connected\n\n'));
      send({ type: 'connected', message: 'Sequential stream connected', timestamp: new Date().toISOString() });

      // Heartbeat every 15s
      heartbeatInterval = setInterval(() => {
        if (streamActive) send({ type: 'heartbeat', timestamp: new Date().toISOString() });
      }, 15000);

      try {
        const { startTimestamp, endTimestamp, currentDate, isLive } = await getSmartDateRange();
        send({ type: 'status', message: `Date range: ${currentDate}, isLive: ${isLive}. Scanning ${tickers.join(', ')} sequentially...` });

        const service = new OptionsFlowService(polygonApiKey);
        const allTrades: any[] = [];

        for (const ticker of tickers) {
          if (!streamActive) break;

          send({ type: 'status', message: `[${ticker}] Scanning options flow...` });

          const progressCallback = (_trades: any[], status: string) => {
            if (!streamActive) return;
            send({ type: 'status', message: `[${ticker}] ${status}` });
          };

          // 1. Scan + classify + filter for this ticker
          let tickerTrades = await service.fetchLiveOptionsFlowUltraFast(
            ticker,
            progressCallback,
            { startTimestamp, endTimestamp, currentDate, isLive }
          );

          send({ type: 'status', message: `[${ticker}] Scan complete: ${tickerTrades.length} trades. Enriching...` });

          // 2. Enrich this ticker's trades immediately
          tickerTrades = await service.enrichTradesWithVolOIParallel(tickerTrades);

          send({ type: 'status', message: `[${ticker}] Enrichment complete: ${tickerTrades.length} trades. Streaming...` });

          // 3. Stream this ticker's results right now
          const summary = {
            ticker,
            total_trades: tickerTrades.length,
            total_premium: tickerTrades.reduce((s: number, t: any) => s + t.total_premium, 0),
            trade_types: {
              BLOCK: tickerTrades.filter((t: any) => t.trade_type === 'BLOCK').length,
              SWEEP: tickerTrades.filter((t: any) => t.trade_type === 'SWEEP').length,
              'MULTI-LEG': tickerTrades.filter((t: any) => t.trade_type === 'MULTI-LEG').length,
              MINI: tickerTrades.filter((t: any) => t.trade_type === 'MINI').length,
            },
            calls: tickerTrades.filter((t: any) => t.type === 'call').length,
            puts: tickerTrades.filter((t: any) => t.type === 'put').length,
          };

          send({ type: 'ticker_complete', ticker, trades: tickerTrades, summary });

          allTrades.push(...tickerTrades);
          send({ type: 'status', message: `[${ticker}] Done. Total so far: ${allTrades.length} trades across ${tickers.indexOf(ticker) + 1}/${tickers.length} tickers.` });
        }

        // Final completion event with combined summary
        send({
          type: 'complete',
          trades: allTrades,
          summary: {
            total_trades: allTrades.length,
            total_premium: allTrades.reduce((s: number, t: any) => s + t.total_premium, 0),
            unique_symbols: new Set(allTrades.map((t: any) => t.underlying_ticker)).size,
            trade_types: {
              BLOCK: allTrades.filter((t: any) => t.trade_type === 'BLOCK').length,
              SWEEP: allTrades.filter((t: any) => t.trade_type === 'SWEEP').length,
              'MULTI-LEG': allTrades.filter((t: any) => t.trade_type === 'MULTI-LEG').length,
              MINI: allTrades.filter((t: any) => t.trade_type === 'MINI').length,
            },
            call_put_ratio: {
              calls: allTrades.filter((t: any) => t.type === 'call').length,
              puts: allTrades.filter((t: any) => t.type === 'put').length,
            },
          },
          market_info: { status: 'LIVE', is_live: true, data_date: currentDate },
          timestamp: new Date().toISOString(),
        });

      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[SEQ-ROUTE] Error:', msg);
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: msg, timestamp: new Date().toISOString() })}\n\n`));
        } catch { /* ignore */ }
      } finally {
        streamActive = false;
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'close', timestamp: new Date().toISOString() })}\n\n`));
        } catch { /* ignore */ }
        controller.close();
      }
    },
    cancel() {
      streamActive = false;
      if (heartbeatInterval) clearInterval(heartbeatInterval);
    },
  });

  return new Response(stream, { headers });
}
