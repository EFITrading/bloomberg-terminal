/**
 * Black-Scholes Options Pricing and P&L Calculator
 * Implements the complete Black-Scholes formula with profit/loss simulation
 */

// Cumulative standard normal distribution function
const normalCDF = (x: number): number => {
  const a1 =  0.254829592;
  const a2 = -0.284496736;  
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;
  
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2.0);
  
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  
  return 0.5 * (1.0 + sign * y);
};

/**
 * Calculate Black-Scholes option price
 * @param S - Current stock price
 * @param K - Strike price  
 * @param T - Time to expiration in years
 * @param r - Risk-free rate (0.045 for 4.5%)
 * @param sigma - Implied volatility (0.30 for 30%)
 * @param q - Dividend yield (default 0)
 * @param isCall - true for call, false for put
 */
export const calculateBlackScholesPrice = (
  S: number, 
  K: number, 
  T: number, 
  r: number, 
  sigma: number, 
  q: number = 0, 
  isCall: boolean
): number => {
  // At expiration (T=0), use intrinsic value
  if (T <= 0) {
    return isCall ? Math.max(0, S - K) : Math.max(0, K - S);
  }
  
  // Calculate d1 and d2
  const d1 = (Math.log(S / K) + (r - q + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  
  if (isCall) {
    // Call option price: C = S×e^(-q×T)×N(d1) - K×e^(-r×T)×N(d2)
    return S * Math.exp(-q * T) * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
  } else {
    // Put option price: P = K×e^(-r×T)×N(-d2) - S×e^(-q×T)×N(-d1)
    return K * Math.exp(-r * T) * normalCDF(-d2) - S * Math.exp(-q * T) * normalCDF(-d1);
  }
};

/**
 * Calculate profit/loss for an option position
 * @param newOptionPrice - New theoretical option price from Black-Scholes
 * @param purchasePrice - Original purchase price (premium paid)
 * @param numContracts - Number of contracts (default 1)
 */
export const calculateProfitLoss = (
  newOptionPrice: number,
  purchasePrice: number,
  numContracts: number = 1
): { dollarPnL: number; percentPnL: number } => {
  const dollarPnL = (newOptionPrice - purchasePrice) * 100 * numContracts;
  const percentPnL = purchasePrice > 0 ? ((newOptionPrice - purchasePrice) / purchasePrice) * 100 : 0;
  
  return { dollarPnL, percentPnL };
};

/**
 * Generate price simulation data for profit/loss visualization
 * @param currentPrice - Current stock price
 * @param strikePrice - Option strike price
 * @param purchasePrice - Premium paid for the option
 * @param timeToExpiry - Time to expiration in years (DTE/365)
 * @param impliedVolatility - IV as decimal (0.30 for 30%)
 * @param isCall - true for call, false for put
 * @param riskFreeRate - Risk-free rate (default 0.045)
 * @param dividendYield - Dividend yield (default 0)
 * @param numContracts - Number of contracts (default 1)
 * @param priceRange - Price range percentage (+/- 50% = 0.5)
 */
export const generatePnLSimulation = (
  currentPrice: number,
  strikePrice: number,
  purchasePrice: number,
  timeToExpiry: number,
  impliedVolatility: number,
  isCall: boolean,
  riskFreeRate: number = 0.045,
  dividendYield: number = 0,
  numContracts: number = 1,
  priceRange: number = 0.5
) => {
  const results = [];
  
  // Generate price points from -50% to +50% of current price
  const minPrice = currentPrice * (1 - priceRange);
  const maxPrice = currentPrice * (1 + priceRange);
  const priceStep = (maxPrice - minPrice) / 100; // 100 data points
  
  for (let price = minPrice; price <= maxPrice; price += priceStep) {
    // Calculate new option price at this stock price
    const newOptionPrice = calculateBlackScholesPrice(
      price, 
      strikePrice, 
      timeToExpiry, 
      riskFreeRate, 
      impliedVolatility, 
      dividendYield, 
      isCall
    );
    
    // Calculate P&L
    const { dollarPnL, percentPnL } = calculateProfitLoss(newOptionPrice, purchasePrice, numContracts);
    
    results.push({
      stockPrice: price,
      optionPrice: newOptionPrice,
      dollarPnL,
      percentPnL,
      priceChange: ((price - currentPrice) / currentPrice) * 100
    });
  }
  
  return results;
};

/**
 * Generate time decay simulation data
 * @param currentPrice - Current stock price
 * @param strikePrice - Option strike price  
 * @param purchasePrice - Premium paid for the option
 * @param currentDTE - Current days to expiration
 * @param impliedVolatility - IV as decimal
 * @param isCall - true for call, false for put
 * @param riskFreeRate - Risk-free rate
 * @param dividendYield - Dividend yield
 * @param numContracts - Number of contracts
 */
export const generateTimeDecaySimulation = (
  currentPrice: number,
  strikePrice: number, 
  purchasePrice: number,
  currentDTE: number,
  impliedVolatility: number,
  isCall: boolean,
  riskFreeRate: number = 0.045,
  dividendYield: number = 0,
  numContracts: number = 1
) => {
  const results: any[] = [];
  
  // Generate time points from current DTE down to 0
  const timePoints: number[] = [];
  if (currentDTE > 30) {
    // For longer expirations, use larger steps
    for (let days = currentDTE; days >= 0; days -= Math.ceil(currentDTE / 20)) {
      timePoints.push(days);
    }
  } else {
    // For shorter expirations, use daily steps
    for (let days = currentDTE; days >= 0; days--) {
      timePoints.push(days);
    }
  }
  
  // Ensure we always include expiration (0 days)
  if (timePoints[timePoints.length - 1] !== 0) {
    timePoints.push(0);
  }
  
  timePoints.forEach(days => {
    const timeToExpiry = days / 365;
    
    // Calculate option price at this time point
    const newOptionPrice = calculateBlackScholesPrice(
      currentPrice, 
      strikePrice, 
      timeToExpiry, 
      riskFreeRate, 
      impliedVolatility, 
      dividendYield, 
      isCall
    );
    
    // Calculate P&L
    const { dollarPnL, percentPnL } = calculateProfitLoss(newOptionPrice, purchasePrice, numContracts);
    
    results.push({
      daysToExpiry: days,
      optionPrice: newOptionPrice,
      dollarPnL,
      percentPnL
    });
  });
  
  return results.sort((a, b) => b.daysToExpiry - a.daysToExpiry); // Sort by days descending
};

/**
 * Calculate break-even points for an option
 * @param strikePrice - Option strike price
 * @param purchasePrice - Premium paid
 * @param isCall - true for call, false for put
 */
export const calculateBreakeven = (strikePrice: number, purchasePrice: number, isCall: boolean): number => {
  return isCall ? strikePrice + purchasePrice : strikePrice - purchasePrice;
};

/**
 * Calculate maximum profit and loss
 * @param strikePrice - Option strike price
 * @param purchasePrice - Premium paid
 * @param isCall - true for call, false for put
 * @param numContracts - Number of contracts
 */
export const calculateMaxProfitLoss = (
  strikePrice: number, 
  purchasePrice: number, 
  isCall: boolean, 
  numContracts: number = 1
) => {
  const maxLoss = -purchasePrice * 100 * numContracts; // Maximum loss is premium paid
  
  let maxProfit: number;
  if (isCall) {
    maxProfit = Infinity; // Calls have unlimited upside
  } else {
    // Puts max profit when stock goes to $0
    maxProfit = (strikePrice - purchasePrice) * 100 * numContracts;
  }
  
  return { maxProfit, maxLoss };
};