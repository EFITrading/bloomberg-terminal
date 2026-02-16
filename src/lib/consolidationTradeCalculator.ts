/**
 * Consolidation Trade Calculator
 * Calculates straddle/strangle trades for stocks in consolidation (60%+ compression)
 * Buys 80% OTM calls AND puts with targets for potential breakout in either direction
 */

interface TradeSetup {
    symbol: string;
    currentPrice: number;
    period: '5-DAY' | '13-DAY';
    contractionPercent: number;

    // Call side
    callStrike: number;
    callPremium: number;
    callBid: number;
    callAsk: number;
    callTarget1: number;      // Stock price target 1 for calls
    callTarget1Premium: number;  // Expected option premium at target 1
    callTarget2: number;      // Stock price target 2 for calls
    callTarget2Premium: number;  // Expected option premium at target 2
    callImpliedVolatility: number;

    // Put side
    putStrike: number;
    putPremium: number;
    putBid: number;
    putAsk: number;
    putTarget1: number;       // Stock price target 1 for puts
    putTarget1Premium: number;   // Expected option premium at target 1
    putTarget2: number;       // Stock price target 2 for puts
    putTarget2Premium: number;   // Expected option premium at target 2
    putImpliedVolatility: number;

    // Expiration
    expiration: string;
    daysToExpiration: number;

    // Total position
    totalCost: number;
    breakevens: { upper: number; lower: number };
}

export class ConsolidationTradeCalculator {
    private readonly API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
    private readonly RISK_FREE_RATE = 0.0387; // 3.87% risk-free rate

    /**
     * Calculate Black-Scholes option price
     */
    private normalCDF(x: number): number {
        const erf = (x: number): number => {
            const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
            const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
            const sign = x >= 0 ? 1 : -1;
            x = Math.abs(x);
            const t = 1.0 / (1.0 + p * x);
            const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
            return sign * y;
        };
        return 0.5 * (1 + erf(x / Math.sqrt(2)));
    }

    private calculateBSPrice(S: number, K: number, T: number, r: number, sigma: number, isCall: boolean): number {
        if (T <= 0) return isCall ? Math.max(0, S - K) : Math.max(0, K - S);

        const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
        const d2 = d1 - sigma * Math.sqrt(T);

        if (isCall) {
            return S * this.normalCDF(d1) - K * Math.exp(-r * T) * this.normalCDF(d2);
        } else {
            return K * Math.exp(-r * T) * this.normalCDF(-d2) - S * this.normalCDF(-d1);
        }
    }

    /**
     * Calculate d2 for Black-Scholes (probability component)
     */
    private calculateD2(S: number, K: number, r: number, sigma: number, T: number): number {
        const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
        return d1 - sigma * Math.sqrt(T);
    }

    /**
     * Calculate chance of profit for selling a call (used to find 80% OTM strikes)
     */
    private chanceOfProfitSellCall(S: number, K: number, r: number, sigma: number, T: number): number {
        const d2 = this.calculateD2(S, K, r, sigma, T);
        return (1 - this.normalCDF(d2)) * 100;
    }

    /**
     * Calculate chance of profit for selling a put (used to find 80% OTM strikes)
     */
    private chanceOfProfitSellPut(S: number, K: number, r: number, sigma: number, T: number): number {
        const d2 = this.calculateD2(S, K, r, sigma, T);
        return this.normalCDF(d2) * 100;
    }

    /**
     * Find strike price for target probability (80% = 80% OTM)
     * Uses binary search to find strike where probability matches target
     */
    private findStrikeForProbability(S: number, r: number, sigma: number, T: number, targetProb: number, isCall: boolean): number {
        if (isCall) {
            let low = S + 0.01, high = S * 1.50;

            for (let i = 0; i < 50; i++) {
                const mid = (low + high) / 2;
                const prob = this.chanceOfProfitSellCall(S, mid, r, sigma, T);

                if (Math.abs(prob - targetProb) < 0.1) return mid;

                if (prob < targetProb) low = mid; else high = mid;
            }

            return (low + high) / 2;
        } else {
            let low = S * 0.50, high = S - 0.01;

            for (let i = 0; i < 50; i++) {
                const mid = (low + high) / 2;
                const prob = this.chanceOfProfitSellPut(S, mid, r, sigma, T);

                if (Math.abs(prob - targetProb) < 0.1) return mid;

                if (prob < targetProb) high = mid; else low = mid;
            }

            return (low + high) / 2;
        }
    }

    /**
     * Find closest available strike from options chain
     */
    private findClosestStrike(targetStrike: number, availableStrikes: number[]): number {
        return availableStrikes.reduce((prev, curr) => {
            return Math.abs(curr - targetStrike) < Math.abs(prev - targetStrike) ? curr : prev;
        });
    }

