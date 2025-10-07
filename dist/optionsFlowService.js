import { TOP_1000_SYMBOLS } from './Top1000Symbols';
// Market hours utility functions
export function isMarketOpen() {
    const now = new Date();
    const eastern = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const hour = eastern.getHours();
    const minute = eastern.getMinutes();
    const day = eastern.getDay(); // 0 = Sunday, 6 = Saturday
    // Check if it's a weekday (Monday = 1, Friday = 5)
    if (day < 1 || day > 5) {
        return false;
    }
    // Market hours: 9:30 AM - 4:00 PM ET
    const marketOpen = 9.5; // 9:30 AM
    const marketClose = 16; // 4:00 PM
    const currentTime = hour + (minute / 60);
    return currentTime >= marketOpen && currentTime < marketClose;
}
export function getLastTradingDay() {
    const today = new Date();
    let tradingDay = new Date(today);
    // If today is a weekday and market is closed, use today's date
    // If today is weekend, go back to Friday
    if (tradingDay.getDay() === 0) { // Sunday
        tradingDay.setDate(tradingDay.getDate() - 2); // Friday
    }
    else if (tradingDay.getDay() === 6) { // Saturday
        tradingDay.setDate(tradingDay.getDate() - 1); // Friday
    }
    // For weekdays, use the current day (even if market is closed)
    return tradingDay.toISOString().split('T')[0];
}
export function getTodaysMarketOpenTimestamp() {
    // Get current date in Eastern Time
    const now = new Date();
    const eastern = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    // Create market open time (9:30 AM ET) for today
    const marketOpen = new Date(eastern);
    marketOpen.setHours(9, 30, 0, 0); // 9:30 AM ET
    // If it's weekend, get last Friday's market open
    const day = marketOpen.getDay();
    if (day === 0) { // Sunday
        marketOpen.setDate(marketOpen.getDate() - 2); // Friday
    }
    else if (day === 6) { // Saturday
        marketOpen.setDate(marketOpen.getDate() - 1); // Friday
    }
    return marketOpen.getTime();
}
export function getSmartDateRange() {
    const marketOpen = isMarketOpen();
    if (marketOpen) {
        // Use current date for live data
        const today = new Date();
        return {
            currentDate: today.toISOString().split('T')[0],
            isLive: true
        };
    }
    else {
        // Use last trading day for historical data
        return {
            currentDate: getLastTradingDay(),
            isLive: false
        };
    }
}
export class OptionsFlowService {
    constructor(apiKey) {
        this.historicalPriceCache = new Map();
        this.exchangeNames = {
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
        this.premiumTiers = [
            { name: 'Tier 1: Premium institutional', minPrice: 8.00, minSize: 80 },
            { name: 'Tier 2: High-value large volume', minPrice: 7.00, minSize: 100 },
            { name: 'Tier 3: Mid-premium bulk', minPrice: 5.00, minSize: 150 },
            { name: 'Tier 4: Moderate premium large', minPrice: 3.50, minSize: 200 },
            { name: 'Tier 5: Lower premium large', minPrice: 2.50, minSize: 200 },
            { name: 'Tier 6: Small premium massive', minPrice: 1.00, minSize: 800 },
            { name: 'Tier 7: Penny options massive', minPrice: 0.50, minSize: 2000 },
            { name: 'Tier 8: Premium bypass', minPrice: 0.01, minSize: 20, minTotal: 50000 }
        ];
        this.polygonApiKey = apiKey;
    }
    // Streaming version for progressive loading
    async fetchLiveOptionsFlowStreaming(ticker, onProgress) {
        console.log(`🌊 STREAMING: Starting live options flow${ticker ? ` for ${ticker}` : ' market-wide scan'}`);
        const allTrades = [];
        const tickersToScan = ticker && ticker.toLowerCase() !== 'all' ? [ticker.toUpperCase()] : this.getTop1000Symbols();
        onProgress?.([], `Starting scan of ${tickersToScan.length} tickers...`);
        // Process in smaller batches for streaming
        const batchSize = 5; // Smaller batches for more frequent updates
        const tickerBatches = [];
        for (let i = 0; i < tickersToScan.length; i += batchSize) {
            tickerBatches.push(tickersToScan.slice(i, i + batchSize));
        }
        // Process each batch and stream results
        for (let batchIndex = 0; batchIndex < tickerBatches.length; batchIndex++) {
            const batch = tickerBatches[batchIndex];
            onProgress?.(allTrades, `Processing batch ${batchIndex + 1}/${tickerBatches.length}: ${batch.join(', ')}`, {
                current: batchIndex + 1,
                total: tickerBatches.length,
                currentBatch: batch
            });
            // Process current batch with robust connection handling
            const batchPromises = batch.map(async (currentTicker) => {
                try {
                    return await this.fetchLiveStreamingTradesRobust(currentTicker);
                }
                catch (error) {
                    console.error(`Error fetching ${currentTicker}:`, error);
                    return [];
                }
            });
            const batchResults = await Promise.allSettled(batchPromises);
            // Collect and stream results from this batch
            let batchTrades = [];
            batchResults.forEach((result) => {
                if (result.status === 'fulfilled') {
                    batchTrades.push(...result.value);
                }
            });
            // Apply filtering and classification to new batch
            if (batchTrades.length > 0) {
                const filteredBatch = this.filterAndClassifyTrades(batchTrades, ticker);
                allTrades.push(...filteredBatch);
                // Stream the updated results
                onProgress?.(allTrades.sort((a, b) => b.total_premium - a.total_premium), `Batch ${batchIndex + 1} complete: ${allTrades.length} trades found`, {
                    current: batchIndex + 1,
                    total: tickerBatches.length,
                    tradesFound: allTrades.length,
                    batchTradesFound: filteredBatch.length
                });
            }
            // Small delay between batches
            if (batchIndex < tickerBatches.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
        onProgress?.(allTrades, `Scan complete: ${allTrades.length} total trades found`);
        return allTrades.sort((a, b) => b.total_premium - a.total_premium);
    }
    async fetchLiveOptionsFlow(ticker) {
        // Smart market hours detection
        const { currentDate, isLive } = getSmartDateRange();
        const marketStatus = isLive ? 'LIVE' : 'LAST TRADING DAY';
        const marketOpenTimestamp = getTodaysMarketOpenTimestamp();
        const marketOpenTime = new Date(marketOpenTimestamp).toLocaleString('en-US', { timeZone: 'America/New_York' });
        const currentTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
        console.log(`🎯 FETCHING ${marketStatus} OPTIONS FLOW WITH SWEEP DETECTION FOR: ${ticker || 'NO TICKER SPECIFIED'}`);
        console.log(`📅 Using date: ${currentDate} (${isLive ? 'Market Open' : 'Market Closed - Historical Data'})`);
        console.log(`⏰ Time range: ${marketOpenTime} ET → ${currentTime} ET (${isLive ? 'LIVE UPDATE' : 'HISTORICAL'})`);
        // Determine which tickers to scan
        let tickersToScan;
        if (!ticker || ticker.toLowerCase() === 'all') {
            // FULL 1000 STOCKS with smart batching as requested
            tickersToScan = this.getTop1000Symbols();
            console.log(`🚀 SCANNING ALL 1000 STOCKS: ${tickersToScan.length} symbols with smart batching`);
            console.log(`🎯 First 20 tickers: ${tickersToScan.slice(0, 20).join(', ')}...`);
            console.log(`⚡ Using parallel processing + batched API calls for efficiency`);
        }
        else if (ticker.includes(',')) {
            // Handle comma-separated tickers
            tickersToScan = ticker.split(',').map(t => t.trim().toUpperCase());
            console.log(`📋 SCANNING SPECIFIC TICKERS: ${tickersToScan.join(', ')}`);
        }
        else {
            // Single ticker
            tickersToScan = [ticker.toUpperCase()];
            console.log(`🎯 SCANNING SINGLE TICKER: ${ticker.toUpperCase()}`);
        }
        console.log(`⚡ LIVE TRADES SCANNING ${tickersToScan.length} tickers from today's market open...`);
        const allTrades = [];
        // For live data, prioritize TODAY's actual trades over snapshots
        if (isLive) {
            console.log(`🔴 LIVE MODE: Fetching today's trades from market open instead of snapshots`);
        }
        else {
            console.log(`📸 HISTORICAL MODE: Using snapshot data for last trading day`);
        }
        // RATE LIMITED BATCHING: Process smaller batches to avoid API limits
        const tickerBatchSize = 5; // Much smaller batches to avoid rate limits
        const tickerBatches = [];
        for (let i = 0; i < tickersToScan.length; i += tickerBatchSize) {
            tickerBatches.push(tickersToScan.slice(i, i + tickerBatchSize));
        }
        console.log(`📊 Processing ${tickerBatches.length} batches of ${tickerBatchSize} stocks each with rate limiting...`);
        // Process ticker batches sequentially to avoid overwhelming the API
        for (let batchIndex = 0; batchIndex < tickerBatches.length; batchIndex++) {
            const batch = tickerBatches[batchIndex];
            console.log(`⚡ Processing batch ${batchIndex + 1}/${tickerBatches.length}: ${batch.slice(0, 5).join(', ')}...`);
            // PARALLEL PROCESSING within each batch with ROBUST ERROR HANDLING
            const tradesPromises = batch.map(async (symbol) => {
                let retries = 3;
                while (retries > 0) {
                    try {
                        let trades = [];
                        if (isLive) {
                            // LIVE MODE: Force today's trades only, with robust connection handling
                            trades = await this.fetchLiveStreamingTradesRobust(symbol);
                            if (trades.length > 0) {
                                console.log(`🔴 LIVE ${symbol}: ${trades.length} streaming trades from today`);
                            }
                            else {
                                console.log(`⚠️ ${symbol}: No live trades yet today - this is normal early in trading`);
                            }
                        }
                        else {
                            // HISTORICAL MODE: Use snapshot data with robust connection
                            trades = await this.fetchOptionsSnapshotRobust(symbol);
                            if (trades.length > 0) {
                                console.log(`⚡ ${symbol}: ${trades.length} historical snapshot trades`);
                            }
                        }
                        return trades; // Success - exit retry loop
                    }
                    catch (error) {
                        retries--;
                        if (error instanceof Error && (error.message.includes('Failed to fetch') || error.message.includes('CONNECTION_RESET'))) {
                            console.warn(`🔄 ${symbol}: Connection reset, retrying... (${retries} attempts left)`);
                            if (retries > 0) {
                                // Wait before retry with exponential backoff
                                await new Promise(resolve => setTimeout(resolve, (4 - retries) * 1000));
                                continue;
                            }
                        }
                        console.error(`❌ Final error for ${symbol} after retries:`, error);
                        return [];
                    }
                }
                return [];
            });
            // Wait for current batch to complete
            const batchResults = await Promise.allSettled(tradesPromises);
            // Collect results from this batch
            batchResults.forEach((result) => {
                if (result.status === 'fulfilled') {
                    allTrades.push(...result.value);
                }
            });
            console.log(`✅ Batch ${batchIndex + 1} complete: ${allTrades.length} total trades found so far`);
            // Small delay between batches to be API-friendly
            if (batchIndex < tickerBatches.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        // Legacy code for comparison - this is now replaced by batched processing above
        const snapshotPromises = [];
        // Results already collected in batched processing above
        console.log(`⚡ INDIVIDUAL TRADES COMPLETE: ${allTrades.length} total individual trades collected`);
        if (allTrades.length > 0) {
            // Apply your criteria filtering and classification
            const filtered = this.filterAndClassifyTrades(allTrades, ticker);
            return filtered.sort((a, b) => b.total_premium - a.total_premium);
        }
        return [];
    }
    async fetchOptionsSnapshot(ticker) {
        const url = `https://api.polygon.io/v3/snapshot/options/${ticker}?apikey=${this.polygonApiKey}`;
        console.log(`📸 SNAPSHOT REQUEST for ${ticker}: ${url.replace(this.polygonApiKey, 'API_KEY_HIDDEN')}`);
        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.warn(`⚠️ Failed to fetch ${ticker} snapshot: ${response.status}`);
                return [];
            }
            const data = await response.json();
            console.log(`📊 ${ticker} snapshot: ${data.results?.length || 0} contracts`);
            if (!data.results || data.results.length === 0) {
                return [];
            }
            // Transform snapshot data to ProcessedTrade
            const trades = [];
            for (const contract of data.results) {
                // Only include contracts that have recent trade data
                if (!contract.last_trade || !contract.last_trade.price) {
                    continue;
                }
                // Get historical spot price at the exact time of the trade
                const tradeTimestamp = contract.last_trade.sip_timestamp / 1000000; // Convert to milliseconds
                const spotPrice = await this.getHistoricalSpotPrice(ticker, tradeTimestamp);
                const strikePrice = contract.details.strike_price;
                const expiryDate = new Date(contract.details.expiration_date);
                const today = new Date();
                const daysToExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                // Calculate moneyness
                let moneyness = 'OTM';
                if (spotPrice > 0) {
                    const percentDiff = Math.abs(spotPrice - strikePrice) / spotPrice;
                    if (percentDiff < 0.01) { // Within 1%
                        moneyness = 'ATM';
                    }
                    else if (contract.details.contract_type === 'call') {
                        moneyness = spotPrice > strikePrice ? 'ITM' : 'OTM';
                    }
                    else {
                        moneyness = spotPrice < strikePrice ? 'ITM' : 'OTM';
                    }
                }
                const trade = {
                    ticker: contract.details.ticker,
                    underlying_ticker: ticker,
                    strike: strikePrice,
                    expiry: contract.details.expiration_date,
                    type: contract.details.contract_type,
                    trade_size: contract.last_trade.size || 1,
                    premium_per_contract: contract.last_trade.price,
                    total_premium: (contract.last_trade.price * (contract.last_trade.size || 1) * 100),
                    spot_price: spotPrice,
                    exchange: contract.last_trade.exchange,
                    exchange_name: this.exchangeNames[contract.last_trade.exchange] || 'UNKNOWN',
                    sip_timestamp: contract.last_trade.sip_timestamp,
                    conditions: contract.last_trade.conditions || [],
                    trade_timestamp: new Date(contract.last_trade.sip_timestamp / 1000000), // Convert nanoseconds to milliseconds
                    trade_type: undefined, // Will be classified later
                    window_group: undefined,
                    related_trades: [],
                    moneyness: moneyness,
                    days_to_expiry: daysToExpiry
                };
                trades.push(trade);
            }
            console.log(`✅ Extracted ${trades.length} trades from ${ticker} snapshot`);
            return trades;
        }
        catch (error) {
            console.error(`❌ Error fetching ${ticker} snapshot:`, error);
            return [];
        }
    }
    // Helper method to fetch trades for a single contract
    async fetchContractTrades(optionTicker, strike, expiration, type, symbol, spotPrice) {
        // Get timestamp from today's market open (9:30 AM ET) instead of 24 hours ago
        const marketOpenTimestamp = getTodaysMarketOpenTimestamp();
        const marketOpenDate = new Date(marketOpenTimestamp);
        const url = `https://api.polygon.io/v3/trades/${optionTicker}?timestamp.gte=${marketOpenTimestamp}000000&apikey=${this.polygonApiKey}`;
        console.log(`📈 Fetching ${optionTicker} trades from market open: ${marketOpenDate.toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);
        try {
            const response = await fetch(url);
            const data = await response.json();
            if (data.results && data.results.length > 0) {
                // Get historical spot price for each trade at its exact timestamp
                const tradesWithHistoricalSpot = await Promise.all(data.results.map(async (trade) => {
                    const tradeTimestamp = trade.sip_timestamp / 1000000; // Convert to milliseconds
                    const historicalSpotPrice = await this.getHistoricalSpotPrice(symbol, tradeTimestamp);
                    return {
                        ...trade,
                        ticker: optionTicker,
                        strike: strike,
                        expiration: expiration,
                        type: type,
                        symbol: symbol,
                        spot_price: historicalSpotPrice
                    };
                }));
                return tradesWithHistoricalSpot;
            }
            return [];
        }
        catch (error) {
            // Skip individual contract errors
            return [];
        }
    }
    filterAndClassifyTrades(trades, targetTicker) {
        console.log(`🔍 Filtering ${trades.length} individual trades${targetTicker ? ` for ${targetTicker}` : ''}`);
        let filtered = trades;
        // Filter by ticker if specified (but not for 'ALL' requests)
        if (targetTicker && targetTicker.toLowerCase() !== 'all') {
            filtered = filtered.filter(trade => trade.underlying_ticker === targetTicker);
            console.log(`📊 After ticker filter: ${filtered.length} trades`);
        }
        else if (targetTicker && targetTicker.toLowerCase() === 'all') {
            console.log(`📊 ALL ticker request - no ticker filtering applied`);
        }
        // SWEEP DETECTION: Detect trades across multiple exchanges within time windows
        console.log(`🔍 SWEEP DETECTION: Analyzing ${filtered.length} trades for sweep patterns...`);
        filtered = this.detectSweeps(filtered);
        console.log(`🧹 After sweep detection: ${filtered.length} trades with sweep classification`);
        // MULTI-LEG DETECTION: Detect complex options strategies
        console.log(`🔍 MULTI-LEG DETECTION: Analyzing ${filtered.length} trades for multi-leg patterns...`);
        filtered = this.detectMultiLegTrades(filtered);
        console.log(`🦵 After multi-leg detection: ${filtered.length} trades with multi-leg classification`);
        // YOUR ACTUAL CRITERIA - Use existing institutional tiers system
        filtered = filtered.filter(trade => this.passesInstitutionalCriteria(trade));
        console.log(`🎯 After YOUR tier criteria filter: ${filtered.length} trades`);
        // Classify trade types (BLOCK, SWEEP, MULTI-LEG, SPLIT)
        filtered = filtered.map(trade => this.classifyTradeType(trade));
        console.log(`🏷️ After trade type classification: ${filtered.length} trades`);
        // Filter out after-hours trades (market hours: 9:30 AM - 4:00 PM ET)
        filtered = filtered.filter(trade => this.isWithinMarketHours(trade.trade_timestamp));
        console.log(`🕘 After market hours filter: ${filtered.length} trades`);
        // YOUR ITM FILTER: Only 5% ITM max + all OTM contracts
        filtered = filtered.filter(trade => this.isWithinTradeableRange(trade));
        console.log(`💰 After 5% ITM max filter: ${filtered.length} trades`);
        // Sort by timestamp (newest first) and total premium (largest first)
        filtered.sort((a, b) => {
            // First by total premium (largest first)
            const premiumDiff = b.total_premium - a.total_premium;
            if (Math.abs(premiumDiff) > 1000)
                return premiumDiff;
            // Then by timestamp (newest first)
            return b.trade_timestamp.getTime() - a.trade_timestamp.getTime();
        });
        return filtered;
    }
    // Market hours validation - Only show trades during 9:30 AM - 4:00 PM ET
    isWithinMarketHours(tradeTimestamp) {
        // Convert to ET timezone
        const etTime = new Date(tradeTimestamp.toLocaleString("en-US", { timeZone: "America/New_York" }));
        const hours = etTime.getHours();
        const minutes = etTime.getMinutes();
        const timeInMinutes = hours * 60 + minutes;
        // Market hours: 9:30 AM (570 minutes) to 4:00 PM (960 minutes) ET
        const marketOpen = 9 * 60 + 30; // 9:30 AM = 570 minutes
        const marketClose = 16 * 60; // 4:00 PM = 960 minutes
        const isWithinHours = timeInMinutes >= marketOpen && timeInMinutes <= marketClose;
        if (!isWithinHours) {
            console.log(`🚫 After-hours trade filtered: ${etTime.toLocaleTimeString()} ET`);
        }
        return isWithinHours;
    }
    // SWEEP DETECTION: Identify trades across multiple exchanges within time windows
    detectSweeps(trades) {
        console.log(`🔍 SWEEP DETECTION: Processing ${trades.length} trades...`);
        // Group trades by contract ticker and time windows (5-second windows)
        const contractGroups = new Map();
        for (const trade of trades) {
            // Create 5-second time window key
            const timeWindow = Math.floor(trade.trade_timestamp.getTime() / (5 * 1000)) * (5 * 1000);
            const groupKey = `${trade.ticker}_${timeWindow}`;
            if (!contractGroups.has(groupKey)) {
                contractGroups.set(groupKey, []);
            }
            contractGroups.get(groupKey).push(trade);
        }
        let sweepCount = 0;
        const processedTrades = [];
        // Analyze each group for sweep patterns
        for (const [groupKey, groupTrades] of contractGroups) {
            if (groupTrades.length === 1) {
                // Single trade - no sweep
                processedTrades.push(groupTrades[0]);
                continue;
            }
            // Check for sweep criteria:
            // 1. Same contract, multiple exchanges/times within 5-second window
            // 2. Combined volume ≥ 100 contracts
            // 3. Combined premium ≥ $50,000
            const totalVolume = groupTrades.reduce((sum, t) => sum + t.trade_size, 0);
            const totalPremium = groupTrades.reduce((sum, t) => sum + t.total_premium, 0);
            const avgPrice = totalPremium / (totalVolume * 100);
            if (totalVolume >= 100 && totalPremium >= 50000) {
                // This is a SWEEP - combine into single sweep trade
                sweepCount++;
                const sweepTrade = {
                    ...groupTrades[0], // Use first trade as base
                    trade_size: totalVolume,
                    total_premium: totalPremium,
                    premium_per_contract: avgPrice,
                    trade_type: 'SWEEP',
                    window_group: `sweep_${groupKey}`,
                    related_trades: groupTrades.map(t => t.ticker),
                    exchange_name: `MULTI-EXCHANGE (${groupTrades.length} fills)`
                };
                console.log(`🧹 SWEEP DETECTED: ${sweepTrade.ticker} - ${totalVolume} contracts, $${totalPremium.toFixed(0)} premium across ${groupTrades.length} fills`);
                processedTrades.push(sweepTrade);
            }
            else {
                // Not a sweep - add individual trades
                processedTrades.push(...groupTrades);
            }
        }
        console.log(`✅ SWEEP DETECTION COMPLETE: Found ${sweepCount} sweeps from ${trades.length} individual trades`);
        return processedTrades;
    }
    // MULTI-LEG DETECTION: Identify complex options strategies (spreads, straddles, etc.)
    detectMultiLegTrades(trades) {
        console.log(`🔍 MULTI-LEG DETECTION: Processing ${trades.length} trades...`);
        // Group trades by underlying ticker and EXACT timestamp (multi-leg trades execute simultaneously)
        const exactTimeGroups = new Map();
        for (const trade of trades) {
            // Use exact timestamp - multi-leg fills happen at identical time
            const exactTimestamp = trade.trade_timestamp.getTime();
            const groupKey = `${trade.underlying_ticker}_${exactTimestamp}`;
            if (!exactTimeGroups.has(groupKey)) {
                exactTimeGroups.set(groupKey, []);
            }
            exactTimeGroups.get(groupKey).push(trade);
        }
        let multiLegCount = 0;
        const processedTrades = [];
        // Analyze each exact timestamp group for multi-leg patterns
        for (const [groupKey, groupTrades] of exactTimeGroups) {
            if (groupTrades.length < 2) {
                // Single trade - not multi-leg
                processedTrades.push(...groupTrades);
                continue;
            }
            // All trades have same timestamp, no need to sort
            // Check for multi-leg patterns
            const isMultiLeg = this.analyzeMultiLegPattern(groupTrades);
            if (isMultiLeg) {
                console.log(`🦵 MULTI-LEG FOUND: ${groupTrades.length} legs for ${groupTrades[0].underlying_ticker}`);
                multiLegCount++;
                // Mark all trades in this group as multi-leg
                const multiLegTrades = groupTrades.map((trade) => ({
                    ...trade,
                    trade_type: 'MULTI-LEG',
                    window_group: `multileg_${groupKey}`,
                    related_trades: groupTrades.map((t) => t.ticker)
                }));
                processedTrades.push(...multiLegTrades);
            }
            else {
                // Not multi-leg, add as individual trades
                processedTrades.push(...groupTrades);
            }
        }
        console.log(`✅ MULTI-LEG DETECTION COMPLETE: Found ${multiLegCount} multi-leg strategies from ${trades.length} individual trades`);
        return processedTrades;
    }
    // Analyze if a group of trades forms a multi-leg strategy
    analyzeMultiLegPattern(trades) {
        if (trades.length < 2)
            return false;
        // Since these trades have identical timestamps, they are simultaneous executions
        // Multi-leg criteria for simultaneous trades:
        const uniqueStrikes = new Set(trades.map(t => t.strike));
        const uniqueExpirations = new Set(trades.map(t => t.expiry));
        const uniqueTypes = new Set(trades.map(t => t.type));
        const totalPremium = trades.reduce((sum, t) => sum + t.total_premium, 0);
        // Multi-leg patterns (any of these indicate a multi-leg strategy):
        // 1. Different strikes (spreads)
        const hasMultipleStrikes = uniqueStrikes.size >= 2;
        // 2. Different option types (straddles, strangles, collars)
        const hasMultipleTypes = uniqueTypes.size >= 2;
        // 3. Different expirations (calendar spreads)
        const hasMultipleExpirations = uniqueExpirations.size >= 2;
        // 4. Must have substantial combined premium (institutional level)
        const substantialPremium = totalPremium >= 50000; // $50k+ combined
        const isMultiLeg = substantialPremium && (hasMultipleStrikes || hasMultipleTypes || hasMultipleExpirations);
        if (isMultiLeg) {
            console.log(`🦵 Multi-leg detected: ${trades.length} legs, ` +
                `${uniqueStrikes.size} strikes, ${uniqueTypes.size} types, ` +
                `${uniqueExpirations.size} expirations, $${totalPremium.toFixed(0)} premium`);
        }
        return isMultiLeg;
    }
    // YOUR ACTUAL INSTITUTIONAL CRITERIA - EXACTLY AS YOU SPECIFIED
    passesInstitutionalCriteria(trade) {
        const tradePrice = trade.premium_per_contract;
        const tradeSize = trade.trade_size;
        const totalPremium = trade.total_premium;
        // YOUR EXACT TIER SYSTEM
        const institutionalTiers = [
            // Tier 1: Premium institutional trades
            { name: 'Tier 1: Premium institutional', minPrice: 8.00, minSize: 80 },
            // Tier 2: High-value large volume
            { name: 'Tier 2: High-value large volume', minPrice: 7.00, minSize: 100 },
            // Tier 3: Mid-premium bulk trades
            { name: 'Tier 3: Mid-premium bulk', minPrice: 5.00, minSize: 150 },
            // Tier 4: Moderate premium large volume
            { name: 'Tier 4: Moderate premium large', minPrice: 3.50, minSize: 200 },
            // Tier 5: Lower premium large volume
            { name: 'Tier 5: Lower premium large', minPrice: 2.50, minSize: 200 },
            // Tier 6: Small premium massive volume
            { name: 'Tier 6: Small premium massive', minPrice: 1.00, minSize: 800 },
            // Tier 7: Penny options massive volume
            { name: 'Tier 7: Penny options massive', minPrice: 0.50, minSize: 2000 },
            // Tier 8: Premium bypass (any size if $50K+ total)
            { name: 'Tier 8: Premium bypass', minPrice: 0.01, minSize: 20, minTotal: 50000 }
        ];
        return institutionalTiers.some(tier => {
            const passesPrice = tradePrice >= tier.minPrice;
            const passesSize = tradeSize >= tier.minSize;
            const passesTotal = tier.minTotal ? totalPremium >= tier.minTotal : true;
            if (passesPrice && passesSize && passesTotal) {
                console.log(`✅ ${trade.ticker}: Passes ${tier.name} - $${tradePrice.toFixed(2)} × ${tradeSize} = $${totalPremium.toFixed(0)}`);
                return true;
            }
            return false;
        });
    }
    // YOUR EXACT ITM FILTER: 5% ITM MAX + ALL OTM
    isWithinTradeableRange(trade) {
        if (trade.spot_price <= 0)
            return false;
        // YOUR CRITERIA: Only 5% ITM max and all OTM contracts
        if (trade.type === 'call') {
            const percentFromATM = (trade.strike - trade.spot_price) / trade.spot_price;
            return percentFromATM >= -0.05; // Only 5% ITM max, unlimited OTM
        }
        else {
            const percentFromATM = (trade.strike - trade.spot_price) / trade.spot_price;
            return percentFromATM <= 0.05; // Only 5% ITM max, unlimited OTM
        }
    }
    classifyTradeType(trade) {
        // Correct classification:
        // BLOCK = Large trade ($25k+) filled on ONE exchange only
        // SWEEP = Trade filled across MULTIPLE exchanges simultaneously
        let tradeType;
        // SWEEP: Already classified in detectSweeps() - multiple exchanges
        if (trade.trade_type === 'SWEEP') {
            tradeType = 'SWEEP';
        }
        // BLOCK: Single exchange trade with $25k+ premium (lowered threshold)
        else if (trade.total_premium >= 25000 && !trade.window_group?.includes('exchanges')) {
            tradeType = 'BLOCK';
        }
        // BLOCK: Also classify large single trades without window group as blocks
        else if (trade.total_premium >= 25000 && !trade.window_group) {
            tradeType = 'BLOCK';
        }
        return {
            ...trade,
            trade_type: tradeType
        };
    }
    // ROBUST FETCH WITH CONNECTION HANDLING
    async robustFetch(url, maxRetries = 3) {
        let lastError = new Error('Unknown error');
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
                const response = await fetch(url, {
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'OptionsFlow/1.0',
                        'Accept': 'application/json',
                        'Connection': 'keep-alive'
                    }
                });
                clearTimeout(timeoutId);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                return response;
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error('Unknown fetch error');
                console.warn(`🔄 Fetch attempt ${attempt}/${maxRetries} failed for ${url.substring(0, 100)}...: ${lastError.message}`);
                if (attempt < maxRetries) {
                    // Exponential backoff: 1s, 2s, 4s
                    const delay = Math.pow(2, attempt - 1) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        throw lastError;
    }
    // PROPER ALL-EXPIRATION STREAMING WITH 5% ITM FILTERING
    async fetchLiveStreamingTradesRobust(ticker) {
        console.log(`🔧 STREAMING ALL EXPIRATIONS: Fetching ${ticker} with proper filtering`);
        try {
            // Get current stock price first
            const spotPrice = await this.getCurrentStockPrice(ticker);
            if (spotPrice <= 0) {
                console.log(`❌ ${ticker}: Cannot get spot price`);
                return [];
            }
            console.log(`💰 ${ticker} CURRENT PRICE: $${spotPrice}`);
            // Get ALL options contracts for this ticker (all expirations)
            const contractsUrl = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&limit=1000&apikey=${this.polygonApiKey}`;
            const contractsResponse = await this.robustFetch(contractsUrl);
            const contractsData = await contractsResponse.json();
            if (!contractsData.results || contractsData.results.length === 0) {
                console.log(`📭 ${ticker}: No options contracts found`);
                return [];
            }
            console.log(`📋 ${ticker}: Found ${contractsData.results.length} total contracts`);
            // Apply 5% ITM filtering BEFORE scanning trades
            const validContracts = contractsData.results.filter((contract) => {
                const strike = contract.strike_price;
                const contractType = contract.contract_type.toLowerCase();
                // YOUR 5% ITM RULE: Only scan contracts within 5% ITM + all OTM
                if (contractType === 'call') {
                    const percentFromATM = (strike - spotPrice) / spotPrice;
                    return percentFromATM >= -0.05; // Only 5% ITM max, unlimited OTM
                }
                else {
                    const percentFromATM = (strike - spotPrice) / spotPrice;
                    return percentFromATM <= 0.05; // Only 5% ITM max, unlimited OTM
                }
            });
            console.log(`✅ ${ticker}: ${validContracts.length} contracts pass 5% ITM filter`);
            console.log(`❌ ${ticker}: ${contractsData.results.length - validContracts.length} deep ITM contracts filtered out`);
            // Get today's market open timestamp
            const marketOpenTimestamp = getTodaysMarketOpenTimestamp();
            const allTrades = [];
            // Scan trades for all valid contracts
            let contractsWithTrades = 0;
            const maxContracts = Math.min(validContracts.length, 50); // Limit to prevent API overload
            console.log(`📊 ${ticker}: Scanning trades for ${maxContracts} contracts...`);
            for (let i = 0; i < maxContracts; i++) {
                const contract = validContracts[i];
                try {
                    const tradesUrl = `https://api.polygon.io/v3/trades/${contract.ticker}?timestamp.gte=${marketOpenTimestamp}000000&limit=1000&apikey=${this.polygonApiKey}`;
                    const tradesResponse = await this.robustFetch(tradesUrl);
                    const tradesData = await tradesResponse.json();
                    if (tradesData.results && tradesData.results.length > 0) {
                        contractsWithTrades++;
                        // Process each trade
                        tradesData.results.forEach((trade) => {
                            const tradeTime = new Date(trade.sip_timestamp / 1000000);
                            const today = new Date();
                            // Only today's trades
                            if (tradeTime.toDateString() !== today.toDateString()) {
                                return;
                            }
                            // Market hours filter
                            const eastern = new Date(tradeTime.toLocaleString("en-US", { timeZone: "America/New_York" }));
                            const hour = eastern.getHours();
                            const minute = eastern.getMinutes();
                            const timeDecimal = hour + (minute / 60);
                            if (timeDecimal < 9.5 || timeDecimal >= 16) {
                                return; // Outside market hours
                            }
                            const processedTrade = {
                                ticker: contract.ticker,
                                underlying_ticker: ticker,
                                strike: contract.strike_price,
                                expiry: contract.expiration_date,
                                type: contract.contract_type.toLowerCase(),
                                trade_size: trade.size,
                                premium_per_contract: trade.price,
                                total_premium: trade.price * trade.size * 100,
                                spot_price: spotPrice,
                                exchange: trade.exchange,
                                exchange_name: this.exchangeNames[trade.exchange] || 'UNKNOWN',
                                sip_timestamp: trade.sip_timestamp,
                                trade_timestamp: tradeTime,
                                conditions: trade.conditions || [],
                                moneyness: this.getMoneyness(contract.strike_price, spotPrice, contract.contract_type.toLowerCase()),
                                days_to_expiry: Math.ceil((new Date(contract.expiration_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                            };
                            allTrades.push(processedTrade);
                        });
                    }
                    // Rate limiting
                    if (i % 10 === 0 && i > 0) {
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                }
                catch (error) {
                    console.log(`❌ Error scanning ${contract.ticker}: ${error}`);
                }
            }
            console.log(`✅ ${ticker}: Found ${allTrades.length} trades across ${contractsWithTrades} active contracts`);
            return allTrades;
        }
        catch (error) {
            console.error(`❌ All-expiration streaming error for ${ticker}:`, error);
            return [];
        }
    }
    // SNAPSHOT WITH ALL-EXPIRATION 5% ITM FILTERING
    async fetchOptionsSnapshotRobust(ticker) {
        console.log(`🔧 ALL-EXPIRATION SNAPSHOT: Fetching ${ticker} with 5% ITM filter`);
        try {
            // Get current spot price
            const spotPrice = await this.getCurrentStockPrice(ticker);
            if (spotPrice <= 0) {
                console.log(`❌ ${ticker}: Cannot get spot price`);
                return [];
            }
            const url = `https://api.polygon.io/v3/snapshot/options/${ticker}?apikey=${this.polygonApiKey}`;
            const response = await this.robustFetch(url);
            const data = await response.json();
            if (!data.results || data.results.length === 0) {
                console.log(`📭 ${ticker}: No options contracts found`);
                return [];
            }
            console.log(`📊 ${ticker}: ${data.results.length} total contracts in snapshot`);
            const trades = [];
            let validContracts = 0;
            let filteredOut = 0;
            // Process each contract with 5% ITM filtering
            for (const contract of data.results) {
                if (!contract.last_trade || !contract.last_trade.price)
                    continue;
                const strike = contract.details.strike_price;
                const contractType = contract.details.contract_type.toLowerCase();
                // Apply 5% ITM filter
                let passesITMFilter = false;
                if (contractType === 'call') {
                    const percentFromATM = (strike - spotPrice) / spotPrice;
                    passesITMFilter = percentFromATM >= -0.05; // Only 5% ITM max, unlimited OTM
                }
                else {
                    const percentFromATM = (strike - spotPrice) / spotPrice;
                    passesITMFilter = percentFromATM <= 0.05; // Only 5% ITM max, unlimited OTM
                }
                if (!passesITMFilter) {
                    filteredOut++;
                    continue; // Skip deep ITM contracts
                }
                validContracts++;
                const tradeTimestamp = contract.last_trade.sip_timestamp / 1000000;
                const tradeDate = new Date(tradeTimestamp);
                const today = new Date();
                // FILTER: Only include trades from today (not 2024 data!)
                if (tradeDate.toDateString() !== today.toDateString()) {
                    continue; // Skip old trades
                }
                // Market hours filter
                const eastern = new Date(tradeDate.toLocaleString("en-US", { timeZone: "America/New_York" }));
                const hour = eastern.getHours();
                const minute = eastern.getMinutes();
                const timeDecimal = hour + (minute / 60);
                if (timeDecimal < 9.5 || timeDecimal >= 16) {
                    continue; // Outside market hours
                }
                const trade = {
                    ticker: contract.details.ticker,
                    underlying_ticker: ticker,
                    strike: contract.details.strike_price,
                    expiry: contract.details.expiration_date,
                    type: contractType,
                    trade_size: contract.last_trade.size,
                    premium_per_contract: contract.last_trade.price,
                    total_premium: contract.last_trade.price * contract.last_trade.size * 100,
                    spot_price: spotPrice,
                    exchange: contract.last_trade.exchange,
                    exchange_name: this.exchangeNames[contract.last_trade.exchange] || 'UNKNOWN',
                    trade_timestamp: new Date(tradeTimestamp),
                    sip_timestamp: contract.last_trade.sip_timestamp,
                    conditions: contract.last_trade.conditions || [],
                    moneyness: this.getMoneyness(contract.details.strike_price, spotPrice, contractType),
                    days_to_expiry: Math.ceil((new Date(contract.details.expiration_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                };
                trades.push(trade);
            }
            console.log(`✅ ${ticker}: ${validContracts} valid contracts, ${filteredOut} deep ITM filtered out`);
            console.log(`✅ ${ticker}: Extracted ${trades.length} today's trades`);
            return trades;
        }
        catch (error) {
            console.error(`❌ All-expiration snapshot error for ${ticker}:`, error);
            throw error;
        }
    }
    // LIVE STREAMING METHOD: Get only TODAY's real-time trades, no fallback
    async fetchLiveStreamingTrades(ticker) {
        console.log(`🔴 LIVE STREAMING: Fetching ${ticker} real-time options trades`);
        // Get today's market open timestamp
        const marketOpenTimestamp = getTodaysMarketOpenTimestamp();
        const todayStart = new Date(marketOpenTimestamp);
        const now = new Date();
        console.log(`📅 Live data range: ${todayStart.toLocaleString('en-US', { timeZone: 'America/New_York' })} ET → ${now.toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);
        try {
            // Use Polygon's aggregates endpoint for TODAY's options activity
            const todayDateStr = todayStart.toISOString().split('T')[0]; // YYYY-MM-DD format
            // Get options chains for this ticker first
            const chainUrl = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&apikey=${this.polygonApiKey}`;
            console.log(`🔗 Fetching options chain for ${ticker}...`);
            const chainResponse = await fetch(chainUrl);
            const chainData = await chainResponse.json();
            if (!chainData.results || chainData.results.length === 0) {
                console.log(`⚠️ No options contracts found for ${ticker}`);
                return [];
            }
            const liveTradesResults = [];
            // Get recent trades for top 10 most relevant contracts
            const relevantContracts = chainData.results
                .filter((contract) => {
                // Filter for contracts expiring soon (within 60 days) and close to current price
                const expiry = new Date(contract.expiration_date);
                const daysToExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                return daysToExpiry > 0 && daysToExpiry <= 60;
            })
                .slice(0, 15); // Limit to top 15 contracts to avoid API limits
            console.log(`📊 Processing ${relevantContracts.length} active contracts for ${ticker}...`);
            // Fetch trades for each contract from TODAY only
            for (const contract of relevantContracts) {
                try {
                    // Use trades endpoint with TODAY's timestamp filter
                    const tradesUrl = `https://api.polygon.io/v3/trades/${contract.ticker}?timestamp.gte=${marketOpenTimestamp}000000&apikey=${this.polygonApiKey}`;
                    const tradesResponse = await fetch(tradesUrl);
                    const tradesData = await tradesResponse.json();
                    if (tradesData.results && tradesData.results.length > 0) {
                        console.log(`✅ ${contract.ticker}: Found ${tradesData.results.length} live trades`);
                        // Process each trade from today
                        for (const trade of tradesData.results) {
                            const tradeTime = new Date(trade.sip_timestamp / 1000000); // Convert nanoseconds
                            // Double-check this trade is from today
                            if (tradeTime.getTime() >= marketOpenTimestamp) {
                                const processedTrade = {
                                    ticker: contract.ticker,
                                    underlying_ticker: ticker,
                                    strike: contract.strike_price,
                                    expiry: contract.expiration_date,
                                    type: contract.contract_type.toLowerCase(),
                                    trade_size: trade.size,
                                    premium_per_contract: trade.price,
                                    total_premium: trade.price * trade.size * 100, // Options multiplier
                                    spot_price: 0, // Will be fetched separately if needed
                                    exchange: trade.exchange || 0,
                                    exchange_name: 'POLYGON',
                                    trade_type: 'SWEEP',
                                    trade_timestamp: tradeTime,
                                    sip_timestamp: trade.sip_timestamp,
                                    conditions: trade.conditions || [],
                                    moneyness: 'OTM',
                                    days_to_expiry: Math.ceil((new Date(contract.expiration_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                                };
                                liveTradesResults.push(processedTrade);
                            }
                        }
                    }
                    // Small delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
                catch (error) {
                    console.error(`❌ Error fetching trades for contract ${contract.ticker}:`, error);
                }
            }
            // Sort by most recent first
            liveTradesResults.sort((a, b) => new Date(b.trade_timestamp).getTime() - new Date(a.trade_timestamp).getTime());
            console.log(`🔴 LIVE RESULT: Found ${liveTradesResults.length} real-time trades for ${ticker} from today`);
            return liveTradesResults;
        }
        catch (error) {
            console.error(`❌ Error in live streaming trades for ${ticker}:`, error);
            return [];
        }
    }
    // NEW METHOD: Fetch today's options trades from market open
    async fetchTodaysOptionsFlow(ticker) {
        console.log(`🔴 TODAY'S TRADES: Fetching ${ticker} options from market open`);
        try {
            // First get current options contracts via snapshot
            const snapshot = await this.fetchOptionsSnapshotFast(ticker);
            // For each contract, fetch today's actual trades (not just last trade)
            const todaysTrades = [];
            const marketOpenTimestamp = getTodaysMarketOpenTimestamp();
            // Limit to top contracts to avoid API limits
            const topContracts = snapshot.slice(0, 20); // Top 20 most active contracts
            for (const contract of topContracts) {
                try {
                    // Fetch actual trades for this contract from today's market open
                    const contractTrades = await this.fetchContractTrades(contract.ticker, contract.strike, contract.expiry, contract.type, ticker, contract.spot_price);
                    // Filter trades to only include TODAY's trades
                    const todaysContractTrades = contractTrades.filter(trade => {
                        const tradeTime = new Date(trade.trade_timestamp);
                        return tradeTime.getTime() >= marketOpenTimestamp;
                    });
                    todaysTrades.push(...todaysContractTrades.map(trade => ({
                        ...trade,
                        ticker: contract.ticker,
                        underlying_ticker: ticker,
                        strike: contract.strike,
                        expiry: contract.expiry,
                        type: contract.type,
                        spot_price: contract.spot_price,
                        trade_timestamp: trade.trade_timestamp,
                        total_premium: trade.total_premium || (trade.premium_per_contract * trade.trade_size),
                        premium_per_contract: trade.premium_per_contract,
                        trade_size: trade.trade_size,
                        exchange_name: trade.exchange_name || 'UNKNOWN',
                        trade_type: 'SWEEP',
                        moneyness: contract.moneyness || 'OTM',
                        days_to_expiry: contract.days_to_expiry || 0
                    })));
                }
                catch (error) {
                    console.error(`❌ Error fetching today's trades for ${contract.ticker}:`, error);
                }
            }
            console.log(`✅ Found ${todaysTrades.length} trades for ${ticker} from today's market open`);
            return todaysTrades;
        }
        catch (error) {
            console.error(`❌ Error fetching today's options flow for ${ticker}:`, error);
            return [];
        }
    }
    // REAL OPTIONS TRADES METHOD - FIXED TO USE CORRECT ENDPOINT
    async fetchOptionsSnapshotFast(ticker) {
        console.log(`🎯 LIVE TRADES: Fetching TODAY's live options trades for ${ticker}`);
        try {
            // Get TODAY's data - Monday October 6th, 2025
            const today = new Date();
            const todayStr = today.toISOString().split('T')[0];
            console.log(`📅 SCANNING TODAY: ${todayStr} (Live Options Trades)`);
            // Use the CORRECT endpoint - get options contracts first, then get their trades
            // Get current date and 1 year from now for expiration range
            const oneYearFromNow = new Date(today);
            oneYearFromNow.setFullYear(today.getFullYear() + 1);
            const oneYearStr = oneYearFromNow.toISOString().split('T')[0];
            const contractsUrl = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&expired=false&expiration_date.gte=${todayStr}&expiration_date.lte=${oneYearStr}&apikey=${this.polygonApiKey}`;
            console.log(`📅 Scanning contracts from ${todayStr} to ${oneYearStr}`);
            const contractsResponse = await fetch(contractsUrl);
            if (!contractsResponse.ok) {
                console.error(`❌ Contracts failed for ${ticker}: ${contractsResponse.status}`);
                return [];
            }
            const contractsData = await contractsResponse.json();
            const contracts = contractsData.results || [];
            if (contracts.length === 0) {
                console.log(`📊 No options contracts found for ${ticker}`);
                return [];
            }
            console.log(`� Found ${contracts.length} options contracts for ${ticker}`);
            const trades = [];
            const currentPrice = await this.getCurrentStockPrice(ticker);
            // DEBUG: Check expiration dates in contracts
            const expirationDates = [...new Set(contracts.map((c) => c.expiration_date))];
            console.log(`📅 Expiration dates found: ${expirationDates.join(', ')}`);
            // DEBUG: Show first few contract tickers
            console.log(`🎯 Sample contract tickers:`, contracts.slice(0, 5).map((c) => c.ticker));
            // Get ACTUAL TRADES for each contract (batch process for performance)
            const contractBatches = [];
            const batchSize = 20; // Process 20 contracts at a time
            for (let i = 0; i < contracts.length; i += batchSize) {
                contractBatches.push(contracts.slice(i, i + batchSize));
            }
            for (const batch of contractBatches.slice(0, 10)) { // Limit to first 10 batches (200 contracts) for performance
                const tradePromises = batch.map(async (contract) => {
                    try {
                        // Get ACTUAL TRADES for this specific contract - TODAY's data
                        const tradesUrl = `https://api.polygon.io/v2/aggs/ticker/${contract.ticker}/range/1/minute/${todayStr}/${todayStr}?adjusted=true&sort=desc&apikey=${this.polygonApiKey}`;
                        const tradesResponse = await fetch(tradesUrl);
                        if (!tradesResponse.ok) {
                            return [];
                        }
                        const tradesData = await tradesResponse.json();
                        if (!tradesData.results || tradesData.results.length === 0) {
                            return [];
                        }
                        // Process each minute bar as individual trades
                        const contractTrades = [];
                        for (const candle of tradesData.results) {
                            const volume = candle.v || 0;
                            if (volume < 50)
                                continue; // Only significant volume
                            const parsed = this.parseOptionsTicker(contract.ticker);
                            if (!parsed)
                                continue;
                            // DEBUG: Log parsed expiry for first few trades
                            if (contractTrades.length < 3) {
                                console.log(`🔍 Parsed ${contract.ticker} -> expiry: ${parsed.expiry}, strike: ${parsed.strike}, type: ${parsed.type}`);
                            }
                            const price = candle.c || candle.vw || 0;
                            const totalPremium = price * volume * 100;
                            // Get historical spot price at the exact time of this trade
                            const historicalSpotPrice = await this.getHistoricalSpotPrice(parsed.underlying, candle.t);
                            const trade = {
                                ticker: contract.ticker,
                                underlying_ticker: parsed.underlying,
                                strike: parsed.strike,
                                expiry: parsed.expiry,
                                type: parsed.type,
                                trade_size: volume,
                                premium_per_contract: price,
                                total_premium: totalPremium,
                                spot_price: historicalSpotPrice,
                                exchange: 0,
                                exchange_name: 'COMPOSITE',
                                sip_timestamp: candle.t * 1000000,
                                conditions: [],
                                trade_timestamp: new Date(candle.t),
                                trade_type: undefined,
                                window_group: undefined,
                                related_trades: [],
                                moneyness: this.getMoneyness(parsed.strike, historicalSpotPrice, parsed.type),
                                days_to_expiry: this.getDaysToExpiry(parsed.expiry)
                            };
                            contractTrades.push(trade);
                        }
                        return contractTrades;
                    }
                    catch (error) {
                        return [];
                    }
                });
                const batchResults = await Promise.allSettled(tradePromises);
                batchResults.forEach(result => {
                    if (result.status === 'fulfilled') {
                        trades.push(...result.value);
                    }
                });
                // Small delay between batches
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            console.log(`✅ ${ticker}: ${trades.length} individual trades from minute data`);
            return trades;
        }
        catch (error) {
            console.error(`❌ Real trades error for ${ticker}:`, error);
            return [];
        }
    }
    async getCurrentStockPrice(ticker) {
        try {
            const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apikey=${this.polygonApiKey}`;
            const response = await fetch(url);
            const data = await response.json();
            return data.results?.[0]?.c || 100; // Fallback to 100
        }
        catch {
            return 100;
        }
    }
    async getHistoricalSpotPrice(ticker, timestamp) {
        try {
            // Create cache key based on ticker and rounded minute
            const tradeDate = new Date(timestamp);
            const roundedMinute = new Date(tradeDate.getFullYear(), tradeDate.getMonth(), tradeDate.getDate(), tradeDate.getHours(), tradeDate.getMinutes());
            const cacheKey = `${ticker}_${roundedMinute.getTime()}`;
            // Check cache first
            const cached = this.historicalPriceCache.get(cacheKey);
            if (cached) {
                return cached.price;
            }
            const dateStr = tradeDate.toISOString().split('T')[0]; // YYYY-MM-DD format
            // Get minute-level data for the trade date
            const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/minute/${dateStr}/${dateStr}?adjusted=true&sort=asc&apikey=${this.polygonApiKey}`;
            const response = await fetch(url);
            const data = await response.json();
            if (data.results && data.results.length > 0) {
                // Find the closest minute bar to the trade timestamp
                const tradeTime = tradeDate.getTime();
                let closestBar = null;
                let closestTimeDiff = Infinity;
                for (const bar of data.results) {
                    const barTime = new Date(bar.t).getTime();
                    const timeDiff = Math.abs(barTime - tradeTime);
                    if (timeDiff < closestTimeDiff) {
                        closestTimeDiff = timeDiff;
                        closestBar = bar;
                    }
                }
                if (closestBar) {
                    // Cache the result for 1 hour to avoid repeated API calls
                    this.historicalPriceCache.set(cacheKey, {
                        price: closestBar.c,
                        timestamp: Date.now()
                    });
                    // Clean old cache entries (keep cache under 1000 entries)
                    if (this.historicalPriceCache.size > 1000) {
                        const entries = Array.from(this.historicalPriceCache.entries());
                        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
                        // Remove oldest 200 entries
                        for (let i = 0; i < 200; i++) {
                            this.historicalPriceCache.delete(entries[i][0]);
                        }
                    }
                    console.log(`📊 Historical spot price for ${ticker} at ${tradeDate.toLocaleString()}: $${closestBar.c}`);
                    return closestBar.c;
                }
            }
            // Fallback to current stock price method
            console.log(`⚠️ Could not find historical data for ${ticker} at ${tradeDate.toLocaleString()}, using current price`);
            return await this.getCurrentStockPrice(ticker);
        }
        catch (error) {
            console.error(`❌ Error fetching historical spot price for ${ticker}:`, error);
            return await this.getCurrentStockPrice(ticker);
        }
    }
    // Keep this method for compatibility with existing API endpoints
    async processRawTradesData(rawTrades, requestedTicker) {
        console.log(`🔧 Processing ${rawTrades.length} raw trades for ${requestedTicker || 'ALL'} tickers`);
        if (rawTrades.length === 0) {
            console.log('⚠️ No raw trades to process');
            return [];
        }
        // Convert to ProcessedTrade format with proper async handling
        const convertedPromises = rawTrades.map(raw => this.convertRawToProcessed(raw));
        const convertedResults = await Promise.all(convertedPromises);
        const converted = convertedResults.filter(t => t !== null);
        // Apply filtering
        return this.filterAndClassifyTrades(converted, requestedTicker);
    }
    async convertRawToProcessed(rawTrade) {
        // Parse the options ticker to extract information
        const parsed = this.parseOptionsTicker(rawTrade.ticker);
        if (!parsed)
            return null;
        // Get real historical spot price at the exact time of the trade
        const tradeTimestamp = rawTrade.sip_timestamp / 1000000; // Convert to milliseconds
        const realSpotPrice = await this.getHistoricalSpotPrice(parsed.underlying, tradeTimestamp);
        // Calculate real expiry days
        const expiryDate = new Date(parsed.expiry);
        const tradeDate = new Date(tradeTimestamp);
        const daysToExpiry = Math.ceil((expiryDate.getTime() - tradeDate.getTime()) / (1000 * 60 * 60 * 24));
        const trade = {
            ticker: rawTrade.ticker,
            underlying_ticker: parsed.underlying,
            strike: parsed.strike,
            expiry: parsed.expiry,
            type: parsed.type,
            trade_size: rawTrade.size,
            premium_per_contract: rawTrade.price,
            total_premium: rawTrade.price * rawTrade.size * 100,
            spot_price: realSpotPrice,
            exchange: rawTrade.exchange,
            exchange_name: this.exchangeNames[rawTrade.exchange] || 'UNKNOWN',
            sip_timestamp: rawTrade.sip_timestamp,
            conditions: rawTrade.conditions,
            trade_timestamp: new Date(rawTrade.sip_timestamp / 1000000),
            trade_type: undefined,
            window_group: undefined,
            related_trades: [],
            moneyness: this.getMoneyness(parsed.strike, realSpotPrice, parsed.type),
            days_to_expiry: daysToExpiry
        };
        return trade;
    }
    parseOptionsTicker(ticker) {
        // Parse options ticker format: O:SPY241025C00425000
        const match = ticker.match(/O:([A-Z]+)(\d{6})([CP])(\d{8})/);
        if (!match)
            return null;
        const [, underlying, dateStr, typeChar, strikeStr] = match;
        // Parse date: YYMMDD
        const year = 2000 + parseInt(dateStr.substring(0, 2));
        const month = parseInt(dateStr.substring(2, 4));
        const day = parseInt(dateStr.substring(4, 6));
        const expiry = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        // Parse strike: divide by 1000
        const strike = parseInt(strikeStr) / 1000;
        const type = typeChar === 'C' ? 'call' : 'put';
        return { underlying, expiry, type, strike };
    }
    async scanForSweeps(ticker) {
        console.log(`🔍 Scanning ${ticker} for sweep activity...`);
        // Add timeout protection (3 minutes max)
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Scan timeout for ${ticker} after 3 minutes`)), 180000);
        });
        const scanPromise = this.performSweepScan(ticker);
        try {
            return await Promise.race([scanPromise, timeoutPromise]);
        }
        catch (error) {
            console.error(`❌ Scan failed for ${ticker}:`, error);
            return [];
        }
    }
    async performSweepScan(ticker) {
        try {
            // Get stock price first
            const stockUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apikey=${this.polygonApiKey}`;
            const stockResponse = await fetch(stockUrl);
            const stockData = await stockResponse.json();
            const stockPrice = stockData.results?.[0]?.c || 50;
            // Generate strike prices: 10% ITM and all OTM for BOTH calls and puts
            const strikes = [];
            // Calculate 10% ITM boundaries for both calls and puts
            const itmCallBoundary = stockPrice * 0.9; // 10% below current price (calls ITM when stock > strike)
            const itmPutBoundary = stockPrice * 1.1; // 10% above current price (puts ITM when stock < strike)
            // Scan range: from call 10% ITM to put 10% ITM + 50% OTM
            const minStrike = itmCallBoundary; // Lowest: 10% ITM calls
            const maxStrike = Math.max(itmPutBoundary, stockPrice * 1.5); // Highest: 10% ITM puts OR 50% OTM
            // Scan every possible strike increment: 0.5, 1, 2.5, 5, etc.
            const possibleIncrements = [0.5, 1, 2.5, 5, 10];
            const allPossibleStrikes = new Set();
            for (const increment of possibleIncrements) {
                const startStrike = Math.floor(minStrike / increment) * increment;
                const endStrike = Math.ceil(maxStrike / increment) * increment;
                for (let strike = startStrike; strike <= endStrike; strike += increment) {
                    if (strike >= minStrike && strike <= maxStrike) {
                        allPossibleStrikes.add(Number(strike.toFixed(2)));
                    }
                }
            }
            strikes.push(...Array.from(allPossibleStrikes).sort((a, b) => a - b));
            console.log(`📊 ${ticker} @ $${stockPrice}: Scanning ${strikes.length} strikes from $${minStrike.toFixed(2)} to $${maxStrike.toFixed(2)} (all increments)`);
            // Get expiration dates (next 50 expirations up to 1 year out)
            const expirations = this.getAllExpirations(50);
            const allTrades = [];
            // Create all contract combinations
            const contractPromises = [];
            for (const exp of expirations) {
                for (const strike of strikes) {
                    for (const type of ['C', 'P']) {
                        const strikeStr = (strike * 1000).toString().padStart(8, '0');
                        const optionTicker = `O:${ticker}${exp}${type}${strikeStr}`;
                        const contractPromise = this.fetchContractTrades(optionTicker, strike, exp, type === 'C' ? 'call' : 'put', ticker, stockPrice);
                        contractPromises.push(contractPromise);
                    }
                }
            }
            console.log(`📡 Processing ${contractPromises.length} contracts concurrently for ${ticker}...`);
            // Process all contracts concurrently in batches of 50
            const batchSize = 50;
            for (let i = 0; i < contractPromises.length; i += batchSize) {
                const batch = contractPromises.slice(i, i + batchSize);
                const batchResults = await Promise.all(batch);
                batchResults.forEach(trades => {
                    if (trades.length > 0) {
                        allTrades.push(...trades);
                    }
                });
                console.log(`✅ Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(contractPromises.length / batchSize)} for ${ticker}`);
                // Small delay between batches to stay under rate limit
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            console.log(`📊 Found ${allTrades.length} total trades, detecting sweeps and blocks...`);
            // Detect sweeps from all trades
            const sweeps = this.detectSweeps(allTrades);
            // Also detect individual large block trades
            const blocks = this.detectBlocks(allTrades);
            // Combine sweeps and blocks
            const allFlowTrades = [...sweeps, ...blocks];
            console.log(`🌊 Detected ${sweeps.length} sweep patterns and ${blocks.length} block trades`);
            return allFlowTrades.sort((a, b) => b.total_premium - a.total_premium);
        }
        catch (error) {
            console.error('Error scanning for sweeps:', error);
            return [];
        }
    }
    detectBlocks(allTrades) {
        const blocks = [];
        const processedTrades = new Set();
        allTrades.forEach(trade => {
            const totalPremium = trade.price * trade.size * 100;
            const tradeKey = `${trade.symbol}_${trade.strike}_${trade.type}_${trade.expiration}_${trade.timestamp}`;
            // Skip if already processed (to avoid duplicates with sweeps)
            if (processedTrades.has(tradeKey)) {
                return;
            }
            // Classify as block if: large premium ($25k+) and significant size (50+ contracts)
            if (totalPremium >= 25000 && trade.size >= 50) {
                const expiry = this.formatExpiry(trade.expiration);
                blocks.push({
                    ticker: `O:${trade.symbol}${trade.expiration}${trade.type === 'call' ? 'C' : 'P'}${(trade.strike * 1000).toString().padStart(8, '0')}`,
                    underlying_ticker: trade.symbol,
                    strike: trade.strike,
                    expiry: expiry,
                    type: trade.type,
                    trade_size: trade.size,
                    premium_per_contract: trade.price,
                    total_premium: totalPremium,
                    spot_price: trade.spot_price,
                    exchange: trade.exchange,
                    exchange_name: this.exchangeNames[trade.exchange] || `Exchange ${trade.exchange}`,
                    sip_timestamp: trade.timestamp,
                    conditions: trade.conditions || [],
                    trade_timestamp: new Date(trade.timestamp / 1000000),
                    trade_type: 'BLOCK',
                    moneyness: this.getMoneyness(trade.strike, trade.spot_price, trade.type),
                    days_to_expiry: this.getDaysToExpiry(expiry)
                });
                processedTrades.add(tradeKey);
            }
        });
        return blocks.sort((a, b) => b.total_premium - a.total_premium);
    }
    getAllExpirations(count) {
        const expirations = [];
        const today = new Date();
        // Get all valid expiration dates (up to 1 year out)
        for (let i = 0; i < 365 && expirations.length < count; i++) { // 1 year = 365 days
            const date = new Date(today);
            date.setDate(date.getDate() + i);
            const dayOfWeek = date.getDay();
            const dateOfMonth = date.getDate();
            const isLastFriday = this.isLastFridayOfMonth(date);
            const isThirdFriday = this.isThirdFridayOfMonth(date);
            // Include standard expiration types:
            // 1. Weekly Fridays (every Friday)
            // 2. Monthly options (3rd Friday of each month)
            // 3. End-of-month options (last trading day if not Friday)
            const shouldInclude = dayOfWeek === 5 || // All Fridays (weeklies)
                isThirdFriday || // Monthly options
                isLastFriday || // End of month options
                (dateOfMonth >= 25 && dayOfWeek >= 1 && dayOfWeek <= 5); // Last week trading days
            if (shouldInclude) {
                const year = date.getFullYear().toString().slice(-2);
                const month = (date.getMonth() + 1).toString().padStart(2, '0');
                const day = date.getDate().toString().padStart(2, '0');
                const expiry = `${year}${month}${day}`;
                // Avoid duplicates
                if (!expirations.includes(expiry)) {
                    expirations.push(expiry);
                }
            }
        }
        return expirations;
    }
    isLastFridayOfMonth(date) {
        const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        const lastFriday = new Date(lastDayOfMonth);
        // Find the last Friday of the month
        while (lastFriday.getDay() !== 5) {
            lastFriday.setDate(lastFriday.getDate() - 1);
        }
        return date.getTime() === lastFriday.getTime();
    }
    isThirdFridayOfMonth(date) {
        const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
        let fridayCount = 0;
        for (let d = 1; d <= date.getDate(); d++) {
            const testDate = new Date(date.getFullYear(), date.getMonth(), d);
            if (testDate.getDay() === 5) {
                fridayCount++;
                if (fridayCount === 3 && d === date.getDate()) {
                    return true;
                }
            }
        }
        return false;
    }
    formatExpiry(expiration) {
        // Convert YYMMDD to YYYY-MM-DD
        const year = 2000 + parseInt(expiration.substring(0, 2));
        const month = expiration.substring(2, 4);
        const day = expiration.substring(4, 6);
        return `${year}-${month}-${day}`;
    }
    getMoneyness(strike, spotPrice, type) {
        const diff = Math.abs(strike - spotPrice);
        if (diff <= 0.5) {
            return 'ATM';
        }
        else if (type === 'call') {
            return spotPrice > strike ? 'ITM' : 'OTM';
        }
        else {
            return spotPrice < strike ? 'ITM' : 'OTM';
        }
    }
    getDaysToExpiry(expiry) {
        const expiryDate = new Date(expiry);
        const today = new Date();
        const diffTime = expiryDate.getTime() - today.getTime();
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
    getPopularTickers() {
        // Use the Top 1000 symbols list for comprehensive market scanning
        return TOP_1000_SYMBOLS;
    }
    getTop1000Symbols() {
        // Import and return the Top1000Symbols array as requested
        return TOP_1000_SYMBOLS.slice(0, 1000); // Use top 1000 stocks for comprehensive coverage
    }
    getSmartTickerBatch() {
        // Smart batching: prioritize most active options tickers first
        // Take top 20 for much faster initial scan
        const priorityTickers = [
            // ETFs and most active options
            'SPY', 'QQQ', 'IWM', 'XLF', 'XLE', 'XLK', 'GDX', 'EEM', 'VXX',
            // Mega caps with high options volume
            'TSLA', 'AAPL', 'NVDA', 'AMZN', 'MSFT', 'GOOGL', 'META', 'AMD', 'NFLX', 'DIS'
        ];
        // Return just the priority tickers for faster scanning
        return priorityTickers;
    }
}
