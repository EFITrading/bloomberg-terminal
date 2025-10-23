import { premiumScanner } from '@/lib/premiumImbalanceScanner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
 const { searchParams } = new URL(request.url);
 
 const symbolsParam = searchParams.get('symbols') || 'AAPL,TSLA,NVDA,MSFT,GOOGL,META,AMD,SPY,QQQ,AMZN';
 const maxSpread = parseFloat(searchParams.get('maxSpread') || '5');
 
 const symbols = symbolsParam.split(',');

 // Create a ReadableStream for Server-Sent Events
 const stream = new ReadableStream({
 async start(controller) {
 const encoder = new TextEncoder();
 
 try {
 // Use the streaming scanner
 for await (const event of premiumScanner.scanSymbolsStream(symbols, maxSpread)) {
 // Send event to client
 const data = `data: ${JSON.stringify(event)}\n\n`;
 controller.enqueue(encoder.encode(data));
 }
 
 // Close the stream
 controller.close();
 } catch (error) {
 console.error('Streaming error:', error);
 const errorData = `data: ${JSON.stringify({
 type: 'error',
 error: error instanceof Error ? error.message : 'Unknown error'
 })}\n\n`;
 controller.enqueue(encoder.encode(errorData));
 controller.close();
 }
 }
 });

 return new Response(stream, {
 headers: {
 'Content-Type': 'text/event-stream',
 'Cache-Control': 'no-cache',
 'Connection': 'keep-alive',
 },
 });
}