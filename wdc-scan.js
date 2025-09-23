// Quick WDC options scan script
const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

async function scanWDCTrades() {
  const allWDCTrades = [];
  const today = new Date().toISOString().split('T')[0]; // 2025-09-23
  
  console.log('🔍 Scanning WDC options for today\'s trades...');
  
  try {
    // Get all active WDC options contracts
    const contractsResponse = await fetch(
      `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=WDC&active=true&limit=1000&apikey=${POLYGON_API_KEY}`
    );
    
    if (!contractsResponse.ok) {
      console.log('❌ Failed to fetch WDC contracts:', contractsResponse.status);
      return;
    }
    
    const contractsData = await contractsResponse.json();
    console.log(`📊 Found ${contractsData.results?.length || 0} WDC contracts`);
    
    if (!contractsData.results) {
      console.log('❌ No contracts found');
      return;
    }
    
    // Process each WDC contract to find today's trades
    for (const contract of contractsData.results.slice(0, 50)) { // Process first 50 contracts
      const ticker = contract.ticker;
      if (!ticker || !ticker.includes('WDC')) continue;
      
      try {
        // Get trades for this contract today
        const tradesResponse = await fetch(
          `https://api.polygon.io/v3/trades/${ticker}?timestamp.gte=${today}&limit=50&order=desc&apikey=${POLYGON_API_KEY}`
        );
        
        if (!tradesResponse.ok) continue;
        
        const tradesData = await tradesResponse.json();
        if (!tradesData.results || tradesData.results.length === 0) continue;
        
        console.log(`💰 Found ${tradesData.results.length} trades for ${ticker}`);
        
        // Process trades
        for (const trade of tradesData.results) {
          const tradeSize = trade.size;
          const pricePerContract = trade.price;
          const totalPremium = tradeSize * pricePerContract * 100;
          
          // Format timestamp
          const tradeTime = new Date(trade.sip_timestamp / 1000000);
          const timeFormatted = tradeTime.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZone: 'America/New_York'
          });
          
          const wdcTrade = {
            ticker: ticker,
            strike: contract.strike_price || 0,
            expiry: contract.expiration_date || '',
            type: contract.contract_type?.toLowerCase(),
            trade_size: tradeSize,
            premium_per_contract: pricePerContract,
            total_premium: totalPremium,
            time: timeFormatted,
            exchange: trade.exchange
          };
          
          allWDCTrades.push(wdcTrade);
        }
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.log(`⚠️ Error fetching trades for ${ticker}:`, error.message);
        continue;
      }
    }
    
    // Sort by total premium (largest first)
    allWDCTrades.sort((a, b) => b.total_premium - a.total_premium);
    
    console.log(`\n✅ FOUND ${allWDCTrades.length} TOTAL WDC TRADES TODAY:\n`);
    
    allWDCTrades.forEach((trade, index) => {
      console.log(`${index + 1}. ${trade.ticker}`);
      console.log(`   Strike: $${trade.strike} ${trade.type?.toUpperCase()}`);
      console.log(`   Expiry: ${trade.expiry}`);
      console.log(`   Size: ${trade.trade_size} contracts`);
      console.log(`   Premium: $${trade.premium_per_contract.toFixed(2)} per contract`);
      console.log(`   Total Amount: $${trade.total_premium.toLocaleString()}`);
      console.log(`   Time: ${trade.time}`);
      console.log(`   Exchange: ${trade.exchange}`);
      console.log('');
    });
    
    // Summary
    const totalPremium = allWDCTrades.reduce((sum, t) => sum + t.total_premium, 0);
    const calls = allWDCTrades.filter(t => t.type === 'call').length;
    const puts = allWDCTrades.filter(t => t.type === 'put').length;
    
    console.log(`📊 SUMMARY:`);
    console.log(`   Total Trades: ${allWDCTrades.length}`);
    console.log(`   Calls: ${calls}, Puts: ${puts}`);
    console.log(`   Total Premium Volume: $${totalPremium.toLocaleString()}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the scan
scanWDCTrades();