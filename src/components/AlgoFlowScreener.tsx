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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import OptionsFlowScene from './loading/OptionsFlowScene'
import { polygonOptionsWS, parseOCCTicker, PolygonOptionsTradeMsg } from '@/lib/polygonOptionsWS'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const TradingViewChart = dynamic(() => import('./trading/EFICharting'), { ssr: false })

// Polygon API key for bid/ask analysis
const POLYGON_API_KEY: string = ''

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
      // First, get the current spot price for this underlying
      try {
        // Index options and dot-tickers need special handling for Polygon
        const SPOT_TICKER_MAP: Record<string, string> = {
          SPXW: 'I:SPX', SPX: 'I:SPX', NDXP: 'I:NDX', NDX: 'I:NDX',
          RUTW: 'I:RUT', RUT: 'I:RUT', BRKB: 'BRK.B', BRKA: 'BRK.A',
        }
        const spotTicker = SPOT_TICKER_MAP[underlying] ?? underlying
        const spotPriceUrl = spotTicker.startsWith('I:')
          ? `/api/polygon/v2/snapshot/locale/us/markets/index/tickers/${spotTicker}?apikey=${POLYGON_API_KEY}`
          : `/api/polygon/v2/snapshot/locale/us/markets/stocks/tickers/${spotTicker}?apikey=${POLYGON_API_KEY}`

        const priceResponse = await fetch(spotPriceUrl)
        if (priceResponse.ok) {
          const priceData = await priceResponse.json()
          const price =
            priceData.ticker?.lastTrade?.p ??
            priceData.ticker?.prevDay?.c ??
            priceData.results?.value ??
            priceData.results?.p
          if (price && price > 0) {
            currentSpotPrice = price
          }
        }
      } catch (error) {
        // spot price fetch failed "” continue
      }

      // Get unique expiration dates for this underlying to fetch specific expirations
      const uniqueExpirations = [...new Set(underlyingTrades.map((t) => t.expiry))]

      const allContracts = new Map()

      // Fetch data for each expiration date separately to get all contracts WITH FULL PAGINATION
      for (const expiry of uniqueExpirations) {
        const expiryParam = expiry.includes('T') ? expiry.split('T')[0] : expiry

        // Map index option underlyings to their correct Polygon snapshot underlying
        const INDEX_UNDERLYING_MAP: Record<string, string> = {
          SPXW: 'I:SPX', SPX: 'I:SPX', NDXP: 'I:NDX', NDX: 'I:NDX',
          RUTW: 'I:RUT', RUT: 'I:RUT', BRKB: 'BRK.B', BRKA: 'BRK.A',
        }
        const apiUnderlying = INDEX_UNDERLYING_MAP[underlying] ?? underlying

        // FULL PAGINATION LOGIC - Get ALL contracts for this expiration
        let nextUrl: string | null =
          `/api/polygon/v3/snapshot/options/${apiUnderlying}?expiration_date=${expiryParam}&limit=250&apikey=${POLYGON_API_KEY}`
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
            break
          }

          // Small delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
      }

      // Skip if no contracts found for any expiration
      if (allContracts.size === 0) {
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
      // Add trades without vol/OI data on error
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

  // Build deduplicated batch payload "” unique by contract+second bucket
  // Use trade.ticker directly "” it's the correct OCC ticker from Polygon (e.g. O:SPXW260325C...)
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

  // Single POST "” server fans out all Polygon calls simultaneously
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

              const quotesUrl = `/api/polygon/v3/quotes/${optionTicker}?timestamp.gte=${checkTimestamp}&limit=1&apikey=`

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
        const isNeg = (start.value + end.value) / 2 < 0
        return <line key={i} x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={isNeg ? '#ff2222' : '#00ff00'} strokeWidth={3} />
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

// Helper: convert scanTimeframe string ←’ number of trading days
const getScanDays = (tf: string): number => {
  if (tf === '1D') return 1
  if (tf === '3D') return 3
  if (tf === '1W') return 5
  return Math.max(1, parseInt(tf) || 1)
}

// Chart view options (label ←’ trading days)
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
  '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
]

// Returns the last N trading days (oldest ←’ newest) for the given timeframe string.
function getAlgoTradingDays(timeframe: string): string[] {
  const days: string[] = []
  const pstNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
  const daysNeeded =
    timeframe === '1D' ? 1
      : timeframe === '3D' ? 3
        : timeframe === '1W' ? 5
          : Math.max(1, parseInt(timeframe) || 1)
  const cur = new Date(pstNow)
  // Before market open (6:30 AM PST) today has no data yet — step back to previous session
  const hourPST = cur.getHours() + cur.getMinutes() / 60
  if (hourPST < 6.5) cur.setDate(cur.getDate() - 1)
  while (days.length < daysNeeded) {
    const dow = cur.getDay()
    const ds = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
    if (dow !== 0 && dow !== 6 && !ALGO_MARKET_HOLIDAYS.includes(ds)) days.push(ds)
    cur.setDate(cur.getDate() - 1)
  }
  return days.reverse()
}

