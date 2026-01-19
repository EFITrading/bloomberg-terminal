import { ChartDataPoint } from '../types/global';

interface CacheEntry {
    data: ChartDataPoint[];
    timestamp: number;
    expiry: number;
}

interface PrefetchedSymbol {
    symbol: string;
    timeframes: string[];
    priority: number;
}

class ChartDataCache {
    private static instance: ChartDataCache;
    private memoryCache = new Map<string, CacheEntry>();
    private requestsInProgress = new Map<string, Promise<ChartDataPoint[]>>();
    private storagePrefix = 'chart_cache_';

    // Cache settings for different timeframes (in milliseconds)
    private cacheExpiry = {
        '1m': 60 * 1000, // 1 minute for 1m data
        '5m': 5 * 60 * 1000, // 5 minutes for 5m data
        '15m': 15 * 60 * 1000, // 15 minutes for 15m data
        '30m': 30 * 60 * 1000, // 30 minutes for 30m data
        '1h': 60 * 60 * 1000, // 1 hour for hourly data
        '4h': 4 * 60 * 60 * 1000, // 4 hours for 4h data
        '1d': 24 * 60 * 60 * 1000, // 24 hours for daily data
        '1w': 7 * 24 * 60 * 60 * 1000, // 1 week for weekly data
        '1mo': 30 * 24 * 60 * 60 * 1000 // 30 days for monthly data
    };

