const os = require('os');
const https = require('https');

class ParallelOptionsFlowProcessor {
 constructor() {
 this.maxConcurrency = Math.min(os.cpus().length * 4, 50); // Use 4x cores up to 50 concurrent operations for I/O bound work
 
 // PERFORMANCE: Initialize benchmarking system
 this.benchmarks = {
 batchCreation: new Map(), // Track batch initialization time
 batchProcessing: new Map(), // Track processing time per batch
 batchCompletion: new Map(), // Track completion time per batch
 totalOperations: new Map(), // Track overall operation metrics
 bottlenecks: new Map() // Track identified performance bottlenecks
 };
 
 console.log(` PARALLEL PROCESSOR: ${this.maxConcurrency} concurrent operations available (${os.cpus().length} CPU cores)`);
 console.log(` BENCHMARKING: Performance monitoring enabled - NO WORKER THREADS`);
 }

 async processTickersInParallel(tickers, optionsFlowService, onProgress) {
 // PERFORMANCE: Start overall timing
 const overallStartTime = performance.now();
 console.time(' TOTAL_PARALLEL_PROCESSING');

 // PERFORMANCE: Time batch preparation
 console.time(' BATCH_PREPARATION');
 const batchSize = Math.max(1, Math.ceil(tickers.length / this.maxConcurrency));
 const batches = [];
 
 for (let i = 0; i < tickers.length; i += batchSize) {
 batches.push(tickers.slice(i, i + batchSize));
 }
 console.timeEnd(' BATCH_PREPARATION');
 
 console.log(` Split into ${batches.length} batches of ~${batchSize} tickers each`);
 
 // PERFORMANCE: Time parallel processing phase
 console.time(' PARALLEL_PROCESSING_PHASE');
 const processingStart = performance.now();
 
 const promises = batches.map((batch, index) => {
 // Track when this batch starts being processed
 this.benchmarks.batchCreation.set(index, performance.now());
 return this.processBatchWithMaximumSpeed(batch, index, optionsFlowService, onProgress);
 });
 
 const processingEnd = performance.now();
 console.timeEnd(' PARALLEL_PROCESSING_PHASE');
 
 // PERFORMANCE: Time parallel execution phase
 console.time(' PARALLEL_EXECUTION');
 const executionStart = performance.now();
 
 const results = await Promise.all(promises);
 
 const executionEnd = performance.now();
 console.timeEnd(' PARALLEL_EXECUTION');
 
 // PERFORMANCE: Time result aggregation phase
 console.time(' RESULT_AGGREGATION');
 const aggregationStart = performance.now();
 
 const allTrades = results.flat();
 
 const aggregationEnd = performance.now();
 console.timeEnd(' RESULT_AGGREGATION');
 
 const overallEndTime = performance.now();
 console.timeEnd(' TOTAL_PARALLEL_PROCESSING');
 
 // PERFORMANCE: Store phase timings in bottlenecks for analysis
 this.benchmarks.bottlenecks.set('PARALLEL_PROCESSING_PHASE', processingEnd - processingStart);
 this.benchmarks.bottlenecks.set('PARALLEL_EXECUTION', executionEnd - executionStart);
 this.benchmarks.bottlenecks.set('RESULT_AGGREGATION', aggregationEnd - aggregationStart);
 this.benchmarks.totalOperations.set('startTime', overallStartTime);
 this.benchmarks.totalOperations.set('endTime', overallEndTime);
 
 // PERFORMANCE: Display comprehensive analytics
 this.displayPerformanceReport();
 
 return allTrades;
 }

