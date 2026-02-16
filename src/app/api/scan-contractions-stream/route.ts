import { contractionScanner } from '@/lib/contractionScanner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);

    const symbolsParam = searchParams.get('symbols') || 'AAPL,TSLA,NVDA,MSFT,GOOGL,META,AMD,SPY,QQQ,AMZN';
    const symbols = symbolsParam.split(',');

    // Create a ReadableStream for Server-Sent Events
    const stream = new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder();
            let isClosed = false;

            // Helper function to safely enqueue data
            const safeEnqueue = (data: string) => {
                try {
                    if (!isClosed && controller.desiredSize !== null) {
                        controller.enqueue(encoder.encode(data));
                    }
                } catch (error) {
                    console.error('Error enqueueing data:', error);
                    isClosed = true;
                }
            };

            try {
                // Use the streaming scanner
                for await (const event of contractionScanner.scanSymbolsStream(symbols)) {
                    if (isClosed) break; // Stop if stream is closed

                    // Send event to client
                    const data = `data: ${JSON.stringify(event)}\n\n`;
                    safeEnqueue(data);
                }

                // Close the stream only if not already closed
                if (!isClosed) {
                    isClosed = true;
                    controller.close();
                }
            } catch (error) {
                console.error('Contraction streaming error:', error);

                if (!isClosed) {
                    const errorData = `data: ${JSON.stringify({
                        type: 'error',
                        error: error instanceof Error ? error.message : 'Unknown error'
                    })}\n\n`;
                    safeEnqueue(errorData);

                    isClosed = true;
                    controller.close();
                }
            }
        },
        cancel() {
            // Client disconnected - clean up resources
            console.log('Contraction stream cancelled by client');
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
