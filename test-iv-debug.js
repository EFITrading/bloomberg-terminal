// Debug IV calculation vs expected results

// Error function approximation
const erf = (x) => {
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;
  
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  
  return sign * y;
};

// Cumulative standard normal distribution
const normalCDF = (x) => {
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
};

// Black-Scholes price calculation
const calculateBlackScholesPrice = (S, K, r, sigma, T, isCall) => {
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  
  if (isCall) {
    return S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
  } else {
    return K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
  }
};

// Vega calculation for IV estimation
const calculateVega = (S, K, r, sigma, T) => {
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  return S * Math.sqrt(T) * (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * d1 * d1);
};

// Simple IV estimation function using Newton-Raphson method
const estimateIVFromPrice = (S, K, optionPrice, r, T, isCall) => {
  let iv = 0.20; // starting guess
  
  for (let i = 0; i < 50; i++) {
    const theoreticalPrice = calculateBlackScholesPrice(S, K, r, iv, T, isCall);
    const vega = calculateVega(S, K, r, iv, T);
    
    if (Math.abs(vega) < 0.0001) break;
    
    const diff = theoreticalPrice - optionPrice;
    iv = iv - diff / vega;
    
    if (Math.abs(diff) < 0.01) break;
    if (iv <= 0) iv = 0.01;
    if (iv >= 3) iv = 3;
  }
  
  return Math.max(0.05, Math.min(2.0, iv)); // Clamp between 5% and 200%
};

// Calculate d2 parameter (probability of stock being above strike at expiry)
const calculateD2 = (S, K, r, sigma, T) => {
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  return d1 - sigma * Math.sqrt(T);
};

// Chance of profit for selling a call (stock stays below strike)
const chanceOfProfitSellCall = (currentPrice, strike, riskFreeRate, iv, timeToExpiry) => {
  const d2 = calculateD2(currentPrice, strike, riskFreeRate, iv, timeToExpiry);
  return (1 - normalCDF(d2)) * 100; // Probability stock stays BELOW strike for call sellers to profit
};

// Chance of profit for selling a put (stock stays above strike)
const chanceOfProfitSellPut = (currentPrice, strike, riskFreeRate, iv, timeToExpiry) => {
  const d2 = calculateD2(currentPrice, strike, riskFreeRate, iv, timeToExpiry);
  return normalCDF(d2) * 100; // Probability stock stays ABOVE strike for put sellers to profit
};

// Find strike price for a given probability
const findStrikeForProbability = (S, r, sigma, T, targetProb, isCall) => {
  console.log(`Finding strike for ${targetProb}% ${isCall ? 'call' : 'put'} - Stock: $${S}, IV: ${(sigma * 100).toFixed(1)}%, T: ${T.toFixed(4)}`);
  
  if (isCall) {
    // For selling calls: Use binary search for efficiency
    let low = S + 0.01; // Start just above stock price
    let high = S * 1.50; // Search up to 50% above stock price
    
    for (let i = 0; i < 50; i++) {
      const mid = (low + high) / 2;
      const prob = chanceOfProfitSellCall(S, mid, r, sigma, T);
      
      if (Math.abs(prob - targetProb) < 0.1) {
        console.log(`Found call strike: $${mid.toFixed(2)} gives ${prob.toFixed(2)}% probability`);
        return mid;
      }
      
      if (prob < targetProb) {
        low = mid; // Need higher strike
      } else {
        high = mid; // Need lower strike
      }
    }
    return (low + high) / 2;
  } else {
    // For puts: Use binary search for efficiency
    let low = S * 0.50; // Search down to 50% below stock price
    let high = S - 0.01; // Start just below stock price
    
    for (let i = 0; i < 50; i++) {
      const mid = (low + high) / 2;
      const prob = chanceOfProfitSellPut(S, mid, r, sigma, T);
      
      if (Math.abs(prob - targetProb) < 0.1) {
        console.log(`Found put strike: $${mid.toFixed(2)} gives ${prob.toFixed(2)}% probability`);
        return mid;
      }
      
      if (prob < targetProb) {
        high = mid; // Need lower strike
      } else {
        low = mid; // Need higher strike
      }
    }
    return (low + high) / 2;
  }
};

