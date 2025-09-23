// Find specific WDC $111 strike trade: 543 contracts @ $1.86
const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

async function findSpecificWDCTrade() {
  console.log('🔍 Searching for WDC $111 strike trade: 543 contracts @ $1.86...');
  
  const targetSize = 543;
  const targetPremium = 1.86;
  const targetStrike = 111;
  const today = new Date().toISOString().split('T')[0]; // 2025-09-23
  
  try {
    // Get WDC $111 contracts (both calls and puts)
    const contractsResponse = await fetch(
      `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=WDC&strike_price=${targetStrike}&active=true&limit=100&apikey=${POLYGON_API_KEY}`
    );
    
    if (!contractsResponse.ok) {
      console.log('❌ Failed to fetch $111 contracts:', contractsResponse.status);
      return;
    }
    
    const contractsData = await contractsResponse.json();
    console.log(`📊 Found ${contractsData.results?.length || 0} WDC $111 contracts`);
    
    if (!contractsData.results) {
      console.log('❌ No $111 contracts found');
      return;
    }
    
    const matchingTrades = [];
    
    // Check each $111 contract
    for (const contract of contractsData.results) {
      const ticker = contract.ticker;
      const strike = contract.strike_price;
      const expiry = contract.expiration_date;
      const type = contract.contract_type;
      
      console.log(`🔎 Checking ${ticker} ($${strike} ${type}, exp: ${expiry})`);
      
      try {
        // Get today's trades for this contract
        const tradesResponse = await fetch(
          `https://api.polygon.io/v3/trades/${ticker}?timestamp.gte=${today}&limit=500&order=desc&apikey=${POLYGON_API_KEY}`
        );
        
        if (!tradesResponse.ok) {
          console.log(`  ❌ API error: ${tradesResponse.status}`);
          continue;
        }
        
        const tradesData = await tradesResponse.json();
        if (!tradesData.results || tradesData.results.length === 0) {
          console.log(`  📅 No trades today`);
          continue;
        }
        
        console.log(`  💰 Found ${tradesData.results.length} trades today`);
        
        // Look for the specific trade
        for (const trade of tradesData.results) {
          const tradeSize = trade.size;
          const pricePerContract = trade.price;
          const totalPremium = tradeSize * pricePerContract * 100;
          
          // Check if this matches our target trade
          const sizeMatch = tradeSize === targetSize;
          const priceMatch = Math.abs(pricePerContract - targetPremium) < 0.01; // Allow small variance
          const premiumMatch = Math.abs(totalPremium - 101000) < 1000; // Allow $1k variance
          
          if (sizeMatch || priceMatch || premiumMatch) {
            const tradeTime = new Date(trade.sip_timestamp / 1000000);
            const timeFormatted = tradeTime.toLocaleString('en-US', {
              timeZone: 'America/New_York',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            });
            
            const matchingTrade = {
              ticker: ticker,
              strike: strike,
              expiry: expiry,
              type: type?.toLowerCase(),
              trade_size: tradeSize,
              premium_per_contract: pricePerContract,
              total_premium: totalPremium,
              time: timeFormatted,
              exchange: trade.exchange,
              conditions: trade.conditions || [],
              timestamp: trade.sip_timestamp,
              size_match: sizeMatch,
              price_match: priceMatch,
              premium_match: premiumMatch
            };
            
            matchingTrades.push(matchingTrade);
            
            console.log(`  🎯 POTENTIAL MATCH FOUND!`);
            console.log(`     Size: ${tradeSize} (target: ${targetSize}) ${sizeMatch ? '✅' : '❌'}`);
            console.log(`     Premium: $${pricePerContract} (target: $${targetPremium}) ${priceMatch ? '✅' : '❌'}`);
            console.log(`     Total: $${totalPremium.toLocaleString()} (target: ~$101K) ${premiumMatch ? '✅' : '❌'}`);
            console.log(`     Time: ${timeFormatted}`);
          }
        }
        
      } catch (error) {
        console.log(`  ❌ Error: ${error.message}`);
        continue;
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`\n🔍 SEARCH RESULTS FOR WDC $111 STRIKE TRADE (543 @ $1.86):\n`);
    
    if (matchingTrades.length === 0) {
      console.log('❌ No exact matches found for 543 contracts @ $1.86');
      console.log('\nPossible reasons:');
      console.log('1. Trade occurred on a different date');
      console.log('2. Different strike price or expiration');
      console.log('3. Price or size slightly different');
      console.log('4. Trade not yet in API data');
      
      // Show all $111 trades from today for reference
      console.log('\n📊 All $111 trades from today for reference:');
      return;
    }
    
    // Sort by best match (most criteria matched)
    matchingTrades.sort((a, b) => {
      const aScore = (a.size_match ? 1 : 0) + (a.price_match ? 1 : 0) + (a.premium_match ? 1 : 0);
      const bScore = (b.size_match ? 1 : 0) + (b.price_match ? 1 : 0) + (b.premium_match ? 1 : 0);
      return bScore - aScore;
    });
    
    matchingTrades.forEach((trade, index) => {
      const matchScore = (trade.size_match ? 1 : 0) + (trade.price_match ? 1 : 0) + (trade.premium_match ? 1 : 0);
      
      console.log(`${index + 1}. 🎯 ${trade.ticker} [Match Score: ${matchScore}/3]`);
      console.log(`   Time: ${trade.time}`);
      console.log(`   Strike: $${trade.strike} ${trade.type?.toUpperCase()}`);
      console.log(`   Expiry: ${trade.expiry}`);
      console.log(`   Size: ${trade.trade_size} contracts ${trade.size_match ? '✅ EXACT' : ''}`);
      console.log(`   Premium: $${trade.premium_per_contract.toFixed(2)} per contract ${trade.price_match ? '✅ EXACT' : ''}`);
      console.log(`   Total Amount: $${trade.total_premium.toLocaleString()} ${trade.premium_match ? '✅ ~$101K' : ''}`);
      console.log(`   Exchange: ${trade.exchange}`);
      console.log(`   Conditions: [${trade.conditions.join(', ')}]`);
      console.log('');
    });
    
    // Show the best match details
    if (matchingTrades.length > 0) {
      const bestMatch = matchingTrades[0];
      const exactMatch = bestMatch.size_match && bestMatch.price_match && bestMatch.premium_match;
      
      console.log(`🏆 BEST MATCH${exactMatch ? ' (EXACT)' : ''}:`);
      console.log(`   ${bestMatch.ticker} - $${bestMatch.strike} ${bestMatch.type?.toUpperCase()}`);
      console.log(`   ${bestMatch.trade_size} contracts @ $${bestMatch.premium_per_contract} = $${bestMatch.total_premium.toLocaleString()}`);
      console.log(`   Time: ${bestMatch.time}`);
      console.log(`   Expiry: ${bestMatch.expiry}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the specific trade search
findSpecificWDCTrade();