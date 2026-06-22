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
  volume?: number | null
  open_interest?: number | null
}

// Identical scoring logic to calculatePositioningGrade in OptionsFlowTable.tsx
// 25 Expiration + 15 Contract P&L + 10 RS + 10 Combo + 10 Price Action + 15 Vol/OI + 15 Stock Reaction = 100
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
    volumeOI: 0,
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

  // 2. Contract Price Score (15 pts max) — return N/A if price not yet loaded
  if (!currentPrice || currentPrice <= 0) {
    return {
      grade: 'N/A',
      score: confidenceScore,
      color: '#9ca3af',
      breakdown: `Score: ${confidenceScore}/100\nExpiration: ${scores.expiration}/25\nContract P&L: 0/15\nRelative Strength: 0/10\nCombo Trade: 0/10\nPrice Action: 0/10\nVolume vs OI: 0/15\nStock Reaction: 0/15`,
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

  // 3. Relative Strength Score (10 pts max) — live, same as flow table
  const fillStyle = trade.fill_style || ''
  const isCall = trade.type === 'call'
  const rs = relativeStrengthData.get(trade.underlying_ticker)
  if (rs !== undefined) {
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

  // 4. Combo Trade Score (10 pts max) — live lookup
  const comboLookupKey = `${trade.underlying_ticker}-${trade.strike}-${trade.expiry}-${trade.type}-${fillStyle}`
  if (comboMap.get(comboLookupKey)) scores.combo = 10
  confidenceScore += scores.combo

  // 5. Price Action Score (10 pts max)
  const entryStockPrice = trade.spot_price
  const currentStockPrice = currentStockPrices[trade.underlying_ticker]
  const tradeTime = new Date(trade.trade_timestamp)
  const currentTime = new Date()
  const stdDev = historicalStdDevs.get(trade.underlying_ticker)

  if (currentStockPrice && entryStockPrice && stdDev) {
    const hoursElapsed = (currentTime.getTime() - tradeTime.getTime()) / (1000 * 60 * 60)
    const tradingDaysElapsed = Math.floor(hoursElapsed / 6.5)
    const stockPercentChange = ((currentStockPrice - entryStockPrice) / entryStockPrice) * 100
    const absMove = Math.abs(stockPercentChange)
    const withinStdDev = absMove <= stdDev

    if (withinStdDev) {
      if (tradingDaysElapsed >= 3) scores.priceAction = 10
      else if (tradingDaysElapsed >= 2) scores.priceAction = 8
      else if (tradingDaysElapsed >= 1) scores.priceAction = 6
      else scores.priceAction = 4
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
        if (tradingDaysElapsed >= 3) scores.priceAction = 10
        else if (tradingDaysElapsed >= 2) scores.priceAction = 8
        else if (tradingDaysElapsed >= 1) scores.priceAction = 6
        else scores.priceAction = 5
      } else {
        scores.priceAction = 4
      }
    }
  }
  confidenceScore += scores.priceAction

  // 6. Volume vs Open Interest Score (15 pts max)
  const tradeVolume = trade.volume ?? null
  const tradeOI = trade.open_interest ?? null
  if (tradeVolume !== null && tradeOI !== null && tradeOI > 0) {
    const volOIRatio = tradeVolume / tradeOI
    if (volOIRatio >= 1.5) scores.volumeOI = 15
    else if (volOIRatio >= 1.0) scores.volumeOI = 10
    else if (volOIRatio >= 0.5) scores.volumeOI = 5
    else scores.volumeOI = 0
  }
  confidenceScore += scores.volumeOI

  // 7. Stock Reaction Score (15 pts max)
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

  const breakdown = `Score: ${confidenceScore}/100\nExpiration: ${scores.expiration}/25\nContract P&L: ${scores.contractPrice}/15\nRelative Strength: ${scores.relativeStrength}/10\nCombo Trade: ${scores.combo}/10\nPrice Action: ${scores.priceAction}/10\nVolume vs OI: ${scores.volumeOI}/15\nStock Reaction: ${scores.stockReaction}/15`

  // ─────────────────────────────────────────────────────────────────────────

  return { grade, score: confidenceScore, color, breakdown }
}

// ── LEAP grading (shared, identical logic to calculateLeapGrade in OptionsFlowTable) ──
export function calculateLeapGradeShared(
  trade: FlowTrade,
  currentOptionPrices: Record<string, number>,
  currentStockPrices: Record<string, number>,
  leapRsData: Map<string, { rs5d: number; rs13d: number; rs21d: number }>,
  leap52wkData: Map<string, { high52: number; low52: number }>,
  leapSeasonalData: Map<string, { inSweetSpot: boolean; inPainPoint: boolean }>
): GradeResult {
  const expiry = trade.expiry.replace(/-/g, '').slice(2)
  const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0')
  const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'
  const normalizedTicker = normalizeTickerForOptions(trade.underlying_ticker)
  const optionTicker = `O:${normalizedTicker}${expiry}${optionType}${strikeFormatted}`
  const currentPrice = currentOptionPrices[optionTicker]
  const entryPrice = trade.premium_per_contract

  const scores = { contractPrice: 0, relativeStrength: 0, volumeOI: 0, stockReaction: 0, bonus52w: 0, seasonalBonus: 0 }

  if (!currentPrice || currentPrice <= 0) {
    return { grade: 'N/A', score: 0, color: '#9ca3af', breakdown: 'Loading prices...' }
  }

  const tradeFillStyle = trade.fill_style || ''
  const isSoldToOpen = tradeFillStyle === 'B' || tradeFillStyle === 'BB'
  const rawPct = ((currentPrice - entryPrice) / entryPrice) * 100
  const pct = isSoldToOpen ? -rawPct : rawPct

  if (pct <= -40) scores.contractPrice = -7.5
  else if (pct <= -20) scores.contractPrice = 7.5
  else if (pct <= -15) scores.contractPrice = 15
  else if (pct <= -10) scores.contractPrice = 8
  else if (pct <= 10) scores.contractPrice = 0
  else if (pct <= 20) scores.contractPrice = 3
  else scores.contractPrice = 5

  const isCall = trade.type === 'call'
  const fill = tradeFillStyle
  const isBullishFill = (isCall && (fill === 'A' || fill === 'AA')) || (!isCall && fill === 'B')
  const isBearishFill = (!isCall && (fill === 'A' || fill === 'AA')) || (isCall && fill === 'BB')

  const leapRs = leapRsData.get(trade.underlying_ticker)
  if (leapRs) {
    const { rs5d, rs13d, rs21d } = leapRs
    const weightedRS = rs5d * 0.3 + rs13d * 0.4 + rs21d * 0.3
    const aligned = (isBullishFill && weightedRS > 0) || (isBearishFill && weightedRS < 0)
    const magnitude = Math.abs(weightedRS)
    if (aligned) {
      if (magnitude >= 3) scores.relativeStrength = 30
      else if (magnitude >= 1.5) scores.relativeStrength = 20
      else scores.relativeStrength = 10
    }
  }

  const tradeVolume = trade.volume ?? null
  const tradeOI = trade.open_interest ?? null
  if (tradeVolume !== null && tradeOI !== null && tradeOI > 0) {
    const ratio = tradeVolume / tradeOI
    if (ratio >= 1.5) scores.volumeOI = 15
    else if (ratio >= 1.0) scores.volumeOI = 7.5
    else if (ratio >= 0.5) scores.volumeOI = 5
  }

  const currentStockPrice = currentStockPrices[trade.underlying_ticker]
  const entryStockPrice = trade.spot_price
  if (currentStockPrice && entryStockPrice) {
    const stockPct = ((currentStockPrice - entryStockPrice) / entryStockPrice) * 100
    const isBullishFlow = (isCall && (fill === 'A' || fill === 'AA')) || (!isCall && (fill === 'B' || fill === 'BB'))
    const isBearishFlow = (isCall && (fill === 'B' || fill === 'BB')) || (!isCall && (fill === 'A' || fill === 'AA'))
    const reversed = (isBullishFlow && stockPct <= -1.0) || (isBearishFlow && stockPct >= 1.0)
    const followed = (isBullishFlow && stockPct >= 1.0) || (isBearishFlow && stockPct <= -1.0)
    const chopped = Math.abs(stockPct) < 1.0
    const hoursElapsed = (new Date().getTime() - new Date(trade.trade_timestamp).getTime()) / (1000 * 60 * 60)
    if (hoursElapsed >= 4) {
      if (reversed) scores.stockReaction += 7.5
      else if (chopped) scores.stockReaction += 5
      else if (followed) scores.stockReaction += 2.5
      if (hoursElapsed >= 24) {
        if (reversed) scores.stockReaction += 7.5
        else if (chopped) scores.stockReaction += 5
        else if (followed) scores.stockReaction += 2.5
      }
    }
  }

  const wkRange = leap52wkData.get(trade.underlying_ticker)
  const stockNow = currentStockPrices[trade.underlying_ticker]
  if (wkRange && stockNow && stockNow > 0) {
    const nearHigh = stockNow >= wkRange.high52 * 0.98
    const nearLow = stockNow <= wkRange.low52 * 1.02
    if (isBullishFill && nearHigh) scores.bonus52w = 7.5
    else if (isBearishFill && nearLow) scores.bonus52w = 7.5
  }

  const seasonal = leapSeasonalData.get(trade.underlying_ticker)
  if (seasonal) {
    if (isBullishFill && seasonal.inSweetSpot) scores.seasonalBonus = 15
    else if (isBearishFill && seasonal.inPainPoint) scores.seasonalBonus = 15
  }

  const rawScore = scores.contractPrice + scores.relativeStrength + scores.volumeOI + scores.stockReaction + scores.bonus52w + scores.seasonalBonus
  const maxBase = 75
  const finalScore = Math.max(0, Math.min(maxBase, rawScore))
  const normalized = Math.round((finalScore / maxBase) * 100)

  let color = '#ff0000'
  if (normalized >= 85) color = '#00ff00'
  else if (normalized >= 70) color = '#84cc16'
  else if (normalized >= 50) color = '#fbbf24'
  else if (normalized >= 33) color = '#3b82f6'

  let grade = 'F'
  if (normalized >= 85) grade = 'A+'
  else if (normalized >= 80) grade = 'A'
  else if (normalized >= 75) grade = 'A-'
  else if (normalized >= 70) grade = 'B+'
  else if (normalized >= 65) grade = 'B'
  else if (normalized >= 60) grade = 'B-'
  else if (normalized >= 55) grade = 'C+'
  else if (normalized >= 50) grade = 'C'
  else if (normalized >= 48) grade = 'C-'
  else if (normalized >= 43) grade = 'D+'
  else if (normalized >= 38) grade = 'D'
  else if (normalized >= 33) grade = 'D-'

  const breakdown = `LEAP Score: ${normalized}/100\nContract P&L: ${scores.contractPrice}/15\nRelative Strength: ${scores.relativeStrength}/30\nVolume vs OI: ${scores.volumeOI}/15\nStock Reaction: ${scores.stockReaction}/15\n52w Bonus: ${scores.bonus52w}/7.5\nSeasonal Bonus: ${scores.seasonalBonus}/15`

  return { grade, score: normalized, color, breakdown }
}
