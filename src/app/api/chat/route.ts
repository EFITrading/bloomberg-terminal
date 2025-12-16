import { TradingAssistant } from '@/lib/tradingAssistant';

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    
    // Get base URL for API calls
    const url = new URL(req.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    
    const assistant = new TradingAssistant(baseUrl);
    const lastMessage = messages[messages.length - 1];
    
    if (!lastMessage || lastMessage.role !== 'user') {
      throw new Error('Invalid message format');
    }

    const response = await assistant.generateResponse(lastMessage.content, messages);

    return new Response(
      JSON.stringify({ 
        role: 'assistant',
        content: response 
      }),
      { 
        status: 200, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error('Chat API Error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Error message:', error instanceof Error ? error.message : String(error));
    return new Response(
      JSON.stringify({ 
        error: 'Failed to process chat request',
        details: error instanceof Error ? error.message : String(error)
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
