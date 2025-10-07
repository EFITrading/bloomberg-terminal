// Background data preloader service - fetches popular data before users request it
import UltraFastCache, { UltraFastDataCache } from './UltraFastCache';
import { TOP_1800_SYMBOLS, TOP_1000_SYMBOLS, PRELOAD_TIERS } from './Top1000Symbols';

interface PreloadConfig {
  symbols: string[];
  dataTypes: ('historical' | 'options' | 'seasonal' | 'flow' | 'gex' | 'details' | 'quotes')[];
  schedule: {
    interval: number; // minutes
    marketHours: boolean;
    preMarket: boolean;
    afterHours: boolean;
  };
}

interface PreloadStats {
  totalSymbols: number;
  loadedSymbols: number;
  failedSymbols: number;
  lastPreload: string;
  nextPreload: string;
  cacheHitRate: number;
}

class DataPreloaderService {
  private isRunning = false;
  private preloadInterval: NodeJS.Timeout | null = null;
  private stats: PreloadStats = {
    totalSymbols: 0,
    loadedSymbols: 0,
    failedSymbols: 0,
    lastPreload: '',
    nextPreload: '',
    cacheHitRate: 0
  };

  // TOP 1000 STOCKS - Universal coverage for instant loading
  private readonly TOP_1000_SYMBOLS = TOP_1000_SYMBOLS;

  private readonly DEFAULT_CONFIG: PreloadConfig = {
    symbols: this.TOP_1000_SYMBOLS,
    dataTypes: ['historical', 'options', 'details', 'quotes'],
    schedule: {
      interval: 15, // Every 15 minutes for 1000 stocks
      marketHours: true,
      preMarket: true,
      afterHours: false
    }
  };

  constructor(private cache: typeof UltraFastCache, private config: PreloadConfig = this.DEFAULT_CONFIG) {
    console.log('🔄 DataPreloaderService initialized');
    this.updateStats();
  }

  // Start preloading service
  start(): void {
    if (this.isRunning) {
      console.log('⚠️ Preloader already running');
      return;
    }

    this.isRunning = true;
    console.log(`🚀 Starting preloader for ${this.config.symbols.length} symbols`);
    
    // Initial preload
    this.preloadData();
    
    // Schedule regular preloads
    this.preloadInterval = setInterval(() => {
      if (this.shouldPreload()) {
        this.preloadData();
      }
    }, this.config.schedule.interval * 60 * 1000);

    console.log(`⏰ Preloader scheduled every ${this.config.schedule.interval} minutes`);
  }

  // Stop preloading service
  stop(): void {
    if (!this.isRunning) {
      console.log('⚠️ Preloader not running');
      return;
    }

    this.isRunning = false;
    
    if (this.preloadInterval) {
      clearInterval(this.preloadInterval);
      this.preloadInterval = null;
    }

    console.log('⏹️ Preloader stopped');
  }

  // Check if we should preload based on market hours
  private shouldPreload(): boolean {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;

    // Skip weekends unless configured otherwise
    if (isWeekend) return false;

    // Market hours: 9:30 AM - 4:00 PM ET
    const isMarketHours = (hour === 9 && minute >= 30) || (hour >= 10 && hour < 16);
    const isPreMarket = hour >= 4 && hour < 9; // 4:00 AM - 9:30 AM ET
    const isAfterHours = hour >= 16 && hour < 20; // 4:00 PM - 8:00 PM ET

    return (
      (isMarketHours && this.config.schedule.marketHours) ||
      (isPreMarket && this.config.schedule.preMarket) ||
      (isAfterHours && this.config.schedule.afterHours)
    );
  }

