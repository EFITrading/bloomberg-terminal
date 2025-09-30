import { NextRequest, NextResponse } from 'next/server';
import { saveOptionsFlow } from '@/lib/database';
import { v4 as uuidv4 } from 'uuid';

interface OptionsContract {
  ticker: string;
  underlying_ticker: string;
  strike: number;
  expiry: string;
  type: 'call' | 'put';
  trade_size: number; // Individual trade size, not daily volume
  premium_per_contract: number; // Price per contract
  total_premium: number; // Total dollar value of this trade
  timestamp: number;
  exchange: number;
  conditions: number[];
  flow_type?: 'bullish' | 'bearish' | 'neutral';
  trade_type?: 'block' | 'sweep'; // Simplified: block (>$80K single fill) or sweep (multi-exchange)
  above_ask?: boolean;
  below_bid?: boolean;
  // Enhanced trade intention analysis
  trade_intention?: 'BUY_TO_OPEN' | 'SELL_TO_OPEN' | 'BUY_TO_CLOSE' | 'SELL_TO_CLOSE' | 'UNKNOWN';
  bid_price?: number;
  ask_price?: number;
  mid_price?: number;
  price_vs_mid?: 'ABOVE' | 'BELOW' | 'AT_MID';
  open_interest?: number;
  daily_volume?: number;
  unusual_activity?: boolean;
}

interface FlowFilters {
  minPremium: number;
  maxPremium: number;
  minVolume: number;
  underlyingSymbols: string[];
  callsOnly: boolean;
  putsOnly: boolean;
  unusualOnly: boolean;
  sweepsOnly: boolean;
}

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

// Function to analyze trade intention based on price action and market data
function analyzeTradeIntention(
  tradePrice: number,
  bidPrice: number | undefined,
  askPrice: number | undefined,
  tradeSize: number,
  openInterest: number | undefined,
  conditions: number[]
): {
  intention: 'BUY_TO_OPEN' | 'SELL_TO_OPEN' | 'BUY_TO_CLOSE' | 'SELL_TO_CLOSE' | 'UNKNOWN';
  priceVsMid: 'ABOVE' | 'BELOW' | 'AT_MID';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
} {
  
  if (!bidPrice || !askPrice) {
    return { intention: 'UNKNOWN', priceVsMid: 'AT_MID', confidence: 'LOW' };
  }
  
  const midPrice = (bidPrice + askPrice) / 2;
  const spread = askPrice - bidPrice;
  const priceThreshold = spread * 0.3; // 30% of spread as threshold
  
  let priceVsMid: 'ABOVE' | 'BELOW' | 'AT_MID';
  let intention: 'BUY_TO_OPEN' | 'SELL_TO_OPEN' | 'BUY_TO_CLOSE' | 'SELL_TO_CLOSE' | 'UNKNOWN';
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  
  // Determine price position relative to mid
  if (tradePrice > midPrice + priceThreshold) {
    priceVsMid = 'ABOVE';
  } else if (tradePrice < midPrice - priceThreshold) {
    priceVsMid = 'BELOW';
  } else {
    priceVsMid = 'AT_MID';
  }
  
  // Analyze trade conditions for additional clues
  const hasOpeningCondition = conditions.some(c => [12, 13, 37].includes(c)); // Opening trade indicators
  const hasClosingCondition = conditions.some(c => [14, 15, 41].includes(c)); // Closing trade indicators
  
  // Primary logic: Price-based intention analysis
  if (tradePrice >= askPrice - 0.01) {
    // Trade at or above ask = BUYER initiated (aggressive buying)
    if (hasClosingCondition) {
      intention = 'BUY_TO_CLOSE'; // Covering a short position
      confidence = 'HIGH';
    } else {
      intention = 'BUY_TO_OPEN'; // Opening new long position
      confidence = hasOpeningCondition ? 'HIGH' : 'MEDIUM';
    }
  } else if (tradePrice <= bidPrice + 0.01) {
    // Trade at or below bid = SELLER initiated (aggressive selling)
    if (hasClosingCondition) {
      intention = 'SELL_TO_CLOSE'; // Closing a long position
      confidence = 'HIGH';
    } else {
      intention = 'SELL_TO_OPEN'; // Opening new short position
      confidence = hasOpeningCondition ? 'HIGH' : 'MEDIUM';
    }
  } else {
    // Trade between bid and ask
    if (priceVsMid === 'ABOVE') {
      intention = 'BUY_TO_OPEN'; // Leaning bullish
      confidence = 'MEDIUM';
    } else if (priceVsMid === 'BELOW') {
      intention = 'SELL_TO_OPEN'; // Leaning bearish
      confidence = 'MEDIUM';
    } else {
      intention = 'UNKNOWN';
      confidence = 'LOW';
    }
  }
  
  // Volume vs Open Interest analysis (if available)
  if (openInterest !== undefined && tradeSize > 0) {
    const volumeToOIRatio = tradeSize / Math.max(openInterest, 1);
    
    // Very high volume vs OI suggests closing trades
    if (volumeToOIRatio > 0.5) {
      if (intention === 'BUY_TO_OPEN') intention = 'BUY_TO_CLOSE';
      if (intention === 'SELL_TO_OPEN') intention = 'SELL_TO_CLOSE';
      confidence = confidence === 'LOW' ? 'MEDIUM' : confidence;
    }
  }
  
  return { intention, priceVsMid, confidence };
}

