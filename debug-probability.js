// Debug probability calculations

// Normal CDF approximation
function normalCDF(x) {
  return (1.0 + Math.sign(x) * Math.sqrt(1.0 - Math.exp(-2.0 * x * x / Math.PI))) / 2.0;
}

const calculateD2 = (currentPrice, strikePrice, riskFreeRate, volatility, timeToExpiry) => {
  const d1 = (Math.log(currentPrice / strikePrice) + (riskFreeRate + 0.5 * volatility * volatility) * timeToExpiry) / (volatility * Math.sqrt(timeToExpiry));
  return d1 - volatility * Math.sqrt(timeToExpiry);
};

const chanceOfProfitSellCall = (currentPrice, strikePrice, riskFreeRate, volatility, timeToExpiry) => {
  const d2 = calculateD2(currentPrice, strikePrice, riskFreeRate, volatility, timeToExpiry);
  return (1 - normalCDF(d2)) * 100; // Probability stock stays BELOW strike
};

// Test with SPY data
const S = 663.7;
const r = 0.0408;
const sigma = 0.1311; // 13.11%
const T = 0.0712; // 26 days

console.log('Testing Call Probability Calculations:');
console.log('Stock Price:', S);
console.log('');

// Test strikes from 664 to 700
for (let strike = 664; strike <= 700; strike += 5) {
  const prob = chanceOfProfitSellCall(S, strike, r, sigma, T);
  console.log(`Strike $${strike}: ${prob.toFixed(2)}% probability`);
}