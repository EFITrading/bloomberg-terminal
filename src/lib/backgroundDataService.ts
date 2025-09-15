'use client';

import PolygonService from './polygonService';
import SeasonalScreenerService from './seasonalScreenerService';
import GlobalDataCache from './GlobalDataCache';

class BackgroundDataService {
  private static instance: BackgroundDataService;
  private isLoading = false;
  private loadingProgress = 0;
  private totalSteps = 8;
  private currentStep = 0;
  private statusCallbacks: ((status: string, progress: number) => void)[] = [];

  private constructor() {}

  static getInstance(): BackgroundDataService {
    if (!BackgroundDataService.instance) {
      BackgroundDataService.instance = new BackgroundDataService();
    }
    return BackgroundDataService.instance;
  }

  // Add callback for loading status updates
  onStatusUpdate(callback: (status: string, progress: number) => void) {
    this.statusCallbacks.push(callback);
  }

  private updateStatus(status: string) {
    this.currentStep++;
    this.loadingProgress = (this.currentStep / this.totalSteps) * 100;
    console.log(`📊 Background Loading: ${status} (${Math.round(this.loadingProgress)}%)`);
    
    this.statusCallbacks.forEach(callback => {
      callback(status, this.loadingProgress);
    });
  }

  async startProgressiveLoading() {
    if (this.isLoading) {
      console.log('📦 Background loading already in progress');
      return;
    }

    this.isLoading = true;
    this.currentStep = 0;
    console.log('🚀 Starting non-blocking progressive data loading...');

    try {
      const polygonService = new PolygonService();
      const cache = GlobalDataCache.getInstance();

      // Step 1: Load essential market data (non-blocking)
      setTimeout(async () => {
        await this.loadEssentialData(polygonService, cache);
      }, 100);

      // Step 2: Load featured patterns (low priority)
      setTimeout(async () => {
        await this.loadFeaturedPatterns(polygonService, cache);
      }, 2000);

      // Step 3: Load weekly patterns (low priority)
      setTimeout(async () => {
        await this.loadWeeklyPatterns(polygonService, cache);
      }, 4000);

      // Step 4: Load sector patterns progressively
      setTimeout(async () => {
        await this.loadSectorPatterns(polygonService, cache);
      }, 6000);

      // Step 5: Load market indices (background)
      setTimeout(async () => {
        await this.loadMarketIndices(polygonService, cache);
      }, 8000);

      // Step 6: Load seasonal opportunities (very low priority)
      setTimeout(async () => {
        await this.loadSeasonalOpportunities(cache);
      }, 10000);

    } catch (error) {
      console.error('❌ Background loading error:', error);
    } finally {
      this.isLoading = false;
    }
  }

