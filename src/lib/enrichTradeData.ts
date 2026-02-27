'use client'

const POLYGON_API_KEY = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf'

const getOptionTicker = (trade: any) => {
  const expiry = trade.expiry.replace(/-/g, '').slice(2)
  const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0')
  const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'
  const tickerSymbol = trade.underlying_ticker.replace(/\./g, '')
  return `O:${tickerSymbol}${expiry}${optionType}${strikeFormatted}`
}

export const enrichTradeDataCombined = async (
  trades: any[],
  updateCallback?: (results: any[]) => void
): Promise<any[]> => {
  if (trades.length === 0) return trades

  // Step 1: Deduplicate - collect unique option tickers
  const uniqueTickerMap = new Map<string, { underlying: string }>()
  for (const trade of trades) {
    const optionTicker = getOptionTicker(trade)
    if (!uniqueTickerMap.has(optionTicker)) {
      uniqueTickerMap.set(optionTicker, { underlying: trade.underlying_ticker })
    }
  }

  const uniqueTickers = Array.from(uniqueTickerMap.entries())
  const BATCH_SIZE = 75
  const batches = []
  for (let i = 0; i < uniqueTickers.length; i += BATCH_SIZE) {
    batches.push(uniqueTickers.slice(i, i + BATCH_SIZE))
  }

  type ContractData = { volume: number; open_interest: number; bid: number; ask: number } | null
  const cache = new Map<string, ContractData>()

  for (const batch of batches) {
    await Promise.all(
      batch.map(async ([optionTicker, { underlying }]) => {
        try {
          const snapshotUrl = `https://api.polygon.io/v3/snapshot/options/${underlying}/${optionTicker}?apikey=${POLYGON_API_KEY}`
          const response = await fetch(snapshotUrl, {
            signal: AbortSignal.timeout(5000),
          } as RequestInit)
          if (!response.ok) {
            cache.set(optionTicker, null)
            return
          }
          const data = await response.json()
          if (data.results) {
            const r = data.results
            cache.set(optionTicker, {
              volume: r.day?.volume || 0,
              open_interest: r.open_interest || 0,
              bid: r.last_quote?.bid || 0,
              ask: r.last_quote?.ask || 0,
            })
          } else {
            cache.set(optionTicker, null)
          }
        } catch {
          cache.set(optionTicker, null)
        }
      })
    )
  }

  // Build deduplicated batch payload for fill style
  type QuoteKey = string
  const uniqueQuotes = new Map<QuoteKey, { contract: string; timestamp_ns: number }>()
  for (const trade of trades) {
    const contract = getOptionTicker(trade)
    const timestampNs = new Date(trade.trade_timestamp).getTime() * 1_000_000
    const key: QuoteKey = `${contract}:${Math.floor(timestampNs / 1_000_000_000)}`
    if (!uniqueQuotes.has(key)) uniqueQuotes.set(key, { contract, timestamp_ns: timestampNs })
  }

  const quoteResultMap = new Map<QuoteKey, { bid: number; ask: number } | null>()
  try {
    const batchPayload = Array.from(uniqueQuotes.entries()).map(([id, v]) => ({ id, ...v }))
    const res = await fetch('/api/options-quotes-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trades: batchPayload }),
    })
    const data = await res.json()
    for (const r of data.results as { id: string; bid: number | null; ask: number | null }[]) {
      quoteResultMap.set(
        r.id,
        r.bid && r.ask && r.bid > 0 && r.ask > 0 ? { bid: r.bid, ask: r.ask } : null
      )
    }
  } catch {
    /* fall through to N/A */
  }

  const finalResults = trades.map((trade) => {
    const contract = getOptionTicker(trade)
    const timestampNs = new Date(trade.trade_timestamp).getTime() * 1_000_000
    const key: QuoteKey = `${contract}:${Math.floor(timestampNs / 1_000_000_000)}`
    const cached = cache.get(contract)
    const volume = cached?.volume ?? 0
    const open_interest = cached?.open_interest ?? 0
    const quote = quoteResultMap.get(key) ?? null
    if (quote) {
      const fill = trade.premium_per_contract
      const mid = (quote.bid + quote.ask) / 2
      let fillStyle: 'A' | 'B' | 'AA' | 'BB' | 'N/A' = 'N/A'
      if (fill >= quote.ask + 0.01) fillStyle = 'AA'
      else if (fill <= quote.bid - 0.01) fillStyle = 'BB'
      else if (fill === quote.ask) fillStyle = 'A'
      else if (fill === quote.bid) fillStyle = 'B'
      else fillStyle = fill >= mid ? 'A' : 'B'
      return { ...trade, fill_style: fillStyle, volume, open_interest }
    }
    return { ...trade, fill_style: 'N/A' as const, volume, open_interest }
  })

  updateCallback?.(finalResults)
  return finalResults
}
