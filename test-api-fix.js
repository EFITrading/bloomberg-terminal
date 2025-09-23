// Test the API fix directly
const fetch = require('node-fetch');

const API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

async function testPaginatedAPI() {
  console.log('🔍 TESTING PAGINATED API APPROACH...\n');
  
  const ticker = 'SPY';
  const expiration = '2025-10-17';
  
  let allContracts = [];
  let nextUrl = `https://api.polygon.io/v3/snapshot/options/${ticker}?expiration_date=${expiration}&limit=250&apikey=${API_KEY}`;
  let requestCount = 0;
  
  while (nextUrl && allContracts.length < 5000) {
    requestCount++;
    console.log(`🔄 Request ${requestCount}: ${nextUrl.replace(API_KEY, 'HIDDEN')}`);
    
    try {
      const response = await fetch(nextUrl);
      const data = await response.json();
      
      console.log(`📊 Status: ${data.status}, Results: ${data.results?.length || 0}`);
      
      if (data.status !== 'OK') {
        console.error(`❌ API Error: ${data.status} - ${data.error}`);
        break;
      }
      
      if (data.results && data.results.length > 0) {
        allContracts.push(...data.results);
        console.log(`📈 Total contracts so far: ${allContracts.length}`);
      }
      
      // Check for pagination
      nextUrl = data.next_url || null;
      if (nextUrl && !nextUrl.includes('apikey=')) {
        nextUrl += `&apikey=${API_KEY}`;
      }
      
      if (!nextUrl) {
        console.log('✅ No more pages, pagination complete');
        break;
      }
      
    } catch (error) {
      console.error(`❌ Fetch error:`, error.message);
      break;
    }
  }
  
  // Analyze contracts
  const calls = {};
  const puts = {};
  
  allContracts.forEach(contract => {
    const strike = contract.details?.strike_price?.toString();
    const contractType = contract.details?.contract_type?.toLowerCase();
    
    if (!strike || !contractType) return;
    
    if (contractType === 'call') {
      calls[strike] = contract;
    } else if (contractType === 'put') {
      puts[strike] = contract;
    }
  });
  
  console.log(`\n📊 FINAL RESULTS FOR ${expiration}:`);
  console.log(`Total contracts: ${allContracts.length}`);
  console.log(`Calls: ${Object.keys(calls).length}`);
  console.log(`Puts: ${Object.keys(puts).length}`);
  console.log(`Requests made: ${requestCount}`);
  
  // Check coverage around current price
  const currentPrice = 666.84;
  const callStrikes = Object.keys(calls).map(Number).sort((a, b) => a - b);
  const putStrikes = Object.keys(puts).map(Number).sort((a, b) => a - b);
  
  console.log(`\nCall strike range: ${callStrikes[0]} to ${callStrikes[callStrikes.length - 1]}`);
  console.log(`Put strike range: ${putStrikes[0]} to ${putStrikes[putStrikes.length - 1]}`);
  
  // Check for missing puts near money
  const nearMoneyStrikes = callStrikes.filter(strike => Math.abs(strike - currentPrice) <= 50);
  const missingPuts = nearMoneyStrikes.filter(strike => !puts[strike]);
  
  if (missingPuts.length > 0) {
    console.log(`\n⚠️  Missing puts near money: ${missingPuts.slice(0, 10).join(', ')}${missingPuts.length > 10 ? ` (+${missingPuts.length - 10} more)` : ''}`);
  } else {
    console.log(`\n✅ All puts found near current price!`);
  }
}

testPaginatedAPI().catch(console.error);