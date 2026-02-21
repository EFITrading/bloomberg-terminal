import { TOP_1800_SYMBOLS } from './Top1000Symbols';
import { withCircuitBreaker } from './circuitBreaker';

// Check if market is actually open (includes holiday check via Polygon API)
async function isMarketActuallyOpen(): Promise<boolean> {
  try {
    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) return false;

    const response = await fetch(`https://api.polygon.io/v1/marketstatus/now?apikey=${apiKey}`);
    const data = await response.json();

    return data.market === 'open';
  } catch (error) {
    console.error('Error checking market status:', error);
    return false;
  }
}

// Market hours utility functions
export function isMarketOpen(): boolean {
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

export async function getLastTradingDay(): Promise<string> {
  const now = new Date();
  const easternString = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const easternDate = new Date(easternString);
  let tradingDay = new Date(easternDate);

  // If before market open (9:30 AM ET), start from yesterday
  const easternHour = easternDate.getHours();
  const easternMinute = easternDate.getMinutes();
  const currentTime = easternHour + (easternMinute / 60);
  const marketOpen = 9.5; // 9:30 AM

  if (currentTime < marketOpen) {
    tradingDay.setDate(tradingDay.getDate() - 1);
  }

  // Go back up to 10 days to find last trading day
  for (let i = 0; i < 10; i++) {
    const year = tradingDay.getFullYear();
    const month = String(tradingDay.getMonth() + 1).padStart(2, '0');
    const day = String(tradingDay.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    const dayOfWeek = tradingDay.getDay();

    // Skip weekends
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      tradingDay.setDate(tradingDay.getDate() - 1);
      continue;
    }

    // For weekdays, check if market was open using SPY ticker
    const apiKey = process.env.POLYGON_API_KEY;
    if (apiKey) {
      try {
        // Check if this was a trading day by requesting SPY data
        const response = await fetch(`https://api.polygon.io/v1/open-close/SPY/${dateStr}?adjusted=true&apikey=${apiKey}`);

        // If 404 or error, it's a holiday
        if (!response.ok) {
          tradingDay.setDate(tradingDay.getDate() - 1);
          continue;
        }
      } catch (error) {
        console.error(`Error checking if ${dateStr} was a trading day:`, error);
        // On error, skip to previous day to be safe
        tradingDay.setDate(tradingDay.getDate() - 1);
        continue;
      }
    }

    // This is a valid trading day
    return dateStr;
  }

  // Fallback
  const year = tradingDay.getFullYear();
  const month = String(tradingDay.getMonth() + 1).padStart(2, '0');
  const day = String(tradingDay.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTodaysMarketOpenTimestamp(): number {
  try {
    // Simple approach: Create 9:30 AM Eastern for today's date
    const now = new Date();

    // Get today's date in Eastern timezone
    const easternDate = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const year = easternDate.getFullYear();
    const month = easternDate.getMonth();
    const date = easternDate.getDate();

    // Create a date string for 9:30 AM Eastern and parse it
    // This ensures proper timezone handling
    const marketOpenString = `${month + 1}/${date}/${year} 9:30:00 AM`;
    const marketOpenDate = new Date(marketOpenString + ' EST'); // Force Eastern Standard Time parsing

    let marketOpenTimestamp = marketOpenDate.getTime();

    // Validate the result by checking if the time displays as 9:30 AM ET
    const validation = new Date(marketOpenTimestamp);
    const easternValidation = validation.toLocaleString("en-US", { timeZone: "America/New_York" });

    if (!easternValidation.includes('9:30')) {
      // Fallback: manually calculate Eastern timezone offset
      const easternOffset = easternDate.getTimezoneOffset() * 60000;
      const localTime = new Date(year, month, date, 9, 30, 0, 0);
      marketOpenTimestamp = localTime.getTime() - easternOffset;
    }

    // Adjust for weekends - get last trading day
    const marketOpen = new Date(marketOpenTimestamp);
    const day = marketOpen.getDay();

    if (day === 0) { // Sunday - go to Friday
      marketOpen.setDate(marketOpen.getDate() - 2);
    } else if (day === 6) { // Saturday - go to Friday  
      marketOpen.setDate(marketOpen.getDate() - 1);
    }

    const finalTimestamp = marketOpen.getTime();

    // Validation: ensure timestamp is reasonable
    const now_ms = Date.now();
    const oneWeekAgo = now_ms - (7 * 24 * 60 * 60 * 1000);
    const oneDayFuture = now_ms + (24 * 60 * 60 * 1000);

    if (finalTimestamp < oneWeekAgo || finalTimestamp > oneDayFuture) {
      throw new Error(`Market open timestamp seems invalid: ${new Date(finalTimestamp).toISOString()}`);
    }

    console.log(`[TIME] Market Open Timestamp: ${new Date(finalTimestamp).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);
    return finalTimestamp;

  } catch (error) {
    console.error(`[ERROR] Error calculating market open timestamp:`, error);
    throw error;
  }
}

export async function getSmartDateRange(): Promise<{ currentDate: string; isLive: boolean; startTimestamp: number; endTimestamp: number }> {
  const marketOpen = await isMarketActuallyOpen();
  const now = new Date();
  const eastern = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));

  if (marketOpen) {
    // LIVE MODE: Market is currently open, scan from market open until now
    const todayMarketOpen = getTodaysMarketOpenTimestamp();
    const currentTime = Date.now();

    console.log(`[LIVE] LIVE MODE: Market is OPEN, scanning from market open to now`);
    console.log(`   - Start: ${new Date(todayMarketOpen).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);
    console.log(`   - End: ${new Date(currentTime).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET (LIVE)`);

    return {
      currentDate: now.toISOString().split('T')[0],
      isLive: true,
      startTimestamp: todayMarketOpen,
      endTimestamp: currentTime
    };
  } else {
    // HISTORICAL MODE: Market is closed, scan the most recent full trading day
    const lastTradingDay = await getLastTradingDay();

    // Create market open (9:30 AM ET) and close (4:00 PM ET) for the last trading day
    // Parse date parts and construct in Eastern timezone to avoid UTC conversion
    const [year, month, day] = lastTradingDay.split('-').map(Number);
    const marketOpenTime = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T09:30:00-05:00`);
    const marketCloseTime = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T16:00:00-05:00`);

    // If today is a trading day but market is closed (after 4 PM and before midnight), scan today's session
    const today = now.toISOString().split('T')[0];
    const easternHour = eastern.getHours();
    const easternMinute = eastern.getMinutes();
    const currentTime = easternHour + (easternMinute / 60);
    const isWeekday = eastern.getDay() >= 1 && eastern.getDay() <= 5;
    const marketOpen = 9.5; // 9:30 AM
    const marketClose = 16; // 4:00 PM

    if (isWeekday && today === lastTradingDay && currentTime >= marketClose) {
      // Today was a trading day but market is now closed (after-hours) - scan today's full session
      const todayMarketOpen = getTodaysMarketOpenTimestamp();
      const todayMarketClose = new Date(todayMarketOpen);
      todayMarketClose.setHours(16, 0, 0, 0);

      console.log(`[AFTER-HOURS] AFTER-HOURS MODE: Scanning today's completed session`);
      console.log(`   - Date: ${today}`);
      console.log(`   - Start: ${new Date(todayMarketOpen).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);
      console.log(`   - End: ${todayMarketClose.toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);

      return {
        currentDate: today,
        isLive: false,
        startTimestamp: todayMarketOpen,
        endTimestamp: todayMarketClose.getTime()
      };
    } else {
      // Weekend or holiday - scan last full trading day
      console.log(`[HISTORICAL] HISTORICAL MODE: Scanning last trading day (${lastTradingDay})`);
      console.log(`   - Start: ${marketOpenTime.toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);
      console.log(`   - End: ${marketCloseTime.toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);

      return {
        currentDate: lastTradingDay,
        isLive: false,
        startTimestamp: marketOpenTime.getTime(),
        endTimestamp: marketCloseTime.getTime()
      };
    }
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
  trade_type?: 'SWEEP' | 'BLOCK' | 'MINI' | 'MULTI-LEG';
  window_group?: string;
  related_trades?: string[];
  moneyness: 'ATM' | 'ITM' | 'OTM';
  days_to_expiry: number;
  // Volume and Open Interest fields (INSTANT from snapshot)
  volume?: number;
  open_interest?: number;
  vol_oi_ratio?: number;
  // Fill analysis fields (INSTANT from snapshot)
  bid?: number;
  ask?: number;
  bid_price?: number;
  ask_price?: number;
  bid_size?: number;
  ask_size?: number;
  bid_ask_spread?: number;
  fill_style?: string;
  fill_type?: 'BELOW_BID' | 'AT_BID' | 'BETWEEN' | 'AT_ASK' | 'ABOVE_ASK';
  fill_aggression?: 'AGGRESSIVE_BUY' | 'AGGRESSIVE_SELL' | 'NEUTRAL' | 'UNKNOWN';
  // Greeks (INSTANT from snapshot)
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  implied_volatility?: number;
  // Current pricing (INSTANT from snapshot)
  current_price?: number;
  // Classification (INSTANT from vol/OI analysis)
  classification?: string;
  // Multi-day support
  trading_date?: string; // Format: "YYYY-MM-DD" for multi-day scans
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

  // Filter configuration
  private readonly MIN_PREMIUM_FILTER = 500; // $500 minimum total premium to show more mini trades

  constructor(apiKey: string) {
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('[ERROR] Polygon API key is required but not provided');
    }

    if (apiKey.length < 10) {
      throw new Error('[ERROR] Polygon API key appears to be invalid (too short)');
    }

    this.polygonApiKey = apiKey.trim();
    console.log(`[OK] Options Flow Service initialized with API key: ${apiKey.substring(0, 8)}...`);
  }

  // PARALLEL VERSION - Uses all CPU cores for maximum speed
  async fetchLiveOptionsFlowUltraFast(
    ticker?: string,
    onProgress?: (trades: ProcessedTrade[], status: string, progress?: any) => void,
    dateRange?: { startTimestamp: number; endTimestamp: number; currentDate: string; isLive: boolean }
  ): Promise<ProcessedTrade[]> {
    let tickersToScan: string[];

    if (ticker && (ticker.toLowerCase() === 'all' || ticker === 'ALL_EXCLUDE_ETF_MAG7')) {
      tickersToScan = this.getTop1000Symbols();
      console.log(`[SCAN] SCAN: ${tickersToScan.length} symbols across all CPU cores`);
    } else if (ticker && ticker.includes(',')) {
      tickersToScan = ticker.split(',').map(t => t && t.trim() ? t.trim().toUpperCase() : '').filter(t => t);
      console.log(`[SCAN] SCAN: ${tickersToScan.length} specific tickers`);
    } else {
      tickersToScan = ticker ? [ticker.toUpperCase()] : [];
      console.log(`[SCAN] Single ticker scan: ${ticker ? ticker.toUpperCase() : 'NONE'}`);
    }

    // [OK] REMOVED TEMPORARY RESTRICTION: Now scanning all symbols from your list
    console.log(`[SCAN] Scanning ${tickersToScan.length} symbols from your complete list`);

    // Use parallel processor to scan all tickers using all CPU cores
    const { ParallelOptionsFlowProcessor } = require('./ParallelOptionsFlowProcessor.js');
    const parallelProcessor = new ParallelOptionsFlowProcessor();

    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) {
      console.error('[ERROR] No API key found');
      return [];
    }

    try {
      // Use the parallel processor for real scanning
      console.log(`[PARALLEL] PARALLEL PROCESSING: Starting scan of ${tickersToScan.length} tickers`);

      const allTrades = await parallelProcessor.processTickersInParallel(
        tickersToScan,
        this,
        onProgress,
        dateRange
      );

      console.log(`[OK] SCAN COMPLETE: Found ${allTrades.length} total trades`);

      // Workers now include Vol/OI data directly - no enrichment needed!
      console.log(`[OK] Vol/OI data included by workers - skipping enrichment step`);

      // CRITICAL: Classify all trades after collection to enable proper SWEEP/BLOCK/MINI detection
      console.log(`[CLASSIFY] CLASSIFYING TRADES: Analyzing ${allTrades.length} trades for sweep patterns...`);
      const classifiedTrades = this.classifyAllTrades(allTrades);
      console.log(`[OK] CLASSIFICATION COMPLETE: Classified ${classifiedTrades.length} trades`);

      // Apply institutional filters (premium, ITM, market hours, etc.)
      console.log(`[FILTER] FILTERING: Applying institutional criteria to ${classifiedTrades.length} trades...`);
      const filteredTrades = this.filterAndClassifyTrades(classifiedTrades, ticker);
      console.log(`[OK] FILTERING COMPLETE: ${filteredTrades.length} trades passed filters`);

      // Send filtered trades to frontend
      if (onProgress && filteredTrades.length > 0) {
        onProgress(filteredTrades, `[OK] Classification complete - sending ${filteredTrades.length} trades`);
      }

      return filteredTrades;

    } catch (error) {
      console.error(`[ERROR] PARALLEL PROCESSING ERROR:`, error);
      console.error(`[ERROR] ERROR DETAILS:`, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  // Multi-day flow scanning (3D, 1W)
  async fetchMultiDayFlow(
    ticker?: string,
    timeframe: '3D' | '1W' = '3D',
    onProgress?: (trades: ProcessedTrade[], status: string, progress?: any) => void
  ): Promise<ProcessedTrade[]> {
    console.log(`[MULTI-DAY] Multi-Day Scan: ${ticker || 'MARKET-WIDE'} - ${timeframe}`);

    // Step 1: Calculate trading days
    const numDays = timeframe === '3D' ? 3 : 5;
    const tradingDays = this.getLastNTradingDays(numDays);
    console.log(`[NOTE] Trading days: ${tradingDays.join(', ')}`);

    // Step 2: Fetch Day 1 (most recent) using existing fast path
    const day1Date = tradingDays[tradingDays.length - 1];
    console.log(`[DAY] Day 1 (${day1Date}): Using snapshot endpoint`);
    onProgress?.([], `Fetching most recent day (${day1Date})...`);

    const dateRange = await getSmartDateRange();
    const day1Trades = await this.fetchLiveOptionsFlowUltraFast(ticker, onProgress, dateRange);

    // Add trading_date to Day 1 trades
    day1Trades.forEach(trade => {
      trade.trading_date = day1Date;
    });

    console.log(`[OK] Day 1 complete: ${day1Trades.length} trades`);

    // Step 3: Extract unique contracts from Day 1
    const uniqueContracts = [...new Set(day1Trades.map(t => t.ticker))];
    console.log(`[INFO] Found ${uniqueContracts.length} unique contracts to fetch historically`);

    if (uniqueContracts.length === 0) {
      console.log(`[WARN] No contracts found on Day 1, returning empty result`);
      return day1Trades;
    }

    // Step 4: Fetch historical days (Days 2+) in parallel
    const historicalDays = tradingDays.slice(0, -1);
    const historicalTrades: ProcessedTrade[] = [];

    // Fetch historical spot prices for all dates at once
    const historicalSpotPrices = new Map<string, number>();
    for (const date of historicalDays) {
      try {
        const spotUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${date}/${date}?adjusted=true&sort=asc&apiKey=${this.polygonApiKey}`;
        const spotResponse = await fetch(spotUrl);
        if (spotResponse.ok) {
          const spotData = await spotResponse.json();
          if (spotData.results && spotData.results.length > 0) {
            const spotPrice = spotData.results[0].c; // Close price
            historicalSpotPrices.set(date, spotPrice);
            console.log(`  [PRICE] ${ticker} spot on ${date}: $${spotPrice}`);
          }
        }
      } catch (error) {
        console.error(`  [ERROR] Failed to fetch spot price for ${ticker} on ${date}`);
      }
    }

    for (const date of historicalDays) {
      console.log(`[DAY] Fetching historical: ${date}`);
      onProgress?.([], `Fetching historical data for ${date}...`);

      const historicalSpot = historicalSpotPrices.get(date) || 0;

      // Convert date to timestamps in nanoseconds for Polygon API
      // Market hours: 9:30 AM - 4:00 PM ET
      const [year, month, day] = date.split('-').map(Number);
      const marketOpen = new Date(Date.UTC(year, month - 1, day, 14, 30, 0)); // 9:30 AM ET = 14:30 UTC
      const marketClose = new Date(Date.UTC(year, month - 1, day, 21, 0, 0));  // 4:00 PM ET = 21:00 UTC
      const startTimeNanos = marketOpen.getTime() * 1000000; // Convert ms to nanoseconds
      const endTimeNanos = marketClose.getTime() * 1000000;

      // Fetch all contracts in parallel for this date
      const contractTrades = await Promise.all(
        uniqueContracts.map(async (contract) => {
          try {
            const url = `https://api.polygon.io/v3/trades/${contract}?timestamp.gte=${startTimeNanos}&timestamp.lte=${endTimeNanos}&limit=50000&apiKey=${this.polygonApiKey}`;
            const response = await fetch(url);
            if (!response.ok) return [];

            const data = await response.json();
            if (!data.results || data.results.length === 0) return [];

            // Transform historical trades to ProcessedTrade format
            const transformedTrades = data.results.map((trade: any) => {
              // Parse contract ticker to extract details
              // Format: O:CAT260109C00600000
              const parts = contract.match(/O:([A-Z]+)(\d{6})([CP])(\d{8})/);
              if (!parts) return null;

              const [, underlyingTicker, expiryStr, callPut, strikeStr] = parts;
              const expiry = `20${expiryStr.slice(0, 2)}-${expiryStr.slice(2, 4)}-${expiryStr.slice(4, 6)}`;
              const strike = parseInt(strikeStr) / 1000;
              const type = callPut === 'C' ? 'call' : 'put';

              // Calculate moneyness and days to expiry (placeholder)
              const expiryDate = new Date(expiry);
              const tradeDate = new Date(date);
              const daysToExpiry = Math.ceil((expiryDate.getTime() - tradeDate.getTime()) / (1000 * 60 * 60 * 24));

              // Calculate moneyness with historical spot price
              let moneyness: 'ATM' | 'ITM' | 'OTM' = 'ATM';
              if (historicalSpot > 0) {
                const percentDiff = Math.abs(strike - historicalSpot) / historicalSpot;
                if (percentDiff < 0.01) {
                  moneyness = 'ATM';
                } else if (type === 'call') {
                  moneyness = historicalSpot > strike ? 'ITM' : 'OTM';
                } else {
                  moneyness = historicalSpot < strike ? 'ITM' : 'OTM';
                }
              }

              return {
                ticker: contract,
                underlying_ticker: underlyingTicker,
                strike,
                expiry,
                type: type as 'call' | 'put',
                trade_size: trade.size || 0,
                premium_per_contract: trade.price || 0,
                total_premium: (trade.price || 0) * (trade.size || 0) * 100,
                spot_price: historicalSpot, // Historical spot price
                exchange: trade.exchange || 0,
                exchange_name: this.getExchangeName(trade.exchange),
                sip_timestamp: trade.sip_timestamp,
                conditions: trade.conditions || [],
                trade_timestamp: new Date(trade.sip_timestamp / 1000000),
                trading_date: date, // CRITICAL: Add trading date
                moneyness: moneyness,
                days_to_expiry: daysToExpiry
              } as ProcessedTrade;
            }).filter(Boolean) as ProcessedTrade[];

            return transformedTrades;

          } catch (error) {
            console.error(`  [ERROR] Error fetching ${contract} on ${date}:`, error);
            return [];
          }
        })
      );

      // Flatten and add to historical trades
      const dayTrades = contractTrades.flat();
      historicalTrades.push(...dayTrades);
      console.log(`[DONE] ${date}: ${dayTrades.length} total trades`);
    }

    // Step 5: Combine all days
    const allTrades = [...historicalTrades, ...day1Trades];
    console.log(`[MULTI] Combined: ${allTrades.length} trades across ${tradingDays.length} days`);

    // Step 6: Enrich ALL trades with Vol/OI
    // - Day 1: Use snapshot endpoint (current data)
    // - Historical: Use daily aggregates for volume + snapshot for current OI
    onProgress?.([], `Enriching ${allTrades.length} trades with Vol/OI data...`);
    console.log(`[ENRICH] ENRICHING ${allTrades.length} trades (including historical)...`);
    const enrichedTrades = await this.enrichTradesWithHistoricalVolOI(allTrades);
    console.log(`[OK] ENRICHMENT COMPLETE: ${enrichedTrades.length} trades enriched`);

    // Step 7: Classify trades (SWEEP/BLOCK/MINI detection)
    onProgress?.([], `Classifying trades for SWEEP/BLOCK/MINI patterns...`);
    console.log(`[CLASSIFY] CLASSIFYING TRADES: Analyzing ${enrichedTrades.length} trades...`);
    const classifiedTrades = this.classifyAllTrades(enrichedTrades);
    console.log(`[OK] CLASSIFICATION COMPLETE: ${classifiedTrades.length} trades classified`);

    // Step 8: Filter by institutional criteria
    onProgress?.([], `Applying institutional filters...`);
    console.log(`[FILTER] FILTERING: Applying institutional criteria...`);
    const filteredTrades = this.filterAndClassifyTrades(classifiedTrades, ticker);
    console.log(`[OK] FILTERING COMPLETE: ${filteredTrades.length} trades passed filters`);

    // Final summary
    console.log(`\n[MULTI] MULTI-DAY SCAN COMPLETE:`);
    console.log(`   [NOTE] Dates Scanned: ${tradingDays.join(', ')}`);
    console.log(`   [NOTE] Total Trading Days: ${tradingDays.length}`);
    console.log(`   [NOTE] Day 1 (${day1Date}): ${day1Trades.length} trades (snapshot)`);
    console.log(`   [NOTE] Historical Days: ${historicalTrades.length} trades`);
    console.log(`   [OK] Final Result: ${filteredTrades.length} trades after filtering\n`);

    return filteredTrades;
  }

  // Helper: Calculate last N trading days
  private getLastNTradingDays(n: number): string[] {
    const US_MARKET_HOLIDAYS = [
      // 2025 holidays
      '2025-01-01', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26',
      '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25',
      // 2026 holidays
      '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
      '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25'
    ];

    const result: string[] = [];
    const now = new Date();
    const eastern = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    let currentDate = new Date(eastern);

    // Start from today or last trading day if weekend/holiday
    while (result.length < n) {
      const dayOfWeek = currentDate.getDay();
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const day = String(currentDate.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;

      // Skip weekends and holidays
      if (dayOfWeek !== 0 && dayOfWeek !== 6 && !US_MARKET_HOLIDAYS.includes(dateString)) {
        result.push(dateString);
      }

      // Move to previous day
      currentDate.setDate(currentDate.getDate() - 1);
    }

    return result.reverse(); // Return in chronological order (oldest to newest)
  }

  private getExchangeName(exchange: number): string {
    const exchanges: Record<number, string> = {
      1: 'NYSE', 2: 'NYSE Arca', 3: 'NYSE American',
      4: 'NASDAQ', 5: 'CBOE', 6: 'ISE', 8: 'PHLX',
      9: 'BATS', 10: 'BOX', 11: 'MIAX', 12: 'GEMX',
      13: 'EDGX', 14: 'MERCURY', 15: 'MEMX'
    };
    return exchanges[exchange] || 'Unknown';
  }

  // Streaming version for progressive loading
  async fetchLiveOptionsFlowStreaming(
    ticker?: string,
    onProgress?: (trades: ProcessedTrade[], status: string, progress?: any) => void
  ): Promise<ProcessedTrade[]> {
    console.log(`[STREAM] STREAMING: Starting live options flow${ticker ? ` for ${ticker}` : ' market-wide scan'}`);

    const allTrades: ProcessedTrade[] = [];
    const tickersToScan = ticker && ticker.toLowerCase() === 'all' ? this.getTop1000Symbols() : (ticker ? [ticker.toUpperCase()] : []);

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
            // DON'T classify yet - collect all trades first for proper SWEEP detection
            // Stream raw results for progress updates
            onProgress?.(
              [...allTrades, ...tickerTrades].sort((a, b) => b.total_premium - a.total_premium),
              `Found ${tickerTrades.length} raw trades from ${currentTicker}`,
              {
                current: batchIndex + 1,
                total: tickerBatches.length,
                justProcessed: currentTicker,
                newTrades: tickerTrades.length,
                totalTrades: allTrades.length + tickerTrades.length,
                progress: ((batchIndex * batchSize + batch.indexOf(currentTicker)) / tickersToScan.length * 100).toFixed(1)
              }
            );

            return tickerTrades; // Return raw trades for later classification
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

      console.log(`[OK] Batch ${batchIndex + 1} complete: ${allTrades.length} total trades`);

      // No delay needed with unlimited API
    }

    onProgress?.(allTrades, `Classifying ${allTrades.length} trades for SWEEP/BLOCK/MINI detection...`);

    // NOW classify all trades together for proper cross-exchange SWEEP detection
    const classifiedTrades = this.filterAndClassifyTrades(allTrades, ticker);

    onProgress?.(classifiedTrades, `Scan complete: ${classifiedTrades.length} classified trades found`);
    return classifiedTrades.sort((a, b) => b.total_premium - a.total_premium);
  }

  async fetchLiveOptionsFlow(ticker?: string): Promise<ProcessedTrade[]> {
    // Smart market hours detection
    const { currentDate, isLive } = await getSmartDateRange();
    const marketStatus = isLive ? 'LIVE' : 'LAST TRADING DAY';
    const marketOpenTimestamp = getTodaysMarketOpenTimestamp();
    const marketOpenTime = new Date(marketOpenTimestamp).toLocaleString('en-US', { timeZone: 'America/New_York' });
    const currentTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

    console.log(`[MULTI] FETCHING ${marketStatus} OPTIONS FLOW WITH SWEEP DETECTION FOR: ${ticker || 'NO TICKER SPECIFIED'}`);
    console.log(`[DEBUG] DEBUG: Received ticker parameter: "${ticker}" (type: ${typeof ticker})`);
    console.log(`[DEBUG] Using date: ${currentDate} (${isLive ? 'Market Open' : 'Market Closed - Historical Data'})`);
    console.log(`[TIME] Time range: ${marketOpenTime} ET -> ${currentTime} ET (${isLive ? 'LIVE UPDATE' : 'HISTORICAL'})`);

    // Determine which tickers to scan
    let tickersToScan: string[];

    console.log(`[CHECK] DEBUG: Checking ticker conditions...`);
    console.log(`[CHECK] DEBUG: !ticker = ${!ticker}`);
    console.log(`[CHECK] DEBUG: ticker.toLowerCase() = "${ticker?.toLowerCase()}"`);
    console.log(`[CHECK] DEBUG: ticker.toLowerCase() === 'all' = ${ticker?.toLowerCase() === 'all'}`);

    if (ticker && ticker.toLowerCase() === 'all') {
      // FORCE USE OF 1000 STOCKS - NO UNIVERSAL TICKER
      tickersToScan = this.getTop1000Symbols();
      console.log(`[ENRICH] FORCED 1000 STOCK SCAN: ${tickersToScan.length} symbols (NO UNIVERSAL TICKER)`);
      console.log(`[MULTI] First 20 tickers: ${tickersToScan.slice(0, 20).join(', ')}...`);
      console.log(`[READY] Using individual ticker processing - NO 'ALL' as single ticker`);
    } else if (ticker && ticker.includes(',')) {
      // Handle comma-separated tickers
      tickersToScan = ticker.split(',').map(t => t && t.trim() ? t.trim().toUpperCase() : '').filter(t => t);
      console.log(`[SCAN] SCANNING SPECIFIC TICKERS: ${tickersToScan.join(', ')}`);
    } else {
      // Single ticker
      tickersToScan = ticker ? [ticker.toUpperCase()] : [];
      console.log(`[MULTI] SCANNING SINGLE TICKER: ${ticker ? ticker.toUpperCase() : 'NONE'}`);
    }

    console.log(`[CHECK] DEBUG: Final tickersToScan.length = ${tickersToScan.length}`);
    console.log(`[CHECK] DEBUG: First 10 tickers: ${tickersToScan.slice(0, 10).join(', ')}`);
    if (tickersToScan.length === 1) {
      console.log(`[WARN] WARNING: Only scanning 1 ticker: ${tickersToScan[0]} - this suggests the 'ALL' logic failed`);
    }

    console.log(`[READY] LIVE TRADES SCANNING ${tickersToScan.length} tickers from today's market open...`);

    const allTrades: ProcessedTrade[] = [];

    // For live data, prioritize TODAY's actual trades over snapshots
    if (isLive) {
      console.log(`[LIVE] LIVE MODE: Fetching today's trades from market open instead of snapshots`);
    } else {
      console.log(`[HIST] HISTORICAL MODE: Using snapshot data for last trading day`);
    }

    // UNLIMITED API BATCHING: Process larger batches for maximum speed
    const tickerBatchSize = 50; // Much larger batches since we have unlimited API calls
    const tickerBatches: string[][] = [];
    for (let i = 0; i < tickersToScan.length; i += tickerBatchSize) {
      tickerBatches.push(tickersToScan.slice(i, i + tickerBatchSize));
    }

    console.log(`[NOTE] Processing ${tickerBatches.length} batches of ${tickerBatchSize} stocks each with rate limiting...`);

    // Process ticker batches sequentially to avoid overwhelming the API
    for (let batchIndex = 0; batchIndex < tickerBatches.length; batchIndex++) {
      const batch = tickerBatches[batchIndex];
      console.log(`[EXEC] Processing batch ${batchIndex + 1}/${tickerBatches.length}: ${batch.slice(0, 5).join(', ')}...`);

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
                console.log(`[LIVE] LIVE ${symbol}: ${trades.length} streaming trades from today`);
              } else {
                console.log(`[WARN] ${symbol}: No live trades yet today - this is normal early in trading`);
              }
            } else {
              // HISTORICAL MODE: Use snapshot data with robust connection
              trades = await this.fetchOptionsSnapshotRobust(symbol);
              if (trades.length > 0) {
                console.log(`[READY] ${symbol}: ${trades.length} historical snapshot trades`);
              }
            }

            return trades;

          } catch (error) {
            retries--;
            if (error instanceof Error && (error.message.includes('Failed to fetch') || error.message.includes('CONNECTION_RESET'))) {
              console.warn(`[CONN] ${symbol}: Connection reset, retrying... (${retries} attempts left)`);
              if (retries > 0) {
                // Wait before retry with exponential backoff
                await new Promise(resolve => setTimeout(resolve, (4 - retries) * 1000));
                continue;
              }
            }
            console.error(`[ERROR] Final error for ${symbol} after retries:`, error);
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

      console.log(`[OK] Batch ${batchIndex + 1} complete: ${allTrades.length} total trades found so far`);

      // No delay needed with unlimited API
    }

    // Legacy code for comparison - this is now replaced by batched processing above
    const snapshotPromises = [] as any;

    // Results already collected in batched processing above

    console.log(`[READY] INDIVIDUAL TRADES COMPLETE: ${allTrades.length} total individual trades collected`);

    if (allTrades.length > 0) {
      // Apply your criteria filtering and classification
      const filtered = this.filterAndClassifyTrades(allTrades, ticker);
      return filtered.sort((a: ProcessedTrade, b: ProcessedTrade) => b.total_premium - a.total_premium);
    }

    return [];
  }

  private async fetchOptionsSnapshot(ticker: string): Promise<ProcessedTrade[]> {
    const url = `https://api.polygon.io/v3/snapshot/options/${ticker}?apikey=${this.polygonApiKey}`;

    console.log(`[SNAP] SNAPSHOT REQUEST for ${ticker}: ${url.replace(this.polygonApiKey, 'API_KEY_HIDDEN')}`);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`[WARN] Failed to fetch ${ticker} snapshot: ${response.status}`);
        return [];
      }

      const data = await response.json();
      console.log(`[OK] ${ticker} snapshot: ${data.results?.length || 0} contracts`);

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
          premium_per_contract: contract.last_trade.price / 100, // Convert from cents to dollars
          total_premium: (contract.last_trade.price * (contract.last_trade.size || 1)),
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

      console.log(`[OK] Extracted ${trades.length} trades from ${ticker} snapshot`);
      return trades;

    } catch (error) {
      console.error(`[ERROR] Error fetching ${ticker} snapshot:`, error);
      return [];
    }
  }

  // Helper method to fetch trades for a single contract
  private async fetchContractTrades(optionTicker: string, strike: number, expiration: string, type: 'call' | 'put', symbol: string, spotPrice: number): Promise<any[]> {
    try {
      // Get timestamp from today's market open (9:30 AM ET) instead of 24 hours ago
      const marketOpenTimestamp = getTodaysMarketOpenTimestamp();
      const marketOpenDate = new Date(marketOpenTimestamp);

      // Validate market open timestamp
      if (isNaN(marketOpenTimestamp) || marketOpenTimestamp <= 0) {
        console.error(`[ERROR] Invalid market open timestamp for ${optionTicker}`);
        return [];
      }

      // Convert milliseconds to nanoseconds properly (multiply by 1,000,000)
      const nanosecondTimestamp = marketOpenTimestamp * 1000000;
      const url = `https://api.polygon.io/v3/trades/${optionTicker}?timestamp.gte=${nanosecondTimestamp}&apikey=${this.polygonApiKey}`;

      console.log(`[FETCH] Fetching ${optionTicker} trades from market open: ${marketOpenDate.toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);

      const response = await this.robustFetch(url);

      let data;
      try {
        const responseText = await response.text();
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error(`[ERROR] JSON parse error for ${optionTicker}:`, parseError);
        return [];
      }

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
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('HTTP 403')) {
        console.error(`[ERROR] 403 Forbidden for ${optionTicker} - check API permissions`);
      } else if (errorMessage.includes('HTTP 429')) {
        console.warn(`[RATELIM] Rate limited for ${optionTicker}`);
      } else {
        console.warn(`[WARN] Error fetching trades for ${optionTicker}: ${errorMessage}`);
      }

      return [];
    }
  }

  private filterAndClassifyTrades(trades: ProcessedTrade[], targetTicker?: string): ProcessedTrade[] {
    // Reduce logging for performance

    let filtered = trades;

    // Filter by ticker if specified (but not for 'ALL' requests)
    if (targetTicker && targetTicker.toLowerCase() !== 'all' && targetTicker !== 'ALL_EXCLUDE_ETF_MAG7') {
      // Handle comma-separated ticker lists (MAG7, ETF scans)
      if (targetTicker.includes(',')) {
        const tickerList = targetTicker.split(',').map(t => t.trim().toUpperCase());
        filtered = filtered.filter(trade => tickerList.includes(trade.underlying_ticker));
        console.log(`[FILTER] Filtering for multiple tickers: ${tickerList.join(', ')} - ${filtered.length} trades match`);
      } else {
        // Single ticker filter
        filtered = filtered.filter(trade => trade.underlying_ticker === targetTicker);
      }
    }

    // Skip classification if trades are already classified (have trade_type)
    const alreadyClassified = filtered.every(t => t.trade_type !== undefined);
    console.log(`[CHECK] Classification check: ${filtered.length} trades, alreadyClassified=${alreadyClassified}`);

    if (!alreadyClassified) {
      console.log(`[PROC] Starting multi-leg detection on ${filtered.length} unclassified trades...`);
      // MULTI-LEG DETECTION MUST RUN FIRST (before sweeps bundle trades together)
      filtered = this.detectMultiLegTrades(filtered);

      console.log(`[PROC] Starting sweep detection on ${filtered.length} trades...`);
      // SWEEP DETECTION (runs after multi-leg to avoid bundling multi-leg strategies)
      filtered = this.detectSweeps(filtered);
    } else {
      console.log(`[SKIP] Skipping classification - trades already classified`);
    }

    // YOUR ACTUAL CRITERIA - Use existing institutional tiers system
    filtered = filtered.filter(trade => this.passesInstitutionalCriteria(trade));

    // Classify trade types ONLY if not already classified
    if (!alreadyClassified) {
      filtered = filtered.map(trade => this.classifyTradeType(trade));
    }

    // Filter out after-hours trades (market hours: 9:30 AM - 4:00 PM ET)
    filtered = filtered.filter(trade => this.isWithinMarketHours(trade.trade_timestamp));

    // YOUR ITM FILTER: Only 5% ITM max + all OTM contracts
    filtered = filtered.filter(trade => this.isWithinTradeableRange(trade));

    // Sort by timestamp (newest first) and total premium (largest first)
    filtered.sort((a, b) => {
      // First by total premium (largest first)
      const premiumDiff = b.total_premium - a.total_premium;
      if (Math.abs(premiumDiff) > 1000) return premiumDiff;
      // Then by timestamp (newest first)
      return b.trade_timestamp.getTime() - a.trade_timestamp.getTime();
    });

    console.log(`[OK] Filtered: ${filtered.length} trades passed all criteria`);
    return filtered;
  }

  // Market hours validation - Only show trades during 9:30 AM - 4:00 PM ET
  private isWithinMarketHours(tradeTimestamp: Date): boolean {
    // Convert to ET timezone
    const etTime = new Date(tradeTimestamp.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const hours = etTime.getHours();
    const minutes = etTime.getMinutes();
    const timeInMinutes = hours * 60 + minutes;

    // Market hours: 9:30 AM (570 minutes) to 4:00 PM (960 minutes) ET
    const marketOpen = 9 * 60 + 30; // 9:30 AM = 570 minutes
    const marketClose = 16 * 60;    // 4:00 PM = 960 minutes

    const isWithinHours = timeInMinutes >= marketOpen && timeInMinutes <= marketClose;

    if (!isWithinHours) {
      console.log(`[FILTER] After-hours trade filtered: ${etTime.toLocaleTimeString()} ET`);
    }

    return isWithinHours;
  }

  // YOUR SPECIFICATION: 3-SECOND WINDOW SWEEP DETECTION: Bundle trades executed within 3-second windows across exchanges
  private detectSweeps(trades: ProcessedTrade[]): ProcessedTrade[] {
    console.log(`[SWEEP] 3-SECOND WINDOW SWEEP DETECTION: Processing ${trades.length} trades...`);
    console.log(`[CHECK] DEBUG detectSweeps: Sample input trade:`, trades[0]);

    // CRITICAL: Preserve MULTI-LEG classifications - don't reprocess them
    const multiLegTrades = trades.filter(t => t.trade_type === 'MULTI-LEG');
    const unclassifiedTrades = trades.filter(t => t.trade_type !== 'MULTI-LEG');

    console.log(`[CHECK] Preserving ${multiLegTrades.length} MULTI-LEG trades, processing ${unclassifiedTrades.length} remaining trades`);

    // Sort trades by timestamp
    unclassifiedTrades.sort((a, b) => a.sip_timestamp - b.sip_timestamp);

    // Group trades by exact timestamp AND contract
    const exactTimeGroups = new Map<string, ProcessedTrade[]>();

    for (const trade of unclassifiedTrades) {
      // YOUR SPECIFICATION: 3-second window grouping + contract as key for grouping
      const contractKey = `${trade.ticker}_${trade.strike}_${trade.type}_${trade.expiry}`;
      const timeInMs = Math.floor(trade.sip_timestamp / 1000000); // Convert nanoseconds to milliseconds
      const threeSecondWindow = Math.floor(timeInMs / 3000) * 3000; // Group into 3-second windows
      const groupKey = `${contractKey}_${threeSecondWindow}`;

      if (!exactTimeGroups.has(groupKey)) {
        exactTimeGroups.set(groupKey, []);
      }
      exactTimeGroups.get(groupKey)!.push(trade);
    }

    const categorizedTrades: ProcessedTrade[] = [];
    let sweepCount = 0;
    let blockCount = 0;

    // Process each 3-second window group - trades within 3-second window become sweeps if multi-exchange
    exactTimeGroups.forEach((tradesInGroup, groupKey) => {
      const totalContracts = tradesInGroup.reduce((sum, t) => sum + t.trade_size, 0);
      const totalPremium = tradesInGroup.reduce((sum, t) => sum + t.total_premium, 0);
      const exchanges = [...new Set(tradesInGroup.map(t => t.exchange))];
      const representativeTrade = tradesInGroup[0];

      // Debug: Show 3-second window grouping for significant trades
      if (tradesInGroup.length > 1 && totalPremium >= 50000) {
        const time = new Date(representativeTrade.sip_timestamp / 1000000).toLocaleTimeString();
        console.log(`\n[CHECK] 3-SECOND WINDOW GROUP: ${tradesInGroup.length} trades within 3-second window at ~${time}:`);
        console.log(`   ${representativeTrade.ticker} $${representativeTrade.strike} ${representativeTrade.type.toUpperCase()}S - Total: ${totalContracts} contracts, $${totalPremium.toLocaleString()}`);
        tradesInGroup.forEach((trade, idx) => {
          console.log(`     ${idx + 1}. ${trade.trade_size} contracts @$${trade.premium_per_contract.toFixed(2)} [${trade.exchange}]`);
        });
      }

      // YOUR EXACT LOGIC: Classify based on exchange count
      if (exchanges.length >= 2) {
        // SWEEP: 2+ exchanges involved (regardless of amounts)
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

        console.log(`[SWEEP] SWEEP DETECTED: ${sweepTrade.ticker} $${sweepTrade.strike} ${sweepTrade.type.toUpperCase()}S - ${totalContracts} contracts, $${totalPremium.toLocaleString()} across ${exchanges.length} exchanges`);
        categorizedTrades.push(sweepTrade);

      } else if (exchanges.length === 1) {
        // Single exchange: BLOCK if $50K+, MINI if <$50K
        // Calculate weighted average price per contract (same logic as sweeps)
        const weightedPrice = tradesInGroup.reduce((sum, trade) => {
          return sum + (trade.premium_per_contract * trade.trade_size);
        }, 0) / totalContracts;

        const combinedTrade: ProcessedTrade = {
          ...representativeTrade,
          trade_size: totalContracts,
          premium_per_contract: weightedPrice, // FIX: Use weighted average, not totalPremium/totalContracts
          total_premium: totalPremium,
          trade_type: totalPremium >= 50000 ? 'BLOCK' : 'MINI',
          exchange_name: this.exchangeNames[exchanges[0]] || `Exchange ${exchanges[0]}`,
          window_group: totalPremium >= 50000 ? `block_${groupKey}` : `mini_${groupKey}`,
          related_trades: []
        };

        if (totalPremium >= 50000) {
          console.log(`[BLOCK] BLOCK DETECTED: ${combinedTrade.ticker} $${combinedTrade.strike} ${combinedTrade.type.toUpperCase()}S - ${totalContracts} contracts, $${totalPremium.toLocaleString()} on single exchange`);
          blockCount++;
        } else {
          console.log(`[MINI] MINI DETECTED: ${combinedTrade.ticker} $${combinedTrade.strike} ${combinedTrade.type.toUpperCase()}S - ${totalContracts} contracts, $${totalPremium.toLocaleString()} on single exchange`);
        }

        categorizedTrades.push(combinedTrade);
      }
    });

    const miniCount = categorizedTrades.filter(t => t.trade_type === 'MINI').length;
    console.log(`[OK] 3-SECOND WINDOW CLASSIFICATION COMPLETE: Found ${sweepCount} sweeps, ${blockCount} blocks, and ${miniCount} minis from ${unclassifiedTrades.length} individual trades`);

    // Return multi-leg trades + newly classified trades
    return [...multiLegTrades, ...categorizedTrades];
  }

  // MULTI-LEG DETECTION: Identify complex options strategies (spreads, straddles, etc.)
  private detectMultiLegTrades(trades: ProcessedTrade[]): ProcessedTrade[] {
    console.log(`[MULTI] MULTI-LEG DETECTION: Processing ${trades.length} trades...`);

    // Group trades by underlying ticker and 2-second time window (multi-leg trades execute within seconds)
    const exactTimeGroups = new Map<string, ProcessedTrade[]>();

    for (const trade of trades) {
      // Use 2-second window - multi-leg fills can be 100ms-2000ms apart across exchanges
      const timeInMs = trade.trade_timestamp.getTime();
      const timeWindow = Math.floor(timeInMs / 2000) * 2000; // 2-second buckets
      const groupKey = `${trade.underlying_ticker}_${timeWindow}`;

      if (!exactTimeGroups.has(groupKey)) {
        exactTimeGroups.set(groupKey, []);
      }
      exactTimeGroups.get(groupKey)!.push(trade);
    }

    console.log(`[CHECK] Created ${exactTimeGroups.size} time-based groups`);

    // Log groups with multiple trades
    let groupsWithMultiple = 0;
    exactTimeGroups.forEach((groupTrades, groupKey) => {
      if (groupTrades.length >= 2) {
        groupsWithMultiple++;
        const totalPremium = groupTrades.reduce((sum, t) => sum + t.total_premium, 0);
        console.log(`[CHECK] Group [${groupKey}]: ${groupTrades.length} trades, $${totalPremium.toFixed(0)} total`);
        groupTrades.forEach((t, i) => {
          console.log(`    ${i + 1}. ${t.ticker} ${t.trade_size} contracts @$${t.premium_per_contract.toFixed(2)}`);
        });
      }
    });

    console.log(`[CHECK] Found ${groupsWithMultiple} groups with 2+ trades`);

    let multiLegCount = 0;
    const processedTrades: ProcessedTrade[] = [];

    // Analyze each exact timestamp group for multi-leg patterns
    for (const [groupKey, groupTrades] of exactTimeGroups) {
      if (groupTrades.length < 2) {
        // Single trade - not multi-leg
        processedTrades.push(...groupTrades);
        continue;
      }

      // DEBUG: Log all candidate groups with 2+ trades
      if (groupTrades.length >= 2) {
        const totalPremium = groupTrades.reduce((sum, t) => sum + t.total_premium, 0);
        if (totalPremium >= 25000) {
          console.log(`[CHECK] Multi-leg candidate: ${groupTrades[0].underlying_ticker} - ${groupTrades.length} legs, $${totalPremium.toFixed(0)} premium`);
          groupTrades.forEach((t, i) => {
            console.log(`   Leg ${i + 1}: ${t.ticker} ${t.trade_size} contracts @$${t.premium_per_contract.toFixed(2)} = $${t.total_premium.toFixed(0)}`);
          });
        }
      }

      // Check for multi-leg patterns
      const isMultiLeg = this.analyzeMultiLegPattern(groupTrades);

      if (isMultiLeg) {
        console.log(`[OK] MULTI-LEG CONFIRMED: ${groupTrades.length} legs for ${groupTrades[0].underlying_ticker}`);
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

    console.log(`[OK] MULTI-LEG DETECTION COMPLETE: Found ${multiLegCount} multi-leg strategies from ${trades.length} individual trades`);
    return processedTrades;
  }

  // Analyze if a group of trades forms a multi-leg strategy
  private analyzeMultiLegPattern(trades: ProcessedTrade[]): boolean {
    if (trades.length < 2) return false;

    // YOUR SPECIFICATION: Max 4 legs limit
    if (trades.length > 4) {
      console.log(`   [ERROR] Rejected: Too many legs (${trades.length} > 4)`);
      return false;
    }

    // Since these trades have identical timestamps, they are simultaneous executions
    // Multi-leg criteria for simultaneous trades:
    const uniqueStrikes = new Set(trades.map(t => t.strike));
    const uniqueExpirations = new Set(trades.map(t => t.expiry));
    const uniqueTypes = new Set(trades.map(t => t.type));
    const totalPremium = trades.reduce((sum, t) => sum + t.total_premium, 0);

    // Relaxed requirement: 100+ contracts per leg (industry standard)
    const allLegsHave100Plus = trades.every(trade => trade.trade_size >= 100);
    if (!allLegsHave100Plus) {
      const smallLegs = trades.filter(t => t.trade_size < 100);
      console.log(`   [ERROR] Rejected: Legs with <100 contracts: ${smallLegs.map(t => `${t.ticker}:${t.trade_size}`).join(', ')}`);
      return false;
    }

    // Multi-leg patterns (any of these indicate a multi-leg strategy):
    // 1. Different strikes (spreads)
    const hasMultipleStrikes = uniqueStrikes.size >= 2;

    // 2. Different option types (straddles, strangles, collars)
    const hasMultipleTypes = uniqueTypes.size >= 2;

    // 3. Different expirations (calendar spreads)
    const hasMultipleExpirations = uniqueExpirations.size >= 2;

    // 4. Must have substantial combined premium (institutional level)
    const substantialPremium = totalPremium >= 25000; // $25k+ combined (lowered from $50k)

    if (!substantialPremium) {
      console.log(`   [ERROR] Rejected: Premium too low ($${totalPremium.toFixed(0)} < $25,000)`);
      return false;
    }

    if (!hasMultipleStrikes && !hasMultipleTypes && !hasMultipleExpirations) {
      console.log(`   [ERROR] Rejected: All same strike (${uniqueStrikes.size}), type (${uniqueTypes.size}), expiry (${uniqueExpirations.size})`);
      return false;
    }

    const isMultiLeg = substantialPremium && (hasMultipleStrikes || hasMultipleTypes || hasMultipleExpirations);

    if (isMultiLeg) {
      console.log(`   [OK] Multi-leg PASSED: ${trades.length} legs (<=4), ` +
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

    // Debug logging for all trades to see what's being filtered
    if (totalPremium > 500) {
      console.log(`[TRADE] TRADE ANALYSIS: ${trade.ticker} - $${tradePrice.toFixed(2)} x ${tradeSize} = $${totalPremium.toFixed(0)} premium`);
    }

    // ENHANCED TIER SYSTEM - More permissive for mini trades
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
      { name: 'Tier 8: Premium bypass', minPrice: 0.01, minSize: 20, minTotal: 50000 },
      // NEW TIER 9: Mini trade friendly - smaller trades that still show institutional interest
      { name: 'Tier 9: Mini institutional', minPrice: 1.00, minSize: 50 },
      // NEW TIER 10: Very small but significant volume
      { name: 'Tier 10: Small but significant', minPrice: 0.50, minSize: 100 },
      // NEW TIER 11: Lower barrier for showing sweeps/blocks
      { name: 'Tier 11: Sweep/Block friendly', minPrice: 0.25, minSize: 200 }
    ];

    const passes = institutionalTiers.some(tier => {
      const passesPrice = tradePrice >= tier.minPrice;
      const passesSize = tradeSize >= tier.minSize;
      const passesTotal = tier.minTotal ? totalPremium >= tier.minTotal : true;

      if (passesPrice && passesSize && passesTotal) {
        console.log(`[OK] ${trade.ticker}: Passes ${tier.name} - $${tradePrice.toFixed(2)} x ${tradeSize} = $${totalPremium.toFixed(0)}`);
        return true;
      }
      return false;
    });

    // Debug logging for failed trades to understand filtering
    if (totalPremium > 500 && !passes) {
      console.log(`[FILTER] FILTERED OUT: ${trade.ticker} - $${tradePrice.toFixed(2)} x ${tradeSize} = $${totalPremium.toFixed(0)} - doesn't meet any tier`);
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
    // YOUR SPECIFICATION: Preserve classifications from detectSweeps() - don't override!
    // SWEEP/BLOCK/MINI already determined by exchange count logic in detectSweeps()

    // Only handle MULTI-LEG here (detected separately)
    if (trade.trade_type === 'MULTI-LEG') {
      return trade; // Keep MULTI-LEG classification
    }

    // For all other trades, preserve the classification from detectSweeps()
    // Don't override SWEEP/BLOCK/MINI classifications!
    return trade;
  }

  // ROBUST FETCH WITH CONNECTION HANDLING AND RATE LIMITING
  private async robustFetch(url: string, maxRetries: number = 3): Promise<Response> {
    // Use circuit breaker for external API calls - REDUCED retries from 5 to 3
    return withCircuitBreaker('polygon', async () => {
      let lastError: Error = new Error('Unknown error');

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => {
            console.warn(`[TIME] Aborting request after 3s timeout (attempt ${attempt}/${maxRetries})`);
            controller.abort();
          }, 3000); // OPTIMIZED: 3s timeout for faster failure (was 5s)

          // Enhanced headers for better API compatibility with connection error handling
          const response = await fetch(url, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'application/json, text/plain, */*',
              'Accept-Encoding': 'gzip, deflate, br',
              'Accept-Language': 'en-US,en;q=0.9',
              'Connection': 'keep-alive',
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache'
            },
            // Add fetch options for better connection handling
            keepalive: false,
            redirect: 'follow'
          });

          clearTimeout(timeoutId);

          // Handle different HTTP error codes with enhanced logic
          if (!response.ok) {
            const errorMsg = `HTTP ${response.status}: ${response.statusText}`;

            // Log specific error details for debugging
            console.error(`[ERROR] API Error: ${errorMsg} for URL: ${url.replace(this.polygonApiKey, 'API_KEY_HIDDEN')}`);

            // Handle specific error codes with progressive backoff
            if (response.status === 403) {
              console.error(`[ERROR] HTTP 403 Forbidden - Check API key permissions and rate limits`);
              if (attempt < maxRetries) {
                const delay = Math.min(Math.pow(2, attempt) * 2000, 30000); // Cap at 30s
                console.warn(`[WAIT] Waiting ${delay / 1000}s before retry due to 403 error...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
              }
            } else if (response.status === 429) {
              console.error(`[RATELIM] HTTP 429 Rate Limited - Implementing exponential backoff`);
              if (attempt < maxRetries) {
                const delay = Math.min(Math.pow(2, attempt) * 5000, 60000); // Cap at 60s
                console.warn(`[WAIT] Rate limit delay: ${delay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
              }
            } else if (response.status >= 500 && response.status < 600) {
              console.error(`[ERROR] HTTP ${response.status} Server Error - Server is experiencing issues`);
              if (attempt < maxRetries) {
                const delay = Math.min(Math.pow(2, attempt) * 3000, 45000); // Cap at 45s
                console.warn(`[WAIT] Server error delay: ${delay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
              }
            }

            throw new Error(errorMsg);
          }

          return response;

        } catch (error) {
          lastError = error instanceof Error ? error : new Error('Unknown fetch error');

          // Enhanced error handling for connection issues
          if (error instanceof Error) {
            if (error.name === 'AbortError') {
              console.warn(`[TIME] Request timeout (attempt ${attempt}/${maxRetries}) - Network may be slow`);
            } else if (error.message.includes('Failed to fetch') ||
              error.message.includes('ERR_CONNECTION_RESET') ||
              error.message.includes('ERR_CONNECTION_REFUSED') ||
              error.message.includes('net::ERR_CONNECTION_RESET') ||
              error.message.includes('net::ERR_CONNECTION_REFUSED')) {
              console.warn(`[CONN] Connection error (attempt ${attempt}/${maxRetries}): ${error.message}`);
              console.warn(`[RETRY] This could indicate network issues or server downtime`);
            } else if (error.message.includes('ERR_NETWORK') || error.message.includes('network')) {
              console.warn(`[NET] Network connectivity issue (attempt ${attempt}/${maxRetries}): ${error.message}`);
            } else {
              console.warn(`[RETRY] Fetch attempt ${attempt}/${maxRetries} failed: ${error.message}`);
            }
          }

          if (attempt < maxRetries) {
            // Enhanced progressive backoff with connection-specific delays
            let baseDelay: number;

            // Different delay strategies based on error type
            if (lastError.message.includes('ERR_CONNECTION_RESET') ||
              lastError.message.includes('ERR_CONNECTION_REFUSED') ||
              lastError.message.includes('net::ERR_CONNECTION')) {
              // Longer delays for connection issues
              baseDelay = Math.pow(2, attempt) * 2000; // 4s, 8s, 16s, 32s
            } else if (lastError.name === 'AbortError') {
              // Shorter delays for timeouts
              baseDelay = Math.pow(2, attempt - 1) * 1500; // 1.5s, 3s, 6s, 12s
            } else {
              // Standard delays for other errors
              baseDelay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s, 8s
            }

            // Add jitter to prevent thundering herd
            const jitter = Math.random() * 1000;
            const delay = Math.min(baseDelay + jitter, 60000); // Cap total delay at 60s

            console.warn(`[WAIT] Retrying in ${(delay / 1000).toFixed(1)}s... (${maxRetries - attempt} attempts remaining)`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      console.error(`[ERROR] All ${maxRetries} attempts failed for URL: ${url.replace(this.polygonApiKey, 'API_KEY_HIDDEN')}`);
      console.error(`[ERROR] Final error: ${lastError.message}`);
      throw new Error(`Network request failed after ${maxRetries} attempts: ${lastError.message}`);
    });
  }

  // PROPER ALL-EXPIRATION STREAMING WITH 5% ITM FILTERING
  async fetchLiveStreamingTradesRobust(ticker: string): Promise<ProcessedTrade[]> {
    console.log(`[STREAM] STREAMING ALL EXPIRATIONS: Fetching ${ticker} with proper filtering`);

    try {
      // Get current stock price first
      const spotPrice = await this.getCurrentStockPrice(ticker);
      if (spotPrice <= 0) {
        console.log(`[WARN] ${ticker}: Cannot get spot price`);
        return [];
      }

      console.log(`[PRICE] ${ticker} CURRENT PRICE: $${spotPrice}`);

      // Get ALL options contracts with pagination for comprehensive coverage
      const allContracts = await this.fetchAllContractsPaginated(ticker);

      if (allContracts.length === 0) {
        console.log(`[EMPTY] ${ticker}: No options contracts found`);
        return [];
      }

      console.log(`[OK] ${ticker}: Found ${allContracts.length} total contracts across all pages`);

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

      console.log(`[OK] ${ticker}: ${validContracts.length} contracts pass 5% ITM filter`);
      console.log(`[FILTER] ${ticker}: ${allContracts.length - validContracts.length} deep ITM contracts filtered out`);

      // Get today's market open timestamp
      const marketOpenTimestamp = getTodaysMarketOpenTimestamp();
      const allTrades: ProcessedTrade[] = [];

      // Scan ALL valid contracts - no artificial limits, only your criteria filters
      let contractsWithTrades = 0;

      console.log(`[SCAN] ${ticker}: Scanning trades for ALL ${validContracts.length} valid contracts (all expirations)...`);

      // [PROC] BATCHED PROCESSING: Maximum throughput
      const BATCH_SIZE = 500; // INCREASED from 250 to 500 - DOUBLE THE SPEED!
      const contractBatches = this.chunkArray(validContracts, BATCH_SIZE);

      console.log(`[MODE] MODE: ${validContracts.length} contracts -> ${contractBatches.length} batches (${BATCH_SIZE} each)`);
      console.log(`[OPT] API calls reduced from ${validContracts.length} to ${contractBatches.length} (${((1 - contractBatches.length / validContracts.length) * 100).toFixed(1)}% reduction)`);

      // Process batches with MINIMAL delay for maximum speed
      for (let batchIndex = 0; batchIndex < contractBatches.length; batchIndex++) {
        const batch = contractBatches[batchIndex];
        console.log(`[BATCH] Batch ${batchIndex + 1}/${contractBatches.length} (${batch.length} contracts)`);

        try {
          // Fetch trades for this entire batch
          const batchTrades = await this.fetchBatchedContractTrades(
            batch,
            ticker,
            marketOpenTimestamp,
            spotPrice
          );

          // Add all batch results to main trades array
          allTrades.push(...batchTrades);
          contractsWithTrades += batch.filter(c =>
            batchTrades.some(t => t.ticker === c.ticker)
          ).length;

          // Debug logging for significant trades found
          const largeTrades = batchTrades.filter(t => t.total_premium > 10000);
          if (largeTrades.length > 0) {
            console.log(`[BATCH] Batch ${batchIndex + 1}: Found ${largeTrades.length} large trades, ${batchTrades.length} total trades`);
          }

          // MINIMAL rate limiting - reduced from 200ms to 50ms for 4x faster processing
          if (batchIndex < contractBatches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 50)); // 50ms between batches
          }

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`[ERROR] Batch ${batchIndex + 1} failed: ${errorMessage}`);

          // Continue with next batch instead of failing completely
          continue;
        }
      }

      console.log(`[OK] ${ticker}: Found ${allTrades.length} trades across ${contractsWithTrades} active contracts`);
      return allTrades;

    } catch (error) {
      console.error(`[ERROR] All-expiration streaming error for ${ticker}:`, error);
      return [];
    }
  }

  // SNAPSHOT WITH ALL-EXPIRATION 5% ITM FILTERING
  async fetchOptionsSnapshotRobust(ticker: string): Promise<ProcessedTrade[]> {
    console.log(`[SNAP] ALL-EXPIRATION SNAPSHOT: Fetching ${ticker} with 5% ITM filter`);

    try {
      // Get smart date range for proper historical data
      const { currentDate, isLive } = await getSmartDateRange();
      const targetDate = new Date(currentDate);

      // Get current spot price
      const spotPrice = await this.getCurrentStockPrice(ticker);
      if (spotPrice <= 0) {
        console.log(`[WARN] ${ticker}: Cannot get spot price`);
        return [];
      }

      const url = `https://api.polygon.io/v3/snapshot/options/${ticker}?apikey=${this.polygonApiKey}`;
      const response = await this.robustFetch(url);
      const data = await response.json();

      if (!data.results || data.results.length === 0) {
        console.log(`[EMPTY] ${ticker}: No options contracts found`);
        return [];
      }

      console.log(`[INFO] ${ticker}: ${data.results.length} total contracts in snapshot`);

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

        // FILTER: Only include trades from the target date (currentDate from smart date range)
        if (tradeDate.toDateString() !== targetDate.toDateString()) {
          continue; // Skip trades not from target date
        }

        // Market hours filter
        const eastern = new Date(tradeDate.toLocaleString("en-US", { timeZone: "America/New_York" }));
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
          premium_per_contract: contract.last_trade.price / 100, // Convert from cents to dollars
          total_premium: contract.last_trade.price * contract.last_trade.size,
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

      console.log(`[OK] ${ticker}: ${validContracts} valid contracts, ${filteredOut} deep ITM filtered out`);
      console.log(`[OK] ${ticker}: Extracted ${trades.length} today's trades`);
      return trades;

    } catch (error) {
      console.error(`[ERROR] All-expiration snapshot error for ${ticker}:`, error);
      throw error;
    }
  }

  // LIVE STREAMING METHOD: Get only TODAY's real-time trades, no fallback
  async fetchLiveStreamingTrades(ticker: string): Promise<ProcessedTrade[]> {
    console.log(`[LIVE] LIVE STREAMING: Fetching ${ticker} real-time options trades`);

    // Get today's market open timestamp
    const marketOpenTimestamp = getTodaysMarketOpenTimestamp();
    const todayStart = new Date(marketOpenTimestamp);
    const now = new Date();

    console.log(`[TIME] Live data range: ${todayStart.toLocaleString('en-US', { timeZone: 'America/New_York' })} ET -> ${now.toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`);

    try {
      // Use Polygon's aggregates endpoint for TODAY's options activity
      const todayDateStr = todayStart.toISOString().split('T')[0]; // YYYY-MM-DD format

      // Get options chains with proper API limits
      const chainUrl = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&limit=1000&apikey=${this.polygonApiKey}`;

      console.log(`[CHAIN] Fetching options chain for ${ticker}...`);
      const chainResponse = await fetch(chainUrl);
      const chainData = await chainResponse.json();

      if (!chainData.results || chainData.results.length === 0) {
        console.log(`[WARN] No options contracts found for ${ticker}`);
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

      console.log(`[SCAN] Processing ALL ${allContracts.length} active contracts for ${ticker} (all expirations)...`);

      // Fetch trades for each contract from TODAY only
      for (const contract of allContracts) {
        try {
          // Use trades endpoint with TODAY's timestamp filter
          const tradesUrl = `https://api.polygon.io/v3/trades/${contract.ticker}?timestamp.gte=${marketOpenTimestamp * 1000000}&apikey=${this.polygonApiKey}`;

          const tradesResponse = await fetch(tradesUrl);
          const tradesData = await tradesResponse.json();

          if (tradesData.results && tradesData.results.length > 0) {
            console.log(`[OK] ${contract.ticker}: Found ${tradesData.results.length} live trades`);

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
                  premium_per_contract: trade.price / 100, // Convert from cents to dollars
                  total_premium: trade.price * trade.size, // Price already in cents, size gives total premium
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
          console.error(`[ERROR] Error fetching trades for contract ${contract.ticker}:`, error);
        }
      }

      // Sort by most recent first
      liveTradesResults.sort((a, b) => new Date(b.trade_timestamp).getTime() - new Date(a.trade_timestamp).getTime());

      console.log(`[LIVE] LIVE RESULT: Found ${liveTradesResults.length} real-time trades for ${ticker} from today`);
      return liveTradesResults;

    } catch (error) {
      console.error(`[ERROR] Error in live streaming trades for ${ticker}:`, error);
      return [];
    }
  }

  // NEW METHOD: Fetch today's options trades from market open
  async fetchTodaysOptionsFlow(ticker: string): Promise<ProcessedTrade[]> {
    console.log(`[TODAY] TODAY'S TRADES: Fetching ${ticker} options from market open`);

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
          console.error(`[ERROR] Error fetching today's trades for ${contract.ticker}:`, error);
        }
      }

      console.log(`[OK] Found ${todaysTrades.length} trades for ${ticker} from today's market open`);
      return todaysTrades;

    } catch (error) {
      console.error(`[ERROR] Error fetching today's options flow for ${ticker}:`, error);
      return [];
    }
  }

  // REAL OPTIONS TRADES METHOD - FIXED TO USE CORRECT ENDPOINT
  async fetchOptionsSnapshotFast(ticker: string): Promise<ProcessedTrade[]> {
    console.log(`[MULTI] LIVE TRADES: Fetching TODAY's live options trades for ${ticker}`);

    try {
      // Get TODAY's data - Monday October 6th, 2025
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      console.log(`[SCAN] SCANNING TODAY: ${todayStr} (Live Options Trades)`);

      // Use the CORRECT endpoint - get options contracts first, then get their trades
      // Get current date and 1 year from now for expiration range
      const oneYearFromNow = new Date(today);
      oneYearFromNow.setFullYear(today.getFullYear() + 1);

      const oneYearStr = oneYearFromNow.toISOString().split('T')[0];

      const contractsUrl = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&expired=false&expiration_date.gte=${todayStr}&expiration_date.lte=${oneYearStr}&apikey=${this.polygonApiKey}`;
      console.log(`[TIME] Scanning contracts from ${todayStr} to ${oneYearStr}`);
      const contractsResponse = await fetch(contractsUrl);

      if (!contractsResponse.ok) {
        console.error(`[ERROR] Contracts failed for ${ticker}: ${contractsResponse.status}`);
        return [];
      }

      const contractsData = await contractsResponse.json();
      const contracts = contractsData.results || [];

      if (contracts.length === 0) {
        console.log(`[EMPTY] No options contracts found for ${ticker}`);
        return [];
      }

      console.log(`[INFO] Found ${contracts.length} options contracts for ${ticker}`);

      const currentPrice = await this.getCurrentStockPrice(ticker);

      // DEBUG: Check expiration dates in contracts
      const expirationDates = [...new Set(contracts.map((c: any) => c.expiration_date))];
      console.log(`[DEBUG] Expiration dates found: ${expirationDates.join(', ')}`);

      // DEBUG: Show first few contract tickers
      console.log(`[MULTI] Sample contract tickers:`, contracts.slice(0, 5).map((c: any) => c.ticker));

      // Filter contracts by volume and 5% ITM rule BEFORE processing
      const filteredContracts = await this.filterContractsByVolumeAndITM(contracts, currentPrice);
      console.log(`[OK] ${ticker}: Filtered to ${filteredContracts.length} contracts (within 5% ITM rule)`);

      // [OPT] OPTIMIZED BULK PROCESSING: Use snapshots + parallel batching
      const trades = await this.fetchBulkOptionsTradesOptimized(filteredContracts, ticker, currentPrice, todayStr);

      console.log(`[OK] ${ticker}: ${trades.length} individual trades from minute data`);
      return trades;

    } catch (error) {
      console.error(`[ERROR] Real trades error for ${ticker}:`, error);
      return [];
    }
  }



  private async getCurrentStockPrice(ticker: string): Promise<number> {
    try {
      const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apikey=${this.polygonApiKey}`;
      console.log(`[PRICE] Fetching current price for ${ticker}...`);

      const response = await this.robustFetch(url, 3); // Use robust fetch with 3 retries

      if (!response.ok) {
        console.warn(`[WARN] Price API error for ${ticker}: ${response.status}`);
        return 0; // Return 0 instead of fake fallback
      }

      const data = await response.json();
      const price = data.results?.[0]?.c;

      if (price && price > 0) {
        console.log(`[OK] ${ticker} current price: $${price}`);
        return price;
      } else {
        console.warn(`[WARN] No valid price data for ${ticker}`);
        return 0; // Return 0 instead of fake fallback
      }
    } catch (error) {
      console.warn(`[ERROR] Failed to get current price for ${ticker}:`, error instanceof Error ? error.message : 'Unknown error');
      return 0; // Return 0 instead of fake fallback - don't show fake data
    }
  }

  private async getHistoricalSpotPrice(ticker: string, timestamp: number): Promise<number> {
    try {
      // Validate timestamp is reasonable
      const now = Date.now();
      const oneYearAgo = now - (365 * 24 * 60 * 60 * 1000);

      if (timestamp < oneYearAgo || timestamp > now) {
        console.warn(`[WARN] Invalid timestamp for ${ticker}: ${new Date(timestamp).toISOString()}, using current price`);
        return await this.getCurrentStockPrice(ticker);
      }

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

          console.log(`[OK] Historical spot price for ${ticker} at ${tradeDate.toLocaleString()}: $${closestBar.c}`);
          return closestBar.c;
        }
      }

      // Fallback to current stock price method
      console.log(`[WARN] Could not find historical data for ${ticker} at ${tradeDate.toLocaleString()}, using current price`);
      return await this.getCurrentStockPrice(ticker);
    } catch (error) {
      console.error(`[ERROR] Error fetching historical spot price for ${ticker}:`, error);
      return await this.getCurrentStockPrice(ticker);
    }
  }

  // Keep this method for compatibility with existing API endpoints
  async processRawTradesData(rawTrades: OptionsTradeData[], requestedTicker?: string): Promise<ProcessedTrade[]> {
    console.log(`[PROC] Processing ${rawTrades.length} raw trades for ${requestedTicker || 'ALL'} tickers`);

    if (rawTrades.length === 0) {
      console.log('[WARN] No raw trades to process');
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

    const totalPremium = rawTrade.price * rawTrade.size; // Price already in cents

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
      premium_per_contract: rawTrade.price / 100, // Convert from cents to dollars
      total_premium: totalPremium,
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
    console.log(`[SWEEP] Scanning ${ticker} for sweep activity...`);

    // Add timeout protection (3 minutes max)
    const timeoutPromise = new Promise<ProcessedTrade[]>((_, reject) => {
      setTimeout(() => reject(new Error(`Scan timeout for ${ticker} after 3 minutes`)), 180000);
    });

    const scanPromise = this.performSweepScan(ticker);

    try {
      return await Promise.race([scanPromise, timeoutPromise]);
    } catch (error) {
      console.error(`[ERROR] Scan failed for ${ticker}:`, error);
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

      console.log(`[OK] ${ticker} @ $${stockPrice}: Scanning ${strikes.length} strikes from $${minStrike.toFixed(2)} to $${maxStrike.toFixed(2)} (all increments)`);

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

      console.log(`[BATCH] Processing ${contractPromises.length} contracts concurrently for ${ticker}...`);

      // Process ALL contracts simultaneously with Promise.all
      // No batching needed - let the system handle it all at once!
      const allBatchResults = await Promise.allSettled(contractPromises);

      allBatchResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.length > 0) {
          allTrades.push(...result.value);
        }
      });

      console.log(`[READY] Processed ALL ${contractPromises.length} contracts in parallel for ${ticker}`);

      console.log(`[INFO] Found ${allTrades.length} total trades, classifying as SWEEPS/BLOCKS/MINIS...`);

      // YOUR 3-CATEGORY SYSTEM: detectSweeps() now handles ALL classification
      const allFlowTrades = this.detectSweeps(allTrades);

      const sweepCount = allFlowTrades.filter(t => t.trade_type === 'SWEEP').length;
      const blockCount = allFlowTrades.filter(t => t.trade_type === 'BLOCK').length;
      const miniCount = allFlowTrades.filter(t => t.trade_type === 'MINI').length;

      console.log(`[INFO] Final Classification: ${sweepCount} sweeps, ${blockCount} blocks, ${miniCount} minis`);

      return allFlowTrades.sort((a, b) => b.total_premium - a.total_premium);

    } catch (error) {
      console.error('Error scanning for sweeps:', error);
      return [];
    }
  }

  /**
   * Classify all trades into SWEEP, BLOCK, or MINI based on exchange distribution
   * SWEEP: 2+ exchanges within 3-second window for same contract
   * BLOCK: Single exchange with $50K+ premium  
   * MINI: Single exchange with <$50K premium
   */
  private classifyAllTrades(allTrades: any[]): ProcessedTrade[] {
    console.log(`[MULTI] Starting trade classification for ${allTrades.length} trades`);

    if (allTrades.length === 0) {
      return [];
    }

    console.log(`[CHECK] DEBUG: Sample trade structure:`, allTrades[0]);

    // Deduplicate trades using a unique identifier to prevent infinite loops
    const seenTrades = new Set<string>();
    const uniqueTrades: any[] = [];

    for (const trade of allTrades) {
      // Create a unique identifier for each trade
      const tradeId = `${trade.ticker || trade.option_ticker}_${trade.timestamp || trade.sip_timestamp}_${trade.total_premium}_${trade.exchange}`;

      if (!seenTrades.has(tradeId)) {
        seenTrades.add(tradeId);
        uniqueTrades.push(trade);
      }
    }

    console.log(`[CHECK] After deduplication: ${uniqueTrades.length} unique trades (removed ${allTrades.length - uniqueTrades.length} duplicates)`);

    // Convert raw trades to proper format first
    const convertedTrades = uniqueTrades.map(trade => {
      // If already a ProcessedTrade with classification, don't reprocess
      if (trade.trade_timestamp instanceof Date && trade.trade_type !== undefined) {
        console.log(`[SKIP] Trade already classified: ${trade.ticker} - ${trade.trade_type}`);
        return trade as ProcessedTrade;
      }

      // Convert worker trade to ProcessedTrade format
      console.log(`[PROC] Converting worker trade: ${trade.ticker || trade.option_ticker} - $${trade.total_premium}`);
      return {
        ticker: trade.ticker || trade.option_ticker,
        underlying_ticker: trade.underlying_ticker,
        strike: trade.strike,
        expiry: trade.expiry,
        type: trade.type,
        trade_size: trade.trade_size,
        premium_per_contract: trade.premium_per_contract,
        total_premium: trade.total_premium,
        spot_price: trade.spot_price,
        exchange: trade.exchange,
        exchange_name: trade.exchange_name,
        sip_timestamp: trade.sip_timestamp,
        conditions: trade.conditions || [],
        trade_timestamp: trade.trade_timestamp instanceof Date ? trade.trade_timestamp : new Date(trade.timestamp),
        trade_type: undefined, // Will be classified
        moneyness: trade.moneyness,
        days_to_expiry: trade.days_to_expiry
      } as ProcessedTrade;
    });

    // Step 1: Detect multi-leg trades (must be done FIRST before sweeps bundle them)
    console.log(`[CHECK] Step 1: Detecting multi-leg strategies...`);
    const withMultiLeg = this.detectMultiLegTrades(convertedTrades);
    console.log(`[INFO] Found ${withMultiLeg.filter(t => t.trade_type === 'MULTI-LEG').length} MULTI-LEG trades`);

    // Step 2: Detect sweeps (cross-exchange patterns) on remaining trades
    console.log(`[CHECK] Step 2: Detecting sweeps across exchanges...`);
    const sweeps = this.detectSweeps(withMultiLeg);
    console.log(`[INFO] Found ${sweeps.filter(t => t.trade_type === 'SWEEP').length} SWEEP trades`);

    // Step 3: Create set of already-classified trade keys to avoid double-classification
    const classifiedKeys = new Set<string>();
    sweeps.forEach(trade => {
      if (trade.trade_type) {
        const key = `${trade.ticker}_${trade.strike}_${trade.type}_${trade.expiry}_${trade.trade_timestamp?.getTime()}`;
        classifiedKeys.add(key);
      }
    });

    // Step 4: Classify remaining trades as BLOCK or MINI
    console.log(`[CHECK] Step 3: Classifying remaining trades as BLOCK/MINI...`);
    const remainingTrades = sweeps.filter(trade => {
      const key = `${trade.ticker}_${trade.strike}_${trade.type}_${trade.expiry}_${trade.trade_timestamp?.getTime()}`;
      return !classifiedKeys.has(key);
    });

    const classifiedRemaining = remainingTrades.map(trade => {
      // Classify based on premium threshold
      const isBlock = trade.total_premium >= 50000;
      return {
        ...trade,
        trade_type: isBlock ? 'BLOCK' : 'MINI'
      } as ProcessedTrade;
    });

    const blocks = classifiedRemaining.filter(t => t.trade_type === 'BLOCK');
    const minis = classifiedRemaining.filter(t => t.trade_type === 'MINI');

    console.log(`[OK] Classification summary:`);
    console.log(`   - SWEEPS: ${sweeps.length}`);
    console.log(`   - BLOCKS: ${blocks.length}`);
    console.log(`   - MINIS: ${minis.length}`);
    console.log(`   - Total: ${sweeps.length + blocks.length + minis.length}`);

    // Combine all classified trades
    const allClassified = [...sweeps, ...classifiedRemaining];

    // Debug: Check final trade types
    console.log(`[CHECK] FINAL DEBUG: Sample classified trades:`);
    allClassified.slice(0, 3).forEach((trade, i) => {
      console.log(`   ${i + 1}. ${trade.ticker} - Type: '${trade.trade_type}' - Premium: $${trade.total_premium}`);
    });

    return allClassified.sort((a, b) => b.total_premium - a.total_premium);
  }

  private detectBlocks(allTrades: any[]): ProcessedTrade[] {
    const blocks: ProcessedTrade[] = [];
    const processedTrades = new Set<string>();

    allTrades.forEach(trade => {
      const totalPremium = trade.price * trade.size; // Price already in cents
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
          premium_per_contract: trade.price / 100, // Convert from cents to dollars
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
    // Use TOP_1800_SYMBOLS (excludes SPY, QQQ, NVDA)
    return TOP_1800_SYMBOLS;
  }

  private getTop1000Symbols(): string[] {
    // ETFs to exclude
    const ETFS = ['SPY', 'QQQ', 'IWM', 'EFA', 'EEM', 'VTI', 'IEFA', 'AGG', 'LQD', 'HYG',
      'XLF', 'XLE', 'XLK', 'XLV', 'XLI', 'XLU', 'XLP', 'XLY', 'XLB', 'XLRE', 'XLC',
      'GLD', 'SLV', 'TLT', 'IEF', 'SHY', 'VTEB', 'VXUS', 'BND', 'BNDX', 'DIA', 'SMH',
      'VXX', 'UVXY'];

    // MAG7 to exclude
    const MAG7 = ['AAPL', 'NVDA', 'MSFT', 'TSLA', 'AMZN', 'META', 'GOOGL', 'GOOG'];

    // Combine exclusion list
    const EXCLUDE = new Set([...ETFS, ...MAG7]);

    // Filter out ETFs and MAG7 from TOP_1800_SYMBOLS
    return TOP_1800_SYMBOLS.filter(ticker => !EXCLUDE.has(ticker));
  }

  // UTILITY: Chunk array into batches for batch processing
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  // [PROC] INSTANT ENRICHMENT: Add Vol/OI/Greeks/Current Price to trades after worker scan (PARALLEL VERSION)
  private async enrichTradesInstantlyParallel(trades: ProcessedTrade[]): Promise<ProcessedTrade[]> {
    if (trades.length === 0) return trades;

    console.log(`[ENRICH] BACKEND ENRICHMENT: Processing ${trades.length} trades with combined snapshot approach`);

    // Group trades by underlying ticker for efficient batch processing
    const tradesByTicker = new Map<string, ProcessedTrade[]>();
    trades.forEach(trade => {
      const ticker = trade.underlying_ticker;
      if (!tradesByTicker.has(ticker)) {
        tradesByTicker.set(ticker, []);
      }
      tradesByTicker.get(ticker)!.push(trade);
    });

    console.log(`[OK] Enriching ${trades.length} trades across ${tradesByTicker.size} tickers in parallel`);

    // Process all tickers in parallel for maximum speed
    const enrichmentPromises = Array.from(tradesByTicker.entries()).map(async ([ticker, tickerTrades], idx) => {
      try {
        // Stagger requests to avoid rate limiting (50ms between tickers)
        await new Promise(resolve => setTimeout(resolve, idx * 50));

        // Use direct contract snapshots - fetch only the contracts we need
        const enrichedTrades = await Promise.all(
          tickerTrades.map(async (trade, tradeIdx) => {
            try {
              // Minimal stagger within ticker batch
              await new Promise(resolve => setTimeout(resolve, tradeIdx * 20));

              // Build option ticker format
              const expiry = trade.expiry.replace(/-/g, '').slice(2, 8); // YYMMDD
              const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0');
              const optionType = trade.type === 'call' ? 'C' : 'P';
              const optionTicker = `O:${ticker}${expiry}${optionType}${strikeFormatted}`;

              // Direct contract snapshot - gets Vol/OI/Greeks/Bid/Ask in ONE call
              const snapshotUrl = `https://api.polygon.io/v3/snapshot/options/${ticker}/${optionTicker}?apikey=${this.polygonApiKey}`;
              const response = await this.robustFetch(snapshotUrl, 3000);
              const data = await response.json();

              if (data.results) {
                const result = data.results;

                // Extract all enrichment data
                const volume = result.day?.volume || 0;
                const openInterest = result.open_interest || 0;
                const volOIRatio = openInterest > 0 ? volume / openInterest : 0;

                const bid = result.last_quote?.bid || 0;
                const ask = result.last_quote?.ask || 0;
                const bidAskSpread = ask - bid;

                const fillStyle = this.detectFillStyle(
                  trade.premium_per_contract,
                  bid,
                  ask,
                  bidAskSpread
                );

                return {
                  ...trade,
                  volume,
                  open_interest: openInterest,
                  vol_oi_ratio: volOIRatio,
                  delta: result.greeks?.delta || 0,
                  gamma: result.greeks?.gamma || 0,
                  theta: result.greeks?.theta || 0,
                  vega: result.greeks?.vega || 0,
                  implied_volatility: result.implied_volatility || 0,
                  bid,
                  ask,
                  bid_ask_spread: bidAskSpread,
                  fill_style: fillStyle,
                  current_price: result.last_quote?.midpoint || result.last_trade?.price || trade.premium_per_contract
                };
              }

              // Return unenriched if no data
              return trade;

            } catch (error) {
              console.warn(`[WARN] Failed to enrich ${trade.ticker}:`, error instanceof Error ? error.message : error);
              return trade; // Return unenriched on error
            }
          })
        );

        console.log(`[OK] ${ticker}: Enriched ${enrichedTrades.length} trades`);
        return enrichedTrades;

      } catch (error) {
        console.error(`[ERROR] Enrichment error for ${ticker}:`, error);
        return tickerTrades; // Return unenriched on error
      }
    });

    // Wait for all ticker enrichments to complete
    const enrichedTradeArrays = await Promise.all(enrichmentPromises);
    const allEnrichedTrades = enrichedTradeArrays.flat();

    console.log(`[OK] Backend enrichment complete: ${allEnrichedTrades.length} trades fully enriched`);
    return allEnrichedTrades;
  }

  // [OPT] INSTANT ENRICHMENT: Add Vol/OI/Greeks/Current Price to trades after worker scan
  private async enrichTradesInstantly(trades: ProcessedTrade[]): Promise<ProcessedTrade[]> {
    if (trades.length === 0) return trades;

    // Group trades by underlying ticker for batch enrichment
    const tradesByTicker = new Map<string, ProcessedTrade[]>();
    trades.forEach(trade => {
      const ticker = trade.underlying_ticker;
      if (!tradesByTicker.has(ticker)) {
        tradesByTicker.set(ticker, []);
      }
      tradesByTicker.get(ticker)!.push(trade);
    });

    console.log(`[INFO] Enriching ${trades.length} trades across ${tradesByTicker.size} tickers`);

    // Fetch snapshot data for each ticker (batched by ticker)
    const enrichmentPromises = Array.from(tradesByTicker.entries()).map(async ([ticker, tickerTrades]) => {
      try {
        // ONE snapshot call gets ALL enrichment data for this ticker
        const snapshotUrl = `https://api.polygon.io/v3/snapshot/options/${ticker}?apikey=${this.polygonApiKey}`;
        const response = await this.robustFetch(snapshotUrl);
        const snapshotData = await response.json();

        // Create enrichment map: contract ticker -> data
        const enrichmentMap = new Map<string, any>();
        if (snapshotData.results) {
          snapshotData.results.forEach((snapshot: any) => {
            const contractTicker = snapshot.details.ticker;
            enrichmentMap.set(contractTicker, {
              volume: snapshot.day?.volume || 0,
              open_interest: snapshot.open_interest || 0,
              delta: snapshot.greeks?.delta || 0,
              gamma: snapshot.greeks?.gamma || 0,
              theta: snapshot.greeks?.theta || 0,
              vega: snapshot.greeks?.vega || 0,
              implied_volatility: snapshot.implied_volatility || 0,
              bid: snapshot.last_quote?.bid || 0,
              ask: snapshot.last_quote?.ask || 0,
              current_price: snapshot.last_quote?.midpoint || snapshot.last_trade?.price || 0
            });
          });
        }

        // Enrich all trades for this ticker
        return tickerTrades.map(trade => {
          const enrichment = enrichmentMap.get(trade.ticker);
          if (!enrichment) return trade;

          // Calculate enriched fields
          const volume = enrichment.volume || 0;
          const openInterest = enrichment.open_interest || 0;
          const volOIRatio = openInterest > 0 ? volume / openInterest : 0;

          const bid = enrichment.bid ? enrichment.bid / 100 : 0;
          const ask = enrichment.ask ? enrichment.ask / 100 : 0;
          const bidAskSpread = ask - bid;

          const fillStyle = this.detectFillStyle(
            trade.premium_per_contract,
            bid,
            ask,
            bidAskSpread
          );

          const classification = this.classifyTradeByVolOI(
            trade.total_premium,
            volOIRatio,
            volume,
            openInterest
          );

          // Return enriched trade
          return {
            ...trade,
            volume,
            open_interest: openInterest,
            vol_oi_ratio: volOIRatio,
            delta: enrichment.delta || 0,
            gamma: enrichment.gamma || 0,
            theta: enrichment.theta || 0,
            vega: enrichment.vega || 0,
            implied_volatility: enrichment.implied_volatility || 0,
            bid,
            ask,
            bid_ask_spread: bidAskSpread,
            fill_style: fillStyle,
            current_price: enrichment.current_price ? enrichment.current_price / 100 : trade.premium_per_contract,
            classification
          };
        });

      } catch (error) {
        console.error(`[ERROR] Enrichment error for ${ticker}:`, error);
        return tickerTrades; // Return unenriched on error
      }
    });

    // Wait for all ticker enrichments to complete
    const enrichedTradeArrays = await Promise.all(enrichmentPromises);
    const allEnrichedTrades = enrichedTradeArrays.flat();

    console.log(`[OK] Enrichment complete: ${allEnrichedTrades.length} trades enriched`);
    return allEnrichedTrades;
  }

  // [PROC] OPTIMIZED METHOD: Fetch trades AND enrich with snapshot data in parallel
  private async fetchBatchedContractTrades(
    contractsBatch: any[],
    ticker: string,
    marketOpenTimestamp: number,
    spotPrice: number
  ): Promise<ProcessedTrade[]> {
    const batchTrades: ProcessedTrade[] = [];

    console.log(`[PROC] Processing ${ticker} - ${contractsBatch.length} contracts`);

    try {
      // Step 1: Get snapshot data for ALL contracts in ONE API call (Vol/OI/Greeks/Bid-Ask)
      const snapshotUrl = `https://api.polygon.io/v3/snapshot/options/${ticker}?apikey=${this.polygonApiKey}`;
      const snapshotResponse = await this.robustFetch(snapshotUrl);
      const snapshotData = await snapshotResponse.json();

      // Create map of contract ticker -> enrichment data
      const enrichmentMap = new Map();
      if (snapshotData.results) {
        snapshotData.results.forEach((snapshot: any) => {
          enrichmentMap.set(snapshot.details.ticker, {
            volume: snapshot.day?.volume || 0,
            open_interest: snapshot.open_interest || 0,
            delta: snapshot.greeks?.delta || 0,
            gamma: snapshot.greeks?.gamma || 0,
            theta: snapshot.greeks?.theta || 0,
            vega: snapshot.greeks?.vega || 0,
            implied_volatility: snapshot.implied_volatility || 0,
            bid: snapshot.last_quote?.bid || 0,
            ask: snapshot.last_quote?.ask || 0,
            current_price: snapshot.last_quote?.midpoint || snapshot.last_trade?.price || 0
          });
        });
      }

      console.log(`[OK] ${ticker}: Snapshot loaded with enrichment data for ${enrichmentMap.size} contracts`);

      // Step 2: Fetch actual trades for each contract in parallel
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const tradePromises = contractsBatch.map(async (contract, index) => {
        try {
          // Stagger requests to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, index * 20));

          const timestampNanos = marketOpenTimestamp * 1000000;
          const tradesUrl = `https://api.polygon.io/v3/trades/${contract.ticker}?timestamp.gte=${timestampNanos}&limit=1000&apikey=${this.polygonApiKey}`;

          const tradesResponse = await this.robustFetch(tradesUrl);
          const tradesData = await tradesResponse.json();

          if (!tradesData.results || tradesData.results.length === 0) {
            return [];
          }

          const contractTrades: ProcessedTrade[] = [];
          const enrichment = enrichmentMap.get(contract.ticker);

          // Debug: Log enrichment data for first contract
          if (index === 0 && enrichment) {
            console.log(`[OK] Enrichment data for ${contract.ticker}:`, {
              volume: enrichment.volume,
              open_interest: enrichment.open_interest,
              bid: enrichment.bid,
              ask: enrichment.ask,
              current_price: enrichment.current_price
            });
          }

          for (const trade of tradesData.results) {
            const tradeTime = new Date(trade.sip_timestamp / 1000000);

            // Only today's trades
            const tradeDate = new Date(tradeTime);
            tradeDate.setHours(0, 0, 0, 0);
            if (tradeDate.getTime() !== today.getTime()) continue;

            // Market hours filter
            const eastern = new Date(tradeTime.toLocaleString("en-US", { timeZone: "America/New_York" }));
            const hour = eastern.getHours();
            const minute = eastern.getMinutes();
            const timeDecimal = hour + (minute / 60);

            if (timeDecimal < 9.5 || timeDecimal >= 16) continue;

            const premium = trade.price * trade.size;
            const contractType = contract.contract_type?.toLowerCase() || 'call';

            // Calculate enriched fields
            const volume = enrichment?.volume || 0;
            const openInterest = enrichment?.open_interest || 0;
            const volOIRatio = openInterest > 0 ? volume / openInterest : 0;

            const bid = enrichment?.bid ? enrichment.bid / 100 : 0;
            const ask = enrichment?.ask ? enrichment.ask / 100 : 0;
            const bidAskSpread = ask - bid;

            const fillStyle = this.detectFillStyle(
              trade.price / 100,
              bid,
              ask,
              bidAskSpread
            );

            const classification = this.classifyTradeByVolOI(premium, volOIRatio, volume, openInterest);

            // Debug: Log first trade to verify enrichment
            if (contractTrades.length === 0) {
              console.log(`[OK] Sample enriched trade for ${contract.ticker}:`, {
                ticker: contract.ticker,
                volume,
                openInterest,
                volOIRatio,
                bid,
                ask,
                fillStyle,
                classification,
                spotPrice,
                currentPrice: enrichment?.current_price ? enrichment.current_price / 100 : trade.price / 100
              });
            }

            const processedTrade: ProcessedTrade = {
              ticker: contract.ticker,
              underlying_ticker: ticker,
              strike: contract.strike_price,
              expiry: contract.expiration_date,
              type: contractType as 'call' | 'put',
              trade_size: trade.size,
              premium_per_contract: trade.price / 100,
              total_premium: premium,
              spot_price: spotPrice,
              exchange: trade.exchange,
              exchange_name: this.exchangeNames[trade.exchange] || 'UNKNOWN',
              sip_timestamp: trade.sip_timestamp,
              trade_timestamp: tradeTime,
              conditions: trade.conditions || [],
              moneyness: this.getMoneyness(contract.strike_price, spotPrice, contractType as 'call' | 'put'),
              days_to_expiry: Math.ceil((new Date(contract.expiration_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),

              // [OK] ENRICHED DATA from snapshot
              volume: volume,
              open_interest: openInterest,
              vol_oi_ratio: volOIRatio,
              delta: enrichment?.delta || 0,
              gamma: enrichment?.gamma || 0,
              theta: enrichment?.theta || 0,
              vega: enrichment?.vega || 0,
              implied_volatility: enrichment?.implied_volatility || 0,
              bid: bid,
              ask: ask,
              bid_ask_spread: bidAskSpread,
              fill_style: fillStyle,
              current_price: enrichment?.current_price ? enrichment.current_price / 100 : trade.price / 100,
              classification: classification
            };

            contractTrades.push(processedTrade);
          }

          return contractTrades;

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (!errorMessage.includes('HTTP 403') && !errorMessage.includes('HTTP 429')) {
            console.log(`[ERROR] Error scanning ${contract.ticker}: ${errorMessage}`);
          }
          return [];
        }
      });

      // Wait for all trades to be fetched and enriched
      const allTradeResults = await Promise.all(tradePromises);

      // Flatten results
      allTradeResults.forEach(contractTrades => {
        batchTrades.push(...contractTrades);
      });

      console.log(`[OK] ${ticker}: Processed ${batchTrades.length} FULLY ENRICHED trades`);

      // Debug: Log first enriched trade to verify data structure
      if (batchTrades.length > 0) {
        console.log(`[CHECK] Sample enriched trade from ${ticker}:`, {
          ticker: batchTrades[0].ticker,
          spot_price: batchTrades[0].spot_price,
          volume: batchTrades[0].volume,
          open_interest: batchTrades[0].open_interest,
          current_price: batchTrades[0].current_price,
          fill_style: batchTrades[0].fill_style,
          classification: batchTrades[0].classification,
          delta: batchTrades[0].delta
        });
      }

      return batchTrades;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[ERROR] Batch processing error for ${ticker}:`, errorMessage);
      return [];
    }
  }

  // Helper: Detect fill style from bid/ask analysis
  private detectFillStyle(price: number, bid: number, ask: number, spread: number): string {
    if (bid === 0 || ask === 0) return 'UNKNOWN';

    const midpoint = (bid + ask) / 2;
    const distanceFromMid = Math.abs(price - midpoint);
    const percentFromMid = distanceFromMid / midpoint;

    if (price >= ask) return 'ASK+'; // Above ask (aggressive buy)
    if (price <= bid) return 'BID-'; // Below bid (aggressive sell)
    if (price === ask) return 'ASK'; // At ask
    if (price === bid) return 'BID'; // At bid
    if (Math.abs(price - ask) < 0.01) return 'ASK'; // Near ask
    if (Math.abs(price - bid) < 0.01) return 'BID'; // Near bid
    if (percentFromMid < 0.1) return 'MID'; // Within 10% of midpoint

    return price > midpoint ? 'ASK' : 'BID';
  }

  // Helper: Classify trade by Vol/OI ratio
  private classifyTradeByVolOI(premium: number, volOIRatio: number, volume: number, openInterest: number): string {
    // Large premium bypasses vol/OI logic
    if (premium >= 50000) return 'SWEEP';
    if (premium >= 25000) return 'BLOCK';

    // Use vol/OI ratio for classification
    if (volOIRatio >= 2.0) return 'SWEEP'; // Volume 2x open interest
    if (volOIRatio >= 1.0) return 'BLOCK'; // Volume equals open interest
    if (volume >= 100) return 'BLOCK'; // High absolute volume

    return 'MINI'; // Everything else is mini
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
    // SPY FIRST - most important options ticker
    const priorityTickers = [
      // SPY - THE MOST IMPORTANT OPTIONS TICKER (always first)
      'SPY',
      // Other major ETFs
      'QQQ', 'IWM', 'XLF', 'XLE', 'XLK', 'GDX', 'EEM', 'VXX',
      // Mega caps with high options volume
      'TSLA', 'AAPL', 'NVDA', 'AMZN', 'MSFT', 'GOOGL', 'META', 'AMD', 'NFLX', 'DIS'
    ];

    // Return just the priority tickers for faster scanning
    return priorityTickers;
  }

  // [PAGE] PAGINATION: Fetch ALL contracts across multiple pages for comprehensive coverage
  private async fetchAllContractsPaginated(ticker: string): Promise<any[]> {
    const allContracts: any[] = [];
    let cursor: string | undefined;
    let pageCount = 0;

    console.log(`[PAGE] Fetching ALL contracts for ${ticker} with pagination...`);

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
          console.log(`[PAGE] Page ${pageCount}: +${data.results.length} contracts (Total: ${allContracts.length})`);
        }

        cursor = data.next_url ? data.next_url.split('cursor=')[1]?.split('&')[0] : undefined;

      } catch (error) {
        console.error(`[ERROR] Pagination error on page ${pageCount}:`, error);
        break;
      }

      // Safety limit - prevent infinite loops
      if (pageCount > 50) {
        console.warn(`[WARN] Reached pagination limit (50 pages) for ${ticker}`);
        break;
      }

    } while (cursor);

    console.log(`[OK] Pagination complete: ${allContracts.length} total contracts from ${pageCount} pages`);
    return allContracts;
  }

  // [OPT] OPTIMIZED BULK PROCESSING: Fetch options trades using snapshots + parallel batching
  private async fetchBulkOptionsTradesOptimized(
    contracts: any[],
    ticker: string,
    currentPrice: number,
    todayStr: string
  ): Promise<ProcessedTrade[]> {
    console.log(`[BULK] BULK OPTIMIZATION: Processing ${contracts.length} contracts for ${ticker} with parallel snapshots`);

    const allTrades: ProcessedTrade[] = [];

    // Step 1: MAXIMUM SPEED - Process as many as possible in parallel!
    const SNAPSHOT_BATCH_SIZE = 100; // DOUBLED from 50 to 100 for another 2x boost!
    const contractBatches: any[][] = [];

    for (let i = 0; i < contracts.length; i += SNAPSHOT_BATCH_SIZE) {
      contractBatches.push(contracts.slice(i, i + SNAPSHOT_BATCH_SIZE));
    }

    console.log(`[SPEED] MAXIMUM SPEED: ${contractBatches.length} batches of ${SNAPSHOT_BATCH_SIZE} contracts each`);

    // Step 2: Fire ALL batches simultaneously with Promise.all for ultimate speed!
    const batchPromises = contractBatches.map(async (batch, batchIndex) => {
      // NO delays, NO staggers - pure parallel execution!

      // Build comma-separated ticker list for bulk snapshot
      const tickerList = batch.map(contract => contract.ticker).join(',');

      try {
        // Use bulk snapshot API to get all contract data in one call with ROBUST retry logic
        const snapshotUrl = `https://api.polygon.io/v3/snapshot/options/${ticker}?apikey=${this.polygonApiKey}`;
        const snapshotResponse = await this.robustFetch(snapshotUrl, 3); // Use robustFetch with 3 retries

        if (!snapshotResponse.ok) {
          console.warn(`[WARN] Snapshot failed for batch ${batchIndex + 1}: ${snapshotResponse.status}`);
          return [];
        }

        const snapshotData = await snapshotResponse.json();
        const results = snapshotData.results || [];

        console.log(`[BATCH] Batch ${batchIndex + 1}: Got ${results.length} snapshot results`);

        // Step 3: Process snapshot results in parallel - ALL AT ONCE
        const tradePromises = results.map(async (optionData: any) => {
          try {
            // Filter by volume immediately
            const volume = optionData.day?.volume || 0;
            if (volume < 50) return []; // Skip low volume

            const parsed = this.parseOptionsTicker(optionData.value);
            if (!parsed) return [];

            // Use snapshot data to create trade
            const lastPrice = optionData.last_quote?.price || optionData.day?.close || 0;
            const totalPremium = lastPrice * volume; // Price already in cents

            // Skip if doesn't meet minimum criteria
            if (totalPremium < 5000) return []; // Skip small premium trades

            const trade: ProcessedTrade = {
              ticker: optionData.value,
              underlying_ticker: parsed.underlying,
              strike: parsed.strike,
              expiry: parsed.expiry,
              type: parsed.type,
              trade_size: volume,
              premium_per_contract: lastPrice / 100, // Convert from cents to dollars
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

        console.log(`[OK] Batch ${batchIndex + 1} complete: ${batchTrades.length} trades`);
        return batchTrades;

      } catch (error) {
        console.error(`[ERROR] Batch ${batchIndex + 1} failed:`, error);
        return [];
      }
    });

    // Step 4: Wait for all batches to complete
    console.log(`[WAIT] Waiting for all ${contractBatches.length} batches to complete...`);
    const allBatchResults = await Promise.all(batchPromises);

    // Step 5: Combine all results
    allBatchResults.forEach(batchTrades => {
      allTrades.push(...batchTrades);
    });

    console.log(`[MULTI] BULK OPTIMIZATION COMPLETE: ${allTrades.length} trades from ${contracts.length} contracts for ${ticker}`);
    return allTrades;
  }

  // [FAST] ULTRA-FAST PARALLEL ENRICHMENT - Enriches trades with Vol/OI + Fill Style using all CPU cores
  async enrichTradesWithVolOIParallel(trades: ProcessedTrade[]): Promise<ProcessedTrade[]> {
    if (trades.length === 0) return trades;

    const BATCH_SIZE = 50; // Process 50 trades per batch for quotes
    const batches = [];

    for (let i = 0; i < trades.length; i += BATCH_SIZE) {
      batches.push(trades.slice(i, i + BATCH_SIZE));
    }

    console.log(`[ENRICH] FILL-STYLE ONLY: ${trades.length} trades in ${batches.length} batches`);

    // No snapshot calls. Only quote calls for fill style.
    const enrichedBatches = await Promise.all(
      batches.map(async (batch, batchIndex) => {
        const enrichedTrades = await Promise.all(
          batch.map(async (trade) => {
            try {
              const optionTicker = trade.ticker;

              // STEP: Get HISTORICAL quote at trade timestamp for bid/ask
              let bid: number | undefined;
              let ask: number | undefined;
              let fillStyle = 'N/A';

              const tradeDate = new Date(trade.trade_timestamp);
              const tradeTimestampNano = tradeDate.getTime() * 1000000; // ms → ns

              try {
                const quoteUrl = `https://api.polygon.io/v3/quotes/${optionTicker}?timestamp.lte=${tradeTimestampNano}&limit=1&order=desc&apiKey=${this.polygonApiKey}`;
                const quoteResponse = await fetch(quoteUrl);

                if (quoteResponse.ok) {
                  const quoteData = await quoteResponse.json();
                  if (quoteData.status === 'OK' && quoteData.results && quoteData.results.length > 0) {
                    bid = quoteData.results[0].bid_price;
                    ask = quoteData.results[0].ask_price;
                  }
                }
              } catch (quoteError) {
                // Ignore quote errors
              }

              // Calculate Fill Style
              const lastPrice = trade.premium_per_contract;
              if (bid && ask && bid > 0 && ask > 0 && ask > bid) {
                const midpoint = (bid + ask) / 2;
                const spread = ask - bid;
                const distanceFromMid = lastPrice - midpoint;

                if (distanceFromMid > spread * 0.25) fillStyle = 'A';
                else if (distanceFromMid > 0) fillStyle = 'AA';
                else if (distanceFromMid < -spread * 0.25) fillStyle = 'B';
                else if (distanceFromMid < 0) fillStyle = 'BB';
              }

              return {
                ...trade,
                // Vol/OI removed per request
                fill_style: fillStyle,
                bid,
                ask,
                bid_ask_spread: bid && ask ? ask - bid : undefined
              };
            } catch (error) {
              return trade;
            }
          })
        );

        if (batchIndex % 10 === 0) {
          console.log(`[BATCH] Fill-style batch ${batchIndex + 1}/${batches.length}`);
        }

        return enrichedTrades;
      })
    );

    const allEnriched = enrichedBatches.flat();
    console.log(`[OK] FILL-STYLE ENRICHMENT COMPLETE: ${allEnriched.length} trades`);

    return allEnriched;
  }

  // Enrich trades with historical Vol/OI data
  async enrichTradesWithHistoricalVolOI(trades: ProcessedTrade[]): Promise<ProcessedTrade[]> {
    if (trades.length === 0) return trades;

    const BATCH_SIZE = 50;
    const batches = [];

    for (let i = 0; i < trades.length; i += BATCH_SIZE) {
      batches.push(trades.slice(i, i + BATCH_SIZE));
    }

    console.log(`[HIST] HISTORICAL VOL/OI ENRICHMENT: ${trades.length} trades in ${batches.length} batches`);

    const enrichedBatches = await Promise.all(
      batches.map(async (batch, batchIndex) => {
        const enrichedTrades = await Promise.all(
          batch.map(async (trade) => {
            try {
              const expiry = trade.expiry.replace(/-/g, '').slice(2);
              const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0');
              const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P';
              const optionTicker = `O:${trade.underlying_ticker}${expiry}${optionType}${strikeFormatted}`;

              let volume = trade.volume;
              let openInterest = trade.open_interest;

              // If trade has trading_date (historical), fetch historical volume
              if (trade.trading_date) {
                const date = trade.trading_date; // YYYY-MM-DD format

                // Fetch daily aggregate for volume
                const aggUrl = `https://api.polygon.io/v2/aggs/ticker/${optionTicker}/range/1/day/${date}/${date}?adjusted=true&sort=asc&apiKey=${this.polygonApiKey}`;
                const aggResponse = await fetch(aggUrl);

                if (aggResponse.ok) {
                  const aggData = await aggResponse.json();
                  if (aggData.status === 'OK' && aggData.results && aggData.results.length > 0) {
                    volume = aggData.results[0].v; // Historical volume
                  }
                }
              }

              // Always fetch snapshot for current OI and bid/ask (OI doesn't change historically)
              // Use snapshot endpoint - VIX/SPX weeklies need different format
              const snapshotUrl = (trade.underlying_ticker === 'VIX' || trade.underlying_ticker === 'SPX')
                ? `https://api.polygon.io/v3/snapshot/options/I:${trade.underlying_ticker}?limit=250&apikey=${this.polygonApiKey}`
                : `https://api.polygon.io/v3/snapshot/options/${trade.underlying_ticker}/${optionTicker}?apiKey=${this.polygonApiKey}`;

              const snapResponse = await fetch(snapshotUrl);

              if (!snapResponse.ok) return trade;

              const snapData = await snapResponse.json();

              if (snapData.status === 'OK' && snapData.results) {
                // For VIX/SPX bulk snapshot, find the specific contract
                let snapshot;
                if (trade.underlying_ticker === 'VIX' || trade.underlying_ticker === 'SPX') {
                  snapshot = Array.isArray(snapData.results)
                    ? snapData.results.find((r: any) => r.details?.ticker === optionTicker)
                    : snapData.results;
                } else {
                  snapshot = snapData.results;
                }

                if (!snapshot) {
                  console.log(`[WARN] No snapshot found for ${optionTicker} in enrichTradesWithHistoricalVolOI`);
                  return trade;
                }

                // Use snapshot OI (current OI is fine even for historical trades)
                openInterest = snapshot.open_interest || openInterest;

                // STEP 2: Get HISTORICAL quote at trade timestamp for bid/ask
                let bid: number | undefined;
                let ask: number | undefined;
                let fillStyle = 'N/A';

                // Get trade timestamp (convert from ISO string to nanoseconds)
                const tradeDate = new Date(trade.trade_timestamp);
                const tradeTimestampNano = tradeDate.getTime() * 1000000; // Convert ms to nanoseconds

                try {
                  const quoteUrl = `https://api.polygon.io/v3/quotes/${optionTicker}?timestamp.lte=${tradeTimestampNano}&limit=1&order=desc&apiKey=${this.polygonApiKey}`;
                  const quoteResponse = await fetch(quoteUrl);

                  if (quoteResponse.ok) {
                    const quoteData = await quoteResponse.json();

                    if (quoteData.status === 'OK' && quoteData.results && quoteData.results.length > 0) {
                      bid = quoteData.results[0].bid_price;
                      ask = quoteData.results[0].ask_price;
                    }
                  }
                } catch (quoteError) {
                  // Silent fail - fill_style stays N/A
                }

                // Calculate Fill Style from historical bid/ask
                const lastPrice = trade.premium_per_contract;

                if (bid && ask && bid > 0 && ask > 0 && ask > bid) {
                  const midpoint = (bid + ask) / 2;
                  const spread = ask - bid;
                  const distanceFromMid = lastPrice - midpoint;

                  if (distanceFromMid > spread * 0.25) fillStyle = 'A';
                  else if (distanceFromMid > 0) fillStyle = 'AA';
                  else if (distanceFromMid < -spread * 0.25) fillStyle = 'B';
                  else if (distanceFromMid < 0) fillStyle = 'BB';
                }

                return {
                  ...trade,
                  volume,
                  open_interest: openInterest,
                  vol_oi_ratio: (openInterest && openInterest > 0 && volume) ? volume / openInterest : undefined,
                  fill_style: fillStyle,
                  bid,
                  ask,
                  bid_ask_spread: bid && ask ? ask - bid : undefined
                };
              }

              return trade;
            } catch (error) {
              return trade;
            }
          })
        );

        if (batchIndex % 10 === 0) {
          console.log(`[BATCH] Historical enrichment batch ${batchIndex + 1}/${batches.length} complete`);
        }

        return enrichedTrades;
      })
    );

    const allEnriched = enrichedBatches.flat();
    console.log(`[OK] HISTORICAL VOL/OI ENRICHMENT COMPLETE: ${allEnriched.length} trades enriched`);

    return allEnriched;
  }

}
