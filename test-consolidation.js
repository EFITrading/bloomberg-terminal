// Test the consolidated API
const testAPI = async () => {
  try {
    console.log('🧪 Testing BlackBoxStocks-style consolidation API...');
    
    const response = await fetch('http://localhost:3000/api/options-flow?minPremium=50000');
    const data = await response.json();
    
    console.log('✅ API Response:', JSON.stringify(data, null, 2));
    
    if (data.success && data.data) {
      console.log(`\n📊 Found ${data.data.length} consolidated trades`);
      
      // Look for SWEEP trades specifically
      const sweeps = data.data.filter(trade => trade.above_ask === true);
      console.log(`🌊 SWEEP trades: ${sweeps.length}`);
      
      // Show first few trades
      data.data.slice(0, 5).forEach((trade, index) => {
        const tradeType = trade.above_ask ? 'SWEEP' : trade.trade_type?.toUpperCase();
        console.log(`${index + 1}. ${trade.underlying_ticker} $${trade.strike} ${trade.type?.toUpperCase()} | ${trade.trade_size}@${trade.premium_per_contract.toFixed(2)} | ${tradeType} | $${(trade.total_premium/1000).toFixed(0)}K`);
      });
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
};

testAPI();