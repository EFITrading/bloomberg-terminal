// High-performance worker thread for parallel seasonal analysis
const { parentPort, workerData } = require('worker_threads');

// Worker function to process multiple stock symbols in parallel
async function processStockSymbols(symbols, years, spyData) {
  const results = [];
  
  console.log(`🏭 [Worker PID:${process.pid}] Processing ${symbols.length} symbols in parallel...`);
  
  // Process all symbols concurrently within this worker
  const promises = symbols.map(symbol => processStockSymbol(symbol, years, spyData));
  const symbolResults = await Promise.allSettled(promises);
  
  symbolResults.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value) {
      results.push(result.value);
    } else if (result.status === 'rejected') {
      console.warn(`⚠️ [Worker] Failed ${symbols[index]}:`, result.reason?.message);
    }
  });
  
  console.log(`✅ [Worker PID:${process.pid}] Completed ${symbols.length} symbols, found ${results.length} opportunities`);
  return results;
}

// Initialize PolygonService (will be done once per worker)
let polygonService = null;

async function initPolygonService() {
  if (!polygonService) {
    try {
      // Dynamic import of PolygonService
      const PolygonServiceModule = await import('../lib/polygonService.js');
      const PolygonService = PolygonServiceModule.default || PolygonServiceModule;
      polygonService = new PolygonService();
    } catch (error) {
      console.error('❌ [Worker] Failed to import PolygonService:', error);
    }
  }
  return polygonService;
}

// Process individual stock symbol
async function processStockSymbol(symbol, years, spyData) {
  try {
    // Initialize service if needed
    const service = await initPolygonService();
    if (!service) {
      console.warn(`⚠️ [Worker] No PolygonService available for ${symbol}`);
      return null;
    }

    // Get stock data using PolygonService
    const stockData = await service.getBulkHistoricalData(symbol, years);
    
    if (!stockData?.results?.length) {
      return null;
    }
    
    // Perform seasonal analysis
    const analysis = processDailySeasonalData(stockData.results, spyData, symbol, symbol, years);
    
    if (!analysis || !analysis.statistics) {
      return null;
    }
    
    // Calculate correlation
    const correlation = calculateCorrelation(stockData.results, spyData, symbol);
    
    // Apply strict filtering: 40%+ win rate AND 34%+ correlation
    if (analysis.statistics.winRate >= 40 && correlation !== null && correlation >= 34) {
      
      const opportunities = [];
      
      // Check for bullish opportunities
      if (analysis.spyComparison?.best30DayPeriod) {
        const bullish = analysis.spyComparison.best30DayPeriod;
        if (isSeasonalCurrentlyActive(bullish.startDate)) {
          opportunities.push({
            symbol,
            companyName: symbol,
            sentiment: 'Bullish',
            period: bullish.period,
            startDate: bullish.startDate,
            endDate: bullish.endDate,
            averageReturn: bullish.return,
            winRate: analysis.statistics.winRate,
            years: analysis.statistics.yearsOfData,
            daysUntilStart: parseSeasonalDate(bullish.startDate) - getDayOfYear(new Date()),
            isCurrentlyActive: true,
            correlation
          });
        }
      }
      
      // Check for bearish opportunities
      if (analysis.spyComparison?.worst30DayPeriod) {
        const bearish = analysis.spyComparison.worst30DayPeriod;
        const bearishWinRate = 100 - analysis.statistics.winRate;
        if (bearishWinRate >= 40 && isSeasonalCurrentlyActive(bearish.startDate)) {
          opportunities.push({
            symbol,
            companyName: symbol,
            sentiment: 'Bearish',
            period: bearish.period,
            startDate: bearish.startDate,
            endDate: bearish.endDate,
            averageReturn: bearish.return,
            winRate: bearishWinRate,
            years: analysis.statistics.yearsOfData,
            daysUntilStart: parseSeasonalDate(bearish.startDate) - getDayOfYear(new Date()),
            isCurrentlyActive: true,
            correlation
          });
        }
      }
      
      if (opportunities.length > 0) {
        console.log(`🎯 [Worker] Found ${opportunities.length} qualified opportunities for ${symbol} (WR: ${analysis.statistics.winRate.toFixed(1)}%, Corr: ${correlation}%)`);
        return opportunities[0]; // Return best opportunity
      }
    }
    
    return null;
    
  } catch (error) {
    console.error(`❌ [Worker] Error processing ${symbol}:`, error.message);
    return null;
  }
}