// Test scenarios
async function testIVScenarios() {
  console.log('🔍 Testing IV calculation scenarios for SPY\n');
  
  const currentPrice = 663;
  const riskFreeRate = 0.0408; // 4.08%
  const timeToExpiry = 5 / 365; // 5 days
  const daysToExpiry = 5;
  
  console.log('📊 Base Parameters:');
  console.log(`   Current Price: $${currentPrice}`);
  console.log(`   Risk-Free Rate: ${(riskFreeRate * 100).toFixed(2)}%`);
  console.log(`   Time to Expiry: ${timeToExpiry.toFixed(4)} years (${daysToExpiry} days)\n`);
  
  // Test 1: What IV gives us the expected strikes?
  console.log('🎯 TEST 1: Expected strikes with 11.8% IV');
  const expectedIV = 0.118;
  
  const callStrike90_expected = findStrikeForProbability(currentPrice, riskFreeRate, expectedIV, timeToExpiry, 90, true);
  const putStrike90_expected = findStrikeForProbability(currentPrice, riskFreeRate, expectedIV, timeToExpiry, 90, false);
  
  console.log(`   With 11.8% IV:`);
  console.log(`   Call 90% Strike: $${callStrike90_expected.toFixed(2)} (Expected: $673)`);
  console.log(`   Put 90% Strike: $${putStrike90_expected.toFixed(2)} (Expected: $648.5)\n`);
  
  // Test 2: What option prices would give us 11.8% IV?
  console.log('🎯 TEST 2: What option prices give 11.8% IV?');
  const atmStrike = 663;
  
  const theoreticalCallPrice = calculateBlackScholesPrice(currentPrice, atmStrike, riskFreeRate, expectedIV, timeToExpiry, true);
  const theoreticalPutPrice = calculateBlackScholesPrice(currentPrice, atmStrike, riskFreeRate, expectedIV, timeToExpiry, false);
  
  console.log(`   ATM Call price for 11.8% IV: $${theoreticalCallPrice.toFixed(2)}`);
  console.log(`   ATM Put price for 11.8% IV: $${theoreticalPutPrice.toFixed(2)}\n`);
  
  // Test 3: IV from current market prices
  console.log('🎯 TEST 3: IV from current market prices');
  const marketCallPrice = 4.25;
  const marketPutPrice = 3.75;
  
  const calculatedCallIV = estimateIVFromPrice(currentPrice, atmStrike, marketCallPrice, riskFreeRate, timeToExpiry, true);
  const calculatedPutIV = estimateIVFromPrice(currentPrice, atmStrike, marketPutPrice, riskFreeRate, timeToExpiry, false);
  const averageIV = (calculatedCallIV + calculatedPutIV) / 2;
  
  console.log(`   Market Call Price: $${marketCallPrice} → IV: ${(calculatedCallIV * 100).toFixed(1)}%`);
  console.log(`   Market Put Price: $${marketPutPrice} → IV: ${(calculatedPutIV * 100).toFixed(1)}%`);
  console.log(`   Average IV: ${(averageIV * 100).toFixed(1)}%\n`);
  
  // Test 4: What strikes do we get with calculated IV?
  console.log('🎯 TEST 4: Strikes with calculated IV');
  const callStrike90_calc = findStrikeForProbability(currentPrice, riskFreeRate, averageIV, timeToExpiry, 90, true);
  const putStrike90_calc = findStrikeForProbability(currentPrice, riskFreeRate, averageIV, timeToExpiry, 90, false);
  
  console.log(`   With ${(averageIV * 100).toFixed(1)}% IV:`);
  console.log(`   Call 90% Strike: $${callStrike90_calc.toFixed(2)}`);
  console.log(`   Put 90% Strike: $${putStrike90_calc.toFixed(2)}\n`);
  
  // Test 5: What market prices would give us the expected strikes?
  console.log('🎯 TEST 5: Reverse engineering - what prices give expected strikes?');
  
  // Binary search to find what IV gives us the expected strikes
  let testIV = 0.118;
  let bestIV = testIV;
  let bestCallDiff = Infinity;
  let bestPutDiff = Infinity;
  
  for (let iv = 0.08; iv <= 0.15; iv += 0.001) {
    const testCallStrike = findStrikeForProbability(currentPrice, riskFreeRate, iv, timeToExpiry, 90, true);
    const testPutStrike = findStrikeForProbability(currentPrice, riskFreeRate, iv, timeToExpiry, 90, false);
    
    const callDiff = Math.abs(testCallStrike - 673);
    const putDiff = Math.abs(testPutStrike - 648.5);
    const totalDiff = callDiff + putDiff;
    
    if (totalDiff < bestCallDiff + bestPutDiff) {
      bestIV = iv;
      bestCallDiff = callDiff;
      bestPutDiff = putDiff;
    }
  }
  
  console.log(`   Best fit IV: ${(bestIV * 100).toFixed(1)}% gives:`);
  const bestCallStrike = findStrikeForProbability(currentPrice, riskFreeRate, bestIV, timeToExpiry, 90, true);
  const bestPutStrike = findStrikeForProbability(currentPrice, riskFreeRate, bestIV, timeToExpiry, 90, false);
  console.log(`   Call Strike: $${bestCallStrike.toFixed(2)} (Target: $673, Diff: $${Math.abs(bestCallStrike - 673).toFixed(2)})`);
  console.log(`   Put Strike: $${bestPutStrike.toFixed(2)} (Target: $648.5, Diff: $${Math.abs(bestPutStrike - 648.5).toFixed(2)})`);
  
  // What option prices would give us this IV?
  const requiredCallPrice = calculateBlackScholesPrice(currentPrice, atmStrike, riskFreeRate, bestIV, timeToExpiry, true);
  const requiredPutPrice = calculateBlackScholesPrice(currentPrice, atmStrike, riskFreeRate, bestIV, timeToExpiry, false);
  
  console.log(`\n   Required option prices for ${(bestIV * 100).toFixed(1)}% IV:`);
  console.log(`   ATM Call: $${requiredCallPrice.toFixed(2)} (Current: $${marketCallPrice})`);
  console.log(`   ATM Put: $${requiredPutPrice.toFixed(2)} (Current: $${marketPutPrice})`);
}

testIVScenarios().catch(console.error);