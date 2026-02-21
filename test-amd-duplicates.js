// Test script to simulate AMD scan and prove duplicate API calls

// Simulate realistic AMD trade data (same contract traded multiple times)
const amdTrades = [
  { ticker: 'O:AMD260227C00205000', underlying_ticker: 'AMD', trade_timestamp: '2026-02-21T14:30:15Z', premium_per_contract: 4.75 },
  { ticker: 'O:AMD260227C00205000', underlying_ticker: 'AMD', trade_timestamp: '2026-02-21T14:30:16Z', premium_per_contract: 4.75 },
  { ticker: 'O:AMD260227C00205000', underlying_ticker: 'AMD', trade_timestamp: '2026-02-21T14:30:17Z', premium_per_contract: 4.75 },
  { ticker: 'O:AMD260227C00205000', underlying_ticker: 'AMD', trade_timestamp: '2026-02-21T14:30:18Z', premium_per_contract: 4.75 },
  { ticker: 'O:AMD260227C00205000', underlying_ticker: 'AMD', trade_timestamp: '2026-02-21T14:30:19Z', premium_per_contract: 4.75 },
  { ticker: 'O:AMD260227C00205000', underlying_ticker: 'AMD', trade_timestamp: '2026-02-21T14:30:20Z', premium_per_contract: 4.75 },
  { ticker: 'O:AMD260227C00205000', underlying_ticker: 'AMD', trade_timestamp: '2026-02-21T14:30:21Z', premium_per_contract: 4.75 },
  { ticker: 'O:AMD260227C00205000', underlying_ticker: 'AMD', trade_timestamp: '2026-02-21T14:30:22Z', premium_per_contract: 4.75 },
  { ticker: 'O:AMD260227C00205000', underlying_ticker: 'AMD', trade_timestamp: '2026-02-21T14:30:23Z', premium_per_contract: 4.75 },
  { ticker: 'O:AMD260227C00205000', underlying_ticker: 'AMD', trade_timestamp: '2026-02-21T14:30:24Z', premium_per_contract: 4.75 },
  { ticker: 'O:AMD260227C00205000', underlying_ticker: 'AMD', trade_timestamp: '2026-02-21T14:30:25Z', premium_per_contract: 4.75 },
  { ticker: 'O:AMD260227C00205000', underlying_ticker: 'AMD', trade_timestamp: '2026-02-21T14:30:26Z', premium_per_contract: 4.75 },
  { ticker: 'O:AMD260227C00205000', underlying_ticker: 'AMD', trade_timestamp: '2026-02-21T14:30:27Z', premium_per_contract: 4.75 },
  { ticker: 'O:AMD260227C00205000', underlying_ticker: 'AMD', trade_timestamp: '2026-02-21T14:30:28Z', premium_per_contract: 4.75 },
  { ticker: 'O:AMD260227P00190000', underlying_ticker: 'AMD', trade_timestamp: '2026-02-21T14:31:00Z', premium_per_contract: 3.05 },
  { ticker: 'O:AMD260227P00192500', underlying_ticker: 'AMD', trade_timestamp: '2026-02-21T14:31:05Z', premium_per_contract: 3.75 },
  { ticker: 'O:AMD260227P00192500', underlying_ticker: 'AMD', trade_timestamp: '2026-02-21T14:31:06Z', premium_per_contract: 3.75 },
  { ticker: 'O:AMD260227P00192500', underlying_ticker: 'AMD', trade_timestamp: '2026-02-21T14:31:07Z', premium_per_contract: 3.75 },
  { ticker: 'O:AMD260227P00195000', underlying_ticker: 'AMD', trade_timestamp: '2026-02-21T14:32:00Z', premium_per_contract: 4.55 },
  { ticker: 'O:AMD260306C00232500', underlying_ticker: 'AMD', trade_timestamp: '2026-02-21T14:33:00Z', premium_per_contract: 0.87 },
];

console.log('\n========================================');
console.log('AMD SCAN SIMULATION');
console.log('========================================\n');

console.log(`Total trades found: ${amdTrades.length}`);

// Count unique tickers
const uniqueTickers = new Set(amdTrades.map(t => t.ticker));
console.log(`Unique option tickers: ${uniqueTickers.size}`);

// Show which tickers and how many trades each
const tickerCounts = {};
amdTrades.forEach(t => {
  tickerCounts[t.ticker] = (tickerCounts[t.ticker] || 0) + 1;
});

console.log('\nTrades per option ticker:');
Object.entries(tickerCounts).forEach(([ticker, count]) => {
  console.log(`  ${ticker}: ${count} trades`);
});

console.log('\n========================================');
console.log('CURRENT ENRICHMENT CODE BEHAVIOR');
console.log('========================================\n');

let snapshotApiCallsMade = 0;
let quoteApiCallsMade = 0;

// Simulate current enrichment (makes call for EVERY trade)
amdTrades.forEach((trade, i) => {
  const optionTicker = trade.ticker;
  const tradeTimestamp = new Date(trade.trade_timestamp).getTime() * 1000000;
  
  // Snapshot API call
  snapshotApiCallsMade++;
  console.log(`[${i + 1}] Snapshot API: GET /snapshot/AMD/${optionTicker}`);
  
  // Quote API call
  quoteApiCallsMade++;
  console.log(`[${i + 1}] Quote API: GET /quotes/${optionTicker}?timestamp.lte=${tradeTimestamp}`);
});

console.log('\n--- API CALL SUMMARY ---');
console.log(`Snapshot API calls: ${snapshotApiCallsMade}`);
console.log(`Quote API calls: ${quoteApiCallsMade}`);
console.log(`Total API calls: ${snapshotApiCallsMade + quoteApiCallsMade}`);

console.log('\n--- DUPLICATE ANALYSIS ---');
console.log(`Unique tickers: ${uniqueTickers.size}`);
console.log(`Snapshot calls made: ${snapshotApiCallsMade}`);
console.log(`Duplicate snapshot calls: ${snapshotApiCallsMade - uniqueTickers.size}`);
console.log(`Waste: ${Math.round(((snapshotApiCallsMade - uniqueTickers.size) / snapshotApiCallsMade) * 100)}%`);

console.log('\n--- WHAT IT SHOULD BE ---');
console.log(`Snapshot API calls: ${uniqueTickers.size} (one per unique ticker)`);
console.log(`Quote API calls: ${quoteApiCallsMade} (need each for timestamp)`);
console.log(`Total API calls: ${uniqueTickers.size + quoteApiCallsMade}`);

const currentTotal = snapshotApiCallsMade + quoteApiCallsMade;
const optimizedTotal = uniqueTickers.size + quoteApiCallsMade;
const savings = currentTotal - optimizedTotal;

console.log('\n--- SAVINGS ---');
console.log(`Eliminated calls: ${savings}`);
console.log(`Reduction: ${Math.round((savings / currentTotal) * 100)}%`);
console.log(`Memory saved: ~${Math.round((savings * 5) / 1024)}MB`);

// Most duplicated ticker
const maxDuplicates = Math.max(...Object.values(tickerCounts));
const mostDuplicatedTicker = Object.entries(tickerCounts).find(([_, count]) => count === maxDuplicates);

console.log('\n--- WORST OFFENDER ---');
console.log(`${mostDuplicatedTicker[0]}`);
console.log(`  Trades: ${mostDuplicatedTicker[1]}`);
console.log(`  Snapshot calls made: ${mostDuplicatedTicker[1]}`);
console.log(`  Snapshot calls needed: 1`);
console.log(`  WASTED: ${mostDuplicatedTicker[1] - 1} duplicate calls for this ticker alone`);