 async processBatchWithMaximumSpeed(batch, batchIndex, optionsFlowService, onProgress) {
 // PERFORMANCE: Track batch processing completion
 const batchCreationComplete = performance.now();
 const creationTime = batchCreationComplete - this.benchmarks.batchCreation.get(batchIndex);
 console.log(` Batch ${batchIndex}: Created in ${creationTime.toFixed(2)}ms`);
 
 // PERFORMANCE: Start tracking this batch's processing time
 const batchProcessingStart = performance.now();
 this.benchmarks.batchProcessing.set(batchIndex, {
 startTime: batchProcessingStart,
 batchSize: batch.length,
 tradesFound: 0,
 apiCalls: 0,
 firstTradeTime: null,
 completionTime: null
 });
 
 let allBatchTrades = [];
 
 try {
 const tickerPromises = batch.map(async (ticker) => {
 try {
 const currentProcessing = this.benchmarks.batchProcessing.get(batchIndex);
 
 // Show ticker scanning progress
 if (onProgress) {
 onProgress([], `Batch ${batchIndex}: Scanning ${ticker}`, {
 batch: batchIndex,
 ticker: ticker,
 scanning: true
 });
 }
 
 // FIXED: Use the proper live streaming method for options flow scanning
 const tickerTrades = await optionsFlowService.fetchLiveStreamingTrades(ticker);
 
 if (tickerTrades && tickerTrades.length > 0) {
 console.log(` Batch ${batchIndex}: Found ${tickerTrades.length} trades from ${ticker}`);
 
 // PERFORMANCE: Track trade discovery metrics
 if (currentProcessing) {
 currentProcessing.tradesFound += tickerTrades.length;
 currentProcessing.apiCalls += 1;
 if (!currentProcessing.firstTradeTime) {
 currentProcessing.firstTradeTime = performance.now();
 }
 }
 
 // Send real-time progress
 if (onProgress) {
 onProgress(tickerTrades, ` LIVE: Found ${tickerTrades.length} trades from ${ticker}`, {
 batch: batchIndex,
 ticker: ticker,
 newTrades: tickerTrades.length,
 batchTotal: currentProcessing.tradesFound
 });
 }
 }
 
 return tickerTrades || [];
 
 } catch (tickerError) {
 console.error(` Error processing ticker ${ticker}:`, tickerError.message);
 return [];
 }
 });
 
 // Wait for all tickers in the batch to complete
 const batchResults = await Promise.all(tickerPromises);
 allBatchTrades = batchResults.flat();
 
 // PERFORMANCE: Track successful batch completion
 const completionTime = performance.now();
 const currentProcessing = this.benchmarks.batchProcessing.get(batchIndex);
 if (currentProcessing) {
 currentProcessing.completionTime = completionTime;
 const totalTime = completionTime - currentProcessing.startTime;
 
 console.log(` Batch ${batchIndex}: Completed ${currentProcessing.batchSize} tickers in ${totalTime.toFixed(2)}ms, found ${currentProcessing.tradesFound} trades (${currentProcessing.apiCalls} API calls)`);
 
 this.benchmarks.batchCompletion.set(batchIndex, {
 ...currentProcessing,
 status: 'success',
 totalTime,
 finalTradeCount: allBatchTrades.length
 });
 } else {
 console.log(` Batch ${batchIndex}: Completed batch - found ${allBatchTrades.length} trades from ${batch.length} tickers`);
 }
 
 return allBatchTrades;
 
 } catch (error) {
 // PERFORMANCE: Track failed batch completion
 console.error(` Batch ${batchIndex} error:`, error.message);
 const currentProcessing = this.benchmarks.batchProcessing.get(batchIndex);
 if (currentProcessing) {
 currentProcessing.completionTime = performance.now();
 this.benchmarks.batchCompletion.set(batchIndex, {
 ...currentProcessing,
 status: 'failed',
 error: error.message,
 finalTradeCount: allBatchTrades.length
 });
 }
 return allBatchTrades; // Return whatever we got so far
 }
 }
 
 // Get options contracts for a ticker with parallel processing
 async getOptionsContractsParallel(ticker) {
 try {
 const today = new Date();
 const oneMonthFromNow = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000));
 const expiry = oneMonthFromNow.toISOString().split('T')[0];
 
