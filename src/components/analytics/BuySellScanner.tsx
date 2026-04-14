'use client'

import React, { useCallback, useRef, useState } from 'react'

import { TOP_1000_SYMBOLS } from '@/lib/Top1000Symbols'

const POLYGON_API_KEY = process.env.NEXT_PUBLIC_POLYGON_API_KEY || ''
const BATCH_SIZE = 20

interface Bar {
  o: number
  h: number
  l: number
  c: number
  v: number
}

export interface ScanResult {
  symbol: string
  signal: 'BUY' | 'SELL'
  score: number
  avgHighVal: number
  avgLowVal: number
  yearlyMin: number
  yearlyMax: number
  label: 'BELOW YEARLY LOW' | 'JUST BELOW AVERAGE' | 'ABOVE AVERAGE'
  currentPrice: number
  priceChangePct: number
}

// ─── Score calculation — identical to EFICharting drawBuySellPanel logic ──────
function calcSmoothedScores(bars: Bar[], spyBars: Bar[]): number[] {
  const n = bars.length
  if (n < 55) return []

  const closes = bars.map((b) => b.c)
  const highs = bars.map((b) => b.h)
  const lows = bars.map((b) => b.l)
  const vols = bars.map((b) => b.v)
  const opens = bars.map((b) => b.o)

  const calcEma = (src: number[], period: number): number[] => {
    const k = 2 / (period + 1)
    const out: number[] = [src[0]]
    for (let i = 1; i < src.length; i++) out.push(src[i] * k + out[i - 1] * (1 - k))
    return out
  }

  // 1. ATR-Normalized Momentum
  const ATR_P = 14
  const atrArr = new Array<number>(n).fill(0)
  for (let i = 1; i < n; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    )
    atrArr[i] = i < ATR_P ? tr : (atrArr[i - 1] * (ATR_P - 1)) / ATR_P + tr / ATR_P
  }
  const atrMomArr = new Array<number>(n).fill(0)
  for (let i = ATR_P; i < n; i++) {
    const change = closes[i] - closes[i - ATR_P]
    const scale = atrArr[i] * Math.sqrt(ATR_P)
    atrMomArr[i] = scale > 0 ? Math.max(-100, Math.min(100, (change / scale) * 33)) : 0
  }

  // 2. Institutional Volume Pressure
  const avgVol20Arr = new Array<number>(n).fill(0)
  for (let i = 20; i < n; i++)
    avgVol20Arr[i] = vols.slice(i - 19, i + 1).reduce((a, b) => a + b, 0) / 20

  const ivpRaw = new Array<number>(n).fill(0)
  for (let i = 1; i < n; i++) {
    const rng = highs[i] - lows[i]
    const direction = rng > 0 ? (closes[i] - opens[i]) / rng : 0
    const volRatio = avgVol20Arr[i] > 0 ? vols[i] / avgVol20Arr[i] : 1
    ivpRaw[i] = direction * Math.log1p(volRatio)
  }
  const ivpSmooth = calcEma(ivpRaw, 5)
  const ivpArr = new Array<number>(n).fill(0)
  for (let i = 50; i < n; i++) {
    const w = ivpSmooth.slice(i - 49, i + 1)
    const maxAbs = Math.max(...w.map(Math.abs), 1e-9)
    ivpArr[i] = Math.max(-100, Math.min(100, (ivpSmooth[i] / maxAbs) * 100))
  }

  // 3. Elder Force Index
  const rawEfi = new Array<number>(n).fill(0)
  for (let i = 1; i < n; i++) rawEfi[i] = (closes[i] - closes[i - 1]) * vols[i]
  const efiSmooth = calcEma(rawEfi, 13)
  const efiArr = new Array<number>(n).fill(0)
  for (let i = 50; i < n; i++) {
    const win = efiSmooth.slice(i - 49, i + 1)
    const maxAbs = Math.max(...win.map(Math.abs), 1e-9)
    efiArr[i] = Math.max(-100, Math.min(100, (efiSmooth[i] / maxAbs) * 100))
  }

  // 4. Price-Volume Divergence
  const adLine: number[] = [0]
  for (let i = 1; i < n; i++) {
    const rng = highs[i] - lows[i]
    const mfm = rng > 0 ? (closes[i] - lows[i] - (highs[i] - closes[i])) / rng : 0
    adLine.push(adLine[i - 1] + mfm * vols[i])
  }
  const PVD_P = 20
  const pvdArr = new Array<number>(n).fill(0)
  for (let i = PVD_P + 20; i < n; i++) {
    const priceChange = closes[i] - closes[i - PVD_P]
    const adChange = adLine[i] - adLine[i - PVD_P]
    const avgVol = avgVol20Arr[i] > 0 ? avgVol20Arr[i] : 1
    const adNorm = Math.max(-1, Math.min(1, adChange / (avgVol * PVD_P)))
    const agree = Math.sign(priceChange) === Math.sign(adNorm) && priceChange !== 0
    pvdArr[i] = Math.max(-100, Math.min(100, adNorm * 100 * (agree ? 1.2 : 0.6)))
  }

  // 5. Chaikin Money Flow
  const CMF_P = 20
  const cmfArr = new Array<number>(n).fill(0)
  for (let i = CMF_P; i < n; i++) {
    let mfvSum = 0,
      volSum = 0
    for (let j = i - CMF_P + 1; j <= i; j++) {
      const rng = highs[j] - lows[j]
      const mfm = rng > 0 ? (closes[j] - lows[j] - (highs[j] - closes[j])) / rng : 0
      mfvSum += mfm * vols[j]
      volSum += vols[j]
    }
    cmfArr[i] = volSum > 0 ? mfvSum / volSum : 0
  }

  // 6. OBV momentum
  const obvArr: number[] = [0]
  for (let i = 1; i < n; i++) {
    if (closes[i] > closes[i - 1]) obvArr.push(obvArr[i - 1] + vols[i])
    else if (closes[i] < closes[i - 1]) obvArr.push(obvArr[i - 1] - vols[i])
    else obvArr.push(obvArr[i - 1])
  }

  // Build composite scores
  const rawScores = bars.map((_, i) => {
    if (i < 50) return 0
    const cmfScore = cmfArr[i] * 100
    const avgVol = avgVol20Arr[i] > 0 ? avgVol20Arr[i] : 1
    const obvChange = obvArr[i] - obvArr[Math.max(0, i - 20)]
    const obvScore = Math.max(-100, Math.min(100, (obvChange / (avgVol * 20)) * 100))

    // RS vs SPY — align arrays from end
    let rsScore = 0
    const spyOffset = spyBars.length - bars.length
    const spyIdx = spyOffset + i
    const spyIdx20 = spyOffset + i - 20
    if (
      i >= 20 &&
      spyIdx >= 0 &&
      spyIdx < spyBars.length &&
      spyIdx20 >= 0 &&
      bars[i - 20]?.c > 0 &&
      spyBars[spyIdx20]?.c > 0
    ) {
      const stockRet = (bars[i].c - bars[i - 20].c) / bars[i - 20].c
      const spyRet = (spyBars[spyIdx].c - spyBars[spyIdx20].c) / spyBars[spyIdx20].c
      rsScore = Math.max(-100, Math.min(100, (stockRet - spyRet) * 300))
    }

    const composite =
      atrMomArr[i] * 0.19 +
      ivpArr[i] * 0.19 +
      pvdArr[i] * 0.18 +
      cmfScore * 0.14 +
      efiArr[i] * 0.11 +
      obvScore * 0.04 +
      rsScore * 0.15

    return Math.max(-100, Math.min(100, composite))
  })

  // EMA-3 smoothing
  const emaK3 = 2 / (3 + 1)
  const smoothed: number[] = [rawScores[0]]
  for (let i = 1; i < n; i++) smoothed.push(rawScores[i] * emaK3 + smoothed[i - 1] * (1 - emaK3))

  return smoothed
}

