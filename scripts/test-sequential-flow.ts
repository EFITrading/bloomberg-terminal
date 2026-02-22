/**
 * Test script: sequential per-ticker scan → enrich → log
 * Run: npx tsx scripts/test-sequential-flow.js
 */

import 'dotenv/config';
import { OptionsFlowService, getSmartDateRange } from '../src/lib/optionsFlowService';

const TICKERS = ['MSFT', 'AAPL', 'NVDA', 'TSLA'];

async function main() {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    console.error('ERROR: POLYGON_API_KEY not set in .env.local');
    process.exit(1);
  }

  const service = new OptionsFlowService(apiKey);
  const { startTimestamp, endTimestamp, currentDate, isLive } = await getSmartDateRange();
  console.log(`\nDate range: ${currentDate} | isLive: ${isLive}`);
  console.log(`Scanning tickers sequentially: ${TICKERS.join(', ')}\n`);
  console.log('='.repeat(60));

  const allTrades = [];

  for (const ticker of TICKERS) {
    console.log(`\n[${ticker}] Starting scan...`);
    const t0 = Date.now();

    // 1. Scan + classify + filter
    let trades = await service.fetchLiveOptionsFlowUltraFast(
      ticker,
      (_t, status) => console.log(`  [${ticker}] ${status}`),
      { startTimestamp, endTimestamp, currentDate, isLive }
    );
    console.log(`  [${ticker}] Scan done: ${trades.length} trades (${Date.now() - t0}ms)`);

    // 2. Enrich
    const t1 = Date.now();
    trades = await service.enrichTradesWithVolOIParallel(trades);
    console.log(`  [${ticker}] Enrichment done: ${trades.length} trades (${Date.now() - t1}ms)`);

    // 3. Print summary
    const premium = trades.reduce((s, t) => s + t.total_premium, 0);
    const sweeps = trades.filter(t => t.trade_type === 'SWEEP').length;
    const blocks = trades.filter(t => t.trade_type === 'BLOCK').length;
    const calls  = trades.filter(t => t.type === 'call').length;
    const puts   = trades.filter(t => t.type === 'put').length;

    console.log(`  [${ticker}] RESULT:`);
    console.log(`    Total trades : ${trades.length}`);
    console.log(`    Total premium: $${(premium / 1e6).toFixed(2)}M`);
    console.log(`    Sweeps       : ${sweeps}`);
    console.log(`    Blocks       : ${blocks}`);
    console.log(`    Calls/Puts   : ${calls} / ${puts}`);
    console.log(`    Total time   : ${Date.now() - t0}ms`);
    console.log('-'.repeat(60));

    allTrades.push(...trades);
  }

  console.log('\n' + '='.repeat(60));
  console.log('ALL TICKERS COMPLETE');
  console.log(`  Combined trades : ${allTrades.length}`);
  console.log(`  Combined premium: $${(allTrades.reduce((s, t) => s + t.total_premium, 0) / 1e6).toFixed(2)}M`);
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