 const url = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&expiration_date.gte=${today.toISOString().split('T')[0]}&expiration_date.lte=${expiry}&limit=1000&apikey=${process.env.POLYGON_API_KEY}`;
 
 const response = await this.makePolygonRequest(url);
 
 if (response && response.results) {
 return response.results.map(contract => ({
 ticker: contract.ticker,
 contract_type: contract.contract_type,
 strike: contract.strike_price,
 expiry: contract.expiration_date
 }));
 }
 
 return [];
 } catch (error) {
 console.error(` Error getting contracts for ${ticker}:`, error.message);
 return [];
 }
 }
 
 // Get options trades for a specific contract with parallel processing
 async getOptionsTradesParallel(ticker, contract) {
 try {
 const contractTicker = `O:${ticker}${contract.expiry.replace(/-/g, '')}${contract.contract_type}${String(contract.strike * 1000).padStart(8, '0')}`;
 const today = new Date().toISOString().split('T')[0];
 
 const url = `https://api.polygon.io/v3/trades/${contractTicker}?timestamp.gte=${today}&limit=5000&apikey=${process.env.POLYGON_API_KEY}`;
 
 const response = await this.makePolygonRequest(url);
 
 if (response && response.results) {
 return response.results.map(trade => ({
 ticker: contractTicker,
 underlying_ticker: ticker,
 strike: contract.strike,
 expiry: contract.expiry,
 type: contract.contract_type,
 trade_size: trade.size,
 premium_per_contract: trade.price,
 total_premium: trade.size * trade.price * 100,
 spot_price: trade.price, // This would need to be fetched separately in a real implementation
 exchange: trade.exchange,
 exchange_name: this.getExchangeName(trade.exchange),
 sip_timestamp: trade.sip_timestamp,
 conditions: trade.conditions || [],
 trade_timestamp: new Date(trade.sip_timestamp / 1000000)
 }));
 }
 
