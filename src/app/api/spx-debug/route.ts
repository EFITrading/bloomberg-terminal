import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const apiKey = process.env.POLYGON_API_KEY;
  
  try {
    const testExp = '2025-11-10';
    const targetStrikes = [6700, 6750];
    
    // Get ALL contracts for Nov 10 with pagination
    let allContracts: any[] = [];
    let nextUrl: string | null = `https://api.polygon.io/v3/snapshot/options/I:SPX?expiration_date=${testExp}&limit=250&apikey=${apiKey}`;
    
    while (nextUrl && allContracts.length < 5000) {
      const response = await fetch(nextUrl);
      const data = await response.json();
      
      if (data.status === 'OK' && data.results && data.results.length > 0) {
        allContracts.push(...data.results);
        nextUrl = data.next_url ? `${data.next_url}&apikey=${apiKey}` : null;
      } else {
        break;
      }
    }
    
    const results: any = {
      expiration: testExp,
      totalContracts: allContracts.length,
      targetStrikes: {},
      allPutStrikes: [],
      putsWithOI: 0
    };
    
    // Process all contracts
    allContracts.forEach((contract: any) => {
      const strike = contract.details?.strike_price;
      const contractType = contract.details?.contract_type?.toLowerCase();
      const oi = contract.open_interest || 0;
      
      if (!strike || contractType !== 'put') return;
      
      // Check if this is one of our target strikes
      if (targetStrikes.includes(strike)) {
        results.targetStrikes[strike] = {
          strike,
          open_interest: oi,
          volume: contract.day?.volume || 0,
          hasGreeks: !!contract.greeks,
          delta: contract.greeks?.delta || 0,
          gamma: contract.greeks?.gamma || 0,
          vega: contract.greeks?.vega || 0
        };
      }
      
      // Collect all put strikes with OI > 0
      if (oi > 0) {
        results.putsWithOI++;
        results.allPutStrikes.push({
          strike,
          open_interest: oi,
          volume: contract.day?.volume || 0
        });
      }
    });
    
    // Sort puts by strike descending
    results.allPutStrikes.sort((a: any, b: any) => b.strike - a.strike);
    
    return NextResponse.json(results);
    
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}