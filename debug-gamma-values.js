const https = require('https');

console.log('🔍 DEBUGGING GAMMA VALUES FROM API...\n');

async function testGammaValues() {
  try {
    const response = await fetch('http://localhost:3000/api/options-chain?ticker=SPY&expiration=2025-09-23');
    const result = await response.json();
    
    if (result.success && result.data) {
      const expData = Object.values(result.data)[0];
      
      console.log('✅ API Response received\n');
      
      // Check a few call options for gamma values
      if (expData.calls) {
        console.log('📈 CALL OPTIONS GAMMA VALUES:');
        let count = 0;
        for (const [strike, callData] of Object.entries(expData.calls)) {
          if (count >= 5) break; // Just check first 5
          
          const gamma = callData.greeks?.gamma;
          const openInterest = callData.open_interest || callData.openInterest || 0;
          
          console.log(`Strike ${strike}: Gamma=${gamma}, OI=${openInterest}`);
          
          if (gamma !== undefined && gamma !== null) {
            if (Math.abs(gamma) > 0.1) {
              console.log(`  ⚠️  SUSPICIOUS: Gamma ${gamma} seems too high`);
            } else if (Math.abs(gamma) < 0.0001) {
              console.log(`  ⚠️  SUSPICIOUS: Gamma ${gamma} seems too low`);
            } else {
              console.log(`  ✅ Gamma ${gamma} looks reasonable`);
            }
          } else {
            console.log(`  ❌ NO GAMMA DATA`);
          }
          count++;
        }
      }
      
      // Check a few put options for gamma values
      if (expData.puts) {
        console.log('\n📉 PUT OPTIONS GAMMA VALUES:');
        let count = 0;
        for (const [strike, putData] of Object.entries(expData.puts)) {
          if (count >= 5) break; // Just check first 5
          
          const gamma = putData.greeks?.gamma;
          const openInterest = putData.open_interest || putData.openInterest || 0;
          
          console.log(`Strike ${strike}: Gamma=${gamma}, OI=${openInterest}`);
          
          if (gamma !== undefined && gamma !== null) {
            if (Math.abs(gamma) > 0.1) {
              console.log(`  ⚠️  SUSPICIOUS: Gamma ${gamma} seems too high`);
            } else if (Math.abs(gamma) < 0.0001) {
              console.log(`  ⚠️  SUSPICIOUS: Gamma ${gamma} seems too low`);
            } else {
              console.log(`  ✅ Gamma ${gamma} looks reasonable`);
            }
          } else {
            console.log(`  ❌ NO GAMMA DATA`);
          }
          count++;
        }
      }
      
    } else {
      console.log('❌ API call failed or no data');
      console.log('Response:', result);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testGammaValues();