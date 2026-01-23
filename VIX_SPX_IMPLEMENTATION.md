# VIX/SPX Options Flow Implementation

## Overview
Implemented comprehensive VIX and SPX options flow scanning with proper API handling, strike filtering, and enrichment logic.

## Workflow: Find Trades → Classify Trades → Enrich Trades

### 1. FIND TRADES (Worker: optionsFlowWorker.js)

#### Price Fetching Strategy
- **VIX**: Get price from snapshot API (`I:VIX` endpoint) - `underlying_asset.value`
- **SPX**: Get price from snapshot API (`I:SPX` endpoint) - `underlying_asset.value`  
- **Regular stocks**: Use last trade API first, fallback to previous close

#### Contract Fetching Strategy
- **VIX**: Use snapshot API (`I:VIX?limit=250`) - limited contracts, normalize structure
- **SPX**: Use reference API with strike range filtering:
  - Calls: ATM to 1% OTM (`spotPrice` to `spotPrice * 1.01`)
  - Puts: 1% OTM to ATM (`spotPrice * 0.99` to `spotPrice`)
  - Expiration: ODTE + 1 month max
- **Regular stocks**: Use reference API with standard expiration filter

#### Contract Filtering
- **SPX**: ATM to 1% OTM only (already filtered by API, double-check range)
- **VIX & Regular stocks**: 5% ITM + all OTM
  - Calls: `strike >= spotPrice * 0.95`
  - Puts: `strike <= spotPrice * 1.05`

#### Trade Fetching
Once contracts are filtered, fetch trades for each contract using:
```
GET /v3/trades/{contract_ticker}?timestamp.gte={start}&timestamp.lte={end}
```

### 2. CLASSIFY TRADES (Service: optionsFlowService.ts)

After all trades are collected:
- Call `classifyAllTrades()` to detect:
  - **SWEEP**: Multiple trades across time/exchanges
  - **BLOCK**: Large single trades
  - **MINI**: Smaller trades meeting premium thresholds
- Apply institutional filters:
  - Premium thresholds by tier
  - ITM/ATM/OTM logic
  - Market hours validation
  - Vol/OI ratios

### 3. ENRICH TRADES (Service: optionsFlowService.ts)

#### Enrichment Methods
1. `enrichTradesWithVolOIParallel()` - Live/current day
2. `enrichTradesWithHistoricalVolOI()` - Multi-day scans

#### VIX/SPX Enrichment Logic
```typescript
// Use bulk snapshot for VIX/SPX
const snapshotUrl = (ticker === 'VIX' || ticker === 'SPX')
  ? `https://api.polygon.io/v3/snapshot/options/I:${ticker}?limit=250&apiKey={key}`
  : `https://api.polygon.io/v3/snapshot/options/{ticker}/{optionTicker}?apiKey={key}`;

// For VIX/SPX, find specific contract in bulk response
if (ticker === 'VIX' || ticker === 'SPX') {
  snapshot = Array.isArray(data.results)
    ? data.results.find(r => r.details?.ticker === optionTicker)
    : data.results;
} else {
  snapshot = data.results;
}
```

#### Enrichment Data Extracted
- **Volume**: `snapshot.day?.volume`
- **Open Interest**: `snapshot.open_interest`
- **Bid/Ask**: `snapshot.last_quote?.bid` / `ask`
- **Fill Style**: Calculated from bid/ask spread
  - `A` = Ask side (aggressive buy)
  - `AA` = Above mid
  - `B` = Bid side (aggressive sell)
  - `BB` = Below mid
- **Vol/OI Ratio**: `volume / openInterest`

## Files Modified

### 1. `src/lib/optionsFlowWorker.js`
- Lines 257-320: Replaced generic price/contract fetching with VIX/SPX/stock-specific logic
- VIX: Snapshot-based price + normalized contract structure
- SPX: Snapshot price + reference API with strike/expiry filtering
- Regular stocks: Existing logic preserved

### 2. `src/lib/optionsFlowService.ts`
#### `enrichTradesWithVolOIParallel()` (Lines 3247-3350)
- Added VIX/SPX bulk snapshot endpoint logic
- Find specific contract in bulk response array
- Debug logging for first batch

#### `enrichTradesWithHistoricalVolOI()` (Lines 3336-3450)
- Added VIX/SPX bulk snapshot endpoint logic
- Historical volume from daily aggregates
- Current OI from snapshot (doesn't change)

### 3. `src/app/api/efi-with-positioning/route.ts`
#### `fetchCurrentOptionPrices()` (Lines 220-260)
- Added VIX/SPX bulk snapshot handling
- Find specific contract in bulk response
- Extract bid/ask/price from matched contract

## Key Design Decisions

### Why Bulk Snapshot for VIX/SPX?
- VIX/SPX weeklies use different ticker format (e.g., `O:VIXW260128C00018000`)
- Single-contract snapshot endpoint often fails for these
- Bulk snapshot (`I:VIX` / `I:SPX`) returns all contracts, we filter by ticker

### Why Different Strike Ranges?
- **SPX**: Extremely large number of strikes - narrow to ATM/near OTM for relevance
- **VIX**: Limited contracts naturally, 5% ITM range captures active strikes
- **Regular stocks**: 5% ITM captures hedging activity + speculation

### Why Separate Price/Contract Flows?
- VIX snapshot includes both price and contracts - one API call
- SPX needs price first to calculate strike ranges dynamically
- Regular stocks use standard last trade endpoint

## Testing Recommendations

1. **VIX Flow Scan**:
   ```
   GET /api/options-flow?ticker=VIX
   ```
   - Verify snapshot-based price extraction
   - Check contract count (~250 limit)
   - Validate enrichment finds contracts

2. **SPX Flow Scan**:
   ```
   GET /api/options-flow?ticker=SPX
   ```
   - Verify strike filtering (should be ~50-100 contracts)
   - Check expiration range (ODTE + 1 month)
   - Validate bulk snapshot enrichment

3. **Mixed Scan**:
   ```
   GET /api/options-flow?ticker=SPY,VIX,SPX,TSLA
   ```
   - Verify each ticker uses correct API flow
   - Check classification works across all types
   - Validate enrichment for all symbols

## Performance Notes

- VIX: ~250 contracts max, very fast
- SPX: Filtered to ~50-100 contracts (was 1000+), much faster
- Regular stocks: No change, existing performance maintained
- Enrichment: Bulk snapshots reduce API calls for VIX/SPX significantly

## Future Enhancements

1. Cache VIX/SPX bulk snapshots (250 contracts per call, can reuse for multiple trades)
2. Add strike range configuration for SPX (currently hardcoded to 1% OTM)
3. Consider SPXW (SPX weeklies) separate handling if needed
4. Add VIX/SPX-specific filters (e.g., only ODTE, premium floors)
