/**
 * STREAMING OPTIONS FLOW WORKER
 * Enhanced worker that sends incremental results instead of waiting for completion
 * Provides real-time streaming of trade data as it's processed
 */

const { parentPort, workerData } = require('worker_threads');
const axios = require('axios');

// Worker configuration from parent
const { batch, workerIndex, streamingBatchSize = 5, apiKey } = workerData;

console.log(` Streaming Worker ${workerIndex}: Started with ${batch.length} tickers, streaming every ${streamingBatchSize} tickers`);

// Streaming state
let processedTickers = 0;
let accumulatedResults = [];
let streamBatch = 1;

// Performance tracking
const workerStartTime = performance.now();
let totalApiCalls = 0;
let totalTradesFound = 0;

/**
 * SEND INCREMENTAL STREAM
 * Send current batch of results to parent process
 */
function sendIncrementalStream(results, ticker) {
 if (results.length > 0) {
 accumulatedResults.push(...results);
 totalTradesFound += results.length;
 }
 
 // Send stream when we have enough results or completed a ticker batch
 if (accumulatedResults.length >= streamingBatchSize || 
 (processedTickers > 0 && processedTickers % streamingBatchSize === 0)) {
 
 const streamResults = accumulatedResults.slice(); // Copy current results
 accumulatedResults = []; // Clear for next batch
 
 parentPort.postMessage({
 type: 'incremental_stream',
 results: streamResults,
 completedTickers: processedTickers,
 totalTickers: batch.length,
 streamBatch: streamBatch++,
 ticker: ticker,
 workerIndex: workerIndex,
 timestamp: Date.now()
 });
 
 console.log(` Worker ${workerIndex}: Streamed ${streamResults.length} results (batch ${streamBatch-1}), ${processedTickers}/${batch.length} tickers complete`);
 }
}

/**
 * ENHANCED OPTIONS DATA FETCHER with Streaming
 */
async function fetchOptionsDataWithStreaming(ticker) {
 const tickerStart = performance.now();
 
 try {
 // Send progress update
 parentPort.postMessage({
 type: 'ticker_progress',
 message: `Scanning ${ticker}...`,
 ticker: ticker,
 workerIndex: workerIndex
 });
 
 // Get current market time and determine mode
 const now = new Date();
 const timeRange = getSmartTimeRange(now);
 
 console.log(` Worker ${workerIndex}: Scanning ${ticker} in ${timeRange.mode} mode (${timeRange.from} to ${timeRange.to})`);
 
 // Fetch options contracts for the ticker
 const contractsUrl = `https://api.polygon.io/v3/reference/options/contracts`;
 const contractsParams = {
 'underlying_ticker': ticker,
 'contract_type': 'call',
 'limit': 1000,
 'apikey': apiKey
 };
 
 totalApiCalls++;
 const contractsResponse = await axios.get(contractsUrl, { params: contractsParams });
 
 if (!contractsResponse.data?.results?.length) {
 console.log(` Worker ${workerIndex}: No contracts found for ${ticker}`);
 processedTickers++;
 sendIncrementalStream([], ticker);
 return [];
 }
 
 console.log(` Worker ${workerIndex}: Found ${contractsResponse.data.results.length} contracts for ${ticker}`);
 
 let allTickerTrades = [];
 let contractsProcessed = 0;
 
 // Process contracts in smaller batches for more frequent streaming
 const contractBatchSize = Math.max(1, Math.min(10, Math.floor(contractsResponse.data.results.length / 5)));
 
 for (let i = 0; i < contractsResponse.data.results.length; i += contractBatchSize) {
 const contractBatch = contractsResponse.data.results.slice(i, i + contractBatchSize);
 
 for (const contract of contractBatch) {
 try {
 // Fetch trades for this contract
 const tradesUrl = `https://api.polygon.io/v3/trades/${contract.ticker}`;
 const tradesParams = {
 'timestamp.gte': timeRange.from,
 'timestamp.lte': timeRange.to,
 'limit': 50000,
 'apikey': apiKey
 };
 
 totalApiCalls++;
 const tradesResponse = await axios.get(tradesUrl, { params: tradesParams });
 
 if (tradesResponse.data?.results?.length > 0) {
 const contractTrades = tradesResponse.data.results.map(trade => ({
 ...trade,
 ticker: ticker,
 contract: contract.ticker,
 strike: contract.strike_price,
 expiry: contract.expiration_date,
 contractType: contract.contract_type,
 fetchMode: timeRange.mode,
 workerIndex: workerIndex,
 processedAt: Date.now()
 }));
 
 allTickerTrades.push(...contractTrades);
 
 console.log(` Worker ${workerIndex}: Found ${contractTrades.length} trades for ${ticker} ${contract.ticker}`);
 
 // Stream results immediately if we have enough
 if (contractTrades.length > 0) {
 sendIncrementalStream(contractTrades, ticker);
 }
 }
 
 contractsProcessed++;
 
 // Brief pause to prevent API rate limiting
 if (contractsProcessed % 10 === 0) {
 await new Promise(resolve => setTimeout(resolve, 50));
 }
 
 } catch (contractError) {
 console.error(` Worker ${workerIndex}: Error fetching trades for ${contract.ticker}:`, contractError.message);
 }
 }
 }
 
 const tickerTime = performance.now() - tickerStart;
 console.log(` Worker ${workerIndex}: Completed ${ticker} in ${tickerTime.toFixed(2)}ms, found ${allTickerTrades.length} trades from ${contractsProcessed} contracts`);
 
 processedTickers++;
 
 // Send any remaining results for this ticker
 if (allTickerTrades.length > 0) {
 sendIncrementalStream(allTickerTrades, ticker);
 } else {
 // Still update progress even if no trades found
 sendIncrementalStream([], ticker);
 }
 
 return allTickerTrades;
 
 } catch (error) {
 console.error(` Worker ${workerIndex}: Error processing ${ticker}:`, error.message);
 processedTickers++;
 sendIncrementalStream([], ticker);
 return [];
 }
}

