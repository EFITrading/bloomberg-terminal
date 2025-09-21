'use client';

'use client';

import { useState, useEffect } from 'react';
import '../terminal.css';
import Footer from '@/components/terminal/Footer';

// Black-Scholes probability calculation
function normalCDF(x: number): number {
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

function erf(x: number): number {
  // Abramowitz and Stegun approximation
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return sign * y;
}

function calculateD2(S: number, K: number, r: number, sigma: number, T: number): number {
  return (Math.log(S / K) + (r - 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
}

function chanceOfProfitSellCall(S: number, K: number, r: number, sigma: number, T: number): number {
  const d2 = calculateD2(S, K, r, sigma, T);
  return normalCDF(-d2) * 100; // FIXED: Should be -d2 for chance stock stays BELOW strike
}

function chanceOfProfitSellPut(S: number, K: number, r: number, sigma: number, T: number): number {
  const d2 = calculateD2(S, K, r, sigma, T);
  return normalCDF(d2) * 100; // FIXED: Should be d2 for chance stock stays ABOVE strike
}

// Calculate strike prices for target probabilities
function findStrikeForProbability(S: number, r: number, sigma: number, T: number, targetProb: number, isCall: boolean): number {
  console.log(`Finding strike for ${targetProb}% ${isCall ? 'call' : 'put'} - Stock: $${S}, IV: ${(sigma*100).toFixed(1)}%, T: ${T.toFixed(4)}`);
  
  // FIXED BOUNDS: Use 5% range like the working API calls
  // For selling calls, we need strikes ABOVE current price for high probability
  // For selling puts, we need strikes BELOW current price for high probability
  let low: number, high: number;
  if (isCall) {
    low = S * 1.01;  // Just above current price for calls
    high = S * 1.05; // 5% above current price for calls
  } else {
    low = S * 0.95;  // 5% below current price for puts  
    high = S * 1.05; // 5% above current price for puts
  }

  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2;
    const prob = isCall ?
      chanceOfProfitSellCall(S, mid, r, sigma, T) :
      chanceOfProfitSellPut(S, mid, r, sigma, T);

    console.log(`Iteration ${i}: Strike $${mid.toFixed(2)} -> ${prob.toFixed(2)}% (target: ${targetProb}%)`);

    if (Math.abs(prob - targetProb) < 0.1) {
      console.log(`Converged: Strike $${mid.toFixed(2)} gives ${prob.toFixed(2)}% probability`);
      return mid;
    }

    // FIXED BINARY SEARCH LOGIC
    if (isCall) {
      // For selling calls: Higher strike = higher probability
      if (prob < targetProb) low = mid;  // Need higher strike
      else high = mid;                   // Need lower strike
    } else {
      // For selling puts: Lower strike = higher probability  
      if (prob < targetProb) high = mid; // Need lower strike
      else low = mid;                    // Need higher strike
    }
  }
  
  const finalStrike = (low + high) / 2;
  console.log(`Final strike after 100 iterations: $${finalStrike.toFixed(2)}`);
  return finalStrike;
}

function OptionsProbabilityCalculator() {
  const [symbol, setSymbol] = useState('SPY');
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [weeklyIV, setWeeklyIV] = useState<number | null>(null);
  const [monthlyIV, setMonthlyIV] = useState<number | null>(null);
  const [probabilities, setProbabilities] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Your Polygon API key
  const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

  // Risk-free rate (approximate current 3-month treasury)
  const riskFreeRate = 0.053; // 5.3%

  // Time calculations - CORRECTED FOR 2025
  const now = new Date();
  const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  
  // For September 20, 2025 (Saturday), next Friday is September 26, 2025
  const nextFriday = new Date('2025-09-26'); // Hardcoded correct Friday

  const nextMonthlyExpiry = new Date('2025-10-17'); // Third Friday of October 2025

  const weeklyDTE = Math.max(1, Math.ceil((nextFriday.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  const monthlyDTE = Math.max(1, Math.ceil((nextMonthlyExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  const weeklyT = weeklyDTE / 365;
  const monthlyT = monthlyDTE / 365;

  // Fetch current price and implied volatility from Polygon API for BOTH weekly and monthly
  const fetchMarketData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Get current price
      const priceResponse = await fetch(
        `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apikey=${POLYGON_API_KEY}`
      );
      
      if (!priceResponse.ok) {
        throw new Error(`API Error: ${priceResponse.status}`);
      }
      
      const priceData = await priceResponse.json();
      
      if (!priceData.results || priceData.results.length === 0) {
        throw new Error(`No data found for symbol ${symbol}`);
      }
      
      const price = priceData.results[0]?.c;
      
      if (!price || price <= 0) {
        throw new Error(`Invalid price data for ${symbol}`);
      }
      
      setCurrentPrice(price);
      console.log('SPY CURRENT PRICE:', price);

      // Calculate 5% range for API filtering to avoid scanning $325 strikes when SPY is $663
      const lowerBound = price * 0.95; // $630
      const upperBound = price * 1.05; // $697

      // Get Weekly IV from weekly options chain - FIXED FOR TIMEZONE
      // Polygon API uses Eastern Time, fix for California/Pacific Time difference
      const weeklyExpiryDate = '2025-09-26'; // September 26, 2025 - HARDCODED CORRECT DATE
      
      console.log(`Fetching SPY options for expiry: ${weeklyExpiryDate}`);
      
      // Calculate 5% range for filtering
      const weeklyLowerBound = price * 0.95; // $630
      const weeklyUpperBound = price * 1.05; // $697
      console.log(`Weekly options - looking for strikes between $${weeklyLowerBound.toFixed(2)} and $${weeklyUpperBound.toFixed(2)}`);
      
      console.log(`API URL: https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${symbol}&expiration_date=${weeklyExpiryDate}&strike_price.gte=${Math.floor(weeklyLowerBound)}&strike_price.lte=${Math.ceil(weeklyUpperBound)}&limit=200`);

      const weeklyOptionsResponse = await fetch(
        `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${symbol}&expiration_date=${weeklyExpiryDate}&strike_price.gte=${Math.floor(weeklyLowerBound)}&strike_price.lte=${Math.ceil(weeklyUpperBound)}&limit=200&apikey=${POLYGON_API_KEY}`
      );

      console.log('Weekly options API response status:', weeklyOptionsResponse.status);

      if (!weeklyOptionsResponse.ok) {
        const errorText = await weeklyOptionsResponse.text();
        console.log('API Error Response:', errorText);
        throw new Error(`Failed to fetch weekly options data: ${weeklyOptionsResponse.status} - ${errorText}`);
      }

      const weeklyOptionsData = await weeklyOptionsResponse.json();
      console.log('Weekly options data received:', {
        resultsCount: weeklyOptionsData.results?.length || 0,
        status: weeklyOptionsData.status,
        firstFewResults: weeklyOptionsData.results?.slice(0, 3)
      });
      
      // DEBUG: Show what strikes the weekly API actually returned
      if (weeklyOptionsData.results && weeklyOptionsData.results.length > 0) {
        const weeklyStrikes = weeklyOptionsData.results.map((opt: any) => parseFloat(opt.strike_price)).sort((a: number, b: number) => a - b);
        console.log('WEEKLY API - Strikes returned:', weeklyStrikes.slice(0, 10));
        console.log('WEEKLY API - Strike range:', Math.min(...weeklyStrikes), 'to', Math.max(...weeklyStrikes));
        console.log('WEEKLY API - Expected range:', weeklyLowerBound.toFixed(2), 'to', weeklyUpperBound.toFixed(2));
      }
      
      if (!weeklyOptionsData.results || weeklyOptionsData.results.length === 0) {
        throw new Error(`No weekly options data available for ${symbol} on ${weeklyExpiryDate}`);
      }

      // Get Monthly IV from monthly options chain
      const monthlyExpiryDate = '2025-10-17'; // October 17, 2025
      
      console.log(`Fetching SPY monthly options for expiry: ${monthlyExpiryDate}`);
      
      // Calculate 5% range for filtering
      const monthlyLowerBound = price * 0.95; // $630
      const monthlyUpperBound = price * 1.05; // $697
      console.log(`Monthly options - looking for strikes between $${monthlyLowerBound.toFixed(2)} and $${monthlyUpperBound.toFixed(2)}`);

      const monthlyOptionsResponse = await fetch(
        `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${symbol}&expiration_date=${monthlyExpiryDate}&strike_price.gte=${Math.floor(monthlyLowerBound)}&strike_price.lte=${Math.ceil(monthlyUpperBound)}&limit=200&apikey=${POLYGON_API_KEY}`
      );

      if (!monthlyOptionsResponse.ok) {
        throw new Error(`Failed to fetch monthly options data: ${monthlyOptionsResponse.status}`);
      }

      const monthlyOptionsData = await monthlyOptionsResponse.json();
      
      // DEBUG: Show what strikes the monthly API actually returned
      if (monthlyOptionsData.results && monthlyOptionsData.results.length > 0) {
        const monthlyStrikes = monthlyOptionsData.results.map((opt: any) => parseFloat(opt.strike_price)).sort((a: number, b: number) => a - b);
        console.log('MONTHLY API - Strikes returned:', monthlyStrikes.slice(0, 10));
        console.log('MONTHLY API - Strike range:', Math.min(...monthlyStrikes), 'to', Math.max(...monthlyStrikes));
        console.log('MONTHLY API - Expected range:', monthlyLowerBound.toFixed(2), 'to', monthlyUpperBound.toFixed(2));
      }
      
      if (!monthlyOptionsData.results || monthlyOptionsData.results.length === 0) {
        throw new Error(`No monthly options data available for ${symbol} on ${monthlyExpiryDate}`);
      }

      // Calculate Weekly IV
      const weeklyIVResult = await calculateIVFromOptionsChain(weeklyOptionsData.results, price, weeklyT, symbol + ' weekly');
      setWeeklyIV(weeklyIVResult);

      // Calculate Monthly IV  
      const monthlyIVResult = await calculateIVFromOptionsChain(monthlyOptionsData.results, price, monthlyT, symbol + ' monthly');
      setMonthlyIV(monthlyIVResult);

      // Calculate probability levels using respective IVs
      const calcs: any = {};

      console.log('=== CALCULATING ALL PROBABILITIES ===');

      // Weekly calculations using weekly IV
      console.log('Weekly calculations starting...');
      calcs.weekly80Call = findStrikeForProbability(price, riskFreeRate, weeklyIVResult, weeklyT, 80, true);
      console.log('weekly80Call calculated:', calcs.weekly80Call);
      
      calcs.weekly90Call = findStrikeForProbability(price, riskFreeRate, weeklyIVResult, weeklyT, 90, true);
      console.log('weekly90Call calculated:', calcs.weekly90Call);
      
      calcs.weekly80Put = findStrikeForProbability(price, riskFreeRate, weeklyIVResult, weeklyT, 80, false);
      console.log('weekly80Put calculated:', calcs.weekly80Put);
      
      calcs.weekly90Put = findStrikeForProbability(price, riskFreeRate, weeklyIVResult, weeklyT, 90, false);
      console.log('weekly90Put calculated:', calcs.weekly90Put);

      // Monthly calculations using monthly IV
      console.log('Monthly calculations starting...');
      calcs.monthly80Call = findStrikeForProbability(price, riskFreeRate, monthlyIVResult, monthlyT, 80, true);
      console.log('monthly80Call calculated:', calcs.monthly80Call);
      
      calcs.monthly90Call = findStrikeForProbability(price, riskFreeRate, monthlyIVResult, monthlyT, 90, true);
      console.log('monthly90Call calculated:', calcs.monthly90Call);
      
      calcs.monthly80Put = findStrikeForProbability(price, riskFreeRate, monthlyIVResult, monthlyT, 80, false);
      console.log('monthly80Put calculated:', calcs.monthly80Put);
      
      calcs.monthly90Put = findStrikeForProbability(price, riskFreeRate, monthlyIVResult, monthlyT, 90, false);
      console.log('monthly90Put calculated:', calcs.monthly90Put);

      console.log('FINAL CALCULATED VALUES:', {
        monthly80Put: calcs.monthly80Put,
        monthly90Put: calcs.monthly90Put,
        weekly80Put: calcs.weekly80Put,
        weekly90Put: calcs.weekly90Put
      });

      console.log('SETTING STATE WITH:', calcs);
      
      // Clear old state first to ensure fresh update
      setProbabilities({});
      
      // Use setTimeout to ensure state is cleared before setting new values
      setTimeout(() => {
        setProbabilities(calcs);
        console.log('State updated with new calculations');
      }, 10);
      
      // Force re-render check
      setTimeout(() => {
        console.log('STATE AFTER UPDATE:', probabilities);
      }, 100);
    } catch (error: any) {
      console.error('Error fetching market data:', error);
      setError(error.message || 'Failed to fetch market data');
      setCurrentPrice(null);
      setWeeklyIV(null);
      setMonthlyIV(null);
      setProbabilities({});
    }
    setLoading(false);
  };

  // Helper function to calculate IV from options chain using real bid/ask data
  const calculateIVFromOptionsChain = async (optionsResults: any[], price: number, timeToExpiry: number, label: string): Promise<number> => {
    console.log(`${label} - Total options found:`, optionsResults.length);
    console.log(`${label} - Current stock price:`, price);
    console.log(`${label} - Should look for strikes between:`, (price * 0.95).toFixed(2), 'and', (price * 1.05).toFixed(2));
    
    // Show ALL strikes being returned
    const allStrikes = optionsResults.map(opt => parseFloat(opt.strike_price)).sort((a, b) => a - b);
    console.log(`${label} - ALL strikes returned:`, allStrikes.slice(0, 20)); // Show first 20
    
    // Get ATM options for IV calculation - KEEP 5% FILTER, but find CLOSEST to current price
    const atmOptions = optionsResults.filter((opt: any) => {
      const strike = parseFloat(opt.strike_price);
      const percentDiff = Math.abs(strike - price) / price;
      const isInRange = percentDiff < 0.05;
      if (isInRange) {
        console.log(`MATCH - Strike: ${strike}, Diff: ${(percentDiff * 100).toFixed(2)}%`);
      }
      return isInRange;
    });

    console.log(`${label} - ATM options within 5%:`, atmOptions.length);
    
    if (atmOptions.length === 0) {
      console.log(`${label} - PROBLEM: No strikes found within 5% of $${price}`);
      console.log(`${label} - Expected range: $${(price * 0.95).toFixed(2)} - $${(price * 1.05).toFixed(2)}`);
      throw new Error(`No ATM options found for ${label} within 5% range. SPY at $${price}, but no strikes in $${(price * 0.95).toFixed(2)}-$${(price * 1.05).toFixed(2)} range`);
    }

    // Find the CLOSEST strike to current price (not just the first one)
    const closestOption = atmOptions.reduce((closest, current) => {
      const closestDiff = Math.abs(parseFloat(closest.strike_price) - price);
      const currentDiff = Math.abs(parseFloat(current.strike_price) - price);
      return currentDiff < closestDiff ? current : closest;
    });

    console.log(`${label} - Using CLOSEST strike: $${closestOption.strike_price} (closest to $${price})`);
    console.log(`${label} - Contract details:`, {
      ticker: closestOption.ticker,
      type: closestOption.contract_type,
      strike: closestOption.strike_price,
      expiry: closestOption.expiration_date
    });

    // Get real bid/ask quotes
    const contractTicker = closestOption.ticker;
    console.log(`${label} - Fetching quotes for:`, contractTicker);
    
    const quotesResponse = await fetch(
      `https://api.polygon.io/v3/quotes/${contractTicker}?limit=1&apikey=${POLYGON_API_KEY}`
    );

    console.log(`${label} - Quotes API status:`, quotesResponse.status);

    if (!quotesResponse.ok) {
      throw new Error(`Failed to fetch ${label} options quotes: ${quotesResponse.status}`);
    }

    const quotesData = await quotesResponse.json();
    console.log(`${label} - Quotes response:`, quotesData);
    
    if (!quotesData.results || quotesData.results.length === 0) {
      throw new Error(`No ${label} options quotes available for ${contractTicker}`);
    }

    const quote = quotesData.results[0];
    console.log(`${label} - Quote data:`, {
      bid: quote.bid_price,
      ask: quote.ask_price,
      timestamp: quote.sip_timestamp
    });
    
    if (!quote.bid_price || !quote.ask_price || quote.bid_price <= 0 || quote.ask_price <= 0) {
      throw new Error(`Invalid ${label} options quote data for ${contractTicker} - Bid: ${quote.bid_price}, Ask: ${quote.ask_price}`);
    }

    const midPrice = (quote.bid_price + quote.ask_price) / 2;
    console.log(`${label} - Mid price: $${midPrice.toFixed(2)}`);
    
    if (midPrice <= 0) {
      throw new Error(`Invalid ${label} mid price for ${contractTicker}`);
    }

    // Calculate IV from real market price using Newton-Raphson method
    console.log(`${label} - Calculating IV with: Strike=${closestOption.strike_price}, MidPrice=${midPrice}, TimeToExpiry=${timeToExpiry}`);
    const calculatedIV = estimateIVFromPrice(price, parseFloat(closestOption.strike_price), midPrice, riskFreeRate, timeToExpiry, closestOption.contract_type === 'call');
    
    if (!calculatedIV || calculatedIV <= 0) {
      throw new Error(`Failed to calculate valid IV from ${label} market data`);
    }

    console.log(`${label} - Calculated IV: ${(calculatedIV * 100).toFixed(2)}%`);
    return calculatedIV;
  };

  // Simple IV estimation function
  const estimateIVFromPrice = (S: number, K: number, optionPrice: number, r: number, T: number, isCall: boolean): number => {
    // Newton-Raphson method for IV calculation (simplified)
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

  // Black-Scholes price calculation
  const calculateBlackScholesPrice = (S: number, K: number, r: number, sigma: number, T: number, isCall: boolean): number => {
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    
    if (isCall) {
      return S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
    } else {
      return K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
    }
  };

  // Vega calculation for IV estimation
  const calculateVega = (S: number, K: number, r: number, sigma: number, T: number): number => {
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    return S * Math.sqrt(T) * (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * d1 * d1);
  };

  // Auto-refresh every 5 minutes during market hours
  useEffect(() => {
    if (symbol) {
      fetchMarketData();
    }
  }, [symbol]);

  // Format strike price to nearest valid option strike
  // Temporarily disable formatStrike to show exact calculated values
  const formatStrike = (price: number): number => {
    return price; // Return exact value without rounding
  };

  const handleSymbolSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (symbol.trim()) {
      fetchMarketData();
    }
  };

  return (
    <div className="p-6 bg-gray-900 text-white rounded-lg max-w-6xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-4 text-center" style={{ color: '#FF6600' }}>
          Options Probability Calculator
        </h2>
        
        <form onSubmit={handleSymbolSubmit} className="flex items-center justify-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Symbol:</label>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              className="w-20 px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm font-mono"
              placeholder="SPY"
              maxLength={10}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-sm font-medium"
          >
            {loading ? 'Loading...' : 'Calculate'}
          </button>
        </form>

        <div className="text-center mb-4">
          {currentPrice && (
            <div className="text-lg mb-2">
              <span className="font-semibold">{symbol} Current Price: </span>
              <span style={{ color: '#FF6600' }}>${currentPrice.toFixed(2)}</span>
            </div>
          )}
          {weeklyIV && monthlyIV && (
            <div className="text-sm text-gray-300 space-y-1">
              <div>
                <span>Weekly IV ({weeklyDTE}DTE): </span>
                <span style={{ color: '#00FF00' }}>{(weeklyIV * 100).toFixed(1)}%</span>
              </div>
              <div>
                <span>Monthly IV ({monthlyDTE}DTE): </span>
                <span style={{ color: '#00BFFF' }}>{(monthlyIV * 100).toFixed(1)}%</span>
              </div>
              <div className="text-xs text-gray-400">(Auto-calculated from real options market data)</div>
            </div>
          )}
        </div>

        {error && (
          <div className="text-center text-red-400 mb-4 p-3 bg-red-900/20 border border-red-500/30 rounded">
            {error}
          </div>
        )}
      </div>

      {Object.keys(probabilities).length > 0 && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Weekly Options */}
          <div className="bg-gray-800 p-4 rounded-lg border border-green-500/30">
            <h3 className="font-semibold mb-3 text-green-400 text-lg">Weekly ({weeklyDTE}DTE)</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-gray-700">
                <span className="text-sm">80% Call:</span>
                <span className="text-red-400 font-mono">${formatStrike(probabilities.weekly80Call).toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-700">
                <span className="text-sm">90% Call:</span>
                <span className="text-red-300 font-mono">${formatStrike(probabilities.weekly90Call).toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-700">
                <span className="text-sm">80% Put:</span>
                <span className="text-red-400 font-mono">${formatStrike(probabilities.weekly80Put).toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm">90% Put:</span>
                <span className="text-red-300 font-mono">${formatStrike(probabilities.weekly90Put).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Monthly Options */}
          <div className="bg-gray-800 p-4 rounded-lg border border-blue-500/30">
            <h3 className="font-semibold mb-3 text-blue-400 text-lg">Monthly ({monthlyDTE}DTE)</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-gray-700">
                <span className="text-sm">80% Call:</span>
                <span className="text-red-400 font-mono">${formatStrike(probabilities.monthly80Call).toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-700">
                <span className="text-sm">90% Call:</span>
                <span className="text-red-300 font-mono">${formatStrike(probabilities.monthly90Call).toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-700">
                <span className="text-sm">80% Put:</span>
                <span className="text-red-400 font-mono">${formatStrike(probabilities.monthly80Put).toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm">90% Put:</span>
                <span className="text-red-300 font-mono">${formatStrike(probabilities.monthly90Put).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chart Integration Labels */}
      {Object.keys(probabilities).length > 0 && !error && (
        <div className="mt-6 p-4 bg-gray-800 rounded-lg border border-gray-600">
          <h4 className="font-semibold mb-3 text-center">Chart Labels (Copy for TradingView):</h4>
          <div className="text-xs font-mono space-y-2 bg-gray-900 p-3 rounded">
            <div>Weekly 80%: Calls @ {formatStrike(probabilities.weekly80Call).toFixed(2)} | Puts @ {formatStrike(probabilities.weekly80Put).toFixed(2)}</div>
            <div>Weekly 90%: Calls @ {formatStrike(probabilities.weekly90Call).toFixed(2)} | Puts @ {formatStrike(probabilities.weekly90Put).toFixed(2)}</div>
            <div>Monthly 80%: Calls @ {formatStrike(probabilities.monthly80Call).toFixed(2)} | Puts @ {formatStrike(probabilities.monthly80Put).toFixed(2)}</div>
            <div>Monthly 90%: Calls @ {formatStrike(probabilities.monthly90Call).toFixed(2)} | Puts @ {formatStrike(probabilities.monthly90Put).toFixed(2)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AISuite() {
  return (
    <>
      <div className="terminal-container">
        <div className="terminal-header">
          <div className="terminal-title">AI Suite - Options Probability Calculator</div>
          <div className="terminal-controls">
            <span className="control-button minimize"></span>
            <span className="control-button maximize"></span>
            <span className="control-button close"></span>
          </div>
        </div>
        <div className="terminal-content">
          <div style={{ 
            padding: '20px',
            color: '#FFFFFF',
            fontFamily: 'Inter, system-ui, sans-serif'
          }}>
            <OptionsProbabilityCalculator />
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}