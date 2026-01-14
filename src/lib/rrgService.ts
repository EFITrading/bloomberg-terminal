interface RRGCalculationResult {
    symbol: string;
    name: string;
    rsRatio: number;
    rsMomentum: number;
    sector?: string;
    tail: Array<{ rsRatio: number; rsMomentum: number; date: string }>;
    currentPrice?: number;
    priceChange?: number;
    priceChangePercent?: number;
    sparklineData?: Array<{ time: number; price: number }>;
    historicalPrices?: PriceData[];
}

interface PriceData {
    date: string;
    close: number;
    timestamp: number;
}

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
const BASE_URL = 'https://api.polygon.io';

// Sector ETFs - exact replicas of StockCharts.com RRG
const SECTOR_ETFS = [
    { symbol: 'XLK', name: 'Technology Select Sector SPDR Fund', sector: 'Technology' },
    { symbol: 'XLF', name: 'Financial Select Sector SPDR Fund', sector: 'Financials' },
    { symbol: 'XLV', name: 'Health Care Select Sector SPDR Fund', sector: 'Health Care' },
    { symbol: 'XLE', name: 'Energy Select Sector SPDR Fund', sector: 'Energy' },
    { symbol: 'XLI', name: 'Industrial Select Sector SPDR Fund', sector: 'Industrials' },
    { symbol: 'XLY', name: 'Consumer Discretionary Select Sector SPDR Fund', sector: 'Consumer Discretionary' },
    { symbol: 'XLP', name: 'Consumer Staples Select Sector SPDR Fund', sector: 'Consumer Staples' },
    { symbol: 'XLB', name: 'Materials Select Sector SPDR Fund', sector: 'Materials' },
    { symbol: 'XLRE', name: 'Real Estate Select Sector SPDR Fund', sector: 'Real Estate' },
    { symbol: 'XLU', name: 'Utilities Select Sector SPDR Fund', sector: 'Utilities' },
    { symbol: 'XLC', name: 'Communication Services Select Sector SPDR Fund', sector: 'Communication Services' }
];

const BENCHMARK_SYMBOL = 'SPY'; // S&P 500 ETF as benchmark

class RRGService {
    private apiKey: string;
    private baseUrl: string;
    private cache: Map<string, { data: any; expiry: number }> = new Map();
    private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

    constructor(apiKey: string = POLYGON_API_KEY) {
        this.apiKey = apiKey;
        this.baseUrl = BASE_URL;
    }

    private getCacheKey(symbol: string, from: string, to: string): string {
        return `${symbol}_${from}_${to}`;
    }

    private getFromCache<T>(key: string): T | null {
        const cached = this.cache.get(key);
        if (cached && cached.expiry > Date.now()) {
            return cached.data;
        }
        if (cached) {
            this.cache.delete(key);
        }
        return null;
    }

    private setCache<T>(key: string, data: T): void {
        this.cache.set(key, {
            data,
            expiry: Date.now() + this.CACHE_DURATION
        });
    }

    public async getHistoricalPrices(symbol: string, from: string, to: string, interval: '1hour' | '4hour' | 'day' | 'week' = 'day'): Promise<PriceData[]> {
        const cacheKey = this.getCacheKey(symbol, from, to) + `_${interval}`;
        const cached = this.getFromCache<PriceData[]>(cacheKey);
        if (cached) return cached;

        // Use 1-hour, 4-hour, daily, or weekly intervals
        const [multiplier, timespan] = interval === '1hour' ? ['1', 'hour'] : interval === '4hour' ? ['4', 'hour'] : interval === 'week' ? ['1', 'week'] : ['1', 'day'];
        const endpoint = `/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${from}/${to}?limit=50000`;
        const response = await this.makeRequest<any>(endpoint);

        if (!response || !response.results) {
            console.warn(`No data for ${symbol}`);
            return [];
        }

        const priceData: PriceData[] = response.results.map((result: any) => ({
            date: new Date(result.t).toISOString().split('T')[0],
            close: result.c,
            timestamp: result.t
        }));

        this.setCache(cacheKey, priceData);
        return priceData;
    }
    private isProcessingQueue = false;
    private lastRequestTime = 0;
    private MIN_REQUEST_DELAY = 0; // No delay - let the API handle rate limiting

