const { parentPort, workerData } = require('worker_threads');
const https = require('https');

// Simple worker that makes direct API calls to avoid module resolution issues
if (parentPort) {
 try {
 const { batch, workerIndex, apiKey } = workerData;
 
 console.log(` Worker ${workerIndex}: Processing ${batch.length} tickers`);
 
 if (!apiKey) {
 console.error(` Worker ${workerIndex}: API key not provided in workerData`);
 parentPort.postMessage({
 success: false,
 error: 'API key not configured',
 workerIndex: workerIndex
 });
 return;
 }
 
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

 // Smart timestamp logic for live vs historical scanning
 function getSmartTimeRange() {
 try {
 const now = new Date();
 const eastern = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
 const easternHour = eastern.getHours();
 const easternMinute = eastern.getMinutes();
 const currentTime = easternHour + (easternMinute / 60);
 const day = eastern.getDay(); // 0 = Sunday, 6 = Saturday
 
 // Market hours: 9:30 AM - 4:00 PM ET
 const marketOpen = 9.5; // 9:30 AM
 const marketClose = 16; // 4:00 PM
 const isMarketOpen = (day >= 1 && day <= 5) && (currentTime >= marketOpen && currentTime < marketClose);
 
 if (isMarketOpen) {
 // LIVE MODE: Market is open - Get 9:30 AM ET today
 const year = eastern.getFullYear();
 const month = eastern.getMonth() + 1;
 const dayOfMonth = eastern.getDate();
 
 // Determine if we're in EDT or EST
 const isDST = now.toLocaleString('en-US', {
 timeZone: 'America/New_York',
 timeZoneName: 'short'
 }).includes('EDT');
 
 const tzOffset = isDST ? '-0400' : '-0500';
 const dateStr = `${year}-${month.toString().padStart(2, '0')}-${dayOfMonth.toString().padStart(2, '0')} 09:30:00 GMT${tzOffset}`;
 
 const todayMarketOpen = new Date(dateStr);
 const startTime = todayMarketOpen.getTime() * 1000000; // Convert to nanoseconds
 const endTime = now.getTime() * 1000000; // Current time in nanoseconds
 
 console.log(` Worker ${workerIndex}: LIVE MODE - Market is OPEN`);
 console.log(` • Market Open: ${todayMarketOpen.toLocaleString('en-US', {timeZone: 'America/New_York'})} ET`);
 return { startTime, endTime, isLive: true, date: eastern.toISOString().split('T')[0] };
 } else {
 // HISTORICAL MODE: Market is closed
 let tradingDate = new Date(eastern);
 
 // If today is weekday but after hours, scan today's session
 if (day >= 1 && day <= 5 && currentTime >= marketClose) {
 // Today was a trading day but market closed - scan today's full session
 console.log(` Worker ${workerIndex}: AFTER-HOURS MODE - Scanning today's completed session`);
 } else {
 // Weekend or before market open - find last trading day
 if (day === 0) { // Sunday
 tradingDate.setDate(tradingDate.getDate() - 2); // Friday
 } else if (day === 6) { // Saturday
 tradingDate.setDate(tradingDate.getDate() - 1); // Friday
 } else if (currentTime < marketOpen) {
 // Before market open on weekday - use previous day
 tradingDate.setDate(tradingDate.getDate() - 1);
 if (tradingDate.getDay() === 0) tradingDate.setDate(tradingDate.getDate() - 2); // Skip Sunday
 if (tradingDate.getDay() === 6) tradingDate.setDate(tradingDate.getDate() - 1); // Skip Saturday
 }
 console.log(` Worker ${workerIndex}: HISTORICAL MODE - Scanning last trading day`);
 }
 
 // Create full trading day range (9:30 AM - 4:00 PM ET)
 const year = tradingDate.getFullYear();
 const month = tradingDate.getMonth() + 1;
 const dayOfMonth = tradingDate.getDate();
 
 // Determine if we're in EDT or EST for this date
 const isDST = tradingDate.toLocaleString('en-US', {
 timeZone: 'America/New_York',
 timeZoneName: 'short'
 }).includes('EDT');
 
 const tzOffset = isDST ? '-0400' : '-0500';
 
 const marketOpenStr = `${year}-${month.toString().padStart(2, '0')}-${dayOfMonth.toString().padStart(2, '0')} 09:30:00 GMT${tzOffset}`;
 const marketCloseStr = `${year}-${month.toString().padStart(2, '0')}-${dayOfMonth.toString().padStart(2, '0')} 16:00:00 GMT${tzOffset}`;
 
 const marketOpenTime = new Date(marketOpenStr);
 const marketCloseTime = new Date(marketCloseStr);
 
 const startTime = marketOpenTime.getTime() * 1000000; // Convert to nanoseconds
 const endTime = marketCloseTime.getTime() * 1000000; // Convert to nanoseconds
 
 console.log(` • Historical start: ${marketOpenTime.toLocaleString('en-US', {timeZone: 'America/New_York'})} ET`);
 console.log(` • Historical end: ${marketCloseTime.toLocaleString('en-US', {timeZone: 'America/New_York'})} ET`);
 
 return { startTime, endTime, isLive: false, date: tradingDate.toISOString().split('T')[0] };
 }
 } catch (error) {
 console.error(` Worker ${workerIndex}: Error calculating time range:`, error);
 // Fallback to today
 const fallback = new Date();
 fallback.setHours(9, 30, 0, 0);
 const startTime = fallback.getTime() * 1000000;
 const endTime = Date.now() * 1000000;
 return { startTime, endTime, isLive: false, date: fallback.toISOString().split('T')[0] };
 }
 }
 
 // Process each ticker in the batch
 async function processBatch() {
 const results = [];
 const timeRange = getSmartTimeRange();
 
 console.log(` Worker ${workerIndex}: ${timeRange.isLive ? 'LIVE' : 'HISTORICAL'} scan for ${timeRange.date}`);
 console.log(` • Start: ${new Date(timeRange.startTime / 1000000).toLocaleString('en-US', {timeZone: 'America/New_York'})} ET`);
 console.log(` • End: ${new Date(timeRange.endTime / 1000000).toLocaleString('en-US', {timeZone: 'America/New_York'})} ET`);
 
 for (const ticker of batch) {
 try {
 console.log(` Worker ${workerIndex}: Scanning ${ticker}...`);
 
 // Send progress update for each ticker being scanned
 parentPort.postMessage({
 type: 'ticker_progress',
 workerIndex: workerIndex,
 ticker: ticker,
 message: `Scanning ${ticker} contracts...`,
 success: true
 });
 
 // Get CURRENT stock price for accurate 5% ITM filtering
 let spotPrice = 100; // Fallback
 
 try {
 // Get current price
 const currentPriceUrl = `https://api.polygon.io/v2/last/trade/${ticker}?apikey=${apiKey}`;
 let priceResponse = await makePolygonRequest(currentPriceUrl);
 
 if (priceResponse.results?.P) {
 spotPrice = priceResponse.results.P;
 console.log(` Worker ${workerIndex}: ${ticker} LIVE price $${spotPrice} (real-time)`);
 } else {
 // Fallback to previous close if real-time unavailable
 const prevPriceUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apikey=${apiKey}`;
 priceResponse = await makePolygonRequest(prevPriceUrl);
 spotPrice = priceResponse.results?.[0]?.c || 100;
 console.log(` Worker ${workerIndex}: ${ticker} previous close $${spotPrice} (fallback)`);
 }
 } catch (e) {
 console.warn(` Worker ${workerIndex}: Could not get ${ticker} price, using fallback $${spotPrice}`);
 }
 
 // Get options contracts first, then check for trades (like original service)
 const contractsUrl = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&limit=1000&apikey=${apiKey}`;
 
 const contractsResponse = await makePolygonRequest(contractsUrl);
 
 if (contractsResponse.results && contractsResponse.results.length > 0) {
 // Apply PRECISE 5% ITM FILTER using current spot price
 const validContracts = contractsResponse.results.filter(contract => {
 const strike = contract.strike_price;
 const contractType = contract.contract_type?.toLowerCase();
 
 if (!strike || !contractType || spotPrice <= 0) return false;
 
 // PRECISE 5% ITM CALCULATION based on current spot price
 const pctFromMoney = (strike - spotPrice) / spotPrice;
 
 if (contractType === 'call') {
 // For CALLS: Strike > Spot = OTM (positive %), Strike < Spot = ITM (negative %)
 // Allow: ALL OTM (pctFromMoney > 0) + up to 5% ITM (pctFromMoney >= -0.05)
 return pctFromMoney >= -0.05;
 } else if (contractType === 'put') {
 // For PUTS: Strike < Spot = OTM (negative %), Strike > Spot = ITM (positive %)
 // Allow: ALL OTM (pctFromMoney < 0) + up to 5% ITM (pctFromMoney <= 0.05)
 return pctFromMoney <= 0.05;
 }
 
 return false;
 });
 
 console.log(` Worker ${workerIndex}: ${ticker} @ $${spotPrice} - ${contractsResponse.results.length} → ${validContracts.length} contracts after PRECISE 5% ITM filter`);
 
 const contractsToScan = validContracts;
 const contractBatchSize = 50; // Process 50 contracts simultaneously with unlimited API
 
 console.log(` Worker ${workerIndex}: Processing ${contractsToScan.length} contracts in parallel batches of ${contractBatchSize}`);
 
 // Split contracts into parallel batches
 const contractBatches = [];
 for (let i = 0; i < contractsToScan.length; i += contractBatchSize) {
 contractBatches.push(contractsToScan.slice(i, i + contractBatchSize));
 }
 
 // Process each batch in parallel
 for (let batchIndex = 0; batchIndex < contractBatches.length; batchIndex++) {
 const contractBatch = contractBatches[batchIndex];
 
 console.log(` Worker ${workerIndex}: Processing batch ${batchIndex + 1}/${contractBatches.length} (${contractBatch.length} contracts)`);
 
 // Process entire batch in parallel
 const batchPromises = contractBatch.map(async (contract) => {
 try {
 const tradesUrl = `https://api.polygon.io/v3/trades/${contract.ticker}?timestamp.gte=${timeRange.startTime}&timestamp.lte=${timeRange.endTime}&limit=1000&apikey=${apiKey}`;
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
 console.log(` Worker ${workerIndex}: ${ticker} contract ${contract.ticker} found ${contractTrades.length} trades`);
 
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
        const totalPremium = tradePrice * tradeSize * 100; // Price per contract × contracts × 100 shares per contract
 const strikePrice = contract.strike_price || 0;
 // Get CORRECTED expiry date (fix 2024 -> 2025/2026 issue)
 let expiryDate = contract.expiration_date || '';
 
 // Fix year issue: if expiry shows 2024 but we're in 2025, correct it
 if (expiryDate && expiryDate.includes('2024')) {
 const currentYear = new Date().getFullYear();
 if (currentYear >= 2025) {
 // Check if this is likely a current/future expiry that got mislabeled
 const expiryTest = new Date(expiryDate);
 const monthDay = expiryTest.getMonth() * 100 + expiryTest.getDate();
 const currentMonthDay = new Date().getMonth() * 100 + new Date().getDate();
 
 // If expiry month/day is current or future, update year
 if (monthDay >= currentMonthDay) {
 expiryDate = expiryDate.replace('2024', currentYear.toString());
 console.log(` Worker ${workerIndex}: Corrected expiry ${contract.expiration_date} → ${expiryDate}`);
 } else {
 // If it's clearly a past date, use next year
 expiryDate = expiryDate.replace('2024', (currentYear + 1).toString());
 console.log(` Worker ${workerIndex}: Corrected expiry ${contract.expiration_date} → ${expiryDate} (next year)`);
 }
 }
 }
 
 // Get ACTUAL trade timestamp (sip_timestamp is most accurate)
 const actualTradeTimestamp = trade.sip_timestamp || trade.participant_timestamp || trade.timestamp;
 const tradeDate = actualTradeTimestamp ? new Date(actualTradeTimestamp / 1000000) : new Date();
 
 // Get HISTORICAL spot price at the EXACT time of the trade (cached for performance)
 const tradeTimeSpotPrice = await getHistoricalSpotPrice(ticker, actualTradeTimestamp, spotPrice);
 
 // COLLECT ALL TRADES - Tier filtering will happen AFTER aggregation in main service
 // This allows sweep detection to work properly by aggregating small trades first
 
 // Calculate days to expiry using CORRECTED expiry date
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
 premium_per_contract: totalPremium / (tradeSize * 100), // Calculate actual per-contract from total
 total_premium: totalPremium,
 trade_type: undefined, // Will be classified later based on exchange distribution
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
 console.error(` Worker ${workerIndex}: Trade processing error:`, error);
 return null;
 }
 }));
 
 allProcessedTrades.push(...processedTradeBatch);
 }
 
 // Filter out null trades from all batches
 const validTrades = allProcessedTrades.filter(trade => trade !== null);
 
 console.log(` Worker ${workerIndex}: Processed ${validTrades.length} valid trades for ${contract.ticker}`);
 
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
 console.error(` Worker ${workerIndex}: Error with ${ticker}:`, error.message);
 }
 }
 
 console.log(` Worker ${workerIndex}: Completed batch with ${results.length} total trades`);
 
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
 console.error(` Worker ${workerIndex}: Fatal error:`, error.message);
 parentPort.postMessage({
 success: false,
 error: error.message,
 workerIndex: workerIndex
 });
 });
 
 } catch (error) {
 console.error(` Worker initialization error:`, error.message);
 if (parentPort) {
 parentPort.postMessage({
 success: false,
 error: error.message,
 workerIndex: workerData?.workerIndex || 'unknown'
 });
 }
 }
}
