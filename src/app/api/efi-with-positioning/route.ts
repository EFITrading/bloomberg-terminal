import { NextResponse } from 'next/server'

const POLYGON_API_KEY = process.env.POLYGON_API_KEY!

// EXACT same EFI criteria as OptionsFlowTable.tsx meetsEfiCriteria()
function meetsEfiCriteria(trade: any): boolean {
  // 1. Check expiration (0-35 trading days)
  if (trade.days_to_expiry < 0 || trade.days_to_expiry > 35) {
    return false
  }

  // 2. Check premium ($85k - $690k)
  if (trade.total_premium < 85000 || trade.total_premium > 690000) {
    return false
  }

  // 3. Check contracts (350 minimum, no max)
  if (trade.trade_size < 350) {
    return false
  }

  // 4. Check OTM status
  if (!trade.moneyness || trade.moneyness !== 'OTM') {
    return false
  }

  return true
}

// Build combo trade map — same logic as OptionsFlowTable.tsx comboTradeMap useMemo
function buildComboTradeMap(trades: any[]): Map<string, boolean> {
  const map = new Map<string, boolean>()

  // Group by ticker-expiry
  const tradesByKey = new Map<string, any[]>()
  trades.forEach((trade) => {
    const baseKey = `${trade.underlying_ticker}-${trade.expiry}`
    if (!tradesByKey.has(baseKey)) tradesByKey.set(baseKey, [])
    tradesByKey.get(baseKey)!.push(trade)
  })

  tradesByKey.forEach((group) => {
    group.forEach((trade) => {
      const tradeKey = `${trade.underlying_ticker}-${trade.strike}-${trade.expiry}-${trade.type}-${trade.fill_style}`
      const isCall = trade.type === 'call'
      const fillStyle = trade.fill_style || ''

      const hasCombo = group.some((t) => {
        if (Math.abs(t.strike - trade.strike) > trade.strike * 0.1) return false
        const oppositeFill = t.fill_style || ''
        const oppositeType = t.type.toLowerCase()
        if (isCall && (fillStyle === 'A' || fillStyle === 'AA'))
          return oppositeType === 'put' && (oppositeFill === 'B' || oppositeFill === 'BB')
        if (isCall && (fillStyle === 'B' || fillStyle === 'BB'))
          return oppositeType === 'put' && (oppositeFill === 'A' || oppositeFill === 'AA')
        if (!isCall && (fillStyle === 'B' || fillStyle === 'BB'))
          return oppositeType === 'call' && (oppositeFill === 'A' || oppositeFill === 'AA')
        if (!isCall && (fillStyle === 'A' || fillStyle === 'AA'))
          return oppositeType === 'call' && (oppositeFill === 'B' || oppositeFill === 'BB')
        return false
      })

      map.set(tradeKey, hasCombo)
    })
  })

  return map
}

