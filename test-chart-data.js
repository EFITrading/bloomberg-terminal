const fetch = require('node-fetch');

async function testOpenInterestChart() {
    console.log('🧪 Testing if OpenInterestChart will now show all puts...\n');
    
    const response = await fetch('http://localhost:3000/api/options-chain?symbol=SPY&expiration=2025-09-26');
    const data = await response.json();
    
    if (data.success && data.data && data.data['2025-09-26']) {
        const expData = data.data['2025-09-26'];
        
        console.log('📊 Raw API Data:');
        console.log(`   Calls: ${Object.keys(expData.calls).length} strikes`);
        console.log(`   Puts: ${Object.keys(expData.puts).length} strikes`);
        
        const putStrikes = Object.keys(expData.puts).map(s => parseFloat(s)).sort((a,b) => a-b);
        const callStrikes = Object.keys(expData.calls).map(s => parseFloat(s)).sort((a,b) => a-b);
        
        console.log(`   Put range: ${putStrikes[0]} to ${putStrikes[putStrikes.length-1]}`);
        console.log(`   Call range: ${callStrikes[0]} to ${callStrikes[callStrikes.length-1]}`);
        
        // Simulate OpenInterestChart processing
        console.log('\n🎯 Simulating OpenInterestChart data processing...');
        
        const chartData = [];
        
        // Process puts (same logic as OpenInterestChart)
        Object.entries(expData.puts).forEach(([strike, putData]) => {
            const strikeNum = parseFloat(strike);
            const openInterest = putData.open_interest || putData.openInterest || 0;
            
            chartData.push({
                strike: strikeNum,
                openInterest,
                type: 'put'
            });
        });
        
        // Process calls
        Object.entries(expData.calls).forEach(([strike, callData]) => {
            const strikeNum = parseFloat(strike);
            const openInterest = callData.open_interest || callData.openInterest || 0;
            
            chartData.push({
                strike: strikeNum,
                openInterest,
                type: 'call'
            });
        });
        
        const puts = chartData.filter(d => d.type === 'put').sort((a,b) => a.strike - b.strike);
        const calls = chartData.filter(d => d.type === 'call').sort((a,b) => a.strike - b.strike);
        
        console.log(`\n📈 Chart Data (what OpenInterestChart will display):`);
        console.log(`   Puts: ${puts.length} data points`);
        console.log(`   Put range: ${puts[0]?.strike} to ${puts[puts.length-1]?.strike}`);
        console.log(`   Calls: ${calls.length} data points`);
        console.log(`   Call range: ${calls[0]?.strike} to ${calls[calls.length-1]?.strike}`);
        
        // Check puts near current price (666)
        const putsNearMoney = puts.filter(p => p.strike >= 650 && p.strike <= 680);
        console.log(`\n🎯 Puts near current price (650-680): ${putsNearMoney.length} strikes`);
        console.log('   Sample puts near money:');
        putsNearMoney.slice(0, 10).forEach(p => {
            console.log(`      Strike ${p.strike}: OI=${p.openInterest}`);
        });
        
        if (puts[puts.length-1]?.strike >= 700) {
            console.log('\n✅ SUCCESS: Puts now go up to 700+, matching other platforms!');
            console.log('   The OpenInterestChart should now display puts all the way to the current price and beyond.');
        } else {
            console.log('\n❌ PROBLEM: Puts still don\'t reach high enough strikes');
        }
    }
}

testOpenInterestChart().catch(console.error);