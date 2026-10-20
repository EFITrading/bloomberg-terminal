// Stock Dossier engine: describes the stock's current state with a few measurements, finds the most
// similar past days in the stock's own history (analogs), and reads what happened next.
// Everything is derived from the daily bars passed in; nothing is simulated or hardcoded per ticker.

export type DBar = { t: number; o: number; h: number; l: number; c: number; v: number }

export const FWD = 30
export const HORIZONS = [5, 10, 20, 30]
const START = 260 // first bar with a full 252-bar lookback
const K_ANALOGS = 25
const MIN_SEP = 21 // analogs closer than this are one event

const FEATURE_LABELS = ['5d move', '20d move', '60d move', 'vs 52w high', 'vs 52w low', 'vol trend', 'volume trend', 'time since high', 'streak']

export interface Quantiles {
  p5: number
  p25: number
  p50: number
  p75: number
  p95: number
}

export interface HorizonRow {
  h: number
  median: number
  p25: number
  p75: number
  mean: number
  pUp: number
  baseMedian: number
  basePUp: number
}

export interface Analog {
  idx: number
  t: number
  distance: number
  path: number[] // % return from the analog day, index 0..FWD
  ret: Record<number, number>
  worst: number
  best: number
}

export interface Leg {
  dir: 'up' | 'down'
  startIdx: number
  endIdx: number
  startT: number
  endT: number
  ret: number
  bars: number
  ongoing: boolean
}

export interface Gauge {
  label: string
  display: string
  pct: number
}

export interface Dossier {
  n: number
  lastClose: number
  lastT: number
  // projection
  analogs: Analog[]
  cone: { p5: number[]; p25: number[]; p50: number[]; p75: number[]; p95: number[] }
  horizons: HorizonRow[]
  s20: number // typical 20-bar move (1 std, %)
  touchUp: number
  touchDown: number
  baseTouchUp: number
  baseTouchDown: number
  pNewHigh: number
  basePNewHigh: number
  matchQuality: number
  agreement: number
  tStat: number
  tilt: 'BULLISH' | 'BEARISH' | 'MIXED'
  confidence: 'HIGH' | 'MODERATE' | 'LOW'
  // past
  legs: Leg[]
  currentLeg: Leg | null
  legRetPct: number | null // percentile of the current leg's size among past legs in the same direction
  legBarsPct: number | null
  // now
  gauges: Gauge[]
  stateLabel: string
  levels: { high52: number; low52: number; poc: number; support: number | null; resistance: number | null }
  featureNames: string[]
  featureNow: number[]
}

const quantile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0)
const std = (a: number[]) => {
  if (a.length < 2) return 0
  const m = mean(a)
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1))
}
const sortedCopy = (a: number[]) => [...a].sort((x, y) => x - y)

const percentRank = (sortedVals: number[], v: number): number => {
  if (sortedVals.length === 0) return 50
  let lo = 0
  let hi = sortedVals.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sortedVals[mid] < v) lo = mid + 1
    else hi = mid
  }
  return (lo / sortedVals.length) * 100
}

function computeFeatures(bars: DBar[]) {
  const n = bars.length
  const rets = new Array<number>(n).fill(0)
  for (let i = 1; i < n; i++) rets[i] = Math.log(bars[i].c / bars[i - 1].c)

  const rows: (number[] | null)[] = new Array(n).fill(null)
  const vol20 = new Array<number>(n).fill(NaN)

  for (let i = START; i < n; i++) {
    const w20 = rets.slice(i - 19, i + 1)
    const w100 = rets.slice(i - 99, i + 1)
    const v20 = std(w20)
    const v100 = std(w100)
    vol20[i] = v20

    let hi = -Infinity
    let lo = Infinity
    let hiIdx = i
    for (let j = i - 251; j <= i; j++) {
      if (bars[j].h > hi) {
        hi = bars[j].h
        hiIdx = j
      }
      if (bars[j].l < lo) lo = bars[j].l
    }
    let v5 = 0
    let v50 = 0
    for (let j = i - 49; j <= i; j++) {
      v50 += bars[j].v
      if (j > i - 5) v5 += bars[j].v
    }
    v5 /= 5
    v50 /= 50

    let streak = 0
    for (let j = i; j > i - 10 && j > 0; j--) {
      const up = bars[j].c >= bars[j - 1].c
      if (j === i) streak = up ? 1 : -1
      else if ((streak > 0) === up) streak += streak > 0 ? 1 : -1
      else break
    }

    rows[i] = [
      bars[i].c / bars[i - 5].c - 1,
      bars[i].c / bars[i - 20].c - 1,
      bars[i].c / bars[i - 60].c - 1,
      bars[i].c / hi - 1,
      bars[i].c / lo - 1,
      v100 > 0 && v20 > 0 ? Math.log(v20 / v100) : 0,
      v50 > 0 && v5 > 0 ? Math.log(v5 / v50) : 0,
      (i - hiIdx) / 252,
      streak,
    ]
  }
  return { rows, vol20 }
}

