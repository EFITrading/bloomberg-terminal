const { parentPort, workerData } = require('worker_threads');
const https = require('https');

// Simple worker that makes direct API calls to avoid module resolution issues
if (parentPort) {
  try {
    const { batch, workerIndex } = workerData;
    const apiKey = process.env.POLYGON_API_KEY || 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
    
    console.log(`🔧 Worker ${workerIndex}: Processing ${batch.length} tickers`);
    
    // Simple function to make Polygon API calls
    function makePolygonRequest(url) {
      return new Promise((resolve, reject) => {
        https.get(url, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              resolve(parsed);
            } catch (error) {
              reject(new Error(`JSON parse error: ${error.message}`));
            }
          });
        }).on('error', reject);
      });
    }
    
    // Exchange name mapping (same as main service)
    function getExchangeName(exchangeId) {
      const exchangeNames = {
        1: 'CBOE',
        2: 'ISE', 
        3: 'NASDAQ',
        4: 'NYSE',
        5: 'MIAX',
        6: 'PEARL',
        7: 'EMERALD',
        8: 'BOX',
        9: 'GEMINI',
        300: 'OPRA',
        302: 'BATO',
        303: 'BZX',
        304: 'EDGX',
        309: 'MIAX',
        313: 'ISE',
        322: 'NASDAQ'
      };
      return exchangeNames[exchangeId] || `Exchange_${exchangeId}`;
    }

    // OPTIMIZED: Cache historical prices to avoid repeated API calls
    const priceCache = new Map();
    
    // Get historical spot price at exact trade time (cached)
    async function getHistoricalSpotPrice(ticker, tradeTimestamp, currentSpotPrice) {
      try {
        if (!tradeTimestamp) return currentSpotPrice; // Fallback to current price
        
        const tradeDate = new Date(tradeTimestamp / 1000000);
        const dateStr = tradeDate.toISOString().split('T')[0];
        const cacheKey = `${ticker}-${dateStr}`;
        
        // Check cache first
        if (priceCache.has(cacheKey)) {
          const cachedData = priceCache.get(cacheKey);
          // Find closest minute for this specific trade
          const tradeTime = tradeDate.getTime();
          let closestBar = null;
          let closestTimeDiff = Infinity;
          
          for (const bar of cachedData) {
            const barTime = bar.t;
            const timeDiff = Math.abs(tradeTime - barTime);
            if (timeDiff < closestTimeDiff) {
              closestTimeDiff = timeDiff;
              closestBar = bar;
            }
          }
          
          return closestBar ? closestBar.c : currentSpotPrice;
        }
        
        // Get minute-level data for the trade date
        const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/minute/${dateStr}/${dateStr}?adjusted=true&sort=asc&apikey=${apiKey}`;
        const response = await makePolygonRequest(url);
        
        if (response.results && response.results.length > 0) {
          // Cache the results for this ticker-date
          priceCache.set(cacheKey, response.results);
          
          // Find the closest minute bar to the trade timestamp
          const tradeTime = tradeDate.getTime();
          let closestBar = null;
          let closestTimeDiff = Infinity;
          
          for (const bar of response.results) {
            const barTime = bar.t; // Bar timestamp in milliseconds
            const timeDiff = Math.abs(tradeTime - barTime);
            if (timeDiff < closestTimeDiff) {
              closestTimeDiff = timeDiff;
              closestBar = bar;
            }
          }
          
          if (closestBar) {
            return closestBar.c; // Use close price of closest minute bar
          }
        }
        
        return currentSpotPrice; // Fallback to current price
      } catch (error) {
        return currentSpotPrice; // Fallback on error
      }
    }

    // Get market open timestamp (9:30 AM ET) like the original service
    function getTodaysMarketOpenTimestamp() {
      try {
        // Create a date for today at 9:30 AM ET
        const now = new Date();
        const marketOpen = new Date();
        marketOpen.setFullYear(now.getFullYear(), now.getMonth(), now.getDate());
        marketOpen.setHours(9, 30, 0, 0);
        
        // Adjust for weekends - get last trading day
        const day = marketOpen.getDay();
        
        if (day === 0) { // Sunday - go to Friday
          marketOpen.setDate(marketOpen.getDate() - 2);
        } else if (day === 6) { // Saturday - go to Friday  
          marketOpen.setDate(marketOpen.getDate() - 1);
        }
        
        return marketOpen.getTime();
      } catch (error) {
        console.error(`❌ Worker ${workerIndex}: Error calculating market open:`, error);
        const fallback = new Date();
        fallback.setHours(9, 30, 0, 0);
        return fallback.getTime();
      }
    }
    
    // Process each ticker in the batch
    async function processBatch() {
      const results = [];
      const marketOpenTimestamp = getTodaysMarketOpenTimestamp();
      const marketOpenNanos = marketOpenTimestamp * 1000000; // Convert to nanoseconds
      
      console.log(`📅 Worker ${workerIndex}: Using market open ${new Date(marketOpenTimestamp).toLocaleString('en-US', {timeZone: 'America/New_York'})} ET`);
      
      for (const ticker of batch) {
        try {
          console.log(`📊 Worker ${workerIndex}: Scanning ${ticker}...`);
          
          // Send progress update for each ticker being scanned
          parentPort.postMessage({
            type: 'ticker_progress',
            workerIndex: workerIndex,
            ticker: ticker,
            message: `Scanning ${ticker} contracts...`,
            success: true
          });
          
          // Get current stock price for 5% ITM filtering
          const priceUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apikey=${apiKey}`;
          let spotPrice = 100; // Fallback
          
          try {
            const priceResponse = await makePolygonRequest(priceUrl);
            spotPrice = priceResponse.results?.[0]?.c || 100;
            console.log(`💰 Worker ${workerIndex}: ${ticker} spot price $${spotPrice}`);
          } catch (e) {
            console.warn(`⚠️ Worker ${workerIndex}: Could not get ${ticker} price, using fallback`);
          }
          
          // Get options contracts first, then check for trades (like original service)
          const contractsUrl = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&limit=1000&apikey=${apiKey}`;
          
          const contractsResponse = await makePolygonRequest(contractsUrl);
          
          if (contractsResponse.results && contractsResponse.results.length > 0) {
            // Apply YOUR 5% ITM FILTER before processing trades
            const validContracts = contractsResponse.results.filter(contract => {
              const strike = contract.strike_price;
              const contractType = contract.contract_type?.toLowerCase();
              
              if (!strike || !contractType || spotPrice <= 0) return false;
              
              // YOUR EXACT 5% ITM RULE: Only 5% ITM max + ALL OTM contracts
              if (contractType === 'call') {
                const percentFromATM = (strike - spotPrice) / spotPrice;
                return percentFromATM >= -0.05; // Only 5% ITM max, unlimited OTM
              } else if (contractType === 'put') {
                const percentFromATM = (strike - spotPrice) / spotPrice;
                return percentFromATM <= 0.05; // Only 5% ITM max, unlimited OTM
              }
              
              return false;
            });
            
            console.log(`🎯 Worker ${workerIndex}: ${ticker} - ${contractsResponse.results.length} → ${validContracts.length} contracts after 5% ITM filter`);
            
            // ULTRA-FAST: Process ALL contracts in PARALLEL batches
            const contractsToScan = validContracts;
            const contractBatchSize = 50; // Process 50 contracts simultaneously with unlimited API
            
            console.log(`🚀 Worker ${workerIndex}: Processing ${contractsToScan.length} contracts in parallel batches of ${contractBatchSize}`);
            
            // Split contracts into parallel batches
            const contractBatches = [];
            for (let i = 0; i < contractsToScan.length; i += contractBatchSize) {
              contractBatches.push(contractsToScan.slice(i, i + contractBatchSize));
            }
            
            // Process each batch in parallel
            for (let batchIndex = 0; batchIndex < contractBatches.length; batchIndex++) {
              const contractBatch = contractBatches[batchIndex];
              
              console.log(`⚡ Worker ${workerIndex}: Processing batch ${batchIndex + 1}/${contractBatches.length} (${contractBatch.length} contracts)`);
              
              // Process entire batch in parallel
              const batchPromises = contractBatch.map(async (contract) => {
                try {
                  const tradesUrl = `https://api.polygon.io/v3/trades/${contract.ticker}?timestamp.gte=${marketOpenNanos}&limit=1000&apikey=${apiKey}`;
                  const tradesResponse = await makePolygonRequest(tradesUrl);
                  
                  if (tradesResponse.results && tradesResponse.results.length > 0) {
                    return { contract, trades: tradesResponse.results };
                  }
                  return null;
                } catch (error) {
                  return null; // Skip failed contracts
                }
              });
              
              // Wait for entire batch to complete
              const batchResults = await Promise.all(batchPromises);
              
              // Process all trade results from this batch
              for (const result of batchResults) {
                if (result && result.trades) {
                  const { contract, trades: contractTrades } = result;
                  console.log(`✅ Worker ${workerIndex}: ${ticker} contract ${contract.ticker} found ${contractTrades.length} trades`);
                  
                  // ULTRA-FAST: Process trades in parallel batches for speed
                  const tradeBatchSize = 10; // Process 10 trades at once
                  const tradeBatches = [];
                  for (let i = 0; i < contractTrades.length; i += tradeBatchSize) {
                    tradeBatches.push(contractTrades.slice(i, i + tradeBatchSize));
                  }
                  
                  const allProcessedTrades = [];
                  
                  // Process each trade batch in parallel
                  for (const tradeBatch of tradeBatches) {
                    const processedTradeBatch = await Promise.all(tradeBatch.map(async (trade) => {
                    try {
                      const tradePrice = trade.price || 0;
                      const tradeSize = trade.size || 1;
                      const totalPremium = tradePrice * tradeSize * 100; // Multiply by 100 for options contract multiplier
                      const strikePrice = contract.strike_price || 0;
                      const expiryDate = contract.expiration_date || '';
                      
                      // Get ACTUAL trade timestamp (sip_timestamp is most accurate)
                      const actualTradeTimestamp = trade.sip_timestamp || trade.participant_timestamp || trade.timestamp;
                      const tradeDate = actualTradeTimestamp ? new Date(actualTradeTimestamp / 1000000) : new Date();
                      
                      // Get HISTORICAL spot price at the EXACT time of the trade (cached for performance)
                      const tradeTimeSpotPrice = await getHistoricalSpotPrice(ticker, actualTradeTimestamp, spotPrice);
                      
                      // Apply YOUR EXACT TIER SYSTEM - Same as passesInstitutionalCriteria()
                      const institutionalTiers = [
                        { name: 'Tier 1: Premium institutional', minPrice: 8.00, minSize: 80 },
                        { name: 'Tier 2: High-value large volume', minPrice: 7.00, minSize: 100 },
                        { name: 'Tier 3: Mid-premium bulk', minPrice: 5.00, minSize: 150 },
                        { name: 'Tier 4: Moderate premium large', minPrice: 3.50, minSize: 200 },
                        { name: 'Tier 5: Lower premium large', minPrice: 2.50, minSize: 200 },
                        { name: 'Tier 6: Small premium massive', minPrice: 1.00, minSize: 800 },
                        { name: 'Tier 7: Penny options massive', minPrice: 0.50, minSize: 2000 },
                        { name: 'Tier 8: Premium bypass', minPrice: 0.01, minSize: 20, minTotal: 50000 }
                      ];
                      
                      // Check if trade passes YOUR tier criteria
                      const passesTierCriteria = institutionalTiers.some(tier => {
                        const passesPrice = tradePrice >= tier.minPrice;
                        const passesSize = tradeSize >= tier.minSize;
                        const passesTotal = tier.minTotal ? totalPremium >= tier.minTotal : true;
                        return passesPrice && passesSize && passesTotal;
                      });
                      
                      // Skip trades that don't meet YOUR criteria
                      if (!passesTierCriteria) {
                        return null; // Filter out trades that don't meet your tiers
                      }
                      
                      // Calculate days to expiry
                      const daysToExpiry = expiryDate ? Math.max(0, Math.ceil((new Date(expiryDate) - new Date()) / (1000 * 60 * 60 * 24))) : 0;
                      
                      // Calculate proper moneyness using HISTORICAL spot price
                      let moneyness = 'OTM';
                      const contractType = contract.contract_type?.toLowerCase();
                      if (tradeTimeSpotPrice > 0 && strikePrice > 0) {
                        const percentDiff = Math.abs(tradeTimeSpotPrice - strikePrice) / tradeTimeSpotPrice;
                        if (percentDiff < 0.01) {
                          moneyness = 'ATM';
                        } else if (contractType === 'call') {
                          moneyness = tradeTimeSpotPrice > strikePrice ? 'ITM' : 'OTM';
                        } else {
                          moneyness = tradeTimeSpotPrice < strikePrice ? 'ITM' : 'OTM';
                        }
                      }
                      
                      return {
                        underlying_ticker: ticker,
                        ticker: contract.ticker,
                        option_ticker: contract.ticker,
                        trade_size: tradeSize,
                        premium_per_contract: tradePrice,
                        total_premium: totalPremium,
                        trade_type: totalPremium >= 25000 ? 'BLOCK' : undefined,
                        trade_timestamp: tradeDate, // ACTUAL trade time, not current time
                        timestamp: tradeDate.toISOString(),
                        sip_timestamp: actualTradeTimestamp, // Include original nanosecond timestamp
                        strike: strikePrice,
                        expiry: expiryDate,
                        type: contractType || 'call',
                        spot_price: tradeTimeSpotPrice, // HISTORICAL spot price at trade time
                        exchange: trade.exchange,
                        exchange_name: getExchangeName(trade.exchange) || 'Unknown',
                        moneyness: moneyness,
                        days_to_expiry: daysToExpiry,
                        worker: workerIndex,
                        conditions: trade.conditions || []
                      };
                    } catch (error) {
                      console.error(`❌ Worker ${workerIndex}: Trade processing error:`, error);
                      return null;
                    }
                    }));
                    
                    allProcessedTrades.push(...processedTradeBatch);
                  }
                  
                  // Filter out null trades from all batches
                  const validTrades = allProcessedTrades.filter(trade => trade !== null);
                  
                  console.log(`🔧 Worker ${workerIndex}: Processed ${validTrades.length} valid trades for ${contract.ticker}`);
                  
                  // STREAM trades immediately as they're found (don't wait till end)
                  if (validTrades.length > 0) {
                    parentPort.postMessage({
                      type: 'trades_found',
                      trades: validTrades,
                      workerIndex: workerIndex,
                      ticker: ticker,
                      contract: contract.ticker,
                      success: true
                    });
                  }
                  
                  results.push(...validTrades);
                }
              }
            }
          }
        } catch (error) {
          console.error(`❌ Worker ${workerIndex}: Error with ${ticker}:`, error.message);
        }
      }
      
      console.log(`🎯 Worker ${workerIndex}: Completed batch with ${results.length} total trades`);
      
      // Send results back to main thread
      parentPort.postMessage({
        success: true,
        trades: results,
        workerIndex: workerIndex,
        processedTickers: batch.length
      });
    }
    
    // Start processing
    processBatch().catch(error => {
      console.error(`💥 Worker ${workerIndex}: Fatal error:`, error.message);
      parentPort.postMessage({
        success: false,
        error: error.message,
        workerIndex: workerIndex
      });
    });
    
  } catch (error) {
    console.error(`💥 Worker initialization error:`, error.message);
    if (parentPort) {
      parentPort.postMessage({
        success: false,
        error: error.message,
        workerIndex: workerData?.workerIndex || 'unknown'
      });
    }
  }
}