    // Popular symbols to prefetch
    private popularSymbols = ['SPY', 'QQQ', 'IWM', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL', 'AMZN', 'META'];

    static getInstance(): ChartDataCache {
        if (!ChartDataCache.instance) {
            ChartDataCache.instance = new ChartDataCache();
        }
        return ChartDataCache.instance;
    }

    private getCacheKey(symbol: string, timeframe: string): string {
        return `${symbol}_${timeframe}`;
    }

    // INSTANT CACHE RETRIEVAL
    get(symbol: string, timeframe: string): ChartDataPoint[] | null {
        const key = this.getCacheKey(symbol, timeframe);
        const entry = this.memoryCache.get(key);

        if (!entry) {
            // Try localStorage fallback for popular symbols
            return this.getFromStorage(key);
        }

        // Check if cache is still valid
        if (Date.now() > entry.expiry) {
            this.memoryCache.delete(key);
            this.removeFromStorage(key);
            return null;
        }

        console.log(` CACHE HIT: ${symbol} ${timeframe} (${entry.data.length} points)`);
        return entry.data;
    }

    set(symbol: string, timeframe: string, data: ChartDataPoint[]): void {
        const key = this.getCacheKey(symbol, timeframe);
        const expiry = Date.now() + (this.cacheExpiry[timeframe as keyof typeof this.cacheExpiry] || 60000);

        const entry: CacheEntry = {
            data,
            timestamp: Date.now(),
            expiry
        };

        // Store in memory for instant access
        this.memoryCache.set(key, entry);

        // Store popular symbols in localStorage for persistence
        if (this.isPopularSymbol(symbol)) {
            this.setToStorage(key, entry);
        }

        // Limit memory cache size
        if (this.memoryCache.size > 50) {
            this.pruneCache();
        }
    }

    // REQUEST DEDUPLICATION - prevent duplicate API calls
    async getOrFetch(
        symbol: string,
        timeframe: string,
        fetchFunction: () => Promise<ChartDataPoint[]>
    ): Promise<ChartDataPoint[]> {
        // Check cache first
        const cached = this.get(symbol, timeframe);
        if (cached) {
            return cached;
        }

        const key = this.getCacheKey(symbol, timeframe);

        // Check if request is already in progress
        if (this.requestsInProgress.has(key)) {
            return await this.requestsInProgress.get(key)!;
        }

        // Start new request
        const promise = fetchFunction();
        this.requestsInProgress.set(key, promise);

        try {
            const data = await promise;
            this.set(symbol, timeframe, data);
            return data;
        } finally {
            this.requestsInProgress.delete(key);
        }
    }

    // SMART PREFETCHING for popular symbols
    async prefetchPopularSymbols(): Promise<void> {
        console.log(' PREFETCHING popular symbols for instant access...');

        const timeframes = ['1d', '1h', '5m'];
        const prefetchPromises: Promise<void>[] = [];

        for (const symbol of this.popularSymbols.slice(0, 5)) { // Limit to top 5
            for (const timeframe of timeframes) {
                if (!this.get(symbol, timeframe)) {
                    prefetchPromises.push(
                        this.prefetchSymbolData(symbol, timeframe)
                    );
                }
            }
        }

        await Promise.allSettled(prefetchPromises);
        console.log(' PREFETCH completed');
    }

    private async prefetchSymbolData(symbol: string, timeframe: string): Promise<void> {
        try {
            const response = await fetch(
                `/api/historical-data?symbol=${symbol}&timeframe=${timeframe}&prefetch=true`
            );

            if (response.ok) {
                const result = await response.json();
                if (result?.results?.length) {
                    const data = result.results.map((item: any) => ({
                        timestamp: item.t,
                        open: item.o,
                        high: item.h,
                        low: item.l,
                        close: item.c,
                        date: new Date(item.t).toISOString().split('T')[0],
                        time: new Date(item.t).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false
                        })
                    }));

                    this.set(symbol, timeframe, data);
                }
            }
        } catch (error) {
            console.log(`Failed to prefetch ${symbol} ${timeframe}:`, error);
        }
    }

    // LOCALSTORAGE PERSISTENCE for popular symbols
    private getFromStorage(key: string): ChartDataPoint[] | null {
        try {
            const stored = localStorage.getItem(this.storagePrefix + key);
            if (stored) {
                const entry: CacheEntry = JSON.parse(stored);

                if (Date.now() < entry.expiry) {
                    console.log(` STORAGE HIT: ${key}`);
                    // Also store in memory for next access
                    this.memoryCache.set(key, entry);
                    return entry.data;
                } else {
                    // Expired, remove
                    localStorage.removeItem(this.storagePrefix + key);
                }
            }
        } catch (error) {
            console.warn('Storage cache read failed:', error);
        }
        return null;
    }

    private setToStorage(key: string, entry: CacheEntry): void {
        try {
            localStorage.setItem(this.storagePrefix + key, JSON.stringify(entry));
        } catch (error) {
            console.warn('Storage cache write failed:', error);
            // Clear some space and try again
            this.clearOldStorageEntries();
        }
    }

    private removeFromStorage(key: string): void {
        try {
            localStorage.removeItem(this.storagePrefix + key);
        } catch (error) {
            console.warn('Storage cache removal failed:', error);
        }
    }

    private isPopularSymbol(symbol: string): boolean {
        return this.popularSymbols.includes(symbol.toUpperCase());
    }

    private pruneCache(): void {
        // Remove oldest entries first
        const entries = Array.from(this.memoryCache.entries());
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

        // Remove oldest 25% of entries
        const toRemove = Math.floor(entries.length * 0.25);
        for (let i = 0; i < toRemove; i++) {
            this.memoryCache.delete(entries[i][0]);
        }

        console.log(` PRUNED ${toRemove} cache entries`);
    }

    private clearOldStorageEntries(): void {
        try {
            const keysToRemove: string[] = [];

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key?.startsWith(this.storagePrefix)) {
                    try {
                        const entry: CacheEntry = JSON.parse(localStorage.getItem(key)!);
                        if (Date.now() > entry.expiry) {
                            keysToRemove.push(key);
                        }
                    } catch {
                        keysToRemove.push(key);
                    }
                }
            }

            keysToRemove.forEach(key => localStorage.removeItem(key));
            console.log(` CLEARED ${keysToRemove.length} expired storage entries`);
        } catch (error) {
            console.warn('Storage cleanup failed:', error);
        }
    }

    // CACHE MANAGEMENT
    clear(): void {
        this.memoryCache.clear();
        this.requestsInProgress.clear();

        // Clear localStorage cache
        try {
            const keysToRemove: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key?.startsWith(this.storagePrefix)) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(key => localStorage.removeItem(key));
        } catch (error) {
            console.warn('Storage clear failed:', error);
        }
    }

    // CACHE STATISTICS
    getStats() {
        return {
            memoryEntries: this.memoryCache.size,
            requestsInProgress: this.requestsInProgress.size,
            storageEntries: this.getStorageEntryCount()
        };
    }

    private getStorageEntryCount(): number {
        try {
            let count = 0;
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key?.startsWith(this.storagePrefix)) {
                    count++;
                }
            }
            return count;
        } catch {
            return 0;
        }
    }
}

export default ChartDataCache;