  // Smart tiered preloading for top 1000 stocks
  private async preloadData(): Promise<void> {
    const startTime = Date.now();
    console.log(`� Starting SMART preload of TOP 1000 stocks...`);

    // Determine which tier to preload based on time
    const now = new Date();
    const minute = now.getMinutes();
    
    let symbolsToPreload: string[] = [];
    let tierName = '';

    if (minute % 5 === 0) {
      // Every 5 minutes - Tier 1 (Top 100)
      symbolsToPreload = PRELOAD_TIERS.TIER_1_INSTANT;
      tierName = 'TIER 1 (Top 100)';
    } else if (minute % 15 === 0) {
      // Every 15 minutes - Tier 2 (101-300)
      symbolsToPreload = PRELOAD_TIERS.TIER_2_FAST;
      tierName = 'TIER 2 (101-300)';
    } else if (minute % 30 === 0) {
      // Every 30 minutes - Tier 3 (301-600)
      symbolsToPreload = PRELOAD_TIERS.TIER_3_REGULAR;
      tierName = 'TIER 3 (301-600)';
    } else if (minute % 60 === 0) {
      // Every hour - Tier 4 (601-1000)
      symbolsToPreload = PRELOAD_TIERS.TIER_4_BACKGROUND;
      tierName = 'TIER 4 (601-1000)';
    } else {
      // Default to top 100 if no tier matches
      symbolsToPreload = PRELOAD_TIERS.TIER_1_INSTANT;
      tierName = 'TIER 1 (Default)';
    }

    console.log(`⚡ Preloading ${tierName}: ${symbolsToPreload.length} symbols`);

    // Process in optimized batches for speed
    const BATCH_SIZE = 10; // Reduced for better API rate limiting (was 20)
    const results = [];

    for (let i = 0; i < symbolsToPreload.length; i += BATCH_SIZE) {
      const batch = symbolsToPreload.slice(i, i + BATCH_SIZE);
      
      console.log(`📦 Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(symbolsToPreload.length/BATCH_SIZE)}: ${batch.length} symbols`);
      
      const batchResults = await Promise.allSettled(
        batch.map(symbol => this.preloadSymbol(symbol))
      );
      
      results.push(...batchResults);
      
      // Small delay between batches to prevent overwhelming the API
      if (i + BATCH_SIZE < symbolsToPreload.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Update stats
    this.stats.totalSymbols = symbolsToPreload.length;
    this.stats.loadedSymbols = results.filter(r => r.status === 'fulfilled').length;
    this.stats.failedSymbols = results.filter(r => r.status === 'rejected').length;
    this.stats.lastPreload = new Date().toISOString();
    this.stats.nextPreload = new Date(Date.now() + this.config.schedule.interval * 60 * 1000).toISOString();

    const totalTime = Date.now() - startTime;
    const successRate = Math.round((this.stats.loadedSymbols / this.stats.totalSymbols) * 100);
    
    console.log(`✅ ${tierName} COMPLETE: ${this.stats.loadedSymbols}/${this.stats.totalSymbols} symbols (${successRate}%) in ${totalTime}ms`);
    console.log(`⚡ Average: ${Math.round(totalTime / this.stats.totalSymbols)}ms per symbol`);
  }

  // Preload all data types for a single symbol
  private async preloadSymbol(symbol: string): Promise<void> {
    const tasks = this.config.dataTypes.map(dataType => 
      this.preloadDataType(symbol, dataType)
    );

    await Promise.allSettled(tasks);
  }

  // Preload specific data type for a symbol
  private async preloadDataType(symbol: string, dataType: string): Promise<void> {
    try {
      let key: string;
      let apiEndpoint: string;

      switch (dataType) {
        case 'historical':
          key = UltraFastDataCache.keys.HISTORICAL(symbol, '1d', '1y');
          apiEndpoint = `/api/historical-data?symbol=${symbol}&startDate=${this.getDateString(365)}&endDate=${this.getDateString(0)}`;
          break;

        case 'options':
          key = UltraFastDataCache.keys.OPTIONS(symbol);
          apiEndpoint = `/api/polygon-options?ticker=${symbol}`;
          break;

        case 'details':
          key = UltraFastDataCache.keys.DETAILS(symbol);
          apiEndpoint = `/api/ticker-details?symbol=${symbol}`;
          break;

        case 'quotes':
          key = UltraFastDataCache.keys.QUOTES(symbol);
          apiEndpoint = `/api/realtime-quotes?symbol=${symbol}`;
          break;

        case 'seasonal':
          key = UltraFastDataCache.keys.SEASONAL(symbol, 5);
          apiEndpoint = `/api/seasonal-data?symbol=${symbol}&years=5`;
          break;

        case 'gex':
          key = UltraFastDataCache.keys.GEX(symbol);
          apiEndpoint = `/api/gex?symbol=${symbol}`;
          break;

        case 'flow':
          key = UltraFastDataCache.keys.FLOW(symbol);
          apiEndpoint = `/api/options-flow?symbol=${symbol}`;
          break;

        default:
          throw new Error(`Unknown data type: ${dataType}`);
      }

      // Check if already cached and not expired
      const cached = this.cache.get(key);
      if (cached) {
        console.log(`⚡ ${symbol} ${dataType} already cached`);
        return;
      }

      // Fetch from API
      const response = await fetch(apiEndpoint, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Cache the data with appropriate TTL
      this.cache.set(key, data, dataType as keyof typeof this.cache['TTL_CONFIG']);
      
      console.log(`💾 Preloaded ${symbol} ${dataType}`);

    } catch (error) {
      console.error(`❌ Failed to preload ${symbol} ${dataType}:`, error);
      throw error;
    }
  }

  // Add symbol to preload list
  addSymbol(symbol: string): void {
    if (!this.config.symbols.includes(symbol)) {
      this.config.symbols.push(symbol);
      console.log(`➕ Added ${symbol} to preload list`);
    }
  }

  // Remove symbol from preload list
  removeSymbol(symbol: string): void {
    const index = this.config.symbols.indexOf(symbol);
    if (index > -1) {
      this.config.symbols.splice(index, 1);
      console.log(`➖ Removed ${symbol} from preload list`);
    }
  }

  // Force preload specific symbols
  async forcePreload(symbols: string[]): Promise<void> {
    console.log(`🔄 Force preloading ${symbols.length} symbols...`);
    
    const results = await Promise.allSettled(
      symbols.map(symbol => this.preloadSymbol(symbol))
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    console.log(`✅ Force preload complete: ${successful}/${symbols.length} symbols`);
  }

  // INSTANT preload for single symbol (prioritized for user searches)
  async instantPreload(symbol: string): Promise<boolean> {
    console.log(`⚡ INSTANT preload for ${symbol}...`);
    const startTime = Date.now();
    
    try {
      // Prioritize essential data only for instant loading
      const essentialTasks = [
        this.preloadDataType(symbol, 'historical'),
        this.preloadDataType(symbol, 'quotes'),
        this.preloadDataType(symbol, 'details')
      ];
      
      await Promise.all(essentialTasks);
      
      // Background load non-critical data
      setTimeout(() => {
        Promise.allSettled([
          this.preloadDataType(symbol, 'options'),
          this.preloadDataType(symbol, 'seasonal'),
          this.preloadDataType(symbol, 'gex')
        ]).catch(err => console.warn(`⚠️ Background preload failed for ${symbol}:`, err));
      }, 100);
      
      const totalTime = Date.now() - startTime;
      console.log(`⚡ INSTANT preload for ${symbol} complete in ${totalTime}ms`);
      return true;
    } catch (error) {
      console.error(`❌ INSTANT preload failed for ${symbol}:`, error);
      return false;
    }
  }

  // Get preload statistics
  getStats(): PreloadStats {
    const cacheStats = this.cache.getStats();
    this.stats.cacheHitRate = cacheStats.hitRate;
    return { ...this.stats };
  }

  // Update configuration
  updateConfig(newConfig: Partial<PreloadConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('⚙️ Preloader configuration updated');
    
    // Restart if running to apply new config
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  // Helper to get date string for API calls
  private getDateString(daysAgo: number): string {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString().split('T')[0];
  }

  // Update internal stats
  private updateStats(): void {
    this.stats.totalSymbols = this.config.symbols.length;
  }

  // Cleanup and shutdown
  destroy(): void {
    this.stop();
    console.log('💥 DataPreloaderService destroyed');
  }
}

// Create singleton instance
const preloaderService = new DataPreloaderService(UltraFastCache);

export default preloaderService;
export { DataPreloaderService };
export type { PreloadConfig, PreloadStats };