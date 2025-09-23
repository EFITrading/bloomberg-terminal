// Test script to debug 10/17 expiration data
const testDate = '2025-10-17';
const ticker = 'SPY';

async function testOptionsData() {
  try {
    console.log(`🔍 Testing options data for ${ticker} ${testDate}`);
    
    // Test the API endpoint
    const response = await fetch(`http://localhost:3000/api/options-chain?symbol=${ticker}&expiration=${testDate}`);
    
    if (!response.ok) {
      console.error(`❌ API request failed: ${response.status} ${response.statusText}`);
      return;
    }
    
    const result = await response.json();
    
    console.log('📊 API Response:', {
      success: result.success,
      currentPrice: result.currentPrice,
      hasData: !!result.data,
      hasExpiration: !!(result.data && result.data[testDate])
    });
    
    if (!result.success) {
      console.error('❌ API returned unsuccessful');
      return;
    }
    
    if (!result.data || !result.data[testDate]) {
      console.error(`❌ No data found for expiration ${testDate}`);
      console.log('Available expirations:', Object.keys(result.data || {}));
      return;
    }
    
    const currentPrice = result.currentPrice || 0;
    const expirationData = result.data[testDate];
    
    console.log(`📈 Current Price: $${currentPrice}`);
    console.log(`📅 Expiration Data for ${testDate}:`);
    
    // Check puts data
    const putsData = expirationData.puts || {};
    const callsData = expirationData.calls || {};
    
    console.log(`📊 Data Summary:`);
    console.log(`   Put strikes available: ${Object.keys(putsData).length}`);
    console.log(`   Call strikes available: ${Object.keys(callsData).length}`);
    
    // Check strikes around current price
    const targetRange = [650, 655, 660, 663, 665, 670, 675];
    
    console.log(`\n🎯 Checking strikes around current price ($${currentPrice}):`);
    
    targetRange.forEach(strike => {
      const putData = putsData[strike.toString()];
      const callData = callsData[strike.toString()];
      
      console.log(`Strike $${strike}:`);
      if (putData) {
        console.log(`  PUT  - OI: ${putData.open_interest || 'N/A'}, Bid: ${putData.bid || 'N/A'}, Ask: ${putData.ask || 'N/A'}`);
      } else {
        console.log(`  PUT  - No data available`);
      }
      
      if (callData) {
        console.log(`  CALL - OI: ${callData.open_interest || 'N/A'}, Bid: ${callData.bid || 'N/A'}, Ask: ${callData.ask || 'N/A'}`);
      } else {
        console.log(`  CALL - No data available`);
      }
    });
    
    // Check for any puts with open interest
    console.log(`\n📈 All PUT strikes with open interest > 0:`);
    let putCount = 0;
    Object.entries(putsData).forEach(([strike, data]) => {
      if (data.open_interest > 0) {
        console.log(`  $${strike}: OI=${data.open_interest}, Bid=${data.bid}, Ask=${data.ask}`);
        putCount++;
      }
    });
    
    if (putCount === 0) {
      console.log(`  ❌ NO puts found with open interest > 0`);
    }
    
    // ATM strike detection
    const atmStrike = Object.keys(putsData)
      .map(s => parseFloat(s))
      .reduce((prev, curr) => 
        Math.abs(curr - currentPrice) < Math.abs(prev - currentPrice) ? curr : prev
      );
    
    console.log(`\n🎯 ATM Strike: $${atmStrike}`);
    
    const atmPut = putsData[atmStrike.toString()];
    const atmCall = callsData[atmStrike.toString()];
    
    if (atmPut) {
      console.log(`ATM PUT  - OI: ${atmPut.open_interest}, Bid: ${atmPut.bid}, Ask: ${atmPut.ask}`);
    } else {
      console.log(`ATM PUT  - No data`);
    }
    
    if (atmCall) {
      console.log(`ATM CALL - OI: ${atmCall.open_interest}, Bid: ${atmCall.bid}, Ask: ${atmCall.ask}`);
    } else {
      console.log(`ATM CALL - No data`);
    }
    
  } catch (error) {
    console.error('❌ Error testing options data:', error);
  }
}

// Run the test
testOptionsData();