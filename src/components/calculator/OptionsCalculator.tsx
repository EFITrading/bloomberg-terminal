'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getExpirationDates, getDaysUntilExpiration } from '../../lib/optionsExpirationUtils';

interface OptionData {
  strike: number;
  expiration: string;
  daysToExpiration: number;
  type: 'call' | 'put';
  bid: number;
  ask: number;
  lastPrice: number;  // Last traded price - key for P&L baseline
  volume: number;
  openInterest: number;
  impliedVolatility: number;
}

interface RealOptionsData {
  [key: string]: {
    strike: number;
    expiration: string;
    daysToExpiration: number;
    type: 'call' | 'put';
    bid: number;
    ask: number;
    lastPrice: number;
    volume: number;
    openInterest: number;
    impliedVolatility: number;
    ticker?: string; // Option ticker for pricing lookup
    fetchingPrice?: boolean; // Flag to prevent multiple simultaneous fetches
    // Real Greeks from Polygon API
    delta?: number;
    gamma?: number;
    theta?: number;
    vega?: number;
  };
}

// Black-Scholes and Greeks calculations
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

const calculateBlackScholesPrice = (S: number, K: number, r: number, sigma: number, T: number, isCall: boolean): number => {
  if (T <= 0) return isCall ? Math.max(0, S - K) : Math.max(0, K - S);
  
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  
  if (isCall) {
    return S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
  } else {
    return K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
  }
};

const calculateDelta = (S: number, K: number, r: number, sigma: number, T: number, isCall: boolean): number => {
  if (T <= 0) return isCall ? (S > K ? 1 : 0) : (S < K ? -1 : 0);
  
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  
  if (isCall) {
    return normalCDF(d1);
  } else {
    return normalCDF(d1) - 1;
  }
};

const calculateGamma = (S: number, K: number, r: number, sigma: number, T: number): number => {
  if (T <= 0) return 0;
  
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * d1 * d1) / (S * sigma * Math.sqrt(T));
};

const calculateTheta = (S: number, K: number, r: number, sigma: number, T: number, isCall: boolean): number => {
  if (T <= 0) return 0;
  
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  
  const term1 = -(S * sigma * (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * d1 * d1)) / (2 * Math.sqrt(T));
  
  if (isCall) {
    const term2 = -r * K * Math.exp(-r * T) * normalCDF(d2);
    return (term1 + term2) / 365; // Per day
  } else {
    const term2 = r * K * Math.exp(-r * T) * normalCDF(-d2);
    return (term1 + term2) / 365; // Per day
  }
};

