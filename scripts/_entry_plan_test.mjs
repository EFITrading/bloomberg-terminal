// TEST SCRIPT ONLY - proposes a redesigned entry-plan level (does NOT touch production code).
// Uses REAL technical tools only, no fibs, no dealer magnet as an input:
//   - Moving averages (SMA20/50) and Bollinger std-dev channels
//   - VWAP(20d) and a VWAP std-dev band ("vwap gap" - how far price has stretched from it)
//   - Fair Value Gaps (3-candle imbalance zones price tends to revisit)
//   - Unfilled raw price gaps between sessions
//   - Highest/lowest daily CLOSE over the last 5 sessions (real recent S/R, not a wick)
//   - Trend-break level (linear regression trendline over the lookback - where a break/retest
//     of the trend itself sits, distinct from any static level)
//   - Volume Profile POC + a dedicated single-session liquidation/high-volume node
//   - Relative Strength (20d stock return vs SPY, alignment with the trade's implied direction)
// Every candidate is clamped to the 80%-probability-of-profit Black-Scholes band so an entry
// can never be proposed outside a realistic reach.
import 'dotenv/config'

const POLYGON_API_KEY = process.env.POLYGON_API_KEY
if (!POLYGON_API_KEY) { console.error('No POLYGON_API_KEY in .env'); process.exit(1) }

// ── Black-Scholes helpers - EXACT port of bsStrikeForProbFTP from FlowTrackingPanel.tsx.
// NOTE: this is a single-DIRECTIONAL percentile solver, not a symmetric call/put band. The
// `isCall` param here actually means "search upward" (targetUp), matching how production
// calls it: bsStrikeForProbFTP(spot, sigma, dte, prob, targetUp). For prob=80 it returns the
// price level in the trade's own direction that has an 80% chance of NOT being exceeded yet
// (i.e. the 80th-percentile move in that direction) - there is no separate "call formula" vs
// "put formula", just up vs down.
function _bsNCD(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911
  const sign = x >= 0 ? 1 : -1
  const ax = Math.abs(x)
  const t = 1 / (1 + p * ax)
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax)
  return 0.5 * (1 + sign * y)
}
function _bsD2FTP(S, K, r, sigma, T) {
  return (Math.log(S / K) + (r - 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T))
}
function bsStrikeForProbFTP(S, sigma, dte, prob, searchUp) {
  if (!sigma || sigma <= 0 || dte <= 0) return null
  const r = 0.0387
  const T = dte / 365
  const copCall = (K) => (1 - _bsNCD(_bsD2FTP(S, K, r, sigma, T))) * 100
  const copPut = (K) => _bsNCD(_bsD2FTP(S, K, r, sigma, T)) * 100
  if (searchUp) {
    let lo = S + 0.01, hi = S * 1.5
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2
      const p = copCall(mid)
      if (Math.abs(p - prob) < 0.1) return mid
      p < prob ? (lo = mid) : (hi = mid)
    }
    return (lo + hi) / 2
  } else {
    let lo = S * 0.5, hi = S - 0.01
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2
      const p = copPut(mid)
      if (Math.abs(p - prob) < 0.1) return mid
      p < prob ? (hi = mid) : (lo = mid)
    }
    return (lo + hi) / 2
  }
}

async function fetchDailyAggs(ticker, days = 150) {
  const to = new Date().toISOString().slice(0, 10)
  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
  const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=5000&apiKey=${POLYGON_API_KEY}`
  const res = await fetch(url)
  const json = await res.json()
  if (!json.results) { console.warn(`[${ticker}] No aggs:`, json.status, json.error); return [] }
  return json.results.map((r) => ({ t: r.t, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v }))
}

async function fetchOptionSnapshot(underlying, contractTicker) {
  const url = `https://api.polygon.io/v3/snapshot/options/${underlying}/${contractTicker}?apiKey=${POLYGON_API_KEY}`
  const res = await fetch(url)
  const json = await res.json()
  return json.results || null
}

// Relative strength: this ticker's N-day return minus SPY's N-day return over the same window.
function computeRelativeStrength(candles, spyCandles, lookback = 20) {
  if (candles.length < lookback + 1 || spyCandles.length < lookback + 1) return null
  const stockRet = (candles.at(-1).c - candles.at(-1 - lookback).c) / candles.at(-1 - lookback).c
  const spyRet = (spyCandles.at(-1).c - spyCandles.at(-1 - lookback).c) / spyCandles.at(-1 - lookback).c
  return (stockRet - spyRet) * 100 // positive = outperforming SPY = relative strength
}