function zigzag(bars: DBar[], theta: number): Leg[] {
  const n = bars.length
  const legs: Leg[] = []
  if (n < 2 || theta <= 0) return legs
  let dir: 'up' | 'down' | null = null
  let startIdx = 0
  let extIdx = 0
  for (let i = 1; i < n; i++) {
    const c = bars[i].c
    if (dir === null) {
      if (c >= bars[extIdx].c * (1 + theta)) {
        dir = 'up'
        extIdx = i
      } else if (c <= bars[extIdx].c * (1 - theta)) {
        dir = 'down'
        extIdx = i
      }
      continue
    }
    if (dir === 'up') {
      if (c > bars[extIdx].c) extIdx = i
      else if (c <= bars[extIdx].c * (1 - theta)) {
        legs.push(makeLeg(bars, 'up', startIdx, extIdx, false))
        startIdx = extIdx
        dir = 'down'
        extIdx = i
      }
    } else {
      if (c < bars[extIdx].c) extIdx = i
      else if (c >= bars[extIdx].c * (1 + theta)) {
        legs.push(makeLeg(bars, 'down', startIdx, extIdx, false))
        startIdx = extIdx
        dir = 'up'
        extIdx = i
      }
    }
  }
  if (dir) legs.push(makeLeg(bars, dir, startIdx, n - 1, true))
  return legs
}

function makeLeg(bars: DBar[], dir: 'up' | 'down', s: number, e: number, ongoing: boolean): Leg {
  return {
    dir,
    startIdx: s,
    endIdx: e,
    startT: bars[s].t,
    endT: bars[e].t,
    ret: (bars[e].c / bars[s].c - 1) * 100,
    bars: e - s,
    ongoing,
  }
}

