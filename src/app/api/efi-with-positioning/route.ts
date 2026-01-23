import { NextResponse } from 'next/server';

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf';

// EXACT same EFI criteria as OptionsFlowTable.tsx
function meetsEfiCriteria(trade: any): boolean {
  // 1. Check expiration (0-35 trading days)
  if (trade.days_to_expiry < 0 || trade.days_to_expiry > 35) {
    return false;
  }

  // 2. Check premium ($100k - $450k)
  if (trade.total_premium < 100000 || trade.total_premium > 450000) {
    return false;
  }

  // 3. Check contracts (650 - 1999)
  if (trade.trade_size < 650 || trade.trade_size > 1999) {
    return false;
  }

  // 4. Check OTM status
  if (!trade.moneyness || trade.moneyness !== 'OTM') {
    return false;
  }

  return true;
}

// EXACT same positioning calculation as OptionsFlowTable.tsx
function calculatePositioningGrade(
  trade: any,
  allTrades: any[],
  currentOptionPrices: Record<string, number>,
  currentPrices: Record<string, number>,
  historicalStdDevs: Map<string, number>
): { grade: string; score: number; color: string; breakdown: string } {
  // Get option ticker for current price lookup
  const expiry = trade.expiry.replace(/-/g, '').slice(2);
  const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0');
  const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P';
  const optionTicker = `O:${trade.underlying_ticker}${expiry}${optionType}${strikeFormatted}`;
  const currentPrice = currentOptionPrices[optionTicker];
  const entryPrice = trade.premium_per_contract;

  let confidenceScore = 0;
  const scores = {
    expiration: 0,
    contractPrice: 0,
    combo: 0,
    priceAction: 0,
    stockReaction: 0
  };

  // 1. Expiration Score (25 points max)
  const daysToExpiry = trade.days_to_expiry;
  if (daysToExpiry <= 7) scores.expiration = 25;
  else if (daysToExpiry <= 14) scores.expiration = 20;
  else if (daysToExpiry <= 21) scores.expiration = 15;
  else if (daysToExpiry <= 28) scores.expiration = 10;
  else if (daysToExpiry <= 42) scores.expiration = 5;
  confidenceScore += scores.expiration;

  // 2. Contract Price Score (25 points max) - based on position P&L
  if (currentPrice && currentPrice > 0) {
    const percentChange = ((currentPrice - entryPrice) / entryPrice) * 100;

    if (percentChange <= -40) scores.contractPrice = 25;
    else if (percentChange <= -20) scores.contractPrice = 20;
    else if (percentChange >= -10 && percentChange <= 10) scores.contractPrice = 15;
    else if (percentChange >= 20) scores.contractPrice = 5;
    else scores.contractPrice = 10;
  } else {
    scores.contractPrice = 12;
  }
  confidenceScore += scores.contractPrice;

  // 3. Combo Trade Score (10 points max)
  const isCall = trade.type === 'call';
  const fillStyle = trade.fill_style || '';
  const hasComboTrade = allTrades.some(t => {
    if (t.underlying_ticker !== trade.underlying_ticker) return false;
    if (t.expiry !== trade.expiry) return false;
    if (Math.abs(t.strike - trade.strike) > trade.strike * 0.05) return false;

    const oppositeFill = t.fill_style || '';
    const oppositeType = t.type.toLowerCase();

    // Bullish combo: Calls with A/AA + Puts with B/BB
    if (isCall && (fillStyle === 'A' || fillStyle === 'AA')) {
      return oppositeType === 'put' && (oppositeFill === 'B' || oppositeFill === 'BB');
    }
    // Bearish combo: Calls with B/BB + Puts with A/AA
    if (isCall && (fillStyle === 'B' || fillStyle === 'BB')) {
      return oppositeType === 'put' && (oppositeFill === 'A' || oppositeFill === 'AA');
    }
    // For puts, reverse logic
    if (!isCall && (fillStyle === 'B' || fillStyle === 'BB')) {
      return oppositeType === 'call' && (oppositeFill === 'A' || oppositeFill === 'AA');
    }
    if (!isCall && (fillStyle === 'A' || fillStyle === 'AA')) {
      return oppositeType === 'call' && (oppositeFill === 'B' || oppositeFill === 'BB');
    }
    return false;
  });
  if (hasComboTrade) scores.combo = 10;
  confidenceScore += scores.combo;

  // Shared variables for sections 4 and 5
  const entryStockPrice = trade.spot_price;
  const currentStockPrice = currentPrices[trade.underlying_ticker];
  const tradeTime = new Date(trade.trade_timestamp);
  const currentTime = new Date();

  // 4. Price Action Score (25 points max) - Stock within standard deviation
  const stdDev = historicalStdDevs.get(trade.underlying_ticker);

  if (currentStockPrice && entryStockPrice && stdDev) {
    const hoursElapsed = (currentTime.getTime() - tradeTime.getTime()) / (1000 * 60 * 60);
    const tradingDaysElapsed = Math.floor(hoursElapsed / 6.5); // 6.5-hour trading day

    // Calculate current stock move in percentage
    const stockPercentChange = ((currentStockPrice - entryStockPrice) / entryStockPrice) * 100;
    const absMove = Math.abs(stockPercentChange);

    // Check if stock is within 1 standard deviation
    const withinStdDev = absMove <= stdDev;

    // Award points based on how many days stock stayed within std dev
    if (withinStdDev && tradingDaysElapsed >= 3) scores.priceAction = 25;
    else if (withinStdDev && tradingDaysElapsed >= 2) scores.priceAction = 20;
    else if (withinStdDev && tradingDaysElapsed >= 1) scores.priceAction = 15;
    else scores.priceAction = 10;
  } else {
    scores.priceAction = 12;
  }
  confidenceScore += scores.priceAction;

  // 5. Stock Reaction Score (15 points max)
  if (currentStockPrice && entryStockPrice) {
    const stockPercentChange = ((currentStockPrice - entryStockPrice) / entryStockPrice) * 100;

    // Determine trade direction (bullish or bearish)
    const isBullish = (isCall && (fillStyle === 'A' || fillStyle === 'AA')) ||
      (!isCall && (fillStyle === 'B' || fillStyle === 'BB'));
    const isBearish = (isCall && (fillStyle === 'B' || fillStyle === 'BB')) ||
      (!isCall && (fillStyle === 'A' || fillStyle === 'AA'));

    // Check if stock reversed against trade direction
    const reversed = (isBullish && stockPercentChange <= -1.0) ||
      (isBearish && stockPercentChange >= 1.0);
    const followed = (isBullish && stockPercentChange >= 1.0) ||
      (isBearish && stockPercentChange <= -1.0);
    const chopped = Math.abs(stockPercentChange) < 1.0;

    // Calculate time elapsed since trade
    const hoursElapsed = (currentTime.getTime() - tradeTime.getTime()) / (1000 * 60 * 60);

    // Award points based on time checkpoints
    if (hoursElapsed >= 1) {
      // 1-hour checkpoint (50% of points)
      if (reversed) scores.stockReaction += 7.5;
      else if (chopped) scores.stockReaction += 5;
      else if (followed) scores.stockReaction += 2.5;

      if (hoursElapsed >= 3) {
        // 3-hour checkpoint (remaining 50%)
        if (reversed) scores.stockReaction += 7.5;
        else if (chopped) scores.stockReaction += 5;
        else if (followed) scores.stockReaction += 2.5;
      }
    }
  }
  confidenceScore += scores.stockReaction;

  // Color code confidence score
  let scoreColor = '#ff0000'; // F = Red
  if (confidenceScore >= 85) scoreColor = '#00ff00'; // A = Bright Green
  else if (confidenceScore >= 70) scoreColor = '#84cc16'; // B = Lime Green
  else if (confidenceScore >= 50) scoreColor = '#fbbf24'; // C = Yellow
  else if (confidenceScore >= 33) scoreColor = '#3b82f6'; // D = Blue

  // Grade letter
  let grade = 'F';
  if (confidenceScore >= 85) grade = 'A+';
  else if (confidenceScore >= 80) grade = 'A';
  else if (confidenceScore >= 75) grade = 'A-';
  else if (confidenceScore >= 70) grade = 'B+';
  else if (confidenceScore >= 65) grade = 'B';
  else if (confidenceScore >= 60) grade = 'B-';
  else if (confidenceScore >= 55) grade = 'C+';
  else if (confidenceScore >= 50) grade = 'C';
  else if (confidenceScore >= 48) grade = 'C-';
  else if (confidenceScore >= 43) grade = 'D+';
  else if (confidenceScore >= 38) grade = 'D';
  else if (confidenceScore >= 33) grade = 'D-';

  // Create breakdown tooltip text
  const breakdown = `Score: ${confidenceScore}/100
Expiration: ${scores.expiration}/25
Contract P&L: ${scores.contractPrice}/25
Combo Trade: ${scores.combo}/10
Price Action: ${scores.priceAction}/25
Stock Reaction: ${scores.stockReaction}/15`;

  return { grade, score: confidenceScore, color: scoreColor, breakdown };
}

async function fetchCurrentOptionPrices(trades: any[]): Promise<Record<string, number>> {
  const pricesUpdate: Record<string, number> = {};

  console.log(`📊 Fetching current option prices for ${trades.length} EFI trades...`);

  // Batch in parallel groups of 100
  const BATCH_SIZE = 100;
  const batches = [];
  for (let i = 0; i < trades.length; i += BATCH_SIZE) {
    batches.push(trades.slice(i, i + BATCH_SIZE));
  }

  for (const batch of batches) {
    const results = await Promise.all(
      batch.map(async (trade, index) => {
        // Minimal stagger 5ms per trade in batch
        await new Promise(resolve => setTimeout(resolve, index * 5));

        try {
          const expiry = trade.expiry.replace(/-/g, '').slice(2);
          const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0');
          const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P';
          const optionTicker = `O:${trade.underlying_ticker}${expiry}${optionType}${strikeFormatted}`;

          // Use snapshot endpoint - VIX/SPX weeklies need different format
          const snapshotUrl = (trade.underlying_ticker === 'VIX' || trade.underlying_ticker === 'SPX')
            ? `https://api.polygon.io/v3/snapshot/options/I:${trade.underlying_ticker}?limit=250&apikey=${POLYGON_API_KEY}`
            : `https://api.polygon.io/v3/snapshot/options/${trade.underlying_ticker}/${optionTicker}?apikey=${POLYGON_API_KEY}`;

          const response = await fetch(snapshotUrl, {
            signal: AbortSignal.timeout(3000)
          });

          if (response.ok) {
            const data = await response.json();
            if (data.results) {
              // For VIX/SPX bulk snapshot, find the specific contract
              let result;
              if (trade.underlying_ticker === 'VIX' || trade.underlying_ticker === 'SPX') {
                result = Array.isArray(data.results)
                  ? data.results.find((r: any) => r.details?.ticker === optionTicker)
                  : data.results;
              } else {
                result = data.results;
              }

              if (result && result.last_quote) {
                const bid = result.last_quote.bid || 0;
                const ask = result.last_quote.ask || 0;
                const currentPrice = (bid + ask) / 2;

                if (currentPrice > 0) {
                  return { optionTicker, price: currentPrice };
                }
              }
            }
          }
        } catch (error) {
          // Silent fail
        }
        return null;
      })
    );

    // Aggregate results
    results.forEach(result => {
      if (result) {
        pricesUpdate[result.optionTicker] = result.price;
      }
    });
  }

  console.log(`✅ Fetched ${Object.keys(pricesUpdate).length} option prices`);
  return pricesUpdate;
}

