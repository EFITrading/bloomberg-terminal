/**
 * HIGH-PERFORMANCE MATHEMATICAL CALCULATIONS
 * Optimized mathematical operations for options flow processing
 * Uses vectorized calculations and SharedArrayBuffer for maximum performance
 */

const math = require('mathjs');

class OptimizedCalculationEngine {
 constructor() {
 console.log(' Initializing High-Performance Calculation Engine...');
 
 // Pre-compile mathematical expressions for reuse
 this.compiledExpressions = new Map();
 this.initializeCompiledExpressions();
 
 // Cache for frequently calculated values
 this.calculationCache = new Map();
 this.cacheHits = 0;
 this.cacheMisses = 0;
 
 console.log(' Calculation engine ready with compiled expressions and caching');
 }
 
 /**
 * Initialize pre-compiled mathematical expressions for common calculations
 */
 initializeCompiledExpressions() {
 console.log(' Compiling mathematical expressions...');
 
 // Black-Scholes components (for IV calculations)
 this.compiledExpressions.set('d1', math.compile('(log(S / K) + (r + (sigma^2) / 2) * T) / (sigma * sqrt(T))'));
 this.compiledExpressions.set('d2', math.compile('d1 - sigma * sqrt(T)'));
 
 // Greeks calculations
 this.compiledExpressions.set('delta_call', math.compile('normcdf(d1)'));
 this.compiledExpressions.set('delta_put', math.compile('normcdf(d1) - 1'));
 this.compiledExpressions.set('gamma', math.compile('normpdf(d1) / (S * sigma * sqrt(T))'));
 this.compiledExpressions.set('theta_call', math.compile('-(S * normpdf(d1) * sigma) / (2 * sqrt(T)) - r * K * exp(-r * T) * normcdf(d2)'));
 this.compiledExpressions.set('vega', math.compile('S * sqrt(T) * normpdf(d1)'));
 
 // Volume-weighted calculations
 this.compiledExpressions.set('vwap', math.compile('sum(prices .* volumes) / sum(volumes)'));
 this.compiledExpressions.set('volatility', math.compile('sqrt(mean((returns - mean(returns)).^2))'));
 
 console.log(` Compiled ${this.compiledExpressions.size} mathematical expressions`);
 }
 
 /**
 * VECTORIZED BATCH CALCULATIONS
 * Process multiple calculations simultaneously for maximum performance
 */
 calculateBatch(calculations, useSharedBuffer = true) {
 const batchStart = performance.now();
 
 try {
 const results = [];
 let cacheHitsThisBatch = 0;
 
 // Use SharedArrayBuffer for large datasets if supported
 if (useSharedBuffer && typeof SharedArrayBuffer !== 'undefined' && calculations.length > 100) {
 console.log(` Using SharedArrayBuffer for batch of ${calculations.length} calculations`);
 return this.calculateWithSharedBuffer(calculations);
 }
 
 // Process calculations in parallel batches
 const batchSize = Math.min(50, Math.max(1, Math.floor(calculations.length / 4)));
 const batches = [];
 
 for (let i = 0; i < calculations.length; i += batchSize) {
 batches.push(calculations.slice(i, i + batchSize));
 }
 
 // Process each batch
 for (const batch of batches) {
 const batchResults = batch.map(calc => {
 // Check cache first
 const cacheKey = this.generateCacheKey(calc);
 if (this.calculationCache.has(cacheKey)) {
 cacheHitsThisBatch++;
 return this.calculationCache.get(cacheKey);
 }
 
 // Perform calculation
 const result = this.performOptimizedCalculation(calc);
 
 // Cache result (with size limit)
 if (this.calculationCache.size < 10000) {
 this.calculationCache.set(cacheKey, result);
 }
 
 return result;
 });
 
 results.push(...batchResults);
 }
 
 const batchTime = performance.now() - batchStart;
 this.cacheHits += cacheHitsThisBatch;
 this.cacheMisses += (calculations.length - cacheHitsThisBatch);
 
 console.log(` Batch calculation complete: ${calculations.length} operations in ${batchTime.toFixed(2)}ms (${cacheHitsThisBatch} cache hits)`);
 
 return results;
 
 } catch (error) {
 console.error(' Batch calculation failed:', error);
 throw error;
 }
 }
 