// Simple moving averages - real institutional reference levels traders actually watch.
function computeSMA(candles, period) {
  if (candles.length < period) return null
  const window = candles.slice(-period)
  return window.reduce((s, c) => s + c.c, 0) / period
}

// Volume-weighted average price over the lookback window - where the "average" dollar actually
// got filled, a real institutional accumulation/distribution reference distinct from any SMA.
function computeVWAP(candles, lookback = 20) {
  const window = candles.slice(-lookback)
  if (!window.length) return null
  let pv = 0, v = 0
  for (const c of window) { pv += c.c * c.v; v += c.v }
  return v > 0 ? pv / v : null
}

// Real Volume Profile Point of Control - bins every session's volume into price buckets across
// the lookback window's actual traded range and returns the bucket with the most total volume
// (the price the market spent the most size at, not just one loud single day).
function computeVolumeProfilePOC(candles, lookback = 90, bins = 40) {
  const window = candles.slice(-lookback)
  if (window.length < 10) return null
  let lo = Infinity, hi = -Infinity
  for (const c of window) { if (c.l < lo) lo = c.l; if (c.h > hi) hi = c.h }
  if (hi <= lo) return null
  const binSize = (hi - lo) / bins
  const volByBin = new Array(bins).fill(0)
  for (const c of window) {
    const bin = Math.min(bins - 1, Math.max(0, Math.floor((c.c - lo) / binSize)))
    volByBin[bin] += c.v
  }
  let bestBin = 0
  for (let i = 1; i < bins; i++) if (volByBin[i] > volByBin[bestBin]) bestBin = i
  return lo + binSize * (bestBin + 0.5)
}

// Fair Value Gaps (3-candle imbalance): candle1's high doesn't overlap candle3's low (bullish
// gap - price ran up leaving a hole below it) or candle1's low doesn't overlap candle3's high
// (bearish gap). Price frequently returns to "fill" these zones - a real ICT/order-flow concept,
// not a fib. Level used = the near edge of the gap (closest to current price action).
function computeFairValueGaps(candles, lookback = 60) {
  const window = candles.slice(-lookback)
  const gaps = []
  for (let i = 2; i < window.length; i++) {
    const c1 = window[i - 2], c3 = window[i]
    if (c1.h < c3.l) gaps.push({ price: c1.h, kind: 'fvg-bull' }) // gap floor
    if (c1.l > c3.h) gaps.push({ price: c1.l, kind: 'fvg-bear' }) // gap ceiling
  }
  return gaps
}

// Unfilled raw overnight price gaps (today's low clears yesterday's high, or vice versa) -
// the classic "gaps get filled" level, independent of any moving average or fib math.
function computeUnfilledGaps(candles, lookback = 60) {
  const window = candles.slice(-lookback)
  const gaps = []
  for (let i = 1; i < window.length; i++) {
    const prev = window[i - 1], cur = window[i]
    if (cur.l > prev.h) gaps.push({ price: prev.h, kind: 'price-gap-up' })
    if (cur.h < prev.l) gaps.push({ price: prev.l, kind: 'price-gap-down' })
  }
  return gaps
}

// Highest/lowest daily CLOSE (not wick) over the last N sessions - real, recently-respected
// support/resistance that price actually settled at, not a one-tick spike.
function computeRecentCloseExtremes(candles, lookback = 5) {
  const window = candles.slice(-lookback)
  if (!window.length) return []
  let hi = window[0], lo = window[0]
  for (const c of window) { if (c.c > hi.c) hi = c; if (c.c < lo.c) lo = c }
  return [{ price: hi.c, kind: 'recent-close-high' }, { price: lo.c, kind: 'recent-close-low' }]
}

