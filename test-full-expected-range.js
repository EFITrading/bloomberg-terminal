// Test FULL Expected Range calculation for SPY with REAL IV and 4.08% risk-free rate
const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

// Black-Scholes helper functions - EXACT same as AI Suite
function normalCDF(x) {
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

function erf(x) {
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
}

// Black-Scholes price calculation
function calculateBlackScholesPrice(S, K, r, sigma, T, isCall) {
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  
  if (isCall) {
    return S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
  } else {
    return K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
  }
}

// Vega calculation
function calculateVega(S, K, r, sigma, T) {
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  return S * Math.sqrt(T) * (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * d1 * d1);
}

// Newton-Raphson IV estimation
function estimateIVFromPrice(S, K, optionPrice, r, T, isCall) {
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
  
  return Math.max(0.05, Math.min(2.0, iv));
}

// Probability calculation functions - EXACT same as AI Suite
function chanceOfProfitSellCall(S, K, r, sigma, T) {
  if (T <= 0) return K >= S ? 100 : 0;
  
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  
  return normalCDF(-d2) * 100;
}

function chanceOfProfitSellPut(S, K, r, sigma, T) {
  if (T <= 0) return K <= S ? 100 : 0;
  
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  
  return normalCDF(d2) * 100;
}

// Find strike for specific probability
function findStrikeForProbability(S, r, sigma, T, targetProb, isCall) {
  let low, high;
  
  if (isCall) {
    low = S * 1.01;
    high = S * 1.05;
  } else {
    low = S * 0.95;
    high = S * 1.05;
  }
  
  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2;
    const prob = isCall ?
      chanceOfProfitSellCall(S, mid, r, sigma, T) :
      chanceOfProfitSellPut(S, mid, r, sigma, T);

    if (Math.abs(prob - targetProb) < 0.1) {
      return mid;
    }

    if (isCall) {
      if (prob < targetProb) low = mid;
      else high = mid;
    } else {
      if (prob < targetProb) high = mid;
      else low = mid;
    }
  }
  
  return (low + high) / 2;
}

// Calculate real IV from options chain
async function calculateRealIV(symbol, expiryDate, currentPrice, timeToExpiry, label) {
  const lowerBound = currentPrice * 0.95;
  const upperBound = currentPrice * 1.05;
  
  // Get options data
  const optionsResponse = await fetch(
    `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${symbol}&expiration_date=${expiryDate}&strike_price.gte=${Math.floor(lowerBound)}&strike_price.lte=${Math.ceil(upperBound)}&limit=200&apikey=${POLYGON_API_KEY}`
  );
  
  if (!optionsResponse.ok) {
    throw new Error(`Options API failed for ${label}: ${optionsResponse.status}`);
  }
  
  const optionsData = await optionsResponse.json();
  
  if (!optionsData.results || optionsData.results.length === 0) {
    throw new Error(`No options data found for ${label}`);
  }
  
  // Find closest ATM option
  const atmOptions = optionsData.results.filter(opt => {
    const strike = parseFloat(opt.strike_price);
    const percentDiff = Math.abs(strike - currentPrice) / currentPrice;
    return percentDiff < 0.05;
  });
  
  if (atmOptions.length === 0) {
    throw new Error(`No ATM options found for ${label}`);
  }
  
  const closestOption = atmOptions.reduce((closest, current) => {
    const closestDiff = Math.abs(parseFloat(closest.strike_price) - currentPrice);
    const currentDiff = Math.abs(parseFloat(current.strike_price) - currentPrice);
    return currentDiff < closestDiff ? current : closest;
  });
  
  // Get bid/ask quotes
  const quotesResponse = await fetch(
    `https://api.polygon.io/v3/quotes/${closestOption.ticker}?limit=1&apikey=${POLYGON_API_KEY}`
  );
  
  if (!quotesResponse.ok) {
    throw new Error(`Quotes API failed for ${label}: ${quotesResponse.status}`);
  }
  
  const quotesData = await quotesResponse.json();
  
  if (!quotesData.results || quotesData.results.length === 0) {
    throw new Error(`No quotes found for ${label}`);
  }
  
  const quote = quotesData.results[0];
  const midPrice = (quote.bid_price + quote.ask_price) / 2;
  
  console.log(`${label} - Strike: $${closestOption.strike_price}, Mid: $${midPrice.toFixed(2)}`);
  
  // Calculate IV
  const isCall = closestOption.contract_type === 'call';
  const calculatedIV = estimateIVFromPrice(
    currentPrice, 
    parseFloat(closestOption.strike_price), 
    midPrice, 
    0.0408, // 4.08% risk-free rate
    timeToExpiry, 
    isCall
  );
  
  return calculatedIV;
}