/**
 * SMART TIME RANGE CALCULATION
 * Same logic as original worker but optimized for streaming
 */
function getSmartTimeRange(now) {
 const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
 const hour = easternTime.getHours();
 const minute = easternTime.getMinutes();
 const currentMinute = hour * 60 + minute;
 
 const marketOpenMinute = 9 * 60 + 30; // 9:30 AM
 const marketCloseMinute = 16 * 60; // 4:00 PM
 const extendedEndMinute = 20 * 60; // 8:00 PM
 
 let mode, from, to;
 
 if (currentMinute >= marketOpenMinute && currentMinute < marketCloseMinute) {
 // Market hours - LIVE mode
 mode = 'LIVE';
 from = new Date(now.getTime() - 15 * 60 * 1000).toISOString(); // Last 15 minutes
 to = now.toISOString();
 } else if (currentMinute >= marketCloseMinute && currentMinute < extendedEndMinute) {
 // After hours - recent activity
 mode = 'AFTER_HOURS';
 from = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(); // Last 2 hours
 to = now.toISOString();
 } else {
 // Outside hours - HISTORICAL mode
 mode = 'HISTORICAL';
 const historicalDate = new Date(now);
 historicalDate.setHours(15, 30, 0, 0); // 3:30 PM
 
 if (hour < 6) {
 // Early morning - use previous day
 historicalDate.setDate(historicalDate.getDate() - 1);
 }
 
 from = new Date(historicalDate.getTime() - 60 * 60 * 1000).toISOString(); // Hour before 3:30 PM
 to = historicalDate.toISOString();
 }
 
 return { mode, from, to };
}

/**
 * MAIN STREAMING WORKER PROCESS
 */
async function processTickersWithStreaming() {
 console.log(` Worker ${workerIndex}: Starting streaming process for ${batch.length} tickers`);
 
 try {
 let allWorkerResults = [];
 
 // Process tickers sequentially but stream results incrementally
 for (const ticker of batch) {
 const tickerResults = await fetchOptionsDataWithStreaming(ticker);
 allWorkerResults.push(...tickerResults);
 
 // Add small delay between tickers to manage API rate limits
 await new Promise(resolve => setTimeout(resolve, 100));
 }
 
 // Send any remaining accumulated results
 if (accumulatedResults.length > 0) {
 parentPort.postMessage({
 type: 'incremental_stream',
 results: accumulatedResults,
 completedTickers: processedTickers,
 totalTickers: batch.length,
 streamBatch: streamBatch++,
 ticker: 'FINAL_BATCH',
 workerIndex: workerIndex,
 timestamp: Date.now()
 });
 
 console.log(` Worker ${workerIndex}: Final stream of ${accumulatedResults.length} results`);
 }
 
 // Send completion message
 const totalTime = performance.now() - workerStartTime;
 
 parentPort.postMessage({
 type: 'worker_complete',
 success: true,
 totalTrades: totalTradesFound,
 totalTickers: batch.length,
 totalTime: totalTime,
 totalApiCalls: totalApiCalls,
 streams: streamBatch - 1,
 workerIndex: workerIndex,
 finalResults: [] // All results already streamed
 });
 
 console.log(` Worker ${workerIndex}: Streaming complete - ${totalTradesFound} trades from ${batch.length} tickers in ${totalTime.toFixed(2)}ms via ${streamBatch-1} streams`);
 
 } catch (error) {
 console.error(` Worker ${workerIndex}: Streaming process failed:`, error);
 
 parentPort.postMessage({
 type: 'error',
 error: error.message,
 workerIndex: workerIndex
 });
 }
}

// Start the streaming process
processTickersWithStreaming();