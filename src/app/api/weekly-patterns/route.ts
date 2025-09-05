import { NextRequest, NextResponse } from 'next/server';
import { getWeeklyPatterns } from '@/lib/polygonService';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const years = parseInt(searchParams.get('years') || '15');

    if (!symbol) {
      return NextResponse.json(
        { success: false, error: 'Symbol parameter is required' },
        { status: 400 }
      );
    }

    const patterns = await getWeeklyPatterns([symbol]);
    
    if (patterns.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No patterns found for symbol'
      });
    }
    
    const pattern = patterns[0];
    
    // Transform the data to match the component's expected structure
    const transformedPattern = {
      symbol: pattern.symbol,
      sector: pattern.sector,
      currentWeek: pattern.weeks[0] ? {
        pattern: pattern.weeks[0].sentiment === 'BULLISH' ? 'Bullish' : 
                pattern.weeks[0].sentiment === 'BEARISH' ? 'Bearish' : 'Neutral',
        strength: pattern.weeks[0].relativePerformance,
        confidence: pattern.weeks[0].confidence
      } : null,
      nextWeek: pattern.weeks[1] ? {
        pattern: pattern.weeks[1].sentiment === 'BULLISH' ? 'Bullish' : 
                pattern.weeks[1].sentiment === 'BEARISH' ? 'Bearish' : 'Neutral',
        strength: pattern.weeks[1].relativePerformance,
        confidence: pattern.weeks[1].confidence
      } : null,
      week3: pattern.weeks[2] ? {
        pattern: pattern.weeks[2].sentiment === 'BULLISH' ? 'Bullish' : 
                pattern.weeks[2].sentiment === 'BEARISH' ? 'Bearish' : 'Neutral',
        strength: pattern.weeks[2].relativePerformance,
        confidence: pattern.weeks[2].confidence
      } : null,
      week4: pattern.weeks[3] ? {
        pattern: pattern.weeks[3].sentiment === 'BULLISH' ? 'Bullish' : 
                pattern.weeks[3].sentiment === 'BEARISH' ? 'Bearish' : 'Neutral',
        strength: pattern.weeks[3].relativePerformance,
        confidence: pattern.weeks[3].confidence
      } : null,
      reliability: Math.round(pattern.weeks.reduce((sum, week) => sum + week.confidence, 0) / pattern.weeks.length)
    };
    
    return NextResponse.json({
      success: true,
      weeklyPattern: transformedPattern
    });

  } catch (error) {
    console.error('Error in weekly-patterns API:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch weekly patterns' },
      { status: 500 }
    );
  }
}
