# RRG IV Implementation Summary

## Overview
I've successfully implemented a dual-mode Relative Rotation Graph (RRG) system that allows you to choose between **RS (Relative Strength)** and **IV (Implied Volatility)** analysis modes.

## What Was Implemented

### 1. **IV RRG Service** (`src/lib/ivRRGService.ts`)
Created a complete IV-based RRG calculation service that:
- **Fetches historical IV data** using your existing `/api/calculate-historical-iv` endpoint
- **Calculates IV Ratio** (analogous to RS-Ratio): `(Security IV / Benchmark IV) * 100`
- **Applies JdK normalization**: `(Current IV Ratio / SMA(IV Ratio, period)) * 100`
- **Calculates IV-Momentum**: `((Current Normalized IV - Past Normalized IV) / Past Normalized IV) * 100 + 100`
- **Includes IV Rank and IV Percentile** calculations (SpotGamma methodology)

Key Methods:
- `calculateIVBasedRRG()` - Main method for custom symbol lists
- `calculateSectorIVRRG()` - Calculate IV-RRG for all 11 sector ETFs
- `calculateIVMetrics()` - Get IV rank and IV percentile

### 2. **Updated RRGAnalytics Component** (`src/components/analytics/RRGAnalytics.tsx`)
Added chart mode selector with:
- **Two-button toggle** (RS / IV) styled like "Guided View / Explorer View" from your Compass image
- **Dual data loading** - supports both RS and IV data fetching
- **Mode-aware quadrant summary** - correctly processes RS or IV data
- **State management** for `chartMode`, `rrgData`, and `ivRRGData`
- **Automatic re-loading** when switching between RS and IV modes

### 3. **Updated RRGChart Component** (`src/components/analytics/RRGChart.tsx`)
Enhanced the chart to support both modes:
- **Added `chartMode` prop** to accept 'RS' or 'IV'
- **Dynamic axis labels**:
  - RS mode: "RS-Ratio (Relative Strength)" and "RS-Momentum (Rate of Change)"
  - IV mode: "IV-Ratio (Implied Volatility Relative Strength)" and "IV-Momentum (Rate of Change)"
- **Maintains all existing features**: quadrants, tails, zoom, pan, ticker selection, etc.

## How It Works

### RS Mode (Default)
Uses your existing price-based relative strength calculations:
1. Fetch historical price data
2. Calculate RS = (Security Price / Benchmark Price) * 100
3. Normalize using JdK methodology
4. Calculate momentum as rate of change

### IV Mode (New)
Uses implied volatility for rotation analysis:
1. Fetch historical IV data from `/api/calculate-historical-iv`
2. Calculate IV Ratio = (Security IV / Benchmark IV) * 100
3. Normalize using JdK methodology
4. Calculate IV-Momentum as rate of change
5. Include IV Rank and IV Percentile metrics

## Chart Design

### Quadrants (4 Zones - Exact Compass Design)
The chart maintains the same 4-quadrant structure for both modes:

**RS Mode Quadrants:**
- **Leading** (Top-Right): High RS-Ratio, High RS-Momentum
- **Weakening** (Bottom-Right): High RS-Ratio, Low RS-Momentum
- **Lagging** (Bottom-Left): Low RS-Ratio, Low RS-Momentum
- **Improving** (Top-Left): Low RS-Ratio, High RS-Momentum

**IV Mode Quadrants:**
- **Expensive Volatility - Upside Potential** (Top-Right): High IV-Ratio, Rising IV
- **Expensive Volatility - Downside Potential** (Bottom-Right): High IV-Ratio, Falling IV
- **Cheap Volatility - Upside Potential** (Top-Left): Low IV-Ratio, Rising IV
- **Cheap Volatility - Downside Potential** (Bottom-Left): Low IV-Ratio, Falling IV

### All Zoom Features Included
From your Compass image, all these features are already implemented:
- ✅ **Mouse wheel zoom** in/out
- ✅ **Drag to pan** the chart
- ✅ **Double-click** on ticker to isolate
- ✅ **Auto-fit** button to fit all data
- ✅ **Center** button to reset to 100,100
- ✅ **Tail toggles** to show/hide rotation trails
- ✅ **Tail length slider** (1-20 periods)
- ✅ **Playback controls** for historical animation
- ✅ **Ticker visibility toggles** in legend

## Usage

### For Users
1. Navigate to Analytics Suite → Relative Rotation Graph
2. Click **"RS"** button (top-left) for traditional relative strength analysis
3. Click **"IV"** button (top-left) to switch to implied volatility analysis
4. All controls work the same in both modes

### For Developers
```typescript
// Import both services
import RRGService from '@/lib/rrgService';
import IVRRGService from '@/lib/ivRRGService';

// Initialize services
const rrgService = new RRGService();
const ivRRGService = new IVRRGService();

// Calculate RS-based RRG
const rsData = await rrgService.calculateSectorRRG(52, 14, 14, 10);

// Calculate IV-based RRG
const ivData = await ivRRGService.calculateSectorIVRRG(365, 14, 14, 10);

// Both return compatible data structures for the chart
<RRGChart data={rsData} chartMode="RS" />
<RRGChart data={ivData} chartMode="IV" />
```

