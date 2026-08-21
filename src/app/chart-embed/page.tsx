'use client'

import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

// Bare 5-min chart used ONLY for headless screenshot capture (Discord card) — reuses the
// exact same canvas chart logic as the live trade-detail popup, never a reimplementation.
const TradePopupChart = dynamic(
  () => import('@/components/trading/EFICharting').then((m) => ({ default: m.TradePopupChart })),
  { ssr: false }
)

function ChartEmbedInner() {
  const params = useSearchParams()
  const symbol = params.get('ticker') || ''
  const entryTimeRaw = params.get('entryTime')
  const entryTime = entryTimeRaw ? Number(entryTimeRaw) : null
  const [candles, setCandles] = useState<any[]>([])
  const [ready, setReady] = useState(false)

  // Fetch exactly the TRADE'S session date's 5m candles (9:30am ET open through now) - NOT
  // today's real-world date, which is wrong whenever the collector runs this after the
  // trading day it's charting (e.g. an overnight/next-day alert scan for a prior session).
  useEffect(() => {
    if (!symbol) return
    const sessionDate = entryTime ? new Date(entryTime).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
    fetch('/api/bulk-chart-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols: [symbol], timeframe: '5m', startDate: sessionDate, endDate: sessionDate }),
    })
      .then((r) => r.json())
      .then((data) => {
        const prices = data.data?.[symbol] || []
        setCandles(prices)
      })
      .catch(() => { })
      .finally(() => setReady(true))
  }, [symbol, entryTime])

  if (!symbol || !ready) return null

  return (
    <div style={{ width: '900px', height: '480px', background: '#000' }} data-chart-ready="true">
      <TradePopupChart
        symbol={symbol}
        fallbackCandles={candles}
        initialTimeframe="5M"
        containerWidth="100%"
        entryMarker={entryTime ? { time: entryTime, label: 'TRADE TAKEN HERE' } : null}
        disableFetch
      />
    </div>
  )
}

export default function ChartEmbedPage() {
  return (
    <Suspense fallback={null}>
      <ChartEmbedInner />
    </Suspense>
  )
}
