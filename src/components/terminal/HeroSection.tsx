'use client';

import { useState, useEffect } from 'react';
import CubeVisualization from './CubeVisualization';

export default function HeroSection() {
  const [currentStat, setCurrentStat] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
    const interval = setInterval(() => {
      setCurrentStat((prev) => (prev + 1) % 4);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const stats = [
    { label: 'Market Data Points', value: '2.8B+', suffix: 'processed daily' },
    { label: 'Historical Accuracy', value: '94.7%', suffix: 'pattern recognition' },
    { label: 'Response Time', value: '<50ms', suffix: 'real-time alerts' },
    { label: 'Asset Coverage', value: '10K+', suffix: 'global securities' }
  ];

  const features = [
    { 
      icon: (
        <svg viewBox="0 0 24 24" className="feature-svg">
          <defs>
            <linearGradient id="seasonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="50%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#d97706" />
            </linearGradient>
          </defs>
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" 
                fill="url(#seasonGrad)" className="chart-pulse" />
          <circle cx="12" cy="12" r="8" fill="none" stroke="#f59e0b" strokeWidth="0.5" className="orbit-ring" />
          <circle cx="12" cy="12" r="10" fill="none" stroke="#fbbf24" strokeWidth="0.3" strokeDasharray="2,2" className="outer-ring" />
        </svg>
      ), 
      text: '20-Year Seasonality Analysis',
      description: 'Advanced pattern recognition across two decades'
    },
    { 
      icon: (
        <svg viewBox="0 0 24 24" className="feature-svg">
          <defs>
            <linearGradient id="derivGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="50%" stopColor="#60a5fa" />
              <stop offset="100%" stopColor="#1e40af" />
            </linearGradient>
          </defs>
          <path d="M3 17l6-6 4 4 8-8V9h-2V7l-6 6-4-4-8 8v1h2v2z" fill="url(#derivGrad)" className="wave-motion" />
          <path d="M21 7h-4v2h2v2l-6 6-4-4-6 6v2l8-8 4 4 6-6V7z" fill="none" stroke="#60a5fa" strokeWidth="0.8" className="delta-trail" />
          <circle cx="21" cy="7" r="2" fill="#3b82f6" className="pulse-point" />
        </svg>
      ), 
      text: 'Real-time Derivative Flows',
      description: 'Institutional positioning and options flow tracking'
    },
    { 
      icon: (
        <svg viewBox="0 0 24 24" className="feature-svg">
          <defs>
            <radialGradient id="marketGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="50%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#059669" />
            </radialGradient>
          </defs>
          <circle cx="12" cy="12" r="3" fill="url(#marketGrad)" className="pulse-center" />
          <circle cx="12" cy="12" r="6" fill="none" stroke="#10b981" strokeWidth="1" strokeDasharray="2,2" className="scan-ring-1" />
          <circle cx="12" cy="12" r="9" fill="none" stroke="#10b981" strokeWidth="0.5" strokeDasharray="4,4" className="scan-ring-2" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="#22c55e" strokeWidth="1" className="crosshair" />
          <polygon points="12,8 16,12 12,16 8,12" fill="none" stroke="#10b981" strokeWidth="0.8" className="radar-sweep" />
        </svg>
      ), 
      text: 'AI Market Regime Detection',
      description: 'Machine learning powered trend identification'
    }
  ];

  const dataPoints = [
    { label: 'VOL', value: '24.8%', style: { top: '15%', left: '12%', animationDelay: '0s' } },
    { label: 'DELTA', value: '0.67', style: { top: '25%', right: '18%', animationDelay: '1s' } },
    { label: 'GAMMA', value: '2.14', style: { bottom: '30%', left: '20%', animationDelay: '2s' } },
    { label: 'VEGA', value: '18.9', style: { bottom: '20%', right: '12%', animationDelay: '3s' } },
    { label: 'THETA', value: '-0.08', style: { top: '45%', left: '8%', animationDelay: '4s' } },
    { label: 'RHO', value: '12.3', style: { top: '60%', right: '25%', animationDelay: '5s' } }
  ];

  return (
    <section className={`hero ${isVisible ? 'hero-visible' : ''}`}>
      <div className="hero-grid">
        <div className="hero-content">
          <div className="hero-label">
            <div className="label-dot"></div>
            <span className="label-text">Bloomberg Terminal Intelligence</span>
          </div>

          <h1>
            Next-Generation<br />
            <span className="gradient-text">Financial Analytics</span>
          </h1>

          <p className="hero-description">
            Institutional-grade trading platform combining advanced seasonality analysis, 
            real-time derivative flow monitoring, and AI-powered market regime detection. 
            Built for quantitative researchers, portfolio managers, and systematic traders.
          </p>

          {/* Dynamic Stats Counter */}
          <div className="hero-stats">
            <div className="stat-item active">
              <div className="stat-value">{stats[currentStat].value}</div>
              <div className="stat-label">{stats[currentStat].label}</div>
              <div className="stat-suffix">{stats[currentStat].suffix}</div>
            </div>
          </div>

          <div className="hero-features">
            {features.map((feature, index) => (
              <div key={index} className="feature-item" style={{ animationDelay: `${index * 0.2}s` }}>
                <div className="feature-icon">{feature.icon}</div>
                <div className="feature-content">
                  <span className="feature-text">{feature.text}</span>
                  <span className="feature-description">{feature.description}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="hero-actions">
            <button className="cta-primary">
              <span>Access Terminal</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M7 17L17 7M17 7H7M17 7V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button className="cta-secondary">
              View Live Demo
            </button>
          </div>
        </div>

        <div className="hero-visual">
          <div className="viz-container">
            {/* 3D Cube */}
            <CubeVisualization />

            {/* Enhanced Data Points */}
            <div className="data-points">
              {dataPoints.map((point, index) => (
                <div 
                  key={index}
                  className="data-point enhanced" 
                  style={point.style}
                >
                  <div className="data-label">{point.label}</div>
                  <div className="data-value">{point.value}</div>
                </div>
              ))}
            </div>

            {/* Performance Indicator */}
            <div className="performance-indicator">
              <div className="perf-label">SYSTEM STATUS</div>
              <div className="perf-status">
                <div className="status-dot"></div>
                <span>OPERATIONAL</span>
              </div>
            </div>

            {/* Laser Grid */}
            <div className="laser-grid enhanced"></div>
          </div>
        </div>
      </div>
    </section>
  );
}
