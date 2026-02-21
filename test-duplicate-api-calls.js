// Test script to prove duplicate API calls in enrichment

// Simulate 12,000 MAG7 trades (simplified example)
const sampleTrades = [
  { ticker: 'O:AAPL260221C00220000', underlying_ticker: 'AAPL', trade_timestamp: '2026-02-21T10:30:15Z', premium_per_contract: 5.50 },
  { ticker: 'O:AAPL260221C00220000', underlying_ticker: 'AAPL', trade_timestamp: '2026-02-21T10:30:18Z', premium_per_contract: 5.52 },
  { ticker: 'O:AAPL260221C00220000', underlying_ticker: 'AAPL', trade_timestamp: '2026-02-21T10:31:05Z', premium_per_contract: 5.48 },
  { ticker: 'O:AAPL260221C00220000', underlying_ticker: 'AAPL', trade_timestamp: '2026-02-21T10:32:00Z', premium_per_contract: 5.45 },
  { ticker: 'O:AAPL260221C00220000', underlying_ticker: 'AAPL', trade_timestamp: '2026-02-21T10:33:00Z', premium_per_contract: 5.47 },
  { ticker: 'O:NVDA260221C00800000', underlying_ticker: 'NVDA', trade_timestamp: '2026-02-21T10:32:00Z', premium_per_contract: 12.30 },
  { ticker: 'O:NVDA260221C00800000', underlying_ticker: 'NVDA', trade_timestamp: '2026-02-21T10:33:00Z', premium_per_contract: 12.25 },
  { ticker: 'O:NVDA260221C00800000', underlying_ticker: 'NVDA', trade_timestamp: '2026-02-21T10:34:00Z', premium_per_contract: 12.28 },
  { ticker: 'O:MSFT260221P00420000', underlying_ticker: 'MSFT', trade_timestamp: '2026-02-21T10:35:00Z', premium_per_contract: 8.20 },
  { ticker: 'O:MSFT260221P00420000', underlying_ticker: 'MSFT', trade_timestamp: '2026-02-21T10:36:00Z', premium_per_contract: 8.25 },
  { ticker: 'O:TSLA260221C01000000', underlying_ticker: 'TSLA', trade_timestamp: '2026-02-21T10:37:00Z', premium_per_contract: 15.50 },
  { ticker: 'O:TSLA260221C01000000', underlying_ticker: 'TSLA', trade_timestamp: '2026-02-21T10:38:00Z', premium_per_contract: 15.45 },
];

console.log(`\n========================================`);
console.log(`TESTING CURRENT ENRICHMENT CODE`);
console.log(`========================================\n`);

console.log(`Total trades: ${sampleTrades.length}`);

// CURRENT CODE: Loops through EVERY trade
const snapshotApiCalls = [];
const quoteApiCalls = [];

for (const trade of sampleTrades) {
  const optionTicker = trade.ticker;
  const tradeTimestamp = new Date(trade.trade_timestamp).getTime() * 1000000;
  
  // Snapshot API call (for Vol/OI)
  const snapshotUrl = `https://api.polygon.io/v3/snapshot/options/${trade.underlying_ticker}/${optionTicker}`;
  snapshotApiCalls.push({ url: snapshotUrl, ticker: optionTicker });
  
  // Quote API call (for Fill Style)
  const quoteUrl = `https://api.polygon.io/v3/quotes/${optionTicker}?timestamp.lte=${tradeTimestamp}`;
  quoteApiCalls.push({ url: quoteUrl, ticker: optionTicker, timestamp: trade.trade_timestamp });
}

console.log(`\n--- SNAPSHOT API CALLS (Vol/OI) ---`);
console.log(`Total calls: ${snapshotApiCalls.length}`);
snapshotApiCalls.forEach((call, i) => {
  console.log(`${i + 1}. ${call.ticker}`);
});

// Count duplicates
const uniqueSnapshotTickers = new Set(snapshotApiCalls.map(c => c.ticker));
console.log(`\nUnique tickers: ${uniqueSnapshotTickers.size}`);
console.log(`Duplicate calls: ${snapshotApiCalls.length - uniqueSnapshotTickers.size}`);
console.log(`Waste: ${Math.round((1 - uniqueSnapshotTickers.size / snapshotApiCalls.length) * 100)}%`);

console.log(`\n--- QUOTE API CALLS (Fill Style) ---`);
console.log(`Total calls: ${quoteApiCalls.length}`);
quoteApiCalls.forEach((call, i) => {
  console.log(`${i + 1}. ${call.ticker} @ ${call.timestamp}`);
});

// Count duplicates (same ticker + same timestamp = duplicate)
const uniqueQuoteCalls = new Set(quoteApiCalls.map(c => `${c.ticker}_${c.timestamp}`));
console.log(`\nUnique calls: ${uniqueQuoteCalls.size}`);
console.log(`Duplicate calls: ${quoteApiCalls.length - uniqueQuoteCalls.size}`);

console.log(`\n========================================`);
console.log(`EXTRAPOLATING TO 12,000 MAG7 TRADES`);
console.log(`========================================\n`);

// Assume ~1,500 unique option tickers across 12,000 trades (realistic)
const totalTrades = 12000;
const uniqueTickers = 1500;
const avgTradesPerTicker = totalTrades / uniqueTickers;

console.log(`Total trades: ${totalTrades}`);
console.log(`Unique option tickers: ${uniqueTickers}`);
console.log(`Average trades per ticker: ${avgTradesPerTicker.toFixed(1)}`);

console.log(`\n--- CURRENT CODE ---`);
console.log(`Snapshot API calls: ${totalTrades} (one per trade)`);
console.log(`Quote API calls: ${totalTrades} (one per trade)`);
console.log(`Total API calls: ${totalTrades * 2}`);

console.log(`\n--- OPTIMIZED WITH DEDUPLICATION ---`);
console.log(`Snapshot API calls: ${uniqueTickers} (one per unique ticker)`);
console.log(`Quote API calls: ${totalTrades} (still need each for timestamp)`);
console.log(`Total API calls: ${uniqueTickers + totalTrades}`);

console.log(`\n--- SAVINGS ---`);
const currentCalls = totalTrades * 2;
const optimizedCalls = uniqueTickers + totalTrades;
const savings = currentCalls - optimizedCalls;
const savingsPercent = Math.round((savings / currentCalls) * 100);

console.log(`Eliminated calls: ${savings}`);
console.log(`Reduction: ${savingsPercent}%`);
console.log(`Memory reduction: ~${Math.round((savings * 5) / 1024)}MB (assuming 5KB per response)`);