async function fetchCurrentStockPrices(tickers: string[]): Promise<Record<string, number>> {
  const pricesUpdate: Record<string, number> = {};

  console.log(`📊 Fetching current stock prices for ${tickers.length} tickers...`);

  // Batch in parallel groups of 50
  const BATCH_SIZE = 50;
  const batches = [];
  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    batches.push(tickers.slice(i, i + BATCH_SIZE));
  }

  for (const batch of batches) {
    const results = await Promise.all(
      batch.map(async (ticker, index) => {
        // Minimal stagger 10ms per ticker in batch
        await new Promise(resolve => setTimeout(resolve, index * 10));

        try {
          const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apikey=${POLYGON_API_KEY}`;

          const response = await fetch(snapshotUrl, {
            signal: AbortSignal.timeout(3000)
          });

          if (response.ok) {
            const data = await response.json();
            if (data.ticker && data.ticker.lastTrade && data.ticker.lastTrade.p) {
              return { ticker, price: data.ticker.lastTrade.p };
            }
          }
        } catch (error) {
          // Silent fail
        }
        return null;
      })
    );

    // Aggregate results
    results.forEach(result => {
      if (result) {
        pricesUpdate[result.ticker] = result.price;
      }
    });
  }

  console.log(`✅ Fetched ${Object.keys(pricesUpdate).length} stock prices`);
  return pricesUpdate;
}

async function calculateHistoricalStdDevs(tickers: string[]): Promise<Map<string, number>> {
  const stdDevs = new Map<string, number>();

  console.log(`📊 Calculating historical std devs for ${tickers.length} tickers...`);

  // Batch in parallel groups of 50
  const BATCH_SIZE = 50;
  const batches = [];
  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    batches.push(tickers.slice(i, i + BATCH_SIZE));
  }

  for (const batch of batches) {
    const results = await Promise.all(
      batch.map(async (ticker, index) => {
        // Minimal stagger 10ms per ticker in batch
        await new Promise(resolve => setTimeout(resolve, index * 10));

        try {
          const endDate = new Date();
          const startDate = new Date();
          startDate.setMonth(startDate.getMonth() - 1);

          const formattedEnd = endDate.toISOString().split('T')[0];
          const formattedStart = startDate.toISOString().split('T')[0];

          const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${formattedStart}/${formattedEnd}?adjusted=true&sort=asc&limit=50000&apikey=${POLYGON_API_KEY}`;

          const response = await fetch(url, {
            signal: AbortSignal.timeout(3000)
          });

          if (response.ok) {
            const data = await response.json();
            if (data.results && data.results.length > 1) {
              const returns = [];
              for (let i = 1; i < data.results.length; i++) {
                const prevClose = data.results[i - 1].c;
                const currClose = data.results[i].c;
                const dailyReturn = ((currClose - prevClose) / prevClose) * 100;
                returns.push(dailyReturn);
              }

              const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
              const variance = returns.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / returns.length;
              const stdDev = Math.sqrt(variance);

              return { ticker, stdDev };
            }
          }
        } catch (error) {
          // Silent fail
        }
        return null;
      })
    );

    // Aggregate results
    results.forEach(result => {
      if (result) {
        stdDevs.set(result.ticker, result.stdDev);
      }
    });
  }

  console.log(`✅ Calculated ${stdDevs.size} std devs`);
  return stdDevs;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker');

    if (!ticker) {
      return NextResponse.json({ error: 'Ticker required' }, { status: 400 });
    }

    // Fetch raw trades from the options flow API
    const flowResponse = await fetch(`${request.headers.get('origin') || 'http://localhost:3000'}/api/stream-options-flow?ticker=${ticker}`);

    if (!flowResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch options flow' }, { status: 500 });
    }

    // Parse the streaming response
    const reader = flowResponse.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let allTrades: any[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'complete' && data.trades) {
              allTrades = data.trades;
              break;
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }

      if (allTrades.length > 0) break;
    }

    // Filter for EFI trades only
    const efiTrades = allTrades.filter(meetsEfiCriteria);

    if (efiTrades.length === 0) {
      return NextResponse.json({ trades: [], message: 'No EFI trades found' });
    }

    // Get unique tickers for stock prices
    const uniqueTickers = [...new Set(efiTrades.map(t => t.underlying_ticker))];

    // Fetch all required data in parallel
    const [currentOptionPrices, currentPrices, historicalStdDevs] = await Promise.all([
      fetchCurrentOptionPrices(efiTrades),
      fetchCurrentStockPrices(uniqueTickers),
      calculateHistoricalStdDevs(uniqueTickers)
    ]);

    // Calculate positioning for each EFI trade
    const tradesWithPositioning = efiTrades.map(trade => {
      const positioning = calculatePositioningGrade(
        trade,
        efiTrades,
        currentOptionPrices,
        currentPrices,
        historicalStdDevs
      );

      // Add current prices to trade data
      const expiry = trade.expiry.replace(/-/g, '').slice(2);
      const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0');
      const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P';
      const optionTicker = `O:${trade.underlying_ticker}${expiry}${optionType}${strikeFormatted}`;

      return {
        ...trade,
        current_option_price: currentOptionPrices[optionTicker] || trade.premium_per_contract,
        current_stock_price: currentPrices[trade.underlying_ticker] || trade.spot_price,
        positioning
      };
    });

    return NextResponse.json({
      trades: tradesWithPositioning,
      count: tradesWithPositioning.length
    });

  } catch (error) {
    console.error('EFI API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
