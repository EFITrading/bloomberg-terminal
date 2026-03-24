/* eslint-disable @typescript-eslint/no-require-imports */
const { parentPort, workerData } = require('worker_threads');
const https = require('https');

// Persistent keepAlive agent: reuses TCP connections so we open at most maxSockets
// connections total instead of one per API call. This prevents TIME_WAIT fd exhaustion
// which caused EMFILE errors on tickers 3+ when hundreds of closed sockets stayed in
// TIME_WAIT for 60s and consumed all OS file descriptors.
const keepAliveAgent = new https.Agent({
       keepAlive: true,
       maxSockets: 10,
       maxFreeSockets: 10,
       timeout: 30000,
});

// Simple worker that makes direct API calls to avoid module resolution issues
if (parentPort) {
       try {
              const { batch, workerIndex, apiKey, dateRange } = workerData;

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
                            https.get(url, { agent: keepAliveAgent }, (res) => {
                                   // Check HTTP status code BEFORE parsing
                                   if (res.statusCode !== 200) {
                                          reject(new Error(`API returned status ${res.statusCode} for ${url.substring(0, 100)}`));
                                          return;
                                   }

                                   let data = '';
                                   res.on('data', chunk => data += chunk);
                                   res.on('end', () => {
                                          // Check for empty response
                                          if (!data || data.trim() === '') {
                                                 reject(new Error(`Empty response from API: ${url.substring(0, 100)}`));
                                                 return;
                                          }

                                          try {
                                                 const parsed = JSON.parse(data);
                                                 resolve(parsed);
                                          } catch (error) {
                                                 console.error(` Worker ${workerIndex}: Failed to parse response:`, data.substring(0, 200));
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
              // NOTE: Historical data is now PRE-FETCHED before processing contracts
              // This function just looks up the cache - no API calls happen here
              async function getHistoricalSpotPrice(ticker, tradeTimestamp, currentSpotPrice) {
                     try {
                            // For SPX/VIX only, we skip historical lookup (indices don't need minute-level precision)
                            const SKIP_HISTORICAL = ['SPX', 'VIX'];
                            if (SKIP_HISTORICAL.includes(ticker)) {
                                   return currentSpotPrice;
                            }

                            if (!tradeTimestamp) {
                                   console.warn(` Worker: No timestamp for ${ticker}, cannot get historical price`);
                                   return 0; // Don't use fake fallbacks
                            }

                            const tradeDate = new Date(tradeTimestamp / 1000000);
                            const dateStr = tradeDate.toISOString().split('T')[0];
                            const cacheKey = `${ticker}-${dateStr}`;

                            // Check cache (should already be populated by pre-fetch)
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

                            // Cache miss (shouldn't happen with pre-fetch, but fallback to current price)
                            return currentSpotPrice;
                     } catch (error) {
                            console.error(` Worker: Error getting historical price for ${ticker}:`, error.message);
                            return currentSpotPrice; // Return current as fallback only on error
                     }
              }

              // US market holidays 2025-2026 — used for holiday detection without API calls
              const WORKER_MARKET_HOLIDAYS = [
                     '2025-01-01', '2025-01-20', '2025-02-17', '2025-04-18',
                     '2025-05-26', '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25',
                     '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03',
                     '2026-05-25', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
              ];

              /**
               * Build the exact millisecond timestamp for 6:30 AM PST/PDT (market open) on a given
               * YYYY-MM-DD string. Uses the America/Los_Angeles DST flag for the correct PST/PDT offset.
               */
              function marketOpenMs(dateStr) {
                     const [y, m, d] = dateStr.split('-').map(Number);
                     const probe = new Date(y, m - 1, d, 12, 0, 0);
                     const isPDT = probe.toLocaleString('en-US', {
                            timeZone: 'America/Los_Angeles', timeZoneName: 'short'
                     }).includes('PDT');
                     const pstOffset = isPDT ? '-07:00' : '-08:00';
                     return new Date(`${dateStr}T06:30:00${pstOffset}`).getTime(); // 6:30 AM PST = market open
              }

              function marketCloseMs(dateStr) {
                     const [y, m, d] = dateStr.split('-').map(Number);
                     const probe = new Date(y, m - 1, d, 12, 0, 0);
                     const isPDT = probe.toLocaleString('en-US', {
                            timeZone: 'America/Los_Angeles', timeZoneName: 'short'
                     }).includes('PDT');
                     const pstOffset = isPDT ? '-07:00' : '-08:00';
                     return new Date(`${dateStr}T13:00:00${pstOffset}`).getTime(); // 1:00 PM PST = market close
              }

              /**
               * Returns the most recent trading day (YYYY-MM-DD) using the inline holiday list.
               * No API call required.
               */
              function getLastTradingDayWorker(pstNow) {
                     const currentTime = pstNow.getHours() + pstNow.getMinutes() / 60;
                     const candidate = new Date(pstNow);
                     // Before 1 AM PST: current calendar day hasn't had pre-market yet
                     if (currentTime < 1.0) candidate.setDate(candidate.getDate() - 1);

                     for (let i = 0; i < 14; i++) {
                            const y = candidate.getFullYear();
                            const m = String(candidate.getMonth() + 1).padStart(2, '0');
                            const d = String(candidate.getDate()).padStart(2, '0');
                            const dateStr = `${y}-${m}-${d}`;
                            const dow = candidate.getDay();
                            if (dow !== 0 && dow !== 6 && !WORKER_MARKET_HOLIDAYS.includes(dateStr)) {
                                   return dateStr;
                            }
                            candidate.setDate(candidate.getDate() - 1);
                     }
                     // Fallback
                     const y = candidate.getFullYear();
                     const m = String(candidate.getMonth() + 1).padStart(2, '0');
                     const d = String(candidate.getDate()).padStart(2, '0');
                     return `${y}-${m}-${d}`;
              }

              /**
               * Smart timestamp logic for live vs historical scanning.
               *
               * Live data windows (PST / America/Los_Angeles, confirmed from Polygon tests):
               *   PRE_MARKET:  1:00 AM – 6:29 AM PST  weekday non-holiday
               *   MARKET:      6:30 AM – 12:59 PM PST  weekday non-holiday
               *   AFTER_HOURS: 1:00 PM – 4:59 PM PST  weekday non-holiday
               *   CLOSED:      5:00 PM – 12:59 AM PST, weekends, holidays → use last trading day
               */
              function getSmartTimeRange() {
                     try {
                            const now = new Date();
                            const pst = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
                            const dayOfWeek = pst.getDay();
                            const currentTime = pst.getHours() + (pst.getMinutes() / 60);

                            const year = pst.getFullYear();
                            const month = String(pst.getMonth() + 1).padStart(2, '0');
                            const dayOfMonth = String(pst.getDate()).padStart(2, '0');
                            const todayStr = `${year}-${month}-${dayOfMonth}`;

                            // Check if live data is available:
                            //   weekday + not holiday + PST time in [1:00 AM, 5:00 PM)
                            const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
                            const isHoliday = WORKER_MARKET_HOLIDAYS.includes(todayStr);
                            const isLiveWindow = currentTime >= 1.0 && currentTime < 17.0;
                            const isLive = isWeekday && !isHoliday && isLiveWindow;

                            if (isLive) {
                                   // LIVE MODE: pre-market, market, or after-hours on a trading day
                                   let sessionLabel = 'MARKET';
                                   if (currentTime < 6.5) sessionLabel = 'PRE-MARKET';     // before 6:30 AM
                                   else if (currentTime >= 13.0) sessionLabel = 'AFTER-HOURS'; // after 1:00 PM

                                   const startMs = marketOpenMs(todayStr);
                                   const endMs = now.getTime();

                                   console.log(` Worker ${workerIndex}: LIVE MODE (${sessionLabel}) - scanning today ${todayStr}`);
                                   console.log(`   - Start: ${new Date(startMs).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} PST`);
                                   return {
                                          startTime: startMs * 1000000, // nanoseconds
                                          endTime: endMs * 1000000,
                                          isLive: true,
                                          date: todayStr,
                                   };
                            } else {
                                   // CLOSED MODE: overnight dead-zone, weekend, or holiday
                                   const lastTradingDay = getLastTradingDayWorker(pst);
                                   const startMs = marketOpenMs(lastTradingDay);
                                   const endMs = marketCloseMs(lastTradingDay);

                                   console.log(` Worker ${workerIndex}: CLOSED MODE - using last trading day ${lastTradingDay}`);
                                   console.log(`   - Start: ${new Date(startMs).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} PST`);
                                   console.log(`   - End:   ${new Date(endMs).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} PST`);
                                   return {
                                          startTime: startMs * 1000000,
                                          endTime: endMs * 1000000,
                                          isLive: false,
                                          date: lastTradingDay,
                                   };
                            }
                     } catch (error) {
                            console.error(` Worker ${workerIndex}: Error calculating time range:`, error);
                            throw error;
                     }
              }

              // Process each ticker in the batch
              async function processBatch() {
                     let totalTradesStreamed = 0; // Track count instead of accumulating trades

                     // If dateRange was provided from API, use it directly instead of recalculating
                     const timeRange = dateRange ?
                            {
                                   startTime: dateRange.startTimestamp * 1000000, // Convert milliseconds to nanoseconds
                                   endTime: dateRange.endTimestamp * 1000000, // Convert milliseconds to nanoseconds
                                   isLive: dateRange.isLive,
                                   date: dateRange.currentDate
                            } :
                            getSmartTimeRange();

                     console.log(` Worker ${workerIndex}: Using ${dateRange ? 'API-provided' : 'calculated'} date range: ${timeRange.date}`);

                     console.log(` Worker ${workerIndex}: ${timeRange.isLive ? 'LIVE' : 'HISTORICAL'} scan for ${timeRange.date}`);
                     console.log(`   - Start: ${new Date(timeRange.startTime / 1000000).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} PST`);
                     console.log(`   - End: ${new Date(timeRange.endTime / 1000000).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} PST`);

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

                                   // ===============================
                                   // STEP 1 ΓÇö GET PRICE
                                   // ===============================
                                   let spotPrice = 0;

                                   // ===============================
                                   // STEP 2 ΓÇö GET OPTION CONTRACTS
                                   // ===============================
                                   let contractsResponse;

                                   if (ticker === 'VIX') {
                                          // VIX: Use snapshot API (limited contracts, get price from snapshot)
                                          const snapshotUrl = `https://api.polygon.io/v3/snapshot/options/I:VIX?limit=250&apikey=${apiKey}`;
                                          contractsResponse = await makePolygonRequest(snapshotUrl);

                                          // Get price from snapshot's underlying_asset
                                          if (contractsResponse.results?.[0]?.underlying_asset?.value) {
                                                 spotPrice = contractsResponse.results[0].underlying_asset.value;
                                                 console.log(` Worker ${workerIndex}: ${ticker} price $${spotPrice} (from snapshot)`);
                                          }

                                          // Normalize snapshot structure
                                          if (contractsResponse.results) {
                                                 contractsResponse.results = contractsResponse.results.map(r => ({
                                                        strike_price: r.details?.strike_price,
                                                        contract_type: r.details?.contract_type,
                                                        ticker: r.details?.ticker,
                                                        expiration_date: r.details?.expiration_date
                                                 }));
                                          }
                                   } else if (ticker === 'SPX') {
                                          // SPX: Get price from snapshot, then use reference API with strike filtering
                                          const snapshotUrl = `https://api.polygon.io/v3/snapshot/options/I:SPX?limit=1&apikey=${apiKey}`;
                                          const priceSnapshot = await makePolygonRequest(snapshotUrl);

                                          if (priceSnapshot.results?.[0]?.underlying_asset?.value) {
                                                 spotPrice = priceSnapshot.results[0].underlying_asset.value;
                                                 console.log(` Worker ${workerIndex}: ${ticker} price $${spotPrice} (from snapshot)`);
                                          }

                                          // Calculate strike range: ATM to 1% OTM only
                                          const callStrikeMin = Math.floor(spotPrice); // ATM
                                          const callStrikeMax = Math.ceil(spotPrice * 1.01);  // 1% OTM
                                          const putStrikeMin = Math.floor(spotPrice * 0.99);  // 1% OTM
                                          const putStrikeMax = Math.ceil(spotPrice);   // ATM

                                          console.log(` Worker ${workerIndex}: SPX strike range - Calls: $${callStrikeMin}-$${callStrikeMax}, Puts: $${putStrikeMin}-$${putStrikeMax}`);

                                          // Get ODTE + next day only
                                          const today = new Date().toISOString().split('T')[0];
                                          const tomorrow = new Date();
                                          tomorrow.setDate(tomorrow.getDate() + 1);
                                          const maxExpiry = tomorrow.toISOString().split('T')[0];

                                          // Use reference API with proper filtering (ODTE + next day only)
                                          const contractsUrl = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&expiration_date.gte=${today}&expiration_date.lte=${maxExpiry}&strike_price.gte=${putStrikeMin}&strike_price.lte=${callStrikeMax}&limit=1000&apikey=${apiKey}`;
                                          contractsResponse = await makePolygonRequest(contractsUrl);
                                   } else {
                                          // Regular stocks: Get price first, then contracts
                                          try {
                                                 const currentPriceUrl = `https://api.polygon.io/v2/last/trade/${ticker}?apikey=${apiKey}`;
                                                 let priceResponse = await makePolygonRequest(currentPriceUrl);

                                                 if (priceResponse.results?.p || priceResponse.results?.P) {
                                                        spotPrice = priceResponse.results.p || priceResponse.results.P;
                                                        console.log(` Worker ${workerIndex}: ${ticker} LIVE price $${spotPrice} (real-time)`);
                                                 } else {
                                                        // Fallback to previous close if real-time unavailable
                                                        const prevPriceUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apikey=${apiKey}`;
                                                        priceResponse = await makePolygonRequest(prevPriceUrl);
                                                        spotPrice = priceResponse.results?.[0]?.c || 0;
                                                        console.log(` Worker ${workerIndex}: ${ticker} previous close $${spotPrice}`);
                                                 }
                                          } catch (e) {
                                                 console.error(` Worker ${workerIndex}: Failed to get ${ticker} price:`, e.message);
                                                 spotPrice = 0;
                                          }

                                          const today = new Date().toISOString().split('T')[0];
                                          const contractsUrl = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&expiration_date.gte=${today}&limit=1000&apikey=${apiKey}`;
                                          contractsResponse = await makePolygonRequest(contractsUrl);
                                   }

                                   // Skip ticker if we couldn't get a valid price
                                   if (!spotPrice || spotPrice <= 0) {
                                          console.warn(` Worker ${workerIndex}: Skipping ${ticker} - no valid price data`);
                                          continue;
                                   }

                                   if (!contractsResponse.results || contractsResponse.results.length === 0) {
                                          console.warn(` Worker ${workerIndex}: No contracts found for ${ticker}`);
                                          continue;
                                   }

                                   // ===============================
                                   // PRE-FETCH HISTORICAL PRICE DATA ONCE
                                   // ===============================
                                   // Do this BEFORE processing any contracts to avoid race conditions
                                   // Skip for indices only (SPX/VIX don't need minute-level precision)
                                   const SKIP_HISTORICAL = ['SPX', 'VIX'];

                                   if (!SKIP_HISTORICAL.includes(ticker)) {
                                          try {
                                                 const dateStr = timeRange.date;
                                                 const cacheKey = `${ticker}-${dateStr}`;

                                                 // Only fetch if not already cached
                                                 if (!priceCache.has(cacheKey)) {
                                                        console.log(` Worker ${workerIndex}: Pre-fetching historical minute data for ${ticker}...`);
                                                        const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/minute/${dateStr}/${dateStr}?adjusted=true&sort=asc&apikey=${apiKey}`;
                                                        const response = await makePolygonRequest(url);

                                                        if (response.results && response.results.length > 0) {
                                                               priceCache.set(cacheKey, response.results);
                                                               console.log(` Worker ${workerIndex}: [OK] Cached ${response.results.length} minute bars for ${ticker}`);
                                                        } else {
                                                               console.log(` Worker ${workerIndex}: No historical data for ${ticker}, will use current price`);
                                                        }
                                                 } else {
                                                        console.log(` Worker ${workerIndex}: ${ticker} historical data already cached`);
                                                 }
                                          } catch (error) {
                                                 console.log(` Worker ${workerIndex}: Could not pre-fetch ${ticker} data, will use current price:`, error.message);
                                          }
                                   } else {
                                          console.log(` Worker ${workerIndex}: Skipping historical data for ${ticker} (using current price)`);
                                   }

                                   if (contractsResponse.results && contractsResponse.results.length > 0) {
                                          // ===============================
                                          // STEP 3 ΓÇö FILTER CONTRACTS
                                          // ===============================
                                          const validContracts = contractsResponse.results.filter(contract => {
                                                 const strike = contract.strike_price;
                                                 const contractType = contract.contract_type?.toLowerCase();

                                                 if (!strike || !contractType || spotPrice <= 0) return false;

                                                 const pctFromMoney = (strike - spotPrice) / spotPrice;

                                                 // SPX already filtered by API, just validate range
                                                 if (ticker === 'SPX') {
                                                        if (contractType === 'call') {
                                                               return pctFromMoney >= 0 && pctFromMoney <= 0.01;
                                                        } else if (contractType === 'put') {
                                                               return pctFromMoney <= 0 && pctFromMoney >= -0.01;
                                                        }
                                                 } else {
                                                        // VIX and regular stocks: 5% ITM + all OTM
                                                        if (contractType === 'call') {
                                                               return pctFromMoney >= -0.05;
                                                        } else if (contractType === 'put') {
                                                               return pctFromMoney <= 0.05;
                                                        }
                                                 }

                                                 return false;
                                          });

                                          const filterDesc = ticker === 'SPX'
                                                 ? 'ATM to 1% OTM (ODTE + next day only)'
                                                 : '5% ITM + all OTM';
                                          console.log(` Worker ${workerIndex}: ${ticker} @ $${spotPrice} - ${contractsResponse.results.length} ΓåÆ ${validContracts.length} contracts after ${filterDesc} filter`);

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

                                                 // ===============================
                                                 // STEP 4 ΓÇö FETCH TRADES FOR EACH CONTRACT
                                                 // ===============================
                                                 const batchPromises = contractBatch.map(async (contract) => {
                                                        try {
                                                               const tradesUrl =
                                                                      `https://api.polygon.io/v3/trades/${contract.ticker}` +
                                                                      `?timestamp.gte=${timeRange.startTime}` +
                                                                      `&timestamp.lte=${timeRange.endTime}` +
                                                                      `&order=desc` +
                                                                      `&limit=50000&apikey=${apiKey}`;

                                                               const tradesResponse = await makePolygonRequest(tradesUrl);

                                                               if (tradesResponse.results && tradesResponse.results.length > 0) {
                                                                      return {
                                                                             contract,
                                                                             trades: tradesResponse.results,
                                                                             snapshot: null
                                                                      };
                                                               }

                                                               return null;
                                                        } catch (error) {
                                                               return null;
                                                        }
                                                 });

                                                 // Wait for entire batch to complete
                                                 console.log(` Worker ${workerIndex}: [WAIT] Waiting for ${contractBatch.length} contract API calls to complete...`);
                                                 const batchResults = await Promise.all(batchPromises);

                                                 // Add small delay between batches to prevent socket overload
                                                 if (batchIndex < contractBatches.length - 1) {
                                                        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
                                                 }

                                                 // Process all trade results from this batch
                                                 for (let resultIdx = 0; resultIdx < batchResults.length; resultIdx++) {
                                                        const result = batchResults[resultIdx];
                                                        if (result && result.trades) {
                                                               const { contract, trades: contractTrades } = result;
                                                               console.log(` Worker ${workerIndex}: ${ticker} contract ${contract.ticker} found ${contractTrades.length} trades`);

                                                               // Process trades in sequential batches of 200 to avoid OOM
                                                               // Never accumulate all trades in memory - send each batch immediately and discard
                                                               const tradeBatchSize = 200;
                                                               let contractTradesStreamed = 0;
                                                               for (let i = 0; i < contractTrades.length; i += tradeBatchSize) {
                                                                      const tradeBatch = contractTrades.slice(i, i + tradeBatchSize);
                                                                      const processedBatch = await Promise.all(tradeBatch.map(async (trade) => {
                                                                             try {
                                                                                    const tradePrice = trade.price || 0;
                                                                                    const tradeSize = trade.size || 1;
                                                                                    const totalPremium = tradePrice * tradeSize * 100; // Price per contract x contracts x 100 shares per contract
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
                                                                                                  } else {
                                                                                                         // If it's clearly a past date, use next year
                                                                                                         expiryDate = expiryDate.replace('2024', (currentYear + 1).toString());
                                                                                                  }
                                                                                           }
                                                                                    }

                                                                                    // Get ACTUAL trade timestamp (sip_timestamp is most accurate)
                                                                                    const actualTradeTimestamp = trade.sip_timestamp || trade.participant_timestamp || trade.timestamp;
                                                                                    const tradeDate = actualTradeTimestamp ? new Date(actualTradeTimestamp / 1000000) : new Date();

                                                                                    // Get HISTORICAL spot price at the EXACT time of the trade (cached for performance)
                                                                                    const tradeTimeSpotPrice = await getHistoricalSpotPrice(ticker, actualTradeTimestamp, spotPrice);

                                                                                    // Skip trades with no valid spot price - don't show fake data
                                                                                    if (!tradeTimeSpotPrice || tradeTimeSpotPrice <= 0) {
                                                                                           return null;
                                                                                    }

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

                                                                                    // BUILD TRADE OBJECT - Vol/OI and fill_style enriched on main thread
                                                                                    const tradeObj = {
                                                                                           underlying_ticker: ticker,
                                                                                           ticker: contract.ticker,
                                                                                           option_ticker: contract.ticker,
                                                                                           trade_size: tradeSize,
                                                                                           premium_per_contract: totalPremium / (tradeSize * 100),
                                                                                           total_premium: totalPremium,
                                                                                           trade_type: undefined, // Will be classified later based on exchange distribution
                                                                                           trade_timestamp: tradeDate, // ACTUAL trade time, not current time
                                                                                           timestamp: tradeDate.toISOString(),
                                                                                           sip_timestamp: actualTradeTimestamp, // Include original nanosecond timestamp
                                                                                           strike: strikePrice,
                                                                                           expiry: expiryDate,
                                                                                           type: contractType || 'call',
                                                                                           spot_price: tradeTimeSpotPrice, // ONLY use real historical price
                                                                                           exchange: trade.exchange,
                                                                                           exchange_name: getExchangeName(trade.exchange) || 'Unknown',
                                                                                           moneyness: moneyness,
                                                                                           days_to_expiry: daysToExpiry,
                                                                                           worker: workerIndex,
                                                                                           conditions: trade.conditions || []
                                                                                    };

                                                                                    return tradeObj;
                                                                             } catch (error) {
                                                                                    console.error(` Worker ${workerIndex}: Trade processing error:`, error);
                                                                                    return null;
                                                                             }
                                                                      }));

                                                                      // Filter nulls and immediately send this batch - do NOT accumulate
                                                                      const validBatch = processedBatch.filter(t => t !== null);
                                                                      if (validBatch.length > 0) {
                                                                             parentPort.postMessage({
                                                                                    type: 'trades_found',
                                                                                    trades: validBatch,
                                                                                    workerIndex: workerIndex,
                                                                                    ticker: ticker,
                                                                                    contract: contract.ticker,
                                                                                    success: true
                                                                             });
                                                                             contractTradesStreamed += validBatch.length;
                                                                             totalTradesStreamed += validBatch.length;
                                                                      }
                                                                      // processedBatch and validBatch go out of scope here - memory freed
                                                               }

                                                               console.log(` Worker ${workerIndex}: [OK] ${contract.ticker} streamed ${contractTradesStreamed} trades`);
                                                        }
                                                 }
                                          }
                                   }
                            } catch (error) {
                                   console.error(` Worker ${workerIndex}: Error with ${ticker}:`, error.message);
                            }
                     }

                     console.log(` Worker ${workerIndex}: [DONE] Completed batch - streamed ${totalTradesStreamed} total trades`);

                     // Send completion message (trades already streamed incrementally)
                     try {
                            parentPort.postMessage({
                                   success: true,
                                   type: 'worker_complete',
                                   workerIndex: workerIndex,
                                   processedTickers: batch.length,
                                   totalTradesStreamed: totalTradesStreamed
                            });
                     } catch (sendError) {
                            console.error(` Worker ${workerIndex}: [ERROR] Error sending results:`, sendError.message);
                            console.error(` Worker ${workerIndex}: Stack trace:`, sendError.stack);
                            parentPort.postMessage({
                                   success: false,
                                   error: `Failed to send results: ${sendError.message}`,
                                   workerIndex: workerIndex
                            });
                     }
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
