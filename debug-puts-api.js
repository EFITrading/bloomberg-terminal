const fetch = require('node-fetch');

async function testPutsAPI() {
    console.log('🔍 Testing API for puts data issues...\n');
    
    const testCases = [
        { ticker: 'SPY', expiration: '2025-09-26' },
        { ticker: 'SPY', expiration: '2025-10-17' },
        { ticker: 'AAPL', expiration: '2025-09-26' },
        { ticker: 'AAPL', expiration: '2025-10-17' }
    ];
    
    for (const test of testCases) {
        console.log(`📊 Testing ${test.ticker} ${test.expiration}:`);
        
        try {
            // Test both API endpoints
            const response1 = await fetch(`http://localhost:3000/api/options-chain?ticker=${test.ticker}`);
            const response2 = await fetch(`http://localhost:3000/api/options-chain?symbol=${test.ticker}&expiration=${test.expiration}`);
            
            const result1 = await response1.json();
            const result2 = await response2.json();
            
            console.log(`   🔗 API 1 (?ticker=${test.ticker}):`);
            if (result1.success && result1.data && result1.data[test.expiration]) {
                const exp1 = result1.data[test.expiration];
                const callCount1 = Object.keys(exp1.calls || {}).length;
                const putCount1 = Object.keys(exp1.puts || {}).length;
                console.log(`      Calls: ${callCount1}, Puts: ${putCount1}`);
                
                if (putCount1 > 0) {
                    const putStrikes = Object.keys(exp1.puts).map(s => parseFloat(s)).sort((a,b) => a-b);
                    console.log(`      Put strikes: ${putStrikes[0]} to ${putStrikes[putStrikes.length-1]}`);
                    
                    // Check a few put entries for data quality
                    const midStrike = putStrikes[Math.floor(putStrikes.length/2)];
                    const putData = exp1.puts[midStrike.toString()];
                    console.log(`      Sample put (${midStrike}):`, {
                        bid: putData.bid,
                        ask: putData.ask,
                        open_interest: putData.open_interest || putData.openInterest,
                        volume: putData.volume
                    });
                }
            } else {
                console.log(`      ❌ No data for ${test.expiration}`);
            }
            
            console.log(`   🔗 API 2 (?symbol=${test.ticker}&expiration=${test.expiration}):`);
            if (result2.success && result2.data && result2.data[test.expiration]) {
                const exp2 = result2.data[test.expiration];
                const callCount2 = Object.keys(exp2.calls || {}).length;
                const putCount2 = Object.keys(exp2.puts || {}).length;
                console.log(`      Calls: ${callCount2}, Puts: ${putCount2}`);
                
                if (putCount2 > 0) {
                    const putStrikes = Object.keys(exp2.puts).map(s => parseFloat(s)).sort((a,b) => a-b);
                    console.log(`      Put strikes: ${putStrikes[0]} to ${putStrikes[putStrikes.length-1]}`);
                }
            } else {
                console.log(`      ❌ No data for ${test.expiration}`);
            }
            
            // Compare results
            if (result1.success && result2.success) {
                const puts1 = Object.keys(result1.data?.[test.expiration]?.puts || {}).length;
                const puts2 = Object.keys(result2.data?.[test.expiration]?.puts || {}).length;
                
                if (puts1 !== puts2) {
                    console.log(`   ⚠️  MISMATCH: API 1 has ${puts1} puts, API 2 has ${puts2} puts`);
                } else if (puts1 === 0) {
                    console.log(`   ❌ PROBLEM: Both APIs return 0 puts for ${test.expiration}`);
                } else {
                    console.log(`   ✅ Both APIs return ${puts1} puts`);
                }
            }
            
        } catch (error) {
            console.log(`   ❌ Error: ${error.message}`);
        }
        
        console.log('');
    }
    
    // Test raw Polygon API to see if puts exist there
    console.log('🔍 Testing if the issue is in our Polygon API wrapper...\n');
    await testPolygonDirectly();
}

async function testPolygonDirectly() {
    console.log('📡 Checking what our API wrapper is doing vs Polygon directly...');
    
    // First check what our API files look like
    console.log('   📁 Checking our API implementation...');
    
    try {
        const fs = require('fs');
        const path = require('path');
        
        const apiPath = path.join(__dirname, 'src', 'app', 'api', 'options-chain');
        console.log(`   Looking for API files in: ${apiPath}`);
        
        if (fs.existsSync(apiPath)) {
            const files = fs.readdirSync(apiPath);
            console.log(`   Found API files: ${files.join(', ')}`);
        } else {
            console.log('   ❌ API directory not found, checking alternate locations...');
            
            // Check if we can find the API files
            const possiblePaths = [
                'src/app/api/options-chain/route.ts',
                'src/app/api/options-chain/route.js',
                'pages/api/options-chain.ts',
                'pages/api/options-chain.js'
            ];
            
            for (const p of possiblePaths) {
                if (fs.existsSync(p)) {
                    console.log(`   Found API file: ${p}`);
                    
                    // Read a small sample to see the structure
                    const content = fs.readFileSync(p, 'utf8');
                    const lines = content.split('\n').slice(0, 20);
                    console.log(`   First 20 lines of ${p}:`);
                    lines.forEach((line, i) => console.log(`     ${i+1}: ${line}`));
                    break;
                }
            }
        }
        
    } catch (error) {
        console.log(`   ❌ Error checking API files: ${error.message}`);
    }
}

testPutsAPI().catch(console.error);