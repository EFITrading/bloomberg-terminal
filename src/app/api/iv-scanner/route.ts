import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

const TOP_1000_SYMBOLS = [
  'SPY', 'QQQ', 'IWM', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA',
  'BRK.B', 'V', 'JPM', 'JNJ', 'WMT', 'MA', 'PG', 'UNH', 'HD', 'DIS',
  'BAC', 'XOM', 'ABBV', 'PFE', 'KO', 'COST', 'AVGO', 'PEP', 'TMO', 'MRK',
  'CSCO', 'ABT', 'ACN', 'LLY', 'ADBE', 'NKE', 'CRM', 'NFLX', 'AMD', 'TXN',
  'QCOM', 'ORCL', 'CVX', 'DHR', 'NEE', 'UNP', 'INTC', 'BMY', 'PM', 'RTX',
  'HON', 'UPS', 'AMGN', 'LOW', 'T', 'SBUX', 'IBM', 'CAT', 'BA', 'GS',
  'SPGI', 'INTU', 'BLK', 'AXP', 'BKNG', 'GILD', 'NOW', 'DE', 'LMT', 'MMM',
  'MDLZ', 'ADI', 'ISRG', 'TJX', 'SYK', 'REGN', 'PLD', 'CB', 'ZTS', 'CI',
  'MO', 'DUK', 'SO', 'C', 'USB', 'TGT', 'EOG', 'BSX', 'BDX', 'CME',
  'CL', 'ITW', 'AON', 'ICE', 'MMC', 'HCA', 'GD', 'NSC', 'WM', 'FCX'
];

const DATA_DIR = path.join(process.cwd(), 'data', 'iv-history');

// Ensure data directory exists
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

interface IVSnapshot {
  date: string;
  time: string;
  timestamp: number;
  callIV: number;
  putIV: number;
  price: number;
  expiration: string;
  scanType: 'OPEN' | 'CLOSE';
}

async function getOptionsIV(ticker: string, weeks: number = 3): Promise<{ callIV: number; putIV: number; price: number; expiration: string } | null> {
  try {
    // Get current stock price
    const quoteResponse = await fetch(
      `https://api.polygon.io/v2/last/trade/${ticker}?apiKey=${POLYGON_API_KEY}`
    );
    const quoteData = await quoteResponse.json();
    
    if (!quoteData.results) return null;
    const currentPrice = quoteData.results.p;

    // Get options chain
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + (weeks * 7));
    
    const optionsResponse = await fetch(
      `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&expiration_date.gte=${new Date().toISOString().split('T')[0]}&expiration_date.lte=${targetDate.toISOString().split('T')[0]}&limit=1000&apiKey=${POLYGON_API_KEY}`
    );
    const optionsData = await optionsResponse.json();
    
    if (!optionsData.results || optionsData.results.length === 0) return null;

    // Find ATM options
    const sortedByExpiration = optionsData.results.sort((a: any, b: any) => 
      new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime()
    );
    
    const nearestExpiration = sortedByExpiration[0].expiration_date;
    const expirationOptions = sortedByExpiration.filter((opt: any) => opt.expiration_date === nearestExpiration);
    
    const calls = expirationOptions.filter((opt: any) => opt.contract_type === 'call');
    const puts = expirationOptions.filter((opt: any) => opt.contract_type === 'put');
    
    // Get ATM strikes (10 OTM each side)
    const atmStrike = Math.round(currentPrice);
    
    const callStrikes = calls
      .filter((c: any) => c.strike_price >= currentPrice)
      .sort((a: any, b: any) => a.strike_price - b.strike_price)
      .slice(0, 10);
    
    const putStrikes = puts
      .filter((p: any) => p.strike_price <= currentPrice)
      .sort((a: any, b: any) => b.strike_price - a.strike_price)
      .slice(0, 10);

    if (callStrikes.length === 0 || putStrikes.length === 0) return null;

    // Get IV for these options
    const callIVs: number[] = [];
    const putIVs: number[] = [];

    for (const call of callStrikes) {
      const snapshot = await fetch(
        `https://api.polygon.io/v3/snapshot/options/${call.ticker}?apiKey=${POLYGON_API_KEY}`
      );
      const data = await snapshot.json();
      if (data.results?.implied_volatility) {
        callIVs.push(data.results.implied_volatility * 100);
      }
    }

    for (const put of putStrikes) {
      const snapshot = await fetch(
        `https://api.polygon.io/v3/snapshot/options/${put.ticker}?apiKey=${POLYGON_API_KEY}`
      );
      const data = await snapshot.json();
      if (data.results?.implied_volatility) {
        putIVs.push(data.results.implied_volatility * 100);
      }
    }

    if (callIVs.length === 0 || putIVs.length === 0) return null;

    const avgCallIV = callIVs.reduce((a, b) => a + b, 0) / callIVs.length;
    const avgPutIV = putIVs.reduce((a, b) => a + b, 0) / putIVs.length;

    return {
      callIV: parseFloat(avgCallIV.toFixed(2)),
      putIV: parseFloat(avgPutIV.toFixed(2)),
      price: currentPrice,
      expiration: nearestExpiration
    };

  } catch (error) {
    console.error(`Error fetching IV for ${ticker}:`, error);
    return null;
  }
}