 /**
 * SharedArrayBuffer Implementation for Processing
 */
 calculateWithSharedBuffer(calculations) {
 const bufferStart = performance.now();
 
 try {
 const numCalculations = calculations.length;
 const resultSize = numCalculations * 8; // 8 bytes per float64
 
 // Create SharedArrayBuffer for results
 const sharedBuffer = new SharedArrayBuffer(resultSize);
 const results = new Float64Array(sharedBuffer);
 
 console.log(` SharedArrayBuffer allocated: ${(resultSize / 1024).toFixed(2)}KB for ${numCalculations} calculations`);
 
 // Process calculations in chunks for optimal memory usage
 const chunkSize = Math.min(1000, Math.max(100, Math.floor(numCalculations / 8)));
 
 for (let i = 0; i < numCalculations; i += chunkSize) {
 const chunkEnd = Math.min(i + chunkSize, numCalculations);
 
 for (let j = i; j < chunkEnd; j++) {
 const calc = calculations[j];
 
 // Optimized calculation based on type
 switch (calc.type) {
 case 'blackScholes':
 results[j] = this.fastBlackScholes(calc.params);
 break;
 case 'impliedVolatility':
 results[j] = this.fastImpliedVolatility(calc.params);
 break;
 case 'greeks':
 results[j] = this.fastGreeks(calc.params);
 break;
 case 'vwap':
 results[j] = this.fastVWAP(calc.params);
 break;
 default:
 results[j] = this.performOptimizedCalculation(calc);
 }
 }
 }
 
 const bufferTime = performance.now() - bufferStart;
 console.log(` SharedArrayBuffer calculation complete: ${numCalculations} operations in ${bufferTime.toFixed(2)}ms`);
 
 // Convert back to regular array for compatibility
 return Array.from(results);
 
 } catch (error) {
 console.error(' SharedArrayBuffer calculation failed:', error);
 // Fallback to regular processing
 return this.calculateBatch(calculations, false);
 }
 }
 
 /**
 * BLACK-SCHOLES CALCULATION
 * Optimized implementation without external dependencies
 */
 fastBlackScholes({ S, K, T, r, sigma, type = 'call' }) {
 if (T <= 0 || sigma <= 0) return 0;
 
 const sqrtT = Math.sqrt(T);
 const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * sqrtT);
 const d2 = d1 - sigma * sqrtT;
 
 const nd1 = this.fastNormCDF(d1);
 const nd2 = this.fastNormCDF(d2);
 
