import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

// This endpoint provides real-time price updates via Server-Sent Events (SSE)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbols = searchParams.get('symbols')?.split(',') || ['AAPL'];
  
  console.log('Starting real-time feed for symbols:', symbols);
  
  // Create a readable stream for Server-Sent Events
  const stream = new ReadableStream({
    start(controller) {
      // Function to fetch and send price updates
      const sendPriceUpdate = async () => {
        try {
          const updates = await Promise.all(
            symbols.map(async (symbol) => {
              try {
                const quoteUrl = `https://api.polygon.io/v2/last/trade/${symbol.trim()}?apikey=${POLYGON_API_KEY}`;
                const response = await fetch(quoteUrl);
                
                if (response.ok) {
                  const data = await response.json();
                  return {
                    symbol: symbol.trim(),
                    price: data.results?.p || 0,
                    timestamp: data.results?.t || Date.now(),
                    volume: data.results?.s || 0,
                    conditions: data.results?.c || [],
                    exchange: data.results?.x || null
                  };
                }
                return null;
              } catch (error) {
                console.error(`Error fetching quote for ${symbol}:`, error);
                return null;
              }
            })
          );
          
          const validUpdates = updates.filter(update => update !== null);
          
          if (validUpdates.length > 0) {
            const sseData = `data: ${JSON.stringify({
              type: 'price_update',
              timestamp: Date.now(),
              quotes: validUpdates
            })}\n\n`;
            
            controller.enqueue(new TextEncoder().encode(sseData));
          }
        } catch (error) {
          console.error('Error in price update:', error);
          const errorData = `data: ${JSON.stringify({
            type: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now()
          })}\n\n`;
          
          controller.enqueue(new TextEncoder().encode(errorData));
        }
      };
      
      // Send initial price update
      sendPriceUpdate();
      
      // Set up interval for regular updates (every 5 seconds during market hours)
      const updateInterval = setInterval(sendPriceUpdate, 5000);
      
      // Send heartbeat every 30 seconds
      const heartbeatInterval = setInterval(() => {
        const heartbeatData = `data: ${JSON.stringify({
          type: 'heartbeat',
          timestamp: Date.now()
        })}\n\n`;
        
        controller.enqueue(new TextEncoder().encode(heartbeatData));
      }, 30000);
      
      // Clean up on close
      const cleanup = () => {
        clearInterval(updateInterval);
        clearInterval(heartbeatInterval);
        controller.close();
      };
      
      // Handle client disconnect
      request.signal.addEventListener('abort', cleanup);
      
      // Auto-cleanup after 1 hour to prevent memory leaks
      setTimeout(cleanup, 60 * 60 * 1000);
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