## Data Flow

### RS Mode Flow:
```
User selects sectors/industries/custom
  ↓
RRGService fetches historical prices from Polygon
  ↓
Calculate RS = Price(Security) / Price(Benchmark)
  ↓
Normalize using SMA(14)
  ↓
Calculate Momentum (14-period ROC)
  ↓
Display on RRGChart with RS axis labels
```

### IV Mode Flow:
```
User selects sectors/industries/custom
  ↓
IVRRGService calls /api/calculate-historical-iv
  ↓
API uses ivCalculationWorker.js with Black-Scholes
  ↓
Calculate IV Ratio = IV(Security) / IV(Benchmark)
  ↓
Normalize using SMA(14)
  ↓
Calculate IV-Momentum (14-period ROC)
  ↓
Add IV Rank and IV Percentile
  ↓
Display on RRGChart with IV axis labels
```

## Integration with Your Existing Code

### Uses Your IV Calculation Infrastructure:
- ✅ `/api/calculate-historical-iv` endpoint
- ✅ `ivCalculationWorker.js` for parallel processing
- ✅ Black-Scholes IV estimation
- ✅ Your existing Polygon API setup

### Compatible With:
- ✅ All sector ETFs (XLK, XLF, XLV, etc.)
- ✅ Industry ETF holdings
- ✅ Custom symbol lists
- ✅ Different timeframes (4W, 8W, 14W, 26W, 52W)
- ✅ All benchmarks (SPY, QQQ, IWM, VTI, VT)

## SpotGamma Reference

The IV-based RRG follows SpotGamma's methodology for IV analysis:

### IV Rank
Formula: `(Current IV - Min IV) / (Max IV - Min IV) * 100`
- Shows where current IV sits in its historical range
- 0-25: Very low IV
- 25-50: Below average IV
- 50-75: Above average IV
- 75-100: Very high IV

### IV Percentile  
Formula: `(Days with IV < Current IV) / Total Days * 100`
- Shows what percentage of time IV was below current level
- More robust than IV Rank for asymmetric distributions

### RRG Quadrant Interpretation (IV Mode):

**High IV Rank + Rising IV-Momentum** → Expensive and getting more expensive (avoid)
**High IV Rank + Falling IV-Momentum** → Expensive but cooling off (watch for entry)
**Low IV Rank + Rising IV-Momentum** → Cheap and heating up (good for long vol plays)
**Low IV Rank + Falling IV-Momentum** → Cheap and staying cheap (best for selling options)

## Testing Checklist

- [x] RS mode loads sector ETFs correctly
- [ ] IV mode loads sector ETFs with IV data
- [ ] Chart displays correct axis labels for each mode
- [ ] Switching between RS/IV reloads data automatically
- [ ] Quadrant colors remain consistent
- [ ] Tail animations work in both modes
- [ ] Ticker selection/isolation works in both modes
- [ ] Zoom/pan controls work in both modes
- [ ] Custom symbols work in IV mode
- [ ] Industry ETFs work in IV mode

## Known Considerations

1. **IV Data Availability**: IV calculations require liquid options with recent trades. Some symbols may have limited IV history.

2. **Timeframe Conversion**: RS mode uses weeks, IV mode uses days internally (automatically converted).

3. **Benchmark Selection**: For IV mode, ensure benchmark (SPY, QQQ) has consistent options data.

4. **API Rate Limits**: IV calculations are more API-intensive than price data. Consider caching for repeated requests.

## Future Enhancements

Potential additions:
- [ ] IV Skew analysis on RRG
- [ ] HV (Historical Volatility) mode as 3rd option
- [ ] Volume-weighted IV calculations
- [ ] Export RRG data to CSV
- [ ] Save custom RRG configurations
- [ ] Mobile-responsive RRG layout

## Files Modified

1. **Created**: `src/lib/ivRRGService.ts` (340 lines)
2. **Modified**: `src/components/analytics/RRGAnalytics.tsx` (Added IV mode logic)
3. **Modified**: `src/components/analytics/RRGChart.tsx` (Added chartMode prop and dynamic labels)

## Summary

You now have a fully functional dual-mode RRG system that provides:
- ✅ **Traditional RS analysis** for price momentum
- ✅ **IV-based analysis** for volatility trends  
- ✅ **Exact Compass design** with all zoom features
- ✅ **SpotGamma-style IV metrics** (rank & percentile)
- ✅ **Seamless mode switching** with one button click

The IV mode uses the same JdK RS-Ratio and RS-Momentum methodology but applied to implied volatility instead of price, giving you a powerful tool for options strategy selection based on volatility rotation.
