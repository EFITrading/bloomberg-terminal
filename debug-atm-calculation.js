console.log('🔍 Debugging ATM Strike Calculation for SPY 10/17');

async function testATMCalculation() {
    try {
        // Test the current price endpoint
        const priceResponse = await fetch('http://localhost:3000/api/historical-data?symbol=SPY&startDate=2025-09-20&endDate=2025-09-21');
        const priceData = await priceResponse.json();
        console.log('📊 Current Price Data:', {
            success: priceData.success,
            dataPoints: priceData.data?.length || 0,
            latestPrice: priceData.data?.[0]?.close || 'N/A',
            latestDate: priceData.data?.[0]?.date || 'N/A'
        });

        // Test the options chain endpoint
        const optionsResponse = await fetch('http://localhost:3000/api/options-chain?symbol=SPY&expiration=2025-10-17');
        const optionsData = await optionsResponse.json();
        
        console.log('📈 Options Data:', {
            success: optionsData.success,
            currentPrice: optionsData.currentPrice,
            hasData: optionsData.hasData,
            hasExpiration: optionsData.hasExpiration
        });

        if (optionsData.success && optionsData.data) {
            const { puts, calls } = optionsData.data;
            
            // Find all available strikes
            const putStrikes = Object.keys(puts || {}).map(s => parseFloat(s)).sort((a, b) => a - b);
            const callStrikes = Object.keys(calls || {}).map(s => parseFloat(s)).sort((a, b) => a - b);
            const allStrikes = [...new Set([...putStrikes, ...callStrikes])].sort((a, b) => a - b);
            
            console.log('🎯 Strike Analysis:');
            console.log(`   Available strikes: ${allStrikes.length}`);
            console.log(`   Strike range: $${allStrikes[0]} - $${allStrikes[allStrikes.length - 1]}`);
            console.log(`   Current price: $${optionsData.currentPrice}`);
            
            // Calculate ATM strike manually
            const currentPrice = optionsData.currentPrice;
            let atmStrike = allStrikes[0];
            let minDiff = Math.abs(currentPrice - atmStrike);
            
            for (const strike of allStrikes) {
                const diff = Math.abs(currentPrice - strike);
                if (diff < minDiff) {
                    minDiff = diff;
                    atmStrike = strike;
                }
            }
            
            console.log(`🎯 Manual ATM Calculation:`);
            console.log(`   Current Price: $${currentPrice}`);
            console.log(`   Closest Strike: $${atmStrike}`);
            console.log(`   Difference: $${minDiff}`);
            
            // Check strikes around current price
            console.log('\n🔍 Strikes within $20 of current price:');
            const nearbyStrikes = allStrikes.filter(strike => 
                Math.abs(strike - currentPrice) <= 20
            ).sort((a, b) => Math.abs(a - currentPrice) - Math.abs(b - currentPrice));
            
            for (const strike of nearbyStrikes.slice(0, 10)) {
                const putOI = puts?.[strike]?.openInterest || 0;
                const callOI = calls?.[strike]?.openInterest || 0;
                const putBid = puts?.[strike]?.bid;
                const putAsk = puts?.[strike]?.ask;
                const callBid = calls?.[strike]?.bid;
                const callAsk = calls?.[strike]?.ask;
                
                console.log(`   $${strike}: PUT OI=${putOI}, Bid=${putBid}, Ask=${putAsk} | CALL OI=${callOI}, Bid=${callBid}, Ask=${callAsk}`);
            }
            
            // Check if we have valid pricing data around ATM
            const atmPut = puts?.[atmStrike];
            const atmCall = calls?.[atmStrike];
            
            console.log('\n📊 ATM Option Details:');
            console.log(`   ATM Strike: $${atmStrike}`);
            console.log(`   PUT: OI=${atmPut?.openInterest || 0}, Bid=${atmPut?.bid}, Ask=${atmPut?.ask}, Mid=${atmPut?.bid && atmPut?.ask ? (atmPut.bid + atmPut.ask) / 2 : 'N/A'}`);
            console.log(`   CALL: OI=${atmCall?.openInterest || 0}, Bid=${atmCall?.bid}, Ask=${atmCall?.ask}, Mid=${atmCall?.bid && atmCall?.ask ? (atmCall.bid + atmCall.ask) / 2 : 'N/A'}`);
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testATMCalculation();