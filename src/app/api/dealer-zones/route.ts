import { NextRequest, NextResponse } from 'next/server'

// Exact Black-Scholes vanna — mirrors DealerAttraction's calculateVanna
function calcVanna(
  strike: number,
  spotPrice: number,
  T: number,
  impliedVol: number,
  r = 0.0408
): number {
  if (T <= 0 || impliedVol <= 0 || spotPrice <= 0) return 0
  const d1 =
    (Math.log(spotPrice / strike) + (r + (impliedVol * impliedVol) / 2) * T) /
    (impliedVol * Math.sqrt(T))
  const d2 = d1 - impliedVol * Math.sqrt(T)
  const nPrime_d1 = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * d1 * d1)
  return -Math.exp(-r * T) * nPrime_d1 * (d2 / impliedVol)
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const ticker = searchParams.get('ticker') || searchParams.get('symbol') || ''

  if (!ticker) {
    return NextResponse.json({ success: false, error: 'ticker required' }, { status: 400 })
  }

  try {
    // Use the same endpoint routing as DealerAttraction's fetchOptionsData
    const tickerUpper = ticker.toUpperCase()
    const apiEndpoint =
      tickerUpper === 'SPX'
        ? `/api/spx-fix?ticker=${ticker}`
        : tickerUpper === 'VIX'
          ? `/api/vix-fix?ticker=${ticker}`
          : `/api/options-chain?ticker=${ticker}`

    // Resolve absolute URL for server-side fetch
    const base = request.nextUrl.origin
    const optionsRes = await fetch(`${base}${apiEndpoint}`)
    const optionsResult = await optionsRes.json()

    if (!optionsResult.success || !optionsResult.data) {
      return NextResponse.json(
        { success: false, error: optionsResult.error || 'Failed to fetch options data' },
        { status: 502 }
      )
    }

    const currentPrice: number = optionsResult.currentPrice || 0
    const allExpiriesData: Record<string, { calls: any; puts: any }> = optionsResult.data
    const today = new Date()

    // Exact DealerAttraction constants
    const beta = 0.25
    const rho_S_sigma = -0.7
    const contractMult = 100

    // Track per-(strike × expiry) cell — same as DealerAttraction's dealerByStrikeByExp
    const cells: Array<{
      strike: number
      expiry: string
      callDealer: number
      putDealer: number
    }> = []
    const cellMap: Record<string, number> = {} // key → index in cells[]
    const allIVContracts: Array<{ strike: number; iv: number }> = []
    // Raw input debug map: key=`${strike}_${expiry}` → inputs for each side
    const debugMap: Record<
      string,
      {
        call?: {
          oi: number
          gamma: number
          delta: number
          vannaRaw: number
          vannaUsed: number
          iv: number
          T: number
          gammaEff: number
          liveWeight: number
          dealerValue: number
        }
        put?: {
          oi: number
          gamma: number
          delta: number
          vannaRaw: number
          vannaUsed: number
          iv: number
          T: number
          gammaEff: number
          liveWeight: number
          dealerValue: number
        }
      }
    > = {}

    const allExpirations = Object.keys(allExpiriesData).sort()

    // Mirror DA's filterTo3Months — only process expirations within 3 calendar months
    const threeMonthsFromNow = new Date(today)
    threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3)
    const expirations = allExpirations.filter((exp) => {
      const d = new Date(exp + 'T00:00:00Z')
      return d <= threeMonthsFromNow
    })

    for (const expDate of expirations) {
      const expDateObj = new Date(expDate)
      const diffMs = expDateObj.getTime() - today.getTime()
      const rawT = diffMs / (365 * 24 * 60 * 60 * 1000)
      // Clamp only for the dealer formula (same as DA: Math.max(..., 0.001))
      // Keep rawT separate so vanna fallback mirrors DA: calculateVanna returns 0 when T<=0
      const T = Math.max(rawT, 0.001)
      const expData = allExpiriesData[expDate]
      if (!expData) continue

      // ── Calls — exact DealerAttraction STEP 1 ──
      Object.entries(expData.calls || {}).forEach(([strikeStr, d]: [string, any]) => {
        const oi = d.open_interest || 0
        if (oi <= 0) return // Exact DealerAttraction: "if (oi > 0)"

        const strike = parseFloat(strikeStr)
        const gamma = d.greeks?.gamma || 0
        const delta = d.greeks?.delta || 0
        const iv = d.implied_volatility || 0.3

        let vanna = d.greeks?.vanna || 0
        // Mirror DA exactly: only compute BS vanna fallback when T > 0 (raw, unclamped)
        // DA uses new Date(expDate) - new Date() before clamping, so for 0DTE T<=0 → calculateVanna returns 0
        if (vanna === 0 && gamma !== 0 && rawT > 0) {
          vanna = calcVanna(strike, currentPrice, rawT, iv)
        }

        // Exact DealerAttraction dealer formula for calls
        const gammaEff = gamma + beta * vanna * rho_S_sigma
        const liveWeight = Math.abs(delta) * (1 - Math.abs(delta))
        const vannaRaw = d.greeks?.vanna || 0
        const dealerValue =
          oi * gammaEff * liveWeight * (1 / Math.sqrt(T)) * currentPrice * contractMult

        const key = `${strike}_${expDate}`
        if (!debugMap[key]) debugMap[key] = {}
        debugMap[key].call = {
          oi,
          gamma,
          delta,
          vannaRaw,
          vannaUsed: vanna,
          iv,
          T,
          gammaEff,
          liveWeight,
          dealerValue,
        }
        if (key in cellMap) {
          cells[cellMap[key]].callDealer += dealerValue
        } else {
          cellMap[key] = cells.length
          cells.push({ strike, expiry: expDate, callDealer: dealerValue, putDealer: 0 })
        }

        if (iv > 0) allIVContracts.push({ strike, iv })
      })

      // ── Puts — exact DealerAttraction STEP 2 ──
      Object.entries(expData.puts || {}).forEach(([strikeStr, d]: [string, any]) => {
        const oi = d.open_interest || 0
        if (oi <= 0) return

        const strike = parseFloat(strikeStr)
        const gamma = d.greeks?.gamma || 0
        const delta = d.greeks?.delta || 0
        const iv = d.implied_volatility || 0.3

        let vanna = d.greeks?.vanna || 0
        if (vanna === 0 && gamma !== 0 && rawT > 0) {
          vanna = calcVanna(strike, currentPrice, rawT, iv)
        }

        // Exact DealerAttraction dealer formula for puts (negative)
        const gammaEff = gamma + beta * vanna * rho_S_sigma
        const liveWeight = Math.abs(delta) * (1 - Math.abs(delta))
        const vannaRaw = d.greeks?.vanna || 0
        const dealerValue =
          -oi * gammaEff * liveWeight * (1 / Math.sqrt(T)) * currentPrice * contractMult

        const key = `${strike}_${expDate}`
        if (!debugMap[key]) debugMap[key] = {}
        debugMap[key].put = {
          oi,
          gamma,
          delta,
          vannaRaw,
          vannaUsed: vanna,
          iv,
          T,
          gammaEff,
          liveWeight,
          dealerValue,
        }
        if (key in cellMap) {
          cells[cellMap[key]].putDealer += dealerValue
        } else {
          cellMap[key] = cells.length
          cells.push({ strike, expiry: expDate, callDealer: 0, putDealer: dealerValue })
        }

        if (iv > 0) allIVContracts.push({ strike, iv })
      })
    }

    if (!cells.length) {
      return NextResponse.json({ success: true, golden: null, purple: null, atmIV: null })
    }

    // Exact same logic as DealerAttraction table: highestDealer = max(netDealer), lowestDealer = min(netDealer)
    const withNet = cells.map((c) => ({ ...c, net: c.callDealer + c.putDealer }))
    const goldenCell = withNet
      .filter((c) => c.net > 0)
      .reduce(
        (best, c) => (!best || c.net > best.net ? c : best),
        null as (typeof withNet)[0] | null
      )
    const purpleCell = withNet
      .filter((c) => c.net < 0)
      .reduce(
        (best, c) => (!best || c.net < best.net ? c : best),
        null as (typeof withNet)[0] | null
      )

    // ATM IV for Black-Scholes targets (used by Targets column)
    const atmContracts = allIVContracts.filter(
      (c) => currentPrice > 0 && Math.abs((c.strike - currentPrice) / currentPrice) <= 0.05
    )
    const ivSrc = atmContracts.length > 0 ? atmContracts : allIVContracts.filter((c) => c.iv > 0)
    const atmIV = ivSrc.length > 0 ? ivSrc.reduce((s, c) => s + c.iv, 0) / ivSrc.length : null

    // Top 20 cells by |net| for browser debug
    const top20 = [...withNet]
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
      .slice(0, 20)
      .map((c) => ({
        strike: c.strike,
        expiry: c.expiry,
        callDealer: +c.callDealer.toExponential(3),
        putDealer: +c.putDealer.toExponential(3),
        net: +c.net.toExponential(3),
      }))

    const goldenKey = goldenCell ? `${goldenCell.strike}_${goldenCell.expiry}` : null
    const purpleKey = purpleCell ? `${purpleCell.strike}_${purpleCell.expiry}` : null

    return NextResponse.json({
      success: true,
      currentPrice,
      totalCells: withNet.length,
      golden: goldenCell?.strike ?? null,
      goldenDetail: goldenCell
        ? {
            strike: goldenCell.strike,
            expiry: goldenCell.expiry,
            callDealer: +goldenCell.callDealer.toExponential(3),
            putDealer: +goldenCell.putDealer.toExponential(3),
            net: +goldenCell.net.toExponential(3),
            rawInputs: goldenKey ? (debugMap[goldenKey] ?? null) : null,
          }
        : null,
      purple: purpleCell?.strike ?? null,
      purpleDetail: purpleCell
        ? {
            strike: purpleCell.strike,
            expiry: purpleCell.expiry,
            callDealer: +purpleCell.callDealer.toExponential(3),
            putDealer: +purpleCell.putDealer.toExponential(3),
            net: +purpleCell.net.toExponential(3),
            rawInputs: purpleKey ? (debugMap[purpleKey] ?? null) : null,
          }
        : null,
      atmIV,
      top20,
    })
  } catch (err: any) {
    console.error('[dealer-zones] error:', err)
    return NextResponse.json(
      { success: false, error: err.message || 'Internal error' },
      { status: 500 }
    )
  }
}
