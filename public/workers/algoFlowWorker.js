// AlgoFlow Web Worker - processes massive trade datasets for single stock
self.onmessage = function(e) {
  const { trades, symbol, batchIndex, totalBatches } = e.data;
  
  console.log(`🚀 AlgoFlow Worker processing ${trades.length} trades for ${symbol} (batch ${batchIndex}/${totalBatches})`);
  
  try {
    const result = processTradeBatch(trades, symbol);
    
    self.postMessage({
      type: 'complete',
      batchIndex,
      result,
      processed: trades.length
    });
    
  } catch (error) {
    console.error(`❌ AlgoFlow Worker failed on batch ${batchIndex}:`, error);
    self.postMessage({
      type: 'error',
      batchIndex,
      error: error.message
    });
  }
};

function processTradeBatch(trades, symbol) {
  // Filter for 10+ volume only
  const filteredTrades = trades.filter(t => (t.trade_size || 0) >= 10);
  
  const sweeps = [];
  const blocks = [];
  const darkPoolTrades = [];
  const premiumAnalysis = {
    total: 0,
    avg: 0,
    high: 0,
    buckets: {
      under1k: 0,
      k1to10: 0,
      k10to50: 0,
      k50to100: 0,
      over100k: 0
    }
  };
  
  // Group trades by time windows for sweep detection
  const timeWindows = groupTradesByTimeWindow(filteredTrades, 2000); // 2 second windows for AlgoFlow
  
  for (const window of timeWindows) {
    if (window.trades.length >= 3) {
      const exchanges = [...new Set(window.trades.map(t => t.exchange))];
      
      if (exchanges.length >= 2) {
        // Multi-exchange sweep
        const totalPremium = window.trades.reduce((sum, t) => sum + t.total_premium, 0);
        sweeps.push({
          timestamp: window.startTime,
          trades: window.trades.length,
          exchanges: exchanges.length,
          totalPremium,
          avgPremium: totalPremium / window.trades.length
        });
      }
    }
  }
  
  // Process individual trades
  for (const trade of trades) {
    const premium = trade.total_premium || 0;
    
    // Premium analysis
    premiumAnalysis.total += premium;
    premiumAnalysis.high = Math.max(premiumAnalysis.high, premium);
    
    // Premium buckets
    if (premium < 1000) premiumAnalysis.buckets.under1k++;
    else if (premium < 10000) premiumAnalysis.buckets.k1to10++;
    else if (premium < 50000) premiumAnalysis.buckets.k10to50++;
    else if (premium < 100000) premiumAnalysis.buckets.k50to100++;
    else premiumAnalysis.buckets.over100k++;
    
    // Block trades (high premium)
    if (premium >= 50000) {
      blocks.push({
        timestamp: trade.trade_timestamp,
        premium,
        size: trade.trade_size,
        strike: trade.strike_price,
        expiry: trade.expiry_date
      });
    }
    
    // Dark pool detection
    if (trade.exchange && ['DARK', 'EDGX', 'BATS'].includes(trade.exchange)) {
      darkPoolTrades.push({
        timestamp: trade.trade_timestamp,
        premium,
        exchange: trade.exchange
      });
    }
  }
  
  premiumAnalysis.avg = premiumAnalysis.total / trades.length;
  
  return {
    symbol,
    tradesProcessed: trades.length,
    sweeps: sweeps.length,
    blocks: blocks.length,
    darkPoolTrades: darkPoolTrades.length,
    premiumAnalysis,
    sweepDetails: sweeps,
    blockDetails: blocks,
    darkPoolDetails: darkPoolTrades
  };
}

function groupTradesByTimeWindow(trades, windowMs) {
  const windows = [];
  let currentWindow = null;
  
  for (const trade of trades) {
    const tradeTime = new Date(trade.trade_timestamp).getTime();
    
    if (!currentWindow || tradeTime - currentWindow.startTime > windowMs) {
      currentWindow = {
        startTime: tradeTime,
        endTime: tradeTime + windowMs,
        trades: [trade]
      };
      windows.push(currentWindow);
    } else {
      currentWindow.trades.push(trade);
      currentWindow.endTime = Math.max(currentWindow.endTime, tradeTime);
    }
  }
  
  return windows;
}