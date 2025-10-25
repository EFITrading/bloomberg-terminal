import { NextRequest, NextResponse } from 'next/server';

/**
 * Manual trigger for background screeners
 * Use this to test background screeners immediately
 */
export async function GET(request: NextRequest) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://efitrading.com';
    
    console.log('🔄 Manually triggering background screeners...');
    
    // Trigger SPY AlgoFlow
    const spyResponse = await fetch(`${baseUrl}/api/cron/spy-algoflow`, {
      method: 'GET'
    });
    
    // Trigger Background Screeners  
    const screenersResponse = await fetch(`${baseUrl}/api/cron/background-screeners`, {
      method: 'GET'
    });
    
    const spyResult = spyResponse.ok ? await spyResponse.json() : { error: 'SPY trigger failed' };
    const screenersResult = screenersResponse.ok ? await screenersResponse.json() : { error: 'Screeners trigger failed' };
    
    return NextResponse.json({
      success: true,
      message: 'Background screeners manually triggered',
      timestamp: new Date().toISOString(),
      results: {
        spyAlgoFlow: {
          status: spyResponse.status,
          data: spyResult
        },
        backgroundScreeners: {
          status: screenersResponse.status,
          data: screenersResult
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Manual trigger error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}