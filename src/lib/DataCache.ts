// Optimized for financial data with different TTLs per data type

interface CacheEntry<T> {
 data: T;
 timestamp: number;
 ttl: number;
 accessCount: number;
 lastAccessed: number;
 key: string;
}

interface CacheStats {
 totalEntries: number;
 hitRate: number;
 memoryUsage: string;
 oldestEntry: number;
 mostAccessed: string;
}

class UltraFastDataCache {
 private cache = new Map<string, CacheEntry<any>>();
 private hitCount = 0;
 private missCount = 0;
 private maxSize = 500;
 private cleanupInterval: NodeJS.Timeout;

 // Cache TTL for different data types (in milliseconds)
 private readonly TTL_CONFIG = {
 // Real-time data - very short TTL
 quotes: 10 * 1000, // 10 seconds
 realtime: 15 * 1000, // 15 seconds
 
 // Intraday data - short TTL
 intraday: 60 * 1000, // 1 minute
 options_flow: 2 * 60 * 1000, // 2 minutes
 
 // Daily data - medium TTL
 daily: 5 * 60 * 1000, // 5 minutes
 gex: 5 * 60 * 1000, // 5 minutes
 options: 10 * 60 * 1000, // 10 minutes
 
 // Historical data - long TTL
 historical: 30 * 60 * 1000, // 30 minutes
 seasonal: 60 * 60 * 1000, // 1 hour
 patterns: 2 * 60 * 60 * 1000, // 2 hours
 
 // Company data - very long TTL
 details: 24 * 60 * 60 * 1000, // 24 hours
 fundamentals: 12 * 60 * 60 * 1000 // 12 hours
 };

 constructor() {
 // Auto-cleanup every 2 minutes
 this.cleanupInterval = setInterval(() => {
 this.cleanup();
 }, 2 * 60 * 1000);
 
 console.log(' UltraFastDataCache initialized with smart TTL system');
 }

 // Get data from cache
 get<T>(key: string): T | null {
 const entry = this.cache.get(key);
 
 if (!entry) {
 this.missCount++;
 return null;
 }

 const now = Date.now();
 
 // Check if expired
 if (now > entry.timestamp + entry.ttl) {
 this.cache.delete(key);
 this.missCount++;
 return null;
 }

 // Update access stats
 entry.accessCount++;
 entry.lastAccessed = now;
 
 this.hitCount++;
 
 console.log(` Cache HIT: ${key} (accessed ${entry.accessCount} times)`);
 return entry.data;
 }

 set<T>(key: string, data: T, dataType?: keyof typeof this.TTL_CONFIG): void {
 const now = Date.now();
 
 // Determine TTL based on data type or use default
 const ttl = dataType ? this.TTL_CONFIG[dataType] : this.TTL_CONFIG.daily;
 
 const entry: CacheEntry<T> = {
 data,
 timestamp: now,
 ttl,
 accessCount: 1,
 lastAccessed: now,
 key
 };

 this.cache.set(key, entry);
 
 // Enforce max size
 if (this.cache.size > this.maxSize) {
 this.evictLeastUsed();
 }

 console.log(` Cache SET: ${key} (TTL: ${Math.round(ttl/1000)}s, Type: ${dataType || 'default'})`);
 }

 // Smart cache keys for different data types
 static keys = {
 // Historical data
 HISTORICAL: (symbol: string, timeframe: string, period: string) => 
 `hist:${symbol}:${timeframe}:${period}`,
 
 // Options data
 OPTIONS: (symbol: string, expiration?: string) => 
 `opt:${symbol}${expiration ? `:${expiration}` : ''}`,
 
 // Options flow
 FLOW: (symbol: string, date?: string) => 
 `flow:${symbol}${date ? `:${date}` : ''}`,
 
 // Seasonal data
 SEASONAL: (symbol: string, years: number) => 
 `seasonal:${symbol}:${years}y`,
 
 // GEX data
 GEX: (symbol: string) => `gex:${symbol}`,
 
 // Real-time quotes
 QUOTES: (symbol: string) => `quotes:${symbol}`,
 
 // Company details
 DETAILS: (symbol: string) => `details:${symbol}`,
 
 // Bulk data
 BULK: (symbols: string[], dataTypes: string[]) => 
 `bulk:${symbols.sort().join(',')}:${dataTypes.sort().join(',')}`,
 
 // Batch data
 BATCH: (symbols: string[], timeframe: string, period: string) =>
 `batch:${symbols.sort().join(',')}:${timeframe}:${period}`
 };

 // Bulk set for multiple entries
 setBulk<T>(entries: Array<{ key: string; data: T; dataType?: keyof UltraFastDataCache['TTL_CONFIG'] }>): void {
 entries.forEach(({ key, data, dataType }) => {
 this.set(key, data, dataType as keyof typeof this.TTL_CONFIG);
 });
 
 console.log(` Cache BULK SET: ${entries.length} entries`);
 }

