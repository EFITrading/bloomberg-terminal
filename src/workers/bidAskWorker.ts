// Web Worker for parallel bid/ask analysis
// This runs in a separate thread to avoid blocking the main UI

interface TradeData {
 underlying_ticker: string;
 strike: number;
 expiry: string;
 type: string;
 trade_timestamp: string;
 premium_per_contract: number;
 total_premium: number;
 spot_price: number;
}

interface WorkerMessage {
 type: 'ANALYZE_BATCH';
 trades: TradeData[];
 batchId: number;
}

interface WorkerResponse {
 type: 'BATCH_COMPLETE';
 batchId: number;
 results: (TradeData & { executionType: string })[];
 error?: string;
}

// Polygon API key
const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

// Main worker function
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
 const { type, trades, batchId } = event.data;
 
 if (type === 'ANALYZE_BATCH') {
 try {
 console.log(` Worker ${batchId}: Processing ${trades.length} trades`);
 
 // Process all trades in this batch in parallel
 const results = await Promise.allSettled(
 trades.map(async (trade) => {
 try {
 // Create option ticker format
 const expiry = trade.expiry.replace(/-/g, '').slice(2);
 const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0');
 const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P';
 const optionTicker = `O:${trade.underlying_ticker}${expiry}${optionType}${strikeFormatted}`;
 
 // Get quote data with timeout
 const controller = new AbortController();
 const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
 
 const tradeTime = new Date(trade.trade_timestamp);
 const checkTime = new Date(tradeTime.getTime() - 2000);
 const checkTimestamp = checkTime.getTime() * 1000000;
 
 const quotesUrl = `https://api.polygon.io/v3/quotes/${optionTicker}?timestamp.lte=${checkTimestamp}&limit=1&apikey=${POLYGON_API_KEY}`;
 
 const response = await fetch(quotesUrl, { 
 signal: controller.signal,
 headers: {
 'Accept': 'application/json'
 }
 });
 
 clearTimeout(timeoutId);
 
 if (!response.ok) {
 throw new Error(`HTTP ${response.status}`);
 }
 
 const data = await response.json();
 
 let executionType = 'NEUTRAL';
 
 if (data.results && data.results.length > 0) {
 const quote = data.results[0];
 const bid = quote.bid_price;
 const ask = quote.ask_price;
 const fillPrice = trade.premium_per_contract;
 
 if (bid && ask && fillPrice && bid > 0 && ask > 0) {
 const mid = (bid + ask) / 2;
 
 // Correct fill criteria based on option type:
 // For CALLS: Ask/Mid = BULLISH (buying calls), Bid = BEARISH (selling calls)
 // For PUTS: Ask/Mid = BEARISH (buying puts), Bid = BULLISH (selling puts)
 
 const isCall = trade.type.toLowerCase() === 'call';
 
 if (fillPrice >= ask || fillPrice >= mid) {
 // Filled at ask or midpoint = aggressive buying
 executionType = isCall ? 'BULLISH' : 'BEARISH';
 } else if (fillPrice <= bid) {
 // Filled at bid = aggressive selling 
 executionType = isCall ? 'BEARISH' : 'BULLISH';
 } else {
 executionType = 'NEUTRAL';
 }
 }
 }
 
 return { ...trade, executionType };
 } catch (error) {
 return { ...trade, executionType: 'NEUTRAL' };
 }
 })
 );
 
 // Extract successful results
 const processedTrades = results.map(result => 
 result.status === 'fulfilled' ? result.value : null
 ).filter(Boolean) as (TradeData & { executionType: string })[];
 
 // Send results back to main thread
 const response: WorkerResponse = {
 type: 'BATCH_COMPLETE',
 batchId,
 results: processedTrades
 };
 
 self.postMessage(response);
 
 } catch (error) {
 const response: WorkerResponse = {
 type: 'BATCH_COMPLETE',
 batchId,
 results: [],
 error: error instanceof Error ? error.message : 'Unknown error'
 };
 
 self.postMessage(response);
 }
 }
};

// Export empty object to make this a module
export {};