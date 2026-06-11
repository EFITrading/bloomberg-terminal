'use client'

import React, { useEffect, useState, useRef } from 'react'

import { OptionsFlowTable } from '@/components/OptionsFlowTable'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import AlgoFlowScreener from '@/components/AlgoFlowScreener'

// Polygon API key
const POLYGON_API_KEY = process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''

// ── Live OI cache helpers ─────────────────────────────────────────────────────
// Returns the relevant trading date (YYYY-MM-DD, PST-aware).
// Before 6:30 AM PST → roll back to the previous trading day so a post-close
// scan from the previous session is still considered "fresh".
const getFlowTradingDate = (): string => {
  const nowPST = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
  )
  const hour = nowPST.getHours()
  const minute = nowPST.getMinutes()
  const target = new Date(nowPST)
  // Before market open (6:30 AM PST) → step back one day to previous session
  if (hour < 6 || (hour === 6 && minute < 30)) {
    target.setDate(target.getDate() - 1)
  }
  // Always skip weekends so Saturday/Sunday always resolve to Friday
  while (target.getDay() === 0 || target.getDay() === 6) {
    target.setDate(target.getDate() - 1)
  }
  const y = target.getFullYear()
  const m = String(target.getMonth() + 1).padStart(2, '0')
  const d = String(target.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Persist the liveOIMap from applyLiveOI into the database, one row per ticker.
// Fire-and-forget — does not block the UI.
const persistLiveOIByTicker = (liveOIMap: Map<string, number>) => {
  const tradingDate = getFlowTradingDate()
  // Group map entries by underlying ticker (first segment of the contract key)
  const byTicker = new Map<string, [string, number][]>()
  for (const [key, val] of liveOIMap) {
    const ticker = key.split('_')[0]
    if (!byTicker.has(ticker)) byTicker.set(ticker, [])
    byTicker.get(ticker)!.push([key, val])
  }
  for (const [ticker, entries] of byTicker) {
    fetch('/api/live-oi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker, tradingDate, entries }),
    }).catch(() => {
      // Non-critical — ignore save errors
    })
  }
}
// ─────────────────────────────────────────────────────────────────────────────

// Concurrency limiter — prevents ERR_INSUFFICIENT_RESOURCES from too many parallel fetches
async function runWithConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let index = 0
  async function worker() {
    while (index < tasks.length) {
      const i = index++
      results[i] = await tasks[i]()
    }
  }
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, worker)
  await Promise.all(workers)
  return results
}

