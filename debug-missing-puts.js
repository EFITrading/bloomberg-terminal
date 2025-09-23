console.log('🔍 INVESTIGATING MISSING PUTS AT SPECIFIC STRIKES...\n');

async function investigateMissingPuts() {
  try {
    // Test a few different expirations to see strike coverage
    const testExpirations = ['2025-09-24', '2025-10-17', '2025-12-19'];
    
    for (const expDate of testExpirations) {
      console.log(`\n📅 ANALYZING EXPIRATION: ${expDate}`);
      console.log('=' .repeat(50));
      
      const response = await fetch(`http://localhost:3000/api/options-chain?ticker=SPY&expiration=${expDate}`);
      const result = await response.json();
      
      if (result.success && result.data && result.data[expDate]) {
        const expData = result.data[expDate];
        
        // Get all available strikes for calls and puts
        const callStrikes = Object.keys(expData.calls || {}).map(s => parseFloat(s)).sort((a, b) => a - b);
        const putStrikes = Object.keys(expData.puts || {}).map(s => parseFloat(s)).sort((a, b) => a - b);
        
        console.log(`📈 Calls: ${callStrikes.length} strikes (${callStrikes[0]} to ${callStrikes[callStrikes.length - 1]})`);
        console.log(`📉 Puts: ${putStrikes.length} strikes (${putStrikes[0]} to ${putStrikes[putStrikes.length - 1]})`);
        
        // Find missing strikes
        const allStrikes = [...new Set([...callStrikes, ...putStrikes])].sort((a, b) => a - b);
        const missingCalls = allStrikes.filter(strike => !callStrikes.includes(strike));
        const missingPuts = allStrikes.filter(strike => !putStrikes.includes(strike));
        
        console.log(`\n🔍 MISSING ANALYSIS:`);
        console.log(`Total unique strikes: ${allStrikes.length}`);
        console.log(`Missing calls: ${missingCalls.length}`);
        console.log(`Missing puts: ${missingPuts.length}`);
        
        if (missingPuts.length > 0) {
          console.log(`\n❌ MISSING PUT STRIKES:`);
          missingPuts.slice(0, 10).forEach(strike => {
            console.log(`  - Strike ${strike}: Call exists, Put missing`);
          });
          if (missingPuts.length > 10) {
            console.log(`  ... and ${missingPuts.length - 10} more`);
          }
        }
        
        if (missingCalls.length > 0) {
          console.log(`\n❌ MISSING CALL STRIKES:`);
          missingCalls.slice(0, 10).forEach(strike => {
            console.log(`  - Strike ${strike}: Put exists, Call missing`);
          });
          if (missingCalls.length > 10) {
            console.log(`  ... and ${missingCalls.length - 10} more`);
          }
        }
        
        // Check around current price for completeness
        const currentPrice = result.currentPrice || 570;
        const nearbyStrikes = allStrikes.filter(s => Math.abs(s - currentPrice) <= 50);
        
        console.log(`\n💰 AROUND CURRENT PRICE ($${currentPrice}):`);
        console.log(`Strikes within $50: ${nearbyStrikes.join(', ')}`);
        
        let nearbyMissingPuts = [];
        let nearbyMissingCalls = [];
        
        nearbyStrikes.forEach(strike => {
          if (!putStrikes.includes(strike)) nearbyMissingPuts.push(strike);
          if (!callStrikes.includes(strike)) nearbyMissingCalls.push(strike);
        });
        
        if (nearbyMissingPuts.length > 0) {
          console.log(`⚠️  Missing puts near money: ${nearbyMissingPuts.join(', ')}`);
        }
        if (nearbyMissingCalls.length > 0) {
          console.log(`⚠️  Missing calls near money: ${nearbyMissingCalls.join(', ')}`);
        }
        
        // Sample a few puts to check data quality
        console.log(`\n📊 SAMPLE PUT DATA:`);
        const samplePutStrikes = putStrikes.slice(0, 3);
        samplePutStrikes.forEach(strike => {
          const putData = expData.puts[strike.toString()];
          const oi = putData.open_interest || putData.openInterest || 0;
          const hasGreeks = putData.greeks ? 'YES' : 'NO';
          console.log(`  Strike ${strike}: OI=${oi}, Greeks=${hasGreeks}`);
        });
        
      } else {
        console.log(`❌ Failed to get data for ${expDate}`);
      }
    }
    
    // Now let's check the raw Polygon API response to see if it's a data source issue
    console.log(`\n\n🔍 CHECKING RAW POLYGON API RESPONSE...`);
    console.log('=' .repeat(60));
    
    const apiKey = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
    const testExp = '2025-10-17';
    const snapUrl = `https://api.polygon.io/v3/snapshot/options/SPY?expiration_date=${testExp}&limit=250&apikey=${apiKey}`;
    
    console.log(`Testing: ${snapUrl}`);
    
    const snapRes = await fetch(snapUrl);
    const snapData = await snapRes.json();
    
    if (snapData.status === 'OK' && snapData.results) {
      console.log(`✅ Polygon returned ${snapData.results.length} contracts`);
      
      const polygonCalls = snapData.results.filter(c => c.details?.contract_type?.toLowerCase() === 'call');
      const polygonPuts = snapData.results.filter(c => c.details?.contract_type?.toLowerCase() === 'put');
      
      console.log(`📈 Polygon calls: ${polygonCalls.length}`);
      console.log(`📉 Polygon puts: ${polygonPuts.length}`);
      
      // Check if our API is filtering out some contracts
      const polygonCallStrikes = polygonCalls.map(c => c.details.strike_price).sort((a, b) => a - b);
      const polygonPutStrikes = polygonPuts.map(c => c.details.strike_price).sort((a, b) => a - b);
      
      console.log(`Polygon call strikes: ${polygonCallStrikes.length} (${polygonCallStrikes[0]} to ${polygonCallStrikes[polygonCallStrikes.length - 1]})`);
      console.log(`Polygon put strikes: ${polygonPutStrikes.length} (${polygonPutStrikes[0]} to ${polygonPutStrikes[polygonPutStrikes.length - 1]})`);
      
      // Check for data quality issues
      let invalidContracts = 0;
      snapData.results.forEach(contract => {
        const strike = contract.details?.strike_price;
        const contractType = contract.details?.contract_type?.toLowerCase();
        
        if (!strike || !contractType) {
          invalidContracts++;
        }
      });
      
      if (invalidContracts > 0) {
        console.log(`⚠️  Found ${invalidContracts} contracts with missing strike/type data`);
      } else {
        console.log(`✅ All contracts have valid strike/type data`);
      }
      
    } else {
      console.log(`❌ Polygon API failed: ${snapData.status}`);
      console.log('Error:', snapData.error || 'Unknown error');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

investigateMissingPuts();