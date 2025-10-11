/**
 * SPY Options Flow Test - Using Exact Logic Criteria
 * Date: October 9, 2025
 * 
 * This test file replicates the exact options flow logic being used in the application
 * to verify SPY options flow data using the same criteria:
 * - Only 5% ITM maximum (no deep ITM scanning)
 * - All OTM contracts allowed
 * - Same institutional tier filtering
 * - Today's data only (no 2024 data)
 */

// Configuration
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
const TICKER = 'SPY';
const BASE_URL = 'https://api.polygon.io';

// Helper function to get today's market open timestamp
function getTodaysMarketOpenTimestamp() {
  const today = new Date();
  const marketOpen = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 30, 0);
  return marketOpen.getTime() * 1000; // Convert to microseconds
}

// Helper function to check if trade is from today
function isFromToday(timestamp) {
  const tradeDate = new Date(timestamp / 1000000); // Convert from microseconds
  const today = new Date();
  return tradeDate.toDateString() === today.toDateString();
}

// YOUR EXACT 5% ITM FILTER
function isWithinTradeableRange(strike, spotPrice, contractType) {
  if (spotPrice <= 0) return false;
  
  // YOUR CRITERIA: Only 5% ITM max and all OTM contracts
  if (contractType === 'call') {
    const percentFromATM = (strike - spotPrice) / spotPrice;
    return percentFromATM >= -0.05; // Only 5% ITM max, unlimited OTM
  } else {
    const percentFromATM = (strike - spotPrice) / spotPrice;
    return percentFromATM <= 0.05; // Only 5% ITM max, unlimited OTM
  }
}

// YOUR EXACT INSTITUTIONAL CRITERIA
function passesInstitutionalCriteria(trade) {
  const tradePrice = trade.premium_per_contract;
  const tradeSize = trade.trade_size;
  const totalPremium = trade.total_premium;

  // YOUR EXACT TIER SYSTEM
  const institutionalTiers = [
    // Tier 1: Premium institutional trades
    { name: 'Tier 1: Premium institutional', minPrice: 8.00, minSize: 80 },
    // Tier 2: High-value large volume
    { name: 'Tier 2: High-value large volume', minPrice: 7.00, minSize: 100 },
    // Tier 3: Mid-premium bulk trades
    { name: 'Tier 3: Mid-premium bulk', minPrice: 5.00, minSize: 150 },
    // Tier 4: Moderate premium large volume
    { name: 'Tier 4: Moderate premium large', minPrice: 3.50, minSize: 200 },
    // Tier 5: Lower premium large volume
    { name: 'Tier 5: Lower premium large', minPrice: 2.50, minSize: 200 },
    // Tier 6: Small premium massive volume
    { name: 'Tier 6: Small premium massive', minPrice: 1.00, minSize: 800 },
    // Tier 7: Penny options massive volume
    { name: 'Tier 7: Penny options massive', minPrice: 0.50, minSize: 2000 },
    // Tier 8: Premium bypass (any size if $50K+ total)
    { name: 'Tier 8: Premium bypass', minPrice: 0.01, minSize: 20, minTotal: 50000 }
  ];
  
  const passes = institutionalTiers.some(tier => {
    const passesPrice = tradePrice >= tier.minPrice;
    const passesSize = tradeSize >= tier.minSize;
    const passesTotal = tier.minTotal ? totalPremium >= tier.minTotal : true;
    
    if (passesPrice && passesSize && passesTotal) {
      console.log(`✅ ${trade.ticker}: Passes ${tier.name} - $${tradePrice.toFixed(2)} × ${tradeSize} = $${totalPremium.toFixed(0)}`);
      return true;
    }
    return false;
  });

  return passes;
}

