'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

import { TOP_1800_SYMBOLS } from '@/lib/Top1000Symbols'

// ── Constants ──────────────────────────────────────────────────────────────────
const CONTRACTION_THRESHOLD = 30 // matching ConsolidationHistoryScreener exactly
const MIN_AVG_HV = 3.0
const SCAN_TRADING_DAYS = 5 // flag only if POI + contraction within last 5 TDs
const CHART_VISIBLE_DAYS = 60 // candles shown in chart
const FETCH_CAL_DAYS = 500 // calendar days to fetch (for avgHV lookback)
const DARK_POOL_EXCHANGES = new Set([4, 6, 16, 201, 202, 203])
const LIT_BLOCK_MIN_NOTIONAL = 250_000
const RISK_FREE_RATE = 0.0387
const OHLCV_CONCURRENCY = 8 // parallel OHLCV fetches
const MAX_SYMBOLS = 1000 // maximum symbols in universe

// ── Types ──────────────────────────────────────────────────────────────────────
interface Bar {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  t: number
}
interface ContraEvent {
  date: string
  price: number
  compressionPct: number
  squeezeOn: boolean
}
interface DPPrint {
  price: number
  size: number
  ts: number
}
interface DPDay {
  date: string
  top10: DPPrint[]
  totalNotional: number
  topPrint: DPPrint
}
interface POILevel {
  price: number
  totalNotional: number
  printCount: number
  dates: string[]
}
interface StraddleTrade {
  currentPrice: number
  iv: number
  dte: number
  expiration: string
  callStrike: number
  callEntry: number
  callT1Stock: number
  callT1Premium: number
  callT2Stock: number
  callT2Premium: number
  callStop: number
  putStrike: number
  putEntry: number
  putT1Stock: number
  putT1Premium: number
  putT2Stock: number
  putT2Premium: number
  putStop: number
  totalCost: number
  upperBE: number
  lowerBE: number
}
interface ScanResult {
  symbol: string
  currentPrice: number
  compressionPct: number
  squeezeOn: boolean
  hasPOI: boolean
  topPOI: POILevel | null
  setupActive: boolean
  bars: Bar[]
  allEvents: ContraEvent[]
  recentEvents: ContraEvent[]
  dpDays: DPDay[]
  poiLevels: POILevel[]
  trade: StraddleTrade | null
}
interface ScanStats {
  totalSymbols: number
  ohlcvDone: number
  contractionHits: number
  dpDone: number
  setupsFound: number
}

// ── Black-Scholes Helpers ─────────────────────────────────────────────────────
function nCDF(x: number): number {
  const sign = x >= 0 ? 1 : -1
  x = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * x)
  const poly =
    t *
    (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))))
  return 0.5 * (1 + sign * (1 - poly * Math.exp(-x * x)))
}

function bsPrice(S: number, K: number, T: number, r: number, sig: number, isCall: boolean): number {
  if (T <= 0) return isCall ? Math.max(0, S - K) : Math.max(0, K - S)
  const d1 = (Math.log(S / K) + (r + 0.5 * sig * sig) * T) / (sig * Math.sqrt(T))
  const d2 = d1 - sig * Math.sqrt(T)
  return isCall
    ? S * nCDF(d1) - K * Math.exp(-r * T) * nCDF(d2)
    : K * Math.exp(-r * T) * nCDF(-d2) - S * nCDF(-d1)
}

function findStrike80(S: number, r: number, sig: number, T: number, isCall: boolean): number {
  const d2At = (K: number) => {
    const d1 = (Math.log(S / K) + (r + 0.5 * sig * sig) * T) / (sig * Math.sqrt(T))
    return d1 - sig * Math.sqrt(T)
  }
  if (isCall) {
    let lo = S * 1.001,
      hi = S * 2.0
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2
      const prob = (1 - nCDF(d2At(mid))) * 100
      if (Math.abs(prob - 20) < 0.05) return mid
      prob > 20 ? (lo = mid) : (hi = mid)
    }
    return (lo + hi) / 2
  } else {
    let lo = S * 0.1,
      hi = S * 0.999
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2
      const prob = nCDF(-d2At(mid)) * 100
      if (Math.abs(prob - 20) < 0.05) return mid
      prob < 20 ? (hi = mid) : (lo = mid)
    }
    return (lo + hi) / 2
  }
}

function calcAnnualIV(bars: Bar[]): number {
  const closes = bars.slice(-21).map((b) => b.close)
  if (closes.length < 2) return 0.3
  const rets = closes.slice(1).map((c, i) => Math.log(c / closes[i]))
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length
  const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1)
  return Math.sqrt(variance) * Math.sqrt(252)
}

function nextWeeklyExpiry(minDaysOut = 7): string {
  const d = new Date()
  d.setDate(d.getDate() + minDaysOut)
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

// ── Contraction Logic — matching ConsolidationHistoryScreener.tsx exactly ─────
function calcEMA(vals: number[], p: number): number {
  if (vals.length < p) return 0
  const k = 2 / (p + 1)
  let e = vals.slice(0, p).reduce((s, v) => s + v, 0) / p
  for (let i = p; i < vals.length; i++) e = (vals[i] - e) * k + e
  return e
}

function calcATR(bars: Bar[], p = 14): number {
  if (bars.length < p + 1) return 0
  const trs: number[] = []
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].high,
      l = bars[i].low,
      pc = bars[i - 1].close
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)))
  }
  return trs.slice(-p).reduce((s, t) => s + t, 0) / p
}

function ttmSqueeze(bars: Bar[], p = 20): boolean {
  if (bars.length < p) return false
  const cl = bars.slice(-p).map((b) => b.close)
  const sma = cl.reduce((s, c) => s + c, 0) / p
  const std = Math.sqrt(cl.reduce((s, c) => s + (c - sma) ** 2, 0) / p)
  const ema = calcEMA(cl, p)
  const atr = calcATR(bars, p)
  return sma + 2 * std < ema + 1.5 * atr && sma - 2 * std > ema - 1.5 * atr
}

function calcHV4D(bars: Bar[], lookback = 120): number {
  if (bars.length < lookback) return 0
  const rb = bars.slice(-lookback)
  const moves: number[] = []
  for (let i = 4; i < rb.length; i++) {
    const h = Math.max(...rb.slice(i - 4, i + 1).map((b) => b.high))
    const l = Math.min(...rb.slice(i - 4, i + 1).map((b) => b.low))
    moves.push(((h - l) / l) * 100)
  }
  return moves.length ? moves.reduce((s, m) => s + m, 0) / moves.length : 0
}

function detectContraction(bars: Bar[]): { qualifies: boolean; compressionPct: number } {
  if (bars.length < 120) return { qualifies: false, compressionPct: 0 }
  const lb = bars.slice(-4)
  if (lb.length < 4) return { qualifies: false, compressionPct: 0 }
  const avgHV = calcHV4D(bars)
  if (!avgHV || avgHV < MIN_AVG_HV) return { qualifies: false, compressionPct: 0 }
  const high = Math.max(...lb.map((b) => b.high))
  const low = Math.min(...lb.map((b) => b.low))
  const currentRange = high - low
  const rangePercent = (currentRange / low) * 100
  const compressionPct = ((avgHV - rangePercent) / avgHV) * 100
  const netMove = Math.abs(lb[lb.length - 1].close - lb[0].close)
  const notTrending = currentRange > 0 ? netMove / currentRange < 0.8 : false
  const curBar = lb[lb.length - 1]
  const avgBarRange = lb.reduce((s, b) => s + (b.high - b.low), 0) / lb.length
  const curBarTight = avgBarRange > 0 && curBar.high - curBar.low <= avgBarRange * 2.0
  return {
    qualifies: compressionPct > CONTRACTION_THRESHOLD && notTrending && curBarTight,
    compressionPct,
  }
}

function scanHistory(allBars: Bar[]): ContraEvent[] {
  const events: ContraEvent[] = []
  let inC = false,
    peakC = 0,
    lastIdx = -1
  const emit = () => {
    if (!inC || lastIdx < 0) return
    events.push({
      date: allBars[lastIdx].date,
      price: allBars[lastIdx].close,
      compressionPct: peakC,
      squeezeOn: ttmSqueeze(allBars.slice(0, lastIdx + 1)),
    })
    inC = false
    peakC = 0
    lastIdx = -1
  }
  for (let i = 120; i < allBars.length; i++) {
    const r = detectContraction(allBars.slice(0, i + 1))
    if (r.qualifies) {
      if (!inC) {
        inC = true
        peakC = r.compressionPct
      } else if (r.compressionPct > peakC) peakC = r.compressionPct
      lastIdx = i
    } else {
      if (inC) emit()
    }
  }
  if (inC) emit()
  return events
}

// ── POI Clustering — top 10 ───────────────────────────────────────────────────
function clusterPOI(dpDays: DPDay[]): POILevel[] {
  const pts: { price: number; notional: number; date: string }[] = []
  for (const d of dpDays)
    for (const p of d.top10) pts.push({ price: p.price, notional: p.size * p.price, date: d.date })
  if (!pts.length) return []
  pts.sort((a, b) => a.price - b.price)
  const clusters: POILevel[] = []
  let i = 0
  while (i < pts.length) {
    const ref = pts[i].price,
      thr = ref * 0.0075
    const g: typeof pts = []
    while (i < pts.length && Math.abs(pts[i].price - ref) <= thr) {
      g.push(pts[i])
      i++
    }
    clusters.push({
      price: g.reduce((s, p) => s + p.price, 0) / g.length,
      totalNotional: g.reduce((s, p) => s + p.notional, 0),
      printCount: g.length,
      dates: [...new Set(g.map((p) => p.date))].sort().slice(-3),
    })
  }
  return clusters.sort((a, b) => b.totalNotional - a.totalNotional).slice(0, 10) // TOP 10
}

