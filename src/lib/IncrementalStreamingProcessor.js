/**
 * 🚀 INCREMENTAL STREAMING PROCESSOR
 * Streams results in small batches instead of waiting for full completion
 * Reduces perceived latency and provides real-time feedback
 */

const { Worker } = require('worker_threads');
const path = require('path');

class IncrementalStreamingProcessor {
  constructor(maxWorkers = 32) {
    this.maxWorkers = maxWorkers;
    this.streamingBatchSize = 5; // Stream results every 5 tickers
    this.activeStreams = new Map(); // workerId -> stream info
    
    console.log(`🌊 Incremental Streaming Processor initialized with ${maxWorkers} workers`);
    console.log(`📦 Streaming batch size: ${this.streamingBatchSize} tickers per stream`);
  }
  
  /**
   * 🔥 PROCESS TICKERS WITH INCREMENTAL STREAMING
   * Workers send results incrementally instead of waiting for completion
   */
  async processTickersWithStreaming(tickers, onProgress, onIncrementalResult) {
    const streamingStart = performance.now();
    console.time('🌊 INCREMENTAL_STREAMING_PROCESS');
    
    console.log(`🌊 Starting incremental streaming for ${tickers.length} tickers`);
    
    // Calculate optimal batch size per worker
    const batchSize = Math.ceil(tickers.length / this.maxWorkers);
    const batches = [];
    
    for (let i = 0; i < tickers.length; i += batchSize) {
      batches.push(tickers.slice(i, i + batchSize));
    }
    
    console.log(`📦 Created ${batches.length} worker batches, ~${batchSize} tickers each`);
    
    // Track streaming metrics
    let totalStreamedResults = 0;
    let totalStreamingEvents = 0;
    const streamingMetrics = {
      firstStreamTime: null,
      lastStreamTime: null,
      averageStreamLatency: 0,
      streamsPerWorker: new Map()
    };
    
    // Create streaming worker promises
    const workerPromises = batches.map((batch, workerIndex) => {
      return this.createStreamingWorkerPromise(
        batch, 
        workerIndex, 
        onProgress,
        (streamData) => {
          // Handle incremental results
          const streamTime = performance.now();
          
          if (!streamingMetrics.firstStreamTime) {
            streamingMetrics.firstStreamTime = streamTime;
          }
          streamingMetrics.lastStreamTime = streamTime;
          
          totalStreamedResults += streamData.results.length;
          totalStreamingEvents++;
          
          // Track per-worker streaming
          const workerStreams = streamingMetrics.streamsPerWorker.get(workerIndex) || 0;
          streamingMetrics.streamsPerWorker.set(workerIndex, workerStreams + 1);
          
          console.log(`🌊 Stream ${totalStreamingEvents}: Worker ${workerIndex} sent ${streamData.results.length} results (${streamData.completedTickers}/${streamData.totalTickers} tickers complete)`);
          
          // Forward to user callback
          if (onIncrementalResult) {
            onIncrementalResult({
              ...streamData,
              workerIndex,
              streamNumber: totalStreamingEvents,
              totalStreamed: totalStreamedResults
            });
          }
        }
      );
    });
    
    // Wait for all workers to complete
    const allResults = await Promise.all(workerPromises);
    
    const streamingEnd = performance.now();
    console.timeEnd('🌊 INCREMENTAL_STREAMING_PROCESS');
    
    // Calculate streaming performance metrics
    const totalStreamingTime = streamingEnd - streamingStart;
    const streamingLatency = streamingMetrics.firstStreamTime ? 
      streamingMetrics.firstStreamTime - streamingStart : 0;
    
    console.log('\\n' + '='.repeat(80));
    console.log('🌊 INCREMENTAL STREAMING PERFORMANCE REPORT');
    console.log('='.repeat(80));
    console.log(`📊 Total Processing Time: ${totalStreamingTime.toFixed(2)}ms`);
    console.log(`⚡ First Stream Latency: ${streamingLatency.toFixed(2)}ms`);
    console.log(`📦 Total Streaming Events: ${totalStreamingEvents}`);
    console.log(`📈 Results Streamed: ${totalStreamedResults}`);
    
    if (totalStreamingEvents > 0) {
      const avgResultsPerStream = totalStreamedResults / totalStreamingEvents;
      const streamingFrequency = totalStreamingEvents / (totalStreamingTime / 1000);
      console.log(`📊 Average Results per Stream: ${avgResultsPerStream.toFixed(1)}`);
      console.log(`🔄 Streaming Frequency: ${streamingFrequency.toFixed(2)} streams/second`);
    }
    
    // Per-worker streaming analysis
    console.log(`\\n🏭 Worker Streaming Performance:`);
    for (const [workerIndex, streamCount] of streamingMetrics.streamsPerWorker.entries()) {
      const workerResults = allResults[workerIndex] ? allResults[workerIndex].length : 0;
      console.log(`   Worker ${workerIndex}: ${streamCount} streams, ${workerResults} total results`);
    }
    
    console.log('='.repeat(80) + '\\n');
    
    // Flatten all results
    const finalResults = allResults.flat();
    console.log(`✅ Incremental streaming complete: ${finalResults.length} total results from ${totalStreamingEvents} streams`);
    
    return finalResults;
  }
  