 if (type === 'call') {
 return S * nd1 - K * Math.exp(-r * T) * nd2;
 } else {
 return K * Math.exp(-r * T) * (1 - nd2) - S * (1 - nd1);
 }
 }
 
 /**
 * Fast approximation of cumulative normal distribution
 */
 fastNormCDF(x) {
 const a1 = 0.254829592;
 const a2 = -0.284496736;
 const a3 = 1.421413741;
 const a4 = -1.453152027;
 const a5 = 1.061405429;
 const p = 0.3275911;
 
 const sign = x < 0 ? -1 : 1;
 x = Math.abs(x) / Math.sqrt(2);
 
 const t = 1 / (1 + p * x);
 const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
 
 return 0.5 * (1 + sign * y);
 }
 
 /**
 * IMPLIED VOLATILITY
 * Newton-Raphson method with optimized convergence
 */
 fastImpliedVolatility({ marketPrice, S, K, T, r, type = 'call' }) {
 if (T <= 0) return 0;
 
 let sigma = 0.2; // Initial guess
 let iterations = 0;
 const maxIterations = 20;
 const tolerance = 0.0001;
 
 while (iterations < maxIterations) {
 const price = this.fastBlackScholes({ S, K, T, r, sigma, type });
 const vega = this.fastVega({ S, K, T, r, sigma });
 
 if (Math.abs(vega) < 1e-10) break;
 
 const diff = price - marketPrice;
 if (Math.abs(diff) < tolerance) break;
 
 sigma -= diff / vega;
 sigma = Math.max(0.001, Math.min(5.0, sigma)); // Keep within bounds
 
 iterations++;
 }
 
 return sigma;
 }
 
 /**
 * Fast Vega calculation
 */
 fastVega({ S, K, T, r, sigma }) {
 if (T <= 0 || sigma <= 0) return 0;
 
 const sqrtT = Math.sqrt(T);
 const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * sqrtT);
 
 return S * sqrtT * Math.exp(-d1 * d1 / 2) / Math.sqrt(2 * Math.PI);
 }
 
 /**
 * GREEKS CALCULATION
 */
 fastGreeks({ S, K, T, r, sigma, type = 'call' }) {
 if (T <= 0 || sigma <= 0) return { delta: 0, gamma: 0, theta: 0, vega: 0 };
 
 const sqrtT = Math.sqrt(T);
 const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * sqrtT);
 const d2 = d1 - sigma * sqrtT;
 
 const nd1 = this.fastNormCDF(d1);
 const nd2 = this.fastNormCDF(d2);
 const phi_d1 = Math.exp(-d1 * d1 / 2) / Math.sqrt(2 * Math.PI);
 
 let delta, theta;
 
 if (type === 'call') {
 delta = nd1;
 theta = -(S * phi_d1 * sigma) / (2 * sqrtT) - r * K * Math.exp(-r * T) * nd2;
 } else {
 delta = nd1 - 1;
 theta = -(S * phi_d1 * sigma) / (2 * sqrtT) + r * K * Math.exp(-r * T) * (1 - nd2);
 }
 
 const gamma = phi_d1 / (S * sigma * sqrtT);
 const vega = S * sqrtT * phi_d1;
 
 return { delta, gamma, theta, vega };
 }
 
 /**
 * VWAP CALCULATION
 */
 fastVWAP({ prices, volumes }) {
 if (!prices.length || !volumes.length) return 0;
 
 let totalValue = 0;
 let totalVolume = 0;
 
 for (let i = 0; i < prices.length; i++) {
 const value = prices[i] * volumes[i];
 totalValue += value;
 totalVolume += volumes[i];
 }
 
 return totalVolume > 0 ? totalValue / totalVolume : 0;
 }
 
 /**
 * Generate cache key for calculations
 */
 generateCacheKey(calc) {
 return JSON.stringify({
 type: calc.type,
 params: Object.keys(calc.params).sort().reduce((obj, key) => {
 obj[key] = typeof calc.params[key] === 'number' ? 
 Math.round(calc.params[key] * 10000) / 10000 : // Round to 4 decimals for caching
 calc.params[key];
 return obj;
 }, {})
 });
 }
 
 /**
 * Perform optimized calculation based on type
 */
 performOptimizedCalculation(calc) {
 const calcStart = performance.now();
 let result;
 
 try {
 switch (calc.type) {
 case 'blackScholes':
 result = this.fastBlackScholes(calc.params);
 break;
 case 'impliedVolatility':
 result = this.fastImpliedVolatility(calc.params);
 break;
 case 'greeks':
 result = this.fastGreeks(calc.params);
 break;
 case 'vwap':
 result = this.fastVWAP(calc.params);
 break;
 default:
 // Use compiled expressions for other calculations
 if (this.compiledExpressions.has(calc.type)) {
 const expression = this.compiledExpressions.get(calc.type);
 result = expression.evaluate(calc.params);
 } else {
 throw new Error(`Unknown calculation type: ${calc.type}`);
 }
 }
 
 const calcTime = performance.now() - calcStart;
 if (calcTime > 10) { // Log slow calculations
 console.warn(` Slow calculation detected: ${calc.type} took ${calcTime.toFixed(2)}ms`);
 }
 
 return result;
 
 } catch (error) {
 console.error(` Calculation failed for ${calc.type}:`, error);
 return null;
 }
 }
 
 /**
 * Get performance statistics
 */
 getPerformanceStats() {
 const totalRequests = this.cacheHits + this.cacheMisses;
 const cacheHitRate = totalRequests > 0 ? (this.cacheHits / totalRequests * 100).toFixed(2) : 0;
 
 return {
 cacheSize: this.calculationCache.size,
 cacheHits: this.cacheHits,
 cacheMisses: this.cacheMisses,
 cacheHitRate: `${cacheHitRate}%`,
 compiledExpressions: this.compiledExpressions.size
 };
 }
 
 /**
 * Clear calculation cache
 */
 clearCache() {
 this.calculationCache.clear();
 this.cacheHits = 0;
 this.cacheMisses = 0;
 console.log(' Calculation cache cleared');
 }
}

module.exports = OptimizedCalculationEngine;