// Test Expected Range calculation for SPY with REAL IV
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

// Black-Scholes price calculation - EXACT same as AI Suite
function calculateBlackScholesPrice(S, K, r, sigma, T, isCall) {
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  
  if (isCall) {
    return S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
  } else {
    return K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
  }
}

// Vega calculation - EXACT same as AI Suite
function calculateVega(S, K, r, sigma, T) {
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  return S * Math.sqrt(T) * (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * d1 * d1);
}

// Newton-Raphson IV estimation - EXACT same as AI Suite
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
  
  return Math.max(0.05, Math.min(2.0, iv)); // Clamp between 5% and 200%
}

// Test real IV calculation
async function testRealIVCalculation() {
  try {
    console.log('🎯 Testing REAL IV calculation for SPY...');
    
    // Get current SPY price
    const stockResponse = await fetch(
      `https://api.polygon.io/v2/last/trade/SPY?apikey=${POLYGON_API_KEY}`
    );
    const stockData = await stockResponse.json();
    const currentPrice = stockData.results.p; // correct property is 'p' not 'price'
    
    console.log(`Current SPY Price: $${currentPrice}`);
    
    // Use same dates as the component
    const weeklyExpiryDate = '2025-09-26';
    const riskFreeRate = 0.0408; // Test with 4.08% risk-free rate
    
    // Calculate 5% range for filtering
    const lowerBound = currentPrice * 0.95;
    const upperBound = currentPrice * 1.05;
    
    console.log(`Looking for strikes between $${lowerBound.toFixed(2)} and $${upperBound.toFixed(2)}`);
    
    // Get options data
    const optionsResponse = await fetch(
      `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=SPY&expiration_date=${weeklyExpiryDate}&strike_price.gte=${Math.floor(lowerBound)}&strike_price.lte=${Math.ceil(upperBound)}&limit=200&apikey=${POLYGON_API_KEY}`
    );
    
    if (!optionsResponse.ok) {
      throw new Error(`Options API failed: ${optionsResponse.status}`);
    }
    
    const optionsData = await optionsResponse.json();
    console.log(`Weekly options found: ${optionsData.results?.length || 0}`);
    
    if (!optionsData.results || optionsData.results.length === 0) {
      console.log('No options data found');
      return;
    }
    
    // Find closest ATM option
    const atmOptions = optionsData.results.filter(opt => {
      const strike = parseFloat(opt.strike_price);
      const percentDiff = Math.abs(strike - currentPrice) / currentPrice;
      return percentDiff < 0.05;
    });
    
    if (atmOptions.length === 0) {
      console.log('No ATM options found');
      return;
    }
    
    const closestOption = atmOptions.reduce((closest, current) => {
      const closestDiff = Math.abs(parseFloat(closest.strike_price) - currentPrice);
      const currentDiff = Math.abs(parseFloat(current.strike_price) - currentPrice);
      return currentDiff < closestDiff ? current : closest;
    });
    
    console.log(`Using closest option: ${closestOption.ticker} (strike: $${closestOption.strike_price})`);
    
    // Get bid/ask quotes
    const quotesResponse = await fetch(
      `https://api.polygon.io/v3/quotes/${closestOption.ticker}?limit=1&apikey=${POLYGON_API_KEY}`
    );
    
    if (!quotesResponse.ok) {
      throw new Error(`Quotes API failed: ${quotesResponse.status}`);
    }
    
    const quotesData = await quotesResponse.json();
    
    if (!quotesData.results || quotesData.results.length === 0) {
      console.log('No quotes found');
      return;
    }
    
    const quote = quotesData.results[0];
    console.log(`Bid: $${quote.bid_price}, Ask: $${quote.ask_price}`);
    
    const midPrice = (quote.bid_price + quote.ask_price) / 2;
    console.log(`Mid Price: $${midPrice.toFixed(2)}`);
    
    // Calculate time to expiry
    const today = new Date();
    const expiry = new Date(weeklyExpiryDate);
    const dte = Math.max(1, Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
    const timeToExpiry = dte / 365;
    
    console.log(`DTE: ${dte}, Time to expiry: ${timeToExpiry.toFixed(4)}`);
    
    // Calculate IV
    const isCall = closestOption.contract_type === 'call';
    const calculatedIV = estimateIVFromPrice(
      currentPrice, 
      parseFloat(closestOption.strike_price), 
      midPrice, 
      riskFreeRate, 
      timeToExpiry, 
      isCall
    );
    
    console.log(`\n📊 REAL IV Result:`);
    console.log(`Calculated IV: ${(calculatedIV * 100).toFixed(2)}%`);
    
    return calculatedIV;
    
  } catch (error) {
    console.error('Error calculating real IV:', error);
  }
}

testRealIVCalculation();