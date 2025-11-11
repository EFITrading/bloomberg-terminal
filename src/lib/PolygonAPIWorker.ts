// Polygon API Worker
class PolygonAPIWorker {
 private apiKey: string;
 private requestQueue: Array<{
 url: string;
 resolve: (data: any) => void;
 reject: (error: any) => void;
 priority: number;
 retries: number;
 }> = [];
 
 private processing = false;
 private rateLimitDelay = 50; // 50ms between requests for unlimited API (20 req/sec)
 private maxConcurrent = 20; // Max 20 concurrent requests for unlimited API
 private activeRequests = 0;
 private lastRequestTime = 0;

 constructor(apiKey: string) {
 this.apiKey = apiKey;
 }

 /**
 * Add request to queue with priority
 * Priority: 1 = High (watchlist), 2 = Medium (features), 3 = Low (background)
 */
 async queueRequest(url: string, priority: number = 2): Promise<any> {
 return new Promise((resolve, reject) => {
 this.requestQueue.push({
 url,
 resolve,
 reject,
 priority,
 retries: 0
 });
 
 // Sort queue by priority (lower number = higher priority)
 this.requestQueue.sort((a, b) => a.priority - b.priority);
 
 if (!this.processing) {
 this.processQueue();
 }
 });
 }

 private async processQueue() {
 if (this.processing) return;
 this.processing = true;

 while (this.requestQueue.length > 0) {
 // Respect rate limits
 const now = Date.now();
 const timeSinceLastRequest = now - this.lastRequestTime;
 
 if (timeSinceLastRequest < this.rateLimitDelay) {
 await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay - timeSinceLastRequest));
 }

 // Process up to maxConcurrent requests in parallel
 const batch = this.requestQueue.splice(0, Math.min(this.maxConcurrent - this.activeRequests, this.requestQueue.length));
 
 if (batch.length === 0) {
 await new Promise(resolve => setTimeout(resolve, 100));
 continue;
 }

 // Process batch in parallel
 const promises = batch.map(request => this.executeRequest(request));
 await Promise.allSettled(promises);
 }

 this.processing = false;
 }

 private async executeRequest(request: any): Promise<void> {
 this.activeRequests++;
 this.lastRequestTime = Date.now();

 try {
 console.log(` [Worker] Fetching: ${request.url.split('?')[0]} (Priority: ${request.priority})`);
 
 const response = await fetch(request.url, {
 headers: {
 'Accept': 'application/json',
 },
 signal: AbortSignal.timeout(10000) // 10 second timeout
 });

 if (!response.ok) {
 if (response.status === 429 && request.retries < 3) {
 // Rate limited - retry with exponential backoff
 request.retries++;
 const delay = Math.pow(2, request.retries) * 1000;
 console.log(`⏱ [Worker] Rate limited, retrying in ${delay}ms`);
 
 setTimeout(() => {
 this.requestQueue.unshift(request); // Add back to front of queue
 }, delay);
 return;
 }
 throw new Error(`HTTP ${response.status}: ${response.statusText}`);
 }

 const data = await response.json();
 request.resolve(data);
 console.log(` [Worker] Success: ${request.url.split('?')[0]}`);
 
 } catch (error) {
 if (request.retries < 2) {
 // Retry failed requests
 request.retries++;
 console.log(` [Worker] Retrying (${request.retries}/2): ${error}`);
 this.requestQueue.push(request);
 } else {
 console.error(` [Worker] Failed after retries: ${error}`);
 request.reject(error);
 }
 } finally {
 this.activeRequests--;
 }
 }

 /**
 * Batch multiple symbols into efficient API calls
 */
 async batchHistoricalData(symbols: string[], timeframe: string = '1/day', years: number = 15): Promise<{[symbol: string]: any}> { // Default 15 years
 const endDate = new Date().toISOString().split('T')[0];
 const startDate = new Date(Date.now() - years * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
 
 console.log(` [Batch] Processing ${symbols.length} symbols for ${years} years of data using unlimited API`);
 
 // Use larger batches for unlimited API
 const batchSize = Math.min(50, Math.ceil(symbols.length / 4)); // Adaptive batch size, max 50
 const results: {[symbol: string]: any} = {};
 
 for (let i = 0; i < symbols.length; i += batchSize) {
 const batch = symbols.slice(i, i + batchSize);
 
 const batchPromises = batch.map(async (symbol) => {
 try {
 const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/${timeframe}/${startDate}/${endDate}?adjusted=true&sort=asc&apikey=${this.apiKey}`;
 const data = await this.queueRequest(url, 1); // High priority
 return { symbol, data };
 } catch (error) {
 console.error(` [Batch] Failed to fetch ${symbol}:`, error);
 return { symbol, data: null };
 }
 });

 const batchResults = await Promise.allSettled(batchPromises);
 
 batchResults.forEach((result) => {
 if (result.status === 'fulfilled' && result.value.data) {
 results[result.value.symbol] = result.value.data;
 }
 });

 // Small delay between batches
 if (i + batchSize < symbols.length) {
 await new Promise(resolve => setTimeout(resolve, 500));
 }
 }

 console.log(` [Batch] Completed: ${Object.keys(results).length}/${symbols.length} symbols`);
 return results;
 }

 /**
 * Get current queue status
 */
 getQueueStatus() {
 return {
 queueLength: this.requestQueue.length,
 activeRequests: this.activeRequests,
 processing: this.processing,
 highPriority: this.requestQueue.filter(r => r.priority === 1).length,
 mediumPriority: this.requestQueue.filter(r => r.priority === 2).length,
 lowPriority: this.requestQueue.filter(r => r.priority === 3).length
 };
 }
}

// Singleton instance
let polygonWorker: PolygonAPIWorker | null = null;

export function getPolygonWorker(apiKey: string): PolygonAPIWorker {
 if (!polygonWorker) {
 polygonWorker = new PolygonAPIWorker(apiKey);
 }
 return polygonWorker;
}

export { PolygonAPIWorker };