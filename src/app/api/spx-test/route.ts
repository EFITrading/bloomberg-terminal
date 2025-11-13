import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Call our SPX-fix API and check what we get back
    const response = await fetch('http://localhost:3000/api/spx-fix?ticker=SPX');
    const data = await response.json();
    
    if (!data.success || !data.data) {
      return NextResponse.json({ error: 'Failed to get SPX data', data });
    }
    
    const nov10Data = data.data['2025-11-10'];
    if (!nov10Data) {
      return NextResponse.json({ error: 'No Nov 10 data found' });
    }
    
    const { calls, puts } = nov10Data;
    
    // Check specific strikes we know should have high OI
    const testStrikes = ['6700', '6750', '6850', '6900'];
    const results: any = {
      callsCount: Object.keys(calls || {}).length,
      putsCount: Object.keys(puts || {}).length,
      testStrikes: {}
    };
    
    testStrikes.forEach(strike => {
      results.testStrikes[strike] = {
        callExists: !!calls?.[strike],
        putExists: !!puts?.[strike], 
        callOI: calls?.[strike]?.open_interest || 0,
        putOI: puts?.[strike]?.open_interest || 0
      };
    });
    
    // Also get a sample of puts with high OI
    const putsWithHighOI = Object.entries(puts || {})
      .filter(([_, putData]: [string, any]) => putData.open_interest > 100)
      .map(([strike, putData]: [string, any]) => ({
        strike: parseFloat(strike),
        oi: putData.open_interest
      }))
      .sort((a, b) => b.oi - a.oi)
      .slice(0, 10);
    
    results.highOIPuts = putsWithHighOI;
    
    return NextResponse.json(results);
    
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}