  /**
   * 🔥 CREATE STREAMING WORKER PROMISE
   * Worker sends incremental results as it processes tickers
   */
  createStreamingWorkerPromise(batch, workerIndex, onProgress, onStream) {
    return new Promise((resolve, reject) => {
      const workerPath = path.resolve(process.cwd(), 'src/lib/streamingOptionsFlowWorker.js');
      
      // Initialize streaming tracking for this worker
      this.activeStreams.set(workerIndex, {
        startTime: performance.now(),
        totalTickers: batch.length,
        completedTickers: 0,
        streamedResults: 0,
        streamCount: 0
      });
      
      console.log(`🌊 Starting streaming worker ${workerIndex} with ${batch.length} tickers`);
      
      const worker = new Worker(workerPath, {
        workerData: {
          batch,
          workerIndex,
          streamingBatchSize: this.streamingBatchSize,
          apiKey: process.env.POLYGON_API_KEY
        }
      });
      
      let accumulatedResults = [];
      let streamingActive = true;
      
      worker.on('message', (message) => {
        const streamInfo = this.activeStreams.get(workerIndex);
        
        switch (message.type) {
          case 'incremental_stream':
            // Handle incremental result stream
            if (streamingActive && streamInfo) {
              streamInfo.completedTickers = message.completedTickers;
              streamInfo.streamedResults += message.results.length;
              streamInfo.streamCount++;
              
              accumulatedResults.push(...message.results);
              
              // Forward stream to callback
              onStream({
                results: message.results,
                completedTickers: message.completedTickers,
                totalTickers: streamInfo.totalTickers,
                streamBatch: message.streamBatch,
                ticker: message.ticker
              });
            }
            break;
            
          case 'ticker_progress':
            // Regular progress updates
            if (onProgress) {
              onProgress([], `Worker ${workerIndex}: ${message.message}`, {
                worker: workerIndex,
                ticker: message.ticker,
                scanning: true
              });
            }
            break;
            
          case 'worker_complete':
            // Final completion
            streamingActive = false;
            
            if (streamInfo) {
              const totalTime = performance.now() - streamInfo.startTime;
              console.log(`✅ Streaming worker ${workerIndex}: Completed ${streamInfo.totalTickers} tickers in ${totalTime.toFixed(2)}ms, sent ${streamInfo.streamCount} streams with ${streamInfo.streamedResults} results`);
            }
            
            // Add any final results not yet streamed
            if (message.finalResults && message.finalResults.length > 0) {
              accumulatedResults.push(...message.finalResults);
            }
            
            worker.terminate();
            this.activeStreams.delete(workerIndex);
            resolve(accumulatedResults);
            break;
            
          case 'error':
            console.error(`❌ Streaming worker ${workerIndex} error:`, message.error);
            streamingActive = false;
            worker.terminate();
            this.activeStreams.delete(workerIndex);
            resolve(accumulatedResults); // Return what we have
            break;
        }
      });
      
      worker.on('error', (error) => {
        console.error(`❌ Streaming worker ${workerIndex} crashed:`, error.message);
        streamingActive = false;
        this.activeStreams.delete(workerIndex);
        resolve(accumulatedResults);
      });
      
      // Set timeout for worker completion
      const timeout = setTimeout(() => {
        console.warn(`⚠️ Streaming worker ${workerIndex} timeout after 30s`);
        streamingActive = false;
        worker.terminate();
        this.activeStreams.delete(workerIndex);
        resolve(accumulatedResults);
      }, 30000);
      
      worker.on('exit', () => {
        clearTimeout(timeout);
      });
    });
  }
  
  /**
   * Get current streaming status
   */
  getStreamingStatus() {
    const activeWorkers = this.activeStreams.size;
    const streamingData = Array.from(this.activeStreams.entries()).map(([workerIndex, stream]) => ({
      workerIndex,
      progress: `${stream.completedTickers}/${stream.totalTickers}`,
      streams: stream.streamCount,
      results: stream.streamedResults,
      runtime: `${(performance.now() - stream.startTime).toFixed(0)}ms`
    }));
    
    return {
      activeWorkers,
      maxWorkers: this.maxWorkers,
      streamingBatchSize: this.streamingBatchSize,
      workers: streamingData
    };
  }
}

module.exports = IncrementalStreamingProcessor;