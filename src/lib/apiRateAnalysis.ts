// API Request Rate Analysis for Options Flow Service
// Analysis based on your current implementation in optionsFlowService.ts

export interface APIRequestAnalysis {
  perTicker: {
    requestsPerSecond: number;
    totalRequests: number;
    timeToComplete: number;
    requestBreakdown: {
      [key: string]: number;
    };
  };
  rateLimiting: {
    delayBetweenRequests: number;
    retryBackoff: string[];
    maxRetries: number;
  };
  recommendations: string[];
}

export function analyzeAPIRequestRate(): APIRequestAnalysis {
  console.log('📊 Analyzing API Request Rate Per Ticker...\n');
  
  // Based on your current implementation analysis:
  
  // 1. Initial requests per ticker:
  const initialRequests = {
    currentStockPrice: 1,           // getCurrentStockPrice()
    contractsPagination: 5,         // fetchAllContractsPaginated() - average ~5 pages
    contractsTotal: 0               // Will be calculated below
  };
  
  // 2. Contract scanning (main load):
  // Your code shows you scan ALL contracts after 5% ITM filtering
  // Typical ticker has ~2000-5000 contracts, filtered to ~1000-2000
  const averageContractsPerTicker = 1500;  // After 5% ITM filtering
  const contractTradeRequests = averageContractsPerTicker; // 1 request per contract
  
  // 3. Rate limiting in your code:
  const delayBetweenRequests = 50; // 50ms delay you implemented
  const requestsPerSecond = 1000 / delayBetweenRequests; // 20 requests/second
  
  // 4. Total requests per ticker:
  const totalRequestsPerTicker = 
    initialRequests.currentStockPrice + 
    initialRequests.contractsPagination + 
    contractTradeRequests;
  
  // 5. Time calculation:
  const timeToCompleteSeconds = totalRequestsPerTicker / requestsPerSecond;
  
  // 6. Retry logic impact:
  const retryMultiplier = 1.2; // ~20% of requests might retry once
  const actualTimeWithRetries = timeToCompleteSeconds * retryMultiplier;
  
  const analysis: APIRequestAnalysis = {
    perTicker: {
      requestsPerSecond: requestsPerSecond,
      totalRequests: totalRequestsPerTicker,
      timeToComplete: actualTimeWithRetries,
      requestBreakdown: {
        'Stock Price': initialRequests.currentStockPrice,
        'Contracts Pagination': initialRequests.contractsPagination,
        'Contract Trades': contractTradeRequests,
        'Historical Price Cache': Math.floor(contractTradeRequests * 0.1), // ~10% cache misses
      }
    },
    rateLimiting: {
      delayBetweenRequests: delayBetweenRequests,
      retryBackoff: ['1s', '2s', '4s', '8s', '16s'],
      maxRetries: 5
    },
    recommendations: [
      'Your current rate: 20 requests/second per ticker',
      `Each ticker takes ~${Math.ceil(actualTimeWithRetries)} seconds to complete`,
      `Total ~${totalRequestsPerTicker} API calls per ticker`,
      'Consider reducing to 10 req/sec (100ms delay) to avoid 403 errors',
      'Implement contract batching to reduce total requests',
      'Use snapshot API more efficiently to get bulk data',
      'Cache contract data to avoid repeated pagination calls'
    ]
  };
  
  return analysis;
}

export function displayAnalysis() {
  const analysis = analyzeAPIRequestRate();
  
  console.log('🎯 API REQUEST RATE ANALYSIS\n');
  console.log('═'.repeat(50));
  
  console.log('\n📈 Per Ticker Performance:');
  console.log(`├─ Requests/Second: ${analysis.perTicker.requestsPerSecond}`);
  console.log(`├─ Total Requests: ${analysis.perTicker.totalRequests}`);
  console.log(`└─ Time to Complete: ${analysis.perTicker.timeToComplete.toFixed(1)} seconds\n`);
  
  console.log('📊 Request Breakdown:');
  Object.entries(analysis.perTicker.requestBreakdown).forEach(([type, count]) => {
    const percentage = ((count / analysis.perTicker.totalRequests) * 100).toFixed(1);
    console.log(`├─ ${type}: ${count} requests (${percentage}%)`);
  });
  
  console.log('\n⚡ Rate Limiting Configuration:');
  console.log(`├─ Delay Between Requests: ${analysis.rateLimiting.delayBetweenRequests}ms`);
  console.log(`├─ Max Retries: ${analysis.rateLimiting.maxRetries}`);
  console.log(`└─ Retry Backoff: ${analysis.rateLimiting.retryBackoff.join(' → ')}\n`);
  
  console.log('💡 Recommendations:');
  analysis.recommendations.forEach((rec, i) => {
    console.log(`${i + 1}. ${rec}`);
  });
  
  console.log('\n⚠️  PERFORMANCE IMPACT:');
  console.log(`┌─ For 10 tickers: ${(analysis.perTicker.timeToComplete * 10 / 60).toFixed(1)} minutes`);
  console.log(`├─ For 50 tickers: ${(analysis.perTicker.timeToComplete * 50 / 60).toFixed(1)} minutes`);
  console.log(`└─ For 100 tickers: ${(analysis.perTicker.timeToComplete * 100 / 60).toFixed(1)} minutes`);
  
  console.log('\n🔥 OPTIMIZATION OPPORTUNITIES:');
  console.log('1. Reduce rate from 20 req/s to 10 req/s (safer)');
  console.log('2. Batch contract requests (5-10 contracts per call)');
  console.log('3. Use snapshot API instead of individual trades calls');
  console.log('4. Implement smart caching for contract chains');
  console.log('5. Filter contracts more aggressively before API calls');
  
  return analysis;
}

// Example usage and testing
if (require.main === module) {
  displayAnalysis();
}