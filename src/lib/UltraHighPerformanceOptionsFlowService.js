/**
 * 🚀 ULTRA-HIGH PERFORMANCE OPTIONS FLOW SERVICE
 * Integrates all performance optimizations:
 * - Comprehensive benchmarking system
 * - Optimized mathematical calculations with caching
 * - Incremental streaming for real-time results
 * - SharedArrayBuffer for ultra-fast data processing
 * - Smart caching and memory management
 */

const ParallelOptionsFlowProcessor = require('./ParallelOptionsFlowProcessor');
const IncrementalStreamingProcessor = require('./IncrementalStreamingProcessor');
const OptimizedCalculationEngine = require('./OptimizedCalculationEngine');

class UltraHighPerformanceOptionsFlowService {
  constructor(options = {}) {
    this.maxWorkers = options.maxWorkers || 32;
    this.enableStreaming = options.enableStreaming !== false;
    this.enableCalculationOptimization = options.enableCalculationOptimization !== false;
    this.enableBenchmarking = options.enableBenchmarking !== false;
    
    console.log('🚀 Initializing Ultra-High Performance Options Flow Service...');
    console.log(`⚙️ Configuration: ${this.maxWorkers} workers, streaming=${this.enableStreaming}, calc-optimization=${this.enableCalculationOptimization}, benchmarking=${this.enableBenchmarking}`);
    
    // Initialize processing engines
    this.parallelProcessor = new ParallelOptionsFlowProcessor(this.maxWorkers);
    
    if (this.enableStreaming) {
      this.streamingProcessor = new IncrementalStreamingProcessor(this.maxWorkers);
    }
    
    if (this.enableCalculationOptimization) {
      this.calculationEngine = new OptimizedCalculationEngine();
    }
    
    // Performance tracking
    this.performanceHistory = [];
    this.processingStats = {
      totalProcessingRuns: 0,
      totalTickersProcessed: 0,
      totalTradesFound: 0,
      totalProcessingTime: 0,
      averageProcessingTime: 0,
      bestProcessingTime: Infinity,
      worstProcessingTime: 0
    };
    
    console.log('✅ Ultra-High Performance Service initialized successfully');
  }
  
  /**
   * 🔥 MAIN HIGH-PERFORMANCE PROCESSING METHOD
   * Automatically selects optimal processing strategy based on workload
   */
  async processOptionsFlow(tickers, onProgress, options = {}) {
    const processStart = performance.now();
    console.log(`\n🚀 ULTRA-HIGH PERFORMANCE PROCESSING STARTED`);
    console.log(`📊 Processing ${tickers.length} tickers with ${this.maxWorkers} workers`);
    
    try {
      // Choose optimal processing strategy
      const strategy = this.selectOptimalStrategy(tickers.length);
      console.log(`🎯 Selected processing strategy: ${strategy.name} (${strategy.reason})`);
      
      let results = [];
      let processingMetrics = {};
      
      switch (strategy.type) {
        case 'incremental_streaming':
          results = await this.processWithIncrementalStreaming(tickers, onProgress, options);
          break;
          
        case 'parallel_optimized':
          results = await this.processWithParallelOptimization(tickers, onProgress, options);
          break;
          
        case 'hybrid_streaming':
          results = await this.processWithHybridStreaming(tickers, onProgress, options);
          break;
          
        default:
          // Fallback to standard parallel processing
          results = await this.parallelProcessor.processTickersInParallel(tickers, onProgress);
      }
      
      // Post-process results with optimized calculations if enabled
      if (this.enableCalculationOptimization && results.length > 0) {
        results = await this.enhanceResultsWithOptimizedCalculations(results);
      }
      
      // Update performance statistics
      const processTime = performance.now() - processStart;
      this.updatePerformanceStats(tickers.length, results.length, processTime);
      
      console.log(`\n🏁 ULTRA-HIGH PERFORMANCE PROCESSING COMPLETE`);
      console.log(`⏱️ Total time: ${processTime.toFixed(2)}ms | Trades found: ${results.length} | Rate: ${(results.length / (processTime / 1000)).toFixed(2)} trades/sec`);
      
      return results;
      
    } catch (error) {
      console.error('❌ Ultra-High Performance Processing failed:', error);
      throw error;
    }
  }
  
  /**
   * 🎯 STRATEGY SELECTOR
   * Intelligently selects the optimal processing strategy based on workload
   */
  selectOptimalStrategy(tickerCount) {
    // Strategy decision matrix based on workload characteristics
    if (tickerCount <= 50) {
      return {
        type: 'parallel_optimized',
        name: 'Parallel Optimized',
        reason: 'Small workload - optimize for raw speed'
      };
    } else if (tickerCount <= 200) {
      return {
        type: 'incremental_streaming',
        name: 'Incremental Streaming',
        reason: 'Medium workload - optimize for responsiveness'
      };
    } else {
      return {
        type: 'hybrid_streaming',
        name: 'Hybrid Streaming',
        reason: 'Large workload - balance speed and responsiveness'
      };
    }
  }
  
