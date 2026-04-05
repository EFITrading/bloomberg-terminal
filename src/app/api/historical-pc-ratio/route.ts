import { NextRequest, NextResponse } from 'next/server'

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || ''

// ─── Result cache: key = "SYMBOL_TF" ─────────────────────────────────────────
const cache: Record<
  string,
  { dates: string[]; ratios: number[]; symbol: string; cachedAt: number }
> = {}

// ─── Spot cache: re-use within 60s ───────────────────────────────────────────
const spotCache: Record<string, { price: number; ts: number }> = {}
const SPOT_TTL = 60_000

// ─── Contract list cache: ATM contracts rarely change — re-use for 4h ────────
// key = "SYMBOL_type_expMin_expMax"
const contractListCache: Map<string, { contracts: ContractRef[]; fetchedAt: number }> = new Map()
const CONTRACT_LIST_TTL = 4 * 60 * 60 * 1000

// ─── Per-contract bar cache: historical bars never change ─────────────────────
// key = "TICKER_multiplier_timespan"
// Stores all bars fetched so far + the ISO date we last fetched up to
const barCache: Map<string, { bars: Array<{ t: number; v: number }>; fetchedTo: string }> =
  new Map()

type ContractRef = { ticker: string; contract_type: 'call' | 'put'; strike_price: number }

const TF_CONFIG: Record<
  string,
  {
    lookbackDays: number
    multiplier: number
    timespan: string
    cacheTtlMs: number
    expDaysMin: number // contracts expiring at least N days from today
    expDaysMax: number // contracts expiring at most N days from today
  }
> = {
  // Short-term: near-term ATM contracts (active intraday liquidity), short lookback
  // 5m: 5 trading days = 390 bars (78 bars/day × 5 days)
  '5m': {
    lookbackDays: 7,
    multiplier: 5,
    timespan: 'minute',
    cacheTtlMs: 5 * 60 * 1000,
    expDaysMin: 7,
    expDaysMax: 40,
  },
  // 1H: ~30 trading days = ~210 hourly bars
  '1H': {
    lookbackDays: 45,
    multiplier: 1,
    timespan: 'hour',
    cacheTtlMs: 15 * 60 * 1000,
    expDaysMin: 14,
    expDaysMax: 90,
  },
  // Long-term: include LEAPs (expiring up to 2yr out) — listed years ago, so daily bar history exists
  '1D': {
    lookbackDays: 730,
    multiplier: 1,
    timespan: 'day',
    cacheTtlMs: 12 * 60 * 60 * 1000,
    expDaysMin: 30,
    expDaysMax: 730,
  },
  '1W': {
    lookbackDays: 1460,
    multiplier: 1,
    timespan: 'week',
    cacheTtlMs: 12 * 60 * 60 * 1000,
    expDaysMin: 30,
    expDaysMax: 730,
  },
  '1M': {
    lookbackDays: 2920,
    multiplier: 1,
    timespan: 'month',
    cacheTtlMs: 24 * 60 * 60 * 1000,
    expDaysMin: 30,
    expDaysMax: 730,
  },
}

function toYMD(d: Date): string {
  return d.toISOString().split('T')[0]
}
function getTodayStr(): string {
  return toYMD(new Date())
}
function getFromDate(lookbackDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() - lookbackDays)
  return toYMD(d)
}
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().split('T')[0]
}

function makeSemaphore(limit: number) {
  let active = 0
  const queue: (() => void)[] = []
  return async function acquire<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= limit) await new Promise<void>((resolve) => queue.push(resolve))
    active++
    try {
      return await fn()
    } finally {
      active--
      if (queue.length > 0) queue.shift()!()
    }
  }
}
let sem: ReturnType<typeof makeSemaphore> | null = null
function getSem() {
  if (!sem) sem = makeSemaphore(80)
  return sem
}

/**
 * Fetch volume P/C ratio bars for a symbol.
 * Optimisations:
 *  1. Spot + contract lists fetched IN PARALLEL (spot only needed for filtering after)
 *  2. Contract pages use limit=1000 (fewer round-trips)
 *  3. Contract list cached 4h (contracts don't change intraday)
 *  4. Per-contract bar cache: historical bars are immutable — only fetch NEW bars since last run
 *  5. Spot cached 60s to avoid redundant snapshot calls
 */
