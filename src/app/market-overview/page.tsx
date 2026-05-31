'use client'

import { useEffect, useState } from 'react'

import dynamic from 'next/dynamic'

import { useMarketOverviewLayout } from './useMarketOverviewLayout'
import '../mobile-trading.css'

// Dynamically import EFICharting to avoid SSR issues
const EFIChart = dynamic(() => import('../../components/trading/EFICharting'), {
  ssr: false,
})

export default function MarketPage() {
  const [selectedSymbol, setSelectedSymbol] = useState('SPY')
  const [selectedTimeframe, setSelectedTimeframe] = useState('1d')
  const { chartHeight, paddingTop, updateLayout } = useMarketOverviewLayout()

  useEffect(() => {
    // Disable scrolling on this page
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'

    // Prevent wheel events from scrolling the document, but allow scrolling inside sidebar panels
    const preventScroll = (e: WheelEvent) => {
      const path: string[] = []
      let el = e.target as HTMLElement | null
      while (el && el !== document.body) {
        const style = window.getComputedStyle(el)
        const overflowY = style.overflowY
        const tag =
          el.tagName + (el.className ? '.' + String(el.className).split(' ').join('.') : '')
        path.push(
          `${tag}[overflowY=${overflowY},scrollH=${el.scrollHeight},clientH=${el.clientHeight}]`
        )
        if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
          return
        }
        el = el.parentElement
      }
      e.preventDefault()
    }
    document.addEventListener('wheel', preventScroll, { passive: false })

    updateLayout()
    window.addEventListener('resize', updateLayout)

    return () => {
      window.removeEventListener('resize', updateLayout)
      document.removeEventListener('wheel', preventScroll)
      document.body.style.overflow = ''
      document.documentElement.style.overflow = ''
    }
  }, [])

  const handleSymbolChange = (symbol: string) => {
    setSelectedSymbol(symbol)
  }

  const handleTimeframeChange = (timeframe: string) => {
    setSelectedTimeframe(timeframe)
  }

  return (
    <div
      className="market-overview-container h-screen bg-[#0a0a0a] text-white overflow-hidden fixed inset-0"
      style={{ paddingTop: paddingTop, overscrollBehavior: 'none' }}
    >
      <div className="w-full h-full">
        <EFIChart
          symbol={selectedSymbol}
          initialTimeframe={selectedTimeframe}
          height={chartHeight}
          onSymbolChange={handleSymbolChange}
          onTimeframeChange={handleTimeframeChange}
        />
      </div>
    </div>
  )
}
