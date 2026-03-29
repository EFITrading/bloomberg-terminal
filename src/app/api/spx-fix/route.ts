import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const ticker = searchParams.get('ticker') || 'SPX'
  const specificExpiration = searchParams.get('expiration')
  const minStrike = searchParams.get('minStrike')
    ? parseFloat(searchParams.get('minStrike')!)
    : null
  const maxStrike = searchParams.get('maxStrike')
    ? parseFloat(searchParams.get('maxStrike')!)
    : null
  const apiKey = process.env.POLYGON_API_KEY

  try {
    // Get current SPX price
    let currentPrice: number | null = null
    try {
      const priceRes = await fetch(`https://api.polygon.io/v2/last/trade/SPX?apikey=${apiKey}`)
      const priceData = await priceRes.json()
      if (priceData.status === 'OK' && priceData.results) {
        currentPrice = priceData.results.p
      }
    } catch (error) {}

    if (specificExpiration) {
      const allContracts: any[] = []
      let nextUrl: string | null =
        `https://api.polygon.io/v3/snapshot/options/I:SPX?expiration_date=${specificExpiration}&limit=250&apikey=${apiKey}`

      let hasSeenCalls = false
      let hasSeenPuts = false
      let callsPassedMax = false
      let putsPassedMax = false

      while (nextUrl && allContracts.length < 10000) {
        const response: Response = await fetch(nextUrl)
        const data: any = await response.json()

        if (data.status === 'OK' && data.results && data.results.length > 0) {
          // Check what contract types are in this page
          const pageHasCalls = data.results.some(
            (c: any) => c.details?.contract_type?.toLowerCase() === 'call'
          )
          const pageHasPuts = data.results.some(
            (c: any) => c.details?.contract_type?.toLowerCase() === 'put'
          )

          if (pageHasCalls) hasSeenCalls = true
          if (pageHasPuts) hasSeenPuts = true

          // Filter by strike range during pagination if provided
          if (minStrike !== null && maxStrike !== null) {
            const filtered = data.results.filter((c: any) => {
              const strike = c.details?.strike_price
              return strike && strike >= minStrike && strike <= maxStrike
            })
            allContracts.push(...filtered)

            // Check if calls or puts have passed their max strikes
            const maxCallStrike = Math.max(
              ...data.results
                .filter((c: any) => c.details?.contract_type?.toLowerCase() === 'call')
                .map((c: any) => c.details?.strike_price || 0)
            )
            const maxPutStrike = Math.max(
              ...data.results
                .filter((c: any) => c.details?.contract_type?.toLowerCase() === 'put')
                .map((c: any) => c.details?.strike_price || 0)
            )

            if (pageHasCalls && maxCallStrike > maxStrike + 100) callsPassedMax = true
            if (pageHasPuts && maxPutStrike > maxStrike + 100) putsPassedMax = true

            // Early exit only if BOTH calls and puts have been seen and both passed max
            if (hasSeenCalls && hasSeenPuts && callsPassedMax && putsPassedMax) {
              break
            }
          } else {
            allContracts.push(...data.results)
          }

          if (!currentPrice && data.results[0]?.underlying_asset?.value) {
            currentPrice = data.results[0].underlying_asset.value
          }

          nextUrl = data.next_url ? `${data.next_url}&apikey=${apiKey}` : null
        } else {
          break
        }
      }

      const calls: Record<string, any> = {}
      const puts: Record<string, any> = {}

      allContracts.forEach((contract: any) => {
        const strike = contract.details?.strike_price?.toString()
        const contractType = contract.details?.contract_type?.toLowerCase()

        if (!strike || !contractType) return

        const contractData = {
          open_interest: contract.open_interest || 0,
          volume: contract.day?.volume || 0,
          strike_price: contract.details.strike_price,
          expiration_date: specificExpiration,
          implied_volatility: contract.implied_volatility,
          greeks: contract.greeks || {
            delta: 0,
            gamma: 0,
            theta: 0,
            vega: 0,
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
        currentPrice: currentPrice,
      })
    }

    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const cutoff = new Date(today)
    cutoff.setMonth(cutoff.getMonth() + 1)
    const cutoffStr = cutoff.toISOString().split('T')[0]

    const groupedByExpiration: Record<
      string,
      { calls: Record<string, any>; puts: Record<string, any> }
    > = {}
    let stoppedEarly = false

    // Single paginated sweep — Polygon returns contracts sorted by expiration asc,
    // so we stop as soon as we see an expiration past the 3-month cutoff.
    // No reference/contracts step. No per-expiration sub-requests.
    let sweepUrl: string | null =
      `https://api.polygon.io/v3/snapshot/options/I:SPX?limit=250&apiKey=${apiKey}`

    while (sweepUrl) {
      const snapRes: Response = await fetch(sweepUrl)
      const snapData: any = await snapRes.json()

      if (!snapData.results || snapData.results.length === 0) break

      for (const contract of snapData.results) {
        const exp = contract.details?.expiration_date
        const strike = contract.details?.strike_price?.toString()
        const type = contract.details?.contract_type?.toLowerCase()

        if (!exp || !strike || !type) continue
        if (exp < todayStr) continue

        if (exp > cutoffStr) {
          stoppedEarly = true
          break
        }

        if (currentPrice === null && contract.underlying_asset?.value) {
          currentPrice = contract.underlying_asset.value
        }

        if (!groupedByExpiration[exp]) {
          groupedByExpiration[exp] = { calls: {}, puts: {} }
        }

        const contractData = {
          open_interest: contract.open_interest || 0,
          volume: contract.day?.volume || 0,
          strike_price: contract.details.strike_price,
          expiration_date: exp,
          implied_volatility: contract.implied_volatility,
          greeks: contract.greeks || { delta: 0, gamma: 0, theta: 0, vega: 0 },
        }

        if (type === 'call') groupedByExpiration[exp].calls[strike] = contractData
        else if (type === 'put') groupedByExpiration[exp].puts[strike] = contractData
      }

      if (stoppedEarly) break

      sweepUrl = snapData.next_url ? `${snapData.next_url}&apiKey=${apiKey}` : null
    }

    const finalExpirationDates = Object.keys(groupedByExpiration).sort()

    return NextResponse.json({
      success: true,
      data: groupedByExpiration,
      currentPrice: currentPrice,
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