// BlackBoxStocks-style trade consolidation function
function consolidateTrades(trades: OptionsContract[]): OptionsContract[] {
  console.log('🔄 Consolidating fragmented trades BlackBoxStocks-style...');
  
  // Group trades by contract identifier and price point
  const tradeGroups = new Map<string, OptionsContract[]>();
  
  trades.forEach(trade => {
    // Create unique key for grouping: ticker + strike + type + price + time window
    const timeWindow = Math.floor(trade.timestamp / (30 * 1000000000)); // 30-second windows
    const groupKey = `${trade.ticker}-${trade.premium_per_contract.toFixed(2)}-${timeWindow}`;
    
    if (!tradeGroups.has(groupKey)) {
      tradeGroups.set(groupKey, []);
    }
    tradeGroups.get(groupKey)!.push(trade);
  });
  
  const consolidatedTrades: OptionsContract[] = [];
  
  tradeGroups.forEach((groupTrades) => {
    if (groupTrades.length === 1) {
      // Single trade - check if it's a block (>$80K)
      const trade = groupTrades[0];
      if (trade.total_premium >= 80000) {
        trade.trade_type = 'block'; // Single fill block order >$80K
      } else {
        trade.trade_type = 'sweep'; // Smaller individual trade
      }
      consolidatedTrades.push(trade);
    } else {
      // Multiple trades in same time window - consolidate into single "sweep"
      const consolidatedTrade = groupTrades[0]; // Use first as template
      consolidatedTrade.trade_size = groupTrades.reduce((sum, t) => sum + t.trade_size, 0);
      consolidatedTrade.total_premium = groupTrades.reduce((sum, t) => sum + t.total_premium, 0);
      consolidatedTrade.trade_type = 'sweep'; // Multi-fill = sweep
      
      console.log(`🔗 Consolidated ${groupTrades.length} trades into sweep: ${consolidatedTrade.underlying_ticker} ${consolidatedTrade.type} $${consolidatedTrade.strike} = $${(consolidatedTrade.total_premium/1000).toFixed(0)}K`);
      
      consolidatedTrades.push(consolidatedTrade);
    }
  });
  
  // Sort by premium descending
  return consolidatedTrades.sort((a, b) => b.total_premium - a.total_premium);
}

