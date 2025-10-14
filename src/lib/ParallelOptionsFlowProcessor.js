const { Worker } = require('worker_threads');
const os = require('os');
const path = require('path');

class ParallelOptionsFlowProcessor {
  constructor() {
    this.numWorkers = Math.min(os.cpus().length * 2, 32); // Use 2x cores up to 32 workers for I/O bound work
    console.log(`🚀 PARALLEL PROCESSOR: ${this.numWorkers} workers available (${os.cpus().length} CPU cores)`);
  }

  // Process tickers in parallel using all CPU cores
  async processTickersInParallel(tickers, optionsFlowService, onProgress) {
    console.log(`🔥 ULTRA-FAST PARALLEL: Processing ${tickers.length} tickers across ${this.numWorkers} workers`);
    
    // Smaller batches for better parallelization with unlimited API
    const batchSize = Math.max(1, Math.ceil(tickers.length / this.numWorkers));
    const batches = [];
    
    for (let i = 0; i < tickers.length; i += batchSize) {
      batches.push(tickers.slice(i, i + batchSize));
    }
    
    console.log(`📦 Split into ${batches.length} batches of ~${batchSize} tickers each`);
    
    const startTime = Date.now();
    const promises = batches.map((batch, index) => 
      this.createWorkerPromise(batch, index, onProgress)
    );
    
    const results = await Promise.all(promises);
    const allTrades = results.flat();
    
    const duration = (Date.now() - startTime) / 1000;
    const rate = tickers.length / duration;
    
    console.log(`🎉 ULTRA-FAST SCAN COMPLETE!`);
    console.log(`   • Total Time: ${duration.toFixed(2)}s`);
    console.log(`   • Stocks Scanned: ${tickers.length}`);
    console.log(`   • Processing Rate: ${rate.toFixed(1)} stocks/second`);
    console.log(`   • Total Trades Found: ${allTrades.length}`);
    console.log(`   • Workers Used: ${this.numWorkers}`);
    
    return allTrades;
  }

  createWorkerPromise(batch, workerIndex, onProgress) {
    return new Promise((resolve) => {
      // Use the separate worker file with more reliable path resolution for Next.js
      const workerPath = path.resolve(process.cwd(), 'src/lib/optionsFlowWorker.js');
      
      const worker = new Worker(workerPath, {
        workerData: {
          batch,
          workerIndex
        }
      });

      let allWorkerTrades = [];

      worker.on('message', (result) => {
        if (result.type === 'trades_found') {
          // STREAM TRADES IMMEDIATELY as they're found
          allWorkerTrades.push(...result.trades);
          console.log(`📈 Worker ${workerIndex}: Found ${result.trades.length} trades from ${result.ticker} ${result.contract} (${allWorkerTrades.length} total)`);
          
          // Immediately notify UI with new trades
          if (onProgress) {
            onProgress(result.trades, `🔴 LIVE: Found ${result.trades.length} trades from ${result.ticker}`, {
              worker: workerIndex,
              ticker: result.ticker,
              contract: result.contract,
              newTrades: result.trades.length,
              workerTotal: allWorkerTrades.length
            });
          }
        } else if (result.type === 'ticker_progress') {
          // Show ticker scanning progress
          if (onProgress) {
            onProgress([], `Worker ${workerIndex}: ${result.message}`, {
              worker: workerIndex,
              ticker: result.ticker,
              scanning: true
            });
          }
        } else if (result.success) {
          console.log(`✅ Worker ${workerIndex}: Completed batch - found ${result.trades.length} trades from ${batch.length} tickers`);
          resolve(allWorkerTrades); // Return accumulated trades
          worker.terminate();
        } else {
          console.error(`❌ Worker ${workerIndex} error:`, result.error);
          resolve(allWorkerTrades); // Return whatever we got so far
          worker.terminate();
        }
      });
      
      worker.on('error', (error) => {
        console.error(`❌ Worker ${workerIndex} crashed:`, error.message);
        resolve(allWorkerTrades); // Return whatever we got so far
      });
      
      worker.on('exit', (code) => {
        if (code !== 0) {
          console.error(`❌ Worker ${workerIndex} exited with code ${code}`);
          resolve(allWorkerTrades); // Return whatever we got so far
        }
      });
    });
  }
}

module.exports = { ParallelOptionsFlowProcessor };