// [ENRICH] COMBINED ENRICHMENT - Vol/OI + Fill Style in ONE API call
const enrichTradeDataCombined = async (
  trades: OptionsFlowData[],
  updateCallback?: (results: OptionsFlowData[]) => void
): Promise<OptionsFlowData[]> => {
  if (trades.length === 0) return trades

  // Build option ticker for a trade
  const getOptionTicker = (trade: OptionsFlowData) => {
    const expiry = trade.expiry.replace(/-/g, '').slice(2)
    const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0')
    const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'
    const tickerSymbol = trade.underlying_ticker.replace(/\./g, '')
    return `O:${tickerSymbol}${expiry}${optionType}${strikeFormatted}`
  }

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

  // Step 2: Fetch unique contracts and cache results
  type ContractData = { volume: number; open_interest: number; bid: number; ask: number } | null
  const cache = new Map<string, ContractData>()

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex]
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

  // Build deduplicated batch payload — unique by contract+second bucket
  // Use trade.ticker directly — it's the correct OCC ticker from Polygon (e.g. O:SPXW260325C...)
  // getOptionTicker() produces wrong format for SPX (missing W in SPXW), so never use it for quote lookups
  type QuoteKey = string // `${contract}:${secondBucket}`
  const uniqueQuotes = new Map<QuoteKey, { contract: string; timestamp_ns: number }>()
  for (const trade of trades) {
    const contract = trade.ticker // correct OCC ticker from Polygon
    const timestampNs = new Date(trade.trade_timestamp).getTime() * 1_000_000
    const key: QuoteKey = `${contract}:${Math.floor(timestampNs / 1_000_000_000)}`
    if (!uniqueQuotes.has(key)) uniqueQuotes.set(key, { contract, timestamp_ns: timestampNs })
  }

  // Single POST — server fans out all Polygon calls simultaneously
  const batchPayload = Array.from(uniqueQuotes.entries()).map(([id, v]) => ({ id, ...v }))
  const quoteResultMap = new Map<QuoteKey, { bid: number; ask: number } | null>()
  try {
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
    /* all trades fall through to N/A */
  }

  const finalResults = trades.map((trade) => {
    const contract = trade.ticker // correct OCC ticker from Polygon
    const builtTicker = getOptionTicker(trade) // used only for vol/OI cache lookup
    const timestampNs = new Date(trade.trade_timestamp).getTime() * 1_000_000
    const key: QuoteKey = `${contract}:${Math.floor(timestampNs / 1_000_000_000)}`
    const cached = cache.get(builtTicker)
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

  return finalResults
}

// [LIVE OI] Compute intraday live OI per contract from fill styles after enrichment
// A / AA / BB fills = opening new position → add contracts to OI
// B fill = closing position → subtract (unless size > baseOI, then treat as opening)
const applyLiveOI = (trades: OptionsFlowData[]): OptionsFlowData[] => {
  if (trades.length === 0) return trades

  // Group by unique contract
  const contractGroups = new Map<string, OptionsFlowData[]>()
  for (const trade of trades) {
    const key = `${trade.underlying_ticker}_${trade.strike}_${trade.type}_${trade.expiry}`
    if (!contractGroups.has(key)) contractGroups.set(key, [])
    contractGroups.get(key)!.push(trade)
  }

  // Compute live OI for each contract
  const liveOIMap = new Map<string, number>()
  for (const [key, contractTrades] of contractGroups) {
    const baseOI = contractTrades[0].open_interest ?? 0
    const sorted = [...contractTrades].sort(
      (a, b) => new Date(a.trade_timestamp).getTime() - new Date(b.trade_timestamp).getTime()
    )
    let liveOI = baseOI
    const seen = new Set<string>()
    for (const trade of sorted) {
      const tradeId = `${trade.ticker}_${trade.trade_timestamp}_${trade.trade_size}_${trade.premium_per_contract}`
      if (seen.has(tradeId)) continue
      seen.add(tradeId)
      const contracts = trade.trade_size ?? 0
      switch (trade.fill_style) {
        case 'A':
        case 'AA':
        case 'BB':
          liveOI += contracts
          break
        case 'B':
          if (contracts > baseOI) {
            liveOI += contracts // size exceeds prior OI — must be new opening
          } else {
            liveOI -= contracts
          }
          break
        // N/A — no change
      }
    }
    liveOIMap.set(key, Math.max(0, liveOI))
  }

  // Persist to localStorage so LiquidPanel can reuse this data instantly
  persistLiveOIByTicker(liveOIMap)

  // Stamp the live OI onto every trade; preserve base_open_interest for coloring
  return trades.map((trade) => {
    const key = `${trade.underlying_ticker}_${trade.strike}_${trade.type}_${trade.expiry}`
    const liveOI = liveOIMap.get(key)
    if (liveOI !== undefined) {
      return {
        ...trade,
        base_open_interest: trade.base_open_interest ?? trade.open_interest,
        open_interest: liveOI,
      }
    }
    return trade
  })
}

// OLD SEPARATE FUNCTIONS - DEPRECATED (keeping for backwards compatibility)
const fetchVolumeAndOpenInterest = async (
  trades: OptionsFlowData[]
): Promise<OptionsFlowData[]> => {
  // Group trades by underlying ticker to minimize API calls
  const tradesByUnderlying = trades.reduce(
    (acc, trade) => {
      const underlying = trade.underlying_ticker
      if (!acc[underlying]) {
        acc[underlying] = []
      }
      acc[underlying].push(trade)
      return acc
    },
    {} as Record<string, OptionsFlowData[]>
  )

  const updatedTrades: OptionsFlowData[] = []

  // Process each underlying separately
  for (const [underlying, underlyingTrades] of Object.entries(tradesByUnderlying)) {
    try {
      // Get unique expiration dates
      const uniqueExpirations = [...new Set(underlyingTrades.map((t) => t.expiry))]

      const allContracts = new Map()

      // Fetch data for each expiration date
      for (const expiry of uniqueExpirations) {
        const expiryParam = expiry.includes('T') ? expiry.split('T')[0] : expiry

        const response = await fetch(
          `https://api.polygon.io/v3/snapshot/options/${underlying}?expiration_date=${expiryParam}&limit=250&apikey=${POLYGON_API_KEY}`
        )

        if (response.ok) {
          const chainData = await response.json()
          if (chainData.results) {
            chainData.results.forEach((contract: any) => {
              if (contract.details && contract.details.ticker) {
                allContracts.set(contract.details.ticker, {
                  volume: contract.day?.volume || 0,
                  open_interest: contract.open_interest || 0,
                })
              }
            })
          }
        }
      }

      if (allContracts.size === 0) {
        updatedTrades.push(
          ...underlyingTrades.map((trade) => ({
            ...trade,
            volume: 0,
            open_interest: 0,
          }))
        )
        continue
      }

      const contractLookup = allContracts

      // Match trades to contracts
      for (const trade of underlyingTrades) {
        const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'

        let expiryDate
        if (trade.expiry.includes('T')) {
          expiryDate = new Date(trade.expiry)
        } else {
          const [year, month, day] = trade.expiry.split('-').map(Number)
          expiryDate = new Date(year, month - 1, day)
        }

        const formattedExpiry = `${expiryDate.getFullYear().toString().slice(-2)}${(expiryDate.getMonth() + 1).toString().padStart(2, '0')}${expiryDate.getDate().toString().padStart(2, '0')}`
        const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0')
        const optionTicker = `O:${trade.underlying_ticker}${formattedExpiry}${optionType}${strikeFormatted}`

        const contractData = contractLookup.get(optionTicker)

        if (contractData) {
          updatedTrades.push({
            ...trade,
            volume: contractData.volume,
            open_interest: contractData.open_interest,
          })
        } else {
          updatedTrades.push({
            ...trade,
            volume: 0,
            open_interest: 0,
          })
        }
      }
    } catch (error) {
      console.error(`Error fetching data for ${underlying}:`, error)
      updatedTrades.push(
        ...underlyingTrades.map((trade) => ({
          ...trade,
          volume: 0,
          open_interest: 0,
        }))
      )
    }
  }

  return updatedTrades
}

// FILL STYLE ENRICHMENT - per-trade historical bid/ask at execution timestamp
const analyzeBidAskExecution = async (trades: OptionsFlowData[]): Promise<OptionsFlowData[]> => {
  if (trades.length === 0) return trades

  // Deduplicate by contract+second bucket, then single POST to batch endpoint
  // Use trade.ticker directly — correct OCC ticker from Polygon (e.g. O:SPXW260325C...)
  // Reconstructing from underlying_ticker produces wrong format for SPX (missing W in SPXW)
  type QuoteKey = string
  const uniqueQuotes = new Map<QuoteKey, { contract: string; timestamp_ns: number }>()
  for (const trade of trades) {
    const contract = trade.ticker
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

  return trades.map((trade) => {
    const contract = trade.ticker
    const timestampNs = new Date(trade.trade_timestamp).getTime() * 1_000_000
    const key: QuoteKey = `${contract}:${Math.floor(timestampNs / 1_000_000_000)}`
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
      return { ...trade, fill_style: fillStyle }
    }
    return { ...trade, fill_style: 'N/A' as const }
  })
}

interface OptionsFlowData {
  ticker: string
  underlying_ticker: string
  strike: number
  expiry: string
  type: 'call' | 'put'
  trade_size: number
  premium_per_contract: number
  total_premium: number
  spot_price: number
  exchange_name: string
  trade_type: 'SWEEP' | 'BLOCK' | 'MINI' | 'MULTI-LEG'
  trade_timestamp: string
  moneyness: 'ATM' | 'ITM' | 'OTM'
  days_to_expiry: number
  fill_style?: 'A' | 'B' | 'AA' | 'BB' | 'N/A'
  volume?: number
  open_interest?: number
  base_open_interest?: number
  vol_oi_ratio?: number
  delta?: number
  gamma?: number
  theta?: number
  vega?: number
  implied_volatility?: number
  current_price?: number
  bid?: number
  ask?: number
  bid_ask_spread?: number
}

interface OptionsFlowSummary {
  total_trades: number
  total_premium: number
  unique_symbols: number
  trade_types: {
    BLOCK: number
    SWEEP: number
    'MULTI-LEG': number
    MINI: number
  }
  call_put_ratio: {
    calls: number
    puts: number
  }
  processing_time_ms: number
}

interface MarketInfo {
  status: 'LIVE' | 'LAST_TRADING_DAY'
  is_live: boolean
  data_date: string
  market_open: boolean
}

// Client-side trading-day calculator (mirrors server getLastNTradingDays)
const getLastNTradingDays = (n: number): string[] => {
  const US_HOLIDAYS = new Set([
    '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-07-03', '2026-09-07',
    '2026-11-26', '2026-12-25', '2025-01-01', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26',
    '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25',
  ])
  const result: string[] = []
  const pst = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
  const cur = new Date(pst)
  while (result.length < n) {
    const dow = cur.getDay()
    const ds = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
    if (dow !== 0 && dow !== 6 && !US_HOLIDAYS.has(ds)) result.push(ds)
    cur.setDate(cur.getDate() - 1)
  }
  return result.reverse()
}

// For historical multi-day scans: check storage for each needed day, return cached trades + list of missing days
const tryLoadHistoricalFromSaved = async (
  ticker: string,
  tradingDays: string[],
  tickerSet?: Set<string> // optional: for MAG7/ETF multi-day expansion
): Promise<{ cachedTrades: OptionsFlowData[]; missingDays: string[] }> => {
  try {
    const datesResp = await fetch('/api/flows/dates')
    if (!datesResp.ok) return { cachedTrades: [], missingDays: tradingDays }
    const savedDates: { date: string }[] = await datesResp.json()
    // Build a set of saved day strings (YYYY-MM-DD)
    const savedDaySet = new Set(
      savedDates.map((d) => new Date(d.date).toISOString().split('T')[0])
    )

    const cachedTrades: OptionsFlowData[] = []
    const missingDays: string[] = []

    await Promise.all(
      tradingDays.map(async (day) => {
        if (!savedDaySet.has(day)) {
          missingDays.push(day)
          return
        }
        try {
          const flowResp = await fetch(`/api/flows/${encodeURIComponent(day)}`)
          if (!flowResp.ok) { missingDays.push(day); return }
          const flowData = await flowResp.json()
          const allTrades: OptionsFlowData[] = Array.isArray(flowData.data) ? flowData.data : []
          const filtered = tickerSet
            ? allTrades.filter((t) => tickerSet.has(t.underlying_ticker?.toUpperCase() ?? ''))
            : ticker
              ? allTrades.filter((t) => t.underlying_ticker?.toUpperCase() === ticker.toUpperCase())
              : allTrades
          filtered.forEach((t: any) => { if (!t.trading_date) t.trading_date = day })
          cachedTrades.push(...filtered)
          console.log(`[tryLoadHistoricalFromSaved] ${day}: ${filtered.length} trades from storage`)
        } catch {
          missingDays.push(day)
        }
      })
    )

    missingDays.sort() // chronological
    return { cachedTrades, missingDays }
  } catch (err) {
    console.warn('[tryLoadHistoricalFromSaved] error:', err)
    return { cachedTrades: [], missingDays: tradingDays }
  }
}

// Returns true if US equity markets are currently open (6:30 AM – 1:00 PM PST, weekday)
const isMarketCurrentlyOpen = (): boolean => {
  const nowPST = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
  const dow = nowPST.getDay()
  const hour = nowPST.getHours()
  const minute = nowPST.getMinutes()
  const isWeekday = dow >= 1 && dow <= 5
  const afterOpen = hour > 6 || (hour === 6 && minute >= 30)
  const beforeClose = hour < 13 // 1:00 PM PST = 4:00 PM EST
  return isWeekday && afterOpen && beforeClose
}

// Load today's saved flow filtered by a set of tickers (pass null to load all) — returns filtered trades or null
const tryLoadFromSavedFiltered = async (tickerSet: Set<string> | null): Promise<OptionsFlowData[] | null> => {
  try {
    // Markets are open right now — data from any prior save is incomplete, always scan fresh
    if (isMarketCurrentlyOpen()) return null
    const datesResp = await fetch('/api/flows/dates')
    if (!datesResp.ok) return null
    const dates: { date: string }[] = await datesResp.json()
    if (dates.length === 0) return null
    // Use PST-aware trading date: before 6:30 AM PST rolls back to previous trading day
    // so post-close saved data is reused until next market open
    const flowTradingDate = getFlowTradingDate()
    const latestDateRaw = dates[0].date
    const latestDateDay = new Date(latestDateRaw).toISOString().split('T')[0]
    console.log('[tryLoadFromSavedFiltered] flowTradingDate:', flowTradingDate, '| latestSaved:', latestDateDay)
    if (latestDateDay !== flowTradingDate) return null
    const flowResp = await fetch(`/api/flows/${encodeURIComponent(latestDateRaw)}`)
    if (!flowResp.ok) return null
    const flowData = await flowResp.json()
    const allTrades: OptionsFlowData[] = Array.isArray(flowData.data) ? flowData.data : []
    // Verify the actual trade timestamps match the expected trading date.
    // Old DB records were saved with wall-clock date — e.g. a 12:07 AM May 28 save contains
    // May 27 trades but is stored as May 28. Reject if trades don't belong to flowTradingDate.
    const tradesMatchDate = allTrades.some((t) => {
      if (!t.trade_timestamp) return false
      const d = new Date(new Date(t.trade_timestamp).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      return ds === flowTradingDate
    })
    if (!tradesMatchDate) {
      console.log('[tryLoadFromSavedFiltered] trade timestamps do not match flowTradingDate', flowTradingDate, '— scanning fresh')
      return null
    }
    const filtered = tickerSet
      ? allTrades.filter((t) => tickerSet.has(t.underlying_ticker?.toUpperCase() ?? ''))
      : allTrades
    console.log('[tryLoadFromSavedFiltered]', filtered.length, 'of', allTrades.length, 'total')
    return filtered.length > 0 ? filtered : null
  } catch (err) {
    console.warn('[tryLoadFromSavedFiltered] error:', err)
    return null
  }
}

// Load today's saved flow for a single ticker — returns filtered trades or null
const tryLoadFromSaved = async (ticker: string): Promise<OptionsFlowData[] | null> => {
  try {
    // Markets are open right now — data from any prior save is incomplete, always scan fresh
    if (isMarketCurrentlyOpen()) return null
    // Get stored dates so we use the actual saved date key (avoids UTC/local mismatch)
    const datesResp = await fetch('/api/flows/dates')
    if (!datesResp.ok) return null
    const dates: { date: string }[] = await datesResp.json()
    if (dates.length === 0) return null

    // Use PST-aware trading date: before 6:30 AM PST rolls back to previous trading day
    // so post-close saved data is reused until next market open
    const flowTradingDate = getFlowTradingDate()
    const latestDateRaw = dates[0].date // ordered by createdAt desc
    const latestDateDay = new Date(latestDateRaw).toISOString().split('T')[0]
    console.log('[tryLoadFromSaved] flowTradingDate:', flowTradingDate, '| latestSaved:', latestDateDay)
    if (latestDateDay !== flowTradingDate) return null

    // Fetch using the actual stored date key
    const flowResp = await fetch(`/api/flows/${encodeURIComponent(latestDateRaw)}`)
    if (!flowResp.ok) return null
    const flowData = await flowResp.json()
    const allTrades: OptionsFlowData[] = Array.isArray(flowData.data) ? flowData.data : []
    // Verify the actual trade timestamps match the expected trading date.
    // Old DB records were saved with wall-clock date — e.g. a 12:07 AM May 28 save contains
    // May 27 trades but is stored as May 28. Reject if trades don't belong to flowTradingDate.
    const tradesMatchDate = allTrades.some((t) => {
      if (!t.trade_timestamp) return false
      const d = new Date(new Date(t.trade_timestamp).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      return ds === flowTradingDate
    })
    if (!tradesMatchDate) {
      console.log('[tryLoadFromSaved] trade timestamps do not match flowTradingDate', flowTradingDate, '— scanning fresh')
      return null
    }
    const filtered = allTrades.filter(
      (t) => t.underlying_ticker?.toUpperCase() === ticker.toUpperCase()
    )
    console.log('[tryLoadFromSaved]', ticker, '→', filtered.length, 'trades from', allTrades.length, 'total')
    return filtered.length > 0 ? filtered : null
  } catch (err) {
    console.warn('[tryLoadFromSaved] error:', err)
    return null
  }
}

export default function OptionsFlowPage() {
  const [data, setData] = useState<OptionsFlowData[]>([])
  // Buffer SSE trades to avoid per-message setState (main thread violation fix)
  const pendingTradesRef = useRef<OptionsFlowData[]>([])
  const seenTradeIdsRef = useRef<Set<string>>(new Set())
  const rafFlushRef = useRef<number | null>(null)
  const cancelRef = useRef<boolean>(false)
  const activeSSEsRef = useRef<Set<{ es: EventSource; abort: () => void }>>(new Set())
  const flushPendingTrades = () => {
    if (pendingTradesRef.current.length === 0) return
    const batch = pendingTradesRef.current.splice(0)
    setData((prev) => [...prev, ...batch])
  }
  const [summary, setSummary] = useState<OptionsFlowSummary>({
    total_trades: 0,
    total_premium: 0,
    unique_symbols: 0,
    trade_types: { BLOCK: 0, SWEEP: 0, MINI: 0, 'MULTI-LEG': 0 },
    call_put_ratio: { calls: 0, puts: 0 },
    processing_time_ms: 0,
  })
  const [marketInfo, setMarketInfo] = useState<MarketInfo>({
    status: 'LIVE',
    is_live: true,
    data_date: new Date().toISOString().split('T')[0],
    market_open: true,
  })
  const [loading, setLoading] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<string>('')
  const [selectedTicker, setSelectedTicker] = useState('')
  const [streamingStatus, setStreamingStatus] = useState<string>('')
  const [streamingProgress, setStreamingProgress] = useState<{
    current: number
    total: number
  } | null>(null)
  const [streamError, setStreamError] = useState<string>('')
  const [isStreamComplete, setIsStreamComplete] = useState<boolean>(false)
  // Historical scan: '1D' = today only, '2'–'20' = N trading days back
  const [historicalDays, setHistoricalDays] = useState<string>('1D')
  const [showAlgoFlow, setShowAlgoFlow] = useState<boolean>(false)

  // Lock body scroll when AlgoFlow is active so the page cannot scroll behind it
  useEffect(() => {
    if (showAlgoFlow) {
      document.body.style.overflow = 'hidden'
      document.documentElement.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
      document.documentElement.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
      document.documentElement.style.overflow = ''
    }
  }, [showAlgoFlow])

  // Live options flow fetch
  const fetchOptionsFlowStreaming = async (tickerOverride?: string) => {
    setLoading(true)
    setStreamError('')
    setIsStreamComplete(false) // Reset from any previous scan
    cancelRef.current = false  // Reset cancel flag for new scan
    activeSSEsRef.current.clear() // Clear any stale SSE refs
    // Reset streaming buffers for new scan
    pendingTradesRef.current = []
    seenTradeIdsRef.current = new Set()
    if (rafFlushRef.current !== null) { cancelAnimationFrame(rafFlushRef.current); rafFlushRef.current = null }

    const connectionTimeout: NodeJS.Timeout | null = null

    try {
      // Keep existing trades and add new ones as they stream in
    } catch (dbError) {
      console.warn('Error checking database, proceeding with streaming:', dbError)
      // Keep existing data on error
    }

    try {
      // Map scan categories to appropriate ticker parameter
      let tickerParam = tickerOverride || selectedTicker
      const isAllScan = tickerParam === 'ALL'
      const isSingleTicker =
        !isAllScan && tickerParam !== 'MAG7' && tickerParam !== 'ETF' && !tickerParam.includes(',')

      // Single-ticker, today-only: load from saved flow before scanning
      if (isSingleTicker && historicalDays === '1D') {
        setStreamingStatus('Checking saved data...')
        const saved = await tryLoadFromSaved(tickerParam)
        if (saved) {
          const computedSummary: OptionsFlowSummary = {
            total_trades: saved.length,
            total_premium: saved.reduce((s, t) => s + (t.total_premium || 0), 0),
            unique_symbols: new Set(saved.map((t) => t.underlying_ticker)).size,
            trade_types: {
              BLOCK: saved.filter((t) => t.trade_type === 'BLOCK').length,
              SWEEP: saved.filter((t) => t.trade_type === 'SWEEP').length,
              MINI: saved.filter((t) => t.trade_type === 'MINI').length,
              'MULTI-LEG': saved.filter((t) => t.trade_type === 'MULTI-LEG').length,
            },
            call_put_ratio: {
              calls: saved.filter((t) => t.type?.toLowerCase() === 'call').length,
              puts: saved.filter((t) => t.type?.toLowerCase() === 'put').length,
            },
            processing_time_ms: 0,
          }
          setData(saved)
          setSummary(computedSummary)
          setLastUpdate(new Date().toLocaleString())
          setIsStreamComplete(true)
          setLoading(false)
          setStreamingStatus('')
          return
        }
        setStreamingStatus('')
      }

      // Multi-day scan: check storage first, only scan missing days via API
      if (historicalDays !== '1D' && !isAllScan) {
        const numDays = historicalDays === '3D' ? 3 : historicalDays === '1W' ? 5 : Math.max(1, Math.min(parseInt(historicalDays) || 3, 252))
        const tradingDays = getLastNTradingDays(numDays)
        setStreamingStatus('Checking saved flow history...')
        // Expand MAG7/ETF to a tickerSet so the cache filter matches underlying_ticker values
        const MAG7_SET_HIST = new Set(['AAPL', 'NVDA', 'MSFT', 'TSLA', 'AMZN', 'META', 'GOOGL', 'GOOG'])
        const ETF_SET_HIST = new Set(['SPY', 'QQQ', 'DIA', 'IWM', 'XLK', 'SMH', 'XLE', 'XLF', 'XLV', 'XLI', 'XLP', 'XLU', 'XLY', 'XLB', 'XLRE', 'XLC', 'GLD', 'SLV', 'TLT', 'HYG', 'LQD', 'EEM', 'EFA', 'VXX', 'UVXY'])
        const multiTickerSet = tickerParam === 'MAG7' ? MAG7_SET_HIST : tickerParam === 'ETF' ? ETF_SET_HIST : undefined
        const { cachedTrades, missingDays } = await tryLoadHistoricalFromSaved(tickerParam, tradingDays, multiTickerSet)

        if (cachedTrades.length > 0) {
          // Show cached data immediately
          setData(cachedTrades)
          setStreamingStatus(
            missingDays.length > 0
              ? `Loaded ${cachedTrades.length} trades from storage. Scanning ${missingDays.length} missing day(s)...`
              : ''
          )
        }

        if (missingDays.length === 0) {
          // All days found in storage — done
          const computedSummary: OptionsFlowSummary = {
            total_trades: cachedTrades.length,
            total_premium: cachedTrades.reduce((s, t) => s + (t.total_premium || 0), 0),
            unique_symbols: new Set(cachedTrades.map((t) => t.underlying_ticker)).size,
            trade_types: {
              BLOCK: cachedTrades.filter((t) => t.trade_type === 'BLOCK').length,
              SWEEP: cachedTrades.filter((t) => t.trade_type === 'SWEEP').length,
              MINI: cachedTrades.filter((t) => t.trade_type === 'MINI').length,
              'MULTI-LEG': cachedTrades.filter((t) => t.trade_type === 'MULTI-LEG').length,
            },
            call_put_ratio: {
              calls: cachedTrades.filter((t) => t.type?.toLowerCase() === 'call').length,
              puts: cachedTrades.filter((t) => t.type?.toLowerCase() === 'put').length,
            },
            processing_time_ms: 0,
          }
          setSummary(computedSummary)
          setLastUpdate(new Date().toLocaleString())
          setIsStreamComplete(true)
          setLoading(false)
          setStreamingStatus('')
          return
        }

        // Some days missing — stream only those days via &dates= param then merge
        const datesParam = `&dates=${missingDays.join(',')}`
        const eventSource = new EventSource(`/api/stream-options-flow?ticker=${tickerParam}${datesParam}`)
        const stallTimeout = setTimeout(() => {
          eventSource.close()
          setStreamError('Scan timed out after 5 minutes')
          setStreamingStatus('')
          setLoading(false)
        }, 5 * 60 * 1000)

        eventSource.onmessage = (event) => {
          try {
            const d = JSON.parse(event.data)
            if (d.type === 'status') { setStreamingStatus(d.message); return }
            if (d.type === 'ticker_complete' && d.trades?.length > 0) {
              const newTrades = (d.trades as OptionsFlowData[]).filter((t: OptionsFlowData) => {
                const id = `${t.ticker}-${t.trade_timestamp}-${t.strike}`
                if (seenTradeIdsRef.current.has(id)) return false
                seenTradeIdsRef.current.add(id)
                return true
              })
              if (newTrades.length > 0) {
                pendingTradesRef.current.push(...newTrades)
                if (rafFlushRef.current === null) {
                  rafFlushRef.current = requestAnimationFrame(() => {
                    rafFlushRef.current = null
                    flushPendingTrades()
                  })
                }
              }
              return
            }
            if (d.type === 'complete') {
              clearTimeout(stallTimeout)
              setIsStreamComplete(true)
              eventSource.close()
              setLastUpdate(new Date().toLocaleString())
              setStreamingProgress(null)
              setStreamingStatus('Enriching vol/OI & fill style...')
              setData((rawTrades) => {
                enrichTradeDataCombined(rawTrades, (partial) => setData(partial)).then((final) => {
                  setStreamingStatus('Computing live OI...')
                  setData(applyLiveOI(final))
                  setLoading(false)
                  setStreamingStatus('')
                })
                return rawTrades
              })
            }
            if (d.type === 'error') {
              clearTimeout(stallTimeout)
              setStreamError(d.error || 'Stream error')
              setLoading(false)
              eventSource.close()
            }
          } catch { /* ignore */ }
        }
        eventSource.onerror = () => {
          clearTimeout(stallTimeout)
          eventSource.close()
          setStreamingStatus('')
          setLoading(false)
        }
        return // handled
      }

      // MAG7/ETF 1D: check saved data first before expanding to comma list
      if (historicalDays === '1D' && (tickerParam === 'MAG7' || tickerParam === 'ETF')) {
        setStreamingStatus('Checking saved data...')
        const MAG7_SET = new Set(['AAPL', 'NVDA', 'MSFT', 'TSLA', 'AMZN', 'META', 'GOOGL', 'GOOG'])
        const ETF_SET = new Set(['SPY', 'QQQ', 'DIA', 'IWM', 'XLK', 'SMH', 'XLE', 'XLF', 'XLV', 'XLI', 'XLP', 'XLU', 'XLY', 'XLB', 'XLRE', 'XLC', 'GLD', 'SLV', 'TLT', 'HYG', 'LQD', 'EEM', 'EFA', 'VXX', 'UVXY'])
        const tSet = tickerParam === 'MAG7' ? MAG7_SET : ETF_SET
        const saved = await tryLoadFromSavedFiltered(tSet)
        if (saved) {
          const computedSummary: OptionsFlowSummary = {
            total_trades: saved.length,
            total_premium: saved.reduce((s, t) => s + (t.total_premium || 0), 0),
            unique_symbols: new Set(saved.map((t) => t.underlying_ticker)).size,
            trade_types: {
              BLOCK: saved.filter((t) => t.trade_type === 'BLOCK').length,
              SWEEP: saved.filter((t) => t.trade_type === 'SWEEP').length,
              MINI: saved.filter((t) => t.trade_type === 'MINI').length,
              'MULTI-LEG': saved.filter((t) => t.trade_type === 'MULTI-LEG').length,
            },
            call_put_ratio: {
              calls: saved.filter((t) => t.type?.toLowerCase() === 'call').length,
              puts: saved.filter((t) => t.type?.toLowerCase() === 'put').length,
            },
            processing_time_ms: 0,
          }
          setData(saved)
          setSummary(computedSummary)
          setLastUpdate(new Date().toLocaleString())
          setIsStreamComplete(true)
          setLoading(false)
          setStreamingStatus('')
          return
        }
        setStreamingStatus('')
      }

      if (tickerParam === 'MAG7') {
        tickerParam = 'AAPL,NVDA,MSFT,TSLA,AMZN,META,GOOGL,GOOG'
      } else if (tickerParam === 'ETF') {
        tickerParam =
          'SPY,QQQ,DIA,IWM,XLK,SMH,XLE,XLF,XLV,XLI,XLP,XLU,XLY,XLB,XLRE,XLC,GLD,SLV,TLT,HYG,LQD,EEM,EFA,VXX,UVXY'
      }
      // ALL scan: check saved data first, then fire SSEs if nothing found
      // ALL scan: fire all SSEs simultaneously in one shot — no while loop
      // 70 SSEs × 10 tickers = covers up to 700 symbols; extras beyond totalSymbols resolve instantly
      if (isAllScan) {
        // ALL 1D: check saved data first
        if (historicalDays === '1D') {
          setStreamingStatus('Checking saved data...')
          const savedAll = await tryLoadFromSavedFiltered(null)
          if (savedAll) {
            const computedSummary: OptionsFlowSummary = {
              total_trades: savedAll.length,
              total_premium: savedAll.reduce((s, t) => s + (t.total_premium || 0), 0),
              unique_symbols: new Set(savedAll.map((t) => t.underlying_ticker)).size,
              trade_types: {
                BLOCK: savedAll.filter((t) => t.trade_type === 'BLOCK').length,
                SWEEP: savedAll.filter((t) => t.trade_type === 'SWEEP').length,
                MINI: savedAll.filter((t) => t.trade_type === 'MINI').length,
                'MULTI-LEG': savedAll.filter((t) => t.trade_type === 'MULTI-LEG').length,
              },
              call_put_ratio: {
                calls: savedAll.filter((t) => t.type?.toLowerCase() === 'call').length,
                puts: savedAll.filter((t) => t.type?.toLowerCase() === 'put').length,
              },
              processing_time_ms: 0,
            }
            setData(savedAll)
            setSummary(computedSummary)
            setLastUpdate(new Date().toLocaleString())
            setIsStreamComplete(true)
            setLoading(false)
            setStreamingStatus('')
            return
          }
          setStreamingStatus('')
        }

        const BATCH = 10
        const MAX_SSE = 75 // 75 × 10 = 750 — covers the full symbol list including ETFs + MAG7
        let totalSymbols = 0
        let scannedCount = 0

        // Opens one SSE, resolves with trades + metadata, never rejects
        const openSSE = (
          offset: number
        ): Promise<{ trades: OptionsFlowData[]; total: number; summary: any; market_info: any }> =>
          new Promise((resolve) => {
            if (cancelRef.current) {
              resolve({ trades: [], total: 0, summary: null, market_info: null })
              return
            }
            const trades: OptionsFlowData[] = []
            let total = 0
            let summary: any = null
            let market_info: any = null

            // Phase 1 excludes ETFs and MAG7 — server skips them entirely
            const sseUrl = `/api/stream-options-flow?ticker=ALL_TICKERS&offset=${offset}&limit=${BATCH}&exclude=${encodeURIComponent(ETF_COMMA + ',' + MAG7_COMMA)}`

            const _chunkStart = Date.now()
            const completedTickers: string[] = []

            const es = new EventSource(sseUrl)
            let resolved = false
            const doResolve = (result: { trades: OptionsFlowData[]; total: number; summary: any; market_info: any }) => {
              if (resolved) return
              resolved = true
              clearTimeout(timeout)
              activeSSEsRef.current.delete(entry)
              es.close()
              resolve(result)
            }
            const entry = { es, abort: () => { doResolve({ trades, total, summary, market_info }) } }
            activeSSEsRef.current.add(entry)
            const timeout = setTimeout(
              () => {
                console.warn(`[SCAN] Chunk offset=${offset} TIMED OUT after 5min — ${trades.length} trades from ${completedTickers.length} tickers. Completed: ${completedTickers.join(', ') || 'none'}`)
                doResolve({ trades, total, summary, market_info })
              },
              5 * 60 * 1000
            )

            es.onmessage = (event) => {
              try {
                const d = JSON.parse(event.data)
                switch (d.type) {
                  case 'ticker_complete': {
                    const incoming: OptionsFlowData[] = d.trades || []
                    trades.push(...incoming)
                    scannedCount++
                    if (d.ticker) completedTickers.push(d.ticker)
                    break
                  }
                  case 'complete':
                    total = d.totalSymbols || 0
                    summary = d.summary || null
                    market_info = d.market_info || null
                    console.log(`[SCAN] Chunk offset=${offset} done in ${((Date.now() - _chunkStart) / 1000).toFixed(1)}s — ${trades.length} trades from ${completedTickers.length} tickers`)
                    doResolve({ trades, total, summary, market_info })
                    break
                  case 'error':
                    console.error(`[SCAN] Chunk offset=${offset} ERROR after ${((Date.now() - _chunkStart) / 1000).toFixed(1)}s:`, d.error || d)
                    doResolve({ trades, total, summary, market_info })
                    break
                  case 'close':
                    doResolve({ trades, total, summary, market_info })
                    break
                }
              } catch (parseErr) {
                console.warn(`[SCAN] Chunk offset=${offset} parse error:`, parseErr)
              }
            }

            es.onerror = (err) => {
              console.error(`[SCAN] Chunk offset=${offset} SSE connection error after ${((Date.now() - _chunkStart) / 1000).toFixed(1)}s — ${trades.length} trades so far`, err)
              doResolve({ trades, total, summary, market_info })
            }
          })

        // ── Ticker sets for phase separation ──────────────────────────────────
        const ETF_TICKERS = new Set(['SPY', 'QQQ', 'DIA', 'IWM', 'XLK', 'SMH', 'XLE', 'XLF', 'XLV', 'XLI', 'XLP', 'XLU', 'XLY', 'XLB', 'XLRE', 'XLC', 'GLD', 'SLV', 'TLT', 'HYG', 'LQD', 'EEM', 'EFA', 'VXX', 'UVXY'])
        const MAG7_TICKERS = new Set(['AAPL', 'NVDA', 'MSFT', 'TSLA', 'AMZN', 'META', 'GOOGL', 'GOOG', 'AVGO', 'MU'])
        const MAG7_COMMA = 'AAPL,NVDA,MSFT,TSLA,AMZN,META,GOOGL,GOOG,AVGO,MU'
        const ETF_COMMA = 'SPY,QQQ,DIA,IWM,XLK,SMH,XLE,XLF,XLV,XLI,XLP,XLU,XLY,XLB,XLRE,XLC,GLD,SLV,TLT,HYG,LQD,EEM,EFA,VXX,UVXY'

        // Opens a comma-list SSE (non-chunked), resolves with trades, never rejects
        const openCommaSSE = (tickerList: string, label: string): Promise<OptionsFlowData[]> =>
          new Promise((resolve) => {
            if (cancelRef.current) { resolve([]); return }
            const trades: OptionsFlowData[] = []
            const url = `/api/stream-options-flow?ticker=${tickerList}`

            const _start = Date.now()
            const _tickersDone: string[] = []

            const es = new EventSource(url)
            let resolved = false
            const doResolve = (result: OptionsFlowData[]) => {
              if (resolved) return
              resolved = true
              clearTimeout(timeout)
              activeSSEsRef.current.delete(entry)
              es.close()
              resolve(result)
            }
            const entry = { es, abort: () => { doResolve(trades) } }
            activeSSEsRef.current.add(entry)
            const timeout = setTimeout(() => {
              console.warn(`[SCAN] ${label} TIMED OUT after 5min — ${trades.length} trades. Completed: ${_tickersDone.join(', ') || 'none'}`)
              doResolve(trades)
            }, 5 * 60 * 1000)
            es.onmessage = (event) => {
              try {
                const d = JSON.parse(event.data)
                if (d.type === 'ticker_complete') {
                  if (d.trades?.length) trades.push(...d.trades)
                  if (d.ticker) _tickersDone.push(d.ticker)
                }
                if (d.type === 'complete') {
                  console.log(`[SCAN] ${label} done in ${((Date.now() - _start) / 1000).toFixed(1)}s — ${trades.length} trades from: ${_tickersDone.join(', ') || 'none'}`)
                  doResolve(trades)
                }
                if (d.type === 'error') {
                  console.error(`[SCAN] ${label} ERROR after ${((Date.now() - _start) / 1000).toFixed(1)}s — ${trades.length} trades so far`)
                  doResolve(trades)
                }
                if (d.type === 'close') { doResolve(trades) }
              } catch { /* ignore parse errors */ }
            }
            es.onerror = () => {
              console.error(`[SCAN] ${label} SSE connection error after ${((Date.now() - _start) / 1000).toFixed(1)}s`)
              doResolve(trades)
            }
          })

        try {
          // ── PHASE 1: ALL tickers except ETFs & MAG7 ───────────────────────
          setStreamingStatus('Phase 1/3 — Scanning all tickers (excluding ETFs & MAG7)...')
          setData([])

          // Discover total symbols first via a single probe chunk
          let probeTotal = 0
          const probeResult = await openSSE(0)
          if (cancelRef.current) return
          probeTotal = probeResult.total || 0


          // Now roll through ALL offsets 10 at a time
          const MAX_CONCURRENT = 10
          const phase1Raw: OptionsFlowData[] = [...probeResult.trades]
          if (probeResult.summary) setSummary(probeResult.summary)
          if (probeResult.market_info) setMarketInfo(probeResult.market_info)

          let offset = BATCH
          while (offset < probeTotal) {
            const groupOffsets: number[] = []
            for (let i = 0; i < MAX_CONCURRENT && offset + i * BATCH < probeTotal; i++) {
              groupOffsets.push(offset + i * BATCH)
            }
            setStreamingStatus(`Phase 1/3 — Scanning tickers ${offset + 1}–${Math.min(offset + groupOffsets.length * BATCH, probeTotal)} of ${probeTotal}...`)
            const groupResults = await Promise.all(groupOffsets.map((off) => openSSE(off)))
            if (cancelRef.current) return
            for (const r of groupResults) {
              phase1Raw.push(...r.trades)
              if (r.summary) setSummary(r.summary)
            }
            offset += groupOffsets.length * BATCH
          }

          // Server already excluded ETFs and MAG7 — no client-side filtering needed
          const phase1Trades = phase1Raw


          // Enrich phase 1 and show immediately
          setStreamingStatus(`Phase 1/3 done — enriching ${phase1Trades.length} trades...`)
          const enriched1 = await enrichTradeDataCombined(phase1Trades)
          if (cancelRef.current) return
          setStreamingStatus('Phase 1/3 — Computing live OI...')
          const withOI1 = applyLiveOI(enriched1)
          setData(withOI1)
          setLastUpdate(new Date().toLocaleString())


          // ── PHASE 2: ETFs ─────────────────────────────────────────────────
          setStreamingStatus('Phase 2/3 — Scanning ETFs (SPY, QQQ, TLT, GLD, SMH...)...')
          const phase2Raw = await openCommaSSE(ETF_COMMA, 'ETF-PHASE')
          if (cancelRef.current) return


          setStreamingStatus(`Phase 2/3 — Enriching ${phase2Raw.length} ETF trades...`)
          const enriched2 = await enrichTradeDataCombined(phase2Raw)
          if (cancelRef.current) return
          setStreamingStatus('Phase 2/3 — Computing live OI for ETFs...')
          const withOI2 = applyLiveOI(enriched2)

          // Merge ETF trades on top of phase 1 (most recent trades appear at top via sort in table)
          setData((prev) => {
            const existingIds = new Set(prev.map((t) => `${t.ticker}-${t.trade_timestamp}-${t.strike}`))
            const newETF = withOI2.filter((t) => !existingIds.has(`${t.ticker}-${t.trade_timestamp}-${t.strike}`))

            return [...prev, ...newETF]
          })
          setLastUpdate(new Date().toLocaleString())


          // ── PHASE 3: MAG7 ─────────────────────────────────────────────────
          setStreamingStatus('Phase 3/3 — Scanning MAG7 (AAPL, NVDA, MSFT, TSLA, AMZN, META, GOOGL)...')
          const phase3Raw = await openCommaSSE(MAG7_COMMA, 'MAG7-PHASE')
          if (cancelRef.current) return


          setStreamingStatus(`Phase 3/3 — Enriching ${phase3Raw.length} MAG7 trades...`)
          const enriched3 = await enrichTradeDataCombined(phase3Raw)
          if (cancelRef.current) return
          setStreamingStatus('Phase 3/3 — Computing live OI for MAG7...')
          const withOI3 = applyLiveOI(enriched3)

          // Merge MAG7 trades
          setData((prev) => {
            const existingIds = new Set(prev.map((t) => `${t.ticker}-${t.trade_timestamp}-${t.strike}`))
            const newMAG7 = withOI3.filter((t) => !existingIds.has(`${t.ticker}-${t.trade_timestamp}-${t.strike}`))

            return [...prev, ...newMAG7]
          })

          setIsStreamComplete(true)
          setLoading(false)
          setLastUpdate(new Date().toLocaleString())
          setStreamingStatus('')

        } catch (allScanErr) {
          const msg = allScanErr instanceof Error ? allScanErr.message : 'ALL scan failed'
          console.error('[ALL SCAN] Error:', msg)
          setStreamError(msg)
          setLoading(false)
          setStreamingStatus('')
        }
        return // Don't fall through to single-EventSource path
      }

      // Single-ticker / MAG7 / ETF scan ─────────────────────────────────────
      const tfParam = historicalDays !== '1D' ? `&timeframe=${historicalDays}` : ''
      const eventSource = new EventSource(`/api/stream-options-flow?ticker=${tickerParam}${tfParam}`)

      eventSource.onopen = () => { }

      // Timeout: if no 'complete' or 'error' within 5 min, something stalled
      const stallTimeout = setTimeout(
        () => {
          console.error('[STREAM] Stall detected — no completion after 5 minutes')
          eventSource.close()
          setStreamError('Scan timed out after 5 minutes')
          setStreamingStatus('')
          setLoading(false)
        },
        5 * 60 * 1000
      )

      eventSource.onmessage = (event) => {
        try {
          const streamData = JSON.parse(event.data)

          switch (streamData.type) {
            case 'connected':
              setStreamingStatus('Connected - scanning options flow...')
              setStreamError('')
              break

            case 'status':
              setStreamingStatus(streamData.message)
              break

            case 'trades':
              if (streamData.trades && streamData.trades.length > 0) {
                setData((prevData) => {
                  const existingTradeIds = new Set(
                    prevData.map(
                      (trade: OptionsFlowData) =>
                        `${trade.ticker}-${trade.trade_timestamp}-${trade.strike}`
                    )
                  )
                  const newTrades = (streamData.trades as OptionsFlowData[]).filter(
                    (trade: OptionsFlowData) => {
                      const tradeId = `${trade.ticker}-${trade.trade_timestamp}-${trade.strike}`
                      return !existingTradeIds.has(tradeId)
                    }
                  )
                  return [...prevData, ...newTrades]
                })
              }
              setStreamingStatus(streamData.status)
              if (streamData.progress) {
                setStreamingProgress({
                  current: streamData.progress.current,
                  total: streamData.progress.total,
                })
              }
              break

            case 'ticker_complete': {
              const incoming = streamData.trades || []
              if (incoming.length > 0) {
                setData((prevData) => {
                  const existingIds = new Set(
                    prevData.map(
                      (t: OptionsFlowData) => `${t.ticker}-${t.trade_timestamp}-${t.strike}`
                    )
                  )
                  const newTrades = incoming.filter(
                    (t: OptionsFlowData) =>
                      !existingIds.has(`${t.ticker}-${t.trade_timestamp}-${t.strike}`)
                  )
                  return [...prevData, ...newTrades]
                })
              }
              break
            }

            case 'complete':
              clearTimeout(stallTimeout)
              setIsStreamComplete(true)
              eventSource.close()
              setSummary(streamData.summary)
              if (streamData.market_info) setMarketInfo(streamData.market_info)
              setLastUpdate(new Date().toLocaleString())
              setStreamingProgress(null)
              setStreamError('')
              setStreamingStatus('Enriching vol/OI & fill style...')
              setData((rawTrades) => {
                enrichTradeDataCombined(rawTrades, (partial) => {
                  setData(partial)
                }).then((final) => {
                  setStreamingStatus('Computing live OI...')
                  setData(applyLiveOI(final))
                  setLoading(false)
                  setStreamingStatus('')
                })
                return rawTrades
              })
              break

            case 'error':
              console.error(`[STREAM] Server error: ${streamData.error}`)
              clearTimeout(stallTimeout)
              setStreamError(streamData.error || 'Stream error occurred')
              setLoading(false)
              eventSource.close()
              break

            case 'close':
              clearTimeout(stallTimeout)
              setIsStreamComplete(true)
              eventSource.close()
              break

            case 'heartbeat':
              break

            default:
              console.warn(`[STREAM] Unknown message type: "${streamData.type}"`)
          }
        } catch (parseError) {
          console.error('[STREAM] Failed to parse message:', parseError)
        }
      }

      eventSource.onerror = (error) => {
        clearTimeout(stallTimeout)

        if (isStreamComplete) {
          eventSource.close()
          return
        }

        if (eventSource.readyState === 2) {
          eventSource.close()
          setStreamingStatus('')
          setLoading(false)
          return
        }

        console.error('[STREAM] onerror fired:', error)

        if (eventSource.readyState === 0) {
          eventSource.close()
          setStreamError('Stream connection failed')
          setStreamingStatus('')
          setLoading(false)
          return
        }

        eventSource.close()
        setStreamingStatus('')
        setLoading(false)
      }
    } catch (error) {
      console.error('Error starting stream:', error)
      setLoading(false)
      // Fallback to regular API
      fetchOptionsFlow()
    }
  }

  const fetchOptionsFlow = async () => {
    setLoading(true)
    setStreamError('')
    try {
      // Map scan categories to appropriate ticker parameter
      let tickerParam = selectedTicker
      if (selectedTicker === 'MAG7') {
        tickerParam = 'AAPL,NVDA,MSFT,TSLA,AMZN,META,GOOGL,GOOG'
      } else if (selectedTicker === 'ETF') {
        tickerParam =
          'SPY,QQQ,DIA,IWM,XLK,SMH,XLE,XLF,XLV,XLI,XLP,XLU,XLY,XLB,XLRE,XLC,GLD,SLV,TLT,HYG,LQD,EEM,EFA,VXX,UVXY'
      } else if (selectedTicker === 'ALL') {
        // Use the unified ALL_TICKERS param (includes ETFs + MAG7) to match streaming behavior
        tickerParam = 'ALL_TICKERS'
      }
      // Otherwise use the ticker as-is for individual ticker searches

      // Fetch fresh live data only
      const response = await fetch(`/api/live-options-flow?ticker=${tickerParam}`)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMsg = errorData.error || `HTTP error! status: ${response.status}`
        const suggestion = errorData.suggestion || ''
        throw new Error(`${errorMsg}${suggestion ? ' - ' + suggestion : ''}`)
      }

      const result = await response.json()

      if (result.success) {
        const trades = result.trades || result.data || []
        setData(trades)
        setSummary(result.summary)
        if (result.market_info) {
          setMarketInfo(result.market_info)
        }
        setLastUpdate(new Date().toLocaleString())
      } else {
        console.error('Failed to fetch options flow:', result.error)
        // Set empty data on error to prevent stale data display
        setData([])
        setSummary({
          total_trades: 0,
          total_premium: 0,
          unique_symbols: 0,
          trade_types: { BLOCK: 0, SWEEP: 0, MINI: 0, 'MULTI-LEG': 0 },
          call_put_ratio: { calls: 0, puts: 0 },
          processing_time_ms: 0,
        })
      }
    } catch (error) {
      console.error('Error fetching options flow:', error)
      // Set empty data on network error
      setData([])
      setSummary({
        total_trades: 0,
        total_premium: 0,
        unique_symbols: 0,
        trade_types: { BLOCK: 0, SWEEP: 0, MINI: 0, 'MULTI-LEG': 0 },
        call_put_ratio: { calls: 0, puts: 0 },
        processing_time_ms: 0,
      })
    } finally {
      setLoading(false)
    }
  }

  // NO AUTO-SCAN - User must manually trigger scan
  // useEffect removed - scan only on explicit user action

  const handleRefresh = (tickerOverride?: string) => {
    setStreamError('')
    setIsStreamComplete(false)
    fetchOptionsFlowStreaming(tickerOverride)
  }

  const handleCancel = () => {
    cancelRef.current = true
    let closed = 0
    for (const entry of activeSSEsRef.current) {
      try { entry.abort(); closed++ } catch { /* ignore */ }
    }
    activeSSEsRef.current.clear()
    setLoading(false)
    setStreamingStatus('')
    setStreamingProgress(null)
  }

  const handleClearData = () => {
    // Clear existing data and start fresh
    setData([])
    setSummary({
      total_trades: 0,
      total_premium: 0,
      unique_symbols: 0,
      trade_types: { BLOCK: 0, SWEEP: 0, MINI: 0, 'MULTI-LEG': 0 },
      call_put_ratio: { calls: 0, puts: 0 },
      processing_time_ms: 0,
    })
  }

  const handleDateChange = (newDate: string) => {
    fetchOptionsFlowStreaming()
  }

  if (showAlgoFlow) {
    return (
      <div style={{ position: 'fixed', top: 119, left: 0, right: 0, bottom: 0, zIndex: 10001, display: 'flex', flexDirection: 'column', background: '#000' }}>
        <AlgoFlowScreener onBack={() => setShowAlgoFlow(false)} />
      </div>
    )
  }

  return (
    <div className="bg-black text-white">
      {/* Main Content */}
      <div className="p-0">
        <style jsx>{`
          @media (max-width: 768px) {
            :global(.main-content) {
              padding-top: 0 !important;
              margin-top: -30px !important;
            }
          }
        `}</style>
        <OptionsFlowTable
          data={data}
          summary={summary}
          marketInfo={marketInfo}
          loading={loading}
          onRefresh={handleRefresh}
          onClearData={handleClearData}
          onCancel={handleCancel}
          onDataUpdate={(d) => setData(d as OptionsFlowData[])}
          selectedTicker={selectedTicker}
          onTickerChange={setSelectedTicker}
          streamingStatus={streamingStatus}
          streamingProgress={streamingProgress}
          streamError={streamError}
          historicalDays={historicalDays}
          onHistoricalDaysChange={setHistoricalDays}
          onAlgoFlowClick={() => setShowAlgoFlow(true)}
        />
      </div>
    </div>
  )
}
