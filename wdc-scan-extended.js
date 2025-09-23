// Enhanced WDC options scan script - check last 3 days
const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

async function scanWDCTradesExtended() {
  const allWDCTrades = [];
  
  // Check last 3 days
  const dates = [];
  for (let i = 0; i < 3; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    dates.push(date.toISOString().split('T')[0]);
  }
  
  console.log(`🔍 Scanning WDC options for trades in last 3 days: ${dates.join(', ')}`);
  
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
    
    // Check a sample of contracts for trades
    const sampleContracts = contractsData.results.slice(0, 20); // Test first 20
    
    for (const contract of sampleContracts) {
      const ticker = contract.ticker;
      if (!ticker || !ticker.includes('WDC')) continue;
      
      console.log(`🔎 Checking ${ticker} (Strike: ${contract.strike_price}, Expiry: ${contract.expiration_date})`);
      
      try {
        // Check for trades in the last 3 days
        for (const date of dates) {
          const tradesResponse = await fetch(
            `https://api.polygon.io/v3/trades/${ticker}?timestamp.gte=${date}&limit=50&order=desc&apikey=${POLYGON_API_KEY}`
          );
          
          if (!tradesResponse.ok) {
            console.log(`  ⚠️ ${date}: API error ${tradesResponse.status}`);
            continue;
          }
          
          const tradesData = await tradesResponse.json();
          if (!tradesData.results || tradesData.results.length === 0) {
            console.log(`  📅 ${date}: No trades`);
            continue;
          }
          
          console.log(`  💰 ${date}: Found ${tradesData.results.length} trades!`);
          
          // Process trades
          for (const trade of tradesData.results) {
            const tradeSize = trade.size;
            const pricePerContract = trade.price;
            const totalPremium = tradeSize * pricePerContract * 100;
            
            // Format timestamp
            const tradeTime = new Date(trade.sip_timestamp / 1000000);
            const timeFormatted = tradeTime.toLocaleString('en-US', {
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
              date: date,
              exchange: trade.exchange,
              conditions: trade.conditions || []
            };
            
            allWDCTrades.push(wdcTrade);
          }
          
          // Delay between API calls
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
      } catch (error) {
        console.log(`  ❌ Error for ${ticker}:`, error.message);
        continue;
      }
    }
    
    // Sort by total premium (largest first)
    allWDCTrades.sort((a, b) => b.total_premium - a.total_premium);
    
    console.log(`\n✅ FOUND ${allWDCTrades.length} TOTAL WDC TRADES IN LAST 3 DAYS:\n`);
    
    if (allWDCTrades.length === 0) {
      console.log('❌ No WDC options trades found in the last 3 days.');
      console.log('This could mean:');
      console.log('1. Very low options activity on WDC');
      console.log('2. API access limitations');
      console.log('3. Date/time formatting issues');
      return;
    }
    
    allWDCTrades.forEach((trade, index) => {
      console.log(`${index + 1}. ${trade.ticker}`);
      console.log(`   Date: ${trade.date}`);
      console.log(`   Time: ${trade.time}`);
      console.log(`   Strike: $${trade.strike} ${trade.type?.toUpperCase()}`);
      console.log(`   Expiry: ${trade.expiry}`);
      console.log(`   Size: ${trade.trade_size} contracts`);
      console.log(`   Premium: $${trade.premium_per_contract.toFixed(2)} per contract`);
      console.log(`   Total Amount: $${trade.total_premium.toLocaleString()}`);
      console.log(`   Exchange: ${trade.exchange}`);
      console.log(`   Conditions: ${trade.conditions.join(', ')}`);
      console.log('');
    });
    
    // Summary by date
    const summary = {};
    dates.forEach(date => {
      const dayTrades = allWDCTrades.filter(t => t.date === date);
      summary[date] = {
        trades: dayTrades.length,
        totalPremium: dayTrades.reduce((sum, t) => sum + t.total_premium, 0),
        calls: dayTrades.filter(t => t.type === 'call').length,
        puts: dayTrades.filter(t => t.type === 'put').length
      };
    });
    
    console.log(`📊 DAILY SUMMARY:`);
    Object.entries(summary).forEach(([date, stats]) => {
      console.log(`   ${date}: ${stats.trades} trades, $${stats.totalPremium.toLocaleString()} premium, ${stats.calls} calls, ${stats.puts} puts`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the scan
scanWDCTradesExtended();