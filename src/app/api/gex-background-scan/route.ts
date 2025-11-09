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

const DATA_FILE = path.join(process.cwd(), 'data', 'gex-scan', 'latest.json');

// Ensure data directory exists
function ensureDataDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

interface GEXResult {
  ticker: string;
  currentPrice: number;
  attractionZone: number;
  strength: number;
  pressureScore: number;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  totalGEX: number;
  scanType: 'OPEN' | 'CLOSE';
}

// Simplified GEX calculation for background scanning
async function calculateQuickGEX(ticker: string): Promise<GEXResult | null> {
  try {
    // Get current price
    const quoteResponse = await fetch(
      `https://api.polygon.io/v2/last/trade/${ticker}?apiKey=${POLYGON_API_KEY}`
    );
    const quoteData = await quoteResponse.json();
    
    if (!quoteData.results) return null;
    const currentPrice = quoteData.results.p;

    // Get options chain for next 45 days
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 45);
    
    const optionsResponse = await fetch(
      `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&expiration_date.gte=${new Date().toISOString().split('T')[0]}&expiration_date.lte=${endDate.toISOString().split('T')[0]}&limit=1000&apiKey=${POLYGON_API_KEY}`
    );
    const optionsData = await optionsResponse.json();
    
    if (!optionsData.results || optionsData.results.length === 0) return null;

    // Calculate GEX by strike
    const gexByStrike = new Map<number, { totalGEX: number; netGEX: number }>();
    
    for (const option of optionsData.results) {
      const strike = option.strike_price;
      
      if (!gexByStrike.has(strike)) {
        gexByStrike.set(strike, { totalGEX: 0, netGEX: 0 });
      }
      
      const current = gexByStrike.get(strike)!;
      
      // Simplified GEX calculation (using contract count as proxy for OI)
      const gexValue = Math.abs(strike - currentPrice) * 100;
      
      if (option.contract_type === 'call') {
        current.totalGEX += gexValue;
        current.netGEX += gexValue;
      } else {
        current.totalGEX += gexValue;
        current.netGEX -= gexValue;
      }
    }

    // Find largest GEX cluster (attraction zone)
    let maxGEX = 0;
    let attractionZone = currentPrice;
    let totalGEX = 0;
    
    gexByStrike.forEach((value, strike) => {
      totalGEX += value.totalGEX;
      if (value.totalGEX > maxGEX) {
        maxGEX = value.totalGEX;
        attractionZone = strike;
      }
    });

    // Calculate strength and pressure
    const distance = Math.abs(currentPrice - attractionZone);
    const strength = Math.min(100, (maxGEX / totalGEX) * 100);
    const pressureScore = distance / currentPrice * 100;
    
    const direction = attractionZone > currentPrice ? 'BULLISH' : 
                      attractionZone < currentPrice ? 'BEARISH' : 'NEUTRAL';

    return {
      ticker,
      currentPrice,
      attractionZone,
      strength,
      pressureScore,
      direction,
      totalGEX,
      scanType: 'OPEN' // Will be set by caller
    };

  } catch (error) {
    console.error(`Error calculating GEX for ${ticker}:`, error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const scanType = searchParams.get('type') as 'OPEN' | 'CLOSE' || 'OPEN';
    const manualRun = searchParams.get('manual') === 'true';

    console.log(`🔍 Starting GEX Background Scan: ${scanType} (Manual: ${manualRun})`);

    const now = new Date();
    const currentTime = now.toLocaleTimeString('en-US', { 
      hour12: false, 
      timeZone: 'America/New_York' 
    });

    // Check if it's the right time (9:47 AM ET or 3:43 PM ET)
    if (!manualRun) {
      const hour = parseInt(currentTime.split(':')[0]);
      const minute = parseInt(currentTime.split(':')[1]);
      
      const isOpenTime = hour === 9 && minute === 47;
      const isCloseTime = hour === 15 && minute === 43;
      
      if (!isOpenTime && !isCloseTime) {
        return NextResponse.json({
          success: false,
          error: 'Not scheduled scan time',
          nextScan: 'Next scan: 9:47 AM ET or 3:43 PM ET'
        });
      }
    }

    const results: GEXResult[] = [];
    let successCount = 0;
    let errorCount = 0;

    // Scan stocks in batches
    const batchSize = 5;
    for (let i = 0; i < Math.min(TOP_1000_SYMBOLS.length, 100); i += batchSize) {
      const batch = TOP_1000_SYMBOLS.slice(i, i + batchSize);
      
      for (const symbol of batch) {
        try {
          const gexData = await calculateQuickGEX(symbol);
          
          if (gexData) {
            gexData.scanType = scanType;
            results.push(gexData);
            successCount++;
            
            console.log(`✅ ${symbol}: Attraction ${gexData.attractionZone}, Strength ${gexData.strength.toFixed(1)}%`);
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

    // Save results - REPLACE old data, don't append
    ensureDataDir();
    const scanData = {
      timestamp: now.toISOString(),
      scanType,
      results: results.filter(r => r.strength >= 40), // Only save significant attractions
      scanned: successCount
    };
    
    fs.writeFileSync(DATA_FILE, JSON.stringify(scanData, null, 2));

    console.log(`✅ GEX Scan Complete: ${results.length} stocks with valid GEX data (${scanData.results.length} significant)`);

    return NextResponse.json({
      success: true,
      scanType,
      scanned: successCount,
      errors: errorCount,
      significant: scanData.results.length,
      timestamp: now.toISOString(),
      nextScan: scanType === 'OPEN' ? '3:43 PM ET' : '9:47 AM ET (next day)'
    });

  } catch (error) {
    console.error('GEX Scanner Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
