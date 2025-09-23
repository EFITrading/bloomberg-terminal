console.log('🔍 CHECKING ALL AVAILABLE EXPIRATION DATES...\n');

async function checkAllExpirations() {
  try {
    // Get all available expirations
    const response = await fetch('http://localhost:3000/api/options-chain?ticker=SPY');
    const result = await response.json();
    
    if (result.success && result.data) {
      const expirations = Object.keys(result.data).sort();
      
      console.log('📅 CURRENT DATE:', new Date().toISOString().split('T')[0]);
      console.log('🗓️  ALL AVAILABLE EXPIRATION DATES:');
      console.log('Total expirations found:', expirations.length);
      console.log('');
      
      const today = new Date();
      let validFutureExpirations = 0;
      let expiredExpirations = 0;
      let todayExpirations = 0;
      
      expirations.forEach((expDate, index) => {
        const exp = new Date(expDate);
        const daysToExp = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
        
        let status = '';
        if (daysToExp < 0) {
          status = `❌ EXPIRED ${Math.abs(daysToExp)} days ago`;
          expiredExpirations++;
        } else if (daysToExp === 0) {
          status = `⚠️  EXPIRES TODAY`;
          todayExpirations++;
        } else {
          status = `✅ Valid: ${daysToExp} days to expiry`;
          validFutureExpirations++;
        }
        
        console.log(`${index + 1}. ${expDate} - ${status}`);
        
        // Check data quality for this expiration
        const expData = result.data[expDate];
        let callsWithOI = 0;
        let putsWithOI = 0;
        
        if (expData.calls) {
          for (const [strike, callData] of Object.entries(expData.calls)) {
            const oi = callData.open_interest || callData.openInterest || 0;
            if (oi > 0) callsWithOI++;
          }
        }
        
        if (expData.puts) {
          for (const [strike, putData] of Object.entries(expData.puts)) {
            const oi = putData.open_interest || putData.openInterest || 0;
            if (oi > 0) putsWithOI++;
          }
        }
        
        console.log(`   Calls with OI: ${callsWithOI}, Puts with OI: ${putsWithOI}`);
        console.log('');
      });
      
      console.log('📊 SUMMARY:');
      console.log(`✅ Valid future expirations: ${validFutureExpirations}`);
      console.log(`⚠️  Expires today: ${todayExpirations}`);
      console.log(`❌ Expired: ${expiredExpirations}`);
      
      if (expiredExpirations > 0) {
        console.log('\n⚠️  WARNING: Found expired options data that should be cleaned up');
      }
      
      if (validFutureExpirations === 0) {
        console.log('\n🚨 CRITICAL: No valid future expiration dates found!');
      } else {
        console.log('\n✅ Data looks current with valid future expirations');
      }
      
    } else {
      console.log('❌ API call failed or no data');
      console.log('Response:', result);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkAllExpirations();