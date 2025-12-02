// IV Calculation Worker for parallel historical IV processing
// Compatible with Vercel deployment

console.log('[IV-WORKER] Worker loaded');

// Black-Scholes IV calculation using Newton-Raphson method
function calculateImpliedVolatility(
  optionPrice,
  stockPrice,
  strikePrice,
  timeToExpiration,
  riskFreeRate,
  optionType
) {
  const MAX_ITERATIONS = 100;
  const PRECISION = 0.00001;
  
  let volatility = 0.3; // Initial guess
  
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const price = blackScholesPrice(stockPrice, strikePrice, timeToExpiration, riskFreeRate, volatility, optionType);
    const vega = blackScholesVega(stockPrice, strikePrice, timeToExpiration, riskFreeRate, volatility);
    
    const diff = optionPrice - price;
    
    if (Math.abs(diff) < PRECISION) {
      return volatility;
    }
    
    if (vega === 0) {
      return null;
    }
    
    volatility = volatility + diff / vega;
    
    // Keep volatility in reasonable bounds
    if (volatility <= 0.001) volatility = 0.001;
    if (volatility >= 5) volatility = 5;
  }
  
  return volatility;
}

function blackScholesPrice(S, K, T, r, sigma, type) {
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  
  if (type === 'call') {
    return S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
  } else {
    return K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
  }
}

function blackScholesVega(S, K, T, r, sigma) {
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  return S * normalPDF(d1) * Math.sqrt(T);
}

function normalCDF(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - prob : prob;
}

function normalPDF(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

self.onmessage = async function(e) {
  const { type, data } = e.data;
  
  if (type === 'CALCULATE_STRIKES') {
    try {
      const { 
        strikes, 
        stockPrice, 
        timeToExpiration, 
        riskFreeRate,
        optionType,
        ticker,
        expirationStr,
        dateStr,
        apiKey,
        workerId
      } = data;
      
      console.log(`[IV-WORKER-${workerId}] Processing ${strikes.length} ${optionType} strikes for ${dateStr}`);
      
      const ivResults = [];
      
      for (let i = 0; i < strikes.length; i++) {
        const strike = strikes[i];
        const optionTypeChar = optionType === 'call' ? 'C' : 'P';
        const paddedStrike = String(strike * 1000).padStart(8, '0');
        const optionTicker = `O:${ticker}${expirationStr.replace(/-/g, '').substring(2)}${optionTypeChar}${paddedStrike}`;
        
        try {
          // Fetch option price
          const priceUrl = `https://api.polygon.io/v2/aggs/ticker/${optionTicker}/range/1/day/${dateStr}/${dateStr}?apiKey=${apiKey}`;
          const priceRes = await fetch(priceUrl);
          const priceData = await priceRes.json();
          
          if (priceData.results && priceData.results.length > 0) {
            const optionPrice = priceData.results[0].c;
            
            if (optionPrice && optionPrice > 0.01) {
              // Calculate IV
              const iv = calculateImpliedVolatility(
                optionPrice,
                stockPrice,
                strike,
                timeToExpiration,
                riskFreeRate,
                optionType
              );
              
              if (iv !== null && iv > 0.01 && iv < 5) {
                ivResults.push(iv);
              }
            }
          }
        } catch (err) {
          console.warn(`[IV-WORKER-${workerId}] Error for strike ${strike}:`, err.message);
        }
        
        // Send progress
        if ((i + 1) % 2 === 0 || i === strikes.length - 1) {
          const progress = Math.round(((i + 1) / strikes.length) * 100);
          self.postMessage({
            type: 'PROGRESS',
            workerId,
            progress,
            optionType
          });
        }
      }
      
      console.log(`[IV-WORKER-${workerId}] Completed: ${ivResults.length}/${strikes.length} valid IVs for ${optionType}s`);
      
      // Send results
      self.postMessage({
        type: 'CALCULATION_COMPLETE',
        workerId,
        optionType,
        ivs: ivResults,
        dateStr
      });
      
    } catch (error) {
      console.error(`[IV-WORKER] Error:`, error);
      self.postMessage({
        type: 'CALCULATION_ERROR',
        error: error.message,
        workerId: data.workerId
      });
    }
  }
};

console.log('[IV-WORKER] Ready to receive messages');
