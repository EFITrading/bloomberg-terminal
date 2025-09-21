import { NextRequest, NextResponse } from 'next/server';

// Add in-memory cache with TTL
const cache = new Map<string, { data: any; timestamp: number; ttl: number }>();
const CACHE_TTL = 60000; // 1 minute cache for options data
const AGGRESSIVE_CACHE_TTL = 300000; // 5 minute cache for expiration discovery

function getCachedData(key: string): any | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < cached.ttl) {
    return cached.data;
  }
  if (cached) {
    cache.delete(key); // Remove expired entry
  }
  return null;
}

function setCachedData(key: string, data: any, ttl: number = CACHE_TTL): void {
  cache.set(key, { data, timestamp: Date.now(), ttl });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker') || 'SPY';
  const apiKey = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';
  
  // Add cache clearing capability
  const clearCache = searchParams.get('clearCache') === 'true';
  if (clearCache) {
    console.log('🗑️ CLEARING ALL CACHE');
    cache.clear();
  }
  
  try {
    console.log(`⚡ ULTRA-FAST: Fetching options data for ${ticker}`);
    
    // Check cache first
    const cacheKey = `options_${ticker}`;
    const cachedResult = getCachedData(cacheKey);
    if (cachedResult) {
      console.log(`🚀 CACHE HIT: Returning cached data for ${ticker}`);
      return NextResponse.json(cachedResult);
    }
    
    // Get current price (with caching)
    let currentPrice = 663.7;
    const priceCacheKey = `price_${ticker}`;
    const cachedPrice = getCachedData(priceCacheKey);
    
    if (cachedPrice) {
      currentPrice = cachedPrice;
    } else {
      const priceRes = await fetch(`https://api.polygon.io/v2/last/trade/${ticker}?apikey=${apiKey}`);
      const priceData = await priceRes.json();
      if (priceData.status === 'OK' && priceData.results) {
        currentPrice = priceData.results.p;
        setCachedData(priceCacheKey, currentPrice, 30000); // 30 sec cache for price
      }
    }
    
    // Check if we have cached expiration dates to speed up discovery
    const expCacheKey = `expirations_${ticker}`;
    let knownExpirations = getCachedData(expCacheKey);
    
    let allOptions: any[] = [];
    let pages = 0; // Track pages for debug info
    let allDiscoveredExpirations: Record<string, { calls: Record<string, any>; puts: Record<string, any> }> = {};
    
    if (knownExpirations && knownExpirations.length > 10) {
      console.log(`🔥 USING CACHED EXPIRATIONS: ${knownExpirations.length} dates`);
      
      // Initialize empty structure for ALL cached expiration dates
      knownExpirations.forEach((date: string) => {
        allDiscoveredExpirations[date] = { calls: {}, puts: {} };
      });
      
      // Use parallel processing for known expirations (MUCH FASTER!)
      const batchSize = 10; // Process 10 expirations at once
      const batches = [];
      for (let i = 0; i < knownExpirations.length; i += batchSize) {
        batches.push(knownExpirations.slice(i, i + batchSize));
      }
      pages = batches.length; // Track batch count as pages equivalent
      
      for (const batch of batches) {
        const promises = batch.map(async (expDate: string) => {
          try {
            const url = `https://api.polygon.io/v3/snapshot/options/${ticker}?expiration_date=${expDate}&limit=250&apikey=${apiKey}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.status === 'OK' && data.results && data.results.length > 0) {
              return data.results;
            }
          } catch (e) {
            return [];
          }
          return [];
        });
        
        const batchResults = await Promise.all(promises);
        batchResults.forEach(results => {
          if (results.length > 0) {
            allOptions.push(...results);
          }
        });
        
        // Small delay between batches to avoid rate limits
        if (batches.indexOf(batch) < batches.length - 1) {
          await new Promise(r => setTimeout(r, 100));
        }
      }
    } else {
      console.log(`🔍 DISCOVERING EXPIRATIONS: Getting all contracts with unlimited pagination`);
      
      // Use the original contracts API but with TRULY unlimited pagination
      let contractsUrl = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&limit=1000&apikey=${apiKey}`;
      let allExpirations = new Set<string>();
      let contractPages = 0;
      
      // UNLIMITED pagination - keep going until no more data
      while (contractsUrl) {
        console.log(`📄 Contracts page ${contractPages + 1} - Found ${allExpirations.size} expiration dates so far`);
        
        try {
          const res = await fetch(contractsUrl);
          const data = await res.json();
          
          if (data.status === 'OK' && data.results && data.results.length > 0) {
            // Extract ALL expiration dates from contracts
            data.results.forEach((contract: any) => {
              if (contract.expiration_date) {
                allExpirations.add(contract.expiration_date);
              }
            });
            
            console.log(`✅ Page ${contractPages + 1}: Added ${data.results.length} contracts, total ${allExpirations.size} unique expiration dates`);
            
            // Continue pagination if next_url exists
            if (data.next_url) {
              // CRITICAL FIX: Add API key to next_url since Polygon doesn't include it
              contractsUrl = data.next_url + `&apikey=${apiKey}`;
              contractPages++;
            } else {
              console.log(`🏁 PAGINATION COMPLETE: No more pages after ${contractPages + 1} pages`);
              break;
            }
          } else {
            console.log(`⚠️ No results on page ${contractPages + 1}`);
            console.log(`📊 Full response:`, JSON.stringify(data, null, 2));
            break;
          }
        } catch (error) {
          console.log(`❌ Error on page ${contractPages + 1}:`, error);
          break;
        }
        
        // Small delay to respect rate limits
        await new Promise(r => setTimeout(r, 50));
      }
      
      const sortedExpirations = Array.from(allExpirations).sort();
      console.log(`🎯 TOTAL EXPIRATION DATES DISCOVERED: ${sortedExpirations.length}`);
      console.log(`📅 FIRST 10 DATES: ${sortedExpirations.slice(0, 10).join(', ')}`);
      console.log(`📅 LAST 10 DATES: ${sortedExpirations.slice(-10).join(', ')}`);
      console.log(`🏁 LATEST DATE: ${sortedExpirations[sortedExpirations.length - 1]}`);
      
      // STEP 2: Get snapshots for ALL expiration dates - NO ARTIFICIAL LIMITS!
      console.log(`📊 Fetching snapshots for ALL ${sortedExpirations.length} expiration dates`);
      
      // Initialize empty structure for ALL discovered expiration dates
      sortedExpirations.forEach(date => {
        allDiscoveredExpirations[date] = { calls: {}, puts: {} };
      });
      
      // Get snapshots for ALL expiration dates
      for (const expDate of sortedExpirations) {
        try {
          const snapUrl = `https://api.polygon.io/v3/snapshot/options/${ticker}?expiration_date=${expDate}&limit=250&apikey=${apiKey}`;
          const snapRes = await fetch(snapUrl);
          const snapData = await snapRes.json();
          
          if (snapData.status === 'OK' && snapData.results && snapData.results.length > 0) {
            allOptions.push(...snapData.results);
          }
          await new Promise(r => setTimeout(r, 20)); // Minimal delay
        } catch (e) {
          // Skip failed dates
        }
      }
      
      pages = contractPages;
      
      // Cache ALL discovered expirations for next time  
      if (sortedExpirations.length > 0) {
        setCachedData(expCacheKey, sortedExpirations, AGGRESSIVE_CACHE_TTL);
        console.log(`💾 CACHED ${sortedExpirations.length} total expirations for future use`);
      }
    }
    
    // Filter contracts with open interest OR greeks data and group by expiration
    const withOIOrGreeks = allOptions.filter(c => 
      (c.open_interest && c.open_interest > 0) || 
      (c.greeks && Object.keys(c.greeks).length > 0)
    );
    console.log(`Found ${withOIOrGreeks.length} contracts with OI>0 or Greeks out of ${allOptions.length} total`);
    
    // Group by expiration date - START with ALL discovered dates
    const groupedByExpiration: Record<string, { calls: Record<string, any>; puts: Record<string, any> }> = {};
    
    // First, initialize ALL discovered expiration dates (even if empty)
    Object.keys(allDiscoveredExpirations).forEach(date => {
      groupedByExpiration[date] = { calls: {}, puts: {} };
    });
    
    withOIOrGreeks.forEach(contract => {
      const expirationDate = contract.details?.expiration_date;
      if (!expirationDate) return;
      
      if (!groupedByExpiration[expirationDate]) {
        groupedByExpiration[expirationDate] = { calls: {}, puts: {} };
      }
      
      const strike = contract.details?.strike_price?.toString();
      if (!strike) return;
      
      const contractType = contract.details?.contract_type?.toLowerCase();
      
      if (contractType === 'call') {
        groupedByExpiration[expirationDate].calls[strike] = {
          open_interest: contract.open_interest || 0,
          strike_price: contract.details.strike_price,
          expiration_date: expirationDate,
          implied_volatility: contract.implied_volatility,
          greeks: {
            delta: contract.greeks?.delta,
            gamma: contract.greeks?.gamma,
            theta: contract.greeks?.theta,
            vega: contract.greeks?.vega
          }
        };
      } else if (contractType === 'put') {
        groupedByExpiration[expirationDate].puts[strike] = {
          open_interest: contract.open_interest || 0,
          strike_price: contract.details.strike_price,
          expiration_date: expirationDate,
          implied_volatility: contract.implied_volatility,
          greeks: {
            delta: contract.greeks?.delta,
            gamma: contract.greeks?.gamma,
            theta: contract.greeks?.theta,
            vega: contract.greeks?.vega
          }
        };
      }
    });

    const finalExpirationDates = Object.keys(groupedByExpiration).sort();
    console.log(`🎯 FINAL RESULT: Returning ${finalExpirationDates.length} expiration dates`);
    console.log(`📅 FIRST 5: ${finalExpirationDates.slice(0, 5).join(', ')}`);
    console.log(`📅 LAST 5: ${finalExpirationDates.slice(-5).join(', ')}`);

    return NextResponse.json({
      success: true,
      data: groupedByExpiration,
      currentPrice,
      debug: {
        totalContracts: allOptions.length,
        withOI: withOIOrGreeks.length,
        pagesFetched: pages,
        expirationDatesFound: finalExpirationDates.length,
        earliestDate: finalExpirationDates[0],
        latestDate: finalExpirationDates[finalExpirationDates.length - 1]
      }
    });

  } catch (error) {
    console.error('Error fetching options data:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch options data',
      data: {}
    }, { status: 500 });
  }
}