    /**
     * Get appropriate expiration based on period
     * 5-day: nearest expiry (typically weekly)
     * 13-day: 2-3 weeks out
     */
    private async getTargetExpiration(symbol: string, period: '5-DAY' | '13-DAY'): Promise<{ expiration: string; daysOut: number } | null> {
        try {
            const today = new Date();
            const minDays = period === '5-DAY' ? 3 : 14;  // 5-day: 3+ days, 13-day: 14+ days
            const maxDays = period === '5-DAY' ? 10 : 25; // 5-day: up to 10 days, 13-day: up to 25 days

            // Get options expirations
            const response = await fetch(
                `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${symbol}&limit=1000&apiKey=${this.API_KEY}`
            );

            const data = await response.json();

            if (!data.results || data.results.length === 0) return null;

            // Extract unique expiration dates
            const expirations = [...new Set(data.results.map((c: any) => c.expiration_date))]
                .map(exp => new Date(exp as string))
                .filter(expDate => {
                    const daysToExp = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    return daysToExp >= minDays && daysToExp <= maxDays;
                })
                .sort((a, b) => a.getTime() - b.getTime());

            if (expirations.length === 0) return null;

            // Pick first valid expiration (closest within target range)
            const selectedExp = expirations[0];
            const daysOut = Math.ceil((selectedExp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

            return {
                expiration: selectedExp.toISOString().split('T')[0],
                daysOut
            };
        } catch (error) {
            console.error(`Error getting expiration for ${symbol}:`, error);
            return null;
        }
    }

    /**
     * Get options chain for specific expiration
     */
    private async getOptionsChain(symbol: string, expiration: string): Promise<{ calls: any[]; puts: any[] } | null> {
        try {
            const response = await fetch(
                `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${symbol}&expiration_date=${expiration}&limit=500&apiKey=${this.API_KEY}`
            );

            const data = await response.json();

            if (!data.results || data.results.length === 0) return null;

            const calls = data.results.filter((c: any) => c.contract_type === 'call');
            const puts = data.results.filter((c: any) => c.contract_type === 'put');

            return { calls, puts };
        } catch (error) {
            console.error(`Error getting options chain for ${symbol}:`, error);
            return null;
        }
    }

    /**
     * Get option quote (bid/ask/last/iv)
     */
    private async getOptionQuote(underlying: string, optionTicker: string): Promise<{ bid: number; ask: number; last: number; iv: number } | null> {
        try {
            // Use last quote endpoint instead of snapshot (snapshot doesn't have real-time data)
            const quoteResponse = await fetch(
                `https://api.polygon.io/v3/quotes/${optionTicker}?limit=1&order=desc&apiKey=${this.API_KEY}`
            );

            const quoteData = await quoteResponse.json();

            if (!quoteData.results || quoteData.results.length === 0) {
                console.log(`No quote data for ${optionTicker}`);
                return null;
            }

            const quote = quoteData.results[0];
            const bid = quote.bid_price || 0;
            const ask = quote.ask_price || 0;

            // Get last trade for price fallback
            const tradeResponse = await fetch(
                `https://api.polygon.io/v3/trades/${optionTicker}?limit=1&order=desc&apiKey=${this.API_KEY}`
            );

            const tradeData = await tradeResponse.json();
            const last = tradeData.results?.[0]?.price || ((bid + ask) / 2) || 0;

            // Get IV from snapshot (same as OptionsChain.tsx)
            const snapshotUrl = `https://api.polygon.io/v3/snapshot/options/${underlying}/${optionTicker}?apikey=${this.API_KEY}`;
            const snapshotResponse = await fetch(snapshotUrl);
            const snapshotData = await snapshotResponse.json();

            let iv = 0.5; // Default fallback
            if (snapshotData.status === 'OK' && snapshotData.results) {
                iv = snapshotData.results.implied_volatility || 0.5;
            }

            return {
                bid,
                ask,
                last,
                iv
            };
        } catch (error) {
            console.error(`Error getting quote for ${optionTicker}:`, error);
            return null;
        }
    }

    /**
     * Calculate trade setup for consolidation pattern
     * Only for stocks with 45%+ consolidation
     */
    async calculateTradeSetup(
        symbol: string,
        currentPrice: number,
        period: '5-DAY' | '13-DAY',
        contractionPercent: number
    ): Promise<TradeSetup | null> {
        // Only generate trades for 45%+ consolidation
        if (contractionPercent < 45) {
            return null;
        }

        try {
            // Get target expiration
            const expirationInfo = await this.getTargetExpiration(symbol, period);
            if (!expirationInfo) return null;

            const { expiration, daysOut } = expirationInfo;
            const T = daysOut / 365;

            // Get options chain
            const chain = await this.getOptionsChain(symbol, expiration);
            if (!chain) return null;

            // Get available strikes
            const callStrikes = chain.calls.map((c: any) => c.strike_price).sort((a: number, b: number) => a - b);
            const putStrikes = chain.puts.map((p: any) => p.strike_price).sort((a: number, b: number) => a - b);

            if (callStrikes.length === 0 || putStrikes.length === 0) return null;

            // Estimate IV from ATM options
            const atmStrike = this.findClosestStrike(currentPrice, callStrikes);
            const atmCall = chain.calls.find((c: any) => c.strike_price === atmStrike);
            const estimatedIV = 0.5; // Default, will be updated with real data

            // Find 80% OTM strikes using probability-based calculation (same as OptionsChain.tsx)
            const targetCallStrike = this.findStrikeForProbability(currentPrice, this.RISK_FREE_RATE, estimatedIV, T, 80, true);
            const targetPutStrike = this.findStrikeForProbability(currentPrice, this.RISK_FREE_RATE, estimatedIV, T, 80, false);

            // Find closest available strikes
            const callStrike = this.findClosestStrike(targetCallStrike, callStrikes);
            const putStrike = this.findClosestStrike(targetPutStrike, putStrikes);

            // Get option contracts
            const callContract = chain.calls.find((c: any) => c.strike_price === callStrike);
            const putContract = chain.puts.find((p: any) => p.strike_price === putStrike);

            if (!callContract || !putContract) return null;

            // Get quotes
            const callQuote = await this.getOptionQuote(symbol, callContract.ticker);
            const putQuote = await this.getOptionQuote(symbol, putContract.ticker);

            if (!callQuote || !putQuote) return null;

            const callPremium = callQuote.ask || callQuote.last || 0;
            const putPremium = putQuote.ask || putQuote.last || 0;
            const callIV = callQuote.iv;
            const putIV = putQuote.iv;

            if (callPremium === 0 || putPremium === 0) return null;

            // Calculate targets based on expected move
            // Target 1: 1 standard deviation move (84% probability)
            // Target 2: 1.5 standard deviations (93% probability)
            const avgIV = (callIV + putIV) / 2;
            const expectedMove1SD = currentPrice * avgIV * Math.sqrt(T);
            const expectedMove15SD = expectedMove1SD * 1.5;

            // Call targets (upside)
            const callTarget1Stock = currentPrice + (expectedMove1SD * 0.84);
            const callTarget2Stock = currentPrice + (expectedMove15SD);
            const callTarget1Premium = this.calculateBSPrice(callTarget1Stock, callStrike, T * 0.7, this.RISK_FREE_RATE, callIV, true);
            const callTarget2Premium = this.calculateBSPrice(callTarget2Stock, callStrike, T * 0.5, this.RISK_FREE_RATE, callIV, true);

            // Put targets (downside)
            const putTarget1Stock = currentPrice - (expectedMove1SD * 0.84);
            const putTarget2Stock = currentPrice - (expectedMove15SD);
            const putTarget1Premium = this.calculateBSPrice(putTarget1Stock, putStrike, T * 0.7, this.RISK_FREE_RATE, putIV, false);
            const putTarget2Premium = this.calculateBSPrice(putTarget2Stock, putStrike, T * 0.5, this.RISK_FREE_RATE, putIV, false);

            // Total cost (per contract = 100 shares per option)
            const totalCost = (callPremium + putPremium) * 100;

            // Breakevens
            const upperBreakeven = callStrike + (callPremium + putPremium);
            const lowerBreakeven = putStrike - (callPremium + putPremium);

            return {
                symbol,
                currentPrice,
                period,
                contractionPercent,

                callStrike,
                callPremium,
                callBid: callQuote.bid,
                callAsk: callQuote.ask,
                callTarget1: callTarget1Stock,
                callTarget1Premium,
                callTarget2: callTarget2Stock,
                callTarget2Premium,
                callImpliedVolatility: callIV,

                putStrike,
                putPremium,
                putBid: putQuote.bid,
                putAsk: putQuote.ask,
                putTarget1: putTarget1Stock,
                putTarget1Premium,
                putTarget2: putTarget2Stock,
                putTarget2Premium,
                putImpliedVolatility: putIV,

                expiration,
                daysToExpiration: daysOut,

                totalCost,
                breakevens: {
                    upper: upperBreakeven,
                    lower: lowerBreakeven
                }
            };
        } catch (error) {
            console.error(`Error calculating trade setup for ${symbol}:`, error);
            return null;
        }
    }
}

export const consolidationTradeCalculator = new ConsolidationTradeCalculator();
