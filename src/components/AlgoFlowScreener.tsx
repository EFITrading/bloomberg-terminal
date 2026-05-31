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
import dynamic from 'next/dynamic'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const TradingViewChart = dynamic(() => import('./trading/EFICharting'), { ssr: false })

// Polygon API key for bid/ask analysis
const POLYGON_API_KEY = process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''

// Function to fetch volume and open interest data for trades
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
    // Declare current spot price variable for this underlying
    let currentSpotPrice: number | null = null

    try {
      // First, get the current spot price for this underlying - this will be overridden by contract data if available
      try {
        const spotPriceUrl =
          underlying === 'SPX'
            ? `https://api.polygon.io/v2/last/trade/SPX?apikey=${POLYGON_API_KEY}`
            : `https://api.polygon.io/v2/last/trade/${underlying}?apikey=${POLYGON_API_KEY}`

        const priceResponse = await fetch(spotPriceUrl)
        if (priceResponse.ok) {
          const priceData = await priceResponse.json()
          if (priceData.status === 'OK' && priceData.results) {
            currentSpotPrice = priceData.results.p
          }
        }
      } catch (error) {
        console.warn(`⚠️ Failed to fetch ${underlying} spot price fallback:`, error)
      }

      // Get unique expiration dates for this underlying to fetch specific expirations
      const uniqueExpirations = [...new Set(underlyingTrades.map((t) => t.expiry))]

      const allContracts = new Map()

      // Fetch data for each expiration date separately to get all contracts WITH FULL PAGINATION
      for (const expiry of uniqueExpirations) {
        const expiryParam = expiry.includes('T') ? expiry.split('T')[0] : expiry

        // Use underlying ticker directly (SPX works as-is)
        const apiUnderlying = underlying

        // FULL PAGINATION LOGIC - Get ALL contracts for this expiration
        let nextUrl: string | null =
          `https://api.polygon.io/v3/snapshot/options/${apiUnderlying}?expiration_date=${expiryParam}&limit=250&apikey=${POLYGON_API_KEY}`
        let totalContractsForExpiry = 0

        while (nextUrl && totalContractsForExpiry < 10000) {
          // Safety limit
          const response: Response = await fetch(nextUrl)

          if (response.ok) {
            const chainData: any = await response.json()
            if (chainData.results && chainData.results.length > 0) {
              // Get SPX price from the first contract's underlying_asset.value
              if (!currentSpotPrice && chainData.results[0]?.underlying_asset?.value) {
                currentSpotPrice = chainData.results[0].underlying_asset.value
              }

              chainData.results.forEach((contract: any, index: number) => {
                if (contract.details && contract.details.ticker) {
                  allContracts.set(contract.details.ticker, {
                    volume: contract.day?.volume || 0,
                    open_interest: contract.open_interest || 0,
                  })
                }
              })
              totalContractsForExpiry += chainData.results.length

              // Check for next page
              nextUrl = chainData.next_url
                ? `${chainData.next_url}&apikey=${POLYGON_API_KEY}`
                : null
            } else {
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
      }

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

      // Match trades to contracts and update with vol/OI data
      for (const trade of underlyingTrades) {
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
          contractData = contractLookup.get(optionTicker)
        }

        if (contractData) {
          updatedTrades.push({
            ...trade,
            volume: contractData.volume,
            open_interest: contractData.open_interest,
            spot_price: currentSpotPrice || trade.spot_price,
          })
        } else {
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

  return updatedTrades
}

// Calculate Live Open Interest based on fill styles
// Cache for Live OI calculations to avoid recalculating for same contract
const liveOICache = new Map<string, number>()

const calculateLiveOI = (originalOI: number, trades: any[], contractKey: string): number => {
  // SIMPLIFIED: Just return the original OI since fill styles are unreliable
  // The OI from Polygon is already the most current available

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
      return
    }

    processedTradeIds.add(tradeId)

    const contracts = trade.trade_size || 0
    const fillStyle = trade.fill_style

    switch (fillStyle) {
      case 'A': // Add to OI (opening)
      case 'AA': // Add to OI (opening)
      case 'BB': // Add to OI (opening)
        liveOI += contracts
        break
      case 'B': // Smart B fill logic
        if (contracts > originalOI) {
          // If B fill exceeds original OI, it's actually opening positions
          liveOI += contracts
        } else {
          liveOI -= contracts
        }
        break
      default:
        break
    }
  })

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
    pcRatio: number // Cumulative puts / cumulative calls premium
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
  // Fill-style quadrant premiums
  bullCallPremium: number
  bearCallPremium: number
  bullPutPremium: number
  bearPutPremium: number
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
  if (trades.length === 0) return trades

  // Process ALL trades - no sampling for accurate fill_style classification
  const tradesToAnalyze = trades
  const useStatisticalInference = false

  // Create optimal batches for parallel processing
  const BATCH_SIZE = 20 // Optimal batch size for API rate limits
  const MAX_CONCURRENT_BATCHES = 5 // Limit concurrent batches to avoid overwhelming API

  const batches = []
  for (let i = 0; i < tradesToAnalyze.length; i += BATCH_SIZE) {
    batches.push(tradesToAnalyze.slice(i, i + BATCH_SIZE))
  }

  // Process batches in controlled parallel chunks
  const allResults: any[] = []
  const totalChunks = Math.ceil(batches.length / MAX_CONCURRENT_BATCHES)

  for (let i = 0; i < batches.length; i += MAX_CONCURRENT_BATCHES) {
    const currentChunk = Math.floor(i / MAX_CONCURRENT_BATCHES) + 1
    const batchChunk = batches.slice(i, i + MAX_CONCURRENT_BATCHES)

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

  return finalTrades
}

const NetFlowColoredLine = (props: any) => {
  const { xAxisMap, yAxisMap, visibleData, isHidden } = props
  if (isHidden || !xAxisMap || !yAxisMap || !visibleData) return null
  const xAxisEntry = Object.values(xAxisMap)[0] as any
  const flowAxisEntry = (yAxisMap as any)['flow']
  if (!xAxisEntry || !flowAxisEntry) return null
  const xScale = xAxisEntry.scale
  const yScale = flowAxisEntry.scale
  if (!xScale || !yScale) return null
  const bandwidth: number = xScale.bandwidth ? xScale.bandwidth() : 8
  const points = (visibleData as any[]).map((point: any) => ({
    x: xScale(point.timeLabel) + bandwidth / 2,
    y: yScale(point.netFlow ?? 0),
    value: point.netFlow ?? 0,
  })).filter((p: any) => !isNaN(p.x) && !isNaN(p.y))
  if (points.length < 2) return null
  return (
    <g>
      {points.slice(1).map((end: any, i: number) => {
        const start = points[i]
        const isNeg = start.value < 0 || end.value < 0
        return <line key={i} x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={isNeg ? '#ff2222' : '#00ff7f'} strokeWidth={3} />
      })}
    </g>
  )
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

const MAG7_TICKERS = ['AAPL', 'NVDA', 'MSFT', 'TSLA', 'AMZN', 'META', 'GOOGL', 'GOOG']
const ETF_TICKERS = [
  'SPY', 'QQQ', 'DIA', 'IWM', 'XLK', 'SMH', 'XLE', 'XLF', 'XLV', 'XLI',
  'XLP', 'XLU', 'XLY', 'XLB', 'XLRE', 'XLC', 'GLD', 'SLV', 'TLT', 'HYG',
  'LQD', 'EEM', 'EFA', 'VXX', 'UVXY',
]

// Module-level holiday list used by both the chart slot generator (inside calculateAlgoFlowAnalysis)
// and the saved-data check in fetchTickerFlow.
const ALGO_MARKET_HOLIDAYS = [
  '2025-01-01', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26',
  '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25',
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
  '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
]

// Returns the last N trading days (oldest → newest) for the given timeframe string.
function getAlgoTradingDays(timeframe: string): string[] {
  const days: string[] = []
  const pstNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
  const daysNeeded =
    timeframe === '1D' ? 1
      : timeframe === '3D' ? 3
        : timeframe === '1W' ? 5
          : Math.max(1, parseInt(timeframe) || 1)
  const cur = new Date(pstNow)
  while (days.length < daysNeeded) {
    const dow = cur.getDay()
    const ds = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
    if (dow !== 0 && dow !== 6 && !ALGO_MARKET_HOLIDAYS.includes(ds)) days.push(ds)
    cur.setDate(cur.getDate() - 1)
  }
  return days.reverse()
}

export default function AlgoFlowScreener({ onBack }: { onBack?: () => void } = {}) {
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
  const [timeInterval, setTimeInterval] = useState<'1min' | '5min' | '15min' | '30min' | '1hour'>('1hour')
  const [chartViewMode, setChartViewMode] = useState<'detailed' | 'simplified' | 'net'>('detailed')
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set())
  const toggleLine = (key: string) => setHiddenLines(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  const [scanTimeframe, setScanTimeframe] = useState<string>('1D')
  const [chartDisplayDays, setChartDisplayDays] = useState<number>(1)
  const [brushIndices, setBrushIndices] = useState<{ start: number; end: number } | null>(null)
  const chartDragRef = useRef<{ dragging: boolean; startX: number; startIndices: { start: number; end: number } }>({ dragging: false, startX: 0, startIndices: { start: 0, end: 0 } })
  const chartDivRef = useRef<HTMLDivElement>(null)
  // Tracks the current multi-scan label (MAG7 / ALL) so re-analysis on timeframe change preserves it
  const multiScanLabelRef = useRef<string | undefined>(undefined)

  // Missing-days dialog state
  const [missingDaysDialog, setMissingDaysDialog] = useState<{
    missingDays: string[]
    savedTrades: OptionsFlowData[]
    originalSearch: string
    tf: string
    displayLabel: string | undefined
  } | null>(null)

  // Pagination and sorting state
  const [currentPage, setCurrentPage] = useState(1)
  const [sortColumn, setSortColumn] = useState<string>('trade_timestamp')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const TRADES_PER_PAGE = 20

  // Mobile column management
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  // Strike price filtering
  const [selectedStrike, setSelectedStrike] = useState<number | null>(null)

  // Expiry date filtering
  const [selectedExpiry, setSelectedExpiry] = useState<string | null>(null)

  // Calculate algo flow analysis using YOUR REAL tier system and SWEEP/BLOCK detection
  const calculateAlgoFlowAnalysis = async (
    trades: OptionsFlowData[],
    displayLabel?: string
  ): Promise<AlgoFlowAnalysis | null> => {
    if (!trades.length) return null

    const ticker = displayLabel ?? trades[0].underlying_ticker
    const currentPrice = displayLabel ? 0 : trades[0].spot_price

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
    const tradesNeedingAnalysis = classifiedTrades.filter(
      (t) => !t.fill_style || t.fill_style === 'N/A'
    )
    const tradesWithExistingFillStyle = classifiedTrades.filter(
      (t) => t.fill_style && t.fill_style !== 'N/A'
    )

    let analyzedTrades = []
    if (tradesNeedingAnalysis.length > 0) {
      analyzedTrades = await analyzeBidAskExecutionLightning(tradesNeedingAnalysis)
    }

    // Combine trades: those with existing fill_style + newly analyzed trades
    const tradesWithExecution = [...tradesWithExistingFillStyle, ...analyzedTrades]

    // Single pass replaces ~17 separate filter/reduce operations — critical for large ALL scans
    let totalCallPremium = 0, totalPutPremium = 0
    let callCount = 0, putCount = 0
    let sweepCount = 0, blockCount = 0, miniCount = 0
    let tier1Count = 0, tier2Count = 0, tier3Count = 0, tier4Count = 0
    let tier5Count = 0, tier6Count = 0, tier7Count = 0, tier8Count = 0
    let aggressiveCalls = 0, aggressivePuts = 0
    let aggressiveCallPremium = 0, aggressivePutPremium = 0
    let nonAggressiveCallPremium = 0, nonAggressivePutPremium = 0
    let sweepBlockCalls = 0, sweepBlockPuts = 0
    let bullCallPremium = 0, bearCallPremium = 0, bullPutPremium = 0, bearPutPremium = 0
    for (const t of tradesWithExecution) {
      const isCall = (t as any).type === 'call'
      const premium = (t as any).total_premium
      if (isCall) { totalCallPremium += premium; callCount++ } else { totalPutPremium += premium; putCount++ }
      switch ((t as any).trade_type) {
        case 'SWEEP': sweepCount++; if (isCall) sweepBlockCalls++; else sweepBlockPuts++; break
        case 'BLOCK': blockCount++; if (isCall) sweepBlockCalls++; else sweepBlockPuts++; break
        default: miniCount++
      }
      switch ((t as any).tier) {
        case 'TIER_1': tier1Count++; break; case 'TIER_2': tier2Count++; break
        case 'TIER_3': tier3Count++; break; case 'TIER_4': tier4Count++; break
        case 'TIER_5': tier5Count++; break; case 'TIER_6': tier6Count++; break
        case 'TIER_7': tier7Count++; break; default: tier8Count++
      }
      if (premium >= 50_000) {
        if (isCall) { aggressiveCalls++; aggressiveCallPremium += premium }
        else { aggressivePuts++; aggressivePutPremium += premium }
      } else {
        if (isCall) nonAggressiveCallPremium += premium; else nonAggressivePutPremium += premium
      }
      // Fill-style quadrant tracking (A/AA = bullish, B/BB = bearish)
      const fs = (t as any).fill_style
      const isBull = fs === 'A' || fs === 'AA'
      const isBear = fs === 'B' || fs === 'BB'
      if (isCall) { if (isBull) bullCallPremium += premium; else if (isBear) bearCallPremium += premium }
      else { if (isBull) bullPutPremium += premium; else if (isBear) bearPutPremium += premium }
    }
    const netFlow = totalCallPremium - totalPutPremium
    const callPutRatio = putCount > 0 ? callCount / putCount : callCount
    const totalPremium = totalCallPremium + totalPutPremium
    const premiumRatio = totalPremium > 0 ? netFlow / totalPremium : 0
    const volumeRatio = tradesWithExecution.length > 0 ? (callCount - putCount) / tradesWithExecution.length : 0
    const aggressiveTotalPremium = aggressiveCallPremium + aggressivePutPremium
    const aggressiveRatio = aggressiveTotalPremium > 0 ? (aggressiveCallPremium - aggressivePutPremium) / aggressiveTotalPremium : 0
    const nonAggressiveTotalPremium = nonAggressiveCallPremium + nonAggressivePutPremium
    const nonAggressiveRatio = nonAggressiveTotalPremium > 0 ? (nonAggressiveCallPremium - nonAggressivePutPremium) / nonAggressiveTotalPremium : 0
    const pcRatioScore = callPutRatio > 0 ? Math.tanh((callPutRatio - 1) * 0.5) : -1
    const sweepBlockCount = sweepCount + blockCount
    const sweepBlockRatio = tradesWithExecution.length > 0 ? sweepBlockCount / tradesWithExecution.length : 0
    const sweepBlockScore = sweepBlockCount > 0 ? (sweepBlockCalls - sweepBlockPuts) / sweepBlockCount : 0

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
        case '1min':
          intervalMinutes = 1
          break
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
        // Always add the final market close slot (1:00 PM PST = market close)
        slots.push('13:00')
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

    // Derive effective interval from scanTimeframe so chart resolution adapts automatically
    const scanDaysForInterval = getScanDays(scanTimeframe)
    const effectiveInterval: '1min' | '5min' | '15min' | '30min' | '1hour' =
      scanDaysForInterval <= 2 ? '1min'
        : scanDaysForInterval <= 5 ? '30min'
          : '1hour'

    const timeSlots = getTimeSlots(effectiveInterval, scanTimeframe)
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
            case '1min':
              slotMinutes = Math.floor(totalMinutes / 1) * 1
              break
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
        timeKey = getTimeSlot(hour, minute, effectiveInterval)
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
          netFlow: 0,
          bullishTotal: 0,
          bearishTotal: 0,
          pcRatio: 0,
        }
        cumulative.netFlow =
          cumulative.callsPlus -
          cumulative.callsMinus +
          (cumulative.putsPlus - cumulative.putsMinus)
        cumulative.bullishTotal = cumulative.callsPlus + cumulative.putsPlus
        cumulative.bearishTotal = -(cumulative.callsMinus + cumulative.putsMinus)
        // P/C: Bearish (bear calls + bear puts) ÷ Bullish (bull calls + bull puts)
        const cumBullish = cumulative.callsPlus + cumulative.putsPlus
        const cumBearish = cumulative.callsMinus + cumulative.putsMinus
        cumulative.pcRatio = cumBullish > 0 ? cumBearish / cumBullish : 1
        acc.push(cumulative)
        return acc
      }, [])

    // 🚨 FETCH REAL PRICE DATA FROM POLYGON API — skipped for multi-ticker scans
    let finalPriceData: Array<{
      time: number
      open: number
      high: number
      low: number
      close: number
    }> = []

    if (!displayLabel) {
      try {
        // Determine interval: day bars for multi-week, hour bars for multi-day, minute for 1D
        const scanDays = getScanDays(scanTimeframe)
        const tradingDays = getTradingDays(scanTimeframe)
        const startDate = tradingDays[0]
        const endDate = tradingDays[tradingDays.length - 1]

        let priceMultiplier = 5
        let priceTimespan = 'minute'
        if (scanDays > 10) {
          priceMultiplier = 1
          priceTimespan = 'day'
        } else if (scanDays > 5) {
          priceMultiplier = 60
          priceTimespan = 'minute' // 1-hour bars
        } else if (scanDays > 2) {
          priceMultiplier = 30
          priceTimespan = 'minute' // 30-min bars
        } // else: 1-2 days → 5-min bars (default)

        // Fetch REAL aggregated bars from Polygon covering full scan range
        const polygonUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/${priceMultiplier}/${priceTimespan}/${startDate}/${endDate}?adjusted=true&sort=asc&limit=50000&apiKey=${POLYGON_API_KEY}`
        const response = await fetch(polygonUrl)
        const data = await response.json()

        if (data.results && data.results.length > 0) {


          // Convert Polygon results to our chart format
          finalPriceData = data.results.map((bar: any) => ({
            time: bar.t, // Polygon timestamp in milliseconds
            open: bar.o,
            high: bar.h,
            low: bar.l,
            close: bar.c,
          }))

        } else {
          console.warn(
            `⚠️ NO REAL DATA from Polygon for ${ticker} from ${startDate} to ${endDate} - chart will be empty`
          )
          finalPriceData = []
        }
      } catch (error) {
        console.error(`❌ FAILED TO FETCH REAL PRICE DATA for ${ticker}:`, error)
        finalPriceData = []
      }
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
      // Fill-style quadrant premiums for the gauge
      bullCallPremium,
      bearCallPremium,
      bullPutPremium,
      bearPutPremium,
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
  const performAnalysis = async (tradesData: any[], displayLabel?: string) => {
    if (tradesData.length > 0) {
      setIsAnalyzing(true)
      try {
        const result = await calculateAlgoFlowAnalysis(tradesData, displayLabel)

        // Merge volume/OI data into analysis trades
        if (result && result.trades) {
          result.trades = result.trades.map((analyzedTrade: any) => {
            // Find matching trade - try exact ticker first, then by contract details
            let enrichedTrade = tradesData.find((t) => t.ticker === analyzedTrade.ticker)

            if (!enrichedTrade) {
              enrichedTrade = tradesData.find(
                (t) =>
                  t.underlying_ticker === analyzedTrade.underlying_ticker &&
                  t.strike === analyzedTrade.strike &&
                  t.expiry === analyzedTrade.expiry &&
                  t.type === analyzedTrade.type
              )
            }

            if (
              enrichedTrade &&
              (enrichedTrade.volume !== undefined || enrichedTrade.open_interest !== undefined)
            ) {
              return {
                ...analyzedTrade,
                volume: enrichedTrade.volume,
                open_interest: enrichedTrade.open_interest,
              }
            }
            return analyzedTrade
          })
        }

        setAnalysis(result)
      } catch (error) {
        console.error('Error in analysis:', error)
        setAnalysis(null)
      } finally {
        setIsAnalyzing(false)
      }
    } else {
      setAnalysis(null)
    }
  }

  // Clear analysis when flowData changes (but don't auto-run analysis)
  useEffect(() => {
    if (flowData.length === 0) {
      setAnalysis(null)
    }
  }, [flowData])

  // Sync chart view window when scan timeframe changes (no auto re-analyze — user must click ANALYZE)
  useEffect(() => {
    setChartDisplayDays(getScanDays(scanTimeframe))
    setBrushIndices(null)
  }, [scanTimeframe])

  // Reset brush when chartDisplayDays changes — merged into button click handler, no separate effect needed

  // Memoize trades-table OI computation — prevents rerunning 36k-trade loop on every render
  const tradeOIMemo = useMemo(() => {
    const allTrades: any[] = analysis?.trades || flowData || []
    const isMultiDay = getScanDays(scanTimeframe) > 1
    const contractDayGroups = new Map<string, any[]>()
    const firstDayPerContract = new Map<string, string>()
    const lastDayPerContract = new Map<string, string>()
    for (const t of allTrades) {
      const day = new Date(t.trade_timestamp).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
      const ck = `${t.underlying_ticker}_${t.strike}_${t.type}_${t.expiry}`
      const k = `${ck}_${day}`
      if (!contractDayGroups.has(k)) contractDayGroups.set(k, [])
      contractDayGroups.get(k)!.push(t)
      const fd = firstDayPerContract.get(ck); if (!fd || day < fd) firstDayPerContract.set(ck, day)
      const ld = lastDayPerContract.get(ck); if (!ld || day > ld) lastDayPerContract.set(ck, day)
    }
    const liveOIMap = new Map<string, number>()
    const baseOIMap = new Map<string, number>()
    for (const [k, group] of contractDayGroups) {
      const sorted = group.slice().sort((a: any, b: any) => new Date(a.trade_timestamp).getTime() - new Date(b.trade_timestamp).getTime())
      const baseOI = sorted[0].open_interest ?? 0
      baseOIMap.set(k, baseOI)
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
    const multiDayOIChange = new Map<string, number>()
    const lastDayVolumeMap = new Map<string, number | undefined>()
    const lastDayOISnapshotMap = new Map<string, number | undefined>()
    if (isMultiDay) {
      for (const [ck, firstDay] of firstDayPerContract) {
        const lastDay = lastDayPerContract.get(ck)!
        const firstBaseOI = baseOIMap.get(`${ck}_${firstDay}`) ?? 0
        const lastLiveOI = liveOIMap.get(`${ck}_${lastDay}`) ?? firstBaseOI
        multiDayOIChange.set(ck, lastLiveOI - firstBaseOI)
        const lastGroup = contractDayGroups.get(`${ck}_${lastDay}`)
        if (lastGroup) {
          const lastSorted = lastGroup.slice().sort((a: any, b: any) => new Date(a.trade_timestamp).getTime() - new Date(b.trade_timestamp).getTime())
          const lt = lastSorted[lastSorted.length - 1]
          lastDayVolumeMap.set(ck, lt.volume)
          lastDayOISnapshotMap.set(ck, lt.open_interest)
        }
      }
    }
    return { isMultiDay, liveOIMap, baseOIMap, multiDayOIChange, lastDayVolumeMap, lastDayOISnapshotMap }
  }, [analysis?.trades, flowData, scanTimeframe])

  // Memoize chart data so button clicks don't recompute on unrelated re-renders
  const chartMemo = useMemo(() => {
    if (!analysis?.chartData) return { visibleData: [] as any[], xInterval: 0, priceMin: 'auto' as any, priceMax: 'auto' as any }
    const scanDays = getScanDays(scanTimeframe)
    const baseData = chartDisplayDays >= scanDays
      ? analysis.chartData
      : analysis.chartData.filter((d: any) => d.time >= Date.now() - chartDisplayDays * 1.5 * 24 * 60 * 60 * 1000)
    const len = baseData.length
    const bStart = brushIndices ? Math.max(0, Math.min(brushIndices.start, len - 1)) : 0
    const bEnd = brushIndices ? Math.max(bStart + 1, Math.min(brushIndices.end, len - 1)) : len - 1
    const visibleData = baseData.slice(bStart, bEnd + 1)
    const xInterval = Math.max(0, Math.floor(visibleData.length / 12) - 1)
    const priceLows = visibleData.map((d: any) => d.stockLow).filter((p: any) => p != null && !isNaN(p))
    const priceHighs = visibleData.map((d: any) => d.stockHigh).filter((p: any) => p != null && !isNaN(p))
    const priceMin = priceLows.length ? Math.min(...priceLows) * 0.95 : 'auto'
    const priceMax = priceHighs.length ? Math.max(...priceHighs) * 1.05 : 'auto'
    return { visibleData, xInterval, priceMin, priceMax }
  }, [analysis?.chartData, chartDisplayDays, scanTimeframe, brushIndices])

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

  // Fetch flow data for specific ticker (or MAG7 / ALL group)
  const fetchTickerFlow = async (
    tickerToSearch: string,
    tfOverride?: string,
    options?: { specificDates?: string; preMergedTrades?: OptionsFlowData[] }
  ) => {
    if (!tickerToSearch.trim()) return
    const tf = tfOverride ?? scanTimeframe

    // Expand group keywords → comma-list of actual tickers
    const upper = tickerToSearch.trim().toUpperCase()
    let actualTickers: string
    let displayLabel: string | undefined
    if (upper === 'MAG7') {
      actualTickers = MAG7_TICKERS.join(',')
      displayLabel = 'MAG7'
    } else if (upper === 'ALL') {
      actualTickers = [...MAG7_TICKERS, ...ETF_TICKERS].join(',')
      displayLabel = 'ALL'
    } else {
      actualTickers = upper
      displayLabel = undefined
    }

    setLoading(true)
    setError('')
    setIsStreamComplete(false)
    multiScanLabelRef.current = displayLabel

    // Check saved data first (skip when scanning specific missing dates)
    if (!options?.specificDates) {
      setStreamStatus('Checking saved data...')
      try {
        const datesResp = await fetch('/api/flows/dates')
        if (datesResp.ok) {
          const dates: { date: string }[] = await datesResp.json()
          if (dates.length > 0) {
            const allRequiredDays = getAlgoTradingDays(tf)
            const requiredDayCount = allRequiredDays.length

            // Take the N most recent unique calendar-day rows (N = days needed for timeframe).
            // We group by UTC date of the DB key — NOT used for trading-day matching,
            // just to avoid loading duplicate saves from the same day.
            const seenDayKeys = new Set<string>()
            const rowsToLoad: string[] = []
            for (const { date: rawDate } of dates) {
              const dayKey = new Date(rawDate).toISOString().split('T')[0]
              if (!seenDayKeys.has(dayKey)) {
                seenDayKeys.add(dayKey)
                rowsToLoad.push(rawDate)
              }
              if (rowsToLoad.length >= requiredDayCount) break
            }

            if (rowsToLoad.length > 0) {
              const dayPayloads = await Promise.all(
                rowsToLoad.map(async (rawDate) => {
                  const r = await fetch(`/api/flows/${encodeURIComponent(rawDate)}`)
                  return r.ok ? r.json() : null
                })
              )
              const combinedTrades: OptionsFlowData[] = []
              for (const payload of dayPayloads) {
                if (Array.isArray(payload?.data)) combinedTrades.push(...payload.data)
              }

              // Determine which required trading days are actually present in the
              // trade data — uses trade_timestamp in PST (same timezone as getAlgoTradingDays).
              // toISOString() gives UTC which can shift the date for after-hours timestamps;
              // en-CA locale gives YYYY-MM-DD in the specified timezone.
              const tradeDaySet = new Set(
                combinedTrades.map((t: OptionsFlowData) =>
                  new Date(t.trade_timestamp).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
                )
              )
              const coveredDays = allRequiredDays.filter((d) => tradeDaySet.has(d))
              const missingDays = allRequiredDays.filter((d) => !tradeDaySet.has(d))

              // When scanning ALL (or MAG7), skip the ticker filter — return every trade
              // in the saved data. The DB was saved from a broader scan so filtering
              // to a hardcoded 33-ticker set throws away legitimate data.
              const saved = displayLabel === 'ALL' || displayLabel === 'MAG7'
                ? combinedTrades
                : combinedTrades.filter((t: OptionsFlowData) =>
                  new Set(actualTickers.split(',').map((x) => x.trim().toUpperCase()))
                    .has(t.underlying_ticker?.toUpperCase() ?? '')
                )

              if (saved.length > 0 && missingDays.length === 0) {
                // Full coverage and ticker data found — use saved
                setFlowData(saved)
                accumulatedTradesRef.current = saved
                liveOICache.clear()
                setIsStreamComplete(true)
                setStreamStatus(`Loaded from saved — ${saved.length} trades`)
                setLoading(false)
                performAnalysis(saved, displayLabel).catch(() => { })
                return
              } else if (saved.length > 0 && coveredDays.length > 0) {
                // Partial coverage but have some ticker data — show missing days dialog
                setLoading(false)
                setStreamStatus('')
                setMissingDaysDialog({ missingDays, savedTrades: saved, originalSearch: tickerToSearch, tf, displayLabel })
                return
              }
              // saved.length === 0 means ticker not in saved data → fall through to live scan
            }
          }
        }
      } catch (err) { console.warn('[AlgoFlow] saved check error:', err) }
    }

    setStreamStatus('Connecting...')
    const url = options?.specificDates
      ? `/api/stream-options-flow?ticker=${actualTickers}&timeframe=${tf}&dates=${options.specificDates}`
      : `/api/stream-options-flow?ticker=${actualTickers}&timeframe=${tf}`
    setFlowData([])
    accumulatedTradesRef.current = [] // Reset accumulated trades ref
    liveOICache.clear() // Clear Live OI cache when starting new search

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
              // Also merge any pre-loaded saved trades (from partial-coverage scan).
              const completeTrades: OptionsFlowData[] = [
                ...(data.trades?.length > 0 ? data.trades : accumulatedTradesRef.current),
                ...(options?.preMergedTrades ?? []),
              ]

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
                    performAnalysis(tradesWithVolOI, displayLabel).catch(() => { })
                  })
                  .catch(() => {
                    setFlowData(completeTrades)
                    liveOICache.clear()
                    setStreamStatus('Complete (volume/OI unavailable)')
                    setLoading(false)
                    performAnalysis(completeTrades, displayLabel).catch(() => { })
                  })
              } else {
                setError(`No options flow data found for ${actualTickers}`)
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
    if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
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

  // Flow Quadrant Gauge — 4 liquid-filled quadrants (Bull/Bear Calls & Puts) + center neutral
  const FlowQuadrantGauge = ({
    bullCall, bearCall, bullPut, bearPut, score, label,
  }: {
    bullCall: number; bearCall: number; bullPut: number; bearPut: number; score: number; label: string
  }) => {
    const total = bullCall + bearCall + bullPut + bearPut || 1
    const W = 68, H = 50, amp = 3
    const quads = [
      { id: 'bc', lbl: 'BULL CALLS', val: bullCall, color: '#10b981', x: 2, y: 4 },
      { id: 'rc', lbl: 'BEAR CALLS', val: bearCall, color: '#ef4444', x: 90, y: 4 },
      { id: 'bp', lbl: 'BULL PUTS', val: bullPut, color: '#3b82f6', x: 2, y: 66 },
      { id: 'rp', lbl: 'BEAR PUTS', val: bearPut, color: '#f97316', x: 90, y: 66 },
    ]
    const speeds = [2.0, 2.6, 1.8, 2.3]
    const absScore = Math.abs(score)
    const scoreColor = absScore < 0.2 ? '#eab308' : score > 0 ? '#10b981' : '#ef4444'
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 4px 4px', width: '100%' }}>
        <svg width="200" height="148" viewBox="0 0 160 118" style={{ overflow: 'visible' }}>
          <style>{`
            @keyframes fqw0{from{transform:translateX(0px)}to{transform:translateX(-${W}px)}}
            @keyframes fqw1{from{transform:translateX(0px)}to{transform:translateX(-${W}px)}}
            @keyframes fqw2{from{transform:translateX(0px)}to{transform:translateX(-${W}px)}}
            @keyframes fqw3{from{transform:translateX(0px)}to{transform:translateX(-${W}px)}}
          `}</style>
          {quads.map((q, i) => {
            const fill = q.val / total
            const liquidH = fill * H
            const waveY = q.y + H - liquidH
            const clipId = `fq${i}`
            const wx = q.x - W
            const bottom = q.y + H
            const wp = `M${wx} ${waveY} ` +
              `q${W / 4} ${-amp} ${W / 2} 0 q${W / 4} ${amp} ${W / 2} 0 ` +
              `q${W / 4} ${-amp} ${W / 2} 0 q${W / 4} ${amp} ${W / 2} 0 ` +
              `q${W / 4} ${-amp} ${W / 2} 0 q${W / 4} ${amp} ${W / 2} 0 ` +
              `V${bottom} H${wx} Z`
            return (
              <g key={q.id}>
                <defs><clipPath id={clipId}><rect x={q.x} y={q.y} width={W} height={H} rx="3" /></clipPath></defs>
                <rect x={q.x} y={q.y} width={W} height={H} rx="3" fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.07)" strokeWidth="0.5" />
                <g clipPath={`url(#${clipId})`}>
                  {fill > 0.005 && (
                    <>
                      <rect x={q.x} y={Math.max(q.y, waveY + amp)} width={W} height={Math.max(0, bottom - Math.max(q.y, waveY + amp))} fill={q.color} opacity={0.35} />
                      <g style={{ animationName: `fqw${i}`, animationDuration: `${speeds[i]}s`, animationTimingFunction: 'linear', animationIterationCount: 'infinite' }}>
                        <path d={wp} fill={q.color} opacity={0.65} />
                      </g>
                    </>
                  )}
                </g>
                <text x={q.x + W / 2} y={q.y + 11} textAnchor="middle" fill="#ffffff" fontSize="8.5" fontFamily="JetBrains Mono,monospace" fontWeight="700" letterSpacing="0.5">{q.lbl}</text>
                <text x={q.x + W / 2} y={q.y + H - 5} textAnchor="middle" fill="#ffffff" fontSize="14" fontFamily="JetBrains Mono,monospace" fontWeight="800">{(fill * 100).toFixed(0)}%</text>
              </g>
            )
          })}
          {/* Center neutral circle */}
          <circle cx={80} cy={59} r={15} fill="rgba(4,4,12,0.92)" stroke="rgba(255,255,255,0.13)" strokeWidth="1" />
          <text x={80} y={54} textAnchor="middle" dominantBaseline="middle" fill="#ffffff" fontSize="7.5" fontFamily="JetBrains Mono,monospace" fontWeight="700">NEU</text>
          <text x={80} y={66} textAnchor="middle" dominantBaseline="middle" fill={scoreColor} fontSize="9" fontFamily="JetBrains Mono,monospace" fontWeight="800">{score.toFixed(2)}</text>
        </svg>
        <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 16, fontWeight: 800, color: '#ff8500', letterSpacing: '0.22em', marginTop: 10 }}>{label}</div>
      </div>
    )
  }

  // Legacy gauge (unused — kept for reference)
  const _GaugeChart = ({
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
    const cx = 80, cy = 88, outerR = 66, innerR = 50
    const clamp = Math.max(-max, Math.min(max, value))
    const gaugeAngle = ((clamp + max) / (2 * max)) * 180

    const polarXY = (gAngle: number, r: number) => {
      const rad = ((180 - gAngle) * Math.PI) / 180
      return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) }
    }

    const arc = (a0: number, a1: number, rIn: number, rOut: number) => {
      const p0 = polarXY(a0, rOut), p1 = polarXY(a1, rOut)
      const p2 = polarXY(a1, rIn), p3 = polarXY(a0, rIn)
      const lg = (a1 - a0) >= 180 ? 1 : 0
      return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${rOut} ${rOut} 0 ${lg} 0 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} L ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} A ${rIn} ${rIn} 0 ${lg} 1 ${p3.x.toFixed(2)} ${p3.y.toFixed(2)} Z`
    }

    const needle = polarXY(gaugeAngle, outerR - 4)
    const nb1 = polarXY(gaugeAngle + 90, 5)
    const nb2 = polarXY(gaugeAngle - 90, 5)

    const glowId = `g-${label.replace(/\s/g, '')}`

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 4px 6px', width: '100%' }}>
        <svg width="200" height="125" viewBox="0 0 160 100" style={{ overflow: 'visible' }}>
          <defs>
            <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <linearGradient id={`fill-${glowId}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={color} stopOpacity="0.7" />
              <stop offset="100%" stopColor={color} stopOpacity="1" />
            </linearGradient>
            <radialGradient id={`sheen-${glowId}`} cx="50%" cy="0%" r="80%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </radialGradient>
          </defs>

          {/* Zone backgrounds */}
          <path d={arc(0, 60, innerR, outerR)} fill="rgba(239,68,68,0.38)" />
          <path d={arc(60, 120, innerR, outerR)} fill="rgba(234,179,8,0.38)" />
          <path d={arc(120, 180, innerR, outerR)} fill="rgba(16,185,129,0.38)" />

          {/* Track base */}
          <path d={arc(0, 180, innerR, outerR)} fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />

          {/* Zone separators */}
          {[0, 60, 120, 180].map((deg) => {
            const i = polarXY(deg, innerR - 2), o = polarXY(deg, outerR + 2)
            return <line key={deg} x1={i.x} y1={i.y} x2={o.x} y2={o.y} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
          })}

          {/* Minor tick marks */}
          {Array.from({ length: 37 }, (_, i) => {
            const d = i * 5
            const isMaj = d % 30 === 0
            const p0 = polarXY(d, outerR + (isMaj ? 5 : 3))
            const p1 = polarXY(d, outerR + 1)
            return <line key={i} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke={isMaj ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.18)'} strokeWidth={isMaj ? 1.5 : 0.8} />
          })}

          {/* Single-color fill — 0° to needle, one solid color based on current zone */}
          {gaugeAngle > 0.5 && (
            <path d={arc(0, gaugeAngle, innerR, outerR)} fill={color} opacity={0.85} filter={`url(#${glowId})`} />
          )}

          {/* Glossy sheen over fill */}
          {gaugeAngle > 0.5 && (
            <path d={arc(0, gaugeAngle, (innerR + outerR) / 2, outerR)} fill={`url(#sheen-${glowId})`} />
          )}

          {/* Zone labels */}
          {[
            { angle: 22, text: 'BEAR', col: 'rgba(239,68,68,0.75)' },
            { angle: 90, text: 'NEU', col: 'rgba(234,179,8,0.75)' },
            { angle: 158, text: 'BULL', col: 'rgba(16,185,129,0.75)' },
          ].map(({ angle, text, col }) => {
            const p = polarXY(angle, innerR - 10)
            return <text key={text} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fill={col} fontSize="9" fontFamily="JetBrains Mono,monospace" fontWeight="700">{text}</text>
          })}

          {/* Needle */}
          <polygon
            points={`${needle.x.toFixed(2)},${needle.y.toFixed(2)} ${nb1.x.toFixed(2)},${nb1.y.toFixed(2)} ${nb2.x.toFixed(2)},${nb2.y.toFixed(2)}`}
            fill={color}
            filter={`url(#${glowId})`}
          />

          {/* Center pivot outer ring */}
          <circle cx={cx} cy={cy} r={9} fill="rgba(0,0,0,0.8)" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
          {/* Center pivot glossy cap */}
          <circle cx={cx} cy={cy} r={5.5} fill={color} filter={`url(#${glowId})`} />
          <circle cx={cx - 1.5} cy={cy - 1.5} r={2} fill="rgba(255,255,255,0.4)" />
        </svg>

        {/* Value display */}
        <div style={{
          fontFamily: 'JetBrains Mono,monospace',
          fontSize: 26,
          fontWeight: 900,
          color,
          lineHeight: 1,
          marginTop: -4,
          letterSpacing: '0.04em',
          textShadow: `0 0 16px ${color}80, 0 0 30px ${color}30`,
        }}>
          {value.toFixed(3)}
        </div>
        <div style={{
          fontFamily: 'JetBrains Mono,monospace',
          fontSize: 13,
          color: '#ff8500',
          letterSpacing: '0.22em',
          fontWeight: 800,
          marginTop: 4,
        }}>{label}</div>
      </div>
    )
  }

  // --- Missing-days dialog handlers ---
  const handleScanMissingDays = () => {
    if (!missingDaysDialog) return
    const { missingDays, savedTrades, originalSearch, tf, displayLabel } = missingDaysDialog
    setMissingDaysDialog(null)
    setLoading(true)
    multiScanLabelRef.current = displayLabel
    fetchTickerFlow(originalSearch, tf, {
      specificDates: missingDays.join(','),
      preMergedTrades: savedTrades,
    })
  }

  const handleUseAvailableOnly = () => {
    if (!missingDaysDialog) return
    const { savedTrades, displayLabel } = missingDaysDialog
    setMissingDaysDialog(null)
    if (savedTrades.length > 0) {
      setFlowData(savedTrades)
      accumulatedTradesRef.current = savedTrades
      liveOICache.clear()
      setIsStreamComplete(true)
      setStreamStatus(`Loaded from saved — ${savedTrades.length} trades`)
      performAnalysis(savedTrades, displayLabel).catch(() => { })
    } else {
      setError('No saved data available for this selection.')
    }
  }

  return (
    <div className="h-full bg-black flex flex-col" style={{ overflow: 'hidden' }}>

      {/* MISSING DAYS DIALOG */}
      {missingDaysDialog && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'linear-gradient(180deg, #111 0%, #0a0a0a 100%)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 8,
            padding: '35px 40px',
            maxWidth: 600,
            width: '90%',
            boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
          }}>
            <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 18, fontWeight: 800, color: '#ff8500', letterSpacing: '0.2em', marginBottom: 18 }}>MISSING DATA</div>
            <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 15, color: '#ffffff', lineHeight: 1.7, marginBottom: 23 }}>
              The following trading days are not in saved storage:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 25 }}>
              {missingDaysDialog.missingDays.map((d) => (
                <span key={d} style={{
                  fontFamily: 'JetBrains Mono,monospace', fontSize: 15, fontWeight: 700,
                  background: '#ef4444', borderRadius: 3,
                  padding: '3px 10px', color: '#fff',
                }}>{d}</span>
              ))}
            </div>
            {missingDaysDialog.savedTrades.length > 0 && (
              <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 14, color: '#ffffff', marginBottom: 28 }}>
                {missingDaysDialog.savedTrades.length} trades available from saved days.
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleScanMissingDays}
                style={{
                  flex: 1, padding: '11px 0',
                  background: 'linear-gradient(135deg, #ff8500, #ff6000)',
                  border: 'none', borderRadius: 4,
                  fontFamily: 'JetBrains Mono,monospace', fontSize: 15, fontWeight: 800,
                  letterSpacing: '0.12em', color: '#000', cursor: 'pointer',
                }}
              >SCAN MISSING DAYS</button>
              {missingDaysDialog.savedTrades.length > 0 && (
                <button
                  onClick={handleUseAvailableOnly}
                  style={{
                    flex: 1, padding: '11px 0',
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.25)', borderRadius: 4,
                    fontFamily: 'JetBrains Mono,monospace', fontSize: 15, fontWeight: 800,
                    letterSpacing: '0.12em', color: '#ffffff', cursor: 'pointer',
                  }}
                >USE SAVED ONLY</button>
              )}
              <button
                onClick={() => { setMissingDaysDialog(null); setLoading(false) }}
                style={{
                  padding: '11px 18px',
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4,
                  fontFamily: 'JetBrains Mono,monospace', fontSize: 15, fontWeight: 700,
                  color: '#ffffff', cursor: 'pointer',
                }}
              >✕</button>
            </div>
          </div>
        </div>
      )}
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
          {onBack && (
            <button
              onClick={onBack}
              style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 800, color: '#fff', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', letterSpacing: '0.08em', marginRight: 4 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
            >← BACK</button>
          )}
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
            disabled={loading || isAnalyzing || !ticker.trim()}
            style={{ padding: '5px 20px', background: (loading || isAnalyzing) ? '#333' : 'linear-gradient(135deg, #ff8500, #ff6000)', color: (loading || isAnalyzing) ? '#fff' : '#000', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 800, letterSpacing: '0.15em', border: 'none', cursor: (loading || isAnalyzing) ? 'not-allowed' : 'pointer', opacity: (!ticker.trim() || loading || isAnalyzing) ? 0.7 : 1, transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}
          >
            {isAnalyzing
              ? (<><div className="animate-spin" style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid #22d3ee', borderTopColor: 'transparent' }} />ANALYZING {flowData.length.toLocaleString()}</>)
              : loading ? 'SCANNING...'
                : 'ANALYZE'
            }
          </button>
        </div>
      </div>

      {/* SCROLLABLE CONTENT */}
      <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: '12px 20px 20px' }}>

        {/* LOADING STATE - removed; analyzing indicator is now inside the ANALYZE button */}

        {analysis && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

            {/* ── ROW 2: METRICS + CHART SIDE BY SIDE ── */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.15)' }}>

              {/* LEFT: Stats sidebar */}
              <div style={{
                width: 232,
                flexShrink: 0,
                borderRight: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                flexDirection: 'column',
                background: 'linear-gradient(170deg, rgba(12,12,22,0.98) 0%, rgba(6,6,14,0.99) 60%, rgba(8,8,18,0.98) 100%)',
                boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.04), inset 0 0 40px rgba(0,0,0,0.6)',
              }}>
                {/* AlgoFlow gauge */}
                <div style={{
                  padding: '0 0 8px',
                  borderBottom: '1px solid rgba(255,255,255,0.07)',
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.025) 0%, transparent 100%)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
                  position: 'relative',
                  overflow: 'hidden',
                }}>
                  {/* Subtle radial glow behind gauge */}
                  <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 200, height: 125, borderRadius: '50%', background: 'radial-gradient(ellipse at 50% 30%, rgba(255,133,0,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
                  <FlowQuadrantGauge
                    bullCall={analysis.bullCallPremium ?? 0}
                    bearCall={analysis.bearCallPremium ?? 0}
                    bullPut={analysis.bullPutPremium ?? 0}
                    bearPut={analysis.bearPutPremium ?? 0}
                    score={analysis.algoFlowScore}
                    label="ALGOFLOW SCORE"
                  />
                </div>

                {/* P/C calls/puts bars */}
                <div style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.018) 0%, transparent 100%)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
                    <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#ffffff', letterSpacing: '0.22em', fontWeight: 700 }}>P/C RATIO</div>
                    <div style={{
                      fontFamily: 'JetBrains Mono,monospace',
                      fontSize: 20,
                      color: '#fff',
                      fontWeight: 900,
                      letterSpacing: '0.06em',
                      background: 'rgba(255,255,255,0.07)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 4,
                      padding: '1px 7px',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
                    }}>{analysis.callPutRatio.toFixed(2)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#10b981', fontWeight: 700, letterSpacing: '0.14em' }}>CALLS</span>
                        <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 15, color: '#10b981', fontWeight: 900 }}>{analysis.aggressiveCalls}</span>
                      </div>
                      <div style={{ height: 5, background: 'rgba(16,185,129,0.1)', borderRadius: 3, overflow: 'hidden', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)' }}>
                        <div style={{ height: '100%', background: 'linear-gradient(90deg, #059669, #10b981, #34d399)', borderRadius: 3, width: `${(analysis.aggressiveCalls / (analysis.aggressiveCalls + analysis.aggressivePuts || 1)) * 100}%`, boxShadow: '0 0 8px rgba(16,185,129,0.7), 0 0 2px rgba(52,211,153,0.5)' }} />
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                        <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#ef4444', fontWeight: 700, letterSpacing: '0.14em' }}>PUTS</span>
                        <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 15, color: '#ef4444', fontWeight: 900 }}>{analysis.aggressivePuts}</span>
                      </div>
                      <div style={{ height: 5, background: 'rgba(239,68,68,0.1)', borderRadius: 3, overflow: 'hidden', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)' }}>
                        <div style={{ height: '100%', background: 'linear-gradient(90deg, #b91c1c, #ef4444, #f87171)', borderRadius: 3, width: `${(analysis.aggressivePuts / (analysis.aggressiveCalls + analysis.aggressivePuts || 1)) * 100}%`, boxShadow: '0 0 8px rgba(239,68,68,0.7), 0 0 2px rgba(248,113,113,0.5)' }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sweeps vs Blocks */}
                <div style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.018) 0%, transparent 100%)',
                }}>
                  <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#ffffff', letterSpacing: '0.22em', fontWeight: 700, marginBottom: 9 }}>EXECUTION TYPE</div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 9 }}>
                    <div style={{
                      flex: 1,
                      background: 'linear-gradient(145deg, rgba(234,179,8,0.14) 0%, rgba(234,179,8,0.05) 60%, rgba(0,0,0,0.2) 100%)',
                      border: '1px solid rgba(234,179,8,0.28)',
                      padding: '8px 10px',
                      borderRadius: 7,
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.3), 0 3px 10px rgba(0,0,0,0.5), 0 0 12px rgba(234,179,8,0.06)',
                      position: 'relative',
                      overflow: 'hidden',
                    }}>
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '40%', background: 'linear-gradient(180deg, rgba(255,255,255,0.07) 0%, transparent 100%)', borderRadius: '7px 7px 0 0', pointerEvents: 'none' }} />
                      <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: analysis.sweepCount >= 100000 ? 20 : analysis.sweepCount >= 10000 ? 26 : analysis.sweepCount >= 1000 ? 30 : 36, fontWeight: 900, color: '#eab308', lineHeight: 1, textShadow: '0 0 14px rgba(234,179,8,0.6), 0 0 28px rgba(234,179,8,0.2)' }}>{analysis.sweepCount}</div>
                      <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#eab308', letterSpacing: '0.18em', marginTop: 4, fontWeight: 700 }}>SWEEPS</div>
                    </div>
                    <div style={{
                      flex: 1,
                      background: 'linear-gradient(145deg, rgba(34,211,238,0.14) 0%, rgba(34,211,238,0.05) 60%, rgba(0,0,0,0.2) 100%)',
                      border: '1px solid rgba(34,211,238,0.28)',
                      padding: '8px 10px',
                      borderRadius: 7,
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.3), 0 3px 10px rgba(0,0,0,0.5), 0 0 12px rgba(34,211,238,0.06)',
                      position: 'relative',
                      overflow: 'hidden',
                    }}>
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '40%', background: 'linear-gradient(180deg, rgba(255,255,255,0.07) 0%, transparent 100%)', borderRadius: '7px 7px 0 0', pointerEvents: 'none' }} />
                      <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: analysis.blockCount >= 100000 ? 20 : analysis.blockCount >= 10000 ? 26 : analysis.blockCount >= 1000 ? 30 : 36, fontWeight: 900, color: '#22d3ee', lineHeight: 1, textShadow: '0 0 14px rgba(34,211,238,0.6), 0 0 28px rgba(34,211,238,0.2)' }}>{analysis.blockCount}</div>
                      <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#22d3ee', letterSpacing: '0.18em', marginTop: 4, fontWeight: 700 }}>BLOCKS</div>
                    </div>
                  </div>
                  {/* Sweep/Block ratio bar */}
                  <div style={{ height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 4, display: 'flex', overflow: 'hidden', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)' }}>
                    <div style={{ height: '100%', background: 'linear-gradient(90deg, #a16207, #eab308)', width: `${(analysis.sweepCount / (analysis.sweepCount + analysis.blockCount || 1)) * 100}%`, boxShadow: '0 0 6px rgba(234,179,8,0.6)' }} />
                    <div style={{ height: '100%', background: 'linear-gradient(90deg, #0891b2, #22d3ee)', flex: 1, boxShadow: '0 0 6px rgba(34,211,238,0.4)' }} />
                  </div>
                </div>

                {/* Stacked metrics */}
                {[
                  { label: 'CALLS PREM', value: formatCurrency(analysis.totalCallPremium), color: '#10b981', glow: 'rgba(16,185,129,0.35)', bg: 'rgba(16,185,129,0.04)' },
                  { label: 'PUTS PREM', value: formatCurrency(analysis.totalPutPremium), color: '#ef4444', glow: 'rgba(239,68,68,0.35)', bg: 'rgba(239,68,68,0.04)' },
                  { label: 'NET FLOW', value: formatCurrency(analysis.netFlow), color: analysis.netFlow >= 0 ? '#10b981' : '#ef4444', glow: analysis.netFlow >= 0 ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)', bg: analysis.netFlow >= 0 ? 'rgba(16,185,129,0.04)' : 'rgba(239,68,68,0.04)' },
                  { label: 'P/C RATIO', value: analysis.callPutRatio.toFixed(2), color: '#e2e8f0', glow: 'rgba(255,255,255,0.15)', bg: 'transparent' },
                ].map(({ label, value, color, glow, bg }) => (
                  <div key={label} style={{
                    padding: '7px 14px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: bg,
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)',
                  }}>
                    <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#ffffff', letterSpacing: '0.18em', fontWeight: 700 }}>{label}</span>
                    <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 22, fontWeight: 900, color, textShadow: `0 0 10px ${glow}` }}>{value}</span>
                  </div>
                ))}
              </div>

              {/* RIGHT: Chart */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Chart toolbar */}
                <div style={{ padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', position: 'relative', minHeight: 36 }}>
                  {/* LEFT: ticker + FLOW + timeframe buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <span style={{ color: '#fff', fontFamily: 'JetBrains Mono,monospace', fontSize: 21, fontWeight: 900, letterSpacing: '0.1em', marginRight: 2 }}>{analysis.ticker}</span>
                    {analysis.currentPrice > 0 && <span style={{ color: '#aaa', fontFamily: 'JetBrains Mono,monospace', fontSize: 16, fontWeight: 700, marginRight: 4 }}>${analysis.currentPrice.toFixed(2)}</span>}
                    <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 13, fontWeight: 800, letterSpacing: '0.12em', padding: '1px 6px', borderRadius: 2, marginRight: 10, background: analysis.flowTrend === 'BULLISH' ? 'rgba(16,185,129,0.15)' : analysis.flowTrend === 'BEARISH' ? 'rgba(239,68,68,0.15)' : 'rgba(234,179,8,0.15)', color: analysis.flowTrend === 'BULLISH' ? '#10b981' : analysis.flowTrend === 'BEARISH' ? '#ef4444' : '#eab308', border: `1px solid ${analysis.flowTrend === 'BULLISH' ? '#10b981' : analysis.flowTrend === 'BEARISH' ? '#ef4444' : '#eab308'}` }}>{analysis.flowTrend}</span>
                    <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 14, color: '#fff', letterSpacing: '0.15em', marginRight: 4 }}>FLOW</span>
                    {CHART_VIEW_OPTIONS.filter(o => o.days <= getScanDays(scanTimeframe)).map(({ label, days }) => (
                      <button key={label} onClick={() => { setChartDisplayDays(days); setBrushIndices(null) }} style={{ padding: '2px 8px', fontFamily: 'JetBrains Mono,monospace', fontSize: 16, fontWeight: 800, letterSpacing: '0.1em', border: '1px solid rgba(255,165,0,0.6)', background: chartDisplayDays === days ? '#ff8500' : 'transparent', color: chartDisplayDays === days ? '#000' : '#ff8500', cursor: 'pointer' }}>{label}</button>
                    ))}
                    {brushIndices && (
                      <button onClick={() => setBrushIndices(null)} style={{ padding: '2px 8px', fontFamily: 'JetBrains Mono,monospace', fontSize: 14, fontWeight: 700, border: '1px solid rgba(255,255,255,0.3)', background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', letterSpacing: '0.08em' }}>RESET</button>
                    )}
                  </div>
                  {/* CENTER: legend (absolutely centered) */}
                  <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    {chartViewMode === 'detailed' && [
                      { color: '#00ff7f', label: 'BULL CALLS', key: 'callsPlus' },
                      { color: '#4da6ff', label: 'BEAR CALLS', key: 'callsMinus' },
                      { color: '#ffcc00', label: 'BULL PUTS', key: 'putsPlus' },
                      { color: '#ff2222', label: 'BEAR PUTS', key: 'putsMinus' },
                    ].map(({ color, label, key }) => (
                      <span key={key} onClick={() => toggleLine(key)} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', opacity: hiddenLines.has(key) ? 0.3 : 1, transition: 'opacity 0.15s' }}>
                        <svg width="20" height="4"><line x1="0" y1="2" x2="20" y2="2" stroke={color} strokeWidth="2.5" /></svg>
                        <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 16, color, fontWeight: 700, letterSpacing: '0.05em' }}>{label}</span>
                      </span>
                    ))}
                    {chartViewMode === 'simplified' && [
                      { color: '#00ff7f', label: 'BULLISH', key: 'bullishTotal' },
                      { color: '#ff2222', label: 'BEARISH', key: 'bearishTotal' },
                    ].map(({ color, label, key }) => (
                      <span key={key} onClick={() => toggleLine(key)} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', opacity: hiddenLines.has(key) ? 0.3 : 1, transition: 'opacity 0.15s' }}>
                        <svg width="20" height="4"><line x1="0" y1="2" x2="20" y2="2" stroke={color} strokeWidth="2.5" /></svg>
                        <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 16, color, fontWeight: 700, letterSpacing: '0.05em' }}>{label}</span>
                      </span>
                    ))}
                    {chartViewMode === 'net' && (
                      <span onClick={() => toggleLine('netFlow')} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', opacity: hiddenLines.has('netFlow') ? 0.3 : 1, transition: 'opacity 0.15s' }}>
                        <svg width="30" height="4"><line x1="0" y1="2" x2="14" y2="2" stroke="#00ff7f" strokeWidth="2.5" /><line x1="16" y1="2" x2="30" y2="2" stroke="#ff2222" strokeWidth="2.5" /></svg>
                        <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 16, color: '#fff', fontWeight: 700, letterSpacing: '0.05em' }}>NET FLOW</span>
                      </span>
                    )}
                  </div>
                  {/* RIGHT: mode buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', flexShrink: 0 }}>
                    {([['detailed', 'ALL'], ['simplified', 'BULL/BEAR'], ['net', 'NET']] as const).map(([mode, label]) => (
                      <button key={mode} onClick={() => setChartViewMode(mode)} style={{ padding: '2px 10px', fontFamily: 'JetBrains Mono,monospace', fontSize: 16, fontWeight: 800, letterSpacing: '0.1em', border: '1px solid rgba(34,211,238,0.5)', background: chartViewMode === mode ? '#22d3ee' : 'transparent', color: chartViewMode === mode ? '#000' : '#22d3ee', cursor: 'pointer' }}>{label}</button>
                    ))}
                  </div>
                </div>
                {/* Chart body */}
                <div ref={chartDivRef} style={{
                  padding: 0,
                  background: 'linear-gradient(180deg, #0e0e0e 0%, #070707 4%, #000 100%)',
                  height: 572,
                  minWidth: 0,
                  position: 'relative',
                  overflow: 'hidden',
                  cursor: chartDragRef.current.dragging ? 'grabbing' : 'grab',
                  userSelect: 'none',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                }}
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
                  {/* Glossy top-edge sheen */}
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 32, background: 'linear-gradient(180deg, rgba(255,255,255,0.035) 0%, transparent 100%)', pointerEvents: 'none', zIndex: 2 }} />
                  <ResponsiveContainer width="100%" height={445} debounce={50}>
                    <LineChart data={chartMemo.visibleData} margin={{ top: 10, right: 0, bottom: -5, left: 30 }}>
                      <XAxis dataKey="timeLabel" hide />
                      <YAxis yAxisId="flow" orientation="right" stroke="rgba(255,255,255,0.3)" tick={{ fill: '#ffffff', fontSize: 18, fontWeight: 'bold' }} width={82}
                        tickFormatter={(value) => {
                          const absValue = Math.abs(value)
                          const sign = value < 0 ? '-' : ''
                          if (absValue >= 1_000_000_000) return `${sign}$${(absValue / 1_000_000_000).toFixed(2)}B`
                          if (absValue >= 1_000_000) return `${sign}$${Math.round(absValue / 1_000_000)}M`
                          if (absValue >= 1_000) return `${sign}$${Math.round(absValue / 1_000)}K`
                          return `${sign}$${absValue}`
                        }}
                      />
                      <YAxis yAxisId="price" orientation="right" hide={true}
                        domain={[chartMemo.priceMin, chartMemo.priceMax]}
                      />
                      <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.2)', fontWeight: 'bold', fontSize: '13px' }} labelStyle={{ color: '#fff', fontWeight: 'bold' }}
                        formatter={(value: any) => {
                          const num = Number(value); const absNum = Math.abs(num); const sign = num < 0 ? '-' : ''
                          if (absNum >= 1_000_000_000) return `${sign}$${(absNum / 1_000_000_000).toFixed(2)}B`
                          if (absNum >= 1_000_000) return `${sign}$${(absNum / 1_000_000).toFixed(2)}M`
                          if (absNum >= 1_000) return `${sign}$${(absNum / 1_000).toFixed(1)}K`
                          return `${sign}$${absNum.toLocaleString()}`
                        }}
                      />
                      {chartViewMode === 'detailed' ? (<>
                        <Line type="monotone" yAxisId="flow" dataKey="callsPlus" stroke="#00ff7f" strokeWidth={3} name="BULLISH CALLS" dot={false} hide={hiddenLines.has('callsPlus')} />
                        <Line type="monotone" yAxisId="flow" dataKey="callsMinus" stroke="#4da6ff" strokeWidth={3} name="BEARISH CALLS" dot={false} hide={hiddenLines.has('callsMinus')} />
                        <Line type="monotone" yAxisId="flow" dataKey="putsPlus" stroke="#ffcc00" strokeWidth={3} name="BULLISH PUTS" dot={false} hide={hiddenLines.has('putsPlus')} />
                        <Line type="monotone" yAxisId="flow" dataKey="putsMinus" stroke="#ff2222" strokeWidth={3} name="BEARISH PUTS" dot={false} hide={hiddenLines.has('putsMinus')} />
                      </>) : chartViewMode === 'simplified' ? (<>
                        <Line type="monotone" yAxisId="flow" dataKey="bullishTotal" stroke="#00ff7f" strokeWidth={3} name="BULLISH FLOW" dot={false} hide={hiddenLines.has('bullishTotal')} />
                        <Line type="monotone" yAxisId="flow" dataKey="bearishTotal" stroke="#ff2222" strokeWidth={3} name="BEARISH FLOW" dot={false} hide={hiddenLines.has('bearishTotal')} />
                      </>) : (<>
                        <Line type="monotone" yAxisId="flow" dataKey="netFlow" stroke="#00ff7f" strokeWidth={3} name="NET FLOW" dot={false} hide={hiddenLines.has('netFlow')}
                          strokeDasharray={undefined}
                        />
                        {!hiddenLines.has('netFlow') && <Customized component={NetFlowColoredLine} visibleData={chartMemo.visibleData} isHidden={false} />}
                      </>)}
                      <Line type="monotone" yAxisId="price" dataKey="stockClose" stroke="transparent" strokeWidth={0} name="PRICE" dot={false} legendType="none" />
                      <Customized component={CandlestickLayer} visibleData={chartMemo.visibleData} />
                    </LineChart>
                  </ResponsiveContainer>

                  {/* P/C Ratio sub-panel */}
                  <div style={{ borderTop: '1px solid rgba(167,139,250,0.15)', background: 'rgba(0,0,0,0.3)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 82px 0 30px' }}>
                      <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 10, fontWeight: 700, color: '#a78bfa', letterSpacing: '0.18em' }}>P/C RATIO</span>
                      {chartMemo.visibleData.length > 0 && (() => {
                        const last = chartMemo.visibleData[chartMemo.visibleData.length - 1]
                        const val = last?.pcRatio ?? 1
                        const col = val > 1.1 ? '#ef4444' : val < 0.9 ? '#10b981' : '#eab308'
                        return <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, fontWeight: 800, color: col }}>{val.toFixed(2)}</span>
                      })()}
                    </div>
                    <ResponsiveContainer width="100%" height={100} debounce={50}>
                      <LineChart data={chartMemo.visibleData} margin={{ top: 2, right: 0, bottom: -5, left: 30 }}>
                        <XAxis dataKey="timeLabel" stroke="rgba(255,255,255,0.3)" tick={{ fill: '#ffffff', fontSize: 16, fontWeight: 'bold' }} height={36} interval={chartMemo.xInterval} padding={{ left: 10, right: 10 }}
                          tickFormatter={(label: string) => {
                            if (chartDisplayDays <= 1) return label.includes('/') ? label.replace(/^\d+\/\d+\/\d+ /, '') : label
                            else if (chartDisplayDays <= 5) return label.replace(/\/\d{4} /, ' ')
                            else return label.replace(/\/(\d{4}) .*/, (_, yr) => `/${yr.slice(-2)}`)
                          }}
                        />
                        <YAxis orientation="right" stroke="rgba(255,255,255,0.3)" tick={{ fill: '#ffffff', fontSize: 13, fontWeight: 700 }} width={82}
                          domain={[
                            (dataMin: number) => Math.max(0, parseFloat((dataMin * 0.9).toFixed(2))),
                            (dataMax: number) => parseFloat((dataMax * 1.1).toFixed(2)),
                          ]}
                          tickFormatter={(v) => v.toFixed(2)}
                        />
                        <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.2)', fontSize: 12 }} labelStyle={{ color: '#fff' }}
                          formatter={(v: any) => [Number(v).toFixed(3), 'P/C']}
                        />
                        <ReferenceLine y={1} stroke="rgba(167,139,250,0.35)" strokeDasharray="4 4" />
                        <Line type="monotone" dataKey="pcRatio" stroke="#a78bfa" strokeWidth={2} dot={false} name="P/C"
                          activeDot={{ r: 4, fill: '#a78bfa', stroke: '#fff', strokeWidth: 1 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>{/* end P/C sub-panel */}
                </div>{/* end chart body */}
              </div>{/* end chart column */}
            </div>{/* end ROW 2 */}

            {/* ── ROW 3: TRADES TABLE + EFI CHART ── */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', display: 'flex' }}>

              {/* Left: Trades table */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ padding: '5px 14px', background: 'linear-gradient(90deg,#0a0a0a,#111)', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#fff', letterSpacing: '0.15em' }}></span>
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
                          { key: null, label: getScanDays(scanTimeframe) > 1 ? 'OI CHANGE' : 'LIVE OI' },
                          { key: null, label: 'STYLE' },
                        ].map(({ key, label }) => (
                          <th key={label}
                            onClick={key ? () => { if (sortColumn === key) { setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc') } else { setSortColumn(key); setSortDirection('desc') } } : undefined}
                            style={{ textAlign: 'left', padding: '6px 10px', fontFamily: 'JetBrains Mono,monospace', fontSize: 22, color: sortColumn === key ? '#fff' : '#ff8500', letterSpacing: '0.12em', fontWeight: 800, cursor: key ? 'pointer' : 'default', whiteSpace: 'nowrap' }}
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

                        // Use memoized OI computation (tradeOIMemo) — avoids rerunning on every render
                        const { isMultiDay, liveOIMap, baseOIMap, multiDayOIChange, lastDayVolumeMap, lastDayOISnapshotMap } = tradeOIMemo

                        return paginatedTrades.map((trade, idx) => {
                          const day = new Date(trade.trade_timestamp).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
                          const contractKey = `${trade.underlying_ticker}_${trade.strike}_${trade.type}_${trade.expiry}`
                          const contractDayKey = `${contractKey}_${day}`
                          const originalOI = baseOIMap.get(contractDayKey) ?? trade.open_interest ?? 0
                          const liveOI = liveOIMap.get(contractDayKey) ?? originalOI
                          const oiChange = isMultiDay ? (multiDayOIChange.get(contractKey) ?? 0) : (liveOI - originalOI)
                          const displayVolume = isMultiDay ? lastDayVolumeMap.get(contractKey) : trade.volume
                          const displayOISnapshot = isMultiDay ? lastDayOISnapshotMap.get(contractKey) : trade.open_interest
                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                              onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent')}
                            >
                              <td style={{ padding: '5px 10px', fontFamily: 'JetBrains Mono,monospace', fontSize: 21, color: '#fff', whiteSpace: 'nowrap' }}>
                                {scanTimeframe !== '1D'
                                  ? new Date(trade.trade_timestamp).toLocaleString('en-US', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })
                                  : new Date(trade.trade_timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: 'America/Los_Angeles' })}
                              </td>
                              <td style={{ padding: '5px 10px', fontFamily: 'JetBrains Mono,monospace', fontSize: 23, color: '#fff', fontWeight: 900 }}>{trade.underlying_ticker}</td>
                              <td style={{ padding: '5px 10px', fontFamily: 'JetBrains Mono,monospace', fontSize: 21, fontWeight: 800, color: trade.type === 'call' ? '#00cc00' : '#ff0000' }}>{trade.type.toUpperCase()}</td>
                              <td style={{ padding: '5px 10px' }}>
                                <button onClick={() => setSelectedStrike(selectedStrike === trade.strike ? null : trade.strike)} style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 21, fontWeight: 700, color: selectedStrike === trade.strike ? '#22d3ee' : '#fff', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>${trade.strike}</button>
                              </td>
                              <td style={{ padding: '5px 10px', fontFamily: 'JetBrains Mono,monospace', fontSize: 21, color: '#fff', whiteSpace: 'nowrap' }}>
                                {trade.trade_size.toLocaleString()}@${trade.premium_per_contract.toFixed(2)}<span style={{ marginLeft: 5, fontWeight: 800, color: fillColors[trade.fill_style || 'N/A'] }}>{trade.fill_style || 'N/A'}</span>
                              </td>
                              <td style={{ padding: '5px 10px', fontFamily: 'JetBrains Mono,monospace', fontSize: 21, color: '#00cc00', fontWeight: 700 }}>${trade.total_premium.toLocaleString()}</td>
                              <td style={{ padding: '5px 10px', fontFamily: 'JetBrains Mono,monospace', fontSize: 21, color: '#fff', whiteSpace: 'nowrap' }}>
                                ${trade.spot_price?.toFixed(2) || 'N/A'}
                                {analysis?.currentPrice && <span style={{ color: 'rgba(255,255,255,0.4)', margin: '0 5px' }}>›</span>}
                                {analysis?.currentPrice && <span style={{ color: '#22d3ee' }}>${analysis.currentPrice.toFixed(2)}</span>}
                              </td>
                              <td style={{ padding: '5px 10px' }}>
                                <button onClick={() => setSelectedExpiry(selectedExpiry === trade.expiry ? null : trade.expiry)} style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 21, color: selectedExpiry === trade.expiry ? '#22d3ee' : '#ffffff', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>{trade.expiry.split('T')[0]}</button>
                              </td>
                              <td style={{ padding: '5px 10px', whiteSpace: 'nowrap' }}>
                                <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 20, color: 'rgb(0,153,255)' }}>{displayVolume?.toLocaleString() || 'N/A'}</span>
                                <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 20, color: 'rgba(255,255,255,0.35)', margin: '0 4px' }}>/</span>
                                <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 20, color: 'rgb(0,255,94)' }}>{displayOISnapshot?.toLocaleString() || 'N/A'}</span>
                              </td>
                              <td style={{ padding: '5px 10px', fontFamily: 'JetBrains Mono,monospace', fontSize: 21, color: '#eab308', fontWeight: 700 }}>
                                {isMultiDay
                                  ? <span style={{ color: oiChange > 0 ? '#00cc00' : oiChange < 0 ? '#ff0000' : 'rgba(255,255,255,0.3)', fontWeight: 700 }}>{oiChange > 0 ? '+' : ''}{oiChange.toLocaleString()}</span>
                                  : <>{liveOI.toLocaleString()} <span style={{ color: oiChange > 0 ? '#00cc00' : oiChange < 0 ? '#ff0000' : 'rgba(255,255,255,0.3)', fontSize: 20 }}>({oiChange > 0 ? '+' : ''}{oiChange})</span></>}
                              </td>
                              <td style={{ padding: '5px 10px' }}>
                                <span style={{
                                  fontFamily: 'JetBrains Mono,monospace',
                                  fontSize: 15,
                                  fontWeight: 800,
                                  padding: '3px 12px',
                                  borderRadius: '9999px',
                                  display: 'inline-block',
                                  letterSpacing: '0.05em',
                                  ...(trade.trade_type === 'SWEEP' ? {
                                    backgroundColor: '#000000',
                                    backgroundImage: 'linear-gradient(180deg, #1e1e1e 0%, #000000 50%, #111111 100%)',
                                    color: '#FFD700',
                                    border: '1px solid rgba(255,215,0,0.6)',
                                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.8)',
                                  } : trade.trade_type === 'BLOCK' ? {
                                    backgroundColor: '#000000',
                                    backgroundImage: 'linear-gradient(180deg, #1e1e1e 0%, #000000 50%, #111111 100%)',
                                    color: '#00e5ff',
                                    border: '1px solid rgba(0,229,255,0.5)',
                                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.8)',
                                  } : trade.trade_type === 'MULTI-LEG' ? {
                                    backgroundColor: '#1e0a3c',
                                    backgroundImage: 'linear-gradient(180deg, #3b1d6e 0%, #1e0a3c 50%, #2d1555 100%)',
                                    color: '#d8b4fe',
                                    border: '1px solid rgba(168,85,247,0.5)',
                                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.8)',
                                  } : {
                                    backgroundColor: '#052e16',
                                    backgroundImage: 'linear-gradient(180deg, #14532d 0%, #052e16 50%, #0f3d22 100%)',
                                    color: '#86efac',
                                    border: '1px solid rgba(134,239,172,0.4)',
                                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.8)',
                                  })
                                }}>{trade.trade_type || 'MINI'}</span>
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
              </div>{/* end left table column */}

              {/* Right: EFI Chart */}
              <div style={{ width: '38%', flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.15)', background: '#000', overflow: 'hidden' }}>
                <div style={{ width: '100%', height: '100%' }}>
                  <style>{`
                    button[title*='Watchlist'], button[title*='watchlist'], button[title*='favorite'],
                    button[title*='star'], button[title*='multi chart'], button[title*='Multi Chart'],
                    button[title*='Chart Layout'] { display: none !important; }
                    button[title='Candles'], button[title='Line'],
                    button[title*='Switch to'] { display: none !important; }
                  `}</style>
                  <TradingViewChart
                    symbol={searchTicker || 'SPY'}
                    initialTimeframe="1d"
                    height={780}
                    lwToolbarPosition="left"
                    disableSidebarAutoScan={true}
                    hideDesktopSidebar={true}
                    onSymbolChange={(s) => setSearchTicker(s)}
                  />
                </div>
              </div>

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
