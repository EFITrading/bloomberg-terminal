import { NextRequest, NextResponse } from 'next/server'

const POLYGON_API_KEY = process.env.POLYGON_API_KEY

// ── Parse a "Mon DD" string (e.g. "Apr 10") into a UTC Date for the next occurrence ──
function parsePeriodEndDate(periodEnd: string): Date | null {
  const months: Record<string, number> = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11,
  }
  const parts = periodEnd.trim().split(' ')
  if (parts.length < 2) return null
  const mo = months[parts[0]]
  const day = parseInt(parts[1])
  if (mo === undefined || isNaN(day)) return null
  const now = new Date()
  const year = now.getUTCFullYear()
  const candidate = new Date(Date.UTC(year, mo, day))
  // If that date has already passed this year, roll to next year
  if (candidate < now) candidate.setUTCFullYear(year + 1)
  return candidate
}

// ── Fetch real expiration dates from Polygon and return the first one ≥ target ──
async function getExpiryAfter(symbol: string, targetDate: Date, apiKey: string): Promise<string> {
  const minStr = targetDate.toISOString().split('T')[0]
  const maxDate = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000)
  const maxStr = maxDate.toISOString().split('T')[0]
  const url = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${symbol}&expiration_date.gte=${minStr}&expiration_date.lte=${maxStr}&contract_type=call&limit=50&sort=expiration_date&order=asc&apikey=${apiKey}`
  const resp = await fetch(url, { signal: AbortSignal.timeout(6000) })
  const data = await resp.json()
  if (!data.results?.length) {
    throw new Error(`No options expiration found for ${symbol} on or after ${minStr}`)
  }
  return data.results[0].expiration_date as string
}

// ── Black-Scholes (standard normal CDF via Horner's method) ─────────────────
function normalCDF(x: number): number {
  const a1 = 0.254829592,
    a2 = -0.284496736,
    a3 = 1.421413741
  const a4 = -1.453152027,
    a5 = 1.061405429,
    p = 0.3275911
  const sign = x < 0 ? -1 : 1
  const t = 1 / (1 + (p * Math.abs(x)) / Math.sqrt(2))
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp((-x * x) / 2)
  return 0.5 * (1 + sign * y)
}

function bsPrice(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  isCall: boolean
): number {
  if (T <= 0) return isCall ? Math.max(0, S - K) : Math.max(0, K - S)
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T))
  const d2 = d1 - sigma * Math.sqrt(T)
  if (isCall) return S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2)
  return K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1)
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const symbol = searchParams.get('symbol')?.toUpperCase()
  const direction = searchParams.get('direction') // 'call' | 'put'
  const periodEnd = searchParams.get('periodEnd') ?? '' // e.g. "Apr 10"

  if (!symbol || (direction !== 'call' && direction !== 'put')) {
    return NextResponse.json({ error: 'symbol and direction (call|put) required' }, { status: 400 })
  }
  if (!POLYGON_API_KEY) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

  try {
    // Target: first available expiry at least 7 days after the seasonal period end
    const periodEndDate = parsePeriodEndDate(periodEnd)
    const targetDate = periodEndDate
      ? new Date(periodEndDate.getTime() + 7 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // fallback: 2 weeks from now
    const expiryDate = await getExpiryAfter(symbol, targetDate, POLYGON_API_KEY)
    const dte = Math.max(
      1,
      Math.round(
        (new Date(expiryDate + 'T00:00:00Z').getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
    )

    // 1. Current price
    const priceResp = await fetch(
      `https://api.polygon.io/v2/last/trade/${symbol}?apikey=${POLYGON_API_KEY}`,
      { signal: AbortSignal.timeout(5000) }
    )
    const priceData = await priceResp.json()
    const currentPrice: number = priceData.results?.p
    if (!currentPrice) throw new Error('Could not get current price')

    // 2. Fetch ±15% strike range for next monthly expiry, target contract type
    const lower = Math.floor(currentPrice * 0.85)
    const upper = Math.ceil(currentPrice * 1.15)
    const contractsUrl =
      `https://api.polygon.io/v3/reference/options/contracts` +
      `?underlying_ticker=${symbol}` +
      `&expiration_date=${expiryDate}` +
      `&contract_type=${direction}` +
      `&strike_price.gte=${lower}` +
      `&strike_price.lte=${upper}` +
      `&limit=200` +
      `&apikey=${POLYGON_API_KEY}`
    const contractsResp = await fetch(contractsUrl, { signal: AbortSignal.timeout(8000) })
    const contractsData = await contractsResp.json()

    if (!contractsData.results?.length)
      throw new Error(`No ${direction} contracts found for ${expiryDate}`)

    // 3. ATM = closest strike to current price
    const atmContract = contractsData.results.reduce((prev: any, curr: any) =>
      Math.abs(curr.strike_price - currentPrice) < Math.abs(prev.strike_price - currentPrice)
        ? curr
        : prev
    )
    const strike: number = atmContract.strike_price
    const ticker: string = atmContract.ticker

    // 4. Option snapshot → bid / ask / IV
    const snapUrl = `https://api.polygon.io/v3/snapshot/options/${symbol}/${ticker}?apikey=${POLYGON_API_KEY}`
    const snapResp = await fetch(snapUrl, { signal: AbortSignal.timeout(6000) })
    const snapData = await snapResp.json()
    const snap = snapData.results

    const iv: number = snap?.implied_volatility ?? 0.35
    const bid: number = snap?.last_quote?.bid ?? 0
    const ask: number = snap?.last_quote?.ask ?? 0
    const mid: number = bid > 0 && ask > 0 ? (bid + ask) / 2 : (snap?.day?.close ?? 0)

    // 5. Targets & Stop Loss (same logic as Industry Analysis)
    const T = dte / 365
    const r = 0.05
    const isCall = direction === 'call'
    const expectedMove = currentPrice * iv * Math.sqrt(T)

    const target1Stock = isCall
      ? currentPrice + expectedMove * 0.84
      : currentPrice - expectedMove * 0.84
    const target2Stock = isCall
      ? currentPrice + expectedMove * 1.5
      : currentPrice - expectedMove * 1.5
    const stopLossStock = isCall
      ? currentPrice - expectedMove * 0.5
      : currentPrice + expectedMove * 0.5

    // Option prices at target levels (time decay applied proportionally)
    const target1Premium = bsPrice(target1Stock, strike, T * 0.7, r, iv, isCall)
    const target2Premium = bsPrice(target2Stock, strike, T * 0.5, r, iv, isCall)
    const stopLossPremium = bsPrice(stopLossStock, strike, T * 0.8, r, iv, isCall)

    const fmt2 = (n: number) => Math.round(n * 100) / 100
    const fmt1 = (n: number) => Math.round(n * 10) / 10

    return NextResponse.json({
      success: true,
      symbol,
      direction,
      currentPrice: fmt2(currentPrice),
      expiryDate,
      dte,
      contractTicker: ticker,
      strike,
      iv: fmt1(iv * 100), // e.g. 35.2 (%)
      bid: fmt2(bid),
      ask: fmt2(ask),
      mid: fmt2(mid),
      target1Stock: fmt2(target1Stock),
      target2Stock: fmt2(target2Stock),
      stopLossStock: fmt2(stopLossStock),
      target1Premium: fmt2(target1Premium),
      target2Premium: fmt2(target2Premium),
      stopLossPremium: fmt2(stopLossPremium),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status: 500 })
  }
}
