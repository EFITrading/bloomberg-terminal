'use client'

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  ComposedChart,
  Customized,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import React, { useEffect, useMemo, useRef, useState } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import TradingViewChart from './trading/EFICharting'

// Polygon API key for bid/ask analysis
const POLYGON_API_KEY = process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''

// Function to fetch volume and open interest data for trades
const fetchVolumeAndOpenInterest = async (
  trades: OptionsFlowData[]
): Promise<OptionsFlowData[]> => {
  console.log(`🔍 Fetching volume/OI data for ${trades.length} trades`)

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
    // Declare current spot price variable for this underlying
    let currentSpotPrice: number | null = null

    try {
      console.log(`📊 Fetching option chain for ${underlying} (${underlyingTrades.length} trades)`)

      // First, get the current spot price for this underlying - this will be overridden by contract data if available
      try {
        const spotPriceUrl =
          underlying === 'SPX'
            ? `https://api.polygon.io/v2/last/trade/SPX?apikey=${POLYGON_API_KEY}`
            : `https://api.polygon.io/v2/last/trade/${underlying}?apikey=${POLYGON_API_KEY}`

        console.log(`💰 Fetching current ${underlying} price as fallback...`)
        const priceResponse = await fetch(spotPriceUrl)
        if (priceResponse.ok) {
          const priceData = await priceResponse.json()
          if (priceData.status === 'OK' && priceData.results) {
            currentSpotPrice = priceData.results.p
            console.log(`✅ Fallback ${underlying} price: $${currentSpotPrice}`)
          }
        }
      } catch (error) {
        console.warn(`⚠️ Failed to fetch ${underlying} spot price fallback:`, error)
      }

      // Get unique expiration dates for this underlying to fetch specific expirations
      const uniqueExpirations = [...new Set(underlyingTrades.map((t) => t.expiry))]
      console.log(`📅 Unique expirations for ${underlying}:`, uniqueExpirations)

      const allContracts = new Map()

      // Fetch data for each expiration date separately to get all contracts WITH FULL PAGINATION
      for (const expiry of uniqueExpirations) {
        const expiryParam = expiry.includes('T') ? expiry.split('T')[0] : expiry
        console.log(
          `📊 Fetching ${underlying} contracts for expiry: ${expiryParam} WITH FULL PAGINATION`
        )

        // Use underlying ticker directly (SPX works as-is)
        const apiUnderlying = underlying

        // FULL PAGINATION LOGIC - Get ALL contracts for this expiration
        let nextUrl: string | null =
          `https://api.polygon.io/v3/snapshot/options/${apiUnderlying}?expiration_date=${expiryParam}&limit=250&apikey=${POLYGON_API_KEY}`
        let totalContractsForExpiry = 0

        while (nextUrl && totalContractsForExpiry < 10000) {
          // Safety limit
          console.log(`🔄 Paginating: ${nextUrl}`)
          const response: Response = await fetch(nextUrl)

          if (response.ok) {
            const chainData: any = await response.json()
            if (chainData.results && chainData.results.length > 0) {
              // Get SPX price from the first contract's underlying_asset.value
              if (!currentSpotPrice && chainData.results[0]?.underlying_asset?.value) {
                currentSpotPrice = chainData.results[0].underlying_asset.value
                console.log(`💰 ${underlying} Price from contract data: $${currentSpotPrice}`)
              }

              chainData.results.forEach((contract: any, index: number) => {
                if (contract.details && contract.details.ticker) {
                  allContracts.set(contract.details.ticker, {
                    volume: contract.day?.volume || 0,
                    open_interest: contract.open_interest || 0,
                  })

                  // Debug first few contracts to see the format
                  if (index < 3) {
                    console.log(
                      `🏷️ API Contract ${index}: ${contract.details.ticker}, Vol=${contract.day?.volume || 0}, OI=${contract.open_interest || 0}`
                    )
                  }
                }
              })
              totalContractsForExpiry += chainData.results.length
              console.log(
                `  📈 Added ${chainData.results.length} contracts, total for ${expiryParam}: ${totalContractsForExpiry}`
              )

              // Check for next page
              nextUrl = chainData.next_url
                ? `${chainData.next_url}&apikey=${POLYGON_API_KEY}`
                : null
            } else {
              console.log(`  ✅ No more results for ${expiryParam}`)
              break
            }
          } else {
            console.warn(
              `  ⚠️ Failed to fetch ${underlying} for ${expiryParam}: ${response.status}`
            )
            break
          }

          // Small delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 50))
        }

        console.log(
          `✅ COMPLETED PAGINATION for ${expiryParam}: ${totalContractsForExpiry} total contracts`
        )
      }

      console.log(`✅ Total contracts loaded for ${underlying}: ${allContracts.size}`)

      // Debug: Show sample contracts with volume/OI
      const sampleContractsWithData = Array.from(allContracts.entries())
        .filter(([_, data]) => data.volume > 0 || data.open_interest > 0)
        .slice(0, 5)
      console.log(
        `📊 Sample contracts with Vol/OI data:`,
        sampleContractsWithData.map(
          ([ticker, data]) => `${ticker}: Vol=${data.volume}, OI=${data.open_interest}`
        )
      )

      // Skip if no contracts found for any expiration
      if (allContracts.size === 0) {
        console.warn(`⚠️ No option chain data found for any expiration of ${underlying}`)
        updatedTrades.push(
          ...underlyingTrades.map((trade) => ({
            ...trade,
            volume: 0,
            open_interest: 0,
            spot_price: currentSpotPrice || trade.spot_price, // Use current spot price if available
          }))
        )
        continue
      }

      // Use the aggregated contracts for lookup
      const contractLookup = allContracts

      // Debug: Show first few contracts from API
      const contractKeys = Array.from(contractLookup.keys()).slice(0, 5)
      console.log(`📋 Sample contracts from API: ${contractKeys.join(', ')}`)

      // Match trades to contracts and update with vol/OI data
      for (const trade of underlyingTrades) {
        console.log(`🔍 Looking for contract using trade.ticker: ${trade.ticker}`)

        // First try: Use the ticker directly from the trade (like DealerAttraction does)
        let contractData = contractLookup.get(trade.ticker)

        if (!contractData) {
          // Second try: Generate the option ticker format that matches Polygon API
          const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'

          // Handle date parsing properly - parse as local date to avoid timezone issues
          let expiryDate
          if (trade.expiry.includes('T')) {
            // If it has time component, parse as is
            expiryDate = new Date(trade.expiry)
          } else {
            // If it's just a date string like "2025-10-31", parse as local date
            const [year, month, day] = trade.expiry.split('-').map(Number)
            expiryDate = new Date(year, month - 1, day) // month is 0-based in JS
          }

          const formattedExpiry = `${expiryDate.getFullYear().toString().slice(-2)}${(expiryDate.getMonth() + 1).toString().padStart(2, '0')}${expiryDate.getDate().toString().padStart(2, '0')}`
          const formattedStrike = Math.round(trade.strike * 1000)
            .toString()
            .padStart(8, '0')
          // Use underlying ticker directly (SPX works as-is)
          const tickerUnderlying = underlying
          const optionTicker = `O:${tickerUnderlying}${formattedExpiry}${optionType}${formattedStrike}`

          console.log(
            `🔍 Trying constructed ticker: ${optionTicker} (from expiry: ${trade.expiry}, strike: ${trade.strike})`
          )
          contractData = contractLookup.get(optionTicker)
        }

        if (contractData) {
          updatedTrades.push({
            ...trade,
            volume: contractData.volume,
            open_interest: contractData.open_interest,
            spot_price: currentSpotPrice || trade.spot_price, // Use current spot price if available
          })
          console.log(
            `✅ FOUND contract: Vol=${contractData.volume}, OI=${contractData.open_interest}, Spot=$${currentSpotPrice || trade.spot_price}`
          )
        } else {
          // Contract not found - show more debug info
          console.log(`❌ NOT FOUND: ${trade.ticker}`)
          console.log(`🔍 Trade details:`, {
            ticker: trade.ticker,
            underlying: trade.underlying_ticker,
            strike: trade.strike,
            expiry: trade.expiry,
            type: trade.type,
          })

          // Show a few actual tickers for comparison
          const allTickers = Array.from(contractLookup.keys()).slice(0, 10)
          console.log(`📋 First 10 actual tickers in lookup:`, allTickers)

          updatedTrades.push({
            ...trade,
            volume: 0,
            open_interest: 0,
            spot_price: currentSpotPrice || trade.spot_price, // Use current spot price if available
          })
        }
      }
    } catch (error) {
      console.error(`❌ Error fetching vol/OI for ${underlying}:`, error)
      // Add trades without vol/OI data on error, but with current spot price if available
      updatedTrades.push(
        ...underlyingTrades.map((trade) => ({
          ...trade,
          volume: 0,
          open_interest: 0,
          spot_price: currentSpotPrice || trade.spot_price, // Use current spot price if available
        }))
      )
    }
  }

  console.log(`✅ Volume/OI fetch complete for ${updatedTrades.length} trades`)
  return updatedTrades
}

// Calculate Live Open Interest based on fill styles
// Cache for Live OI calculations to avoid recalculating for same contract
const liveOICache = new Map<string, number>()

const calculateLiveOI = (originalOI: number, trades: any[], contractKey: string): number => {
  // SIMPLIFIED: Just return the original OI since fill styles are unreliable
  // The OI from Polygon is already the most current available

  console.log(`� LIVE OI (SIMPLIFIED): ${contractKey} - Returning original OI: ${originalOI}`)

  if (!trades || trades.length === 0) {
    return originalOI
  }

  // Filter trades for this specific contract
  const contractTrades = trades.filter((trade) => {
    const tradeKey = `${trade.underlying_ticker}_${trade.strike}_${trade.type}_${trade.expiry}`
    return tradeKey === contractKey
  })

  if (contractTrades.length === 0) {
    return originalOI
  }

  let liveOI = originalOI

  // Sort trades by timestamp to process chronologically
  const sortedTrades = [...contractTrades].sort(
    (a, b) => new Date(a.trade_timestamp).getTime() - new Date(b.trade_timestamp).getTime()
  )

  // Process each unique trade - AVOID DUPLICATES
  const processedTradeIds = new Set<string>()

  sortedTrades.forEach((trade) => {
    // Create unique identifier
    const tradeId = `${trade.underlying_ticker}_${trade.strike}_${trade.type}_${trade.expiry}_${trade.trade_timestamp}_${trade.trade_size}_${trade.premium_per_contract}`

    if (processedTradeIds.has(tradeId)) {
      console.log(`⚠️ SKIPPING DUPLICATE: ${tradeId}`)
      return
    }

    processedTradeIds.add(tradeId)

    const contracts = trade.trade_size || 0
    const fillStyle = trade.fill_style

    console.log(
      `🔄 ${new Date(trade.trade_timestamp).toLocaleTimeString()} - ${contracts} contracts, Fill: ${fillStyle}, Before OI: ${liveOI}`
    )

    switch (fillStyle) {
      case 'A': // Add to OI (opening)
      case 'AA': // Add to OI (opening)
      case 'BB': // Add to OI (opening)
        liveOI += contracts
        console.log(`✅ ADDED ${contracts} -> New OI: ${liveOI}`)
        break
      case 'B': // Smart B fill logic
        if (contracts > originalOI) {
          // If B fill exceeds original OI, it's actually opening positions
          liveOI += contracts
          console.log(
            `🔄 B FILL EXCEEDS ORIGINAL OI: ADDED ${contracts} (${contracts} > ${originalOI}) -> New OI: ${liveOI}`
          )
        } else {
          // Normal B fill - closing positions
          liveOI -= contracts
          console.log(`❌ SUBTRACTED ${contracts} -> New OI: ${liveOI}`)
        }
        break
      default:
        console.log(`⚪ NO CHANGE for fill: ${fillStyle}`)
        break
    }
  })

  console.log(
    `📊 FINAL: ${contractKey} - Original: ${originalOI}, Final: ${liveOI}, Processed: ${processedTradeIds.size} trades`
  )

  return Math.max(0, liveOI)
}