export function buildDossier(rawBars: DBar[]): Dossier | null {
  const bars = rawBars.filter((b) => b.c > 0 && b.t > 0).sort((a, b) => a.t - b.t)
  const n = bars.length
  if (n < START + FWD + 60) return null

  const { rows, vol20 } = computeFeatures(bars)
  const nf = FEATURE_LABELS.length
  const last = n - 1

  // normalise each measurement over the stock's own history
  const mu: number[] = []
  const sd: number[] = []
  for (let f = 0; f < nf; f++) {
    const col: number[] = []
    for (let i = START; i < n; i++) col.push(rows[i]![f])
    mu.push(mean(col))
    sd.push(std(col) || 1)
  }
  const z = (i: number) => rows[i]!.map((v, f) => Math.max(-3, Math.min(3, (v - mu[f]) / sd[f])))
  const zq = z(last)

  // unconditional baseline: every day with a full forward window
  const candEnd = n - 1 - FWD
  const baseRet: Record<number, number[]> = {}
  HORIZONS.forEach((h) => (baseRet[h] = []))
  let baseTouchUpN = 0
  let baseTouchDownN = 0
  let baseNewHighN = 0
  let baseCount = 0
  const r20all: number[] = []
  for (let i = START; i <= candEnd; i++) {
    HORIZONS.forEach((h) => baseRet[h].push((bars[i + h].c / bars[i].c - 1) * 100))
    r20all.push((bars[i + 20].c / bars[i].c - 1) * 100)
    baseCount++
  }
  const s20 = std(r20all)

  for (let i = START; i <= candEnd; i++) {
    let mx = -Infinity
    let mn = Infinity
    let hi52 = -Infinity
    for (let j = i - 251; j <= i; j++) hi52 = Math.max(hi52, bars[j].h)
    let newHigh = false
    for (let j = 1; j <= FWD; j++) {
      const r = (bars[i + j].c / bars[i].c - 1) * 100
      mx = Math.max(mx, r)
      mn = Math.min(mn, r)
      if (bars[i + j].h > hi52) newHigh = true
    }
    if (mx >= s20) baseTouchUpN++
    if (mn <= -s20) baseTouchDownN++
    if (newHigh) baseNewHighN++
  }

  // rank every candidate day by similarity to today
  const scored: { i: number; d: number }[] = []
  for (let i = START; i <= candEnd; i++) {
    const zi = z(i)
    let s = 0
    for (let f = 0; f < nf; f++) s += (zi[f] - zq[f]) ** 2
    scored.push({ i, d: Math.sqrt(s / nf) })
  }
  scored.sort((a, b) => a.d - b.d)

  const picked: { i: number; d: number }[] = []
  for (const c of scored) {
    if (picked.every((p) => Math.abs(p.i - c.i) >= MIN_SEP)) picked.push(c)
    if (picked.length >= K_ANALOGS) break
  }

  const analogs: Analog[] = picked.map((p) => {
    const path: number[] = []
    for (let j = 0; j <= FWD; j++) path.push((bars[p.i + j].c / bars[p.i].c - 1) * 100)
    const ret: Record<number, number> = {}
    HORIZONS.forEach((h) => (ret[h] = path[h]))
    return {
      idx: p.i,
      t: bars[p.i].t,
      distance: p.d,
      path,
      ret,
      worst: Math.min(...path),
      best: Math.max(...path),
    }
  })

  const cone = { p5: [] as number[], p25: [] as number[], p50: [] as number[], p75: [] as number[], p95: [] as number[] }
  for (let j = 0; j <= FWD; j++) {
    const col = sortedCopy(analogs.map((a) => a.path[j]))
    cone.p5.push(quantile(col, 0.05))
    cone.p25.push(quantile(col, 0.25))
    cone.p50.push(quantile(col, 0.5))
    cone.p75.push(quantile(col, 0.75))
    cone.p95.push(quantile(col, 0.95))
  }

  const horizons: HorizonRow[] = HORIZONS.map((h) => {
    const a = analogs.map((x) => x.ret[h])
    const sa = sortedCopy(a)
    const sb = sortedCopy(baseRet[h])
    return {
      h,
      median: quantile(sa, 0.5),
      p25: quantile(sa, 0.25),
      p75: quantile(sa, 0.75),
      mean: mean(a),
      pUp: a.filter((v) => v > 0).length / a.length,
      baseMedian: quantile(sb, 0.5),
      basePUp: baseRet[h].filter((v) => v > 0).length / baseRet[h].length,
    }
  })

  const touchUp = analogs.filter((a) => a.best >= s20).length / analogs.length
  const touchDown = analogs.filter((a) => a.worst <= -s20).length / analogs.length
  const newHighCount = picked.filter((p) => {
    let hi52 = -Infinity
    for (let j = p.i - 251; j <= p.i; j++) hi52 = Math.max(hi52, bars[j].h)
    for (let j = 1; j <= FWD; j++) if (bars[p.i + j].h > hi52) return true
    return false
  }).length

  const row20 = horizons.find((r) => r.h === 20)!
  const a20 = analogs.map((a) => a.ret[20])
  const sd20 = std(a20)
  const tStat = sd20 > 0 ? (mean(a20) - mean(baseRet[20])) / (sd20 / Math.sqrt(a20.length)) : 0
  const agreement = Math.max(row20.pUp, 1 - row20.pUp)
  const tiltVal = row20.pUp - row20.basePUp
  const tilt: Dossier['tilt'] = tiltVal >= 0.1 ? 'BULLISH' : tiltVal <= -0.1 ? 'BEARISH' : 'MIXED'
  const confidence: Dossier['confidence'] =
    Math.abs(tStat) >= 2 && agreement >= 0.7 ? 'HIGH' : Math.abs(tStat) >= 1.3 || agreement >= 0.68 ? 'MODERATE' : 'LOW'
  const meanDist = mean(picked.map((p) => p.d))
  const matchQuality = Math.round(100 * Math.exp(-meanDist))

  // past: swing legs sized by the stock's own typical 20-bar move
  const legs = zigzag(bars, s20 / 100)
  const currentLeg = legs.length ? legs[legs.length - 1] : null
  let legRetPct: number | null = null
  let legBarsPct: number | null = null
  if (currentLeg) {
    const same = legs.filter((l) => l.dir === currentLeg.dir && !l.ongoing)
    legRetPct = percentRank(sortedCopy(same.map((l) => Math.abs(l.ret))), Math.abs(currentLeg.ret))
    legBarsPct = percentRank(sortedCopy(same.map((l) => l.bars)), currentLeg.bars)
  }

  // now: where each measurement sits in the stock's own history
  const hist = (f: number) => sortedCopy(Array.from({ length: n - START }, (_, k) => rows[START + k]![f]))
  const now = rows[last]!
  const volHist = sortedCopy(vol20.filter((v) => !Number.isNaN(v)))
  const gauges: Gauge[] = [
    { label: 'Momentum 20d', display: `${now[1] >= 0 ? '+' : ''}${(now[1] * 100).toFixed(1)}%`, pct: percentRank(hist(1), now[1]) },
    { label: 'Trend 60d', display: `${now[2] >= 0 ? '+' : ''}${(now[2] * 100).toFixed(1)}%`, pct: percentRank(hist(2), now[2]) },
    { label: 'Closeness to 52w high', display: `${(now[3] * 100).toFixed(1)}%`, pct: percentRank(hist(3), now[3]) },
    { label: 'Volatility', display: `${(vol20[last] * Math.sqrt(252) * 100).toFixed(0)}% ann.`, pct: percentRank(volHist, vol20[last]) },
    { label: 'Vol expanding', display: now[5] >= 0 ? 'rising' : 'falling', pct: percentRank(hist(5), now[5]) },
    { label: 'Volume vs normal', display: `${now[6] >= 0 ? '+' : ''}${((Math.exp(now[6]) - 1) * 100).toFixed(0)}%`, pct: percentRank(hist(6), now[6]) },
  ]
  const trendP = gauges[1].pct
  const locP = gauges[2].pct
  const volP = gauges[3].pct
  const stateLabel = [
    trendP >= 67 ? 'Uptrend' : trendP <= 33 ? 'Downtrend' : 'Range-bound',
    locP >= 80 ? 'near highs' : locP <= 20 ? 'deep below highs' : 'mid-range',
    volP >= 67 ? 'high volatility' : volP <= 33 ? 'quiet volatility' : 'normal volatility',
  ].join(' · ')

  // key levels from the last year of price and volume
  let high52 = -Infinity
  let low52 = Infinity
  for (let j = last - 251; j <= last; j++) {
    high52 = Math.max(high52, bars[j].h)
    low52 = Math.min(low52, bars[j].l)
  }
  const BINS = 24
  const binW = (high52 - low52) / BINS || 1
  const vp = new Array<number>(BINS).fill(0)
  for (let j = last - 251; j <= last; j++) {
    const tp = (bars[j].h + bars[j].l + bars[j].c) / 3
    vp[Math.max(0, Math.min(BINS - 1, Math.floor((tp - low52) / binW)))] += bars[j].v
  }
  const avgVp = mean(vp)
  const center = (b: number) => low52 + (b + 0.5) * binW
  const pocBin = vp.indexOf(Math.max(...vp))
  const price = bars[last].c
  let support: number | null = null
  let resistance: number | null = null
  for (let b = 0; b < BINS; b++) {
    if (vp[b] < avgVp * 1.3) continue
    const c = center(b)
    if (c < price && (support === null || c > support)) support = c
    if (c > price && (resistance === null || c < resistance)) resistance = c
  }

  return {
    n,
    lastClose: price,
    lastT: bars[last].t,
    analogs,
    cone,
    horizons,
    s20,
    touchUp,
    touchDown,
    baseTouchUp: baseTouchUpN / baseCount,
    baseTouchDown: baseTouchDownN / baseCount,
    pNewHigh: newHighCount / picked.length,
    basePNewHigh: baseNewHighN / baseCount,
    matchQuality,
    agreement,
    tStat,
    tilt,
    confidence,
    legs,
    currentLeg,
    legRetPct,
    legBarsPct,
    gauges,
    stateLabel,
    levels: { high52, low52, poc: center(pocBin), support, resistance },
    featureNames: FEATURE_LABELS,
    featureNow: now,
  }
}