export async function GET(request: NextRequest) {
  console.log('🚀 OPTIONS FLOW API CALLED - Starting FAST OTM-only parallel processing...');
  
  const searchParams = request.nextUrl.searchParams;
  
  const filters: FlowFilters = {
    minPremium: parseInt(searchParams.get('minPremium') || '50000'), // $50K minimum for faster scans
    maxPremium: parseInt(searchParams.get('maxPremium') || '5000000'),
    minVolume: parseInt(searchParams.get('minVolume') || '50'), // Minimum 50 contracts
    underlyingSymbols: [], // Will be populated dynamically
    callsOnly: searchParams.get('callsOnly') === 'true',
    putsOnly: searchParams.get('putsOnly') === 'true',
    unusualOnly: searchParams.get('unusualOnly') === 'true',
    sweepsOnly: searchParams.get('sweepsOnly') === 'true'
  };

  try {
    console.log('⚡ ULTRA-FAST PARALLEL OTM SCAN - Processing all S&P 500 tickers simultaneously...');
    
    const flowData: OptionsContract[] = [];
    const today = new Date().toISOString().split('T')[0]; // 2025-09-23
    
    // S&P 500 holdings for comprehensive institutional options flow coverage
    const sp500 = [
      // Technology - Mega Cap (Top 10)
      'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'TSLA', 'META', 'BRK.B', 'LLY',
      
      // Technology - Large Cap
      'AVGO', 'JPM', 'V', 'UNH', 'XOM', 'MA', 'PG', 'ORCL', 'HD', 'JNJ',
      'COST', 'ABBV', 'NFLX', 'CRM', 'BAC', 'KO', 'WMT', 'PFE', 'ADBE', 'MRK',
      'CSCO', 'AMD', 'PEP', 'TMO', 'ABT', 'LIN', 'INTC', 'DIS', 'ACN', 'VZ',
      'TXN', 'WFC', 'QCOM', 'DHR', 'SPGI', 'INTU', 'CMCSA', 'PM', 'RTX', 'AMGN',
      
      // Financial Services
      'GS', 'MS', 'AXP', 'BLK', 'C', 'USB', 'TFC', 'PNC', 'COF', 'SCHW',
      'CB', 'ICE', 'FI', 'MMC', 'AON', 'PGR', 'TRV', 'ALL', 'AIG', 'MET',
      'PRU', 'AFL', 'TROW', 'BK', 'STT', 'NTRS', 'RF', 'CFG', 'KEY', 'HBAN',
      
      // Healthcare & Pharmaceuticals
      'UNH', 'JNJ', 'PFE', 'ABBV', 'MRK', 'TMO', 'ABT', 'LLY', 'BMY', 'AMGN',
      'GILD', 'MDT', 'CVS', 'CI', 'HUM', 'ANTM', 'SYK', 'BSX', 'REGN', 'VRTX',
      'ZTS', 'EW', 'ISRG', 'A', 'IQV', 'RMD', 'IDXX', 'MTD', 'DGX', 'LH',
      'BAX', 'BDX', 'ELV', 'BIIB', 'ILMN', 'MRNA', 'TECH', 'ALGN', 'DXCM', 'HOLX',
      
      // Consumer Discretionary
      'AMZN', 'TSLA', 'HD', 'NKE', 'MCD', 'SBUX', 'LOW', 'TJX', 'BKNG', 'ABNB',
      'F', 'GM', 'CMG', 'ORLY', 'AZO', 'YUM', 'EBAY', 'ETSY', 'DECK', 'ULTA',
      'RCL', 'CCL', 'NCLH', 'MAR', 'HLT', 'MGM', 'WYNN', 'LVS', 'CZR', 'PENN',
      'DPZ', 'QSR', 'DKNG', 'CHTR', 'DIS', 'NFLX', 'WBD', 'PARA', 'FOX', 'FOXA',
      
      // Consumer Staples
      'PG', 'KO', 'WMT', 'PEP', 'COST', 'PM', 'MO', 'MDLZ', 'CL', 'KMB',
      'GIS', 'K', 'HSY', 'CAG', 'CPB', 'SJM', 'HRL', 'MKC', 'CHD', 'CLX',
      'TSN', 'TAP', 'STZ', 'BF.B', 'KR', 'SYY', 'ADM', 'WBA', 'CVS', 'KHC',
      
      // Energy
      'XOM', 'CVX', 'COP', 'EOG', 'SLB', 'PXD', 'PSX', 'VLO', 'MPC', 'HES',
      'OXY', 'BKR', 'HAL', 'FANG', 'DVN', 'EQT', 'CTRA', 'MRO', 'APA', 'EXE',
      'KMI', 'OKE', 'LNG', 'ET', 'EPD', 'WMB', 'TRGP', 'ENB', 'TRP', 'SU',
      
      // Industrials
      'CAT', 'RTX', 'HON', 'UPS', 'BA', 'LMT', 'DE', 'UNP', 'GE', 'MMM',
      'FDX', 'CSX', 'NSC', 'WM', 'RSG', 'EMR', 'ETN', 'ITW', 'PH', 'CMI',
      'GD', 'NOC', 'TDG', 'CARR', 'OTIS', 'PCAR', 'ROK', 'DOV', 'FTV', 'XYL',
      'IEX', 'FAST', 'PAYX', 'VRSK', 'BR', 'HUBB', 'SWK', 'LDOS', 'J', 'JBHT',
      
      // Materials
      'LIN', 'APD', 'ECL', 'SHW', 'FCX', 'NEM', 'DOW', 'DD', 'PPG', 'IFF',
      'VMC', 'MLM', 'NUE', 'STLD', 'PKG', 'IP', 'CF', 'FMC', 'ALB', 'MOS',
      'LYB', 'CE', 'WRK', 'AVY', 'SEE', 'BLL', 'CCK', 'SON', 'EMN', 'RPM',
      
      // Real Estate
      'PLD', 'AMT', 'CCI', 'EQIX', 'PSA', 'WELL', 'DLR', 'O', 'SBAC', 'EXR',
      'AVB', 'EQR', 'VTR', 'ESS', 'MAA', 'KIM', 'REG', 'FRT', 'BXP', 'HIW',
      'HST', 'ARE', 'UDR', 'CPT', 'SPG', 'SLG', 'VNO', 'KRC', 'BDN', 'AIV',
      
      // Utilities
      'NEE', 'SO', 'DUK', 'AEP', 'SRE', 'D', 'PEG', 'EXC', 'XEL', 'WEC',
      'ED', 'EIX', 'ETR', 'FE', 'ES', 'AWK', 'DTE', 'PPL', 'CMS', 'NI',
      'LNT', 'EVRG', 'AEE', 'CNP', 'NRG', 'IDA', 'PNW', 'OGE', 'PCG', 'AGR',
      
      // Communication Services
      'GOOGL', 'GOOG', 'META', 'NFLX', 'DIS', 'CMCSA', 'VZ', 'T', 'CHTR', 'TMUS',
      'ATVI', 'EA', 'TTWO', 'MTCH', 'SNAP', 'PINS', 'TWTR', 'DISH', 'SIRI', 'WBD',
      
      // Technology - Software & Services
      'CRM', 'ORCL', 'IBM', 'INTU', 'NOW', 'TEAM', 'WDAY', 'DDOG', 'ZM', 'OKTA',
      'SNOW', 'CRWD', 'FTNT', 'PANW', 'ZS', 'CYBR', 'SPLK', 'VEEV', 'DOCU', 'TWLO',
      'ESTC', 'MDB', 'NET', 'DDOG', 'PLTR', 'RBLX', 'U', 'PATH', 'BILL', 'PAYC',
      
      // Technology - Semiconductors
      'NVDA', 'AMD', 'INTC', 'QCOM', 'AVGO', 'TXN', 'AMAT', 'LRCX', 'KLAC', 'MRVL',
      'ADI', 'NXPI', 'MCHP', 'SWKS', 'QRVO', 'MPWR', 'ON', 'TER', 'ENTG', 'MKSI',
      
      // Technology - Hardware
      'AAPL', 'MSFT', 'CSCO', 'HPQ', 'NTAP', 'WDC', 'STX', 'JNPR', 'FFIV', 'AKAM',
      'CTSH', 'GLW', 'APH', 'TEL', 'KEYS', 'ZBRA', 'FLIR', 'MSI', 'CDW', 'IT',
      
      // ETFs and High-Volume Options
      'SPY', 'QQQ', 'IWM', 'DIA', 'XLF', 'XLK', 'XLE', 'XLV', 'XLI', 'XLU', 'XLB', 'XLRE', 'XLC'
    ];
    
    // **PARALLEL PROCESSING - Process ALL S&P 500 stocks simultaneously**
    const stockPromises = sp500.map(async (symbol) => { // Now processing full S&P 500!
      try {
        // Get current stock price first to filter OTM only
        const quoteResponse = await fetch(
          `https://api.polygon.io/v2/last/trade/${symbol}?apikey=${POLYGON_API_KEY}`
        );
        
        if (!quoteResponse.ok) return [];
        
        const quoteData = await quoteResponse.json();
        const currentPrice = quoteData.results?.p || 0;
        
        if (currentPrice === 0) return [];
        
        // Get active options contracts for this underlying
        const contractsResponse = await fetch(
          `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${symbol}&active=true&limit=150&apikey=${POLYGON_API_KEY}`
        );
        
        if (!contractsResponse.ok) return [];
        
        const contractsData = await contractsResponse.json();
        if (!contractsData.results || contractsData.results.length === 0) return [];
        
        console.log(`📊 ${symbol} @ $${currentPrice.toFixed(2)} - Scanning ${contractsData.results.length} contracts for OTM + 5% ITM blocks...`);
        
        const symbolFlowData: OptionsContract[] = [];
        
        // **PARALLEL CONTRACT PROCESSING - Process contracts in batches**
        const eligibleContracts = contractsData.results.filter((contract: any) => {
          const strike = contract.strike_price || 0;
          const contractType = contract.contract_type?.toLowerCase() as 'call' | 'put';
          
          // **ENHANCED FILTERING - OTM + 5% ITM for better flow detection**
          if (contractType === 'call') {
            // Calls: OTM (strike > current) + ITM up to 5% (strike >= current * 0.95)
            return strike > currentPrice || strike >= currentPrice * 0.95;
          } else if (contractType === 'put') {
            // Puts: OTM (strike < current) + ITM up to 5% (strike <= current * 1.05)
            return strike < currentPrice || strike <= currentPrice * 1.05;
          }
          return false;
        });
        
        console.log(`🎯 ${symbol}: Found ${eligibleContracts.length} eligible contracts (OTM + 5% ITM) out of ${contractsData.results.length} total`);
        
        // Process eligible contracts in parallel batches
        const batchSize = 8; // Process 8 contracts at once for speed
        const contractBatches = [];
        
        for (let i = 0; i < eligibleContracts.length && i < 40; i += batchSize) { // Limit to 40 per symbol
          const batch = eligibleContracts.slice(i, i + batchSize);
          contractBatches.push(batch);
        }
        
        for (const batch of contractBatches) {
          const batchPromises = batch.map(async (contract: any) => {
            const ticker = contract.ticker;
            if (!ticker) return [];
            
            const strike = contract.strike_price || 0;
            const contractType = contract.contract_type?.toLowerCase() as 'call' | 'put';
            
            try {
              // Get ALL trades for this OTM contract from market open today
              const todayStart = `${today}T13:30:00.000Z`; // Market open at 9:30 AM EDT (UTC-4)
              const now = new Date().toISOString();
              
              // Get trades AND quotes for intention analysis
              const [tradesResponse, quotesResponse] = await Promise.all([
                fetch(`https://api.polygon.io/v3/trades/${ticker}?timestamp.gte=${todayStart}&timestamp.lte=${now}&limit=100&order=desc&apikey=${POLYGON_API_KEY}`),
                fetch(`https://api.polygon.io/v3/quotes/${ticker}?timestamp.gte=${todayStart}&timestamp.lte=${now}&limit=50&order=desc&apikey=${POLYGON_API_KEY}`)
              ]);
              
              if (!tradesResponse.ok) return [];
              
              const tradesData = await tradesResponse.json();
              if (!tradesData.results || tradesData.results.length === 0) return [];
              
              // Get quotes data for bid/ask analysis
              const quotesData = quotesResponse.ok ? await quotesResponse.json() : null;
              const quotes = quotesData?.results || [];
              
              // Create a map of timestamps to quotes for efficient lookup
              const quoteMap = new Map();
              quotes.forEach((quote: any) => {
                const timeKey = Math.floor(quote.timestamp / (60 * 1000000000)); // 1-minute buckets
                if (!quoteMap.has(timeKey) || quote.timestamp > quoteMap.get(timeKey).timestamp) {
                  quoteMap.set(timeKey, quote);
                }
              });
              
              // Process trades for this eligible contract (OTM + 5% ITM)
              const contractTrades = tradesData.results.map((trade: any) => {
                const tradeSize = trade.size;
                const pricePerContract = trade.price;
                const totalPremium = tradeSize * pricePerContract * 100;
                
                // **BLACKBOXSTOCKS FILTERING - High value trades only**
                const isLargeBlock = (
                  (pricePerContract >= 15 && tradeSize >= 100) || // $150K+ on expensive options
                  (pricePerContract >= 8 && tradeSize >= 200) ||  // $160K+ on medium options
                  (pricePerContract >= 3 && tradeSize >= 500) ||  // $150K+ on cheaper options
                  totalPremium >= 80000 // Any $80K+ trade
                );
                
                if (!isLargeBlock || totalPremium < filters.minPremium) return null;
                
                // Apply option type filters
                if (filters.callsOnly && contractType !== 'call') return null;
                if (filters.putsOnly && contractType !== 'put') return null;
                
                const tradeType: 'block' | 'sweep' = totalPremium >= 80000 ? 'block' : 'sweep';
                
                // Find closest quote for bid/ask analysis
                const tradeTimeKey = Math.floor(trade.timestamp / (60 * 1000000000));
                let closestQuote = quoteMap.get(tradeTimeKey);
                
                // If no exact match, find closest quote within 5 minutes
                if (!closestQuote) {
                  for (let i = 0; i <= 5; i++) {
                    closestQuote = quoteMap.get(tradeTimeKey - i) || quoteMap.get(tradeTimeKey + i);
                    if (closestQuote) break;
                  }
                }
                
                // Analyze trade intention
                const intentionAnalysis = analyzeTradeIntention(
                  pricePerContract,
                  closestQuote?.bid,
                  closestQuote?.ask,
                  tradeSize,
                  undefined, // Open interest not available in this endpoint
                  trade.conditions || []
                );
                
                // Determine flow type based on intention and option type
                let flowType: 'bullish' | 'bearish' | 'neutral' = 'neutral';
                if (intentionAnalysis.intention === 'BUY_TO_OPEN') {
                  flowType = contractType === 'call' ? 'bullish' : 'bearish';
                } else if (intentionAnalysis.intention === 'SELL_TO_OPEN') {
                  flowType = contractType === 'call' ? 'bearish' : 'bullish';
                } else if (intentionAnalysis.intention === 'BUY_TO_CLOSE') {
                  flowType = contractType === 'call' ? 'bearish' : 'bullish'; // Covering shorts
                } else if (intentionAnalysis.intention === 'SELL_TO_CLOSE') {
                  flowType = contractType === 'call' ? 'bullish' : 'bearish'; // Taking profits
                }
                
                if (filters.sweepsOnly && tradeType !== 'sweep') return null;
                
                const midPrice = closestQuote ? (closestQuote.bid + closestQuote.ask) / 2 : undefined;
                
                return {
                  ticker: ticker,
                  underlying_ticker: symbol,
                  strike: strike,
                  expiry: contract.expiration_date || '',
                  type: contractType,
                  trade_size: tradeSize,
                  premium_per_contract: pricePerContract,
                  total_premium: totalPremium,
                  timestamp: trade.timestamp || Date.now(),
                  exchange: trade.exchange || 0,
                  conditions: trade.conditions || [],
                  flow_type: flowType,
                  trade_type: tradeType,
                  above_ask: closestQuote ? pricePerContract >= closestQuote.ask - 0.01 : false,
                  below_bid: closestQuote ? pricePerContract <= closestQuote.bid + 0.01 : false,
                  // Enhanced fields
                  trade_intention: intentionAnalysis.intention,
                  bid_price: closestQuote?.bid,
                  ask_price: closestQuote?.ask,
                  mid_price: midPrice,
                  price_vs_mid: intentionAnalysis.priceVsMid,
                  unusual_activity: intentionAnalysis.confidence === 'HIGH' && totalPremium >= 200000
                } as OptionsContract;
              }).filter(Boolean);
              
              return contractTrades;
              
            } catch {
              return [];
            }
          });
          
          const batchResults = await Promise.all(batchPromises);
          batchResults.forEach(contractTrades => {
            contractTrades.forEach((trade: any) => {
              if (trade) {
                symbolFlowData.push(trade);
                const intentionIcon = trade.trade_intention === 'BUY_TO_OPEN' ? '🟢📈' : 
                                     trade.trade_intention === 'SELL_TO_OPEN' ? '🔴📉' : 
                                     trade.trade_intention === 'BUY_TO_CLOSE' ? '🟡📈' : 
                                     trade.trade_intention === 'SELL_TO_CLOSE' ? '🟡📉' : '⚪';
                console.log(`💰 ${trade.trade_type.toUpperCase()}: ${symbol} ${trade.type} $${trade.strike} | ${trade.trade_size} contracts @ $${trade.premium_per_contract} = $${(trade.total_premium/1000).toFixed(0)}K ${intentionIcon} ${trade.trade_intention}`);
              }
            });
          });
          
          // Stop if we have enough for this symbol
          if (symbolFlowData.length >= 15) break;
        }
        
        return symbolFlowData;
        
      } catch (error) {
        console.error(`❌ Error processing ${symbol}:`, error);
        return [];
      }
    });
    
    // **AWAIT ALL PARALLEL PROCESSING**
    console.log('⏳ Waiting for all parallel OTM scans to complete...');
    const allResults = await Promise.all(stockPromises);
    
    // Flatten results
    allResults.forEach(symbolResults => {
      symbolResults.forEach(trade => flowData.push(trade));
    });
    
    console.log(`✅ ULTRA-FAST SCAN COMPLETE: Found ${flowData.length} OTM institutional trades`);
    
    // Apply BlackBoxStocks consolidation
    const consolidatedData = consolidateTrades(flowData);
    
    console.log(`🎯 Returning ${consolidatedData.length} consolidated OTM-only block/sweep trades`);
    
    // 💾 SAVE TO DATABASE - Persist all flow data for historical analysis
    try {
      const sessionId = uuidv4();
      await saveOptionsFlow(consolidatedData, sessionId);
      console.log(`📊 DATABASE: Saved ${consolidatedData.length} trades with session ${sessionId.slice(0, 8)}...`);
    } catch (dbError) {
      console.error('❌ Database save failed (continuing with response):', dbError);
    }
    
    return NextResponse.json({
      success: true,
      data: consolidatedData.slice(0, 100), // Limit results
      total: consolidatedData.length,
      timestamp: new Date().toISOString(),
      scan_type: 'parallel_otm_ultra_fast',
      scan_speed: 'OPTIMIZED',
      filters_applied: 'OTM_ONLY + 5% ITM',
      database_saved: true,
      message: `⚡ FAST SCAN: Found ${consolidatedData.length} OTM institutional options trades (saved to database)`
    });
    
  } catch (error) {
    console.error('❌ Options flow API error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch options flow data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}