function buildStraddleTrade(allBars: Bar[]): StraddleTrade {
  const currentPrice = allBars[allBars.length - 1].close
  const iv = Math.max(0.05, calcAnnualIV(allBars))
  const expiration = nextWeeklyExpiry(7)
  const today = new Date()
  const expD = new Date(expiration)
  const dte = Math.max(1, Math.ceil((expD.getTime() - today.getTime()) / 86_400_000))
  const T = dte / 365

  const callStrike = Math.round(findStrike80(currentPrice, RISK_FREE_RATE, iv, T, true))
  const putStrike = Math.round(findStrike80(currentPrice, RISK_FREE_RATE, iv, T, false))

  const callEntry = bsPrice(currentPrice, callStrike, T, RISK_FREE_RATE, iv, true)
  const putEntry = bsPrice(currentPrice, putStrike, T, RISK_FREE_RATE, iv, false)

  const expMove1SD = currentPrice * iv * Math.sqrt(T)
  const expMove15SD = expMove1SD * 1.5

  const callT1Stock = currentPrice + expMove1SD * 0.84
  const callT2Stock = currentPrice + expMove15SD
  const callT1Premium = bsPrice(callT1Stock, callStrike, T * 0.7, RISK_FREE_RATE, iv, true)
  const callT2Premium = bsPrice(callT2Stock, callStrike, T * 0.5, RISK_FREE_RATE, iv, true)

  const putT1Stock = currentPrice - expMove1SD * 0.84
  const putT2Stock = currentPrice - expMove15SD
  const putT1Premium = bsPrice(putT1Stock, putStrike, T * 0.7, RISK_FREE_RATE, iv, false)
  const putT2Premium = bsPrice(putT2Stock, putStrike, T * 0.5, RISK_FREE_RATE, iv, false)

  return {
    currentPrice,
    iv,
    dte,
    expiration,
    callStrike,
    callEntry,
    callT1Stock,
    callT1Premium,
    callT2Stock,
    callT2Premium,
    callStop: callEntry * 0.5,
    putStrike,
    putEntry,
    putT1Stock,
    putT1Premium,
    putT2Stock,
    putT2Premium,
    putStop: putEntry * 0.5,
    totalCost: (callEntry + putEntry) * 100,
    upperBE: callStrike + callEntry + putEntry,
    lowerBE: putStrike - (callEntry + putEntry),
  }
}

// ── Format Helpers ─────────────────────────────────────────────────────────────
function fmtN(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}
function fmtDate(d: string): string {
  return new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}
function fmtExpiry(d: string): string {
  return new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// ── Concurrency helper ────────────────────────────────────────────────────────
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  onEach?: (result: T, index: number) => void,
  signal?: AbortSignal
): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let nextIdx = 0
  const worker = async () => {
    while (nextIdx < tasks.length) {
      if (signal?.aborted) return
      const idx = nextIdx++
      try {
        results[idx] = await tasks[idx]()
        if (onEach) onEach(results[idx], idx)
      } catch {
        // skip failed task — results[idx] stays undefined
      }
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, worker)
  await Promise.all(workers)
  return results
}

// ── Symbol universe from Top1000Symbols.ts ───────────────────────────────────
async function fetchTopSymbols(
  _apiKey: string,
  limit: number,
  _signal: AbortSignal
): Promise<string[]> {
  return TOP_1800_SYMBOLS.slice(0, limit)
}
;('JPM',
  'LLY',
  'V',
  'MA',
  'UNH',
  'XOM',
  'WMT',
  'ORCL',
  'HD',
  'PG',
  'COST',
  'BAC',
  'NFLX',
  'AMD',
  'KO',
  'ABBV',
  'MRK',
  'CVX',
  'WFC',
  'CRM',
  'CSCO',
  'MCD',
  'ACN',
  'PEP',
  'LIN',
  'ABT',
  'MS',
  'BX',
  'GE',
  'TMO',
  'GS',
  'IBM',
  'ISRG',
  'NOW',
  'AXP',
  'CAT',
  'RTX',
  'SPGI',
  'UBER',
  'INTU',
  'TXN',
  'VZ',
  'NEE',
  'UNP',
  'T',
  'ETN',
  'BA',
  'PFE',
  'HON',
  'AMGN',
  'LOW',
  'DE',
  'BKNG',
  'AMAT',
  'ADI',
  'CMCSA',
  'BMY',
  'TJX',
  'PANW',
  'SYK',
  'VRTX',
  'ADP',
  'BSX',
  'MU',
  'PLD',
  'LMT',
  'C',
  'GEV',
  'SCHW',
  'INTC',
  'MDT',
  'GILD',
  'CB',
  'NKE',
  'CI',
  'SO',
  'CMG',
  'MMC',
  'DUK',
  'ELV',
  'AMT',
  'AON',
  'WM',
  'ICE',
  'ZTS',
  'SHW',
  'CTAS',
  'USB',
  'COF',
  'MCO',
  'FCX',
  'MDLZ',
  'PH',
  'MPC',
  'EMR',
  'TDG',
  'APD',
  'CEG',
  'GD',
  'APH',
  'SNPS',
  'CDNS',
  'CME',
  'ITW',
  'MSI',
  'EOG',
  'ORLY',
  'MCK',
  'REGN',
  'ECL',
  'HCA',
  'BDX',
  'NOC',
  'PSA',
  'SPG',
  'NSC',
  'KMB',
  'WMB',
  'TT',
  'PSX',
  'ROP',
  'WELL',
  'OXY',
  'BBY',
  'KR',
  'HUM',
  'CL',
  'AFL',
  'F',
  'GM',
  'PCAR',
  'CARR',
  'COP',
  'MET',
  'AIG',
  'EW',
  'GWW',
  'GLW',
  'PCG',
  'FIS',
  'PAYX',
  'NEM',
  'DLR',
  'AZO',
  'FAST',
  'A',
  'FICO',
  'CPRT',
  'VRSK',
  'ACGL',
  'PWR',
  'VLO',
  'FANG',
  'CTVA',
  'BK',
  'TFC',
  'STZ',
  'RSG',
  'URI',
  'KVUE',
  'LRCX',
  'ODFL',
  'MCHP',
  'DD',
  'IQV',
  'FTNT',
  'SRE',
  'DG',
  'MPWR',
  'TEL',
  'DXCM',
  'HSY',
  'MSCI',
  'EFX',
  'VICI',
  'VMC',
  'MLM',
  'MAR',
  'DLTR',
  'DHI',
  'IDXX',
  'EXC',
  'GEHC',
  'CDW',
  'KHC',
  'XEL',
  'GIS',
  'DFS',
  'WAB',
  'WEC',
  'CBRE',
  'ON',
  'AVB',
  'ED',
  'MTD',
  'FTV',
  'TSCO',
  'OTIS',
  'KEYS',
  'RCL',
  'HST',
  'EXR',
  'EBAY',
  'DOV',
  'ETR',
  'DECK',
  'PPL',
  'CHD',
  'ROK',
  'ANSS',
  'LHX',
  'APTV',
  'SBUX',
  'NXPI',
  'TTWO',
  'TRV',
  'WBA',
  'AMP',
  'TROW',
  'BBB',
  'CBOE',
  'STT',
  'LEN',
  'LUV',
  'UAL',
  'CCL',
  'WYNN',
  'MGM',
  'LVS',
  'NCLH',
  'DAL',
  'AAL',
  'HA',
  'SAVE',
  'HAL',
  'DVN',
  'BKR',
  'SLB',
  'CVI',
  'MRO',
  'APA',
  'PDCE',
  'OVV',
  'SM',
  'PYPL',
  'SQ',
  'AFRM',
  'COIN',
  'HOOD',
  'SOFI',
  'MARA',
  'RIOT',
  'CIFR',
  'HUT',
  'PLTR',
  'RBLX',
  'SNAP',
  'PINS',
  'TWTR',
  'U',
  'DDOG',
  'ZS',
  'CRWD',
  'NET',
  'MDB',
  'ESTC',
  'CFLT',
  'GTLB',
  'OKTA',
  'ZI',
  'PATH',
  'ASAN',
  'SMAR',
  'FROG',
  'SNOW',
  'ABNB',
  'DASH',
  'LYFT',
  'NERDZ',
  'RIVN',
  'LCID',
  'NIO',
  'LI',
  'XPEV',
  'BIDU',
  'JD',
  'BABA',
  'PDD',
  'TCOM',
  'NTES',
  'EDU',
  'TAL',
  'YUMC',
  'ZTO',
  'PTON',
  'W',
  'ETSY',
  'CHWY',
  'WISH',
  'OSTK',
  'PRTS',
  'COHU',
  'KLIC',
  'ACLS',
  'GXO',
  'XPO',
  'SAIA',
  'WERN',
  'JBHT',
  'KNX',
  'CHRW',
  'EXPD',
  'HXL',
  'RXO',
  'DHR',
  'WAT',
  'REPX',
  'TECH',
  'PKI',
  'HOLX',
  'ALGN',
  'HSIC',
  'TFX',
  'PODD',
  'INSP',
  'AXNX',
  'NVCR',
  'TMDX',
  'IRTC',
  'LIVN',
  'ATRC',
  'SWAV',
  'CRVS',
  'SRDX',
  'AMD',
  'INTC',
  'QCOM',
  'TER',
  'KLAC',
  'LRCX',
  'AMAT',
  'ENTG',
  'ONTO',
  'UCTT',
  'IP',
  'PKG',
  'SEE',
  'SON',
  'BERY',
  'MYE',
  'GEF',
  'ATR',
  'PTVE',
  'SLGN',
  'FMC',
  'CF',
  'MOS',
  'NTR',
  'ICL',
  'CTLT',
  'AVNT',
  'RPM',
  'PPG',
  'ASH',
  'AXTA',
  'H.B.Fuller',
  'HUN',
  'CE',
  'CC',
  'OLN',
  'TROX',
  'VNTR',
  'GRFS',
  'JPM',
  'BAC',
  'WFC',
  'C',
  'USB',
  'TFC',
  'PNC',
  'FITB',
  'KEY',
  'RF',
  'CFG',
  'HBAN',
  'MTB',
  'STI',
  'BOH',
  'SIVB',
  'WAL',
  'FHN',
  'PBCT',
  'TCF',
  'INT',
  'ICE',
  'CME',
  'CBOE',
  'NDAQ',
  'BMO',
  'TD',
  'RY',
  'BNS',
  'ENB',
  'CNQ',
  'TRP',
  'SU',
  'CVE',
  'IMO',
  'MEG',
  'PEY',
  'ERF',
  'WCP',
  'BTE',
  'ARX',
  'VOD',
  'BP',
  'SHEL',
  'TTE',
  'AZN',
  'GSK',
  'SNY',
  'ROG',
  'NVS',
  'NOVN',
  'SAP',
  'ASML',
  'ADYEN',
  'HEIA',
  'PHIA',
  'ABN',
  'ING',
  'AEGN',
  'UNA',
  'RAND',
  'RIO',
  'BHP',
  'GLEN',
  'AAL',
  'BA',
  'BARC',
  'HSBA',
  'LLOY',
  'NWG',
  'PRU',
  'AV',
  'LGEN',
  'SLA',
  'RSA',
  'ADM',
  'BT',
  'VOD',
  'MEO',
  'SKY',
  'SVT',
  'AOF',
  'BCO',
  'SMCP',
  'ML',
  'CAP',
  'SAN',
  'GLE',
  'BNP',
  'ACA',
  'SGO',
  'OR',
  'LR',
  'MC',
  'CFR',
  'RMS',
  'TFI',
  'KNIN',
  'NESN',
  'NOVN',
  'ZURN',
  'ATVI',
  'EA',
  'TTWO',
  'RBLX',
  'U',
  'GMBL',
  'DKNG',
  'PENN',
  'PDYPY',
  'GAN',
  'DIS',
  'PARA',
  'WBD',
  'FOX',
  'FOXA',
  'NWSA',
  'NYT',
  'TRIP',
  'IAC',
  'ZG',
  'AMCX',
  'SGAM',
  'FUBO',
  'SIRI',
  'IHRT',
  'CARG',
  'CARS',
  'CDK',
  'CLVT',
  'IHS',
  'SPCE',
  'ASTS',
  'RDW',
  'MNTS',
  'BRPH',
  'ASTR',
  'RKLB',
  'PL',
  'BWXT',
  'DRS',
  'HEI',
  'HEICO',
  'TDY',
  'TGI',
  'KTOS',
  'LDOS',
  'VEC',
  'PAE',
  'KEYW',
  'CACI',
  'SAIC',
  'BAH',
  'MANT',
  'VRSN',
  'IBM',
  'CSC',
  'DXC',
  'EPAM',
  'GLOB',
  'LNKD',
  'WIT',
  'INFY',
  'TCS',
  'HCL',
  'TECH.M',
  'HEXW',
  'MPHASIS',
  'SIFY',
  'GOOGL',
  'META',
  'AMZN',
  'MSFT',
  'AAPL',
  'NFLX',
  'SPOT',
  'SNDL',
  'LYFT',
  'CRM',
  'NOW',
  'WDAY',
  'VEEV',
  'PAYC',
  'PCTY',
  'SPSN',
  'SWTX',
  'TNET',
  'HRB',
  'ADP',
  'PAYX',
  'WU',
  'FIS',
  'FISV',
  'GPN',
  'MA',
  'V',
  'PYPL',
  'SQ',
  'XOM',
  'CVX',
  'COP',
  'EOG',
  'PXD',
  'DVN',
  'FANG',
  'OXY',
  'MPC',
  'VLO',
  'PSX',
  'HES',
  'MRO',
  'APA',
  'OKE',
  'WMB',
  'KMI',
  'ET',
  'EPD',
  'MMP',
  'NEE',
  'DUK',
  'SO',
  'AEP',
  'D',
  'EXC',
  'PCG',
  'PEG',
  'ES',
  'XEL',
  'ED',
  'ETR',
  'PPL',
  'FE',
  'CMS',
  'NI',
  'AES',
  'DTE',
  'WEC',
  'CNP',
  'WELL',
  'VTR',
  'PEAK',
  'HR',
  'OHI',
  'MPW',
  'SBRA',
  'CTRE',
  'LTC',
  'UHT',
  'AMT',
  'CCI',
  'SBAC',
  'SBA',
  'EQIX',
  'DLR',
  'QTS',
  'IRM',
  'CONE',
  'UNIT',
  'PLD',
  'PSA',
  'EXR',
  'LSI',
  'NSA',
  'CUBE',
  'REXR',
  'EGP',
  'LXP',
  'GTY',
  'O',
  'WPC',
  'NNN',
  'STOR',
  'SRC',
  'VICI',
  'GLPI',
  'PENN',
  'BYD',
  'CHDN',
  'MAR',
  'HLT',
  'IHG',
  'H',
  'CHH',
  'WH',
  'STAY',
  'RHP',
  'SHO',
  'APLE',
  'PK',
  'BHR',
  'CLDT',
  'CPLG',
  'INN',
  'SLCH',
  'SOHO',
  'XHR',
  'DH',
  'BTB',
  'SPG',
  'MAC',
  'CBL',
  'WPG',
  'TCO',
  'REG',
  'KIM',
  'AKR',
  'BRX',
  'ROIC',
  'EQR',
  'AVB',
  'ESSummons',
  'UDR',
  'MAA',
  'CPT',
  'NMI',
  'JBG',
  'AIRC',
  'IRT',
  'AMH',
  'INVH',
  'TRICON',
  'SFR',
  'NVR',
  'PHM',
  'TOL',
  'MDC',
  'LGIH',
  'CCS',
  'TMHC',
  'KBH',
  'BZH',
  'MHO',
  'SKY',
  'CVCO',
  'UCP',
  'GRBK',
  'TPH',
  'NWHM',
  'SCI',
  'CSV',
  'MATW',
  'HI',
  'FL',
  'PLCE',
  'ANF',
  'PVH',
  'RL',
  'G-III',
  'GES',
  'FOSL',
  'WWW',
  'BOOT',
  'CATO',
  'JWN',
  'DDS',
  'KSS',
  'M',
  'SSI',
  'BBBY',
  'BIG',
  'JCP',
  'TUEM',
  'EXPR',
  'ZUMZ',
  'HIBB',
  'SPWH',
  'BGFV',
  'CATO',
  'TGT',
  'WMT',
  'COST',
  'BJ',
  'SFM',
  'WINN',
  'ACI',
  'SVU',
  'CHEF',
  'CASY',
  // ── Fetch OHLCV for a single symbol ───────────────────────────────────────────
  async function fetchOHLCV(
    symbol: string,
    apiKey: string,
    signal: AbortSignal
  ): Promise<Bar[] | null> {
    try {
      const toDate = new Date().toISOString().split('T')[0]
      const from = new Date()
      from.setDate(from.getDate() - FETCH_CAL_DAYS)
      const fromDate = from.toISOString().split('T')[0]
      const res = await fetch(
        `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fromDate}/${toDate}?adjusted=true&sort=asc&limit=1000&apiKey=${apiKey}`,
        { signal }
      )
      if (!res.ok) return null
      const json = await res.json()
      if (!json.results?.length) return null
      return (
        json.results as { t: number; o: number; h: number; l: number; c: number; v: number }[]
      ).map((r) => ({
        date: new Date(r.t).toISOString().split('T')[0],
        open: r.o,
        high: r.h,
        low: r.l,
        close: r.c,
        volume: r.v,
        t: r.t,
      }))
    } catch {
      return null
    }
  })

