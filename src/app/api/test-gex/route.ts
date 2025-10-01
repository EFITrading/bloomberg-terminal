import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbol = searchParams.get('symbol') || 'SPY';
  
  try {
    console.log('🔍 TESTING POLYGON API DIRECTLY');
    
    // Test 1: Get spot price
    const spotUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`;
    console.log('📡 Spot price URL:', spotUrl);
    
    const spotResponse = await fetch(spotUrl);
    const spotData = await spotResponse.json();
    console.log('💰 Spot price response:', spotData);
    
    const spotPrice = spotData.results[0].c;
    console.log(`✅ Current ${symbol} price: $${spotPrice}`);
    
    // Test 2: Get a few options contracts
    const contractsUrl = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${symbol}&contract_type=call&expiration_date.gte=2025-09-29&expiration_date.lte=2025-11-15&limit=10&apiKey=${POLYGON_API_KEY}`;
    console.log('📡 Contracts URL:', contractsUrl);
    
    const contractsResponse = await fetch(contractsUrl);
    const contractsData = await contractsResponse.json();
    console.log('📄 Contracts response:', contractsData);
    
    if (!contractsData.results || contractsData.results.length === 0) {
      return NextResponse.json({
        error: 'No options contracts found',
        spot_price: spotPrice,
        contracts_response: contractsData
      });
    }
    
    // Test 3: Get snapshots with Greeks for first few contracts
    const firstContract = contractsData.results[0];
    const snapshotUrl = `https://api.polygon.io/v3/snapshot/options/${symbol}?option_contract.in=${firstContract.ticker}&apiKey=${POLYGON_API_KEY}`;
    console.log('📡 Snapshot URL:', snapshotUrl);
    
    const snapshotResponse = await fetch(snapshotUrl);
    const snapshotData = await snapshotResponse.json();
    console.log('📊 Snapshot response:', JSON.stringify(snapshotData, null, 2));
    
    // Test 4: Check what Greeks data we actually get
    const result = snapshotData.results?.[0];
    
    return NextResponse.json({
      success: true,
      tests: {
        spot_price: spotPrice,
        sample_contract: firstContract,
        snapshot_result: result,
        has_greeks: !!result?.greeks,
        greeks_data: result?.greeks,
        open_interest: result?.open_interest,
        full_snapshot: snapshotData
      }
    });
    
  } catch (error: any) {
    console.error('❌ API TEST ERROR:', error);
    return NextResponse.json({
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}