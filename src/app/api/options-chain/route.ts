import { NextRequest, NextResponse } from 'next/server'

// ── Server-side cache: same ticker always returns the same snapshot within 5 min ──
const _cache = new Map<string, { data: any; currentPrice: any; ts: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const ticker = searchParams.get('ticker') || searchParams.get('symbol') || 'SPY'
  const specificExpiration = searchParams.get('expiration')
  const apiKey = process.env.POLYGON_API_KEY!

  try {
    // Get current stock price - handle SPX/VIX differently (use snapshot)
    let currentPrice = null
    try {
      if (ticker === 'SPX' || ticker === 'VIX') {
        // For indices, get price from options snapshot
        const snapshotRes = await fetch(
          `https://api.polygon.io/v3/snapshot/options/I:${ticker}?limit=1&apikey=${apiKey}`
        )
        const snapshotData = await snapshotRes.json()
        if (snapshotData.status === 'OK' && snapshotData.results?.[0]?.underlying_asset) {
          currentPrice = snapshotData.results[0].underlying_asset.value
        }
      } else {
        // Use most recent 1-minute bar close — same as EFI chart
        const today = new Date().toISOString().split('T')[0]
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        const priceRes = await fetch(
          `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/minute/${yesterday}/${today}?adjusted=true&sort=desc&limit=1&apikey=${apiKey}`
        )
        const priceData = await priceRes.json()
        if (priceData.status === 'OK' && priceData.results?.[0]?.c) {
          currentPrice = priceData.results[0].c
        } else {
          // Fallback to prev day close
          const prevRes = await fetch(
            `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apikey=${apiKey}`
          )
          const prevData = await prevRes.json()
          if (prevData.results?.[0]?.c) currentPrice = prevData.results[0].c
        }
      }
    } catch (error) {
      console.error(`Failed to fetch current price for ${ticker}:`, error)
    }

    // If specific expiration requested, get only that expiration
    if (specificExpiration) {
      const allContracts: any[] = []
      let nextUrl: string | null =
        `https://api.polygon.io/v3/snapshot/options/${ticker}?expiration_date=${specificExpiration}&limit=250&apikey=${apiKey}`

      while (nextUrl) {
        const response: Response = await fetch(nextUrl)
        const data: any = await response.json()

        if (data.status !== 'OK') {
          break
        }

        if (data.results && data.results.length > 0) {
          allContracts.push(...data.results)
        }

        nextUrl = data.next_url || null
        if (nextUrl && !nextUrl.includes(apiKey)) {
          nextUrl += `&apikey=${apiKey}`
        }
      }

      if (allContracts.length === 0) {
        return NextResponse.json({
          success: false,
          error: `No options data found for ${ticker} expiration ${specificExpiration}`,
          data: {},
          currentPrice,
        })
      }

      // Process all contracts
      const calls: Record<string, any> = {}
      const puts: Record<string, any> = {}

      allContracts.forEach((contract: any) => {
        const strike = contract.details?.strike_price?.toString()
        const contractType = contract.details?.contract_type?.toLowerCase()

        if (!strike || !contractType) return

        const contractData = {
          open_interest: contract.open_interest || 0,
          strike_price: contract.details.strike_price,
          expiration_date: specificExpiration,
          implied_volatility: contract.implied_volatility,
          last_price: contract.last_quote?.last?.price || contract.day?.close || 0,
          bid: contract.last_quote?.bid || 0,
          ask: contract.last_quote?.ask || 0,
          greeks: {
            delta: contract.greeks?.delta,
            gamma: contract.greeks?.gamma,
            theta: contract.greeks?.theta,
            vega: contract.greeks?.vega,
          },
        }

        if (contractType === 'call') {
          calls[strike] = contractData
        } else if (contractType === 'put') {
          puts[strike] = contractData
        }
      })

      return NextResponse.json({
        success: true,
        data: {
          [specificExpiration]: { calls, puts },
        },
        currentPrice,
        debug: {
          totalContracts: allContracts.length,
          callStrikes: Object.keys(calls).length,
          putStrikes: Object.keys(puts).length,
          requests: 'paginated',
        },
      })
    }

    // If no specific expiration, discover all available expirations
    // ── Cache check: return cached snapshot if still fresh ──
    const cacheKey = ticker.toUpperCase()
    const cached = _cache.get(cacheKey)
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return NextResponse.json({
        success: true,
        data: cached.data,
        currentPrice: currentPrice ?? cached.currentPrice,
        fromCache: true,
      })
    }

    // Single paginated sweep — Polygon returns contracts sorted by expiration asc.
    // Stop as soon as we see a date past the 3-month cutoff. No reference/contracts
    // step, no per-expiration sub-requests, no artificial delays.
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const cutoff = new Date(today)
    cutoff.setMonth(cutoff.getMonth() + 3)
    const cutoffStr = cutoff.toISOString().split('T')[0]

    const groupedByExpiration: Record<
      string,
      { calls: Record<string, any>; puts: Record<string, any> }
    > = {}
    let stoppedEarly = false

    let sweepUrl: string | null =
      `https://api.polygon.io/v3/snapshot/options/${ticker}?limit=250&apikey=${apiKey}`

    while (sweepUrl) {
      const snapRes: Response = await fetch(sweepUrl)
      const snapData: any = await snapRes.json()

      if (!snapData.results || snapData.results.length === 0) break

      for (const contract of snapData.results) {
        const exp = contract.details?.expiration_date
        const strike = contract.details?.strike_price?.toString()
        const contractType = contract.details?.contract_type?.toLowerCase()

        if (!exp || !strike || !contractType) continue
        if (exp < todayStr) continue
        if (exp > cutoffStr) {
          stoppedEarly = true
          break
        }

        if (currentPrice === null && contract.underlying_asset?.value) {
          currentPrice = contract.underlying_asset.value
        }

        if (!groupedByExpiration[exp]) groupedByExpiration[exp] = { calls: {}, puts: {} }

        const contractData = {
          open_interest: contract.open_interest || 0,
          strike_price: contract.details.strike_price,
          expiration_date: exp,
          implied_volatility: contract.implied_volatility,
          last_price: contract.last_quote?.last?.price || contract.day?.close || 0,
          bid: contract.last_quote?.bid || 0,
          ask: contract.last_quote?.ask || 0,
          greeks: {
            delta: contract.greeks?.delta,
            gamma: contract.greeks?.gamma,
            theta: contract.greeks?.theta,
            vega: contract.greeks?.vega,
          },
        }

        if (contractType === 'call') {
          groupedByExpiration[exp].calls[strike] = contractData
        } else if (contractType === 'put') {
          groupedByExpiration[exp].puts[strike] = contractData
        }
      }

      if (stoppedEarly) break

      sweepUrl = snapData.next_url
      if (sweepUrl && !sweepUrl.includes(apiKey)) {
        sweepUrl += `&apikey=${apiKey}`
      }
    }

    const finalExpirationDates = Object.keys(groupedByExpiration).sort()

    // ── Store in cache so next call (DealerAttraction OR OptionsFlow) gets identical data ──
    _cache.set(cacheKey, { data: groupedByExpiration, currentPrice, ts: Date.now() })

    return NextResponse.json({
      success: true,
      data: groupedByExpiration,
      currentPrice,
      debug: {
        expirationDatesFound: finalExpirationDates.length,
        earliestDate: finalExpirationDates[0],
        latestDate: finalExpirationDates[finalExpirationDates.length - 1],
      },
    })
  } catch (error) {
    console.error('Error fetching options data:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch options data',
        data: {},
        currentPrice: null,
      },
      { status: 500 }
    )
  }
}