 return [];
 } catch (error) {
 console.error(` Error getting trades for ${contract.contract_type}${contract.strike}${contract.expiry}:`, error.message);
 return [];
 }
 }
 
 // Simple function to make Polygon API calls with parallel processing support
 makePolygonRequest(url) {
 return new Promise((resolve, reject) => {
 https.get(url, (res) => {
 let data = '';
 res.on('data', chunk => data += chunk);
 res.on('end', () => {
 try {
 const parsed = JSON.parse(data);
 resolve(parsed);
 } catch (error) {
 reject(new Error(`JSON parse error: ${error.message}`));
 }
 });
 }).on('error', reject);
 });
 }
 
 // Exchange name mapping
 getExchangeName(exchangeId) {
 const exchangeNames = {
 1: 'CBOE',
 2: 'ISE', 
 3: 'NASDAQ',
 4: 'NYSE',
 5: 'MIAX',
 6: 'PEARL',
 7: 'EMERALD',
 8: 'BOX',
 9: 'GEMINI',
 300: 'OPRA',
 };
 return exchangeNames[exchangeId] || `Exchange_${exchangeId}`;
 }

 // PERFORMANCE ANALYTICS: Comprehensive performance report for parallel processing
 displayPerformanceReport() {
 console.log('\n' + '='.repeat(80));
 console.log(' PARALLEL PROCESSING PERFORMANCE REPORT (NO WORKER THREADS)');
 console.log('='.repeat(80));
 
 // Overall operation metrics
 const totalOperationsTime = this.benchmarks.totalOperations.get('endTime') - this.benchmarks.totalOperations.get('startTime');
 console.log(` Total Operation Time: ${totalOperationsTime.toFixed(2)}ms`);
 
 // Batch creation analysis
 if (this.benchmarks.batchCreation.size > 0) {
 const creationTimes = Array.from(this.benchmarks.batchCreation.values());
 const avgCreationTime = creationTimes.reduce((sum, time) => sum + time, 0) / creationTimes.length;
 const maxCreationTime = Math.max(...creationTimes);
 console.log(`\n Batch Creation:`);
 console.log(` Average: ${avgCreationTime.toFixed(2)}ms | Max: ${maxCreationTime.toFixed(2)}ms | Count: ${creationTimes.length}`);
 }
 
 // Batch processing analysis
 if (this.benchmarks.batchCompletion.size > 0) {
 const completions = Array.from(this.benchmarks.batchCompletion.values());
 const successfulBatches = completions.filter(b => b.status === 'success');
 const failedBatches = completions.filter(b => b.status === 'failed');
 
 console.log(`\n Parallel Batch Processing:`);
 console.log(` Successful: ${successfulBatches.length} | Failed: ${failedBatches.length}`);
 
 if (successfulBatches.length > 0) {
 const processingTimes = successfulBatches.map(b => b.totalTime);
 const avgProcessingTime = processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length;
 const maxProcessingTime = Math.max(...processingTimes);
 const minProcessingTime = Math.min(...processingTimes);
 
 console.log(` Processing Time - Avg: ${avgProcessingTime.toFixed(2)}ms | Min: ${minProcessingTime.toFixed(2)}ms | Max: ${maxProcessingTime.toFixed(2)}ms`);
 
 const totalTrades = successfulBatches.reduce((sum, b) => sum + (b.finalTradeCount || 0), 0);
 const totalApiCalls = successfulBatches.reduce((sum, b) => sum + (b.apiCalls || 0), 0);
 const totalTickers = successfulBatches.reduce((sum, b) => sum + b.batchSize, 0);
 
 console.log(` Total Trades Found: ${totalTrades}`);
 console.log(` Total API Calls: ${totalApiCalls}`);
 console.log(` Total Tickers Processed: ${totalTickers}`);
 console.log(` Trades per Second: ${(totalTrades / (totalOperationsTime / 1000)).toFixed(2)}`);
 console.log(` API Calls per Second: ${(totalApiCalls / (totalOperationsTime / 1000)).toFixed(2)}`);
 console.log(` PARALLEL EFFICIENCY: ${(totalTickers / (totalOperationsTime / 1000)).toFixed(2)} tickers/sec`);
 }
 
 if (failedBatches.length > 0) {
 console.log(`\n Failed Batches:`);
 failedBatches.forEach((batch, index) => {
 console.log(` Batch ${index}: ${batch.error || 'Unknown error'}`);
 });
 }
 }
 
 // Bottleneck analysis
 if (this.benchmarks.bottlenecks.size > 0) {
 console.log(`\n Bottleneck Analysis:`);
 for (const [phase, time] of this.benchmarks.bottlenecks.entries()) {
 const percentage = ((time / totalOperationsTime) * 100).toFixed(1);
 console.log(` ${phase}: ${time.toFixed(2)}ms (${percentage}% of total)`);
 }
 
 // Find the slowest phase
 const slowestPhase = Array.from(this.benchmarks.bottlenecks.entries())
 .reduce((max, [phase, time]) => time > max.time ? {phase, time} : max, {phase: '', time: 0});
 
 if (slowestPhase.time > 0) {
 console.log(`\n Primary Bottleneck: ${slowestPhase.phase} (${((slowestPhase.time / totalOperationsTime) * 100).toFixed(1)}% of total time)`);
 }
 }
 
 console.log('\n' + '='.repeat(80));
 console.log(' Parallel Processing Performance Recommendations:');
 
 if (this.benchmarks.batchCompletion.size > 0) {
 const completions = Array.from(this.benchmarks.batchCompletion.values()).filter(b => b.status === 'success');
 if (completions.length > 0) {
 const avgTime = completions.reduce((sum, b) => sum + b.totalTime, 0) / completions.length;
 const maxTime = Math.max(...completions.map(b => b.totalTime));
 const variance = maxTime - Math.min(...completions.map(b => b.totalTime));
 
 if (variance > avgTime * 0.5) {
 console.log(' High variance in batch completion times - consider dynamic load balancing');
 }
 
 if (avgTime > 3000) {
 console.log(' Batch processing time is high - consider increasing concurrency or implementing caching');
 }
 
 const totalApiCalls = completions.reduce((sum, b) => sum + (b.apiCalls || 0), 0);
 if (totalApiCalls > completions.length * 50) {
 console.log(' High API call frequency - implement request batching and caching');
 }
 
 console.log(' ADVANTAGE: No worker thread overhead - faster startup and lower memory usage'); }
 }
 
 console.log('='.repeat(80) + '\n');
 }
}

module.exports = { ParallelOptionsFlowProcessor };