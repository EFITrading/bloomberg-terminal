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

const DATA_FILE = path.join(process.cwd(), 'data', 'otm-scan', 'latest.json');

// Ensure data directory exists
function ensureDataDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

interface PremiumImbalance {
  symbol: string;
  stockPrice: number;
  atmStrike: number;
  callMid: number;
  callBid: number;
  callAsk: number;
  callSpreadPercent: number;
  putMid: number;
  putBid: number;
  putAsk: number;
  putSpreadPercent: number;
  premiumDifference: number;
  imbalancePercent: number;
  expensiveSide: 'CALLS' | 'PUTS';
  imbalanceSeverity: 'EXTREME' | 'HIGH';
  strikeSpacing: number;
  scanType: 'PREMARKET' | 'MIDDAY' | 'CLOSE';
}

async function scanOTMPremium(symbol: string): Promise<PremiumImbalance | null> {
  try {
    // Get current stock price
    const quoteResponse = await fetch(
      `https://api.polygon.io/v2/last/trade/${symbol}?apiKey=${POLYGON_API_KEY}`
    );
    const quoteData = await quoteResponse.json();
    
    if (!quoteData.results) return null;
    const stockPrice = quoteData.results.p;

    // Get options chain
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 45);
    
    const optionsResponse = await fetch(
      `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${symbol}&expiration_date.gte=${new Date().toISOString().split('T')[0]}&expiration_date.lte=${targetDate.toISOString().split('T')[0]}&limit=1000&apiKey=${POLYGON_API_KEY}`
    );
    const optionsData = await optionsResponse.json();
    
    if (!optionsData.results || optionsData.results.length === 0) return null;

    // Find nearest expiration
    const sortedByExpiration = optionsData.results.sort((a: any, b: any) => 
      new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime()
    );
    
    const nearestExpiration = sortedByExpiration[0].expiration_date;
    const expirationOptions = sortedByExpiration.filter((opt: any) => opt.expiration_date === nearestExpiration);
    
    // Find ATM strike
    const strikes = [...new Set(expirationOptions.map((opt: any) => opt.strike_price))].sort((a: any, b: any) => a - b);
    const atmStrike = strikes.reduce((prev: any, curr: any) => 
      Math.abs(curr - stockPrice) < Math.abs(prev - stockPrice) ? curr : prev
    );

    // Get ATM call and put
    const atmCall = expirationOptions.find((opt: any) => 
      opt.contract_type === 'call' && opt.strike_price === atmStrike
    );
    const atmPut = expirationOptions.find((opt: any) => 
      opt.contract_type === 'put' && opt.strike_price === atmStrike
    );

    if (!atmCall || !atmPut) return null;

    // Get option snapshots for pricing
    const [callSnapshot, putSnapshot] = await Promise.all([
      fetch(`https://api.polygon.io/v3/snapshot/options/${atmCall.ticker}?apiKey=${POLYGON_API_KEY}`),
      fetch(`https://api.polygon.io/v3/snapshot/options/${atmPut.ticker}?apiKey=${POLYGON_API_KEY}`)
    ]);

    const callData = await callSnapshot.json();
    const putData = await putSnapshot.json();

    if (!callData.results?.last_quote || !putData.results?.last_quote) return null;

    const callBid = callData.results.last_quote.bid || 0;
    const callAsk = callData.results.last_quote.ask || 0;
    const callMid = (callBid + callAsk) / 2;

    const putBid = putData.results.last_quote.bid || 0;
    const putAsk = putData.results.last_quote.ask || 0;
    const putMid = (putBid + putAsk) / 2;

    if (callMid === 0 || putMid === 0) return null;

    // Calculate imbalance
    const premiumDifference = callMid - putMid;
    const avgPremium = (callMid + putMid) / 2;
    const imbalancePercent = (premiumDifference / avgPremium) * 100;

    const callSpreadPercent = callMid > 0 ? ((callAsk - callBid) / callMid) * 100 : 0;
    const putSpreadPercent = putMid > 0 ? ((putAsk - putBid) / putMid) * 100 : 0;

    const absImbalance = Math.abs(imbalancePercent);

    // Only return HIGH or EXTREME (filter out moderate)
    let imbalanceSeverity: 'EXTREME' | 'HIGH' | null = null;
    if (absImbalance > 40) {
      imbalanceSeverity = 'EXTREME';
    } else if (absImbalance > 25) {
      imbalanceSeverity = 'HIGH';
    } else {
      return null; // Filter out moderate and low
    }

    const strikeSpacing = strikes.length > 1 ? (strikes[1] as number) - (strikes[0] as number) : 0;

    return {
      symbol,
      stockPrice,
      atmStrike: atmStrike as number,
      callMid,
      callBid,
      callAsk,
      callSpreadPercent,
      putMid,
      putBid,
      putAsk,
      putSpreadPercent,
      premiumDifference,
      imbalancePercent,
      expensiveSide: premiumDifference > 0 ? 'CALLS' : 'PUTS',
      imbalanceSeverity,
      strikeSpacing,
      scanType: 'PREMARKET' // Will be set by caller
    };

  } catch (error) {
    console.error(`Error scanning OTM premium for ${symbol}:`, error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const scanType = searchParams.get('type') as 'PREMARKET' | 'MIDDAY' | 'CLOSE' || 'PREMARKET';
    const manualRun = searchParams.get('manual') === 'true';

    console.log(`📊 Starting OTM Premium Background Scan: ${scanType} (Manual: ${manualRun})`);

    const now = new Date();
    const currentTime = now.toLocaleTimeString('en-US', { 
      hour12: false, 
      timeZone: 'America/New_York' 
    });

    // Check if it's the right time
    if (!manualRun) {
      const hour = parseInt(currentTime.split(':')[0]);
      const minute = parseInt(currentTime.split(':')[1]);
      
      const isPreMarket = hour === 9 && minute === 14; // 9:14 AM ET (16min before open)
      const isMidDay = hour === 12 && minute === 30; // 12:30 PM ET (3 hours after open)
      const isClose = hour === 15 && minute === 44; // 3:44 PM ET (16min before close)
      
      if (!isPreMarket && !isMidDay && !isClose) {
        return NextResponse.json({
          success: false,
          error: 'Not scheduled scan time',
          nextScan: 'Next scan: 9:14 AM, 12:30 PM, or 3:44 PM ET'
        });
      }
    }

    const results: PremiumImbalance[] = [];
    let successCount = 0;
    let errorCount = 0;

    // Scan stocks in batches
    const batchSize = 5;
    for (let i = 0; i < Math.min(TOP_1000_SYMBOLS.length, 100); i += batchSize) {
      const batch = TOP_1000_SYMBOLS.slice(i, i + batchSize);
      
      for (const symbol of batch) {
        try {
          const imbalanceData = await scanOTMPremium(symbol);
          
          if (imbalanceData) {
            imbalanceData.scanType = scanType;
            results.push(imbalanceData);
            successCount++;
            
            console.log(`✅ ${symbol}: ${imbalanceData.expensiveSide} ${imbalanceData.imbalanceSeverity} (${Math.abs(imbalanceData.imbalancePercent).toFixed(1)}%)`);
          } else {
            errorCount++;
          }
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
          
        } catch (err) {
          console.error(`❌ Error scanning ${symbol}:`, err);
          errorCount++;
        }
      }
      
      console.log(`📊 Batch ${Math.floor(i / batchSize) + 1} complete: ${successCount} success, ${errorCount} errors`);
    }

    // Save results - REPLACE old data
    ensureDataDir();
    const scanData = {
      timestamp: now.toISOString(),
      scanType,
      results: results,
      scanned: successCount
    };
    
    fs.writeFileSync(DATA_FILE, JSON.stringify(scanData, null, 2));

    console.log(`✅ OTM Premium Scan Complete: ${results.length} significant imbalances found`);

    return NextResponse.json({
      success: true,
      scanType,
      scanned: successCount,
      errors: errorCount,
      significant: results.length,
      timestamp: now.toISOString(),
      nextScan: scanType === 'PREMARKET' ? '12:30 PM ET' : scanType === 'MIDDAY' ? '3:44 PM ET' : '9:14 AM ET (next day)'
    });

  } catch (error) {
    console.error('OTM Premium Scanner Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
