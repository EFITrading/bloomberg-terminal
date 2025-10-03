import { TOP_1000_SYMBOLS } from './Top1000Symbols';

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
}

interface PremiumTier {
  name: string;
  minPrice: number;
  minSize: number;
  minTotal?: number;
}

export class OptionsFlowService {
  private polygonApiKey: string;
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

  async fetchLiveOptionsFlow(ticker?: string): Promise<ProcessedTrade[]> {
    console.log(`🎯 FETCHING LIVE OPTIONS FLOW WITH SWEEP DETECTION FOR: ${ticker || 'MARKET-WIDE SCAN'}`);
    
    // Get list of tickers to scan - use smart batching for performance
    const tickersToScan = ticker ? [ticker] : this.getSmartTickerBatch();
    
    console.log(`🔍 Scanning ${tickersToScan.length} tickers for sweep activity...`);
    
    const allSweeps: ProcessedTrade[] = [];
    
    // Scan each ticker for sweeps with parallel processing
    const batchSize = 10; // Process 10 tickers at a time
    for (let i = 0; i < tickersToScan.length; i += batchSize) {
      const batch = tickersToScan.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (symbol: string) => {
        try {
          const sweeps = await this.scanForSweeps(symbol);
          if (sweeps.length > 0) {
            console.log(`🌊 Found ${sweeps.length} sweeps for ${symbol}`);
            return sweeps;
          }
          return [];
        } catch (error) {
          console.error(`Error scanning ${symbol}:`, error);
          return [];
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach((sweeps: ProcessedTrade[]) => allSweeps.push(...sweeps));
      
      // Small delay between batches to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log(`🌊 Total sweeps detected across market: ${allSweeps.length}`);
    
    if (allSweeps.length > 0) {
      return allSweeps.sort((a, b) => b.total_premium - a.total_premium);
    }

    // Fallback to snapshot data if no sweeps found
    if (ticker) {
      const snapshotTrades = await this.fetchOptionsSnapshot(ticker);
      console.log(`📊 Retrieved ${snapshotTrades.length} snapshot trades`);
      return this.filterAndClassifyTrades(snapshotTrades, ticker);
    }
    
    return [];
  }

  private async fetchOptionsSnapshot(ticker: string): Promise<ProcessedTrade[]> {
    const url = `https://api.polygon.io/v3/snapshot/options/${ticker}?limit=100&apikey=${this.polygonApiKey}`;
    
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

        const spotPrice = contract.underlying_asset?.price || 0;
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

  private filterAndClassifyTrades(trades: ProcessedTrade[], targetTicker?: string): ProcessedTrade[] {
    console.log(`🔍 Filtering ${trades.length} trades${targetTicker ? ` for ${targetTicker}` : ''}`);
    
    let filtered = trades;
    
    // Filter by ticker if specified
    if (targetTicker) {
      filtered = filtered.filter(trade => trade.underlying_ticker === targetTicker);
      console.log(`📊 After ticker filter: ${filtered.length} trades`);
    }
    
    // Filter by premium tiers
    filtered = filtered.filter(trade => this.passesAnyPremiumTier(trade));
    console.log(`💰 After premium filter: ${filtered.length} trades`);
    
    // Filter for ATM/ITM/OTM within 5% range
    filtered = filtered.filter(trade => this.isWithinMoneyRange(trade));
    console.log(`🎯 After moneyness filter: ${filtered.length} trades`);
    
    // Classify trade types
    filtered = filtered.map(trade => this.classifyTradeType(trade));
    
    // Sort by timestamp (newest first)
    filtered.sort((a, b) => b.trade_timestamp.getTime() - a.trade_timestamp.getTime());
    
    return filtered;
  }

  private passesAnyPremiumTier(trade: ProcessedTrade): boolean {
    return this.premiumTiers.some(tier => {
      const passesPrice = trade.premium_per_contract >= tier.minPrice;
      const passesSize = trade.trade_size >= tier.minSize;
      const passesTotal = !tier.minTotal || trade.total_premium >= tier.minTotal;
      return passesPrice && passesSize && passesTotal;
    });
  }

  private isWithinMoneyRange(trade: ProcessedTrade): boolean {
    if (trade.spot_price <= 0) return false;
    
    // Allow ALL OTM and ATM trades, but exclude trades more than 5% ITM
    if (trade.type === 'call') {
      // For calls: ITM when stock > strike, so exclude if stock is >5% above strike
      const percentITM = (trade.spot_price - trade.strike) / trade.strike;
      return percentITM <= 0.05; // Allow ATM, OTM, and up to 5% ITM calls
    } else {
      // For puts: ITM when stock < strike, so exclude if stock is >5% below strike  
      const percentITM = (trade.strike - trade.spot_price) / trade.strike;
      return percentITM <= 0.05; // Allow ATM, OTM, and up to 5% ITM puts
    }
  }

  private classifyTradeType(trade: ProcessedTrade): ProcessedTrade {
    // Correct classification:
    // BLOCK = Large trade ($50k+) filled on ONE exchange only
    // SWEEP = Trade filled across MULTIPLE exchanges simultaneously
    let tradeType: 'SWEEP' | 'BLOCK' | 'MULTI-LEG' | 'SPLIT' | undefined;
    
    // BLOCK: Single exchange trade with $50k+ premium
    if (trade.total_premium >= 50000 && !trade.window_group?.includes('exchanges')) {
      tradeType = 'BLOCK';
    }
    // SWEEP: Already classified in detectSweeps() - multiple exchanges
    else if (trade.trade_type === 'SWEEP') {
      tradeType = 'SWEEP';
    }
    
    return {
      ...trade,
      trade_type: tradeType
    };
  }

  // Keep this method for compatibility with existing API endpoints
  async processRawTradesData(rawTrades: OptionsTradeData[], requestedTicker?: string): Promise<ProcessedTrade[]> {
    console.log(`🔧 Processing ${rawTrades.length} raw trades for ${requestedTicker || 'ALL'} tickers`);
    
    if (rawTrades.length === 0) {
      console.log('⚠️ No raw trades to process');
      return [];
    }

    // Convert to ProcessedTrade format (this is for backward compatibility)
    const converted = rawTrades.map(raw => this.convertRawToProcessed(raw)).filter(t => t !== null);
    
    // Apply filtering
    return this.filterAndClassifyTrades(converted, requestedTicker);
  }

  private convertRawToProcessed(rawTrade: OptionsTradeData): ProcessedTrade | null {
    // Parse the options ticker to extract information
    const parsed = this.parseOptionsTicker(rawTrade.ticker);
    if (!parsed) return null;

    // For raw trades, we don't have spot price easily available, so we'll use a placeholder
    // In a real implementation, you'd fetch current stock prices
    const estimatedSpotPrice = parsed.strike; // Placeholder

    const trade: ProcessedTrade = {
      ticker: rawTrade.ticker,
      underlying_ticker: parsed.underlying,
      strike: parsed.strike,
      expiry: parsed.expiry,
      type: parsed.type,
      trade_size: rawTrade.size,
      premium_per_contract: rawTrade.price,
      total_premium: rawTrade.price * rawTrade.size * 100,
      spot_price: estimatedSpotPrice,
      exchange: rawTrade.exchange,
      exchange_name: this.exchangeNames[rawTrade.exchange] || 'UNKNOWN',
      sip_timestamp: rawTrade.sip_timestamp,
      conditions: rawTrade.conditions,
      trade_timestamp: new Date(rawTrade.sip_timestamp / 1000000),
      trade_type: undefined,
      window_group: undefined,
      related_trades: [],
      moneyness: 'OTM', // Placeholder
      days_to_expiry: 30 // Placeholder
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
    
    try {
      // Get stock price first
      const stockUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apikey=${this.polygonApiKey}`;
      const stockResponse = await fetch(stockUrl);
      const stockData = await stockResponse.json();
      const stockPrice = stockData.results?.[0]?.c || 50;

      // Generate strike prices around current price
      const strikes = [];
      const baseStrike = Math.floor(stockPrice);
      for (let i = -10; i <= 10; i++) {
        strikes.push(baseStrike + i);
      }

      // Get next 4 Friday expirations
      const expirations = this.getNextExpirations(4);
      
      const allTrades: any[] = [];

      // Scan each option contract
      for (const exp of expirations) {
        for (const strike of strikes) {
          for (const type of ['C', 'P']) {
            const strikeStr = (strike * 1000).toString().padStart(8, '0');
            const optionTicker = `O:${ticker}${exp}${type}${strikeStr}`;
            
            const url = `https://api.polygon.io/v3/trades/${optionTicker}?timestamp.gte=${Date.now() - 24*60*60*1000}000000&limit=1000&apikey=${this.polygonApiKey}`;
            
            try {
              const response = await fetch(url);
              const data = await response.json();
              
              if (data.results && data.results.length > 0) {
                allTrades.push(...data.results.map((trade: any) => ({
                  ...trade,
                  ticker: optionTicker,
                  strike: strike,
                  expiration: exp,
                  type: type === 'C' ? 'call' : 'put',
                  symbol: ticker,
                  spot_price: stockPrice
                })));
              }
            } catch (e) {
              // Skip individual contract errors
            }
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 20));
          }
        }
      }

      console.log(`📊 Found ${allTrades.length} total trades, detecting sweeps...`);

      // Detect sweeps from all trades
      const sweeps = this.detectSweeps(allTrades);
      
      console.log(`🌊 Detected ${sweeps.length} sweep patterns`);
      
      return sweeps;

    } catch (error) {
      console.error('Error scanning for sweeps:', error);
      return [];
    }
  }