export default function AlgoFlowScreener({ onBack, embeddedMode = false, embeddedTrades, embeddedTicker }: { onBack?: () => void; embeddedMode?: boolean; embeddedTrades?: any[]; embeddedTicker?: string } = {}) {
  const [ticker, setTicker] = useState('')
  const [searchTicker, setSearchTicker] = useState('')
  const [loading, setLoading] = useState(false)
  const [flowData, setFlowData] = useState<OptionsFlowData[]>([])
  const [error, setError] = useState('')
  const [isMobile, setIsMobile] = useState(false)

  // ── Tab state ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'algoflow' | 'flowbias'>('algoflow')

  // ── Flow Bias Scanner state ──────────────────────────────────────────────────
  type BiasAgg = { ticker: string; bullCall: number; bearCall: number; bullPut: number; bearPut: number; total: number; callPremium: number; putPremium: number }
  const [biasRRGData, setBiasRRGData] = useState<{ bullCalls: BiasAgg[]; bearCalls: BiasAgg[]; bullPuts: BiasAgg[]; bearPuts: BiasAgg[] } | null>(null)
  const [biasRRGLoading, setBiasRRGLoading] = useState(false)
  const [biasPCData, setBiasPCData] = useState<{ pc: BiasAgg[]; gamma: BiasAgg[] } | null>(null)
  const [biasPCLoading, setBiasPCLoading] = useState(false)
  const [biasSupportData, setBiasSupportData] = useState<{ bull: BiasAgg[]; bear: BiasAgg[] } | null>(null)
  const [biasSupportLoading, setBiasSupportLoading] = useState(false)
  const [biasDataStatus, setBiasDataStatus] = useState('')
  const [rrgPopupTicker, setRrgPopupTicker] = useState<BiasAgg | null>(null)
  const [rrgTransform, setRrgTransform] = useState({ tx: 0, ty: 0, k: 1 })
  const rrgDragRef = useRef({ dragging: false, mouseDownActive: false, lastSvgX: 0, lastSvgY: 0 })
  const rrgSvgRef = useRef<SVGSVGElement | null>(null)
  const [rrgTickerMode, setRrgTickerMode] = useState<'all' | 'mag7only' | 'exmag7' | 'etfonly' | 'exetf' | 'stockonly'>('all')
  const [rrgDropdownOpen, setRrgDropdownOpen] = useState<'ticker' | 'time' | 'filter' | null>(null)
  const [shouldAutoScanRRG, setShouldAutoScanRRG] = useState(0)
  const [showRegime, setShowRegime] = useState(false)
  const [showRegimeGrouping, setShowRegimeGrouping] = useState(false)
  const [hoveredRegimeMembers, setHoveredRegimeMembers] = useState<Set<string>>(new Set())

  // Industry map for Regime detection
  const RRG_INDUSTRY: Record<string, string> = {
    // Semiconductors
    NVDA: 'Semi', AMD: 'Semi', INTC: 'Semi', MU: 'Semi', AVGO: 'Semi', TSM: 'Semi',
    QCOM: 'Semi', TXN: 'Semi', AMAT: 'Semi', LRCX: 'Semi', KLAC: 'Semi', MRVL: 'Semi',
    ASML: 'Semi', ON: 'Semi', SMCI: 'Semi', MCHP: 'Semi', ADI: 'Semi', SWKS: 'Semi',
    MPWR: 'Semi', COHR: 'Semi', WOLF: 'Semi', ALGM: 'Semi', MTSI: 'Semi', AMBA: 'Semi',
    // Big Tech / Mega Cap
    AAPL: 'BigTech', MSFT: 'BigTech', GOOGL: 'BigTech', GOOG: 'BigTech', AMZN: 'BigTech', META: 'BigTech',
    // AI / Cloud Software
    NVDL: 'AI', CRWV: 'AI', PLTR: 'AI',
    NOW: 'CloudSaaS', CRM: 'CloudSaaS', SNOW: 'CloudSaaS', DDOG: 'CloudSaaS',
    OKTA: 'CloudSaaS', ZS: 'CloudSaaS', HUBS: 'CloudSaaS', MDB: 'CloudSaaS',
    GTLB: 'CloudSaaS', DOCN: 'CloudSaaS', DBX: 'CloudSaaS', PATH: 'CloudSaaS', BILL: 'CloudSaaS',
    // Cybersecurity
    CRWD: 'Cyber', PANW: 'Cyber', FTNT: 'Cyber', S: 'Cyber', NET: 'Cyber',
    // EV / Auto
    TSLA: 'EV', RIVN: 'EV', F: 'Auto', GM: 'Auto',
    // Pharma / Biotech
    LLY: 'Pharma', MRK: 'Pharma', PFE: 'Pharma', JNJ: 'Pharma', ABBV: 'Pharma', AZN: 'Pharma',
    MRNA: 'Biotech', REGN: 'Biotech', VRTX: 'Biotech', BIIB: 'Biotech', ALNY: 'Biotech',
    INCY: 'Biotech', RARE: 'Biotech', NKTR: 'Biotech',
    // Banks / Finance
    JPM: 'Banks', BAC: 'Banks', WFC: 'Banks', C: 'Banks', GS: 'Banks', MS: 'Banks',
    USB: 'Banks', KRE: 'Banks',
    // Insurance / Financial
    AXP: 'Finance', V: 'Payments', MA: 'Payments', COF: 'Finance', PGR: 'Insurance',
    // Energy
    XOM: 'Energy', CVX: 'Energy', COP: 'Energy', OXY: 'Energy', DVN: 'Energy',
    SLB: 'Energy', HAL: 'Energy', EOG: 'Energy', FANG: 'Energy',
    // Retail
    WMT: 'Retail', COST: 'Retail', TGT: 'Retail', HD: 'Retail', LOW: 'Retail',
    AMZN2: 'Retail',
    // Consumer / Restaurants
    MCD: 'Consumer', SBUX: 'Consumer', CMG: 'Consumer', YUM: 'Consumer',
    // Airlines
    DAL: 'Airlines', UAL: 'Airlines', AAL: 'Airlines', LUV: 'Airlines',
    // Defense
    RTX: 'Defense', LMT: 'Defense', BA: 'Defense', NOC: 'Defense', GD: 'Defense',
    // Telecom
    T: 'Telecom', VZ: 'Telecom', TMUS: 'Telecom',
    // Streaming / Entertainment
    NFLX: 'Streaming', DIS: 'Streaming', SPOT: 'Streaming',
    // Crypto-adjacent
    COIN: 'Crypto', MSTR: 'Crypto', MARA: 'Crypto', RIOT: 'Crypto', IBIT: 'Crypto',
    // Industrial
    CAT: 'Industrial', DE: 'Industrial', EME: 'Industrial', PWR: 'Industrial',
    ETN: 'Industrial', HON: 'Industrial', GE: 'Industrial',
  }

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    const el = rrgSvgRef.current
    if (!el) return
    // SVG viewBox is always 1755x875 — use these constants everywhere
    const RRG_W = 1755, RRG_H = 875
    const RRG_PL = 52, RRG_PT = 32, RRG_CW = 1671, RRG_CH = 799
    const clamp = (tx: number, ty: number, k: number) => {
      const k1 = Math.max(1, k)
      return {
        k: k1,
        tx: Math.max((1 - k1) * (RRG_PL + RRG_CW), Math.min((1 - k1) * RRG_PL, tx)),
        ty: Math.max((1 - k1) * (RRG_PT + RRG_CH), Math.min((1 - k1) * RRG_PT, ty)),
      }
    }
    // Desktop wheel zoom
    const wheelHandler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = (e.clientX - rect.left) * RRG_W / rect.width
      const my = (e.clientY - rect.top) * RRG_H / rect.height
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      setRrgTransform(t => {
        const k2 = Math.max(1, Math.min(12, t.k * factor))
        const raw = { k: k2, tx: mx - (mx - t.tx) * (k2 / t.k), ty: my - (my - t.ty) * (k2 / t.k) }
        return clamp(raw.tx, raw.ty, raw.k)
      })
    }
    // Mobile touch: pinch-to-zoom + single-finger pan
    let lastTouches: TouchList | null = null
    const touchStart = (e: TouchEvent) => {
      e.preventDefault()
      lastTouches = e.touches
    }
    const touchMove = (e: TouchEvent) => {
      e.preventDefault()
      if (!lastTouches) return
      const rect = el.getBoundingClientRect()
      const toSvg = (t: Touch) => ({
        x: (t.clientX - rect.left) * RRG_W / rect.width,
        y: (t.clientY - rect.top) * RRG_H / rect.height,
      })
      if (e.touches.length === 1 && lastTouches.length === 1) {
        // Single-finger pan
        const prev = toSvg(lastTouches[0]), cur = toSvg(e.touches[0])
        const dx = cur.x - prev.x, dy = cur.y - prev.y
        setRrgTransform(t => clamp(t.tx + dx, t.ty + dy, t.k))
      } else if (e.touches.length === 2 && lastTouches.length >= 1) {
        // Pinch-to-zoom: use midpoint as zoom origin, scale from distance change
        const p0 = toSvg(lastTouches[0] || e.touches[0])
        const p1 = toSvg(lastTouches[1] || e.touches[1])
        const c0 = toSvg(e.touches[0]), c1 = toSvg(e.touches[1])
        const prevDist = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1
        const curDist = Math.hypot(c1.x - c0.x, c1.y - c0.y)
        const factor = Math.max(0.5, Math.min(2, curDist / prevDist))
        const mx = (c0.x + c1.x) / 2, my = (c0.y + c1.y) / 2
        setRrgTransform(t => {
          const k2 = Math.max(1, Math.min(12, t.k * factor))
          const raw = { k: k2, tx: mx - (mx - t.tx) * (k2 / t.k), ty: my - (my - t.ty) * (k2 / t.k) }
          return clamp(raw.tx, raw.ty, raw.k)
        })
      }
      lastTouches = e.touches
    }
    const touchEnd = (e: TouchEvent) => { lastTouches = e.touches.length > 0 ? e.touches : null }
    el.addEventListener('wheel', wheelHandler, { passive: false })
    el.addEventListener('touchstart', touchStart, { passive: false })
    el.addEventListener('touchmove', touchMove, { passive: false })
    el.addEventListener('touchend', touchEnd, { passive: false })
    return () => {
      el.removeEventListener('wheel', wheelHandler)
      el.removeEventListener('touchstart', touchStart)
      el.removeEventListener('touchmove', touchMove)
      el.removeEventListener('touchend', touchEnd)
    }
  }, [biasRRGData])

  // Ref to track accumulated trades synchronously across async SSE events
  // (React state updates are async so the complete handler can't read flowData reliably)
  const accumulatedTradesRef = useRef<OptionsFlowData[]>([])
  // Buffer incoming trades and flush to state via rAF to avoid per-message setState
  const pendingTradesRef = useRef<OptionsFlowData[]>([])
  const rafFlushRef = useRef<number | null>(null)
  const flushPendingTrades = () => {
    if (pendingTradesRef.current.length === 0) return
    const batch = pendingTradesRef.current.splice(0)
    setFlowData((prev) => [...prev, ...batch])
  }

  // ── AlgoFlow Live WebSocket state ───────────────────────────────────────────
  const [isAlgoLive, setIsAlgoLive] = useState(false)
  const [algoLiveTicker, setAlgoLiveTicker] = useState<string>('')
  const [algoLiveConnected, setAlgoLiveConnected] = useState(false)
  const [algoLiveTradeCount, setAlgoLiveTradeCount] = useState(0)
  const algoLiveBufferRef = useRef<OptionsFlowData[]>([])
  const algoLiveFlushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const algoLiveAnalysisIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const algoLiveUnsubRef = useRef<(() => void) | null>(null)
  const algoLiveConnectedRef = useRef(false)
  const algoLiveTickerRef = useRef<string>('')

  // Convert a raw Polygon WS message to OptionsFlowData for AlgoFlow
  const convertAlgoTrade = useCallback((msg: PolygonOptionsTradeMsg): OptionsFlowData | null => {
    const parsed = parseOCCTicker(msg.sym)
    if (!parsed) return null
    const { underlying, expiry, type, strike } = parsed
    const totalPremium = msg.p * msg.s * 100
    const expDate = new Date(expiry)
    const daysToExpiry = Math.max(0, Math.round((expDate.getTime() - Date.now()) / 86_400_000))
    return {
      ticker: msg.sym,
      underlying_ticker: underlying,
      strike,
      expiry,
      type,
      trade_size: msg.s,
      premium_per_contract: msg.p,
      total_premium: totalPremium,
      spot_price: 0,
      exchange_name: polygonOptionsWS.getExchangeName(msg.x),
      trade_type: 'MINI',
      trade_timestamp: new Date(msg.t).toISOString(),
      moneyness: 'OTM',
      days_to_expiry: daysToExpiry,
    }
  }, [])

  const stopAlgoLive = useCallback(() => {
    if (algoLiveUnsubRef.current) { algoLiveUnsubRef.current(); algoLiveUnsubRef.current = null }
    if (algoLiveFlushTimerRef.current) { clearInterval(algoLiveFlushTimerRef.current); algoLiveFlushTimerRef.current = null }
    if (algoLiveAnalysisIntervalRef.current) { clearInterval(algoLiveAnalysisIntervalRef.current); algoLiveAnalysisIntervalRef.current = null }
    algoLiveBufferRef.current = []
    algoLiveConnectedRef.current = false
    setIsAlgoLive(false)
    setAlgoLiveConnected(false)
  }, [])

  // Embedded mode: auto-analyze when trades or ticker changes (no polling, no search bar)
  const embeddedTradesRef = useRef<any[]>([])
  useEffect(() => {
    if (!embeddedMode || !embeddedTrades || embeddedTrades.length === 0) return
    if (embeddedTrades === embeddedTradesRef.current) return
    embeddedTradesRef.current = embeddedTrades
    const label = embeddedTicker || undefined
    performAnalysis(embeddedTrades, label)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embeddedMode, embeddedTrades, embeddedTicker])

  const [streamStatus, setStreamStatus] = useState('')
  const [isStreamComplete, setIsStreamComplete] = useState<boolean>(false)
  const [overlayActive, setOverlayActive] = useState(false)
  const [timeInterval, setTimeInterval] = useState<'1min' | '5min' | '30min' | '1hour' | '1day'>('5min')
  const [chartViewMode, setChartViewMode] = useState<'detailed' | 'simplified' | 'net'>(typeof window !== 'undefined' && window.innerWidth <= 768 ? 'net' : 'detailed')
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set())
  const toggleLine = (key: string) => setHiddenLines(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  const [scanTimeframe, setScanTimeframe] = useState<string>('1D')
  const [chartDisplayDays, setChartDisplayDays] = useState<number>(1)
  const [brushIndices, setBrushIndices] = useState<{ start: number; end: number } | null>(null)
  const chartDragRef = useRef<{ dragging: boolean; startX: number; startIndices: { start: number; end: number } }>({ dragging: false, startX: 0, startIndices: { start: 0, end: 0 } })
  const dragMoveRafRef = useRef<number | null>(null)   // RAF handle for drag throttle
  const analysisRef = useRef<AlgoFlowAnalysis | null>(null) // sync ref "” avoids setAnalysis in wheel handler
  const chartDivRef = useRef<HTMLDivElement>(null)
  const mainChartWrapRef = useRef<HTMLDivElement>(null)
  const pcPanelRef = useRef<HTMLDivElement>(null)

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

  // Expiry range filter: 'all' | '45d' | 'weekly' | '0dte'
  const [expiryFilter, setExpiryFilter] = useState<'all' | '45d' | 'weekly' | '0dte'>('all')

  // Gamma line toggle (single-ticker only)
  const [showGammaLine, setShowGammaLine] = useState(false)
  // Bull/Bear Ratio sub-panel toggle
  const [showBullBear, setShowBullBear] = useState(typeof window !== 'undefined' ? window.innerWidth > 768 : true)

  // Gamma: real greeks from Polygon per contract
  const [gammaMap, setGammaMap] = useState<Map<string, number>>(new Map())
  const [gammaLoading, setGammaLoading] = useState(false)

  // Ticker exclusion filters
  const [excludeMag7, setExcludeMag7] = useState(false)
  const [excludeEtf, setExcludeEtf] = useState(false)
  const [excludeIndex, setExcludeIndex] = useState(false)
  const [sectorFilter, setSectorFilter] = useState<string | null>(null)
  const [sectorPopupOpen, setSectorPopupOpen] = useState(false)
  const sectorHoldingsCacheRef = useRef<Map<string, string[]>>(new Map())

  const SECTORS = [
    { etf: 'XLK', label: 'Tech' }, { etf: 'XLY', label: 'Cons. Disc.' },
    { etf: 'XLE', label: 'Energy' }, { etf: 'XLF', label: 'Financials' },
    { etf: 'XLV', label: 'Healthcare' }, { etf: 'XLI', label: 'Industrials' },
    { etf: 'XLU', label: 'Utilities' }, { etf: 'XLP', label: 'Cons. Staples' },
    { etf: 'XLB', label: 'Materials' }, { etf: 'XLRE', label: 'Real Estate' },
    { etf: 'XLC', label: 'Comm. Services' },
  ]
  const INDUSTRIES = [
    { etf: 'SMH', label: 'Semiconductors' }, { etf: 'SOXX', label: 'Semis Broad' },
    { etf: 'IGV', label: 'Software' }, { etf: 'SKYY', label: 'Cloud' },
    { etf: 'CLOU', label: 'Cloud SaaS' }, { etf: 'HACK', label: 'Cybersecurity' },
    { etf: 'BOTZ', label: 'Robotics/AI' }, { etf: 'ARKK', label: 'Innovation' },
    { etf: 'ARKG', label: 'Genomics' }, { etf: 'KRE', label: 'Regional Banks' },
    { etf: 'XBI', label: 'Biotech' }, { etf: 'IBB', label: 'Biotech Broad' },
    { etf: 'GDX', label: 'Gold Miners' }, { etf: 'KWEB', label: 'China Internet' },
    { etf: 'FXI', label: 'China Large Cap' },
  ]

  const INDEX_SET = new Set(['SPX', 'SPXW', 'NDX', 'NDXP', 'RUT', 'RUTW', 'VIX', 'VIXW', 'XSP', 'DJX', 'MXEA', 'MXEF'])

  const ETF_SET = new Set(['SPY', 'QQQ', 'IWM', 'DIA', 'SMH', 'VXX', 'UVXY', 'EFA', 'EEM', 'VTI', 'IEFA', 'AGG', 'LQD', 'HYG', 'XLF', 'XLE', 'XLK', 'XLV', 'XLI', 'XLU', 'XLP', 'XLY', 'XLB', 'XLRE', 'XLC', 'GLD', 'SLV', 'TLT', 'IEF', 'SHY', 'VTEB', 'VXUS', 'BND', 'BNDX', 'SQQQ', 'TQQQ', 'SPXL', 'SPXS', 'SPYG', 'SPYV', 'IVV', 'VOO', 'VEA', 'VWO', 'ARKK', 'ARKG', 'ARKW', 'ARKF', 'ARKQ', 'RSP', 'MDY', 'IJH', 'IJR', 'IWF', 'IWD', 'IWB', 'IWO', 'IWN', 'XBI', 'IBB', 'SOXX', 'HACK', 'BOTZ', 'ROBO', 'SKYY', 'CLOU', 'GDX', 'GDXJ', 'SIL', 'SILJ', 'IAU', 'SGOL', 'USO', 'UNG', 'PDBC', 'DBO', 'DBB', 'DBC', 'TBT', 'TMF', 'TMV', 'TLH', 'IEI', 'GOVT', 'FXI', 'KWEB', 'MCHI', 'ASHR', 'VGK', 'EWJ', 'EWZ', 'EWC', 'EWG', 'EWU', 'EURL', 'HEDJ', 'DBJP', 'DBEF'])

  // Fast analysis built directly from already-classified saved trades "” no re-processing
  const buildFastAnalysisFromSaved = (trades: OptionsFlowData[], displayLabel?: string): AlgoFlowAnalysis | null => {
    if (!trades.length) return null
    const ticker = displayLabel ?? trades[0].underlying_ticker
    const currentPrice = displayLabel ? 0 : (trades[0].spot_price ?? 0)

    // Compute PST/PDT offset once "” avoids 601k Intl calls in the loop
    const sampleTs = new Date(trades[0].trade_timestamp)
    const pstOffsetMs = sampleTs.getTime() - new Date(sampleTs.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })).getTime()
    const FIVE_MIN = 5 * 60 * 1000

    let totalCallPremium = 0, totalPutPremium = 0
    let sweepCount = 0, blockCount = 0, miniCount = 0
    let aggressiveCalls = 0, aggressivePuts = 0
    let bullCallPremium = 0, bearCallPremium = 0, bullPutPremium = 0, bearPutPremium = 0

    // time ←’ {callsPlus, callsMinus, putsPlus, putsMinus}
    const buckets = new Map<number, { callsPlus: number; callsMinus: number; putsPlus: number; putsMinus: number }>()

    for (let i = 0; i < trades.length; i++) {
      const t = trades[i]
      const premium = t.total_premium || 0
      const isCall = t.type?.toLowerCase() === 'call'
      const fs = (t as any).fill_style as string | undefined
      // No fill_style = default to A (Buy): calls ←’ bullish, puts ←’ bearish
      const isBullish = !fs || fs === 'N/A' || fs === 'A' || fs === 'AA'
      const isBearish = fs === 'B' || fs === 'BB'

      if (isCall) {
        totalCallPremium += premium
        if (isBullish) { aggressiveCalls++; bullCallPremium += premium }
        else if (isBearish) { bearCallPremium += premium }
      } else {
        totalPutPremium += premium
        if (isBullish) { aggressivePuts++; bullPutPremium += premium }
        else if (isBearish) { bearPutPremium += premium }
      }

      const tt = t.trade_type
      if (tt === 'SWEEP') sweepCount++
      else if (tt === 'BLOCK') blockCount++
      else if (tt === 'MINI') miniCount++

      // Bucket by 5-min using pure math "” no Intl calls per trade
      if (t.trade_timestamp) {
        const tsUtc = new Date(t.trade_timestamp).getTime()
        const tsPst = tsUtc - pstOffsetMs
        const bucket = Math.floor(tsPst / FIVE_MIN) * FIVE_MIN + pstOffsetMs
        const b = buckets.get(bucket) ?? { callsPlus: 0, callsMinus: 0, putsPlus: 0, putsMinus: 0 }
        if (isCall) { if (isBullish) b.callsPlus += premium; else b.callsMinus += premium }
        else { if (isBullish) b.putsPlus += premium; else b.putsMinus += premium }
        buckets.set(bucket, b)
      }
    }

    const netFlow = totalCallPremium - totalPutPremium
    const bullTotal = bullCallPremium + bullPutPremium
    const bearTotal = bearCallPremium + bearPutPremium
    const callPutRatio = bearTotal > 0 ? bullTotal / bearTotal : bullTotal > 0 ? 99 : 1
    const total = aggressiveCalls + aggressivePuts || 1
    const algoFlowScore = (aggressiveCalls - aggressivePuts) / total
    const flowTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = algoFlowScore > 0.25 ? 'BULLISH' : algoFlowScore < -0.25 ? 'BEARISH' : 'NEUTRAL'

    // Build cumulative chart data — filter to regular market hours: 6:30 AM – 1:00 PM PST
    // Use Intl to get PST hours reliably regardless of browser timezone
    const sortedBuckets = Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .filter(([bucketUtc]) => {
        const d = new Date(bucketUtc)
        const pstStr = d.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', hour12: false })
        const [hh, mm] = pstStr.split(':').map(Number)
        const pstMinutes = hh * 60 + mm
        return pstMinutes >= 390 && pstMinutes < 780 // 6:30 AM to 1:00 PM
      })
    let cumCallsPlus = 0, cumCallsMinus = 0, cumPutsPlus = 0, cumPutsMinus = 0
    const chartData = sortedBuckets.map(([time, b]) => {
      cumCallsPlus += b.callsPlus
      cumCallsMinus += b.callsMinus
      cumPutsPlus += b.putsPlus
      cumPutsMinus += b.putsMinus
      const d = new Date(time)
      const timeLabel = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Los_Angeles' })
      const bullish = cumCallsPlus + cumPutsMinus
      const bearish = cumCallsMinus + cumPutsPlus
      return {
        time,
        timeLabel,
        callsPlus: cumCallsPlus,
        callsMinus: cumCallsMinus,
        putsPlus: cumPutsPlus,
        putsMinus: cumPutsMinus,
        netFlow: cumCallsPlus - cumCallsMinus + (cumPutsPlus - cumPutsMinus),
        bullishTotal: bullish,
        bearishTotal: bearish,
        pcRatio: bullish > 0 ? bearish / bullish : 1,
      }
    })

    const result = {
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
      chartData,
      priceData: [],
      tier1Count: 0, tier2Count: 0, tier3Count: 0, tier4Count: 0,
      tier5Count: 0, tier6Count: 0, tier7Count: 0, tier8Count: 0,
      trades,
      bullCallPremium,
      bearCallPremium,
      bullPutPremium,
      bearPutPremium,
    }

    return result
  }





  // Analysis state
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

  // Derived analysis that respects expiryFilter "” re-aggregates from filtered trades without re-running async analysis
  const displayAnalysis = useMemo(() => {
    if (!analysis || (expiryFilter === 'all' && !excludeMag7 && !excludeEtf && !excludeIndex)) return analysis

    const now = new Date()
    const todayPT = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
    const dow = todayPT.getDay()
    const hourPT = todayPT.getHours()
    const tradingDate = todayPT.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })

    const getExpStr = (t: any): string => {
      const e = t.expiry || ''
      return e.includes('T') ? e.split('T')[0] : e
    }

    let filtered: any[] = analysis.trades
    if (excludeMag7) filtered = filtered.filter((t: any) => !MAG7_TICKERS.includes(t.underlying_ticker))
    if (excludeEtf) filtered = filtered.filter((t: any) => !ETF_SET.has(t.underlying_ticker))
    if (excludeIndex) filtered = filtered.filter((t: any) => !INDEX_SET.has(t.underlying_ticker?.toUpperCase()))
    if (expiryFilter === '45d') {
      const cutoff = new Date(todayPT)
      cutoff.setDate(cutoff.getDate() + 45)
      const cutoffStr = cutoff.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
      filtered = filtered.filter((t: any) => { const e = getExpStr(t); return e >= tradingDate && e <= cutoffStr })
    } else if (expiryFilter === 'weekly') {
      const daysToFriday = dow <= 5 ? 5 - dow : 6
      const thisFriday = new Date(todayPT); thisFriday.setDate(todayPT.getDate() + daysToFriday)
      const weekStart = new Date(thisFriday); weekStart.setDate(thisFriday.getDate() - 4)
      const weekStartStr = weekStart.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
      const weekEndStr = thisFriday.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
      filtered = filtered.filter((t: any) => { const e = getExpStr(t); return e >= weekStartStr && e <= weekEndStr })
    } else if (expiryFilter === '0dte') {
      let odteDate = new Date(todayPT)
      if (hourPT >= 16 || dow === 0 || dow === 6) {
        do { odteDate.setDate(odteDate.getDate() + 1) } while ([0, 6].includes(odteDate.getDay()))
      }
      const odteDateStr = odteDate.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
      filtered = filtered.filter((t: any) => getExpStr(t) === odteDateStr)
    }

    // Re-aggregate premiums from filtered trades
    let bullCall = 0, bearCall = 0, bullPut = 0, bearPut = 0, totalCall = 0, totalPut = 0
    let bullishCount = 0, bearishCount = 0, neutralCount = 0
    for (const t of filtered) {
      const premium = t.total_premium || 0
      const isBull = t.fill_style === 'A' || t.fill_style === 'AA'
      const isBear = t.fill_style === 'B' || t.fill_style === 'BB'
      if (t.type === 'call') {
        totalCall += premium
        if (isBull) bullCall += premium; else if (isBear) bearCall += premium
      } else {
        totalPut += premium
        if (isBull) bullPut += premium; else if (isBear) bearPut += premium
      }
      if (t.executionType === 'BULLISH') bullishCount++
      else if (t.executionType === 'BEARISH') bearishCount++
      else neutralCount++
    }
    const total = bullishCount + bearishCount + neutralCount || 1
    const flowTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
      bullishCount / total > 0.55 ? 'BULLISH' : bearishCount / total > 0.55 ? 'BEARISH' : 'NEUTRAL'
    const algoFlowScore = Math.round(((bullishCount - bearishCount) / total) * 100)

    return {
      ...analysis,
      trades: filtered,
      bullCallPremium: bullCall,
      bearCallPremium: bearCall,
      bullPutPremium: bullPut,
      bearPutPremium: bearPut,
      totalCallPremium: totalCall,
      totalPutPremium: totalPut,
      flowTrend,
      algoFlowScore,
    }
  }, [analysis, expiryFilter])

  // ALL-scan drill-down: cache the full ALL results so we can return to them
  const allScanCacheRef = useRef<{ flowData: OptionsFlowData[]; analysis: AlgoFlowAnalysis } | null>(null)
  const [drilledTicker, setDrilledTicker] = useState<string | null>(null)

  // Build analysis directly from already-classified trades "” no re-processing
  const performAnalysis = (tradesData: any[], displayLabel?: string) => {
    const result = buildFastAnalysisFromSaved(tradesData, displayLabel)
    setAnalysis(result)
    if (result?.ticker === 'ALL') { allScanCacheRef.current = { flowData: tradesData, analysis: result }; setShouldAutoScanRRG(v => v + 1) }
    setIsAnalyzing(false)
    setOverlayActive(false)
  }

  // Clear analysis when flowData changes (but don't auto-run analysis)
  useEffect(() => {
    if (flowData.length === 0) {
      setAnalysis(null)
    }
  }, [flowData])

  // ── AlgoFlow Live: start streaming for a ticker or all tickers ───────────────
  const startAlgoLive = useCallback((tickerOrAll: string) => {
    // Stop any existing live session first
    if (algoLiveUnsubRef.current) { algoLiveUnsubRef.current(); algoLiveUnsubRef.current = null }
    if (algoLiveFlushTimerRef.current) { clearInterval(algoLiveFlushTimerRef.current); algoLiveFlushTimerRef.current = null }
    if (algoLiveAnalysisIntervalRef.current) { clearInterval(algoLiveAnalysisIntervalRef.current); algoLiveAnalysisIntervalRef.current = null }

    const targetTicker = tickerOrAll.toUpperCase()
    algoLiveTickerRef.current = targetTicker
    algoLiveConnectedRef.current = false
    algoLiveBufferRef.current = []
    accumulatedTradesRef.current = []

    setIsAlgoLive(true)
    setAlgoLiveTicker(targetTicker)
    setAlgoLiveConnected(false)
    setAlgoLiveTradeCount(0)
    setFlowData([])
    setAnalysis(null)
    setStreamStatus(`LIVE ${targetTicker === 'ALL' ? '· ALL TICKERS' : `· ${targetTicker}`}`)

    // Subscribe via Railway DB poll instead of WebSocket
    // (Railway holds the single Polygon WS connection "” browser polls every 30s)
    const getTodayDS = () => {
      const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }

    const pollAlgoDB = async () => {
      try {
        const res = await fetch(`/api/flows/save-batch?date=${getTodayDS()}`)
        const result = await res.json()
        if (!result.trades || result.trades.length === 0) return
        if (!algoLiveConnectedRef.current) {
          algoLiveConnectedRef.current = true
          setAlgoLiveConnected(true)
        }
        const filtered: OptionsFlowData[] = (result.trades as OptionsFlowData[]).filter(t =>
          targetTicker === 'ALL' || t.underlying_ticker === targetTicker
        )
        accumulatedTradesRef.current = filtered
        setFlowData(filtered)
        setAlgoLiveTradeCount(filtered.length)
        setStreamStatus(`LIVE ${targetTicker === 'ALL' ? '· ALL TICKERS' : `· ${targetTicker}`} · ${filtered.length} trades`)
      } catch { /* ignore */ }
    }

    pollAlgoDB()
    algoLiveFlushTimerRef.current = setInterval(pollAlgoDB, 30 * 1000)

    // 10-second analysis refresh: recompute chart from accumulated trades
    algoLiveAnalysisIntervalRef.current = setInterval(() => {
      const trades = accumulatedTradesRef.current
      if (trades.length === 0) return
      const label = algoLiveTickerRef.current === 'ALL' ? 'ALL' : algoLiveTickerRef.current
      performAnalysis(trades, label === 'ALL' ? undefined : label)
    }, 10000)
  }, [convertAlgoTrade, performAnalysis])

  // Sync chart view window when scan timeframe changes (no auto re-analyze "” user must click ANALYZE)
  useEffect(() => {
    setChartDisplayDays(getScanDays(scanTimeframe))
    setBrushIndices(null)
  }, [scanTimeframe])

  // Reset brush when chartDisplayDays changes "” merged into button click handler, no separate effect needed

  // Memoize trades-table OI computation "” prevents rerunning 36k-trade loop on every render
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
    if (!analysis?.chartData) {
      return { visibleData: [] as any[], xInterval: 0, priceMin: 'auto' as any, priceMax: 'auto' as any }
    }

    // When a filter is active, rebuild the time-series from the filtered trades
    // instead of using the pre-built chartData from the full analysis pass
    let activeChartData = analysis.chartData
    const anyTickerFilter = excludeMag7 || excludeEtf || excludeIndex
    if ((expiryFilter !== 'all' || anyTickerFilter) && displayAnalysis?.trades && displayAnalysis.trades.length > 0) {
      let filteredTrades = displayAnalysis.trades
      if (excludeMag7) filteredTrades = filteredTrades.filter((t: any) => !MAG7_TICKERS.includes(t.underlying_ticker))
      if (excludeEtf) filteredTrades = filteredTrades.filter((t: any) => !ETF_SET.has(t.underlying_ticker))
      if (excludeIndex) filteredTrades = filteredTrades.filter((t: any) => !INDEX_SET.has(t.underlying_ticker?.toUpperCase()))

      // Rebuild intervalData using the same slot keys that are in the existing chartData
      const intervalData: Record<string, { callsPlus: number; callsMinus: number; putsPlus: number; putsMinus: number }> = {}
      // Seed every existing slot with zeros so the time axis stays identical
      for (const point of analysis.chartData) {
        intervalData[point.time] = { callsPlus: 0, callsMinus: 0, putsPlus: 0, putsMinus: 0 }
      }
      // Build a fast lookup: ms-timestamp ←’ slot (nearest slot)
      const slotTimes = Object.keys(intervalData).map(Number).sort((a, b) => a - b)

      for (const trade of filteredTrades) {
        const tradeDate = new Date(trade.trade_timestamp)
        const ptTime = new Date(tradeDate.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
        const hour = ptTime.getHours()
        const minute = ptTime.getMinutes()
        if (hour < 6 || hour > 13 || (hour === 6 && minute < 30)) continue
        const tradeMs = ptTime.getTime()
        // Find the nearest slot that is <= tradeMs
        let slotMs = slotTimes[0]
        for (const st of slotTimes) {
          if (st <= tradeMs) slotMs = st
          else break
        }
        if (!(slotMs in intervalData)) continue
        const isBullish = trade.fill_style === 'A' || trade.fill_style === 'AA'
        const isBear = trade.fill_style === 'B' || trade.fill_style === 'BB'
        if (trade.type === 'call') {
          if (isBullish) intervalData[slotMs].callsPlus += trade.total_premium
          else if (isBear) intervalData[slotMs].callsMinus += trade.total_premium
          else intervalData[slotMs].callsMinus += trade.total_premium
        } else {
          if (isBullish) intervalData[slotMs].putsPlus += trade.total_premium
          else if (isBear) intervalData[slotMs].putsMinus += trade.total_premium
          else intervalData[slotMs].putsMinus += trade.total_premium
        }
      }

      // Rebuild cumulative series preserving stockLow/stockHigh/price from original
      const origByTime = new Map(analysis.chartData.map((p: any) => [p.time, p]))
      let cumCp = 0, cumCm = 0, cumPp = 0, cumPm = 0
      activeChartData = slotTimes.map((slotMs) => {
        const d = intervalData[slotMs]
        cumCp += d.callsPlus; cumCm += d.callsMinus; cumPp += d.putsPlus; cumPm += d.putsMinus
        const orig = origByTime.get(slotMs) ?? {}
        const netFlow = cumCp - cumCm + (cumPp - cumPm)
        const bullishTotal = cumCp + cumPp
        const bearishTotal = -(cumCm + cumPm)
        return { ...orig, callsPlus: cumCp, callsMinus: cumCm, putsPlus: cumPp, putsMinus: cumPm, netFlow, bullishTotal, bearishTotal }
      })
    }

    // ── Resample to selected interval ───────────────────────────────────
    if (timeInterval === '1min' && (displayAnalysis?.trades?.length ?? 0) > 0) {
      // Rebuild at 1-min resolution from individual trades
      const trades = (displayAnalysis!.trades as any[])
      const pstSample = new Date(trades[0].trade_timestamp)
      const pstOff = pstSample.getTime() - new Date(pstSample.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })).getTime()
      const ONE_MIN = 60_000
      const minBuckets = new Map<number, { cp: number; cm: number; pp: number; pm: number }>()
      for (const t of trades) {
        const fs = t.fill_style as string | undefined
        const isBull = !fs || fs === 'N/A' || fs === 'A' || fs === 'AA'
        const isBear = fs === 'B' || fs === 'BB'
        const prem = t.total_premium || 0
        const isCall = (t.type as string)?.toLowerCase() === 'call'
        const tsPst = new Date(t.trade_timestamp).getTime() - pstOff
        const bucket = Math.floor(tsPst / ONE_MIN) * ONE_MIN + pstOff
        const b = minBuckets.get(bucket) ?? { cp: 0, cm: 0, pp: 0, pm: 0 }
        if (isCall) { if (isBull) b.cp += prem; else if (isBear) b.cm += prem }
        else { if (isBull) b.pp += prem; else if (isBear) b.pm += prem }
        minBuckets.set(bucket, b)
      }
      let cCp = 0, cCm = 0, cPp = 0, cPm = 0
      const MARKET_OPEN_MIN = 390  // 6:30 AM in PST minutes
      const MARKET_CLOSE_MIN = 780  // 1:00 PM in PST minutes
      activeChartData = Array.from(minBuckets.entries()).sort(([a], [b]) => a - b)
        .filter(([time]) => {
          const d = new Date(time)
          const pstStr = d.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', hour12: false })
          const [hh, mm] = pstStr.split(':').map(Number)
          const pstMinutes = hh * 60 + mm
          return pstMinutes >= MARKET_OPEN_MIN && pstMinutes < MARKET_CLOSE_MIN
        })
        .map(([time, b]) => {
          cCp += b.cp; cCm += b.cm; cPp += b.pp; cPm += b.pm
          const d = new Date(time)
          const timeLabel = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Los_Angeles' })
          const netFlow = cCp - cCm + (cPp - cPm)
          const bullishTotal = cCp + cPp
          const bearishTotal = -(cCm + cPm)
          return { time, timeLabel, callsPlus: cCp, callsMinus: cCm, putsPlus: cPp, putsMinus: cPm, netFlow, bullishTotal, bearishTotal, pcRatio: bullishTotal > 0 ? Math.abs(bearishTotal) / bullishTotal : 1 }
        })
    } else if (timeInterval === '30min') {
      // Downsample 5-min ←’ 30-min: take every 6th cumulative point
      activeChartData = activeChartData.filter((_: any, i: number) => i % 6 === 0 || i === activeChartData.length - 1)
    } else if (timeInterval === '1hour') {
      // Downsample 5-min ←’ 1-hour: take every 12th cumulative point
      activeChartData = activeChartData.filter((_: any, i: number) => i % 12 === 0 || i === activeChartData.length - 1)
    } else if (timeInterval === '1day') {
      // Downsample to daily: last 5-min point of each trading day
      const dayMap = new Map<string, any>()
      for (const pt of activeChartData) {
        const d = new Date(pt.time)
        const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`
        dayMap.set(key, pt) // last point of each day wins
      }
      activeChartData = Array.from(dayMap.values())
    }

    const scanDays = getScanDays(scanTimeframe)
    const baseData = chartDisplayDays >= scanDays
      ? activeChartData
      : activeChartData.filter((d: any) => d.time >= Date.now() - chartDisplayDays * 1.5 * 24 * 60 * 60 * 1000)
    const len = baseData.length
    const bStart = brushIndices ? Math.max(0, Math.min(brushIndices.start, len - 1)) : 0
    const bEnd = brushIndices ? Math.max(bStart + 1, Math.min(brushIndices.end, len - 1)) : len - 1
    const sliced = baseData.slice(bStart, bEnd + 1)
    // Downsample to max 400 pts "” SVG renders 600x4 lines in ~50ms, 400x4 in ~10ms
    const MAX_PTS = 400
    const visibleData = (sliced.length > MAX_PTS
      ? sliced.filter((_: any, i: number) =>
        i === 0 || i === sliced.length - 1 || i % Math.ceil(sliced.length / MAX_PTS) === 0
      )
      : sliced
    ).map((d: any) => ({ ...d }))
    const xInterval = Math.max(0, Math.floor(visibleData.length / 12) - 1)
    const priceLows = visibleData.map((d: any) => d.stockLow).filter((p: any) => p != null && !isNaN(p))
    const priceHighs = visibleData.map((d: any) => d.stockHigh).filter((p: any) => p != null && !isNaN(p))
    const priceMin = priceLows.length ? Math.min(...priceLows) * 0.95 : 'auto'
    const priceMax = priceHighs.length ? Math.max(...priceHighs) * 1.05 : 'auto'
    return { visibleData, xInterval, priceMin, priceMax }
  }, [analysis?.chartData, displayAnalysis?.trades, expiryFilter, excludeMag7, excludeEtf, excludeIndex, chartDisplayDays, scanTimeframe, brushIndices])

  // Keep analysisRef in sync so wheel handler never needs to call setAnalysis
  useEffect(() => { analysisRef.current = analysis }, [analysis])

  // Auto-set default interval when scan range changes
  useEffect(() => {
    const days = getScanDays(scanTimeframe)
    if (days === 1) setTimeInterval('5min')
    else if (days <= 5) setTimeInterval('30min')
    else setTimeInterval('1day')
    setBrushIndices(null)
  }, [scanTimeframe])

  // Attach wheel listener as non-passive so preventDefault() works for chart zoom
  useEffect(() => {
    const el = chartDivRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const data = analysisRef.current?.chartData
      if (!data) return
      const len = data.length
      if (len < 2) return
      setBrushIndices((cur) => {
        const current = cur ?? { start: 0, end: len - 1 }
        const range = current.end - current.start
        const step = Math.max(2, Math.floor(range * 0.1))
        if (e.deltaY < 0) {
          // zoom in "” shrink window
          const mid = Math.round((current.start + current.end) / 2)
          const half = Math.max(4, Math.floor((range - step * 2) / 2))
          return { start: Math.max(0, mid - half), end: Math.min(len - 1, mid + half) }
        } else {
          // zoom out "” expand window
          return { start: Math.max(0, current.start - step), end: Math.min(len - 1, current.end + step) }
        }
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

    // Expand group keywords ←’ comma-list of actual tickers
    const upper = tickerToSearch.trim().toUpperCase()
    let actualTickers: string
    let displayLabel: string | undefined

    const topNMatch = upper.match(/^TOP(\d+)$/)
    const etfNMatch = upper.match(/^([A-Z]{2,6})(\d+)$/)

    if (upper === 'MAG7') {
      actualTickers = MAG7_TICKERS.join(',')
      displayLabel = 'MAG7'
    } else if (upper === 'ALL') {
      actualTickers = [...MAG7_TICKERS, ...ETF_TICKERS].join(',')
      displayLabel = 'ALL'
    } else if (topNMatch) {
      const n = Math.min(1000, Math.max(1, parseInt(topNMatch[1])))
      try {
        const resp = await fetch(`/api/market-cap-top?limit=${n}`)
        if (!resp.ok) throw new Error('Failed to fetch market cap rankings')
        const data = await resp.json()
        const symbols: string[] = data.symbols || []
        if (!symbols.length) { setError(`No symbols found for TOP${n}`); setLoading(false); return }
        actualTickers = symbols.join(',')
        displayLabel = `TOP${n}`
      } catch (e: any) {
        setError(e.message || `Failed to resolve TOP${n}`)
        setLoading(false)
        return
      }
    } else if (etfNMatch) {
      const etfTicker = etfNMatch[1]
      const n = Math.min(1000, Math.max(1, parseInt(etfNMatch[2])))
      try {
        const resp = await fetch(`/api/etf-holdings?etf=${etfTicker}&limit=${n}`)
        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}))
          throw new Error(errData.error || `Unknown ETF: ${etfTicker}`)
        }
        const data = await resp.json()
        const symbols: string[] = data.symbols || []
        if (!symbols.length) { setError(`No holdings found for ${etfTicker}${n}`); setLoading(false); return }
        actualTickers = symbols.join(',')
        displayLabel = `${etfTicker}${n}`
      } catch (e: any) {
        setError(e.message || `Failed to resolve ${etfTicker}${n}`)
        setLoading(false)
        return
      }
    } else {
      actualTickers = upper
      displayLabel = undefined
    }

    setOverlayActive(true)
    setLoading(true)
    setError('')
    setIsStreamComplete(false)
    setDrilledTicker(null)
    setGammaMap(new Map())
    // Clear ALL cache when starting a fresh scan (new scan may be a different ticker)
    if (upper !== 'ALL') allScanCacheRef.current = null
    multiScanLabelRef.current = displayLabel

    // Check saved data first (skip when scanning specific missing dates)
    if (!options?.specificDates) {
      setStreamStatus('Checking saved data...')
      try {
        const datesResp = await fetch('/api/flows/dates')
        if (datesResp.ok) {
          const dates: { date: string; tradeCount?: number | null; source?: string }[] = await datesResp.json()
          if (dates.length > 0) {
            const allRequiredDays = getAlgoTradingDays(tf)
            const requiredDayCount = allRequiredDays.length

            const seenDayKeys = new Set<string>()
            const rowsToLoad: string[] = []
            // Sort descending so we pick the MOST RECENT dates first
            const sortedDates = [...dates].sort((a, b) => b.date.localeCompare(a.date))
            for (const { date: rawDate } of sortedDates) {
              const dayKey = new Date(rawDate).toISOString().split('T')[0]
              if (!seenDayKeys.has(dayKey)) {
                seenDayKeys.add(dayKey)
                rowsToLoad.push(rawDate)
              }
              if (rowsToLoad.length >= requiredDayCount) break
            }
            if (rowsToLoad.length > 0) {
              const isMultiAll = displayLabel === 'ALL' || displayLabel === 'MAG7' || (displayLabel != null && actualTickers.includes(','))
              const tickersQS = isMultiAll ? '' : `?tickers=${encodeURIComponent(actualTickers)}`
              // eslint-disable-next-line no-inner-declarations
              if (false) { const dayPayloads2 = null; void dayPayloads2 } // dead: neutralize duplicate below "” server filters before
              // building the response so wire transfer shrinks from 601k ←’ only matching trades
              const dayPayloads = await Promise.all(
                rowsToLoad.map(async (rawDate) => {
                  const r = await fetch(`/api/flows/${encodeURIComponent(rawDate)}${tickersQS}`)
                  const json = r.ok ? await r.json() : null
                  return json
                })
              )

              const combinedTrades: OptionsFlowData[] = []
              for (const payload of dayPayloads) {
                // Use a loop instead of push(...) "” spread on 600k+ items overflows the JS call stack
                if (Array.isArray(payload?.data)) {
                  const incoming = payload.data as OptionsFlowData[]
                  for (let i = 0; i < incoming.length; i++) combinedTrades.push(incoming[i])
                }
              }

              // Determine which required trading days are actually present.
              // FIXED: compute PST offset ONCE from a sample trade (1 Intl call), then
              // use pure UTC math per-trade "” avoids 601k Intl calls that blocked for 21s.
              const _pstSample = combinedTrades.length > 0 ? new Date(combinedTrades[0].trade_timestamp) : new Date()
              const _pstOffsetMs = _pstSample.getTime() - new Date(_pstSample.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })).getTime()
              const tradeDaySet = new Set<string>()
              for (let i = 0; i < combinedTrades.length; i++) {
                const pstMs = new Date(combinedTrades[i].trade_timestamp).getTime() - _pstOffsetMs
                const d = new Date(pstMs)
                tradeDaySet.add(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`)
              }
              const coveredDays = allRequiredDays.filter((d) => tradeDaySet.has(d))
              const missingDays = allRequiredDays.filter((d) => !tradeDaySet.has(d))

              // When scanning ALL (or MAG7), skip the ticker filter "” return every trade
              // in the saved data. The DB was saved from a broader scan so filtering
              // to a hardcoded 33-ticker set throws away legitimate data.
              // FIXED: hoist Set construction outside the filter callback (was creating 601k Sets)
              const _tickerSet = new Set(actualTickers.split(',').map((x) => x.trim().toUpperCase()))
              const saved = displayLabel === 'ALL' || displayLabel === 'MAG7'
                ? combinedTrades
                : combinedTrades.filter((t: OptionsFlowData) =>
                  _tickerSet.has(t.underlying_ticker?.toUpperCase() ?? '')
                )

              if (saved.length > 0 && missingDays.length === 0) {
                // Full coverage and ticker data found "” use saved
                setFlowData(saved)
                accumulatedTradesRef.current = saved
                liveOICache.clear()
                setIsStreamComplete(true)
                setStreamStatus(`Loaded from saved - ${saved.length} trades`)
                setLoading(false)
                // Trades are already classified "” build analysis directly from saved fields, skip re-processing
                const fastAnalysis = buildFastAnalysisFromSaved(saved, displayLabel)
                if (fastAnalysis) {
                  setAnalysis(fastAnalysis)
                  if (fastAnalysis.ticker === 'ALL') { allScanCacheRef.current = { flowData: saved, analysis: fastAnalysis }; setShouldAutoScanRRG(v => v + 1) }
                }
                setOverlayActive(false)
                return
              } else if (saved.length > 0 && coveredDays.length > 0) {
                // Partial coverage but have some ticker data "” show missing days dialog
                setLoading(false)
                setStreamStatus('')
                setMissingDaysDialog({ missingDays, savedTrades: saved, originalSearch: tickerToSearch, tf, displayLabel })
                setOverlayActive(false)
                return
              }
              // saved.length === 0 means ticker not in saved data ←’ fall through to live scan
            }
          }
        }
      } catch (err) {
      }
    } else {
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
                pendingTradesRef.current.push(...data.trades)
                if (rafFlushRef.current === null) {
                  rafFlushRef.current = requestAnimationFrame(() => {
                    rafFlushRef.current = null
                    flushPendingTrades()
                  })
                }
                setStreamStatus(
                  `Received ${accumulatedTradesRef.current.length} trades (${data.ticker})...`
                )
              }
              break

            // ─── LEGACY PROGRESSIVE PATH (kept for other callers) ──────────
            case 'trades':
              if (data.trades?.length > 0 && !isStreamComplete) {
                accumulatedTradesRef.current = [...accumulatedTradesRef.current, ...data.trades]
                pendingTradesRef.current.push(...data.trades)
                if (rafFlushRef.current === null) {
                  rafFlushRef.current = requestAnimationFrame(() => {
                    rafFlushRef.current = null
                    flushPendingTrades()
                  })
                }
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
                    setStreamStatus(`Complete "” ${tradesWithVolOI.length} trades loaded`)
                    setLoading(false)
                    performAnalysis(tradesWithVolOI, displayLabel)
                  })
                  .catch(() => {
                    setFlowData(completeTrades)
                    liveOICache.clear()
                    setStreamStatus('Complete (volume/OI unavailable)')
                    setLoading(false)
                    performAnalysis(completeTrades, displayLabel)
                  })
              } else {
                setError(`No options flow data found for ${actualTickers}`)
                setLoading(false)
                setOverlayActive(false)
              }
              eventSource.close()
              break
            }

            case 'error':
              setError(data.error || 'Stream error occurred')
              setLoading(false)
              setOverlayActive(false)
              eventSource.close()
              break
          }
        } catch (parseError) {
          // parse error "” skip
        }
      }

      eventSource.onerror = (error) => {
        // Only log errors if stream hasn't completed successfully
        if (!isStreamComplete) {

          setError('Stream connection unavailable')
          setLoading(false)
          setOverlayActive(false)
        }
        eventSource.close()
      }

      // Cleanup on component unmount
      return () => eventSource.close()
    } catch (error) {
      setError('Failed to start flow analysis')
      setLoading(false)
      setOverlayActive(false)
    }
  }

  // Fetch real gamma values from Polygon for all contracts in the current flow (single-ticker only)
  const fetchGammasForFlowTrades = useCallback(async (trades: OptionsFlowData[], underlyingTicker: string) => {
    if (!trades.length || !underlyingTicker) return
    setGammaLoading(true)
    try {
      // Single call "” options-chain without expiration returns all contracts up to 3 months
      const res = await fetch(`/api/options-chain?ticker=${underlyingTicker}`)
      const json = await res.json()
      if (!json.success || !json.data) return
      const map = new Map<string, number>()
      // data shape: { [expiryDate]: { calls: { [strike]: { greeks: { gamma } } }, puts: { ... } } }
      for (const [expiry, expData] of Object.entries(json.data as Record<string, any>)) {
        const normExpiry = expiry.includes('T') ? expiry.split('T')[0] : expiry
        for (const [strike, cd] of Object.entries((expData as any).calls || {})) {
          const gamma = (cd as any)?.greeks?.gamma
          if (gamma != null) map.set(`${strike}_C_${normExpiry}`, gamma)
        }
        for (const [strike, cd] of Object.entries((expData as any).puts || {})) {
          const gamma = (cd as any)?.greeks?.gamma
          if (gamma != null) map.set(`${strike}_P_${normExpiry}`, gamma)
        }
      }
      setGammaMap(map)
    } catch (e) {
      // gamma fetch failed
    } finally {
      setGammaLoading(false)
    }
  }, [])

  // Trigger gamma fetch when a single-ticker analysis completes
  useEffect(() => {
    if (!analysis || isAllScan) return
    const t = analysis.ticker
    if (!t || t === 'ALL' || t === 'MAG7' || t.includes(',')) return
    fetchGammasForFlowTrades(flowData, t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis?.ticker])

  // Build cumulative gamma line from real Polygon greeks "” per trade, chronological
  const gammaLineData = useMemo(() => {
    if (!gammaMap.size || !flowData.length) return [] as Array<{ time: number; timeLabel: string; cumGamma: number }>
    const sorted = [...flowData].sort(
      (a, b) => new Date(a.trade_timestamp).getTime() - new Date(b.trade_timestamp).getTime()
    )
    const sampleTs = new Date(sorted[0].trade_timestamp)
    const pstOffsetMs =
      sampleTs.getTime() -
      new Date(sampleTs.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })).getTime()
    const FIVE_MIN = 5 * 60 * 1000
    const buckets = new Map<number, number>()
    for (const t of sorted) {
      const expiry = (t.expiry || '').includes('T') ? t.expiry.split('T')[0] : (t.expiry || '')
      const typeChar = t.type === 'call' ? 'C' : 'P'
      const key = `${t.strike}_${typeChar}_${expiry}`
      const gamma = gammaMap.get(key) ?? 0
      if (!gamma) continue
      const fs = (t as any).fill_style as string | undefined
      const isBullish = !fs || fs === 'N/A' || fs === 'A' || fs === 'AA'
      const isBearish = fs === 'B' || fs === 'BB'
      if (!isBullish && !isBearish) continue
      const signedGamma = isBullish ? gamma : -gamma
      const tsUtc = new Date(t.trade_timestamp).getTime()
      const tsPst = tsUtc - pstOffsetMs
      const bucket = Math.floor(tsPst / FIVE_MIN) * FIVE_MIN + pstOffsetMs
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + signedGamma)
    }
    let cum = 0
    return Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([time, delta]) => {
        cum += delta
        const d = new Date(time)
        const timeLabel = d.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'America/Los_Angeles',
        })
        return { time, timeLabel, cumGamma: cum }
      })
  }, [gammaMap, flowData])

  const handleSearch = () => {
    if (ticker.trim()) {
      setSectorFilter(null)
      setSearchTicker(ticker.toUpperCase())
      fetchTickerFlow(ticker)
    }
  }

  const handleSectorSelect = async (etf: string) => {
    setSectorPopupOpen(false)
    if (sectorFilter === etf) {
      setSectorFilter(null)
      if (allScanCacheRef.current) {
        setFlowData(allScanCacheRef.current.flowData)
        setAnalysis(allScanCacheRef.current.analysis)
      }
      return
    }
    setSectorFilter(etf)
    // Get holdings (cached)
    let holdings = sectorHoldingsCacheRef.current.get(etf)
    if (!holdings) {
      try {
        const resp = await fetch(`/api/etf-holdings?etf=${etf}&limit=100`)
        if (resp.ok) {
          const data = await resp.json()
          holdings = (data.symbols || []) as string[]
          sectorHoldingsCacheRef.current.set(etf, holdings)
        }
      } catch { }
    }
    if (!holdings?.length) return
    const holdingSet = new Set(holdings.map((s: string) => s.toUpperCase()))
    if (allScanCacheRef.current?.flowData?.length) {
      const filtered = allScanCacheRef.current.flowData.filter(
        t => holdingSet.has(t.underlying_ticker?.toUpperCase() ?? '')
      )
      if (filtered.length > 0) {
        setFlowData(filtered)
        performAnalysis(filtered, etf)
        return
      }
    }
    // No ALL cache — fetch flow for ETF holdings
    fetchTickerFlow(etf + '100')
  }

  // Show full-screen ALL-scan loading scene (match OptionsFlow visuals)
  const [isAllScan, setIsAllScan] = useState(false)

  // Clear isAllScan only when overlayActive is fully done (not just loading)
  useEffect(() => {
    if (!overlayActive && isAllScan) {
      setIsAllScan(false)
    }
  }, [overlayActive, isAllScan])

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

  const fmtCompact = (n: number) => {
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
    if (n >= 100e6) return `$${Math.round(n / 1e6)}M`
    if (n >= 10e6) return `$${(n / 1e6).toFixed(1)}M`
    return `$${(n / 1e6).toFixed(2)}M`
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

  // Flow Quadrant Gauge "” 4 liquid-filled quadrants (Bull/Bear Calls & Puts) + center neutral
  const FlowQuadrantGauge = ({
    bullCall, bearCall, bullPut, bearPut, score, label,
  }: {
    bullCall: number; bearCall: number; bullPut: number; bearPut: number; score: number; label: string
  }) => {
    const total = bullCall + bearCall + bullPut + bearPut || 1
    const W = isMobile ? 60 : 136, H = isMobile ? 60 : 100, amp = isMobile ? 3 : 6
    const quads = isMobile
      ? [
        { id: 'bc', lbl: 'BULL CALLS', val: bullCall, color: '#10b981', x: 2, y: 5 },
        { id: 'rc', lbl: 'BEAR CALLS', val: bearCall, color: '#ef4444', x: 64, y: 5 },
        { id: 'bp', lbl: 'BULL PUTS', val: bullPut, color: '#3b82f6', x: 178, y: 5 },
        { id: 'rp', lbl: 'BEAR PUTS', val: bearPut, color: '#f97316', x: 240, y: 5 },
      ]
      : [
        { id: 'bc', lbl: 'BULL CALLS', val: bullCall, color: '#10b981', x: 2, y: 4 },
        { id: 'rc', lbl: 'BEAR CALLS', val: bearCall, color: '#ef4444', x: 142, y: 4 },
        { id: 'bp', lbl: 'BULL PUTS', val: bullPut, color: '#3b82f6', x: 2, y: 110 },
        { id: 'rp', lbl: 'BEAR PUTS', val: bearPut, color: '#f97316', x: 142, y: 110 },
      ]
    const speeds = [2.0, 2.6, 1.8, 2.3]
    const absScore = Math.abs(score)
    const scoreColor = absScore < 0.2 ? '#eab308' : score > 0 ? '#10b981' : '#ef4444'
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: isMobile ? '6px 4px 2px' : '10px 4px 4px', width: '100%' }}>
        <svg width={isMobile ? '100%' : '290'} {...(isMobile ? {} : { height: '220' })} viewBox={isMobile ? '0 0 302 70' : '0 0 280 218'} style={{ overflow: 'visible' }}>
          <style>{`
            @keyframes fqw0{from{transform:translateX(0px)}to{transform:translateX(-${W}px)}}
            @keyframes fqw1{from{transform:translateX(0px)}to{transform:translateX(-${W}px)}}
            @keyframes fqw2{from{transform:translateX(0px)}to{transform:translateX(-${W}px)}}
            @keyframes fqw3{from{transform:translateX(0px)}to{transform:translateX(-${W}px)}}
            @keyframes fqcwave{from{transform:translateX(0px)}to{transform:translateX(-52px)}}
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
                <text x={q.x + W / 2} y={q.y + 20} textAnchor="middle" fill="#ffffff" fontSize={isMobile ? '8.5' : '16'} fontFamily="JetBrains Mono,monospace" fontWeight="700" letterSpacing="0.5">{q.lbl}</text>
                <text x={q.x + W / 2} y={q.y + H - 10} textAnchor="middle" fill="#ffffff" fontSize={isMobile ? '14' : '28'} fontFamily="JetBrains Mono,monospace" fontWeight="800">{(fill * 100).toFixed(0)}%</text>
              </g>
            )
          })}
          {/* Center score circle "” mobile only */}
          {isMobile && (() => {
            const cx = 151, cy = 35, r = 24, rt = 32
            const fillColor = score >= 0 ? '#10b981' : '#ef4444'
            const fillPct = Math.max(0.08, Math.min(0.92, 0.2 + Math.abs(score) * 0.45))
            const liquidH = r * 2 * fillPct
            const waveY = cy - r + (r * 2 - liquidH)
            const bottom = cy + r
            const Wc = 52, ampc = 2.5
            const wxc = cx - r - Wc
            const wpc = `M${wxc} ${waveY} ` +
              `q${Wc / 4} ${-ampc} ${Wc / 2} 0 q${Wc / 4} ${ampc} ${Wc / 2} 0 ` +
              `q${Wc / 4} ${-ampc} ${Wc / 2} 0 q${Wc / 4} ${ampc} ${Wc / 2} 0 ` +
              `q${Wc / 4} ${-ampc} ${Wc / 2} 0 q${Wc / 4} ${ampc} ${Wc / 2} 0 ` +
              `V${bottom} H${wxc} Z`
            return (
              <>
                <defs>
                  <clipPath id="fq-circle-clip"><circle cx={cx} cy={cy} r={r} /></clipPath>
                  <path id="fq-arc-top" d={`M ${cx - rt},${cy} A ${rt},${rt} 0 0,1 ${cx + rt},${cy}`} />
                </defs>
                <circle cx={cx} cy={cy} r={r} fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
                <g clipPath="url(#fq-circle-clip)">
                  <rect x={cx - r} y={Math.max(cy - r, waveY + ampc)} width={r * 2} height={Math.max(0, bottom - Math.max(cy - r, waveY + ampc))} fill={fillColor} opacity={0.3} />
                  <g style={{ animationName: 'fqcwave', animationDuration: '2.2s', animationTimingFunction: 'linear', animationIterationCount: 'infinite' }}>
                    <path d={wpc} fill={fillColor} opacity={0.7} />
                  </g>
                </g>
                <circle cx={cx} cy={cy} r={r} fill="none" stroke={scoreColor} strokeWidth="1.5" />
                <text textAnchor="middle" dominantBaseline="middle" x={cx} y={cy} fill="#ffffff" fontSize="12" fontFamily="JetBrains Mono,monospace" fontWeight="900" style={{ textShadow: `0 0 6px ${fillColor}` }}>{score.toFixed(2)}</text>
                <text fill="#ff8500" fontSize="5.5" fontFamily="JetBrains Mono,monospace" fontWeight="800" letterSpacing="0.6">
                  <textPath href="#fq-arc-top" startOffset="50%" textAnchor="middle">ALGOFLOW SCORE</textPath>
                </text>
              </>
            )
          })()}
          {/* Center neutral circle - desktop only */}
          {!isMobile && (
            <>
              <circle cx={140} cy={109} r={22} fill="rgba(4,4,12,0.92)" stroke="rgba(255,255,255,0.13)" strokeWidth="1" />
              <text x={140} y={103} textAnchor="middle" dominantBaseline="middle" fill="#ffffff" fontSize="11" fontFamily="JetBrains Mono,monospace" fontWeight="700">NEU</text>
              <text x={140} y={118} textAnchor="middle" dominantBaseline="middle" fill={scoreColor} fontSize="14" fontFamily="JetBrains Mono,monospace" fontWeight="800">{score.toFixed(2)}</text>
            </>
          )}
        </svg>
        {isMobile
          ? null
          : null
        }
      </div>
    )
  }

  // Legacy gauge (unused "” kept for reference)
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

          {/* Single-color fill "” 0° to needle, one solid color based on current zone */}
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
      setStreamStatus(`Loaded from saved - ${savedTrades.length} trades`)
      performAnalysis(savedTrades, displayLabel)
    } else {
      setError('No saved data available for this selection.')
    }
  }

  // ── Flow Bias Scanner helpers ────────────────────────────────────────────────
  const aggregateFlowByTicker = (trades: OptionsFlowData[]) => {
    const map = new Map<string, { ticker: string; bullCall: number; bearCall: number; bullPut: number; bearPut: number; total: number; callPremium: number; putPremium: number }>()
    for (const t of trades) {
      const sym = t.underlying_ticker
      if (!map.has(sym)) map.set(sym, { ticker: sym, bullCall: 0, bearCall: 0, bullPut: 0, bearPut: 0, total: 0, callPremium: 0, putPremium: 0 })
      const a = map.get(sym)!
      const prem = t.total_premium || 0
      const fs = (t as any).fill_style as string | undefined
      const isCall = t.type?.toLowerCase() === 'call'
      const isBull = !fs || fs === 'N/A' || fs === 'A' || fs === 'AA'
      const isBear = fs === 'B' || fs === 'BB'
      a.total += prem
      if (isCall) { a.callPremium += prem; if (isBull) a.bullCall += prem; else if (isBear) a.bearCall += prem }
      else { a.putPremium += prem; if (isBull) a.bullPut += prem; else if (isBear) a.bearPut += prem }
    }
    return Array.from(map.values())
  }

  const getBiasFlowData = async (): Promise<OptionsFlowData[]> => {
    // 1. Use ALL-scan cache if available
    if (allScanCacheRef.current?.flowData?.length) {
      setBiasDataStatus(`Using cached scan (${allScanCacheRef.current.flowData.length} trades)`)
      return allScanCacheRef.current.flowData
    }
    // 2. Load from DB
    setBiasDataStatus('Loading from database...')
    try {
      const datesResp = await fetch('/api/flows/dates')
      if (!datesResp.ok) throw new Error('No DB dates')
      const dates: { date: string }[] = await datesResp.json()
      if (!dates.length) throw new Error('No saved flow dates')
      const sorted = [...dates].sort((a, b) => b.date.localeCompare(a.date))
      const rowsToLoad = sorted.slice(0, 1).map(d => d.date)
      const payloads = await Promise.all(rowsToLoad.map(async (rawDate) => {
        const r = await fetch(`/api/flows/${encodeURIComponent(rawDate)}`)
        return r.ok ? r.json() : null
      }))
      const combined: OptionsFlowData[] = []
      for (const p of payloads) { if (Array.isArray(p?.data)) for (const t of p.data) combined.push(t) }
      setBiasDataStatus(`Loaded ${combined.length} trades from DB`)
      return combined
    } catch (e) {
      setBiasDataStatus('No cached data — run an ALL scan first')
      return []
    }
  }

  // Auto-run RRG when ALL scan cache is ready
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (shouldAutoScanRRG > 0) runRRGScan() }, [shouldAutoScanRRG])

  // Re-run RRG when expiry filter changes (if data already loaded)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (allScanCacheRef.current?.flowData?.length) runRRGScan() }, [expiryFilter])

  const runRRGScan = async () => {
    setBiasRRGLoading(true); setBiasRRGData(null)
    let trades = await getBiasFlowData()
    if (!trades.length) { setBiasRRGLoading(false); return }
    // Apply ticker filter
    if (rrgTickerMode === 'mag7only') trades = trades.filter(t => MAG7_TICKERS.includes(t.underlying_ticker))
    else if (rrgTickerMode === 'exmag7') trades = trades.filter(t => !MAG7_TICKERS.includes(t.underlying_ticker))
    else if (rrgTickerMode === 'etfonly') trades = trades.filter(t => ETF_SET.has(t.underlying_ticker))
    else if (rrgTickerMode === 'exetf') trades = trades.filter(t => !ETF_SET.has(t.underlying_ticker))
    else if (rrgTickerMode === 'stockonly') trades = trades.filter(t => !MAG7_TICKERS.includes(t.underlying_ticker) && !ETF_SET.has(t.underlying_ticker))
    if (expiryFilter !== 'all') {
      const todayPT = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
      const todayDate = new Date(todayPT)
      const getExp = (t: any): string => t.expiration_date ?? t.expiry ?? ''
      if (expiryFilter === '0dte') {
        const odteDate = new Date(todayDate)
        if ([0, 6].includes(odteDate.getDay())) { do { odteDate.setDate(odteDate.getDate() + 1) } while ([0, 6].includes(odteDate.getDay())) }
        const odteStr = odteDate.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
        trades = trades.filter(t => getExp(t) === odteStr)
      } else if (expiryFilter === 'weekly') {
        trades = trades.filter(t => { const e = getExp(t); if (!e) return false; const d = new Date(e + 'T00:00:00'); return d.getDay() === 5 })
      } else if (expiryFilter === '45d') {
        const cutoff = new Date(todayDate); cutoff.setDate(cutoff.getDate() + 45)
        trades = trades.filter(t => { const e = getExp(t); if (!e) return false; return new Date(e + 'T00:00:00') <= cutoff })
      }
    }
    const aggs = aggregateFlowByTicker(trades)
    const MIN_THRESHOLD = 0.35
    const MIN_PREMIUM = 1_000_000
    const result = { bullCalls: [] as typeof aggs, bearCalls: [] as typeof aggs, bullPuts: [] as typeof aggs, bearPuts: [] as typeof aggs }
    for (const a of aggs) {
      if (a.total < MIN_PREMIUM) continue
      const bc = a.bullCall / a.total, cc = a.bearCall / a.total, bp = a.bullPut / a.total, cp = a.bearPut / a.total
      const max = Math.max(bc, cc, bp, cp)
      if (max < MIN_THRESHOLD) continue
      if (max === bc) result.bullCalls.push(a)
      else if (max === cc) result.bearCalls.push(a)
      else if (max === bp) result.bullPuts.push(a)
      else result.bearPuts.push(a)
    }
    for (const k of Object.keys(result) as (keyof typeof result)[]) result[k].sort((a, b) => b.total - a.total)
    setBiasRRGData(result); setBiasRRGLoading(false)
    setRrgTransform({ tx: 0, ty: 0, k: 1 })
  }

  const runPCGammaScan = async () => {
    setBiasPCLoading(true); setBiasPCData(null)
    const trades = await getBiasFlowData()
    if (!trades.length) { setBiasPCLoading(false); return }
    const aggs = aggregateFlowByTicker(trades)
    const pcRows = aggs
      .filter(a => a.total >= 1_000_000 && a.callPremium > 0)
      .map(a => ({ ...a, pcRatio: a.putPremium / a.callPremium }))
      .filter(a => a.pcRatio > 1.2 || a.pcRatio < 0.45)
      .sort((a, b) => Math.abs(b.pcRatio - 1) - Math.abs(a.pcRatio - 1))
      .slice(0, 30)
    const gammaRows = aggs
      .filter(a => a.total >= 5_000_000)
      .map(a => ({ ...a, netGamma: (a.bullCall + a.bearPut) - (a.bearCall + a.bullPut) }))
      .sort((a, b) => Math.abs(b.netGamma) - Math.abs(a.netGamma))
      .slice(0, 30)
    setBiasPCData({ pc: pcRows as any[], gamma: gammaRows as any[] }); setBiasPCLoading(false)
  }

  const runSupportiveScan = async () => {
    setBiasSupportLoading(true); setBiasSupportData(null)
    const trades = await getBiasFlowData()
    if (!trades.length) { setBiasSupportLoading(false); return }
    const aggs = aggregateFlowByTicker(trades)
    const bull: typeof aggs = [], bear: typeof aggs = []
    for (const a of aggs) {
      if (a.total < 2_000_000) continue
      const bullPct = (a.bullCall + a.bullPut) / a.total
      const bearPct = (a.bearCall + a.bearPut) / a.total
      if (bullPct >= 0.60) bull.push(a)
      else if (bearPct >= 0.60) bear.push(a)
    }
    bull.sort((a, b) => ((b.bullCall + b.bullPut) / b.total) - ((a.bullCall + a.bullPut) / a.total))
    bear.sort((a, b) => ((b.bearCall + b.bearPut) / b.total) - ((a.bearCall + a.bearPut) / a.total))
    setBiasSupportData({ bull, bear }); setBiasSupportLoading(false)
  }

  return (
    <div className="h-full bg-black flex flex-col" style={{ overflow: 'hidden' }}>
      {/* Mobile layout overrides */}
      {isMobile && (
        <style>{`
          .algo-sidebar-inner { display: grid !important; grid-template-columns: 1fr 1fr; width: 100%; }
          .algo-sidebar-inner > div { border-right: 1px solid rgba(255,255,255,0.06) !important; border-bottom: 1px solid rgba(255,255,255,0.06) !important; }
          .algo-sidebar-gauge { grid-column: 1 / -1 !important; }
          .algo-chart-toolbar { flex-wrap: wrap; gap: 4px !important; }
          .algo-chart-toolbar .chart-view-btns { flex-wrap: wrap; }
          .algo-trades-table th, .algo-trades-table td { font-size: 10px !important; padding: 4px 5px !important; white-space: nowrap; }
          .algo-trades-table { font-size: 10px !important; }
          ::-webkit-scrollbar { width: 3px; height: 3px; }
        `}</style>
      )}

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
      {/* HEADER BAR "” hidden in embedded mode */}
      {!embeddedMode && (isMobile ? (
        /* ── MOBILE HEADER ─────────────────────────────────────── */
        <div style={{ background: 'linear-gradient(180deg, #0d0d0d 0%, #060606 100%)', borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
          {/* Row 1: Back + [RRG: RUN SCAN] / [AlgoFlow: input + GO] + FILTER + GO 2 RRG */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px 0', position: 'relative', zIndex: 200 }}>
            {/* Back: exits RRG tab back to algoflow, or calls onBack if on algoflow */}
            {(onBack || activeTab === 'flowbias') && (
              <button
                onClick={() => activeTab === 'flowbias' ? setActiveTab('algoflow') : onBack?.()}
                style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 800, color: '#fff', background: 'linear-gradient(180deg,#1c1c1c 0%,#0a0a0a 60%,#040404 100%)', border: '1px solid rgba(255,255,255,0.18)', borderTop: '1px solid rgba(255,255,255,0.32)', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', flexShrink: 0, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1),inset 0 -1px 0 rgba(0,0,0,0.7)' }}
              >←</button>
            )}
            {/* Center: SCAN + REGIME + GROUPING in RRG mode, or ticker input + GO in algoflow mode */}
            {activeTab === 'flowbias' ? (
              <>
                <button onClick={runRRGScan} disabled={biasRRGLoading}
                  style={{ height: 31, padding: '0 12px', background: 'linear-gradient(180deg,#1c1c1c 0%,#0a0a0a 60%,#040404 100%)', border: '1px solid rgba(255,133,0,0.45)', borderTop: '1px solid rgba(255,133,0,0.7)', borderRadius: 4, cursor: biasRRGLoading ? 'not-allowed' : 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, color: '#ff8500', fontFamily: 'JetBrains Mono,monospace', fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', boxShadow: 'inset 0 1px 0 rgba(255,133,0,0.15),inset 0 -1px 0 rgba(0,0,0,0.7)' }}>
                  {biasRRGLoading
                    ? <span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid #ff8500', borderTopColor: 'transparent', borderRadius: '50%', animation: 'biasSpin 0.7s linear infinite' }} />
                    : 'Scan'}
                </button>
                <button onClick={() => setShowRegime(v => !v)}
                  style={{ height: 31, padding: '0 10px', background: showRegime ? 'linear-gradient(180deg,rgba(167,139,250,0.2),rgba(0,0,0,0.4))' : 'linear-gradient(180deg,#1c1c1c 0%,#0a0a0a 60%,#040404 100%)', border: showRegime ? '1px solid #a78bfa' : '1px solid rgba(255,255,255,0.14)', borderTop: showRegime ? '1px solid #c4b5fd' : '1px solid rgba(255,255,255,0.24)', borderRadius: 4, cursor: 'pointer', flexShrink: 0, color: showRegime ? '#a78bfa' : '#fff', fontFamily: 'JetBrains Mono,monospace', fontSize: 12, fontWeight: 800, boxShadow: showRegime ? '0 0 6px rgba(167,139,250,0.3)' : 'inset 0 1px 0 rgba(255,255,255,0.08),inset 0 -1px 0 rgba(0,0,0,0.7)' }}>
                  REGIME
                </button>
                <button onClick={() => setShowRegimeGrouping(v => !v)}
                  style={{ height: 31, padding: '0 10px', background: showRegimeGrouping ? 'linear-gradient(180deg,rgba(148,163,184,0.2),rgba(0,0,0,0.4))' : 'linear-gradient(180deg,#1c1c1c 0%,#0a0a0a 60%,#040404 100%)', border: showRegimeGrouping ? '1px solid #94a3b8' : '1px solid rgba(255,255,255,0.14)', borderTop: showRegimeGrouping ? '1px solid #cbd5e1' : '1px solid rgba(255,255,255,0.24)', borderRadius: 4, cursor: 'pointer', flexShrink: 0, color: showRegimeGrouping ? '#94a3b8' : '#fff', fontFamily: 'JetBrains Mono,monospace', fontSize: 12, fontWeight: 800, boxShadow: showRegimeGrouping ? '0 0 6px rgba(148,163,184,0.3)' : 'inset 0 1px 0 rgba(255,255,255,0.08),inset 0 -1px 0 rgba(0,0,0,0.7)' }}>
                  GROUP
                </button>
              </>
            ) : (
              <>
                <input type="text" value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} onKeyPress={handleKeyPress} placeholder="TICKER" disabled={loading}
                  style={{ width: 94, flexShrink: 0, height: 31, padding: '0 7px', background: 'linear-gradient(180deg,#111,#080808)', border: '1px solid rgba(255,255,255,0.2)', borderTop: '1px solid rgba(255,255,255,0.3)', color: '#fff', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', outline: 'none', borderRadius: 4, boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8)' }} />
                {/* GO: candy black with orange arrow */}
                <button onClick={handleSearch} disabled={loading || isAnalyzing || !ticker.trim()}
                  style={{ height: 31, width: 31, background: 'linear-gradient(180deg,#1c1c1c 0%,#0a0a0a 60%,#040404 100%)', border: '1px solid rgba(255,133,0,0.45)', borderTop: '1px solid rgba(255,133,0,0.7)', borderRadius: 4, cursor: (loading || isAnalyzing || !ticker.trim()) ? 'not-allowed' : 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 1px 0 rgba(255,133,0,0.15),inset 0 -1px 0 rgba(0,0,0,0.7)' }}>
                  {(loading || isAnalyzing)
                    ? <span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid #ff8500', borderTopColor: 'transparent', borderRadius: '50%', animation: 'biasSpin 0.7s linear infinite' }} />
                    : <svg width="10" height="10" viewBox="0 0 10 10"><polygon points="2,1 9,5 2,9" fill="#ff8500" /></svg>}
                </button>
              </>
            )}
            {/* GO 2 RRG — only visible when NOT already in RRG */}
            {activeTab !== 'flowbias' && (
              <button
                onClick={() => setActiveTab('flowbias')}
                style={{ height: 29, padding: '0 11px', background: 'linear-gradient(180deg,#1c1c1c 0%,#0a0a0a 60%,#040404 100%)', border: '1px solid rgba(255,255,255,0.14)', borderTop: '1px solid rgba(255,255,255,0.24)', borderRadius: 4, fontSize: 12, fontWeight: 800, color: '#22c55e', cursor: 'pointer', fontFamily: 'JetBrains Mono,monospace', flexShrink: 0, whiteSpace: 'nowrap', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08),inset 0 -1px 0 rgba(0,0,0,0.7)' }}
              >GO 2 RRG</button>
            )}
            {/* SECTORS popup */}
            {sectorPopupOpen && <div onClick={() => setSectorPopupOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 298 }} />}
            <button
              onClick={() => setSectorPopupOpen(o => !o)}
              style={{ height: 29, padding: '0 11px', background: sectorFilter ? 'linear-gradient(180deg,rgba(52,211,153,0.2),rgba(0,0,0,0.4))' : 'linear-gradient(180deg,#1c1c1c 0%,#0a0a0a 60%,#040404 100%)', border: sectorFilter ? '1px solid #34d399' : '1px solid rgba(255,255,255,0.14)', borderTop: sectorFilter ? '1px solid #5cf0b8' : '1px solid rgba(255,255,255,0.24)', borderRadius: 4, fontSize: 12, fontWeight: 800, color: sectorFilter ? '#34d399' : '#fff', cursor: 'pointer', fontFamily: 'JetBrains Mono,monospace', flexShrink: 0, whiteSpace: 'nowrap', boxShadow: sectorFilter ? '0 0 6px rgba(52,211,153,0.3)' : 'inset 0 1px 0 rgba(255,255,255,0.08),inset 0 -1px 0 rgba(0,0,0,0.7)' }}
            >{sectorFilter ? sectorFilter : 'SECTORS'} {sectorPopupOpen ? '▲' : '▾'}</button>
            {sectorPopupOpen && (
              <div style={{ position: 'fixed', top: 42, left: 8, background: 'linear-gradient(180deg,#0d1420 0%,#060810 100%)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '6px 0', width: 180, zIndex: 999, boxShadow: '0 16px 48px rgba(0,0,0,0.95)', maxHeight: '70vh', overflowY: 'auto' }}>
                <div style={{ padding: '4px 12px 3px', fontFamily: 'JetBrains Mono,monospace', fontSize: 10, color: '#34d399', letterSpacing: '0.2em', fontWeight: 800 }}>SECTORS</div>
                {SECTORS.map(({ etf, label }) => {
                  const active = sectorFilter === etf
                  return <div key={etf} onClick={() => handleSectorSelect(etf)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', cursor: 'pointer', background: active ? 'rgba(52,211,153,0.1)' : 'transparent' }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, border: `2px solid ${active ? '#34d399' : 'rgba(255,255,255,0.3)'}`, background: active ? '#34d399' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{active && <span style={{ color: '#000', fontSize: 8, fontWeight: 900 }}>✓</span>}</div>
                    <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 10, fontWeight: 700, color: active ? '#34d399' : '#fff' }}>{etf} <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>{label}</span></span>
                  </div>
                })}
                <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '4px 0' }} />
                <div style={{ padding: '4px 12px 3px', fontFamily: 'JetBrains Mono,monospace', fontSize: 10, color: '#a78bfa', letterSpacing: '0.2em', fontWeight: 800 }}>INDUSTRIES</div>
                {INDUSTRIES.map(({ etf, label }) => {
                  const active = sectorFilter === etf
                  return <div key={etf} onClick={() => handleSectorSelect(etf)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', cursor: 'pointer', background: active ? 'rgba(167,139,250,0.1)' : 'transparent' }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, border: `2px solid ${active ? '#a78bfa' : 'rgba(255,255,255,0.3)'}`, background: active ? '#a78bfa' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{active && <span style={{ color: '#fff', fontSize: 8, fontWeight: 900 }}>✓</span>}</div>
                    <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 10, fontWeight: 700, color: active ? '#a78bfa' : '#fff' }}>{etf} <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9 }}>{label}</span></span>
                  </div>
                })}
                {sectorFilter && (
                  <>
                    <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '4px 0' }} />
                    <div onClick={() => { setSectorFilter(null); setSectorPopupOpen(false); if (allScanCacheRef.current) { setFlowData(allScanCacheRef.current.flowData); setAnalysis(allScanCacheRef.current.analysis) } }} style={{ padding: '6px 12px', cursor: 'pointer', fontFamily: 'JetBrains Mono,monospace', fontSize: 10, fontWeight: 700, color: '#ef4444' }}>✕ CLEAR SECTOR</div>
                  </>
                )}
              </div>
            )}
            {/* FILTER popup — consolidates TICKER + TIME + UNIQUENESS */}
            {rrgDropdownOpen === 'filter' && <div onClick={() => setRrgDropdownOpen(null)} style={{ position: 'fixed', inset: 0, zIndex: 298 }} />}
            <div style={{ position: 'relative', zIndex: rrgDropdownOpen === 'filter' ? 300 : 99, flexShrink: 0, marginLeft: 'auto' }}>
              {(() => {
                const anyActive = rrgTickerMode !== 'all' || expiryFilter !== 'all'
                return (
                  <>
                    <button
                      onClick={() => setRrgDropdownOpen(o => o === 'filter' ? null : 'filter')}
                      style={{ height: 29, padding: '0 11px', background: anyActive ? 'linear-gradient(180deg,rgba(255,133,0,0.2),rgba(0,0,0,0.4))' : 'linear-gradient(180deg,#1c1c1c 0%,#0a0a0a 60%,#040404 100%)', border: anyActive ? '1px solid #ff8500' : '1px solid rgba(255,255,255,0.14)', borderTop: anyActive ? '1px solid rgba(255,133,0,0.7)' : '1px solid rgba(255,255,255,0.24)', borderRadius: 4, fontSize: 12, fontWeight: 800, color: anyActive ? '#ff8500' : '#fff', cursor: 'pointer', fontFamily: 'JetBrains Mono,monospace', whiteSpace: 'nowrap', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08),inset 0 -1px 0 rgba(0,0,0,0.7)' }}
                    >FILTER {rrgDropdownOpen === 'filter' ? '▲' : '▾'}</button>
                    {rrgDropdownOpen === 'filter' && (
                      <div style={{ position: 'fixed', top: 38, right: 8, background: 'linear-gradient(180deg,#141428 0%,#080812 100%)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '6px 0', width: 170, zIndex: 999, boxShadow: '0 16px 48px rgba(0,0,0,0.95)' }}>
                        <div style={{ padding: '4px 12px 2px', fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#ff8500', letterSpacing: '0.2em', fontWeight: 800 }}>TICKER</div>
                        {([{ id: 'mag7only', label: 'MAG7 ONLY' }, { id: 'exmag7', label: 'EXCL MAG7' }, { id: 'etfonly', label: 'ETF ONLY' }, { id: 'exetf', label: 'EXCL ETF' }, { id: 'stockonly', label: 'STOCKS ONLY' }] as const).map(item => {
                          const active = rrgTickerMode === item.id
                          return <div key={item.id} onClick={() => { setRrgTickerMode(active ? 'all' : item.id); setRrgDropdownOpen(null) }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer', background: active ? 'rgba(255,133,0,0.1)' : 'transparent' }}>
                            <div style={{ width: 13, height: 13, borderRadius: 3, border: `2px solid ${active ? '#ff8500' : 'rgba(255,255,255,0.3)'}`, background: active ? '#ff8500' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{active && <span style={{ color: '#000', fontSize: 9, fontWeight: 900 }}>✓</span>}</div>
                            <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, fontWeight: 700, color: active ? '#ff8500' : '#fff' }}>{item.label}</span>
                          </div>
                        })}
                        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '4px 0' }} />
                        <div style={{ padding: '4px 12px 2px', fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#facc15', letterSpacing: '0.2em', fontWeight: 800 }}>EXPIRY</div>
                        {([{ id: '45d', label: '45D OUT' }, { id: 'weekly', label: 'WEEKLIES' }, { id: '0dte', label: '0DTE' }] as const).map(item => {
                          const active = expiryFilter === item.id
                          return <div key={item.id} onClick={() => { setExpiryFilter(active ? 'all' : item.id); setRrgDropdownOpen(null) }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer', background: active ? 'rgba(250,204,21,0.1)' : 'transparent' }}>
                            <div style={{ width: 13, height: 13, borderRadius: 3, border: `2px solid ${active ? '#facc15' : 'rgba(255,255,255,0.3)'}`, background: active ? '#facc15' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{active && <span style={{ color: '#000', fontSize: 9, fontWeight: 900 }}>✓</span>}</div>
                            <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, fontWeight: 700, color: active ? '#facc15' : '#fff' }}>{item.label}</span>
                          </div>
                        })}


                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          </div>

          {/* Row 2: Ticker + Timeframe + Analyze "” hidden on mobile (use filter pills in Row 3) */}
          {!isMobile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 14px 4px' }}>
              <input
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                onKeyPress={handleKeyPress}
                placeholder="TICKER"
                disabled={loading}
                style={{ flex: 1, minWidth: 0, height: 38, padding: '0 10px', background: '#111', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 700, letterSpacing: '0.1em', outline: 'none', borderRadius: 4 }}
              />
              <select
                value={scanTimeframe}
                onChange={(e) => setScanTimeframe(e.target.value)}
                disabled={loading}
                style={{ height: 38, padding: '0 6px', background: '#111', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 700, outline: 'none', borderRadius: 4, flexShrink: 0 }}
              >
                <option value="1D">TODAY</option>
                <option value="2">2D</option>
                <option value="3">3D</option>
                <option value="4">4D</option>
                <option value="5">5D</option>
                <option value="7">7D</option>
                <option value="10">10D</option>
                <option value="14">14D</option>
                <option value="20">20D</option>
                <option value="30">30D</option>
                <option value="45">45D</option>
                <option value="60">60D</option>
                <option value="90">90D</option>
              </select>
              <button
                onClick={handleSearch}
                disabled={loading || isAnalyzing || !ticker.trim()}
                style={{ height: 38, padding: '0 16px', background: (loading || isAnalyzing) ? '#333' : 'linear-gradient(135deg, #ff8500, #ff6000)', color: (loading || isAnalyzing) ? '#fff' : '#000', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', border: 'none', borderRadius: 4, cursor: (loading || isAnalyzing || !ticker.trim()) ? 'not-allowed' : 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, opacity: (!ticker.trim() || loading || isAnalyzing) ? 0.7 : 1 }}
              >
                {isAnalyzing ? (
                  <><div style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid #22d3ee', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />ANALYZING</>
                ) : loading ? 'SCANNING...' : 'ANALYZE'}
              </button>
            </div>
          )}

          {/* Row 3: Filter pills — desktop only on mobile, mobile has everything in Row 1 */}
          {!isMobile ? (
            <div style={{ padding: '6px 14px 8px', display: 'flex', gap: 8, position: 'relative' }}>
              {rrgDropdownOpen && <div onClick={() => setRrgDropdownOpen(null)} style={{ position: 'fixed', inset: 0, zIndex: 98 }} />}
              {/* 1. TICKER FILTER — desktop only (mobile has it in Row 1) */}
              {!isMobile && (() => {
                const isActive = rrgTickerMode !== 'all'
                const items: { id: 'mag7only' | 'exmag7' | 'etfonly' | 'exetf' | 'stockonly', label: string }[] = [
                  { id: 'mag7only', label: 'MAG7 ONLY' }, { id: 'exmag7', label: 'EXCLUDE MAG7' },
                  { id: 'etfonly', label: 'ETF ONLY' }, { id: 'exetf', label: 'EXCLUDE ETF' }, { id: 'stockonly', label: 'STOCKS ONLY' },
                ]
                return (
                  <div style={{ position: 'relative', zIndex: rrgDropdownOpen === 'ticker' ? 200 : 99 }}>
                    <button onClick={() => setRrgDropdownOpen(o => o === 'ticker' ? null : 'ticker')} style={{ height: 28, padding: '0 11px', background: isActive ? 'rgba(255,133,0,0.15)' : 'linear-gradient(180deg,rgba(255,255,255,0.1),rgba(0,0,0,0.4))', border: isActive ? '1px solid #ff8500' : '1px solid #555', borderRadius: 20, fontSize: 11, fontWeight: 800, color: isActive ? '#ff8500' : '#fff', cursor: 'pointer', letterSpacing: '0.5px', fontFamily: 'JetBrains Mono,monospace', whiteSpace: 'nowrap', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)' }}>TICKER {rrgDropdownOpen === 'ticker' ? '▲' : '▾'}
                    </button>
                    {rrgDropdownOpen === 'ticker' && (
                      <div style={{ position: 'absolute', top: 'calc(100% + 5px)', left: 0, background: 'linear-gradient(180deg,#141428 0%,#080812 100%)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: 5, width: 'max-content', zIndex: 999, boxShadow: '0 16px 48px rgba(0,0,0,0.95),inset 0 1px 0 rgba(255,255,255,0.08)' }}>{items.map(item => {
                        const active = rrgTickerMode === item.id; return (
                          <div key={item.id} onClick={() => { setRrgTickerMode(active ? 'all' : item.id); setRrgDropdownOpen(null) }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 7, cursor: 'pointer', background: active ? 'rgba(255,133,0,0.12)' : 'transparent' }}>
                            <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${active ? '#a78bfa' : 'rgba(255,255,255,0.3)'}`, background: active ? '#a78bfa' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{active && <span style={{ color: '#fff', fontSize: 11, fontWeight: 900 }}>✓</span>}</div>
                            <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, fontWeight: 700, color: active ? '#a78bfa' : '#fff' }}>{item.label}</span>
                          </div>
                        )
                      })}
                      </div>
                    )}
                  </div>
                )
              })()}
              {/* 2. TIME FILTER — desktop only */}
              {!isMobile && (() => {
                const isActive = expiryFilter !== 'all'
                const items = [{ id: '45d' as const, label: '45D OUT' }, { id: 'weekly' as const, label: 'WEEKLIES' }, { id: '0dte' as const, label: '0DTE' }]
                return (
                  <div style={{ position: 'relative', zIndex: rrgDropdownOpen === 'time' ? 200 : 99 }}>
                    <button onClick={() => setRrgDropdownOpen(o => o === 'time' ? null : 'time')} style={{ height: 28, padding: '0 11px', background: isActive ? 'rgba(255,133,0,0.15)' : 'linear-gradient(180deg,rgba(255,255,255,0.1),rgba(0,0,0,0.4))', border: isActive ? '1px solid #ff8500' : '1px solid #555', borderRadius: 20, fontSize: 11, fontWeight: 800, color: isActive ? '#ff8500' : '#fff', cursor: 'pointer', letterSpacing: '0.5px', fontFamily: 'JetBrains Mono,monospace', whiteSpace: 'nowrap', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)' }}>
                      TIME {rrgDropdownOpen === 'time' ? '▲' : '▾'}
                    </button>
                    {rrgDropdownOpen === 'time' && (
                      <div style={{ position: 'absolute', top: 'calc(100% + 5px)', left: 0, background: 'linear-gradient(180deg,#141428 0%,#080812 100%)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: 5, width: 'max-content', zIndex: 999, boxShadow: '0 16px 48px rgba(0,0,0,0.95),inset 0 1px 0 rgba(255,255,255,0.08)' }}>
                        {items.map(item => {
                          const active = expiryFilter === item.id; return (
                            <div key={item.id} onClick={() => { setExpiryFilter(active ? 'all' : item.id); setRrgDropdownOpen(null) }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 7, cursor: 'pointer', background: active ? 'rgba(250,204,21,0.12)' : 'transparent' }}>
                              <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${active ? '#facc15' : 'rgba(255,255,255,0.3)'}`, background: active ? '#facc15' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{active && <span style={{ color: '#000', fontSize: 11, fontWeight: 900 }}>✓</span>}</div>
                              <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, fontWeight: 700, color: active ? '#facc15' : '#fff' }}>{item.label}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* RRG button — desktop only in Row 3, mobile has it in Row 1 */}
              {!isMobile && (
                <button
                  onClick={() => setActiveTab(activeTab === 'flowbias' ? 'algoflow' : 'flowbias')}
                  style={{ height: 28, padding: '0 11px', background: activeTab === 'flowbias' ? 'linear-gradient(180deg,rgba(124,58,237,0.3),rgba(0,0,0,0.4))' : 'linear-gradient(180deg,rgba(255,255,255,0.1),rgba(0,0,0,0.4))', border: activeTab === 'flowbias' ? '1px solid #7c3aed' : '1px solid #555', borderRadius: 20, fontSize: 11, fontWeight: 800, color: activeTab === 'flowbias' ? '#a78bfa' : '#fff', cursor: 'pointer', letterSpacing: '0.5px', fontFamily: 'JetBrains Mono,monospace', whiteSpace: 'nowrap', boxShadow: activeTab === 'flowbias' ? '0 0 8px rgba(124,58,237,0.3)' : 'inset 0 1px 0 rgba(255,255,255,0.07)', flexShrink: 0 }}
                >
                  RRG
                </button>
              )}
            </div>
          ) : null}
        </div>
      ) : (
        /* -- DESKTOP HEADER -- */
        <div style={{
          background: 'linear-gradient(180deg, #111 0%, #080808 100%)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          padding: '7px 16px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'nowrap',
          overflowX: 'auto',
        }}>
          {/* Candy-black 3D glossy button style helper */}
          <style>{`
            .af-btn {
              height: 32px;
              padding: 0 14px;
              background: linear-gradient(180deg, #1c1c1c 0%, #0a0a0a 60%, #040404 100%);
              border: 1px solid rgba(255,255,255,0.14);
              border-top: 1px solid rgba(255,255,255,0.28);
              border-radius: 6px;
              box-shadow: inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 0 rgba(0,0,0,0.7), 0 2px 4px rgba(0,0,0,0.9);
              font-family: JetBrains Mono, monospace;
              font-size: 14px;
              font-weight: 800;
              letter-spacing: 1px;
              color: #fff;
              cursor: pointer;
              white-space: nowrap;
              transition: color 0.12s;
              outline: none;
              flex-shrink: 0;
            }
            .af-btn:hover { color: #ff8500; }
            .af-btn.af-active-orange,.af-btn.af-active-yellow,.af-btn.af-active-purple,.af-btn.af-active-green,.af-btn.af-active-blue,.af-btn.af-active-violet,.af-btn.af-active-lime,.af-btn.af-active-emerald { color: #ff8500; }
            .af-tab { height: 32px; padding: 0 14px; background: transparent; border: 1px solid transparent; border-radius: 6px; font-family: JetBrains Mono,monospace; font-size: 14px; font-weight: 800; letter-spacing: 1px; cursor: pointer; white-space: nowrap; transition: all 0.12s; flex-shrink: 0; }
            .af-sep { width: 1px; height: 24px; background: rgba(255,255,255,0.1); flex-shrink: 0; margin: 0 2px; }
          `}</style>

          {/* BACK */}
          {onBack && (
            <button className="af-btn" onClick={onBack}>← BACK</button>
          )}

          <div className="af-sep" />

          {/* Expiry filters */}
          <button className={`af-btn${expiryFilter === '45d' ? ' af-active-yellow' : ''}`} onClick={() => setExpiryFilter(expiryFilter === '45d' ? 'all' : '45d')} title="Contracts expiring within 45 days">45D</button>
          <button className={`af-btn${expiryFilter === 'weekly' ? ' af-active-yellow' : ''}`} onClick={() => setExpiryFilter(expiryFilter === 'weekly' ? 'all' : 'weekly')} title="This-week expiries only">WEEKLIES</button>
          <button className={`af-btn${expiryFilter === '0dte' ? ' af-active-purple' : ''}`} onClick={() => setExpiryFilter(expiryFilter === '0dte' ? 'all' : '0dte')} title="0DTE only">0DTE</button>

          <div className="af-sep" />

          {/* Exclusion filters */}
          <button className={`af-btn${excludeMag7 ? ' af-active-orange' : ''}`} onClick={() => { setExcludeMag7(v => !v); setExcludeEtf(false) }} title="Exclude MAG7">EXCL MAG7</button>
          <button className={`af-btn${excludeEtf ? ' af-active-green' : ''}`} onClick={() => { setExcludeEtf(v => !v); setExcludeMag7(false) }} title="Exclude ETFs">EXCL ETFs</button>
          <button className={`af-btn${excludeIndex ? ' af-active-violet' : ''}`} onClick={() => setExcludeIndex((v: boolean) => !v)} title="Exclude SPX/NDX/RUT/VIX etc.">EXCL INDEX</button>
          <button className={`af-btn${excludeMag7 && excludeEtf ? ' af-active-blue' : ''}`} onClick={() => { const both = excludeMag7 && excludeEtf; setExcludeMag7(!both); setExcludeEtf(!both) }} title="Stocks only">STOCKS ONLY</button>

          <div className="af-sep" />

          {/* REGIME + GROUPING toggles */}
          <button className={`af-btn${showRegime ? ' af-active-violet' : ''}`} onClick={() => setShowRegime(v => !v)} title="Show regime circles on Flow Matrix">REGIME</button>
          <button className={`af-btn${showRegimeGrouping ? ' af-active-blue' : ''}`} onClick={() => setShowRegimeGrouping(v => !v)} title="Show grouping ellipses on Flow Matrix">GROUPING</button>

          <div className="af-sep" />

          {/* Chart overlays — single ticker only */}
          {analysis && !isAllScan && (<>
            <button className={`af-btn${showGammaLine ? ' af-active-orange' : ''}`} onClick={() => setShowGammaLine(v => !v)} title="Cumulative gamma from flow">GAMMA</button>
            <button className={`af-btn${showBullBear ? ' af-active-violet' : ''}`} onClick={() => setShowBullBear(v => !v)} title="Bull/Bear ratio">BULL/BEAR</button>
            <div className="af-sep" />
          </>)}

          {/* ALL TICKERS */}
          <button className={`af-btn${ticker === 'ALL' ? ' af-active-orange' : ''}`}
            onClick={() => { setSearchTicker('ALL'); setIsAllScan(true); fetchTickerFlow('ALL') }}
            disabled={loading} title="Scan all tickers">ALL TICKERS</button>

          {/* SECTORS */}
          {sectorPopupOpen && <div onClick={() => setSectorPopupOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 398 }} />}
          <div style={{ position: 'relative', zIndex: sectorPopupOpen ? 400 : undefined, flexShrink: 0 }}>
            <button className={`af-btn${sectorFilter ? ' af-active-green' : ''}`}
              onClick={() => setSectorPopupOpen(o => !o)}
              title="Filter by sector or industry ETF">
              {sectorFilter ? sectorFilter : 'SECTORS'} {sectorPopupOpen ? '▲' : '▾'}
            </button>
            {sectorPopupOpen && (
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, background: 'linear-gradient(180deg,#0d1420 0%,#060810 100%)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '6px 0', width: 220, zIndex: 999, boxShadow: '0 16px 48px rgba(0,0,0,0.95)', maxHeight: '70vh', overflowY: 'auto' }}>
                <div style={{ padding: '5px 14px 3px', fontFamily: 'JetBrains Mono,monospace', fontSize: 10, color: '#34d399', letterSpacing: '0.2em', fontWeight: 800 }}>SECTORS</div>
                {SECTORS.map(({ etf, label }) => {
                  const active = sectorFilter === etf
                  return <div key={etf} onClick={() => handleSectorSelect(etf)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', cursor: 'pointer', background: active ? 'rgba(52,211,153,0.1)' : 'transparent' }}>
                    <div style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${active ? '#34d399' : 'rgba(255,255,255,0.3)'}`, background: active ? '#34d399' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{active && <span style={{ color: '#000', fontSize: 10, fontWeight: 900 }}>✓</span>}</div>
                    <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 12, fontWeight: 700, color: active ? '#34d399' : '#fff' }}>{etf} <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{label}</span></span>
                  </div>
                })}
                <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '4px 0' }} />
                <div style={{ padding: '5px 14px 3px', fontFamily: 'JetBrains Mono,monospace', fontSize: 10, color: '#a78bfa', letterSpacing: '0.2em', fontWeight: 800 }}>INDUSTRIES</div>
                {INDUSTRIES.map(({ etf, label }) => {
                  const active = sectorFilter === etf
                  return <div key={etf} onClick={() => handleSectorSelect(etf)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', cursor: 'pointer', background: active ? 'rgba(167,139,250,0.1)' : 'transparent' }}>
                    <div style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${active ? '#a78bfa' : 'rgba(255,255,255,0.3)'}`, background: active ? '#a78bfa' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{active && <span style={{ color: '#fff', fontSize: 10, fontWeight: 900 }}>✓</span>}</div>
                    <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 12, fontWeight: 700, color: active ? '#a78bfa' : '#fff' }}>{etf} <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{label}</span></span>
                  </div>
                })}
                {sectorFilter && (
                  <>
                    <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '4px 0' }} />
                    <div onClick={() => { setSectorFilter(null); setSectorPopupOpen(false); if (allScanCacheRef.current) { setFlowData(allScanCacheRef.current.flowData); setAnalysis(allScanCacheRef.current.analysis) } }} style={{ padding: '8px 14px', cursor: 'pointer', fontFamily: 'JetBrains Mono,monospace', fontSize: 12, fontWeight: 700, color: '#ef4444' }}>✕ CLEAR SECTOR</div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ALL TICKERS LIVE */}
          <button className={`af-btn${isAlgoLive && algoLiveTicker === 'ALL' ? ' af-active-emerald' : ''}`}
            onClick={() => isAlgoLive && algoLiveTicker === 'ALL' ? stopAlgoLive() : startAlgoLive('ALL')}
            title={isAlgoLive && algoLiveTicker === 'ALL' ? 'Stop live stream' : 'Stream all options live'}>
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: isAlgoLive && algoLiveTicker === 'ALL' ? '#22c55e' : '#555', marginRight: 5, boxShadow: isAlgoLive && algoLiveTicker === 'ALL' ? '0 0 5px #22c55e' : 'none' }} />
            {isAlgoLive && algoLiveTicker === 'ALL' ? 'STOP ALL LIVE' : '● ALL TICKERS LIVE'}
          </button>

          <div className="af-sep" />

          {/* Ticker input */}
          <input type="text" value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} onKeyPress={handleKeyPress} placeholder="TICKER"
            disabled={loading}
            style={{ height: 32, width: 110, padding: '0 10px', background: 'linear-gradient(180deg,#111 0%,#080808 100%)', border: '1px solid rgba(255,255,255,0.2)', borderTop: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, color: '#fff', fontFamily: 'JetBrains Mono,monospace', fontSize: 14, fontWeight: 700, letterSpacing: '0.12em', outline: 'none', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8)', flexShrink: 0 }} />

          {/* Timeframe select */}
          <select value={scanTimeframe} onChange={e => setScanTimeframe(e.target.value)} disabled={loading}
            style={{ height: 32, padding: '0 8px', background: 'linear-gradient(180deg,#1c1c1c 0%,#0a0a0a 100%)', border: '1px solid rgba(255,255,255,0.14)', borderTop: '1px solid rgba(255,255,255,0.28)', borderRadius: 6, color: '#ccc', fontFamily: 'JetBrains Mono,monospace', fontSize: 14, fontWeight: 700, outline: 'none', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06),inset 0 -1px 0 rgba(0,0,0,0.6)', flexShrink: 0 }}>
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

          {/* SCAN */}
          <button onClick={handleSearch} disabled={loading || isAnalyzing || !ticker.trim()}
            style={{ height: 32, padding: '0 18px', background: 'linear-gradient(180deg,#1c1c1c 0%,#0a0a0a 60%,#040404 100%)', border: '1px solid rgba(255,255,255,0.14)', borderTop: '1px solid rgba(255,255,255,0.28)', borderRadius: 6, color: loading || isAnalyzing ? '#555' : '#ff8500', fontFamily: 'JetBrains Mono,monospace', fontSize: 15, fontWeight: 800, letterSpacing: '1.5px', cursor: loading || isAnalyzing || !ticker.trim() ? 'not-allowed' : 'pointer', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10),inset 0 -1px 0 rgba(0,0,0,0.7),0 2px 4px rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap', flexShrink: 0, opacity: !ticker.trim() || loading || isAnalyzing ? 0.6 : 1 }}>
            {isAnalyzing ? (<><div className="animate-spin" style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid #ff8500', borderTopColor: 'transparent' }} />SCANNING {flowData.length.toLocaleString()}</>) : loading ? 'SCANNING...' : 'SCAN'}
          </button>

          {/* Per-ticker LIVE */}
          {ticker.trim() && ticker !== 'ALL' && (
            <button className={`af-btn${isAlgoLive && algoLiveTicker === ticker.trim().toUpperCase() ? ' af-active-emerald' : ''}`}
              onClick={() => isAlgoLive && algoLiveTicker === ticker.trim().toUpperCase() ? stopAlgoLive() : startAlgoLive(ticker.trim())}
              title={`Stream ${ticker} options live`}>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: isAlgoLive && algoLiveTicker === ticker.trim().toUpperCase() ? '#22c55e' : '#555', marginRight: 5 }} />
              {isAlgoLive && algoLiveTicker === ticker.trim().toUpperCase() ? `STOP · ${algoLiveTradeCount}` : 'LIVE'}
            </button>
          )}

          {/* Status / error */}
          {streamStatus && <span style={{ color: '#22d3ee', fontFamily: 'JetBrains Mono,monospace', fontSize: 11, letterSpacing: '0.1em', flexShrink: 0 }}>{streamStatus}</span>}
          {error && <span style={{ color: '#ef4444', fontFamily: 'JetBrains Mono,monospace', fontSize: 11, flexShrink: 0 }}>{error}</span>}
          {isAlgoLive && <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: algoLiveConnected ? '#22c55e' : '#facc15', flexShrink: 0 }}>{algoLiveConnected ? '● LIVE' : '○ CONNECTING'}</span>}

          <OptionsFlowScene visible={isAllScan && overlayActive} selectedTicker="ALL" streamingStatus={streamStatus} />
        </div>
      ))} {/* end header */}

      {/* Main content: flex row — left scrollable content | right RRG panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', minHeight: 0, overflow: 'hidden', alignItems: 'stretch' }}>

        {/* LEFT: scrollable content — hidden on mobile when RRG tab is active */}
        <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: isMobile ? '8px 10px 80px' : '12px 20px 20px', flex: 1, minWidth: 0, display: (isMobile && activeTab === 'flowbias') ? 'none' : undefined }}>

          {/* Drill-down re-analysis overlay */}
          {isAnalyzing && drilledTicker && analysis && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
                <div className="animate-spin" style={{ width: 48, height: 48, borderRadius: '50%', border: '4px solid rgba(255,133,0,0.25)', borderTopColor: '#ff8500' }} />
                <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 22, fontWeight: 900, color: '#ff8500', letterSpacing: '0.15em' }}>ANALYZING {drilledTicker}</div>
                <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 13, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em' }}>{flowData.length} TRADES</div>
              </div>
            </div>
          )}

          {/* Main analysis layout — RRG stretches full height alongside scrollable left */}
          {analysis && (
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 0 }}>
              {/* LEFT: scrollable chart + table */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                {/* ── ROW 2: METRICS + CHART SIDE BY SIDE (stacked on mobile) ── */}
                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.15)' }}>

                  {/* LEFT: Stats sidebar */}
                  <div className="algo-sidebar-inner" style={{
                    display: isMobile ? 'grid' : 'flex',
                    gridTemplateColumns: isMobile ? '1fr 1fr' : undefined,
                    flexDirection: isMobile ? undefined : 'column',
                    background: 'linear-gradient(170deg, rgba(12,12,22,0.98) 0%, rgba(6,6,14,0.99) 60%, rgba(8,8,18,0.98) 100%)',
                    boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.04), inset 0 0 40px rgba(0,0,0,0.6)',
                  }}>
                    {/* AlgoFlow gauge */}
                    <div className="algo-sidebar-gauge" style={{
                      gridColumn: isMobile ? '1 / -1' : undefined,
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
                        bullCall={displayAnalysis?.bullCallPremium ?? 0}
                        bearCall={displayAnalysis?.bearCallPremium ?? 0}
                        bullPut={displayAnalysis?.bullPutPremium ?? 0}
                        bearPut={displayAnalysis?.bearPutPremium ?? 0}
                        score={displayAnalysis?.algoFlowScore ?? 0}
                        label="ALGOFLOW SCORE"
                      />
                    </div>

                    {/* P/C + Execution "” compact single row on mobile, full panels on desktop */}
                    {/* P/C + Execution — desktop only, removed from mobile */}
                    {null /* DEBUG: B/B row removed for mobile */}
                    {!isMobile && (
                      <>
                        {/* P/C calls/puts bars */}
                        <div style={{
                          padding: '10px 14px',
                          borderBottom: '1px solid rgba(255,255,255,0.06)',
                          background: 'linear-gradient(180deg, rgba(255,255,255,0.018) 0%, transparent 100%)',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
                            <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#ffffff', letterSpacing: '0.22em', fontWeight: 700 }}>BULL/BEAR RATIO</div>
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
                      </>
                    )}

                    {/* Stacked metrics "” desktop only */}
                    {!isMobile && [{ label: 'CALLS PREM', value: formatCurrency(displayAnalysis?.totalCallPremium ?? 0), color: '#10b981', glow: 'rgba(16,185,129,0.35)', bg: 'rgba(16,185,129,0.04)' },
                    { label: 'PUTS PREM', value: formatCurrency(displayAnalysis?.totalPutPremium ?? 0), color: '#ef4444', glow: 'rgba(239,68,68,0.35)', bg: 'rgba(239,68,68,0.04)' },
                    { label: 'NET FLOW', value: formatCurrency(analysis.netFlow), color: analysis.netFlow >= 0 ? '#10b981' : '#ef4444', glow: analysis.netFlow >= 0 ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)', bg: analysis.netFlow >= 0 ? 'rgba(16,185,129,0.04)' : 'rgba(239,68,68,0.04)' },
                    { label: 'BULL/BEAR', value: analysis.callPutRatio.toFixed(2), color: '#e2e8f0', glow: 'rgba(255,255,255,0.15)', bg: 'transparent' },
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

                  {/* RIGHT: Chart — fills remaining left column */}
                  <div style={{ flex: isMobile ? 'none' : 1, minWidth: 0, width: isMobile ? '100%' : undefined }}>
                    {/* Chart toolbar "” desktop only; mobile controls overlaid inside chart */}
                    <div className="algo-chart-toolbar" style={{ padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: isMobile ? 'none' : 'flex', alignItems: 'center', position: 'relative', minHeight: 36, gap: 0 }}>
                      {/* LEFT: ticker + FLOW + timeframe buttons */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        {drilledTicker && (
                          <button
                            onClick={() => {
                              if (!allScanCacheRef.current) return
                              setDrilledTicker(null)
                              setSearchTicker('ALL')
                              setFlowData(allScanCacheRef.current.flowData)
                              setAnalysis(allScanCacheRef.current.analysis)
                            }}
                            style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', padding: '2px 10px', background: 'rgba(255,133,0,0.15)', border: '1px solid #ff8500', color: '#ff8500', cursor: 'pointer', borderRadius: 3, marginRight: 6 }}
                          >← ALL</button>
                        )}
                        <span style={{ color: '#fff', fontFamily: 'JetBrains Mono,monospace', fontSize: isMobile ? 14 : 21, fontWeight: 900, letterSpacing: '0.1em', marginRight: 2 }}>{analysis.ticker}</span>
                        {analysis.currentPrice > 0 && !isMobile && <span style={{ color: '#aaa', fontFamily: 'JetBrains Mono,monospace', fontSize: 16, fontWeight: 700, marginRight: 4 }}>${analysis.currentPrice.toFixed(2)}</span>}
                        {!isMobile && <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 13, fontWeight: 800, letterSpacing: '0.12em', padding: '1px 6px', borderRadius: 2, marginRight: 10, background: displayAnalysis?.flowTrend === 'BULLISH' ? 'rgba(16,185,129,0.15)' : displayAnalysis?.flowTrend === 'BEARISH' ? 'rgba(239,68,68,0.15)' : 'rgba(234,179,8,0.15)', color: displayAnalysis?.flowTrend === 'BULLISH' ? '#10b981' : displayAnalysis?.flowTrend === 'BEARISH' ? '#ef4444' : '#eab308', border: `1px solid ${displayAnalysis?.flowTrend === 'BULLISH' ? '#10b981' : displayAnalysis?.flowTrend === 'BEARISH' ? '#ef4444' : '#eab308'}` }}>{displayAnalysis?.flowTrend}</span>}
                        {/* Interval buttons "” context-aware based on scan days */}
                        {(() => {
                          const sd = getScanDays(scanTimeframe)
                          const opts = sd === 1
                            ? [{ v: '1min' as const, label: '1MIN' }, { v: '5min' as const, label: '5MIN' }]
                            : sd <= 5
                              ? [{ v: '30min' as const, label: '30MIN' }, { v: '1hour' as const, label: '1H' }]
                              : [{ v: '1day' as const, label: '1D' }]
                          return opts.map(({ v, label }) => (
                            <button key={v} onClick={() => { setTimeInterval(v); setBrushIndices(null) }}
                              style={{ padding: '2px 8px', fontFamily: 'JetBrains Mono,monospace', fontSize: 13, fontWeight: 800, letterSpacing: '0.1em', border: `1px solid ${timeInterval === v ? 'rgba(255,133,0,0.6)' : 'rgba(255,255,255,0.15)'}`, background: 'linear-gradient(180deg,#1a1a1a 0%,#0a0a0a 50%,#050505 100%)', boxShadow: timeInterval === v ? 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.6)' : 'inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.5)', color: timeInterval === v ? '#ff8500' : '#ffffff', cursor: 'pointer' }}>{label}</button>
                          ))
                        })()}
                        {brushIndices && (
                          <button onClick={() => setBrushIndices(null)} style={{ padding: '2px 8px', fontFamily: 'JetBrains Mono,monospace', fontSize: 14, fontWeight: 700, border: '1px solid rgba(255,255,255,0.3)', background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', letterSpacing: '0.08em' }}>RESET</button>
                        )}
                      </div>
                      {/* CENTER: legend (absolutely centered, hidden on mobile) */}
                      <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: isMobile ? 'none' : 'flex', alignItems: 'center', gap: 6 }}>
                        {chartViewMode === 'detailed' && [
                          { color: '#00ff7f', label: 'BULLISH CALLS', key: 'callsPlus' },
                          { color: '#4da6ff', label: 'BEARISH CALLS', key: 'callsMinus' },
                          { color: '#ffcc00', label: 'BULLISH PUTS', key: 'putsPlus' },
                          { color: '#ff2222', label: 'BEARISH PUTS', key: 'putsMinus' },
                        ].map(({ color, label, key }) => (
                          <span key={key} onClick={() => toggleLine(key)} style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', opacity: hiddenLines.has(key) ? 0.3 : 1, transition: 'opacity 0.15s' }}>
                            <svg width="16" height="4"><line x1="0" y1="2" x2="16" y2="2" stroke={color} strokeWidth="2.5" /></svg>
                            <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 14, color, fontWeight: 700, letterSpacing: '0.03em' }}>{label}</span>
                          </span>
                        ))}
                        {chartViewMode === 'simplified' && [
                          { color: '#00ff7f', label: 'BULLISH', key: 'bullishTotal' },
                          { color: '#ff2222', label: 'BEARISH', key: 'bearishTotal' },
                        ].map(({ color, label, key }) => (
                          <span key={key} onClick={() => toggleLine(key)} style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', opacity: hiddenLines.has(key) ? 0.3 : 1, transition: 'opacity 0.15s' }}>
                            <svg width="16" height="4"><line x1="0" y1="2" x2="16" y2="2" stroke={color} strokeWidth="2.5" /></svg>
                            <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 14, color, fontWeight: 700, letterSpacing: '0.03em' }}>{label}</span>
                          </span>
                        ))}
                        {chartViewMode === 'net' && (
                          <span onClick={() => toggleLine('netFlow')} style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', opacity: hiddenLines.has('netFlow') ? 0.3 : 1, transition: 'opacity 0.15s' }}>
                            <svg width="24" height="4"><line x1="0" y1="2" x2="11" y2="2" stroke="#00ff7f" strokeWidth="2.5" /><line x1="13" y1="2" x2="24" y2="2" stroke="#ff2222" strokeWidth="2.5" /></svg>
                            <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 14, color: '#fff', fontWeight: 700, letterSpacing: '0.03em' }}>NET FLOW</span>
                          </span>
                        )}
                      </div>
                      {/* RIGHT: mode buttons */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 3 : 4, marginLeft: 'auto', flexShrink: 0 }}>
                        {([['detailed', 'ALL'], ['simplified', 'BULL/BEAR'], ['net', 'NET']] as const).map(([mode, label]) => (
                          <button key={mode} onClick={() => setChartViewMode(mode)} style={{ padding: isMobile ? '2px 6px' : '3px 10px', fontFamily: 'JetBrains Mono,monospace', fontSize: isMobile ? 11 : 13, fontWeight: 800, letterSpacing: '0.08em', border: `1px solid ${chartViewMode === mode ? 'rgba(255,133,0,0.6)' : 'rgba(255,255,255,0.15)'}`, background: 'linear-gradient(180deg,#1a1a1a 0%,#0a0a0a 50%,#050505 100%)', boxShadow: chartViewMode === mode ? 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.6), 0 0 8px rgba(255,133,0,0.15)' : 'inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.5)', color: chartViewMode === mode ? '#ff8500' : '#ffffff', cursor: 'pointer', whiteSpace: 'nowrap' }}>{label}</button>
                        ))}
                      </div>
                    </div>
                    {/* Chart body "” height auto-sizes to content: main chart + visible sub-panels */}
                    <div ref={chartDivRef} style={{
                      padding: 0,
                      background: 'linear-gradient(180deg, #0e0e0e 0%, #070707 4%, #000 100%)',
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
                        const data = analysisRef.current?.chartData
                        if (!data) return
                        const len = data.length
                        const cur = brushIndices ?? { start: 0, end: len - 1 }
                        chartDragRef.current = { dragging: true, startX: e.clientX, startIndices: { ...cur } }
                      }}
                      onMouseMove={(e) => {
                        if (!chartDragRef.current.dragging) return
                        const clientX = e.clientX
                        // RAF throttle "” only compute once per frame
                        if (dragMoveRafRef.current) cancelAnimationFrame(dragMoveRafRef.current)
                        dragMoveRafRef.current = requestAnimationFrame(() => {
                          dragMoveRafRef.current = null
                          const data = analysisRef.current?.chartData
                          if (!data) return
                          const len = data.length
                          if (len < 2) return
                          const width = chartDivRef.current?.clientWidth ?? 800
                          const { startX, startIndices } = chartDragRef.current
                          const range = startIndices.end - startIndices.start
                          const pxPerPoint = width / Math.max(1, range)
                          const deltaPoints = Math.round((startX - clientX) / pxPerPoint)
                          const newStart = Math.max(0, Math.min(startIndices.start + deltaPoints, len - range - 1))
                          const newEnd = newStart + range
                          if (newEnd < len) setBrushIndices({ start: newStart, end: newEnd })
                        })
                      }}
                      onMouseUp={() => { chartDragRef.current.dragging = false; if (dragMoveRafRef.current) { cancelAnimationFrame(dragMoveRafRef.current); dragMoveRafRef.current = null } }}
                      onMouseLeave={() => { chartDragRef.current.dragging = false; if (dragMoveRafRef.current) { cancelAnimationFrame(dragMoveRafRef.current); dragMoveRafRef.current = null } }}
                    >
                      {/* Mobile overlay controls — Ticker | Timeframe dropdown | Line dropdown | Gamma | Bull/Bear */}
                      {isMobile && (
                        <div style={{ position: 'absolute', top: 6, left: 6, right: 6, zIndex: 10, display: 'flex', alignItems: 'center', gap: 4, pointerEvents: 'auto' }}>
                          {/* Back to ALL drill-down */}
                          {drilledTicker && (
                            <button onClick={() => { if (!allScanCacheRef.current) return; setDrilledTicker(null); setSearchTicker('ALL'); setFlowData(allScanCacheRef.current.flowData); setAnalysis(allScanCacheRef.current.analysis) }}
                              style={{ height: 24, padding: '0 7px', background: 'linear-gradient(180deg,#1c1c1c,#040404)', border: '1px solid #ff8500', borderRadius: 4, fontSize: 10, fontWeight: 800, color: '#ff8500', cursor: 'pointer', flexShrink: 0, fontFamily: 'JetBrains Mono,monospace', outline: 'none' }}>← ALL</button>
                          )}
                          {/* Ticker label */}
                          <span style={{ color: '#fff', fontFamily: 'JetBrains Mono,monospace', fontSize: 12, fontWeight: 900, letterSpacing: '0.1em', flexShrink: 0 }}>{analysis.ticker}</span>
                          {/* Timeframe dropdown */}
                          <select
                            value={timeInterval}
                            onChange={e => { setTimeInterval(e.target.value as typeof timeInterval); setBrushIndices(null) }}
                            style={{ height: 24, padding: '0 4px', background: '#0a0a0a', border: `1px solid ${timeInterval !== '5min' ? '#ff8500' : 'rgba(255,255,255,0.18)'}`, borderRadius: 4, fontSize: 10, fontWeight: 800, color: timeInterval !== '5min' ? '#ff8500' : '#fff', fontFamily: 'JetBrains Mono,monospace', outline: 'none', flexShrink: 0, cursor: 'pointer' }}
                          >
                            {(() => {
                              const sd = getScanDays(scanTimeframe)
                              if (sd === 1) return <><option value="1min">1MIN</option><option value="5min">5MIN</option></>
                              if (sd <= 5) return <><option value="30min">30MIN</option><option value="1hour">1HR</option></>
                              return <option value="1day">1DAY</option>
                            })()}
                          </select>
                          {/* Line mode dropdown */}
                          <select
                            value={chartViewMode}
                            onChange={e => setChartViewMode(e.target.value as typeof chartViewMode)}
                            style={{ height: 24, padding: '0 4px', background: '#0a0a0a', border: `1px solid ${chartViewMode !== 'net' ? '#ff8500' : 'rgba(255,255,255,0.18)'}`, borderRadius: 4, fontSize: 10, fontWeight: 800, color: chartViewMode !== 'net' ? '#ff8500' : '#fff', fontFamily: 'JetBrains Mono,monospace', outline: 'none', flexShrink: 0, cursor: 'pointer' }}
                          >
                            <option value="net">NET</option>
                            <option value="detailed">ALL</option>
                            <option value="simplified">BULL/BEAR</option>
                          </select>
                          {/* Gamma Line button */}
                          <button onClick={() => setShowGammaLine(v => !v)}
                            style={{ height: 24, padding: '0 8px', background: 'linear-gradient(180deg,#1c1c1c,#040404)', border: `1px solid ${showGammaLine ? '#ff8500' : 'rgba(255,255,255,0.18)'}`, borderRadius: 4, fontSize: 10, fontWeight: 800, color: showGammaLine ? '#ff8500' : '#fff', cursor: 'pointer', flexShrink: 0, fontFamily: 'JetBrains Mono,monospace', whiteSpace: 'nowrap', outline: 'none' }}>GAMMA</button>
                          {/* Bull/Bear PC button */}
                          <button onClick={() => setShowBullBear(v => !v)}
                            style={{ height: 24, padding: '0 8px', background: 'linear-gradient(180deg,#1c1c1c,#040404)', border: `1px solid ${showBullBear ? '#ff8500' : 'rgba(255,255,255,0.18)'}`, borderRadius: 4, fontSize: 10, fontWeight: 800, color: showBullBear ? '#ff8500' : '#fff', cursor: 'pointer', flexShrink: 0, fontFamily: 'JetBrains Mono,monospace', whiteSpace: 'nowrap', outline: 'none' }}>B/B PC</button>
                          {brushIndices && (
                            <button onClick={() => setBrushIndices(null)}
                              style={{ height: 24, padding: '0 7px', background: 'linear-gradient(180deg,#1c1c1c,#040404)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 4, fontSize: 10, fontWeight: 700, color: '#fff', cursor: 'pointer', flexShrink: 0, fontFamily: 'JetBrains Mono,monospace', outline: 'none' }}>↺</button>
                          )}
                        </div>
                      )}
                      {/* Glossy top-edge sheen */}
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 32, background: 'linear-gradient(180deg, rgba(255,255,255,0.035) 0%, transparent 100%)', pointerEvents: 'none', zIndex: 2 }} />
                      <div ref={mainChartWrapRef} style={{ height: isMobile ? (showBullBear ? 400 : 494) : (embeddedMode ? 440 : (showBullBear ? 445 : 569)), flexShrink: 0, overflow: 'hidden', borderBottom: showBullBear ? '2px solid rgba(167,139,250,0.55)' : 'none' }}>
                        <ResponsiveContainer width="100%" height="100%" debounce={16}>
                          <ComposedChart data={chartMemo.visibleData} margin={{ top: isMobile ? 36 : 10, right: 0, bottom: 0, left: 30 }}>
                            <XAxis dataKey="timeLabel" stroke="rgba(255,255,255,0.3)" tick={{ fill: '#ffffff', fontSize: isMobile ? 11 : 17, fontWeight: 700 }} height={isMobile ? 22 : 34} interval={Math.max(0, Math.floor(chartMemo.visibleData.length / (isMobile ? 3 : 6)) - 1)} padding={{ left: 10, right: 10 }}
                              tickFormatter={(label: string) => {
                                if (chartDisplayDays <= 1) return label.includes('/') ? label.replace(/^\d+\/\d+\/\d+ /, '') : label
                                else if (chartDisplayDays <= 5) return label.replace(/\/\d{4} /, ' ')
                                else return label.replace(/\/(\d{4}) .*/, (_, yr) => `/${yr.slice(-2)}`)
                              }}
                            />
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
                              <Line type="linear" yAxisId="flow" dataKey="callsPlus" stroke="#00ff7f" strokeWidth={3} name="BULLISH CALLS" dot={false} hide={hiddenLines.has('callsPlus')} />
                              <Line type="linear" yAxisId="flow" dataKey="callsMinus" stroke="#4da6ff" strokeWidth={3} name="BEARISH CALLS" dot={false} hide={hiddenLines.has('callsMinus')} />
                              <Line type="linear" yAxisId="flow" dataKey="putsPlus" stroke="#ffcc00" strokeWidth={3} name="BULLISH PUTS" dot={false} hide={hiddenLines.has('putsPlus')} />
                              <Line type="linear" yAxisId="flow" dataKey="putsMinus" stroke="#ff2222" strokeWidth={3} name="BEARISH PUTS" dot={false} hide={hiddenLines.has('putsMinus')} />
                            </>) : chartViewMode === 'simplified' ? (<>
                              <Line type="linear" yAxisId="flow" dataKey="bullishTotal" stroke="#00ff7f" strokeWidth={3} name="BULLISH FLOW" dot={false} hide={hiddenLines.has('bullishTotal')} />
                              <Line type="linear" yAxisId="flow" dataKey="bearishTotal" stroke="#ff2222" strokeWidth={3} name="BEARISH FLOW" dot={false} hide={hiddenLines.has('bearishTotal')} />
                            </>) : (() => {
                              const nfVals = chartMemo.visibleData.map((d: any) => d.netFlow ?? 0)
                              const nfMax = nfVals.length ? Math.max(...nfVals) : 1
                              const nfMin = nfVals.length ? Math.min(...nfVals) : -1
                              const nfRange = nfMax - nfMin || 1
                              // hard stop fraction: where zero sits between min and max (top=0%, bottom=100%)
                              const zeroFrac = ((nfMax - 0) / nfRange) * 100
                              const zeroStop = `${Math.max(0, Math.min(100, zeroFrac)).toFixed(2)}%`
                              return (<>
                                <defs>
                                  <linearGradient id="netFlowColorGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset={zeroStop} stopColor="#00ff00" />
                                    <stop offset={zeroStop} stopColor="#ff2222" />
                                  </linearGradient>
                                </defs>
                                <Line type="linear" yAxisId="flow" dataKey="netFlow" stroke="url(#netFlowColorGrad)" strokeWidth={3} name="NET FLOW" dot={false} hide={hiddenLines.has('netFlow')} />
                              </>)
                            })()}
                            <Line type="monotone" yAxisId="price" dataKey="stockClose" stroke="transparent" strokeWidth={0} name="PRICE" dot={false} legendType="none" />
                            <Customized component={CandlestickLayer} visibleData={chartMemo.visibleData} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>

                      {/* P/C Ratio sub-panel "” toggleable */}
                      {showBullBear && (() => {
                        const pcData = chartMemo.visibleData
                        const pcVals = pcData.map((d: any) => d.pcRatio ?? 1)
                        const pcMin = pcVals.length ? Math.min(...pcVals) : 0
                        const pcMax = pcVals.length ? Math.max(...pcVals) : 2
                        const pcPad = (pcMax - pcMin) * 0.1 || 0.1
                        const lastPc = pcVals.length ? pcVals[pcVals.length - 1] : 1
                        const pcCol = lastPc > 1.1 ? '#ef4444' : lastPc < 0.9 ? '#10b981' : '#eab308'
                        return (
                          <div ref={pcPanelRef} style={{ borderTop: '2px solid rgba(167,139,250,0.55)', background: '#06040f', flexShrink: 0, overflow: 'hidden' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 82px 0 30px' }}>
                              <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 10, fontWeight: 700, color: '#a78bfa', letterSpacing: '0.18em' }}>BULL/BEAR RATIO</span>
                            </div>
                            <ResponsiveContainer width="100%" height={isMobile ? 70 : 100} debounce={50}>
                              <LineChart data={pcData} margin={{ top: 6, right: 0, bottom: 0, left: 30 }}>
                                <XAxis dataKey="timeLabel" hide />
                                <YAxis orientation="right" stroke="#ffffff" width={82}
                                  domain={[Math.max(0, parseFloat((pcMin - pcPad).toFixed(3))), parseFloat((pcMax + pcPad).toFixed(3))]}
                                  ticks={(() => {
                                    const lo = Math.max(0, pcMin - pcPad), hi = pcMax + pcPad
                                    const n = 4, step = (hi - lo) / n
                                    const base = Array.from({ length: n + 1 }, (_, i) => lo + i * step)
                                    const ci = base.reduce((b, t, i) => Math.abs(t - lastPc) < Math.abs(base[b] - lastPc) ? i : b, 0)
                                    base[ci] = lastPc
                                    return base
                                  })()}
                                  tick={(props: any) => {
                                    const { x, y, payload } = props
                                    const isLast = Math.abs(payload.value - lastPc) < 1e-9
                                    const txt = isLast ? lastPc.toFixed(2) : payload.value.toFixed(2)
                                    return (
                                      <g>
                                        {isLast && <rect x={x} y={y - 9} width={82} height={18} fill="#000" />}
                                        <text x={x + 5} y={y + 4} textAnchor="start" fill={isLast ? pcCol : '#fff'} fontSize={isLast ? 16 : 13} fontWeight={isLast ? 800 : 700} fontFamily="JetBrains Mono, monospace">{txt}</text>
                                      </g>
                                    )
                                  }}
                                />
                                <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.2)', fontSize: 12 }} labelStyle={{ color: '#fff' }}
                                  formatter={(v: any) => [Number(v).toFixed(3), 'BULL/BEAR']}
                                />
                                <ReferenceLine y={1} stroke="rgba(167,139,250,0.35)" strokeDasharray="4 4" />
                                <Line type="monotone" dataKey="pcRatio" stroke="#a78bfa" strokeWidth={2} dot={false} name="BULL/BEAR"
                                  activeDot={{ r: 4, fill: '#a78bfa', stroke: '#fff', strokeWidth: 1 }}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        )
                      })()}{/* end P/C sub-panel */}

                    </div>{/* end chart body */}

                    {/* Gamma Line panel "” outside fixed-height chart body so it's never clipped */}
                    {showGammaLine && !isAllScan && (() => {
                      const lastGamma = gammaLineData.length ? gammaLineData[gammaLineData.length - 1].cumGamma : 0
                      const gammaColor = lastGamma > 0 ? '#10b981' : lastGamma < 0 ? '#ef4444' : '#888'
                      const fmtGamma = (v: number) => {
                        const abs = Math.abs(v), sign = v < 0 ? '-' : v > 0 ? '+' : ''
                        if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(2)}K`
                        return `${sign}${abs.toFixed(3)}`
                      }
                      // Tight Y domain: 10% padding above/below actual data range
                      const gammaVals = gammaLineData.map(d => d.cumGamma)
                      const gMin = gammaVals.length ? Math.min(...gammaVals) : 0
                      const gMax = gammaVals.length ? Math.max(...gammaVals) : 0
                      const gRange = gMax - gMin || Math.abs(gMax) * 0.2 || 1
                      const gDomMin = gMin - gRange * 0.1
                      const gDomMax = gMax + gRange * 0.1
                      // Gradient: green above 0, red below 0 "” hard stop at zero fraction
                      const totalRange = gDomMax - gDomMin
                      const zeroFrac = totalRange > 0 ? ((gDomMax - 0) / totalRange) * 100 : 50
                      const zeroStop = `${Math.max(0, Math.min(100, zeroFrac)).toFixed(1)}%`
                      return (
                        <div style={{ borderTop: '2px solid rgba(16,185,129,0.4)', background: 'linear-gradient(180deg, rgba(16,185,129,0.012) 0%, transparent 100%)', flexShrink: 0, overflow: 'hidden' }}>
                          {/* Header "” title + spinner only, value lives on the Y axis */}
                          <div style={{ padding: '6px 14px 4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#ff8500', letterSpacing: '0.22em', fontWeight: 700 }}>GAMMA EXPOSURE</div>
                              {gammaLoading && <div style={{ width: 8, height: 8, borderRadius: '50%', border: '2px solid #ff8500', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />}
                            </div>
                          </div>
                          {/* Chart */}
                          {!gammaLoading && gammaLineData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={isMobile ? 80 : 120} debounce={50}>
                              <LineChart data={gammaLineData} margin={{ top: 4, right: 0, bottom: 0, left: 30 }}>
                                <defs>
                                  <linearGradient id="gammaStroke" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset={zeroStop} stopColor="#10b981" />
                                    <stop offset={zeroStop} stopColor="#ef4444" />
                                  </linearGradient>
                                </defs>
                                <XAxis dataKey="timeLabel" hide />
                                <YAxis orientation="right" stroke="#ffffff" width={82}
                                  domain={[gDomMin, gDomMax]}
                                  ticks={(() => {
                                    const n = 4
                                    const step = (gDomMax - gDomMin) / n
                                    const base = Array.from({ length: n + 1 }, (_, i) => gDomMin + i * step)
                                    // swap the closest base tick with lastGamma so it appears in axis
                                    const ci = base.reduce((b, t, i) => Math.abs(t - lastGamma) < Math.abs(base[b] - lastGamma) ? i : b, 0)
                                    base[ci] = lastGamma
                                    return base
                                  })()}
                                  tick={(props: any) => {
                                    const { x, y, payload } = props
                                    const isLast = Math.abs(payload.value - lastGamma) < 1e-9
                                    const txt = isLast ? fmtGamma(lastGamma) : (() => { const abs = Math.abs(payload.value), s = payload.value < 0 ? '-' : ''; return abs >= 1000 ? `${s}${(abs / 1000).toFixed(2)}K` : `${s}${abs.toFixed(3)}` })()
                                    return (
                                      <g>
                                        {isLast && <rect x={x} y={y - 9} width={82} height={18} fill="#000" />}
                                        <text x={x + 5} y={y + 4} textAnchor="start" fill={isLast ? '#ff8500' : '#fff'} fontSize={isLast ? 16 : 13} fontWeight={isLast ? 800 : 700} fontFamily="JetBrains Mono, monospace">{txt}</text>
                                      </g>
                                    )
                                  }}
                                />
                                <Tooltip
                                  contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,133,0,0.5)', fontSize: 12 }}
                                  labelStyle={{ color: '#ff8500', fontWeight: 700 }}
                                  formatter={(v: any) => [fmtGamma(Number(v)), 'CUM GAMMA']}
                                />
                                <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" />
                                <Line
                                  type="monotone" dataKey="cumGamma"
                                  stroke="url(#gammaStroke)"
                                  strokeWidth={2.5} dot={false} name="GAMMA"
                                  activeDot={{ r: 4, fill: '#ff8500', stroke: '#fff', strokeWidth: 1 }}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          ) : !gammaLoading ? (
                            <div style={{ height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: 'rgba(255,133,0,0.5)', letterSpacing: '0.1em' }}>NO GAMMA DATA "” CONTRACT NOT IN SNAPSHOT</div>
                          ) : null}
                        </div>
                      )
                    })()}

                  </div>{/* end chart column */}
                </div>{/* end ROW 2 */}

                {/* ── ROW 3: TRADES TABLE + EFI CHART "” hidden in embedded mode ── */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', display: embeddedMode ? 'none' : 'flex', marginTop: 0 }}>

                  {/* Left: Trades table — fills remaining left column */}
                  <div style={{ flex: 1, minWidth: 0, width: isMobile ? '100%' : undefined }}>
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
                    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: isMobile ? '60vh' : 680, WebkitOverflowScrolling: 'touch' as any }}>
                      <table className="algo-trades-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ background: '#0a0a0a', position: 'sticky', top: 0, zIndex: 10, borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
                          <tr>
                            {isMobile ? (
                              [
                                { key: 'underlying_ticker', label: 'SYMBOL' },
                                { key: 'strike', label: 'STRIKE' },
                                { key: 'total_premium', label: 'SIZE' },
                                { key: null, label: 'EXPIRY' },
                                { key: null, label: 'SPOT' },
                              ].map(({ key, label }) => (
                                <th key={label}
                                  onClick={key ? () => { if (sortColumn === key) { setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc') } else { setSortColumn(key); setSortDirection('desc') } } : undefined}
                                  style={{ textAlign: 'left', padding: '4px 5px', fontFamily: 'JetBrains Mono,monospace', fontSize: 13, color: sortColumn === key ? '#fff' : '#ff8500', letterSpacing: '0.08em', fontWeight: 800, cursor: key ? 'pointer' : 'default', whiteSpace: 'nowrap' }}
                                >
                                  {label}{key && sortColumn === key ? (sortDirection === 'asc' ? ' ←‘' : ' ←“') : ''}
                                </th>
                              ))
                            ) : (
                              [
                                { key: 'trade_timestamp', label: 'TIME' },
                                { key: 'underlying_ticker', label: 'SYM' },
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
                                  {label}{key && sortColumn === key ? (sortDirection === 'asc' ? ' ←‘' : ' ←“') : ''}
                                </th>
                              ))
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            let tradesToDisplay = displayAnalysis?.trades || flowData
                            if (selectedStrike !== null) tradesToDisplay = tradesToDisplay.filter(t => t.strike === selectedStrike)
                            if (selectedExpiry !== null) tradesToDisplay = tradesToDisplay.filter(t => t.expiry === selectedExpiry)
                            if (excludeMag7) tradesToDisplay = tradesToDisplay.filter(t => !MAG7_TICKERS.includes(t.underlying_ticker))
                            if (excludeEtf) tradesToDisplay = tradesToDisplay.filter(t => !ETF_SET.has(t.underlying_ticker))
                            // Expiry range filters
                            if (expiryFilter !== 'all') {
                              const now = new Date()
                              // LA trading day (PT)
                              const todayPT = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
                              const dow = todayPT.getDay() // 0=Sun,1=Mon,...,5=Fri,6=Sat
                              // Current trading day date string in PT
                              const tradingDate = todayPT.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }) // YYYY-MM-DD
                              if (expiryFilter === '45d') {
                                const cutoff = new Date(todayPT)
                                cutoff.setDate(cutoff.getDate() + 45)
                                const cutoffStr = cutoff.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
                                tradesToDisplay = tradesToDisplay.filter(t => {
                                  const expStr = t.expiry.includes('T') ? t.expiry.split('T')[0] : t.expiry
                                  return expStr >= tradingDate && expStr <= cutoffStr
                                })
                              } else if (expiryFilter === 'weekly') {
                                // Week = Mon"“Fri. If today is Fri (5) or Sat (6), point to next week's Friday.
                                const daysToFriday = dow <= 5 ? 5 - dow : 6 // 0=Sun←’5, 1=Mon←’4, ..., 5=Fri←’0, 6=Sat←’6(next Fri)
                                const thisFriday = new Date(todayPT)
                                thisFriday.setDate(todayPT.getDate() + daysToFriday)
                                // Week start = Monday of same week
                                const weekStart = new Date(thisFriday)
                                weekStart.setDate(thisFriday.getDate() - 4) // Mon
                                const weekStartStr = weekStart.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
                                const weekEndStr = thisFriday.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
                                tradesToDisplay = tradesToDisplay.filter(t => {
                                  const expStr = t.expiry.includes('T') ? t.expiry.split('T')[0] : t.expiry
                                  return expStr >= weekStartStr && expStr <= weekEndStr
                                })
                              } else if (expiryFilter === '0dte') {
                                // For MWF stocks (MAG7 + ETFs): Mon/Wed/Fri expiries are valid 0DTE
                                // For others: Friday-only
                                // Rule: show contracts expiring on today's date. If today is after 4pm PT
                                // (or Sat/Sun), advance to next trading day.
                                let odteDate = new Date(todayPT)
                                const hourPT = todayPT.getHours()
                                // After market close (>=16) or weekend, roll to next trading day
                                if (hourPT >= 16 || dow === 0 || dow === 6) {
                                  do {
                                    odteDate.setDate(odteDate.getDate() + 1)
                                    const d = odteDate.getDay()
                                    if (d !== 0 && d !== 6) break
                                  } while (true)
                                }
                                const odteDateStr = odteDate.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
                                tradesToDisplay = tradesToDisplay.filter(t => {
                                  const expStr = t.expiry.includes('T') ? t.expiry.split('T')[0] : t.expiry
                                  return expStr === odteDateStr
                                })
                              }
                            }
                            const sortedTrades = [...tradesToDisplay].sort((a: any, b: any) => {
                              let aVal = a[sortColumn]; let bVal = b[sortColumn]
                              if (sortColumn === 'trade_timestamp') { aVal = new Date(aVal).getTime(); bVal = new Date(bVal).getTime() }
                              return sortDirection === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1)
                            })
                            const paginatedTrades = sortedTrades.slice((currentPage - 1) * TRADES_PER_PAGE, currentPage * TRADES_PER_PAGE)
                            const fillColors: Record<string, string> = { A: '#10b981', B: '#ef4444', AA: '#6ee7b7', BB: '#fca5a5', 'N/A': 'rgba(255,255,255,0.2)' }
                            const styleColors: Record<string, string> = { SWEEP: 'rgb(255,215,0)', BLOCK: 'rgb(0,153,255)', MINI: 'rgb(0,255,94)', 'MULTI-LEG': 'rgb(168,85,247)' }

                            // Use memoized OI computation (tradeOIMemo) "” avoids rerunning on every render
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
                              const rowBg = idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent'
                              const styleBadge = (
                                <span style={{
                                  fontFamily: 'JetBrains Mono,monospace', fontSize: 9, fontWeight: 800,
                                  padding: '2px 5px', borderRadius: '9999px', display: 'inline-block', letterSpacing: '0.05em',
                                  ...(trade.trade_type === 'SWEEP' ? { background: 'linear-gradient(180deg,#1e1e1e,#000)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.6)' }
                                    : trade.trade_type === 'BLOCK' ? { background: 'linear-gradient(180deg,#1e1e1e,#000)', color: '#00e5ff', border: '1px solid rgba(0,229,255,0.5)' }
                                      : trade.trade_type === 'MULTI-LEG' ? { background: 'linear-gradient(180deg,#3b1d6e,#1e0a3c)', color: '#d8b4fe', border: '1px solid rgba(168,85,247,0.5)' }
                                        : { background: 'linear-gradient(180deg,#14532d,#052e16)', color: '#86efac', border: '1px solid rgba(134,239,172,0.4)' })
                                }}>{trade.trade_type || 'MINI'}</span>
                              )
                              if (isMobile) {
                                const timeStr = scanTimeframe !== '1D'
                                  ? new Date(trade.trade_timestamp).toLocaleString('en-US', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })
                                  : new Date(trade.trade_timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })
                                return (
                                  <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: rowBg }}
                                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                                    onMouseLeave={e => (e.currentTarget.style.background = rowBg)}
                                  >
                                    {/* Col 1: SYM + TIME */}
                                    <td style={{ padding: '4px 5px', verticalAlign: 'middle' }}>
                                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                                        <span
                                          style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 12, fontWeight: 900, color: allScanCacheRef.current ? '#ffcc44' : '#fff', cursor: allScanCacheRef.current ? 'pointer' : 'default', background: 'linear-gradient(180deg,#1e1e1e,#000)', border: '1px solid rgba(255,255,255,0.25)', padding: '1px 4px' }}
                                          onDoubleClick={() => {
                                            if (!allScanCacheRef.current) return
                                            const t = trade.underlying_ticker
                                            setDrilledTicker(t); setSearchTicker(t)
                                            const filtered = allScanCacheRef.current.flowData.filter(x => x.underlying_ticker === t)
                                            setFlowData(filtered); setIsAnalyzing(true)
                                            setTimeout(() => performAnalysis(filtered, t), 0)
                                          }}
                                        >{trade.underlying_ticker}</span>
                                        <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 9, color: 'rgba(255,255,255,0.5)' }}>{timeStr}</span>
                                      </div>
                                    </td>
                                    {/* Col 2: STRIKE + TYPE */}
                                    <td style={{ padding: '4px 5px', verticalAlign: 'middle' }}>
                                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                                        <button onClick={() => setSelectedStrike(selectedStrike === trade.strike ? null : trade.strike)} style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, fontWeight: 700, color: selectedStrike === trade.strike ? '#22d3ee' : '#fff', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>${trade.strike}</button>
                                        <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 10, fontWeight: 800, color: trade.type === 'call' ? '#00cc00' : '#ff0000' }}>{trade.type.toUpperCase()}</span>
                                      </div>
                                    </td>
                                    {/* Col 3: SIZE@PRICE FILL + PREMIUM */}
                                    <td style={{ padding: '4px 5px', verticalAlign: 'middle' }}>
                                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                                        <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 10, color: '#fff', whiteSpace: 'nowrap' }}>
                                          {trade.trade_size.toLocaleString()}@${trade.premium_per_contract.toFixed(2)}{' '}
                                          <span style={{ fontWeight: 800, color: fillColors[trade.fill_style || 'N/A'] }}>{trade.fill_style || 'N/A'}</span>
                                        </span>
                                        <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#00cc00', fontWeight: 700 }}>${trade.total_premium.toLocaleString()}</span>
                                      </div>
                                    </td>
                                    {/* Col 4: EXPIRY + STYLE */}
                                    <td style={{ padding: '4px 5px', verticalAlign: 'middle' }}>
                                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
                                        <button onClick={() => setSelectedExpiry(selectedExpiry === trade.expiry ? null : trade.expiry)} style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 10, color: selectedExpiry === trade.expiry ? '#22d3ee' : '#fff', background: 'none', border: 'none', cursor: 'pointer', padding: 0, whiteSpace: 'nowrap' }}>{trade.expiry.split('T')[0]}</button>
                                        {styleBadge}
                                      </div>
                                    </td>
                                    {/* Col 5: SPOT + VOL/OI */}
                                    <td style={{ padding: '4px 5px', verticalAlign: 'middle' }}>
                                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                                        <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 10, color: '#fff', whiteSpace: 'nowrap' }}>
                                          ${trade.spot_price != null ? Number(trade.spot_price).toFixed(2) : 'N/A'}
                                        </span>
                                        <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 9, color: 'rgb(0,153,255)', whiteSpace: 'nowrap' }}>
                                          {displayVolume?.toLocaleString() || 'N/A'}<span style={{ color: 'rgba(255,255,255,0.3)', margin: '0 2px' }}>/</span><span style={{ color: 'rgb(0,255,94)' }}>{displayOISnapshot?.toLocaleString() || 'N/A'}</span>
                                        </span>
                                      </div>
                                    </td>
                                  </tr>
                                )
                              }
                              return (
                                <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: rowBg }}
                                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                                  onMouseLeave={e => (e.currentTarget.style.background = rowBg)}
                                >
                                  <td style={{ padding: '5px 10px', fontFamily: 'JetBrains Mono,monospace', fontSize: 21, color: '#fff', whiteSpace: 'nowrap' }}>
                                    {scanTimeframe !== '1D'
                                      ? new Date(trade.trade_timestamp).toLocaleString('en-US', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })
                                      : new Date(trade.trade_timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: 'America/Los_Angeles' })}
                                  </td>
                                  <td
                                    style={{ padding: '5px 10px', fontFamily: 'JetBrains Mono,monospace', fontSize: 23, color: allScanCacheRef.current ? '#ffcc44' : '#fff', fontWeight: 900, cursor: allScanCacheRef.current ? 'pointer' : 'default', userSelect: 'none' }}
                                    title={allScanCacheRef.current ? `Double-click to drill into ${trade.underlying_ticker}` : undefined}
                                    onDoubleClick={() => {
                                      if (!allScanCacheRef.current) return
                                      const t = trade.underlying_ticker
                                      setDrilledTicker(t); setSearchTicker(t)
                                      const filtered = allScanCacheRef.current.flowData.filter(x => x.underlying_ticker === t)
                                      setFlowData(filtered); setIsAnalyzing(true)
                                      setTimeout(() => performAnalysis(filtered, t), 0)
                                    }}
                                  >{trade.underlying_ticker}</td>
                                  <td style={{ padding: '5px 10px', fontFamily: 'JetBrains Mono,monospace', fontSize: 21, fontWeight: 800, color: trade.type === 'call' ? '#00cc00' : '#ff0000' }}>{trade.type.toUpperCase()}</td>
                                  <td style={{ padding: '5px 10px' }}>
                                    <button onClick={() => setSelectedStrike(selectedStrike === trade.strike ? null : trade.strike)} style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 21, fontWeight: 700, color: selectedStrike === trade.strike ? '#22d3ee' : '#fff', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>${trade.strike}</button>
                                  </td>
                                  <td style={{ padding: '5px 10px', fontFamily: 'JetBrains Mono,monospace', fontSize: 21, color: '#fff', whiteSpace: 'nowrap' }}>
                                    {trade.trade_size.toLocaleString()}@${trade.premium_per_contract.toFixed(2)}<span style={{ marginLeft: 5, fontWeight: 800, color: fillColors[trade.fill_style || 'N/A'] }}>{trade.fill_style || 'N/A'}</span>
                                  </td>
                                  <td style={{ padding: '5px 10px', fontFamily: 'JetBrains Mono,monospace', fontSize: 21, color: '#00cc00', fontWeight: 700 }}>${trade.total_premium.toLocaleString()}</td>
                                  <td style={{ padding: '5px 10px', fontFamily: 'JetBrains Mono,monospace', fontSize: 21, color: '#fff', whiteSpace: 'nowrap' }}>
                                    ${trade.spot_price != null ? Number(trade.spot_price).toFixed(2) : 'N/A'}
                                    {analysis?.currentPrice && <span style={{ color: 'rgba(255,255,255,0.4)', margin: '0 5px' }}>"º</span>}
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
                                      fontFamily: 'JetBrains Mono,monospace', fontSize: 15, fontWeight: 800,
                                      padding: '3px 12px', borderRadius: '9999px', display: 'inline-block', letterSpacing: '0.05em',
                                      ...(trade.trade_type === 'SWEEP' ? { backgroundColor: '#000000', backgroundImage: 'linear-gradient(180deg,#1e1e1e 0%,#000 50%,#111 100%)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.6)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15),inset 0 -1px 0 rgba(0,0,0,0.8)' }
                                        : trade.trade_type === 'BLOCK' ? { backgroundColor: '#000000', backgroundImage: 'linear-gradient(180deg,#1e1e1e 0%,#000 50%,#111 100%)', color: '#00e5ff', border: '1px solid rgba(0,229,255,0.5)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15),inset 0 -1px 0 rgba(0,0,0,0.8)' }
                                          : trade.trade_type === 'MULTI-LEG' ? { backgroundColor: '#1e0a3c', backgroundImage: 'linear-gradient(180deg,#3b1d6e 0%,#1e0a3c 50%,#2d1555 100%)', color: '#d8b4fe', border: '1px solid rgba(168,85,247,0.5)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15),inset 0 -1px 0 rgba(0,0,0,0.8)' }
                                            : { backgroundColor: '#052e16', backgroundImage: 'linear-gradient(180deg,#14532d 0%,#052e16 50%,#0f3d22 100%)', color: '#86efac', border: '1px solid rgba(134,239,172,0.4)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15),inset 0 -1px 0 rgba(0,0,0,0.8)' })
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
                              {(currentPage - 1) * TRADES_PER_PAGE + 1}"“{Math.min(currentPage * TRADES_PER_PAGE, tradesToDisplay.length)} OF {tradesToDisplay.length}
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

                  {/* end ROW 3 */}
                </div>

              </div>{/* end left column */}

            </div>
          )}{/* end analysis block */}

          {/* NO RESULTS STATE */}
          {!loading && !isAnalyzing && !analysis && searchTicker && (
            <div style={{ padding: 40, textAlign: 'center', border: '1px solid rgba(255,255,255,0.15)', flex: 1 }}>
              <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 13, color: '#fff', fontWeight: 700, letterSpacing: '0.1em' }}>
                NO FLOW DATA FOUND FOR {searchTicker}
              </div>
              <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#fff', marginTop: 6, letterSpacing: '0.08em' }}>
                TRY A DIFFERENT TICKER OR CHECK IF THE MARKET IS OPEN
              </div>
            </div>
          )}

        </div>{/* end left scrollable */}
        {/* RIGHT: RRG Panel */}
        {(!isMobile || activeTab === 'flowbias') && (
          <div style={{ width: isMobile ? '99%' : '40%', height: isMobile ? '86vh' : undefined, flex: isMobile ? 'none' : undefined, marginLeft: isMobile ? 'auto' : undefined, flexShrink: 0, borderLeft: isMobile ? 'none' : '1px solid rgba(255,255,255,0.1)', background: '#060608', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* RRG chart */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
              {/* FLOW MATRIX title overlay */}
              <div style={{ position: 'absolute', top: 10, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, pointerEvents: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 22, fontWeight: 900, color: '#ff8500', letterSpacing: '0.25em', textTransform: 'uppercase', textShadow: 'none', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.9))' }}>FLOW MATRIX</span>
                  {biasRRGLoading && <span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid #ff8500', borderTopColor: 'transparent', borderRadius: '50%', animation: 'biasSpin 0.7s linear infinite', pointerEvents: 'none' }} />}
                  {!isMobile && (rrgTransform.k !== 1 || rrgTransform.tx !== 0 || rrgTransform.ty !== 0) && (
                    <button onClick={() => setRrgTransform({ tx: 0, ty: 0, k: 1 })} style={{ pointerEvents: 'all', height: 22, padding: '0 8px', background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,133,0,0.4)', borderRadius: 4, color: '#ff8500', fontFamily: 'JetBrains Mono,monospace', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>↺</button>
                  )}
                </div>
              </div>
              {biasRRGData ? (() => {
                const W = 1755, H = 875, PAD = { t: 32, r: 32, b: 44, l: 90 }
                const CW = W - PAD.l - PAD.r, CH = H - PAD.t - PAD.b
                const CX = PAD.l + CW / 2, CY = PAD.t + CH / 2
                const allTickers: Array<{ ticker: string; x: number; y: number; total: number; quad: string }> = []
                const allAggs = [...biasRRGData.bullCalls, ...biasRRGData.bearCalls, ...biasRRGData.bullPuts, ...biasRRGData.bearPuts]
                const uniqThreshold = 0.35
                for (const a of allAggs) {
                  const dominant = Math.max(a.bullCall / a.total, a.bearCall / a.total, a.bullPut / a.total, a.bearPut / a.total)
                  if (dominant < uniqThreshold) continue  // apply uniqueness filter live
                  const xVal = (a.callPremium - a.putPremium) / a.total
                  const yVal = ((a.bullCall + a.bullPut) - (a.bearCall + a.bearPut)) / a.total
                  const quad = dominant === a.bullCall / a.total ? 'BC' : dominant === a.bearCall / a.total ? 'CC' : dominant === a.bullPut / a.total ? 'BP' : 'CP'
                  allTickers.push({ ticker: a.ticker, x: xVal, y: yVal, total: a.total, quad })
                }
                // Auto-scale: find actual data extent so tickers fill the chart
                // instead of clustering in corners when a high uniqueness % is active.
                const xVals = allTickers.map(t => t.x)
                const yVals = allTickers.map(t => t.y)
                const xAbsMax = allTickers.length > 0 ? Math.max(Math.abs(Math.min(...xVals)), Math.abs(Math.max(...xVals))) : 1
                const yAbsMax = allTickers.length > 0 ? Math.max(Math.abs(Math.min(...yVals)), Math.abs(Math.max(...yVals))) : 1
                // Symmetric around 0 so quadrant divider stays centred; 2% padding (tight)
                const xAxisScale = Math.max(0.05, xAbsMax * 1.02)
                const yAxisScale = Math.max(0.05, yAbsMax * 1.02)
                const toSVG = (x: number, y: number) => ({ sx: CX + (x / xAxisScale) * (CW / 2) * 0.99, sy: CY - (y / yAxisScale) * (CH / 2) * 0.99 })
                // Build 5 evenly-spaced axis ticks that reflect the dynamic range
                const buildTicks = (scale: number) => {
                  const step = scale / 2
                  return [-scale, -step, 0, step, scale].map(v => Math.round(v * 1000) / 1000)
                }
                const xTicks = buildTicks(xAxisScale)
                const yTicks = buildTicks(yAxisScale)
                const maxPrem = Math.max(...allTickers.map(t => t.total), 1)
                const dotR = (total: number) => 4 + Math.sqrt(total / maxPrem) * 10
                const QUAD_COLORS: Record<string, string> = { BC: '#00ff88', CC: '#ff4444', BP: '#4da6ff', CP: '#ffaa00' }
                return (
                  <svg ref={rrgSvgRef} viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="none"
                    style={{ display: 'block', cursor: rrgDragRef.current.dragging ? 'grabbing' : 'grab', userSelect: 'none' }}
                    onMouseDown={e => { const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); rrgDragRef.current = { dragging: false, mouseDownActive: true, lastSvgX: (e.clientX - rect.left) * W / rect.width, lastSvgY: (e.clientY - rect.top) * H / rect.height } }}
                    onMouseMove={e => {
                      if (!rrgDragRef.current.mouseDownActive) return
                      const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
                      const cx2 = (e.clientX - rect.left) * W / rect.width, cy2 = (e.clientY - rect.top) * H / rect.height
                      const dx = cx2 - rrgDragRef.current.lastSvgX, dy = cy2 - rrgDragRef.current.lastSvgY
                      // Only start dragging after moving >4px — prevents double-click from drifting
                      if (!rrgDragRef.current.dragging && Math.sqrt(dx * dx + dy * dy) < 4) return
                      rrgDragRef.current.dragging = true
                      rrgDragRef.current.lastSvgX = cx2; rrgDragRef.current.lastSvgY = cy2
                      setRrgTransform(t => {
                        const minTx = (1 - t.k) * (PAD.l + CW), maxTx = (1 - t.k) * PAD.l
                        const minTy = (1 - t.k) * (PAD.t + CH), maxTy = (1 - t.k) * PAD.t
                        return { ...t, tx: Math.max(minTx, Math.min(maxTx, t.tx + dx)), ty: Math.max(minTy, Math.min(maxTy, t.ty + dy)) }
                      })
                    }}
                    onMouseUp={() => { rrgDragRef.current.dragging = false; rrgDragRef.current.mouseDownActive = false }}
                    onMouseLeave={() => { rrgDragRef.current.dragging = false; rrgDragRef.current.mouseDownActive = false }}
                  >
                    <defs>
                      <radialGradient id="rrg-bg2" cx="50%" cy="35%" r="70%">
                        <stop offset="0%" stopColor="#0d1420" /><stop offset="60%" stopColor="#060810" /><stop offset="100%" stopColor="#020305" />
                      </radialGradient>
                      <linearGradient id="rrg-gloss2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(255,255,255,0.04)" /><stop offset="45%" stopColor="rgba(255,255,255,0.01)" /><stop offset="100%" stopColor="rgba(0,0,0,0.08)" />
                      </linearGradient>
                      {/* Quadrant diagonal gradients — same style as market overview RRG */}
                      <linearGradient id="rrg-q-bp" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#000000" stopOpacity="1" />
                        <stop offset="50%" stopColor="#004a4a" stopOpacity="1" />
                        <stop offset="100%" stopColor="#000000" stopOpacity="1" />
                      </linearGradient>
                      <linearGradient id="rrg-q-bc" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#000000" stopOpacity="1" />
                        <stop offset="50%" stopColor="#004a00" stopOpacity="1" />
                        <stop offset="100%" stopColor="#000000" stopOpacity="1" />
                      </linearGradient>
                      <linearGradient id="rrg-q-cp" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#000000" stopOpacity="1" />
                        <stop offset="50%" stopColor="#4a2500" stopOpacity="1" />
                        <stop offset="100%" stopColor="#000000" stopOpacity="1" />
                      </linearGradient>
                      <linearGradient id="rrg-q-cc" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#000000" stopOpacity="1" />
                        <stop offset="50%" stopColor="#4a0000" stopOpacity="1" />
                        <stop offset="100%" stopColor="#000000" stopOpacity="1" />
                      </linearGradient>
                      {[['bc2', '#00ff88'], ['cc2', '#ff4444'], ['bp2', '#4da6ff'], ['cp2', '#ffaa00']].map(([id, col]) => (
                        <radialGradient key={id} id={`rg-${id}`} cx="35%" cy="28%" r="65%">
                          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" /><stop offset="35%" stopColor={col} stopOpacity="0.9" /><stop offset="100%" stopColor={col} stopOpacity="0.55" />
                        </radialGradient>
                      ))}
                      <clipPath id="rrg-bias-clip2"><rect x={PAD.l} y={PAD.t} width={CW} height={CH} /></clipPath>
                      <filter id="rrg-txt-shadow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#000" floodOpacity="1" />
                      </filter>
                    </defs>
                    <rect x={PAD.l} y={PAD.t} width={CW} height={CH} fill="url(#rrg-bg2)" />
                    <rect x={PAD.l} y={PAD.t} width={CW} height={CH} fill="url(#rrg-gloss2)" />
                    {([-1, -0.5, 0, 0.5, 1]).map(v => { const { sx } = toSVG(v * xAxisScale, 0); const col = v > 0 ? '#00ff88' : v < 0 ? '#4da6ff' : 'rgba(255,255,255,0.5)'; const lbl = v === 0 ? '0' : (v > 0 ? '+' : '') + v; return <g key={`xt2-${v}`}><line x1={sx} y1={PAD.t + CH} x2={sx} y2={PAD.t + CH + 5} stroke={col} strokeWidth={1} /><text x={sx} y={PAD.t + CH + 34} textAnchor="middle" fontFamily="'JetBrains Mono',monospace" fontSize={30} fill={col} fontWeight={900} letterSpacing={1}>{lbl}</text></g> })}
                    {([-1, -0.5, 0, 0.5, 1]).map(v => { const { sy } = toSVG(0, v * yAxisScale); const col = v > 0 ? '#00ff88' : v < 0 ? '#ff4444' : 'rgba(255,255,255,0.5)'; const lbl = v === 0 ? '0' : (v > 0 ? '+' : '') + v; return <g key={`yt2-${v}`}><line x1={PAD.l - 5} y1={sy} x2={PAD.l} y2={sy} stroke={col} strokeWidth={1} /><text x={PAD.l - 10} y={sy + 10} textAnchor="end" fontFamily="'JetBrains Mono',monospace" fontSize={30} fill={col} fontWeight={900} letterSpacing={1}>{lbl}</text></g> })}
                    <rect x={PAD.l} y={PAD.t} width={CW} height={CH} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
                    <g clipPath="url(#rrg-bias-clip2)">
                      <g transform={`translate(${rrgTransform.tx},${rrgTransform.ty}) scale(${rrgTransform.k})`}>
                        <rect x={PAD.l} y={PAD.t} width={CW / 2} height={CH / 2} fill="url(#rrg-q-bp)" />
                        <rect x={CX} y={PAD.t} width={CW / 2} height={CH / 2} fill="url(#rrg-q-bc)" />
                        <rect x={PAD.l} y={CY} width={CW / 2} height={CH / 2} fill="url(#rrg-q-cp)" />
                        <rect x={CX} y={CY} width={CW / 2} height={CH / 2} fill="url(#rrg-q-cc)" />
                        {xTicks.map(v => { const { sx } = toSVG(v, 0); const { sy: sy0 } = toSVG(0, -yAxisScale); const { sy: sy1 } = toSVG(0, yAxisScale); return <g key={`igx-${v}`}><line x1={sx} y1={PAD.t} x2={sx} y2={PAD.t + CH} stroke={v === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.06)'} strokeWidth={(v === 0 ? 1.5 : 1) / rrgTransform.k} strokeDasharray={v === 0 ? undefined : '4 8'} /></g> })}
                        {yTicks.map(v => { const { sy } = toSVG(0, v); return <g key={`igy-${v}`}><line x1={PAD.l} y1={sy} x2={PAD.l + CW} y2={sy} stroke={v === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.06)'} strokeWidth={(v === 0 ? 1.5 : 1) / rrgTransform.k} strokeDasharray={v === 0 ? undefined : '4 8'} /></g> })}
                        {(() => {
                          // Pre-compute all dot positions for overlap detection
                          const tickerPositions = allTickers.map(t => {
                            const { sx, sy } = toSVG(t.x, t.y)
                            const r = dotR(t.total)
                            const labelRight = sx < CX
                            const lx = sx + (labelRight ? (r + 5) / rrgTransform.k : -(r + 5) / rrgTransform.k)
                            return { t, sx, sy, r, lx, labelRight, lyOffset: 0 }
                          })
                          // Simple vertical offset: if two labels have similar lx and sy, push one up and one down
                          const fontSize = 22 / rrgTransform.k
                          const lineH = fontSize * 1.1
                          for (let i = 0; i < tickerPositions.length; i++) {
                            for (let j = i + 1; j < tickerPositions.length; j++) {
                              const a = tickerPositions[i], b = tickerPositions[j]
                              const xOverlap = Math.abs(a.lx - b.lx) < fontSize * 4
                              const yOverlap = Math.abs((a.sy + a.lyOffset) - (b.sy + b.lyOffset)) < lineH
                              if (xOverlap && yOverlap) {
                                a.lyOffset -= lineH * 0.5
                                b.lyOffset += lineH * 0.5
                              }
                            }
                          }
                          return tickerPositions.map(({ t, sx, sy, r, lx, labelRight, lyOffset }) => {
                            const gradId = t.quad === 'BC' ? 'rg-bc2' : t.quad === 'CC' ? 'rg-cc2' : t.quad === 'BP' ? 'rg-bp2' : 'rg-cp2'
                            const col = QUAD_COLORS[t.quad]
                            const agg = allAggs.find(a => a.ticker === t.ticker)
                            const isHoverActive = hoveredRegimeMembers.size > 0
                            const isHighlighted = hoveredRegimeMembers.has(t.ticker)

                            // ── Neutrality classification ──
                            // Use classified-only total (same as popup gauge) so percentages match what's displayed
                            let neutralLevel: 'neutral' | 'highlighted' | 'normal' = 'normal'
                            if (agg) {
                              const classifiedTotal = (agg.bullCall + agg.bearCall + agg.bullPut + agg.bearPut) || 1
                              const bc = agg.bullCall / classifiedTotal, cc = agg.bearCall / classifiedTotal
                              const bp = agg.bullPut / classifiedTotal, rp = agg.bearPut / classifiedTotal
                              // GRAY: same instrument, opposing sentiment — Bull Calls+Bear Calls OR Bull Puts+Bear Puts
                              // combined ≥60%, min of either ≥25%
                              const callsNeutral = (bc + cc >= 0.60) && Math.min(bc, cc) >= 0.25
                              const putsNeutral = (bp + rp >= 0.60) && Math.min(bp, rp) >= 0.25
                              // HIGHLIGHTED: opposing instruments, same direction — Bull Calls+Bull Puts OR Bear Calls+Bear Puts
                              // combined ≥65%, min of either ≥25%
                              const bullHighlight = (bc + bp >= 0.65) && Math.min(bc, bp) >= 0.25
                              const bearHighlight = (cc + rp >= 0.65) && Math.min(cc, rp) >= 0.25
                              if (callsNeutral || putsNeutral) neutralLevel = 'neutral'
                              else if (bullHighlight || bearHighlight) neutralLevel = 'highlighted'
                            }

                            const baseOpacity = neutralLevel === 'neutral' ? 0.2 : 1
                            const baseFilter = neutralLevel === 'neutral' ? 'grayscale(1) brightness(0.5)' : neutralLevel === 'highlighted' ? `drop-shadow(0 0 6px ${col}) brightness(1.2)` : undefined

                            const tickerOpacity = isHoverActive ? (isHighlighted ? 1 : 0.1) : baseOpacity
                            const tickerFilter = isHoverActive ? (isHighlighted ? `drop-shadow(0 0 8px ${col}) brightness(1.4)` : undefined) : baseFilter
                            return (
                              <g key={t.ticker} style={{ cursor: 'pointer', opacity: tickerOpacity, filter: tickerFilter, transition: 'opacity 0.15s, filter 0.15s' }} onDoubleClick={() => agg && setRrgPopupTicker(agg)}>
                                <circle cx={sx} cy={sy} r={(r + 5) / rrgTransform.k} fill="transparent" />
                                <circle cx={sx + 1.5 / rrgTransform.k} cy={sy + 1.5 / rrgTransform.k} r={r / rrgTransform.k} fill="rgba(0,0,0,0.5)" />
                                <circle cx={sx} cy={sy} r={r / rrgTransform.k} fill={`url(#${gradId})`} stroke={col} strokeWidth={1.2 / rrgTransform.k} />
                                <text x={lx} y={sy + 4 / rrgTransform.k + lyOffset} textAnchor={labelRight ? 'start' : 'end'} fontFamily="system-ui,sans-serif" fontSize={22 / rrgTransform.k} fontWeight={700} fill={col} filter="url(#rrg-txt-shadow)" style={{ pointerEvents: 'all', userSelect: 'none' }}>{t.ticker}</text>
                              </g>
                            )
                          })
                        })()}
                        {/* Quadrant labels — inside the transform group so they stay
                            anchored to their quadrant when the user pans/zooms.
                            Sizes are divided by k to stay visually constant. */}
                        {(() => {
                          const k = rrgTransform.k
                          const qlabels = [
                            { label: 'BULL PUTS', g0: '#7dd3fc', g1: '#0ea5e9', x: PAD.l + CW / 4, y: PAD.t + 22 / k },
                            { label: 'BULL CALLS', g0: '#6ee7b7', g1: '#10b981', x: CX + CW / 4, y: PAD.t + 22 / k },
                            { label: 'BEAR PUTS', g0: '#fcd34d', g1: '#f59e0b', x: PAD.l + CW / 4, y: PAD.t + CH - 22 / k },
                            { label: 'BEAR CALLS', g0: '#fca5a5', g1: '#ef4444', x: CX + CW / 4, y: PAD.t + CH - 22 / k },
                          ]
                          const tw = 150 / k, th = 24 / k, fs = 17 / k
                          return qlabels.map(({ label, g0, g1, x, y }, i) => (
                            <g key={label}>
                              <defs>
                                <linearGradient id={`qlg${i}`} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor={g0} stopOpacity="1" />
                                  <stop offset="100%" stopColor={g1} stopOpacity="1" />
                                </linearGradient>
                              </defs>
                              <rect x={x - tw / 2} y={y - th / 2} width={tw} height={th} rx={th / 2} fill={`url(#qlg${i})`} />
                              <rect x={x - tw / 2 + 3 / k} y={y - th / 2 + 2 / k} width={tw - 6 / k} height={th / 2 - 3 / k} rx={(th / 2 - 3 / k) / 2} fill="rgba(255,255,255,0.32)" />
                              <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontFamily="'JetBrains Mono',monospace" fontSize={fs} fontWeight={900} fill="#000" letterSpacing={2 / k}>{label}</text>
                            </g>
                          ))
                        })()}
                        {/* ── Regime & RegimeGrouping overlays ── */}
                        {(showRegime || showRegimeGrouping) && (() => {
                          // Group tickers by industry per quadrant
                          const byIndustryQuad: Record<string, Array<{ t: typeof allTickers[0]; sx: number; sy: number }>> = {}
                          for (const t of allTickers) {
                            const industry = RRG_INDUSTRY[t.ticker]
                            if (!industry) continue
                            const { sx, sy } = toSVG(t.x, t.y)
                            const key = `${industry}::${t.quad}`
                            if (!byIndustryQuad[key]) byIndustryQuad[key] = []
                            byIndustryQuad[key].push({ t, sx, sy })
                          }

                          const elements: React.ReactNode[] = []
                          const titleElements: React.ReactNode[] = []
                          let regimeGroupColorIdx = 0

                          // ── Regime: 3+ same industry in ONE quadrant ──
                          if (showRegime) {
                            Object.entries(byIndustryQuad).forEach(([key, members]) => {
                              if (members.length < 3) return
                              const [industry] = key.split('::')
                              const xs = members.map(m => m.sx), ys = members.map(m => m.sy)
                              const cx2 = xs.reduce((a, b) => a + b, 0) / xs.length
                              const cy2 = ys.reduce((a, b) => a + b, 0) / ys.length
                              const maxDist = Math.max(...members.map(m => Math.sqrt((m.sx - cx2) ** 2 + (m.sy - cy2) ** 2)))
                              const rad = maxDist + 28 / rrgTransform.k
                              const animId = `regime-anim-${key.replace(/[^a-z0-9]/gi, '')}`
                              const memberSymbols = members.map(m => m.t.ticker)
                              elements.push(
                                <g key={`regime-${key}`} style={{ pointerEvents: 'none' }}>
                                  <defs>
                                    <radialGradient id={`rg-regime-${animId}`} cx="50%" cy="50%" r="50%">
                                      <stop offset="60%" stopColor="#a78bfa" stopOpacity="0" />
                                      <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.18" />
                                    </radialGradient>
                                  </defs>
                                  <circle cx={cx2} cy={cy2} r={rad} fill={`url(#rg-regime-${animId})`} />
                                  <circle cx={cx2} cy={cy2} r={rad} fill="none" stroke="#a78bfa" strokeWidth={2 / rrgTransform.k} strokeDasharray={`${14 / rrgTransform.k} ${7 / rrgTransform.k}`} strokeOpacity={0.85}>
                                    <animateTransform attributeName="transform" type="rotate" from={`0 ${cx2} ${cy2}`} to={`360 ${cx2} ${cy2}`} dur="8s" repeatCount="indefinite" />
                                  </circle>
                                  <circle cx={cx2} cy={cy2} r={rad * 0.88} fill="none" stroke="#c4b5fd" strokeWidth={1 / rrgTransform.k} strokeDasharray={`${7 / rrgTransform.k} ${14 / rrgTransform.k}`} strokeOpacity={0.5}>
                                    <animateTransform attributeName="transform" type="rotate" from={`360 ${cx2} ${cy2}`} to={`0 ${cx2} ${cy2}`} dur="12s" repeatCount="indefinite" />
                                  </circle>
                                </g>
                              )
                              titleElements.push(
                                <g key={`regime-title-${key}`}
                                  style={{ cursor: 'default' }}
                                  onMouseEnter={() => setHoveredRegimeMembers(new Set(memberSymbols))}
                                  onMouseLeave={() => setHoveredRegimeMembers(new Set())}
                                >
                                  {(() => { const label = `REGIME · ${industry.toUpperCase()}`; const fs2 = 16 / rrgTransform.k; const pad = 6 / rrgTransform.k; const bw = label.length * fs2 * 0.62; const bh = fs2 + pad * 2; const bx = cx2 - bw / 2; const by = cy2 - rad - 10 / rrgTransform.k - bh; return (<g><rect x={bx} y={by} width={bw} height={bh} rx={3 / rrgTransform.k} fill="#000000" stroke="#a78bfa" strokeWidth={1 / rrgTransform.k} strokeOpacity={0.6} /><text x={cx2} y={by + bh / 2} textAnchor="middle" dominantBaseline="central" fontFamily="system-ui,sans-serif" fontSize={fs2} fontWeight={700} fill="#ffffff">{label}</text></g>) })()}
                                </g>
                              )
                            })
                          }

                          // ── RegimeGrouping: 2+ same industry across 2 same-side quadrants ──
                          if (showRegimeGrouping) {
                            const industries = new Set(Object.values(RRG_INDUSTRY))
                            const GROUPING_COLORS = ['#94a3b8', '#c084fc', '#67e8f9', '#86efac']
                            industries.forEach(industry => {
                              const bullish = [
                                ...(byIndustryQuad[`${industry}::BC`] ?? []),
                                ...(byIndustryQuad[`${industry}::BP`] ?? []),
                              ]
                              const bearish = [
                                ...(byIndustryQuad[`${industry}::CC`] ?? []),
                                ...(byIndustryQuad[`${industry}::CP`] ?? []),
                              ]
                              for (const group of [bullish, bearish]) {
                                // Must span 2 quadrants (tickers in both quads of same side)
                                const quadsPresent = new Set(group.map(m => m.t.quad))
                                if (quadsPresent.size < 2 || group.length < 2) return
                                const xs = group.map(m => m.sx), ys = group.map(m => m.sy)
                                const cx2 = xs.reduce((a, b) => a + b, 0) / xs.length
                                const cy2 = ys.reduce((a, b) => a + b, 0) / ys.length
                                const maxDist = Math.max(...group.map(m => Math.sqrt((m.sx - cx2) ** 2 + (m.sy - cy2) ** 2)))
                                const rx = (Math.max(...xs) - Math.min(...xs)) / 2 + 40 / rrgTransform.k
                                const ry = (Math.max(...ys) - Math.min(...ys)) / 2 + 40 / rrgTransform.k
                                const col = GROUPING_COLORS[regimeGroupColorIdx % GROUPING_COLORS.length]
                                const gradId = `rg-grp-${industry.replace(/[^a-z0-9]/gi, '')}-${regimeGroupColorIdx}`
                                const groupSymbols = group.map(m => m.t.ticker)
                                regimeGroupColorIdx++
                                elements.push(
                                  <g key={`grp-${industry}-${[...quadsPresent].join('')}`} style={{ pointerEvents: 'none' }}>
                                    <defs>
                                      <radialGradient id={gradId} cx="50%" cy="30%" r="70%">
                                        <stop offset="0%" stopColor={col} stopOpacity="0.22" />
                                        <stop offset="55%" stopColor={col} stopOpacity="0.08" />
                                        <stop offset="100%" stopColor={col} stopOpacity="0" />
                                      </radialGradient>
                                    </defs>
                                    <ellipse cx={cx2} cy={cy2} rx={rx} ry={ry} fill={`url(#${gradId})`} />
                                    <ellipse cx={cx2} cy={cy2} rx={rx} ry={ry} fill="none" stroke={col} strokeWidth={2.5 / rrgTransform.k} strokeOpacity={0.7} />
                                    {/* Gloss highlight at top of dome */}
                                    <ellipse cx={cx2} cy={cy2 - ry * 0.3} rx={rx * 0.6} ry={ry * 0.2} fill={col} opacity={0.12} />
                                  </g>
                                )
                                titleElements.push(
                                  <g key={`grp-title-${industry}-${[...quadsPresent].join('')}`}
                                    style={{ cursor: 'default' }}
                                    onMouseEnter={() => setHoveredRegimeMembers(new Set(groupSymbols))}
                                    onMouseLeave={() => setHoveredRegimeMembers(new Set())}
                                  >
                                    {(() => { const label = `REGIME GROUP · ${industry.toUpperCase()}`; const fs2 = 15 / rrgTransform.k; const pad = 6 / rrgTransform.k; const bw = label.length * fs2 * 0.62; const bh = fs2 + pad * 2; const bx = cx2 - bw / 2; const by = cy2 - ry - 10 / rrgTransform.k - bh; return (<g><rect x={bx} y={by} width={bw} height={bh} rx={3 / rrgTransform.k} fill="#000000" stroke="#ff8800" strokeWidth={1 / rrgTransform.k} strokeOpacity={0.6} /><text x={cx2} y={by + bh / 2} textAnchor="middle" dominantBaseline="central" fontFamily="system-ui,sans-serif" fontSize={fs2} fontWeight={700} fill="#ff8800">{label}</text></g>) })()}
                                  </g>
                                )
                              }
                            })
                          }

                          return [...elements, ...titleElements]
                        })()}
                      </g>
                    </g>
                  </svg>
                )
              })() : (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
                  <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 12, color: '#2a2a3a', letterSpacing: '0.15em' }}>
                    {biasRRGLoading ? 'COMPUTING ROTATION...' : 'CLICK RUN SCAN TO PLOT FLOW ROTATION'}
                  </span>
                </div>
              )}
            </div>
            {/* Double-click popup */}
            {rrgPopupTicker && (() => {
              const p = rrgPopupTicker
              const classifiedTotal = (p.bullCall + p.bearCall + p.bullPut + p.bearPut) || 1
              const score = (p.bullCall + p.bullPut - p.bearCall - p.bearPut) / classifiedTotal
              const dominant = Math.max(p.bullCall, p.bearCall, p.bullPut, p.bearPut)
              const col = dominant === p.bullCall ? '#00ff88' : dominant === p.bearCall ? '#ff4444' : dominant === p.bullPut ? '#4da6ff' : '#ffaa00'
              const quadLabel = dominant === p.bullCall ? 'BULL CALLS' : dominant === p.bearCall ? 'BEAR CALLS' : dominant === p.bullPut ? 'BULL PUTS' : 'BEAR PUTS'

              // Build intraday time-series from raw trade data
              const rawTrades = allScanCacheRef.current?.flowData ?? []
              const tickerTrades = rawTrades.filter(t => t.underlying_ticker === p.ticker)
              // Bucket by 30-min slots
              const buckets = new Map<number, { bc: number; cc: number; bp: number; rp: number; total: number }>()
              for (const t of tickerTrades) {
                const ts = typeof t.trade_timestamp === 'number' ? t.trade_timestamp : new Date(t.trade_timestamp).getTime()
                const slot = Math.floor(ts / (30 * 60 * 1000)) * (30 * 60 * 1000)
                if (!buckets.has(slot)) buckets.set(slot, { bc: 0, cc: 0, bp: 0, rp: 0, total: 0 })
                const b = buckets.get(slot)!
                const prem = t.total_premium || 0
                const fs = (t as any).fill_style as string | undefined
                const isCall = t.type?.toLowerCase() === 'call'
                const isBull = !fs || fs === 'N/A' || fs === 'A' || fs === 'AA'
                const isBear = fs === 'B' || fs === 'BB'
                b.total += prem
                if (isCall) { if (isBull) b.bc += prem; else if (isBear) b.cc += prem }
                else { if (isBull) b.bp += prem; else if (isBear) b.rp += prem }
              }
              const slots = [...buckets.entries()].sort((a, b) => a[0] - b[0])
              // Build cumulative series
              let cumBc = 0, cumCc = 0, cumBp = 0, cumRp = 0
              const series = slots.map(([ts, b]) => {
                cumBc += b.bc; cumCc += b.cc; cumBp += b.bp; cumRp += b.rp
                const tot = cumBc + cumCc + cumBp + cumRp || 1
                return { ts, bcPct: cumBc / tot * 100, ccPct: cumCc / tot * 100, bpPct: cumBp / tot * 100, rpPct: cumRp / tot * 100, slotTotal: b.total }
              })

              // Stats
              const FLOW_COLORS = { bc: '#00ff88', cc: '#ff4444', bp: '#4da6ff', rp: '#ffaa00' }
              const stats = [
                { key: 'bc', label: 'BULL CALLS', val: p.bullCall / classifiedTotal * 100, color: FLOW_COLORS.bc },
                { key: 'cc', label: 'BEAR CALLS', val: p.bearCall / classifiedTotal * 100, color: FLOW_COLORS.cc },
                { key: 'bp', label: 'BULL PUTS', val: p.bullPut / classifiedTotal * 100, color: FLOW_COLORS.bp },
                { key: 'rp', label: 'BEAR PUTS', val: p.bearPut / classifiedTotal * 100, color: FLOW_COLORS.rp },
              ].sort((a, b) => b.val - a.val)

              // Chart: 25% bigger, tight right label
              const CW = 520, CH = 300, LABEL_W = 38
              const keys: Array<keyof typeof FLOW_COLORS> = ['bc', 'cc', 'bp', 'rp']
              const maxY = 100

              // Zoom/pan state lives in the IIFE via refs trick — use local vars updated by handlers
              // We store zoom+pan as a viewBox offset
              const chartContainerRef = { panX: 0, zoom: 1 } // dummy — real state below

              const toX = (i: number) => series.length < 2 ? CW / 2 : (i / (series.length - 1)) * CW
              const toY = (pct: number) => 4 + (CH - 8) * (1 - pct / maxY)

              // Inline 1-row liquid boxes (same color/fill logic as FlowQuadrantGauge)
              const BW = 128, BH = 90, Bamp = 5
              const bSpeeds = [2.0, 2.6, 1.8, 2.3]
              const boxTotal = (p.bullCall + p.bearCall + p.bullPut + p.bearPut) || 1
              const rowBoxes = [
                { id: 'bc', lbl: 'BULL CALLS', val: p.bullCall, color: '#10b981' },
                { id: 'cc', lbl: 'BEAR CALLS', val: p.bearCall, color: '#ef4444' },
                { id: 'bp', lbl: 'BULL PUTS', val: p.bullPut, color: '#3b82f6' },
                { id: 'rp', lbl: 'BEAR PUTS', val: p.bearPut, color: '#f97316' },
              ]
              const absScore = Math.abs(score)
              const scoreColor2 = absScore < 0.2 ? '#eab308' : score > 0 ? '#10b981' : '#ef4444'

              return (
                <div onClick={() => setRrgPopupTicker(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
                  <div onClick={e => e.stopPropagation()} style={{ background: 'linear-gradient(160deg,#0d0d14 0%,#060608 100%)', border: `1px solid ${col}33`, borderRadius: 16, padding: '28px 32px', width: 660, maxWidth: '95vw', boxShadow: `0 0 80px ${col}18, inset 0 1px 0 rgba(255,255,255,0.06)` }}>

                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 12, height: 12, borderRadius: '50%', background: col }} />
                        <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 26, fontWeight: 900, color: '#fff', letterSpacing: '0.05em' }}>{p.ticker}</span>
                        <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, fontWeight: 900, color: col, padding: '3px 10px', border: `1px solid ${col}55`, borderRadius: 4 }}>{quadLabel}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 16, color: score > 0 ? '#00ff88' : '#ff4444', fontWeight: 800 }}>${(p.total / 1e6).toFixed(1)}M</span>
                        <button onClick={() => setRrgPopupTicker(null)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#fff', fontFamily: 'JetBrains Mono,monospace', fontSize: 16, fontWeight: 700, padding: '3px 12px', cursor: 'pointer' }}>✕</button>
                      </div>
                    </div>

                    {/* 1-row liquid boxes */}
                    <div style={{ marginBottom: 20 }}>
                      <svg width="100%" viewBox={`0 0 ${(BW + 6) * 4 - 6} ${BH}`} style={{ overflow: 'visible', display: 'block' }}>
                        <style>{`
                          @keyframes bw0{from{transform:translateX(0)}to{transform:translateX(-${BW}px)}}
                          @keyframes bw1{from{transform:translateX(0)}to{transform:translateX(-${BW}px)}}
                          @keyframes bw2{from{transform:translateX(0)}to{transform:translateX(-${BW}px)}}
                          @keyframes bw3{from{transform:translateX(0)}to{transform:translateX(-${BW}px)}}
                        `}</style>
                        {rowBoxes.map((b, i) => {
                          const fill = b.val / boxTotal
                          const liquidH = fill * BH
                          const bx = i * (BW + 6)
                          const waveY = BH - liquidH
                          const wx = -BW
                          const wp = `M${wx} ${waveY} q${BW / 4} ${-Bamp} ${BW / 2} 0 q${BW / 4} ${Bamp} ${BW / 2} 0 q${BW / 4} ${-Bamp} ${BW / 2} 0 q${BW / 4} ${Bamp} ${BW / 2} 0 q${BW / 4} ${-Bamp} ${BW / 2} 0 q${BW / 4} ${Bamp} ${BW / 2} 0 V${BH} H${wx} Z`
                          const clipId = `pb${i}`
                          return (
                            <g key={b.id} transform={`translate(${bx},0)`}>
                              <defs><clipPath id={clipId}><rect x={0} y={0} width={BW} height={BH} rx="4" /></clipPath></defs>
                              <rect x={0} y={0} width={BW} height={BH} rx="4" fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.07)" strokeWidth="0.5" />
                              <g clipPath={`url(#${clipId})`}>
                                {fill > 0.005 && (<>
                                  <rect x={0} y={Math.max(0, waveY + Bamp)} width={BW} height={Math.max(0, BH - Math.max(0, waveY + Bamp))} fill={b.color} opacity={0.35} />
                                  <g style={{ animationName: `bw${i}`, animationDuration: `${bSpeeds[i]}s`, animationTimingFunction: 'linear', animationIterationCount: 'infinite' }}>
                                    <path d={wp} fill={b.color} opacity={0.65} />
                                  </g>
                                </>)}
                              </g>
                              <text x={BW / 2} y={18} textAnchor="middle" fill="#fff" fontSize="12" fontFamily="JetBrains Mono,monospace" fontWeight="700">{b.lbl}</text>
                              <text x={BW / 2} y={BH - 10} textAnchor="middle" fill="#fff" fontSize="26" fontFamily="JetBrains Mono,monospace" fontWeight="800">{(fill * 100).toFixed(0)}%</text>
                            </g>
                          )
                        })}
                        {/* Center NEU score overlay */}
                        <circle cx={(BW + 6) * 2 - 3} cy={BH / 2} r={22} fill="rgba(4,4,12,0.92)" stroke="rgba(255,255,255,0.13)" strokeWidth="1" />
                        <text x={(BW + 6) * 2 - 3} y={BH / 2 - 7} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize="11" fontFamily="JetBrains Mono,monospace" fontWeight="700">NEU</text>
                        <text x={(BW + 6) * 2 - 3} y={BH / 2 + 8} textAnchor="middle" dominantBaseline="middle" fill={scoreColor2} fontSize="13" fontFamily="JetBrains Mono,monospace" fontWeight="800">{score.toFixed(2)}</text>
                      </svg>
                    </div>

                    {/* Intraday chart with zoom/pan */}
                    <div>
                      <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 15, color: '#fff', fontWeight: 800, letterSpacing: '0.2em', marginBottom: 8, textAlign: 'center' }}>INTRADAY FLOW COMPOSITION</div>
                      {series.length < 2 ? (
                        <div style={{ height: CH, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'JetBrains Mono,monospace', fontSize: 13 }}>NOT ENOUGH DATA</div>
                      ) : (() => {
                        // All data drawn at full width; zoom/pan via <g transform> + clip. No viewBox manipulation.
                        const PAD_L = 14, PAD_R = 58
                        const chartW = CW - PAD_L  // data area width
                        const toXd = (i: number) => PAD_L + (series.length < 2 ? chartW / 2 : (i / (series.length - 1)) * chartW)

                        const clipId = `fc-clip-${p.ticker.replace(/[^a-z0-9]/gi, '')}`
                        const groupId = `fc-g-${p.ticker.replace(/[^a-z0-9]/gi, '')}`
                        const labId = `fc-lab-${p.ticker.replace(/[^a-z0-9]/gi, '')}`
                        const axId = `fc-ax-${p.ticker.replace(/[^a-z0-9]/gi, '')}`

                        // Ref callback: attach wheel + drag listeners once, manipulate DOM directly
                        const svgRef = (svg: SVGSVGElement | null) => {
                          if (!svg || svg.dataset.zoomInit) return
                          svg.dataset.zoomInit = '1'
                          let z = 1, panX = 0
                          const totalW = CW + PAD_R
                          const g = svg.querySelector<SVGGElement>(`#${groupId}`)!
                          const labG = svg.querySelector<SVGGElement>(`#${labId}`)!
                          const axG = svg.querySelector<SVGGElement>(`#${axId}`)!

                          const update = () => {
                            // Transform: scale then shift so data at panX maps to x=0
                            g.setAttribute('transform', `scale(${z},1) translate(${-panX / z * (z > 1 ? 1 : 1)},0)`)
                            // Actually correct: screen_x = (dataX - panX) * z
                            // => transform on g: translate(-panX,0) then scale around origin... easier as matrix
                            // Use: translate then scale
                            g.setAttribute('transform', `translate(${-panX * z},0) scale(${z},1)`)

                            // Reposition end-of-line % labels to stay at right edge in screen coords
                            keys.forEach(k => {
                              const pctKey = `${k}Pct` as keyof typeof series[0]
                              const lastI = series.length - 1
                              const dataX = toXd(lastI)
                              const screenX = (dataX - panX) * z  // wait, wrong since g is already translated
                              // Actually with transform translate(-panX*z,0) scale(z,1):
                              // a point at dataX maps to: dataX * z - panX * z = (dataX - panX) * z
                              const sx = Math.min(CW - 2, Math.max(PAD_L, (dataX - panX) * z))
                              const lastVal = series[lastI][pctKey] as number
                              const labelEl = labG.querySelector<SVGTextElement>(`[data-key="${k}"]`)
                              const dotEl = labG.querySelector<SVGCircleElement>(`[data-dot="${k}"]`)
                              if (labelEl) { labelEl.setAttribute('x', String(sx + 8)); labelEl.setAttribute('visibility', sx < CW - 5 ? 'visible' : 'hidden') }
                              if (dotEl) { dotEl.setAttribute('cx', String(sx)); dotEl.setAttribute('visibility', sx < CW - 2 && sx > PAD_L ? 'visible' : 'hidden') }
                            })

                            // Reposition x-axis time labels
                            axG.querySelectorAll<SVGTextElement>('[data-ts]').forEach(el => {
                              const i = parseInt(el.dataset.si || '0')
                              const dataX = toXd(i)
                              const sx = (dataX - panX) * z
                              el.setAttribute('x', String(sx))
                              el.setAttribute('visibility', sx >= PAD_L && sx <= CW ? 'visible' : 'hidden')
                            })
                          }

                          svg.addEventListener('wheel', (e) => {
                            e.preventDefault()
                            const rect = svg.getBoundingClientRect()
                            const mouseFrac = (e.clientX - rect.left) / rect.width
                            // data x under mouse: panX + mouseFrac * (totalW / z)
                            const dataUnderMouse = panX + mouseFrac * (totalW / z)
                            const delta = e.deltaY < 0 ? 1.25 : 0.8
                            z = Math.max(1, Math.min(14, z * delta))
                            panX = Math.max(0, Math.min(totalW - totalW / z, dataUnderMouse - mouseFrac * (totalW / z)))
                            update()
                          }, { passive: false })

                          let dragX = 0, dragging = false, dragPan = 0
                          svg.addEventListener('mousedown', (e) => { dragging = true; dragX = e.clientX; dragPan = panX; svg.style.cursor = 'grabbing' })
                          svg.addEventListener('mousemove', (e) => {
                            if (!dragging) return
                            const rect = svg.getBoundingClientRect()
                            const dx = (dragX - e.clientX) * (totalW / z) / rect.width
                            panX = Math.max(0, Math.min(totalW - totalW / z, dragPan + dx))
                            update()
                          })
                          svg.addEventListener('mouseup', () => { dragging = false; svg.style.cursor = 'grab' })
                          svg.addEventListener('mouseleave', () => { dragging = false; svg.style.cursor = 'grab' })
                          update()
                        }

                        return (
                          <svg ref={svgRef} width="100%" height={CH + 26}
                            style={{ display: 'block', borderRadius: 6, background: '#000', cursor: 'grab', userSelect: 'none', overflow: 'hidden' }}>
                            <defs>
                              <clipPath id={clipId}>
                                <rect x={PAD_L} y={0} width={chartW} height={CH + 2} />
                              </clipPath>
                            </defs>

                            {/* Y-axis labels — fixed, right side outside clip */}
                            {[0, 25, 50, 75, 100].map(pct => (
                              <g key={pct}>
                                <line x1={PAD_L + chartW} y1={toY(pct)} x2={PAD_L + chartW + 5} y2={toY(pct)} stroke="rgba(255,255,255,0.4)" strokeWidth={1} />
                                <text x={PAD_L + chartW + 9} y={toY(pct) + 7} textAnchor="start" fontFamily="JetBrains Mono,monospace" fontSize={20} fontWeight={700} fill="#fff">{pct}%</text>
                              </g>
                            ))}

                            {/* Zoomable/pannable content group — lines only, clipped */}
                            <g id={groupId} clipPath={`url(#${clipId})`}>
                              {keys.map(k => {
                                const color = FLOW_COLORS[k]
                                const pctKey = `${k}Pct` as keyof typeof series[0]
                                const d = series.map((s, i) => `${i === 0 ? 'M' : 'L'}${toXd(i).toFixed(1)},${toY(s[pctKey] as number).toFixed(1)}`).join(' ')
                                return <path key={k} d={d} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
                              })}
                            </g>

                            {/* End-of-line labels — unclipped, repositioned by update() */}
                            <g id={labId}>
                              {keys.map(k => {
                                const color = FLOW_COLORS[k]
                                const pctKey = `${k}Pct` as keyof typeof series[0]
                                const lastVal = series[series.length - 1][pctKey] as number
                                const lastY = toY(lastVal)
                                return (
                                  <g key={k}>
                                    <circle data-dot={k} cx={toXd(series.length - 1)} cy={lastY} r={4} fill={color} />
                                    <text data-key={k} x={toXd(series.length - 1) + 8} y={lastY + 5} fontFamily="JetBrains Mono,monospace" fontSize={15} fontWeight={800} fill={color}>{lastVal.toFixed(0)}%</text>
                                  </g>
                                )
                              })}
                            </g>

                            {/* X-axis time labels — unclipped, repositioned by update() */}
                            <g id={axId}>
                              {series.map((s, i) => {
                                const step = Math.max(1, Math.floor(series.length / 5))
                                const show = i === 0 || (i % step === 0 && i < series.length - Math.floor(step * 0.6))
                                if (!show) return null
                                return (
                                  <text key={s.ts} data-ts={s.ts} data-si={i}
                                    x={toXd(i)} y={CH + 18} textAnchor="middle"
                                    fontFamily="JetBrains Mono,monospace" fontSize={20} fontWeight={700} fill="#fff">
                                    {new Date(s.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                                  </text>
                                )
                              })}
                            </g>
                          </svg>
                        )
                      })()}
                      {/* Legend */}
                      <div style={{ display: 'flex', gap: 16, marginTop: 10, justifyContent: 'center' }}>
                        {keys.map(k => (
                          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 18, height: 2.5, background: FLOW_COLORS[k], borderRadius: 1 }} />
                            <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 10, fontWeight: 700, color: FLOW_COLORS[k] }}>
                              {k === 'bc' ? 'BULL CALLS' : k === 'cc' ? 'BEAR CALLS' : k === 'bp' ? 'BULL PUTS' : 'BEAR PUTS'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        )}
      </div>{/* end main content row */}
    </div>
  )
}
