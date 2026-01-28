import { getPolygonWorker } from './PolygonAPIWorker';
import { MarketDataProcessor } from './MarketDataProcessor';

interface PolygonTickerData {
    ticker: string;
    name: string;
    market: string;
    locale: string;
    primary_exchange: string;
    type: string;
    active: boolean;
    currency_name: string;
    cik: string;
    composite_figi: string;
    share_class_figi: string;
    market_cap: number;
    phone_number: string;
    address: any;
    description: string;
    sic_code: string;
    sic_description: string;
    ticker_root: string;
    homepage_url: string;
    total_employees: number;
    list_date: string;
    branding: any;
    share_class_shares_outstanding: number;
    weighted_shares_outstanding: number;
}

interface PolygonAggregateData {
    ticker: string;
    queryCount: number;
    resultsCount: number;
    adjusted: boolean;
    results: Array<{
        v: number; // volume
        vw: number; // volume weighted average price
        o: number; // open
        c: number; // close
        h: number; // high
        l: number; // low
        t: number; // timestamp
        n: number; // number of transactions
    }>;
    status: string;
    request_id: string;
    count: number;
}

interface SeasonalPattern {
    symbol: string;
    companyName: string;
    company?: string; // alias for companyName
    sector: string;
    pattern: string;
    patternType?: string;
    period: string;
    startDate: string;
    endDate: string;
    avgReturn: number;
    averageReturn?: number; // alias for avgReturn
    winRate: number;
    years: number;
    lastReturn?: number;
    confidence: 'High' | 'Medium' | 'Low';
    category: 'Bullish' | 'Bearish';
    description: string;
    riskLevel: 'Low' | 'Medium' | 'High';
    daysUntilStart?: number;
    marketCap?: string;
    volume?: number;
    beta?: number;
    pe?: number;
    currentPrice?: number;
    priceChange?: number;
    priceChangePercent?: number;
    exchange?: string;
    currency?: string;
    chartData?: any;
    analystRating?: string;
    targetPrice?: number;
    dividendYield?: number;
    revenue?: number;
    profitMargin?: number;
    nextEarningsDate?: string;
    institutionalOwnership?: number;
    shortInterest?: number;
    relativeStrength?: number;
    technicalRating?: string;
    fundamentalRating?: string;
    esgScore?: number;
    fiftyTwoWeekHigh?: number;
    fiftyTwoWeekLow?: number;
    fiftyTwoWeekStatus?: '52 High' | '52 Low' | null;
    news?: Array<{
        title: string;
        url: string;
        date: string;
        sentiment: 'Positive' | 'Negative' | 'Neutral';
    }>;
}

interface WeeklyPattern {
    symbol: string;
    companyName: string;
    dayOfWeek: string;
    avgReturn: number;
    winRate: number;
    confidence: string;
    pattern: string;
    years: number;
    lastReturn?: number;
    volume?: number;
    description: string;
}

import { withCircuitBreaker } from './circuitBreaker';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
const BASE_URL = 'https://api.polygon.io';

// Helper function to add aliases to seasonal patterns
function enrichSeasonalPattern(pattern: Partial<SeasonalPattern>): SeasonalPattern {
    return {
        ...pattern,
        company: pattern.company || pattern.companyName,
        averageReturn: pattern.averageReturn ?? pattern.avgReturn,
        exchange: pattern.exchange || 'NASDAQ',
        currency: pattern.currency || 'USD',
        chartData: pattern.chartData || []
    } as SeasonalPattern;
}

class PolygonService {
    private apiKey: string;
    private baseUrl: string;
    private requestCount: number = 0;
    private lastRequestTime: number = 0;
    private cache: Map<string, { data: any; expiry: number }> = new Map();
    private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache for bulk data
    private worker: any;
    private processor: MarketDataProcessor;

    constructor(apiKey: string = POLYGON_API_KEY) {
        this.apiKey = apiKey;
        this.baseUrl = BASE_URL;
        this.worker = getPolygonWorker(apiKey);
        this.processor = new MarketDataProcessor(apiKey);
    }

    private getCacheKey(endpoint: string): string {
        return `${endpoint}`;
    }

    private getFromCache<T>(endpoint: string): T | null {
        const key = this.getCacheKey(endpoint);
        const cached = this.cache.get(key);

        if (cached && cached.expiry > Date.now()) {
            console.log(` Cache hit for ${endpoint}`);
            return cached.data;
        }

        if (cached) {
            this.cache.delete(key); // Remove expired cache
        }

        return null;
    }

