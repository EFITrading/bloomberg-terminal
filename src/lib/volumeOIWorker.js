const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

if (!isMainThread) {
 // This is the worker thread
 const fetch = require('node-fetch').default || require('node-fetch');
 
 class VolumeOIWorker {
 constructor() {
 this.cache = new Map();
 this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes
 this.RATE_LIMIT_DELAY = 50; // 50ms between requests (faster than main service)
 this.lastRequestTime = 0;
 }

 async processContracts(contracts, apiKey) {
 console.log(` Worker: Processing ${contracts.length} volume/OI requests`);
 const results = new Map();
 
 // Process contracts in smaller batches for faster results
 const batchSize = 5; // Smaller batches for faster processing
 
 for (let i = 0; i < contracts.length; i += batchSize) {
 const batch = contracts.slice(i, i + batchSize);
 
 // Process batch in parallel
 const batchPromises = batch.map(async (contract) => {
 const key = `${contract.underlying}_${contract.strike}_${contract.expiry}_${contract.type}`;
 
 try {
 const data = await this.fetchVolumeOI(contract, apiKey);
 return { key, data };
 } catch (error) {
 console.error(` Worker error for ${key}:`, error.message);
 return { key, data: null };
 }
 });

 const batchResults = await Promise.all(batchPromises);
 batchResults.forEach(({ key, data }) => {
 results.set(key, data);
 });

 // Send progress update
 parentPort.postMessage({
 type: 'progress',
 completed: Math.min(i + batchSize, contracts.length),
 total: contracts.length,
 results: Object.fromEntries(results)
 });

 // Minimal rate limiting between batches
 if (i + batchSize < contracts.length) {
 await this.delay(25); // Very fast rate limiting
 }
 }

 return results;
 }

 async fetchVolumeOI(contract, apiKey) {
 // Rate limiting
 await this.enforceRateLimit();

 // Format option ticker
 const optionTicker = this.formatOptionTicker(
 contract.underlying,
 contract.strike,
 contract.expiry,
 contract.type
 );

 // Check cache first
 const cacheKey = optionTicker;
 const cached = this.cache.get(cacheKey);
 if (cached && Date.now() < cached.expiry) {
 return cached.data;
 }

 // Make API request
 const url = `https://api.polygon.io/v3/snapshot/options/${contract.underlying}/${optionTicker}?apiKey=${apiKey}`;
 
 const response = await fetch(url);
 
 if (!response.ok) {
 throw new Error(`API error: ${response.status} ${response.statusText}`);
 }

 const data = await response.json();
 
 if (!data?.results) {
 return null;
 }

 const results = data.results;
 const volumeOI = {
 volume: results.day?.volume || 0,
 open_interest: results.open_interest || 0
 };

 // Cache the result
 this.cache.set(cacheKey, {
 data: volumeOI,
 expiry: Date.now() + this.CACHE_TTL
 });

 return volumeOI;
 }

 formatOptionTicker(underlying, strike, expiry, type) {
 const [year, month, day] = expiry.split('-');
 const formattedExpiry = `${year.slice(-2)}${month}${day}`;
 const formattedStrike = Math.round(strike * 1000).toString().padStart(8, '0');
 const optionType = type.toUpperCase() === 'CALL' ? 'C' : 'P';
 return `O:${underlying}${formattedExpiry}${optionType}${formattedStrike}`;
 }

 async enforceRateLimit() {
 const now = Date.now();
 const timeSinceLastRequest = now - this.lastRequestTime;
 
 if (timeSinceLastRequest < this.RATE_LIMIT_DELAY) {
 await this.delay(this.RATE_LIMIT_DELAY - timeSinceLastRequest);
 }
 
 this.lastRequestTime = Date.now();
 }

 delay(ms) {
 return new Promise(resolve => setTimeout(resolve, ms));
 }
 }

 // Initialize worker
 const worker = new VolumeOIWorker();
 
 // Listen for work requests
 parentPort.on('message', async (message) => {
 try {
 if (message.type === 'process_contracts') {
 const results = await worker.processContracts(message.contracts, message.apiKey);
 
 parentPort.postMessage({
 type: 'completed',
 results: Object.fromEntries(results)
 });
 }
 } catch (error) {
 parentPort.postMessage({
 type: 'error',
 error: error.message
 });
 }
 });

 console.log(' Volume/OI Worker thread ready');
}

module.exports = { VolumeOIWorker };