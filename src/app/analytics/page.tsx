'use client'

import { useState } from 'react'

import dynamic from 'next/dynamic'

import HVScreener from '@/components/HVScreener'
import LeadershipScan from '@/components/LeadershipScan'
import RRGScreener from '@/components/RRGScreener'
import RSScreener from '@/components/RSScreener'
import IVRRGAnalytics from '@/components/analytics/IVRRGAnalytics'
import MarketCycleIndicator from '@/components/analytics/MarketCycleIndicator'
import MarketHeatmap from '@/components/analytics/MarketHeatmap'
import RRGAnalytics from '@/components/analytics/RRGAnalytics'
import DealerClusterScreener from '@/components/analytics/DealerClusterScreener'
import ScreenersPanel from '@/components/analytics/ScreenersPanel'
import PerformanceDashboard from '@/components/charts/PerformanceDashboard'
import Footer from '@/components/terminal/Footer'

import '../terminal.css'
import './analytics-tabs.css'

const StraddleTownScreener = dynamic(() => import('@/components/analytics/StraddleTownScreener'), {
  ssr: false,
})

const BuySellScanner = dynamic(() => import('@/components/analytics/BuySellScanner'), {
  ssr: false,
})

export default function Analytics() {
  const [activePanel, setActivePanel] = useState<string>('rrg')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const panelLabels: Record<string, string> = {
    'rrg': 'RRG', 'performance': 'Performance', 'iv-rrg': 'IV RRG',
    'rrg-screener': 'RRG Screener', 'leadership-scan': 'Leadership',
    'hv-screener': 'HV Screener', 'heatmap': 'Heatmap', 'screeners': 'Screeners',
    'market-cycle': 'Market Cycle', 'straddle-town': 'Straddle Town',
    'buy-sell-scanner': 'Buy/Sell Scan', 'dealer-cluster': 'Dealer Cluster',
  }

  const togglePanel = (id: string) => {
    setActivePanel(id)
    setMobileMenuOpen(false)
  }

  const renderPanel = (id: string) => {
    const panelStyle = {
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '4px',
      overflow: 'hidden',
      background: '#000000',
    }

    switch (id) {
      case 'rrg':
        return (
          <div key={id} className="analytics-rrg-panel" style={{ ...panelStyle, height: 'calc(100vh - 156px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <RRGAnalytics defaultTimeframe="12 weeks" defaultBenchmark="SPY" />
          </div>
        )
      case 'rs-screener':
        return (
          <div key={id} style={panelStyle}>
            <RSScreener />
          </div>
        )
      case 'hv-screener':
        return (
          <div key={id} className="analytics-scroll-panel" style={panelStyle}>
            <HVScreener />
          </div>
        )
      case 'leadership-scan':
        return (
          <div key={id} className="analytics-scroll-panel" style={panelStyle}>
            <LeadershipScan />
          </div>
        )
      case 'rrg-screener':
        return (
          <div key={id} style={panelStyle}>
            <RRGScreener />
          </div>
        )
      case 'performance':
        return (
          <div key={id} className="analytics-rrg-panel" style={{ ...panelStyle, height: 'calc(100vh - 156px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <PerformanceDashboard isVisible={true} />
          </div>
        )
      case 'heatmap':
        return (
          <div key={id} style={panelStyle}>
            <MarketHeatmap />
          </div>
        )
      case 'iv-rrg':
        return (
          <div key={id} className="analytics-rrg-panel" style={{ ...panelStyle, height: 'calc(100vh - 156px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <IVRRGAnalytics defaultTimeframe="120 days" defaultBenchmark="SPY" />
          </div>
        )
      case 'screeners':
        return (
          <div key={id} style={{ ...panelStyle, overflow: 'visible' }}>
            <ScreenersPanel />
          </div>
        )
      case 'market-cycle':
        return (
          <div key={id} style={panelStyle}>
            <MarketCycleIndicator />
          </div>
        )
      case 'straddle-town':
        return (
          <div key={id} className="analytics-straddle-panel" style={{ ...panelStyle, height: 'calc(100vh - 127px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <StraddleTownScreener />
          </div>
        )
      case 'buy-sell-scanner':
        return (
          <div key={id} style={{ ...panelStyle, overflow: 'visible', minHeight: '100vh' }}>
            <BuySellScanner />
          </div>
        )
      case 'dealer-cluster':
        return (
          <div key={id} style={{ ...panelStyle, overflow: 'visible' }}>
            <DealerClusterScreener />
          </div>
        )
      default:
        return null
    }
  }

  const getIcon = (id: string) => {
    const icons: { [key: string]: React.ReactElement } = {
      rrg: (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="2" y="2" width="9" height="9" fill="#ef4444" opacity="0.7" rx="1" />
          <rect x="13" y="2" width="9" height="9" fill="#f59e0b" opacity="0.7" rx="1" />
          <rect x="2" y="13" width="9" height="9" fill="#10b981" opacity="0.7" rx="1" />
          <rect x="13" y="13" width="9" height="9" fill="#3b82f6" opacity="0.7" rx="1" />
        </svg>
      ),
      'rs-screener': (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="3" y="14" width="5" height="7" fill="#4ade80" opacity="0.5" rx="1" />
          <rect x="10" y="8" width="5" height="13" fill="#4ade80" opacity="0.8" rx="1" />
          <rect x="17" y="3" width="5" height="18" fill="#4ade80" rx="1" />
          <path
            d="M4 13L12 5L20 2"
            stroke="#22c55e"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
      'hv-screener': (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M2 12 L6 6 L10 14 L14 4 L18 10 L22 8"
            stroke="#f59e0b"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <path
            d="M2 12 L6 6 L10 14 L14 4 L18 10 L22 8"
            stroke="#fbbf24"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity="0.5"
          />
        </svg>
      ),
      'leadership-scan': (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="3" y="14" width="5" height="8" fill="#d4af37" opacity="0.4" rx="1" />
          <rect x="9.5" y="9" width="5" height="13" fill="#ffd700" rx="1" />
          <rect x="16" y="12" width="5" height="10" fill="#c5a028" opacity="0.6" rx="1" />
          <path
            d="M12 2L13.5 6L17 6.5L14.5 9L15 12.5L12 10.5L9 12.5L9.5 9L7 6.5L10.5 6L12 2Z"
            fill="#ffd700"
            stroke="#fbbf24"
            strokeWidth="1.5"
          />
        </svg>
      ),
      'rrg-screener': (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="#a855f7"
            strokeWidth="2"
            fill="none"
            opacity="0.3"
          />
          <path
            d="M12 3 L15 9 M21 12 L15 15 M12 21 L9 15 M3 12 L9 9"
            stroke="#a855f7"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M12 3 C16 6, 18 8, 21 12 C18 16, 16 18, 12 21 C8 18, 6 16, 3 12 C6 8, 8 6, 12 3"
            stroke="#c084fc"
            strokeWidth="1.5"
            fill="none"
            opacity="0.4"
          />
        </svg>
      ),
      performance: (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="#06b6d4"
            strokeWidth="2"
            fill="none"
            opacity="0.3"
          />
          <path d="M12 12L12 6" stroke="#06b6d4" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M12 12L17 15" stroke="#22d3ee" strokeWidth="3" strokeLinecap="round" />
          <circle cx="12" cy="12" r="2" fill="#06b6d4" />
          <path
            d="M12 3L12 5 M21 12L19 12 M12 21L12 19 M3 12L5 12"
            stroke="#06b6d4"
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.5"
          />
        </svg>
      ),
      heatmap: (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="2" y="2" width="6" height="6" fill="#dc2626" rx="1" />
          <rect x="9" y="2" width="6" height="6" fill="#ea580c" rx="1" />
          <rect x="16" y="2" width="6" height="6" fill="#f59e0b" rx="1" />
          <rect x="2" y="9" width="6" height="6" fill="#84cc16" rx="1" />
          <rect x="9" y="9" width="6" height="6" fill="#10b981" rx="1" />
          <rect x="16" y="9" width="6" height="6" fill="#14b8a6" rx="1" />
          <rect x="2" y="16" width="6" height="6" fill="#06b6d4" rx="1" />
          <rect x="9" y="16" width="6" height="6" fill="#3b82f6" rx="1" />
          <rect x="16" y="16" width="6" height="6" fill="#8b5cf6" rx="1" />
        </svg>
      ),
      'iv-rrg': (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="#eab308"
            strokeWidth="1.5"
            fill="none"
            opacity="0.3"
          />
          <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" fill="#fbbf24" opacity="0.4" />
          <path
            d="M13 2L3 14H12L11 22L21 10H12L13 2Z"
            stroke="#eab308"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M12 3 C16 6, 18 8, 21 12"
            stroke="#fbbf24"
            strokeWidth="1.5"
            fill="none"
            opacity="0.5"
            strokeLinecap="round"
          />
        </svg>
      ),
      screeners: (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="3" y="3" width="18" height="3" rx="1" fill="#38bdf8" opacity="0.8" />
          <rect x="3" y="8" width="14" height="3" rx="1" fill="#38bdf8" opacity="0.6" />
          <rect x="3" y="13" width="10" height="3" rx="1" fill="#38bdf8" opacity="0.4" />
          <rect x="3" y="18" width="6" height="3" rx="1" fill="#38bdf8" opacity="0.2" />
          <circle cx="19" cy="19" r="3" stroke="#38bdf8" strokeWidth="1.5" fill="none" />
          <path d="M21.5 21.5L23 23" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
      'market-cycle': (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="#22c55e"
            strokeWidth="1.5"
            fill="none"
            opacity="0.3"
          />
          <path
            d="M3 12 Q6 6, 9 9 Q12 12, 15 6 Q18 0, 21 6"
            stroke="#22c55e"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx="12" cy="12" r="2.5" fill="#22c55e" opacity="0.8" />
          <path
            d="M12 3L12 5 M21 12L19 12 M12 21L12 19 M3 12L5 12"
            stroke="#22c55e"
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.5"
          />
        </svg>
      ),
      'straddle-town': (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M12 3L4 20H20L12 3Z"
            stroke="#CC44FF"
            strokeWidth="1.5"
            fill="none"
            opacity="0.4"
          />
          <path d="M12 3L4 20H20L12 3Z" fill="rgba(180,0,255,0.12)" />
          <circle cx="12" cy="12" r="3" fill="#CC44FF" opacity="0.85" />
          <path
            d="M8 20L12 14L16 20"
            stroke="#CC44FF"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.6"
          />
          <circle cx="6" cy="19" r="1.5" fill="#00FF88" opacity="0.8" />
          <circle cx="18" cy="19" r="1.5" fill="#FF4060" opacity="0.8" />
        </svg>
      ),
      'buy-sell-scanner': (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M4 18L10 10L14 14L20 6"
            stroke="#00ff00"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="20" cy="6" r="2" fill="#00ff00" />
          <path
            d="M4 12L8 16L12 10L18 18"
            stroke="#ff3232"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="3 2"
          />
          <circle cx="18" cy="18" r="2" fill="#ff3232" />
          <line
            x1="3"
            y1="12"
            x2="21"
            y2="12"
            stroke="rgba(255,255,255,0.2)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        </svg>
      ),
      'dealer-cluster': (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="10" width="4" height="11" fill="#ff4444" opacity="0.6" rx="1" />
          <rect x="10" y="4" width="4" height="17" fill="#c84fff" rx="1" />
          <rect x="17" y="8" width="4" height="13" fill="#00d264" opacity="0.6" rx="1" />
          <line x1="3" y1="21" x2="21" y2="21" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
        </svg>
      ),
    }
    return icons[id] || icons['rrg']
  }

  const TabButton = ({ id, label }: { id: string; label: string }) => {
    const isActive = activePanel === id
    return (
      <button
        onClick={() => togglePanel(id)}
        className="analytics-tab-btn"
        style={{
          background: isActive
            ? 'linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)'
            : 'linear-gradient(135deg, #0d0d0d 0%, #050505 100%)',
          color: isActive ? '#FFB800' : '#FFFFFF',
          border: isActive ? '1px solid #D4AF37' : '1px solid rgba(255, 255, 255, 0.08)',
          borderLeft: isActive ? '4px solid #D4AF37' : '4px solid transparent',
          boxShadow: isActive
            ? '0 4px 12px rgba(212, 175, 55, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 -1px 0 rgba(212, 175, 55, 0.2)'
            : '0 4px 12px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.03)',
          cursor: 'pointer',
          transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          position: 'relative',
          overflow: 'hidden',
          opacity: 1,
          backdropFilter: 'blur(10px)',
        }}
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.background =
              'linear-gradient(135deg, rgba(30, 30, 30, 0.9) 0%, rgba(20, 20, 20, 0.95) 100%)'
            e.currentTarget.style.transform = 'translateX(6px) scale(1.02)'
            e.currentTarget.style.borderLeft = '4px solid rgba(212, 175, 55, 0.5)'
            e.currentTarget.style.boxShadow =
              '0 8px 20px rgba(212, 175, 55, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.08)'
            e.currentTarget.style.color = '#FFB800'
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            e.currentTarget.style.background =
              'linear-gradient(135deg, rgba(20, 20, 20, 0.5) 0%, rgba(10, 10, 10, 0.8) 100%)'
            e.currentTarget.style.transform = 'translateX(0) scale(1)'
            e.currentTarget.style.borderLeft = '4px solid transparent'
            e.currentTarget.style.boxShadow =
              '0 4px 12px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.03)'
            e.currentTarget.style.color = '#FFFFFF'
          }
        }}
      >
        <span
          className="analytics-tab-icon"
          style={{ color: isActive ? '#FFB800' : '#FFFFFF' }}
        >
          {getIcon(id)}
        </span>
        <span
          style={{
            flex: 1,
            textShadow: '0 2px 8px rgba(0, 0, 0, 0.8)',
            opacity: 1,
            fontWeight: isActive ? '700' : '600',
          }}
        >
          {label}
        </span>
        {isActive && (
          <span
            style={{
              position: 'absolute',
              right: '16px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#D4AF37',
            }}
          />
        )}
      </button>
    )
  }

  return (
    <>
      <style>{`
        :root { --analytics-sw: clamp(140px, 13vw, 220px); }

        .analytics-sidebar {
          width: var(--analytics-sw) !important;
        }
        .analytics-title-box {
          padding: clamp(8px,0.8vh,16px) clamp(10px,0.9vw,20px);
          margin: 0 clamp(6px,0.6vw,12px) clamp(10px,1vh,20px) clamp(6px,0.6vw,12px);
          border-radius: clamp(8px,0.6vw,12px);
        }
        .analytics-title-text {
          font-size: clamp(10px,1.05vw,18px) !important;
          letter-spacing: clamp(1px,0.18vw,3px) !important;
        }
        .analytics-tab-btn {
          border-radius: clamp(6px,0.6vw,12px);
          padding: clamp(7px,0.82vh,18px) clamp(7px,0.82vw,20px);
          margin: clamp(2px,0.32vh,6px) clamp(5px,0.55vw,12px);
          font-family: "Inter", "Segoe UI", "Roboto", sans-serif;
          font-size: clamp(7px,0.65vw,12px);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: clamp(0.3px,0.07vw,1.2px);
          width: calc(100% - clamp(10px,1.1vw,24px));
          text-align: left;
          display: flex;
          align-items: center;
          gap: clamp(5px,0.65vw,14px);
        }
        .analytics-tab-icon {
          flex-shrink: 0;
          width: clamp(12px,1.2vw,24px);
          height: clamp(12px,1.2vw,24px);
          line-height: 0;
          display: flex;
          align-items: center;
        }
        .analytics-tab-icon svg {
          width: 100% !important;
          height: 100% !important;
        }
        .analytics-mobile-header { display: none; }
        @media (max-width: 768px) {
          :root { --analytics-sw: 0px; }
          .analytics-sidebar { display: none !important; }
          .analytics-outer { flex-direction: column !important; overflow: visible !important; height: auto !important; min-height: 100vh; }
          .analytics-content-area { margin-left: 0 !important; height: auto !important; overflow-y: visible !important; padding: 0 !important; }
          .analytics-mobile-header { display: block; position: relative; z-index: 200; background: #0a0a0a; border-bottom: 1px solid rgba(255,255,255,0.15); flex-shrink: 0; }
          .analytics-mobile-trigger { width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: transparent; color: #FFB800; border: none; font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; cursor: pointer; font-family: "Inter", sans-serif; }
          .analytics-mobile-dropdown { position: absolute; top: 100%; left: 0; right: 0; background: #0a0a0a; z-index: 300; display: flex; flex-direction: column; max-height: 60vh; overflow-y: auto; box-shadow: 0 8px 24px rgba(0,0,0,0.8); border-bottom: 1px solid rgba(255,255,255,0.1); }
          .analytics-tab-btn { margin: 4px 8px !important; width: calc(100% - 16px) !important; font-size: 14px !important; padding: 12px 16px !important; }
          .analytics-rrg-panel { height: calc(100vh - 116px) !important; }
          .analytics-straddle-panel { height: calc(100vh - 200px) !important; }
          .analytics-scroll-panel { height: calc(100vh - 116px) !important; overflow-y: auto !important; }

          /* ── terminal-panel (HVScreener / LeadershipScan) ──────────────── */
          .terminal-panel { margin: 0 !important; }

          /* ── BuySellScanner ────────────────────────────────────────────── */
          .bss-header { padding: 12px 14px 10px 14px !important; }
          .bss-header > div { gap: 12px !important; }
          .bss-title { font-size: 18px !important; letter-spacing: 2px !important; }
          .bss-header button, .bss-header input { font-size: 11px !important; padding: 7px 10px !important; }
          .bss-results-grid { grid-template-columns: 1fr !important; padding: 12px 14px 40px !important; gap: 16px !important; }
          .bss-cards-grid { grid-template-columns: 1fr !important; gap: 10px !important; }

          /* ── Straddle Town ─────────────────────────────────────────────── */
          .straddle-header { padding: 0 8px !important; }
          .straddle-controls-row { flex-wrap: wrap !important; min-height: unset !important; gap: 6px !important; padding: 6px 0 !important; }
          .straddle-brand { padding-right: 12px !important; border-right: none !important; flex-shrink: 1 !important; }
          .straddle-brand div[style] { font-size: 15px !important; letter-spacing: 2px !important; }

          /* ── MarketCycleIndicator ──────────────────────────────────────── */
          .mci-header { flex-wrap: wrap !important; gap: 8px !important; padding: 10px 12px !important; }
          .mci-header > div:last-child { flex-wrap: wrap !important; gap: 6px !important; }
          .mci-grid { grid-template-columns: 1fr !important; }
          .mci-history-grid { grid-template-columns: 1fr !important; }

          /* ── PerformanceDashboard ──────────────────────────────────────── */
          .perf-header { padding: 8px 12px !important; flex-wrap: nowrap !important; gap: 6px !important; overflow-x: auto !important; }
          .perf-header > div { flex-wrap: nowrap !important; gap: 6px !important; }
          .perf-header select, .perf-header button { font-size: 10px !important; padding: 5px 8px !important; }
          .perf-selected-count { padding: 5px 8px !important; font-size: 10px !important; letter-spacing: 0 !important; }

          /* ── HV Screener ───────────────────────────────────────────────── */
          .hvs-header { flex-wrap: wrap !important; padding: 10px 12px !important; gap: 10px !important; }
          .hvs-grid { grid-template-columns: 1fr !important; min-height: auto !important; max-height: none !important; }

          /* ── Leadership Scan ───────────────────────────────────────────── */
          .leadership-header { flex-wrap: wrap !important; padding: 10px 12px !important; gap: 10px !important; }
          .leadership-results-grid { grid-template-columns: 1fr !important; }

          /* ── RRG Screener ──────────────────────────────────────────────── */
          .rrg-screener-container { padding: 10px !important; }
          .rrg-screener-header { padding: 10px 12px !important; margin-bottom: 12px !important; }

          /* ── ScreenersPanel ────────────────────────────────────────────── */
          .screeners-search-bar { flex-wrap: wrap !important; padding: 10px 12px !important; gap: 8px !important; }
          .screeners-search-bar > div:first-child { font-size: 14px !important; margin-right: 0 !important; }
          .screeners-search-bar input { padding: 10px 12px !important; font-size: 13px !important; }
          .screeners-search-bar button { padding: 10px 14px !important; font-size: 12px !important; }
          .screeners-tab-nav button { min-width: 100px !important; padding: 10px 12px !important; font-size: 12px !important; letter-spacing: 0 !important; }
        }
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
            transform: translateY(-50%) scale(1);
          }
          50% {
            opacity: 0.6;
            transform: translateY(-50%) scale(1.3);
          }
        }
        .main-content {
          padding-top: 0 !important;
        }
      `}</style>

      <div
        className="analytics-outer"
        style={{
          display: 'flex',
          height: 'calc(100vh - 140px)',
          overflow: 'hidden',
          background: '#000000',
        }}
      >
        {/* Mobile dropdown header */}
        <div className="analytics-mobile-header">
          <button
            className="analytics-mobile-trigger"
            onClick={() => setMobileMenuOpen(o => !o)}
          >
            <span>&#9776; {panelLabels[activePanel] ?? 'Analytics'}</span>
            <span style={{ fontSize: '12px', opacity: 0.7 }}>{mobileMenuOpen ? '▲' : '▼'}</span>
          </button>
          {mobileMenuOpen && (
            <div className="analytics-mobile-dropdown">
              <TabButton id="rrg" label="RRG" />
              <TabButton id="performance" label="Performance" />
              <TabButton id="iv-rrg" label="IV RRG" />
              <TabButton id="rrg-screener" label="RRG Screener" />
              <TabButton id="leadership-scan" label="Leadership" />
              <TabButton id="hv-screener" label="HV Screener" />
              <TabButton id="heatmap" label="Heatmap" />
              <TabButton id="screeners" label="Screeners" />
              <TabButton id="market-cycle" label="Market Cycle" />
              <TabButton id="straddle-town" label="Straddle Town" />
              <TabButton id="buy-sell-scanner" label="Buy/Sell Scan" />
              <TabButton id="dealer-cluster" label="Dealer Cluster" />
            </div>
          )}
        </div>
        {/* Left Sidebar with Tabs - Fixed Position */}
        <div
          className="analytics-sidebar"
          style={{
            background: 'linear-gradient(180deg, #0a0a0a 0%, #000000 100%)',
            borderRight: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0',
            padding: '140px 0 16px 0',
            flexShrink: 0,
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
            zIndex: 100,
            overflowY: 'auto',
            overflowX: 'hidden',
            boxShadow: '4px 0 24px rgba(0, 0, 0, 0.6)',
          }}
        >
          {/* Title */}
          <div
            className="analytics-title-box"
            style={{
              background: 'linear-gradient(145deg, #1a1a1a 0%, #0d0d0d 100%)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow:
                '0 8px 16px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 -1px 0 rgba(0, 0, 0, 0.5)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <h2
              className="analytics-title-text"
              style={{
                margin: 0,
                fontWeight: '800',
                color: '#ff8500',
                textTransform: 'uppercase',
                textAlign: 'center',
                fontFamily: '"Inter", "Segoe UI", "Roboto", sans-serif',
                WebkitFontSmoothing: 'antialiased',
                MozOsxFontSmoothing: 'grayscale',
                textShadow: '0 2px 0 rgba(0, 0, 0, 0.8), 0 4px 8px rgba(0, 0, 0, 0.5)',
              }}
            >
              Analytics
            </h2>
          </div>

          <TabButton id="rrg" label="RRG" />
          <TabButton id="performance" label="Performance" />
          <TabButton id="iv-rrg" label="IV RRG" />
          <TabButton id="rrg-screener" label="RRG Screener" />
          <TabButton id="leadership-scan" label="Leadership" />
          <TabButton id="hv-screener" label="HV Screener" />
          <TabButton id="heatmap" label="Heatmap" />
          <TabButton id="screeners" label="Screeners" />
          <TabButton id="market-cycle" label="Market Cycle" />
          <TabButton id="straddle-town" label="Straddle Town" />
          <TabButton id="buy-sell-scanner" label="Buy/Sell Scan" />
          <TabButton id="dealer-cluster" label="Dealer Cluster" />
        </div>

        {/* Full Page Content Area - With left margin for fixed sidebar */}
        <div
          className="analytics-content-area"
          style={{
            flex: 1,
            background: '#000000',
            display: 'grid',
            gridTemplateColumns: '1fr',
            gridAutoRows: 'auto',
            gap: '8px',
            padding: '8px',
            alignContent: 'start',
            marginLeft: 'var(--analytics-sw)',
            minWidth: 0,
            overflowY: 'auto',
            height: '100%',
          }}
        >
          {renderPanel(activePanel)}
        </div>
      </div>
    </>
  )
}