    private setCache<T>(endpoint: string, data: T): void {
        const key = this.getCacheKey(endpoint);
        this.cache.set(key, {
            data,
            expiry: Date.now() + this.CACHE_DURATION
        });
    }

    private async rateLimitDelay(): Promise<void> {
        return;
    }

    private async makeRequest<T>(endpoint: string): Promise<T | null> {
        // Check cache first
        const cached = this.getFromCache<T>(endpoint);
        if (cached) {
            return cached;
        }

        await this.rateLimitDelay();

        const url = `${this.baseUrl}${endpoint}${endpoint.includes('?') ? '&' : '?'}apikey=${this.apiKey}`;
        console.log(`Making Polygon API request: ${url}`);

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                },
                // Add timeout for faster failure detection
                signal: AbortSignal.timeout(30000) // 30 second timeout
            });

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Invalid API key. Please check your Polygon.io API key.');
                } else if (response.status === 403) {
                    throw new Error('API access forbidden. Please verify your Polygon.io subscription plan.');
                } else if (response.status === 429) {
                    throw new Error('Rate limit exceeded. Please wait before making more requests.');
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const text = await response.text();
            if (!text.trim()) {
                console.warn(`Empty response from Polygon API for ${endpoint}`);
                return null;
            }

            let data: T;
            try {
                data = JSON.parse(text);
            } catch (parseError) {
                console.error('Failed to parse JSON:', text);
                throw new Error(`Invalid JSON response from Polygon API: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
            }

            // Cache successful responses
            this.setCache(endpoint, data);

            return data;
        } catch (error) {
            console.error('Polygon API request failed:', error);
            throw error;
        }
    }

    async getTickerDetails(symbol: string): Promise<PolygonTickerData | null> {
        try {
            const endpoint = `/api/ticker-details?symbol=${symbol}`;
            console.log(` Fetching ticker details for ${symbol} via backend API`);

            const response = await fetch(endpoint, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                },
            });

            if (!response.ok) {
                // Log the error but don't throw - return null instead
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                console.warn(` Ticker details API error for ${symbol}: ${errorData.error || `${response.status} ${response.statusText}`}`);
                return null;
            }

            const data = await response.json();
            console.log(` Successfully fetched ticker details for ${symbol}`);
            return data?.results || null;

        } catch (error) {
            console.error(` Failed to get ticker details for ${symbol}:`, error);
            return null;
        }
    }

    async getRealtimeQuote(symbol: string): Promise<any> {
        try {
            const response = await fetch(
                `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apikey=${this.apiKey}`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Accept': 'application/json',
                        'User-Agent': 'YourApp/1.0',
                        'Connection': 'keep-alive',
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (data.status === 'OK' && data.results && data.results.length > 0) {
                const result = data.results[0];
                return {
                    symbol: result.ticker,
                    price: result.lastQuote?.p || result.min?.c || result.prevDay?.c,
                    change: result.todaysChange || 0,
                    changePercent: result.todaysChangePerc || 0,
                    volume: result.day?.v || 0,
                    lastTrade: result.lastTrade?.p || result.min?.c || result.prevDay?.c
                };
            }

            return null;
        } catch (error) {
            console.error(` Failed to get realtime quote for ${symbol}:`, error);
            return null;
        }
    }

    async getHistoricalData(
        symbol: string,
        startDate: string,
        endDate: string,
        timespan: string = 'day',
        multiplier: number = 1
    ): Promise<PolygonAggregateData | null> {
        try {
            const endpoint = `/api/historical-data?symbol=${symbol}&startDate=${startDate}&endDate=${endDate}`;
            console.log(` Fetching historical data for ${symbol} from ${startDate} to ${endDate} via backend API`);

            const response = await fetch(endpoint, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                },
            });

            if (!response.ok) {
                // Log the error but don't throw - return null instead
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                console.warn(` Historical data API error for ${symbol}: ${errorData.error || `${response.status} ${response.statusText}`}`);
                return null;
            }

            const data = await response.json();
            console.log(` Successfully fetched ${data.resultsCount || 0} data points for ${symbol}`);
            return data;

        } catch (error) {
            console.error(` Failed to fetch historical data for ${symbol}:`, error);
            return null;
        }
    }

    async getBulkHistoricalData(
        symbol: string,
        years: number = 5,
        timespan: string = 'day',
        multiplier: number = 1
    ): Promise<PolygonAggregateData | null> {
        // Use circuit breaker for historical data API calls
        return withCircuitBreaker('historicalData', async () => {
            const maxRetries = 3;
            let lastError: Error | null = null;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    const endDate = new Date();
                    const startDate = new Date();
                    startDate.setFullYear(endDate.getFullYear() - years);

                    const endDateStr = endDate.toISOString().split('T')[0];
                    const startDateStr = startDate.toISOString().split('T')[0];

                    console.log(` Fetching ${years} years of bulk data for ${symbol} (${startDateStr} to ${endDateStr}) - Attempt ${attempt}/${maxRetries}`);

                    // Call Polygon API directly to avoid server-side relative URL issue
                    const POLYGON_API_KEY = process.env.POLYGON_API_KEY || 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
                    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${startDateStr}/${endDateStr}?adjusted=true&sort=desc&limit=50000&apikey=${POLYGON_API_KEY}`;

                    console.log(` Direct Polygon API call for ${symbol}: ${url.replace(POLYGON_API_KEY, 'API_KEY')}`);

                    // Add timeout and abort controller for better connection handling
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => {
                        console.warn(` Timing out bulk data request for ${symbol} after 15s`);
                        controller.abort();
                    }, 15000);

                    const response = await fetch(url, {
                        method: 'GET',
                        signal: controller.signal,
                        headers: {
                            'Accept': 'application/json'
                        },
                    });

                    clearTimeout(timeoutId);

                    if (!response.ok) {
                        const errorText = await response.text().catch(() => 'Failed to read error response');
                        let errorData;

                        try {
                            errorData = JSON.parse(errorText);
                        } catch {
                            errorData = { error: errorText || `HTTP ${response.status}: ${response.statusText}` };
                        }

                        const errorMsg = errorData.error || `${response.status} ${response.statusText}`;
                        console.warn(` Bulk historical data API error for ${symbol} (attempt ${attempt}/${maxRetries}): ${errorMsg}`);

                        // Don't retry on client errors (4xx), only on server errors (5xx) and network issues
                        if (response.status >= 400 && response.status < 500) {
                            console.warn(` Client error for ${symbol}, not retrying: ${response.status}`);
                            return null;
                        }

                        throw new Error(errorMsg);
                    }

                    const data = await response.json();

                    // Enhanced validation with detailed logging
                    console.log(` Raw response for ${symbol}:`, JSON.stringify(data).slice(0, 200));

                    if (!data) {
                        console.error(` NULL response received for ${symbol}`);
                        return null;
                    }

                    if (!data.results) {
                        console.error(` Missing 'results' field for ${symbol}. Response keys: ${Object.keys(data).join(', ')}`);
                        return null;
                    }

                    if (!Array.isArray(data.results)) {
                        console.error(` 'results' is not an array for ${symbol}. Type: ${typeof data.results}`);
                        return null;
                    }

                    if (data.results.length === 0) {
                        console.error(` EMPTY results array for ${symbol}. Status: ${data.status}, Query: ${startDateStr} to ${endDateStr}`);
                        return null;
                    }

                    // Reverse array since we requested DESC order (newest first) but need ASC (oldest first)
                    data.results.reverse();

                    console.log(` ✓ Retrieved ${data.results.length} data points for ${symbol} (${startDateStr} to ${endDateStr})`);
                    return data;

                } catch (error) {
                    lastError = error instanceof Error ? error : new Error('Unknown error');

                    if (error instanceof Error) {
                        if (error.name === 'AbortError') {
                            console.warn(` Request timeout for ${symbol} (attempt ${attempt}/${maxRetries})`);
                        } else if (error.message.includes('Failed to fetch') ||
                            error.message.includes('ERR_CONNECTION') ||
                            error.message.includes('net::ERR_CONNECTION')) {
                            console.warn(` Connection error for ${symbol} (attempt ${attempt}/${maxRetries}): ${error.message}`);
                        } else {
                            console.warn(` Error fetching bulk data for ${symbol} (attempt ${attempt}/${maxRetries}): ${error.message}`);
                        }
                    }

                    // Wait before retry with exponential backoff
                    if (attempt < maxRetries) {
                        const delay = Math.pow(2, attempt - 1) * 2000; // 2s, 4s, 8s
                        console.log(` Retrying ${symbol} in ${delay / 1000}s...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                }
            }

            console.error(` Failed to get bulk historical data for ${symbol} after ${maxRetries} attempts. Last error:`, lastError?.message);
            return null;
        });
    }

    async getFeaturedPatterns(): Promise<SeasonalPattern[]> {
        try {
            console.log(' [Featured Patterns] Using worker-based processing...');
            const featuredSymbols = ['AAPL', 'TSLA', 'NVDA', 'SPY', 'QQQ'];

            // Use MarketDataProcessor for efficient batch processing
            const patterns = await this.processor.calculateSeasonalPatterns(featuredSymbols, 5);

            console.log(` [Featured Patterns] Generated ${patterns.length} patterns using real data`);
            return patterns || [];

        } catch (error) {
            console.error(' Error fetching featured patterns:', error);
            throw new Error('Failed to fetch featured patterns from Polygon API');
        }
    }

    async getMarketPatterns(market: string, years: number): Promise<SeasonalPattern[]> {
        try {
            console.log(` [Market Patterns] Processing ${market} with batched approach...`);

            // Define market constituents (reduced for performance)
            const marketSymbols: { [key: string]: string[] } = {
                'SP500': ['SPY', 'AAPL', 'MSFT', 'GOOGL', 'AMZN'],
                'Technology': ['AAPL', 'MSFT', 'GOOGL', 'META', 'NVDA'],
                'Healthcare': ['JNJ', 'UNH', 'ABBV', 'TMO', 'PFE'],
                'Financial': ['JPM', 'BAC', 'WFC', 'GS', 'MS']
            };

            const symbols = marketSymbols[market] || marketSymbols['SP500'];

            // Use processor for efficient batch processing
            const patterns = await this.processor.calculateSeasonalPatterns(symbols, years);

            console.log(` [Market Patterns] Generated ${patterns.length} patterns for ${market}`);
            return patterns || [];

        } catch (error) {
            console.error(` Error fetching ${market} patterns:`, error);
            throw new Error(`Failed to fetch ${market} patterns from Polygon API`);
        }
    }

    /**
    * Calculate seasonal patterns from historical price data
    */
    private calculateSeasonalPattern(priceData: any[], symbol: string): SeasonalPattern | null {
        try {
            if (!priceData || priceData.length < 252) return null; // Need at least 1 year of data

            // Group data by month to find seasonal patterns
            const monthlyReturns: { [month: number]: number[] } = {};

            for (let i = 1; i < priceData.length; i++) {
                const currentBar = priceData[i];
                const previousBar = priceData[i - 1];

                if (!currentBar || !previousBar) continue;

                const date = new Date(currentBar.t);
                const month = date.getMonth() + 1; // 1-12
                const monthlyReturn = ((currentBar.c - previousBar.c) / previousBar.c) * 100;

                if (!monthlyReturns[month]) monthlyReturns[month] = [];
                monthlyReturns[month].push(monthlyReturn);
            }

            // Find the strongest seasonal pattern
            let bestMonth = 1;
            let bestAvgReturn = 0;
            let bestWinRate = 0;

            for (const month in monthlyReturns) {
                const returns = monthlyReturns[parseInt(month)];
                if (returns.length < 3) continue; // Need at least 3 years of data

                const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
                const winRate = (returns.filter(ret => ret > 0).length / returns.length) * 100;

                if (Math.abs(avgReturn) > Math.abs(bestAvgReturn)) {
                    bestMonth = parseInt(month);
                    bestAvgReturn = avgReturn;
                    bestWinRate = winRate;
                }
            }

            const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const patternType = bestAvgReturn > 0 ? 'Bullish' : 'Bearish';
            const monthName = monthNames[bestMonth];

            return {
                symbol,
                companyName: `${symbol} Inc.`,
                sector: 'Market',
                pattern: `${monthName} ${patternType} Pattern`,
                period: `${monthName} 1 - ${monthName} 31`,
                startDate: `${monthName} 1`,
                endDate: `${monthName} 31`,
                avgReturn: Math.round(bestAvgReturn * 100) / 100,
                winRate: Math.round(bestWinRate),
                years: Math.floor(priceData.length / 252),
                confidence: bestWinRate > 70 ? 'High' : bestWinRate > 50 ? 'Medium' : 'Low',
                category: patternType as 'Bullish' | 'Bearish',
                description: `Historical ${monthName} ${patternType.toLowerCase()} pattern based on ${Math.floor(priceData.length / 252)} years of data`,
                riskLevel: Math.abs(bestAvgReturn) > 5 ? 'High' : Math.abs(bestAvgReturn) > 2 ? 'Medium' : 'Low',
                currentPrice: priceData[priceData.length - 1]?.c || 0,
                priceChange: 0,
                priceChangePercent: 0
            };
        } catch (error) {
            console.error(` Error calculating seasonal pattern for ${symbol}:`, error);
            return null;
        }
    }

    async getWeeklyPatterns(symbol?: string): Promise<WeeklyPattern[]> {
        try {
            const symbols = symbol ? [symbol] : ['SPY', 'QQQ', 'IWM', 'AAPL', 'TSLA', 'NVDA'];
            const patterns: WeeklyPattern[] = [];

            for (const sym of symbols) {
                try {
                    // Get 2 years of daily data to analyze weekly patterns
                    const endDate = new Date().toISOString().split('T')[0];
                    const startDate = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

                    const url = `https://api.polygon.io/v2/aggs/ticker/${sym}/range/1/day/${startDate}/${endDate}?adjusted=true&sort=asc&apikey=${this.apiKey}`;

                    const response = await fetch(url);
                    if (!response.ok) continue;

                    const data = await response.json();
                    if (data.results && data.results.length > 0) {
                        const weeklyPatterns = this.calculateWeeklyPatterns(data.results, sym);
                        patterns.push(...weeklyPatterns);
                    }

                    await new Promise(resolve => setTimeout(resolve, 200));
                } catch (error) {
                    console.error(` Error processing weekly patterns for ${sym}:`, error);
                    continue;
                }
            }

            return patterns;
        } catch (error) {
            console.error(' Error fetching weekly patterns:', error);
            throw new Error('Failed to fetch weekly patterns from Polygon API');
        }
    }

    /**
    * Calculate weekly patterns from historical data
    */
    private calculateWeeklyPatterns(priceData: any[], symbol: string): WeeklyPattern[] {
        try {
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const dailyReturns: { [day: string]: number[] } = {};

            // Initialize arrays for each day
            dayNames.forEach(day => {
                dailyReturns[day] = [];
            });

            // Calculate daily returns and group by day of week
            for (let i = 1; i < priceData.length; i++) {
                const currentBar = priceData[i];
                const previousBar = priceData[i - 1];

                if (!currentBar || !previousBar) continue;

                const date = new Date(currentBar.t);
                const dayOfWeek = dayNames[date.getDay()];
                const dailyReturn = ((currentBar.c - previousBar.c) / previousBar.c) * 100;

                dailyReturns[dayOfWeek].push(dailyReturn);
            }

            // Create patterns for trading days only (Monday-Friday)
            const patterns: WeeklyPattern[] = [];
            const tradingDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

            tradingDays.forEach(day => {
                const returns = dailyReturns[day];
                if (returns.length < 10) return; // Need sufficient data

                const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
                const winRate = (returns.filter(ret => ret > 0).length / returns.length) * 100;
                const confidence = winRate > 65 ? 'High' : winRate > 45 ? 'Medium' : 'Low';

                patterns.push({
                    symbol,
                    companyName: `${symbol} Inc.`,
                    dayOfWeek: day,
                    avgReturn: Math.round(avgReturn * 100) / 100,
                    winRate: Math.round(winRate),
                    confidence,
                    pattern: `${day} Pattern`,
                    years: Math.floor(priceData.length / 252),
                    description: `Historical ${day} performance: ${avgReturn > 0 ? 'positive' : 'negative'} bias with ${Math.round(winRate)}% win rate`
                });
            });

            return patterns;
        } catch (error) {
            console.error(` Error calculating weekly patterns for ${symbol}:`, error);
            return [];
        }
    }
}

// Weekly patterns function
export async function getWeeklyPatterns(symbol?: string): Promise<WeeklyPattern[]> {
    const API_KEY = POLYGON_API_KEY;

    if (!API_KEY) {
        throw new Error('Polygon API key is not configured');
    }

    const service = new PolygonService(API_KEY);
    return service.getWeeklyPatterns(symbol);
}

// Create a default instance
const polygonService = new PolygonService(POLYGON_API_KEY || '');

// Export interfaces and main service
export type { SeasonalPattern, WeeklyPattern };
export { polygonService };

export default PolygonService;