// Get current stock price
async function getCurrentStockPrice(ticker) {
  try {
    const url = `${BASE_URL}/v2/aggs/ticker/${ticker}/prev?adjusted=true&apikey=${POLYGON_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    return data.results?.[0]?.c || 0;
  } catch (error) {
    console.error(`Error getting stock price for ${ticker}:`, error);
    return 0;
  }
}

// Fetch all options contracts with pagination
async function fetchAllContractsPaginated(ticker) {
  const allContracts = [];
  let nextUrl = `${BASE_URL}/v3/reference/options/contracts?underlying_ticker=${ticker}&limit=1000&apikey=${POLYGON_API_KEY}`;
  
  while (nextUrl) {
    try {
      console.log(`📥 Fetching contracts page...`);
      const response = await fetch(nextUrl);
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        allContracts.push(...data.results);
        console.log(`📋 Found ${data.results.length} contracts on this page (total: ${allContracts.length})`);
      }
      
      nextUrl = data.next_url ? `${data.next_url}&apikey=${POLYGON_API_KEY}` : null;
      
      // Rate limiting
      if (nextUrl) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error('Error fetching contracts:', error);
      break;
    }
  }
  
  return allContracts;
}

// Test function for SPY options flow
async function testSPYOptionsFlow() {
  console.log('🚀 TESTING SPY OPTIONS FLOW - EXACT LOGIC CRITERIA');
  console.log('📅 Date: October 9, 2025');
  console.log('⚠️  5% ITM Filter: NO DEEP ITM SCANNING');
  console.log('=========================================');
  
  try {
    // Step 1: Get current SPY price
    console.log('\n🔍 Step 1: Getting current SPY price...');
    const spotPrice = await getCurrentStockPrice(TICKER);
    if (spotPrice <= 0) {
      throw new Error('Could not get SPY current price');
    }
    
    console.log(`💰 SPY Current Price: $${spotPrice.toFixed(2)}`);
    
    // Step 2: Fetch all options contracts
    console.log('\n🔍 Step 2: Fetching all SPY options contracts...');
    const allContracts = await fetchAllContractsPaginated(TICKER);
    console.log(`📋 Total contracts found: ${allContracts.length}`);
    
    // Step 3: Apply 5% ITM filter
    console.log('\n🔍 Step 3: Applying 5% ITM filter...');
    const validContracts = allContracts.filter(contract => {
      const strike = contract.strike_price;
      const contractType = contract.contract_type.toLowerCase();
      
      return isWithinTradeableRange(strike, spotPrice, contractType);
    });
    
    console.log(`✅ Contracts passing 5% ITM filter: ${validContracts.length}`);
    console.log(`❌ Deep ITM contracts filtered out: ${allContracts.length - validContracts.length}`);
    
    // Step 4: Show breakdown by type and expiration
    console.log('\n🔍 Step 4: Contract breakdown...');
    const callContracts = validContracts.filter(c => c.contract_type.toLowerCase() === 'call');
    const putContracts = validContracts.filter(c => c.contract_type.toLowerCase() === 'put');
    
    console.log(`📊 Calls: ${callContracts.length}`);
    console.log(`📊 Puts: ${putContracts.length}`);
    
    // Show expiration breakdown - ALL EXPIRATION DATES
    const expirations = [...new Set(validContracts.map(c => c.expiration_date))].sort();
    console.log(`📅 TOTAL EXPIRATION DATES: ${expirations.length}`);
    console.log(`📅 All Expiration dates: ${expirations.join(', ')}`);
    
    // Detailed breakdown by expiration date
    console.log('\n📊 CONTRACTS BY EXPIRATION DATE:');
    expirations.forEach(expiry => {
      const contractsForExpiry = validContracts.filter(c => c.expiration_date === expiry);
      const calls = contractsForExpiry.filter(c => c.contract_type.toLowerCase() === 'call').length;
      const puts = contractsForExpiry.filter(c => c.contract_type.toLowerCase() === 'put').length;
      console.log(`  ${expiry}: ${contractsForExpiry.length} total (${calls} calls, ${puts} puts)`);
    });
    
    // Step 5: Sample contract analysis across DIFFERENT expiration dates
    console.log('\n🔍 Step 5: Sample contract analysis across ALL expiration dates...');
    
    // Sample from different expiration dates
    const sampleContracts = [];
    expirations.slice(0, 5).forEach(expiry => {
      const contractsForExpiry = validContracts.filter(c => c.expiration_date === expiry);
      sampleContracts.push(...contractsForExpiry.slice(0, 4)); // 4 contracts per expiry
    });
    
    for (const contract of sampleContracts) {
      const strike = contract.strike_price;
      const type = contract.contract_type.toLowerCase();
      const expiry = contract.expiration_date;
      
      // Calculate moneyness
      let percentFromATM;
      let moneyness;
      
      if (type === 'call') {
        percentFromATM = (strike - spotPrice) / spotPrice;
        moneyness = percentFromATM < 0 ? 'ITM' : percentFromATM === 0 ? 'ATM' : 'OTM';
      } else {
        percentFromATM = (strike - spotPrice) / spotPrice;
        moneyness = percentFromATM > 0 ? 'ITM' : percentFromATM === 0 ? 'ATM' : 'OTM';
      }
      
      console.log(`${contract.ticker}: ${type.toUpperCase()} $${strike} ${expiry} - ${moneyness} (${(percentFromATM * 100).toFixed(1)}%)`);
    }
    
    // Step 6: Test snapshot API for recent trades across ALL EXPIRATION DATES
    console.log('\n🔍 Step 6: Testing snapshot API for recent trades across ALL EXPIRATION DATES...');
    const snapshotUrl = `${BASE_URL}/v3/snapshot/options/${TICKER}?apikey=${POLYGON_API_KEY}`;
    const snapshotResponse = await fetch(snapshotUrl);
    const snapshotData = await snapshotResponse.json();
    
    if (snapshotData.results && snapshotData.results.length > 0) {
      console.log(`📊 Snapshot contracts: ${snapshotData.results.length}`);
      
      const marketOpenTimestamp = getTodaysMarketOpenTimestamp();
      const validTrades = [];
      const tradesByExpiry = {};
      
      // Process ALL snapshot data with your exact filters (not limited to 50)
      for (const contract of snapshotData.results) { // Process ALL contracts
        if (!contract.last_trade || !contract.last_trade.price) continue;
        
        const strike = contract.details.strike_price;
        const contractType = contract.details.contract_type.toLowerCase();
        
        // Apply 5% ITM filter
        if (!isWithinTradeableRange(strike, spotPrice, contractType)) {
          continue;
        }
        
        const tradeTimestamp = contract.last_trade.sip_timestamp;
        
        // Only today's trades (not 2024 data)
        if (!isFromToday(tradeTimestamp)) {
          continue;
        }
        
        const trade = {
          ticker: contract.details.ticker,
          underlying_ticker: TICKER,
          strike: strike,
          expiry: contract.details.expiration_date,
          type: contractType,
          trade_size: contract.last_trade.size || 1,
          premium_per_contract: contract.last_trade.price,
          total_premium: (contract.last_trade.price || 0) * (contract.last_trade.size || 1) * 100,
          spot_price: spotPrice,
          trade_timestamp: new Date(tradeTimestamp / 1000000)
        };
        
        // Apply institutional criteria
        if (passesInstitutionalCriteria(trade)) {
          validTrades.push(trade);
          
          // Group by expiration date
          if (!tradesByExpiry[trade.expiry]) {
            tradesByExpiry[trade.expiry] = [];
          }
          tradesByExpiry[trade.expiry].push(trade);
        }
      }
      
      console.log(`✅ Valid trades found: ${validTrades.length}`);
      
      // Show trades breakdown by expiration date
      if (Object.keys(tradesByExpiry).length > 0) {
        console.log('\n📊 VALID TRADES BY EXPIRATION DATE:');
        Object.keys(tradesByExpiry).sort().forEach(expiry => {
          const trades = tradesByExpiry[expiry];
          console.log(`  ${expiry}: ${trades.length} valid trades`);
        });
      }
      
      // Show sample valid trades from ALL expiration dates
      if (validTrades.length > 0) {
        console.log('\n📊 Sample Valid Trades Across ALL Expiration Dates:');
        validTrades.slice(0, 15).forEach(trade => {
          console.log(`${trade.ticker}: ${trade.type.toUpperCase()} $${trade.strike} ${trade.expiry} - ${trade.trade_size} contracts @ $${trade.premium_per_contract.toFixed(2)} = $${trade.total_premium.toFixed(0)}`);
        });
      }
      
    } else {
      console.log('❌ No snapshot data available');
    }
    
    // Step 7: Summary of ALL expiration date coverage
    console.log('\n🔍 Step 7: FINAL SUMMARY - ALL EXPIRATION DATE COVERAGE');
    console.log('================================================================');
    console.log(`📊 Total Contracts Scanned: ${allContracts.length}`);
    console.log(`✅ Contracts Passing 5% ITM Filter: ${validContracts.length}`);
    console.log(`📅 Total Expiration Dates Covered: ${expirations.length}`);
    console.log(`📅 Date Range: ${expirations[0]} to ${expirations[expirations.length - 1]}`);
    
    // Calculate days to expiration range
    const today = new Date();
    const minDays = Math.ceil((new Date(expirations[0]) - today) / (1000 * 60 * 60 * 24));
    const maxDays = Math.ceil((new Date(expirations[expirations.length - 1]) - today) / (1000 * 60 * 60 * 24));
    console.log(`⏰ Days to Expiration Range: ${minDays} to ${maxDays} days`);
    
    console.log('\n✅ SPY OPTIONS FLOW TEST COMPLETED - ALL EXPIRATION DATES SCANNED');
    console.log('====================================================================');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
if (require.main === module) {
  testSPYOptionsFlow();
}

module.exports = {
  testSPYOptionsFlow,
  isWithinTradeableRange,
  passesInstitutionalCriteria,
  getCurrentStockPrice
};