  private detectSweeps(allTrades: any[]): ProcessedTrade[] {
    const sweeps: ProcessedTrade[] = [];
    
    // Group trades by strike, type, expiration, and price within 1-second windows
    const groups: { [key: string]: any[] } = {};
    
    allTrades.forEach(trade => {
      const timeWindow = Math.floor(trade.timestamp / 1000000000); // 1-second windows
      const key = `${trade.symbol}_${trade.strike}_${trade.type}_${trade.expiration}_${trade.price}_${timeWindow}`;
      
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(trade);
    });

    // Identify sweeps (multiple trades across different exchanges)
    Object.values(groups).forEach(group => {
      if (group.length > 1) {
        const exchanges = [...new Set(group.map(t => t.exchange))];
        
        // Must hit multiple exchanges to be considered a sweep
        if (exchanges.length > 1) {
          const totalSize = group.reduce((sum, t) => sum + t.size, 0);
          const totalPremium = group.reduce((sum, t) => sum + (t.price * t.size * 100), 0);
          const avgTimestamp = group.reduce((sum, t) => sum + t.timestamp, 0) / group.length;
          
          // Only include significant sweeps (100+ contracts or $10k+ premium)
          if (totalSize >= 100 || totalPremium >= 10000) {
            const firstTrade = group[0];
            const expiry = this.formatExpiry(firstTrade.expiration);
            
            sweeps.push({
              ticker: `O:${firstTrade.symbol}${firstTrade.expiration}${firstTrade.type === 'call' ? 'C' : 'P'}${(firstTrade.strike * 1000).toString().padStart(8, '0')}`,
              underlying_ticker: firstTrade.symbol,
              strike: firstTrade.strike,
              expiry: expiry,
              type: firstTrade.type,
              trade_size: totalSize,
              premium_per_contract: firstTrade.price,
              total_premium: totalPremium,
              spot_price: firstTrade.spot_price,
              exchange: exchanges[0], // Primary exchange
              exchange_name: this.exchangeNames[exchanges[0]] || `${exchanges.length} Exchanges`,
              sip_timestamp: avgTimestamp,
              conditions: [],
              trade_timestamp: new Date(avgTimestamp / 1000000),
              trade_type: 'SWEEP',
              moneyness: this.getMoneyness(firstTrade.strike, firstTrade.spot_price, firstTrade.type),
              days_to_expiry: this.getDaysToExpiry(expiry),
              window_group: `${exchanges.length} exchanges: ${exchanges.map(e => this.exchangeNames[e] || e).join(', ')}`
            });
          }
        }
      }
    });

    return sweeps.sort((a, b) => b.total_premium - a.total_premium);
  }