function buildResult(symbol: string, bars: Bar[], spyBars: Bar[]): ScanResult | null {
  const smoothed = calcSmoothedScores(bars, spyBars)
  if (smoothed.length < 10) return null

  const lookback = Math.min(252, smoothed.length)
  const recent = smoothed.slice(smoothed.length - lookback)

  const sorted = [...recent].sort((a, b) => a - b)
  const top10 = sorted.slice(Math.floor(sorted.length * 0.9))
  const bot10 = sorted.slice(0, Math.ceil(sorted.length * 0.1))

  const avgHighVal =
    top10.length > 0 ? top10.reduce((a, b) => a + b, 0) / top10.length : Math.max(...recent)
  const avgLowVal =
    bot10.length > 0 ? bot10.reduce((a, b) => a + b, 0) / bot10.length : Math.min(...recent)
  const yearlyMin = Math.min(...recent)
  const yearlyMax = Math.max(...recent)
  const currentScore = smoothed[smoothed.length - 1]

  const isBuy = currentScore >= avgHighVal
  const isSell = currentScore <= avgLowVal
  if (!isBuy && !isSell) return null

  const signal: 'BUY' | 'SELL' = isBuy ? 'BUY' : 'SELL'

  // Position label
  let label: ScanResult['label']
  if (signal === 'BUY') {
    label = 'ABOVE AVERAGE'
  } else {
    // SELL — is it at/below yearly low threshold?
    label = currentScore <= yearlyMin * 0.98 ? 'BELOW YEARLY LOW' : 'JUST BELOW AVERAGE'
  }

  const currentPrice = bars[bars.length - 1].c
  const prevPrice = bars[bars.length - 2]?.c || currentPrice
  const priceChangePct = prevPrice > 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0

  return {
    symbol,
    signal,
    score: Math.round(currentScore),
    avgHighVal: Math.round(avgHighVal),
    avgLowVal: Math.round(avgLowVal),
    yearlyMin: Math.round(yearlyMin),
    yearlyMax: Math.round(yearlyMax),
    label,
    currentPrice,
    priceChangePct,
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function BuySellScanner() {
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [buyResults, setBuyResults] = useState<ScanResult[]>([])
  const [sellResults, setSellResults] = useState<ScanResult[]>([])
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null)
  const [filterView, setFilterView] = useState<'both' | 'buy' | 'sell'>('both')
  const abortRef = useRef(false)

  const runScan = useCallback(async () => {
    if (scanning) return
    setScanning(true)
    abortRef.current = false
    setBuyResults([])
    setSellResults([])
    setProgress(0)

    const today = new Date().toISOString().split('T')[0]
    const from = new Date(Date.now() - 380 * 86400_000).toISOString().split('T')[0]

    // Pre-fetch SPY
    setProgressLabel('LOADING SPY DATA...')
    let spyBars: Bar[] = []
    try {
      const spyRes = await fetch(
        `https://api.polygon.io/v2/aggs/ticker/SPY/range/1/day/${from}/${today}?adjusted=true&sort=asc&limit=400&apikey=${POLYGON_API_KEY}`
      )
      const spyJson = await spyRes.json()
      spyBars = (spyJson.results || []).map((b: any) => ({
        o: b.o,
        h: b.h,
        l: b.l,
        c: b.c,
        v: b.v,
      }))
    } catch {
      // proceed without RS component if SPY fails
    }

    const symbols = [...new Set(TOP_1000_SYMBOLS)]
    const total = symbols.length
    let processed = 0

    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      if (abortRef.current) break
      const batch = symbols.slice(i, i + BATCH_SIZE)
      setProgressLabel(`SCANNING ${batch[0]}…  (${processed}/${total})`)

      await Promise.allSettled(
        batch.map(async (sym) => {
          try {
            const res = await fetch(
              `https://api.polygon.io/v2/aggs/ticker/${sym}/range/1/day/${from}/${today}?adjusted=true&sort=asc&limit=300&apikey=${POLYGON_API_KEY}`
            )
            const json = await res.json()
            const raw: any[] = json.results || []
            if (raw.length < 55) return
            const bars: Bar[] = raw.map((b: any) => ({
              o: b.o,
              h: b.h,
              l: b.l,
              c: b.c,
              v: b.v,
            }))
            const result = buildResult(sym, bars, spyBars)
            if (!result) return
            if (result.signal === 'BUY') {
              setBuyResults((prev) => {
                const filtered = prev.filter((r) => r.symbol !== sym)
                return [...filtered, result].sort((a, b) => b.score - a.score)
              })
            } else {
              setSellResults((prev) => {
                const filtered = prev.filter((r) => r.symbol !== sym)
                return [...filtered, result].sort((a, b) => a.score - b.score)
              })
            }
          } catch {
            // skip failed symbol
          }
        })
      )

      processed += batch.length
      setProgress(Math.round((processed / total) * 100))

      // Brief pause between batches to respect rate limits
      if (i + BATCH_SIZE < symbols.length && !abortRef.current) {
        await new Promise((r) => setTimeout(r, 200))
      }
    }

    setScanning(false)
    setProgressLabel('')
    setLastScanTime(new Date())
  }, [scanning])

  const stopScan = () => {
    abortRef.current = true
    setScanning(false)
    setProgressLabel('')
  }

  const totalFound = buyResults.length + sellResults.length

  // Determine which results to show based on filter
  const visibleBuy = filterView !== 'sell' ? buyResults : []
  const visibleSell = filterView !== 'buy' ? sellResults : []

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#000000',
        color: '#ffffff',
        fontFamily: '"JetBrains Mono", "Courier New", monospace',
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          borderBottom: '2px solid rgba(255,255,255,0.12)',
          padding: '28px 32px 20px 32px',
          background: 'linear-gradient(180deg, #0a0a0a 0%, #000000 100%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
          {/* Title */}
          <div>
            <div
              style={{
                fontSize: '28px',
                fontWeight: '900',
                letterSpacing: '4px',
                textTransform: 'uppercase',
                lineHeight: 1,
              }}
            >
              <span style={{ color: '#00ff00' }}>BUY</span>
              <span style={{ color: '#ffffff', margin: '0 8px' }}>/</span>
              <span style={{ color: '#ff3232' }}>SELL</span>
              <span style={{ color: '#ffffff', marginLeft: '12px' }}>SCANNER</span>
            </div>
            <div
              style={{
                fontSize: '13px',
                fontWeight: '700',
                letterSpacing: '2px',
                color: '#ff8500',
                marginTop: '6px',
                textTransform: 'uppercase',
              }}
            >
              TOP 1000 SYMBOLS · 1-YEAR HISTORICAL · AVG LINE SIGNALS
            </div>
          </div>

          {/* Scan / Stop button */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '16px' }}>
            {lastScanTime && !scanning && (
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: '700',
                  color: '#ff8500',
                  letterSpacing: '1px',
                }}
              >
                LAST SCAN: {lastScanTime.toLocaleTimeString()}
              </div>
            )}

            {scanning && (
              <button
                onClick={stopScan}
                style={{
                  background: 'transparent',
                  border: '2px solid #ff3232',
                  color: '#ff3232',
                  fontSize: '14px',
                  fontWeight: '800',
                  letterSpacing: '2px',
                  padding: '10px 24px',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  fontFamily: 'inherit',
                }}
              >
                STOP
              </button>
            )}

            <button
              onClick={scanning ? undefined : runScan}
              disabled={scanning}
              style={{
                background: scanning
                  ? 'rgba(255,255,255,0.05)'
                  : 'linear-gradient(135deg, #ff8500 0%, #cc6a00 100%)',
                border: scanning ? '2px solid rgba(255,255,255,0.2)' : '2px solid #ff8500',
                color: scanning ? 'rgba(255,255,255,0.4)' : '#000000',
                fontSize: '15px',
                fontWeight: '900',
                letterSpacing: '2px',
                padding: '12px 32px',
                cursor: scanning ? 'not-allowed' : 'pointer',
                textTransform: 'uppercase',
                fontFamily: 'inherit',
              }}
            >
              {scanning ? 'SCANNING...' : totalFound > 0 ? 'RESCAN' : 'SCAN NOW'}
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {scanning && (
          <div style={{ marginTop: '16px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '6px',
              }}
            >
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: '700',
                  color: '#ff8500',
                  letterSpacing: '1px',
                }}
              >
                {progressLabel}
              </span>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#ffffff' }}>
                {progress}%
              </span>
            </div>
            <div
              style={{
                height: '6px',
                background: 'rgba(255,255,255,0.1)',
                borderRadius: '3px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${progress}%`,
                  background: 'linear-gradient(90deg, #ff8500, #ffcc00)',
                  transition: 'width 0.3s ease',
                  borderRadius: '3px',
                }}
              />
            </div>
            <div
              style={{
                marginTop: '8px',
                display: 'flex',
                gap: '24px',
                fontSize: '13px',
                fontWeight: '700',
              }}
            >
              <span>
                <span style={{ color: '#00ff00' }}>{buyResults.length}</span>
                <span style={{ color: '#ffffff' }}> BUY</span>
              </span>
              <span>
                <span style={{ color: '#ff3232' }}>{sellResults.length}</span>
                <span style={{ color: '#ffffff' }}> SELL</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Filter tabs + stats ── */}
      {totalFound > 0 && (
        <div
          style={{
            padding: '16px 32px',
            background: '#050505',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          {/* Summary badges */}
          <div
            style={{
              background: 'rgba(0,255,0,0.08)',
              border: '2px solid #00ff00',
              padding: '8px 20px',
              fontSize: '15px',
              fontWeight: '900',
              letterSpacing: '2px',
              color: '#00ff00',
            }}
          >
            {buyResults.length} BUY
          </div>
          <div
            style={{
              background: 'rgba(255,50,50,0.08)',
              border: '2px solid #ff3232',
              padding: '8px 20px',
              fontSize: '15px',
              fontWeight: '900',
              letterSpacing: '2px',
              color: '#ff3232',
            }}
          >
            {sellResults.length} SELL
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            {(['both', 'buy', 'sell'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilterView(f)}
                style={{
                  background: filterView === f ? '#ff8500' : 'transparent',
                  border: `2px solid ${filterView === f ? '#ff8500' : 'rgba(255,255,255,0.2)'}`,
                  color: filterView === f ? '#000000' : '#ffffff',
                  fontSize: '13px',
                  fontWeight: '800',
                  letterSpacing: '1.5px',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  fontFamily: 'inherit',
                }}
              >
                {f === 'both' ? 'ALL' : f}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!scanning && totalFound === 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '80px 32px',
            gap: '24px',
          }}
        >
          {/* Legend */}
          <div
            style={{
              display: 'flex',
              gap: '40px',
              marginBottom: '8px',
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: '120px',
                  height: '4px',
                  background: '#00ff00',
                  margin: '0 auto 8px auto',
                  borderTop: '2px dashed #00ff00',
                }}
              />
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: '700',
                  color: '#00ff00',
                  letterSpacing: '1px',
                }}
              >
                GREEN DOTTED
              </div>
              <div
                style={{ fontSize: '12px', fontWeight: '700', color: '#ffffff', marginTop: '4px' }}
              >
                AVG HIGH LINE
              </div>
              <div
                style={{ fontSize: '11px', fontWeight: '700', color: '#00ff00', marginTop: '2px' }}
              >
                → BUY SIGNAL
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: '120px',
                  height: '4px',
                  background: '#ff3232',
                  margin: '0 auto 8px auto',
                  borderTop: '2px dashed #ff3232',
                }}
              />
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: '700',
                  color: '#ff3232',
                  letterSpacing: '1px',
                }}
              >
                RED DOTTED
              </div>
              <div
                style={{ fontSize: '12px', fontWeight: '700', color: '#ffffff', marginTop: '4px' }}
              >
                AVG LOW LINE
              </div>
              <div
                style={{ fontSize: '11px', fontWeight: '700', color: '#ff3232', marginTop: '2px' }}
              >
                → SELL SIGNAL
              </div>
            </div>
          </div>

          <div
            style={{
              fontSize: '18px',
              fontWeight: '800',
              color: '#ffffff',
              letterSpacing: '3px',
              textTransform: 'uppercase',
            }}
          >
            PRESS SCAN NOW TO BEGIN
          </div>
          <div
            style={{
              fontSize: '13px',
              fontWeight: '700',
              color: '#ff8500',
              letterSpacing: '1.5px',
              textAlign: 'center',
              lineHeight: 1.8,
            }}
          >
            SCANS TOP 1000 SYMBOLS · USES 1-YEAR DAILY DATA
            <br />
            FINDS STOCKS ABOVE THE GREEN AVERAGE LINE (BUY)
            <br />
            OR BELOW THE RED AVERAGE LINE (SELL)
          </div>
        </div>
      )}

      {/* ── Results grid ── */}
      {totalFound > 0 && (
        <div style={{ padding: '24px 32px' }}>
          {/* BUY section */}
          {visibleBuy.length > 0 && (
            <div style={{ marginBottom: '40px' }}>
              <div
                style={{
                  fontSize: '20px',
                  fontWeight: '900',
                  letterSpacing: '4px',
                  color: '#00ff00',
                  textTransform: 'uppercase',
                  marginBottom: '20px',
                  borderLeft: '5px solid #00ff00',
                  paddingLeft: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                }}
              >
                <span>BUY SIGNALS</span>
                <span
                  style={{
                    background: '#00ff00',
                    color: '#000000',
                    fontSize: '14px',
                    fontWeight: '900',
                    padding: '2px 12px',
                    letterSpacing: '2px',
                  }}
                >
                  {visibleBuy.length}
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                  gap: '16px',
                }}
              >
                {visibleBuy.map((r) => (
                  <TradeCard key={r.symbol} result={r} />
                ))}
              </div>
            </div>
          )}

          {/* SELL section */}
          {visibleSell.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: '20px',
                  fontWeight: '900',
                  letterSpacing: '4px',
                  color: '#ff3232',
                  textTransform: 'uppercase',
                  marginBottom: '20px',
                  borderLeft: '5px solid #ff3232',
                  paddingLeft: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                }}
              >
                <span>SELL / SHORT SIGNALS</span>
                <span
                  style={{
                    background: '#ff3232',
                    color: '#000000',
                    fontSize: '14px',
                    fontWeight: '900',
                    padding: '2px 12px',
                    letterSpacing: '2px',
                  }}
                >
                  {visibleSell.length}
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                  gap: '16px',
                }}
              >
                {visibleSell.map((r) => (
                  <TradeCard key={r.symbol} result={r} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Trade Card ───────────────────────────────────────────────────────────────
function TradeCard({ result }: { result: ScanResult }) {
  const isBuy = result.signal === 'BUY'
  const accentColor = isBuy ? '#00ff00' : '#ff3232'
  const bgColor = isBuy ? 'rgba(0,255,0,0.04)' : 'rgba(255,50,50,0.04)'
  const borderColor = isBuy ? 'rgba(0,255,0,0.35)' : 'rgba(255,50,50,0.35)'

  const labelColor =
    result.label === 'BELOW YEARLY LOW'
      ? '#ff3232'
      : result.label === 'JUST BELOW AVERAGE'
        ? '#ff8500'
        : '#00ff00'

  const priceColor = result.priceChangePct >= 0 ? '#00ff00' : '#ff3232'

  // Score bar: map score from [-100,100] to [0,100]
  const scoreBarPct = ((result.score + 100) / 200) * 100

  return (
    <div
      style={{
        background: bgColor,
        border: `2px solid ${borderColor}`,
        borderTop: `4px solid ${accentColor}`,
        padding: '20px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top row: symbol + signal badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '14px',
        }}
      >
        <div
          style={{
            fontSize: '26px',
            fontWeight: '900',
            color: '#ffffff',
            letterSpacing: '2px',
            lineHeight: 1,
          }}
        >
          {result.symbol}
        </div>
        <div
          style={{
            background: accentColor,
            color: '#000000',
            fontSize: '14px',
            fontWeight: '900',
            letterSpacing: '3px',
            padding: '5px 14px',
          }}
        >
          {result.signal}
        </div>
      </div>

      {/* Label row */}
      <div
        style={{
          fontSize: '12px',
          fontWeight: '900',
          letterSpacing: '1.5px',
          color: labelColor,
          textTransform: 'uppercase',
          marginBottom: '14px',
          border: `1px solid ${labelColor}`,
          padding: '4px 10px',
          display: 'inline-block',
        }}
      >
        {result.label}
      </div>

      {/* Score + price row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '12px',
          alignItems: 'flex-end',
        }}
      >
        <div>
          <div
            style={{
              fontSize: '11px',
              fontWeight: '700',
              color: '#ff8500',
              letterSpacing: '1px',
              marginBottom: '2px',
            }}
          >
            PRESSURE SCORE
          </div>
          <div
            style={{
              fontSize: '32px',
              fontWeight: '900',
              color: accentColor,
              lineHeight: 1,
            }}
          >
            {result.score > 0 ? '+' : ''}
            {result.score}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              fontSize: '11px',
              fontWeight: '700',
              color: '#ff8500',
              letterSpacing: '1px',
              marginBottom: '2px',
            }}
          >
            PRICE
          </div>
          <div style={{ fontSize: '22px', fontWeight: '900', color: '#ffffff', lineHeight: 1 }}>
            ${result.currentPrice.toFixed(2)}
          </div>
          <div style={{ fontSize: '14px', fontWeight: '800', color: priceColor, marginTop: '2px' }}>
            {result.priceChangePct >= 0 ? '+' : ''}
            {result.priceChangePct.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Score progress bar */}
      <div
        style={{
          height: '6px',
          background: 'rgba(255,255,255,0.1)',
          borderRadius: '2px',
          overflow: 'hidden',
          marginBottom: '12px',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${scoreBarPct}%`,
            background: isBuy
              ? 'linear-gradient(90deg, rgba(0,255,0,0.4), #00ff00)'
              : 'linear-gradient(90deg, #ff3232, rgba(255,50,50,0.4))',
            borderRadius: '2px',
            transition: 'width 0.4s ease',
          }}
        />
      </div>

      {/* Range row: yearly min / avg low / avg high / yearly max */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '6px',
          fontSize: '11px',
          fontWeight: '700',
          letterSpacing: '0.5px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          paddingTop: '10px',
        }}
      >
        <div>
          <span style={{ color: '#ff8500' }}>AVG HIGH </span>
          <span style={{ color: '#00ff00' }}>
            {result.avgHighVal > 0 ? '+' : ''}
            {result.avgHighVal}
          </span>
        </div>
        <div>
          <span style={{ color: '#ff8500' }}>AVG LOW </span>
          <span style={{ color: '#ff3232' }}>{result.avgLowVal}</span>
        </div>
        <div>
          <span style={{ color: '#ff8500' }}>YR HIGH </span>
          <span style={{ color: '#ffffff' }}>
            {result.yearlyMax > 0 ? '+' : ''}
            {result.yearlyMax}
          </span>
        </div>
        <div>
          <span style={{ color: '#ff8500' }}>YR LOW </span>
          <span style={{ color: '#ffffff' }}>{result.yearlyMin}</span>
        </div>
      </div>
    </div>
  )
}
