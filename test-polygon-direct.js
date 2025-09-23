const fetch = require('node-fetch');

async function testPolygonDirectAPI() {
    const apiKey = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
    const ticker = 'SPY';
    const expiration = '2025-09-26';
    
    console.log('🔍 Testing Polygon API directly vs our wrapper\n');
    
    try {
        // Test 1: Polygon snapshot API (what our current API uses)
        console.log('📊 TEST 1: Polygon Snapshot API (current method)');
        const snapUrl = `https://api.polygon.io/v3/snapshot/options/${ticker}?expiration_date=${expiration}&limit=250&apikey=${apiKey}`;
        console.log(`URL: ${snapUrl}`);
        
        const snapResponse = await fetch(snapUrl);
        const snapData = await snapResponse.json();
        
        if (snapData.status === 'OK' && snapData.results) {
            const puts = snapData.results.filter(r => r.details?.contract_type === 'put');
            const calls = snapData.results.filter(r => r.details?.contract_type === 'call');
            
            const putStrikes = puts.map(p => p.details.strike_price).sort((a,b) => a-b);
            const callStrikes = calls.map(c => c.details.strike_price).sort((a,b) => a-b);
            
            console.log(`   Puts: ${puts.length} contracts`);
            console.log(`   Put strikes: ${putStrikes[0]} to ${putStrikes[putStrikes.length-1]}`);
            console.log(`   Calls: ${calls.length} contracts`);
            console.log(`   Call strikes: ${callStrikes[0]} to ${callStrikes[callStrikes.length-1]}`);
            
            // Check puts near current price (666)
            const putsNearMoney = puts.filter(p => p.details.strike_price >= 600);
            console.log(`   Puts >= 600: ${putsNearMoney.length}`);
            putsNearMoney.forEach(p => {
                console.log(`      Strike ${p.details.strike_price}: OI=${p.open_interest}, Vol=${p.session?.volume || 0}`);
            });
        }
        
        console.log('\n' + '='.repeat(60));
        
        // Test 2: Polygon contracts API to see all available strikes
        console.log('📊 TEST 2: Polygon Reference Contracts API (all available)');
        const contractsUrl = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&contract_type=put&expiration_date=${expiration}&limit=1000&apikey=${apiKey}`;
        console.log(`URL: ${contractsUrl}`);
        
        const contractsResponse = await fetch(contractsUrl);
        const contractsData = await contractsResponse.json();
        
        if (contractsData.status === 'OK' && contractsData.results) {
            const strikes = contractsData.results.map(c => c.strike_price).sort((a,b) => a-b);
            console.log(`   Available put contracts: ${contractsData.results.length}`);
            console.log(`   Strike range: ${strikes[0]} to ${strikes[strikes.length-1]}`);
            
            // Check what strikes are available near current price
            const nearMoney = strikes.filter(s => s >= 600);
            console.log(`   Strikes >= 600: ${nearMoney.length}`);
            console.log(`   High strikes: ${nearMoney.slice(-20).join(', ')}`);
        }
        
        console.log('\n' + '='.repeat(60));
        
        // Test 3: Our API
        console.log('📊 TEST 3: Our API wrapper');
        const ourResponse = await fetch(`http://localhost:3000/api/options-chain?symbol=${ticker}&expiration=${expiration}`);
        const ourData = await ourResponse.json();
        
        if (ourData.success && ourData.data && ourData.data[expiration]) {
            const expData = ourData.data[expiration];
            const putStrikes = Object.keys(expData.puts || {}).map(s => parseFloat(s)).sort((a,b) => a-b);
            const callStrikes = Object.keys(expData.calls || {}).map(s => parseFloat(s)).sort((a,b) => a-b);
            
            console.log(`   Puts: ${putStrikes.length} strikes`);
            console.log(`   Put range: ${putStrikes[0]} to ${putStrikes[putStrikes.length-1]}`);
            console.log(`   Calls: ${callStrikes.length} strikes`);
            console.log(`   Call range: ${callStrikes[0]} to ${callStrikes[callStrikes.length-1]}`);
            
            // Check puts near money
            const putsNearMoney = putStrikes.filter(s => s >= 600);
            console.log(`   Puts >= 600: ${putsNearMoney.length}`);
            console.log(`   High put strikes: ${putsNearMoney.join(', ')}`);
        }
        
        console.log('\n📊 CONCLUSION:');
        console.log('The issue is likely that snapshot API only returns contracts with recent activity,');
        console.log('while reference contracts API shows ALL available strikes for trading.');
        console.log('We need to modify our API to get ALL available contracts, not just active ones!');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testPolygonDirectAPI().catch(console.error);