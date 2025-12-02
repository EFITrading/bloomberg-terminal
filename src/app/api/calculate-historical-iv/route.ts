import { NextRequest, NextResponse } from 'next/server';

// Allow up to 5 minutes for this API route
export const maxDuration = 300;

// Black-Scholes IV calculation using Newton-Raphson method
function calculateImpliedVolatility(
  optionPrice: number,
  stockPrice: number,
  strikePrice: number,
  timeToExpiration: number,
  riskFreeRate: number,
  optionType: 'call' | 'put'
): number | null {
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

function blackScholesPrice(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  type: 'call' | 'put'
): number {
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  
  if (type === 'call') {
    return S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
  } else {
    return K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
  }
}

function blackScholesVega(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number
): number {
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  return S * normalPDF(d1) * Math.sqrt(T);
}

function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - prob : prob;
}

function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker');
    const days = parseInt(searchParams.get('days') || '365'); // How many days of history to fetch (1 year default)
    
    if (!ticker) {
      return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
    }

    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ 
        success: false, 
        error: 'POLYGON_API_KEY not configured' 
      }, { status: 500 });
    }

    const RISK_FREE_RATE = 0.045; // Approximate current risk-free rate

    const getNextMonthlyExpiration = (fromDate: Date) => {
      // Monthly options expire on the 3rd Friday of each month
      const getThirdFriday = (year: number, month: number) => {
        const firstDay = new Date(year, month, 1);
        const firstFriday = firstDay.getDay() <= 5 
          ? 5 - firstDay.getDay() + 1
          : 12 - firstDay.getDay();
        return new Date(year, month, firstFriday + 14); // Third Friday
      };

      let year = fromDate.getFullYear();
      let month = fromDate.getMonth();
      
      // Get this month's expiration
      let expiration = getThirdFriday(year, month);
      
      // If we're within 2 days of expiration or past it, use next month
      const twoDaysBeforeExpiry = new Date(expiration);
      twoDaysBeforeExpiry.setDate(twoDaysBeforeExpiry.getDate() - 2);
      
      console.log(`🔍 [${fromDate.toISOString().split('T')[0]}] This month expiry: ${expiration.toISOString().split('T')[0]}, 2-day cutoff: ${twoDaysBeforeExpiry.toISOString().split('T')[0]}`);
      
      if (fromDate >= twoDaysBeforeExpiry) {
        console.log(`⏭️  [${fromDate.toISOString().split('T')[0]}] Past cutoff, moving to next month`);
        month++;
        if (month > 11) {
          month = 0;
          year++;
        }
        expiration = getThirdFriday(year, month);
      }
      
      console.log(`✅ [${fromDate.toISOString().split('T')[0]}] Using monthly expiration: ${expiration.toISOString().split('T')[0]}`);
      return expiration;
    };

    // Generate array of dates to fetch - go back the full requested period
    const historicalDates: string[] = [];
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days); // Go back exactly the number of days requested
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      // Skip weekends
      const dayOfWeek = d.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        historicalDates.push(new Date(d).toISOString().split('T')[0]);
      }
    }

    console.log(`📊 Calculating 45-day IV history for ${ticker} - ${historicalDates.length} trading days (${days} calendar days lookback)`);
    console.log(`📅 Date range: ${historicalDates[0]} to ${historicalDates[historicalDates.length - 1]}`);

    const historicalData: any[] = [];
    let processedCount = 0;
    let skippedNoContracts = 0;
    let skippedNoPrice = 0;
    let skippedNoIV = 0;

    // Process dates in parallel batches for MASSIVE speed improvement
    // Scale batch size based on lookback period for optimal performance
    const BATCH_SIZE = days <= 365 ? 10 : days <= 730 ? 20 : days <= 1095 ? 30 : 40;
    const batches = [];
    
    for (let i = 0; i < historicalDates.length; i += BATCH_SIZE) {
      batches.push(historicalDates.slice(i, i + BATCH_SIZE));
    }
    
    console.log(`🚀 Processing ${historicalDates.length} dates in ${batches.length} parallel batches of ${BATCH_SIZE} (${days} days lookback)`);
    console.log(`⚡ Estimated time: ${Math.ceil(batches.length * 3 / 60)} minutes`);

    let batchIndex = 0;
    for (const batch of batches) {
      batchIndex++;
      const batchStartTime = Date.now();
      
      console.log(`\n📦 Processing batch ${batchIndex}/${batches.length} (${batch.length} dates)...`);
      
      const batchPromises = batch.map(async (dateStr) => {
        try {
          const currentDate = new Date(dateStr);
        
        // Get stock price for this date
        console.log(`\n📍 Processing ${dateStr}...`);
        const priceRes = await fetch(
          `https://api.polygon.io/v1/open-close/${ticker}/${dateStr}?adjusted=true&apiKey=${apiKey}`
        );
        const priceData = await priceRes.json();
        
        if (priceData.status !== 'OK' || !priceData.close) {
          console.log(`❌ [${dateStr}] No stock price data, skipping`);
          return null;
        }
        
        const stockPrice = priceData.close;
        console.log(`💰 [${dateStr}] Stock price: $${stockPrice}`);

        // Use next monthly expiration
        const targetExpiration = getNextMonthlyExpiration(currentDate);
        const expirationStr = targetExpiration.toISOString().split('T')[0];
        
        console.log(`📅 [${dateStr}] Using monthly expiration ${expirationStr} (${Math.round((targetExpiration.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24))} days out)`);
        
        // Calculate time to expiration in years
        const timeToExpiration = (targetExpiration.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
        
        if (timeToExpiration <= 0) {
          console.log(`❌ [${dateStr}] Invalid expiration (${timeToExpiration.toFixed(4)} years), skipping`);
          return null;
        }

        // Get available options contracts for this expiration AS OF the historical date
        console.log(`🔎 [${dateStr}] Fetching contracts for expiration ${expirationStr} as of ${dateStr}...`);
        const contractsRes = await fetch(
          `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&expiration_date=${expirationStr}&as_of=${dateStr}&limit=1000&apiKey=${apiKey}`
        );
        const contractsData = await contractsRes.json();
        
        if (!contractsData.results || contractsData.results.length === 0) {
          console.log(`❌ [${dateStr}] No contracts for expiration ${expirationStr} as of ${dateStr} (API returned ${contractsData.results ? 0 : 'null'} results), skipping`);
          skippedNoContracts++;
          return null;
        }
        
        console.log(`✅ [${dateStr}] Found ${contractsData.results.length} total contracts for ${expirationStr}`);

        // Get unique strikes
        const allStrikes = [...new Set(contractsData.results.map((c: any) => c.strike_price))] as number[];
        allStrikes.sort((a, b) => a - b);
        
        console.log(`🎯 [${dateStr}] Total unique strikes: ${allStrikes.length}, Stock price: $${stockPrice}`);
        
        // Find 5 OTM strikes for calls and puts
        const atmIndex = allStrikes.findIndex(strike => strike >= stockPrice);
        const callStrikes = allStrikes.slice(atmIndex, atmIndex + 5);
        const putStrikes = allStrikes.slice(Math.max(0, atmIndex - 5), atmIndex);
        
        console.log(`🟢 [${dateStr}] Call strikes (5 OTM): [${callStrikes.join(', ')}]`);
        console.log(`🔴 [${dateStr}] Put strikes (5 OTM): [${putStrikes.join(', ')}]`);

        // Fetch option prices and calculate IV - PARALLELIZED
        const calculateStrikeIV = async (strike: number, type: 'call' | 'put') => {
          try {
            const optionType = type === 'call' ? 'C' : 'P';
            const optionTicker = `O:${ticker}${expirationStr.replace(/-/g, '').substring(2)}${optionType}${String(strike * 1000).padStart(8, '0')}`;
            
            let optionPrice = null;
            
            // For recent dates (last 2 days), try snapshot first
            const daysAgo = Math.floor((Date.now() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
            
            if (daysAgo <= 2) {
              try {
                const snapshotRes = await fetch(
                  `https://api.polygon.io/v3/snapshot/options/${ticker}/${optionTicker}?apiKey=${apiKey}`
                );
                const snapshotData = await snapshotRes.json();
                
                if (snapshotData.results?.day?.close && snapshotData.results.day.close > 0) {
                  optionPrice = snapshotData.results.day.close;
                }
              } catch (err) {
                // Continue to historical data
              }
            }
            
            // If snapshot didn't work, get historical price for this date
            if (!optionPrice) {
              const optionPriceRes = await fetch(
                `https://api.polygon.io/v2/aggs/ticker/${optionTicker}/range/1/day/${dateStr}/${dateStr}?apiKey=${apiKey}`
              );
              const optionPriceData = await optionPriceRes.json();
              
              if (!optionPriceData.results || optionPriceData.results.length === 0) {
                return null;
              }
              
              optionPrice = optionPriceData.results[0].c; // Close price
            }
            
            if (!optionPrice || optionPrice <= 0.01) {
              return null;
            }

            // Calculate implied volatility
            const iv = calculateImpliedVolatility(
              optionPrice,
              stockPrice,
              strike,
              timeToExpiration,
              RISK_FREE_RATE,
              type
            );
            
            if (iv) {
              console.log(`  💚 [${dateStr}] Calculated IV for ${type} $${strike}: ${(iv * 100).toFixed(2)}%`);
            } else {
              console.log(`  ❌ [${dateStr}] Failed to calculate IV for ${type} $${strike}`);
            }
            
            return iv;
          } catch (err) {
            console.log(`  ❌ [${dateStr}] Error calculating ${type} $${strike}:`, err);
            return null;
          }
        };

        // Calculate average IV for calls and puts - PARALLEL PROCESSING
        console.log(`\n📊 [${dateStr}] Calculating IVs in parallel...`);
        const callIVs: number[] = [];
        const putIVs: number[] = [];

        // Sample 3 strikes from middle (skip first 2, take next 3)
        const callStrikesToSample = callStrikes.slice(2, 5);
        const putStrikesToSample = putStrikes.slice(-5, -2);

        console.log(`📞 [${dateStr}] Processing ${callStrikesToSample.length} call + ${putStrikesToSample.length} put strikes in parallel`);
        
        // Process ALL strikes in parallel using Promise.all for maximum speed
        const allPromises = [
          ...callStrikesToSample.map(strike => 
            calculateStrikeIV(strike, 'call').then(iv => ({ type: 'call', iv }))
          ),
          ...putStrikesToSample.map(strike => 
            calculateStrikeIV(strike, 'put').then(iv => ({ type: 'put', iv }))
          )
        ];
        
        const results = await Promise.all(allPromises);
        
        // Separate results into calls and puts
        results.forEach(result => {
          if (result.iv !== null && result.iv > 0.01 && result.iv < 5) {
            if (result.type === 'call') {
              callIVs.push(result.iv);
            } else {
              putIVs.push(result.iv);
            }
          }
        });

        console.log(`📈 [${dateStr}] Results: ${callIVs.length} call IVs, ${putIVs.length} put IVs`);
        
        // Only include this day if we got at least 1 IV value for either calls or puts
        if (callIVs.length > 0 || putIVs.length > 0) {
          const avgCallIV = callIVs.length > 0 
            ? (callIVs.reduce((a, b) => a + b, 0) / callIVs.length) * 100 
            : null;
          const avgPutIV = putIVs.length > 0 
            ? (putIVs.reduce((a, b) => a + b, 0) / putIVs.length) * 100 
            : null;

          console.log(`✅ [${dateStr}] Added to results - Call IV: ${avgCallIV?.toFixed(2)}%, Put IV: ${avgPutIV?.toFixed(2)}%`);

          return {
            date: dateStr,
            callIV: avgCallIV,
            putIV: avgPutIV,
            price: stockPrice,
            expiration: expirationStr
          };
        } else {
          console.log(`⚠️ [${dateStr}] No valid IV data calculated - skipping (callIVs: ${callIVs.length}, putIVs: ${putIVs.length})`);
          skippedNoIV++;
          return null;
        }

        } catch (err) {
          console.log(`❌ [${dateStr}] Error processing date:`, err);
          return null;
        }
      });

      // Wait for entire batch to complete
      const batchResults = await Promise.all(batchPromises);
      
      // Add successful results to historicalData
      batchResults.forEach(result => {
        if (result) {
          historicalData.push(result);
          processedCount++;
        }
      });
      
      const batchTime = ((Date.now() - batchStartTime) / 1000).toFixed(1);
      const progress = ((batchIndex / batches.length) * 100).toFixed(1);
      const remainingBatches = batches.length - batchIndex;
      const estimatedRemaining = Math.ceil(remainingBatches * 3 / 60);
      
      console.log(`✅ Batch ${batchIndex}/${batches.length} complete in ${batchTime}s: ${processedCount}/${historicalDates.length} total processed (${progress}% complete)`);
      console.log(`⏱️  Estimated time remaining: ${estimatedRemaining} minutes`);
    }

    console.log(`\n📊 SUMMARY: Processed ${processedCount}/${historicalDates.length} days`);
    console.log(`⚠️ Skipped: ${skippedNoContracts} (no contracts), ${skippedNoPrice} (no prices), ${skippedNoIV} (no valid IV)`);

    if (historicalData.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Could not calculate historical IV data'
      }, { status: 404 });
    }

    // Get latest data point
    const latest = historicalData[historicalData.length - 1];

    return NextResponse.json({
      success: true,
      data: {
        ticker,
        currentPrice: latest.price,
        callIV: latest.callIV,
        putIV: latest.putIV,
        expiration: latest.expiration,
        history: historicalData,
        dataPoints: historicalData.length
      }
    });

  } catch (error: any) {
    console.error('❌ Calculate Historical IV Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Failed to calculate historical IV' 
    }, { status: 500 });
  }
}
