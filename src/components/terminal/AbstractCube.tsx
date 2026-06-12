'use client'

import { useEffect, useState } from 'react'

import MiniMarketHeatmap from './MiniMarketHeatmap'
import './AbstractCube.css'

export default function AbstractCube() {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="financial-dashboard">
      {/* Market Overview Header */}
      <div className="dashboard-header">
        <div className="header-title">
          <span className="title-text">Live Market Data</span>
          <span className="live-indicator">
            <span className="live-dot"></span>
            LIVE
          </span>
        </div>
        <div className="market-time">
          {time.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
        </div>
      </div>

      <div className="dashboard-grid">
        {/* S&P 500 Sector Heatmap - top 10 per sector */}
        <div className="widget widget-heatmap">
          <div className="widget-header">
            <svg className="widget-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M0 0h7v7H0zM9 0h7v7H9zM0 9h7v7H0zM9 9h7v7H9z" />
            </svg>
            <span className="widget-title">S&P 500 Market Heatmap</span>
          </div>
          <MiniMarketHeatmap />
        </div>
      </div>
    </div>
  )
}
