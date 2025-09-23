const https = require('https');

console.log('🔍 CHECKING OPEN INTEREST DATA FRESHNESS...\n');

async function checkOpenInterestData() {
  try {
    const response = await fetch('http://localhost:3000/api/options-chain?ticker=SPY&expiration=2025-09-23');
    const result = await response.json();
    
    if (result.success && result.data) {
      const expData = Object.values(result.data)[0];
      
      console.log('✅ API Response received\n');
      console.log('📅 CURRENT DATE:', new Date().toISOString().split('T')[0]);
      console.log('📊 CHECKING DATA FRESHNESS:\n');
      
      // Check current price
      console.log('💰 CURRENT PRICE:', result.currentPrice || 'NOT AVAILABLE');
      
      // Check a few call options for dates and freshness
      if (expData.calls) {
        console.log('\n📈 CALL OPTIONS DATA ANALYSIS:');
        let count = 0;
        let hasOpenInterest = false;
        
        for (const [strike, callData] of Object.entries(expData.calls)) {
          if (count >= 10) break; // Check first 10
          
          const openInterest = callData.open_interest || callData.openInterest || 0;
          const expirationDate = callData.expiration_date;
          
          if (openInterest > 0) {
            hasOpenInterest = true;
            console.log(`Strike ${strike}:`);
            console.log(`  Open Interest: ${openInterest.toLocaleString()}`);
            console.log(`  Expiration: ${expirationDate}`);
            console.log(`  Has Greeks: ${callData.greeks ? 'YES' : 'NO'}`);
            
            // Check if expiration is in the future
            const expDate = new Date(expirationDate);
            const today = new Date();
            const daysToExp = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
            
            if (daysToExp < 0) {
              console.log(`  ⚠️  EXPIRED: ${Math.abs(daysToExp)} days ago`);
            } else {
              console.log(`  ✅ Valid: ${daysToExp} days to expiry`);
            }
            console.log('');
          }
          count++;
        }
        
        if (!hasOpenInterest) {
          console.log('⚠️  WARNING: No open interest found in first 10 calls');
        }
      }
      
      // Check a few put options for dates and freshness
      if (expData.puts) {
        console.log('\n📉 PUT OPTIONS DATA ANALYSIS:');
        let count = 0;
        let hasOpenInterest = false;
        
        for (const [strike, putData] of Object.entries(expData.puts)) {
          if (count >= 10) break; // Check first 10
          
          const openInterest = putData.open_interest || putData.openInterest || 0;
          const expirationDate = putData.expiration_date;
          
          if (openInterest > 0) {
            hasOpenInterest = true;
            console.log(`Strike ${strike}:`);
            console.log(`  Open Interest: ${openInterest.toLocaleString()}`);
            console.log(`  Expiration: ${expirationDate}`);
            console.log(`  Has Greeks: ${putData.greeks ? 'YES' : 'NO'}`);
            
            // Check if expiration is in the future
            const expDate = new Date(expirationDate);
            const today = new Date();
            const daysToExp = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
            
            if (daysToExp < 0) {
              console.log(`  ⚠️  EXPIRED: ${Math.abs(daysToExp)} days ago`);
            } else {
              console.log(`  ✅ Valid: ${daysToExp} days to expiry`);
            }
            console.log('');
          }
          count++;
        }
        
        if (!hasOpenInterest) {
          console.log('⚠️  WARNING: No open interest found in first 10 puts');
        }
      }
      
      // Check for any 2024 dates
      console.log('\n🚨 CHECKING FOR OLD 2024 DATA:');
      let found2024Data = false;
      
      if (expData.calls) {
        for (const [strike, callData] of Object.entries(expData.calls)) {
          if (callData.expiration_date && callData.expiration_date.includes('2024')) {
            console.log(`⚠️  FOUND 2024 DATA: Call strike ${strike} expires ${callData.expiration_date}`);
            found2024Data = true;
          }
        }
      }
      
      if (expData.puts) {
        for (const [strike, putData] of Object.entries(expData.puts)) {
          if (putData.expiration_date && putData.expiration_date.includes('2024')) {
            console.log(`⚠️  FOUND 2024 DATA: Put strike ${strike} expires ${putData.expiration_date}`);
            found2024Data = true;
          }
        }
      }
      
      if (!found2024Data) {
        console.log('✅ NO 2024 DATA FOUND - All data appears current');
      }
      
    } else {
      console.log('❌ API call failed or no data');
      console.log('Response:', result);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkOpenInterestData();