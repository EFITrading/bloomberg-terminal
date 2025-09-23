/**
 * Deep dive into Polygon options snapshot data structure
 */

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

async function analyzeOptionsData() {
  console.log('🔬 ANALYZING REAL OPTIONS DATA STRUCTURE');
  console.log('=' .repeat(60));
  
  try {
    // Get current options data for multiple tickers
    const tickers = ['SPY', 'QQQ', 'AAPL'];
    
    for (const ticker of tickers) {
      console.log(`\n📊 ANALYZING ${ticker} OPTIONS`);
      console.log('-'.repeat(40));
      
      const url = `https://api.polygon.io/v3/snapshot/options/${ticker}?limit=20&apikey=${POLYGON_API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        console.log(`✅ Found ${data.results.length} contracts`);
        
        // Analyze first few contracts
        data.results.slice(0, 3).forEach((contract, index) => {
          console.log(`\n📋 Contract ${index + 1}: ${contract.details?.ticker}`);
          console.log(`   Strike: $${contract.details?.strike_price}`);
          console.log(`   Expiry: ${contract.details?.expiration_date}`);
          console.log(`   Type: ${contract.details?.contract_type}`);
          
          // Day data
          if (contract.day) {
            console.log(`   📈 Day Data:`);
            console.log(`      Volume: ${contract.day.volume || 'N/A'}`);
            console.log(`      VWAP: $${contract.day.vwap || 'N/A'}`);
            console.log(`      Open: $${contract.day.open || 'N/A'}`);
            console.log(`      High: $${contract.day.high || 'N/A'}`);
            console.log(`      Low: $${contract.day.low || 'N/A'}`);
            console.log(`      Close: $${contract.day.close || 'N/A'}`);
          }
          
          // Last trade
          if (contract.last_trade) {
            console.log(`   💰 Last Trade:`);
            console.log(`      Price: $${contract.last_trade.price || 'N/A'}`);
            console.log(`      Size: ${contract.last_trade.size || 'N/A'} contracts`);
            console.log(`      Time: ${contract.last_trade.participant_timestamp ? new Date(contract.last_trade.participant_timestamp / 1000000).toLocaleTimeString() : 'N/A'}`);
            console.log(`      Exchange: ${contract.last_trade.exchange || 'N/A'}`);
          }
          
          // Last quote  
          if (contract.last_quote) {
            console.log(`   📊 Last Quote:`);
            console.log(`      Bid: $${contract.last_quote.bid || 'N/A'}`);
            console.log(`      Ask: $${contract.last_quote.ask || 'N/A'}`);
            console.log(`      Bid Size: ${contract.last_quote.bid_size || 'N/A'}`);
            console.log(`      Ask Size: ${contract.last_quote.ask_size || 'N/A'}`);
          }
          
          console.log(`   📈 Open Interest: ${contract.open_interest || 'N/A'}`);
          console.log(`   📊 IV: ${contract.implied_volatility || 'N/A'}`);
          
          // Calculate potential flow metrics
          if (contract.day?.volume && contract.open_interest) {
            const volumeToOI = (contract.day.volume / contract.open_interest).toFixed(2);
            console.log(`   🔥 Volume/OI Ratio: ${volumeToOI}`);
            
            if (contract.last_trade?.price && contract.day?.volume) {
              const premium = contract.last_trade.price * contract.day.volume * 100;
              console.log(`   💵 Daily Premium: $${premium.toLocaleString()}`);
            }
          }
        });
        
        // Summary statistics
        const contracts = data.results;
        const totalVolume = contracts.reduce((sum, c) => sum + (c.day?.volume || 0), 0);
        const avgIV = contracts.reduce((sum, c) => sum + (c.implied_volatility || 0), 0) / contracts.length;
        
        console.log(`\n📊 ${ticker} SUMMARY:`);
        console.log(`   Total Volume: ${totalVolume.toLocaleString()} contracts`);
        console.log(`   Average IV: ${(avgIV * 100).toFixed(1)}%`);
        console.log(`   Contracts with Volume: ${contracts.filter(c => c.day?.volume > 0).length}`);
        console.log(`   High Volume (>1000): ${contracts.filter(c => (c.day?.volume || 0) > 1000).length}`);
        
      } else {
        console.log(`❌ No data for ${ticker}`);
      }
      
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n🎯 FLOW DETECTION POSSIBILITIES:');
    console.log('✅ High Volume Detection: day.volume > threshold');
    console.log('✅ Large Premium: price * volume * 100 > $50k');  
    console.log('✅ Unusual Activity: volume/open_interest > 2.0');
    console.log('✅ IV Spike Detection: implied_volatility > average');
    console.log('✅ Bid/Ask Analysis: compare last_trade.price to bid/ask');
    console.log('✅ Time-based Filtering: recent trades only');
    console.log('✅ Strike Analysis: ITM/OTM based on underlying price');
    
  } catch (error) {
    console.error('❌ Analysis failed:', error);
  }
}

analyzeOptionsData()
  .then(() => console.log('\n✅ Analysis complete'))
  .catch(error => console.error('\n❌ Analysis failed:', error));