// ── RP: Dark pool scanner (exact match to POIScreener logic) ──────────────────
type RawTrade = { sip_timestamp: number; price: number; size: number; exchange: number }

async function scanDPDays(
  dates: string[],
  symbol: string,
  apiKey: string,
  onProgress: (pct: number) => void,
  signal: AbortSignal
): Promise<DPDay[]> {
  let aborted = false
  signal.addEventListener('abort', () => {
    aborted = true
  })

  const fetchWindow = async (url: string): Promise<RawTrade[]> => {
    const trades: RawTrade[] = []
    let nextUrl: string | null = url
    while (nextUrl && !aborted) {
      const res = await fetch(nextUrl)
      if (!res.ok) break
      const json = await res.json()
      for (const t of json.results || []) trades.push(t)
      nextUrl = json.next_url ? json.next_url + `&apiKey=${apiKey}` : null
    }
    return trades
  }

  const results: DPDay[] = []
  let done = 0

  for (const dateKey of dates) {
    if (aborted) break
    const dayStartMs = new Date(dateKey).getTime()

    // DST check (exact copy of POIScreener)
    const d = new Date(dateKey + 'T12:00:00Z')
    const yr = d.getUTCFullYear()
    const marchSun = new Date(Date.UTC(yr, 2, 8))
    while (marchSun.getUTCDay() !== 0) marchSun.setUTCDate(marchSun.getUTCDate() + 1)
    const novSun = new Date(Date.UTC(yr, 10, 1))
    while (novSun.getUTCDay() !== 0) novSun.setUTCDate(novSun.getUTCDate() + 1)
    const isEDT = d >= marchSun && d < novSun
    const etOffsetMs = isEDT ? 4 * 3600_000 : 5 * 3600_000
    const rthOpenUtcMs = 9 * 3600_000 + 30 * 60_000 + etOffsetMs
    const rthCloseUtcMs = 16 * 3600_000 + 15 * 60_000 + etOffsetMs
    const rthStartNs = (dayStartMs + rthOpenUtcMs) * 1_000_000
    const rthEndNs = (dayStartMs + rthCloseUtcMs) * 1_000_000

    const WIN = 4
    const winNs = (rthEndNs - rthStartNs) / WIN
    const windowUrls = Array.from({ length: WIN }, (_, i) => {
      const s = rthStartNs + i * winNs
      const e = rthStartNs + (i + 1) * winNs
      return `https://api.polygon.io/v3/trades/${symbol}?timestamp.gte=${s}&timestamp.lte=${e}&limit=50000&order=asc&apiKey=${apiKey}`
    })

    try {
      const winResults = await Promise.all(windowUrls.map(fetchWindow))
      const allTrades: RawTrade[] = ([] as RawTrade[]).concat(...winResults)

      const dpTrades = allTrades.filter(
        (t) =>
          DARK_POOL_EXCHANGES.has(t.exchange) ||
          (!DARK_POOL_EXCHANGES.has(t.exchange) && t.size * t.price >= LIT_BLOCK_MIN_NOTIONAL)
      )

      if (dpTrades.length > 0) {
        const totalNotional = dpTrades.reduce((s, t) => s + t.size * t.price, 0)
        const sorted = [...dpTrades].sort((a, b) => b.size * b.price - a.size * a.price)
        const raw0 = sorted[0]
        results.push({
          date: dateKey,
          top10: sorted
            .slice(0, 10)
            .map((t) => ({
              price: t.price,
              size: t.size,
              ts: Math.floor(t.sip_timestamp / 1_000_000),
            })),
          totalNotional,
          topPrint: {
            price: raw0.price,
            size: raw0.size,
            ts: Math.floor(raw0.sip_timestamp / 1_000_000),
          },
        })
      }
    } catch {
      // skip failed day
    }

    done++
    onProgress(Math.round((done / dates.length) * 100))
  }
  return results
}

