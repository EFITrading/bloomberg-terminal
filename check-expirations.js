console.log('🔍 Checking available expiration dates for SPY');

async function checkExpirations() {
    try {
        const response = await fetch('http://localhost:3000/api/options-chain?ticker=SPY');
        const result = await response.json();
        
        console.log('📊 API Response:', {
            success: result.success,
            currentPrice: result.currentPrice,
            hasData: !!result.data
        });
        
        if (result.success && result.data) {
            const expirations = Object.keys(result.data).sort();
            console.log('📅 Available expiration dates:', expirations);
            console.log('📅 First 10 expiration dates:', expirations.slice(0, 10));
            
            // Check data for each expiration
            for (const exp of expirations.slice(0, 5)) {
                const expData = result.data[exp];
                const putCount = Object.keys(expData.puts || {}).length;
                const callCount = Object.keys(expData.calls || {}).length;
                console.log(`   ${exp}: ${putCount} puts, ${callCount} calls`);
            }
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

checkExpirations();