async function fetchPCBars(
  symbol: string,
  from: string,
  to: string,
  multiplier: number,
  timespan: string,
  expDaysMin: number,
  expDaysMax: number
): Promise<{ timestamps: string[]; ratios: number[]; debug: string }> {
  const acquire = getSem()
  try {
    const today = getTodayStr()
    const expMin = addDays(today, expDaysMin)
    const expMax = addDays(today, expDaysMax)

    // ── 1. PARALLEL: fetch spot price + both contract lists simultaneously ────
    const fetchSpot = async (): Promise<number | null> => {
      const cached = spotCache[symbol]
      if (cached && Date.now() - cached.ts < SPOT_TTL) return cached.price

      let price: number | null = null
      const symbolUpper = symbol.toUpperCase()
      if (symbolUpper === 'SPX' || symbolUpper === 'VIX') {
        // Indices — price comes from the options snapshot's underlying_asset
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = await acquire(() =>
          fetch(
            `https://api.polygon.io/v3/snapshot/options/I:${symbolUpper}?limit=1&apiKey=${POLYGON_API_KEY}`,
            { signal: AbortSignal.timeout(10_000) }
          ).then((r) => r.json())
        )
        price = data?.results?.[0]?.underlying_asset?.value ?? null
      } else {
        // Stocks — use the stocks snapshot endpoint
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = await acquire(() =>
          fetch(
            `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`,
            { signal: AbortSignal.timeout(10_000) }
          ).then((r) => r.json())
        )
        const t = data?.ticker
        price = t?.day?.close || t?.prevDay?.close || t?.lastQuote?.P || null
      }
      if (price) spotCache[symbol] = { price, ts: Date.now() }
      return price
    }

    const fetchContractList = async (
      type: 'call' | 'put',
      underlying: string = symbol
    ): Promise<ContractRef[]> => {
      const cacheKey = `${underlying}_${type}_${expMin}_${expMax}`
      const hit = contractListCache.get(cacheKey)
      if (hit && Date.now() - hit.fetchedAt < CONTRACT_LIST_TTL) return hit.contracts

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results: any[] = []
      let url: string | null =
        `https://api.polygon.io/v3/reference/options/contracts` +
        `?underlying_ticker=${underlying}&contract_type=${type}` +
        `&expiration_date.gte=${expMin}&expiration_date.lte=${expMax}` +
        `&as_of=${today}&limit=1000&apiKey=${POLYGON_API_KEY}`
      while (url) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = await acquire(() =>
          fetch(url!, { signal: AbortSignal.timeout(12_000) }).then((r) => r.json())
        )
        results.push(...(data.results ?? []))
        url = data.next_url ? data.next_url + `&apiKey=${POLYGON_API_KEY}` : null
      }
      const contracts: ContractRef[] = results.map((c) => ({
        ticker: c.ticker as string,
        contract_type: type,
        strike_price: c.strike_price as number,
      }))
      contractListCache.set(cacheKey, { contracts, fetchedAt: Date.now() })
      return contracts
    }

    // For SPX, also fetch SPXW weekly contracts (the most liquid SPX options)
    const isSpx = symbol.toUpperCase() === 'SPX'

    // Fire spot + all contract lists at the same time
    const parallelFetches = isSpx
      ? Promise.all([
          fetchSpot(),
          fetchContractList('call'),
          fetchContractList('call', 'SPXW'),
          fetchContractList('put'),
          fetchContractList('put', 'SPXW'),
        ]).then(([s, c1, c2, p1, p2]) => [s, [...c1, ...c2], [...p1, ...p2]] as const)
      : Promise.all([fetchSpot(), fetchContractList('call'), fetchContractList('put')])
    const [spot, allCalls, allPuts] = await parallelFetches
    if (!spot) return { timestamps: [], ratios: [], debug: `spot=null` }

    // ── 2. Strike-filter ATM contracts ────────────────────────────────────────
    const strikeRange = symbol.toUpperCase() === 'SPX' ? 0.035 : 0.05
    const atm = [...allCalls, ...allPuts].filter(
      (c) =>
        c.strike_price >= spot * (1 - strikeRange) && c.strike_price <= spot * (1 + strikeRange)
    )
    if (atm.length === 0)
      return {
        timestamps: [],
        ratios: [],
        debug: `spot=${spot} calls=${allCalls.length} puts=${allPuts.length} atm=0`,
      }

    // ── 3. Incremental bar fetch: only fetch bars we don't already have ────────
    // Historical bars (anything before today) are immutable — skip if already cached.
    const isIntraday = timespan === 'minute' || timespan === 'hour'
    // For intraday, always re-fetch (bars change throughout the day)
    // For daily+, only fetch from (lastFetchedTo + 1 day) onward
    const barResults = await Promise.all(
      atm.map((c) =>
        acquire(async () => {
          const bKey = `${c.ticker}_${multiplier}_${timespan}`
          const existing = barCache.get(bKey)

          // Determine effective from date
          let effectiveFrom = from
          if (!isIntraday && existing && existing.fetchedTo >= from) {
            // We have historical data; only fetch new bars since last run
            effectiveFrom = addDays(existing.fetchedTo, 1)
            // Nothing new to fetch if already up to today
            if (effectiveFrom > to) return { type: c.contract_type, bars: existing.bars }
          }

          let newBars: Array<{ t: number; v: number }> = []
          try {
            const resp = await fetch(
              `https://api.polygon.io/v2/aggs/ticker/${c.ticker}/range/${multiplier}/${timespan}/${effectiveFrom}/${to}` +
                `?adjusted=true&sort=asc&limit=5000&apiKey=${POLYGON_API_KEY}`,
              { signal: AbortSignal.timeout(20_000) }
            )
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const d: any = await resp.json()
            newBars = (d.results ?? []) as Array<{ t: number; v: number }>
          } catch {
            /* skip contract on timeout */
          }

          // Merge with existing cached bars (dedup by timestamp)
          let merged = newBars
          if (!isIntraday && existing) {
            // existing bars cover [from, fetchedTo], new bars cover [effectiveFrom, to]
            // They don't overlap (effectiveFrom = fetchedTo+1), so just concat
            merged = [...existing.bars, ...newBars]
          }
          // Update cache
          if (!isIntraday) {
            barCache.set(bKey, { bars: merged, fetchedTo: to })
          }
          return { type: c.contract_type, bars: merged }
        })
      )
    )

    // ── 4. Aggregate put + call volume per timestamp ───────────────────────────
    const byTs: Record<number, { call: number; put: number }> = {}
    for (const { type, bars } of barResults) {
      const ct = type?.toLowerCase()
      for (const bar of bars) {
        if (!byTs[bar.t]) byTs[bar.t] = { call: 0, put: 0 }
        if (ct === 'call') byTs[bar.t].call += bar.v
        else if (ct === 'put') byTs[bar.t].put += bar.v
      }
    }

    const sortedTs = Object.keys(byTs)
      .map(Number)
      .sort((a, b) => a - b)
    const timestamps: string[] = []
    const ratios: number[] = []

    for (const ts of sortedTs) {
      const { call, put } = byTs[ts]
      if (!call || !put) continue
      const ratio = Math.log(call / put)
      timestamps.push(
        isIntraday ? new Date(ts).toISOString() : new Date(ts).toISOString().split('T')[0]
      )
      ratios.push(parseFloat(ratio.toFixed(4)))
    }

    const callCount = atm.filter((c) => c.contract_type === 'call').length
    const putCount = atm.filter((c) => c.contract_type === 'put').length
    const cachedBars = barResults.filter(
      (r) =>
        !isIntraday &&
        barCache.has(
          `${atm.find((c) => r.bars === barCache.get(`${c.ticker}_${multiplier}_${timespan}`)?.bars)?.ticker}_${multiplier}_${timespan}`
        )
    ).length
    const debug = `spot=${spot} atm=${atm.length}(c${callCount}/p${putCount}) ts=${sortedTs.length} ratios=${ratios.length}`
    return { timestamps, ratios, debug }
  } catch (e) {
    return { timestamps: [], ratios: [], debug: `threw: ${e}` }
  }
}

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const rawSymbol = (searchParams.get('symbol') || 'SPX').toUpperCase().trim()
    const tf = searchParams.get('range') || '1D'

    const cfg = TF_CONFIG[tf]
    if (!cfg)
      return NextResponse.json(
        { success: false, error: `Unknown timeframe: ${tf}` },
        { status: 400 }
      )

    const cacheKey = `${rawSymbol}_${tf}`
    const cached = cache[cacheKey]
    if (cached && Date.now() - cached.cachedAt < cfg.cacheTtlMs) {
      return NextResponse.json({
        success: true,
        symbol: cached.symbol,
        dates: cached.dates,
        ratios: cached.ratios,
        cached: true,
      })
    }

    if (!POLYGON_API_KEY)
      return NextResponse.json({ success: false, error: 'API key not configured' }, { status: 500 })

    const from = getFromDate(cfg.lookbackDays)
    const to = getTodayStr()

    const { timestamps, ratios, debug } = await fetchPCBars(
      rawSymbol,
      from,
      to,
      cfg.multiplier,
      cfg.timespan,
      cfg.expDaysMin,
      cfg.expDaysMax
    )
    cache[cacheKey] = { dates: timestamps, ratios, symbol: rawSymbol, cachedAt: Date.now() }
    return NextResponse.json({
      success: true,
      symbol: rawSymbol,
      dates: timestamps,
      ratios,
      debug,
      cached: false,
    })
  } catch (err) {
    console.error('[historical-pc-ratio]', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