 // Get multiple entries at once
 getBulk<T>(keys: string[]): Record<string, T | null> {
 const results: Record<string, T | null> = {};
 
 keys.forEach(key => {
 results[key] = this.get<T>(key);
 });
 
 const hitCount = Object.values(results).filter(v => v !== null).length;
 console.log(` Cache BULK GET: ${hitCount}/${keys.length} hits`);
 
 return results;
 }

 // Invalidate specific data type for a symbol
 invalidateSymbol(symbol: string, dataType?: string): void {
 const keysToDelete: string[] = [];
 
 for (const [key] of this.cache.entries()) {
 if (key.includes(symbol)) {
 if (!dataType || key.includes(dataType)) {
 keysToDelete.push(key);
 }
 }
 }
 
 keysToDelete.forEach(key => this.cache.delete(key));
 console.log(` Cache INVALIDATED: ${keysToDelete.length} entries for ${symbol}${dataType ? ` (${dataType})` : ''}`);
 }

 // Preload popular symbols
 async preloadPopularSymbols(symbols: string[]): Promise<void> {
 console.log(` Preloading ${symbols.length} popular symbols...`);
 
 const preloadPromises = symbols.map(async (symbol) => {
 try {
 // Preload basic data types
 const [historical, options, details] = await Promise.allSettled([
 this.fetchAndCache(symbol, 'historical'),
 this.fetchAndCache(symbol, 'options'),
 this.fetchAndCache(symbol, 'details')
 ]);
 
 return { symbol, success: true };
 } catch (error) {
 console.error(` Preload failed for ${symbol}:`, error);
 return { symbol, success: false };
 }
 });
 
 const results = await Promise.all(preloadPromises);
 const successCount = results.filter(r => r.success).length;
 
 console.log(` Preloaded ${successCount}/${symbols.length} symbols`);
 }

 // Fetch and cache data
 private async fetchAndCache(symbol: string, dataType: string): Promise<any> {
 const key = `${dataType}:${symbol}`;
 const cached = this.get(key);
 
 if (cached) {
 return cached;
 }
 
 throw new Error(`Data unavailable for ${symbol} (${dataType}) `);
 }

 // Smart cleanup - removes expired and least used entries
 private cleanup(): void {
 const now = Date.now();
 let removedCount = 0;
 
 for (const [key, entry] of this.cache.entries()) {
 // Remove expired entries
 if (now > entry.timestamp + entry.ttl) {
 this.cache.delete(key);
 removedCount++;
 }
 }
 
 if (removedCount > 0) {
 console.log(` Cache cleanup: removed ${removedCount} expired entries`);
 }
 }

 // Evict least recently used entries when cache is full
 private evictLeastUsed(): void {
 const entries = Array.from(this.cache.entries());
 
 // Sort by last accessed time (oldest first)
 entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
 
 // Remove oldest 10% of entries
 const toRemove = Math.ceil(entries.length * 0.1);
 
 for (let i = 0; i < toRemove; i++) {
 this.cache.delete(entries[i][0]);
 }
 
 console.log(` Cache eviction: removed ${toRemove} least used entries`);
 }

 // Get cache statistics
 getStats(): CacheStats {
 const totalRequests = this.hitCount + this.missCount;
 const hitRate = totalRequests > 0 ? (this.hitCount / totalRequests) * 100 : 0;
 
 let oldestTimestamp = Date.now();
 let mostAccessedKey = '';
 let maxAccess = 0;
 
 for (const [key, entry] of this.cache.entries()) {
 if (entry.timestamp < oldestTimestamp) {
 oldestTimestamp = entry.timestamp;
 }
 if (entry.accessCount > maxAccess) {
 maxAccess = entry.accessCount;
 mostAccessedKey = key;
 }
 }
 
 return {
 totalEntries: this.cache.size,
 hitRate: Math.round(hitRate * 100) / 100,
 memoryUsage: `${Math.round(this.cache.size * 0.001)}KB`, // Rough estimate
 oldestEntry: Date.now() - oldestTimestamp,
 mostAccessed: mostAccessedKey
 };
 }

 // Clear all cache
 clear(): void {
 this.cache.clear();
 this.hitCount = 0;
 this.missCount = 0;
 console.log(' Cache cleared completely');
 }

 // Destroy cache and cleanup interval
 destroy(): void {
 clearInterval(this.cleanupInterval);
 this.clear();
 console.log(' Cache destroyed');
 }
}

// Create singleton instance
const globalCache = new UltraFastDataCache();

export default globalCache;
export { UltraFastDataCache };
export type { CacheStats };