// YOUR REAL SWEEP DETECTION: EXACT SAME LOGIC as optionsFlowService detectSweeps
const detectSweepsAndBlocks = (trades: any[]): any[] => {
  if (trades.length === 0) return []

  // Processing trades from YOUR API

  // Sort trades by timestamp
  trades.sort(
    (a, b) => new Date(a.trade_timestamp).getTime() - new Date(b.trade_timestamp).getTime()
  )

  // Group trades by exact timestamp AND contract (SAME AS YOUR MAIN FLOW SCREENER)
  const exactTimeGroups = new Map<string, any[]>()

  for (const trade of trades) {
    // YOUR SPECIFICATION: 3-second window grouping + contract as key for grouping
    const contractKey = `${trade.underlying_ticker}_${trade.strike}_${trade.type}_${trade.expiry}`
    const timeInMs = new Date(trade.trade_timestamp).getTime()
    const threeSecondWindow = Math.floor(timeInMs / 3000) * 3000 // Group into 3-second windows
    const groupKey = `${contractKey}_${threeSecondWindow}`

    if (!exactTimeGroups.has(groupKey)) {
      exactTimeGroups.set(groupKey, [])
    }
    exactTimeGroups.get(groupKey)!.push(trade)
  }

  const categorizedTrades: any[] = []
  let sweepCount = 0
  let blockCount = 0

  // Process each 3-second window group - EXACTLY LIKE YOUR MAIN FLOW SCREENER
  exactTimeGroups.forEach((tradesInGroup, groupKey) => {
    const totalContracts = tradesInGroup.reduce((sum, t) => sum + t.trade_size, 0)
    const totalPremium = tradesInGroup.reduce((sum, t) => sum + t.total_premium, 0)
    // IMPROVED: Handle multiple exchange field formats and null/undefined values
    const exchanges = [
      ...new Set(
        tradesInGroup
          .map((t) => {
            // Try multiple possible exchange fields
            return t.exchange || t.exchange_name || t.exchange_id || 'UNKNOWN'
          })
          .filter((ex) => ex && ex !== 'UNKNOWN')
      ),
    ] // Filter out null/undefined/UNKNOWN

    const representativeTrade = tradesInGroup[0]

    // ENHANCED LOGIC: Handle case where exchange data is missing
    if (exchanges.length >= 2) {
      // SWEEP: 2+ exchanges involved (regardless of amounts) - COMBINE INTO SINGLE TRADE
      sweepCount++
      const weightedPrice =
        tradesInGroup.reduce((sum, trade) => {
          return sum + trade.premium_per_contract * trade.trade_size
        }, 0) / totalContracts

      const sweepTrade = {
        ...representativeTrade,
        trade_size: totalContracts,
        premium_per_contract: weightedPrice,
        total_premium: totalPremium,
        trade_type: 'SWEEP',
        exchange_name: `MULTI-EXCHANGE (${tradesInGroup.length} fills across ${exchanges.length} exchanges)`,
        window_group: `sweep_${groupKey}`,
        related_trades: exchanges.map((ex) => `${ex}`),
      }

      categorizedTrades.push(sweepTrade)
    } else if (exchanges.length === 1) {
      // Single exchange: BLOCK if $50K+, MINI if <$50K - COMBINE INTO SINGLE TRADE
      // Calculate proper weighted average price per contract
      const correctWeightedPrice =
        tradesInGroup.reduce((sum, trade) => {
          return sum + trade.premium_per_contract * trade.trade_size
        }, 0) / totalContracts

      const combinedTrade = {
        ...representativeTrade,
        trade_size: totalContracts,
        premium_per_contract: correctWeightedPrice,
        total_premium: totalPremium,
        trade_type: totalPremium >= 50000 ? 'BLOCK' : 'MINI',
        exchange_name: representativeTrade.exchange_name || `Exchange ${exchanges[0]}`,
        window_group: totalPremium >= 50000 ? `block_${groupKey}` : `mini_${groupKey}`,
        related_trades: [],
      }

      if (totalPremium >= 50000) {
        blockCount++
      }

      categorizedTrades.push(combinedTrade)
    }
  })

  const miniCount = categorizedTrades.filter((t) => t.trade_type === 'MINI').length
  return categorizedTrades
}

// No EFI criteria needed - pure classification logic

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
  trade_type: 'SWEEP' | 'BLOCK' | 'MINI'
  trade_timestamp: string
  moneyness: 'ATM' | 'ITM' | 'OTM'
  days_to_expiry: number
  fill_style?: 'A' | 'B' | 'AA' | 'BB' | 'N/A'
  volume?: number
  open_interest?: number
}

interface AlgoFlowAnalysis {
  ticker: string
  currentPrice: number
  algoFlowScore: number
  totalCallPremium: number
  totalPutPremium: number
  netFlow: number
  sweepCount: number
  blockCount: number
  miniCount: number
  // No EFI highlights needed
  callPutRatio: number
  aggressiveCalls: number
  aggressivePuts: number
  flowTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  chartData: Array<{
    time: number // Timestamp for proper x-axis formatting
    timeLabel: string // Original time string for reference
    callsPlus: number // Bullish call buying
    callsMinus: number // Bearish call selling
    putsPlus: number // Bullish put buying
    putsMinus: number // Bearish put selling
    netFlow: number
    bullishTotal: number // Combined bullish calls + bullish puts
    bearishTotal: number // Combined bearish calls + bearish puts
  }>
  priceData: Array<{
    time: number // Timestamp for proper x-axis formatting
    open: number
    high: number
    low: number
    close: number
  }>
  // YOUR REAL TIER SYSTEM
  tier1Count: number
  tier2Count: number
  tier3Count: number
  tier4Count: number
  tier5Count: number
  tier6Count: number
  tier7Count: number
  tier8Count: number
  // Trades with fill_style
  trades: any[]
}

// BID/ASK EXECUTION ANALYSIS - Same logic as OptionsFlowTable intentions button
// Lightning-fast analysis for massive datasets using pure statistical inference
const normalizeTickerForOptions = (ticker: string) => {
  const specialCases: Record<string, string> = { 'BRK.B': 'BRK', 'BF.B': 'BF' }
  return specialCases[ticker] || ticker
}

const buildOptionTicker = (trade: any): string => {
  const expiry = trade.expiry.replace(/-/g, '').slice(2)
  const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0')
  const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'
  return `O:${normalizeTickerForOptions(trade.underlying_ticker)}${expiry}${optionType}${strikeFormatted}`
}