// Linear regression TREND CHANNEL (what a TradingView "LinReg channel" draws): fit a
// regression line through the lookback closes, take the stdev of the residuals off that line,
// and project today's mid/1st-deviation/2nd-deviation levels. A breakdown through the 1st
// deviation line and a bounce off the 2nd deviation line are the two real, currently-respected
// levels traders actually watch on this channel - not a flat SMA+/-2std Bollinger band.
function computeRegressionChannel(candles, lookback = 40) {
  const window = candles.slice(-lookback)
  const n = window.length
  if (n < 10) return null
  let sx = 0, sy = 0, sxy = 0, sxx = 0
  window.forEach((c, i) => { sx += i; sy += c.c; sxy += i * c.c; sxx += i * i })
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx)
  const intercept = (sy - slope * sx) / n
  let sse = 0
  window.forEach((c, i) => { const resid = c.c - (intercept + slope * i); sse += resid * resid })
  const sd = Math.sqrt(sse / n)
  const mid = intercept + slope * (n - 1)
  return { mid, sd, upper1: mid + sd, lower1: mid - sd, upper2: mid + 2 * sd, lower2: mid - 2 * sd }
}

// Single-session liquidation/high-volume node - the one daily close with the heaviest volume
// in the lookback, a proxy for where the most size (and stops) actually cluster.
function computeLiquidationNode(candles, lookback = 60) {
  const window = candles.slice(-lookback)
  if (!window.length) return null
  let best = window[0]
  for (const c of window) if (c.v > best.v) best = c
  return { price: best.c, volume: best.v }
}

// Real local swing highs/lows (strict 5-day pivot: higher/lower than 2 sessions on either
// side) - actual chart support/resistance levels price has already respected before.
function computeSwingPivots(candles, lookback = 90) {
  const window = candles.slice(-lookback)
  const win = 2
  const pivots = []
  for (let i = win; i < window.length - win; i++) {
    const c = window[i]
    let isHigh = true, isLow = true
    for (let k = i - win; k <= i + win; k++) {
      if (k === i) continue
      if (window[k].h >= c.h) isHigh = false
      if (window[k].l <= c.l) isLow = false
    }
    if (isHigh) pivots.push({ price: c.h, kind: 'swing-high' })
    if (isLow) pivots.push({ price: c.l, kind: 'swing-low' })
  }
  return pivots
}

// Groups every raw level from every REAL technical tool into confluence clusters - levels
// within ~0.75% of each other are treated as "the same real price zone" multiple independent
// tools agree on. A zone confirmed by 3 different tools (say SMA50 + Bollinger lower + a swing
// low) is a far stronger real level than any single tool's output alone - and none of these
// tools are fibs or the dealer magnet, per the requirement to rely on actual technicals instead.
function clusterConfluence(levels, spot) {
  const tol = spot * 0.0075
  const sorted = [...levels].sort((a, b) => a.price - b.price)
  const clusters = []
  for (const lvl of sorted) {
    const last = clusters.at(-1)
    if (last && lvl.price - last.avgPrice <= tol) {
      last.items.push(lvl)
      last.avgPrice = last.items.reduce((s, i) => s + i.price, 0) / last.items.length
      last.tools.add(lvl.kind)
    } else {
      clusters.push({ avgPrice: lvl.price, items: [lvl], tools: new Set([lvl.kind]) })
    }
  }
  return clusters.map((c) => ({ price: c.avgPrice, confluence: c.tools.size, tools: [...c.tools] }))
}

