import { NextRequest, NextResponse } from 'next/server';
import SeasonalScreenerService from '@/lib/seasonalScreenerService_fixed';
import { polygonService } from '@/lib/polygonService';
import { gexService } from '@/lib/gexService';
import MarketSentimentService from '@/lib/marketSentimentService';
import { IndustryAnalysisService } from '@/lib/industryAnalysisService';
import { EnhancedWatchlistService } from '@/lib/enhancedWatchlistService';

import { screenerCache, CACHE_TTL } from '@/lib/screenerCache';

interface ScreenerResult {
  name: string;
  data: any;
  lastUpdated: string;
  nextUpdate: string;
  status: 'success' | 'error' | 'running';
  error?: string;
}

/**
 * Background Screener Cron Job
 * Runs every 10 minutes to update all screener data
 * Vercel Cron: 0 10 * * * * (every 10 minutes)
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  console.log('🔄 Starting background screener refresh...');
  
  const results: ScreenerResult[] = [];
  const now = new Date();
  const nextUpdate = new Date(now.getTime() + CACHE_TTL);

  // Define all screeners to run
  const screeners = [
    {
      name: 'seasonal-opportunities',
      runner: runSeasonalScreener
    },
    {
      name: 'premium-screener', 
      runner: runPremiumScreener
    },
    {
      name: 'gex-screener',
      runner: runGexScreener  
    },
    {
      name: 'market-sentiment',
      runner: runMarketSentiment
    },
    {
      name: 'sector-analysis',
      runner: runSectorAnalysis
    },
    {
      name: 'watchlist-data',
      runner: runWatchlistData
    },
    {
      name: 'options-flow-scan',
      runner: runOptionsFlowScan
    },
    {
      name: 'rs-screener',
      runner: runRSScreener
    },
    {
      name: 'leadership-scan',
      runner: runLeadershipScan
    }
  ];

  // Run all screeners in parallel with timeout protection
  const screenerPromises = screeners.map(async (screener) => {
    try {
      console.log(`🔍 Running ${screener.name}...`);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Screener timeout')), 4 * 60 * 1000) // 4min timeout
      );
      
      const data = await Promise.race([
        screener.runner(),
        timeoutPromise
      ]);
      
      // Cache the result
      screenerCache.set(screener.name, {
        data,
        timestamp: Date.now(),
        expiresAt: Date.now() + CACHE_TTL
      });
      
      console.log(`✅ ${screener.name} completed`);
      
      return {
        name: screener.name,
        data,
        lastUpdated: now.toISOString(),
        nextUpdate: nextUpdate.toISOString(),
        status: 'success' as const
      };
      
    } catch (error: any) {
      console.error(`❌ ${screener.name} failed:`, error.message);
      
      return {
        name: screener.name,
        data: null,
        lastUpdated: now.toISOString(),
        nextUpdate: nextUpdate.toISOString(),
        status: 'error' as const,
        error: error.message
      };
    }
  });

  // Wait for all screeners to complete
  const screenerResults = await Promise.allSettled(screenerPromises);
  
  screenerResults.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      results.push(result.value);
    } else {
      results.push({
        name: screeners[index].name,
        data: null,
        lastUpdated: now.toISOString(),
        nextUpdate: nextUpdate.toISOString(),
        status: 'error',
        error: result.reason?.message || 'Unknown error'
      });
    }
  });

  const duration = Date.now() - startTime;
  const successCount = results.filter(r => r.status === 'success').length;
  
  console.log(`🏁 Background refresh completed: ${successCount}/${results.length} successful in ${duration}ms`);

  return NextResponse.json({
    success: true,
    duration,
    results,
    cacheStats: {
      totalEntries: screenerCache.size,
      nextRefresh: nextUpdate.toISOString()
    }
  });
}

// Individual screener functions
async function runSeasonalScreener() {
  const screeningService = new SeasonalScreenerService();
  const years = 20;
  const batchSize = 25; // Smaller batches for background processing
  
  const opportunities = await screeningService.screenSeasonalOpportunities(years, batchSize);
  
  return {
    opportunities: opportunities.slice(0, 100), // Top 100 opportunities
    totalScanned: opportunities.length,
    criteria: { years, batchSize },
    generatedAt: new Date().toISOString()
  };
}

async function runPremiumScreener() {
  // Scan for unusual premium activity by calling existing API
  const watchlist = ['SPY', 'QQQ', 'AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NFLX'];
  const results = [];
  
  for (const symbol of watchlist) {
    try {
      // Use internal API call to get options data
      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/options-chain?symbol=${symbol}&limit=20`);
      if (response.ok) {
        const optionsData = await response.json();
        if (optionsData?.results && optionsData.results.length > 0) {
          results.push({
            symbol,
            optionsCount: optionsData.results.length,
            topContracts: optionsData.results.slice(0, 5),
            scanTime: new Date().toISOString()
          });
        }
      }
    } catch (error) {
      console.error(`Premium scan error for ${symbol}:`, error);
    }
  }
  
  return {
    results,
    scannedSymbols: watchlist,
    generatedAt: new Date().toISOString()
  };
}

async function runGexScreener() {
  const symbols = ['SPY', 'QQQ', 'IWM', 'AAPL', 'TSLA', 'NVDA'];
  const gexResults = [];
  
  for (const symbol of symbols) {
    try {
      const gexData = await gexService.calculateGEX(symbol);
      gexResults.push({
        symbol,
        gex: gexData,
        scanTime: new Date().toISOString()
      });
    } catch (error) {
      console.error(`GEX scan error for ${symbol}:`, error);
    }
  }
  
  return {
    results: gexResults,
    generatedAt: new Date().toISOString()
  };
}

async function runMarketSentiment() {
  const sentimentService = new MarketSentimentService();
  const sentiment = await sentimentService.analyzeSentiment();
  return {
    sentiment,
    generatedAt: new Date().toISOString()
  };
}

async function runSectorAnalysis() {
  // Use static method from IndustryAnalysisService
  const analysis = await IndustryAnalysisService.getMarketRegimeData();
  return {
    analysis,
    generatedAt: new Date().toISOString()
  };
}

async function runWatchlistData() {
  const watchlistService = new EnhancedWatchlistService();
  const watchlistData = await watchlistService.fetchBulkWatchlistData();
  return {
    data: watchlistData,
    generatedAt: new Date().toISOString()
  };
}

async function runOptionsFlowScan() {
  // Lightweight options flow scan for major symbols
  const symbols = ['SPY', 'QQQ', 'AAPL', 'TSLA', 'NVDA'];
  const flowData = [];
  
  for (const symbol of symbols) {
    try {
      // Get recent unusual options activity
      const response = await fetch(`https://api.polygon.io/v3/trades/${symbol}?timestamp.gte=${Date.now() - 86400000}&limit=100&apikey=${process.env.POLYGON_API_KEY}`);
      if (response.ok) {
        const data = await response.json();
        flowData.push({
          symbol,
          recentTrades: data?.results?.slice(0, 20) || [],
          scanTime: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error(`Options flow scan error for ${symbol}:`, error);
    }
  }
  
  return {
    results: flowData,
    generatedAt: new Date().toISOString()
  };
}

async function runRSScreener() {
  // RS (Relative Strength) Screener - scans top stocks for momentum breakouts/breakdowns
  const topStocks = [
    // Technology Leaders
    'AAPL', 'MSFT', 'GOOGL', 'NVDA', 'META', 'TSLA', 'AMZN', 'NFLX', 'AMD', 'INTC',
    'ORCL', 'CRM', 'ADBE', 'AVGO', 'QCOM', 'TXN', 'CSCO', 'NOW', 'INTU', 'UBER',
    
    // Financial Leaders  
    'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'V', 'MA', 'BRK.B', 'BLK', 'SCHW', 'AXP',
    
    // Healthcare Leaders
    'UNH', 'JNJ', 'PFE', 'ABBV', 'LLY', 'TMO', 'ABT', 'MRK', 'DHR', 'BMY', 'AMGN',
    
    // Consumer Leaders
    'HD', 'MCD', 'NKE', 'SBUX', 'LOW', 'WMT', 'COST', 'TJX', 'PG', 'KO', 'PEP',
    
    // Industrial Leaders
    'BA', 'HON', 'UPS', 'FDX', 'CAT', 'GE', 'MMM', 'RTX', 'LMT', 'DE'
  ];
  
  const rsResults = {
    breakouts: [],
    rareLows: [],
    breakdowns: [],
    scannedSymbols: topStocks.length,
    lookbackDays: 252 // 1 year
  };
  
  for (const symbol of topStocks.slice(0, 25)) { // Limit to 25 for background processing
    try {
      // Get 1-year historical data for RS calculation
      const endDate = new Date();
      const startDate = new Date();
      startDate.setFullYear(endDate.getFullYear() - 1);
      
      const historicalData = await polygonService.getHistoricalData(
        symbol, 
        startDate.toISOString().split('T')[0], 
        endDate.toISOString().split('T')[0], 
        '1d'
      );
      
      if (historicalData?.results && historicalData.results.length > 50) {
        const prices = historicalData.results.map((bar: any) => bar.c);
        const currentPrice = prices[prices.length - 1];
        const priceChange = currentPrice - prices[prices.length - 2];
        const priceChangePercent = (priceChange / prices[prices.length - 2]) * 100;
        
        // Calculate RS percentile (simplified)
        const sortedPrices = [...prices].sort((a, b) => a - b);
        const percentile = (sortedPrices.indexOf(currentPrice) / sortedPrices.length) * 100;
        
        // Classify signals
        let signalType = null;
        let classification = 'NEUTRAL';
        
        if (percentile >= 90) {
          signalType = 'breakout';
          classification = 'LEADING';
          rsResults.breakouts.push({
            symbol,
            percentile: Math.round(percentile),
            classification,
            currentPrice,
            priceChange,
            priceChangePercent: Number(priceChangePercent.toFixed(2)),
            volume: historicalData.results[historicalData.results.length - 1]?.v || 0,
            sector: getStockSector(symbol)
          });
        } else if (percentile <= 10) {
          signalType = 'rareLow';
          classification = 'LAGGING';
          rsResults.rareLows.push({
            symbol,
            percentile: Math.round(percentile),
            classification,
            currentPrice,
            priceChange,
            priceChangePercent: Number(priceChangePercent.toFixed(2)),
            volume: historicalData.results[historicalData.results.length - 1]?.v || 0,
            sector: getStockSector(symbol)
          });
        } else if (percentile <= 25 && priceChangePercent < -2) {
          signalType = 'breakdown';
          classification = 'WEAKENING';
          rsResults.breakdowns.push({
            symbol,
            percentile: Math.round(percentile),
            classification,
            currentPrice,
            priceChange,
            priceChangePercent: Number(priceChangePercent.toFixed(2)),
            volume: historicalData.results[historicalData.results.length - 1]?.v || 0,
            sector: getStockSector(symbol)
          });
        }
      }
    } catch (error) {
      console.error(`RS scan error for ${symbol}:`, error);
    }
  }
  
  return {
    ...rsResults,
    generatedAt: new Date().toISOString()
  };
}

async function runLeadershipScan() {
  // Leadership Scan - identifies market leaders making new highs
  const leadershipCandidates = [
    // High-cap leaders
    'AAPL', 'MSFT', 'GOOGL', 'NVDA', 'META', 'TSLA', 'AMZN', 'NFLX', 'AMD', 'ORCL',
    'JPM', 'BAC', 'UNH', 'JNJ', 'HD', 'MCD', 'WMT', 'PG', 'BA', 'CAT',
    
    // Growth leaders
    'CRM', 'NOW', 'SNOW', 'CRWD', 'PANW', 'DDOG', 'NET', 'OKTA', 'ZS', 'PLTR',
    
    // Consumer leaders
    'NKE', 'SBUX', 'LOW', 'COST', 'TJX', 'KO', 'PEP', 'MDLZ', 'HSY', 'MKC'
  ];
  
  const leaders = [];
  
  for (const symbol of leadershipCandidates.slice(0, 20)) { // Limit for background processing
    try {
      // Get 2-year data to identify leadership patterns
      const endDate = new Date();
      const startDate = new Date();
      startDate.setFullYear(endDate.getFullYear() - 2);
      
      const historicalData = await polygonService.getHistoricalData(
        symbol,
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0],
        '1d'
      );
      
      if (historicalData?.results && historicalData.results.length > 100) {
        const bars = historicalData.results;
        const currentBar = bars[bars.length - 1];
        const previousBar = bars[bars.length - 2];
        
        const currentPrice = currentBar.c;
        const priceChange = currentPrice - previousBar.c;
        const priceChangePercent = (priceChange / previousBar.c) * 100;
        
        // Calculate 52-week high
        const last252Bars = bars.slice(-252);
        const weekHigh52 = Math.max(...last252Bars.map(bar => bar.h));
        const highDistance = ((currentPrice - weekHigh52) / weekHigh52) * 100;
        
        // Check if it's a new breakout (within 2% of 52-week high)
        const isNewBreakout = highDistance >= -2;
        let breakoutType = 'Near High';
        
        if (currentPrice >= weekHigh52 * 0.999) {
          breakoutType = 'Fresh 52W High';
        } else if (currentPrice >= weekHigh52 * 0.98) {
          breakoutType = 'Near High';
        }
        
        // Calculate leadership score based on multiple factors
        const volumeRatio = currentBar.v / (bars.slice(-20).reduce((sum, bar) => sum + bar.v, 0) / 20);
        const leadershipScore = Math.round(
          (highDistance + 100) * 0.4 + // Distance from high
          Math.min(priceChangePercent * 10, 50) * 0.3 + // Recent performance
          Math.min(volumeRatio * 20, 50) * 0.3 // Volume surge
        );
        
        let classification = 'Momentum Play';
        if (leadershipScore >= 80) classification = 'Market Leader';
        else if (leadershipScore >= 65) classification = 'Sector Leader';
        else if (leadershipScore >= 50) classification = 'Emerging Leader';
        
        if (isNewBreakout && leadershipScore >= 40) {
          leaders.push({
            symbol,
            sector: getStockSector(symbol),
            currentPrice,
            priceChange,
            priceChangePercent: Number(priceChangePercent.toFixed(2)),
            volume: currentBar.v,
            volumeRatio: Number(volumeRatio.toFixed(1)),
            weekHigh52,
            highDistance: Number(highDistance.toFixed(1)),
            isNewBreakout,
            breakoutType,
            leadershipScore,
            classification,
            trend: leadershipScore >= 70 ? 'Strong Uptrend' : 'Moderate Uptrend'
          });
        }
      }
    } catch (error) {
      console.error(`Leadership scan error for ${symbol}:`, error);
    }
  }
  
  // Sort by leadership score
  leaders.sort((a, b) => b.leadershipScore - a.leadershipScore);
  
  return {
    leaders: leaders.slice(0, 15), // Top 15 leaders
    scannedSymbols: leadershipCandidates.length,
    generatedAt: new Date().toISOString()
  };
}

// Helper function to get stock sector
function getStockSector(symbol: string): string {
  const sectorMap: Record<string, string> = {
    'AAPL': 'Technology', 'MSFT': 'Technology', 'GOOGL': 'Technology', 'NVDA': 'Technology',
    'META': 'Technology', 'TSLA': 'Technology', 'AMZN': 'Technology', 'NFLX': 'Technology',
    'JPM': 'Financials', 'BAC': 'Financials', 'WFC': 'Financials', 'GS': 'Financials',
    'UNH': 'Healthcare', 'JNJ': 'Healthcare', 'PFE': 'Healthcare', 'ABBV': 'Healthcare',
    'HD': 'Consumer Discretionary', 'MCD': 'Consumer Discretionary', 'NKE': 'Consumer Discretionary',
    'WMT': 'Consumer Staples', 'PG': 'Consumer Staples', 'KO': 'Consumer Staples',
    'BA': 'Industrials', 'CAT': 'Industrials', 'HON': 'Industrials'
  };
  return sectorMap[symbol] || 'Other';
}

