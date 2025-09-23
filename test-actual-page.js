const fetch = require('node-fetch');

async function testActualPageData() {
    console.log('🧪 Testing what the actual page receives vs API...\n');
    
    try {
        // Test the exact same call the page makes
        console.log('📊 Testing: ?ticker=SPY (what page initially loads)');
        const response1 = await fetch('http://localhost:3000/api/options-chain?ticker=SPY');
        const data1 = await response1.json();
        
        if (data1.success && data1.data && data1.data['2025-09-26']) {
            const exp1 = data1.data['2025-09-26'];
            console.log(`   ?ticker=SPY → Puts: ${Object.keys(exp1.puts || {}).length}, Calls: ${Object.keys(exp1.calls || {}).length}`);
            
            const putStrikes1 = Object.keys(exp1.puts || {}).map(s => parseFloat(s)).sort((a,b) => a-b);
            if (putStrikes1.length > 0) {
                console.log(`   Put range: ${putStrikes1[0]} to ${putStrikes1[putStrikes1.length-1]}`);
            } else {
                console.log('   ❌ NO PUTS FOUND!');
            }
        } else {
            console.log('   ❌ No data for 2025-09-26');
        }
        
        console.log('\n📊 Testing: ?symbol=SPY&expiration=2025-09-26 (fixed endpoint)');
        const response2 = await fetch('http://localhost:3000/api/options-chain?symbol=SPY&expiration=2025-09-26');
        const data2 = await response2.json();
        
        if (data2.success && data2.data && data2.data['2025-09-26']) {
            const exp2 = data2.data['2025-09-26'];
            console.log(`   ?symbol=SPY&expiration=2025-09-26 → Puts: ${Object.keys(exp2.puts || {}).length}, Calls: ${Object.keys(exp2.calls || {}).length}`);
            
            const putStrikes2 = Object.keys(exp2.puts || {}).map(s => parseFloat(s)).sort((a,b) => a-b);
            if (putStrikes2.length > 0) {
                console.log(`   Put range: ${putStrikes2[0]} to ${putStrikes2[putStrikes2.length-1]}`);
            } else {
                console.log('   ❌ NO PUTS FOUND!');
            }
        } else {
            console.log('   ❌ No data for 2025-09-26');
        }
        
        console.log('\n📊 DIAGNOSIS:');
        const puts1 = Object.keys(data1.data?.['2025-09-26']?.puts || {}).length;
        const puts2 = Object.keys(data2.data?.['2025-09-26']?.puts || {}).length;
        
        if (puts1 === 0 && puts2 > 0) {
            console.log('❌ PROBLEM: The page uses ?ticker= endpoint which returns NO PUTS');
            console.log('✅ SOLUTION: Page needs to use ?symbol=&expiration= endpoint');
        } else if (puts1 > 0 && puts2 > 0) {
            console.log('✅ Both endpoints return puts - issue might be in chart rendering');
        } else {
            console.log('❌ Both endpoints have issues with puts');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testActualPageData().catch(console.error);