  private async loadEssentialData(polygonService: PolygonService, cache: any) {
    try {
      this.updateStatus('Loading essential market data...');
      
      // Load only the most critical data first
      const essentialSymbols = ['SPY', 'QQQ', 'DIA'];
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // Only 30 days
      
      for (const symbol of essentialSymbols) {
        try {
          const cacheKey = GlobalDataCache.keys.HISTORICAL_DATA(symbol, startDate, endDate);
          if (!cache.get(cacheKey)) {
            const data = await polygonService.getHistoricalData(symbol, startDate, endDate);
            if (data) cache.set(cacheKey, data);
          }
          
          // Add small delay to prevent blocking
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (error) {
          console.warn(`⚠️ Failed to load essential data for ${symbol}:`, error);
        }
      }
    } catch (error) {
      console.warn('⚠️ Essential data loading failed:', error);
    }
  }

  private async loadFeaturedPatterns(polygonService: PolygonService, cache: any) {
    try {
      this.updateStatus('Loading featured patterns...');
      
      const cachedPatterns = cache.get(GlobalDataCache.keys.FEATURED_PATTERNS);
      if (!cachedPatterns) {
        const patterns = await polygonService.getFeaturedPatterns();
        cache.set(GlobalDataCache.keys.FEATURED_PATTERNS, patterns);
        console.log(`✅ Loaded ${patterns.length} featured patterns`);
      }
    } catch (error) {
      console.warn('⚠️ Featured patterns loading failed:', error);
    }
  }

  private async loadWeeklyPatterns(polygonService: PolygonService, cache: any) {
    try {
      this.updateStatus('Loading weekly patterns...');
      
      const cachedWeekly = cache.get(GlobalDataCache.keys.WEEKLY_PATTERNS);
      if (!cachedWeekly) {
        const patterns = await polygonService.getWeeklyPatterns();
        cache.set(GlobalDataCache.keys.WEEKLY_PATTERNS, patterns);
        console.log(`✅ Loaded ${patterns.length} weekly patterns`);
      }
    } catch (error) {
      console.warn('⚠️ Weekly patterns loading failed:', error);
    }
  }

  private async loadSectorPatterns(polygonService: PolygonService, cache: any) {
    try {
      this.updateStatus('Loading sector patterns...');
      
      const sectors = ['SP500', 'Technology', 'Healthcare', 'Financial'];
      
      for (const sector of sectors) {
        try {
          const cachedSector = cache.get(GlobalDataCache.keys.MARKET_PATTERNS(sector));
          if (!cachedSector) {
            const patterns = await polygonService.getMarketPatterns(sector, 10); // Reduced from 25
            cache.set(GlobalDataCache.keys.MARKET_PATTERNS(sector), patterns);
            console.log(`✅ ${sector} patterns loaded (${patterns.length} patterns)`);
          }
          
          // Longer delay between sectors to prevent blocking
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.warn(`⚠️ Failed to load ${sector} patterns:`, error);
        }
      }
    } catch (error) {
      console.warn('⚠️ Sector patterns loading failed:', error);
    }
  }

  private async loadMarketIndices(polygonService: PolygonService, cache: any) {
    try {
      this.updateStatus('Loading market indices...');
      
      const indices = ['XLF', 'XLK', 'XLE', 'XLV', 'XLI'];
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 1 year only
      
      for (const symbol of indices) {
        try {
          const cacheKey = GlobalDataCache.keys.HISTORICAL_DATA(symbol, startDate, endDate);
          if (!cache.get(cacheKey)) {
            const data = await polygonService.getHistoricalData(symbol, startDate, endDate);
            if (data) cache.set(cacheKey, data);
          }
          
          // Add delay to prevent blocking
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          console.warn(`⚠️ Failed to load ${symbol}:`, error);
        }
      }
    } catch (error) {
      console.warn('⚠️ Market indices loading failed:', error);
    }
  }

  private async loadSeasonalOpportunities(cache: any) {
    try {
      this.updateStatus('Loading seasonal opportunities...');
      
      const cachedOpportunities = cache.get(GlobalDataCache.keys.SEASONAL_OPPORTUNITIES);
      if (!cachedOpportunities) {
        // Load only a subset initially, not all 600+ stocks to prevent blocking
        const screeningService = new SeasonalScreenerService();
        
        // Load in smaller chunks to prevent blocking
        let allOpportunities: any[] = [];
        const chunkSize = 25; // Load 25 stocks at a time
        const totalStocks = 100; // Start with 100 stocks instead of 600
        
        for (let offset = 0; offset < totalStocks; offset += chunkSize) {
          try {
            const chunk = await screeningService.screenSeasonalOpportunities(10, chunkSize, offset);
            if (chunk && chunk.length > 0) {
              allOpportunities = allOpportunities.concat(chunk);
            }
            
            // Add delay between chunks to prevent blocking
            await new Promise(resolve => setTimeout(resolve, 500));
            
            this.updateStatus(`Loading seasonal opportunities... (${Math.min(offset + chunkSize, totalStocks)}/${totalStocks})`);
          } catch (error) {
            console.warn(`⚠️ Failed to load seasonal chunk ${offset}-${offset + chunkSize}:`, error);
          }
        }
        
        cache.set(GlobalDataCache.keys.SEASONAL_OPPORTUNITIES, allOpportunities);
        console.log(`✅ Loaded ${allOpportunities.length} seasonal opportunities (chunked loading)`);
      }
    } catch (error) {
      console.warn('⚠️ Seasonal opportunities loading failed:', error);
    }
  }

  // Method to load data on-demand for specific pages
  async loadDataForPage(page: string) {
    const polygonService = new PolygonService();
    const cache = GlobalDataCache.getInstance();

    switch (page) {
      case 'analytics':
        await this.loadFeaturedPatterns(polygonService, cache);
        await this.loadWeeklyPatterns(polygonService, cache);
        break;
      
      case 'seasonax':
        await this.loadSeasonalOpportunities(cache);
        await this.loadSectorPatterns(polygonService, cache);
        break;
      
      case 'market-overview':
        await this.loadEssentialData(polygonService, cache);
        await this.loadMarketIndices(polygonService, cache);
        break;
      
      default:
        // Load basic data for unknown pages
        await this.loadEssentialData(polygonService, cache);
    }
  }

  getLoadingStatus() {
    return {
      isLoading: this.isLoading,
      progress: this.loadingProgress,
      step: this.currentStep,
      totalSteps: this.totalSteps
    };
  }
}

export default BackgroundDataService;
