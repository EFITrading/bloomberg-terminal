// TOP 1800+ STOCKS WITH $3.5B+ MARKET CAP (Updated October 2025)
// Based on StockAnalysis.com real-time data - Companies with market cap >= $3.5B
// Ordered by market cap descending for optimal scanning priority

// ⚡ TEMPORARY: Only scan SPY and PLTR for faster testing
export const TOP_1800_SYMBOLS = [
 'SPY', 'PLTR'
];

// OPTIONS FLOW SPECIFIC: Exclude QQQ and NVDA from scanning (keep SPY)
export const OPTIONS_FLOW_SYMBOLS = TOP_1800_SYMBOLS.filter(
  ticker => !['QQQ', 'NVDA'].includes(ticker)
);

// Organize by tiers for smart preloading
export const PRELOAD_TIERS = {
 TIER_1_INSTANT: TOP_1800_SYMBOLS.slice(0, 100), // Top 100 - preload every 5 minutes
 TIER_2_FAST: TOP_1800_SYMBOLS.slice(100, 300), // 101-300 - preload every 15 minutes 
 TIER_3_REGULAR: TOP_1800_SYMBOLS.slice(300, 600), // 301-600 - preload every 30 minutes
 TIER_4_BACKGROUND: TOP_1800_SYMBOLS.slice(600, 1000), // 601-1000 - preload every 60 minutes
 TIER_5_EXTENDED: TOP_1800_SYMBOLS.slice(1000, 1400), // 1001-1400 - preload every 2 hours
 TIER_6_COMPREHENSIVE: TOP_1800_SYMBOLS.slice(1400, 1800) // 1401-1800+ - preload every 4 hours
};

export default TOP_1800_SYMBOLS;

// Maintain backward compatibility
export const TOP_1000_SYMBOLS = TOP_1800_SYMBOLS;