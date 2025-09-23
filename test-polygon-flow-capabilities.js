/**
 * Test Polygon Options Flow API Capabilities
 * Testing what real options flow data we can get from Polygon API
 */

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

async function testPolygonOptionsFlow() {
  console.log('🔍 TESTING POLYGON OPTIONS FLOW CAPABILITIES');
  console.log('=' .repeat(60));
  
  try {
    // 1. Test options snapshots (real-time)
    console.log('\n📊 1. TESTING OPTIONS SNAPSHOTS');
    const snapshotUrl = `https://api.polygon.io/v3/snapshot/options/SPY?limit=50&apikey=${POLYGON_API_KEY}`;
    console.log(`🔗 URL: ${snapshotUrl}`);
    
    const snapshotResponse = await fetch(snapshotUrl);
    const snapshotData = await snapshotResponse.json();
    
    if (snapshotData.results && snapshotData.results.length > 0) {
      const sample = snapshotData.results[0];
      console.log('✅ Sample snapshot data:');
      console.log(`   Contract: ${sample.details?.ticker}`);
      console.log(`   Last Price: $${sample.market_status?.last_quote?.price || 'N/A'}`);
      console.log(`   Volume: ${sample.session?.volume || 'N/A'}`);
      console.log(`   Open Interest: ${sample.open_interest || 'N/A'}`);
      console.log(`   Available fields: ${Object.keys(sample).join(', ')}`);
    } else {
      console.log('❌ No snapshot data available');
    }

    // 2. Test trade data for options
    console.log('\n📈 2. TESTING OPTIONS TRADES');
    const today = new Date().toISOString().split('T')[0];
    const tradesUrl = `https://api.polygon.io/v3/trades/O:SPY${today.replace(/-/g, '')}C00500000?timestamp.gte=${today}&limit=10&apikey=${POLYGON_API_KEY}`;
    
    try {
      const tradesResponse = await fetch(tradesUrl);
      const tradesData = await tradesResponse.json();
      
      if (tradesData.results && tradesData.results.length > 0) {
        console.log('✅ Trade data available:');
        console.log(`   Found ${tradesData.results.length} trades`);
        const trade = tradesData.results[0];
        console.log(`   Sample: Price=$${trade.price}, Size=${trade.size}, Exchange=${trade.exchange}`);
        console.log(`   Timestamp: ${new Date(trade.participant_timestamp / 1000000).toISOString()}`);
      } else {
        console.log('❌ No trade data for specific contract');
      }
    } catch (error) {
      console.log('⚠️ Trade data test failed:', error.message);
    }

    // 3. Test aggregates (OHLC) for options
    console.log('\n📊 3. TESTING OPTIONS AGGREGATES');
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = yesterday.toISOString().split('T')[0];
      
      const aggUrl = `https://api.polygon.io/v2/aggs/ticker/O:SPY240920C00550000/range/1/minute/${dateStr}/${dateStr}?apikey=${POLYGON_API_KEY}`;
      const aggResponse = await fetch(aggUrl);
      const aggData = await aggResponse.json();
      
      if (aggData.results && aggData.results.length > 0) {
        console.log('✅ Aggregate data available:');
        console.log(`   Found ${aggData.results.length} bars`);
        const bar = aggData.results[0];
        console.log(`   Sample bar: O=$${bar.o}, H=$${bar.h}, L=$${bar.l}, C=$${bar.c}, V=${bar.v}`);
      } else {
        console.log('❌ No aggregate data available');
      }
    } catch (error) {
      console.log('⚠️ Aggregates test failed:', error.message);
    }

    // 4. Test what we can build for flow
    console.log('\n🔥 4. FLOW DETECTION STRATEGY');
    console.log('Based on available data, we can detect:');
    console.log('✅ Volume spikes (current vs. average)');
    console.log('✅ Large trades (high premium transactions)');
    console.log('✅ Unusual activity (volume vs. open interest)');
    console.log('✅ Time and sales data (if available)');
    console.log('❌ BTO/STO detection (requires bid/ask comparison)');
    console.log('❌ Sweep detection (requires cross-exchange data)');
    
    console.log('\n💡 RECOMMENDATION:');
    console.log('Focus on volume-based flow detection using snapshots + aggregates');
    console.log('Filter by: Premium size, Volume spikes, Unusual OI ratios');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testPolygonOptionsFlow()
  .then(() => console.log('\n✅ Test completed'))
  .catch(error => console.error('\n❌ Test failed:', error));