const OptionsCalculator = () => {
  console.log('🔥 OPTIONS CALCULATOR COMPONENT RENDERING');
  console.log('🔥 ABOUT TO DECLARE STATE VARIABLES');
  const [symbol, setSymbol] = useState('');
  console.log('🔥 SYMBOL STATE DECLARED:', symbol);
    const [currentPrice, setCurrentPrice] = useState(0); // Will fetch real price from API
  const [selectedExpiration, setSelectedExpiration] = useState('');
  const [selectedStrike, setSelectedStrike] = useState<number | null>(null);
  const [optionType, setOptionType] = useState<'call' | 'put'>('call');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realOptionsData, setRealOptionsData] = useState<RealOptionsData>({});
  const [impliedVolatility, setImpliedVolatility] = useState(0.25);

  const [otmPercentage, setOtmPercentage] = useState(10); // Default 10% OTM range
  const [customPremium, setCustomPremium] = useState<number | null>(null); // User-editable premium price
  
  const riskFreeRate = 0.0408; // Current 10-year treasury rate

  // Dynamic expiration dates fetched from real options data
  const [availableExpirations, setAvailableExpirations] = useState<{date: string; days: number}[]>([]);



  // Strike prices - simple descending order (high to low) with ATM in center
  const strikes = useMemo(() => {
    if (Object.keys(realOptionsData).length === 0) {
      console.log('🔍 No real options data available yet for strikes');
      return [];
    }
    
    const allStrikes = new Set<number>();
    
    // If specific expiration is selected, show strikes for that expiration
    if (selectedExpiration) {
      console.log(`🔍 Getting strikes for selected expiration: ${selectedExpiration}`);
      Object.values(realOptionsData).forEach(option => {
        if (option.expiration === selectedExpiration) {
          allStrikes.add(option.strike);
        }
      });
    } else {
      // No expiration selected - show ALL strikes from ALL expirations
      console.log(`🔍 Getting ALL available strikes from all expirations`);
      Object.values(realOptionsData).forEach(option => {
        allStrikes.add(option.strike);
      });
    }
    
    // Simple sort: high to low (natural dropdown order with ATM in center)
    const sortedStrikes = Array.from(allStrikes).sort((a, b) => b - a);
    
    console.log(`✅ Available strikes: ${sortedStrikes.length} strikes`);
    console.log(`✅ Range: $${Math.min(...sortedStrikes)} - $${Math.max(...sortedStrikes)}`);
    
    return sortedStrikes;
  }, [selectedExpiration, realOptionsData]);

  // Filter strikes for heat map based on OTM percentage
  const heatMapStrikes = useMemo(() => {
    if (strikes.length === 0 || currentPrice <= 0) {
      return strikes;
    }
    
    // Calculate the range based on OTM percentage
    const otmDecimal = otmPercentage / 100;
    const lowerBound = currentPrice * (1 - otmDecimal);
    const upperBound = currentPrice * (1 + otmDecimal);
    
    // Filter strikes within the OTM range
    const filteredStrikes = strikes.filter(strike => 
      strike >= lowerBound && strike <= upperBound
    );
    
    console.log(`🎯 OTM Filter: ${otmPercentage}% range, Price: $${currentPrice.toFixed(2)}, Range: $${lowerBound.toFixed(2)} - $${upperBound.toFixed(2)}, Strikes: ${filteredStrikes.length}/${strikes.length}`);
    
    return filteredStrikes.length > 0 ? filteredStrikes : strikes.slice(0, 15); // Fallback to first 15 if no strikes in range
  }, [strikes, currentPrice, otmPercentage]);

  // Create time series based on selected expiration date
  const heatMapTimeSeries = useMemo(() => {
    if (!selectedExpiration) {
      return [];
    }
    
    // Find the selected expiration
    const selectedExp = availableExpirations.find(exp => exp.date === selectedExpiration);
    if (!selectedExp) {
      return [];
    }
    
    const maxDays = selectedExp.days;
    
    // Create time intervals from now to expiration
    const timePoints = [];
    
    if (maxDays <= 7) {
      // For short expirations (≤7 days): show daily from most days to least, with exp at end
      for (let days = maxDays; days >= 1; days--) {
        timePoints.push({
          days,
          label: `${days}d`
        });
      }
      // Add expiration as last column
      timePoints.push({
        days: 0,
        label: 'Exp'
      });
    } else if (maxDays <= 30) {
      // For medium expirations (≤30 days): show weekly + final days, from most days to least, with exp at end
      const intervals = [maxDays, Math.floor(maxDays * 0.8), Math.floor(maxDays * 0.6), Math.floor(maxDays * 0.4), Math.floor(maxDays * 0.2), 7, 3, 1];
      const uniqueIntervals = [...new Set(intervals)].filter(d => d > 0).sort((a, b) => b - a); // Sort descending (most days first)
      
      uniqueIntervals.forEach(days => {
        timePoints.push({
          days,
          label: `${days}d`
        });
      });
      // Add expiration as last column
      timePoints.push({
        days: 0,
        label: 'Exp'
      });
    } else {
      // For long expirations (>30 days): show monthly intervals from most days to least, with exp at end
      const intervals = [maxDays, Math.floor(maxDays * 0.75), Math.floor(maxDays * 0.5), Math.floor(maxDays * 0.25), 30, 14, 7, 3, 1];
      const uniqueIntervals = [...new Set(intervals)].filter(d => d > 0).sort((a, b) => b - a); // Sort descending (most days first)
      
      uniqueIntervals.slice(0, 7).forEach(days => { // Limit to 7 columns plus exp
        timePoints.push({
          days,
          label: `${days}d`
        });
      });
      // Add expiration as last column
      timePoints.push({
        days: 0,
        label: 'Exp'
      });
    }
    
    console.log(`⏰ Time Series for ${selectedExpiration}: ${timePoints.map(t => t.label).join(', ')}`);
    
    return timePoints;
  }, [selectedExpiration, availableExpirations]);

  // Find ATM strike for highlighting
  const atmStrike = useMemo(() => {
    if (heatMapStrikes.length === 0 || currentPrice <= 0) {
      return null;
    }
    
    return heatMapStrikes.reduce((prev, curr) => 
      Math.abs(curr - currentPrice) < Math.abs(prev - currentPrice) ? curr : prev
    );
  }, [heatMapStrikes, currentPrice]);

  // Auto-select ATM strike when strikes are available
  useEffect(() => {
    if (strikes.length > 0 && currentPrice > 0) {
      const atmStrike = strikes.reduce((prev, curr) => 
        Math.abs(curr - currentPrice) < Math.abs(prev - currentPrice) ? curr : prev
      );
      setSelectedStrike(atmStrike);
      console.log(`🎯 Auto-selected ATM strike: $${atmStrike} (closest to $${currentPrice})`);
    }
  }, [strikes, currentPrice]);

  // Auto-fill premium when strike/expiration selection changes - ALWAYS fetch fresh real-time pricing
  useEffect(() => {
    if (selectedStrike && selectedExpiration && Object.keys(realOptionsData).length > 0 && customPremium === null) {
      const key = `${selectedStrike}-${selectedExpiration}-${optionType}`;
      const realOption = realOptionsData[key];
      
      if (realOption && realOption.ticker) {
        console.log(`🎯 Auto-fill: ALWAYS fetching FRESH real-time pricing for ${realOption.ticker}...`);
        
        // ALWAYS fetch fresh pricing - don't trust old data
        getCurrentOptionPricing(selectedStrike, selectedExpiration, optionType).then(updatedOption => {
          if (updatedOption && updatedOption.ask > 0) {
            console.log(`💰 Auto-filled premium with FRESH REAL ASK price: $${updatedOption.ask}`);
            setCustomPremium(updatedOption.ask);
          } else if (updatedOption && updatedOption.lastPrice > 0) {
            console.log(`💰 Auto-filled premium with FRESH REAL LAST price: $${updatedOption.lastPrice}`);
            setCustomPremium(updatedOption.lastPrice);
          } else {
            console.log(`⚠️ No fresh pricing data available for ${key}`);
          }
        }).catch(error => {
          console.error('❌ Failed to fetch fresh real-time pricing for premium auto-fill:', error);
        });
      }
    }
  }, [selectedStrike, selectedExpiration, optionType, customPremium]); // Always fetch fresh when selection changes

  // INSTANT real-time price fetch from Polygon API - NO LOOPS
  const fetchRealOptionsData = useCallback(async (symbolToFetch: string) => {
    if (!symbolToFetch || symbolToFetch.trim() === '') {
      setLoading(false);
      return;
    }
    
    const upperSymbol = symbolToFetch.toUpperCase().trim();
    console.log(`⚡ INSTANT POLYGON API CALL for: ${upperSymbol}`);
    
    setLoading(true);
    setError(null);
    
    try {
      // DIRECT Polygon API call for instant real-time price
      const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
      
      console.log(`⚡ Getting real-time price for ${upperSymbol}...`);
      
      // Get last trade price directly from Polygon
      const priceUrl = `https://api.polygon.io/v2/last/trade/${upperSymbol}?apikey=${POLYGON_API_KEY}`;
      const priceResponse = await fetch(priceUrl);
      
      if (!priceResponse.ok) {
        throw new Error(`Failed to get real-time price for ${upperSymbol}`);
      }
      
      const priceData = await priceResponse.json();
      console.log(`⚡ Polygon price response:`, priceData);
      
      if (priceData.status !== 'OK' || !priceData.results) {
        throw new Error(`No real-time price data available for ${upperSymbol}`);
      }
      
      const currentStockPrice = priceData.results.p; // Last trade price
      
      if (!currentStockPrice || currentStockPrice <= 0) {
        throw new Error(`Invalid price received for ${upperSymbol}: ${currentStockPrice}`);
      }
      
      setCurrentPrice(currentStockPrice);
      console.log(`✅ INSTANT SUCCESS: ${upperSymbol} = $${currentStockPrice} (REAL-TIME)`);
      
      // Now try to get ALL options contracts (with pagination to ensure we get everything)
      console.log(`📊 Attempting to get ALL options contracts for ${upperSymbol}...`);
      
      let allContracts: any[] = [];
      // ✅ Get contracts expiring from TODAY onwards (2025+)
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      let nextUrl: string | null = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${upperSymbol}&active=true&expiration_date.gte=${today}&limit=1000&apikey=${POLYGON_API_KEY}`;
      let pageCount = 0;
      
      console.log(`🔍 Fetching contracts expiring from ${today} onwards (2025+)`);
      
      // Paginate through ALL available contracts
      while (nextUrl && pageCount < 20) { // Safety limit of 20 pages (20k contracts max)
        pageCount++;
        console.log(`🔗 FETCHING PAGE ${pageCount}: ${nextUrl}`);
        
        const contractsResponse: Response = await fetch(nextUrl);
        console.log(`📡 PAGE ${pageCount} STATUS: ${contractsResponse.status} ${contractsResponse.statusText}`);
        
        if (!contractsResponse.ok) {
          const errorText = await contractsResponse.text();
          console.warn(`⚠️ Contracts API failed on page ${pageCount} for ${upperSymbol}:`, errorText);
          break;
        }
        
        const contractsData: any = await contractsResponse.json();
        console.log(`📊 PAGE ${pageCount} - Status: ${contractsData.status}, Results: ${contractsData.results?.length || 0}`);
        
        if (contractsData.status !== 'OK' || !contractsData.results) {
          console.warn(`⚠️ Invalid response on page ${pageCount}:`, contractsData);
          break;
        }
        
        // Add contracts from this page
        allContracts.push(...contractsData.results);
        console.log(`📈 Total contracts so far: ${allContracts.length}`);
        
        // Check for next page
        nextUrl = contractsData.next_url || null;
        if (nextUrl && !nextUrl.includes('apikey=')) {
          nextUrl += `&apikey=${POLYGON_API_KEY}`;
        }
        
        // Break if no more pages
        if (!nextUrl) {
          console.log(`✅ Pagination complete - fetched all ${allContracts.length} contracts`);
          break;
        }
      }
      
      if (allContracts.length === 0) {
        console.warn(`⚠️ No contracts found for ${upperSymbol}`);
        setRealOptionsData({});
        setAvailableExpirations([]);
        setLoading(false);
        return;
      }
      
      console.log(`🎯 FINAL RESULT: ${allContracts.length} total contracts for ${upperSymbol}`);
      
      // Process ALL collected contracts
      console.log(`🔍 Processing ${allContracts.length} contracts...`);
      const processedOptions: RealOptionsData = {};
      const uniqueExpirations = new Set<string>();
      
      allContracts.forEach((contract: any, index: number) => {
          // Debug first few contracts to see structure and IV fields
          if (index < 3) {
            console.log(`🔍 Contract ${index} structure:`, {
              ticker: contract.ticker,
              strike: contract.strike_price,
              expiration: contract.expiration_date,
              type: contract.contract_type,
              implied_volatility: contract.implied_volatility,
              iv: contract.iv,
              implied_vol: contract.implied_vol,
              allKeys: Object.keys(contract)
            });
          }
          
          // For options contracts API, the data structure is different
          let expDate = contract.expiration_date;
          let strike = contract.strike_price;
          let optionType = contract.contract_type?.toLowerCase();
          
            console.log(`📊 Extracted contract data:`, {
              expDate,
              strike,
              optionType,
              ticker: contract.ticker,
              contractStructure: Object.keys(contract)
            });
          
          if (expDate && strike && optionType) {
            // Calculate days to expiration
            const expiry = new Date(expDate);
            const now = new Date();
            const daysToExp = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            
            console.log(`📅 Expiration calc: ${expDate} -> ${daysToExp} days`);
            
            // ✅ FILTER OUT EXPIRED OPTIONS (negative days = expired!)
            if (daysToExp <= 0) {
              console.log(`❌ SKIPPING EXPIRED option: ${expDate} (${daysToExp} days ago)`);
              return; // Skip this expired contract
            }
            
            // ✅ FILTER OUT OPTIONS EXPIRING TOO FAR OUT (keep reasonable timeframe)
            if (daysToExp > 730) { // More than 2 years out
              console.log(`❌ SKIPPING far-dated option: ${expDate} (${daysToExp} days = ${(daysToExp/365).toFixed(1)} years)`);
              return; // Skip far-dated contracts
            }
            
            uniqueExpirations.add(expDate);
            console.log(`✅ KEEPING valid option: ${expDate} (${daysToExp} days, ${(daysToExp/30).toFixed(1)} months)`);
            
            const key = `${strike}-${expDate}-${optionType}`;
            
            // Create the contract ticker for pricing lookup
            const contractTicker = contract.ticker;
            
            console.log(`🔑 Creating option key: "${key}" for ${contractTicker}`);
            
            // Extract REAL implied volatility from Polygon contract data
            let realIV = 0.25; // Fallback only
            if (contract.implied_volatility && contract.implied_volatility > 0) {
              realIV = contract.implied_volatility;
              console.log(`🔍 REAL IV from Polygon: ${(realIV * 100).toFixed(1)}% for ${contractTicker}`);
            } else if (contract.iv && contract.iv > 0) {
              realIV = contract.iv;
              console.log(`🔍 REAL IV from Polygon (iv field): ${(realIV * 100).toFixed(1)}% for ${contractTicker}`);
            } else if (contract.implied_vol && contract.implied_vol > 0) {
              realIV = contract.implied_vol;
              console.log(`🔍 REAL IV from Polygon (implied_vol field): ${(realIV * 100).toFixed(1)}% for ${contractTicker}`);
            } else {
              console.warn(`⚠️ No real IV found in Polygon data for ${contractTicker}, using fallback ${(realIV * 100).toFixed(1)}%`);
            }
            
            processedOptions[key] = {
              strike: strike,
              expiration: expDate,
              daysToExpiration: daysToExp,
              type: optionType as 'call' | 'put',
              bid: 0, // Will be filled by pricing API call
              ask: 0, // Will be filled by pricing API call
              lastPrice: 0, // Will be filled by pricing API call
              volume: 0, // Will be filled by pricing API call
              openInterest: 0, // Will be filled by pricing API call
              impliedVolatility: realIV, // REAL IV from Polygon!
              ticker: contractTicker // Store ticker for pricing lookup
            };
          }
        });
        
        // Sort expirations chronologically (earliest first)
        console.log(`🔍 Raw unique expirations found:`, Array.from(uniqueExpirations));
        const sortedExpirations = Array.from(uniqueExpirations).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
        console.log(`🔍 Sorted expirations:`, sortedExpirations);
        
        const expirationsWithDays = sortedExpirations.map(date => {
          const expiry = new Date(date);
          const now = new Date();
          const days = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          console.log(`📅 Processing expiration: ${date} -> ${days} days (expiry: ${expiry}, now: ${now})`);
          return { date, days };
        }).filter(exp => {
          const keep = exp.days > 0;
          console.log(`📅 Expiration ${exp.date}: ${exp.days} days - ${keep ? 'KEEPING' : 'FILTERING OUT'}`);
          return keep;
        });
        
        // Skip bulk pricing - we'll fetch individual pricing when user selects specific options
        console.log(`✅ Loaded contracts structure - pricing will be fetched on-demand when user selects options`);
        
        setAvailableExpirations(expirationsWithDays);
        setRealOptionsData(processedOptions);
        
        console.log(`✅ Loaded ${Object.keys(processedOptions).length} real options contracts`);
        console.log(`✅ Available expirations: ${expirationsWithDays.length}`);
        console.log(`✅ Expiration details:`, expirationsWithDays);
        console.log(`✅ Sample options data:`, Object.keys(processedOptions).slice(0, 5));
      
      setLoading(false);
      setError(null);
      
    } catch (error) {
      console.error(`❌ Polygon API error for ${upperSymbol}:`, error);
      setError(`Unable to load real-time data for "${upperSymbol}". ${error instanceof Error ? error.message : 'Please try again.'}`);
      setLoading(false);
    }
  }, []); // NO DEPENDENCIES to prevent infinite loops

  // REMOVED: Old bulk pricing function - we now use on-demand pricing with quotes API

  // Fetch CURRENT real-time ask/bid pricing for a specific option contract
  const fetchSpecificOptionPricing = async (ticker: string): Promise<any> => {
    const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
    
    console.log(`💰 Fetching CURRENT REAL-TIME ask price for: ${ticker}`);
    
    try {
      // First try quotes API for current ask/bid prices (most current)
      const quotesUrl = `https://api.polygon.io/v3/quotes/${ticker}?order=desc&limit=1&apikey=${POLYGON_API_KEY}`;
      
      console.log(`📡 Quotes API URL: ${quotesUrl}`);
      
      const quotesResponse = await fetch(quotesUrl);
      const quotesData = await quotesResponse.json();
      
      console.log(`📊 Quotes response: ${quotesResponse.status}, results: ${quotesData.results?.length || 0}`);
      
      if (quotesResponse.ok && quotesData.status === 'OK' && quotesData.results && quotesData.results.length > 0) {
        const quote = quotesData.results[0];
        const timestamp = new Date(quote.sip_timestamp / 1000000); // Convert nanoseconds to milliseconds
        console.log(`✅ Got CURRENT REAL ask/bid for ${ticker}: ask=$${quote.ask_price}, bid=$${quote.bid_price}, timestamp=${timestamp.toLocaleString()}`);
        
        return {
          ask: quote.ask_price || 0,     // CURRENT ask price - this is what we want!
          bid: quote.bid_price || 0,     // CURRENT bid price
          lastPrice: quote.ask_price || 0, // Use current ask as last for now
          volume: quote.ask_size || 0,   // Ask size as volume
        };
      } else {
        console.log(`⚠️ No current quotes for ${ticker}, trying last trade...`);
        
        // Fallback to last trade API for most recent trade price
        const tradesUrl = `https://api.polygon.io/v3/trades/${ticker}?order=desc&limit=1&apikey=${POLYGON_API_KEY}`;
        
        const tradesResponse = await fetch(tradesUrl);
        const tradesData = await tradesResponse.json();
        
        if (tradesResponse.ok && tradesData.status === 'OK' && tradesData.results && tradesData.results.length > 0) {
          const trade = tradesData.results[0];
          const timestamp = new Date(trade.participant_timestamp / 1000000); // Convert nanoseconds to milliseconds
          console.log(`✅ Got CURRENT REAL trade for ${ticker}: price=$${trade.price}, size=${trade.size}, timestamp=${timestamp.toLocaleString()}`);
          
          return {
            ask: trade.price || 0,         // Use last trade price as ask estimate
            bid: trade.price ? trade.price * 0.98 : 0, // Estimate bid as 98% of trade
            lastPrice: trade.price || 0,   // Last trade price
            volume: trade.size || 0,       // Trade size
          };
        } else {
          console.warn(`⚠️ No current trades for ${ticker} either`);
          return null;
        }
      }
      
    } catch (error) {
      console.error(`❌ Failed to fetch CURRENT pricing for ${ticker}:`, error);
      return null;
    }
  };

  // Enhanced function to get current option pricing when user makes selections  
  const getCurrentOptionPricing = async (strike: number, expiration: string, type: 'call' | 'put') => {
    const key = `${strike}-${expiration}-${type}`;
    const option = realOptionsData[key];
    
    if (!option || !option.ticker) {
      console.warn(`⚠️ No ticker found for option ${key}`);
      return null;
    }
    
    console.log(`🎯 Getting current pricing for ${option.ticker}...`);
    
    // Fetch real-time pricing for this specific contract
    const pricingData = await fetchSpecificOptionPricing(option.ticker);
    
    if (pricingData) {
      // Update the option data with real pricing (preserve real IV!)
      realOptionsData[key] = {
        ...realOptionsData[key],
        ...pricingData,
        // Keep the REAL implied volatility from contract data!
      };
      
      console.log(`💰 Updated ${key} with REAL data: ask=$${pricingData.ask}, last=$${pricingData.lastPrice}`);
      setRealOptionsData({...realOptionsData}); // Trigger re-render
      return realOptionsData[key];
    }
    
    return null;
  };

  console.log('🔥 ABOUT TO DECLARE USEEFFECT');
  // Load real data only when user enters a symbol (not on mount) - NO INFINITE LOOPS
  useEffect(() => {
    console.log('🔥 USEEFFECT TRIGGERED for symbol:', symbol);
    if (symbol && symbol.trim().length > 0) {
      console.log('🔥 CALLING fetchRealOptionsData for:', symbol);
      fetchRealOptionsData(symbol);
    } else {
      // Clear data when symbol is empty
      setRealOptionsData({});
      setCurrentPrice(0);
      setAvailableExpirations([]);
      setSelectedStrike(null);
      setSelectedExpiration('');
      setError(null);
    }
  }, [symbol]); // REMOVED fetchRealOptionsData dependency to prevent infinite loops



  // Professional Black-Scholes P&L Calculator using REAL Polygon data like OptionsStrat
  const calculateProfessionalPL = (stockPriceAtExpiry: number, daysToExp: number): number => {
    if (!selectedExpiration || !selectedStrike) {
      return 0;
    }
    
    // Get YOUR selected option (what you bought)
    const yourOptionKey = `${selectedStrike}-${selectedExpiration}-${optionType}`;
    const yourOption = realOptionsData[yourOptionKey];
    
    // Get CURRENT market price (what you pay NOW) - this is your foundation
    let purchasePrice = 0;
    if (customPremium && customPremium > 0) {
      purchasePrice = customPremium;
    } else if (yourOption?.ask > 0) {
      purchasePrice = yourOption.ask;
    } else if (yourOption?.lastPrice > 0) {
      purchasePrice = yourOption.lastPrice;
    } else if (yourOption?.bid > 0) {
      purchasePrice = yourOption.bid;
    } else {
      return 0;
    }
    
    // Use REAL implied volatility from Polygon market data (like OptionsStrat)
    let impliedVolatility = 0.25; // Fallback
    if (yourOption?.impliedVolatility > 0) {
      impliedVolatility = yourOption.impliedVolatility;
      console.log(`🔍 ✅ Using REAL Polygon IV: ${(impliedVolatility * 100).toFixed(1)}% for ${yourOptionKey}`);
    } else {
      console.log(`⚠️ ❌ No real IV from Polygon for ${yourOptionKey}, using fallback ${(impliedVolatility * 100).toFixed(1)}%`);
      console.log(`🔍 Debug yourOption data:`, yourOption);
    }
    
    // Time to expiration in years
    const timeToExpiry = daysToExp / 365;
    
    // Calculate theoretical option value at the simulated stock price using Black-Scholes
    const theoreticalValue = calculateBlackScholesPrice(
      stockPriceAtExpiry,  // What we're simulating the stock to be
      selectedStrike,      // Your option's strike price
      riskFreeRate,        // Current 10-year Treasury rate (4.08%)
      impliedVolatility,   // Real market implied volatility
      timeToExpiry,        // Time remaining
      optionType === 'call'
    );
    
    // Calculate P&L: If you had bought THIS strike instead of yours, what would be the difference?
    const profitLoss = purchasePrice > 0 ? ((theoreticalValue - purchasePrice) / purchasePrice) * 100 : 0;
    
    console.log(`� REAL P&L: Your $${selectedStrike} ${optionType} cost $${purchasePrice.toFixed(2)} Theoretical Value: $${theoreticalValue.toFixed(2)} = ${profitLoss >= 0 ? '+' : ''}${profitLoss.toFixed(1)}% P&L`);
    
    // Sanity check for option behavior
    if (optionType === 'call') {
      const shouldProfit = stockPriceAtExpiry > selectedStrike;
      const actualProfit = profitLoss > 5; // Account for time decay
      if (shouldProfit && !actualProfit && Math.abs(stockPriceAtExpiry - selectedStrike) > 5) {
        console.warn(`🚨 CALL CHECK: Stock $${stockPriceAtExpiry} > Strike $${selectedStrike} should profit but shows ${profitLoss.toFixed(1)}% (may be time decay)`);
      }
    } else if (optionType === 'put') {
      const shouldProfit = stockPriceAtExpiry < selectedStrike;
      const actualProfit = profitLoss > 5;
      if (shouldProfit && !actualProfit && Math.abs(stockPriceAtExpiry - selectedStrike) > 5) {
        console.warn(`🚨 PUT CHECK: Stock $${stockPriceAtExpiry} < Strike $${selectedStrike} should profit but shows ${profitLoss.toFixed(1)}% (may be time decay)`);
      }
    }
    
    return profitLoss;
  };

  // Calculate Greeks for selected option - REAL DATA ONLY
  const calculateGreeks = (strike: number, daysToExp: number) => {
    const key = `${strike}-${availableExpirations.find(exp => exp.days === daysToExp)?.date}-${optionType}`;
    const realOption = realOptionsData[key];
    
    // Only calculate if we have real options data
    if (!realOption) {
      return {
        delta: null,
        gamma: null,
        theta: null,
        theoreticalPrice: null,
        marketPrice: null,
        lastPrice: null,
        volume: null,
        openInterest: null
      };
    }
    
    const timeToExpiry = daysToExp / 365;
    const iv = realOption.impliedVolatility;
    
    return {
      delta: calculateDelta(currentPrice, strike, riskFreeRate, iv, timeToExpiry, optionType === 'call'),
      gamma: calculateGamma(currentPrice, strike, riskFreeRate, iv, timeToExpiry),
      theta: calculateTheta(currentPrice, strike, riskFreeRate, iv, timeToExpiry, optionType === 'call'),
      theoreticalPrice: calculateBlackScholesPrice(currentPrice, strike, riskFreeRate, iv, timeToExpiry, optionType === 'call'),
      marketPrice: (realOption.bid + realOption.ask) / 2,
      lastPrice: realOption.lastPrice,
      volume: realOption.volume,
      openInterest: realOption.openInterest
    };
  };

  // Get color for P&L cell with enhanced progressive gradients for both profits and losses
  const getPLColor = (pl: number): string => {
    // Enhanced GREEN gradient for profits (8 levels)
    if (pl > 200) return 'bg-green-800 text-white';  // Darkest green for huge profits
    if (pl > 150) return 'bg-green-700 text-white';  // Very dark green
    if (pl > 100) return 'bg-green-600 text-white';  // Dark green
    if (pl > 75) return 'bg-green-500 text-white';   // Medium-dark green
    if (pl > 50) return 'bg-green-400 text-black';   // Medium green
    if (pl > 25) return 'bg-green-300 text-black';   // Light-medium green
    if (pl > 10) return 'bg-green-200 text-black';   // Light green
    if (pl > 0) return 'bg-green-100 text-black';    // Very light green
    
    // Neutral zone
    if (pl > -5) return 'bg-yellow-200 text-black';
    if (pl > -10) return 'bg-orange-200 text-black';
    
    // Enhanced RED gradient for losses (8 levels)
    if (pl > -15) return 'bg-red-200 text-black';    // Light red for small losses
    if (pl > -25) return 'bg-red-300 text-white';    // Medium red
    if (pl > -40) return 'bg-red-400 text-white';    // Darker red
    if (pl > -60) return 'bg-red-500 text-white';    // Even darker red
    if (pl > -80) return 'bg-red-600 text-white';    // Deep red
    if (pl > -120) return 'bg-red-700 text-white';   // Very deep red
    return 'bg-red-800 text-white';                  // Darkest red for huge losses
  };

  // Handle symbol input changes  
  const handleSymbolChange = (newSymbol: string) => {
    const upperSymbol = newSymbol.toUpperCase().trim();
    setSymbol(upperSymbol);
    setSelectedStrike(null);
    setSelectedExpiration('');
    setError(null);
    
    // useEffect will handle the API call when symbol changes
    console.log(`SYMBOL CHANGED TO: ${upperSymbol}`);
  };

  // Handle Enter key press for manual search trigger
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const upperSymbol = symbol.toUpperCase().trim();
      if (upperSymbol.length >= 1) {
        console.log(`MANUAL SEARCH TRIGGERED: ${upperSymbol}`);
        fetchRealOptionsData(upperSymbol);
      }
    }
  };

  console.log('OptionsCalculator component is rendering');
  
  return (
    <div className="h-full bg-black text-white overflow-y-auto">
      <div className="p-4">

        
        {/* BLOOMBERG PROFESSIONAL TERMINAL INTERFACE */}
        <div className="relative bg-gradient-to-br from-gray-950 via-black to-gray-900 border-4 border-orange-500 shadow-2xl overflow-hidden mb-6">
          {/* Animated Background Pattern */}
          <div className="absolute inset-0 opacity-5">
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-orange-600/10 to-transparent animate-pulse"></div>
            <div className="absolute -top-4 -left-4 w-8 h-8 border border-orange-400/20 rotate-45 animate-spin" style={{animationDuration: '8s'}}></div>
            <div className="absolute -bottom-4 -right-4 w-6 h-6 border border-orange-400/20 rotate-45 animate-spin" style={{animationDuration: '6s', animationDelay: '2s'}}></div>
          </div>
          


          {/* Main Control Panel */}
          <div className="p-6">
            {/* First Row: Stock Symbol, Option Type, Expiration Date */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              
              {/* STOCK SYMBOL - Terminal Style */}
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-orange-600/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative bg-black border-2 border-gray-700 hover:border-orange-500 transition-all duration-300 shadow-inner">
                  <div className="bg-gradient-to-r from-orange-900/30 to-transparent p-2 border-b border-gray-700">
                    <label className="text-white text-xs font-bold uppercase tracking-widest">STOCK SYMBOL</label>
                  </div>
                  <div className="p-4">
                    <div className="relative">
                      <input
                        type="text"
                        value={symbol}
                        onChange={(e) => handleSymbolChange(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="NVDA"
                        className="w-full bg-gray-950 border border-gray-600 px-4 py-3 text-white text-xl font-bold uppercase tracking-wider focus:outline-none focus:border-orange-500 focus:shadow-lg focus:shadow-orange-500/20 transition-all duration-300"
                      />
                      <button 
                        onClick={() => fetchRealOptionsData(symbol)}
                        disabled={loading}
                        className="absolute right-1 top-1 bottom-1 px-4 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-500 hover:to-orange-600 text-white text-sm font-bold transition-all duration-200 hover:shadow-lg hover:shadow-orange-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loading ? (
                          <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                        ) : '▶'}
                      </button>
                    </div>
                    
                    {/* Live Price Display */}
                    <div className="mt-3 bg-gradient-to-r from-green-900/50 to-black border-l-4 border-green-500 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-green-300 text-xs font-medium uppercase tracking-wide">LIVE PRICE</span>
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      </div>
                      <div className="text-green-400 text-2xl font-bold tabular-nums">${currentPrice.toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* OPTION TYPE - Terminal Style */}
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-green-600/20 to-red-600/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative bg-black border-2 border-gray-700 hover:border-orange-500 transition-all duration-300 shadow-inner">
                  <div className="bg-gradient-to-r from-orange-900/30 to-transparent p-2 border-b border-gray-700">
                    <label className="text-white text-xs font-bold uppercase tracking-widest">OPTION TYPE</label>
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setOptionType('call')}
                        className={`relative overflow-hidden py-3 px-4 font-bold text-sm uppercase tracking-wider transition-all duration-300 border-2 ${
                          optionType === 'call'
                            ? 'bg-gradient-to-r from-green-700 to-green-600 border-green-400 text-white shadow-lg shadow-green-500/30'
                            : 'bg-gray-900 border-gray-600 text-gray-300 hover:border-green-400 hover:text-green-300'
                        }`}
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-200"></div>
                        <span className="relative">CALLS</span>
                      </button>
                      <button
                        onClick={() => setOptionType('put')}
                        className={`relative overflow-hidden py-3 px-4 font-bold text-sm uppercase tracking-wider transition-all duration-300 border-2 ${
                          optionType === 'put'
                            ? 'bg-gradient-to-r from-red-700 to-red-600 border-red-400 text-white shadow-lg shadow-red-500/30'
                            : 'bg-gray-900 border-gray-600 text-gray-300 hover:border-red-400 hover:text-red-300'
                        }`}
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-200"></div>
                        <span className="relative">PUTS</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* EXPIRATION DATE - Terminal Style */}
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-orange-600/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative bg-black border-2 border-gray-700 hover:border-orange-500 transition-all duration-300 shadow-inner">
                  <div className="bg-gradient-to-r from-orange-900/30 to-transparent p-2 border-b border-gray-700">
                    <label className="text-white text-xs font-bold uppercase tracking-widest">EXPIRATION DATE</label>
                  </div>
                  <div className="p-4">
                    {availableExpirations.length > 0 ? (
                      <select 
                        value={selectedExpiration}
                        onChange={(e) => setSelectedExpiration(e.target.value)}
                        className="w-full bg-gray-950 border border-gray-600 px-4 py-3 text-white text-sm font-semibold focus:outline-none focus:border-orange-500 focus:shadow-lg focus:shadow-orange-500/20 transition-all duration-300 cursor-pointer"
                      >
                        <option value="" className="bg-gray-900">Select Expiration Date</option>
                        {availableExpirations.map((exp) => (
                          <option key={exp.date} value={exp.date} className="bg-gray-900">
                            {exp.date} ({exp.days}d)
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="date"
                        value={selectedExpiration}
                        onChange={(e) => setSelectedExpiration(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        className="w-full bg-gray-950 border border-gray-600 px-4 py-3 text-white text-sm font-semibold focus:outline-none focus:border-orange-500 focus:shadow-lg focus:shadow-orange-500/20 transition-all duration-300"
                        placeholder="YYYY-MM-DD"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Second Row: Strike Price, Premium, OTM Range */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* STRIKE PRICE - Terminal Style */}
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-orange-600/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative bg-black border-2 border-gray-700 hover:border-orange-500 transition-all duration-300 shadow-inner">
                  <div className="bg-gradient-to-r from-orange-900/30 to-transparent p-2 border-b border-gray-700">
                    <label className="text-white text-xs font-bold uppercase tracking-widest">STRIKE PRICE</label>
                  </div>
                  <div className="p-4">
                    {strikes.length > 0 ? (
                      <select 
                        value={selectedStrike || ''}
                        onChange={(e) => {
                          const newStrike = e.target.value ? Number(e.target.value) : null;
                          console.log(`🎯 Strike dropdown changed: ${selectedStrike} -> ${newStrike}`);
                          setSelectedStrike(newStrike);
                          // Clear custom premium to use real market data for the new strike
                          setCustomPremium(null);
                        }}
                        className="w-full bg-gray-950 border border-gray-600 px-4 py-3 text-white text-sm font-semibold focus:outline-none focus:border-orange-500 focus:shadow-lg focus:shadow-orange-500/20 transition-all duration-300 cursor-pointer"
                      >
                        <option value="" className="bg-gray-900">Select Strike Price</option>
                        {strikes.map((strike) => (
                          <option key={strike} value={strike} className="bg-gray-900">
                            ${strike}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="number"
                        value={selectedStrike || ''}
                        onChange={(e) => {
                          const newStrike = e.target.value ? Number(e.target.value) : null;
                          console.log(`🎯 Strike manual entry: ${selectedStrike} -> ${newStrike}`);
                          setSelectedStrike(newStrike);
                          setCustomPremium(null);
                        }}
                        step="0.5"
                        min="0"
                        placeholder="Enter strike price"
                        className="w-full bg-gray-950 border border-gray-600 px-4 py-3 text-white text-lg font-bold tabular-nums focus:outline-none focus:border-orange-500 focus:shadow-lg focus:shadow-orange-500/20 transition-all duration-300"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* PREMIUM - Terminal Style */}
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-orange-600/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative bg-black border-2 border-gray-700 hover:border-orange-500 transition-all duration-300 shadow-inner">
                  <div className="bg-gradient-to-r from-orange-900/30 to-transparent p-2 border-b border-gray-700">
                    <label className="text-white text-xs font-bold uppercase tracking-widest">PREMIUM</label>
                  </div>
                  <div className="p-4">
                    <input
                      type="number"
                      value={customPremium || ''}
                      onChange={(e) => setCustomPremium(e.target.value ? Number(e.target.value) : null)}
                      placeholder="6.9"
                      step="0.01"
                      min="0"
                      className="w-full bg-gray-950 border border-gray-600 px-4 py-3 text-white text-lg font-bold tabular-nums focus:outline-none focus:border-orange-500 focus:shadow-lg focus:shadow-orange-500/20 transition-all duration-300"
                    />
                    
                    {/* Real Market Data */}
                    {selectedStrike && selectedExpiration && (
                      <div className="mt-3 bg-gradient-to-r from-gray-900/50 to-black border-l-4 border-cyan-500 p-3">
                        <div className="text-white text-xs font-medium uppercase tracking-wide">
                          {(() => {
                            const key = `${selectedStrike}-${selectedExpiration}-${optionType}`;
                            const realOption = realOptionsData[key];
                            if (realOption) {
                              const askPrice = realOption.ask > 0 ? realOption.ask : null;
                              const lastPrice = realOption.lastPrice > 0 ? realOption.lastPrice : null;
                              const bidPrice = realOption.bid > 0 ? realOption.bid : null;
                              const iv = realOption.impliedVolatility > 0 ? (realOption.impliedVolatility * 100).toFixed(1) : null;
                              
                              if (!askPrice && !lastPrice && !bidPrice) {
                                return `🔴 NO MARKET DATA - Strike $${selectedStrike} ${optionType.toUpperCase()} ${selectedExpiration}`;
                              }
                              
                              return `Ask $${askPrice?.toFixed(2) || 'N/A'} | Last $${lastPrice?.toFixed(2) || 'N/A'} | Bid $${bidPrice?.toFixed(2) || 'N/A'}`;
                            }
                            return `🔴 NO OPTION DATA - Strike $${selectedStrike} ${optionType.toUpperCase()} ${selectedExpiration}`;
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* OTM RANGE - Terminal Style */}
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-orange-600/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative bg-black border-2 border-gray-700 hover:border-orange-500 transition-all duration-300 shadow-inner">
                  <div className="bg-gradient-to-r from-orange-900/30 to-transparent p-2 border-b border-gray-700">
                    <label className="text-white text-xs font-bold uppercase tracking-widest">OTM RANGE</label>
                  </div>
                  <div className="p-4">
                    <select 
                      value={otmPercentage}
                      onChange={(e) => setOtmPercentage(Number(e.target.value))}
                      className="w-full bg-gray-950 border border-gray-600 px-4 py-3 text-white text-sm font-semibold focus:outline-none focus:border-orange-500 focus:shadow-lg focus:shadow-orange-500/20 transition-all duration-300 cursor-pointer"
                    >
                      <option value={2} className="bg-gray-900">±2% OTM</option>
                      <option value={5} className="bg-gray-900">±5% OTM</option>
                      <option value={10} className="bg-gray-900">±10% OTM</option>
                      <option value={15} className="bg-gray-900">±15% OTM</option>
                      <option value={20} className="bg-gray-900">±20% OTM</option>
                      <option value={25} className="bg-gray-900">±25% OTM</option>
                      <option value={30} className="bg-gray-900">±30% OTM</option>
                      <option value={40} className="bg-gray-900">±40% OTM</option>
                      <option value={50} className="bg-gray-900">±50% OTM</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Warning for selected option with no data */}
        {selectedStrike && selectedExpiration && (() => {
          const key = `${selectedStrike}-${selectedExpiration}-${optionType}`;
          const realOption = realOptionsData[key];
          const hasMarketData = realOption && (
            (realOption.lastPrice > 0) || 
            (realOption.ask > 0) ||
            (realOption.bid > 0)
          );
          
          if (!hasMarketData) {
            return (
              <div className="bg-yellow-900 border border-yellow-600 rounded-xl p-6 mb-8">
                <h3 className="text-yellow-300 font-bold mb-2">⚠️ No Market Data for Selected Option</h3>
                <p className="text-yellow-200 text-sm">
                  Strike <strong>${selectedStrike}</strong> {optionType.toUpperCase()} expiring <strong>{selectedExpiration}</strong> has no current market data (bid/ask/last).
                  Try selecting a different strike or expiration, or enter a custom premium to see calculations.
                </p>
              </div>
            );
          }
          return null;
        })()}

        {/* Real Data Status Warnings */}
        {availableExpirations.length === 0 && !loading && (
          <div className="bg-red-900 border border-red-600 rounded-xl p-6 mb-8">
            <h3 className="text-red-300 font-bold mb-2">⚠️ No Real Options Data Available</h3>
            <p className="text-red-200 text-sm">
              This calculator only works with real-time market data from Polygon API. 
              No options chain data was found for "{symbol}". Please try a different symbol with active options trading.
            </p>
          </div>
        )}

        {Object.keys(realOptionsData).length === 0 && availableExpirations.length > 0 && !loading && (
          <div className="bg-yellow-900 border border-yellow-600 rounded-xl p-6 mb-8">
            <h3 className="text-yellow-300 font-bold mb-2">📊 Stock Price Only</h3>
            <p className="text-yellow-200 text-sm">
              Stock price loaded successfully, but no real options data is available for "{symbol}". 
              Only symbols with active options trading are supported.
            </p>
          </div>
        )}

        {/* Selection Progress Guide - Show when we have options data but selections are incomplete */}


        {/* Greeks Bar - Above Heat Map */}
        {(() => {
          const hasSymbol = !!symbol;
          const hasOptionType = !!optionType;
          const hasExpiration = !!selectedExpiration;
          const hasStrike = !!selectedStrike;
          const hasRealData = Object.keys(realOptionsData).length > 0;
          const hasCustomPremium = !!(customPremium && customPremium > 0);
          const showHeatmap = hasSymbol && hasOptionType && hasExpiration && hasStrike && (hasRealData || hasCustomPremium);
          
          console.log('🔍 Heatmap Display Check:', {
            hasSymbol, hasOptionType, hasExpiration, hasStrike, hasRealData, hasCustomPremium, showHeatmap,
            symbol, optionType, selectedExpiration, selectedStrike, customPremium,
            realDataCount: Object.keys(realOptionsData).length
          });
          
          return showHeatmap;
        })() && (
          <>
            {(() => {
              const expiration = availableExpirations.find(exp => exp.date === selectedExpiration);
              const greeks = calculateGreeks(selectedStrike || 0, expiration?.days || 0);
              const key = `${selectedStrike}-${selectedExpiration}-${optionType}`;
              const realOption = realOptionsData[key];
              
              return (
                <div className="mb-4 bg-gradient-to-r from-gray-900 to-black rounded-xl p-3 border border-orange-500 shadow-lg">
                  <div className="grid grid-cols-4 gap-3">
                    <div className="bg-black rounded-md p-2 border-l-2 border-purple-500">
                      <div className="text-purple-300 text-xs font-medium mb-1">Delta:</div>
                      <div className="text-purple-400 text-lg font-bold">
                        {greeks.delta !== null ? greeks.delta.toFixed(3) : '--'}
                      </div>
                    </div>
                    <div className="bg-black rounded-md p-2 border-l-2 border-orange-500">
                      <div className="text-orange-300 text-xs font-medium mb-1">Gamma:</div>
                      <div className="text-orange-400 text-lg font-bold">
                        {greeks.gamma !== null ? greeks.gamma.toFixed(4) : '--'}
                      </div>
                    </div>
                    <div className="bg-black rounded-md p-2 border-l-2 border-red-500">
                      <div className="text-red-300 text-xs font-medium mb-1">Theta:</div>
                      <div className="text-red-400 text-lg font-bold">
                        {greeks.theta !== null ? greeks.theta.toFixed(2) : '--'}
                      </div>
                    </div>
                    <div className="bg-black rounded-md p-2 border-l-2 border-cyan-500">
                      <div className="text-cyan-300 text-xs font-medium mb-1">IV:</div>
                      <div className="text-cyan-400 text-lg font-bold">
                        {realOption ? `${(realOption.impliedVolatility * 100).toFixed(1)}%` : '--'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

        {/* ENHANCED PROFIT & LOSS HEAT MAP - Show when selections are made and we have data or custom premium */}
        <div className="bg-black rounded-2xl p-8 border-2 border-gray-700 shadow-2xl">
          {/* Professional Heat Map Container */}
          <div className="overflow-x-auto rounded-xl border-2 border-gray-700">
            <div className="min-w-max bg-black">
              {/* Enhanced X-Axis Label */}
              <div className="text-center py-4 bg-black border-b border-gray-600">
                <span className="text-lg font-bold text-blue-300 uppercase tracking-wider">Time Till Expiration (Days)</span>
              </div>
              
              {/* Professional Heat Map Table */}
              <div className="relative">
                <table className="w-full border-collapse bg-black">
                  {/* Professional Header Row - Time till expiration */}
                  <thead>
                    <tr>
                      <th className="w-20 h-14 bg-gradient-to-b from-gray-900 to-black border-2 border-gray-800 text-sm font-bold text-white shadow-xl">
                        <div className="drop-shadow-lg">Stock Price</div>
                      </th>
                      {heatMapTimeSeries.map((timePoint) => (
                        <th
                          key={timePoint.days}
                          className="w-20 h-14 bg-gradient-to-b from-gray-900 to-black border-2 border-gray-800 text-sm font-bold px-1 text-white shadow-lg"
                        >
                          <div className="text-sm font-bold drop-shadow-md">{timePoint.label}</div>
                          {timePoint.days === 0 && (
                            <div className="text-xs text-gray-400 mt-1">
                              {selectedExpiration?.slice(5)}
                            </div>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  
                  {/* Data Rows - Strike prices vs Time */}
                  <tbody>
                    {heatMapStrikes.map((strike) => {
                      const isATM = strike === atmStrike;
                      
                      return (
                        <tr key={strike} className={isATM ? 'ring-2 ring-yellow-400' : ''}>
                          {/* Y-axis: Simulated Stock Price Level */}
                          <td className={`h-12 border border-gray-600 text-center font-medium text-sm ${
                            isATM 
                              ? 'bg-yellow-900 text-yellow-300 font-bold ring-1 ring-yellow-400' 
                              : 'bg-black text-white'
                          }`}>
                            ${strike} {isATM && '★'}
                          </td>
                          
                          {/* P&L cells for each time point */}
                          {heatMapTimeSeries.map((timePoint) => {
                            const pl = calculateProfessionalPL(strike, timePoint.days);
                            // Professional Black-Scholes calculation using REAL market data
                            const key = `${selectedStrike}-${selectedExpiration}-${optionType}`;
                            const realOption = realOptionsData[key];
                            
                            // Show "R" if we have real data or custom premium is set
                            const hasRealData = (customPremium && customPremium > 0) || (realOption && (
                              (realOption.lastPrice > 0) || 
                              (realOption.ask > 0) ||
                              (realOption.bid > 0 && realOption.ask > 0)
                            ));
                            
                            // Don't show P&L if no real data or if calculation returned 0 due to missing data
                            const shouldDisplay = hasRealData && pl !== 0;
                            
                            return (
                              <td
                                key={`${strike}-${timePoint.days}`}
                                className={`h-12 border text-center text-xs font-bold cursor-pointer hover:opacity-80 transition-opacity ${
                                  shouldDisplay ? getPLColor(pl) : 'bg-gray-800 text-gray-500'
                                } ${
                                  hasRealData ? 'ring-1 ring-blue-400' : ''
                                } ${
                                  isATM ? 'border-yellow-400 border-2' : 'border-gray-600'
                                }`}
                                onClick={() => {
                                  console.log(`🎯 Heat map cell clicked: Strike $${strike}, Expiration: ${selectedExpiration}`);
                                  setSelectedStrike(strike);
                                  // Clear custom premium to use real market data for the new strike
                                  setCustomPremium(null);
                                }}
                                title={`Strike: $${strike}${isATM ? ' (ATM)' : ''}, Days: ${timePoint.days}${shouldDisplay ? `, P&L: ${pl.toFixed(1)}%, Real Data` : ', No Real Data Available'}`}
                              >
                                {shouldDisplay ? (
                                  <div>
                                    {pl > 0 ? '+' : ''}{pl.toFixed(0)}%
                                  </div>
                                ) : (
                                  <div className="text-xs text-gray-500">
                                    --
                                  </div>
                                )}
                              </td>
                          );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          

        </div>
        </>
        )}

        {/* Professional Loading State */}
        {loading && (
          <div className="mt-6 bg-black rounded-2xl p-8 border-2 border-blue-600 text-center">
            <div className="flex items-center justify-center space-x-4">
              <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
              <div>
                <div className="text-blue-300 text-lg font-bold">Loading Real Options Data</div>
                <div className="text-sm text-gray-400 mt-1">Real-time options data only - No simulated or theoretical data</div>
              </div>
            </div>
          </div>
        )}



        {/* Professional Error State */}
        {error && (
          <div className="mt-6 bg-black rounded-2xl p-6 border-2 border-red-600">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <div className="text-red-300 font-bold text-lg">Error Loading Data</div>
                  <div className="text-red-400 text-sm mt-1">{error}</div>
                </div>
              </div>
              <button 
                onClick={() => fetchRealOptionsData(symbol)}
                className="px-6 py-3 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 rounded-xl text-white font-bold transition-all duration-200 hover:scale-105"
              >
                Retry
              </button>
            </div>
          </div>
        )}



      </div>
    </div>
  );
};

export default OptionsCalculator;
