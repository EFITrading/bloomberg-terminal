# Market Regime Enhancement Implementation Plan

## Current System (lines 7970-7995 in EFICharting.tsx)
```typescript
const growthSectors = ['XLY', 'XLK', 'XLC'];
const defensiveSectors = ['XLP', 'XLU', 'XLRE', 'XLV'];
const valueSectors = ['XLB', 'XLI', 'XLF', 'XLE'];

// Binary check: sector > SPY or sector <= SPY
const growthRising = growthSectors.filter(s => (getChange(s) - spyChange) > 0).length;
const defensiveFalling = defensiveSectors.filter(s => (getChange(s) - spyChange) <= 0).length;

if (growthRising === 3 && defensiveFalling >= 3) return 'RISK ON';
if (growthFalling === 3 && defensiveRising >= 3) return 'DEFENSIVE';
```

## New Enhanced System

### 1. Data Structure for Sector Analysis
```typescript
interface SectorAnalysis {
  sector: string;
  change: number;
  relativeToSPY: number;
  holdingsUp: number;
  holdingsDown: number;
  totalHoldings: number;
  breadth: number; // % of holdings positive
  topHoldingsChange: number; // avg of top 10
  velocity: number; // rate of change per hour
  acceleration: number; // change in velocity
}

interface RegimeAnalysis {
  // Core metrics
  defensiveAvg: number;
  growthAvg: number;
  valueAvg: number;
  
  // Delta scoring
  defensiveGrowthSpread: number; // Defensive - Growth
  spreadStrength: 'STRONG' | 'MODERATE' | 'WEAK';
  
  // Correlation
  defensiveGrowthCorrelation: number; // -1 to 1
  rotationClarity: 'CLEAR' | 'MIXED' | 'UNCLEAR';
  
  // Regime determination
  regime: 'STRONG DEFENSIVE' | 'MODERATE DEFENSIVE' | 'RISK ON' | 'STRONG RISK ON' | 'VALUE' | 'MIXED' | 'RISK OFF';
  confidence: number; // 0-100%
  
  // Detailed sector data
  defensiveSectors: SectorAnalysis[];
  growthSectors: SectorAnalysis[];
  valueSectors: SectorAnalysis[];
  
  // Multi-timeframe
  timeframes: {
    '5min': { regime: string; confidence: number };
    '15min': { regime: string; confidence: number };
    '1hr': { regime: string; confidence: number };
    '1d': { regime: string; confidence: number };
  };
}
```

### 2. Enhanced Calculation Logic
```typescript
const calculateEnhancedRegime = (period: string): RegimeAnalysis => {
  const growthSectors = ['XLY', 'XLK', 'XLC'];
  const defensiveSectors = ['XLP', 'XLU', 'XLRE', 'XLV'];
  const valueSectors = ['XLB', 'XLI', 'XLF', 'XLE'];
  
  const spyChange = getChange('SPY');
  
  // Calculate average changes
  const defensiveChanges = defensiveSectors.map(s => getChange(s));
  const growthChanges = growthSectors.map(s => getChange(s));
  const valueChanges = valueSectors.map(s => getChange(s));
  
  const defensiveAvg = defensiveChanges.reduce((a, b) => a + b, 0) / defensiveChanges.length;
  const growthAvg = growthChanges.reduce((a, b) => a + b, 0) / growthChanges.length;
  const valueAvg = valueChanges.reduce((a, b) => a + b, 0) / valueChanges.length;
  
  // Calculate spread (key metric!)
  const defensiveGrowthSpread = defensiveAvg - growthAvg;
  
  // Determine spread strength
  let spreadStrength: 'STRONG' | 'MODERATE' | 'WEAK';
  if (Math.abs(defensiveGrowthSpread) >= 2.0) spreadStrength = 'STRONG';
  else if (Math.abs(defensiveGrowthSpread) >= 0.5) spreadStrength = 'MODERATE';
  else spreadStrength = 'WEAK';
  
  // Calculate correlation (simplified for now - would need historical data)
  const correlation = calculateCorrelation(defensiveChanges, growthChanges);
  const rotationClarity = 
    correlation < -0.7 ? 'CLEAR' : 
    correlation < -0.3 ? 'MIXED' : 
    'UNCLEAR';
  
  // Determine regime with confidence
  let regime: string;
  let confidence: number;
  
  if (defensiveGrowthSpread >= 2.0) {
    regime = 'STRONG DEFENSIVE';
    confidence = Math.min(95, 60 + Math.abs(defensiveGrowthSpread) * 10);
  } else if (defensiveGrowthSpread >= 0.5) {
    regime = 'MODERATE DEFENSIVE';
    confidence = 50 + Math.abs(defensiveGrowthSpread) * 20;
  } else if (defensiveGrowthSpread <= -2.0) {
    regime = 'STRONG RISK ON';
    confidence = Math.min(95, 60 + Math.abs(defensiveGrowthSpread) * 10);
  } else if (defensiveGrowthSpread <= -0.5) {
    regime = 'RISK ON';
    confidence = 50 + Math.abs(defensiveGrowthSpread) * 20;
  } else if (valueAvg > defensiveAvg && valueAvg > growthAvg) {
    regime = 'VALUE';
    confidence = 60;
  } else if (defensiveAvg < 0 && growthAvg < 0) {
    regime = 'RISK OFF';
    confidence = 70;
  } else {
    regime = 'MIXED';
    confidence = 30;
  }
  
  // Adjust confidence based on correlation clarity
  if (rotationClarity === 'CLEAR') confidence += 15;
  else if (rotationClarity === 'UNCLEAR') confidence -= 15;
  
  confidence = Math.max(0, Math.min(100, confidence));
  
  return {
    defensiveAvg,
    growthAvg,
    valueAvg,
    defensiveGrowthSpread,
    spreadStrength,
    defensiveGrowthCorrelation: correlation,
    rotationClarity,
    regime,
    confidence,
    // ... sector details would be populated here
  };
};
```