async function analyzeTicker({ ticker, spot, optionType, expiry, strike, fillStyle, oldMagnetLevel, oldMagnetLabel }) {
  console.log(`\n${'='.repeat(70)}\n${ticker} - ${optionType.toUpperCase()} $${strike} exp ${expiry}\n${'='.repeat(70)}`)

  const [candles, spyCandles] = await Promise.all([fetchDailyAggs(ticker), fetchDailyAggs('SPY')])
  if (!candles.length) { console.log('No candle data - aborting.'); return }

  const expiryDate = new Date(expiry + 'T00:00:00Z')
  const dte = Math.max(1, Math.round((expiryDate.getTime() - Date.now()) / 86400000))
  const [y, m, d] = expiry.split('-')
  const contractTicker = `O:${ticker}${y.slice(2)}${m}${d}${optionType === 'call' ? 'C' : 'P'}${String(Math.round(strike * 1000)).padStart(8, '0')}`
  const snap = await fetchOptionSnapshot(ticker, contractTicker).catch(() => null)
  const sigma = snap?.implied_volatility || snap?.greeks?.implied_volatility || 0.5
  console.log(`Spot: $${spot.toFixed(2)}  |  DTE: ${dte}  |  IV: ${(sigma * 100).toFixed(1)}%  (contract ${contractTicker})`)

  const isCall = optionType === 'call'
  let impliedBullish = isCall
  if (fillStyle === 'B' || fillStyle === 'BB') impliedBullish = !impliedBullish
  const targetUp = impliedBullish

  // 80% "chance of profit" range = between spot and the 80th-percentile move in the trade's
  // OWN direction (exactly how target1 already works in production's calcTradeManagement -
  // prob=80, searchUp=targetUp). This is NOT a symmetric call/put band around spot - a bullish
  // trade's realistic entry zone is between spot and its upside 80% target; a bearish trade's
  // is between spot and its downside 80% target. Entries beyond that level have a <20% modeled
  // chance of even being reached, let alone profiting from.
  const target80 = bsStrikeForProbFTP(spot, sigma, dte, 80, targetUp)
  const lo80 = Math.min(spot, target80), hi80 = Math.max(spot, target80)
  console.log(`80% chance-of-profit range (spot -> 80th pctl ${targetUp ? 'up' : 'down'}): $${lo80.toFixed(2)} - $${hi80.toFixed(2)}`)

  // ── Multi-tool confluence using REAL technicals only - no fibs, no dealer magnet as an input.
  // The old magnet is only kept below for the OLD-vs-NEW comparison print, never fed into scoring.
  const swings = computeSwingPivots(candles)
  const sma20 = computeSMA(candles, 20)
  const sma50 = computeSMA(candles, 50)
  const vwap20 = computeVWAP(candles, 20)
  const poc = computeVolumeProfilePOC(candles)
  const liqNode = computeLiquidationNode(candles)
  const fvgs = computeFairValueGaps(candles)
  const priceGaps = computeUnfilledGaps(candles)
  const closeExtremes = computeRecentCloseExtremes(candles)
  const chan = computeRegressionChannel(candles)
  const rs = computeRelativeStrength(candles, spyCandles)
  console.log(`Relative Strength (20d vs SPY): ${rs === null ? 'N/A' : (rs >= 0 ? '+' : '') + rs.toFixed(2) + '%'}`)
  console.log(`SMA20/50: ${sma20?.toFixed(2) ?? 'N/A'} / ${sma50?.toFixed(2) ?? 'N/A'}   VWAP(20d): ${vwap20?.toFixed(2) ?? 'N/A'}`)
  console.log(`Volume Profile POC: ${poc?.toFixed(2) ?? 'N/A'}   Liquidation node: ${liqNode?.price.toFixed(2) ?? 'N/A'}`)
  console.log(`Reg. channel mid/1dev/2dev: ${chan ? `${chan.mid.toFixed(2)} | +-1sd ${chan.lower1.toFixed(2)}/${chan.upper1.toFixed(2)} | +-2sd ${chan.lower2.toFixed(2)}/${chan.upper2.toFixed(2)}` : 'N/A'}`)
  console.log(`FVGs found: ${fvgs.length}   Unfilled gaps: ${priceGaps.length}   Recent 5d close hi/lo: ${closeExtremes[0]?.price.toFixed(2) ?? 'N/A'}/${closeExtremes[1]?.price.toFixed(2) ?? 'N/A'}`)

  const rawLevels = []
  for (const s of swings) rawLevels.push({ price: s.price, kind: s.kind })
  if (sma20) rawLevels.push({ price: sma20, kind: 'sma20' })
  if (sma50) rawLevels.push({ price: sma50, kind: 'sma50' })
  if (vwap20) rawLevels.push({ price: vwap20, kind: 'vwap20' })
  if (poc) rawLevels.push({ price: poc, kind: 'volume-poc' })
  if (liqNode) rawLevels.push({ price: liqNode.price, kind: 'liquidation-node' })
  if (chan) {
    rawLevels.push({ price: chan.mid, kind: 'chan-mid' })
    rawLevels.push({ price: chan.lower1, kind: 'chan-dev1' })
    rawLevels.push({ price: chan.upper1, kind: 'chan-dev1' })
    rawLevels.push({ price: chan.lower2, kind: 'chan-dev2' })
    rawLevels.push({ price: chan.upper2, kind: 'chan-dev2' })
  }
  for (const g of fvgs) rawLevels.push(g)
  for (const g of priceGaps) rawLevels.push(g)
  for (const e of closeExtremes) rawLevels.push(e)

  const clusters = clusterConfluence(rawLevels, spot)

  // The ENTRY needs to be close to spot - the whole point of a bullish trade is buying a dip
  // NEAR the current price, not chasing a level $10+ away (that's what target1/target2 already
  // exist for, separately). Only look at the PULLBACK side: below spot for a bullish trade
  // (buy the dip), above spot for a bearish trade (short the rip) - and cap the search to a
  // realistic near-term band (0.5%-8% away from spot), not the full 80% PoP reach.
  const minDist = spot * 0.005
  const maxDist = spot * 0.08
  const pullbackSide = (price) => (targetUp ? price < spot : price > spot)
  const inBand = clusters.filter((c) => {
    const dist = Math.abs(c.price - spot)
    return pullbackSide(c.price) && dist >= minDist && dist <= maxDist
  })
  console.log(`\nConfluence zones within 0.5%-8% pullback range on the correct side (${inBand.length}/${clusters.length} total zones):`)

  const scored = inBand.map((c) => {
    const distPct = Math.abs(c.price - spot) / spot
    const rsAlignScore = rs === null ? 0.5 : (targetUp ? (rs >= 0 ? 1 : 0.3) : (rs <= 0 ? 1 : 0.3))
    // Closer to spot = more likely to actually fill soon and preserves the most of the move
    // for the targets - decays linearly out to the 8% cap.
    const proximityScore = 1 - (distPct / 0.08)
    const confluenceScore = Math.min(1, c.confluence / 4) // 4+ tools agreeing = max credit
    // A regression-channel deviation level is a real trend structure the market is actively
    // riding, not just a static price - weight it like an extra tool agreeing.
    const channelBonus = c.tools.some((t) => t === 'chan-dev1' || t === 'chan-dev2') ? 0.15 : 0
    const finalScore = proximityScore * 0.5 + confluenceScore * 0.4 + rsAlignScore * 0.1 + channelBonus
    return { ...c, distPct, proximityScore, rsAlignScore, confluenceScore, channelBonus, finalScore }
  }).sort((a, b) => b.finalScore - a.finalScore)

  scored.forEach((c) => console.log(`  $${c.price.toFixed(2).padStart(8)}  (${(c.distPct * 100).toFixed(1)}% from spot)  confluence=${c.confluence} [${c.tools.join(',')}]  final=${c.finalScore.toFixed(3)} (prox=${c.proximityScore.toFixed(2)} conf=${c.confluenceScore.toFixed(2)} rs=${c.rsAlignScore.toFixed(2)})`))

  const winner = scored[0]
  if (!winner) { console.log('\nNo confluence zone qualifies - no plan.'); return }
  winner.label = winner.tools.join('+')

  // inBand only ever contains pullback-side levels now (below spot for bullish, above spot
  // for bearish), so the plan is always the "wait for the dip/rip, enter there" wording -
  // never "enter now at basically today's price," which wastes range for the actual targets.
  const planText = targetUp
    ? `Wait for price to pull back down to $${winner.price.toFixed(2)} (${winner.label}, ${(winner.distPct * 100).toFixed(1)}% below spot) and buy there for entry.`
    : `Wait for price to run up to $${winner.price.toFixed(2)} (${winner.label}, ${(winner.distPct * 100).toFixed(1)}% above spot) and short there for entry.`

  console.log(`\n>>> OLD plan (current production): "Wait for price to pull back down to the ${oldMagnetLabel} at $${oldMagnetLevel.toFixed(2)} and buy there for entry."`)
  console.log(`>>> NEW proposed plan: "${planText}"`)
}

async function main() {
  // AXTI: $100 CALL, BLOCK, A (bought), long term, spot $85.28 -> $82.91, magnet plan = $68.71
  await analyzeTicker({
    ticker: 'AXTI', spot: 82.91, optionType: 'call', expiry: '2026-10-02', strike: 100,
    fillStyle: 'A', oldMagnetLevel: 68.71, oldMagnetLabel: 'magnet',
  })
  // CIEN: $265 PUT, BLOCK, B (sold), long term, spot $399.21 -> $403.65, magnet plan = $365.00
  await analyzeTicker({
    ticker: 'CIEN', spot: 403.65, optionType: 'put', expiry: '2026-09-25', strike: 265,
    fillStyle: 'B', oldMagnetLevel: 365.00, oldMagnetLabel: 'magnet',
  })
}

main().catch((err) => { console.error(err); process.exit(1) })