  /**
   * 🌊 INCREMENTAL STREAMING PROCESSING
   */
  async processWithIncrementalStreaming(tickers, onProgress, options) {
    console.log('🌊 Using Incremental Streaming strategy...');
    
    if (!this.enableStreaming || !this.streamingProcessor) {
      console.warn('⚠️ Streaming not enabled, falling back to parallel processing');
      return await this.parallelProcessor.processTickersInParallel(tickers, onProgress);
    }
    
    return await this.streamingProcessor.processTickersWithStreaming(
      tickers,
      onProgress,
      (streamData) => {
        // Handle real-time incremental results
        console.log(`🌊 Incremental result: ${streamData.results.length} trades from worker ${streamData.workerIndex} (stream ${streamData.streamNumber})`);
        
        if (options.onIncrementalResult) {
          options.onIncrementalResult(streamData);
        }
      }
    );
  }
  
  /**
   * ⚡ PARALLEL OPTIMIZED PROCESSING
   */
  async processWithParallelOptimization(tickers, onProgress, options) {
    console.log('⚡ Using Parallel Optimized strategy...');
    
    // Use the enhanced parallel processor with full benchmarking
    return await this.parallelProcessor.processTickersInParallel(tickers, onProgress);
  }
  
  /**
   * 🔥 HYBRID STREAMING PROCESSING
   * Combines parallel processing with streaming for optimal performance
   */
  async processWithHybridStreaming(tickers, onProgress, options) {
    console.log('🔥 Using Hybrid Streaming strategy...');
    
    // Split workload into chunks for hybrid processing
    const chunkSize = Math.ceil(tickers.length / 4); // Process in 4 major chunks
    const chunks = [];
    
    for (let i = 0; i < tickers.length; i += chunkSize) {
      chunks.push(tickers.slice(i, i + chunkSize));
    }
    
    console.log(`📦 Hybrid processing: ${chunks.length} chunks of ~${chunkSize} tickers each`);
    
    let allResults = [];
    let chunkNumber = 1;
    
    // Process chunks with streaming
    for (const chunk of chunks) {
      console.log(`🔄 Processing chunk ${chunkNumber}/${chunks.length} (${chunk.length} tickers)...`);
      
      const chunkResults = await this.processWithIncrementalStreaming(
        chunk,
        (newTrades, message, metadata) => {
          // Augment progress with chunk information
          if (onProgress) {
            onProgress(newTrades, `Chunk ${chunkNumber}/${chunks.length}: ${message}`, {
              ...metadata,
              chunk: chunkNumber,
              totalChunks: chunks.length
            });
          }
        },
        options
      );
      
      allResults.push(...chunkResults);
      chunkNumber++;
      
      console.log(`✅ Chunk ${chunkNumber-1} complete: ${chunkResults.length} trades found`);
      
      // Brief pause between chunks to manage system resources
      if (chunkNumber <= chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    return allResults;
  }
  
  /**
   * 🧮 ENHANCE RESULTS WITH OPTIMIZED CALCULATIONS
   * Add computed fields using high-performance calculation engine
   */
  async enhanceResultsWithOptimizedCalculations(results) {
    if (!this.enableCalculationOptimization || !this.calculationEngine) {
      return results;
    }
    
    console.log(`🧮 Enhancing ${results.length} results with optimized calculations...`);
    const enhanceStart = performance.now();
    
    try {
      // Prepare batch calculations
      const calculations = results.map((trade, index) => ({
        type: 'vwap',
        params: {
          prices: [trade.price],
          volumes: [trade.size || 1]
        },
        resultIndex: index
      }));
      
      // Perform batch calculations
      const calculationResults = await this.calculationEngine.calculateBatch(calculations);
      
      // Enhance results with calculated values
      const enhancedResults = results.map((trade, index) => ({
        ...trade,
        calculatedVWAP: calculationResults[index],
        enhanced: true,
        enhancedAt: Date.now()
      }));
      
      const enhanceTime = performance.now() - enhanceStart;
      console.log(`✅ Results enhanced in ${enhanceTime.toFixed(2)}ms with calculation engine (${this.calculationEngine.getPerformanceStats().cacheHitRate} cache hit rate)`);
      
      return enhancedResults;
      
    } catch (error) {
      console.error('❌ Result enhancement failed:', error);
      return results; // Return original results if enhancement fails
    }
  }
  
  /**
   * 📊 UPDATE PERFORMANCE STATISTICS
   */
  updatePerformanceStats(tickerCount, tradeCount, processingTime) {
    this.processingStats.totalProcessingRuns++;
    this.processingStats.totalTickersProcessed += tickerCount;
    this.processingStats.totalTradesFound += tradeCount;
    this.processingStats.totalProcessingTime += processingTime;
    
    this.processingStats.averageProcessingTime = this.processingStats.totalProcessingTime / this.processingStats.totalProcessingRuns;
    
    if (processingTime < this.processingStats.bestProcessingTime) {
      this.processingStats.bestProcessingTime = processingTime;
    }
    
    if (processingTime > this.processingStats.worstProcessingTime) {
      this.processingStats.worstProcessingTime = processingTime;
    }
    
    // Store detailed performance history
    this.performanceHistory.push({
      timestamp: Date.now(),
      tickerCount,
      tradeCount,
      processingTime,
      tradesPerSecond: tradeCount / (processingTime / 1000),
      tickersPerSecond: tickerCount / (processingTime / 1000)
    });
    
    // Keep only last 100 runs
    if (this.performanceHistory.length > 100) {
      this.performanceHistory = this.performanceHistory.slice(-100);
    }
  }
  
  /**
   * 📈 GET COMPREHENSIVE PERFORMANCE REPORT
   */
  getPerformanceReport() {
    console.log('\\n' + '='.repeat(80));
    console.log('🚀 ULTRA-HIGH PERFORMANCE SERVICE REPORT');
    console.log('='.repeat(80));
    
    console.log(`📊 Processing Statistics:`);
    console.log(`   Total Runs: ${this.processingStats.totalProcessingRuns}`);
    console.log(`   Total Tickers Processed: ${this.processingStats.totalTickersProcessed.toLocaleString()}`);
    console.log(`   Total Trades Found: ${this.processingStats.totalTradesFound.toLocaleString()}`);
    console.log(`   Total Processing Time: ${(this.processingStats.totalProcessingTime / 1000).toFixed(1)}s`);
    
    console.log(`\\n⏱️ Performance Metrics:`);
    console.log(`   Average Processing Time: ${this.processingStats.averageProcessingTime.toFixed(2)}ms`);
    console.log(`   Best Processing Time: ${this.processingStats.bestProcessingTime.toFixed(2)}ms`);
    console.log(`   Worst Processing Time: ${this.processingStats.worstProcessingTime.toFixed(2)}ms`);
    
    if (this.processingStats.totalProcessingRuns > 0) {
      const avgTradesPerSecond = (this.processingStats.totalTradesFound / (this.processingStats.totalProcessingTime / 1000)).toFixed(2);
      const avgTickersPerSecond = (this.processingStats.totalTickersProcessed / (this.processingStats.totalProcessingTime / 1000)).toFixed(2);
      
      console.log(`   Average Trades per Second: ${avgTradesPerSecond}`);
      console.log(`   Average Tickers per Second: ${avgTickersPerSecond}`);
    }
    
    // Engine-specific statistics
    if (this.enableCalculationOptimization && this.calculationEngine) {
      console.log(`\\n🧮 Calculation Engine Performance:`);
      const calcStats = this.calculationEngine.getPerformanceStats();
      console.log(`   Cache Hit Rate: ${calcStats.cacheHitRate}`);
      console.log(`   Cache Size: ${calcStats.cacheSize} entries`);
      console.log(`   Cache Hits: ${calcStats.cacheHits.toLocaleString()}`);
      console.log(`   Cache Misses: ${calcStats.cacheMisses.toLocaleString()}`);
    }
    
    if (this.enableStreaming && this.streamingProcessor) {
      console.log(`\\n🌊 Streaming Performance:`);
      const streamStatus = this.streamingProcessor.getStreamingStatus();
      console.log(`   Max Workers: ${streamStatus.maxWorkers}`);
      console.log(`   Streaming Batch Size: ${streamStatus.streamingBatchSize}`);
      console.log(`   Currently Active Workers: ${streamStatus.activeWorkers}`);
    }
    
    console.log('='.repeat(80) + '\\n');
    
    return {
      stats: this.processingStats,
      history: this.performanceHistory.slice(-10), // Last 10 runs
      calculationEngine: this.enableCalculationOptimization ? this.calculationEngine?.getPerformanceStats() : null,
      streamingStatus: this.enableStreaming ? this.streamingProcessor?.getStreamingStatus() : null
    };
  }
  
  /**
   * 🧹 CLEAR PERFORMANCE DATA
   */
  clearPerformanceData() {
    this.performanceHistory = [];
    this.processingStats = {
      totalProcessingRuns: 0,
      totalTickersProcessed: 0,
      totalTradesFound: 0,
      totalProcessingTime: 0,
      averageProcessingTime: 0,
      bestProcessingTime: Infinity,
      worstProcessingTime: 0
    };
    
    if (this.calculationEngine) {
      this.calculationEngine.clearCache();
    }
    
    console.log('🧹 Performance data cleared');
  }
}

module.exports = UltraHighPerformanceOptionsFlowService;