  private getNextExpirations(count: number): string[] {
    const expirations = [];
    const today = new Date();
    
    for (let i = 0; i < count * 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      
      // Only Fridays (day 5) for standard options
      if (date.getDay() === 5) {
        const year = date.getFullYear().toString().slice(-2);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        expirations.push(`${year}${month}${day}`);
        
        if (expirations.length >= count) break;
      }
    }
    
    return expirations;
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
    // Use the Top 1000 symbols list for comprehensive market scanning
    return TOP_1000_SYMBOLS;
  }

  private getSmartTickerBatch(): string[] {
    // Smart batching: prioritize most active options tickers first
    // Take top 200 for initial scan to balance speed vs coverage
    const priorityTickers = [
      // ETFs and most active options
      'SPY', 'QQQ', 'IWM', 'XLF', 'XLE', 'XLK', 'GDX', 'EEM', 'FXI', 'VXX',
      // Mega caps with high options volume
      'TSLA', 'AAPL', 'NVDA', 'AMZN', 'MSFT', 'GOOGL', 'META', 'AMD', 'NFLX', 'DIS',
      // Add top 180 from our full list
      ...TOP_1000_SYMBOLS.slice(0, 180)
    ];
    
    // Remove duplicates and return
    return [...new Set(priorityTickers)];
  }
}