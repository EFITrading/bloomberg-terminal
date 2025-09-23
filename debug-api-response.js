const fetch = require('node-fetch');

async function debugAPIResponse() {
    const ticker = 'AAPL';
    const expiration = '2025-09-26';
    
    console.log(`🔍 Debugging API response for ${ticker} ${expiration}`);
    
    try {
        const response = await fetch(`http://localhost:3000/api/options-chain?symbol=${ticker}&expiration=${expiration}`);
        const result = await response.json();
        
        console.log('\n📊 Full API Response Structure:');
        console.log('Success:', result.success);
        console.log('Current Price:', result.currentPrice);
        console.log('Available Expirations:', Object.keys(result.data || {}));
        
        if (result.data && result.data[expiration]) {
            const expData = result.data[expiration];
            console.log(`\n📅 Data for ${expiration}:`);
            console.log('Calls keys (first 10):', Object.keys(expData.calls || {}).slice(0, 10));
            console.log('Puts keys (first 10):', Object.keys(expData.puts || {}).slice(0, 10));
            
            // Check ATM strike 664
            console.log('\n🎯 Checking ATM Strike 664:');
            console.log('Call 664 exists:', !!expData.calls?.['664']);
            console.log('Put 664 exists:', !!expData.puts?.['664']);
            
            // Try strike 665
            console.log('\n🎯 Checking Strike 665:');
            console.log('Call 665 exists:', !!expData.calls?.['665']);
            console.log('Put 665 exists:', !!expData.puts?.['665']);
            
            if (expData.calls?.['665']) {
                console.log('Call 665 data:', expData.calls['665']);
            }
            if (expData.puts?.['665']) {
                console.log('Put 665 data:', expData.puts['665']);
            }
            
            // Find what strikes actually exist
            const callStrikes = Object.keys(expData.calls || {}).map(s => parseFloat(s)).sort((a, b) => a - b);
            const putStrikes = Object.keys(expData.puts || {}).map(s => parseFloat(s)).sort((a, b) => a - b);
            
            console.log('\n📊 Available strikes:');
            console.log('Call strikes range:', callStrikes[0], 'to', callStrikes[callStrikes.length - 1]);
            console.log('Put strikes range:', putStrikes[0], 'to', putStrikes[putStrikes.length - 1]);
            
            // Find closest strikes to current price
            const currentPrice = result.currentPrice || 663.7;
            const closestCall = callStrikes.reduce((prev, curr) => 
                Math.abs(curr - currentPrice) < Math.abs(prev - currentPrice) ? curr : prev
            );
            const closestPut = putStrikes.reduce((prev, curr) => 
                Math.abs(curr - currentPrice) < Math.abs(prev - currentPrice) ? curr : prev
            );
            
            console.log(`\n🎯 Closest to current price ${currentPrice}:`);
            console.log('Closest call strike:', closestCall);
            console.log('Closest put strike:', closestPut);
            
            if (expData.calls?.[closestCall.toString()]) {
                const call = expData.calls[closestCall.toString()];
                console.log(`Call ${closestCall} OI:`, call.open_interest || call.openInterest);
            }
            
            if (expData.puts?.[closestPut.toString()]) {
                const put = expData.puts[closestPut.toString()];
                console.log(`Put ${closestPut} OI:`, put.open_interest || put.openInterest);
            }
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

debugAPIResponse().catch(console.error);