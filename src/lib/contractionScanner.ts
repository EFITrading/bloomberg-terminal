interface ContractionResult {
  symbol: string
  currentPrice: number
  change: number
  changePercent: number
  period: '5-DAY' | '13-DAY'
  averageVolume: number
  currentVolume: number
  volumeRatio: number
  atr: number
  contractionScore: number
  contractionLevel: 'EXTREME' | 'HIGH' | 'MODERATE'
  daysSinceHigh: number
  daysSinceLow: number
  pricePosition: number
  squeezeStatus: 'ON' | 'OFF'
  squeezeBarsCount: number
  contractionPercent: number // Price range contraction %
  // Diagnostic fields for non-qualifying tickers
  qualifies?: boolean
  failReason?: string
  actualCompression?: number
  requiredCompression?: number
  isSideways?: boolean
  netMovePercent?: number
  isAtExtremes?: boolean
  hasExpanded?: boolean
}

interface HistoricalBar {
  c: number // close
  h: number // high
  l: number // low
  v: number // volume
  t: number // timestamp
}

class ContractionScanner {
  private readonly API_KEY = process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''
  private readonly CONCURRENT_REQUESTS = 8
  private readonly REQUEST_DELAY = 30

  /**
   * Calculate Average True Range (ATR) for volatility measurement
   */
  private calculateATR(bars: HistoricalBar[], period: number = 14): number {
    if (bars.length < period + 1) return 0

    const trueRanges: number[] = []
    for (let i = 1; i < bars.length; i++) {
      const high = bars[i].h
      const low = bars[i].l
      const prevClose = bars[i - 1].c

      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose))
      trueRanges.push(tr)
    }

    const recentTR = trueRanges.slice(-period)
    return recentTR.reduce((sum, tr) => sum + tr, 0) / recentTR.length
  }

  /**
   * Calculate EMA (Exponential Moving Average)
   */
  private calculateEMA(values: number[], period: number): number {
    if (values.length < period) return 0

    const multiplier = 2 / (period + 1)
    let ema = values.slice(0, period).reduce((sum, val) => sum + val, 0) / period

    for (let i = period; i < values.length; i++) {
      ema = (values[i] - ema) * multiplier + ema
    }

    return ema
  }

  /**
   * Calculate Bollinger Bands (20-period SMA, ±2 std dev)
   */
  private calculateBollingerBands(
    bars: HistoricalBar[],
    period: number = 20
  ): { upper: number; lower: number; middle: number } {
    if (bars.length < period) return { upper: 0, lower: 0, middle: 0 }

    const closes = bars.slice(-period).map((b) => b.c)

    // Calculate SMA (middle band)
    const sma = closes.reduce((sum, c) => sum + c, 0) / closes.length

    // Calculate standard deviation
    const squaredDiffs = closes.map((c) => Math.pow(c - sma, 2))
    const variance = squaredDiffs.reduce((sum, sd) => sum + sd, 0) / closes.length
    const stdDev = Math.sqrt(variance)

    return {
      upper: sma + 2 * stdDev,
      lower: sma - 2 * stdDev,
      middle: sma,
    }
  }

  /**
   * Calculate Keltner Channels (20-period EMA, ±1.5 × ATR)
   */
  private calculateKeltnerChannels(
    bars: HistoricalBar[],
    period: number = 20,
    atrMultiplier: number = 1.5
  ): { upper: number; lower: number; middle: number } {
    if (bars.length < period) return { upper: 0, lower: 0, middle: 0 }

    const closes = bars.slice(-period).map((b) => b.c)
    const ema = this.calculateEMA(closes, period)
    const atr = this.calculateATR(bars, period)

    return {
      upper: ema + atrMultiplier * atr,
      lower: ema - atrMultiplier * atr,
      middle: ema,
    }
  }

  /**
   * TTM Squeeze Detection: Check if Bollinger Bands are inside Keltner Channels
   * Squeeze ON = BB upper < KC upper AND BB lower > KC lower
   */
  private detectTTMSqueeze(
    bars: HistoricalBar[],
    period: number = 20
  ): { squeezeOn: boolean; bandwidth: number } {
    if (bars.length < period) return { squeezeOn: false, bandwidth: 0 }

    const bb = this.calculateBollingerBands(bars, period)
    const kc = this.calculateKeltnerChannels(bars, period)

    // Squeeze is ON when Bollinger Bands are completely inside Keltner Channels
    const squeezeOn = bb.upper < kc.upper && bb.lower > kc.lower

    // Calculate bandwidth compression
    const bandwidth = ((bb.upper - bb.lower) / bb.middle) * 100

    return { squeezeOn, bandwidth }
  }

  /**
   * Check if recent bars show expansion (breakout already happened)
   * Returns true if last 2 bars have significantly larger ranges than recent average
   */
  private hasRecentExpansion(bars: HistoricalBar[], lookback: number = 10): boolean {
    if (bars.length < lookback + 2) return false

    // Get last 2 bars
    const lastBar = bars[bars.length - 1]
    const secondLastBar = bars[bars.length - 2]

    const lastRange = lastBar.h - lastBar.l
    const secondLastRange = secondLastBar.h - secondLastBar.l

    // Calculate average range of previous bars (excluding last 2)
    const previousBars = bars.slice(-(lookback + 2), -2)
    const avgRange = previousBars.reduce((sum, b) => sum + (b.h - b.l), 0) / previousBars.length

    if (avgRange === 0) return false

    // If either of last 2 bars is 1.5x+ larger than average, it's an expansion
    const expansionThreshold = 1.5
    return (
      lastRange > avgRange * expansionThreshold || secondLastRange > avgRange * expansionThreshold
    )
  }

  /**
   * Calculate contraction score based on how tight the squeeze is
   * Lower bandwidth = tighter squeeze = higher score
   */
  private calculateContractionScore(bars: HistoricalBar[], period: number = 20): number {
    if (bars.length < period) return 0

    const squeeze = this.detectTTMSqueeze(bars, period)
    if (!squeeze.squeezeOn) return 0

    // Invert bandwidth - lower bandwidth = higher score
    // Multiply by 100 to get reasonable numbers
    const score = (1 / squeeze.bandwidth) * 100
    return Math.round(score * 100) / 100 // Round to 2 decimals
  }

  /**
   * Calculate price range contraction percentage over N days
   * Returns % of how much current range is narrower than average
   */
  private calculatePriceContraction(bars: HistoricalBar[], days: number): number {
    if (bars.length < days) return 0

    const recentBars = bars.slice(-days)
    const ranges = recentBars.map((b) => b.h - b.l)
    const avgRange = ranges.reduce((sum, r) => sum + r, 0) / ranges.length
    const currentRange = ranges[ranges.length - 1]

    if (avgRange === 0) return 0

    const contractionPercent = ((avgRange - currentRange) / avgRange) * 100
    return Math.round(contractionPercent * 100) / 100
  }

  /**
   * Calculate historical volatility: average N-day price move over lookback period
   * Used to establish dynamic threshold for "big move" detection
   */
  private calculateHistoricalVolatility(
    bars: HistoricalBar[],
    moveDays: number,
    lookbackDays: number
  ): number {
    if (bars.length < lookbackDays) return 0

    const recentBars = bars.slice(-lookbackDays)
    const moves: number[] = []

    // Calculate rolling N-day moves
    for (let i = moveDays; i < recentBars.length; i++) {
      const startBar = recentBars[i - moveDays]
      const endBar = recentBars[i]

      const high = Math.max(...recentBars.slice(i - moveDays, i + 1).map((b) => b.h))
      const low = Math.min(...recentBars.slice(i - moveDays, i + 1).map((b) => b.l))

      const movePercent = ((high - low) / low) * 100
      moves.push(movePercent)
    }

    if (moves.length === 0) return 0

    const avgMove = moves.reduce((sum, m) => sum + m, 0) / moves.length
    return avgMove
  }

  /**
   * Detect consolidation: Price trading in TIGHT range NOW (hasn't broken out yet)
   * Returns how tight the consolidation is (higher % = tighter)
   *
   * Simple logic:
   * 1. Look at recent N days
   * 2. Is price range tight compared to stock's normal volatility?
   * 3. Is price oscillating sideways (not trending)?
   * 4. Current bar still tight (not expanding)?
   */
  private detectPivotSetup(
    bars: HistoricalBar[],
    days: number
  ): { qualifies: boolean; contractionPercent: number; movePercent: number } {
    if (bars.length < 120) return { qualifies: false, contractionPercent: 0, movePercent: 0 }

    const lookbackBars = bars.slice(-days)
    if (lookbackBars.length < days)
      return { qualifies: false, contractionPercent: 0, movePercent: 0 }

    // Calculate stock's normal volatility over 120-day baseline (was 60 — too short)
    const avgHistoricalMove = this.calculateHistoricalVolatility(bars, days, 120)
    if (avgHistoricalMove === 0) return { qualifies: false, contractionPercent: 0, movePercent: 0 }
    // Reject low-beta stocks that are perpetually in "contraction" vs their own tiny baseline.
    // Require the 120-bar avg 4D range to be at least 3.0% — this filters VZ/T/utilities
    // (VZ avg 4D move ~1.8-2.5%, needs to be 3%+ to be worth trading a coil)
    if (avgHistoricalMove < 3.0) return { qualifies: false, contractionPercent: 0, movePercent: 0 }

    // Reject low-beta stocks by average single-day H-L range over last 20 bars.
    // VZ avg daily range ~1.92% — stocks this slow are never worth trading a coil.
    // Require average daily candle >= 2.0% to qualify.
    const last20 = bars.slice(-20)
    const avgDailyRangePct =
      last20.reduce((sum, b) => sum + ((b.h - b.l) / b.l) * 100, 0) / last20.length
    if (avgDailyRangePct < 2.0) return { qualifies: false, contractionPercent: 0, movePercent: 0 }

    // Current N-day price range
    const high = Math.max(...lookbackBars.map((b) => b.h))
    const low = Math.min(...lookbackBars.map((b) => b.l))
    const currentRange = high - low
    const currentRangePercent = (currentRange / low) * 100

    // How tight vs normal (higher = tighter = better coil)
    const compressionPercent = ((avgHistoricalMove - currentRangePercent) / avgHistoricalMove) * 100

    // Net move check: must be < 80% of range (allows drifting coils, rejects pure vertical moves)
    const startPrice = lookbackBars[0].c
    const endPrice = lookbackBars[lookbackBars.length - 1].c
    const netMove = Math.abs(endPrice - startPrice)
    const notTrending = currentRange > 0 ? netMove / currentRange < 0.8 : false

    // Last bar must still be contained (not already exploding out)
    const currentBar = lookbackBars[lookbackBars.length - 1]
    const currentBarRange = currentBar.h - currentBar.l
    const avgBarRange = lookbackBars.reduce((sum, b) => sum + (b.h - b.l), 0) / lookbackBars.length
    const currentBarTight = avgBarRange > 0 && currentBarRange <= avgBarRange * 2.0

    const qualifies = compressionPercent > 30 && notTrending && currentBarTight

    return {
      qualifies,
      contractionPercent: compressionPercent,
      movePercent: currentRangePercent,
    }
  }

  /**
   * Calculate TTM Squeeze status for specified period
   * Returns squeeze status and how long it's been on
   */
  private calculateContraction(
    bars: HistoricalBar[],
    days: number
  ): { squeezeStatus: 'ON' | 'OFF'; squeezeBarsCount: number; bandwidth: number } {
    const period = 20 // TTM uses 20-period for calculations

    if (bars.length < period * 2) return { squeezeStatus: 'OFF', squeezeBarsCount: 0, bandwidth: 0 }

    // Check if recent expansion occurred (breakout already happened)
    if (this.hasRecentExpansion(bars, 10)) {
      return { squeezeStatus: 'OFF', squeezeBarsCount: 0, bandwidth: 0 }
    }

    // Get current TTM Squeeze status
    const current = this.detectTTMSqueeze(bars, period)

    // If squeeze is not ON, return OFF
    if (!current.squeezeOn) {
      return { squeezeStatus: 'OFF', squeezeBarsCount: 0, bandwidth: current.bandwidth }
    }

    return {
      squeezeStatus: 'ON',
      squeezeBarsCount: 0, // Will be calculated separately
      bandwidth: current.bandwidth,
    }
  }

  /**
   * Calculate price position within recent range (0-100%)
   */
  private calculatePricePosition(bars: HistoricalBar[], lookback: number = 20): number {
    if (bars.length < lookback) return 50

    const recentBars = bars.slice(-lookback)
    const currentPrice = bars[bars.length - 1].c
    const high = Math.max(...recentBars.map((b) => b.h))
    const low = Math.min(...recentBars.map((b) => b.l))

    if (high === low) return 50

    return ((currentPrice - low) / (high - low)) * 100
  }

  /**
   * Find days since high/low
   */
  private findDaysSinceExtremes(
    bars: HistoricalBar[],
    lookback: number = 20
  ): {
    daysSinceHigh: number
    daysSinceLow: number
  } {
    if (bars.length < lookback) {
      return { daysSinceHigh: 0, daysSinceLow: 0 }
    }

    const recentBars = bars.slice(-lookback)
    const currentPrice = bars[bars.length - 1].c

    let highIdx = 0
    let lowIdx = 0
    let highPrice = recentBars[0].h
    let lowPrice = recentBars[0].l

    for (let i = 0; i < recentBars.length; i++) {
      if (recentBars[i].h > highPrice) {
        highPrice = recentBars[i].h
        highIdx = i
      }
      if (recentBars[i].l < lowPrice) {
        lowPrice = recentBars[i].l
        lowIdx = i
      }
    }

    return {
      daysSinceHigh: recentBars.length - highIdx - 1,
      daysSinceLow: recentBars.length - lowIdx - 1,
    }
  }

  /**
   * Get historical data for a symbol with specific timeframe
   * Note: days parameter is CALENDAR days, but returned bars are TRADING bars only
   */
  private async getHistoricalData(
    symbol: string,
    days: number = 120,
    timeframe: 'hour' | 'day' = 'day',
    multiplier: number = 1
  ): Promise<HistoricalBar[]> {
    try {
      const to = new Date()
      const from = new Date()
      from.setDate(from.getDate() - days)

      const fromStr = from.toISOString().split('T')[0]
      const toStr = to.toISOString().split('T')[0]

      const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/${multiplier}/${timeframe}/${fromStr}/${toStr}?adjusted=true&sort=asc&apiKey=${this.API_KEY}`

      const response = await fetch(url)
      if (!response.ok) {
        return []
      }

      const data = await response.json()

      if (!data.results || data.results.length === 0) {
        return []
      }

      return data.results
    } catch (error) {
      console.error(`Error fetching historical data for ${symbol}:`, error)
      return []
    }
  }

  /**
   * Analyze a single symbol for TTM Squeeze on DAILY bars
   * 4-DAY: Same period as ConsolidationHistoryScreener
   */
  private async analyzeSymbol(symbol: string): Promise<ContractionResult[]> {
    try {
      // Fetch DAILY bars — need 250 calendar days for 120-bar baseline + lookback
      const bars = await this.getHistoricalData(symbol, 250, 'day', 1)

      if (bars.length < 120) {
        return []
      }

      const currentBar = bars[bars.length - 1]
      const prevBar = bars[bars.length - 2]
      const currentPrice = currentBar.c
      const change = currentPrice - prevBar.c
      const changePercent = (change / prevBar.c) * 100

      // 4-day pivot setup — matches ConsolidationHistoryScreener exactly
      const pivot4D = this.detectPivotSetup(bars, 4)
      const squeeze4D = this.calculateContraction(bars, 4)
      const atr = this.calculateATR(bars)

      const pricePosition = this.calculatePricePosition(bars)
      const { daysSinceHigh, daysSinceLow } = this.findDaysSinceExtremes(bars)
      const tightnessScore = this.calculateContractionScore(bars, 20)

      // Calculate detailed diagnostics
      const lookbackBars = bars.slice(-4)
      const startPrice = lookbackBars[0].c
      const endPrice = lookbackBars[lookbackBars.length - 1].c
      const high = Math.max(...lookbackBars.map((b) => b.h))
      const low = Math.min(...lookbackBars.map((b) => b.l))
      const currentRange = high - low
      const netMove = Math.abs(endPrice - startPrice)
      const netMovePercent = currentRange > 0 ? (netMove / currentRange) * 100 : 100
      const notTrending = currentRange > 0 ? netMove / currentRange < 0.8 : false
      const hasExpanded = this.hasRecentExpansion(bars, 10)

      let failReason = ''
      if (!pivot4D.qualifies) {
        if (pivot4D.contractionPercent < 30) {
          failReason = `Not tight enough (${pivot4D.contractionPercent.toFixed(1)}% vs 30% required)`
        } else if (!notTrending) {
          failReason = `Trending (net move ${netMovePercent.toFixed(1)}% of range, need <80%)`
        } else if (hasExpanded) {
          failReason = 'Already expanding/breaking out'
        } else {
          failReason = 'Last bar too wide'
        }
      }

      const result: ContractionResult = {
        symbol,
        currentPrice,
        change,
        changePercent,
        period: '4-DAY',
        averageVolume: 0,
        currentVolume: currentBar.v,
        volumeRatio: 0,
        atr,
        contractionScore: tightnessScore,
        contractionLevel:
          tightnessScore >= 200 ? 'EXTREME' : tightnessScore >= 100 ? 'HIGH' : 'MODERATE',
        daysSinceHigh,
        daysSinceLow,
        pricePosition,
        squeezeStatus: squeeze4D.squeezeStatus,
        squeezeBarsCount: tightnessScore,
        contractionPercent: pivot4D.contractionPercent,
        qualifies: pivot4D.qualifies,
        failReason: pivot4D.qualifies ? undefined : failReason,
        actualCompression: pivot4D.contractionPercent,
        requiredCompression: 30,
        isSideways: notTrending,
        netMovePercent,
        isAtExtremes: false,
        hasExpanded,
      }

      return [result]
    } catch (error) {
      console.error(`Error analyzing ${symbol}:`, error)
      return []
    }
  }

  /**
   * Determine contraction level based on TTM Squeeze
   * EXTREME = Major squeeze, high probability of expansion
   * HIGH = Significant compression
   * MODERATE = Notable but less extreme
   */
  private determineContractionLevel(contraction: number): 'EXTREME' | 'HIGH' | 'MODERATE' {
    if (contraction >= 40) return 'EXTREME'
    if (contraction >= 25) return 'HIGH'
    return 'MODERATE'
  }

  /**
   * Scan multiple symbols with streaming results
   */
  async *scanSymbolsStream(symbols: string[]): AsyncGenerator<{
    type: 'progress' | 'result' | 'complete' | 'error'
    symbol?: string
    result?: ContractionResult
    progress?: { current: number; total: number }
    error?: string
  }> {
    console.log(`🔍 Scanning ${symbols.length} symbols for price contractions`)

    const symbolList = symbols.map((s) => s.trim().toUpperCase())
    const total = symbolList.length
    let current = 0

    // Process in batches
    for (let i = 0; i < symbolList.length; i += this.CONCURRENT_REQUESTS) {
      const batch = symbolList.slice(i, i + this.CONCURRENT_REQUESTS)

      for (const symbol of batch) {
        try {
          current++

          // Send progress update
          if (current % 10 === 0 || current === 1) {
            yield {
              type: 'progress' as const,
              symbol,
              progress: { current, total },
            }
          }

          const results = await this.analyzeSymbol(symbol)

          // Yield each result separately
          for (const result of results) {
            yield {
              type: 'result' as const,
              result,
            }
            console.log(
              `✓ ${symbol} [${result.period}]: ${result.contractionPercent.toFixed(1)}% contraction | Squeeze ${result.squeezeStatus}`
            )
          }
        } catch (error) {
          console.error(`❌ Error analyzing ${symbol}:`, error)
          yield {
            type: 'error' as const,
            symbol,
            error: error instanceof Error ? error.message : 'Unknown error',
          }
        }
      }

      // Delay between batches
      if (i + this.CONCURRENT_REQUESTS < symbolList.length) {
        await new Promise((resolve) => setTimeout(resolve, this.REQUEST_DELAY))
      }
    }

    yield {
      type: 'complete' as const,
    }
  }
}

export const contractionScanner = new ContractionScanner()
