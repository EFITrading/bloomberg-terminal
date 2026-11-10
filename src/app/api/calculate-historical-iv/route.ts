import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Allow up to 5 minutes for this API route
export const maxDuration = 300;

// Scanned IV days are stored per ticker so later scans only fetch what is missing.
// status: OK = IV stored, HOLIDAY = no trading data that day (final), MISS = no usable options data (retried later).
const RESCAN_RECENT_DAYS = 3;
const MISS_RETRY_MS = 7 * 86400_000;

let ivTableReady: Promise<unknown> | null = null
const ensureIvTable = () =>
  (ivTableReady ??= prisma
    .$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "IvDaily" ("ticker" TEXT NOT NULL, "date" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'OK', "callIV" DOUBLE PRECISION, "putIV" DOUBLE PRECISION, "price" DOUBLE PRECISION, "expiration" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY ("ticker", "date"))`
    )
    .catch((e) => {
      ivTableReady = null
      throw e
    }))

type StoredRow = { date: string; status: string; callIV: number | null; putIV: number | null; price: number | null; expiration: string | null; updatedAt: Date }

async function saveIvRows(
  ticker: string,
  rows: Array<{ date: string; status: 'OK' | 'HOLIDAY' | 'MISS'; callIV?: number | null; putIV?: number | null; price?: number | null; expiration?: string | null }>
) {
  if (!rows.length) return
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100)
    const params: any[] = []
    const values = chunk.map((r, j) => {
      const o = j * 7
      params.push(ticker, r.date, r.status, r.callIV ?? null, r.putIV ?? null, r.price ?? null, r.expiration ?? null)
      return `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7},CURRENT_TIMESTAMP)`
    })
    await prisma.$executeRawUnsafe(
      `INSERT INTO "IvDaily" ("ticker","date","status","callIV","putIV","price","expiration","updatedAt") VALUES ${values.join(',')} ON CONFLICT ("ticker","date") DO UPDATE SET "status"=EXCLUDED."status","callIV"=EXCLUDED."callIV","putIV"=EXCLUDED."putIV","price"=EXCLUDED."price","expiration"=EXCLUDED."expiration","updatedAt"=CURRENT_TIMESTAMP`,
      ...params
    )
  }
}

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

    const RISK_FREE_RATE = await (async () => {
      try {
        const r = await fetch(
          'https://query1.finance.yahoo.com/v8/finance/chart/%5EIRX?interval=1d&range=5d',
          { headers: { 'User-Agent': 'Mozilla/5.0' } }
        )
        if (!r.ok) return null
        const j = await r.json()
        const price = j?.chart?.result?.[0]?.meta?.regularMarketPrice
        return typeof price === 'number' && price > 0 ? price / 100 : null
      } catch { return null }
    })()
    if (RISK_FREE_RATE === null) return NextResponse.json({ success: false, error: 'Could not fetch risk-free rate from Treasury' }, { status: 502 })

    // Find all available expirations within 30-45 days from a given date
    const getExpirations30to45Days = async (fromDate: Date, stockTicker: string): Promise<string[]> => {
      const minDays = 30;
      const maxDays = 45;

      const minDate = new Date(fromDate);
      minDate.setDate(minDate.getDate() + minDays);
      const maxDate = new Date(fromDate);
      maxDate.setDate(maxDate.getDate() + maxDays);

      const minDateStr = minDate.toISOString().split('T')[0];
      const maxDateStr = maxDate.toISOString().split('T')[0];
      const asOfDateStr = fromDate.toISOString().split('T')[0];

      try {
        // Fetch all available expirations for this ticker as of the historical date
        const res = await fetch(
          `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${stockTicker}&expiration_date.gte=${minDateStr}&expiration_date.lte=${maxDateStr}&as_of=${asOfDateStr}&limit=1000&apiKey=${apiKey}`
        );
        const data = await res.json();

        if (!data.results || data.results.length === 0) {
          return [];
        }

        // Get unique expiration dates
        const expirations = [...new Set(data.results.map((c: any) => c.expiration_date))] as string[];
        expirations.sort();

        return expirations;
      } catch (err) {
        console.log(`❌ Error fetching expirations for ${asOfDateStr}:`, err);
        return [];
      }
    };

    // Generate array of dates to fetch - go back the full requested period
    const allDates: string[] = [];
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days); // Go back exactly the number of days requested

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      // Skip weekends
      const dayOfWeek = d.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        allDates.push(new Date(d).toISOString().split('T')[0]);
      }
    }

    // Load what is already stored for this ticker and work out which days still need scanning
    const tickerKey = ticker.toUpperCase();
    let stored = new Map<string, StoredRow>();
    let dbOk = true;
    try {
      await ensureIvTable();
      const rows = await prisma.$queryRawUnsafe<StoredRow[]>(
        `SELECT "date","status","callIV","putIV","price","expiration","updatedAt" FROM "IvDaily" WHERE "ticker"=$1 AND "date">=$2`,
        tickerKey,
        allDates[0] ?? '1970-01-01'
      );
      stored = new Map(rows.map((r) => [r.date, r]));
    } catch (e) {
      dbOk = false;
      console.error('IV cache unavailable, scanning everything:', e);
    }

    const recentCutoff = new Date(Date.now() - RESCAN_RECENT_DAYS * 86400_000).toISOString().split('T')[0];
    const historicalDates = allDates.filter((d) => {
      const row = stored.get(d);
      if (!row) return true;
      if (d >= recentCutoff) return true; // latest days can still change, always rescan
      if (row.status === 'MISS') return Date.now() - new Date(row.updatedAt).getTime() > MISS_RETRY_MS;
      return false; // OK or HOLIDAY: final
    });
    const missKinds = new Map<string, 'HOLIDAY' | 'MISS'>();

    console.log(`📊 Calculating 45-day IV history for ${ticker} - ${allDates.length} trading days, ${allDates.length - historicalDates.length} cached, ${historicalDates.length} to scan (${days} calendar days lookback)`);
    console.log(`📅 Date range: ${allDates[0]} to ${allDates[allDates.length - 1]}`);

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
            // NOT_FOUND = market closed that day (final); anything else may be a transient API error
            if (priceData.status === 'NOT_FOUND') missKinds.set(dateStr, 'HOLIDAY');
            return null;
          }

          const stockPrice = priceData.close;
          console.log(`💰 [${dateStr}] Stock price: $${stockPrice}`);

          // Find all expirations within 30-45 days
          const expirations = await getExpirations30to45Days(currentDate, ticker);

          if (expirations.length === 0) {
            console.log(`❌ [${dateStr}] No expirations found within 30-45 days, skipping`);
            skippedNoContracts++;
            missKinds.set(dateStr, 'MISS');
            return null;
          }

          console.log(`📅 [${dateStr}] Found ${expirations.length} expirations within 30-45 days: [${expirations.join(', ')}]`);

          // Calculate IV for each expiration and average them
          const allExpirationCallIVs: number[] = [];
          const allExpirationPutIVs: number[] = [];

          for (const expirationStr of expirations) {
            const targetExpiration = new Date(expirationStr);

            // Calculate time to expiration in years
            const timeToExpiration = (targetExpiration.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24 * 365);

            if (timeToExpiration <= 0) {
              console.log(`❌ [${dateStr}] Invalid expiration ${expirationStr} (${timeToExpiration.toFixed(4)} years), skipping`);
              continue;
            }

            const daysOut = Math.round((targetExpiration.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
            console.log(`📆 [${dateStr}] Processing expiration ${expirationStr} (${daysOut} days out)`);

            // Get available options contracts for this expiration AS OF the historical date
            const contractsRes = await fetch(
              `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&expiration_date=${expirationStr}&as_of=${dateStr}&limit=1000&apiKey=${apiKey}`
            );
            const contractsData = await contractsRes.json();

            if (!contractsData.results || contractsData.results.length === 0) {
              console.log(`❌ [${dateStr}] No contracts for expiration ${expirationStr}, skipping this expiration`);
              continue;
            }

            // Get unique strikes
            const allStrikes = [...new Set(contractsData.results.map((c: any) => c.strike_price))] as number[];
            allStrikes.sort((a, b) => a - b);

            // Find ATM strike index (only 1 strike for speed)
            const atmIndex = allStrikes.findIndex(strike => strike >= stockPrice);

            if (atmIndex === -1) {
              console.log(`❌ [${dateStr}] No ATM strike found for expiration ${expirationStr}`);
              continue;
            }

            // Only use ATM strike (1 strike total for 3x speed improvement)
            const strikes = [allStrikes[atmIndex]];

            console.log(`🎯 [${dateStr}] ATM Strike for ${expirationStr}: ${strikes[0]}`);

            // Calculate IV for each strike
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

                return iv;
              } catch (err) {
                return null;
              }
            };

            // Process all strikes in parallel for this expiration
            const strikePromises = [
              ...strikes.map(strike => calculateStrikeIV(strike, 'call').then(iv => ({ type: 'call', iv }))),
              ...strikes.map(strike => calculateStrikeIV(strike, 'put').then(iv => ({ type: 'put', iv })))
            ];

            const strikeResults = await Promise.all(strikePromises);

            const expCallIVs: number[] = [];
            const expPutIVs: number[] = [];

            strikeResults.forEach(result => {
              if (result.iv !== null && result.iv > 0.01 && result.iv < 5) {
                if (result.type === 'call') {
                  expCallIVs.push(result.iv);
                } else {
                  expPutIVs.push(result.iv);
                }
              }
            });

            // Average IVs for this expiration and add to overall collection
            if (expCallIVs.length > 0) {
              const avgCallIV = expCallIVs.reduce((a, b) => a + b, 0) / expCallIVs.length;
              allExpirationCallIVs.push(avgCallIV);
              console.log(`  🟢 [${dateStr}] ${expirationStr} Call IV: ${(avgCallIV * 100).toFixed(2)}%`);
            }
            if (expPutIVs.length > 0) {
              const avgPutIV = expPutIVs.reduce((a, b) => a + b, 0) / expPutIVs.length;
              allExpirationPutIVs.push(avgPutIV);
              console.log(`  🔴 [${dateStr}] ${expirationStr} Put IV: ${(avgPutIV * 100).toFixed(2)}%`);
            }
          }

          // Average across all expirations
          console.log(`📊 [${dateStr}] Averaging ${allExpirationCallIVs.length} call IVs and ${allExpirationPutIVs.length} put IVs from ${expirations.length} expirations`);

          if (allExpirationCallIVs.length > 0 || allExpirationPutIVs.length > 0) {
            const avgCallIV = allExpirationCallIVs.length > 0
              ? (allExpirationCallIVs.reduce((a, b) => a + b, 0) / allExpirationCallIVs.length) * 100
              : null;
            const avgPutIV = allExpirationPutIVs.length > 0
              ? (allExpirationPutIVs.reduce((a, b) => a + b, 0) / allExpirationPutIVs.length) * 100
              : null;

            console.log(`✅ [${dateStr}] Final averaged IV - Call: ${avgCallIV?.toFixed(2)}%, Put: ${avgPutIV?.toFixed(2)}% (from ${expirations.length} expirations)`);

            return {
              date: dateStr,
              callIV: avgCallIV,
              putIV: avgPutIV,
              price: stockPrice,
              expiration: expirations.join(', ')
            };
          } else {
            console.log(`⚠️ [${dateStr}] No valid IV data calculated - skipping`);
            skippedNoIV++;
            missKinds.set(dateStr, 'MISS');
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
      const toSave: Parameters<typeof saveIvRows>[1] = [];
      batchResults.forEach((result, idx) => {
        if (result) {
          historicalData.push(result);
          processedCount++;
          toSave.push({ date: result.date, status: 'OK', callIV: result.callIV, putIV: result.putIV, price: result.price, expiration: result.expiration });
        } else {
          const kind = missKinds.get(batch[idx]);
          if (kind) toSave.push({ date: batch[idx], status: kind });
        }
      });
      // Persist after every batch so an interrupted scan keeps its progress
      if (dbOk) {
        try { await saveIvRows(tickerKey, toSave); } catch (e) { console.error('Failed to save IV batch:', e); }
      }

      const batchTime = ((Date.now() - batchStartTime) / 1000).toFixed(1);
      const progress = ((batchIndex / batches.length) * 100).toFixed(1);
      const remainingBatches = batches.length - batchIndex;
      const estimatedRemaining = Math.ceil(remainingBatches * 3 / 60);

      console.log(`✅ Batch ${batchIndex}/${batches.length} complete in ${batchTime}s: ${processedCount}/${historicalDates.length} total processed (${progress}% complete)`);
      console.log(`⏱️  Estimated time remaining: ${estimatedRemaining} minutes`);
    }

    // Merge freshly scanned days with the cached ones
    const scanned = new Set(historicalData.map((h) => h.date));
    stored.forEach((row, date) => {
      if (row.status === 'OK' && !scanned.has(date) && allDates.includes(date)) {
        historicalData.push({ date, callIV: row.callIV, putIV: row.putIV, price: row.price, expiration: row.expiration ?? '' });
      }
    });
    historicalData.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    console.log(`\n📊 SUMMARY: Scanned ${processedCount}/${historicalDates.length} days, ${historicalData.length} total points`);
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
