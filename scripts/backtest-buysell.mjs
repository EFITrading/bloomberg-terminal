/**
 * Breakout/Breakdown + Relative Strength Backtest
 *
 * BUY  — New 52-week closing high + 63-day RS vs SPY > 0 (stock outperforming)
 * SELL — New 52-week closing low  + 63-day RS vs SPY < 0 (stock underperforming)
 *
 * No volume filters. No indicators. Pure price structure + relative strength.
 * 20-bar signal cooldown + 45-bar LEVEL cooldown — same breakout zone can't re-fire
 * within 45 days even if the stock dips and retakes the level.
 * Entry at next open.
 *
 * Usage: node scripts/backtest-buysell.mjs
 */

const API_KEY  = 'kjZ4aLJbqHsEhWGOjWMBthMvwDLKd4wf'
const STOCKS   = ['AAPL','NVDA','TSLA','MSFT','AMZN','META','GOOGL','JPM','KO','XOM']
const HORIZONS = [1, 3, 5, 13, 21]
const LOOKBACK = 3650   // 10 years
const COOLDOWN       = 20   // min bars between any two signals of same type
const LEVEL_COOLDOWN = 45   // bars before same price ZONE can trigger again (±2%)
const WARMUP         = 252  // need 1 year before first signal

async function fetchDaily(symbol) {
  const end   = new Date().toISOString().split('T')[0]
  const start = new Date(Date.now() - LOOKBACK * 86400000).toISOString().split('T')[0]
  const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${start}/${end}?adjusted=true&sort=asc&limit=5000&apiKey=${API_KEY}`
  const json = await (await fetch(url)).json()
  if (!json.results || json.results.length < 300) throw new Error(`Only ${json.results?.length ?? 0} bars`)
  return json.results.map(r => ({ o: r.o, h: r.h, l: r.l, c: r.c, v: r.v, t: r.t }))
}

function detectSignals(bars, spyBars) {
  const n = bars.length
  const signals = []
  let lastBuy      = -999, lastSell      = -999
  let lastBuyPrice = 0,   lastSellPrice  = 0

  // SPY 200-day MA — keyed by timestamp
  // BUY  only fires when SPY is ABOVE its 200d MA (bull regime)
  // SELL only fires when SPY is BELOW its 200d MA (bear regime)
  const spy200ma = new Map()
  for (let j = 200; j < spyBars.length; j++) {
    const ma = spyBars.slice(j - 200, j).reduce((s, b) => s + b.c, 0) / 200
    spy200ma.set(spyBars[j].t, { close: spyBars[j].c, ma })
  }

  // Align SPY to stock dates by timestamp
  const spyByDate = new Map(spyBars.map(b => [b.t, b.c]))
  // Find closest SPY close for a given stock bar index
  const spyClose = (i) => {
    const t = bars[i].t
    // try exact, then scan nearby (weekends/holidays cause 1-day offsets)
    for (let delta = 0; delta <= 3; delta++) {
      const v = spyByDate.get(t + delta * 86400000) || spyByDate.get(t - delta * 86400000)
      if (v) return v
    }
    return null
  }

  for (let i = WARMUP; i < n - Math.max(...HORIZONS) - 1; i++) {
    const c = bars[i].c

    // 52-week (252-bar) high and low
    let high52 = 0, low52 = Infinity
    for (let j = i - 252; j < i; j++) {
      if (j >= 0) {
        if (bars[j].c > high52) high52 = bars[j].c
        if (bars[j].c < low52)  low52  = bars[j].c
      }
    }

    // 63-bar (3-month) RS: stock return vs SPY return
    const stockBase = bars[i - 63]?.c
    const spyCur    = spyClose(i)
    const spyBase63 = spyClose(i - 63)
    let rs = null
    if (stockBase && spyCur && spyBase63 && spyBase63 > 0 && stockBase > 0) {
      const stockRet = (c - stockBase) / stockBase
      const spyRet   = (spyCur - spyBase63) / spyBase63
      rs = stockRet - spyRet
    }
    if (rs === null) continue

    // Also check 126-bar (6-month) RS — must be positive for buy, negative for sell
    const stockBase6 = bars[i - 126]?.c
    const spyBase126 = spyClose(i - 126)
    let rs6 = null
    if (stockBase6 && spyBase126 && spyBase126 > 0 && stockBase6 > 0) {
      const stockRet6 = (c - stockBase6) / stockBase6
      const spyRet6   = (spyCur - spyBase126) / spyBase126
      rs6 = stockRet6 - spyRet6
    }
    if (rs6 === null) continue

    // BUY: new 52-week high + strong RS on both 3m and 6m timeframes
    if (i - lastBuy >= COOLDOWN) {
      const newHigh  = c > high52
      const strongRS = rs > 0.03 && rs6 > 0.05
      // Level cooldown: if within 45 bars of last buy AND price is within 2% of that
      // breakout level, this is the same zone re-testing — skip it
      const sameZone = lastBuyPrice > 0
        && i - lastBuy < LEVEL_COOLDOWN
        && Math.abs(c - lastBuyPrice) / lastBuyPrice < 0.02
      // Regime filter: SPY must be above its 200d MA
      const spySnap   = spy200ma.get(bars[i].t) || [...spy200ma.values()].at(-1)
      const bullRegime = spySnap && spySnap.close > spySnap.ma
      if (newHigh && strongRS && !sameZone && bullRegime) {
        signals.push({ i, type: 'BUY', price: c, rs3m: rs, rs6m: rs6 })
        lastBuy      = i
        lastBuyPrice = c
      }
    }

    // SELL: new 52-week low + weak RS on both 3m and 6m timeframes
    if (i - lastSell >= COOLDOWN) {
      const newLow  = c < low52
      const weakRS  = rs < -0.03 && rs6 < -0.05
      // Same level cooldown for sell side
      const sameZone = lastSellPrice > 0
        && i - lastSell < LEVEL_COOLDOWN
        && Math.abs(c - lastSellPrice) / lastSellPrice < 0.02
      // Regime filter: SPY must be below its 200d MA
      const spySnap2   = spy200ma.get(bars[i].t) || [...spy200ma.values()].at(-1)
      const bearRegime = spySnap2 && spySnap2.close < spySnap2.ma
      if (newLow && weakRS && !sameZone && bearRegime) {
        signals.push({ i, type: 'SELL', price: c, rs3m: rs, rs6m: rs6 })
        lastSell      = i
        lastSellPrice = c
      }
    }
  }
  return signals
}

function addReturns(signals, bars) {
  return signals.map(s => {
    const fwd = {}
    let valid = true
    for (const h of HORIZONS) {
      // Entry at next open after signal bar
      const entryBar = s.i + 1
      if (entryBar + h < bars.length) {
        const entry = bars[entryBar].o
        fwd[h] = (bars[entryBar + h].c - entry) / entry * 100
      } else valid = false
    }
    return valid ? { ...s, fwd } : null
  }).filter(Boolean)
}

function calcStats(signals, type) {
  const f = signals.filter(s => s.type === type)
  if (!f.length) return null
  const out = {}
  for (const h of HORIZONS) {
    const rets = f.map(s => s.fwd[h])
    const wins = rets.filter(r => type === 'BUY' ? r > 0 : r < 0).length
    const sorted = [...rets].sort((a, b) => a - b)
    out[h] = {
      avg:    rets.reduce((a,b) => a+b, 0) / rets.length,
      median: sorted[Math.floor(sorted.length/2)],
      wr:     wins / rets.length * 100,
      count:  rets.length,
    }
  }
  return out
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════════')
  console.log('  BREAKOUT/BREAKDOWN + RELATIVE STRENGTH BACKTEST')
  console.log('  BUY:  New 52W high + strong RS 3m>3% & 6m>5% + SPY ABOVE 200d MA')
  console.log('  SELL: New 52W low  + weak RS 3m<-3% & 6m<-5% + SPY BELOW 200d MA')
  console.log('  Entry at next open | 20-bar cooldown | 10 stocks x 10 years')
  console.log('═══════════════════════════════════════════════════════════════════\n')

  process.stdout.write('Fetching SPY... ')
  const spyBars = await fetchDaily('SPY')
  console.log(`${spyBars.length} bars\n`)

  const agg = {
    BUY:  Object.fromEntries(HORIZONS.map(h => [h, { totalRet:0, medRets:[], wins:0, count:0 }])),
    SELL: Object.fromEntries(HORIZONS.map(h => [h, { totalRet:0, medRets:[], wins:0, count:0 }])),
  }

  for (const sym of STOCKS) {
    process.stdout.write(`${sym.padEnd(6)} fetching... `)
    let bars
    try { bars = await fetchDaily(sym) } catch(e) { console.log(`SKIP — ${e.message}`); continue }
    const years = ((bars[bars.length-1].t - bars[0].t) / (365.25*86400000)).toFixed(1)
    console.log(`${bars.length} bars (${years}y)`)

    const raw     = detectSignals(bars, spyBars)
    const signals = addReturns(raw, bars)
    const buys    = signals.filter(s => s.type==='BUY')
    const sells   = signals.filter(s => s.type==='SELL')
    console.log(`         ${buys.length} BUY (${(buys.length/parseFloat(years)).toFixed(1)}/yr)  |  ${sells.length} SELL (${(sells.length/parseFloat(years)).toFixed(1)}/yr)`)

    for (const [type, label] of [['BUY','BUY  →'],['SELL','SELL →']]) {
      const st = calcStats(signals, type)
      if (!st) continue
      process.stdout.write(`         ${label}`)
      for (const h of HORIZONS) {
        process.stdout.write(`  ${h}d: ${st[h].avg>=0?'+':''}${st[h].avg.toFixed(2)}%(${st[h].wr.toFixed(0)}%WR)`)
        agg[type][h].totalRet += st[h].avg * st[h].count
        agg[type][h].medRets.push(...signals.filter(s=>s.type===type).map(s=>s.fwd[h]))
        agg[type][h].wins     += st[h].wr/100 * st[h].count
        agg[type][h].count    += st[h].count
      }
      console.log()
    }
    console.log()
  }

  console.log('═══════════════════════════════════════════════════════════════════')
  console.log('  AGGREGATE — ALL 10 STOCKS COMBINED')
  console.log('═══════════════════════════════════════════════════════════════════')
  for (const [type, label] of [['BUY','BUY  (win = price up)'],['SELL','SELL (win = price down)']]) {
    console.log(`\n  ${label}`)
    console.log(`  ${'Horizon'.padEnd(8)} ${'N'.padEnd(7)} ${'Avg Ret'.padEnd(12)} ${'Median'.padEnd(10)} Win Rate`)
    console.log(`  ${'-'.repeat(46)}`)
    for (const h of HORIZONS) {
      const a = agg[type][h]
      if (!a.count) { console.log(`  ${(h+'d').padEnd(8)} 0`); continue }
      const avg  = a.totalRet / a.count
      const wr   = a.wins / a.count * 100
      const srt  = [...a.medRets].sort((x,y)=>x-y)
      const med  = srt[Math.floor(srt.length/2)]
      console.log(`  ${(h+'d').padEnd(8)} ${String(a.count).padEnd(7)} ${((avg>=0?'+':'')+avg.toFixed(2)+'%').padEnd(12)} ${((med>=0?'+':'')+med.toFixed(2)+'%').padEnd(10)}  ${wr.toFixed(1)}%`)
    }
  }
  console.log()
}

main().catch(console.error)
