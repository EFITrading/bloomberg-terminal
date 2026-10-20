// "Dive In" analytics for the seasonality chart. Everything here is derived from the
// per-day, per-year returns the chart already holds (`yearlyReturns`), nothing is simulated.

export interface DiveDay {
  dayOfYear: number
  avgReturn: number
  yearlyReturns: { [year: number]: number }
}

export interface DiveOptions {
  yearLines: boolean
  band: boolean
  exCrisis: boolean
  halves: boolean
}

export const DEFAULT_DIVE_OPTIONS: DiveOptions = {
  yearLines: true,
  band: true,
  exCrisis: false,
  halves: false,
}

export const CRISIS_YEARS = [2008, 2020, 2022]

export const getYears = (daily: DiveDay[]): number[] => {
  const years = new Set<number>()
  daily.forEach((d) => Object.keys(d.yearlyReturns).forEach((y) => years.add(Number(y))))
  return [...years].sort((a, b) => a - b)
}

// Cumulative return path of one year over the chart's day list. A day the year has no bar for
// takes that day's average, which leaves the mean of all paths equal to the white average line.
export const buildYearPath = (daily: DiveDay[], year: number): number[] => {
  let cum = 0
  return daily.map((d) => {
    const r = d.yearlyReturns[year]
    cum += r !== undefined ? r : d.avgReturn
    return cum
  })
}

export const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

// Average curve rebuilt from only the given years (same math as the main average line).
export const buildSubsetAverage = <T extends DiveDay & { cumulativeReturn: number }>(
  daily: T[],
  years: number[]
): T[] => {
  let cum = 0
  return daily.map((d) => {
    const vals = years.map((y) => d.yearlyReturns[y]).filter((v): v is number => v !== undefined)
    const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0
    cum += avg
    return { ...d, avgReturn: avg, cumulativeReturn: cum }
  })
}

export interface YearWindowResult {
  year: number
  ret: number
  dip: number // lowest point of the window relative to entry (<= 0)
}

export interface WindowStats {
  startDay: number
  endDay: number
  years: YearWindowResult[]
  n: number
  winRate: number
  mean: number
  median: number
  std: number
  tStat: number
  best: YearWindowResult | null
  worst: YearWindowResult | null
  avgDip: number
  worstDip: number
}

// Per-year result of holding through [startDay, endDay]. A year counts only if it has bars for
// at least 80% of the window's days, so the still-running current year is skipped until it is done.
export const computeWindowStats = (daily: DiveDay[], startDay: number, endDay: number): WindowStats => {
  const days = daily.filter((d) => d.dayOfYear >= startDay && d.dayOfYear <= endDay)
  const results: YearWindowResult[] = []
  const raw: Array<YearWindowResult & { present: number }> = []
  getYears(daily).forEach((year) => {
    let cum = 0
    let dip = 0
    let present = 0
    days.forEach((d) => {
      const r = d.yearlyReturns[year]
      if (r === undefined) return
      present++
      cum += r
      if (cum < dip) dip = cum
    })
    if (present > 0) raw.push({ year, ret: cum, dip, present })
  })
  // Calendar days in the average include days other years traded, so compare coverage between years
  const maxPresent = Math.max(0, ...raw.map((r) => r.present))
  raw.forEach((r) => {
    if (r.present >= maxPresent * 0.8) results.push({ year: r.year, ret: r.ret, dip: r.dip })
  })

  const n = results.length
  const rets = results.map((r) => r.ret)
  const mean = n ? rets.reduce((s, v) => s + v, 0) / n : 0
  const sorted = [...rets].sort((a, b) => a - b)
  const median = n ? percentile(sorted, 0.5) : 0
  const std = n > 1 ? Math.sqrt(rets.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) : 0
  const tStat = std > 0 ? mean / (std / Math.sqrt(n)) : 0
  const byRet = [...results].sort((a, b) => a.ret - b.ret)
  const dips = results.map((r) => r.dip)

  return {
    startDay,
    endDay,
    years: results,
    n,
    winRate: n ? (rets.filter((v) => v > 0).length / n) * 100 : 0,
    mean,
    median,
    std,
    tStat,
    best: n ? byRet[n - 1] : null,
    worst: n ? byRet[0] : null,
    avgDip: n ? dips.reduce((s, v) => s + v, 0) / n : 0,
    worstDip: n ? Math.min(...dips) : 0,
  }
}

export interface WindowProgress {
  status: 'upcoming' | 'active' | 'done'
  daysTo: number
  windowLen: number
  thisYear: number // current year's return inside the window so far
  avgSoFar: number // average of past years over the same stretch
}

export const computeWindowProgress = (
  daily: DiveDay[],
  stats: WindowStats,
  currentYear: number,
  todayDoy: number
): WindowProgress => {
  const { startDay, endDay } = stats
  const windowLen = endDay - startDay + 1
  const status = todayDoy < startDay ? 'upcoming' : todayDoy > endDay ? 'done' : 'active'
  const upTo = Math.min(todayDoy, endDay)
  const upToDays = daily.filter((d) => d.dayOfYear >= startDay && d.dayOfYear <= upTo)

  const sumFor = (year: number) =>
    upToDays.reduce((s, d) => s + (d.yearlyReturns[year] ?? 0), 0)

  const pastYears = stats.years.map((y) => y.year).filter((y) => y !== currentYear)
  const avgSoFar = pastYears.length
    ? pastYears.reduce((s, y) => s + sumFor(y), 0) / pastYears.length
    : 0

  return {
    status,
    daysTo: status === 'upcoming' ? startDay - todayDoy : 0,
    windowLen,
    thisYear: status === 'upcoming' ? 0 : sumFor(currentYear),
    avgSoFar,
  }
}

export const todayDayOfYear = (): number => {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  return Math.floor((now.getTime() - start.getTime()) / 86400000) + 1
}