// ── Combined Canvas Chart ─────────────────────────────────────────────────────
function StraddleChart({
  candles,
  events,
  dpDays,
  poiLevels,
}: {
  candles: Bar[]
  events: ContraEvent[]
  dpDays: DPDay[]
  poiLevels: POILevel[]
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const crosshairRef = useRef<{ cx: number; cy: number } | null>(null)
  const viewRef = useRef({ startIdx: 0, visibleCount: Math.max(candles.length, 10) })
  const [width, setWidth] = useState(900)
  const [height, setHeight] = useState(749)

  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect?.width > 0) setWidth(Math.floor(rect.width))
      if (rect?.height > 0) setHeight(Math.floor(rect.height))
    })
    obs.observe(containerRef.current)
    if (containerRef.current.clientWidth > 0) setWidth(containerRef.current.clientWidth)
    if (containerRef.current.clientHeight > 0) setHeight(containerRef.current.clientHeight)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    viewRef.current = { startIdx: 0, visibleCount: candles.length }
  }, [candles])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || candles.length === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const PAD = { top: 20, right: 142, bottom: 62, left: 8 }
    const chartW = width - PAD.left - PAD.right
    const chartH = height - PAD.top - PAD.bottom

    const n = candles.length
    let { startIdx, visibleCount } = viewRef.current
    visibleCount = Math.max(10, Math.min(n, visibleCount))
    startIdx = Math.max(0, Math.min(n - visibleCount, startIdx))
    viewRef.current = { startIdx, visibleCount }
    const vis = candles.slice(startIdx, startIdx + visibleCount)

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.scale(dpr, dpr)

    // Background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height)
    bgGrad.addColorStop(0, '#030a12')
    bgGrad.addColorStop(1, '#000000')
    ctx.fillStyle = bgGrad
    ctx.fillRect(0, 0, width, height)

    // Price range — include POI levels so lines are always visible
    const allP = vis.flatMap((c) => [c.high, c.low])
    const poiPrices = poiLevels.map((l) => l.price).filter((p) => p > 0)
    const allPrices = [...allP, ...poiPrices]
    const rawMin = Math.min(...allPrices)
    const rawMax = Math.max(...allPrices)
    const padP = (rawMax - rawMin) * 0.09
    const pMin = rawMin - padP,
      pMax = rawMax + padP,
      pRange = pMax - pMin
    const pyFn = (p: number) => PAD.top + ((pMax - p) / pRange) * chartH

    // Candle layout
    const vc = vis.length
    const INNER = 18
    const spacing = (chartW - INNER * 2) / Math.max(vc, 1)
    const bw = Math.max(1.5, spacing * 0.62)
    const cxFn = (i: number) => PAD.left + INNER + i * spacing + spacing / 2

    // Grid lines
    ctx.lineWidth = 1
    for (let gi = 0; gi <= 5; gi++) {
      const gp = pMin + (gi / 5) * pRange
      const gy = Math.round(pyFn(gp)) + 0.5
      ctx.strokeStyle = gi === 2 || gi === 3 ? 'rgba(0,229,255,0.07)' : 'rgba(255,255,255,0.03)'
      ctx.beginPath()
      ctx.moveTo(PAD.left, gy)
      ctx.lineTo(width - PAD.right, gy)
      ctx.stroke()
      const label = gp >= 1000 ? gp.toFixed(0) : gp >= 100 ? gp.toFixed(1) : gp.toFixed(2)
      ctx.fillStyle = '#ffffff'
      ctx.font = '800 28px "JetBrains Mono",monospace'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, width - PAD.right + 8, gy)
    }

    // Y-axis border
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(width - PAD.right + 0.5, PAD.top)
    ctx.lineTo(width - PAD.right + 0.5, PAD.top + chartH)
    ctx.stroke()

    // ── Setup zone: last SCAN_TRADING_DAYS bars ──────────────────────────────
    const zoneStart = Math.max(0, vc - SCAN_TRADING_DAYS)
    if (zoneStart < vc && startIdx + visibleCount >= n) {
      const zx1 = cxFn(zoneStart) - spacing * 0.5
      const zx2 = cxFn(vc - 1) + spacing * 0.5
      const zoneGrad = ctx.createLinearGradient(zx1, 0, zx2, 0)
      zoneGrad.addColorStop(0, 'rgba(255,140,0,0)')
      zoneGrad.addColorStop(0.3, 'rgba(255,140,0,0.06)')
      zoneGrad.addColorStop(1, 'rgba(255,100,200,0.04)')
      ctx.fillStyle = zoneGrad
      ctx.fillRect(zx1, PAD.top, zx2 - zx1, chartH)
      ctx.strokeStyle = 'rgba(255,140,0,0.4)'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 4])
      ctx.beginPath()
      ctx.moveTo(zx1 + 0.5, PAD.top)
      ctx.lineTo(zx1 + 0.5, PAD.top + chartH)
      ctx.stroke()
      ctx.setLineDash([])
      // Label
      ctx.fillStyle = 'rgba(255,140,0,0.55)'
      ctx.font = '600 9px "JetBrains Mono",monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText('SCAN WINDOW', (zx1 + zx2) / 2, PAD.top + 3)
    }

    // ── POI level horizontal lines (top 10, dashed) ──────────────────────────
    const currentPrice = candles[n - 1]?.close ?? 0
    for (let li = 0; li < poiLevels.length; li++) {
      const lv = poiLevels[li]
      const py = pyFn(lv.price)
      if (py < PAD.top || py > PAD.top + chartH) continue
      const above = lv.price > currentPrice
      const alpha = Math.max(0.15, 0.45 - li * 0.03)
      ctx.strokeStyle = above ? `rgba(0,255,136,${alpha})` : `rgba(255,50,80,${alpha})`
      ctx.lineWidth = li === 0 ? 1.5 : 1
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      ctx.moveTo(PAD.left, py + 0.5)
      ctx.lineTo(width - PAD.right, py + 0.5)
      ctx.stroke()
      ctx.setLineDash([])
      // Tiny label before Y-axis
      ctx.fillStyle = above ? `rgba(0,255,136,${alpha + 0.2})` : `rgba(255,80,100,${alpha + 0.2})`
      ctx.font = `600 9px "JetBrains Mono",monospace`
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillText(
        `#${li + 1} $${lv.price.toFixed(2)} · ${fmtN(lv.totalNotional)}`,
        width - PAD.right - 2,
        py
      )
    }

    // ── Candles ──────────────────────────────────────────────────────────────
    for (let i = 0; i < vis.length; i++) {
      const c = vis[i],
        x = Math.round(cxFn(i)),
        isUp = c.close >= c.open
      const base = isUp ? '#00C853' : '#FF1744'
      const top = isUp ? '#69F0AE' : '#FF6D6D'
      const dark = isUp ? '#005C24' : '#8B0000'
      const bTop = Math.round(pyFn(Math.max(c.open, c.close)))
      const bBot = Math.round(pyFn(Math.min(c.open, c.close)))
      const bH = Math.max(1, bBot - bTop)
      const bX = x - Math.floor(bw / 2),
        bW = Math.ceil(bw)
      // Wick
      ctx.strokeStyle = base
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x + 0.5, Math.round(pyFn(c.high)))
      ctx.lineTo(x + 0.5, Math.round(pyFn(c.low)))
      ctx.stroke()
      // Body
      if (bH > 1 && bW >= 2) {
        const g = ctx.createLinearGradient(bX, bTop, bX + bW, bBot)
        g.addColorStop(0, top)
        g.addColorStop(0.4, base)
        g.addColorStop(1, dark)
        ctx.fillStyle = g
        ctx.fillRect(bX, bTop, bW, bH)
        const glossW = Math.max(1, Math.floor(bW * 0.35)),
          glossH = Math.max(1, Math.floor(bH * 0.45))
        const gl = ctx.createLinearGradient(bX, bTop, bX, bTop + glossH)
        gl.addColorStop(0, 'rgba(255,255,255,0.35)')
        gl.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = gl
        ctx.fillRect(bX + 1, bTop + 1, glossW, glossH)
      } else {
        ctx.fillStyle = base
        ctx.fillRect(bX, bTop, bW, bH)
      }
    }

    // Current price dashed line
    if (startIdx + visibleCount >= n) {
      const py = Math.round(pyFn(candles[n - 1].close)) + 0.5
      ctx.save()
      ctx.shadowColor = 'rgba(255,215,0,0.4)'
      ctx.shadowBlur = 6
      ctx.setLineDash([5, 3])
      ctx.strokeStyle = '#FFD700'
      ctx.globalAlpha = 0.9
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(PAD.left, py)
      ctx.lineTo(width - PAD.right, py)
      ctx.stroke()
      ctx.restore()
      ctx.fillStyle = '#ffffff'
      ctx.font = '800 28px "JetBrains Mono",monospace'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(candles[n - 1].close.toFixed(2), width - PAD.right + 8, py)
    }
    ctx.setLineDash([])
    ctx.globalAlpha = 1

    // ── Contraction diamond markers ───────────────────────────────────────────
    const dateToVisIdx = new Map<string, number>()
    for (let i = 0; i < vis.length; i++) dateToVisIdx.set(vis[i].date, i)

    const maxComp = events.length > 0 ? Math.max(...events.map((e) => e.compressionPct)) : 100
    ctx.save()
    for (const ev of events) {
      const visIdx = dateToVisIdx.get(ev.date)
      if (visIdx === undefined) continue
      const cx = cxFn(visIdx),
        cy = pyFn(ev.price)
      if (cy < PAD.top || cy > PAD.top + chartH) continue
      const norm = Math.sqrt(ev.compressionPct / maxComp)
      const r = Math.max(5, Math.min(22, norm * 22))
      const baseG = ctx.createLinearGradient(cx, cy - r, cx, cy + r)
      baseG.addColorStop(0, 'rgba(255,200,60,0.95)')
      baseG.addColorStop(0.5, 'rgba(255,120,0,0.80)')
      baseG.addColorStop(1, 'rgba(180,50,0,0.60)')
      ctx.beginPath()
      ctx.moveTo(cx, cy - r)
      ctx.lineTo(cx + r, cy)
      ctx.lineTo(cx, cy + r)
      ctx.lineTo(cx - r, cy)
      ctx.closePath()
      ctx.fillStyle = baseG
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,220,80,0.95)'
      ctx.lineWidth = 1.5
      ctx.stroke()
      const gloss = ctx.createRadialGradient(
        cx - r * 0.25,
        cy - r * 0.3,
        r * 0.05,
        cx,
        cy - r * 0.1,
        r * 0.6
      )
      gloss.addColorStop(0, 'rgba(255,255,255,0.65)')
      gloss.addColorStop(0.5, 'rgba(255,255,255,0.15)')
      gloss.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.beginPath()
      ctx.moveTo(cx, cy - r)
      ctx.lineTo(cx + r, cy)
      ctx.lineTo(cx, cy + r)
      ctx.lineTo(cx - r, cy)
      ctx.closePath()
      ctx.fillStyle = gloss
      ctx.fill()
      const fs = Math.max(9, Math.min(13, r * 0.6))
      ctx.fillStyle = '#fff'
      ctx.font = `700 ${fs}px "JetBrains Mono",monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${ev.compressionPct.toFixed(0)}%`, cx, cy)
      if (ev.squeezeOn) {
        ctx.font = `800 ${Math.max(8, Math.min(10, r * 0.45))}px "JetBrains Mono",monospace`
        ctx.fillStyle = '#00FF88'
        ctx.textBaseline = 'top'
        ctx.fillText('SQZ', cx, cy + r + 3)
      }
    }
    ctx.restore()

    // ── Dark pool bubble markers (top 10 by notional, DP days only) ──────────
    const BUBBLE_STYLES = [
      {
        base: ['rgba(255,160,40,0.75)', 'rgba(220,100,10,0.60)', 'rgba(140,50,0,0.40)'] as [
          string,
          string,
          string,
        ],
        rim: 'rgba(255,180,60,0.80)',
        dot: 'rgba(255,120,0,0.95)',
        lw: 1.2,
      },
      {
        base: ['rgba(80,180,255,0.70)', 'rgba(20,120,210,0.55)', 'rgba(0,60,140,0.35)'] as [
          string,
          string,
          string,
        ],
        rim: 'rgba(100,200,255,0.75)',
        dot: 'rgba(41,182,246,0.95)',
        lw: 1.0,
      },
      {
        base: ['rgba(245,245,245,0.80)', 'rgba(195,195,195,0.62)', 'rgba(110,110,110,0.35)'] as [
          string,
          string,
          string,
        ],
        rim: 'rgba(255,255,255,0.85)',
        dot: 'rgba(225,225,225,0.95)',
        lw: 1.0,
      },
      {
        base: ['rgba(160,160,160,0.70)', 'rgba(100,100,100,0.52)', 'rgba(50,50,50,0.30)'] as [
          string,
          string,
          string,
        ],
        rim: 'rgba(185,185,185,0.72)',
        dot: 'rgba(145,145,145,0.92)',
        lw: 0.9,
      },
      {
        base: ['rgba(115,115,115,0.48)', 'rgba(75,75,75,0.32)', 'rgba(35,35,35,0.15)'] as [
          string,
          string,
          string,
        ],
        rim: 'rgba(145,145,145,0.45)',
        dot: 'rgba(100,100,100,0.72)',
        lw: 0.8,
      },
    ]
    const sortedDP = [...dpDays]
      .filter((d) => d?.totalNotional > 0 && d?.topPrint)
      .sort((a, b) => b.totalNotional - a.totalNotional)
    const top10DP = sortedDP
      .slice(0, 10)
      .map((dp, i) => ({
        price: dp.topPrint.price,
        ts: dp.topPrint.ts,
        notional: dp.totalNotional,
        rank: i,
      }))
    const maxDPN = top10DP.length > 0 ? top10DP[0].notional : 1
    const candleMs = 86_400_000

    ctx.save()
    for (const print of top10DP) {
      const idx = vis.findIndex((c) => {
        const ds = Date.parse(c.date + 'T00:00:00Z')
        return print.ts >= ds && print.ts < ds + candleMs
      })
      if (idx === -1) continue
      const cx = cxFn(idx),
        py2 = pyFn(print.price)
      if (py2 < PAD.top || py2 > PAD.top + chartH) continue
      const r = Math.max(3.5, Math.min(20, Math.sqrt(print.notional / maxDPN) * 20))
      const s = BUBBLE_STYLES[Math.min(print.rank, 4)]
      const bg = ctx.createRadialGradient(cx, py2, r * 0.1, cx, py2, r)
      bg.addColorStop(0, s.base[0])
      bg.addColorStop(0.5, s.base[1])
      bg.addColorStop(1, s.base[2])
      ctx.beginPath()
      ctx.arc(cx, py2, r, 0, Math.PI * 2)
      ctx.fillStyle = bg
      ctx.fill()
      ctx.strokeStyle = s.rim
      ctx.lineWidth = s.lw
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(cx, py2, Math.max(2, r * 0.17), 0, Math.PI * 2)
      ctx.fillStyle = s.dot
      ctx.fill()
    }
    ctx.restore()

    // X-axis labels
    const xIdxs = [
      0,
      Math.floor(vc * 0.25),
      Math.floor(vc * 0.5),
      Math.floor(vc * 0.75),
      vc - 1,
    ].filter((v, i, a) => a.indexOf(v) === i && v < vc)
    ctx.fillStyle = '#ffffff'
    ctx.font = '700 24px "JetBrains Mono",monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    for (const i of xIdxs) ctx.fillText(fmtDate(vis[i].date), cxFn(i), height - PAD.bottom + 6)

    // Crosshair
    const ch = crosshairRef.current
    if (
      ch &&
      ch.cx >= PAD.left &&
      ch.cx <= width - PAD.right &&
      ch.cy >= PAD.top &&
      ch.cy <= PAD.top + chartH
    ) {
      ctx.save()
      ctx.setLineDash([4, 4])
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(Math.round(ch.cx) + 0.5, PAD.top)
      ctx.lineTo(Math.round(ch.cx) + 0.5, PAD.top + chartH)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(PAD.left, Math.round(ch.cy) + 0.5)
      ctx.lineTo(width - PAD.right, Math.round(ch.cy) + 0.5)
      ctx.stroke()
      ctx.setLineDash([])
      const priceAtCursor = pMax - ((ch.cy - PAD.top) / chartH) * pRange
      const pl =
        priceAtCursor >= 1000
          ? priceAtCursor.toFixed(0)
          : priceAtCursor >= 100
            ? priceAtCursor.toFixed(1)
            : priceAtCursor.toFixed(2)
      ctx.fillStyle = 'rgba(10,10,20,0.92)'
      ctx.fillRect(width - PAD.right + 1, Math.round(ch.cy) - 16, PAD.right - 2, 32)
      ctx.fillStyle = '#00E5FF'
      ctx.font = '700 17px "JetBrains Mono",monospace'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(pl, width - PAD.right + 6, Math.round(ch.cy))
      ctx.restore()
    }
  }, [candles, events, dpDays, poiLevels, width, height])

  useEffect(() => {
    draw()
  }, [draw])

  // Wheel zoom
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || candles.length === 0) return
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const n = candles.length
      let { startIdx, visibleCount } = viewRef.current
      const delta = e.deltaY > 0 ? 1 : -1
      const step = Math.max(1, Math.floor(visibleCount * 0.1))
      visibleCount = Math.max(10, Math.min(n, visibleCount + delta * step))
      startIdx = Math.max(0, Math.min(n - visibleCount, startIdx))
      viewRef.current = { startIdx, visibleCount }
      draw()
    }
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [candles.length, draw])

  // Drag + crosshair
  const dragRef = useRef<{ x: number; startIdx: number } | null>(null)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, startIdx: viewRef.current.startIdx }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (rect) crosshairRef.current = { cx: e.clientX - rect.left, cy: e.clientY - rect.top }
      if (!dragRef.current) {
        draw()
        return
      }
      const { visibleCount } = viewRef.current
      const chartW2 = width - 8 - 110
      const candleSpacing = (chartW2 - 36) / Math.max(1, visibleCount)
      const delta = Math.round((dragRef.current.x - e.clientX) / candleSpacing)
      const newStart = Math.max(
        0,
        Math.min(candles.length - visibleCount, dragRef.current.startIdx + delta)
      )
      viewRef.current.startIdx = newStart
      draw()
    },
    [candles.length, width, draw]
  )

  const onPointerUp = useCallback(() => {
    dragRef.current = null
    crosshairRef.current = null
    draw()
  }, [draw])

  return (
    <div ref={containerRef} style={{ flex: 1, width: '100%', position: 'relative', minHeight: 0 }}>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          display: 'block',
          cursor: 'crosshair',
          userSelect: 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />
      {/* Legend */}
      <div
        style={{
          position: 'absolute',
          top: 6,
          left: 14,
          display: 'flex',
          gap: 14,
          alignItems: 'center',
          pointerEvents: 'none',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div
            style={{
              width: 10,
              height: 10,
              background: 'linear-gradient(135deg,rgba(255,200,60,0.95),rgba(255,120,0,0.8))',
              border: '1px solid rgba(255,220,80,0.95)',
              transform: 'rotate(45deg)',
            }}
          />
          <span
            style={{
              color: '#fff',
              fontSize: 10,
              fontFamily: 'JetBrains Mono,monospace',
              fontWeight: 700,
            }}
          >
            CONTRACTION
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="12" height="12">
            <circle
              cx="6"
              cy="6"
              r="5"
              fill="rgba(255,140,40,0.8)"
              stroke="rgba(255,180,60,0.8)"
              strokeWidth="1"
            />
          </svg>
          <span
            style={{
              color: '#fff',
              fontSize: 10,
              fontFamily: 'JetBrains Mono,monospace',
              fontWeight: 700,
            }}
          >
            DARK POOL
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="16" height="2">
            <line
              x1="0"
              y1="1"
              x2="16"
              y2="1"
              stroke="rgba(0,255,136,0.7)"
              strokeWidth="1.5"
              strokeDasharray="5,3"
            />
          </svg>
          <span
            style={{
              color: '#fff',
              fontSize: 10,
              fontFamily: 'JetBrains Mono,monospace',
              fontWeight: 700,
            }}
          >
            POI LEVELS (TOP 10)
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="16" height="2">
            <line
              x1="0"
              y1="1"
              x2="16"
              y2="1"
              stroke="#FFD700"
              strokeWidth="1"
              strokeDasharray="5,3"
            />
          </svg>
          <span
            style={{
              color: '#fff',
              fontSize: 10,
              fontFamily: 'JetBrains Mono,monospace',
              fontWeight: 700,
            }}
          >
            CURRENT PRICE
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Straddle Trade Card ───────────────────────────────────────────────────────
function TradeCard({
  trade,
  symbol,
  side,
}: {
  trade: StraddleTrade
  symbol: string
  side: 'call' | 'put'
}) {
  const isCall = side === 'call'
  const accent = isCall ? '#00FF88' : '#FF4060'
  const accentDim = isCall ? 'rgba(0,255,136,0.12)' : 'rgba(255,64,96,0.12)'
  const accentBorder = isCall ? 'rgba(0,255,136,0.25)' : 'rgba(255,64,96,0.25)'

  const strike = isCall ? trade.callStrike : trade.putStrike
  const entry = isCall ? trade.callEntry : trade.putEntry
  const t1Stock = isCall ? trade.callT1Stock : trade.putT1Stock
  const t1Prem = isCall ? trade.callT1Premium : trade.putT1Premium
  const t2Stock = isCall ? trade.callT2Stock : trade.putT2Stock
  const t2Prem = isCall ? trade.callT2Premium : trade.putT2Premium
  const stop = isCall ? trade.callStop : trade.putStop

  const t1PremChange = entry > 0 ? ((t1Prem - entry) / entry) * 100 : 0
  const t2PremChange = entry > 0 ? ((t2Prem - entry) / entry) * 100 : 0
  const t1StockChange = ((t1Stock - trade.currentPrice) / trade.currentPrice) * 100
  const t2StockChange = ((t2Stock - trade.currentPrice) / trade.currentPrice) * 100

  const mono: React.CSSProperties = { fontFamily: 'JetBrains Mono, monospace' }

  const Row = ({
    label,
    stockPrice,
    stockChg,
    premium,
    premChg,
    color,
  }: {
    label: string
    stockPrice: number
    stockChg: number
    premium: number
    premChg: number
    color: string
  }) => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '64px 1fr 1fr',
        gap: 0,
        padding: '9px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <div
        style={{
          ...mono,
          fontSize: 16,
          fontWeight: 800,
          color: 'rgba(255,255,255,0.5)',
          letterSpacing: '1.5px',
          alignSelf: 'center',
        }}
      >
        {label}
      </div>
      <div>
        <div style={{ ...mono, fontSize: 22, fontWeight: 700, color }}>
          ${stockPrice.toFixed(2)}
        </div>
        <div style={{ ...mono, fontSize: 16, fontWeight: 600, color: `${color}99` }}>
          {stockChg >= 0 ? '+' : ''}
          {stockChg.toFixed(1)}% stk
        </div>
      </div>
      <div>
        <div style={{ ...mono, fontSize: 22, fontWeight: 700, color: '#ffffff' }}>
          ${premium.toFixed(2)}
        </div>
        <div
          style={{
            ...mono,
            fontSize: 16,
            fontWeight: 600,
            color: premChg >= 0 ? '#00FF88' : '#FF4060',
          }}
        >
          {premChg >= 0 ? '+' : ''}
          {premChg.toFixed(0)}% opt
        </div>
      </div>
    </div>
  )

  return (
    <div
      style={{
        background: 'linear-gradient(160deg, #060d16 0%, #020609 100%)',
        border: `1px solid ${accentBorder}`,
        borderTop: `2px solid ${accent}`,
        borderRadius: 6,
        overflow: 'hidden',
        boxShadow: `0 0 24px ${accentDim}`,
      }}
    >
      {/* Card header */}
      <div
        style={{
          padding: '12px 16px 8px',
          background: accentDim,
          borderBottom: `1px solid ${accentBorder}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <span
            style={{
              ...mono,
              fontSize: 29,
              fontWeight: 800,
              color: accent,
              letterSpacing: '1.5px',
            }}
          >
            {isCall ? '▲ CALL' : '▼ PUT'}
          </span>
          <span
            style={{
              ...mono,
              fontSize: 21,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.7)',
              marginLeft: 12,
            }}
          >
            {symbol} ${strike} {isCall ? 'CALL' : 'PUT'}
          </span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ ...mono, fontSize: 17, fontWeight: 700, color: 'rgba(255,255,255,0.55)' }}>
            EXP {fmtExpiry(trade.expiration)}
          </div>
          <div style={{ ...mono, fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.4)' }}>
            {trade.dte}DTE · IV {(trade.iv * 100).toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Entry row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '64px 1fr 1fr',
          gap: 0,
          padding: '10px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <div
          style={{
            ...mono,
            fontSize: 16,
            fontWeight: 800,
            color: 'rgba(255,255,255,0.5)',
            letterSpacing: '1.5px',
            alignSelf: 'center',
          }}
        >
          ENTRY
        </div>
        <div style={{ ...mono, fontSize: 22, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
          ${entry.toFixed(2)}
        </div>
        <div style={{ ...mono, fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.45)' }}>
          per contract
          <br />
          x100 = ${(entry * 100).toFixed(0)}
        </div>
      </div>

      {/* Column headers */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '64px 1fr 1fr',
          gap: 0,
          padding: '5px 16px',
          background: 'rgba(0,0,0,0.4)',
        }}
      >
        <div
          style={{
            ...mono,
            fontSize: 14,
            fontWeight: 800,
            color: 'rgba(255,255,255,0.3)',
            letterSpacing: '1.5px',
          }}
        >
          LEVEL
        </div>
        <div
          style={{
            ...mono,
            fontSize: 14,
            fontWeight: 800,
            color: 'rgba(255,255,255,0.3)',
            letterSpacing: '1.5px',
          }}
        >
          STOCK PRICE
        </div>
        <div
          style={{
            ...mono,
            fontSize: 14,
            fontWeight: 800,
            color: 'rgba(255,255,255,0.3)',
            letterSpacing: '1.5px',
          }}
        >
          OPTION PREMIUM
        </div>
      </div>

      <Row
        label="T1"
        stockPrice={t1Stock}
        stockChg={t1StockChange}
        premium={t1Prem}
        premChg={t1PremChange}
        color={isCall ? '#00FF88' : '#FF4060'}
      />
      <Row
        label="T2"
        stockPrice={t2Stock}
        stockChg={t2StockChange}
        premium={t2Prem}
        premChg={t2PremChange}
        color={isCall ? '#00E87A' : '#FF2048'}
      />

      {/* Stop loss */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '64px 1fr 1fr',
          gap: 0,
          padding: '9px 16px',
        }}
      >
        <div
          style={{
            ...mono,
            fontSize: 16,
            fontWeight: 800,
            color: 'rgba(255,100,80,0.8)',
            letterSpacing: '1.5px',
            alignSelf: 'center',
          }}
        >
          STOP
        </div>
        <div>
          <div style={{ ...mono, fontSize: 22, fontWeight: 700, color: '#FF6040' }}>
            ${stop.toFixed(2)}
          </div>
          <div style={{ ...mono, fontSize: 16, fontWeight: 600, color: 'rgba(255,96,64,0.7)' }}>
            -50% of entry
          </div>
        </div>
        <div
          style={{
            ...mono,
            fontSize: 16,
            fontWeight: 600,
            color: 'rgba(255,96,64,0.55)',
            alignSelf: 'center',
          }}
        >
          If option drops to ${stop.toFixed(2)}, exit full position
        </div>
      </div>
    </div>
  )
}

// ── Results Table ─────────────────────────────────────────────────────────────
function ResultsTable({
  results,
  onSelect,
}: {
  results: ScanResult[]
  onSelect: (r: ScanResult) => void
}) {
  const mono: React.CSSProperties = { fontFamily: 'JetBrains Mono, monospace' }
  const setups = results
    .filter((r) => r.setupActive)
    .sort((a, b) => b.compressionPct - a.compressionPct)
  const contractOnly = results
    .filter((r) => !r.setupActive)
    .sort((a, b) => b.compressionPct - a.compressionPct)
  const all = [...setups, ...contractOnly]
  if (!all.length) return null

  const col: React.CSSProperties = {
    padding: '7px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  }
  const hdr: React.CSSProperties = {
    ...mono,
    fontSize: 9,
    fontWeight: 800,
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: '1.5px',
    padding: '6px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(0,0,0,0.4)',
  }

  return (
    <div
      style={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6, overflow: 'hidden' }}
    >
      {/* Table header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '90px 90px 80px 80px 110px 1fr',
          background: 'rgba(0,0,0,0.5)',
        }}
      >
        {['SYMBOL', 'PRICE', 'COMPRESS', 'SQUEEZE', 'TOP POI', 'STATUS'].map((h) => (
          <div key={h} style={hdr}>
            {h}
          </div>
        ))}
      </div>
      {all.map((r) => (
        <div
          key={r.symbol}
          onClick={() => onSelect(r)}
          style={{
            display: 'grid',
            gridTemplateColumns: '90px 90px 80px 80px 110px 1fr',
            cursor: 'pointer',
            background: r.setupActive ? 'rgba(255,68,221,0.05)' : 'transparent',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = r.setupActive
              ? 'rgba(255,68,221,0.1)'
              : 'rgba(255,255,255,0.04)')
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = r.setupActive
              ? 'rgba(255,68,221,0.05)'
              : 'transparent')
          }
        >
          <div
            style={{
              ...col,
              ...mono,
              fontSize: 13,
              fontWeight: 800,
              color: r.setupActive ? '#FF44DD' : '#00E5FF',
            }}
          >
            {r.symbol}
          </div>
          <div style={{ ...col, ...mono, fontSize: 12, fontWeight: 700, color: '#fff' }}>
            ${r.currentPrice.toFixed(2)}
          </div>
          <div style={{ ...col, ...mono, fontSize: 12, fontWeight: 700, color: '#FFAA00' }}>
            {r.compressionPct.toFixed(0)}%
          </div>
          <div
            style={{
              ...col,
              ...mono,
              fontSize: 12,
              fontWeight: 700,
              color: r.squeezeOn ? '#00FF88' : 'rgba(255,255,255,0.25)',
            }}
          >
            {r.squeezeOn ? '● ON' : '○ OFF'}
          </div>
          <div
            style={{
              ...col,
              ...mono,
              fontSize: 11,
              fontWeight: 600,
              color: r.hasPOI ? 'rgba(255,170,60,0.9)' : 'rgba(255,255,255,0.2)',
            }}
          >
            {r.topPOI ? `$${r.topPOI.price.toFixed(2)}` : '—'}
          </div>
          <div style={{ ...col, display: 'flex', alignItems: 'center', gap: 8 }}>
            {r.setupActive ? (
              <span
                style={{
                  ...mono,
                  fontSize: 10,
                  fontWeight: 800,
                  color: '#FF44DD',
                  background: 'rgba(255,0,200,0.12)',
                  border: '1px solid rgba(255,0,200,0.3)',
                  borderRadius: 3,
                  padding: '2px 8px',
                  letterSpacing: '1px',
                }}
              >
                ⚡ SETUP ACTIVE
              </span>
            ) : (
              <span
                style={{
                  ...mono,
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'rgba(255,170,0,0.7)',
                  letterSpacing: '1px',
                }}
              >
                CONTRACTION ONLY
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Signal Card ───────────────────────────────────────────────────────────────
// ── Main Component ─────────────────────────────────────────────────────────────
export default function StraddleTownScreener() {
  const mono: React.CSSProperties = { fontFamily: 'JetBrains Mono, monospace' }
  const API_KEY = process.env.NEXT_PUBLIC_POLYGON_API_KEY ?? ''
  const abortRef = useRef<AbortController | null>(null)

  // ── Screener state ─────────────────────────────────────────────────────────
  type Phase = 'idle' | 'fetching-symbols' | 'scanning-ohlcv' | 'scanning-dp' | 'done' | 'error'
  const [phase, setPhase] = useState<Phase>('idle')
  const [stats, setStats] = useState<ScanStats>({
    totalSymbols: 0,
    ohlcvDone: 0,
    contractionHits: 0,
    dpDone: 0,
    setupsFound: 0,
  })
  const [results, setResults] = useState<ScanResult[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // ── Detail view state (when user clicks a row) ─────────────────────────────
  const [selected, setSelected] = useState<ScanResult | null>(null)

  const addResult = useCallback((r: ScanResult) => {
    setResults((prev) => {
      const next = [...prev.filter((x) => x.symbol !== r.symbol), r]
      return next.sort((a, b) => {
        if (a.setupActive !== b.setupActive) return a.setupActive ? -1 : 1
        return b.compressionPct - a.compressionPct
      })
    })
  }, [])

  const run = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller

    setPhase('fetching-symbols')
    setResults([])
    setSelected(null)
    setErrorMsg(null)
    setStats({ totalSymbols: 0, ohlcvDone: 0, contractionHits: 0, dpDone: 0, setupsFound: 0 })

    try {
      // ── Phase 1: fetch symbol universe ───────────────────────────────────
      const symbols = await fetchTopSymbols(API_KEY, MAX_SYMBOLS, signal)
      if (signal.aborted) return
      if (!symbols.length) {
        // shouldn't happen since hardcoded fallback is always non-empty
        throw new Error('Symbol universe is empty')
      }

      setStats((s) => ({ ...s, totalSymbols: symbols.length }))
      setPhase('scanning-ohlcv')

      // ── Phase 2: OHLCV + contraction scan (concurrent batches) ───────────
      // contractionHits collects [symbol, bars, allEvents, recentEvents]
      const contractionHits: {
        symbol: string
        bars: Bar[]
        allEvents: ContraEvent[]
        recentEvents: ContraEvent[]
      }[] = []

      const ohlcvTasks = symbols.map((sym) => async () => {
        if (signal.aborted) return
        const bars = await fetchOHLCV(sym, API_KEY, signal)
        if (!bars || bars.length < 120) return

        const allEvts = scanHistory(bars)
        const last5Dates = new Set(bars.slice(-SCAN_TRADING_DAYS).map((b) => b.date))
        const recentEvts = allEvts.filter((e) => last5Dates.has(e.date))

        setStats((s) => ({ ...s, ohlcvDone: s.ohlcvDone + 1 }))

        if (recentEvts.length > 0) {
          contractionHits.push({ symbol: sym, bars, allEvents: allEvts, recentEvents: recentEvts })
          setStats((s) => ({ ...s, contractionHits: s.contractionHits + 1 }))
        }
      })

      await runWithConcurrency(ohlcvTasks, OHLCV_CONCURRENCY, undefined, signal)
      if (signal.aborted) return

      // ── Phase 3: dark pool scan — sequential per contraction hit ─────────
      setPhase('scanning-dp')

      for (const hit of contractionHits) {
        if (signal.aborted) break
        const { symbol: sym, bars, allEvents: allEvts, recentEvents: recentEvts } = hit

        const daysToScan = bars.slice(-SCAN_TRADING_DAYS).map((b) => b.date)
        const dpResults = await scanDPDays(daysToScan, sym, API_KEY, () => undefined, signal)
        if (signal.aborted) break

        const poi = clusterPOI(dpResults)
        const hasPOI = poi.length > 0
        const setupActive = recentEvts.length > 0 && hasPOI

        const latestEvent = recentEvts[recentEvts.length - 1]
        const trade = setupActive ? buildStraddleTrade(bars) : null

        const result: ScanResult = {
          symbol: sym,
          currentPrice: bars[bars.length - 1].close,
          compressionPct: latestEvent?.compressionPct ?? 0,
          squeezeOn: latestEvent?.squeezeOn ?? false,
          hasPOI,
          topPOI: poi[0] ?? null,
          setupActive,
          bars,
          allEvents: allEvts,
          recentEvents: recentEvts,
          dpDays: dpResults,
          poiLevels: poi,
          trade,
        }

        addResult(result)
        setStats((s) => ({
          ...s,
          dpDone: s.dpDone + 1,
          setupsFound: s.setupsFound + (setupActive ? 1 : 0),
        }))
      }

      setPhase('done')
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return
      setErrorMsg(err instanceof Error ? err.message : 'Scan failed')
      setPhase('error')
    }
  }, [API_KEY, addResult])

  // ── If a row is selected, show detail view ─────────────────────────────────
  const DetailView = () => {
    if (!selected) return null
    const r = selected
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
          padding: '16px 24px',
          gap: 20,
        }}
      >
        {/* Back bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            onClick={() => setSelected(null)}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4,
              padding: '5px 14px',
              cursor: 'pointer',
              ...mono,
              fontSize: 11,
              fontWeight: 700,
              color: '#fff',
            }}
          >
            ← BACK
          </button>
          <span
            style={{
              ...mono,
              fontSize: 20,
              fontWeight: 800,
              color: '#00E5FF',
              letterSpacing: '2px',
            }}
          >
            {r.symbol}
          </span>
          <span style={{ ...mono, fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>
            ${r.currentPrice.toFixed(2)}
          </span>
          {r.setupActive && (
            <span
              style={{
                ...mono,
                fontSize: 11,
                fontWeight: 800,
                color: '#FF44DD',
                background: 'rgba(255,0,200,0.12)',
                border: '1px solid rgba(255,0,200,0.3)',
                borderRadius: 3,
                padding: '3px 10px',
              }}
            >
              ⚡ SETUP ACTIVE
            </span>
          )}
        </div>

        {/* Chart */}
        <div style={{ height: 749, position: 'relative', flexShrink: 0 }}>
          <StraddleChart
            candles={r.bars.slice(-CHART_VISIBLE_DAYS)}
            events={r.allEvents}
            dpDays={r.dpDays}
            poiLevels={r.poiLevels}
          />
        </div>

        {/* Squeeze ON pill */}
        {r.recentEvents.length > 0 && r.recentEvents[r.recentEvents.length - 1].squeezeOn && (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div
              style={{
                ...mono,
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: '2px',
                color: '#00FF88',
                background: 'rgba(0,255,136,0.1)',
                border: '1px solid rgba(0,255,136,0.35)',
                borderRadius: 4,
                padding: '5px 18px',
              }}
            >
              ● ON
            </div>
          </div>
        )}

        {/* Trade cards */}
        {r.setupActive && r.trade ? (
          <>
            <div
              style={{
                ...mono,
                fontSize: 11,
                fontWeight: 800,
                color: 'rgba(255,68,221,0.7)',
                letterSpacing: '3px',
                textAlign: 'center',
                marginTop: 4,
              }}
            >
              ── STRADDLE TRADE SETUP ──
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <TradeCard trade={r.trade} symbol={r.symbol} side="call" />
              <TradeCard trade={r.trade} symbol={r.symbol} side="put" />
            </div>
            <div
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 6,
                padding: '14px 20px',
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 16,
              }}
            >
              {[
                {
                  label: 'TOTAL COST',
                  value: `$${r.trade.totalCost.toFixed(0)}`,
                  sub: 'per straddle (100 × 2 legs)',
                  color: '#fff',
                },
                {
                  label: 'UPPER BE',
                  value: `$${r.trade.upperBE.toFixed(2)}`,
                  sub: `${(((r.trade.upperBE - r.currentPrice) / r.currentPrice) * 100).toFixed(1)}% above`,
                  color: '#00FF88',
                },
                {
                  label: 'LOWER BE',
                  value: `$${r.trade.lowerBE.toFixed(2)}`,
                  sub: `${(((r.trade.lowerBE - r.currentPrice) / r.currentPrice) * 100).toFixed(1)}% below`,
                  color: '#FF4060',
                },
                {
                  label: 'IV ESTIMATE',
                  value: `${(r.trade.iv * 100).toFixed(1)}%`,
                  sub: '20-period log HV annualized',
                  color: '#CC44FF',
                },
              ].map((item) => (
                <div key={item.label}>
                  <div
                    style={{
                      ...mono,
                      fontSize: 9,
                      fontWeight: 800,
                      color: 'rgba(255,255,255,0.35)',
                      letterSpacing: '1.5px',
                      marginBottom: 4,
                    }}
                  >
                    {item.label}
                  </div>
                  <div style={{ ...mono, fontSize: 18, fontWeight: 800, color: item.color }}>
                    {item.value}
                  </div>
                  <div
                    style={{
                      ...mono,
                      fontSize: 9,
                      fontWeight: 600,
                      color: 'rgba(255,255,255,0.35)',
                    }}
                  >
                    {item.sub}
                  </div>
                </div>
              ))}
            </div>
            <div
              style={{
                ...mono,
                fontSize: 9,
                color: 'rgba(255,255,255,0.2)',
                letterSpacing: '0.8px',
                textAlign: 'center',
                paddingBottom: 8,
              }}
            >
              ESTIMATED PREMIUMS VIA BLACK-SCHOLES · 80% OTM STRIKE · STOP AT 50% OF ENTRY PREMIUM ·
              NOT FINANCIAL ADVICE
            </div>
          </>
        ) : (
          <div
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 6,
              padding: '28px 20px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                ...mono,
                fontSize: 13,
                fontWeight: 700,
                color: 'rgba(255,255,255,0.35)',
                letterSpacing: '2px',
              }}
            >
              CONTRACTION ONLY — NO DARK POOL POI IN SCAN WINDOW
            </div>
          </div>
        )}
      </div>
    )
  }

  const isScanning =
    phase === 'fetching-symbols' || phase === 'scanning-ohlcv' || phase === 'scanning-dp'
  const scanPct =
    stats.totalSymbols > 0
      ? phase === 'fetching-symbols'
        ? 2
        : phase === 'scanning-ohlcv'
          ? Math.round(2 + (stats.ohlcvDone / stats.totalSymbols) * 60)
          : phase === 'scanning-dp' && stats.contractionHits > 0
            ? Math.round(62 + (stats.dpDone / stats.contractionHits) * 38)
            : phase === 'done'
              ? 100
              : 0
      : 0

  return (
    <div
      style={{
        background: 'linear-gradient(160deg, #04020a 0%, #010008 50%, #030010 100%)',
        border: '1px solid rgba(180,0,255,0.15)',
        borderRadius: 8,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {/* ── Panel Header ─────────────────────────────────────────────────── */}
      <div
        style={{
          background: 'linear-gradient(180deg, #0a0416 0%, #060210 100%)',
          borderBottom: '1px solid rgba(180,0,255,0.2)',
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          flexShrink: 0,
        }}
      >
        <div>
          <div
            style={{
              ...mono,
              fontWeight: 800,
              fontSize: 22,
              color: '#CC44FF',
              letterSpacing: '3px',
              textShadow: '0 0 18px rgba(180,0,255,0.5)',
            }}
          >
            STRADDLE TOWN
          </div>
          <div
            style={{
              ...mono,
              fontSize: 10,
              color: 'rgba(200,100,255,0.4)',
              letterSpacing: '2px',
              marginTop: 2,
            }}
          >
            CONTRACTION + DARK POOL CONVERGENCE · TOP {MAX_SYMBOLS} SYMBOLS
          </div>
        </div>

        {/* Live stats pills */}
        {(isScanning || phase === 'done') && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              { label: 'UNIVERSE', val: stats.totalSymbols, color: 'rgba(200,100,255,0.7)' },
              {
                label: 'OHLCV',
                val: `${stats.ohlcvDone}/${stats.totalSymbols}`,
                color: 'rgba(0,229,255,0.7)',
              },
              { label: 'CONTRACTION', val: stats.contractionHits, color: 'rgba(255,170,0,0.8)' },
              {
                label: 'DP SCANNED',
                val: `${stats.dpDone}/${stats.contractionHits}`,
                color: 'rgba(255,140,40,0.8)',
              },
              { label: 'SETUPS', val: stats.setupsFound, color: '#FF44DD' },
            ].map((p) => (
              <div
                key={p.label}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 4,
                  padding: '3px 10px',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    ...mono,
                    fontSize: 8,
                    color: 'rgba(255,255,255,0.3)',
                    letterSpacing: '1px',
                  }}
                >
                  {p.label}
                </div>
                <div style={{ ...mono, fontSize: 13, fontWeight: 800, color: p.color }}>
                  {p.val}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
          {phase === 'idle' || phase === 'error' ? (
            <button
              onClick={run}
              style={{
                background: 'linear-gradient(135deg,rgba(150,0,255,0.3),rgba(200,0,255,0.15))',
                border: '1px solid rgba(180,0,255,0.5)',
                borderRadius: 4,
                padding: '8px 20px',
                cursor: 'pointer',
                ...mono,
                fontSize: 12,
                fontWeight: 800,
                color: '#CC44FF',
                letterSpacing: '1.5px',
              }}
            >
              ▶ RUN SCAN
            </button>
          ) : isScanning ? (
            <button
              onClick={() => abortRef.current?.abort()}
              style={{
                background: 'rgba(255,60,60,0.12)',
                border: '1px solid rgba(255,60,60,0.3)',
                borderRadius: 4,
                padding: '8px 20px',
                cursor: 'pointer',
                ...mono,
                fontSize: 12,
                fontWeight: 800,
                color: '#FF4060',
                letterSpacing: '1.5px',
              }}
            >
              ■ STOP
            </button>
          ) : (
            <button
              onClick={run}
              style={{
                background: 'rgba(180,0,255,0.15)',
                border: '1px solid rgba(180,0,255,0.4)',
                borderRadius: 4,
                padding: '6px 16px',
                cursor: 'pointer',
                ...mono,
                fontSize: 11,
                fontWeight: 800,
                color: '#CC44FF',
                letterSpacing: '1.5px',
              }}
            >
              ↺ RESCAN
            </button>
          )}
        </div>
      </div>

      {/* ── Progress bar ─────────────────────────────────────────────────── */}
      {isScanning && (
        <div style={{ padding: '10px 24px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span
              style={{
                ...mono,
                fontSize: 10,
                color: 'rgba(200,100,255,0.7)',
                letterSpacing: '1.5px',
              }}
            >
              {phase === 'fetching-symbols'
                ? 'FETCHING SYMBOL UNIVERSE…'
                : phase === 'scanning-ohlcv'
                  ? `OHLCV SCAN — ${stats.ohlcvDone} / ${stats.totalSymbols} SYMBOLS`
                  : `DARK POOL SCAN — ${stats.dpDone} / ${stats.contractionHits} CONTRACTION HITS`}
            </span>
            <span style={{ ...mono, fontSize: 10, color: 'rgba(200,100,255,0.5)' }}>
              {scanPct}%
            </span>
          </div>
          <div
            style={{
              height: 3,
              background: 'rgba(255,255,255,0.06)',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${scanPct}%`,
                background: 'linear-gradient(90deg,#9900FF,#CC44FF)',
                transition: 'width 0.3s ease',
                borderRadius: 2,
              }}
            />
          </div>
        </div>
      )}

      {/* ── Idle splash ──────────────────────────────────────────────────── */}
      {phase === 'idle' && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            padding: 40,
          }}
        >
          <div
            style={{
              ...mono,
              fontSize: 14,
              fontWeight: 700,
              color: 'rgba(200,100,255,0.5)',
              letterSpacing: '2px',
            }}
          >
            READY TO SCAN
          </div>
          <div
            style={{
              ...mono,
              fontSize: 11,
              color: 'rgba(255,255,255,0.25)',
              textAlign: 'center',
              maxWidth: 460,
              lineHeight: 1.6,
            }}
          >
            Fetches top {MAX_SYMBOLS} symbols by market cap, runs contraction detection on all,
            <br />
            then dark pool scans only on contraction hits for maximum efficiency.
          </div>
          <button
            onClick={run}
            style={{
              background: 'linear-gradient(135deg,rgba(150,0,255,0.3),rgba(200,0,255,0.15))',
              border: '1px solid rgba(180,0,255,0.5)',
              borderRadius: 6,
              padding: '12px 36px',
              cursor: 'pointer',
              ...mono,
              fontSize: 14,
              fontWeight: 800,
              color: '#CC44FF',
              letterSpacing: '2px',
              marginTop: 8,
            }}
          >
            ▶ RUN SCAN
          </button>
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {phase === 'error' && (
        <div style={{ padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ ...mono, fontSize: 13, fontWeight: 700, color: '#FF4060' }}>
            {errorMsg ?? 'SCAN FAILED'}
          </div>
          <button
            onClick={run}
            style={{
              marginTop: 16,
              background: 'rgba(255,0,0,0.1)',
              border: '1px solid rgba(255,0,0,0.3)',
              borderRadius: 4,
              padding: '6px 16px',
              cursor: 'pointer',
              ...mono,
              fontSize: 11,
              fontWeight: 700,
              color: '#FF4060',
            }}
          >
            RETRY
          </button>
        </div>
      )}

      {/* ── Screener results (top-level) or detail view ───────────────────── */}
      {(isScanning || phase === 'done') && !selected && (
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '16px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {results.length === 0 && isScanning && (
            <div
              style={{
                ...mono,
                fontSize: 11,
                color: 'rgba(255,255,255,0.2)',
                letterSpacing: '1px',
                paddingTop: 12,
              }}
            >
              Scanning… results will appear live as each symbol is processed.
            </div>
          )}
          {results.length > 0 && (
            <div
              style={{
                ...mono,
                fontSize: 10,
                color: 'rgba(255,255,255,0.3)',
                letterSpacing: '1px',
              }}
            >
              {results.filter((r) => r.setupActive).length} SETUPS ACTIVE · {results.length}{' '}
              CONTRACTION HITS · CLICK ROW TO VIEW CHART
            </div>
          )}
          <ResultsTable results={results} onSelect={setSelected} />
        </div>
      )}

      {selected && <DetailView />}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
      `}</style>
    </div>
  )
}
