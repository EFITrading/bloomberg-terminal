const { Worker } = require('worker_threads');
const os = require('os');
const path = require('path');

class ParallelOptionsFlowProcessor {
  constructor() {
    this.numWorkers = Math.min(os.cpus().length * 4, 64); // Use 4x cores up to 64 workers for maximum I/O parallelization

    // [PERF] PERFORMANCE: Initialize benchmarking system
    this.benchmarks = {
      workerCreation: new Map(),     // Track worker initialization time
      workerProcessing: new Map(),   // Track processing time per worker
      workerCompletion: new Map(),   // Track completion time per worker
      totalOperations: new Map(),    // Track overall operation metrics
      bottlenecks: new Map()         // Track identified performance bottlenecks (FIXED: was array, should be Map)
    };

    console.log(`[PARALLEL] PARALLEL PROCESSOR: ${this.numWorkers} workers available (${os.cpus().length} CPU cores)`);
    console.log(`[BENCH] BENCHMARKING: Performance monitoring enabled`);
  }

  // Process tickers in parallel using all CPU cores with detailed benchmarking
  async processTickersInParallel(tickers, optionsFlowService, onProgress, dateRange) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[PROCESSOR] STARTING PARALLEL PROCESSING`);
    console.log(`${'='.repeat(80)}`);
    console.log(`[PROCESSOR] Total tickers: ${tickers.length}`);
    console.log(`[PROCESSOR] Available workers: ${this.numWorkers}`);
    console.log(`[PROCESSOR] Date range:`, dateRange);
    
    // [PERF] PERFORMANCE: Start overall timing
    const overallStartTime = performance.now();
    console.time('[TOTAL] TOTAL_PARALLEL_PROCESSING');

    console.log(`[PARALLEL] PARALLEL: Processing ${tickers.length} tickers across ${this.numWorkers} workers`);

    // [PERF] PERFORMANCE: Time batch preparation
    console.time('[BATCH] BATCH_PREPARATION');

    // OPTIMIZED: Distribute tickers evenly across ALL available workers
    const actualWorkers = Math.min(this.numWorkers, tickers.length);
    const optimalBatchSize = Math.ceil(tickers.length / actualWorkers);
    const batches = [];

    console.log(`[BATCH] OPTIMAL DISTRIBUTION: ${tickers.length} tickers / ${actualWorkers} workers = ${optimalBatchSize} tickers per worker`);

    for (let i = 0; i < tickers.length; i += optimalBatchSize) {
      batches.push(tickers.slice(i, i + optimalBatchSize));
    }
    console.timeEnd('[BATCH] BATCH_PREPARATION');

    console.log(`[BATCH] Split into ${batches.length} batches across ${actualWorkers} workers (${optimalBatchSize} tickers each)`);

    // [PERF] PERFORMANCE: Time worker creation phase
    console.time('[WORKERS] WORKER_CREATION_PHASE');
    const workerCreationStart = performance.now();

    const promises = batches.map((batch, index) => {
      // Track when this worker starts being created
      this.benchmarks.workerCreation.set(index, performance.now());
      console.log(`[WORKERS] Creating Worker ${index}: ${batch.length} tickers assigned`);
      return this.createWorkerPromise(batch, index, onProgress, dateRange);
    });

    const workerCreationEnd = performance.now();
    console.timeEnd('[WORKERS] WORKER_CREATION_PHASE');
    console.log(`[PROCESSOR] All ${batches.length} workers created, starting execution...`);

    // [PERF] PERFORMANCE: Time parallel execution phase
    console.time('[EXEC] PARALLEL_EXECUTION');
    const executionStart = performance.now();
    
    console.log(`[PROCESSOR] Waiting for ${promises.length} worker promises to complete...`);
    const results = await Promise.all(promises);
    console.log(`[PROCESSOR] ✓ All workers completed!`);

    const executionEnd = performance.now();
    console.timeEnd('[EXEC] PARALLEL_EXECUTION');

    // [PERF] PERFORMANCE: Time result aggregation phase
    console.time('[AGGREGATE] RESULT_AGGREGATION');
    const aggregationStart = performance.now();

    const allTrades = results.flat();

    const aggregationEnd = performance.now();
    console.timeEnd('[AGGREGATE] RESULT_AGGREGATION');

    const overallEndTime = performance.now();
    console.timeEnd('[TOTAL] TOTAL_PARALLEL_PROCESSING');

    // [PERF] PERFORMANCE: Store phase timings in bottlenecks for analysis
    this.benchmarks.bottlenecks.set('WORKER_CREATION_PHASE', workerCreationEnd - workerCreationStart);
    this.benchmarks.bottlenecks.set('PARALLEL_EXECUTION', executionEnd - executionStart);
    this.benchmarks.bottlenecks.set('RESULT_AGGREGATION', aggregationEnd - aggregationStart);
    this.benchmarks.totalOperations.set('startTime', overallStartTime);
    this.benchmarks.totalOperations.set('endTime', overallEndTime);

    // [PERF] PERFORMANCE: Display comprehensive analytics
    this.displayPerformanceReport();

    return allTrades;
  }

  createWorkerPromise(batch, workerIndex, onProgress, dateRange) {
    return new Promise((resolve) => {
      // [PERF] PERFORMANCE: Track worker creation completion
      const workerCreationComplete = performance.now();
      const creationTime = workerCreationComplete - this.benchmarks.workerCreation.get(workerIndex);
      console.log(`[WORKER] Worker ${workerIndex}: Created in ${creationTime.toFixed(2)}ms`);

      // Send progress update to keep connection alive
      if (onProgress) {
        const totalBatches = this.benchmarks.workerCreation.size;
        onProgress([], `Worker ${workerIndex} processing ${batch.length} tickers (batch ${workerIndex + 1}/${totalBatches})...`, {
          current: workerIndex,
          total: totalBatches,
          batchSize: batch.length
        });
      }

      // Use the separate worker file with more reliable path resolution for Next.js
      const workerPath = path.resolve(process.cwd(), 'src/lib/optionsFlowWorker.js');

      // [PERF] PERFORMANCE: Start tracking this worker's processing time
      const workerProcessingStart = performance.now();
      this.benchmarks.workerProcessing.set(workerIndex, {
        startTime: workerProcessingStart,
        batchSize: batch.length,
        tradesFound: 0,
        apiCalls: 0,
        firstTradeTime: null,
        completionTime: null
      });

      const worker = new Worker(workerPath, {
        workerData: {
          batch,
          workerIndex,
          apiKey: process.env.POLYGON_API_KEY,
          dateRange: dateRange
        }
      });

      let allWorkerTrades = [];

      worker.on('message', (result) => {
        const currentProcessing = this.benchmarks.workerProcessing.get(workerIndex);

        if (result.type === 'trades_found') {
          // ACCUMULATE TRADES and stream them immediately to keep connection alive
          allWorkerTrades.push(...result.trades);
          console.log(`[OK] Worker ${workerIndex}: Found ${result.trades.length} trades from ${result.ticker} ${result.contract} (${allWorkerTrades.length} total)`);

          // [PERF] PERFORMANCE: Track trade discovery metrics
          if (currentProcessing) {
            currentProcessing.tradesFound = allWorkerTrades.length;
            currentProcessing.apiCalls += 1;
            if (result.trades.length > 0 && !currentProcessing.firstTradeTime) {
              currentProcessing.firstTradeTime = performance.now();
            }
          }

          // Send trades immediately to keep connection alive and show progress
          if (onProgress && result.trades.length > 0) {
            onProgress(result.trades, `[LIVE] LIVE: Found ${result.trades.length} trades from ${result.ticker}`, {
              worker: workerIndex,
              ticker: result.ticker,
              contract: result.contract,
              newTrades: result.trades.length,
              workerTotal: allWorkerTrades.length,
              progressive: true // Mark as progressive update
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
        } else if (result.type === 'worker_complete') {
          // [PERF] Worker completed - all trades already streamed incrementally
          const completionTime = performance.now();
          if (currentProcessing) {
            currentProcessing.completionTime = completionTime;
            const totalTime = completionTime - currentProcessing.startTime;

            console.log(`[OK] Worker ${workerIndex}: Completed ${result.processedTickers} tickers in ${totalTime.toFixed(2)}ms, streamed ${result.totalTradesStreamed} trades (${currentProcessing.apiCalls} API calls)`);

            this.benchmarks.workerCompletion.set(workerIndex, {
              ...currentProcessing,
              status: 'success',
              totalTime,
              finalTradeCount: allWorkerTrades.length
            });
          } else {
            console.log(`[OK] Worker ${workerIndex}: Completed - streamed ${result.totalTradesStreamed} trades`);
          }

          resolve(allWorkerTrades); // Return all trades accumulated from incremental streams
          worker.terminate();
        } else if (result.success === 'partial') {
          // [CHUNK] CHUNKED MESSAGE: Accumulate partial results
          allWorkerTrades.push(...result.trades);
          console.log(`[CHUNK] Worker ${workerIndex}: Received chunk ${result.chunkInfo.current}/${result.chunkInfo.total} (${result.trades.length} trades, total: ${allWorkerTrades.length})`);

          // Send progress update for chunked data
          if (onProgress && result.trades.length > 0) {
            onProgress(result.trades, `Worker ${workerIndex}: Processing chunk ${result.chunkInfo.current}/${result.chunkInfo.total}`, {
              worker: workerIndex,
              newTrades: result.trades.length,
              workerTotal: allWorkerTrades.length,
              chunkProgress: result.chunkInfo,
              progressive: true
            });
          }

          // If this is the last chunk, complete the worker
          if (result.chunkInfo.isLast) {
            const completionTime = performance.now();
            if (currentProcessing) {
              currentProcessing.completionTime = completionTime;
              const totalTime = completionTime - currentProcessing.startTime;

              console.log(`[OK] Worker ${workerIndex}: Completed ${currentProcessing.batchSize} tickers in ${totalTime.toFixed(2)}ms, found ${allWorkerTrades.length} trades (${currentProcessing.apiCalls} API calls)`);

              this.benchmarks.workerCompletion.set(workerIndex, {
                ...currentProcessing,
                status: 'success',
                totalTime,
                finalTradeCount: allWorkerTrades.length
              });
            }
            resolve(allWorkerTrades);
            worker.terminate();
          }
        } else if (result.success) {
          // [PERF] PERFORMANCE: Track successful worker completion
          const completionTime = performance.now();
          if (currentProcessing) {
            currentProcessing.completionTime = completionTime;
            const totalTime = completionTime - currentProcessing.startTime;

            console.log(`[OK] Worker ${workerIndex}: Completed ${currentProcessing.batchSize} tickers in ${totalTime.toFixed(2)}ms, found ${currentProcessing.tradesFound} trades (${currentProcessing.apiCalls} API calls)`);

            this.benchmarks.workerCompletion.set(workerIndex, {
              ...currentProcessing,
              status: 'success',
              totalTime,
              finalTradeCount: result.trades.length
            });
          } else {
            console.log(`[OK] Worker ${workerIndex}: Completed batch - found ${result.trades.length} trades from ${batch.length} tickers`);
          }

          resolve(allWorkerTrades); // Return accumulated trades
          worker.terminate();
        } else {
          // [PERF] PERFORMANCE: Track failed worker completion
          console.error(`[ERROR] Worker ${workerIndex} error:`, result.error);
          if (currentProcessing) {
            currentProcessing.completionTime = performance.now();
            this.benchmarks.workerCompletion.set(workerIndex, {
              ...currentProcessing,
              status: 'failed',
              error: result.error,
              finalTradeCount: allWorkerTrades.length
            });
          }
          resolve(allWorkerTrades); // Return whatever we got so far
          worker.terminate();
        }
      });

      worker.on('error', (error) => {
        console.error(`[WARN] Worker ${workerIndex} crashed:`, error.message);
        console.error(`   Stack trace:`, error.stack);
        console.error(`   Worker had ${allWorkerTrades.length} trades accumulated before crash`);
        resolve(allWorkerTrades); // Return whatever we got so far
      });

      worker.on('exit', (code) => {
        if (code !== 0) {
          console.error(`[WARN] Worker ${workerIndex} exited with code ${code}`);
          console.error(`   Accumulated ${allWorkerTrades.length} trades before exit`);
          console.error(`   This usually indicates memory issues or message size limits`);
          console.error(`   Consider processing fewer tickers per worker or implementing chunked responses`);
          resolve(allWorkerTrades); // Return whatever we got so far
        }
      });
    });
  }

  // [PERF] PERFORMANCE ANALYTICS: Comprehensive performance report
  displayPerformanceReport() {
    console.log('\n' + '='.repeat(80));
    console.log('[PERF] PARALLEL PROCESSING PERFORMANCE REPORT');
    console.log('='.repeat(80));

    // Overall operation metrics
    const totalOperationsTime = this.benchmarks.totalOperations.get('endTime') - this.benchmarks.totalOperations.get('startTime');
    console.log(`[TIME] Total Operation Time: ${totalOperationsTime.toFixed(2)}ms`);

    // Worker creation analysis
    if (this.benchmarks.workerCreation.size > 0) {
      const creationTimes = Array.from(this.benchmarks.workerCreation.values());
      const avgCreationTime = creationTimes.reduce((sum, time) => sum + time, 0) / creationTimes.length;
      const maxCreationTime = Math.max(...creationTimes);
      console.log(`\n[WORKERS] Worker Creation:`);
      console.log(`   Average: ${avgCreationTime.toFixed(2)}ms | Max: ${maxCreationTime.toFixed(2)}ms | Count: ${creationTimes.length}`);
    }

    // Worker processing analysis
    if (this.benchmarks.workerCompletion.size > 0) {
      const completions = Array.from(this.benchmarks.workerCompletion.values());
      const successfulWorkers = completions.filter(w => w.status === 'success');
      const failedWorkers = completions.filter(w => w.status === 'failed');

      console.log(`\n[WORKERS] Worker Processing:`);
      console.log(`   Successful: ${successfulWorkers.length} | Failed: ${failedWorkers.length}`);

      if (successfulWorkers.length > 0) {
        const processingTimes = successfulWorkers.map(w => w.totalTime);
        const avgProcessingTime = processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length;
        const maxProcessingTime = Math.max(...processingTimes);
        const minProcessingTime = Math.min(...processingTimes);

        console.log(`   Processing Time - Avg: ${avgProcessingTime.toFixed(2)}ms | Min: ${minProcessingTime.toFixed(2)}ms | Max: ${maxProcessingTime.toFixed(2)}ms`);

        const totalTrades = successfulWorkers.reduce((sum, w) => sum + (w.finalTradeCount || 0), 0);
        const totalApiCalls = successfulWorkers.reduce((sum, w) => sum + (w.apiCalls || 0), 0);
        const totalTickers = successfulWorkers.reduce((sum, w) => sum + w.batchSize, 0);

        console.log(`   Total Trades Found: ${totalTrades}`);
        console.log(`   Total API Calls: ${totalApiCalls}`);
        console.log(`   Total Tickers Processed: ${totalTickers}`);
        console.log(`   Trades per Second: ${(totalTrades / (totalOperationsTime / 1000)).toFixed(2)}`);
        console.log(`   API Calls per Second: ${(totalApiCalls / (totalOperationsTime / 1000)).toFixed(2)}`);
      }

      if (failedWorkers.length > 0) {
        console.log(`\n[WARN] Failed Workers:`);
        failedWorkers.forEach((worker, index) => {
          console.log(`   Worker ${index}: ${worker.error || 'Unknown error'}`);
        });
      }
    }

    // Bottleneck analysis
    if (this.benchmarks.bottlenecks.size > 0) {
      console.log(`\n[BOTTLENECK] Bottleneck Analysis:`);
      for (const [phase, time] of this.benchmarks.bottlenecks.entries()) {
        const percentage = ((time / totalOperationsTime) * 100).toFixed(1);
        console.log(`   ${phase}: ${time.toFixed(2)}ms (${percentage}% of total)`);
      }

      // Find the slowest phase
      const slowestPhase = Array.from(this.benchmarks.bottlenecks.entries())
        .reduce((max, [phase, time]) => time > max.time ? { phase, time } : max, { phase: '', time: 0 });

      if (slowestPhase.time > 0) {
        console.log(`\n[PERF] Primary Bottleneck: ${slowestPhase.phase} (${((slowestPhase.time / totalOperationsTime) * 100).toFixed(1)}% of total time)`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('[RECOMMEND] Performance Recommendations:');

    if (this.benchmarks.workerCompletion.size > 0) {
      const completions = Array.from(this.benchmarks.workerCompletion.values()).filter(w => w.status === 'success');
      if (completions.length > 0) {
        const avgTime = completions.reduce((sum, w) => sum + w.totalTime, 0) / completions.length;
        const maxTime = Math.max(...completions.map(w => w.totalTime));
        const variance = maxTime - Math.min(...completions.map(w => w.totalTime));

        if (variance > avgTime * 0.5) {
          console.log('[NOTE] High variance in worker completion times - consider load balancing optimization');
        }

        if (avgTime > 5000) {
          console.log('[NOTE] Worker processing time is high - consider GPU acceleration for calculations');
        }

        const totalApiCalls = completions.reduce((sum, w) => sum + (w.apiCalls || 0), 0);
        if (totalApiCalls > completions.length * 30) {
          console.log('[NOTE] High API call frequency - implement caching for repeated requests');
        }
      }
    }

    console.log('='.repeat(80) + '\n');
  }
}

module.exports = { ParallelOptionsFlowProcessor };