### 3. UI Display Component
```tsx
<div className="market-regime-panel">
  {/* Main Delta Display */}
  <div className="regime-main">
    <div className="spread-indicator">
      {regimeAnalysis.defensiveGrowthSpread >= 0 ? (
        <span className="text-green-400 text-4xl font-black">
          +{regimeAnalysis.defensiveGrowthSpread.toFixed(1)}%
        </span>
      ) : (
        <span className="text-red-400 text-4xl font-black">
          {regimeAnalysis.defensiveGrowthSpread.toFixed(1)}%
        </span>
      )}
      <span className="text-sm ml-2">Defensive Rotation</span>
    </div>
    
    <div className="regime-label">
      <span className="text-2xl font-bold">{regimeAnalysis.regime}</span>
      <span className="text-sm opacity-70">({regimeAnalysis.confidence}% confidence)</span>
    </div>
  </div>
  
  {/* Bar Chart Visualization */}
  <div className="regime-bars">
    <div className="bar-group">
      <label>Defensive</label>
      <div className="bar green" style={{width: `${Math.abs(regimeAnalysis.defensiveAvg) * 10}%`}}>
        {regimeAnalysis.defensiveAvg.toFixed(2)}%
      </div>
    </div>
    <div className="bar-group">
      <label>Growth</label>
      <div className="bar red" style={{width: `${Math.abs(regimeAnalysis.growthAvg) * 10}%`}}>
        {regimeAnalysis.growthAvg.toFixed(2)}%
      </div>
    </div>
  </div>
  
  {/* Holdings Pills */}
  <div className="holdings-pills">
    <div className="pill">XLP: {holdingsData.XLP.up}/{holdingsData.XLP.total} ⬆️</div>
    <div className="pill">XLU: {holdingsData.XLU.up}/{holdingsData.XLU.total} ⬆️</div>
    <div className="pill">XLK: {holdingsData.XLK.up}/{holdingsData.XLK.total} ⬇️</div>
    <div className="pill">XLY: {holdingsData.XLY.up}/{holdingsData.XLY.total} ⬇️</div>
  </div>
  
  {/* Velocity Arrows */}
  <div className="velocity-indicators">
    <span>Defensive: ⬆️⬆️ +0.5%/hr</span>
    <span>Growth: ⬇️ -0.3%/hr</span>
  </div>
  
  {/* Multi-Timeframe Dots */}
  <div className="timeframe-dots">
    <span>5m 🟢</span>
    <span>15m 🟢</span>
    <span>1h 🟢</span>
    <span>1d ⚪</span>
  </div>
</div>
```

### 4. API Requirements
To implement holdings data, we need:
- Polygon.io `/v3/reference/tickers/{ticker}/snapshot` for real-time holdings performance
- Or parse holdings from sector ETF websites
- Track velocity by storing previous values in state

### 5. Implementation Steps
1. Add new state: `const [regimeAnalysis, setRegimeAnalysis] = useState<RegimeAnalysis | null>(null);`
2. Replace `calculateRegime()` with `calculateEnhancedRegime()`
3. Fetch holdings data for sectors (optional - can start with just sector-level)
4. Update UI to show new metrics
5. Add velocity tracking with time-series storage
6. Implement multi-timeframe analysis

### 6. Where to Insert Code
- **State**: Line ~3400 (near other state declarations)
- **Calculation**: Replace lines 7970-7995
- **UI Display**: Near line 14860 (where regime is displayed in header)
- **Holdings Fetch**: Add near other data fetching functions (~line 7000)

### 7. Backward Compatibility
Keep existing `getMarketRegimeForHeader()` function but have it call the new enhanced system and return simplified regime labels for existing UI components.
