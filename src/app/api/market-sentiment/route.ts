import { NextRequest, NextResponse } from 'next/server';
import MarketSentimentService from '@/lib/marketSentimentService';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const timeframe = searchParams.get('timeframe') as '1h' | '4h' | '1d' | '1w' || '1d';
    
    console.log(`📊 Analyzing market sentiment for timeframe: ${timeframe}`);
    
    const sentimentService = MarketSentimentService.getInstance();
    const analysis = await sentimentService.analyzeSentiment(timeframe);
    
    return NextResponse.json({
      success: true,
      sentiment_analysis: analysis,
      timestamp: new Date().toISOString(),
      timeframe
    });

  } catch (error) {
    console.error('Market sentiment analysis error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to analyze market sentiment',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}