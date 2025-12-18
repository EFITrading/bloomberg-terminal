/**
 * Shared positioning grade calculator
 * Used by both OptionsFlowTable and Trading Assistant to ensure consistent grading
 */

export interface PositioningResult {
  grade: string;
  score: number;
  color: string;
  breakdown: string;
  scores: {
    expiration: number;
    contractPrice: number;
    combo: number;
    priceAction: number;
    stockReaction: number;
  };
}

export interface TradeData {
  underlying_ticker: string;
  expiry: string;
  strike: number;
  type: string;
  premium_per_contract: number;
  days_to_expiry: number;
  fill_style?: string;
  spot_price: number;
  trade_timestamp: string;
  trade_size: number;
}

export interface EnrichmentData {
  currentOptionPrices: Record<string, number>;
  currentPrices: Record<string, number>;
  historicalStdDevs: Map<string, number>;
  allTrades: TradeData[];
}

export function calculatePositioningGrade(
  trade: TradeData,
  enrichmentData: Partial<EnrichmentData>
): PositioningResult {
  const {
    currentOptionPrices = {},
    currentPrices = {},
    historicalStdDevs = new Map(),
    allTrades = []
  } = enrichmentData;

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
  // Measure stock movement 1 hour and 3 hours after trade placement
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

  return { grade, score: confidenceScore, color: scoreColor, breakdown, scores };
}