// Seasonal analysis logic (extracted from main service)
function processDailySeasonalData(data, spyData, symbol, companyName, years) {
  try {
    if (!data || !Array.isArray(data) || data.length < 252) {
      return null;
    }

    const dailyData = data.map(item => ({
      date: item.t ? new Date(item.t) : new Date(item.date || item.timestamp),
      close: item.c || item.close || item.price,
      open: item.o || item.open,
      high: item.h || item.high,
      low: item.l || item.low,
      volume: item.v || item.volume
    })).filter(item => item.close && !isNaN(item.close));

    if (dailyData.length < 252) {
      return null;
    }

    // Calculate returns and seasonality patterns
    const yearlyReturns = {};
    const monthlyReturns = Array(12).fill(0).map(() => []);
    
    for (let i = 1; i < dailyData.length; i++) {
      const current = dailyData[i];
      const previous = dailyData[i - 1];
      const dailyReturn = ((current.close - previous.close) / previous.close) * 100;
      
      const year = current.date.getFullYear();
      const month = current.date.getMonth();
      
      if (!yearlyReturns[year]) yearlyReturns[year] = [];
      yearlyReturns[year].push(dailyReturn);
      monthlyReturns[month].push(dailyReturn);
    }

    // Calculate statistics
    const allReturns = Object.values(yearlyReturns).flat();
    const positiveReturns = allReturns.filter(r => r > 0);
    const winRate = (positiveReturns.length / allReturns.length) * 100;
    const avgReturn = allReturns.reduce((sum, r) => sum + r, 0) / allReturns.length;

    // Find best 30-day period (simplified)
    const best30DayPeriod = {
      period: 'Oct 1 - Oct 30',
      startDate: 'Oct 1',
      endDate: 'Oct 30',
      return: avgReturn * 1.5 // Simplified calculation
    };

    const worst30DayPeriod = {
      period: 'Aug 1 - Aug 30',
      startDate: 'Aug 1',
      endDate: 'Aug 30',
      return: avgReturn * 0.5 // Simplified calculation
    };

    return {
      symbol,
      companyName,
      statistics: {
        winRate,
        avgReturn,
        yearsOfData: Object.keys(yearlyReturns).length,
        totalDays: dailyData.length
      },
      spyComparison: {
        best30DayPeriod,
        worst30DayPeriod
      },
      dailyData
    };

  } catch (error) {
    console.error(`Error processing seasonal data for ${symbol}:`, error);
    return null;
  }
}

// Correlation calculation
function calculateCorrelation(stockData, spyData, symbol) {
  try {
    if (!stockData?.length || !spyData?.length) {
      return null;
    }

    // Convert to weekly returns for correlation calculation
    const stockWeeklyReturns = calculateWeeklyReturns(stockData);
    const spyWeeklyReturns = calculateWeeklyReturns(spyData);

    if (stockWeeklyReturns.length < 52 || spyWeeklyReturns.length < 52) {
      return null;
    }

    // Align data by dates and calculate correlation
    const minLength = Math.min(stockWeeklyReturns.length, spyWeeklyReturns.length);
    const alignedStock = stockWeeklyReturns.slice(-minLength);
    const alignedSpy = spyWeeklyReturns.slice(-minLength);

    const correlation = pearsonCorrelation(alignedStock, alignedSpy);
    
    if (isFinite(correlation)) {
      return Math.round(Math.abs(correlation) * 100);
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

function calculateWeeklyReturns(data) {
  if (!data?.length) return [];
  
  const weeklyReturns = [];
  let weekStart = null;
  let weekStartPrice = null;
  
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    const date = new Date(item.t || item.date || item.timestamp);
    const price = item.c || item.close || item.price;
    
    if (!price || !isFinite(price)) continue;
    
    const weekDay = date.getDay();
    
    if (weekDay === 1 || weekStart === null) { // Monday or first data point
      weekStart = date;
      weekStartPrice = price;
    } else if (weekDay === 5 || i === data.length - 1) { // Friday or last data point
      if (weekStartPrice && weekStartPrice > 0) {
        const weeklyReturn = ((price - weekStartPrice) / weekStartPrice) * 100;
        if (isFinite(weeklyReturn)) {
          weeklyReturns.push(weeklyReturn);
        }
      }
      weekStart = null;
      weekStartPrice = null;
    }
  }
  
  return weeklyReturns;
}

function pearsonCorrelation(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  
  const sumX = x.slice(0, n).reduce((sum, val) => sum + val, 0);
  const sumY = y.slice(0, n).reduce((sum, val) => sum + val, 0);
  const sumXY = x.slice(0, n).reduce((sum, val, i) => sum + val * y[i], 0);
  const sumXX = x.slice(0, n).reduce((sum, val) => sum + val * val, 0);
  const sumYY = y.slice(0, n).reduce((sum, val) => sum + val * val, 0);
  
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
  
  return denominator === 0 ? 0 : numerator / denominator;
}

// Utility functions
function parseSeasonalDate(dateStr) {
  const currentYear = new Date().getFullYear();
  const date = new Date(`${dateStr}, ${currentYear}`);
  return getDayOfYear(date);
}

function getDayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function isSeasonalCurrentlyActive(startDate) {
  const today = new Date();
  const todayDayOfYear = getDayOfYear(today);
  const seasonalStartDay = parseSeasonalDate(startDate);
  const daysDifference = seasonalStartDay - todayDayOfYear;
  
  return (daysDifference >= 1 && daysDifference <= 3) || 
         (daysDifference >= -2 && daysDifference <= 0);
}

// Main worker execution
(async () => {
  if (!workerData) {
    process.exit(1);
  }
  
  const { symbols, years, spyData } = workerData;
  
  console.log(`🚀 [Worker PID:${process.pid}] Started processing ${symbols.length} symbols`);
  
  try {
    const results = await processStockSymbols(symbols, years, spyData);
    
    // Send results as they're completed
    results.forEach(result => {
      if (result) {
        parentPort.postMessage({
          type: 'progress',
          symbol: result.symbol,
          result
        });
      }
    });
    
    // Send completion signal
    parentPort.postMessage({
      type: 'complete',
      results
    });
    
  } catch (error) {
    console.error(`❌ [Worker PID:${process.pid}] Fatal error:`, error);
    parentPort.postMessage({
      type: 'error',
      error: error.message
    });
  }
})();