    private async processQueue(): Promise<void> {
        if (this.isProcessingQueue || this.requestQueue.length === 0) return;

        this.isProcessingQueue = true;

        // Process all requests immediately without delays
        while (this.requestQueue.length > 0) {
            const request = this.requestQueue.shift();
            if (request) {
                await request();
            }
        }

        this.isProcessingQueue = false;
    }

    private async makeRequest<T>(endpoint: string, retries = 3): Promise<T | null> {
        const url = `${this.baseUrl}${endpoint}${endpoint.includes('?') ? '&' : '?'}apikey=${this.apiKey}`;

        return new Promise((resolve) => {
            const executeRequest = async () => {
                for (let attempt = 0; attempt <= retries; attempt++) {
                    try {
                        const response = await fetch(url, {
                            signal: AbortSignal.timeout(10000) // 10 second timeout
                        });

                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }

                        const data = await response.json();
                        resolve(data);
                        return;
                    } catch (error) {
                        if (attempt < retries) {
                            // Exponential backoff: 200ms, 400ms, 800ms
                            await new Promise(r => setTimeout(r, 200 * Math.pow(2, attempt)));
                        } else {
                            console.error(`API request failed after ${retries} retries:`, error);
                            resolve(null);
                        }
                    }
                }
            };

            this.requestQueue.push(executeRequest);
            this.processQueue();
        });
    }

    public async getHistoricalPrices(symbol: string, from: string, to: string, interval: '1hour' | '4hour' | 'day' | 'week' = 'day'): Promise<PriceData[]> {
        const cacheKey = this.getCacheKey(symbol, from, to) + `_${interval}`;
        const cached = this.getFromCache<PriceData[]>(cacheKey);
        if (cached) return cached;

        // Use 1-hour, 4-hour, daily, or weekly intervals
        const [multiplier, timespan] = interval === '1hour' ? ['1', 'hour'] : interval === '4hour' ? ['4', 'hour'] : interval === 'week' ? ['1', 'week'] : ['1', 'day'];
        const endpoint = `/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${from}/${to}?limit=50000`;
        const response = await this.makeRequest<any>(endpoint);

        if (!response || !response.results) {
            console.warn(`No data for ${symbol}`);
            return [];
        }

        const priceData: PriceData[] = response.results.map((result: any) => ({
            date: new Date(result.t).toISOString().split('T')[0],
            close: result.c,
            timestamp: result.t
        }));

        this.setCache(cacheKey, priceData);
        return priceData;
    }

    private requestQueue: Array<() => Promise<any>> = [];
    private isProcessingQueue = false;

    private async processQueue(): Promise<void> {
        if (this.isProcessingQueue || this.requestQueue.length === 0) return;

        this.isProcessingQueue = true;

        // Process all requests immediately without delays
        while (this.requestQueue.length > 0) {
            const request = this.requestQueue.shift();
            if (request) {
                await request();
            }
        }

        this.isProcessingQueue = false;
    }

    private calculateRelativeStrength(securityPrices: PriceData[], benchmarkPrices: PriceData[]): Array<{ date: string; rsRatio: number }> {
        const rsData: Array<{ date: string; rsRatio: number }> = [];

        // Align dates between security and benchmark
        const benchmarkMap = new Map(benchmarkPrices.map(p => [p.date, p.close]));

        for (const secPrice of securityPrices) {
            const benchPrice = benchmarkMap.get(secPrice.date);
            if (benchPrice && benchPrice > 0 && secPrice.close > 0) {
                // Use log differences: ln(P_Security) - ln(P_Benchmark)
                const rsRatio = Math.log(secPrice.close) - Math.log(benchPrice);
                rsData.push({
                    date: secPrice.date,
                    rsRatio
                });
            }
        }

        return rsData;
    }

    private calculateEMA(values: number[], period: number): number[] {
        const ema: number[] = [];
        const k = 2 / (period + 1); // EMA smoothing factor

        // First EMA value is SMA of first 'period' values
        let sum = 0;
        for (let i = 0; i < period && i < values.length; i++) {
            sum += values[i];
        }
        ema[period - 1] = sum / period;

        // Calculate EMA for remaining values
        for (let i = period; i < values.length; i++) {
            ema[i] = values[i] * k + ema[i - 1] * (1 - k);
        }

        return ema;
    }

    private calculateSMA(values: number[], period: number): number[] {
        const sma: number[] = [];
        for (let i = period - 1; i < values.length; i++) {
            let sum = 0;
            for (let j = 0; j < period; j++) {
                sum += values[i - j];
            }
            sma[i] = sum / period;
        }
        return sma;
    }

    private calculateStdDev(values: number[], period: number): number[] {
        const stdDev: number[] = [];
        for (let i = period - 1; i < values.length; i++) {
            let sum = 0;
            let sumSq = 0;
            for (let j = 0; j < period; j++) {
                const val = values[i - j];
                sum += val;
                sumSq += val * val;
            }
            const mean = sum / period;
            const variance = (sumSq / period) - (mean * mean);
            stdDev[i] = Math.sqrt(Math.max(0, variance));
        }
        return stdDev;
    }

    private calculateJdKRSRatio(rsData: Array<{ date: string; rsRatio: number }>, rsPeriod: number = 10, longPeriod: number = 26): Array<{ date: string; rsRatio: number; normalizedRS: number }> {
        const result: Array<{ date: string; rsRatio: number; normalizedRS: number }> = [];

        // Step 1: Calculate EMA of RS (RS_trend) with period n
        const rsValues = rsData.map(d => d.rsRatio);
        const rsTrend = this.calculateEMA(rsValues, rsPeriod);

        // Step 2: Get valid RS_trend values
        const rsTrendValues: number[] = [];
        const rsTrendStartIndex = rsPeriod - 1;
        for (let i = rsTrendStartIndex; i < rsTrend.length; i++) {
            if (rsTrend[i] !== undefined) {
                rsTrendValues.push(rsTrend[i]);
            }
        }

        // Step 3: Calculate SMA and StdDev of RS_trend with period L (longPeriod)
        const rsTrendSMA = this.calculateSMA(rsTrendValues, longPeriod);
        const rsTrendStdDev = this.calculateStdDev(rsTrendValues, longPeriod);

        // Step 4: Calculate RS-Ratio = 100 + (RS_trend - SMA) / StdDev (z-score normalization)
        const finalStartIndex = rsTrendStartIndex + longPeriod - 1;
        for (let i = finalStartIndex; i < rsData.length; i++) {
            const trendIndex = i - rsTrendStartIndex;
            if (rsTrend[i] !== undefined && rsTrendSMA[trendIndex] !== undefined && rsTrendStdDev[trendIndex] !== undefined) {
                const stdDev = rsTrendStdDev[trendIndex];
                const zScore = stdDev > 0 ? (rsTrend[i] - rsTrendSMA[trendIndex]) / stdDev : 0;
                const normalizedRS = 100 + zScore;
                result.push({
                    date: rsData[i].date,
                    rsRatio: rsData[i].rsRatio,
                    normalizedRS
                });
            }
        }

        return result;
    }

    private calculateRSMomentum(normalizedRSData: Array<{ date: string; normalizedRS: number }>, momentumPeriod: number = 10): Array<{ date: string; normalizedRS: number; rsMomentum: number }> {
        const result: Array<{ date: string; normalizedRS: number; rsMomentum: number }> = [];

        // Calculate SMA and StdDev of RS-Ratio with period M
        const rsRatioValues = normalizedRSData.map(d => d.normalizedRS);
        const rsRatioSMA = this.calculateSMA(rsRatioValues, momentumPeriod);
        const rsRatioStdDev = this.calculateStdDev(rsRatioValues, momentumPeriod);

        // Calculate RS-Momentum = 100 + (RS-Ratio - SMA) / StdDev (z-score normalization)
        for (let i = momentumPeriod - 1; i < normalizedRSData.length; i++) {
            if (rsRatioSMA[i] !== undefined && rsRatioStdDev[i] !== undefined) {
                const stdDev = rsRatioStdDev[i];
                const zScore = stdDev > 0 ? (normalizedRSData[i].normalizedRS - rsRatioSMA[i]) / stdDev : 0;
                const rsMomentum = 100 + zScore;
                result.push({
                    date: normalizedRSData[i].date,
                    normalizedRS: normalizedRSData[i].normalizedRS,
                    rsMomentum
                });
            }
        }

        return result;
    }

    private async getCurrentPrice(symbol: string): Promise<{ price: number; change: number; changePercent: number } | null> {
        const endpoint = `/v2/aggs/ticker/${symbol}/prev`;
        const response = await this.makeRequest<any>(endpoint);

        if (!response || !response.results || response.results.length === 0) {
            return null;
        }

        const result = response.results[0];
        const price = result.c;
        const change = result.c - result.o;
        const changePercent = (change / result.o) * 100;

        return { price, change, changePercent };
    }

    public async calculateSectorRRG(
        lookbackWeeks: number = 52, // 1 year of data
        rsPeriod: number = 14,
        momentumPeriod: number = 14,
        tailLength: number = 10,
        interval: '1hour' | '4hour' | 'day' | 'week' = 'day'
    ): Promise<RRGCalculationResult[]> {
        const endDate = new Date();
        const startDate = new Date();
        // Always multiply by 7 since lookbackWeeks is in weeks
        startDate.setDate(startDate.getDate() - (lookbackWeeks * 7));

        const fromDate = startDate.toISOString().split('T')[0];
        const toDate = endDate.toISOString().split('T')[0];

        console.log(' Fetching RRG data...');
        console.log(` Date range: ${fromDate} to ${toDate}`);

        try {
            // Fetch benchmark data first
            console.log(` Fetching benchmark data for ${BENCHMARK_SYMBOL}...`);
            const benchmarkPrices = await this.getHistoricalPrices(BENCHMARK_SYMBOL, fromDate, toDate, interval);

            if (benchmarkPrices.length === 0) {
                throw new Error('No benchmark data available');
            }

            const results: RRGCalculationResult[] = [];

            // Process each sector ETF
            for (const etf of SECTOR_ETFS) {
                console.log(` Processing ${etf.symbol} - ${etf.name}...`);

                try {
                    // Get historical prices
                    const sectorPrices = await this.getHistoricalPrices(etf.symbol, fromDate, toDate, interval);

                    if (sectorPrices.length === 0) {
                        console.warn(` No price data for ${etf.symbol}`);
                        continue;
                    }

                    // Calculate relative strength
                    const rsData = this.calculateRelativeStrength(sectorPrices, benchmarkPrices);

                    // Need enough data for: rsPeriod + longPeriod + momentumPeriod
                    const longPeriod = Math.max(26, rsPeriod * 2);
                    const minDataPoints = rsPeriod + longPeriod + momentumPeriod;
                    if (rsData.length < minDataPoints) {
                        console.warn(` Insufficient data for ${etf.symbol} (need ${minDataPoints}, got ${rsData.length})`);
                        continue;
                    }

                    // Apply JdK RS-Ratio normalization with long period (2-3x rsPeriod)
                    const normalizedRS = this.calculateJdKRSRatio(rsData, rsPeriod, longPeriod);

                    // Calculate RS-Momentum
                    const rsMomentumData = this.calculateRSMomentum(normalizedRS, momentumPeriod);

                    if (rsMomentumData.length === 0) {
                        console.warn(` No momentum data for ${etf.symbol}`);
                        continue;
                    }

                    // Get current position (latest data point)
                    const latest = rsMomentumData[rsMomentumData.length - 1];

                    // Create tail (last N points for visualization)
                    const tail = rsMomentumData
                        .slice(-tailLength - 1, -1) // Exclude the current point
                        .map(point => ({
                            rsRatio: point.normalizedRS,
                            rsMomentum: point.rsMomentum,
                            date: point.date
                        }));

                    // Get current price data
                    const currentPriceData = await this.getCurrentPrice(etf.symbol);

                    results.push({
                        symbol: etf.symbol,
                        name: etf.name,
                        rsRatio: latest.normalizedRS,
                        rsMomentum: latest.rsMomentum,
                        sector: etf.sector,
                        tail,
                        currentPrice: currentPriceData?.price,
                        priceChange: currentPriceData?.change,
                        priceChangePercent: currentPriceData?.changePercent
                    });

                    console.log(` ${etf.symbol}: RS-Ratio=${latest.normalizedRS.toFixed(2)}, RS-Momentum=${latest.rsMomentum.toFixed(2)}`);

                    // Add small delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 100));

                } catch (error) {
                    console.error(` Error processing ${etf.symbol}:`, error);
                    continue;
                }
            }

            console.log(` RRG calculation complete. ${results.length}/${SECTOR_ETFS.length} sectors processed.`);
            return results;

        } catch (error) {
            console.error(' RRG calculation failed:', error);
            throw error;
        }
    }

    public async calculateCustomRRG(
        symbols: string[],
        benchmark: string = 'SPY',
        lookbackWeeks: number = 52,
        rsPeriod: number = 14,
        momentumPeriod: number = 14,
        tailLength: number = 10,
        interval: '1hour' | '4hour' | 'day' | 'week' = 'day'
    ): Promise<RRGCalculationResult[]> {
        const endDate = new Date();
        const startDate = new Date();
        // Always multiply by 7 since lookbackWeeks is in weeks
        startDate.setDate(startDate.getDate() - (lookbackWeeks * 7));

        const fromDate = startDate.toISOString().split('T')[0];
        const toDate = endDate.toISOString().split('T')[0];

        // Fetch benchmark data
        const benchmarkPrices = await this.getHistoricalPrices(benchmark, fromDate, toDate, interval);

        if (benchmarkPrices.length === 0) {
            throw new Error(`No benchmark data available for ${benchmark}`);
        }

        const results: RRGCalculationResult[] = [];

        // Fetch ALL stocks in parallel for maximum speed
        const stockPromises = symbols.map(async (symbol) => {
            try {
                const symbolPrices = await this.getHistoricalPrices(symbol, fromDate, toDate, interval);

                if (symbolPrices.length === 0) return null;

                const rsData = this.calculateRelativeStrength(symbolPrices, benchmarkPrices);
                const longPeriod = Math.max(26, rsPeriod * 2);
                const normalizedRS = this.calculateJdKRSRatio(rsData, rsPeriod, longPeriod);
                const rsMomentumData = this.calculateRSMomentum(normalizedRS, momentumPeriod);

                if (rsMomentumData.length === 0) return null;

                const latest = rsMomentumData[rsMomentumData.length - 1];
                const tail = rsMomentumData
                    .slice(-tailLength - 1, -1)
                    .map(point => ({
                        rsRatio: point.normalizedRS,
                        rsMomentum: point.rsMomentum,
                        date: point.date
                    }));

                // Calculate current price and change from historical data (no extra API call!)
                const currentPrice = symbolPrices[symbolPrices.length - 1]?.close;
                const previousPrice = symbolPrices[symbolPrices.length - 2]?.close;
                const priceChange = currentPrice && previousPrice ? currentPrice - previousPrice : undefined;
                const priceChangePercent = currentPrice && previousPrice ? ((currentPrice - previousPrice) / previousPrice) * 100 : undefined;

                return {
                    symbol,
                    name: symbol,
                    rsRatio: latest.normalizedRS,
                    rsMomentum: latest.rsMomentum,
                    tail,
                    currentPrice,
                    priceChange,
                    priceChangePercent,
                    historicalPrices: symbolPrices
                };
            } catch (error) {
                console.error(`Error processing ${symbol}:`, error);
                return null;
            }
        });

        const allResults = await Promise.all(stockPromises);
        results.push(...allResults.filter((r): r is RRGCalculationResult => r !== null));

        return results;
    }
}

export default RRGService;
export type { RRGCalculationResult };