function saveIVSnapshot(ticker: string, snapshot: IVSnapshot) {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, `${ticker}.json`);
  
  let history: IVSnapshot[] = [];
  if (fs.existsSync(filePath)) {
    const data = fs.readFileSync(filePath, 'utf-8');
    history = JSON.parse(data);
  }
  
  history.push(snapshot);
  
  // Keep last 365 days of data
  const cutoffDate = Date.now() - (365 * 24 * 60 * 60 * 1000);
  history = history.filter(h => h.timestamp > cutoffDate);
  
  fs.writeFileSync(filePath, JSON.stringify(history, null, 2));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const scanType = searchParams.get('type') as 'OPEN' | 'CLOSE' || 'OPEN';
    const manualRun = searchParams.get('manual') === 'true';

    console.log(`📊 Starting IV Scan: ${scanType} (Manual: ${manualRun})`);

    const now = new Date();
    const currentTime = now.toLocaleTimeString('en-US', { 
      hour12: false, 
      timeZone: 'America/New_York' 
    });

    // Check if it's the right time (9:49 AM ET or 3:41 PM ET)
    if (!manualRun) {
      const hour = parseInt(currentTime.split(':')[0]);
      const minute = parseInt(currentTime.split(':')[1]);
      
      const isOpenTime = hour === 9 && minute === 49;
      const isCloseTime = hour === 15 && minute === 41;
      
      if (!isOpenTime && !isCloseTime) {
        return NextResponse.json({
          success: false,
          error: 'Not scheduled scan time',
          nextScan: 'Next scan: 9:49 AM ET or 3:41 PM ET'
        });
      }
    }

    const results: any[] = [];
    let successCount = 0;
    let errorCount = 0;

    // Scan in batches to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < Math.min(TOP_1000_SYMBOLS.length, 100); i += batchSize) {
      const batch = TOP_1000_SYMBOLS.slice(i, i + batchSize);
      
      for (const symbol of batch) {
        try {
          const ivData = await getOptionsIV(symbol, 3);
          
          if (ivData) {
            const snapshot: IVSnapshot = {
              date: now.toISOString().split('T')[0],
              time: currentTime,
              timestamp: now.getTime(),
              callIV: ivData.callIV,
              putIV: ivData.putIV,
              price: ivData.price,
              expiration: ivData.expiration,
              scanType
            };
            
            saveIVSnapshot(symbol, snapshot);
            results.push({ ticker: symbol, ...snapshot });
            successCount++;
            
            console.log(`✅ ${symbol}: Call IV ${ivData.callIV}%, Put IV ${ivData.putIV}%`);
          } else {
            errorCount++;
          }
          
          // Rate limiting delay
          await new Promise(resolve => setTimeout(resolve, 200));
          
        } catch (err) {
          console.error(`❌ Error scanning ${symbol}:`, err);
          errorCount++;
        }
      }
      
      console.log(`📊 Batch ${Math.floor(i / batchSize) + 1} complete: ${successCount} success, ${errorCount} errors`);
    }

    console.log(`✅ IV Scan Complete: ${successCount} stocks scanned successfully`);

    return NextResponse.json({
      success: true,
      scanType,
      scanned: successCount,
      errors: errorCount,
      timestamp: now.toISOString(),
      nextScan: scanType === 'OPEN' ? '3:41 PM ET' : '9:49 AM ET (next day)'
    });

  } catch (error) {
    console.error('IV Scanner Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