async function runWithConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let index = 0
  async function worker() {
    while (index < tasks.length) {
      const i = index++
      results[i] = await tasks[i]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
  return results
}

const computeFillStyle = (fillPrice: number, bid: number, ask: number): string => {
  const midpoint = (bid + ask) / 2
  if (fillPrice >= ask + 0.01) return 'AA'
  if (fillPrice <= bid - 0.01) return 'BB'
  if (fillPrice === ask) return 'A'
  if (fillPrice === bid) return 'B'
  return fillPrice >= midpoint ? 'A' : 'B'
}

const analyzeBidAskExecutionLightning = async (trades: any[]): Promise<any[]> => {
  if (trades.length === 0) return trades

  console.log(
    `⚡ BID/ASK ANALYSIS: fetching per-trade quotes at execution timestamp for ${trades.length} trades`
  )

  // Build deduplicated batch payload — unique by contract+second bucket
  // Use trade.ticker directly — it's the correct OCC ticker from Polygon (e.g. O:SPXW260325C...)
  // buildOptionTicker() produces wrong format for SPX (missing W in SPXW), so never use it for quote lookups
  type QuoteKey = string
  const uniqueQuotes = new Map<QuoteKey, { contract: string; timestamp_ns: number }>()
  for (const trade of trades) {
    const contract = trade.ticker // correct OCC ticker from Polygon
    const tradeMs =
      typeof trade.trade_timestamp === 'number'
        ? trade.trade_timestamp
        : new Date(trade.trade_timestamp).getTime()
    const timestampNs = tradeMs * 1_000_000
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

  return trades.map((trade) => {
    const contract = trade.ticker // correct OCC ticker from Polygon
    const tradeMs =
      typeof trade.trade_timestamp === 'number'
        ? trade.trade_timestamp
        : new Date(trade.trade_timestamp).getTime()
    const timestampNs = tradeMs * 1_000_000
    const key: QuoteKey = `${contract}:${Math.floor(timestampNs / 1_000_000_000)}`
    const quote = quoteResultMap.get(key) ?? null
    if (quote) {
      return {
        ...trade,
        fill_style: computeFillStyle(trade.premium_per_contract, quote.bid, quote.ask),
      }
    }
    return { ...trade, fill_style: 'N/A' }
  })
}
const analyzeBidAskExecutionAdvanced = async (trades: any[]): Promise<any[]> => {
  console.log(`� Starting ULTRA-FAST parallel bid/ask analysis for ${trades.length} trades`)

  if (trades.length === 0) return trades

  // Process ALL trades - no sampling for accurate fill_style classification
  const tradesToAnalyze = trades
  const useStatisticalInference = false

  console.log(`📊 Processing ALL ${tradesToAnalyze.length} trades for accurate fill_style analysis`)

  // Create optimal batches for parallel processing
  const BATCH_SIZE = 20 // Optimal batch size for API rate limits
  const MAX_CONCURRENT_BATCHES = 5 // Limit concurrent batches to avoid overwhelming API

  const batches = []
  for (let i = 0; i < tradesToAnalyze.length; i += BATCH_SIZE) {
    batches.push(tradesToAnalyze.slice(i, i + BATCH_SIZE))
  }

  console.log(
    `⚡ Processing ${batches.length} batches with max ${MAX_CONCURRENT_BATCHES} concurrent batches`
  )

  // Process batches in controlled parallel chunks
  const allResults: any[] = []
  const totalChunks = Math.ceil(batches.length / MAX_CONCURRENT_BATCHES)

  for (let i = 0; i < batches.length; i += MAX_CONCURRENT_BATCHES) {
    const currentChunk = Math.floor(i / MAX_CONCURRENT_BATCHES) + 1
    const batchChunk = batches.slice(i, i + MAX_CONCURRENT_BATCHES)
    console.log(
      `🔄 Processing batch chunk ${currentChunk}/${totalChunks} (${batchChunk.length} batches)`
    )

    // Update progress if possible (would need to pass callback from component)
    if (typeof window !== 'undefined' && (window as any).updateAnalysisProgress) {
      ; (window as any).updateAnalysisProgress(currentChunk, totalChunks)
    }
    const chunkResults = await Promise.allSettled(
      batchChunk.map(async (batch, batchIndex) => {
        const actualBatchIndex = i + batchIndex

        // Process trades in this batch in parallel
        const batchResults = await Promise.allSettled(
          batch.map(async (trade) => {
            try {
              // Create option ticker format
              const expiry = trade.expiry.replace(/-/g, '').slice(2)
              const strikeFormatted = String(Math.round(trade.strike * 1000)).padStart(8, '0')
              const optionType = trade.type.toLowerCase() === 'call' ? 'C' : 'P'
              const optionTicker = `O:${trade.underlying_ticker}${expiry}${optionType}${strikeFormatted}`

              // Quick timeout to avoid hanging
              const controller = new AbortController()
              const timeoutId = setTimeout(() => controller.abort(), 2000) // 2 second timeout

              const tradeTime = new Date(trade.trade_timestamp)
              const checkTime = new Date(tradeTime.getTime() + 1000) // 1 second AFTER trade
              const checkTimestamp = checkTime.getTime() * 1000000

              const quotesUrl = `https://api.polygon.io/v3/quotes/${optionTicker}?timestamp.gte=${checkTimestamp}&limit=1&apikey=${process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''}`

              const response = await fetch(quotesUrl, {
                signal: controller.signal,
                headers: { Accept: 'application/json' },
              })

              clearTimeout(timeoutId)

              if (!response.ok) throw new Error(`HTTP ${response.status}`)

              const data = await response.json()

              if (data.results && data.results.length > 0) {
                const quote = data.results[0]
                const bid = quote.bid_price
                const ask = quote.ask_price
                const fillPrice = trade.premium_per_contract

                if (bid && ask && fillPrice && bid > 0 && ask > 0) {
                  const tolerance = 0.02
                  const mid = (bid + ask) / 2

                  if (Math.abs(fillPrice - ask) <= tolerance || fillPrice > ask) {
                    trade.executionType = 'BULLISH'
                  } else if (fillPrice >= mid) {
                    trade.executionType = 'BULLISH'
                  } else if (Math.abs(fillPrice - bid) <= tolerance || fillPrice < bid) {
                    trade.executionType = 'BEARISH'
                  } else {
                    trade.executionType = 'NEUTRAL'
                  }
                } else {
                  trade.executionType = 'NEUTRAL'
                }
              } else {
                trade.executionType = 'NEUTRAL'
              }

              return trade
            } catch (error) {
              trade.executionType = 'NEUTRAL'
              return trade
            }
          })
        )

        return batchResults
          .map((result) => (result.status === 'fulfilled' ? result.value : null))
          .filter(Boolean)
      })
    )

    // Collect results from this chunk
    chunkResults.forEach((result) => {
      if (result.status === 'fulfilled') {
        allResults.push(...result.value)
      }
    })

    // Small delay between chunks to respect rate limits
    if (i + MAX_CONCURRENT_BATCHES < batches.length) {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }

  // Create execution type map from analyzed trades
  const executionMap = new Map()
  allResults.flat().forEach((trade) => {
    const key = `${trade.underlying_ticker}_${trade.strike}_${trade.expiry}_${trade.type}_${trade.trade_timestamp}`
    executionMap.set(key, trade.executionType)
  })

  // Apply intelligent inference to all trades
  const finalTrades = trades.map((trade) => {
    const key = `${trade.underlying_ticker}_${trade.strike}_${trade.expiry}_${trade.type}_${trade.trade_timestamp}`

    if (executionMap.has(key)) {
      // Use actual analysis result
      trade.executionType = executionMap.get(key)
    } else if (useStatisticalInference) {
      // Intelligent inference based on trade characteristics and market patterns
      const isLargeTrade = trade.total_premium > 100000
      const isHugeTrade = trade.total_premium > 500000
      const isNearMoney = Math.abs(trade.strike - trade.spot_price) / trade.spot_price < 0.05
      const isFarOTM = Math.abs(trade.strike - trade.spot_price) / trade.spot_price > 0.15

      // Analyze similar trades that were actually processed
      const similarTrades = allResults
        .flat()
        .filter(
          (analyzedTrade) =>
            analyzedTrade.underlying_ticker === trade.underlying_ticker &&
            analyzedTrade.type === trade.type &&
            Math.abs(analyzedTrade.strike - trade.strike) / trade.strike < 0.1 &&
            Math.abs(analyzedTrade.total_premium - trade.total_premium) /
            Math.max(trade.total_premium, 1) <
            0.5
        )

      if (similarTrades.length > 0) {
        // Use the most common execution type from similar trades
        const executionCounts = { BULLISH: 0, BEARISH: 0, NEUTRAL: 0 }
        similarTrades.forEach(
          (st) => executionCounts[st.executionType as keyof typeof executionCounts]++
        )
        trade.executionType = Object.entries(executionCounts).reduce((a, b) =>
          executionCounts[a[0] as keyof typeof executionCounts] >
            executionCounts[b[0] as keyof typeof executionCounts]
            ? a
            : b
        )[0]
      } else if (isHugeTrade && isNearMoney) {
        // Huge near-the-money trades are usually aggressive
        trade.executionType = 'BULLISH'
      } else if (isLargeTrade && !isFarOTM) {
        // Large trades that aren't far OTM tend to be directional
        trade.executionType = trade.type === 'call' ? 'BULLISH' : 'BEARISH'
      } else {
        trade.executionType = 'NEUTRAL'
      }
    } else {
      // Default fallback
      trade.executionType = 'NEUTRAL'
    }

    return trade
  })

  const bullishCount = finalTrades.filter((t) => t.executionType === 'BULLISH').length
  const bearishCount = finalTrades.filter((t) => t.executionType === 'BEARISH').length
  const neutralCount = finalTrades.filter((t) => t.executionType === 'NEUTRAL').length

  console.log(`🎯 ULTRA-FAST analysis complete in seconds instead of hours!`)
  console.log(
    `📊 Results: ${bullishCount} BULLISH (${((bullishCount / finalTrades.length) * 100).toFixed(1)}%), ${bearishCount} BEARISH (${((bearishCount / finalTrades.length) * 100).toFixed(1)}%), ${neutralCount} NEUTRAL (${((neutralCount / finalTrades.length) * 100).toFixed(1)}%)`
  )
  console.log(
    `⚡ Processed ${finalTrades.length} trades using ${useStatisticalInference ? 'STATISTICAL INFERENCE' : 'DIRECT ANALYSIS'}`
  )

  return finalTrades
}

const CandlestickLayer = (props: any) => {
  const { xAxisMap, yAxisMap, visibleData } = props
  if (!xAxisMap || !yAxisMap || !visibleData) return null
  const xAxisEntry = Object.values(xAxisMap)[0] as any
  const priceAxisEntry = (yAxisMap as any)['price']
  if (!xAxisEntry || !priceAxisEntry) return null
  const xScale = xAxisEntry.scale
  const yScale = priceAxisEntry.scale
  if (!xScale || !yScale) return null
  const bandwidth: number = xScale.bandwidth ? xScale.bandwidth() : 8
  return (
    <g>
      {(visibleData as any[]).map((point: any, i: number) => {
        const { stockOpen, stockHigh, stockLow, stockClose, timeLabel } = point
        if (stockOpen == null || stockClose == null) return null
        const cx: number = xScale(timeLabel) + bandwidth / 2
        const hi = stockHigh ?? Math.max(stockOpen, stockClose)
        const lo = stockLow ?? Math.min(stockOpen, stockClose)
        const yHi: number = yScale(hi)
        const yLo: number = yScale(lo)
        const yOp: number = yScale(stockOpen)
        const yCl: number = yScale(stockClose)
        if (isNaN(cx) || isNaN(yHi) || isNaN(yLo)) return null
        const isGreen = stockClose >= stockOpen
        const color = isGreen ? '#00cc44' : '#ff3333'
        const bodyTop = Math.min(yOp, yCl)
        const bodyBottom = Math.max(yOp, yCl)
        const bodyH = Math.max(1, bodyBottom - bodyTop)
        const bodyW = Math.max(3, Math.min(bandwidth * 0.7, 20))
        return (
          <g key={i}>
            <line x1={cx} y1={yHi} x2={cx} y2={yLo} stroke={color} strokeWidth={1.5} />
            <rect x={cx - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} fill={color} />
          </g>
        )
      })}
    </g>
  )
}

// Helper: convert scanTimeframe string → number of trading days
const getScanDays = (tf: string): number => {
  if (tf === '1D') return 1
  if (tf === '3D') return 3
  if (tf === '1W') return 5
  return Math.max(1, parseInt(tf) || 1)
}

// Chart view options (label → trading days)
const CHART_VIEW_OPTIONS = [
  { label: '1D', days: 1 },
  { label: '3D', days: 3 },
  { label: '1W', days: 5 },
  { label: '2W', days: 10 },
  { label: '1M', days: 21 },
  { label: '3M', days: 63 },
  { label: '6M', days: 126 },
  { label: '1Y', days: 252 },
]

export default function AlgoFlowScreener() {
  const [ticker, setTicker] = useState('')
  const [searchTicker, setSearchTicker] = useState('')
  const [loading, setLoading] = useState(false)
  const [flowData, setFlowData] = useState<OptionsFlowData[]>([])
  const [error, setError] = useState('')
  // Ref to track accumulated trades synchronously across async SSE events
  // (React state updates are async so the complete handler can't read flowData reliably)
  const accumulatedTradesRef = useRef<OptionsFlowData[]>([])
  const [streamStatus, setStreamStatus] = useState('')
  const [isStreamComplete, setIsStreamComplete] = useState<boolean>(false)
  const [timeInterval, setTimeInterval] = useState<'5min' | '15min' | '30min' | '1hour'>('1hour')
  const [chartViewMode, setChartViewMode] = useState<'detailed' | 'simplified' | 'net'>('detailed')
  const [scanTimeframe, setScanTimeframe] = useState<string>('1D')
  const [chartDisplayDays, setChartDisplayDays] = useState<number>(1)
  const [brushIndices, setBrushIndices] = useState<{ start: number; end: number } | null>(null)
  const chartDragRef = useRef<{ dragging: boolean; startX: number; startIndices: { start: number; end: number } }>({ dragging: false, startX: 0, startIndices: { start: 0, end: 0 } })
  const chartDivRef = useRef<HTMLDivElement>(null)

  // Pagination and sorting state
  const [currentPage, setCurrentPage] = useState(1)
  const [sortColumn, setSortColumn] = useState<string>('trade_timestamp')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const TRADES_PER_PAGE = 20

  // Mobile column management
  const [showMobileDetails, setShowMobileDetails] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  // Strike price filtering
  const [selectedStrike, setSelectedStrike] = useState<number | null>(null)

  // Expiry date filtering
  const [selectedExpiry, setSelectedExpiry] = useState<string | null>(null)

  // Calculate algo flow analysis using YOUR REAL tier system and SWEEP/BLOCK detection
  const calculateAlgoFlowAnalysis = async (
    trades: OptionsFlowData[]
  ): Promise<AlgoFlowAnalysis | null> => {
    if (!trades.length) return null

    const ticker = trades[0].underlying_ticker
    const currentPrice = trades[0].spot_price

    // Convert to ProcessedTrade format - PRESERVE fill_style if it exists
    const processedTrades = trades.map((trade) => ({
      ticker:
        (trade as any).ticker || // PRESERVE the correct OCC ticker from Polygon (e.g. O:SPXW260325C...)
        trade.underlying_ticker + trade.strike + trade.expiry + (trade.type === 'call' ? 'C' : 'P'),
      underlying_ticker: trade.underlying_ticker,
      strike: trade.strike,
      expiry: trade.expiry,
      type: trade.type,
      trade_size: trade.trade_size,
      premium_per_contract: trade.premium_per_contract,
      total_premium: trade.total_premium,
      spot_price: trade.spot_price,
      exchange: 0, // Not used for API-classified trades
      exchange_name: trade.exchange_name || 'UNKNOWN',
      sip_timestamp: Date.now() * 1000000,
      conditions: [],
      trade_timestamp: new Date(trade.trade_timestamp),
      trade_type: trade.trade_type, // PRESERVE from API
      moneyness: trade.moneyness,
      days_to_expiry: trade.days_to_expiry,
      fill_style: (trade as any).fill_style, // PRESERVE fill_style from API
      volume: (trade as any).volume, // PRESERVE volume
      open_interest: (trade as any).open_interest, // PRESERVE open_interest
    }))

    // YOUR REAL 8-TIER INSTITUTIONAL SYSTEM
    const premiumTiers = [
      {
        name: 'TIER_1',
        minPrice: 8.0,
        minSize: 80,
        minTotal: 0,
        description: 'Premium Institutional',
      },
      {
        name: 'TIER_2',
        minPrice: 7.0,
        minSize: 100,
        minTotal: 0,
        description: 'High-Value Large Volume',
      },
      { name: 'TIER_3', minPrice: 5.0, minSize: 150, minTotal: 0, description: 'Mid-Premium Bulk' },
      {
        name: 'TIER_4',
        minPrice: 3.5,
        minSize: 200,
        minTotal: 0,
        description: 'Moderate Premium Large',
      },
      {
        name: 'TIER_5',
        minPrice: 2.5,
        minSize: 200,
        minTotal: 0,
        description: 'Lower Premium Large',
      },
      {
        name: 'TIER_6',
        minPrice: 1.0,
        minSize: 800,
        minTotal: 0,
        description: 'Small Premium Massive',
      },
      {
        name: 'TIER_7',
        minPrice: 0.5,
        minSize: 2000,
        minTotal: 0,
        description: 'Penny Options Massive',
      },
      {
        name: 'TIER_8',
        minPrice: 0,
        minSize: 20,
        minTotal: 50000,
        description: 'Total Premium Bypass',
      },
    ]

    // Classify trades by YOUR REAL TIER SYSTEM
    const tieredTrades = processedTrades.map((trade) => {
      let tier = 'TIER_8' // Default to lowest tier

      // Check each tier from highest to lowest
      for (let i = 0; i < premiumTiers.length; i++) {
        const tierDef = premiumTiers[i]

        // Special logic for TIER_8 (Total Premium Bypass)
        if (tierDef.name === 'TIER_8') {
          if (trade.trade_size >= tierDef.minSize && trade.total_premium >= tierDef.minTotal) {
            tier = tierDef.name
            break
          }
        } else {
          // Standard tier logic: premium per contract + size
          if (
            trade.premium_per_contract >= tierDef.minPrice &&
            trade.trade_size >= tierDef.minSize
          ) {
            tier = tierDef.name
            break
          }
        }
      }

      return { ...trade, tier }
    })

    // SKIP CLIENT-SIDE CLASSIFICATION - API already classified as SWEEP/BLOCK/MINI
    // Use API's classification directly instead of reclassifying
    const classifiedTrades = tieredTrades

    // BID/ASK EXECUTION ANALYSIS - Only analyze trades WITHOUT fill_style
    console.log('🚀 Checking which trades need bid/ask analysis...')
    const tradesNeedingAnalysis = classifiedTrades.filter(
      (t) => !t.fill_style || t.fill_style === 'N/A'
    )
    const tradesWithExistingFillStyle = classifiedTrades.filter(
      (t) => t.fill_style && t.fill_style !== 'N/A'
    )

    console.log(
      `📊 ${tradesWithExistingFillStyle.length} trades already have fill_style, ${tradesNeedingAnalysis.length} need analysis`
    )

    let analyzedTrades = []
    if (tradesNeedingAnalysis.length > 0) {
      console.log('🚀 Running bid/ask analysis for trades without fill_style...')
      analyzedTrades = await analyzeBidAskExecutionLightning(tradesNeedingAnalysis)
    }

    // Combine trades: those with existing fill_style + newly analyzed trades
    const tradesWithExecution = [...tradesWithExistingFillStyle, ...analyzedTrades]

    console.log(
      '🔍 TRADES WITH FILL_STYLE:',
      tradesWithExecution.slice(0, 5).map((t) => ({
        ticker: t.underlying_ticker,
        premium: t.total_premium,
        fill_style: t.fill_style,
      }))
    )

    // Debug removed

    // Calculate premium flows
    const callTrades = tradesWithExecution.filter((t: any) => t.type === 'call')
    const putTrades = tradesWithExecution.filter((t: any) => t.type === 'put')

    const totalCallPremium = callTrades.reduce((sum: number, t: any) => sum + t.total_premium, 0)
    const totalPutPremium = putTrades.reduce((sum: number, t: any) => sum + t.total_premium, 0)
    const netFlow = totalCallPremium - totalPutPremium

    // Count trade types using YOUR REAL classification
    const sweepCount = classifiedTrades.filter((t: any) => t.trade_type === 'SWEEP').length
    const blockCount = classifiedTrades.filter((t: any) => t.trade_type === 'BLOCK').length
    const miniCount = classifiedTrades.filter((t: any) => t.trade_type === 'MINI').length

    // Count by YOUR REAL TIER SYSTEM
    const tier1Count = classifiedTrades.filter((t: any) => t.tier === 'TIER_1').length
    const tier2Count = classifiedTrades.filter((t: any) => t.tier === 'TIER_2').length
    const tier3Count = classifiedTrades.filter((t: any) => t.tier === 'TIER_3').length
    const tier4Count = classifiedTrades.filter((t: any) => t.tier === 'TIER_4').length
    const tier5Count = classifiedTrades.filter((t: any) => t.tier === 'TIER_5').length
    const tier6Count = classifiedTrades.filter((t: any) => t.tier === 'TIER_6').length
    const tier7Count = classifiedTrades.filter((t: any) => t.tier === 'TIER_7').length
    const tier8Count = classifiedTrades.filter((t: any) => t.tier === 'TIER_8').length

    // No EFI highlights needed

    // Calculate aggressive calls/puts (large premium trades)
    const aggressiveCalls = callTrades.filter((t: any) => t.total_premium >= 50000).length
    const aggressivePuts = putTrades.filter((t: any) => t.total_premium >= 50000).length

    const callPutRatio =
      putTrades.length > 0 ? callTrades.length / putTrades.length : callTrades.length

    // Enhanced AlgoFlow Score Calculation
    // Component 1: Premium Ratio (base sentiment from dollar flow)
    const totalPremium = totalCallPremium + totalPutPremium
    const premiumRatio = totalPremium > 0 ? netFlow / totalPremium : 0

    // Component 2: Volume Ratio (directional trade count)
    const volumeRatio =
      classifiedTrades.length > 0
        ? (callTrades.length - putTrades.length) / classifiedTrades.length
        : 0

    // Component 3: Aggressive Trades Ratio (large trades ≥$50K - institutional conviction)
    const aggressiveCallPremium = callTrades
      .filter((t: any) => t.total_premium >= 50000)
      .reduce((sum: number, t: any) => sum + t.total_premium, 0)
    const aggressivePutPremium = putTrades
      .filter((t: any) => t.total_premium >= 50000)
      .reduce((sum: number, t: any) => sum + t.total_premium, 0)
    const aggressiveTotalPremium = aggressiveCallPremium + aggressivePutPremium
    const aggressiveRatio =
      aggressiveTotalPremium > 0
        ? (aggressiveCallPremium - aggressivePutPremium) / aggressiveTotalPremium
        : 0

    // Component 4: Non-Aggressive Trades Ratio (smaller trades <$50K - retail/smaller players)
    const nonAggressiveCallPremium = callTrades
      .filter((t: any) => t.total_premium < 50000)
      .reduce((sum: number, t: any) => sum + t.total_premium, 0)
    const nonAggressivePutPremium = putTrades
      .filter((t: any) => t.total_premium < 50000)
      .reduce((sum: number, t: any) => sum + t.total_premium, 0)
    const nonAggressiveTotalPremium = nonAggressiveCallPremium + nonAggressivePutPremium
    const nonAggressiveRatio =
      nonAggressiveTotalPremium > 0
        ? (nonAggressiveCallPremium - nonAggressivePutPremium) / nonAggressiveTotalPremium
        : 0

    // Component 5: Put/Call Ratio Score (normalized - higher C/P ratio = more bullish)
    // Normalize P/C ratio to -1 to +1 scale (0.5 = neutral, >1 = bearish, <0.5 = bullish)
    const pcRatioScore = callPutRatio > 0 ? Math.tanh((callPutRatio - 1) * 0.5) : -1 // tanh keeps it bounded

    // Component 6: Sweep/Block Concentration (high-conviction institutional flow)
    const sweepBlockCount = sweepCount + blockCount
    const sweepBlockRatio =
      classifiedTrades.length > 0 ? sweepBlockCount / classifiedTrades.length : 0
    const sweepBlockCalls = classifiedTrades.filter(
      (t: any) => (t.trade_type === 'SWEEP' || t.trade_type === 'BLOCK') && t.type === 'call'
    ).length
    const sweepBlockPuts = classifiedTrades.filter(
      (t: any) => (t.trade_type === 'SWEEP' || t.trade_type === 'BLOCK') && t.type === 'put'
    ).length
    const sweepBlockScore =
      sweepBlockCount > 0 ? (sweepBlockCalls - sweepBlockPuts) / sweepBlockCount : 0

    // Enhanced AlgoFlow Score with weighted components
    const algoFlowScore =
      aggressiveRatio * 0.3 + // 30% - Aggressive trades (institutional conviction)
      premiumRatio * 0.25 + // 25% - Overall premium flow
      sweepBlockScore * 0.2 + // 20% - Sweep/Block institutional activity
      pcRatioScore * 0.15 + // 15% - Put/Call ratio sentiment
      nonAggressiveRatio * 0.1 // 10% - Non-aggressive trades (retail sentiment)

    // Determine flow trend with enhanced thresholds
    let flowTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL'
    if (algoFlowScore > 0.25) flowTrend = 'BULLISH'
    else if (algoFlowScore < -0.25) flowTrend = 'BEARISH'

    // Create time-based chart data (group by selected interval in PST, market hours only)
    const intervalData: Record<
      string,
      { callsPlus: number; callsMinus: number; putsPlus: number; putsMinus: number }
    > = {}

    // US Market Holidays (2025-2026)
    const US_MARKET_HOLIDAYS = [
      '2025-01-01', // New Year's Day
      '2025-01-20', // MLK Day
      '2025-02-17', // Presidents Day
      '2025-04-18', // Good Friday
      '2025-05-26', // Memorial Day
      '2025-07-04', // Independence Day
      '2025-09-01', // Labor Day
      '2025-11-27', // Thanksgiving
      '2025-12-25', // Christmas
      '2026-01-01', // New Year's Day
      '2026-01-19', // MLK Day
      '2026-02-16', // Presidents Day
      '2026-04-03', // Good Friday
      '2026-05-25', // Memorial Day
      '2026-07-03', // Independence Day (observed)
      '2026-09-07', // Labor Day
      '2026-11-26', // Thanksgiving
      '2026-12-25', // Christmas
    ]

    // Get trading days based on chart display timeframe
    const getTradingDays = (timeframe: string): string[] => {
      const days: string[] = []
      const now = new Date()
      const pstNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))

      const daysNeeded = timeframe === '1D' ? 1 : timeframe === '3D' ? 3 : timeframe === '1W' ? 5 : (parseInt(timeframe) || 1)
      const currentDate = new Date(pstNow)
      // Start from TODAY (not yesterday)

      while (days.length < daysNeeded) {
        const dayOfWeek = currentDate.getDay()
        const year = currentDate.getFullYear()
        const month = String(currentDate.getMonth() + 1).padStart(2, '0')
        const day = String(currentDate.getDate()).padStart(2, '0')
        const dateString = `${year}-${month}-${day}`

        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
        const isHoliday = US_MARKET_HOLIDAYS.includes(dateString)

        // Skip weekends AND holidays
        if (!isWeekend && !isHoliday) {
          days.push(dateString)
        }
        currentDate.setDate(currentDate.getDate() - 1)
      }

      return days.reverse()
    }

    const tradingDays = getTradingDays(scanTimeframe)

    // Initialize time slots based on selected interval and timeframe
    const getTimeSlots = (interval: string, timeframe: string) => {
      const slots: string[] = []
      let intervalMinutes: number

      // Convert interval to minutes
      switch (interval) {
        case '5min':
          intervalMinutes = 5
          break
        case '15min':
          intervalMinutes = 15
          break
        case '30min':
          intervalMinutes = 30
          break
        case '1hour':
          intervalMinutes = 60
          break
        default:
          intervalMinutes = 60
      }

      // Market hours: 6:30 AM to 1:00 PM PST
      const marketOpenMinutes = 6 * 60 + 30 // 390 minutes = 6:30 AM PST
      const marketCloseMinutes = 13 * 60 // 780 minutes = 1:00 PM PST

      if (timeframe === '1D') {
        // Single day: Generate time slots from market open through market close
        for (
          let totalMinutes = marketOpenMinutes;
          totalMinutes < marketCloseMinutes;
          totalMinutes += intervalMinutes
        ) {
          const hour = Math.floor(totalMinutes / 60)
          const minute = totalMinutes % 60
          const timeKey = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
          slots.push(timeKey)
        }
        // Always add the final market close slot (4:00 PM)
        slots.push('16:00')
      } else {
        // Multi-day: For each trading day, add key time points
        // Use 9:30AM, 12PM, 4PM for each day
        tradingDays.forEach((date) => {
          slots.push(`${date}_09:30`)
          slots.push(`${date}_12:00`)
          slots.push(`${date}_16:00`)
        })
      }

      return slots
    }

    const timeSlots = getTimeSlots(timeInterval, scanTimeframe)
    timeSlots.forEach((slot) => {
      intervalData[slot] = { callsPlus: 0, callsMinus: 0, putsPlus: 0, putsMinus: 0 }
    })

    tradesWithExecution.forEach((trade: any) => {
      // Convert to PST time
      const tradeDate = new Date(trade.trade_timestamp)
      const etTime = new Date(
        tradeDate.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
      )
      const hour = etTime.getHours()
      const minute = etTime.getMinutes()
      const year = etTime.getFullYear()
      const month = String(etTime.getMonth() + 1).padStart(2, '0')
      const day = String(etTime.getDate()).padStart(2, '0')
      const dateKey = `${year}-${month}-${day}`

      // Only include trades during market hours (6:30 AM - 1:00 PM PST)
      if (hour < 6 || hour > 13 || (hour === 6 && minute < 30)) return

      // Find the appropriate time slot based on interval and timeframe
      let timeKey: string

      if (scanTimeframe === '1D') {
        // Single day: Use time-only key
        const getTimeSlot = (h: number, m: number, interval: string) => {
          const totalMinutes = (h - 9) * 60 + (m - 30) // Minutes since 9:30 AM

          let slotMinutes: number
          switch (interval) {
            case '5min':
              slotMinutes = Math.floor(totalMinutes / 5) * 5
              break
            case '15min':
              slotMinutes = Math.floor(totalMinutes / 15) * 15
              break
            case '30min':
              slotMinutes = Math.floor(totalMinutes / 30) * 30
              break
            case '1hour':
              slotMinutes = Math.floor(totalMinutes / 60) * 60
              break
            default:
              slotMinutes = Math.floor(totalMinutes / 60) * 60
          }

          const slotHour = Math.floor((slotMinutes + 570) / 60) // 570 = 9:30 in minutes
          const slotMin = (slotMinutes + 570) % 60

          return `${slotHour.toString().padStart(2, '0')}:${slotMin.toString().padStart(2, '0')}`
        }
        timeKey = getTimeSlot(hour, minute, timeInterval)
      } else {
        // Multi-day: Match to closest key time point (9:30AM, 12PM, 4PM)
        if (hour < 12) {
          timeKey = `${dateKey}_09:30`
        } else if (hour < 16) {
          timeKey = `${dateKey}_12:00`
        } else {
          timeKey = `${dateKey}_16:00`
        }
      }

      if (intervalData[timeKey]) {
        // Determine bullish/bearish based on fill_style ONLY
        let isBullish = false

        if (trade.fill_style === 'A' || trade.fill_style === 'AA') {
          isBullish = true
        } else if (trade.fill_style === 'B' || trade.fill_style === 'BB') {
          isBullish = false
        } else {
          // For trades without fill_style, default to false (bearish)
          isBullish = false
          console.log(
            `� BEARISH ${trade.type.toUpperCase()}: ${trade.fill_style} - $${trade.total_premium.toLocaleString()}`
          )
        }

        if (trade.type === 'call') {
          if (isBullish) {
            intervalData[timeKey].callsPlus += trade.total_premium // Calls+ = Bullish call buying
          } else {
            intervalData[timeKey].callsMinus += trade.total_premium // Calls- = Bearish call selling
          }
        } else {
          if (isBullish) {
            intervalData[timeKey].putsPlus += trade.total_premium // Puts+ = Bullish put buying
          } else {
            intervalData[timeKey].putsMinus += trade.total_premium // Puts- = Bearish put selling
          }
        }
      }
    })

    const chartData = Object.entries(intervalData)
      // Cumulative sum logic
      .sort(([aTime], [bTime]) => {
        // Handle both single-day "HH:MM" and multi-day "YYYY-MM-DD_HH:MM" formats
        const aHasDate = aTime.includes('_')
        const bHasDate = bTime.includes('_')

        if (aHasDate && bHasDate) {
          // Multi-day: Sort by date first, then time
          const [aDate, aTimeStr] = aTime.split('_')
          const [bDate, bTimeStr] = bTime.split('_')
          if (aDate !== bDate) {
            return aDate.localeCompare(bDate)
          }
          const [aHours, aMinutes] = aTimeStr.split(':').map(Number)
          const [bHours, bMinutes] = bTimeStr.split(':').map(Number)
          return aHours * 60 + aMinutes - (bHours * 60 + bMinutes)
        } else {
          // Single-day: Sort by time only
          const [aHours, aMinutes] = aTime.split(':').map(Number)
          const [bHours, bMinutes] = bTime.split(':').map(Number)
          return aHours * 60 + aMinutes - (bHours * 60 + bMinutes)
        }
      })
      .reduce<
        Array<{
          time: number
          timeLabel: string
          callsPlus: number
          callsMinus: number
          putsPlus: number
          putsMinus: number
          netFlow: number
          bullishTotal: number
          bearishTotal: number
        }>
      >((acc, [time, data], idx) => {
        // Convert time string to proper Date object for chart
        let timeDate: Date
        let timeLabel: string

        if (time.includes('_')) {
          // Multi-day format: "YYYY-MM-DD_HH:MM"
          const [dateStr, timeStr] = time.split('_')
          const [year, month, day] = dateStr.split('-').map(Number)
          const [hours, minutes] = timeStr.split(':').map(Number)
          timeDate = new Date(year, month - 1, day, hours, minutes)

          // Format as "MM/DD/YYYY HH:MM AM/PM"
          const hour12 = hours % 12 === 0 ? 12 : hours % 12
          const ampm = hours < 12 ? 'AM' : 'PM'
          timeLabel = `${month}/${day}/${year} ${hour12}:${minutes.toString().padStart(2, '0')} ${ampm}`
        } else {
          // Single-day format: "HH:MM"
          const [hours, minutes] = time.split(':').map(Number)
          const today = new Date()
          timeDate = new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate(),
            hours,
            minutes
          )

          // Format as "HH:MM AM/PM"
          const hour12 = hours % 12 === 0 ? 12 : hours % 12
          const ampm = hours < 12 ? 'AM' : 'PM'
          timeLabel = `${hour12}:${minutes.toString().padStart(2, '0')} ${ampm}`
        }

        // Get previous cumulative values
        const prev =
          acc.length > 0
            ? acc[acc.length - 1]
            : {
              callsPlus: 0,
              callsMinus: 0,
              putsPlus: 0,
              putsMinus: 0,
              netFlow: 0,
              bullishTotal: 0,
              bearishTotal: 0,
            }

        // Add current to previous for cumulative sum
        const cumulative = {
          time: timeDate.getTime(),
          timeLabel,
          callsPlus: prev.callsPlus + data.callsPlus,
          callsMinus: prev.callsMinus + data.callsMinus,
          putsPlus: prev.putsPlus + data.putsPlus,
          putsMinus: prev.putsMinus + data.putsMinus,
          netFlow: 0, // Initialize netFlow
          bullishTotal: 0, // Initialize bullishTotal
          bearishTotal: 0, // Initialize bearishTotal
        }
        cumulative.netFlow =
          cumulative.callsPlus -
          cumulative.callsMinus +
          (cumulative.putsPlus - cumulative.putsMinus)
        cumulative.bullishTotal = cumulative.callsPlus + cumulative.putsPlus
        cumulative.bearishTotal = -(cumulative.callsMinus + cumulative.putsMinus) // Negative for bearish
        acc.push(cumulative)
        return acc
      }, [])

    // 🚨 FETCH REAL PRICE DATA FROM POLYGON API - NO FAKE DATA!
    console.log(`� FETCHING REAL OHLC DATA from Polygon API for ${ticker}...`)

    let finalPriceData: Array<{
      time: number
      open: number
      high: number
      low: number
      close: number
    }> = []

    try {
      // Determine interval: day bars for multi-week, hour bars for multi-day, minute for 1D
      const scanDays = getScanDays(scanTimeframe)
      const tradingDays = getTradingDays(scanTimeframe)
      const startDate = tradingDays[0]
      const endDate = tradingDays[tradingDays.length - 1]

      let priceMultiplier = 60
      let priceTimespan = 'minute'
      if (scanDays > 5) {
        priceMultiplier = 1
        priceTimespan = 'day'
      } else if (scanDays > 1) {
        priceMultiplier = 1
        priceTimespan = 'hour'
      }

      // Fetch REAL aggregated bars from Polygon covering full scan range
      const polygonUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/${priceMultiplier}/${priceTimespan}/${startDate}/${endDate}?adjusted=true&sort=asc&limit=50000&apiKey=${POLYGON_API_KEY}`

      console.log(`📈 REAL DATA REQUEST: ${ticker} ${priceMultiplier}${priceTimespan} bars from ${startDate} to ${endDate}`)

      const response = await fetch(polygonUrl)
      const data = await response.json()

      if (data.results && data.results.length > 0) {
        console.log(`✅ REAL DATA RECEIVED: ${data.results.length} candlesticks from Polygon API`)

        // Convert Polygon results to our chart format
        finalPriceData = data.results.map((bar: any) => ({
          time: bar.t, // Polygon timestamp in milliseconds
          open: bar.o,
          high: bar.h,
          low: bar.l,
          close: bar.c,
        }))

        console.log(
          `✅ REAL OHLC DATA LOADED: ${finalPriceData.length} real candlesticks`,
          finalPriceData.slice(0, 3)
        )
      } else {
        console.warn(
          `⚠️ NO REAL DATA from Polygon for ${ticker} on ${dateStr} - chart will be empty`
        )
        finalPriceData = []
      }
    } catch (error) {
      console.error(`❌ FAILED TO FETCH REAL PRICE DATA for ${ticker}:`, error)
      finalPriceData = []
    }

    // Merge stock price into each chartData point by nearest timestamp
    const mergedChartData = finalPriceData.length > 0
      ? chartData.map((point: any) => {
        const closest = finalPriceData.reduce((prev, curr) =>
          Math.abs(curr.time - point.time) < Math.abs(prev.time - point.time) ? curr : prev
        )
        const withinWindow = Math.abs(closest.time - point.time) < 25 * 60 * 60 * 1000
        return {
          ...point,
          stockOpen: withinWindow ? closest.open : undefined,
          stockHigh: withinWindow ? closest.high : undefined,
          stockLow: withinWindow ? closest.low : undefined,
          stockClose: withinWindow ? closest.close : undefined,
        }
      })
      : chartData

    return {
      ticker,
      currentPrice,
      algoFlowScore,
      totalCallPremium,
      totalPutPremium,
      netFlow,
      sweepCount,
      blockCount,
      miniCount,

      callPutRatio,
      aggressiveCalls,
      aggressivePuts,
      flowTrend,
      chartData: mergedChartData,
      priceData: finalPriceData,
      // YOUR REAL TIER SYSTEM counts
      tier1Count,
      tier2Count,
      tier3Count,
      tier4Count,
      tier5Count,
      tier6Count,
      tier7Count,
      tier8Count,
      // Return trades with fill_style
      trades: tradesWithExecution,
    }
  }

  // Analysis state to handle async bid/ask analysis
  type ChartDataPoint = {
    time: number
    timeLabel: string
    callsPlus: number
    callsMinus: number
    putsPlus: number
    putsMinus: number
    netFlow: number
  }

  const [analysis, setAnalysis] = useState<AlgoFlowAnalysis | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState({ current: 0, total: 0 })

  // Effect to handle async analysis calculation
  // Function to perform analysis - will be called manually after volume/OI enrichment
  const performAnalysis = async (tradesData: any[]) => {
    if (tradesData.length > 0) {
      console.log(`🚀 Starting analysis for ${tradesData.length} flow trades`)
      setIsAnalyzing(true)
      try {
        const result = await calculateAlgoFlowAnalysis(tradesData)
        console.log(`📊 Analysis complete, result:`, result ? 'SUCCESS' : 'FAILED')

        // DIRECT FIX: Merge volume/OI data into analysis trades
        if (result && result.trades) {
          console.log(`🔧 MERGING VOLUME/OI DATA INTO ANALYSIS TRADES`)
          console.log(`🔍 SAMPLE ANALYSIS TICKER:`, result.trades[0]?.ticker)
          console.log(`🔍 SAMPLE ENRICHED TICKER:`, tradesData[0]?.ticker)

          result.trades = result.trades.map((analyzedTrade: any) => {
            console.log(
              `🔍 LOOKING FOR MATCH - Analysis: ${analyzedTrade.ticker} (${analyzedTrade.underlying_ticker} ${analyzedTrade.strike} ${analyzedTrade.expiry} ${analyzedTrade.type})`
            )

            // Find matching trade - try exact ticker first, then by contract details
            let enrichedTrade = tradesData.find((t) => t.ticker === analyzedTrade.ticker)

            if (!enrichedTrade) {
              // Try matching by contract details since ticker formats may differ
              enrichedTrade = tradesData.find(
                (t) =>
                  t.underlying_ticker === analyzedTrade.underlying_ticker &&
                  t.strike === analyzedTrade.strike &&
                  t.expiry === analyzedTrade.expiry &&
                  t.type === analyzedTrade.type
              )
              console.log(
                `🔄 FALLBACK MATCH ATTEMPT:`,
                enrichedTrade ? `Found ${enrichedTrade.ticker}` : 'No match'
              )
            }

            if (
              enrichedTrade &&
              (enrichedTrade.volume !== undefined || enrichedTrade.open_interest !== undefined)
            ) {
              console.log(
                `✅ MERGING VOL/OI: ${enrichedTrade.ticker} -> ${analyzedTrade.ticker} Vol=${enrichedTrade.volume} OI=${enrichedTrade.open_interest}`
              )
              return {
                ...analyzedTrade,
                volume: enrichedTrade.volume,
                open_interest: enrichedTrade.open_interest,
              }
            } else {
              console.log(`❌ NO MATCH FOUND for ${analyzedTrade.ticker}`)
            }
            return analyzedTrade
          })
        }

        console.log(`🎯 SETTING ANALYSIS STATE:`, !!result)
        console.log(
          `🔍 ANALYSIS TRADES SAMPLE:`,
          result?.trades?.[0]
            ? {
              ticker: result.trades[0].ticker,
              volume: result.trades[0].volume,
              open_interest: result.trades[0].open_interest,
              hasVolume: !!result.trades[0].volume,
              hasOI: !!result.trades[0].open_interest,
            }
            : 'NO TRADES'
        )
        setAnalysis(result)
        console.log(`✅ ANALYSIS STATE SET - Should show table now!`)
      } catch (error) {
        console.error('❌ Error in bid/ask analysis:', error)
        console.log(`❌ CLEARING ANALYSIS STATE due to error`)
        setAnalysis(null)
      } finally {
        setIsAnalyzing(false)
      }
    } else {
      console.log(`❌ CLEARING ANALYSIS STATE - no flow data`)
      setAnalysis(null)
    }
  }

  // Clear analysis when flowData changes (but don't auto-run analysis)
  useEffect(() => {
    if (flowData.length === 0) {
      setAnalysis(null)
    }
  }, [flowData])

  // Re-analyze when scan timeframe changes
  useEffect(() => {
    if (flowData.length > 0) {
      performAnalysis(flowData)
    }
  }, [scanTimeframe])

  // Sync chart view window when scan timeframe changes
  useEffect(() => {
    setChartDisplayDays(getScanDays(scanTimeframe))
    setBrushIndices(null)
  }, [scanTimeframe])

  // Reset brush when chartDisplayDays changes
  useEffect(() => {
    setBrushIndices(null)
  }, [chartDisplayDays])

  // Attach wheel listener as non-passive so preventDefault() works for chart zoom
  useEffect(() => {
    const el = chartDivRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      setAnalysis((prev: any) => {
        if (!prev) return prev
        const data = prev.chartData
        const len = data.length
        if (len < 2) return prev
        setBrushIndices((cur) => {
          const current = cur ?? { start: 0, end: len - 1 }
          const range = current.end - current.start
          const step = Math.max(2, Math.floor(range * 0.12))
          if (e.deltaY < 0) {
            return { start: Math.min(current.start + step, current.end - 4), end: Math.max(current.end - step, current.start + 4) }
          } else {
            return { start: Math.max(0, current.start - step), end: Math.min(len - 1, current.end + step) }
          }
        })
        return prev
      })
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [chartDivRef.current])

  // Auto-load SPY data on component mount
  // Removed auto-loading of SPY data - let users search for their own ticker

  // Fetch flow data for specific ticker
  const fetchTickerFlow = async (tickerToSearch: string, tfOverride?: string) => {
    if (!tickerToSearch.trim()) return
    const tf = tfOverride ?? scanTimeframe

    setLoading(true)
    setError('')
    setStreamStatus('Connecting...')
    const url = `/api/stream-options-flow?ticker=${tickerToSearch.toUpperCase()}&timeframe=${tf}`
    setFlowData([])
    accumulatedTradesRef.current = [] // Reset accumulated trades ref
    liveOICache.clear() // Clear Live OI cache when starting new search
    setIsStreamComplete(false)

    try {
      const eventSource = new EventSource(url)

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          switch (data.type) {
            case 'connected':
            case 'heartbeat':
              break

            case 'status':
              setStreamStatus(data.message)
              break

            // ─── PRIMARY TRADE DELIVERY PATH ───────────────────────────────
            // Server streams trades as 'ticker_complete' events (one per ticker).
            // We must handle this OR we lose all trades before 'complete' fires.
            case 'ticker_complete':
              if (data.trades?.length > 0) {
                accumulatedTradesRef.current = [...accumulatedTradesRef.current, ...data.trades]
                setFlowData((prev) => [...prev, ...data.trades])
                setStreamStatus(
                  `Received ${accumulatedTradesRef.current.length} trades (${data.ticker})...`
                )
              }
              break

            // ─── LEGACY PROGRESSIVE PATH (kept for other callers) ──────────
            case 'trades':
              if (data.trades?.length > 0 && !isStreamComplete) {
                accumulatedTradesRef.current = [...accumulatedTradesRef.current, ...data.trades]
                setFlowData((prev) => [...prev, ...data.trades])
              }
              setStreamStatus(data.status || 'Processing trades...')
              break

            case 'complete': {
              setStreamStatus('Scan complete')
              setIsStreamComplete(true)

              // Server sends trades via ticker_complete events, so data.trades is [].
              // Use accumulatedTradesRef which was built up by ticker_complete handlers.
              const completeTrades: OptionsFlowData[] =
                data.trades?.length > 0 ? data.trades : accumulatedTradesRef.current

              if (completeTrades.length > 0) {
                setStreamStatus('Fetching volume/OI data...')
                fetchVolumeAndOpenInterest(completeTrades)
                  .then((tradesWithVolOI) => {
                    setFlowData(tradesWithVolOI)
                    accumulatedTradesRef.current = tradesWithVolOI
                    liveOICache.clear()
                    setIsStreamComplete(true)
                    setStreamStatus(`Complete — ${tradesWithVolOI.length} trades loaded`)
                    setLoading(false)
                    performAnalysis(tradesWithVolOI).catch(() => { })
                  })
                  .catch(() => {
                    setFlowData(completeTrades)
                    liveOICache.clear()
                    setStreamStatus('Complete (volume/OI unavailable)')
                    setLoading(false)
                    performAnalysis(completeTrades).catch(() => { })
                  })
              } else {
                setError(`No options flow data found for ${tickerToSearch}`)
                setLoading(false)
              }
              eventSource.close()
              break
            }

            case 'error':
              setError(data.error || 'Stream error occurred')
              setLoading(false)
              eventSource.close()
              break
          }
        } catch (parseError) {
          console.error('Error parsing stream data:', parseError)
        }
      }

      eventSource.onerror = (error) => {
        // Only log errors if stream hasn't completed successfully
        if (!isStreamComplete) {
          console.warn('⚠️ EventSource connection issue')
          setError('Stream connection unavailable')
          setLoading(false)
        }
        eventSource.close()
      }

      // Cleanup on component unmount
      return () => eventSource.close()
    } catch (error) {
      setError('Failed to start flow analysis')
      setLoading(false)
    }
  }

  const handleSearch = () => {
    if (ticker.trim()) {
      setSearchTicker(ticker.toUpperCase())
      fetchTickerFlow(ticker)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`
    return `$${value.toFixed(0)}`
  }

  const getScoreColor = (score: number) => {
    if (score > 0.3) return 'text-green-400'
    if (score < -0.3) return 'text-red-400'
    return 'text-yellow-400'
  }

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'BULLISH':
        return 'text-green-400 bg-green-400/10'
      case 'BEARISH':
        return 'text-red-400 bg-red-400/10'
      default:
        return 'text-yellow-400 bg-yellow-400/10'
    }
  }

  // Gauge component
  const GaugeChart = ({
    value,
    max,
    label,
    color,
  }: {
    value: number
    max: number
    label: string
    color: string
  }) => {
    const percentage = Math.min((Math.abs(value) / max) * 100, 100)
    const rotation = (percentage / 100) * 180 - 90

    return (
      <div className="flex flex-col items-center">
        <div className="relative w-32 h-16 overflow-hidden">
          <div className="absolute inset-0 border-4 border-white/10 rounded-t-full"></div>
          <div
            className="absolute bottom-0 left-1/2 w-1 h-16 origin-bottom transition-transform duration-500"
            style={{
              transform: `translateX(-50%) rotate(${rotation}deg)`,
              background: color,
            }}
          >
            <div
              className={`absolute top-0 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full`}
              style={{ background: color }}
            ></div>
          </div>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-4 bg-white rounded-full border-2 border-black"></div>
        </div>
        <div className={`text-2xl font-black mt-2`} style={{ color }}>
          {value.toFixed(3)}
        </div>
        <div className="text-xs text-white uppercase tracking-widest font-bold mt-1">{label}</div>
      </div>
    )
  }

  return (
    <div className="h-full bg-black flex flex-col" style={{ overflow: 'hidden' }}>
      {/* HEADER BAR */}
      <div style={{
        background: 'linear-gradient(180deg, #0d0d0d 0%, #060606 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        padding: '10px 20px',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#ff8500', fontFamily: 'JetBrains Mono, monospace', fontSize: 16, fontWeight: 800, letterSpacing: '0.18em' }}>ALGOFLOW INTELLIGENCE</span>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>·</span>
          <span style={{ color: '#fff', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, letterSpacing: '0.12em' }}>OPTIONS FLOW SCANNER</span>
          {streamStatus && (
            <span style={{ color: '#22d3ee', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, letterSpacing: '0.1em', marginLeft: 8 }}>{streamStatus}</span>
          )}
          {error && (
            <span style={{ color: '#ef4444', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, letterSpacing: '0.1em', marginLeft: 8 }}>{error}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            onKeyPress={handleKeyPress}
            placeholder="TICKER"
            style={{ width: 110, padding: '5px 10px', background: '#111', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', fontFamily: 'JetBrains Mono, monospace', fontSize: 16, fontWeight: 700, letterSpacing: '0.12em', outline: 'none' }}
            disabled={loading}
          />
          <select
            value={scanTimeframe}
            onChange={(e) => setScanTimeframe(e.target.value)}
            style={{ padding: '5px 8px', background: '#111', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', outline: 'none' }}
            disabled={loading}
          >
            <option value="1D">TODAY</option>
            <option value="2">2 DAYS</option>
            <option value="3">3 DAYS</option>
            <option value="4">4 DAYS</option>
            <option value="5">5 DAYS</option>
            <option value="7">7 DAYS</option>
            <option value="10">10 DAYS</option>
            <option value="14">14 DAYS</option>
            <option value="20">20 DAYS</option>
            <option value="30">30 DAYS</option>
            <option value="45">45 DAYS</option>
            <option value="60">60 DAYS</option>
            <option value="90">90 DAYS</option>
            <option value="126">126 DAYS</option>
            <option value="189">189 DAYS</option>
            <option value="252">252 DAYS</option>
          </select>
          <button
            onClick={handleSearch}
            disabled={loading || !ticker.trim()}
            style={{ padding: '5px 20px', background: loading ? '#333' : 'linear-gradient(135deg, #ff8500, #ff6000)', color: '#000', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 800, letterSpacing: '0.15em', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: (!ticker.trim() || loading) ? 0.4 : 1, transition: 'all 0.2s' }}
          >
            {loading ? 'SCANNING...' : 'ANALYZE'}
          </button>
        </div>
      </div>

      {/* SCROLLABLE CONTENT */}
      <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: '12px 20px 20px' }}>

        {/* LOADING STATE */}
        {isAnalyzing && flowData.length > 0 && (
          <div className="bg-black border border-white/20 p-8">
            <div className="flex items-center justify-center gap-4">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-cyan-400 border-t-transparent"></div>
              <div className="text-white text-lg font-bold tracking-wider">
                ANALYZING {flowData.length} TRADES
              </div>
            </div>
            {analysisProgress.total > 0 && (
              <div className="mt-6">
                <div className="flex justify-between text-xs text-white mb-2 font-bold tracking-wider">
                  <span>PROGRESS</span>
                  <span>
                    {analysisProgress.current}/{analysisProgress.total}
                  </span>
                </div>
                <div className="w-full bg-white/10 h-1">
                  <div
                    className="bg-cyan-400 h-1 transition-all duration-300"
                    style={{ width: `${(analysisProgress.current / analysisProgress.total) * 100}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        )}

        {analysis && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

            {/* ── ROW 1: BANNER ── */}
            <div style={{
              background: 'linear-gradient(90deg, #0a0a0a 0%, #111 100%)',
              borderBottom: '1px solid rgba(255,255,255,0.15)',
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 0,
              flexWrap: 'wrap',
            }}>
              {/* Ticker + price + trend */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingRight: 20, borderRight: '1px solid rgba(255,255,255,0.15)', marginRight: 20 }}>
                <span style={{ color: '#fff', fontFamily: 'JetBrains Mono,monospace', fontSize: 20, fontWeight: 900, letterSpacing: '0.1em' }}>{analysis.ticker}</span>
                <span style={{ color: '#fff', fontFamily: 'JetBrains Mono,monospace', fontSize: 14, fontWeight: 700 }}>${analysis.currentPrice.toFixed(2)}</span>
                <span style={{
                  fontFamily: 'JetBrains Mono,monospace', fontSize: 12, fontWeight: 800, letterSpacing: '0.15em',
                  padding: '2px 8px', borderRadius: 2,
                  background: analysis.flowTrend === 'BULLISH' ? 'rgba(16,185,129,0.15)' : analysis.flowTrend === 'BEARISH' ? 'rgba(239,68,68,0.15)' : 'rgba(234,179,8,0.15)',
                  color: analysis.flowTrend === 'BULLISH' ? '#10b981' : analysis.flowTrend === 'BEARISH' ? '#ef4444' : '#eab308',
                  border: `1px solid ${analysis.flowTrend === 'BULLISH' ? '#10b981' : analysis.flowTrend === 'BEARISH' ? '#ef4444' : '#eab308'}`,
                }}>{analysis.flowTrend}</span>
              </div>
              {/* Inline stats pills */}
              {[
                { label: 'NET FLOW', value: formatCurrency(analysis.netFlow), color: analysis.netFlow >= 0 ? '#10b981' : '#ef4444' },
                { label: 'ALGO SCORE', value: analysis.algoFlowScore.toFixed(3), color: analysis.algoFlowScore > 0.3 ? '#10b981' : analysis.algoFlowScore < -0.3 ? '#ef4444' : '#eab308' },
                { label: 'SWEEPS', value: String(analysis.sweepCount), color: '#eab308' },
                { label: 'BLOCKS', value: String(analysis.blockCount), color: '#22d3ee' },
                { label: 'P/C RATIO', value: analysis.callPutRatio.toFixed(2), color: '#fff' },
                { label: 'CALLS', value: formatCurrency(analysis.totalCallPremium), color: '#10b981' },
                { label: 'PUTS', value: formatCurrency(analysis.totalPutPremium), color: '#ef4444' },
              ].map(({ label, value, color }, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '0 16px', borderRight: i < 6 ? '1px solid rgba(255,255,255,0.1)' : 'none' }}>
                  <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#fff', fontWeight: 700, letterSpacing: '0.12em', marginBottom: 2 }}>{label}</span>
                  <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 16, color, fontWeight: 800 }}>{value}</span>
                </div>
              ))}
            </div>

            {/* ── ROW 2: METRICS + CHART SIDE BY SIDE ── */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.15)' }}>

              {/* LEFT: Stats sidebar */}
              <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.15)', display: 'flex', flexDirection: 'column' }}>
                {/* AlgoFlow gauge */}
                <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <GaugeChart
                    value={analysis.algoFlowScore}
                    max={1}
                    label="ALGOFLOW SCORE"
                    color={analysis.algoFlowScore > 0.3 ? '#10b981' : analysis.algoFlowScore < -0.3 ? '#ef4444' : '#eab308'}
                  />
                </div>
                {/* P/C calls/puts bars */}
                <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#fff', letterSpacing: '0.12em', marginBottom: 6 }}>P/C RATIO · {analysis.callPutRatio.toFixed(2)}</div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#10b981', marginBottom: 3 }}>CALLS {analysis.aggressiveCalls}</div>
                      <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                        <div style={{ height: 4, background: '#10b981', borderRadius: 2, width: `${(analysis.aggressiveCalls / (analysis.aggressiveCalls + analysis.aggressivePuts || 1)) * 100}%` }} />
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#ef4444', marginBottom: 3 }}>PUTS {analysis.aggressivePuts}</div>
                      <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                        <div style={{ height: 4, background: '#ef4444', borderRadius: 2, width: `${(analysis.aggressivePuts / (analysis.aggressiveCalls + analysis.aggressivePuts || 1)) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
                {/* Sweeps vs Blocks */}
                <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#fff', letterSpacing: '0.12em', marginBottom: 6 }}>EXECUTION TYPE</div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                    <div style={{ flex: 1, background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.3)', padding: '6px 8px', borderRadius: 3 }}>
                      <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 22, fontWeight: 900, color: '#eab308' }}>{analysis.sweepCount}</div>
                      <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 8, color: '#fff', letterSpacing: '0.1em' }}>SWEEPS</div>
                    </div>
                    <div style={{ flex: 1, background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.3)', padding: '6px 8px', borderRadius: 3 }}>
                      <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 22, fontWeight: 900, color: '#22d3ee' }}>{analysis.blockCount}</div>
                      <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 8, color: '#fff', letterSpacing: '0.1em' }}>BLOCKS</div>
                    </div>
                  </div>
                  <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, display: 'flex', overflow: 'hidden' }}>
                    <div style={{ height: 3, background: '#eab308', width: `${(analysis.sweepCount / (analysis.sweepCount + analysis.blockCount || 1)) * 100}%` }} />
                    <div style={{ height: 3, background: '#22d3ee', flex: 1 }} />
                  </div>
                </div>
                {/* 6 metrics stacked */}
                {[
                  { label: 'CALLS PREM', value: formatCurrency(analysis.totalCallPremium), color: '#10b981', accent: 'rgba(16,185,129,0.4)' },
                  { label: 'PUTS PREM', value: formatCurrency(analysis.totalPutPremium), color: '#ef4444', accent: 'rgba(239,68,68,0.4)' },
                  { label: 'TOTAL VOLUME', value: flowData.reduce((s, t) => s + t.trade_size, 0).toLocaleString(), color: '#fff', accent: 'rgba(255,255,255,0.2)' },
                  { label: 'TIER 1', value: String(analysis.tier1Count), color: '#ef4444', accent: 'rgba(239,68,68,0.4)' },
                  { label: 'TIER 2', value: String(analysis.tier2Count), color: '#eab308', accent: 'rgba(234,179,8,0.4)' },
                  { label: 'MINI', value: String(analysis.miniCount), color: '#fff', accent: 'rgba(255,255,255,0.15)' },
                ].map(({ label, value, color, accent }) => (
                  <div key={label} style={{ padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: `3px solid ${accent}` }}>
                    <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#fff', letterSpacing: '0.1em' }}>{label}</span>
                    <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 16, fontWeight: 800, color }}>{value}</span>
                  </div>
                ))}
              </div>

              {/* RIGHT: Chart */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Chart toolbar */}
                <div style={{ padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#fff', letterSpacing: '0.15em', marginRight: 4 }}>FLOW</span>
                    {CHART_VIEW_OPTIONS.filter(o => o.days <= getScanDays(scanTimeframe)).map(({ label, days }) => (
                      <button key={label} onClick={() => setChartDisplayDays(days)} style={{ padding: '2px 8px', fontFamily: 'JetBrains Mono,monospace', fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', border: '1px solid rgba(255,165,0,0.6)', background: chartDisplayDays === days ? '#ff8500' : 'transparent', color: chartDisplayDays === days ? '#000' : '#ff8500', cursor: 'pointer' }}>{label}</button>
                    ))}
                    {brushIndices && (
                      <button onClick={() => setBrushIndices(null)} style={{ padding: '2px 8px', fontFamily: 'JetBrains Mono,monospace', fontSize: 11, fontWeight: 700, border: '1px solid rgba(255,255,255,0.3)', background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', letterSpacing: '0.08em' }}>RESET</button>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {([['detailed', 'ALL'], ['simplified', 'BULL/BEAR'], ['net', 'NET']] as const).map(([mode, label]) => (
                      <button key={mode} onClick={() => setChartViewMode(mode)} style={{ padding: '2px 8px', fontFamily: 'JetBrains Mono,monospace', fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', border: '1px solid rgba(34,211,238,0.5)', background: chartViewMode === mode ? '#22d3ee' : 'transparent', color: chartViewMode === mode ? '#000' : '#22d3ee', cursor: 'pointer' }}>{label}</button>
                    ))}
                  </div>
                </div>
                {/* Chart body */}
                <div ref={chartDivRef} style={{ padding: '8px', background: '#000', height: 516, minWidth: 0, cursor: chartDragRef.current.dragging ? 'grabbing' : 'grab', userSelect: 'none' }}
                  onMouseDown={(e) => {
                    const data = analysis.chartData
                    const len = data.length
                    const cur = brushIndices ?? { start: 0, end: len - 1 }
                    chartDragRef.current = { dragging: true, startX: e.clientX, startIndices: { ...cur } }
                  }}
                  onMouseMove={(e) => {
                    if (!chartDragRef.current.dragging) return
                    const data = analysis.chartData
                    const len = data.length
                    if (len < 2) return
                    const width = chartDivRef.current?.clientWidth ?? 800
                    const { startX, startIndices } = chartDragRef.current
                    const range = startIndices.end - startIndices.start
                    const pxPerPoint = width / range
                    const deltaPoints = Math.round((startX - e.clientX) / pxPerPoint)
                    const newStart = Math.max(0, Math.min(startIndices.start + deltaPoints, len - range - 1))
                    const newEnd = newStart + range
                    if (newEnd < len) setBrushIndices({ start: newStart, end: newEnd })
                  }}
                  onMouseUp={() => { chartDragRef.current.dragging = false }}
                  onMouseLeave={() => { chartDragRef.current.dragging = false }}
                >
                  <ResponsiveContainer width="100%" height={500} debounce={50}>
                    {(() => {
                      const scanDays = getScanDays(scanTimeframe)
                      const baseData = chartDisplayDays >= scanDays
                        ? analysis.chartData
                        : analysis.chartData.filter((d: any) => d.time >= Date.now() - chartDisplayDays * 1.5 * 24 * 60 * 60 * 1000)
                      const len = baseData.length
                      const bStart = brushIndices ? Math.max(0, Math.min(brushIndices.start, len - 1)) : 0
                      const bEnd = brushIndices ? Math.max(bStart + 1, Math.min(brushIndices.end, len - 1)) : len - 1
                      const visibleData = baseData.slice(bStart, bEnd + 1)
                      const xInterval = Math.max(0, Math.floor(visibleData.length / 12) - 1)
                      const prices = visibleData.map((d: any) => d.stockClose).filter((p: any) => p != null && !isNaN(p))
                      const priceLows = visibleData.map((d: any) => d.stockLow).filter((p: any) => p != null && !isNaN(p))
                      const priceHighs = visibleData.map((d: any) => d.stockHigh).filter((p: any) => p != null && !isNaN(p))
                      const priceMin = priceLows.length ? Math.min(...priceLows) * 0.95 : 'auto'
                      const priceMax = priceHighs.length ? Math.max(...priceHighs) * 1.05 : 'auto'
                      return (
                        <LineChart data={visibleData}>
                          <XAxis dataKey="timeLabel" stroke="#ffffff" tick={{ fill: '#ffffff', fontSize: 13, fontWeight: 'bold' }} height={30} interval={xInterval}
                            tickFormatter={(label: string) => {
                              if (chartDisplayDays <= 1) {
                                return label.includes('/') ? label.replace(/^\d+\/\d+\/\d+ /, '') : label
                              } else if (chartDisplayDays <= 5) {
                                return label.replace(/\/\d{4} /, ' ')
                              } else {
                                return label.replace(/\/(\d{4}) .*/, (_, yr) => `/${yr.slice(-2)}`)
                              }
                            }}
                          />
                          <YAxis yAxisId="flow" stroke="#ffffff" tick={{ fill: '#ffffff', fontSize: 14, fontWeight: 'bold' }}
                            tickFormatter={(value) => {
                              const absValue = Math.abs(value)
                              const sign = value < 0 ? '-' : ''
                              if (absValue >= 1000000) return `${sign}$${(absValue / 1000000).toFixed(1)}M`
                              if (absValue >= 1000) return `${sign}$${(absValue / 1000).toFixed(0)}K`
                              return `${sign}$${absValue}`
                            }}
                          />
                          <YAxis yAxisId="price" orientation="right" stroke="#c0c0c0" tick={{ fill: '#c0c0c0', fontSize: 13, fontWeight: 'bold' }}
                            domain={[priceMin, priceMax]}
                            tickFormatter={(value) => `$${Number(value).toFixed(0)}`}
                          />
                          <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.2)', fontWeight: 'bold', fontSize: '13px' }} labelStyle={{ color: '#fff', fontWeight: 'bold' }}
                            formatter={(value: any) => {
                              const num = Number(value); const absNum = Math.abs(num); const sign = num < 0 ? '-' : ''
                              if (absNum >= 1000000) return `${sign}$${(absNum / 1000000).toFixed(2)}M`
                              if (absNum >= 1000) return `${sign}$${(absNum / 1000).toFixed(1)}K`
                              return `${sign}$${absNum.toLocaleString()}`
                            }}
                          />
                          <Legend wrapperStyle={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }} iconType="line" />
                          {chartViewMode === 'detailed' ? (<>
                            <Line type="monotone" yAxisId="flow" dataKey="callsPlus" stroke="#00ff7f" strokeWidth={3} name="BULLISH CALLS" dot={false} />
                            <Line type="monotone" yAxisId="flow" dataKey="callsMinus" stroke="#4da6ff" strokeWidth={3} name="BEARISH CALLS" dot={false} />
                            <Line type="monotone" yAxisId="flow" dataKey="putsPlus" stroke="#ffcc00" strokeWidth={3} name="BULLISH PUTS" dot={false} />
                            <Line type="monotone" yAxisId="flow" dataKey="putsMinus" stroke="#ff2222" strokeWidth={3} name="BEARISH PUTS" dot={false} />
                          </>) : chartViewMode === 'simplified' ? (<>
                            <Line type="monotone" yAxisId="flow" dataKey="bullishTotal" stroke="#00ff7f" strokeWidth={3} name="BULLISH FLOW" dot={false} />
                            <Line type="monotone" yAxisId="flow" dataKey="bearishTotal" stroke="#ff2222" strokeWidth={3} name="BEARISH FLOW" dot={false} />
                          </>) : (
                            <Line type="monotone" yAxisId="flow" dataKey="netFlow" stroke="#00ff7f" strokeWidth={3} name="NET FLOW" dot={false}
                              segment={(props: any) => {
                                const { points } = props
                                if (!points || points.length < 2) return null
                                const [start, end] = points
                                const isNegative = start.payload.netFlow < 0 || end.payload.netFlow < 0
                                return <path d={`M ${start.x},${start.y} L ${end.x},${end.y}`} stroke={isNegative ? '#ff2222' : '#00ff7f'} strokeWidth={3} fill="none" />
                              }}
                            />
                          )}
                          <Line type="monotone" yAxisId="price" dataKey="stockClose" stroke="transparent" strokeWidth={0} name="PRICE" dot={false} legendType="none" />
                          <Customized component={CandlestickLayer} visibleData={visibleData} />
                        </LineChart>
                      )
                    })()}
                  </ResponsiveContainer>
                </div>
              </div>
            </div>{/* end ROW 2 */}

            {/* ── ROW 3: TRADES TABLE ── */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)' }}>
              <div style={{ padding: '5px 14px', background: 'linear-gradient(90deg,#0a0a0a,#111)', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#fff', letterSpacing: '0.15em' }}>ALGOFLOW TRADES</span>
                {(selectedStrike !== null || selectedExpiry !== null) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {selectedStrike !== null && <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#22d3ee' }}>STRIKE: ${selectedStrike}</span>}
                    {selectedExpiry !== null && <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#22d3ee' }}>EXPIRY: {selectedExpiry.split('T')[0]}</span>}
                    <button onClick={() => { setSelectedStrike(null); setSelectedExpiry(null); }} style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#fff', background: 'none', border: 'none', cursor: 'pointer' }}>✕ CLEAR</button>
                  </div>
                )}
              </div>
              <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 680 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: '#0a0a0a', position: 'sticky', top: 0, zIndex: 10, borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
                    <tr>
                      {[
                        { key: 'trade_timestamp', label: 'TIME' },
                        { key: 'underlying_ticker', label: 'SYMBOL' },
                        { key: null, label: 'TYPE' },
                        { key: 'strike', label: 'STRIKE' },
                        { key: 'trade_size', label: 'PURCHASE' },
                        { key: 'total_premium', label: 'PREMIUM' },
                        { key: null, label: 'SPOT' },
                        { key: null, label: 'EXPIRY' },
                        { key: null, label: 'VOL/OI' },
                        { key: null, label: 'LIVE OI' },
                        { key: null, label: 'STYLE' },
                      ].map(({ key, label }) => (
                        <th key={label}
                          onClick={key ? () => { if (sortColumn === key) { setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc') } else { setSortColumn(key); setSortDirection('desc') } } : undefined}
                          style={{ textAlign: 'left', padding: '6px 10px', fontFamily: 'JetBrains Mono,monospace', fontSize: 17, color: sortColumn === key ? '#fff' : '#ff8500', letterSpacing: '0.12em', fontWeight: 800, cursor: key ? 'pointer' : 'default', whiteSpace: 'nowrap' }}
                        >
                          {label}{key && sortColumn === key ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      let tradesToDisplay = analysis?.trades || flowData
                      if (selectedStrike !== null) tradesToDisplay = tradesToDisplay.filter(t => t.strike === selectedStrike)
                      if (selectedExpiry !== null) tradesToDisplay = tradesToDisplay.filter(t => t.expiry === selectedExpiry)
                      const sortedTrades = [...tradesToDisplay].sort((a: any, b: any) => {
                        let aVal = a[sortColumn]; let bVal = b[sortColumn]
                        if (sortColumn === 'trade_timestamp') { aVal = new Date(aVal).getTime(); bVal = new Date(bVal).getTime() }
                        return sortDirection === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1)
                      })
                      const paginatedTrades = sortedTrades.slice((currentPage - 1) * TRADES_PER_PAGE, currentPage * TRADES_PER_PAGE)
                      const fillColors: Record<string, string> = { A: '#10b981', B: '#ef4444', AA: '#6ee7b7', BB: '#fca5a5', 'N/A': 'rgba(255,255,255,0.2)' }
                      const styleColors: Record<string, string> = { SWEEP: 'rgb(255,215,0)', BLOCK: 'rgb(0,153,255)', MINI: 'rgb(0,255,94)', 'MULTI-LEG': 'rgb(168,85,247)' }

                      // Pre-compute live OI once per contract using ALL trades (same logic as Options Flow applyLiveOI).
                      // Using first-trade OI as base and deduping by ticker+timestamp+size+premium — identical to Options Flow.
                      const allTrades: any[] = analysis?.trades || flowData || []
                      const contractGroups = new Map<string, any[]>()
                      for (const t of allTrades) {
                        const k = `${t.underlying_ticker}_${t.strike}_${t.type}_${t.expiry}`
                        if (!contractGroups.has(k)) contractGroups.set(k, [])
                        contractGroups.get(k)!.push(t)
                      }
                      const liveOIMap = new Map<string, number>()
                      for (const [k, group] of contractGroups) {
                        const baseOI = group[0].open_interest ?? 0
                        const sorted = [...group].sort((a, b) => new Date(a.trade_timestamp).getTime() - new Date(b.trade_timestamp).getTime())
                        let oi = baseOI
                        const seen = new Set<string>()
                        for (const t of sorted) {
                          const id = `${t.ticker}_${t.trade_timestamp}_${t.trade_size}_${t.premium_per_contract}`
                          if (seen.has(id)) continue
                          seen.add(id)
                          const qty = t.trade_size ?? 0
                          switch (t.fill_style) {
                            case 'A': case 'AA': case 'BB': oi += qty; break
                            case 'B': oi += qty > baseOI ? qty : -qty; break
                          }
                        }
                        liveOIMap.set(k, Math.max(0, oi))
                      }

                      return paginatedTrades.map((trade, idx) => {
                        const contractKey = `${trade.underlying_ticker}_${trade.strike}_${trade.type}_${trade.expiry}`
                        const originalOI = contractGroups.get(contractKey)?.[0]?.open_interest ?? trade.open_interest ?? 0
                        const liveOI = liveOIMap.get(contractKey) ?? originalOI
                        const change = liveOI - originalOI
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                            onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent')}
                          >
                            <td style={{ padding: '5px 10px', fontFamily: 'JetBrains Mono,monospace', fontSize: 17, color: '#fff', whiteSpace: 'nowrap' }}>
                              {scanTimeframe !== '1D'
                                ? new Date(trade.trade_timestamp).toLocaleString('en-US', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })
                                : new Date(trade.trade_timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: 'America/Los_Angeles' })}
                            </td>
                            <td style={{ padding: '5px 10px', fontFamily: 'JetBrains Mono,monospace', fontSize: 18, color: '#fff', fontWeight: 900 }}>{trade.underlying_ticker}</td>
                            <td style={{ padding: '5px 10px', fontFamily: 'JetBrains Mono,monospace', fontSize: 17, fontWeight: 800, color: trade.type === 'call' ? '#10b981' : '#ef4444' }}>{trade.type.toUpperCase()}</td>
                            <td style={{ padding: '5px 10px' }}>
                              <button onClick={() => setSelectedStrike(selectedStrike === trade.strike ? null : trade.strike)} style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 17, fontWeight: 700, color: selectedStrike === trade.strike ? '#22d3ee' : '#fff', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>${trade.strike}</button>
                            </td>
                            <td style={{ padding: '5px 10px', fontFamily: 'JetBrains Mono,monospace', fontSize: 17, color: '#fff', whiteSpace: 'nowrap' }}>
                              {trade.trade_size.toLocaleString()}@${trade.premium_per_contract.toFixed(2)}<span style={{ marginLeft: 5, fontWeight: 800, color: fillColors[trade.fill_style || 'N/A'] }}>{trade.fill_style || 'N/A'}</span>
                            </td>
                            <td style={{ padding: '5px 10px', fontFamily: 'JetBrains Mono,monospace', fontSize: 17, color: '#fff', fontWeight: 700 }}>${trade.total_premium.toLocaleString()}</td>
                            <td style={{ padding: '5px 10px', fontFamily: 'JetBrains Mono,monospace', fontSize: 17, color: '#fff' }}>${trade.spot_price?.toFixed(2) || 'N/A'}</td>
                            <td style={{ padding: '5px 10px' }}>
                              <button onClick={() => setSelectedExpiry(selectedExpiry === trade.expiry ? null : trade.expiry)} style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 17, color: selectedExpiry === trade.expiry ? '#22d3ee' : 'rgba(255,255,255,0.65)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>{trade.expiry.split('T')[0]}</button>
                            </td>
                            <td style={{ padding: '5px 10px' }}>
                              <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 16 }}>
                                <div style={{ color: 'rgb(0,153,255)' }}>V: {trade.volume?.toLocaleString() || 'N/A'}</div>
                                <div style={{ color: 'rgb(0,255,94)' }}>O: {trade.open_interest?.toLocaleString() || 'N/A'}</div>
                              </div>
                            </td>
                            <td style={{ padding: '5px 10px', fontFamily: 'JetBrains Mono,monospace', fontSize: 17, color: '#eab308', fontWeight: 700 }}>
                              {liveOI.toLocaleString()} <span style={{ color: change > 0 ? '#10b981' : change < 0 ? '#ef4444' : 'rgba(255,255,255,0.3)', fontSize: 16 }}>({change > 0 ? '+' : ''}{change})</span>
                            </td>
                            <td style={{ padding: '5px 10px' }}>
                              <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 16, fontWeight: 800, color: styleColors[trade.trade_type as keyof typeof styleColors] || styleColors['MINI'] }}>{trade.trade_type || 'MINI'}</span>
                            </td>
                          </tr>
                        )
                      })
                    })()}
                  </tbody>
                </table>
              </div>
              {/* PAGINATION */}
              {(() => {
                const tradesToDisplay = analysis?.trades || flowData
                const totalPages = Math.ceil(tradesToDisplay.length / TRADES_PER_PAGE)
                if (totalPages > 1) {
                  return (
                    <div style={{ padding: '6px 14px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#fff' }}>
                        {(currentPage - 1) * TRADES_PER_PAGE + 1}–{Math.min(currentPage * TRADES_PER_PAGE, tradesToDisplay.length)} OF {tradesToDisplay.length}
                      </span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} style={{ padding: '2px 10px', fontFamily: 'JetBrains Mono,monospace', fontSize: 11, fontWeight: 800, background: '#fff', color: '#000', border: 'none', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', opacity: currentPage === 1 ? 0.3 : 1 }}>PREV</button>
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let p = i + 1
                          if (totalPages > 5) { if (currentPage <= 3) p = i + 1; else if (currentPage >= totalPages - 2) p = totalPages - 4 + i; else p = currentPage - 2 + i }
                          return <button key={p} onClick={() => setCurrentPage(p)} style={{ padding: '2px 8px', fontFamily: 'JetBrains Mono,monospace', fontSize: 11, fontWeight: 800, background: currentPage === p ? '#22d3ee' : 'transparent', color: currentPage === p ? '#000' : 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer' }}>{p}</button>
                        })}
                        <button onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} style={{ padding: '2px 10px', fontFamily: 'JetBrains Mono,monospace', fontSize: 11, fontWeight: 800, background: '#fff', color: '#000', border: 'none', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', opacity: currentPage === totalPages ? 0.3 : 1 }}>NEXT</button>
                      </div>
                    </div>
                  )
                }
                return null
              })()}
              {flowData.length === 0 && (
                <div style={{ padding: 40, textAlign: 'center', fontFamily: 'JetBrains Mono,monospace', fontSize: 12, color: '#fff', letterSpacing: '0.1em' }}>
                  NO TRADES FOUND. SEARCH FOR A TICKER TO SEE ALGOFLOW TRADES.
                </div>
              )}
            </div>{/* end ROW 3 */}
          </div>
        )}

        {/* NO RESULTS STATE */}
        {!loading && !isAnalyzing && !analysis && searchTicker && (
          <div style={{ padding: 40, textAlign: 'center', border: '1px solid rgba(255,255,255,0.15)' }}>
            <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 13, color: '#fff', fontWeight: 700, letterSpacing: '0.1em' }}>
              NO FLOW DATA FOUND FOR {searchTicker}
            </div>
            <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#fff', marginTop: 6, letterSpacing: '0.08em' }}>
              TRY A DIFFERENT TICKER OR CHECK IF THE MARKET IS OPEN
            </div>
          </div>
        )}

      </div>{/* end scrollable content */}
    </div>
  )
}
