'use client';

import React, { useState } from 'react';
import '../terminal.css';
import './analytics-tabs.css';
import Footer from '@/components/terminal/Footer';
import RRGAnalytics from '@/components/analytics/RRGAnalytics';
import RSScreener from '@/components/RSScreener';
import HVScreener from '@/components/HVScreener';
import LeadershipScan from '@/components/LeadershipScan';
import PerformanceDashboard from '@/components/charts/PerformanceDashboard';
import MarketHeatmap from '@/components/analytics/MarketHeatmap';
import IVRRGAnalytics from '@/components/analytics/IVRRGAnalytics';
import RRGScreener from '@/components/RRGScreener';

export default function Analytics() {
  const [activePanels, setActivePanels] = useState<string[]>(['rrg', 'performance']);

  const togglePanel = (id: string) => {
    setActivePanels(prev =>
      prev.includes(id)
        ? prev.filter(p => p !== id)
        : [...prev, id]
    );
  };

  const renderPanel = (id: string) => {
    const panelStyle = {
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '4px',
      overflow: 'hidden',
      background: '#000000',
      height: '100%',
      minHeight: 0
    };

    switch (id) {
      case 'rrg':
        return (
          <div key={id} style={panelStyle}>
            <RRGAnalytics defaultTimeframe="12 weeks" defaultBenchmark="SPY" />
          </div>
        );
      case 'rs-screener':
        return (
          <div key={id} style={panelStyle}>
            <RSScreener />
          </div>
        );
      case 'hv-screener':
        return (
          <div key={id} style={panelStyle}>
            <HVScreener />
          </div>
        );
      case 'leadership-scan':
        return (
          <div key={id} style={panelStyle}>
            <LeadershipScan />
          </div>
        );
      case 'rrg-screener':
        return (
          <div key={id} style={panelStyle}>
            <RRGScreener />
          </div>
        );
      case 'performance':
        return (
          <div key={id} style={panelStyle}>
            <PerformanceDashboard isVisible={true} />
          </div>
        );
      case 'heatmap':
        return (
          <div key={id} style={panelStyle}>
            <MarketHeatmap />
          </div>
        );
      case 'iv-rrg':
        return (
          <div key={id} style={panelStyle}>
            <IVRRGAnalytics defaultTimeframe="120 days" defaultBenchmark="SPY" />
          </div>
        );
      default:
        return null;
    }
  };

  const getIcon = (id: string) => {
    const icons: { [key: string]: JSX.Element } = {
      'rrg': (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="2" width="9" height="9" fill="#ef4444" opacity="0.7" rx="1" />
          <rect x="13" y="2" width="9" height="9" fill="#f59e0b" opacity="0.7" rx="1" />
          <rect x="2" y="13" width="9" height="9" fill="#10b981" opacity="0.7" rx="1" />
          <rect x="13" y="13" width="9" height="9" fill="#3b82f6" opacity="0.7" rx="1" />
        </svg>
      ),
      'rs-screener': (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="14" width="5" height="7" fill="#4ade80" opacity="0.5" rx="1" />
          <rect x="10" y="8" width="5" height="13" fill="#4ade80" opacity="0.8" rx="1" />
          <rect x="17" y="3" width="5" height="18" fill="#4ade80" rx="1" />
          <path d="M4 13L12 5L20 2" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      'hv-screener': (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 12 L6 6 L10 14 L14 4 L18 10 L22 8" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M2 12 L6 6 L10 14 L14 4 L18 10 L22 8" stroke="#fbbf24" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.5" />
        </svg>
      ),
      'leadership-scan': (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="14" width="5" height="8" fill="#d4af37" opacity="0.4" rx="1" />
          <rect x="9.5" y="9" width="5" height="13" fill="#ffd700" rx="1" />
          <rect x="16" y="12" width="5" height="10" fill="#c5a028" opacity="0.6" rx="1" />
          <path d="M12 2L13.5 6L17 6.5L14.5 9L15 12.5L12 10.5L9 12.5L9.5 9L7 6.5L10.5 6L12 2Z" fill="#ffd700" stroke="#fbbf24" strokeWidth="1.5" />
        </svg>
      ),
      'rrg-screener': (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="9" stroke="#a855f7" strokeWidth="2" fill="none" opacity="0.3" />
          <path d="M12 3 L15 9 M21 12 L15 15 M12 21 L9 15 M3 12 L9 9" stroke="#a855f7" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M12 3 C16 6, 18 8, 21 12 C18 16, 16 18, 12 21 C8 18, 6 16, 3 12 C6 8, 8 6, 12 3" stroke="#c084fc" strokeWidth="1.5" fill="none" opacity="0.4" />
        </svg>
      ),
      'performance': (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="9" stroke="#06b6d4" strokeWidth="2" fill="none" opacity="0.3" />
          <path d="M12 12L12 6" stroke="#06b6d4" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M12 12L17 15" stroke="#22d3ee" strokeWidth="3" strokeLinecap="round" />
          <circle cx="12" cy="12" r="2" fill="#06b6d4" />
          <path d="M12 3L12 5 M21 12L19 12 M12 21L12 19 M3 12L5 12" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
        </svg>
      ),
      'heatmap': (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
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
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="9" stroke="#eab308" strokeWidth="1.5" fill="none" opacity="0.3" />
          <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" fill="#fbbf24" opacity="0.4" />
          <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" stroke="#eab308" strokeWidth="2" strokeLinejoin="round" />
          <path d="M12 3 C16 6, 18 8, 21 12" stroke="#fbbf24" strokeWidth="1.5" fill="none" opacity="0.5" strokeLinecap="round" />
        </svg>
      )
    };
    return icons[id] || icons['rrg'];
  };

  const TabButton = ({ id, label }: { id: string; label: string }) => {
    const isActive = activePanels.includes(id);
    return (
      <button
        onClick={() => togglePanel(id)}
        style={{
          background: isActive
            ? 'linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)'
            : 'linear-gradient(135deg, #0d0d0d 0%, #050505 100%)',
          color: isActive ? '#FFB800' : '#FFFFFF',
          border: isActive ? '1px solid #D4AF37' : '1px solid rgba(255, 255, 255, 0.08)',
          borderLeft: isActive ? '4px solid #D4AF37' : '4px solid transparent',
          borderRadius: '12px',
          padding: '18px 20px',
          margin: '6px 12px',
          fontFamily: '"Inter", "Segoe UI", "Roboto", sans-serif',
          fontSize: '13px',
          fontWeight: '600',
          textTransform: 'uppercase',
          letterSpacing: '1.2px',
          cursor: 'pointer',
          transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          width: 'calc(100% - 24px)',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          boxShadow: isActive
            ? '0 4px 12px rgba(212, 175, 55, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 -1px 0 rgba(212, 175, 55, 0.2)'
            : '0 4px 12px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.03)',
          position: 'relative',
          overflow: 'hidden',
          opacity: 1,
          backdropFilter: 'blur(10px)'
        }}
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(30, 30, 30, 0.9) 0%, rgba(20, 20, 20, 0.95) 100%)';
            e.currentTarget.style.transform = 'translateX(6px) scale(1.02)';
            e.currentTarget.style.borderLeft = '4px solid rgba(212, 175, 55, 0.5)';
            e.currentTarget.style.boxShadow = '0 8px 20px rgba(212, 175, 55, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.color = '#FFB800';
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(20, 20, 20, 0.5) 0%, rgba(10, 10, 10, 0.8) 100%)';
            e.currentTarget.style.transform = 'translateX(0) scale(1)';
            e.currentTarget.style.borderLeft = '4px solid transparent';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.03)';
            e.currentTarget.style.color = '#FFFFFF';
          }
        }}
      >
        <span style={{
          lineHeight: '0',
          display: 'flex',
          alignItems: 'center',
          color: isActive ? '#FFB800' : '#FFFFFF'
        }}>
          {getIcon(id)}
        </span>
        <span style={{
          flex: 1,
          textShadow: '0 2px 8px rgba(0, 0, 0, 0.8)',
          opacity: 1,
          fontWeight: isActive ? '700' : '600'
        }}>
          {label}
        </span>
        {isActive && (
          <span style={{
            position: 'absolute',
            right: '16px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: '#D4AF37'
          }} />
        )}
      </button>
    );
  };

  return (
    <>
      <style>{`
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
      <div style={{
        display: 'flex',
        height: '100vh',
        background: '#000000',
        overflow: 'hidden'
      }}>
        {/* Left Sidebar with Tabs - Fixed Position */}
        <div style={{
          background: 'linear-gradient(180deg, #0a0a0a 0%, #000000 100%)',
          borderRight: '1px solid rgba(255, 255, 255, 0.1)',
          width: '200px',
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
          boxShadow: '4px 0 24px rgba(0, 0, 0, 0.6)'
        }}>
          {/* Title */}
          <div style={{
            padding: '16px 20px',
            margin: '0 12px 20px 12px',
            background: 'linear-gradient(145deg, #1a1a1a 0%, #0d0d0d 100%)',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 8px 16px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 -1px 0 rgba(0, 0, 0, 0.5)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <h2 style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: '800',
              color: '#ff8500',
              textTransform: 'uppercase',
              letterSpacing: '3px',
              textAlign: 'center',
              fontFamily: '"Inter", "Segoe UI", "Roboto", sans-serif',
              WebkitFontSmoothing: 'antialiased',
              MozOsxFontSmoothing: 'grayscale',
              textShadow: '0 2px 0 rgba(0, 0, 0, 0.8), 0 4px 8px rgba(0, 0, 0, 0.5)'
            }}>
              Analytics
            </h2>
          </div>

          <TabButton id="rrg" label="RRG" />
          <TabButton id="performance" label="Koyfin" />
          <TabButton id="iv-rrg" label="IV RRG" />
          <TabButton id="rrg-screener" label="RRG Screener" />
          <TabButton id="leadership-scan" label="Leadership" />
          <TabButton id="hv-screener" label="HV Screener" />
          <TabButton id="heatmap" label="Heatmap" />
        </div>

        {/* Full Page Content Area - With left margin for fixed sidebar */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          background: '#000000',
          display: 'grid',
          gridTemplateColumns: activePanels.length > 1 ? 'repeat(2, 1fr)' : '1fr',
          gridAutoRows: activePanels.length === 1 ? '1470px' : '1470px',
          gap: '8px',
          padding: '8px',
          alignContent: 'start',
          marginLeft: '200px'
        }}>
          {activePanels.map(id => renderPanel(id))}
        </div>
      </div>
    </>
  );
}