// Main test function
async function testFullExpectedRange() {
  try {
    console.log('🎯 Testing FULL Expected Range for SPY with 4.08% risk-free rate...\n');
    
    // Get current SPY price
    const stockResponse = await fetch(
      `https://api.polygon.io/v2/last/trade/SPY?apikey=${POLYGON_API_KEY}`
    );
    const stockData = await stockResponse.json();
    const currentPrice = stockData.results.p;
    
    console.log(`Current SPY Price: $${currentPrice}\n`);
    
    // Calculate expiry dates and times
    const weeklyExpiryDate = '2025-09-26';
    const monthlyExpiryDate = '2025-10-17';
    const riskFreeRate = 0.0408; // 4.08%
    
    const today = new Date();
    const weeklyExpiry = new Date(weeklyExpiryDate);
    const monthlyExpiry = new Date(monthlyExpiryDate);
    
    const weeklyDTE = Math.max(1, Math.ceil((weeklyExpiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
    const monthlyDTE = Math.max(1, Math.ceil((monthlyExpiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
    
    const weeklyTimeToExpiry = weeklyDTE / 365;
    const monthlyTimeToExpiry = monthlyDTE / 365;
    
    console.log(`Weekly DTE: ${weeklyDTE} days (${weeklyTimeToExpiry.toFixed(4)} years)`);
    console.log(`Monthly DTE: ${monthlyDTE} days (${monthlyTimeToExpiry.toFixed(4)} years)\n`);
    
    // Calculate real IVs
    console.log('📊 Calculating Real IVs...');
    const weeklyIV = await calculateRealIV('SPY', weeklyExpiryDate, currentPrice, weeklyTimeToExpiry, 'Weekly');
    const monthlyIV = await calculateRealIV('SPY', monthlyExpiryDate, currentPrice, monthlyTimeToExpiry, 'Monthly');
    
    console.log(`\nWeekly IV: ${(weeklyIV * 100).toFixed(2)}%`);
    console.log(`Monthly IV: ${(monthlyIV * 100).toFixed(2)}%\n`);
    
    // Calculate Expected Range levels
    console.log('🎯 Calculating Expected Range Strike Levels...\n');
    
    const levels = {
      weekly80Call: findStrikeForProbability(currentPrice, riskFreeRate, weeklyIV, weeklyTimeToExpiry, 80, true),
      weekly90Call: findStrikeForProbability(currentPrice, riskFreeRate, weeklyIV, weeklyTimeToExpiry, 90, true),
      weekly80Put: findStrikeForProbability(currentPrice, riskFreeRate, weeklyIV, weeklyTimeToExpiry, 80, false),
      weekly90Put: findStrikeForProbability(currentPrice, riskFreeRate, weeklyIV, weeklyTimeToExpiry, 90, false),
      monthly80Call: findStrikeForProbability(currentPrice, riskFreeRate, monthlyIV, monthlyTimeToExpiry, 80, true),
      monthly90Call: findStrikeForProbability(currentPrice, riskFreeRate, monthlyIV, monthlyTimeToExpiry, 90, true),
      monthly80Put: findStrikeForProbability(currentPrice, riskFreeRate, monthlyIV, monthlyTimeToExpiry, 80, false),
      monthly90Put: findStrikeForProbability(currentPrice, riskFreeRate, monthlyIV, monthlyTimeToExpiry, 90, false)
    };
    
    console.log('📊 EXPECTED RANGE RESULTS (4.08% Risk-Free Rate):');
    console.log('═══════════════════════════════════════════════════');
    console.log('WEEKLY (5 DTE):');
    console.log(`  80% Call: $${levels.weekly80Call.toFixed(2)}`);
    console.log(`  90% Call: $${levels.weekly90Call.toFixed(2)}`);
    console.log(`  80% Put:  $${levels.weekly80Put.toFixed(2)}`);
    console.log(`  90% Put:  $${levels.weekly90Put.toFixed(2)}`);
    console.log('');
    console.log('MONTHLY (26 DTE):');
    console.log(`  80% Call: $${levels.monthly80Call.toFixed(2)}`);
    console.log(`  90% Call: $${levels.monthly90Call.toFixed(2)}`);
    console.log(`  80% Put:  $${levels.monthly80Put.toFixed(2)}`);
    console.log(`  90% Put:  $${levels.monthly90Put.toFixed(2)}`);
    console.log('═══════════════════════════════════════════════════');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testFullExpectedRange();