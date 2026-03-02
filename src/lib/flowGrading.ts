const normalizeTickerForOptions = (ticker: string): string => ticker.replace(/\./g, '')

export interface GradeResult {
  grade: string
  score: number
  color: string
  breakdown: string
}

interface FlowTrade {
  underlying_ticker: string
  strike: number
  expiry: string
  type: 'call' | 'put'
  premium_per_contract: number
  spot_price: number
  trade_timestamp: string
  days_to_expiry: number
  fill_style?: string
}

export function calculateFlowGrade(
  trade: FlowTrade,
  currentOptionPrices: Record<string, number>,
  currentStockPrices: Record<string, number>,
  relativeStrengthData: Map<string, number>,
  historicalStdDevs: Map<string, number>,
  comboMap: Map<string, boolean>
): GradeResult {
  const expiry = trade.expiry.replace(/-/g, '').slice(2)
  const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0')
  const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'
  const normalizedTicker = normalizeTickerForOptions(trade.underlying_ticker)
  const optionTicker = `O:${normalizedTicker}${expiry}${optionType}${strikeFormatted}`
  const currentPrice = currentOptionPrices[optionTicker]
  const entryPrice = trade.premium_per_contract

  let confidenceScore = 0
  const scores = {
    expiration: 0,
    contractPrice: 0,
    relativeStrength: 0,
    combo: 0,
    priceAction: 0,
    stockReaction: 0,
  }

  // 1. Expiration Score (25 pts)
  const daysToExpiry = trade.days_to_expiry
  if (daysToExpiry <= 7) scores.expiration = 25
  else if (daysToExpiry <= 14) scores.expiration = 20
  else if (daysToExpiry <= 21) scores.expiration = 15
  else if (daysToExpiry <= 28) scores.expiration = 10
  else if (daysToExpiry <= 42) scores.expiration = 5
  confidenceScore += scores.expiration

  // 2. Contract Price Score (15 pts)
  if (!currentPrice || currentPrice <= 0) {
    return {
      grade: 'N/A',
      score: confidenceScore,
      color: '#9ca3af',
      breakdown: `Score: ${confidenceScore}/100\nExpiration: ${scores.expiration}/25\nContract P&L: 0/15\nRelative Strength: 0/10\nCombo Trade: 0/10\nPrice Action: 0/25\nStock Reaction: 0/15`,
    }
  }

  const rawPercentChange = ((currentPrice - entryPrice) / entryPrice) * 100
  const tradeFillStyle = trade.fill_style || ''
  const isSoldToOpen = tradeFillStyle === 'B' || tradeFillStyle === 'BB'
  const percentChange = isSoldToOpen ? -rawPercentChange : rawPercentChange

  if (percentChange <= -40) scores.contractPrice = 15
  else if (percentChange <= -20) scores.contractPrice = 12
  else if (percentChange >= -10 && percentChange <= 10) scores.contractPrice = 10
  else if (percentChange >= 20) scores.contractPrice = 3
  else scores.contractPrice = 6
  confidenceScore += scores.contractPrice

  // 3. Relative Strength Score (10 pts)
  const rs = relativeStrengthData.get(trade.underlying_ticker)
  if (rs !== undefined) {
    const fillStyle = trade.fill_style || ''
    const isCall = trade.type === 'call'
    const isBullishFlow =
      (isCall && (fillStyle === 'A' || fillStyle === 'AA')) ||
      (!isCall && (fillStyle === 'B' || fillStyle === 'BB'))
    const isBearishFlow =
      (isCall && (fillStyle === 'B' || fillStyle === 'BB')) ||
      (!isCall && (fillStyle === 'A' || fillStyle === 'AA'))
    const aligned = (isBullishFlow && rs > 0) || (isBearishFlow && rs < 0)
    if (aligned) scores.relativeStrength = 10
  }
  confidenceScore += scores.relativeStrength

  // 4. Combo Trade Score (10 pts)
  const fillStyle = trade.fill_style || ''
  const comboLookupKey = `${trade.underlying_ticker}-${trade.strike}-${trade.expiry}-${trade.type}-${fillStyle}`
  if (comboMap.get(comboLookupKey)) scores.combo = 10
  confidenceScore += scores.combo

  // 5. Price Action Score (25 pts)
  const entryStockPrice = trade.spot_price
  const currentStockPrice = currentStockPrices[trade.underlying_ticker]
  const tradeTime = new Date(trade.trade_timestamp)
  const currentTime = new Date()
  const isCall = trade.type === 'call'
  const stdDev = historicalStdDevs.get(trade.underlying_ticker)

  if (currentStockPrice && entryStockPrice && stdDev) {
    const hoursElapsed = (currentTime.getTime() - tradeTime.getTime()) / (1000 * 60 * 60)
    const tradingDaysElapsed = Math.floor(hoursElapsed / 6.5)
    const stockPercentChange = ((currentStockPrice - entryStockPrice) / entryStockPrice) * 100
    const absMove = Math.abs(stockPercentChange)
    const withinStdDev = absMove <= stdDev

    if (withinStdDev) {
      if (tradingDaysElapsed >= 3) scores.priceAction = 25
      else if (tradingDaysElapsed >= 2) scores.priceAction = 20
      else if (tradingDaysElapsed >= 1) scores.priceAction = 15
      else scores.priceAction = 10
    } else {
      const isBullishFlow =
        (isCall && (fillStyle === 'A' || fillStyle === 'AA')) ||
        (!isCall && (fillStyle === 'B' || fillStyle === 'BB'))
      const isBearishFlow =
        (isCall && (fillStyle === 'B' || fillStyle === 'BB')) ||
        (!isCall && (fillStyle === 'A' || fillStyle === 'AA'))
      const isReversalBet =
        (stockPercentChange < -stdDev && isBullishFlow) ||
        (stockPercentChange > stdDev && isBearishFlow)
      if (isReversalBet) {
        if (tradingDaysElapsed >= 3) scores.priceAction = 25
        else if (tradingDaysElapsed >= 2) scores.priceAction = 20
        else if (tradingDaysElapsed >= 1) scores.priceAction = 15
        else scores.priceAction = 12
      } else {
        scores.priceAction = 10
      }
    }
  }
  confidenceScore += scores.priceAction

  // 6. Stock Reaction Score (15 pts)
  if (currentStockPrice && entryStockPrice) {
    const stockPercentChange = ((currentStockPrice - entryStockPrice) / entryStockPrice) * 100
    const isBullish =
      (isCall && (fillStyle === 'A' || fillStyle === 'AA')) ||
      (!isCall && (fillStyle === 'B' || fillStyle === 'BB'))
    const isBearish =
      (isCall && (fillStyle === 'B' || fillStyle === 'BB')) ||
      (!isCall && (fillStyle === 'A' || fillStyle === 'AA'))
    const reversed =
      (isBullish && stockPercentChange <= -1.0) || (isBearish && stockPercentChange >= 1.0)
    const followed =
      (isBullish && stockPercentChange >= 1.0) || (isBearish && stockPercentChange <= -1.0)
    const chopped = Math.abs(stockPercentChange) < 1.0
    const hoursElapsed = (currentTime.getTime() - tradeTime.getTime()) / (1000 * 60 * 60)

    if (hoursElapsed >= 1) {
      if (reversed) scores.stockReaction += 7.5
      else if (chopped) scores.stockReaction += 5
      else if (followed) scores.stockReaction += 2.5
      if (hoursElapsed >= 3) {
        if (reversed) scores.stockReaction += 7.5
        else if (chopped) scores.stockReaction += 5
        else if (followed) scores.stockReaction += 2.5
      }
    }
  }
  confidenceScore += scores.stockReaction

  // Color
  let color = '#ff0000'
  if (confidenceScore >= 85) color = '#00ff00'
  else if (confidenceScore >= 70) color = '#84cc16'
  else if (confidenceScore >= 50) color = '#fbbf24'
  else if (confidenceScore >= 33) color = '#3b82f6'

  // Grade letter
  let grade = 'F'
  if (confidenceScore >= 85) grade = 'A+'
  else if (confidenceScore >= 80) grade = 'A'
  else if (confidenceScore >= 75) grade = 'A-'
  else if (confidenceScore >= 70) grade = 'B+'
  else if (confidenceScore >= 65) grade = 'B'
  else if (confidenceScore >= 60) grade = 'B-'
  else if (confidenceScore >= 55) grade = 'C+'
  else if (confidenceScore >= 50) grade = 'C'
  else if (confidenceScore >= 48) grade = 'C-'
  else if (confidenceScore >= 43) grade = 'D+'
  else if (confidenceScore >= 38) grade = 'D'
  else if (confidenceScore >= 33) grade = 'D-'

  const breakdown = `Score: ${confidenceScore}/100\nExpiration: ${scores.expiration}/25\nContract P&L: ${scores.contractPrice}/15\nRelative Strength: ${scores.relativeStrength}/10\nCombo Trade: ${scores.combo}/10\nPrice Action: ${scores.priceAction}/25\nStock Reaction: ${scores.stockReaction}/15`

  return { grade, score: confidenceScore, color, breakdown }
}
