interface OptionQuote {
 bid: number;
 ask: number;
 mid: number;
}

interface PremiumImbalance {
 symbol: string;
 stockPrice: number;
 atmStrike: number; // Midpoint between the OTM call and put strikes
 callMid: number;
 callBid: number;
 callAsk: number;
 callSpreadPercent: number;
 putMid: number;
 putBid: number;
 putAsk: number;
 putSpreadPercent: number;
 premiumDifference: number;
 imbalancePercent: number;
 expensiveSide: 'CALLS' | 'PUTS';
 imbalanceSeverity: 'EXTREME' | 'HIGH' | 'MODERATE';
 strikeSpacing: number; // The spacing between strikes (e.g., 1, 2.5, 5, 10)
 putStrike: number; // First OTM put strike (below stock price)
 callStrike: number; // First OTM call strike (above stock price)
}

class PremiumImbalanceScanner {
 private readonly API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
 private readonly CONCURRENT_REQUESTS = 10; // Process 10 symbols at once for faster scanning
 private readonly REQUEST_DELAY = 25; // Reduced delay between batches for 1000+ stocks

 getNextMonthlyExpiry(): string {
 const today = new Date();
 const year = today.getFullYear();
 const month = today.getMonth();
 
 const nextMonth = new Date(year, month + 1, 1);
 
 let day = 1;
 while (new Date(nextMonth.getFullYear(), nextMonth.getMonth(), day).getDay() !== 5) {
 day++;
 }
 
 const thirdFriday = day + 14;
 const expiryDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), thirdFriday);
 
 const yyyy = expiryDate.getFullYear();
 const mm = String(expiryDate.getMonth() + 1).padStart(2, '0');
 const dd = String(expiryDate.getDate()).padStart(2, '0');
 
 return `${yyyy}-${mm}-${dd}`;
 }

 /**
 * Scan with streaming callback for real-time results
 * Symbols are processed in order of market cap (largest first)
 */
 async *scanSymbolsStream(
 symbols: string[],
 maxSpreadPercent: number = 5
 ): AsyncGenerator<{
 type: 'progress' | 'result' | 'complete' | 'error';
 symbol?: string;
 result?: PremiumImbalance;
 progress?: { current: number; total: number };
 error?: string;
 }> {
 const expiry = this.getNextMonthlyExpiry();
 console.log(` Scanning ${symbols.length} symbols for monthly expiry: ${expiry}`);
 console.log(` Scanning in market cap order - largest companies first`);
 
 const symbolList = symbols.map(s => s.trim().toUpperCase());
 const total = symbolList.length;
 let current = 0;

 // Process sequentially but with optimized batching for 1000+ stocks
 for (let i = 0; i < symbolList.length; i += this.CONCURRENT_REQUESTS) {
 const batch = symbolList.slice(i, i + this.CONCURRENT_REQUESTS);
 
 // Process batch sequentially to maintain yield context
 for (const symbol of batch) {
 try {
 current++;
 
 // Send progress update every 10 symbols to reduce overhead
 if (current % 10 === 0 || current === 1) {
 yield {
 type: 'progress' as const,
 symbol,
 progress: { current, total }
 };
 }

 const imbalance = await this.analyzeSymbol(symbol, expiry, maxSpreadPercent);
 
 if (imbalance) {
 // Send result immediately as found
 yield {
 type: 'result' as const,
 result: imbalance
 };
 console.log(` ${symbol}: ${imbalance.imbalancePercent.toFixed(1)}% imbalance (${imbalance.expensiveSide})`);
 }
 } catch (error) {
 console.error(` Error analyzing ${symbol}:`, error);
 yield {
 type: 'error' as const,
 symbol,
 error: error instanceof Error ? error.message : 'Unknown error'
 };
 }
 }

 // Small delay between batches to avoid rate limits
 if (i + this.CONCURRENT_REQUESTS < symbolList.length) {
 await new Promise(resolve => setTimeout(resolve, this.REQUEST_DELAY));
 }
 }

 yield {
 type: 'complete' as const
 };
 }

 private async analyzeSymbol(
 symbol: string,
 expiry: string,
 maxSpreadPercent: number
 ): Promise<PremiumImbalance | null> {
 
 // Fetch stock price and option chain in parallel
 const [stockPrice, chainData] = await Promise.all([
 this.getStockPrice(symbol),
 this.getOptionChain(symbol, expiry)
 ]);

 if (!stockPrice || !chainData || chainData.length === 0) {
 return null;
 }

 // Get all available strikes and determine strike spacing
 const strikes = this.getAvailableStrikes(chainData);
 if (strikes.length < 3) return null; // Need at least 3 strikes to find ATM

 const strikeSpacing = this.determineStrikeSpacing(strikes);
 if (!strikeSpacing) return null;

  // Find the first OTM strikes: call strike above stock price, put strike below stock price
  const { callStrike, putStrike } = this.findOTMStrikes(stockPrice, strikes);
  if (!callStrike || !putStrike) return null;

  // Check if stock price is close enough to midpoint between ACTUAL strikes
  if (!this.isStockAtMidpoint(stockPrice, putStrike, callStrike)) {
    return null;
  } // Get quotes for the OTM call (above stock) and OTM put (below stock)
 const callQuote = this.extractQuoteFromChain(chainData, callStrike, 'call');
 const putQuote = this.extractQuoteFromChain(chainData, putStrike, 'put');

 if (!callQuote || !putQuote) return null;

 // Calculate spreads
 const callSpread = callQuote.ask - callQuote.bid;
 const callSpreadPercent = (callSpread / callQuote.mid) * 100;
 
 const putSpread = putQuote.ask - putQuote.bid;
 const putSpreadPercent = (putSpread / putQuote.mid) * 100;

 // Filter wide spreads
 if (callSpreadPercent > maxSpreadPercent || putSpreadPercent > maxSpreadPercent) {
 return null;
 }

 // Calculate imbalance
 const premiumDifference = callQuote.mid - putQuote.mid;
 const avgPremium = (callQuote.mid + putQuote.mid) / 2;
 const imbalancePercent = (premiumDifference / avgPremium) * 100;

 // Classify
 const expensiveSide = premiumDifference > 0 ? 'CALLS' : 'PUTS';
 const absImbalance = Math.abs(imbalancePercent);

 let imbalanceSeverity: 'EXTREME' | 'HIGH' | 'MODERATE';
 if (absImbalance > 40) imbalanceSeverity = 'EXTREME';
 else if (absImbalance > 25) imbalanceSeverity = 'HIGH';
 else if (absImbalance > 15) imbalanceSeverity = 'MODERATE';
 else return null;

 return {
 symbol,
 stockPrice,
 atmStrike: (callStrike + putStrike) / 2, // Midpoint between the two OTM strikes
 callMid: callQuote.mid,
 callBid: callQuote.bid,
 callAsk: callQuote.ask,
 callSpreadPercent,
 putMid: putQuote.mid,
 putBid: putQuote.bid,
 putAsk: putQuote.ask,
 putSpreadPercent,
 premiumDifference,
 imbalancePercent,
 expensiveSide,
 imbalanceSeverity,
 strikeSpacing,
 putStrike, // OTM put strike (below stock price)
 callStrike // OTM call strike (above stock price)
 };
 }

 private getAvailableStrikes(chainData: any[]): number[] {
 const strikes = new Set<number>();
 chainData.forEach(option => {
 if (option.details?.strike_price) {
 strikes.add(option.details.strike_price);
 }
 });
 return Array.from(strikes).sort((a, b) => a - b);
 }

 private determineStrikeSpacing(strikes: number[]): number | null {
 if (strikes.length < 2) return null;
 
 // Calculate the most common spacing between consecutive strikes
 const spacings = new Map<number, number>();
 for (let i = 1; i < strikes.length; i++) {
 const spacing = Math.round((strikes[i] - strikes[i-1]) * 100) / 100; // Round to avoid float precision issues
 spacings.set(spacing, (spacings.get(spacing) || 0) + 1);
 }
 
 // Return the most common spacing
 let maxCount = 0;
 let mostCommonSpacing = null;
 for (const [spacing, count] of spacings.entries()) {
 if (count > maxCount) {
 maxCount = count;
 mostCommonSpacing = spacing;
 }
 }
 
 return mostCommonSpacing;
 }

 private isStockAtMidpoint(stockPrice: number, lowerStrike: number, upperStrike: number): boolean {
 // Calculate midpoint between the actual OTM strikes
 const midpoint = (lowerStrike + upperStrike) / 2;
 
 // Determine tolerance based on strike spacing
 const strikeSpacing = upperStrike - lowerStrike;
 let tolerance: number;
 if (strikeSpacing >= 10) tolerance = 1.0; // $10 apart -> $1 tolerance
 else if (strikeSpacing >= 5) tolerance = 0.5; // $5 apart -> $0.5 tolerance
 else if (strikeSpacing >= 2.5) tolerance = 0.25; // $2.5 apart -> $0.25 tolerance
 else if (strikeSpacing >= 1) tolerance = 0.1; // $1 apart -> $0.1 tolerance
 else tolerance = 0.05; // Very tight strikes -> $0.05 tolerance
 
 const difference = Math.abs(stockPrice - midpoint);
 return difference <= tolerance;
 }

 private findOTMStrikes(stockPrice: number, strikes: number[]): { callStrike: number | null, putStrike: number | null } {
 // Find the first strike above stock price (OTM call)
 let callStrike: number | null = null;
 for (const strike of strikes.sort((a, b) => a - b)) {
 if (strike > stockPrice) {
 callStrike = strike;
 break;
 }
 }
 
 // Find the first strike below stock price (OTM put) 
 let putStrike: number | null = null;
 for (const strike of strikes.sort((a, b) => b - a)) {
 if (strike < stockPrice) {
 putStrike = strike;
 break;
 }
 }
 
 return { callStrike, putStrike };
 }

 private async getStockPrice(symbol: string): Promise<number | null> {
 try {
 const url = `https://api.polygon.io/v2/last/trade/${symbol}?apiKey=${this.API_KEY}`;
 const response = await fetch(url);
 if (!response.ok) return null;
 
 const data = await response.json();
 return data.results?.p || null;
 } catch (error) {
 return null;
 }
 }

 private async getOptionChain(symbol: string, expiry: string): Promise<any> {
 try {
 const url = `https://api.polygon.io/v3/snapshot/options/${symbol}?expiration_date=${expiry}&limit=250&apiKey=${this.API_KEY}`;
 const response = await fetch(url);
 
 if (!response.ok) return null;
 
 const data = await response.json();
 return data.results || null;
 } catch (error) {
 return null;
 }
 }

 private extractQuoteFromChain(
 chainData: any[],
 strike: number,
 type: 'call' | 'put'
 ): OptionQuote | null {
 const contract = chainData.find(
 c => c.details.strike_price === strike && 
 c.details.contract_type === type
 );

 if (!contract?.last_quote) return null;

 const quote = contract.last_quote;
 if (!quote.bid || !quote.ask || quote.bid <= 0 || quote.ask <= 0) {
 return null;
 }

 return {
 bid: quote.bid,
 ask: quote.ask,
 mid: (quote.bid + quote.ask) / 2
 };
 }
}

export const premiumScanner = new PremiumImbalanceScanner();
export type { PremiumImbalance, OptionQuote };