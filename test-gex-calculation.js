console.log('🔍 TESTING GAMMA EXPOSURE CALCULATION...\n');

// Simulate the fixed calculateGammaExposure function
const calculateGammaExposure = (
  openInterest,
  spot,
  polygonGamma,
  contractType = 'call'
) => {
  // Use Polygon's real gamma - if no gamma, return 0
  if (!polygonGamma || isNaN(polygonGamma)) {
    return 0;
  }

  // FILTER OUT FAKE GAMMA VALUES
  const absGamma = Math.abs(polygonGamma);
  
  // Realistic gamma bounds: SPY options actually have gamma between 0.00001 and 0.1
  // Any gamma above 1.0 is likely fake/corrupted data
  if (absGamma > 1.0) {
    console.warn(`🚫 FILTERING FAKE GAMMA: ${absGamma} for ${contractType} (too high)`);
    return 0;
  }
  
  // Filter only extremely low values that are likely zero/noise
  if (absGamma < 0.000001) {
    return 0;
  }
  
  // GEX = Gamma × OI × 100 × Spot²
  let gex = absGamma * openInterest * 100 * spot * spot;
  
  // Apply dealer perspective signs:
  // - Calls: Positive GEX (dealers short gamma)
  // - Puts: Negative GEX (dealers short gamma)
  if (contractType === 'put') {
    gex = -gex;
  }
  
  return gex;
};

// Test with real values from the API
const testCases = [
  {
    strike: 500,
    gamma: 0.00004297718291059731,
    openInterest: 26,
    type: 'put'
  },
  {
    strike: 505,
    gamma: 0.00004571017245212991,
    openInterest: 5,
    type: 'put'
  },
  {
    strike: 520,
    gamma: 0.000055483807767211915,
    openInterest: 33,
    type: 'put'
  }
];

const currentSpotPrice = 570; // Approximate SPY price

console.log('📊 GAMMA EXPOSURE CALCULATIONS:');
console.log(`Current Spot Price: $${currentSpotPrice}\n`);

testCases.forEach(testCase => {
  const gex = calculateGammaExposure(
    testCase.openInterest,
    currentSpotPrice,
    testCase.gamma,
    testCase.type
  );
  
  console.log(`Strike $${testCase.strike} (${testCase.type.toUpperCase()}):`);
  console.log(`  Gamma: ${testCase.gamma}`);
  console.log(`  Open Interest: ${testCase.openInterest}`);
  console.log(`  Calculated GEX: ${gex.toLocaleString()}`);
  console.log(`  GEX (millions): ${(gex / 1000000).toFixed(2)}M`);
  console.log('');
});

console.log('✅ These should now show real GEX values instead of 0!');