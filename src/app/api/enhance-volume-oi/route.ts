import { NextRequest, NextResponse } from 'next/server';
import { optionsFlowService } from '../../../lib/optionsFlowService';

export async function POST(request: NextRequest) {
  try {
    const { trades } = await request.json();
    
    if (!trades || !Array.isArray(trades)) {
      return NextResponse.json(
        { error: 'Invalid trades data provided' },
        { status: 400 }
      );
    }

    console.log(`🚀 API: Triggering MEGA-FAST Volume/OI enhancement for ${trades.length} trades...`);
    
    // Generate a unique stream ID for this batch
    const streamId = `volume-oi-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Trigger the background enhancement (non-blocking)
    setImmediate(async () => {
      try {
        await optionsFlowService.enhanceTradesInBackground(
          trades,
          (enhancedTrades, status) => {
            // Log progress updates
            console.log(`📊 STREAM ${streamId}: ${status}`);
            console.log(`📊 STREAM ${streamId}: ${enhancedTrades.filter(t => t.volume !== undefined).length}/${trades.length} trades enhanced`);
            
            // TODO: In a real implementation, you would broadcast these updates via WebSocket
            // For now, we're just logging the progress
          }
        );
        
        console.log(`✅ STREAM ${streamId}: Background Volume/OI enhancement completed!`);
      } catch (error) {
        console.error(`❌ STREAM ${streamId}: Background enhancement failed:`, error);
      }
    });
    
    return NextResponse.json({
      success: true,
      message: `Volume/OI enhancement started for ${trades.length} trades`,
      streamId,
      status: 'processing'
    });
    
  } catch (error) {
    console.error('❌ API Error in enhance-volume-oi:', error);
    return NextResponse.json(
      { error: 'Failed to process Volume/OI enhancement request' },
      { status: 500 }
    );
  }
}