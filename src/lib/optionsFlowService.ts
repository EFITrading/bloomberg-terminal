import { TOP_1800_SYMBOLS } from './Top1000Symbols';

// Market hours utility functions
export function isMarketOpen(): boolean {
  const now = new Date();
  const eastern = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
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

export function getLastTradingDay(): string {
  const today = new Date();
  let tradingDay = new Date(today);
  
  // If today is a weekday and market is closed, use today's date
  // If today is weekend, go back to Friday
  if (tradingDay.getDay() === 0) { // Sunday
    tradingDay.setDate(tradingDay.getDate() - 2); // Friday
  } else if (tradingDay.getDay() === 6) { // Saturday
    tradingDay.setDate(tradingDay.getDate() - 1); // Friday
  }
  // For weekdays, use the current day (even if market is closed)
  
  return tradingDay.toISOString().split('T')[0];
}

export function getTodaysMarketOpenTimestamp(): number {
  // Get current date in Eastern Time
  const now = new Date();
  
  // Create a new date for today at 9:30 AM Eastern Time
  // Use a simple approach: create the date in UTC and adjust for Eastern Time
  const year = now.getFullYear();
  const month = now.getMonth();
  const date = now.getDate();
  
  // Create market open time (9:30 AM Eastern = 13:30 UTC during EST, 14:30 UTC during EDT)
  // For simplicity, let's create it as local time and then adjust
  const marketOpen = new Date(year, month, date, 9, 30, 0, 0);
  
  // If it's weekend, get last Friday's market open
  const day = marketOpen.getDay();
  if (day === 0) { // Sunday
    marketOpen.setDate(marketOpen.getDate() - 2); // Friday
  } else if (day === 6) { // Saturday
    marketOpen.setDate(marketOpen.getDate() - 1); // Friday
  }
  
  return marketOpen.getTime();
}

export function getSmartDateRange(): { currentDate: string; isLive: boolean } {
  const marketOpen = isMarketOpen();
  
  if (marketOpen) {
    // Use current date for live data
    const today = new Date();
    return {
      currentDate: today.toISOString().split('T')[0],
      isLive: true
    };
  } else {
    // Use last trading day for historical data
    return {
      currentDate: getLastTradingDay(),
      isLive: false
    };
  }
}

interface OptionsTradeData {
  conditions: number[];
  exchange: number;
  price: number;
  sip_timestamp: number;
  size: number;
  timeframe: string;
  ticker: string;
  sequence_number?: number;
}

interface ProcessedTrade {
  ticker: string;
  underlying_ticker: string;
  strike: number;
  expiry: string;
  type: 'call' | 'put';
  trade_size: number;
  premium_per_contract: number;
  total_premium: number;
  spot_price: number;
  exchange: number;
  exchange_name: string;
  sip_timestamp: number;
  sequence_number?: number;
  conditions: number[];
  trade_timestamp: Date;
  trade_type?: 'SWEEP' | 'BLOCK' | 'MULTI-LEG' | 'SPLIT';
  window_group?: string;
  related_trades?: string[];
  moneyness: 'ATM' | 'ITM' | 'OTM';
  days_to_expiry: number;
  // Fill analysis fields
  bid_price?: number;
  ask_price?: number;
  bid_size?: number;
  ask_size?: number;
  fill_type?: 'BELOW_BID' | 'AT_BID' | 'BETWEEN' | 'AT_ASK' | 'ABOVE_ASK';
  fill_aggression?: 'AGGRESSIVE_BUY' | 'AGGRESSIVE_SELL' | 'NEUTRAL' | 'UNKNOWN';
}

interface PremiumTier {
  name: string;
  minPrice: number;
  minSize: number;
  minTotal?: number;
}

export class OptionsFlowService {
  private polygonApiKey: string;
  private historicalPriceCache: Map<string, { price: number; timestamp: number }> = new Map();
  private exchangeNames: { [key: number]: string } = {
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

  private premiumTiers: PremiumTier[] = [
    { name: 'Tier 1: Premium institutional', minPrice: 8.00, minSize: 80 },
    { name: 'Tier 2: High-value large volume', minPrice: 7.00, minSize: 100 },
    { name: 'Tier 3: Mid-premium bulk', minPrice: 5.00, minSize: 150 },
    { name: 'Tier 4: Moderate premium large', minPrice: 3.50, minSize: 200 },
    { name: 'Tier 5: Lower premium large', minPrice: 2.50, minSize: 200 },
    { name: 'Tier 6: Small premium massive', minPrice: 1.00, minSize: 800 },
    { name: 'Tier 7: Penny options massive', minPrice: 0.50, minSize: 2000 },
    { name: 'Tier 8: Premium bypass', minPrice: 0.01, minSize: 20, minTotal: 50000 }
  ];

  constructor(apiKey: string) {
    this.polygonApiKey = apiKey;
  }

  // Streaming version for progressive loading
  async fetchLiveOptionsFlowStreaming(
    ticker?: string, 
    onProgress?: (trades: ProcessedTrade[], status: string, progress?: any) => void
  ): Promise<ProcessedTrade[]> {
    console.log(`🌊 STREAMING: Starting live options flow${ticker ? ` for ${ticker}` : ' market-wide scan'}`);
    
    const allTrades: ProcessedTrade[] = [];
    const tickersToScan = ticker && ticker.toLowerCase() !== 'all' ? [ticker.toUpperCase()] : this.getTop1000Symbols();
    
    onProgress?.([], `Starting scan of ${tickersToScan.length} tickers...`);
    
    // Process in optimal batches (4-5 tickers) for maximum speed with unlimited API
    const batchSize = 5; // Optimal batch size for parallel processing with unlimited API
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
      
      // Process batch in parallel for maximum speed with unlimited API
      const batchPromises = batch.map(async (currentTicker) => {
        try {
          const tickerTrades = await this.fetchLiveStreamingTradesRobust(currentTicker);
          
          if (tickerTrades.length > 0) {
            // Apply filtering and classification immediately
            const filteredTrades = this.filterAndClassifyTrades(tickerTrades, ticker);
            
            // Stream progressive results immediately
            onProgress?.(
              [...allTrades, ...filteredTrades].sort((a, b) => b.total_premium - a.total_premium),
              `Found ${filteredTrades.length} trades from ${currentTicker}`,
              {
                current: batchIndex + 1,
                total: tickerBatches.length,
                justProcessed: currentTicker,
                newTrades: filteredTrades.length,
                totalTrades: allTrades.length + filteredTrades.length,
                progress: ((batchIndex * batchSize + batch.indexOf(currentTicker)) / tickersToScan.length * 100).toFixed(1)
              }
            );
            
            return filteredTrades;
          }
          
          return [];
          
        } catch (error) {
          console.error(`Error fetching ${currentTicker}:`, error);
          onProgress?.(allTrades, `Error with ${currentTicker}, continuing...`);
          return [];
        }
      });
      
      // Await all parallel ticker processing
      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach(tickerTrades => {
        if (tickerTrades && tickerTrades.length > 0) {
          allTrades.push(...tickerTrades);
        }
      });
      
      console.log(`✅ Batch ${batchIndex + 1} complete: ${allTrades.length} total trades`);
      
      // No delay needed with unlimited API
    }
    
    onProgress?.(allTrades, `Scan complete: ${allTrades.length} total trades found`);
    return allTrades.sort((a, b) => b.total_premium - a.total_premium);
  }

  async fetchLiveOptionsFlow(ticker?: string): Promise<ProcessedTrade[]> {
    // Smart market hours detection
    const { currentDate, isLive } = getSmartDateRange();
    const marketStatus = isLive ? 'LIVE' : 'LAST TRADING DAY';
    const marketOpenTimestamp = getTodaysMarketOpenTimestamp();
    const marketOpenTime = new Date(marketOpenTimestamp).toLocaleString('en-US', {timeZone: 'America/New_York'});
    const currentTime = new Date().toLocaleString('en-US', {timeZone: 'America/New_York'});
    
    console.log(`🎯 FETCHING ${marketStatus} OPTIONS FLOW WITH SWEEP DETECTION FOR: ${ticker || 'NO TICKER SPECIFIED'}`);
    console.log(`� DEBUG: Received ticker parameter: "${ticker}" (type: ${typeof ticker})`);
    console.log(`�📅 Using date: ${currentDate} (${isLive ? 'Market Open' : 'Market Closed - Historical Data'})`);
    console.log(`⏰ Time range: ${marketOpenTime} ET → ${currentTime} ET (${isLive ? 'LIVE UPDATE' : 'HISTORICAL'})`);
    
    // Determine which tickers to scan
    let tickersToScan: string[];
    
    console.log(`🔍 DEBUG: Checking ticker conditions...`);
    console.log(`🔍 DEBUG: !ticker = ${!ticker}`);
    console.log(`🔍 DEBUG: ticker.toLowerCase() = "${ticker?.toLowerCase()}"`);
    console.log(`🔍 DEBUG: ticker.toLowerCase() === 'all' = ${ticker?.toLowerCase() === 'all'}`);
    
    if (!ticker || ticker.toLowerCase() === 'all') {
      // FORCE USE OF 1000 STOCKS - NO UNIVERSAL TICKER
      tickersToScan = this.getTop1000Symbols();
      console.log(`🚀 FORCED 1000 STOCK SCAN: ${tickersToScan.length} symbols (NO UNIVERSAL TICKER)`);
      console.log(`🎯 First 20 tickers: ${tickersToScan.slice(0, 20).join(', ')}...`);
      console.log(`⚡ Using individual ticker processing - NO 'ALL' as single ticker`);
    } else if (ticker && ticker.includes(',')) {
      // Handle comma-separated tickers
      tickersToScan = ticker.split(',').map(t => t.trim().toUpperCase());
      console.log(`📋 SCANNING SPECIFIC TICKERS: ${tickersToScan.join(', ')}`);
    } else {
      // Single ticker
      tickersToScan = [ticker.toUpperCase()];
      console.log(`🎯 SCANNING SINGLE TICKER: ${ticker.toUpperCase()}`);
    }
    
    console.log(`🔍 DEBUG: Final tickersToScan.length = ${tickersToScan.length}`);
    console.log(`🔍 DEBUG: First 10 tickers: ${tickersToScan.slice(0, 10).join(', ')}`);
    if (tickersToScan.length === 1) {
      console.log(`⚠️ WARNING: Only scanning 1 ticker: ${tickersToScan[0]} - this suggests the 'ALL' logic failed`);
    }
    
    console.log(`⚡ LIVE TRADES SCANNING ${tickersToScan.length} tickers from today's market open...`);
    
    const allTrades: ProcessedTrade[] = [];
    
    // For live data, prioritize TODAY's actual trades over snapshots
    if (isLive) {
      console.log(`🔴 LIVE MODE: Fetching today's trades from market open instead of snapshots`);
    } else {
      console.log(`📸 HISTORICAL MODE: Using snapshot data for last trading day`);
    }
    
    // UNLIMITED API BATCHING: Process larger batches for maximum speed
    const tickerBatchSize = 50; // Much larger batches since we have unlimited API calls
    const tickerBatches: string[][] = [];
    for (let i = 0; i < tickersToScan.length; i += tickerBatchSize) {
      tickerBatches.push(tickersToScan.slice(i, i + tickerBatchSize));
    }
    
    console.log(`📊 Processing ${tickerBatches.length} batches of ${tickerBatchSize} stocks each with rate limiting...`);
    
    // Process ticker batches sequentially to avoid overwhelming the API
    for (let batchIndex = 0; batchIndex < tickerBatches.length; batchIndex++) {
      const batch = tickerBatches[batchIndex];
      console.log(`⚡ Processing batch ${batchIndex + 1}/${tickerBatches.length}: ${batch.slice(0, 5).join(', ')}...`);
      
      // PARALLEL PROCESSING within each batch with ROBUST ERROR HANDLING
      const tradesPromises = batch.map(async (symbol: string) => {
        let retries = 3;
        while (retries > 0) {
          try {
            let trades: ProcessedTrade[] = [];
            
            if (isLive) {
              // LIVE MODE: Force today's trades only, with robust connection handling
              trades = await this.fetchLiveStreamingTradesRobust(symbol);
              if (trades.length > 0) {
                console.log(`🔴 LIVE ${symbol}: ${trades.length} streaming trades from today`);
              } else {
                console.log(`⚠️ ${symbol}: No live trades yet today - this is normal early in trading`);
              }
            } else {
              // HISTORICAL MODE: Use snapshot data with robust connection
              trades = await this.fetchOptionsSnapshotRobust(symbol);
              if (trades.length > 0) {
                console.log(`⚡ ${symbol}: ${trades.length} historical snapshot trades`);
              }
            }
            
            return trades; // Success - exit retry loop
            
          } catch (error) {
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
      
      // No delay needed with unlimited API
    }
    
    // Legacy code for comparison - this is now replaced by batched processing above
    const snapshotPromises = [] as any;
    
    // Results already collected in batched processing above
    
    console.log(`⚡ INDIVIDUAL TRADES COMPLETE: ${allTrades.length} total individual trades collected`);
    
    if (allTrades.length > 0) {
      // Apply your criteria filtering and classification
      const filtered = this.filterAndClassifyTrades(allTrades, ticker);
      return filtered.sort((a: ProcessedTrade, b: ProcessedTrade) => b.total_premium - a.total_premium);
    }
    
    return [];
  }

  private async fetchOptionsSnapshot(ticker: string): Promise<ProcessedTrade[]> {
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
      const trades: ProcessedTrade[] = [];
      
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
        let moneyness: 'ATM' | 'ITM' | 'OTM' = 'OTM';
        if (spotPrice > 0) {
          const percentDiff = Math.abs(spotPrice - strikePrice) / spotPrice;
          if (percentDiff < 0.01) { // Within 1%
            moneyness = 'ATM';
          } else if (contract.details.contract_type === 'call') {
            moneyness = spotPrice > strikePrice ? 'ITM' : 'OTM';
          } else {
            moneyness = spotPrice < strikePrice ? 'ITM' : 'OTM';
          }
        }

        const trade: ProcessedTrade = {
          ticker: contract.details.ticker,
          underlying_ticker: ticker,
          strike: strikePrice,
          expiry: contract.details.expiration_date,
          type: contract.details.contract_type as 'call' | 'put',
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
      
    } catch (error) {
      console.error(`❌ Error fetching ${ticker} snapshot:`, error);
      return [];
    }
  }

  // Helper method to fetch trades for a single contract
  private async fetchContractTrades(optionTicker: string, strike: number, expiration: string, type: 'call' | 'put', symbol: string, spotPrice: number): Promise<any[]> {
    // Get timestamp from today's market open (9:30 AM ET) instead of 24 hours ago
    const marketOpenTimestamp = getTodaysMarketOpenTimestamp();
    const marketOpenDate = new Date(marketOpenTimestamp);
    // Convert milliseconds to nanoseconds properly (multiply by 1,000,000)
    const nanosecondTimestamp = marketOpenTimestamp * 1000000;
    const url = `https://api.polygon.io/v3/trades/${optionTicker}?timestamp.gte=${nanosecondTimestamp}&apikey=${this.polygonApiKey}`;
    
    console.log(`📈 Fetching ${optionTicker} trades from market open: ${marketOpenDate.toLocaleString('en-US', {timeZone: 'America/New_York'})} ET`);
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        // Get historical spot price for each trade at its exact timestamp
        const tradesWithHistoricalSpot = await Promise.all(
          data.results.map(async (trade: any) => {
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
          })
        );
        return tradesWithHistoricalSpot;
      }
      
      return [];
    } catch (error) {
      // Skip individual contract errors
      return [];
    }
  }

  private filterAndClassifyTrades(trades: ProcessedTrade[], targetTicker?: string): ProcessedTrade[] {
    console.log(`🔍 Filtering ${trades.length} individual trades${targetTicker ? ` for ${targetTicker}` : ''}`);
    
    let filtered = trades;
    
    // Filter by ticker if specified (but not for 'ALL' requests)
    if (targetTicker && targetTicker.toLowerCase() !== 'all') {
      filtered = filtered.filter(trade => trade.underlying_ticker === targetTicker);
      console.log(`📊 After ticker filter: ${filtered.length} trades`);
    } else if (targetTicker && targetTicker.toLowerCase() === 'all') {
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
    
    // Count puts vs calls before institutional filtering
    const putsBeforeFilter = filtered.filter(t => t.type === 'put').length;
    const callsBeforeFilter = filtered.filter(t => t.type === 'call').length;
    console.log(`📊 Before institutional filter: ${putsBeforeFilter} puts, ${callsBeforeFilter} calls`);

    // YOUR ACTUAL CRITERIA - Use existing institutional tiers system
    filtered = filtered.filter(trade => this.passesInstitutionalCriteria(trade));
    
    // Count puts vs calls after institutional filtering
    const putsAfterFilter = filtered.filter(t => t.type === 'put').length;
    const callsAfterFilter = filtered.filter(t => t.type === 'call').length;
    console.log(`🎯 After YOUR tier criteria filter: ${filtered.length} trades (${putsAfterFilter} puts, ${callsAfterFilter} calls)`);

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
      if (Math.abs(premiumDiff) > 1000) return premiumDiff;
      // Then by timestamp (newest first)
      return b.trade_timestamp.getTime() - a.trade_timestamp.getTime();
    });
    
    return filtered;
  }

  // Market hours validation - Only show trades during 9:30 AM - 4:00 PM ET
  private isWithinMarketHours(tradeTimestamp: Date): boolean {
    // Convert to ET timezone
    const etTime = new Date(tradeTimestamp.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const hours = etTime.getHours();
    const minutes = etTime.getMinutes();
    const timeInMinutes = hours * 60 + minutes;
    
    // Market hours: 9:30 AM (570 minutes) to 4:00 PM (960 minutes) ET
    const marketOpen = 9 * 60 + 30; // 9:30 AM = 570 minutes
    const marketClose = 16 * 60;    // 4:00 PM = 960 minutes
    
    const isWithinHours = timeInMinutes >= marketOpen && timeInMinutes <= marketClose;
    
    if (!isWithinHours) {
      console.log(`🚫 After-hours trade filtered: ${etTime.toLocaleTimeString()} ET`);
    }
    
    return isWithinHours;
  }

  // EXACT TIMESTAMP SWEEP DETECTION: Bundle trades executed at exact same time across exchanges
  private detectSweeps(trades: ProcessedTrade[]): ProcessedTrade[] {
    console.log(`🔍 EXACT TIMESTAMP SWEEP DETECTION: Processing ${trades.length} trades...`);
    
    // Sort trades by timestamp
    trades.sort((a, b) => a.sip_timestamp - b.sip_timestamp);
    
    // Group trades by exact timestamp AND contract
    const exactTimeGroups = new Map<string, ProcessedTrade[]>();
    
    for (const trade of trades) {
      // Use exact timestamp (millisecond precision) + contract as key for grouping
      const contractKey = `${trade.ticker}_${trade.strike}_${trade.type}_${trade.expiry}`;
      const timeKey = Math.floor(trade.sip_timestamp / 1000); // Convert to milliseconds for grouping
      const groupKey = `${contractKey}_${timeKey}`;
      
      if (!exactTimeGroups.has(groupKey)) {
        exactTimeGroups.set(groupKey, []);
      }
      exactTimeGroups.get(groupKey)!.push(trade);
    }
    
    const categorizedTrades: ProcessedTrade[] = [];
    let sweepCount = 0;
    let blockCount = 0;
    
    // Process each exact time group - trades at same time become sweeps if multi-exchange
    exactTimeGroups.forEach((tradesInGroup, groupKey) => {
      const totalContracts = tradesInGroup.reduce((sum, t) => sum + t.trade_size, 0);
      const totalPremium = tradesInGroup.reduce((sum, t) => sum + t.total_premium, 0);
      const exchanges = [...new Set(tradesInGroup.map(t => t.exchange))];
      const representativeTrade = tradesInGroup[0];
      
      // Debug: Show exact time grouping for significant trades
      if (tradesInGroup.length > 1 && totalPremium >= 50000) {
        const time = new Date(representativeTrade.sip_timestamp).toLocaleTimeString();
        console.log(`\n🔍 EXACT TIME GROUP: ${tradesInGroup.length} trades at ${time}:`);
        console.log(`   ${representativeTrade.ticker} $${representativeTrade.strike} ${representativeTrade.type.toUpperCase()}S - Total: ${totalContracts} contracts, $${totalPremium.toLocaleString()}`);
        tradesInGroup.forEach((trade, idx) => {
          console.log(`     ${idx+1}. ${trade.trade_size} contracts @$${trade.premium_per_contract.toFixed(2)} [${trade.exchange}]`);
        });
      }
      
      // Classify this exact time group
      if (tradesInGroup.length > 1 && exchanges.length > 1) {
        // SWEEP: Multiple trades at exact same time across different exchanges
        sweepCount++;
        const weightedPrice = tradesInGroup.reduce((sum, trade) => {
          return sum + (trade.premium_per_contract * trade.trade_size);
        }, 0) / totalContracts;
        
        const sweepTrade: ProcessedTrade = {
          ...representativeTrade,
          trade_size: totalContracts,
          premium_per_contract: weightedPrice,
          total_premium: totalPremium,
          trade_type: 'SWEEP',
          exchange_name: `MULTI-EXCHANGE (${tradesInGroup.length} fills across ${exchanges.length} exchanges)`,
          window_group: `sweep_${groupKey}`,
          related_trades: exchanges.map(ex => `${ex}`)
        };
        
        console.log(`🧹 SWEEP DETECTED: ${sweepTrade.ticker} $${sweepTrade.strike} ${sweepTrade.type.toUpperCase()}S - ${totalContracts} contracts, $${totalPremium.toLocaleString()} across ${tradesInGroup.length} fills`);
        categorizedTrades.push(sweepTrade);
        
      } else {
        // BLOCK or single trade: either one large trade or multiple on same exchange  
        for (const trade of tradesInGroup) {
          let tradeType: 'SWEEP' | 'BLOCK' = 'BLOCK';
          if (trade.total_premium >= 100000) {
            tradeType = 'SWEEP'; // Very large single trades can be sweeps
            sweepCount++;
          } else {
            blockCount++;
          }
          
          categorizedTrades.push({
            ...trade,
            trade_type: tradeType
          });
        }
      }
    });
    
    console.log(`✅ EXACT TIMESTAMP SWEEP DETECTION COMPLETE: Found ${sweepCount} sweeps and ${blockCount} blocks from ${trades.length} individual trades`);
    return categorizedTrades;
  }

  // MULTI-LEG DETECTION: Identify complex options strategies (spreads, straddles, etc.)
  private detectMultiLegTrades(trades: ProcessedTrade[]): ProcessedTrade[] {
    console.log(`🔍 MULTI-LEG DETECTION: Processing ${trades.length} trades...`);
    
    // Group trades by underlying ticker and EXACT timestamp (multi-leg trades execute simultaneously)
    const exactTimeGroups = new Map<string, ProcessedTrade[]>();
    
    for (const trade of trades) {
      // Use exact timestamp - multi-leg fills happen at identical time
      const exactTimestamp = trade.trade_timestamp.getTime();
      const groupKey = `${trade.underlying_ticker}_${exactTimestamp}`;
      
      if (!exactTimeGroups.has(groupKey)) {
        exactTimeGroups.set(groupKey, []);
      }
      exactTimeGroups.get(groupKey)!.push(trade);
    }
    
    let multiLegCount = 0;
    const processedTrades: ProcessedTrade[] = [];
    
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
        const multiLegTrades = groupTrades.map((trade: ProcessedTrade) => ({
          ...trade,
          trade_type: 'MULTI-LEG' as const,
          window_group: `multileg_${groupKey}`,
          related_trades: groupTrades.map((t: ProcessedTrade) => t.ticker)
        }));
        
        processedTrades.push(...multiLegTrades);
      } else {
        // Not multi-leg, add as individual trades
        processedTrades.push(...groupTrades);
      }
    }
    
    console.log(`✅ MULTI-LEG DETECTION COMPLETE: Found ${multiLegCount} multi-leg strategies from ${trades.length} individual trades`);
    return processedTrades;
  }

  // Analyze if a group of trades forms a multi-leg strategy
  private analyzeMultiLegPattern(trades: ProcessedTrade[]): boolean {
    if (trades.length < 2) return false;
    
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
  private passesInstitutionalCriteria(trade: ProcessedTrade): boolean {
    const tradePrice = trade.premium_per_contract;
    const tradeSize = trade.trade_size;
    const totalPremium = trade.total_premium;

    // Debug logging for puts
    if (trade.type === 'put' && totalPremium > 5000) {
      console.log(`🔍 PUT ANALYSIS: ${trade.ticker} - $${tradePrice.toFixed(2)} × ${tradeSize} = $${totalPremium.toFixed(0)} premium`);
    }

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
    
    const passes = institutionalTiers.some(tier => {
      const passesPrice = tradePrice >= tier.minPrice;
      const passesSize = tradeSize >= tier.minSize;
      const passesTotal = tier.minTotal ? totalPremium >= tier.minTotal : true;
      
      if (passesPrice && passesSize && passesTotal) {
        console.log(`✅ ${trade.ticker}: Passes ${tier.name} - $${tradePrice.toFixed(2)} × ${tradeSize} = $${totalPremium.toFixed(0)}`);
        return true;
      }
      return false;
    });

    // Debug logging for failed puts
    if (trade.type === 'put' && totalPremium > 5000 && !passes) {
      console.log(`❌ PUT FAILED: ${trade.ticker} - $${tradePrice.toFixed(2)} × ${tradeSize} = $${totalPremium.toFixed(0)} - doesn't meet any tier`);
    }

    return passes;
  }

  // YOUR EXACT ITM FILTER: 5% ITM MAX + ALL OTM
  private isWithinTradeableRange(trade: ProcessedTrade): boolean {
    if (trade.spot_price <= 0) return false;
    
    // YOUR CRITERIA: Only 5% ITM max and all OTM contracts
    if (trade.type === 'call') {
      const percentFromATM = (trade.strike - trade.spot_price) / trade.spot_price;
      return percentFromATM >= -0.05; // Only 5% ITM max, unlimited OTM
    } else {
      const percentFromATM = (trade.strike - trade.spot_price) / trade.spot_price;
      return percentFromATM <= 0.05; // Only 5% ITM max, unlimited OTM
    }
  }





  private classifyTradeType(trade: ProcessedTrade): ProcessedTrade {
    // Correct classification:
    // BLOCK = Large trade ($25k+) filled on ONE exchange only
    // SWEEP = Trade filled across MULTIPLE exchanges simultaneously
    let tradeType: 'SWEEP' | 'BLOCK' | 'MULTI-LEG' | 'SPLIT' | undefined;
    
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
  private async robustFetch(url: string, maxRetries: number = 3): Promise<Response> {
    let lastError: Error = new Error('Unknown error');
    
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
        
      } catch (error) {
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
  async fetchLiveStreamingTradesRobust(ticker: string): Promise<ProcessedTrade[]> {
    console.log(`🔧 STREAMING ALL EXPIRATIONS: Fetching ${ticker} with proper filtering`);
    
    try {
      // Get current stock price first
      const spotPrice = await this.getCurrentStockPrice(ticker);
      if (spotPrice <= 0) {
        console.log(`❌ ${ticker}: Cannot get spot price`);
        return [];
      }
      
      console.log(`💰 ${ticker} CURRENT PRICE: $${spotPrice}`);
      
      // Get ALL options contracts with pagination for comprehensive coverage
      const allContracts = await this.fetchAllContractsPaginated(ticker);
      
      if (allContracts.length === 0) {
        console.log(`📭 ${ticker}: No options contracts found`);
        return [];
      }
      
      console.log(`📋 ${ticker}: Found ${allContracts.length} total contracts across all pages`);
      
      // Apply 5% ITM filtering BEFORE scanning trades
      const validContracts = allContracts.filter((contract: any) => {
        const strike = contract.strike_price;
        const contractType = contract.contract_type.toLowerCase();
        
        // YOUR 5% ITM RULE: Only scan contracts within 5% ITM + all OTM
        if (contractType === 'call') {
          const percentFromATM = (strike - spotPrice) / spotPrice;
          return percentFromATM >= -0.05; // Only 5% ITM max, unlimited OTM
        } else {
          const percentFromATM = (strike - spotPrice) / spotPrice;
          return percentFromATM <= 0.05; // Only 5% ITM max, unlimited OTM
        }
      });
      
      console.log(`✅ ${ticker}: ${validContracts.length} contracts pass 5% ITM filter`);
      console.log(`❌ ${ticker}: ${allContracts.length - validContracts.length} deep ITM contracts filtered out`);
      
      // Get today's market open timestamp
      const marketOpenTimestamp = getTodaysMarketOpenTimestamp();
      const allTrades: ProcessedTrade[] = [];
      
      // Scan ALL valid contracts - no artificial limits, only your criteria filters
      let contractsWithTrades = 0;
      
      console.log(`📊 ${ticker}: Scanning trades for ALL ${validContracts.length} valid contracts (all expirations)...`);
      
      for (let i = 0; i < validContracts.length; i++) {
        const contract = validContracts[i];
        
        try {
          const tradesUrl = `https://api.polygon.io/v3/trades/${contract.ticker}?timestamp.gte=${marketOpenTimestamp * 1000000}&limit=5000&apikey=${this.polygonApiKey}`;
          const tradesResponse = await this.robustFetch(tradesUrl);
          const tradesData = await tradesResponse.json();
          
          if (tradesData.results && tradesData.results.length > 0) {
            contractsWithTrades++;
            
            // Process each trade
            tradesData.results.forEach((trade: any) => {
              const tradeTime = new Date(trade.sip_timestamp / 1000000);
              const today = new Date();
              
              // Only today's trades
              if (tradeTime.toDateString() !== today.toDateString()) {
                return;
              }
              
              // Market hours filter
              const eastern = new Date(tradeTime.toLocaleString("en-US", {timeZone: "America/New_York"}));
              const hour = eastern.getHours();
              const minute = eastern.getMinutes();
              const timeDecimal = hour + (minute / 60);
              
              if (timeDecimal < 9.5 || timeDecimal >= 16) {
                return; // Outside market hours
              }
              
              const premium = trade.price * trade.size * 100;
              const contractType = contract.contract_type.toLowerCase();
              
              // Debug logging for significant put trades
              if (contractType === 'put' && premium > 10000) {
                console.log(`📉 LARGE PUT FOUND: ${contract.ticker} - ${trade.size} × $${trade.price} = $${premium.toFixed(0)}`);
              }
              
              const processedTrade: ProcessedTrade = {
                ticker: contract.ticker,
                underlying_ticker: ticker,
                strike: contract.strike_price,
                expiry: contract.expiration_date,
                type: contractType as 'call' | 'put',
                trade_size: trade.size,
                premium_per_contract: trade.price,
                total_premium: premium,
                spot_price: spotPrice,
                exchange: trade.exchange,
                exchange_name: this.exchangeNames[trade.exchange] || 'UNKNOWN',
                sip_timestamp: trade.sip_timestamp,
                trade_timestamp: tradeTime,
                conditions: trade.conditions || [],
                moneyness: this.getMoneyness(contract.strike_price, spotPrice, contract.contract_type.toLowerCase() as 'call' | 'put'),
                days_to_expiry: Math.ceil((new Date(contract.expiration_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
              };
              
              allTrades.push(processedTrade);
            });
          }
          
          // Smart rate limiting to prevent API errors
          // No rate limiting needed with unlimited API
          
        } catch (error) {
          console.log(`❌ Error scanning ${contract.ticker}: ${error}`);
        }
      }
      
      console.log(`✅ ${ticker}: Found ${allTrades.length} trades across ${contractsWithTrades} active contracts`);
      return allTrades;
      
    } catch (error) {
      console.error(`❌ All-expiration streaming error for ${ticker}:`, error);
      return [];
    }
  }

  // SNAPSHOT WITH ALL-EXPIRATION 5% ITM FILTERING
  async fetchOptionsSnapshotRobust(ticker: string): Promise<ProcessedTrade[]> {
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
      
      const trades: ProcessedTrade[] = [];
      let validContracts = 0;
      let filteredOut = 0;
      
      // Process each contract with 5% ITM filtering
      for (const contract of data.results) {
        if (!contract.last_trade || !contract.last_trade.price) continue;
        
        const strike = contract.details.strike_price;
        const contractType = contract.details.contract_type.toLowerCase();
        
        // Apply 5% ITM filter
        let passesITMFilter = false;
        if (contractType === 'call') {
          const percentFromATM = (strike - spotPrice) / spotPrice;
          passesITMFilter = percentFromATM >= -0.05; // Only 5% ITM max, unlimited OTM
        } else {
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
        const eastern = new Date(tradeDate.toLocaleString("en-US", {timeZone: "America/New_York"}));
        const hour = eastern.getHours();
        const minute = eastern.getMinutes();
        const timeDecimal = hour + (minute / 60);
        
        if (timeDecimal < 9.5 || timeDecimal >= 16) {
          continue; // Outside market hours
        }
        
        const trade: ProcessedTrade = {
          ticker: contract.details.ticker,
          underlying_ticker: ticker,
          strike: contract.details.strike_price,
          expiry: contract.details.expiration_date,
          type: contractType as 'call' | 'put',
          trade_size: contract.last_trade.size,
          premium_per_contract: contract.last_trade.price,
          total_premium: contract.last_trade.price * contract.last_trade.size * 100,
          spot_price: spotPrice,
          exchange: contract.last_trade.exchange,
          exchange_name: this.exchangeNames[contract.last_trade.exchange] || 'UNKNOWN',
          trade_timestamp: new Date(tradeTimestamp),
          sip_timestamp: contract.last_trade.sip_timestamp,
          conditions: contract.last_trade.conditions || [],
          moneyness: this.getMoneyness(contract.details.strike_price, spotPrice, contractType as 'call' | 'put'),
          days_to_expiry: Math.ceil((new Date(contract.details.expiration_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        };
        
        trades.push(trade);
      }
      
      console.log(`✅ ${ticker}: ${validContracts} valid contracts, ${filteredOut} deep ITM filtered out`);
      console.log(`✅ ${ticker}: Extracted ${trades.length} today's trades`);
      return trades;
      
    } catch (error) {
      console.error(`❌ All-expiration snapshot error for ${ticker}:`, error);
      throw error;
    }
  }

  // LIVE STREAMING METHOD: Get only TODAY's real-time trades, no fallback
  async fetchLiveStreamingTrades(ticker: string): Promise<ProcessedTrade[]> {
    console.log(`🔴 LIVE STREAMING: Fetching ${ticker} real-time options trades`);
    
    // Get today's market open timestamp
    const marketOpenTimestamp = getTodaysMarketOpenTimestamp();
    const todayStart = new Date(marketOpenTimestamp);
    const now = new Date();
    
    console.log(`📅 Live data range: ${todayStart.toLocaleString('en-US', {timeZone: 'America/New_York'})} ET → ${now.toLocaleString('en-US', {timeZone: 'America/New_York'})} ET`);
    
    try {
      // Use Polygon's aggregates endpoint for TODAY's options activity
      const todayDateStr = todayStart.toISOString().split('T')[0]; // YYYY-MM-DD format
      
      // Get options chains with proper API limits
      const chainUrl = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&limit=1000&apikey=${this.polygonApiKey}`;
      
      console.log(`🔗 Fetching options chain for ${ticker}...`);
      const chainResponse = await fetch(chainUrl);
      const chainData = await chainResponse.json();
      
      if (!chainData.results || chainData.results.length === 0) {
        console.log(`⚠️ No options contracts found for ${ticker}`);
        return [];
      }
      
      const liveTradesResults: ProcessedTrade[] = [];
      
      // Process ALL contracts - no artificial expiration or count limits
      const allContracts = chainData.results.filter((contract: any) => {
        // Only filter out expired contracts
        const expiry = new Date(contract.expiration_date);
        const daysToExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return daysToExpiry > 0; // Not expired
      });
      
      console.log(`📊 Processing ALL ${allContracts.length} active contracts for ${ticker} (all expirations)...`);
      
      // Fetch trades for each contract from TODAY only
      for (const contract of allContracts) {
        try {
          // Use trades endpoint with TODAY's timestamp filter
          const tradesUrl = `https://api.polygon.io/v3/trades/${contract.ticker}?timestamp.gte=${marketOpenTimestamp * 1000000}&apikey=${this.polygonApiKey}`;
          
          const tradesResponse = await fetch(tradesUrl);
          const tradesData = await tradesResponse.json();
          
          if (tradesData.results && tradesData.results.length > 0) {
            console.log(`✅ ${contract.ticker}: Found ${tradesData.results.length} live trades`);
            
            // Process each trade from today
            for (const trade of tradesData.results) {
              const tradeTime = new Date(trade.sip_timestamp / 1000000); // Convert nanoseconds
              
              // Double-check this trade is from today
              if (tradeTime.getTime() >= marketOpenTimestamp) {
                const processedTrade: ProcessedTrade = {
                  ticker: contract.ticker,
                  underlying_ticker: ticker,
                  strike: contract.strike_price,
                  expiry: contract.expiration_date,
                  type: contract.contract_type.toLowerCase() as 'call' | 'put',
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
                  moneyness: 'OTM' as const,
                  days_to_expiry: Math.ceil((new Date(contract.expiration_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                };
                
                liveTradesResults.push(processedTrade);
              }
            }
          }
          
          // Small delay to avoid rate limiting
          // No delay with unlimited API
          
        } catch (error) {
          console.error(`❌ Error fetching trades for contract ${contract.ticker}:`, error);
        }
      }
      
      // Sort by most recent first
      liveTradesResults.sort((a, b) => new Date(b.trade_timestamp).getTime() - new Date(a.trade_timestamp).getTime());
      
      console.log(`🔴 LIVE RESULT: Found ${liveTradesResults.length} real-time trades for ${ticker} from today`);
      return liveTradesResults;
      
    } catch (error) {
      console.error(`❌ Error in live streaming trades for ${ticker}:`, error);
      return [];
    }
  }

  // NEW METHOD: Fetch today's options trades from market open
  async fetchTodaysOptionsFlow(ticker: string): Promise<ProcessedTrade[]> {
    console.log(`🔴 TODAY'S TRADES: Fetching ${ticker} options from market open`);
    
    try {
      // First get current options contracts via snapshot
      const snapshot = await this.fetchOptionsSnapshotFast(ticker);
      
      // For each contract, fetch today's actual trades (not just last trade)
      const todaysTrades: ProcessedTrade[] = [];
      const marketOpenTimestamp = getTodaysMarketOpenTimestamp();
      
      // Limit to top contracts to avoid API limits
      const topContracts = snapshot; // All active contracts for comprehensive coverage
      
      for (const contract of topContracts) {
        try {
          // Fetch actual trades for this contract from today's market open
          const contractTrades = await this.fetchContractTrades(
            contract.ticker, 
            contract.strike, 
            contract.expiry, 
            contract.type, 
            ticker, 
            contract.spot_price
          );
          
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
            trade_type: 'SWEEP' as const,
            moneyness: contract.moneyness || 'OTM' as const,
            days_to_expiry: contract.days_to_expiry || 0
          })));
          
        } catch (error) {
          console.error(`❌ Error fetching today's trades for ${contract.ticker}:`, error);
        }
      }
      
      console.log(`✅ Found ${todaysTrades.length} trades for ${ticker} from today's market open`);
      return todaysTrades;
      
    } catch (error) {
      console.error(`❌ Error fetching today's options flow for ${ticker}:`, error);
      return [];
    }
  }

  // REAL OPTIONS TRADES METHOD - FIXED TO USE CORRECT ENDPOINT
  async fetchOptionsSnapshotFast(ticker: string): Promise<ProcessedTrade[]> {
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
      
      const currentPrice = await this.getCurrentStockPrice(ticker);
      
      // DEBUG: Check expiration dates in contracts
      const expirationDates = [...new Set(contracts.map((c: any) => c.expiration_date))];
      console.log(`📅 Expiration dates found: ${expirationDates.join(', ')}`);
      
      // DEBUG: Show first few contract tickers
      console.log(`🎯 Sample contract tickers:`, contracts.slice(0, 5).map((c: any) => c.ticker));
      
      // Filter contracts by volume and 5% ITM rule BEFORE processing
      const filteredContracts = await this.filterContractsByVolumeAndITM(contracts, currentPrice);
      console.log(`📊 ${ticker}: Filtered to ${filteredContracts.length} contracts (within 5% ITM rule)`);
      
      // ⚡ OPTIMIZED BULK PROCESSING: Use snapshots + parallel batching
      const trades = await this.fetchBulkOptionsTradesOptimized(filteredContracts, ticker, currentPrice, todayStr);
      
      console.log(`✅ ${ticker}: ${trades.length} individual trades from minute data`);
      return trades;
      
    } catch (error) {
      console.error(`❌ Real trades error for ${ticker}:`, error);
      return [];
    }
  }



  private async getCurrentStockPrice(ticker: string): Promise<number> {
    try {
      const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apikey=${this.polygonApiKey}`;
      const response = await fetch(url);
      const data = await response.json();
      return data.results?.[0]?.c || 100; // Fallback to 100
    } catch {
      return 100;
    }
  }

  private async getHistoricalSpotPrice(ticker: string, timestamp: number): Promise<number> {
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
    } catch (error) {
      console.error(`❌ Error fetching historical spot price for ${ticker}:`, error);
      return await this.getCurrentStockPrice(ticker);
    }
  }

  // Keep this method for compatibility with existing API endpoints
  async processRawTradesData(rawTrades: OptionsTradeData[], requestedTicker?: string): Promise<ProcessedTrade[]> {
    console.log(`🔧 Processing ${rawTrades.length} raw trades for ${requestedTicker || 'ALL'} tickers`);
    
    if (rawTrades.length === 0) {
      console.log('⚠️ No raw trades to process');
      return [];
    }

    // Convert to ProcessedTrade format with proper async handling
    const convertedPromises = rawTrades.map(raw => this.convertRawToProcessed(raw));
    const convertedResults = await Promise.all(convertedPromises);
    const converted = convertedResults.filter(t => t !== null) as ProcessedTrade[];
    
    // Apply filtering
    return this.filterAndClassifyTrades(converted, requestedTicker);
  }

  private async convertRawToProcessed(rawTrade: OptionsTradeData): Promise<ProcessedTrade | null> {
    // Parse the options ticker to extract information
    const parsed = this.parseOptionsTicker(rawTrade.ticker);
    if (!parsed) return null;

    // Get real historical spot price at the exact time of the trade
    const tradeTimestamp = rawTrade.sip_timestamp / 1000000; // Convert to milliseconds
    const realSpotPrice = await this.getHistoricalSpotPrice(parsed.underlying, tradeTimestamp);

    // Calculate real expiry days
    const expiryDate = new Date(parsed.expiry);
    const tradeDate = new Date(tradeTimestamp);
    const daysToExpiry = Math.ceil((expiryDate.getTime() - tradeDate.getTime()) / (1000 * 60 * 60 * 24));

    const trade: ProcessedTrade = {
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

  private parseOptionsTicker(ticker: string): { underlying: string; expiry: string; type: 'call' | 'put'; strike: number } | null {
    // Parse options ticker format: O:SPY241025C00425000
    const match = ticker.match(/O:([A-Z]+)(\d{6})([CP])(\d{8})/);
    if (!match) return null;

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

  async scanForSweeps(ticker: string): Promise<ProcessedTrade[]> {
    console.log(`🔍 Scanning ${ticker} for sweep activity...`);
    
    // Add timeout protection (3 minutes max)
    const timeoutPromise = new Promise<ProcessedTrade[]>((_, reject) => {
      setTimeout(() => reject(new Error(`Scan timeout for ${ticker} after 3 minutes`)), 180000);
    });
    
    const scanPromise = this.performSweepScan(ticker);
    
    try {
      return await Promise.race([scanPromise, timeoutPromise]);
    } catch (error) {
      console.error(`❌ Scan failed for ${ticker}:`, error);
      return [];
    }
  }

  private async performSweepScan(ticker: string): Promise<ProcessedTrade[]> {
    try {
      // Get stock price first
      const stockUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apikey=${this.polygonApiKey}`;
      const stockResponse = await fetch(stockUrl);
      const stockData = await stockResponse.json();
      const stockPrice = stockData.results?.[0]?.c || 50;

      // Generate strike prices: 10% ITM and all OTM for BOTH calls and puts
      const strikes = [];
      
      // Calculate 10% ITM boundaries for both calls and puts
      const itmCallBoundary = stockPrice * 0.9;  // 10% below current price (calls ITM when stock > strike)
      const itmPutBoundary = stockPrice * 1.1;   // 10% above current price (puts ITM when stock < strike)
      
      // Scan range: from call 10% ITM to put 10% ITM + 50% OTM
      const minStrike = itmCallBoundary;           // Lowest: 10% ITM calls
      const maxStrike = Math.max(itmPutBoundary, stockPrice * 1.5);  // Highest: 10% ITM puts OR 50% OTM
      
      // Scan every possible strike increment: 0.5, 1, 2.5, 5, etc.
      const possibleIncrements = [0.5, 1, 2.5, 5, 10];
      const allPossibleStrikes = new Set<number>();
      
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
      
      const allTrades: any[] = [];

      // Create all contract combinations
      const contractPromises: Promise<any[]>[] = [];
      
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
        
        console.log(`✅ Processed batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(contractPromises.length/batchSize)} for ${ticker}`);
        
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

    } catch (error) {
      console.error('Error scanning for sweeps:', error);
      return [];
    }
  }



  private detectBlocks(allTrades: any[]): ProcessedTrade[] {
    const blocks: ProcessedTrade[] = [];
    const processedTrades = new Set<string>();
    
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

  private getAllExpirations(count: number): string[] {
    const expirations: string[] = [];
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
      const shouldInclude = 
        dayOfWeek === 5 || // All Fridays (weeklies)
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
  
  private isLastFridayOfMonth(date: Date): boolean {
    const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    const lastFriday = new Date(lastDayOfMonth);
    
    // Find the last Friday of the month
    while (lastFriday.getDay() !== 5) {
      lastFriday.setDate(lastFriday.getDate() - 1);
    }
    
    return date.getTime() === lastFriday.getTime();
  }
  
  private isThirdFridayOfMonth(date: Date): boolean {
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

  private formatExpiry(expiration: string): string {
    // Convert YYMMDD to YYYY-MM-DD
    const year = 2000 + parseInt(expiration.substring(0, 2));
    const month = expiration.substring(2, 4);
    const day = expiration.substring(4, 6);
    return `${year}-${month}-${day}`;
  }

  private getMoneyness(strike: number, spotPrice: number, type: 'call' | 'put'): 'ATM' | 'ITM' | 'OTM' {
    const diff = Math.abs(strike - spotPrice);
    if (diff <= 0.5) {
      return 'ATM';
    } else if (type === 'call') {
      return spotPrice > strike ? 'ITM' : 'OTM';
    } else {
      return spotPrice < strike ? 'ITM' : 'OTM';
    }
  }

  private getDaysToExpiry(expiry: string): number {
    const expiryDate = new Date(expiry);
    const today = new Date();
    const diffTime = expiryDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  private getPopularTickers(): string[] {
    // Use the Top 1800+ symbols list for comprehensive market scanning
    return TOP_1800_SYMBOLS;
  }

  private getTop1000Symbols(): string[] {
    // Import and return the expanded symbols array (now 1800+ stocks)
    return TOP_1800_SYMBOLS; // Use all 1800+ stocks for comprehensive coverage
  }

  // Filter options contracts by volume (50+ minimum) and 5% ITM rule for speed optimization
  private async filterContractsByVolumeAndITM(contracts: any[], spotPrice: number): Promise<any[]> {
    const filtered = contracts.filter(contract => {
      // Parse contract details
      const strike = parseFloat(contract.strike_price);
      const optionType = contract.contract_type?.toLowerCase();
      
      // Skip if invalid data
      if (!strike || !optionType || spotPrice <= 0) return false;
      
      // Apply 5% ITM filter
      if (optionType === 'call') {
        const percentFromATM = (strike - spotPrice) / spotPrice;
        if (percentFromATM < -0.05) return false; // Skip calls deeper than 5% ITM
      } else if (optionType === 'put') {
        const percentFromATM = (strike - spotPrice) / spotPrice;
        if (percentFromATM > 0.05) return false; // Skip puts deeper than 5% ITM
      }
      
      return true;
    });
    
    // Additional volume filtering will be done during trade processing
    // since we need actual trade data to determine volume
    return filtered;
  }

  private getSmartTickerBatch(): string[] {
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

  // 📄 PAGINATION: Fetch ALL contracts across multiple pages for comprehensive coverage
  private async fetchAllContractsPaginated(ticker: string): Promise<any[]> {
    const allContracts: any[] = [];
    let cursor: string | undefined;
    let pageCount = 0;
    
    console.log(`📄 Fetching ALL contracts for ${ticker} with pagination...`);
    
    do {
      pageCount++;
      const url = cursor 
        ? `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&limit=1000&cursor=${cursor}&apikey=${this.polygonApiKey}`
        : `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&limit=1000&apikey=${this.polygonApiKey}`;
      
      try {
        const response = await this.robustFetch(url);
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
          allContracts.push(...data.results);
          console.log(`📄 Page ${pageCount}: +${data.results.length} contracts (Total: ${allContracts.length})`);
        }
        
        cursor = data.next_url ? data.next_url.split('cursor=')[1]?.split('&')[0] : undefined;
        
      } catch (error) {
        console.error(`❌ Pagination error on page ${pageCount}:`, error);
        break;
      }
      
      // Safety limit - prevent infinite loops
      if (pageCount > 50) {
        console.warn(`⚠️ Reached pagination limit (50 pages) for ${ticker}`);
        break;
      }
      
    } while (cursor);
    
    console.log(`✅ Pagination complete: ${allContracts.length} total contracts from ${pageCount} pages`);
    return allContracts;
  }

  // ⚡ OPTIMIZED BULK PROCESSING: Fetch options trades using snapshots + parallel batching
  private async fetchBulkOptionsTradesOptimized(
    contracts: any[], 
    ticker: string, 
    currentPrice: number, 
    todayStr: string
  ): Promise<ProcessedTrade[]> {
    console.log(`🚀 BULK OPTIMIZATION: Processing ${contracts.length} contracts for ${ticker} with parallel snapshots`);
    
    const allTrades: ProcessedTrade[] = [];
    
    // Step 1: Batch contracts into groups for parallel snapshot processing
    const SNAPSHOT_BATCH_SIZE = 20; // Reduced batch size to prevent network buffer overflow
    const contractBatches: any[][] = [];
    
    for (let i = 0; i < contracts.length; i += SNAPSHOT_BATCH_SIZE) {
      contractBatches.push(contracts.slice(i, i + SNAPSHOT_BATCH_SIZE));
    }
    
    console.log(`📦 Created ${contractBatches.length} batches of ${SNAPSHOT_BATCH_SIZE} contracts each`);
    
    // Step 2: Process batches with controlled concurrency to prevent network buffer overflow
    const batchPromises = contractBatches.map(async (batch, batchIndex) => {
      // Stagger batch starts to prevent connection pool exhaustion
      await new Promise(resolve => setTimeout(resolve, batchIndex * 100));
      console.log(`⚡ Processing batch ${batchIndex + 1}/${contractBatches.length} (${batch.length} contracts)`);
      
      // Build comma-separated ticker list for bulk snapshot
      const tickerList = batch.map(contract => contract.ticker).join(',');
      
      try {
        // Use bulk snapshot API to get all contract data in one call
        const snapshotUrl = `https://api.polygon.io/v3/snapshot/options/${ticker}?apikey=${this.polygonApiKey}`;
        const snapshotResponse = await fetch(snapshotUrl);
        
        if (!snapshotResponse.ok) {
          console.warn(`⚠️ Snapshot failed for batch ${batchIndex + 1}: ${snapshotResponse.status}`);
          return [];
        }
        
        const snapshotData = await snapshotResponse.json();
        const results = snapshotData.results || [];
        
        console.log(`📊 Batch ${batchIndex + 1}: Got ${results.length} snapshot results`);
        
        // Step 3: Process snapshot results in parallel
        const tradePromises = results.map(async (optionData: any) => {
          try {
            // Filter by volume immediately
            const volume = optionData.day?.volume || 0;
            if (volume < 50) return []; // Skip low volume
            
            const parsed = this.parseOptionsTicker(optionData.value);
            if (!parsed) return [];
            
            // Use snapshot data to create trade
            const lastPrice = optionData.last_quote?.price || optionData.day?.close || 0;
            const totalPremium = lastPrice * volume * 100;
            
            // Skip if doesn't meet minimum criteria
            if (totalPremium < 5000) return []; // Skip small premium trades
            
            const trade: ProcessedTrade = {
              ticker: optionData.value,
              underlying_ticker: parsed.underlying,
              strike: parsed.strike,
              expiry: parsed.expiry,
              type: parsed.type,
              trade_size: volume,
              premium_per_contract: lastPrice,
              total_premium: totalPremium,
              spot_price: currentPrice,
              exchange: 0,
              exchange_name: 'COMPOSITE',
              sip_timestamp: Date.now() * 1000,
              conditions: [],
              trade_timestamp: new Date(),
              trade_type: undefined,
              window_group: undefined,
              related_trades: [],
              moneyness: this.getMoneyness(parsed.strike, currentPrice, parsed.type),
              days_to_expiry: this.getDaysToExpiry(parsed.expiry)
            };
            
            return [trade];
            
          } catch (error) {
            return [];
          }
        });
        
        // Wait for all trades in this batch
        const batchTradeResults = await Promise.all(tradePromises);
        const batchTrades = batchTradeResults.flat();
        
        console.log(`✅ Batch ${batchIndex + 1} complete: ${batchTrades.length} trades`);
        return batchTrades;
        
      } catch (error) {
        console.error(`❌ Batch ${batchIndex + 1} failed:`, error);
        return [];
      }
    });
    
    // Step 4: Wait for all batches to complete
    console.log(`⏳ Waiting for all ${contractBatches.length} batches to complete...`);
    const allBatchResults = await Promise.all(batchPromises);
    
    // Step 5: Combine all results
    allBatchResults.forEach(batchTrades => {
      allTrades.push(...batchTrades);
    });
    
    console.log(`🎯 BULK OPTIMIZATION COMPLETE: ${allTrades.length} trades from ${contracts.length} contracts for ${ticker}`);
    return allTrades;
  }
}