// EXACT same positioning calculation as OptionsFlowTable.tsx calculatePositioningGrade()
function calculatePositioningGrade(
  trade: any,
  comboMap: Map<string, boolean>,
  currentOptionPrices: Record<string, number>,
  currentPrices: Record<string, number>,
  historicalStdDevs: Map<string, number>,
  relativeStrengthData: Map<string, number> = new Map()
): { grade: string; score: number; color: string; breakdown: string } {
  // Get option ticker for current price lookup
  const expiry = trade.expiry.replace(/-/g, '').slice(2)
  const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0')
  const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'
  const optionTicker = `O:${trade.underlying_ticker}${expiry}${optionType}${strikeFormatted}`
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

  // 1. Expiration Score (25 points max)
  const daysToExpiry = trade.days_to_expiry
  if (daysToExpiry <= 7) scores.expiration = 25
  else if (daysToExpiry <= 14) scores.expiration = 20
  else if (daysToExpiry <= 21) scores.expiration = 15
  else if (daysToExpiry <= 28) scores.expiration = 10
  else if (daysToExpiry <= 42) scores.expiration = 5
  confidenceScore += scores.expiration

  // 2. Contract Price Score (15 points max) — return N/A early if price unavailable
  if (!currentPrice || currentPrice <= 0) {
    return {
      grade: 'N/A',
      score: confidenceScore,
      color: '#9ca3af',
      breakdown: `Score: ${confidenceScore}/100\nExpiration: ${scores.expiration}/25\nContract P&L: 0/15\nRelative Strength: 0/10\nCombo Trade: 0/10\nPrice Action: 0/10\nVolume vs OI: 0/15\nStock Reaction: 0/15`,
    }
  }

  const rawPercentChange = ((currentPrice - entryPrice) / entryPrice) * 100
  const tradeFS = trade.fill_style || ''
  const isSoldToOpen = tradeFS === 'B' || tradeFS === 'BB'
  const percentChange = isSoldToOpen ? -rawPercentChange : rawPercentChange

  if (percentChange <= -40) scores.contractPrice = 15
  else if (percentChange <= -20) scores.contractPrice = 12
  else if (percentChange >= -10 && percentChange <= 10) scores.contractPrice = 10
  else if (percentChange >= 20) scores.contractPrice = 3
  else scores.contractPrice = 6
  confidenceScore += scores.contractPrice

  // 3. Relative Strength Score (10 points max)
  const rs = relativeStrengthData.get(trade.underlying_ticker)
  const isCall = trade.type === 'call'
  const fillStyle = trade.fill_style || ''

  if (rs !== undefined) {
    const isBullishFlow =
      (isCall && (fillStyle === 'A' || fillStyle === 'AA')) ||
      (!isCall && (fillStyle === 'B' || fillStyle === 'BB'))
    const isBearishFlow =
      (isCall && (fillStyle === 'B' || fillStyle === 'BB')) ||
      (!isCall && (fillStyle === 'A' || fillStyle === 'AA'))
    if ((isBullishFlow && rs > 0) || (isBearishFlow && rs < 0)) scores.relativeStrength = 10
  }
  confidenceScore += scores.relativeStrength

  // 4. Combo Trade Score (10 points max) — O(1) lookup via precomputed map
  const comboLookupKey = `${trade.underlying_ticker}-${trade.strike}-${trade.expiry}-${trade.type}-${fillStyle}`
  if (comboMap.get(comboLookupKey)) scores.combo = 10
  confidenceScore += scores.combo

  // Shared variables
  const entryStockPrice = trade.spot_price
  const currentStockPrice = currentPrices[trade.underlying_ticker]
  const tradeTime = new Date(trade.trade_timestamp)
  const currentTime = new Date()

  // 5. Price Action Score (10 points max) — consolidation OR reversal bet
  const stdDev = historicalStdDevs.get(trade.underlying_ticker)

  if (currentStockPrice && entryStockPrice && stdDev) {
    const hoursElapsed = (currentTime.getTime() - tradeTime.getTime()) / (1000 * 60 * 60)
    const tradingDaysElapsed = Math.floor(hoursElapsed / 6.5)
    const stockPercentChange = ((currentStockPrice - entryStockPrice) / entryStockPrice) * 100
    const absMove = Math.abs(stockPercentChange)
    const withinStdDev = absMove <= stdDev

    // SCENARIO A: Stock stayed calm (consolidation)
    if (withinStdDev) {
      if (tradingDaysElapsed >= 3) scores.priceAction = 10
      else if (tradingDaysElapsed >= 2) scores.priceAction = 8
      else if (tradingDaysElapsed >= 1) scores.priceAction = 6
      else scores.priceAction = 4
    } else {
      // SCENARIO B: Big move — check if flow is a contrarian reversal bet
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

  // 6. Volume vs Open Interest Score (15 points max)
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

  // 7. Stock Reaction Score (15 points max)
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

  // Color code
  let scoreColor = '#ff0000'
  if (confidenceScore >= 85) scoreColor = '#00ff00'
  else if (confidenceScore >= 70) scoreColor = '#84cc16'
  else if (confidenceScore >= 50) scoreColor = '#fbbf24'
  else if (confidenceScore >= 33) scoreColor = '#3b82f6'

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

  const breakdown = `Score: ${confidenceScore}/100
Expiration: ${scores.expiration}/25
Contract P&L: ${scores.contractPrice}/15
Relative Strength: ${scores.relativeStrength}/10
Combo Trade: ${scores.combo}/10
Price Action: ${scores.priceAction}/10
Volume vs OI: ${scores.volumeOI}/15
Stock Reaction: ${scores.stockReaction}/15`

  return { grade, score: confidenceScore, color: scoreColor, breakdown }
}

async function fetchCurrentOptionPrices(trades: any[]): Promise<{
  prices: Record<string, number>
  volOI: Record<string, { volume: number | null; oi: number | null }>
}> {
  const pricesUpdate: Record<string, number> = {}
  const volOIUpdate: Record<string, { volume: number | null; oi: number | null }> = {}

  // Batch in parallel groups of 100
  const BATCH_SIZE = 100
  const batches = []
  for (let i = 0; i < trades.length; i += BATCH_SIZE) {
    batches.push(trades.slice(i, i + BATCH_SIZE))
  }

  for (const batch of batches) {
    const results = await Promise.all(
      batch.map(async (trade, index) => {
        // Minimal stagger 5ms per trade in batch
        await new Promise((resolve) => setTimeout(resolve, index * 5))

        try {
          const expiry = trade.expiry.replace(/-/g, '').slice(2)
          const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0')
          const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'
          const optionTicker = `O:${trade.underlying_ticker}${expiry}${optionType}${strikeFormatted}`

          // Use snapshot endpoint - VIX/SPX weeklies need different format
          const snapshotUrl =
            trade.underlying_ticker === 'VIX' || trade.underlying_ticker === 'SPX'
              ? `https://api.polygon.io/v3/snapshot/options/I:${trade.underlying_ticker}?limit=250&apikey=${POLYGON_API_KEY}`
              : `https://api.polygon.io/v3/snapshot/options/${trade.underlying_ticker}/${optionTicker}?apikey=${POLYGON_API_KEY}`

          const response = await fetch(snapshotUrl, {
            signal: AbortSignal.timeout(3000),
          })

          if (response.ok) {
            const data = await response.json()
            if (data.results) {
              // For VIX/SPX bulk snapshot, find the specific contract
              let result
              if (trade.underlying_ticker === 'VIX' || trade.underlying_ticker === 'SPX') {
                result = Array.isArray(data.results)
                  ? data.results.find((r: any) => r.details?.ticker === optionTicker)
                  : data.results
              } else {
                result = data.results
              }

              if (result && result.last_quote) {
                const bid = result.last_quote.bid || 0
                const ask = result.last_quote.ask || 0
                const currentPrice = (bid + ask) / 2

                if (currentPrice > 0) {
                  return {
                    optionTicker,
                    price: currentPrice,
                    volume: (result.day?.volume ?? null) as number | null,
                    oi: (result.open_interest ?? null) as number | null,
                  }
                }
              }
            }
          }
        } catch (error) {
          // Silent fail
        }
        return null
      })
    )

    // Aggregate results
    results.forEach((result) => {
      if (result) {
        pricesUpdate[result.optionTicker] = result.price
        volOIUpdate[result.optionTicker] = { volume: result.volume, oi: result.oi }
      }
    })
  }

  return { prices: pricesUpdate, volOI: volOIUpdate }
}

async function fetchCurrentStockPrices(tickers: string[]): Promise<Record<string, number>> {
  const pricesUpdate: Record<string, number> = {}

  // Batch in parallel groups of 50
  const BATCH_SIZE = 50
  const batches = []
  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    batches.push(tickers.slice(i, i + BATCH_SIZE))
  }

  for (const batch of batches) {
    const results = await Promise.all(
      batch.map(async (ticker, index) => {
        // Minimal stagger 10ms per ticker in batch
        await new Promise((resolve) => setTimeout(resolve, index * 10))

        try {
          const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apikey=${POLYGON_API_KEY}`

          const response = await fetch(snapshotUrl, {
            signal: AbortSignal.timeout(3000),
          })

          if (response.ok) {
            const data = await response.json()
            if (data.ticker && data.ticker.lastTrade && data.ticker.lastTrade.p) {
              return { ticker, price: data.ticker.lastTrade.p }
            }
          }
        } catch (error) {
          // Silent fail
        }
        return null
      })
    )

    // Aggregate results
    results.forEach((result) => {
      if (result) {
        pricesUpdate[result.ticker] = result.price
      }
    })
  }

  return pricesUpdate
}

async function calculateHistoricalStdDevs(tickers: string[]): Promise<Map<string, number>> {
  const stdDevs = new Map<string, number>()

  // Batch in parallel groups of 50
  const BATCH_SIZE = 50
  const batches = []
  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    batches.push(tickers.slice(i, i + BATCH_SIZE))
  }

  for (const batch of batches) {
    const results = await Promise.all(
      batch.map(async (ticker, index) => {
        // Minimal stagger 10ms per ticker in batch
        await new Promise((resolve) => setTimeout(resolve, index * 10))

        try {
          const endDate = new Date()
          const startDate = new Date()
          startDate.setMonth(startDate.getMonth() - 1)

          const formattedEnd = endDate.toISOString().split('T')[0]
          const formattedStart = startDate.toISOString().split('T')[0]

          const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${formattedStart}/${formattedEnd}?adjusted=true&sort=asc&limit=50000&apikey=${POLYGON_API_KEY}`

          const response = await fetch(url, {
            signal: AbortSignal.timeout(3000),
          })

          if (response.ok) {
            const data = await response.json()
            if (data.results && data.results.length > 1) {
              const returns = []
              for (let i = 1; i < data.results.length; i++) {
                const prevClose = data.results[i - 1].c
                const currClose = data.results[i].c
                const dailyReturn = ((currClose - prevClose) / prevClose) * 100
                returns.push(dailyReturn)
              }

              const mean = returns.reduce((a, b) => a + b, 0) / returns.length
              const variance =
                returns.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / returns.length
              const stdDev = Math.sqrt(variance)

              return { ticker, stdDev }
            }
          }
        } catch (error) {
          // Silent fail
        }
        return null
      })
    )

    // Aggregate results
    results.forEach((result) => {
      if (result) {
        stdDevs.set(result.ticker, result.stdDev)
      }
    })
  }

  return stdDevs
}

async function calculateRelativeStrength(trades: any[]): Promise<Map<string, number>> {
  const rsData = new Map<string, number>()
  if (trades.length === 0) return rsData

  const tickerDates = new Map<string, Date>()
  trades.forEach((trade) => {
    const tradeDate = new Date(trade.trade_timestamp)
    const existing = tickerDates.get(trade.underlying_ticker)
    if (!existing || tradeDate < existing) {
      tickerDates.set(trade.underlying_ticker, tradeDate)
    }
  })

  const tickers = Array.from(tickerDates.keys())

  try {
    const allTickers = [...tickers, 'SPY']
    const pricePromises = allTickers.map(async (ticker, index) => {
      await new Promise((resolve) => setTimeout(resolve, index * 10))

      try {
        const endDate = new Date()
        const startDate = new Date()
        startDate.setDate(startDate.getDate() - 10)

        const formattedEnd = endDate.toISOString().split('T')[0]
        const formattedStart = startDate.toISOString().split('T')[0]

        const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${formattedStart}/${formattedEnd}?adjusted=true&sort=asc&limit=50000&apikey=${POLYGON_API_KEY}`

        const response = await fetch(url, { signal: AbortSignal.timeout(3000) })

        if (response.ok) {
          const data = await response.json()
          if (data.results && data.results.length > 0) {
            return { ticker, bars: data.results }
          }
        }
      } catch (error) {}
      return null
    })

    const results = await Promise.all(pricePromises)
    const priceData = new Map<string, any[]>()
    results.forEach((result) => {
      if (result) priceData.set(result.ticker, result.bars)
    })

    const spyBars = priceData.get('SPY')
    if (!spyBars || spyBars.length < 5) return rsData

    tickers.forEach((ticker) => {
      const stockBars = priceData.get(ticker)
      const tradeDate = tickerDates.get(ticker)

      if (!stockBars || !tradeDate || stockBars.length < 5) return

      try {
        const tradeDateMs = tradeDate.getTime()
        const threeDaysBeforeMs = tradeDateMs - 3 * 24 * 60 * 60 * 1000
        const fourDaysBeforeMs = tradeDateMs - 4 * 24 * 60 * 60 * 1000

        const startBar = stockBars.find(
          (bar) => bar.t >= fourDaysBeforeMs && bar.t <= threeDaysBeforeMs
        )
        const endBar = stockBars.find((bar) => bar.t >= threeDaysBeforeMs && bar.t <= tradeDateMs)
        const spyStartBar = spyBars.find(
          (bar) => bar.t >= fourDaysBeforeMs && bar.t <= threeDaysBeforeMs
        )
        const spyEndBar = spyBars.find((bar) => bar.t >= threeDaysBeforeMs && bar.t <= tradeDateMs)

        if (startBar && endBar && spyStartBar && spyEndBar) {
          const stockChange = ((endBar.c - startBar.c) / startBar.c) * 100
          const spyChange = ((spyEndBar.c - spyStartBar.c) / spyStartBar.c) * 100
          rsData.set(ticker, stockChange - spyChange)
        }
      } catch (error) {}
    })
  } catch (error) {}

  return rsData
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const ticker = searchParams.get('ticker')

    if (!ticker) {
      return NextResponse.json({ error: 'Ticker required' }, { status: 400 })
    }

    // Fetch raw trades from the options flow API
    const flowResponse = await fetch(
      `${request.headers.get('origin') || 'http://localhost:3000'}/api/stream-options-flow?ticker=${ticker}`
    )

    if (!flowResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch options flow' }, { status: 500 })
    }

    // Parse the streaming response
    const reader = flowResponse.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const allTrades: any[] = []
    let streamComplete = false

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))

            // Trades come through ticker_complete events, NOT the final complete event
            if (data.type === 'ticker_complete' && data.trades?.length > 0) {
              allTrades.push(...data.trades)
            }

            if (data.type === 'complete') {
              streamComplete = true
              break
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }

      if (streamComplete) break
    }

    // Filter for EFI trades only
    if (allTrades.length > 0) {
      let _failDTE = 0,
        _failPremium = 0,
        _failSize = 0,
        _failMoneyness = 0,
        _pass = 0
      for (const t of allTrades) {
        if (t.days_to_expiry < 0 || t.days_to_expiry > 35) {
          _failDTE++
          continue
        }
        if (t.total_premium < 85000 || t.total_premium > 690000) {
          _failPremium++
          continue
        }
        if (t.trade_size < 350) {
          _failSize++
          continue
        }
        if (!t.moneyness || t.moneyness !== 'OTM') {
          _failMoneyness++
          continue
        }
        _pass++
      }
    }
    // Enrich fill_style for ALL trades before filtering (needed for accurate combo detection)
    const buildOptionTicker = (trade: any): string => {
      const expiry = trade.expiry.replace(/-/g, '').slice(2)
      const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0')
      const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'
      return `O:${trade.underlying_ticker}${expiry}${optionType}${strikeFormatted}`
    }

    const computeFillStyle = (fillPrice: number, bid: number, ask: number): string => {
      const midpoint = (bid + ask) / 2
      if (fillPrice >= ask + 0.01) return 'AA'
      if (fillPrice <= bid - 0.01) return 'BB'
      if (fillPrice === ask) return 'A'
      if (fillPrice === bid) return 'B'
      return fillPrice >= midpoint ? 'A' : 'B'
    }

    const uniqueQuotes = new Map<string, { contract: string; timestamp_ns: number }>()
    for (const trade of allTrades) {
      if (trade.fill_style && trade.fill_style !== 'N/A') continue
      const contract = buildOptionTicker(trade)
      const tradeMs =
        typeof trade.trade_timestamp === 'number'
          ? trade.trade_timestamp
          : new Date(trade.trade_timestamp).getTime()
      const timestampNs = tradeMs * 1_000_000
      const key = `${contract}:${Math.floor(timestampNs / 1_000_000_000)}`
      if (!uniqueQuotes.has(key)) uniqueQuotes.set(key, { contract, timestamp_ns: timestampNs })
    }

    const quoteResultMap = new Map<string, { bid: number; ask: number } | null>()
    try {
      const origin = request.headers.get('origin') || 'http://localhost:3000'
      const batchPayload = Array.from(uniqueQuotes.entries()).map(([id, v]) => ({ id, ...v }))
      const quoteRes = await fetch(`${origin}/api/options-quotes-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trades: batchPayload }),
      })
      if (quoteRes.ok) {
        const batchData = await quoteRes.json()
        for (const r of batchData.results as {
          id: string
          bid: number | null
          ask: number | null
        }[]) {
          quoteResultMap.set(
            r.id,
            r.bid && r.ask && r.bid > 0 && r.ask > 0 ? { bid: r.bid, ask: r.ask } : null
          )
        }
      }
    } catch {
      // fall through — fill_style stays as-is from stream
    }

    const allTradesWithFill = allTrades.map((trade: any) => {
      if (trade.fill_style && trade.fill_style !== 'N/A') return trade
      const contract = buildOptionTicker(trade)
      const tradeMs =
        typeof trade.trade_timestamp === 'number'
          ? trade.trade_timestamp
          : new Date(trade.trade_timestamp).getTime()
      const timestampNs = tradeMs * 1_000_000
      const key = `${contract}:${Math.floor(timestampNs / 1_000_000_000)}`
      const quote = quoteResultMap.get(key) ?? null
      return {
        ...trade,
        fill_style: quote
          ? computeFillStyle(trade.premium_per_contract, quote.bid, quote.ask)
          : 'N/A',
      }
    })

    // Filter EFI trades from enriched allTrades (combo map uses ALL enriched trades)
    const efiTrades = allTradesWithFill.filter(meetsEfiCriteria)

    if (efiTrades.length === 0) {
      return NextResponse.json({ trades: [], message: 'No EFI trades found' })
    }

    // Get unique tickers for stock prices
    const uniqueTickers = [...new Set(efiTrades.map((t: any) => t.underlying_ticker))]

    // Fetch all required data in parallel
    const [optionData, currentPrices, historicalStdDevs, relativeStrengthData] = await Promise.all([
      fetchCurrentOptionPrices(efiTrades),
      fetchCurrentStockPrices(uniqueTickers),
      calculateHistoricalStdDevs(uniqueTickers),
      calculateRelativeStrength(efiTrades),
    ])

    const currentOptionPrices = optionData.prices
    const snapshotVolOI = optionData.volOI

    // Attach vol/oi from snapshot to EFI trades
    const efiTradesWithFill = efiTrades.map((trade: any) => {
      const optionTicker = buildOptionTicker(trade)
      const snap = snapshotVolOI[optionTicker]
      return {
        ...trade,
        volume: snap?.volume ?? trade.volume ?? null,
        open_interest: snap?.oi ?? trade.open_interest ?? null,
      }
    })

    // Build combo map from ALL enriched trades (matches table behavior)
    const comboMap = buildComboTradeMap(allTradesWithFill)
    const tradesWithPositioning = efiTradesWithFill.map((trade: any) => {
      const positioning = calculatePositioningGrade(
        trade,
        comboMap,
        currentOptionPrices,
        currentPrices,
        historicalStdDevs,
        relativeStrengthData
      )
      const expiry2 = trade.expiry.replace(/-/g, '').slice(2)
      const sf2 = String(Math.round(trade.strike * 1000)).padStart(8, '0')
      const ot2 = trade.type.toLowerCase() === 'call' ? 'C' : 'P'
      const opTicker2 = `O:${trade.underlying_ticker}${expiry2}${ot2}${sf2}`
      // Add current prices to trade data
      const expiry = trade.expiry.replace(/-/g, '').slice(2)
      const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0')
      const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'
      const optionTicker = `O:${trade.underlying_ticker}${expiry}${optionType}${strikeFormatted}`

      return {
        ...trade,
        current_option_price: currentOptionPrices[optionTicker] || trade.premium_per_contract,
        current_stock_price: currentPrices[trade.underlying_ticker] || trade.spot_price,
        positioning,
      }
    })

    return NextResponse.json({
      trades: tradesWithPositioning,
      count: tradesWithPositioning.length,
    })
  } catch (error) {
    console.error('EFI API Error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
