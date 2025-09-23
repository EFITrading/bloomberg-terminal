const fetch = require('node-fetch');

async function debugNewAPI() {
    console.log('🔧 Debugging the modified API to see why puts are still limited...\n');
    
    try {
        // Test with cache clearing and specific parameters
        const url = 'http://localhost:3000/api/options-chain?symbol=SPY&expiration=2025-09-26&clearCache=true';
        console.log(`Testing: ${url}`);
        
        const response = await fetch(url);
        const data = await response.json();
        
        console.log('📊 API Response Status:', data.success);
        console.log('📊 Debug Info:', data.debug);
        
        if (data.success && data.data && data.data['2025-09-26']) {
            const expData = data.data['2025-09-26'];
            
            const putKeys = Object.keys(expData.puts || {});
            const callKeys = Object.keys(expData.calls || {});
            
            console.log(`\n📈 Results for 2025-09-26:`);
            console.log(`   Puts: ${putKeys.length} strikes`);
            console.log(`   Calls: ${callKeys.length} strikes`);
            
            if (putKeys.length > 0) {
                const putStrikes = putKeys.map(s => parseFloat(s)).sort((a,b) => a-b);
                console.log(`   Put range: ${putStrikes[0]} to ${putStrikes[putStrikes.length-1]}`);
                console.log(`   Highest 20 put strikes: ${putStrikes.slice(-20).join(', ')}`);
                
                // Check if any puts have zero OI (these would be the new ones from contracts API)
                const zeroOIPuts = putKeys.filter(strike => {
                    const putData = expData.puts[strike];
                    return (putData.open_interest || putData.openInterest || 0) === 0;
                });
                console.log(`   Puts with zero OI (new from contracts): ${zeroOIPuts.length}`);
                
                if (zeroOIPuts.length > 0) {
                    console.log(`   Sample zero OI strikes: ${zeroOIPuts.slice(0, 10).join(', ')}`);
                }
            }
            
            if (callKeys.length > 0) {
                const callStrikes = callKeys.map(s => parseFloat(s)).sort((a,b) => a-b);
                console.log(`   Call range: ${callStrikes[0]} to ${callStrikes[callStrikes.length-1]}`);
            }
        } else {
            console.log('❌ No data for 2025-09-26 or API failed');
            console.log('Available expirations:', Object.keys(data.data || {}));
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

debugNewAPI().catch(console.error);