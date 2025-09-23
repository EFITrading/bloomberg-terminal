// Comprehensive WDC scan - check ALL expiration dates and more contracts
const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

async function scanAllWDCActivity() {
  const allWDCTrades = [];
  
  console.log('🔍 COMPREHENSIVE WDC OPTIONS SCAN - ALL EXPIRATIONS');
  
  try {
    // Get ALL WDC contracts with pagination
    let nextUrl = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=WDC&active=true&limit=1000&apikey=${POLYGON_API_KEY}`;
    let totalContracts = 0;
    let checkedContracts = 0;
    
    while (nextUrl && totalContracts < 10000) { // Reasonable limit
      
      const contractsResponse = await fetch(nextUrl);
      if (!contractsResponse.ok) {
        console.log('❌ Failed to fetch contracts:', contractsResponse.status);
        break;
      }
      
      const contractsData = await contractsResponse.json();
      if (!contractsData.results) break;
      
      totalContracts += contractsData.results.length;
      console.log(`📊 Processing batch: ${contractsData.results.length} contracts (Total: ${totalContracts})`);
      
      // Process this batch of contracts
      for (const contract of contractsData.results) {
        const ticker = contract.ticker;
        if (!ticker || !ticker.includes('WDC')) continue;
        
        checkedContracts++;
        
        // Check today only (but more thoroughly)
        const today = new Date().toISOString().split('T')[0];
        
        try {
          const tradesResponse = await fetch(
            `https://api.polygon.io/v3/trades/${ticker}?timestamp.gte=${today}&limit=100&order=desc&apikey=${POLYGON_API_KEY}`
          );
          
          if (!tradesResponse.ok) continue;
          
          const tradesData = await tradesResponse.json();
          if (!tradesData.results || tradesData.results.length === 0) continue;
          
          console.log(`💰 ${ticker}: Found ${tradesData.results.length} trades today!`);
          
          // Process ALL trades for this contract
          for (const trade of tradesData.results) {
            const tradeSize = trade.size;
            const pricePerContract = trade.price;
            const totalPremium = tradeSize * pricePerContract * 100;
            
            const tradeTime = new Date(trade.sip_timestamp / 1000000);
            const timeFormatted = tradeTime.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              timeZone: 'America/New_York'
            });
            
            // Determine trade classification
            let tradeType = 'regular';
            if (totalPremium >= 1000000) tradeType = 'whale';
            else if (totalPremium >= 500000) tradeType = 'unusual';
            else if (totalPremium >= 100000) tradeType = 'block';
            else if (tradeSize >= 100) tradeType = 'sweep';
            
            const wdcTrade = {
              ticker: ticker,
              strike: contract.strike_price || 0,
              expiry: contract.expiration_date || '',
              type: contract.contract_type?.toLowerCase(),
              trade_size: tradeSize,
              premium_per_contract: pricePerContract,
              total_premium: totalPremium,
              time: timeFormatted,
              exchange: trade.exchange,
              conditions: trade.conditions || [],
              trade_type: tradeType,
              timestamp: trade.sip_timestamp
            };
            
            allWDCTrades.push(wdcTrade);
          }
          
        } catch (error) {
          // Skip individual contract errors
          continue;
        }
        
        // Rate limiting
        if (checkedContracts % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      // Get next page
      nextUrl = contractsData.next_url ? `${contractsData.next_url}&apikey=${POLYGON_API_KEY}` : null;
      
      // If we found trades, process a few more pages
      if (allWDCTrades.length > 0 && totalContracts > 3000) {
        console.log(`🎯 Found ${allWDCTrades.length} trades so far, processing a few more batches...`);
      }
    }
    
    console.log(`\n📊 Checked ${checkedContracts} contracts total`);
    
    // Sort by time (most recent first)
    allWDCTrades.sort((a, b) => b.timestamp - a.timestamp);
    
    console.log(`\n✅ FOUND ${allWDCTrades.length} TOTAL WDC TRADES TODAY (${new Date().toISOString().split('T')[0]}):\n`);
    
    if (allWDCTrades.length === 0) {
      console.log('❌ No WDC options trades found today.');
      console.log('\nPossible reasons:');
      console.log('1. Very light options activity on WDC today');
      console.log('2. Trades happened but API has delays');
      console.log('3. Most activity is in different expiration months');
      
      // Show what expirations are available
      console.log('\n📅 Available WDC expirations to check manually:');
      const expirations = [...new Set(contractsData?.results?.map(c => c.expiration_date).filter(Boolean))];
      expirations.slice(0, 10).forEach(exp => console.log(`   ${exp}`));
      
      return;
    }
    
    // Show all trades
    allWDCTrades.forEach((trade, index) => {
      console.log(`${index + 1}. ${trade.ticker} [${trade.trade_type.toUpperCase()}]`);
      console.log(`   Time: ${trade.time}`);
      console.log(`   Strike: $${trade.strike} ${trade.type?.toUpperCase()}`);
      console.log(`   Expiry: ${trade.expiry}`);
      console.log(`   Size: ${trade.trade_size} contracts`);
      console.log(`   Premium: $${trade.premium_per_contract.toFixed(2)} per contract`);
      console.log(`   Total Amount: $${trade.total_premium.toLocaleString()}`);
      console.log(`   Exchange: ${trade.exchange}`);
      console.log(`   Conditions: [${trade.conditions.join(', ')}]`);
      console.log('');
    });
    
    // Summary statistics
    const totalPremium = allWDCTrades.reduce((sum, t) => sum + t.total_premium, 0);
    const calls = allWDCTrades.filter(t => t.type === 'call').length;
    const puts = allWDCTrades.filter(t => t.type === 'put').length;
    
    const whales = allWDCTrades.filter(t => t.trade_type === 'whale').length;
    const unusual = allWDCTrades.filter(t => t.trade_type === 'unusual').length;
    const blocks = allWDCTrades.filter(t => t.trade_type === 'block').length;
    const sweeps = allWDCTrades.filter(t => t.trade_type === 'sweep').length;
    const regular = allWDCTrades.filter(t => t.trade_type === 'regular').length;
    
    console.log(`📊 COMPREHENSIVE SUMMARY:`);
    console.log(`   Total Trades: ${allWDCTrades.length}`);
    console.log(`   Calls: ${calls}, Puts: ${puts}`);
    console.log(`   Total Premium Volume: $${totalPremium.toLocaleString()}`);
    console.log(`   \nTrade Classifications:`);
    console.log(`   🐋 Whale (>$1M): ${whales}`);
    console.log(`   🔥 Unusual (>$500K): ${unusual}`);
    console.log(`   📦 Block (>$100K): ${blocks}`);
    console.log(`   🌊 Sweep (>100 size): ${sweeps}`);
    console.log(`   📈 Regular: ${regular}`);
    
    // Show expirations with activity
    const activeExpirations = [...new Set(allWDCTrades.map(t => t.expiry))];
    console.log(`   \n📅 Active Expirations: ${activeExpirations.join(', ')}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the comprehensive scan
scanAllWDCActivity();