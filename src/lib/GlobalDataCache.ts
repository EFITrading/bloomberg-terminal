'use client';

interface CachedData {
 data: any;
 timestamp: number;
 expiry: number;
}

class GlobalDataCache {
 private static instance: GlobalDataCache;
 private cache: Map<string, CachedData> = new Map();
 private readonly DEFAULT_EXPIRY = 5 * 60 * 1000; // 5 minutes

 static getInstance(): GlobalDataCache {
 if (!GlobalDataCache.instance) {
 GlobalDataCache.instance = new GlobalDataCache();
 }
 return GlobalDataCache.instance;
 }

 set(key: string, data: any, customExpiry?: number): void {
 const expiry = customExpiry || this.DEFAULT_EXPIRY;
 this.cache.set(key, {
 data,
 timestamp: Date.now(),
 expiry: Date.now() + expiry
 });
 console.log(` Cached data for key: ${key}`);
 }

 get(key: string): any | null {
 const cached = this.cache.get(key);
 
 if (!cached) {
 return null;
 }
 
 if (Date.now() > cached.expiry) {
 this.cache.delete(key);
 console.log(` Expired cache for key: ${key}`);
 return null;
 }
 
 console.log(` Cache hit for key: ${key}`);
 return cached.data;
 }

 has(key: string): boolean {
 const cached = this.cache.get(key);
 return cached ? Date.now() <= cached.expiry : false;
 }

 clear(): void {
 this.cache.clear();
 console.log(' Cache cleared');
 }

 getStats(): { total: number; expired: number; active: number } {
 const now = Date.now();
 let expired = 0;
 let active = 0;
 
 this.cache.forEach((cached) => {
 if (now > cached.expiry) {
 expired++;
 } else {
 active++;
 }
 });
 
 return {
 total: this.cache.size,
 expired,
 active
 };
 }

 // Specific cache keys for common data
 static keys = {
 MARKET_DATA: (symbol: string) => `market_data_${symbol}`,
 TICKER_DETAILS: (symbol: string) => `ticker_details_${symbol}`,
 SEASONAL_OPPORTUNITIES: 'seasonal_opportunities',
 FEATURED_PATTERNS: 'featured_patterns',
 WEEKLY_PATTERNS: 'weekly_patterns',
 MARKET_PATTERNS: (market: string) => `market_patterns_${market}`,
 HISTORICAL_DATA: (symbol: string, start: string, end: string) => `historical_${symbol}_${start}_${end}`
 };
}

export default GlobalDataCache;
