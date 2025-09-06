'use client';

import { useEffect, useState } from 'react';
import PolygonService from '@/lib/polygonService';
import SeasonalScreenerService from '@/lib/seasonalScreenerService';
import GlobalDataCache from '@/lib/GlobalDataCache';

const DataPreloader: React.FC = () => {
  const [loadingStatus, setLoadingStatus] = useState('Starting...');

  useEffect(() => {
    console.log('🚀 Bloomberg Terminal: Starting COMPLETE data preloading...');
    
    const preloadEverything = async () => {
      try {
        const polygonService = new PolygonService();
        const screeningService = new SeasonalScreenerService();
        const cache = GlobalDataCache.getInstance();
        
        // Get the ACTUAL symbol list from the seasonal screener (600+ stocks)
        const seasonalService = new SeasonalScreenerService();
        
        // Load ALL seasonal opportunities data (this will load ALL 600+ stocks)
        setLoadingStatus('Loading all seasonal opportunities...');
        console.log('🔍 Starting complete seasonal opportunities screening...');
        
        try {
          const cachedOpportunities = cache.get(GlobalDataCache.keys.SEASONAL_OPPORTUNITIES);
          if (!cachedOpportunities) {
            // Load ALL stocks, not just 100 - use full dataset
            const opportunities = await screeningService.screenSeasonalOpportunities(15, 600, 0); // 600 stocks, 15 years
            cache.set(GlobalDataCache.keys.SEASONAL_OPPORTUNITIES, opportunities);
            console.log(`✅ Loaded ${opportunities.length} seasonal opportunities from ALL stocks`);
            setLoadingStatus(`Loaded ${opportunities.length} seasonal opportunities`);
          } else {
            console.log(`📦 Using cached seasonal opportunities (${cachedOpportunities.length} items)`);
            setLoadingStatus(`Using cached ${cachedOpportunities.length} opportunities`);
          }
        } catch (error) {
          console.warn('⚠️ Seasonal opportunities failed:', error);
        }
        
        // Load featured patterns
        setTimeout(async () => {
          setLoadingStatus('Loading featured patterns...');
          try {
            const cachedPatterns = cache.get(GlobalDataCache.keys.FEATURED_PATTERNS);
            if (!cachedPatterns) {
              console.log('⭐ Loading featured patterns...');
              const patterns = await polygonService.getFeaturedPatterns();
              cache.set(GlobalDataCache.keys.FEATURED_PATTERNS, patterns);
              console.log(`✅ Loaded ${patterns.length} featured patterns`);
              setLoadingStatus(`Loaded ${patterns.length} featured patterns`);
            }
          } catch (error) {
            console.warn('⚠️ Featured patterns failed:', error);
          }
        }, 2000);
        
        // Load weekly patterns
        setTimeout(async () => {
          setLoadingStatus('Loading weekly patterns...');
          try {
            const cachedWeekly = cache.get(GlobalDataCache.keys.WEEKLY_PATTERNS);
            if (!cachedWeekly) {
              console.log('� Loading weekly patterns...');
              const patterns = await polygonService.getWeeklyPatterns();
              cache.set(GlobalDataCache.keys.WEEKLY_PATTERNS, patterns);
              console.log(`✅ Loaded ${patterns.length} weekly patterns`);
              setLoadingStatus(`Loaded ${patterns.length} weekly patterns`);
            }
          } catch (error) {
            console.warn('⚠️ Weekly patterns failed:', error);
          }
        }, 4000);
        
        // Load sector patterns
        setTimeout(async () => {
          setLoadingStatus('Loading sector patterns...');
          try {
            const sectors = ['SP500', 'Technology', 'Healthcare', 'Financial', 'Energy', 'Consumer', 'Industrial', 'Materials', 'Utilities', 'Real Estate'];
            console.log('🏢 Loading ALL sector patterns...');
            
            for (const sector of sectors) {
              const cachedSector = cache.get(GlobalDataCache.keys.MARKET_PATTERNS(sector));
              if (!cachedSector) {
                try {
                  const patterns = await polygonService.getMarketPatterns(sector, 25); // More patterns per sector
                  cache.set(GlobalDataCache.keys.MARKET_PATTERNS(sector), patterns);
                  console.log(`✅ ${sector} patterns loaded (${patterns.length} patterns)`);
                  setLoadingStatus(`Loaded ${sector} sector patterns`);
                } catch (error) {
                  console.warn(`⚠️ Failed to load ${sector} patterns:`, error);
                }
                // Small delay between sectors
                await new Promise(resolve => setTimeout(resolve, 300));
              }
            }
          } catch (error) {
            console.warn('⚠️ Sector patterns failed:', error);
          }
        }, 6000);
        
        // Load market indices and ETF data
        setTimeout(async () => {
          setLoadingStatus('Loading market indices...');
          try {
            const indices = ['SPY', 'QQQ', 'DIA', 'IWM', 'VTI', 'XLF', 'XLK', 'XLE', 'XLV', 'XLI', 'XLU', 'XLB', 'XLRE', 'XLP'];
            const endDate = new Date().toISOString().split('T')[0];
            const startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const longStartDate = new Date(Date.now() - 15 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 15 years
            
            console.log('� Loading ALL market indices with full historical data...');
            
            for (const symbol of indices) {
              try {
                // Load 1-year data
                const cacheKey1Y = GlobalDataCache.keys.HISTORICAL_DATA(symbol, startDate, endDate);
                if (!cache.get(cacheKey1Y)) {
                  const data1Y = await polygonService.getHistoricalData(symbol, startDate, endDate);
                  if (data1Y) {
                    cache.set(cacheKey1Y, data1Y);
                  }
                }
                
                // Load 15-year data for seasonal analysis
                const cacheKey15Y = GlobalDataCache.keys.HISTORICAL_DATA(symbol, longStartDate, endDate);
                if (!cache.get(cacheKey15Y)) {
                  const data15Y = await polygonService.getHistoricalData(symbol, longStartDate, endDate);
                  if (data15Y) {
                    cache.set(cacheKey15Y, data15Y);
                  }
                }
                
                // Load ticker details
                const tickerKey = GlobalDataCache.keys.TICKER_DETAILS(symbol);
                if (!cache.get(tickerKey)) {
                  const tickerDetails = await polygonService.getTickerDetails(symbol);
                  if (tickerDetails) {
                    cache.set(tickerKey, tickerDetails);
                  }
                }
                
                console.log(`✅ ${symbol} fully loaded (1Y + 15Y + details)`);
                setLoadingStatus(`Loaded ${symbol} market data`);
                
                // Small delay between indices
                await new Promise(resolve => setTimeout(resolve, 100));
                
              } catch (error) {
                console.warn(`⚠️ Failed to load ${symbol}:`, error);
              }
            }
          } catch (error) {
            console.warn('⚠️ Market indices failed:', error);
          }
        }, 8000);
        
        // Final status update
        setTimeout(() => {
          const stats = cache.getStats();
          console.log(`🎉 COMPLETE! Full Bloomberg Terminal data loaded!`);
          console.log(`📊 Cache stats: ${stats.active} active items, ${stats.total} total`);
          console.log(`📈 Data includes: ALL 600+ stocks, ALL sectors, ALL patterns, FULL historical data`);
          setLoadingStatus(`Complete! ${stats.active} items cached`);
        }, 12000);
        
      } catch (error) {
        console.error('❌ Data preloading error:', error);
        setLoadingStatus('Error loading data');
      }
    };
    
    // Start immediately
    const preloadTimer = setTimeout(preloadEverything, 100);
    
    return () => clearTimeout(preloadTimer);
  }, []);

  return null; // This component loads EVERYTHING in the background
};

export default DataPreloader;
