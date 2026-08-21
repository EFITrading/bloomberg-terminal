'use client'

import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

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

  if (!symbol) return null

  return (
    <div style={{ width: '900px', height: '480px', background: '#000' }} data-chart-ready="true">
      <TradePopupChart
        symbol={symbol}
        fallbackCandles={[]}
        initialTimeframe="5M"
        containerWidth="100%"
        entryMarker={entryTime ? { time: entryTime, label: 'TRADE TAKEN HERE' } : null}
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
