// WDC 9/26 Expiration Scan
const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

async function scanWDC926Expiration() {
  const wdcTrades = [];
  const targetExpiry = '2025-09-26';
  
  console.log(`🎯 Scanning WDC options with ${targetExpiry} expiration for trades...`);
  
  try {
    // Get WDC contracts expiring 9/26
    const contractsResponse = await fetch(
      `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=WDC&expiration_date=${targetExpiry}&active=true&limit=1000&apikey=${POLYGON_API_KEY}`
    );
    
    if (!contractsResponse.ok) {
      console.log('❌ Failed to fetch WDC 9/26 contracts:', contractsResponse.status);
      return;
    }
    
    const contractsData = await contractsResponse.json();
    console.log(`📊 Found ${contractsData.results?.length || 0} WDC contracts expiring ${targetExpiry}`);
    
    if (!contractsData.results || contractsData.results.length === 0) {
      console.log('❌ No 9/26 expiration contracts found for WDC');
      return;
    }
    
    // Check trades for last 3 days on these contracts
    const dates = [];
    for (let i = 0; i < 3; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      dates.push(date.toISOString().split('T')[0]);
    }
    
    console.log(`📅 Checking trades for dates: ${dates.join(', ')}\n`);
    
    // Process each contract
    for (const contract of contractsData.results) {
      const ticker = contract.ticker;
      const strike = contract.strike_price;
      const optionType = contract.contract_type;
      
      console.log(`🔍 ${ticker} ($${strike} ${optionType})`);
      
      // Check each date
      for (const date of dates) {
        try {
          const tradesResponse = await fetch(
            `https://api.polygon.io/v3/trades/${ticker}?timestamp.gte=${date}&limit=100&order=desc&apikey=${POLYGON_API_KEY}`
          );
          
          if (!tradesResponse.ok) continue;
          
          const tradesData = await tradesResponse.json();
          if (!tradesData.results || tradesData.results.length === 0) {
            console.log(`   ${date}: No trades`);
            continue;
          }
          
          console.log(`   ${date}: 💰 ${tradesData.results.length} trades found!`);
          
          // Process each trade
          for (const trade of tradesData.results) {
            const tradeSize = trade.size;
            const pricePerContract = trade.price;
            const totalPremium = tradeSize * pricePerContract * 100;
            
            // Format time
            const tradeTime = new Date(trade.sip_timestamp / 1000000);
            const timeFormatted = tradeTime.toLocaleString('en-US', {
              timeZone: 'America/New_York',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            });
            
            // Trade classification
            let tradeType = 'regular';
            if (totalPremium >= 1000000) tradeType = 'whale';
            else if (totalPremium >= 500000) tradeType = 'unusual';
            else if (totalPremium >= 100000) tradeType = 'block';
            else if (tradeSize >= 100) tradeType = 'sweep';
            
            const wdcTrade = {
              ticker: ticker,
              strike: strike,
              expiry: targetExpiry,
              type: optionType?.toLowerCase(),
              trade_size: tradeSize,
              premium_per_contract: pricePerContract,
              total_premium: totalPremium,
              time: timeFormatted,
              date: date,
              exchange: trade.exchange,
              conditions: trade.conditions || [],
              trade_type: tradeType,
              timestamp: trade.sip_timestamp
            };
            
            wdcTrades.push(wdcTrade);
          }
          
        } catch (error) {
          console.log(`   ${date}: Error - ${error.message}`);
          continue;
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      console.log(''); // Space between contracts
    }
    
    // Sort by total premium (largest first)
    wdcTrades.sort((a, b) => b.total_premium - a.total_premium);
    
    console.log(`\n🎯 FOUND ${wdcTrades.length} WDC TRADES FOR 9/26 EXPIRATION:\n`);
    
    if (wdcTrades.length === 0) {
      console.log('❌ No trades found for WDC 9/26 expiration in the last 3 days');
      console.log('\nAvailable strikes for 9/26:');
      contractsData.results.forEach(contract => {
        console.log(`   $${contract.strike_price} ${contract.contract_type} - ${contract.ticker}`);
      });
      return;
    }
    
    // Display all trades
    wdcTrades.forEach((trade, index) => {
      const typeIndicator = trade.trade_type === 'whale' ? '🐋' : 
                           trade.trade_type === 'unusual' ? '🔥' : 
                           trade.trade_type === 'block' ? '📦' : 
                           trade.trade_type === 'sweep' ? '🌊' : '📈';
      
      console.log(`${index + 1}. ${typeIndicator} ${trade.ticker}`);
      console.log(`   Date/Time: ${trade.time}`);
      console.log(`   Strike: $${trade.strike} ${trade.type?.toUpperCase()}`);
      console.log(`   Expiry: ${trade.expiry} (3 days from now)`);
      console.log(`   Size: ${trade.trade_size} contracts`);
      console.log(`   Premium: $${trade.premium_per_contract.toFixed(2)} per contract`);
      console.log(`   Total Amount: $${trade.total_premium.toLocaleString()}`);
      console.log(`   Exchange: ${trade.exchange}`);
      console.log(`   Trade Type: ${trade.trade_type.toUpperCase()}`);
      console.log(`   Conditions: [${trade.conditions.join(', ')}]`);
      console.log('');
    });
    
    // Summary
    const totalPremium = wdcTrades.reduce((sum, t) => sum + t.total_premium, 0);
    const calls = wdcTrades.filter(t => t.type === 'call').length;
    const puts = wdcTrades.filter(t => t.type === 'put').length;
    
    const whales = wdcTrades.filter(t => t.trade_type === 'whale').length;
    const unusual = wdcTrades.filter(t => t.trade_type === 'unusual').length;
    const blocks = wdcTrades.filter(t => t.trade_type === 'block').length;
    const sweeps = wdcTrades.filter(t => t.trade_type === 'sweep').length;
    const regular = wdcTrades.filter(t => t.trade_type === 'regular').length;
    
    console.log(`📊 WDC 9/26 EXPIRATION SUMMARY:`);
    console.log(`   Total Trades: ${wdcTrades.length}`);
    console.log(`   Calls: ${calls}, Puts: ${puts}`);
    console.log(`   Total Premium Volume: $${totalPremium.toLocaleString()}`);
    console.log(`   Average Trade Size: ${Math.round(wdcTrades.reduce((sum, t) => sum + t.trade_size, 0) / wdcTrades.length)} contracts`);
    console.log(`   \n🏷️ Trade Classifications:`);
    console.log(`   🐋 Whale (>$1M): ${whales}`);
    console.log(`   🔥 Unusual (>$500K): ${unusual}`);
    console.log(`   📦 Block (>$100K): ${blocks}`);
    console.log(`   🌊 Sweep (>100 size): ${sweeps}`);
    console.log(`   📈 Regular: ${regular}`);
    
    // Show strike distribution
    const strikeActivity = {};
    wdcTrades.forEach(trade => {
      const key = `$${trade.strike} ${trade.type?.toUpperCase()}`;
      strikeActivity[key] = (strikeActivity[key] || 0) + trade.trade_size;
    });
    
    console.log(`   \n📊 Activity by Strike:`);
    Object.entries(strikeActivity)
      .sort((a, b) => b[1] - a[1])
      .forEach(([strike, volume]) => {
        console.log(`   ${strike}: ${volume} contracts`);
      });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the 9/26 expiration scan
scanWDC926Expiration();